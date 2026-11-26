// BIGALESSO · server-side matches: the server runs the rules of shared/<type>.mjs and is the referee.
// Clients send intents (match:act), the server validates them in the rules module, runs ticks/bots, and sends every
// player only their own view. One scheduler drives every ticking match.
//
// Client -> server (over /ws):
//   match:create { rid, type, opts, bots:[{id,name}], wait, public, room }  -> match:created { rid, id, me, lobby, host, meta }
//   match:join   { rid, id }                                               -> match:joined  { rid, id, me, lobby, host, meta }
//   match:start  { id }        host only, starts a lobby (bots fill free seats up to opts.seats / meta.minPlayers)
//   match:act    { id, a, rid }  -> (only on rejection) match:error { id, rid, error }
//   match:leave  { id }
//   match:list   { rid, type }  -> match:list { rid, list:[{ id, type, name, players, max, lobby, mine, room, public }] }
// Server -> client: match:view { id, v } (on change; every tick for ticking games), match:event { id, e },
//   match:players { id, players:[{id,name,bot,online}], lobby, host }, match:over { id, r }, match:error { id?, rid?, error }
import { GAMES } from '../shared/index.mjs';

const MAX_MATCHES = Math.max(10, +process.env.MAX_MATCHES || 300);
const MAX_PER_CLIENT = 3;
const MAX_ACT = 2048, MAX_OPTS = 4096, MAX_VIEW = 64 * 1024;
const IDLE_MS = 30000, LOBBY_MAX_MS = 15 * 60000, OVER_KEEP_MS = 60000;
const ACT_RATE = 40, ACT_BURST = 80; // per client, all matches together
const BASE_MS = 25;                  // scheduler resolution (40 Hz)
const ID_CHARS = 'abcdefghijkmnpqrstuvwxyz23456789';
const botId = s => String(s || '').replace(/[^a-z0-9_]/gi, '').slice(0, 16);
const cleanName = n => String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16) || 'Giocatore';

