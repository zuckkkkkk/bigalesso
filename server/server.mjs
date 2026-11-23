// BIGALESSO GAMES – server multiplayer
// Serve la build statica (dist/) e un WebSocket su /ws con stanze a codice di 4 lettere.
// Nessun database: tutto in memoria. Avvio: PORT=8080 node server/server.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { handleAI } from './ai.mjs'; // POST /api/ai (Claude proxy, env ANTHROPIC_API_KEY)

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = +process.env.PORT || 8080;
const STATIC_DIR = path.resolve(process.env.STATIC_DIR || path.join(__dirname, '..', 'dist'));
const MAX_PLAYERS = 8;
const MAX_ROOMS = +process.env.MAX_ROOMS || 500;
const STATE_HZ = 15;
const MAX_MSG = 128 * 1024;          // bytes, any message
const MAX_STATE = 2048;               // bytes, presence state
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O
const log = (...a) => console.log(new Date().toISOString(), ...a);

// ---------------------------------------------------------------- static files
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.glb': 'model/gltf-binary',
  '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.ktx2': 'image/ktx2', '.bin': 'application/octet-stream',
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
const pub = c => ({ id: c.id, name: c.name, color: c.color });

function joinRoom(c, room) {
  if (room.clients.size >= MAX_PLAYERS) return send(c, { t: 'err', code: 'full', msg: 'Stanza piena (max ' + MAX_PLAYERS + ')' });
  leaveRoom(c);
  const used = new Set([...room.clients.values()].map(x => x.color));
  c.color = 0; while (used.has(c.color)) c.color++;
  c.room = room; room.clients.set(c.id, c);
  if (!room.host || !room.clients.has(room.host)) room.host = c.id;
  send(c, { t: 'welcome', id: c.id, code: room.code, host: room.host, players: [...room.clients.values()].map(pub), states: Object.fromEntries([...room.clients.values()].filter(x => x.state).map(x => [x.id, x.state])) });
  broadcast(room, { t: 'joined', p: pub(c) }, c);
  log('join', room.code, c.id, c.name, room.clients.size + '/' + MAX_PLAYERS);
}
function leaveRoom(c) {
  const room = c.room; if (!room) return;
  room.clients.delete(c.id); c.room = null; c.state = null; c.dirty = false;
  broadcast(room, { t: 'left', id: c.id });
  if (room.clients.size === 0) { rooms.delete(room.code); log('room closed', room.code); return; }
  if (room.host === c.id) { room.host = room.clients.keys().next().value; broadcast(room, { t: 'host', id: room.host }); log('host ->', room.host, 'in', room.code); }
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
  switch (m.t) {
    case 'hello': c.name = cleanName(m.name); break;
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
      c.state = m.s; c.dirty = true; break;
    }
    case 'ev': { // immediate small event to everyone else in the room
      if (!room || !m.e || typeof m.e !== 'object') return;
      if (JSON.stringify(m.e).length > 4096) return;
      broadcast(room, { t: 'ev', from: c.id, e: m.e }, c); break;
    }
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
    case 'ping': send(c, { t: 'pong', ts: m.ts, n: room ? room.clients.size : 0 }); break;
  }
}

// presence relay tick
setInterval(() => {
  for (const room of rooms.values()) {
    let s = null;
    for (const c of room.clients.values()) if (c.dirty) { (s ||= {})[c.id] = c.state; c.dirty = false; }
    if (s) broadcast(room, { t: 'states', s });
  }
}, 1000 / STATE_HZ);

// ---------------------------------------------------------------- http + ws
const server = http.createServer((req, res) => {
  if (handleAI(req, res, log)) return;
  if (req.url === '/healthz') {
    let players = 0; for (const r of rooms.values()) players += r.clients.size;
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify({ ok: true, rooms: rooms.size, players, uptime: Math.round(process.uptime()) }));
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
  if (origin && host && !process.env.ALLOW_ANY_ORIGIN) { try { if (new URL(origin).host !== host) { socket.destroy(); return; } } catch { socket.destroy(); return; } }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
});
wss.on('connection', ws => {
  const c = { id: nextId++, ws, name: 'Giocatore', color: 0, room: null, state: null, dirty: false
    , tokens: 240, last: Date.now() };
  ws.on('message', (d, bin) => onMessage(c, d, bin));
  ws.on('close', () => leaveRoom(c));
  ws.on('error', () => { });
  send(c, { t: 'hi', id: c.id, max: MAX_PLAYERS });
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
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { if (stopping) return; stopping = true; log('stop (' + sig + ')'); wss.clients.forEach(w => w.close(1001)); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 1500).unref(); });
