// BIGALESSO · /api/ai — tiny same-origin proxy to the Anthropic Messages API (the key never reaches the browser).
//   GET  /api/ai  -> { enabled: bool }           (the game probes this to pick its AI provider)
//   POST /api/ai  { model: 'fast'|'smart', system, messages:[{role,content}], max_tokens } -> { text }
// Env: ANTHROPIC_API_KEY (missing -> 503, the game falls back to offline lines)
//      AI_MODEL_FAST / AI_MODEL_SMART, AI_MAX_TOKENS (cap, default 700), AI_RPM (per IP, default 12), AI_DAILY (global, default 3000)
//      TRUST_PROXY=0 to ignore X-Forwarded-For (default: trusted, e.g. Easypanel/Traefik in front)
// Content is never logged; only counters.
const MODELS = { fast: process.env.AI_MODEL_FAST || 'claude-haiku-5-5', smart: process.env.AI_MODEL_SMART || 'claude-sonnet-5-5' };
const ALLOWED = new Set(Object.values(MODELS));
const CAP = Math.max(64, +process.env.AI_MAX_TOKENS || 700);
const RPM = Math.max(1, +process.env.AI_RPM || 12);
const DAILY = Math.max(1, +process.env.AI_DAILY || 3000);
const MAX_BODY = 24 * 1024;
const TIMEOUT = 25000;
const GUARD = 'Contesto fisso: testi per un videogioco comico italiano; personaggi = caricature affettuose di amici, versione da gioco. ' +
  'Mai insulti, volgarità pesanti, bestemmie, contenuti sessuali, politica, religione, salute, dati personali o accuse di reati veri. Risposte brevi.';

const ips = new Map(); // ip -> {n, t}
let day = new Date().toDateString(), dayCount = 0, served = 0, failed = 0;
function allowIp(ip) {
  const now = Date.now(); let b = ips.get(ip);
  if (!b) { b = { n: RPM, t: now }; ips.set(ip, b); }
  b.n = Math.min(RPM, b.n + (now - b.t) * RPM / 60000); b.t = now;
  if (b.n < 1) return false; b.n -= 1; return true;
}
setInterval(() => { const now = Date.now(); for (const [k, b] of ips) if (now - b.t > 600000) ips.delete(k); }, 300000).unref();

const json = (res, code, obj) => res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }).end(JSON.stringify(obj));
const clientIp = req => (process.env.TRUST_PROXY !== '0' && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '?';
function sameOrigin(req) {
  const o = req.headers.origin; if (!o || process.env.ALLOW_ANY_ORIGIN) return true;
  try { return new URL(o).host === req.headers.host; } catch { return false; }
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error('too big'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
function sanitize(b) {
  const model = MODELS[b.model] || (ALLOWED.has(b.model) ? b.model : MODELS.fast);
  const system = String(b.system || '').slice(0, 6000);
  let messages = Array.isArray(b.messages) ? b.messages : [];
  messages = messages.filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-12).map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));
  while (messages.length && messages[0].role !== 'user') messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== 'user') return null;
  const max_tokens = Math.max(16, Math.min(CAP, +b.max_tokens || 400));
  return { model, system: GUARD + (system ? '\n\n' + system : ''), messages, max_tokens };
}

// returns true when the request was handled
export function handleAI(req, res, log = () => { }) {
  let p = ''; try { p = new URL(req.url, 'http://x').pathname; } catch { return false; }
  if (p !== '/api/ai') return false;
  const key = process.env.ANTHROPIC_API_KEY;
  if (req.method === 'GET' || req.method === 'HEAD') { json(res, 200, { enabled: !!key, models: Object.keys(MODELS) }); return true; }
  if (req.method !== 'POST') { res.writeHead(405, { Allow: 'GET, POST' }).end(); return true; }
  if (!sameOrigin(req)) { json(res, 403, { error: 'origin' }); return true; }
  if (!key) { json(res, 503, { error: 'no_key' }); return true; }
  if (!/json/i.test(req.headers['content-type'] || '')) { json(res, 415, { error: 'json' }); return true; }
  const today = new Date().toDateString(); if (today !== day) { day = today; dayCount = 0; }
  if (dayCount >= DAILY) { json(res, 429, { error: 'daily_limit' }); return true; }
  if (!allowIp(clientIp(req))) { json(res, 429, { error: 'rate_limited' }); return true; }
  (async () => {
    let body;
    try { body = JSON.parse(await readBody(req)); } catch (e) { json(res, e && e.code === 413 ? 413 : 400, { error: 'body' }); return; }
    const q = body && typeof body === 'object' ? sanitize(body) : null;
    if (!q) { json(res, 400, { error: 'messages' }); return; }
    dayCount++;
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), TIMEOUT);
    req.on('close', () => { if (!res.writableEnded) ctl.abort(); });
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: ctl.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(q),
      });
      if (!r.ok) { failed++; log('ai upstream', r.status); json(res, r.status === 429 || r.status === 529 ? 429 : 502, { error: 'upstream', status: r.status }); return; }
      const j = await r.json();
      const text = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('').slice(0, 4000);
      served++; if (served % 50 === 0) log('ai served', served, 'failed', failed);
      json(res, 200, { text, model: q.model });
    } catch (e) {
      failed++; log('ai error', e && e.name === 'AbortError' ? 'timeout' : 'fetch');
      if (!res.headersSent) json(res, 504, { error: 'timeout' });
    } finally { clearTimeout(to); }
  })();
  return true;
}