export function createMatches({ send, log = () => { }, store = null }) {
  const matches = new Map();        // id -> match
  const byClient = new Map();       // client -> Set(match id)
  const mods = new Map();           // type -> Promise<module|null>
  let ticking = 0, errors = 0;

  const extra = process.env.GAMES_EXTRA ? import(process.env.GAMES_EXTRA).then(m => m.GAMES || {}).catch(e => { log('GAMES_EXTRA', e && e.message); return {}; }) : Promise.resolve({});
  let extraGames = {}; extra.then(g => { extraGames = g; });
  const registry = () => ({ ...GAMES, ...extraGames });
  async function load(type) {
    await extra;
    const R = registry();
    if (typeof type !== 'string' || !Object.prototype.hasOwnProperty.call(R, type)) return null;
    if (!mods.has(type)) mods.set(type, R[type]().then(m => {
      if (!m || typeof m.create !== 'function' || !m.meta) { log('match: modulo non valido', type); return null; }
      return m;
    }).catch(e => { log('match: errore caricando', type, e && e.message); return null; }));
    return mods.get(type);
  }
  const newId = () => { for (;;) { let s = ''; for (let i = 0; i < 6; i++) s += ID_CHARS[(Math.random() * ID_CHARS.length) | 0]; if (!matches.has(s)) return s; } };
  const pidOf = c => 'p' + c.id;
  const seatOf = (M, c) => M.seats.find(s => s.c === c);
  const humans = M => M.seats.filter(s => !s.bot && s.c);
  const pub = M => M.seats.map(s => ({ id: s.pid, name: s.name, bot: !!s.bot, online: !!s.c || !!s.bot }));
  const err = (c, error, id, rid) => send(c, { t: 'match:error', id, rid, error });

  function track(c, id, on) { let s = byClient.get(c); if (!s) { s = new Set(); byClient.set(c, s); } if (on) s.add(id); else { s.delete(id); if (!s.size) byClient.delete(c); } }
  function toAll(M, msg) { const s = JSON.stringify(msg); for (const st of humans(M)) send(st.c, s); }
  function players(M) { toAll(M, { t: 'match:players', id: M.id, players: pub(M), lobby: M.state === 'lobby', host: M.host ? pidOf(M.host) : null }); }

  function safe(M, fn, what) {
    try { return fn(); }
    catch (e) { errors++; log('match', M.type, M.id, what, 'errore:', e && e.message); end(M, null, 'errore nelle regole'); return undefined; }
  }

  function flush(M) {
    if (!M.game) return;
    const evs = M.game.drain ? safe(M, () => M.game.drain(), 'drain') : null;
    if (!matches.has(M.id)) return;
    if (evs && evs.length) for (const e of evs) toAll(M, { t: 'match:event', id: M.id, e });
    for (const st of humans(M)) {
      const v = safe(M, () => JSON.stringify(M.game.view(st.pid)), 'view'); if (!matches.has(M.id)) return;
      if (v === undefined || v === st.last) continue;
      if (v.length > MAX_VIEW) { if (!M.bigWarn) { M.bigWarn = true; log('match', M.type, 'view troppo grande', v.length); } continue; }
      st.last = v; send(st.c, '{"t":"match:view","id":"' + M.id + '","v":' + v + '}');
    }
    const o = safe(M, () => M.game.over, 'over');
    if (o && M.state === 'play') end(M, o);
  }

  function end(M, result, error) {
    if (M.state === 'over') return;
    M.state = 'over'; M.overAt = Date.now(); M.result = result || null;
    if (error) toAll(M, { t: 'match:error', id: M.id, error });
    else toAll(M, { t: 'match:over', id: M.id, r: result });
    // verified leaderboard entries straight from the referee
    const b = M.mod && M.mod.meta && M.mod.meta.board;
    if (result && b && store) {
      const bid = typeof b === 'string' ? b : b.id, lower = typeof b === 'object' && !!b.lower;
      for (const st of M.seats) {
        if (st.bot || !st.th || !result.scores || !(st.pid in result.scores)) continue;
        const sc = Number(result.scores[st.pid]); if (!Number.isFinite(sc)) continue;
        try { store.submit(bid, st.th, st.name, sc, JSON.stringify({ type: M.type, won: (result.winners || []).includes(st.pid) }), true, lower); } catch (e) { log('board', e && e.message); }
      }
    }
  }
  function remove(M) {
    matches.delete(M.id);
    for (const st of M.seats) if (st.c) track(st.c, M.id, false);
  }

  function startGame(M) {
    const meta = M.mod.meta;
    const want = Math.min(meta.maxPlayers || 8, Math.max(meta.minPlayers || 1, (M.opts && +M.opts.seats) || 0, M.seats.length));
    let n = 1; while (M.seats.length < want && M.fill) { const id = 'bot' + n++; if (M.seats.some(s => s.pid === id)) continue; M.seats.push({ pid: id, name: 'Bot ' + (n - 1), bot: true }); }
    const plist = M.seats.map(s => ({ id: s.pid, name: s.name, bot: !!s.bot }));
    M.game = safe(M, () => M.mod.create({ players: plist, opts: M.opts || {}, seed: M.seed }), 'create');
    if (!M.game) return false;
    M.state = 'play'; M.next = Date.now();
    players(M); flush(M);
    return true;
  }

  function rate(c) {
    const now = Date.now();
    if (c.mt === undefined) { c.mt = ACT_BURST; c.ml = now; }
    c.mt = Math.min(ACT_BURST, c.mt + (now - c.ml) * ACT_RATE / 1000); c.ml = now;
    if (c.mt < 1) { if (!c.mWarn || now - c.mWarn > 1000) { c.mWarn = now; err(c, 'rate'); } return false; }
    c.mt -= 1; return true;
  }

  function visibleTo(M, c) {
    if (M.state === 'over') return false;
    if (M.pub) return true;
    if (M.room && c.room && M.room === c.room.code) return true;
    return M.host === c;
  }

  async function onMessage(c, m) {
    switch (m.t) {
      case 'match:create': {
        const mod = await load(m.type);
        if (!mod) return err(c, 'tipo non disponibile sul server: ' + String(m.type).slice(0, 24), null, m.rid), true;
        if (matches.size >= MAX_MATCHES) return err(c, 'server pieno', null, m.rid), true;
        if ((byClient.get(c) || new Set()).size >= MAX_PER_CLIENT) return err(c, 'troppe partite aperte', null, m.rid), true;
        const opts = m.opts && typeof m.opts === 'object' ? m.opts : {};
        if (JSON.stringify(opts).length > MAX_OPTS) return err(c, 'opzioni troppo grandi', null, m.rid), true;
        const meta = mod.meta;
        const M = { id: newId(), type: m.type, mod, opts, seed: (Math.random() * 4294967296) >>> 0, state: 'lobby', host: c, seats: [], game: null,
          room: m.room !== false && c.room ? c.room.code : null, pub: !!m.public, created: Date.now(), touched: Date.now(), hz: Math.max(0, Math.min(30, +meta.tickHz || 0)), fill: m.fill !== false };
        M.seats.push({ pid: pidOf(c), name: c.name, c, th: c.th || null });
        const seen = new Set([pidOf(c)]);
        for (const b of (Array.isArray(m.bots) ? m.bots : []).slice(0, (meta.maxPlayers || 8) - 1)) {
          const id = botId(b && b.id) || 'bot' + M.seats.length; if (seen.has(id)) continue; seen.add(id);
          M.seats.push({ pid: id, name: cleanName(b && b.name), bot: true });
        }
        matches.set(M.id, M); track(c, M.id, true);
        const wait = !!m.wait;
        send(c, { t: 'match:created', rid: m.rid, id: M.id, me: pidOf(c), lobby: wait, host: true, meta: { type: meta.type, name: meta.name, minPlayers: meta.minPlayers, maxPlayers: meta.maxPlayers, tickHz: meta.tickHz, dropIn: !!meta.dropIn } });
        if (wait) players(M); else startGame(M);
        log('match', M.type, M.id, 'creata da', c.id, wait ? '(lobby)' : '', M.room ? 'stanza ' + M.room : '', M.pub ? 'pubblica' : '');
        return true;
      }
      case 'match:join': {
        const M = matches.get(String(m.id || ''));
        if (!M || !visibleTo(M, c)) return err(c, 'partita non trovata', m.id, m.rid), true;
        if (seatOf(M, c)) { send(c, { t: 'match:joined', rid: m.rid, id: M.id, me: pidOf(c), lobby: M.state === 'lobby', host: M.host === c, meta: M.mod.meta }); players(M); flush(M); return true; }
        if ((byClient.get(c) || new Set()).size >= MAX_PER_CLIENT) return err(c, 'troppe partite aperte', M.id, m.rid), true;
        const meta = M.mod.meta, max = meta.maxPlayers || 8;
        if (M.state === 'play') {
          if (!meta.dropIn) {
            // a bot seat can be taken over only if the rules support join/leave; otherwise the match is closed
            return err(c, 'partita già iniziata', M.id, m.rid), true;
          }
          if (humans(M).length + M.seats.filter(s => s.bot).length >= max) {
            const bot = M.seats.find(s => s.bot);
            if (!bot || !M.game.leave) return err(c, 'partita piena', M.id, m.rid), true;
            safe(M, () => M.game.leave(bot.pid), 'leave'); M.seats.splice(M.seats.indexOf(bot), 1);
          }
          const st = { pid: pidOf(c), name: c.name, c, th: c.th || null }; M.seats.push(st); track(c, M.id, true);
          if (M.game.join) safe(M, () => M.game.join({ id: st.pid, name: st.name, bot: false }), 'join');
        } else {
          if (M.seats.length >= max) {
            const bot = M.seats.find(s => s.bot); if (!bot) return err(c, 'partita piena', M.id, m.rid), true;
            M.seats.splice(M.seats.indexOf(bot), 1);
          }
          M.seats.push({ pid: pidOf(c), name: c.name, c, th: c.th || null }); track(c, M.id, true);
        }
        M.touched = Date.now();
        send(c, { t: 'match:joined', rid: m.rid, id: M.id, me: pidOf(c), lobby: M.state === 'lobby', host: M.host === c, meta: { type: meta.type, name: meta.name, minPlayers: meta.minPlayers, maxPlayers: meta.maxPlayers, tickHz: meta.tickHz, dropIn: !!meta.dropIn } });
        players(M); flush(M);
        return true;
      }
      case 'match:start': {
        const M = matches.get(String(m.id || ''));
        if (!M || M.host !== c) return err(c, 'solo chi ha creato la partita può iniziarla', m.id), true;
        if (M.state === 'lobby') startGame(M);
        return true;
      }
      case 'match:act': {
        const M = matches.get(String(m.id || ''));
        if (!M || M.state !== 'play') return err(c, M ? 'partita non in corso' : 'partita non trovata', m.id, m.rid), true;
        const st = seatOf(M, c); if (!st) return err(c, 'non sei in questa partita', M.id, m.rid), true;
        if (!rate(c)) return true;
        const a = m.a; if (a === undefined || JSON.stringify(a).length > MAX_ACT) return err(c, 'mossa non valida', M.id, m.rid), true;
        M.touched = Date.now();
        const r = safe(M, () => M.game.act(st.pid, a), 'act');
        if (!matches.has(M.id)) return true;
        if (r && r.ok === false) err(c, String(r.error || 'mossa non valida').slice(0, 120), M.id, m.rid);
        if (!M.hz || (r && r.ok !== false)) flush(M); // ticking games flush on the next tick anyway
        return true;
      }
      case 'match:leave': {
        const M = matches.get(String(m.id || '')); if (!M) return true;
        leaveMatch(M, c); return true;
      }
      case 'match:list': {
        const type = m.type ? String(m.type) : null, list = [];
        for (const M of matches.values()) {
          if (type && M.type !== type) continue;
          if (!visibleTo(M, c)) continue;
          list.push({ id: M.id, type: M.type, name: M.mod.meta.name || M.type, players: M.seats.filter(s => !s.bot).map(s => s.name), bots: M.seats.filter(s => s.bot).length, max: M.mod.meta.maxPlayers || 8, lobby: M.state === 'lobby', dropIn: !!M.mod.meta.dropIn, mine: !!seatOf(M, c), room: !!M.room, public: M.pub });
          if (list.length >= 50) break;
        }
        send(c, { t: 'match:list', rid: m.rid, list });
        return true;
      }
    }
    return false;
  }

  function leaveMatch(M, c) {
    const st = seatOf(M, c); if (!st) return;
    track(c, M.id, false);
    if (M.state === 'lobby') M.seats.splice(M.seats.indexOf(st), 1);
    else {
      st.c = null; st.last = undefined;
      if (M.state === 'play' && M.game && M.game.leave) { safe(M, () => M.game.leave(st.pid), 'leave'); if (M.mod.meta.dropIn) M.seats.splice(M.seats.indexOf(st), 1); }
    }
    if (M.host === c) { const h = humans(M)[0]; M.host = h ? h.c : null; }
    if (matches.has(M.id)) { players(M); flush(M); }
  }

  function onClose(c) { const ids = byClient.get(c); if (!ids) return; for (const id of [...ids]) { const M = matches.get(id); if (M) leaveMatch(M, c); } byClient.delete(c); }

  // one scheduler for every ticking match
  const timer = setInterval(() => {
    const now = Date.now(); let n = 0;
    for (const M of matches.values()) {
      if (M.state !== 'play' || !M.hz || !M.game) continue;
      n++;
      if (now - M.next > 250) M.next = now; // fell behind: skip instead of a burst of catch-up ticks
      const step = 1000 / M.hz; let ticked = false;
      while (now >= M.next) { const dt = 1 / M.hz; if (safe(M, () => (M.game.tick && M.game.tick(dt), true), 'tick') === undefined) break; M.next += step; ticked = true; if (!matches.has(M.id) || M.state !== 'play') break; }
      if (ticked && matches.has(M.id)) flush(M);
    }
    ticking = n;
  }, BASE_MS);
  timer.unref && timer.unref();

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const M of [...matches.values()]) {
      const live = humans(M).length;
      if (M.state === 'over' && now - M.overAt > OVER_KEEP_MS) remove(M);
      else if (!live && now - M.touched > IDLE_MS) { if (M.state === 'play') end(M, null, 'partita chiusa: nessun giocatore'); remove(M); }
      else if (M.state === 'lobby' && now - M.created > LOBBY_MAX_MS) { toAll(M, { t: 'match:error', id: M.id, error: 'lobby scaduta' }); remove(M); }
      if (live) M.touched = now;
    }
  }, 5000);
  sweep.unref && sweep.unref();

  return {
    onMessage, onClose,
    async types() { await extra; return Object.keys(registry()); },
    typesNow: () => Object.keys(registry()),
    shared(a, b) { const A = byClient.get(a), B = byClient.get(b); if (!A || !B) return false; for (const id of A) if (B.has(id)) return true; return false; },
    stats: () => ({ matches: matches.size, ticking, errors }),
    close() { clearInterval(timer); clearInterval(sweep); },
  };
}
