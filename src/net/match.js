// window.__match — one API for every rule-based mode (cards, races, battle royale, siege RTS, Gulag runs).
// Rules live in shared/<type>.mjs (see shared/README.md). Offline (or no server) the rules run here in the browser;
// online the SERVER runs them and is the referee: it deals, validates moves, runs zone/bots/timers and sends each
// player only their own view. Feature code never cares which: it calls start(), act(), and renders 'view'.
//
//   const s = await __match.start('briscola', { opts: {...}, players: [{ id:'bot1', name:'Seghino', bot:true }],
//                                              online: 'auto' | true | false, matchId?: '...' /* join existing */,
//                                              wait?: true /* online: open a lobby, others join, host calls s.begin() */,
//                                              public?: true /* online: listed for everyone, not only my room */ });
//   s.on('view', v => render(v));   // full snapshot for me, after every change (and each tick for tickHz > 0)
//   s.on('event', e => fx(e));      // things that happened (from game.drain())
//   s.on('over', r => results(r));  // { winners, scores, summary }
//   s.on('players', list => ...);   // [{ id, name, bot, online }] lobby / drop-in changes (online)
//   s.on('error', e => ...);        // { ok:false, error } rejected move; online also { fatal:true } if the link drops
//   s.act({ ... });                 // my action. Local: returns { ok, error } at once. Online: returns { ok:true,
//                                   // pending:true } and a rejection arrives as an 'error' event
//   s.begin();                      // online lobby (wait:true): the host starts; bots fill free seats
//   s.leave();
//   s.id, s.me (my player id), s.online (bool), s.type, s.lobby (bool, online wait), s.host (bool), s.meta
//   __match.lobby(type) -> Promise<[{ id, type, name, players:[names], bots, max, lobby, dropIn, mine, room, public }]>
//                          open online matches I can join (my room's and public ones); [] offline
//   __match.join(id) -> Promise<session>  (online only)
//   start() online extras: link: true (joinable by id from anywhere: party codes), party: '<party match id>' (its members
//   can join from any room). __match.invite(id, toNetId) sends a server invite to a player of my room / shard;
//   __match.onInvite(fn) -> off: fn({ id, type, name, from, fromId }) (src/net/party.js).
//   Rules with game.aiRequest()/aiResult() (Processo's judge) get their AI text from window.__ai locally; online the
//   server asks it (server/ai.mjs).
//
// online: 'auto' (default) = refereed by the server when I'm already connected to it (in a room or the public
// quartiere) and the server knows the type; otherwise local. true = always on the server (opens the socket; throws
// if impossible). false = always local. Real-time modes: keep your own movement client-side and send it as actions
// (~10-20 Hz); the rules referee everything else. Keep views small (≤ 4 KB per player per tick).
import { GAMES } from '../../shared/index.mjs';
import { newSeed } from '../../shared/rng.mjs';

const listeners = () => ({ view: [], event: [], over: [], players: [], error: [] });

async function loadRules(type) {
  const load = GAMES[type];
  if (!load) throw new Error('modalità sconosciuta: ' + type);
  return await load();
}

