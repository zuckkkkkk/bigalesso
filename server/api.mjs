// BIGALESSO · /api/profile, /api/board/:id, /api/daily — persistence over HTTP (same origin; the desktop app
// proxies /api/* to this server). Token = the player's recovery code, sent as X-Token; only its hash is stored.
//   GET  /api/profile                 -> 200 { version, updated, data:{key:value} } | 404 { version: 0 }
//   PUT  /api/profile {data, base}    -> 200 { version, updated } | 409 { version, updated } (someone wrote after `base`)
//   GET  /api/board/:id?n=20          -> { board, lower, top:[{ name, score, verified, at, meta }] }
//   POST /api/board/:id {score, name, meta, lower} -> { best, rank, improved }   (client submissions: verified=false)
//   GET  /api/daily?mode=gulag        -> { mode, date, seed }   same seed for everyone that (UTC) day
import crypto from 'node:crypto';
import { hashToken } from './store.mjs';

const MAX_PROFILE = 512 * 1024;           // bytes of save data per player
const MAX_BODY = MAX_PROFILE + 64 * 1024;
const TOKEN_RE = /^[A-HJ-NP-Z2-9]{16,32}$/;
const BOARD_RE = /^[a-z0-9][a-z0-9:_.\-]{0,47}$/i;
const KEY_RE = /^(bigalesso|direttore)[A-Za-z0-9_.:\-]{0,60}$/;
const SECRET_KEY_RE = /key|token|secret|pass/i;   // never stored on the server even if a client sends them
const RPM = Math.max(5, +process.env.API_RPM || 60); // per IP
const DAILY_SALT = process.env.DAILY_SALT || 'bigalesso-due-torri';

const json = (res, code, obj) => res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }).end(JSON.stringify(obj));
const clientIp = req => (process.env.TRUST_PROXY !== '0' && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '?';
function sameOrigin(req) {
  const o = req.headers.origin; if (!o || process.env.ALLOW_ANY_ORIGIN || o === 'app://bigalesso') return true;
  try { return new URL(o).host === req.headers.host; } catch { return false; }
}
const ips = new Map();
function allowIp(ip, cost = 1) {
  const now = Date.now(); let b = ips.get(ip);
  if (!b) { b = { n: RPM, t: now }; ips.set(ip, b); }
  b.n = Math.min(RPM, b.n + (now - b.t) * RPM / 60000); b.t = now;
  if (b.n < cost) return false; b.n -= cost; return true;
}
setInterval(() => { const now = Date.now(); for (const [k, b] of ips) if (now - b.t > 600000) ips.delete(k); }, 300000).unref();
function readBody(req, max) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > max) { reject(Object.assign(new Error('too big'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
const cleanName = n => String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16) || 'Giocatore';

export function dailySeed(mode, date = new Date().toISOString().slice(0, 10)) {
  const h = crypto.createHash('sha256').update(DAILY_SALT + ':' + date + ':' + mode).digest();
  return { mode, date, seed: h.readUInt32BE(0) };
}

// returns true when handled
export function handleApi(req, res, store, log = () => { }) {
  let u; try { u = new URL(req.url, 'http://x'); } catch { return false; }
  const p = u.pathname;
  if (p !== '/api/profile' && !p.startsWith('/api/board/') && p !== '/api/daily' && p !== '/api/board') return false;
  const write = req.method === 'PUT' || req.method === 'POST';
  if (write && !sameOrigin(req)) { json(res, 403, { error: 'origin' }); return true; }
  if (!allowIp(clientIp(req), write ? 2 : 1)) { json(res, 429, { error: 'rate_limited' }); return true; }

  if (p === '/api/daily') {
    const mode = String(u.searchParams.get('mode') || 'gulag').replace(/[^a-z0-9_\-]/gi, '').slice(0, 24) || 'gulag';
    json(res, 200, dailySeed(mode)); return true;
  }

  if (p === '/api/profile') {
    const token = String(req.headers['x-token'] || '');
    if (!TOKEN_RE.test(token)) { json(res, 400, { error: 'token' }); return true; }
    const th = hashToken(token);
    if (req.method === 'GET' || req.method === 'HEAD') {
      const r = store.getProfile(th);
      if (!r) { json(res, 404, { version: 0 }); return true; }
      let data = {}; try { data = JSON.parse(r.data); } catch { }
      json(res, 200, { version: r.version, updated: r.updated, data }); return true;
    }
    if (req.method !== 'PUT') { res.writeHead(405, { Allow: 'GET, PUT' }).end(); return true; }
    (async () => {
      let b; try { b = JSON.parse(await readBody(req, MAX_BODY)); } catch (e) { json(res, e && e.code === 413 ? 413 : 400, { error: 'body' }); return; }
      if (!b || typeof b.data !== 'object' || Array.isArray(b.data)) { json(res, 400, { error: 'data' }); return; }
      const clean = {};
      for (const k in b.data) { const v = b.data[k]; if (KEY_RE.test(k) && !SECRET_KEY_RE.test(k.replace(/^(bigalesso|direttore)/, '')) && typeof v === 'string') clean[k] = v; }
      const data = JSON.stringify(clean);
      if (data.length > MAX_PROFILE) { json(res, 413, { error: 'too_big', max: MAX_PROFILE }); return; }
      const cur = store.getProfile(th), now = Date.now();
      const base = b.base | 0;
      if (cur && base !== cur.version && !b.force) { json(res, 409, { version: cur.version, updated: cur.updated }); return; }
      const version = (cur ? cur.version : 0) + 1;
      try { store.putProfile(th, data, version, now); } catch (e) { log('store error', e && e.message); json(res, 500, { error: 'store' }); return; }
      json(res, 200, { version, updated: now });
    })();
    return true;
  }

  // boards
  const id = decodeURIComponent(p.slice('/api/board/'.length));
  if (!BOARD_RE.test(id)) { json(res, 400, { error: 'board' }); return true; }
  if (req.method === 'GET' || req.method === 'HEAD') {
    const n = Math.max(1, Math.min(100, +u.searchParams.get('n') || 20));
    const t = store.top(id, n);
    json(res, 200, { board: id, lower: t.lower, top: t.rows }); return true;
  }
  if (req.method !== 'POST') { res.writeHead(405, { Allow: 'GET, POST' }).end(); return true; }
  (async () => {
    let b; try { b = JSON.parse(await readBody(req, 8 * 1024)); } catch (e) { json(res, 400, { error: 'body' }); return; }
    const token = String(req.headers['x-token'] || '');
    if (!TOKEN_RE.test(token)) { json(res, 400, { error: 'token' }); return; }
    const score = Number(b && b.score);
    if (!Number.isFinite(score) || Math.abs(score) > 1e12) { json(res, 400, { error: 'score' }); return; }
    let meta = null; if (b.meta && typeof b.meta === 'object') { meta = JSON.stringify(b.meta); if (meta.length > 1024) meta = null; }
    try { json(res, 200, store.submit(id, hashToken(token), cleanName(b.name), score, meta, false, !!b.lower)); }
    catch (e) { log('store error', e && e.message); json(res, 500, { error: 'store' }); }
  })();
  return true;
}
