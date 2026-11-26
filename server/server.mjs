// BIGALESSO GAMES – server multiplayer
// Serve la build statica (dist/) e un WebSocket su /ws con:
//   - stanze private a codice di 4 lettere (max 8) e il "Quartiere pubblico" a shard da 24 con interest management;
//   - partite arbitrate dal server (server/match.mjs: regole in shared/*.mjs);
//   - salvataggi dei giocatori, classifiche e seme del giorno (server/api.mjs + server/store.mjs, DATA_DIR=/data);
//   - mondo condiviso (src/worldsync.js): 'ws' = piccolo stato chiave/valore per stanza con operazioni atomiche (casse,
//     drop, boss unico, veicoli parcheggiati), mandato a chi entra nel 'welcome'; 'nev' = evento solo ai vicini (nemici).
// Avvio: PORT=8080 node server/server.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { handleAI } from './ai.mjs'; // POST /api/ai (Claude proxy, env ANTHROPIC_API_KEY)
import { handleApi } from './api.mjs'; // /api/profile, /api/board/:id, /api/daily
import { openStore, hashToken } from './store.mjs';
import { createMatches } from './match.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = +process.env.PORT || 8080;
const STATIC_DIR = path.resolve(process.env.STATIC_DIR || path.join(__dirname, '..', 'dist'));
const MAX_PLAYERS = 8;                // private rooms
const WORLD_CAP = Math.max(2, +process.env.WORLD_CAP || 24); // public shards ("Quartiere pubblico")
const WORLD_RADIUS = +process.env.WORLD_RADIUS || 70;        // metres: presence sent only for players this close
const WORLD_IDLE_MS = 180000;          // no presence for 3 min in a shard -> dropped
const MAX_ROOMS = +process.env.MAX_ROOMS || 500;
const STATE_HZ = 15, WORLD_HZ = 10;
const MAX_EXTRA = 512;                // bytes, presence extras (car look, job title…)
const TOKEN_RE = /^[A-HJ-NP-Z2-9]{16,32}$/;
const MAX_MSG = 128 * 1024;          // bytes, any message
const MAX_STATE = 2048;               // bytes, presence state
const WS_KEYS = 4096, WS_BYTES = 512 * 1024, WS_VAL = 1536; // shared world state per room: keys, total bytes, bytes per value
const NEAR_R = WORLD_RADIUS + 20;     // metres: 'nev' (near events: enemy snapshots) in shards
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O
const log = (...a) => console.log(new Date().toISOString(), ...a);
const store = await openStore(log);                     // profiles + leaderboards (DATA_DIR, default /data)
const matches = createMatches({ send, log, store });    // server-refereed matches (shared/*.mjs rules)

