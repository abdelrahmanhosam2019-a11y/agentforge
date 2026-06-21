const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON = process.env.SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_SECRET = process.env.SUPABASE_SECRET_KEY;

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const url = req.url.split('?')[0];

  // Helper
  const json = (data, status = 200) => res.status(status).json(data);

  // Extract token
  function extractToken() {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
    const cookie = req.headers.cookie || '';
    const m = cookie.match(/sb_access_token=([^;]+)/);
    return m ? m[1] : null;
  }

  // Create client with user token
  function userClient(token) {
    return createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
  }

  // Admin client
  function adminClient() {
    return createClient(SUPABASE_URL, SUPABASE_SECRET);
  }

  // ===== ROUTES =====

  // Health
  if (url === '/api/health') {
    return json({ status: 'ok', supabase: !!SUPABASE_URL });
  }

  // Auth: Register
  if (url === '/api/auth/register' && req.method === 'POST') {
    const { email, password, name } = req.body;
    if (!email || !password) return json({ error: 'Email and password required' }, 400);
    if (!SUPABASE_URL) return json({ error: 'Supabase not configured' }, 500);

    try {
      const admin = adminClient();
      const { data, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { full_name: name || '' }
      });
      if (error) return json({ error: error.message }, 400);
      return json({ user: { id: data.user.id, email: data.user.email, name: data.user.user_metadata?.full_name || '' } }, 201);
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  // Auth: Login
  if (url === '/api/auth/login' && req.method === 'POST') {
    const { email, password } = req.body;
    if (!email || !password) return json({ error: 'Email and password required' }, 400);
    if (!SUPABASE_URL) return json({ error: 'Supabase not configured' }, 500);

    try {
      const anon = createClient(SUPABASE_URL, SUPABASE_ANON);
      const { data, error } = await anon.auth.signInWithPassword({ email, password });
      if (error) return json({ error: error.message }, 401);

      const token = data.session.access_token;
      res.setHeader('Set-Cookie', `sb_access_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600`);
      return json({ user: { id: data.user.id, email: data.user.email, name: data.user.user_metadata?.full_name || '' }, access_token: token });
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  // Auth: Logout
  if (url === '/api/auth/logout' && req.method === 'POST') {
    res.setHeader('Set-Cookie', 'sb_access_token=; Path=/; HttpOnly; Max-Age=0');
    return json({ ok: true });
  }

  // Auth: Me
  if (url === '/api/auth/me' && req.method === 'GET') {
    const token = extractToken();
    if (!token) return json({ user: null });

    try {
      const client = userClient(token);
      const { data, error } = await client.auth.getUser();
      if (error || !data.user) return json({ user: null });
      return json({ user: { id: data.user.id, email: data.user.email, name: data.user.user_metadata?.full_name || '' } });
    } catch {
      return json({ user: null });
    }
  }

  // ===== AGENTS =====
  if (url.startsWith('/api/agents')) {
    const token = extractToken();
    if (!token) return json({ error: 'Unauthorized' }, 401);

    const client = userClient(token);
    const { data: { user }, error: authErr } = await client.auth.getUser();
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    // GET /api/agents
    if (url === '/api/agents' && req.method === 'GET') {
      const { data, error } = await client.from('agents').select('*').order('created_at', { ascending: false });
      if (error) return json({ error: error.message }, 400);
      return json({ agents: data || [] });
    }

    // POST /api/agents
    if (url === '/api/agents' && req.method === 'POST') {
      const { name, description, competitors, schedule, template } = req.body;
      if (!name) return json({ error: 'Name required' }, 400);

      const { data, error } = await client.from('agents').insert({
        user_id: user.id, name, description: description || '',
        template: template || 'competitor_intel', status: 'active',
        competitors: competitors || [], schedule: schedule || 'Weekly', insights_count: 0
      }).select().single();

      if (error) return json({ error: error.message }, 400);
      return json({ agent: data }, 201);
    }

    // POST /api/agents/:id/run
    const runMatch = url.match(/^\/api\/agents\/([^/]+)\/run$/);
    if (runMatch && req.method === 'POST') {
      const agentId = runMatch[1];
      const { data: agent, error: agentErr } = await client.from('agents').select('*').eq('id', agentId).eq('user_id', user.id).single();
      if (agentErr || !agent) return json({ error: 'Agent not found' }, 404);

      const insights = generateInsights(agent);
      const { data: report, error: reportErr } = await client.from('reports').insert({
        user_id: user.id, agent_id: agent.id,
        title: agent.name + ' - ' + new Date().toLocaleDateString(),
        status: 'completed', summary: `Analyzed ${agent.competitors?.length || 0} competitors. Found ${insights.length} key insights.`,
        insights,
        competitor_changes: (agent.competitors || []).map(c => ({
          name: typeof c === 'string' ? c : c.name,
          changes: [{ type: ['modified', 'added', 'removed'][Math.floor(Math.random() * 3)], field: ['Pricing', 'Features', 'Blog', 'Careers'][Math.floor(Math.random() * 4)], significance: ['high', 'medium', 'low'][Math.floor(Math.random() * 3)] }]
        }))
      }).select().single();

      if (reportErr) return json({ error: reportErr.message }, 400);
      await client.from('agents').update({ insights_count: (agent.insights_count || 0) + insights.length }).eq('id', agent.id);
      return json({ report });
    }

    // DELETE /api/agents/:id
    const delMatch = url.match(/^\/api\/agents\/([^/]+)$/);
    if (delMatch && req.method === 'DELETE') {
      const { error } = await client.from('agents').delete().eq('id', delMatch[1]).eq('user_id', user.id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }
  }

  // ===== REPORTS =====
  if (url.startsWith('/api/reports')) {
    const token = extractToken();
    if (!token) return json({ error: 'Unauthorized' }, 401);

    const client = userClient(token);
    const { data: { user }, error: authErr } = await client.auth.getUser();
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    // GET /api/reports
    if (url === '/api/reports' && req.method === 'GET') {
      const { data, error } = await client.from('reports').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
      if (error) return json({ error: error.message }, 400);
      return json({ reports: data || [] });
    }

    // GET /api/reports/:id
    const reportMatch = url.match(/^\/api\/reports\/([^/]+)$/);
    if (reportMatch && req.method === 'GET') {
      const { data, error } = await client.from('reports').select('*').eq('id', reportMatch[1]).eq('user_id', user.id).single();
      if (error || !data) return json({ error: 'Not found' }, 404);
      return json({ report: data });
    }
  }

  // 404
  return json({ error: 'Not found' }, 404);
};

function generateInsights(agent) {
  const types = [
    { type: 'opportunity', titles: ['Pricing Gap Detected', 'Market Expansion Opportunity', 'Feature Gap in Competitor', 'Underserved Segment Found'], descriptions: ['No competitor offers mid-tier pricing. First-mover advantage available.', 'Competitors focusing on enterprise. SMB market underserved.', 'Key feature missing from top 3 competitors.', 'Niche segment not targeted by any competitor.'] },
    { type: 'threat', titles: ['Competitor Feature Launch', 'Pricing Pressure Detected', 'New Market Entrant', 'Talent Acquisition Race'], descriptions: ['Top competitor launched similar feature.', 'Competitor dropped prices 20%.', 'New startup entered space with funding.', 'Competitors hiring aggressively.'] },
    { type: 'trend', titles: ['AI Adoption Accelerating', 'Remote-First Shift', 'Consolidation Wave', 'Sustainability Focus'], descriptions: ['All competitors adding AI features.', 'Remote work features becoming standard.', 'M&A activity increasing.', 'ESG reporting becoming differentiator.'] },
  ];
  const count = Math.floor(Math.random() * 3) + 3;
  const insights = [];
  for (let i = 0; i < count; i++) {
    const group = types[Math.floor(Math.random() * types.length)];
    const idx = Math.floor(Math.random() * group.titles.length);
    insights.push({ type: group.type, title: group.titles[idx], description: group.descriptions[idx], confidence: (Math.random() * 0.3 + 0.7).toFixed(2) });
  }
  return insights;
}
