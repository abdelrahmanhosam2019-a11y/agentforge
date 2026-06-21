const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = req.url.split('?')[0];
  const json = (data, status = 200) => res.status(status).json(data);

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON = process.env.SUPABASE_PUBLISHABLE_KEY;
  const SUPABASE_SECRET = process.env.SUPABASE_SECRET_KEY;

  if (!SUPABASE_URL) return json({ error: 'SUPABASE_URL not set' }, 500);

  function extractToken() {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
    return null;
  }

  function userClient(token) {
    return createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
  }

  function adminClient() {
    return createClient(SUPABASE_URL, SUPABASE_SECRET);
  }

  // Health
  if (url === '/api/health') {
    return json({ ok: true });
  }

  // Register
  if (url === '/api/auth/register' && req.method === 'POST') {
    const { email, password, name } = req.body || {};
    if (!email || !password) return json({ error: 'Email and password required' }, 400);
    try {
      const { data, error } = await adminClient().auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { full_name: name || '' }
      });
      if (error) return json({ error: error.message }, 400);
      return json({ user: { id: data.user.id, email: data.user.email, name: data.user.user_metadata?.full_name || '' } }, 201);
    } catch (e) { return json({ error: e.message }, 500); }
  }

  // Login
  if (url === '/api/auth/login' && req.method === 'POST') {
    const { email, password } = req.body || {};
    if (!email || !password) return json({ error: 'Email and password required' }, 400);
    try {
      const { data, error } = await createClient(SUPABASE_URL, SUPABASE_ANON).auth.signInWithPassword({ email, password });
      if (error) return json({ error: error.message }, 401);
      return json({
        user: { id: data.user.id, email: data.user.email, name: data.user.user_metadata?.full_name || '' },
        access_token: data.session.access_token
      });
    } catch (e) { return json({ error: e.message }, 500); }
  }

  // Logout
  if (url === '/api/auth/logout' && req.method === 'POST') {
    return json({ ok: true });
  }

  // Me
  if (url === '/api/auth/me' && req.method === 'GET') {
    const token = extractToken();
    if (!token) return json({ user: null });
    try {
      const { data, error } = await userClient(token).auth.getUser();
      if (error || !data.user) return json({ user: null });
      return json({ user: { id: data.user.id, email: data.user.email, name: data.user.user_metadata?.full_name || '' } });
    } catch { return json({ user: null }); }
  }

  // Agents list
  if (url === '/api/agents' && req.method === 'GET') {
    const token = extractToken();
    if (!token) return json({ error: 'Unauthorized' }, 401);
    const client = userClient(token);
    const { data: { user }, error: ae } = await client.auth.getUser();
    if (ae || !user) return json({ error: 'Unauthorized' }, 401);
    const { data, error } = await client.from('agents').select('*').order('created_at', { ascending: false });
    if (error) return json({ error: error.message }, 400);
    return json({ agents: data || [] });
  }

  // Agent create
  if (url === '/api/agents' && req.method === 'POST') {
    const token = extractToken();
    if (!token) return json({ error: 'Unauthorized' }, 401);
    const client = userClient(token);
    const { data: { user }, error: ae } = await client.auth.getUser();
    if (ae || !user) return json({ error: 'Unauthorized' }, 401);
    const b = req.body || {};
    if (!b.name) return json({ error: 'Name required' }, 400);
    const { data, error } = await client.from('agents').insert({
      user_id: user.id, name: b.name, description: b.description || '',
      template: b.template || 'competitor_intel', status: 'active',
      competitors: b.competitors || [], schedule: b.schedule || 'Weekly', insights_count: 0
    }).select().single();
    if (error) return json({ error: error.message }, 400);
    return json({ agent: data }, 201);
  }

  // Agent run
  const runM = url.match(/^\/api\/agents\/([^/]+)\/run$/);
  if (runM && req.method === 'POST') {
    const token = extractToken();
    if (!token) return json({ error: 'Unauthorized' }, 401);
    const client = userClient(token);
    const { data: { user }, error: ae } = await client.auth.getUser();
    if (ae || !user) return json({ error: 'Unauthorized' }, 401);
    const { data: agent, error: e1 } = await client.from('agents').select('*').eq('id', runM[1]).eq('user_id', user.id).single();
    if (e1 || !agent) return json({ error: 'Agent not found' }, 404);
    const insights = genInsights();
    const { data: report, error: e2 } = await client.from('reports').insert({
      user_id: user.id, agent_id: agent.id, title: agent.name + ' - ' + new Date().toLocaleDateString(),
      status: 'completed', summary: 'Found ' + insights.length + ' insights.', insights,
      competitor_changes: (agent.competitors || []).map(c => ({
        name: typeof c === 'string' ? c : c.name,
        changes: [{ type: ['modified','added','removed'][~~(Math.random()*3)], field: ['Pricing','Features','Blog','Careers'][~~(Math.random()*4)], significance: ['high','medium','low'][~~(Math.random()*3)] }]
      }))
    }).select().single();
    if (e2) return json({ error: e2.message }, 400);
    await client.from('agents').update({ insights_count: (agent.insights_count||0)+insights.length }).eq('id', agent.id);
    return json({ report });
  }

  // Agent delete
  const delM = url.match(/^\/api\/agents\/([^/]+)$/);
  if (delM && req.method === 'DELETE') {
    const token = extractToken();
    if (!token) return json({ error: 'Unauthorized' }, 401);
    const client = userClient(token);
    const { data: { user }, error: ae } = await client.auth.getUser();
    if (ae || !user) return json({ error: 'Unauthorized' }, 401);
    await client.from('agents').delete().eq('id', delM[1]).eq('user_id', user.id);
    return json({ ok: true });
  }

  // Reports list
  if (url === '/api/reports' && req.method === 'GET') {
    const token = extractToken();
    if (!token) return json({ error: 'Unauthorized' }, 401);
    const client = userClient(token);
    const { data: { user }, error: ae } = await client.auth.getUser();
    if (ae || !user) return json({ error: 'Unauthorized' }, 401);
    const { data, error } = await client.from('reports').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (error) return json({ error: error.message }, 400);
    return json({ reports: data || [] });
  }

  // Report detail
  const repM = url.match(/^\/api\/reports\/([^/]+)$/);
  if (repM && req.method === 'GET') {
    const token = extractToken();
    if (!token) return json({ error: 'Unauthorized' }, 401);
    const client = userClient(token);
    const { data: { user }, error: ae } = await client.auth.getUser();
    if (ae || !user) return json({ error: 'Unauthorized' }, 401);
    const { data, error } = await client.from('reports').select('*').eq('id', repM[1]).eq('user_id', user.id).single();
    if (error || !data) return json({ error: 'Not found' }, 404);
    return json({ report: data });
  }

  return json({ error: 'Not found' }, 404);
};