// ---------------------------------------------------------------- static files
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.glb': 'model/gltf-binary',
  '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.ktx2': 'image/ktx2', '.bin': 'application/octet-stream',
  '.mp4': 'video/mp4', '.webm': 'video/webm',
};
// build with --compress writes .br/.gz next to text files and the GLB: served as-is (no CPU, no RAM spent compressing)
const ENC = [['br', '.br'], ['gzip', '.gz']];
function serveStatic(req, res) {
  let p, u;
  try { u = new URL(req.url, 'http://x'); p = decodeURIComponent(u.pathname); } catch { res.writeHead(400).end(); return; }
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(STATIC_DIR, p));
  if (!file.startsWith(STATIC_DIR + path.sep) && file !== STATIC_DIR) { res.writeHead(403).end(); return; }
  if (/\.(br|gz)$/.test(file)) { res.writeHead(404).end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      // SPA-ish fallback: unknown paths without extension -> index.html
      if (!path.extname(p)) return fs.stat(path.join(STATIC_DIR, 'index.html'), (e2, st2) => e2 ? res.writeHead(404).end('404') : sendFile(path.join(STATIC_DIR, 'index.html'), req, res, st2, u));
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404'); return;
    }
    sendFile(file, req, res, st, u);
  });
}
function cacheFor(file, u) {
  const base = path.basename(file), ext = path.extname(file).toLowerCase();
  if (ext === '.html' || base === 'sw.js' || ext === '.webmanifest') return 'no-cache';
  if (/(^|\/)(update\.json|index\.html)$/.test(file)) return 'no-cache'; // the desktop app checks update.json at every start
  if (u && u.searchParams.has('v')) return 'public, max-age=31536000, immutable'; // versioned URL (app.js?v=<hash>)
  return 'public, max-age=86400, stale-while-revalidate=604800';
}
function sendFile(file, req, res, st, u) {
  const ext = path.extname(file).toLowerCase();
  const etag = st ? `W/"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"` : null;
  const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': cacheFor(file, u), 'Vary': 'Accept-Encoding' };
  if (etag) { headers.ETag = etag; headers['Last-Modified'] = new Date(st.mtimeMs).toUTCString(); }
  if (path.basename(file) === 'sw.js') headers['Service-Worker-Allowed'] = '/';
  if (etag && req.headers['if-none-match'] === etag) { res.writeHead(304, headers).end(); return; }
  // byte ranges for media (the opening video): Safari requires them, Chrome uses them to start playback early
  if ((ext === '.mp4' || ext === '.webm') && st) {
    headers['Accept-Ranges'] = 'bytes'; delete headers.Vary;
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
    if (m) {
      let a = m[1] === '' ? Math.max(0, st.size - +m[2]) : +m[1], b = m[1] !== '' && m[2] !== '' ? Math.min(+m[2], st.size - 1) : st.size - 1;
      if (a > b || a >= st.size) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }).end(); return; }
      headers['Content-Range'] = `bytes ${a}-${b}/${st.size}`; headers['Content-Length'] = b - a + 1;
      if (req.method === 'HEAD') { res.writeHead(206, headers).end(); return; }
      res.writeHead(206, headers); fs.createReadStream(file, { start: a, end: b }).on('error', () => res.destroy()).pipe(res); return;
    }
  }
  const accept = String(req.headers['accept-encoding'] || '');
  const tryEnc = i => {
    if (i >= ENC.length) return send(file, st && st.size);
    const [name, suf] = ENC[i];
    if (!new RegExp('\\b' + name + '\\b').test(accept)) return tryEnc(i + 1);
    fs.stat(file + suf, (e, cst) => { if (e || !cst.isFile()) return tryEnc(i + 1); headers['Content-Encoding'] = name; send(file + suf, cst.size); });
  };
  const send = (f, size) => {
    if (size != null) headers['Content-Length'] = size;
    if (req.method === 'HEAD') { res.writeHead(200, headers).end(); return; }
    const s = fs.createReadStream(f, { highWaterMark: 64 * 1024 });
    s.on('error', () => { if (!res.headersSent) res.writeHead(404).end(); else res.destroy(); });
    res.writeHead(200, headers); s.pipe(res);
  };
  tryEnc(0);
}

// ---------------------------------------------------------------- rooms
const rooms = new Map();   // code -> room
let nextId = 1;
function newCode() {
  for (let i = 0; i < 200; i++) {
    let c = ''; for (let k = 0; k < 4; k++) c += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0];
    if (!rooms.has(c)) return c;
  }
  return null;
}
const cleanName = n => String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16) || 'Giocatore';
const cleanText = s => String(s || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200);
function send(c, msg) { if (c.ws.readyState === 1) { try { c.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); } catch { } } }
function broadcast(room, msg, except) { const s = JSON.stringify(msg); for (const c of room.clients.values()) if (c !== except) send(c, s); }
const pub = c => ({ id: c.id, name: c.name, color: c.color, ...(c.extra && Object.keys(c.extra).length ? { extra: c.extra } : {}) });

// ---------------------------------------------------------------- shared world state (per room, see src/worldsync.js)
// room.ws: key -> { v, j (JSON length), by (owner id for 'mine' keys, else 0), e (expiry ms, 0 = never) }.
// ops: set (default; v null deletes) · new (only if absent) · take (only if present: deletes it) · cas (only if the
// current value equals m.if). The server is the referee of who opened a crate or picked a drop first; success is
// broadcast to the whole room (sender included, with its rid), failure goes back to the sender with the current value.
const WS_KEY_RE = /^[\w:.\-]{1,40}$/;
function wsDel(room, k) { const x = room.ws.get(k); if (x) { room.wsBytes -= x.j + k.length; room.ws.delete(k); } }
function wsLive(room, k, now = Date.now()) { const x = room.ws && room.ws.get(k); if (x && x.e && x.e < now) { wsDel(room, k); return null; } return x || null; }
function wsDump(room) { const o = {}, now = Date.now(); if (room.ws) for (const k of [...room.ws.keys()]) { const x = wsLive(room, k, now); if (x) o[k] = x.v; } return o; }
function wsOp(c, room, m) {
  const k = String(m.k || ''); if (!WS_KEY_RE.test(k)) return;
  if (!room.ws) { room.ws = new Map(); room.wsBytes = 0; }
  const op = m.op || 'set', cur = wsLive(room, k), v = m.v === undefined ? null : m.v;
  const j = v === null ? 0 : JSON.stringify(v).length;
  const fail = () => send(c, { t: 'ws', k, v: cur ? cur.v : null, by: cur ? cur.by : 0, fail: 1, rid: m.rid });
  if (j > WS_VAL) return fail();
  if (op === 'new' && cur) return fail();
  if (op === 'take' && !cur) return fail();
  if (op === 'cas' && JSON.stringify(cur ? cur.v : null) !== JSON.stringify(m.if === undefined ? null : m.if)) return fail();
  if (op === 'take' || v === null) wsDel(room, k);
  else {
    if (!cur && (room.ws.size >= WS_KEYS || room.wsBytes + j + k.length > WS_BYTES)) return fail();
    wsDel(room, k); room.ws.set(k, { v, j, by: m.mine ? c.id : 0, e: m.ttl > 0 ? Date.now() + Math.min(+m.ttl, 3600) * 1000 : 0 }); room.wsBytes += j + k.length;
  }
  broadcast(room, { t: 'ws', k, v: op === 'take' ? null : v, by: c.id, rid: m.rid, ...(op === 'take' ? { took: 1 } : {}) });
}

