const http = require('http');
const fs = require('fs');
const path = require('path');

// ===== Load .env =====
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) return;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  });
}

const PORT = 3000;
const BASE = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml',
};

// ===== API Router =====
const routes = [];

function route(method, pattern, handler) {
  const paramNames = [];
  const regexStr = pattern.replace(/:(\w+)/g, (_, name) => { paramNames.push(name); return '([^/]+)'; });
  routes.push({ method, regex: new RegExp('^' + regexStr + '$'), paramNames, handler });
}

// ===== Supabase Context =====
let supabaseReady = false;
let createSupabaseContext;

async function initSupabase() {
  try {
    const mod = require('@supabase/server');
    createSupabaseContext = mod.createSupabaseContext;
    supabaseReady = true;
    console.log('@supabase/server loaded');
    console.log('  SUPABASE_URL:', process.env.SUPABASE_URL ? 'set' : 'MISSING');
    console.log('  SUPABASE_PUBLISHABLE_KEY:', process.env.SUPABASE_PUBLISHABLE_KEY ? 'set' : 'MISSING');
    console.log('  SUPABASE_SECRET_KEY:', process.env.SUPABASE_SECRET_KEY ? 'set' : 'MISSING');
    console.log('  SUPABASE_JWKS_URL:', process.env.SUPABASE_JWKS_URL ? 'set' : 'MISSING');
  } catch (e) {
    console.warn('Could not load @supabase/server:', e.message);
  }
}

function getSupabaseUrl() { return process.env.SUPABASE_URL || ''; }

// ===== Helpers =====
function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
  });
}

function json(res, data, status = 200, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(data));
}

function redirect(res, url) {
  res.writeHead(302, { Location: url });
  res.end();
}

// ===== Extract JWT from cookie or Authorization header =====
function extractToken(req) {
  // Check Authorization header first
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);

  // Check cookie
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/sb_access_token=([^;]+)/);
  if (match) return match[1];

  return null;
}

// ===== Supabase Auth Middleware =====
async function withAuth(req, res, authMode, handler) {
  if (!supabaseReady) {
    return json(res, { error: '@supabase/server not loaded' }, 500);
  }

  const token = extractToken(req);
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];

  const fakeReq = new Request('http://localhost' + req.url, {
    method: req.method,
    headers,
  });

  try {
    const result = await createSupabaseContext(fakeReq, { auth: authMode });
    if (result.error) {
      console.error('Auth error:', result.error.message);
      return json(res, { error: result.error.message || 'Auth failed' }, 401);
    }
    return await handler(result.data);
  } catch (e) {
    console.error('Auth exception:', e.message);
    return json(res, { error: e.message || 'Auth failed' }, 401);
  }
}

// ===== API Routes =====

// Health check
route('GET', '/api/health', async (req, res) => {
  json(res, {
    status: 'ok',
    supabase: supabaseReady,
    url: getSupabaseUrl() ? 'configured' : 'not configured',
  });
});

// Auth: Get current user
route('GET', '/api/auth/me', async (req, res) => {
  if (!supabaseReady || !getSupabaseUrl()) {
    return json(res, { user: null, message: 'Supabase not configured' });
  }

  return withAuth(req, res, 'user', async (ctx) => {
    if (!ctx.userClaims) return json(res, { user: null });

    // Get full user from Supabase
    const { data, error } = await ctx.supabase.auth.getUser();
    if (error || !data.user) return json(res, { user: null });

    json(res, {
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.full_name || data.user.user_metadata?.name || '',
      }
    });
  });
});

// Auth: Register
route('POST', '/api/auth/register', async (req, res) => {
  const { email, password, name } = await parseBody(req);
  if (!email || !password) return json(res, { error: 'Email and password required' }, 400);

  if (!supabaseReady || !getSupabaseUrl()) {
    return json(res, { error: 'Supabase not configured. Set SUPABASE_URL in .env' }, 500);
  }

  // Use admin client to sign up
  return withAuth(req, res, 'secret', async (ctx) => {
    const { data, error } = await ctx.supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name || '' },
    });

    if (error) return json(res, { error: error.message }, 400);

    json(res, {
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.full_name || '',
      }
    }, 201);
  });
});