function localSession(type, mod, { opts = {}, players = [], me } = {}) {
  const L = listeners();
  const myId = me || 'me';
  const all = [{ id: myId, name: (window.__net && window.__net.name) || 'Tu', bot: false }, ...players.filter(p => p.id !== myId)];
  const game = mod.create({ players: all, opts, seed: newSeed() });
  const hz = (mod.meta && mod.meta.tickHz) || 0;
  let timer = null, last = 0, closed = false, overSent = false, aiBusy = false;
  const emit = (k, v) => { for (const f of L[k]) try { f(v); } catch (e) { console.error(e); } };
  const flush = () => {
    if (closed) return;
    const evs = game.drain ? game.drain() : [];
    for (const e of evs) emit('event', e);
    emit('view', game.view(myId));
    const o = game.over;
    if (o && !overSent) { overSent = true; emit('over', o); stop(); }
    if (!o && game.aiRequest && !aiBusy) localAI();
  };
  // the same AI hook the server referee has (server/match.mjs), through the browser's provider chain (window.__ai)
  function localAI() {
    const q = game.aiRequest(); if (!q) return;
    aiBusy = true;
    const ai = window.__ai;
    const ask = ai && typeof ai.ask === 'function' ? Promise.race([ai.ask({ model: q.model || 'smart', maxTokens: q.maxTokens || 300, system: q.system, prompt: q.prompt }), new Promise(r => setTimeout(() => r(null), 15000))]) : Promise.resolve(null);
    ask.then(r => (typeof r === 'string' ? r : (r && (r.text || r.content)) || null), () => null).then(t => {
      aiBusy = false; if (closed) return;
      try { game.aiResult(q.id, t && String(t).trim() && !/^(error|errore)\b/i.test(String(t).trim()) ? String(t) : null); } catch (e) { console.error(e); }
      flush();
    });
  }
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
  if (hz > 0) {
    last = performance.now();
    timer = setInterval(() => {
      const t = performance.now(), dt = Math.min(Math.max(0.25, 2 / hz), (t - last) / 1000); last = t; // slow ticks (2 Hz): don't halve the game time
      if (document.hidden && !(opts && opts.runHidden)) return;
      game.tick(dt); flush();
    }, 1000 / hz);
  }
  const s = {
    type, id: 'local-' + type, me: myId, online: false, game, lobby: false, host: true, meta: mod.meta,
    on(k, f) { (L[k] || (L[k] = [])).push(f); if (k === 'view') queueMicrotask(() => { if (!closed) f(game.view(myId)); }); return s; },
    act(a) { if (closed) return { ok: false, error: 'chiusa' }; const r = game.act(myId, a) || { ok: true }; if (!r.ok) emit('error', r); flush(); return r; },
    begin() { },
    leave() { closed = true; stop(); if (game.leave) try { game.leave(myId); } catch (e) { } },
    players: () => all,
  };
  return s;
}

// ------------------------------------------------------------------ online (server referee)
const sessions = new Map(); // match id -> session
const pending = new Map();  // rid -> { res, rej, to }
const inviteFns = [];
let rid = 0, hooked = false;

function request(net, msg, wantT) {
  return new Promise((res, rej) => {
    const r = ++rid; msg.rid = r;
    const to = setTimeout(() => { pending.delete(r); rej(new Error('il server non risponde')); }, 8000);
    pending.set(r, { res, rej, to, wantT });
    if (!net.send(msg)) { clearTimeout(to); pending.delete(r); rej(new Error('non connesso')); }
  });
}
function settle(m, ok) {
  const p = pending.get(m.rid); if (!p) return false;
  pending.delete(m.rid); clearTimeout(p.to);
  if (ok) p.res(m); else p.rej(new Error(m.error || 'errore'));
  return true;
}
function hook(net) {
  if (hooked) return; hooked = true;
  const S = id => sessions.get(id);
  net.onMsg('match:created', m => settle(m, true));
  net.onMsg('match:joined', m => settle(m, true));
  net.onMsg('match:list', m => settle(m, true));
  net.onMsg('match:view', m => { const s = S(m.id); if (s) s._view(m.v); });
  net.onMsg('match:event', m => { const s = S(m.id); if (s) s._emit('event', m.e); });
  net.onMsg('match:players', m => { const s = S(m.id); if (s) s._players(m); });
  net.onMsg('match:over', m => { const s = S(m.id); if (s) s._over(m.r); });
  net.onMsg('match:invite', m => { for (const f of inviteFns.slice()) try { f({ id: String(m.id || ''), type: m.type, name: m.name, from: m.from, fromId: m.fromId }); } catch (e) { console.error(e); } });
  net.onMsg('match:error', m => {
    if (m.rid && settle(m, false)) return;
    const s = m.id ? S(m.id) : null;
    if (s) s._emit('error', { ok: false, error: m.error });
    else if (m.error === 'rate') for (const x of sessions.values()) x._emit('error', { ok: false, error: 'troppe mosse, rallenta' });
  });
  net.on('socket', up => {
    if (up) return;
    for (const [r, p] of pending) { clearTimeout(p.to); p.rej(new Error('connessione persa')); pending.delete(r); }
    for (const s of [...sessions.values()]) s._lost();
  });
}