function joinRoom(c, room) {
  const cap = room.cap || MAX_PLAYERS;
  if (room.clients.size >= cap) return send(c, { t: 'err', code: 'full', msg: 'Stanza piena (max ' + cap + ')' });
  leaveRoom(c);
  const used = new Set([...room.clients.values()].map(x => x.color));
  c.color = 0; while (used.has(c.color)) c.color++;
  c.room = room; room.clients.set(c.id, c);
  if (!room.host || !room.clients.has(room.host)) room.host = c.id;
  c.seen = new Set(); c.lastStateAt = Date.now();
  // shards: only the states of players nearby (interest management); private rooms: everyone
  const near = x => !room.world || !x.state || !c.state || x === c;
  const states = Object.fromEntries([...room.clients.values()].filter(x => x.state && near(x)).map(x => [x.id, x.state]));
  send(c, { t: 'welcome', id: c.id, code: room.code, host: room.host, world: !!room.world, cap, players: [...room.clients.values()].map(pub), states, ws: wsDump(room), st: Date.now() });
  broadcast(room, { t: 'joined', p: pub(c) }, c);
  log('join', room.code, c.id, c.name, room.clients.size + '/' + cap);
}
function leaveRoom(c) {
  const room = c.room; if (!room) return;
  room.clients.delete(c.id); c.room = null; c.state = null; c.dirty = false; c.seen = null;
  broadcast(room, { t: 'left', id: c.id });
  if (room.ws) for (const [k, x] of room.ws) if (x.by === c.id) { wsDel(room, k); broadcast(room, { t: 'ws', k, v: null, by: 0 }); } // 'mine' keys (a boss, a borrowed car) go with their owner
  for (const o of room.clients.values()) if (o.seen) o.seen.delete(c.id);
  if (room.clients.size === 0) { rooms.delete(room.code); log('room closed', room.code); return; }
  if (room.host === c.id) { room.host = room.clients.keys().next().value; broadcast(room, { t: 'host', id: room.host }); log('host ->', room.host, 'in', room.code); }
}

// public shards: fill the busiest shard that still has room, else open a new one (Q1, Q2…)
function worldShard() {
  let best = null;
  for (const r of rooms.values()) if (r.world && r.clients.size < r.cap && (!best || r.clients.size > best.clients.size)) best = r;
  if (best) return best;
  if (rooms.size >= MAX_ROOMS) return null;
  let n = 1; while (rooms.has('Q' + n)) n++;
  const r = { code: 'Q' + n, clients: new Map(), host: null, created: Date.now(), world: true, cap: WORLD_CAP };
  rooms.set(r.code, r); log('shard aperto', r.code); return r;
}

// token bucket per connection
function allow(c, cost = 1) {
  const now = Date.now();
  c.tokens = Math.min(240, c.tokens + (now - c.last) * 0.15); c.last = now; // 150 msg/s sustained, burst 240
  if (c.tokens < cost) return false; c.tokens -= cost; return true;
}