// Auth: Login (returns JWT)
route('POST', '/api/auth/login', async (req, res) => {
  const { email, password } = await parseBody(req);
  if (!email || !password) return json(res, { error: 'Email and password required' }, 400);

  if (!supabaseReady || !getSupabaseUrl()) {
    return json(res, { error: 'Supabase not configured' }, 500);
  }

  // Use publishable key to sign in via Supabase anon client
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(getSupabaseUrl(), process.env.SUPABASE_PUBLISHABLE_KEY || '');

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return json(res, { error: error.message }, 401);

  // Set JWT as cookie
  const accessToken = data.session.access_token;
  const refreshToken = data.session.refresh_token;

  json(res, {
    user: {
      id: data.user.id,
      email: data.user.email,
      name: data.user.user_metadata?.full_name || '',
    },
    access_token: accessToken,
  }, 200, {
    'Set-Cookie': `sb_access_token=${accessToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600`
  });
});

// Agents: List
route('GET', '/api/agents', async (req, res) => {
  if (!supabaseReady || !getSupabaseUrl()) {
    return json(res, { error: 'Supabase not configured' }, 500);
  }

  return withAuth(req, res, 'user', async (ctx) => {
    if (!ctx.userClaims) return json(res, { error: 'Unauthorized' }, 401);

    const { data, error } = await ctx.supabase
      .from('agents')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return json(res, { error: error.message }, 400);
    json(res, { agents: data || [] });
  });
});

// Agents: Create
route('POST', '/api/agents', async (req, res) => {
  const body = await parseBody(req);
  if (!body.name) return json(res, { error: 'Name required' }, 400);

  if (!supabaseReady || !getSupabaseUrl()) {
    return json(res, { error: 'Supabase not configured' }, 500);
  }

  return withAuth(req, res, 'user', async (ctx) => {
    if (!ctx.userClaims) return json(res, { error: 'Unauthorized' }, 401);

    const { data, error } = await ctx.supabase
      .from('agents')
      .insert({
        user_id: ctx.userClaims.id,
        name: body.name,
        description: body.description || '',
        template: body.template || 'competitor_intel',
        status: 'active',
        competitors: body.competitors || [],
        schedule: body.schedule || 'Weekly',
        insights_count: 0,
      })
      .select()
      .single();

    if (error) return json(res, { error: error.message }, 400);
    json(res, { agent: data }, 201);
  });
});

// Agents: Delete
route('DELETE', '/api/agents/:id', async (req, res) => {
  if (!supabaseReady || !getSupabaseUrl()) {
    return json(res, { error: 'Supabase not configured' }, 500);
  }

  return withAuth(req, res, 'user', async (ctx) => {
    if (!ctx.userClaims) return json(res, { error: 'Unauthorized' }, 401);

    const { error } = await ctx.supabase
      .from('agents')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', ctx.userClaims.id);

    if (error) return json(res, { error: error.message }, 400);
    json(res, { ok: true });
  });
});