function genInsights() {
  const t = [
    { type:'opportunity', t:['Pricing Gap Detected','Market Expansion Opportunity','Feature Gap in Competitor','Underserved Segment Found'], d:['No competitor offers mid-tier pricing. First-mover advantage available.','Competitors focusing on enterprise. SMB market underserved.','Key feature missing from top 3 competitors.','Niche segment not targeted by any competitor.'] },
    { type:'threat', t:['Competitor Feature Launch','Pricing Pressure Detected','New Market Entrant','Talent Acquisition Race'], d:['Top competitor launched similar feature.','Competitor dropped prices 20%.','New startup entered space with funding.','Competitors hiring aggressively.'] },
    { type:'trend', t:['AI Adoption Accelerating','Remote-First Shift','Consolidation Wave','Sustainability Focus'], d:['All competitors adding AI features.','Remote work features becoming standard.','M&A activity increasing.','ESG reporting becoming differentiator.'] },
  ];
  const n = ~~(Math.random()*3)+3, r = [];
  for (let i=0; i<n; i++) { const g=t[~~(Math.random()*t.length)], j=~~(Math.random()*g.t.length); r.push({type:g.type,title:g.t[j],description:g.d[j],confidence:(Math.random()*0.3+0.7).toFixed(2)}); }
  return r;
}