function onMessage(c, data, isBinary) {
  if (isBinary || data.length > MAX_MSG) return;
  if (!allow(c)) return;
  let m; try { m = JSON.parse(data); } catch { return; }
  if (!m || typeof m.t !== 'string') return;
  const room = c.room;
  if (m.t.startsWith('match:')) { matches.onMessage(c, m).catch(e => log('match', e && e.message)); return; }
  switch (m.t) {
    case 'hello': {
      c.name = cleanName(m.name);
      if (typeof m.token === 'string' && TOKEN_RE.test(m.token)) c.th = hashToken(m.token); // verified leaderboard entries
      break;
    }
    case 'world': { // public "Quartiere" shard
      c.name = cleanName(m.name || c.name);
      if (room && room.world) return send(c, { t: 'err', code: 'already', msg: 'Sei già nel quartiere pubblico' });
      const r = worldShard(); if (!r) return send(c, { t: 'err', code: 'busy', msg: 'Server pieno, riprova più tardi' });
      joinRoom(c, r); break;
    }
    case 'extra': { // presence extras: small keyed values, sent once and kept by the server for newcomers
      const k = String(m.k || '').replace(/[^a-z0-9_]/gi, '').slice(0, 24); if (!k) return;
      const next = { ...(c.extra || {}) };
      if (m.v === null || m.v === undefined) delete next[k]; else next[k] = m.v;
      if (JSON.stringify(next).length > MAX_EXTRA) return send(c, { t: 'err', code: 'extra', msg: 'extra troppo grande' });
      c.extra = next;
      if (room) broadcast(room, { t: 'extra', id: c.id, k, v: m.v === undefined ? null : m.v }, c);
      break;
    }
    case 'create': {
      if (rooms.size >= MAX_ROOMS) return send(c, { t: 'err', code: 'busy', msg: 'Server pieno, riprova più tardi' });
      c.name = cleanName(m.name || c.name);
      const code = newCode(); if (!code) return send(c, { t: 'err', code: 'busy', msg: 'Nessun codice libero' });
      const r = { code, clients: new Map(), host: null, created: Date.now() }; rooms.set(code, r);
      joinRoom(c, r); break;
    }
    case 'join': {
      c.name = cleanName(m.name || c.name);
      const code = String(m.code || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
      const r = rooms.get(code); if (!r) return send(c, { t: 'err', code: 'noroom', msg: 'Stanza ' + (code || '?') + ' non trovata' });
      joinRoom(c, r); break;
    }
    case 'leave': leaveRoom(c); send(c, { t: 'bye' }); break;
    case 'state': { // presence, relayed in batches at STATE_HZ
      if (!room || !m.s || typeof m.s !== 'object') return;
      const s = JSON.stringify(m.s); if (s.length > MAX_STATE) return;
      c.state = m.s; c.dirty = true; c.lastStateAt = Date.now(); break;
    }
    case 'ev': { // immediate small event to everyone else in the room
      if (!room || !m.e || typeof m.e !== 'object') return;
      if (JSON.stringify(m.e).length > 4096) return;
      broadcast(room, { t: 'ev', from: c.id, e: m.e }, c); break;
    }
    case 'nev': { // like 'ev', but in shards only to the players near the sender (enemy snapshots: src/worldsync.js)
      if (!room || !m.e || typeof m.e !== 'object') return;
      const s = JSON.stringify({ t: 'ev', from: c.id, e: m.e }); if (s.length > 4200) return;
      const R = Math.min(200, +m.r || NEAR_R), me = c.state;
      for (const o of room.clients.values()) if (o !== c && (!room.world || !me || !o.state || (o.state.x - me.x) ** 2 + (o.state.z - me.z) ** 2 <= R * R)) send(o, s);
      break;
    }
    case 'ws': if (room) wsOp(c, room, m); break;
    case 'to': { // direct message to one peer (e.g. guest input -> host)
      if (!room) return; const dst = room.clients.get(+m.id); if (!dst) return;
      send(dst, { t: 'msg', from: c.id, d: m.d }); break;
    }
    case 'game': { // host-only game snapshot broadcast
      if (!room || room.host !== c.id) return;
      broadcast(room, { t: 'game', d: m.d }, c); break;
    }
    case 'chat': {
      if (!room) return; const text = cleanText(m.text); if (!text) return;
      if (!allow(c, 20)) return; // max ~7 chat msgs/s
      broadcast(room, { t: 'chat', id: c.id, name: c.name, text }); break;
    }
    case 'ping': send(c, { t: 'pong', ts: m.ts, st: Date.now(), n: room ? room.clients.size : 0 }); break; // st: server clock (net.serverNow)
  }
}

// presence relay: private rooms at STATE_HZ to everyone; shards at WORLD_HZ, each client gets only the players within
// WORLD_RADIUS (plus those sharing a match with it), a player coming into range is sent even if it didn't change,
// and players leaving range are announced with 'far' so the client hides their avatar.
let tickN = 0;
const R2 = WORLD_RADIUS * WORLD_RADIUS;
setInterval(() => {
  tickN++;
  const worldTick = tickN % Math.round(STATE_HZ / WORLD_HZ) === 0 || WORLD_HZ >= STATE_HZ;
  for (const room of rooms.values()) {
    if (!room.world) {
      let s = null;
      for (const c of room.clients.values()) if (c.dirty) { (s ||= {})[c.id] = c.state; c.dirty = false; }
      if (s) broadcast(room, { t: 'states', s });
      continue;
    }
    if (!worldTick) continue;
    const list = [...room.clients.values()];
    for (const r of list) {
      if (!r.seen) r.seen = new Set();
      let s = null, far = null; const now = new Set();
      for (const c of list) {
        if (c === r || !c.state) continue;
        const near = !r.state || ((c.state.x - r.state.x) ** 2 + (c.state.z - r.state.z) ** 2 <= R2) || matches.shared(r, c);
        if (!near) continue;
        now.add(c.id);
        if (c.dirty || !r.seen.has(c.id)) (s ||= {})[c.id] = c.state;
      }
      for (const id of r.seen) if (!now.has(id)) (far ||= []).push(id);
      r.seen = now;
      if (s) send(r, { t: 'states', s });
      if (far) send(r, { t: 'far', ids: far });
    }
    for (const c of list) c.dirty = false;
  }
}, 1000 / STATE_HZ);
// shards: drop players with no presence for a while (closed laptop, background tab)
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) if (room.world) for (const c of [...room.clients.values()]) {
    if (now - (c.lastStateAt || 0) > WORLD_IDLE_MS) { leaveRoom(c); send(c, { t: 'bye', reason: 'idle' }); }
  }
  for (const room of rooms.values()) if (room.ws) for (const k of [...room.ws.keys()]) wsLive(room, k, now); // expired drops
}, 15000).unref();