function remoteSession(net, reply) {
  const L = listeners();
  let view = null, plist = [], closed = false, overR = null;
  const emit = (k, v) => { for (const f of L[k] || []) try { f(v); } catch (e) { console.error(e); } };
  const s = {
    type: reply.meta && reply.meta.type, id: reply.id, me: reply.me, online: true, lobby: !!reply.lobby, host: !!reply.host, meta: reply.meta || {},
    on(k, f) {
      (L[k] || (L[k] = [])).push(f);
      if (k === 'view' && view) queueMicrotask(() => { if (!closed) f(view); });
      if (k === 'players' && plist.length) queueMicrotask(() => { if (!closed) f(plist); });
      if (k === 'over' && overR) queueMicrotask(() => f(overR));
      return s;
    },
    act(a) { if (closed) return { ok: false, error: 'chiusa' }; if (!net.send({ t: 'match:act', id: s.id, a })) { return { ok: false, error: 'non connesso' }; } return { ok: true, pending: true }; },
    begin() { if (!closed && s.lobby) net.send({ t: 'match:start', id: s.id }); },
    leave() { if (closed) return; closed = true; net.send({ t: 'match:leave', id: s.id }); sessions.delete(s.id); net.hold(-1); },
    players: () => plist,
    _view(v) { if (closed) return; view = v; if (s.lobby) s.lobby = false; emit('view', v); },
    _emit: emit,
    _players(m) { plist = m.players || []; s.lobby = !!m.lobby; s.host = m.host === s.me; emit('players', plist); },
    _over(r) { overR = r; emit('over', r); },
    _lost() { if (closed) return; closed = true; sessions.delete(s.id); net.hold(-1); emit('error', { ok: false, error: 'connessione persa', fatal: true }); },
  };
  sessions.set(s.id, s); net.hold(+1);
  return s;
}

const transport = {
  async start(type, o = {}) {
    const net = window.__net;
    if (!net || !net.socket) throw new Error('rete non pronta');
    if (!(await net.socket())) throw new Error('server non raggiungibile');
    hook(net);
    let reply;
    if (o.matchId) reply = await request(net, { t: 'match:join', id: String(o.matchId) });
    else {
      if (net.games && net.games.length && !net.games.includes(type)) throw new Error('il server non conosce ' + type);
      const bots = (o.players || []).filter(p => p && p.bot).map(p => ({ id: p.id, name: p.name }));
      reply = await request(net, { t: 'match:create', type, opts: o.opts || {}, bots, wait: !!o.wait, public: !!o.public, room: o.room !== false, fill: o.fill !== false, link: !!o.link, party: o.party || undefined });
    }
    return remoteSession(net, reply);
  },
  async lobby(type) {
    const net = window.__net;
    if (!net || !net.connected || !net.connected()) return [];
    hook(net);
    const r = await request(net, { t: 'match:list', type: type || undefined });
    return r.list || [];
  },
};

const api = {
  transport,
  async start(type, o = {}) {
    const online = o.online === undefined ? 'auto' : o.online;
    const net = window.__net;
    const connected = !!(net && net.connected && net.connected());
    const serverHas = !!(net && net.games && net.games.includes(type));
    if (o.matchId || online === true || (online === 'auto' && connected && serverHas)) {
      try { return await api.transport.start(type, o); }
      catch (e) { if (online === true || o.matchId) throw e; console.warn('match online non disponibile, gioco in locale:', e && e.message); }
    }
    const mod = await loadRules(type);
    return localSession(type, mod, o);
  },
  async join(id) { return api.transport.start(null, { matchId: id, online: true }); },
  async lobby(type) { try { return api.transport ? await api.transport.lobby(type) : []; } catch (e) { return []; } },
  async rules(type) { return loadRules(type); },
  types: () => Object.keys(GAMES),
  sessions: () => [...sessions.values()],
  invite(id, to) { const net = window.__net; return !!(net && net.connected && net.connected() && net.send({ t: 'match:invite', id: String(id), to })); },
  onInvite(fn) { inviteFns.push(fn); const net = window.__net; if (net && net.onMsg) hook(net); return () => { const i = inviteFns.indexOf(fn); if (i >= 0) inviteFns.splice(i, 1); }; },
  hook() { const net = window.__net; if (net && net.onMsg) hook(net); },
};
window.__match = api;
export default api;
import './party.js'; // "Gioca insieme": parties of friends that launch the minigames together (window.__party)