// Agents: Run
route('POST', '/api/agents/:id/run', async (req, res) => {
  if (!supabaseReady || !getSupabaseUrl()) {
    return json(res, { error: 'Supabase not configured' }, 500);
  }

  return withAuth(req, res, 'user', async (ctx) => {
    if (!ctx.userClaims) return json(res, { error: 'Unauthorized' }, 401);

    // Get agent
    const { data: agent, error: agentErr } = await ctx.supabase
      .from('agents')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', ctx.userClaims.id)
      .single();

    if (agentErr || !agent) return json(res, { error: 'Agent not found' }, 404);

    // Generate insights
    const insights = generateInsights(agent);

    // Create report
    const { data: report, error: reportErr } = await ctx.supabase
      .from('reports')
      .insert({
        user_id: ctx.userClaims.id,
        agent_id: agent.id,
        title: agent.name + ' - ' + new Date().toLocaleDateString(),
        status: 'completed',
        summary: `Analyzed ${agent.competitors?.length || 0} competitors. Found ${insights.length} key insights.`,
        insights,
        competitor_changes: (agent.competitors || []).map(c => ({
          name: typeof c === 'string' ? c : c.name,
          changes: [
            { type: ['modified', 'added', 'removed'][Math.floor(Math.random() * 3)], field: ['Pricing', 'Features', 'Blog', 'Careers'][Math.floor(Math.random() * 4)], significance: ['high', 'medium', 'low'][Math.floor(Math.random() * 3)] }
          ]
        })),
      })
      .select()
      .single();

    if (reportErr) return json(res, { error: reportErr.message }, 400);

    // Update agent insight count
    await ctx.supabase
      .from('agents')
      .update({ insights_count: (agent.insights_count || 0) + insights.length })
      .eq('id', agent.id);

    json(res, { report });
  });
});

// Reports: List
route('GET', '/api/reports', async (req, res) => {
  if (!supabaseReady || !getSupabaseUrl()) {
    return json(res, { error: 'Supabase not configured' }, 500);
  }

  return withAuth(req, res, 'user', async (ctx) => {
    if (!ctx.userClaims) return json(res, { error: 'Unauthorized' }, 401);

    const { data, error } = await ctx.supabase
      .from('reports')
      .select('*')
      .eq('user_id', ctx.userClaims.id)
      .order('created_at', { ascending: false });

    if (error) return json(res, { error: error.message }, 400);
    json(res, { reports: data || [] });
  });
});

// Reports: Get by ID
route('GET', '/api/reports/:id', async (req, res) => {
  if (!supabaseReady || !getSupabaseUrl()) {
    return json(res, { error: 'Supabase not configured' }, 500);
  }

  return withAuth(req, res, 'user', async (ctx) => {
    if (!ctx.userClaims) return json(res, { error: 'Unauthorized' }, 401);

    const { data, error } = await ctx.supabase
      .from('reports')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', ctx.userClaims.id)
      .single();

    if (error || !data) return json(res, { error: 'Not found' }, 404);
    json(res, { report: data });
  });
});

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

// ===== Main Server =====
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  let url = req.url.split('?')[0];

  // API routes
  if (url.startsWith('/api/')) {
    for (const r of routes) {
      if (req.method !== r.method) continue;
      const match = url.match(r.regex);
      if (match) {
        req.params = {};
        r.paramNames.forEach((name, i) => req.params[name] = match[i + 1]);
        try { await r.handler(req, res); } catch (e) { json(res, { error: 'Server error: ' + e.message }, 500); }
        return;
      }
    }
    return json(res, { error: 'Not found' }, 404);
  }

  // Favicon
  if (url === '/favicon.ico' || url === '/favicon.svg') {
    res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
    res.end(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#2563eb"/><stop offset="100%" stop-color="#9333ea"/></linearGradient></defs><rect width="100" height="100" rx="20" fill="url(#g)"/><text x="50" y="68" text-anchor="middle" fill="white" font-family="system-ui" font-weight="bold" font-size="42">AF</text></svg>`);
    return;
  }

  // Static files
  let filePath = path.join(BASE, 'public', url === '/' ? 'index.html' : url);
  if (!fs.existsSync(filePath)) filePath = path.join(BASE, 'public', 'index.html');

  const ext = path.extname(filePath);
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/html; charset=utf-8', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000' });
    res.end(data);
  } catch (e) {
    res.writeHead(404);
    res.end('Not found');
  }
});

// ===== Start =====
initSupabase().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\nAgentForge running at http://localhost:${PORT}`);
    console.log(`Using @supabase/server for auth and database\n`);
  });
});