// ---------------------------------------------------------------- http + ws
const server = http.createServer((req, res) => {
  if (handleAI(req, res, log)) return;
  if (handleApi(req, res, store, log)) return;
  if (req.url === '/healthz') {
    let players = 0, shards = 0; for (const r of rooms.values()) { players += r.clients.size; if (r.world) shards++; }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify({ ok: true, rooms: rooms.size, shards, players, ...matches.stats(), store: store.kind, uptime: Math.round(process.uptime()) }));
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
  serveStatic(req, res);
});
const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MSG, perMessageDeflate: { threshold: 1024 } });
server.on('upgrade', (req, socket, head) => {
  let p = '/'; try { p = new URL(req.url, 'http://x').pathname; } catch { }
  if (p !== '/ws') { socket.destroy(); return; }
  // same-origin only (browsers always send Origin); allow missing Origin for tools/tests
  const origin = req.headers.origin, host = req.headers.host;
  // the Windows/Mac desktop app (Electron) loads the game from app://bigalesso and connects here as well
  if (origin && host && !process.env.ALLOW_ANY_ORIGIN && origin !== 'app://bigalesso') { try { if (new URL(origin).host !== host) { socket.destroy(); return; } } catch { socket.destroy(); return; } }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
});
wss.on('connection', ws => {
  const c = { id: nextId++, ws, name: 'Giocatore', color: 0, room: null, state: null, dirty: false
    , tokens: 240, last: Date.now() };
  ws.on('message', (d, bin) => onMessage(c, d, bin));
  ws.on('close', () => { matches.onClose(c); leaveRoom(c); });
  ws.on('error', () => { });
  send(c, { t: 'hi', id: c.id, max: MAX_PLAYERS, world: WORLD_CAP, games: matches.typesNow(), v: 2, st: Date.now() });
});
// heartbeat: drop dead sockets (no pong within one interval)
const hb = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws._bgDead) { ws.terminate(); continue; }
    ws._bgDead = true; try { ws.ping(); } catch { }
  }
}, 12000);
wss.on('connection', ws => ws.on('pong', () => { ws._bgDead = false; }));
wss.on('close', () => clearInterval(hb));

server.listen(PORT, () => log(`BIGALESSO server su http://localhost:${PORT}  (statici: ${STATIC_DIR}, ws: /ws)`));
let stopping = false;
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { if (stopping) return; stopping = true; log('stop (' + sig + ')'); wss.clients.forEach(w => w.close(1001)); matches.close(); store.close(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 1500).unref(); });
