// Online multiplayer: rooms with a 4-letter code, other players as avatars, host-run cabinet co-op.
// Transports: WebSocket to our Node server (/ws, see server/server.mjs — Docker) or, on the claude.ai
// published link, the artifact "room" capability (presence only: avatars, gestures, chat).
// Public API (also on window.__net): create(name), join(code, name), leave(), chat(text), setName(name),
// on(evt, fn) with evt: 'status' | 'players' | 'chat' | 'error' | 'seats'; fields status, code, id, role, players, transport.
import * as THREE from 'three';
import { Avatar, makeTemplate, palmIndex, TAG_COLORS } from './avatars.js';

const STATE_HZ = 15, GAME_HZ = 20, INPUT_HZ = 30;
const KEYS = ['up', 'down', 'left', 'right', 'fire', 'bomb', 'start', 'pause'];
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;
const packIn = i => KEYS.reduce((m, k, b) => m | ((i[k] ? 1 : 0) << b), 0);
const unpackIn = (m, o) => { KEYS.forEach((k, b) => { o[k] = (m >> b) & 1; }); return o; };

// ------------------------------------------------------------- transports
class WSTransport {
  constructor(url, onMsg, onClose) { this.url = url; this.onMsg = onMsg; this.onClose = onClose; this.ws = null; this.kind = 'ws'; }
  open() {
    return new Promise((res, rej) => {
      let done = false;
      const ws = new WebSocket(this.url); this.ws = ws;
      const to = setTimeout(() => { if (!done) { done = true; try { ws.close(); } catch { } rej(new Error('timeout')); } }, 6000);
      ws.onopen = () => { if (done) return; done = true; clearTimeout(to); res(); };
      ws.onerror = () => { if (!done) { done = true; clearTimeout(to); rej(new Error('connessione rifiutata')); } };
      ws.onclose = () => { if (done) this.onClose && this.onClose(); };
      ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } this.onMsg(m); };
    });
  }
  send(m) { if (this.ws && this.ws.readyState === 1) { this.ws.send(JSON.stringify(m)); return true; } return false; }
  get buffered() { return this.ws ? this.ws.bufferedAmount : 0; }
  close() { this.onClose = null; try { this.ws && this.ws.close(); } catch { } }
}

// claude.ai artifact "room" capability: presence carries everything (no host game sync)
class RoomTransport {
  constructor(onMsg, onClose) { this.onMsg = onMsg; this.onClose = onClose; this.kind = 'room'; this.r = null; this.unsub = []; this.ids = new Map(); this.nid = 1000; this.me = null; this.code = null; this.name = ''; }
  static async available() { try { if (!window.claude || typeof window.claude.use !== 'function') return null; const r = await window.claude.use('room'); return r || null; } catch { return null; } }
  async open(code, name) {
    const lobby = await RoomTransport.available(); if (!lobby) throw new Error('stanze non disponibili qui');
    this.code = code; this.name = name;
    this.r = await lobby.join('bigalesso-' + code.toLowerCase());
    this.me = 1; // local id
    this.unsub.push(this.r.onPeers(ch => this.peers(ch), () => this.onClose && this.onClose()));
    await this.r.presence({ n: name, c: 1 });
    // synthesize the server's welcome
    this.onMsg({ t: 'welcome', id: this.me, code, host: this.me, players: [{ id: this.me, name, color: 1 }], states: {} });
  }
  idOf(peer) { if (!this.ids.has(peer)) this.ids.set(peer, this.nid++); return this.ids.get(peer); }
  peers(ch) {
    for (const p of ch.joined) if (!p.sameTab) { const id = this.idOf(p.peer); this.onMsg({ t: 'joined', p: { id, name: String((p.presence && p.presence.n) || 'Ospite').slice(0, 16), color: ((id - 1000) % 7) + 1 } }); }
    for (const p of ch.left) if (!p.sameTab) this.onMsg({ t: 'left', id: this.idOf(p.peer) });
    const s = {}; let any = false;
    for (const p of [...ch.joined, ...ch.updated]) if (!p.sameTab && p.presence && p.presence.x !== undefined) { s[this.idOf(p.peer)] = p.presence; any = true; }
    if (any) this.onMsg({ t: 'states', s });
  }
  send(m) {
    if (!this.r) return false;
    if (m.t === 'state') { this.r.presence(m.s).catch(() => { }); return true; }
    if (m.t === 'chat') { this._cs = (this._cs || 0) + 1; this.r.presence({ ch: [String(m.text).slice(0, 200), this._cs] }).catch(() => { }); this.onMsg({ t: 'chat', id: this.me, name: this.name, text: m.text }); return true; }
    return false; // ev / to / game not available here
  }
  get buffered() { return 0; }
  close() { this.onClose = null; for (const u of this.unsub) try { u(); } catch { } if (this.r) this.r.leave().catch(() => { }); this.r = null; }
}

// ------------------------------------------------------------- main
export function installNet(ctx) {
  const { scene, gltf, anims, Man, man, dog, cab, game, world, S, CONFIG, audio } = ctx;
  const q = new URLSearchParams(location.search);
  const ui = ctx.ui || {};
  const toast = (msg, kind) => { if (typeof ui.toast === 'function') ui.toast(msg, kind === 'gold' ? 'online' : kind); else if (world && world.toast) world.toast(msg, kind); };
  const tpl = makeTemplate(gltf.scene);
  const listeners = {};
  const fire = (e, d) => { for (const f of listeners[e] || []) try { f(d); } catch (err) { console.error(err); } };
  let storedName = ''; try { storedName = localStorage.getItem('bigalesso_name') || ''; } catch { }
  const net = {
    status: 'offline', code: null, id: null, host: null, transport: null, players: new Map(), seats: { p1: null, p2: null },
    name: storedName || ('Giocatore ' + (10 + Math.floor(Math.random() * 89))), myColor: 0,
    get role() { return this.status !== 'online' ? 'solo' : (this.host === this.id ? 'host' : 'guest'); },
    get online() { return this.status === 'online'; },
    remoteGame: false, ping: 0,
    on(e, f) { (listeners[e] ||= []).push(f); return () => { listeners[e] = listeners[e].filter(x => x !== f); }; },
  };
  window.__net = net;
  net._p2 = () => localP2;
  net._dbg = () => ({ snapAge: hostSnap ? Math.round(performance.now() - hostSnapAt) : null, snapState: hostSnap && hostSnap.st, remoteIn: [...remoteIn.keys()], ping: net.ping, p2: localP2 ? [r2(localP2.root.position.x), r2(localP2.root.position.z), !!localP2.script, !!localP2.leaving] : null });

  let tr = null, lastState = 0, lastGame = 0, lastIn = 0, lastInBits = -1, gseq = 0, lastGesture = null, seenG = new WeakSet(), lastUpper = null, lastChat = null;
  let hostSnap = null, hostSnapAt = 0, appliedSnap = null;
  const remoteIn = new Map(); // id -> {bits, at}
  const evq = [];
  const origEmit = game.emit;
  game.emit = (ev, d) => { origEmit(ev, d); if (net.role === 'host' && net.players.size > 1 && evq.length < 60) evq.push(d === undefined ? [ev] : [ev, d]); onLocalGameEvent(ev, d); };

  const wsURL = () => {
    if (q.get('server')) return q.get('server');
    if (window.__NET_URL) return window.__NET_URL;
    if (!/^https?:$/.test(location.protocol)) return null;
    return location.origin.replace(/^http/, 'ws') + '/ws';
  };

  // ---------------- connection ----------------
  function setStatus(s, extra) { net.status = s; fire('status', { status: s, code: net.code, role: net.role, ...extra }); updatePanel(); hudOnline(); }
  function onMsg(m) {
    switch (m.t) {
      case 'hi': break;
      case 'welcome':
        net.id = m.id; net.code = m.code; net.host = m.host; clearPlayers();
        for (const p of m.players) addPlayer(p);
        for (const id in (m.states || {})) onState(+id, m.states[id]);
        try { history.replaceState(null, '', location.pathname + '?room=' + m.code + location.hash); } catch { }
        setStatus('online');
        toast(net.role === 'host' ? 'Stanza ' + m.code + ' creata: invita gli amici col codice!' : 'Sei nella stanza ' + m.code, 'gold');
        sendState(true); break;
      case 'joined': addPlayer(m.p); toast(m.p.name + ' è entrato'); audio && audio.sfx && audio.sfx('join2'); break;
      case 'left': { const p = net.players.get(m.id); if (p) { toast(p.name + ' è uscito'); removePlayer(m.id); } break; }
      case 'host': net.host = m.id; if (net.role === 'host') toast('Ora sei tu l\'host della stanza'); fire('players', list()); updatePanel(); break;
      case 'states': { const now = performance.now(); for (const id in m.s) onState(+id, m.s[id], now); break; }
      case 'ev': onEvent(m.from, m.e); break;
      case 'msg': onDirect(m.from, m.d); break;
      case 'game': if (net.role === 'guest') { hostSnap = m.d; hostSnapAt = performance.now(); } break;
      case 'chat': onChat(m.id, m.name, m.text); break;
      case 'pong': net.ping = Math.round(performance.now() - m.ts); updatePanel(); break;
      case 'err': toast(m.msg || 'Errore', 'warn'); fire('error', m); if (net.status === 'connecting') setStatus('offline'); break;
    }
  }
  function onClose() { if (net.status !== 'offline') { toast('Connessione persa', 'warn'); cleanup(); } }
  async function connect() {
    const url = wsURL();
    if (url) {
      const t = new WSTransport(url, onMsg, onClose);
      try { await t.open(); return t; } catch (e) { /* fall through */ }
    }
    return null;
  }
  net.create = async (name) => {
    if (net.status !== 'offline') net.leave();
    net.setName(name); setStatus('connecting');
    tr = await connect();
    if (tr) { tr.send({ t: 'hello', name: net.name, v: 1 }); tr.send({ t: 'create', name: net.name }); net.transport = 'ws'; return true; }
    // artifact fallback: make a code and join it through the room capability
    const code = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[(Math.random() * 24) | 0]).join('');
    return joinRoomCap(code);
  };
  net.join = async (code, name) => {
    code = String(code || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    if (code.length !== 4) { toast('Il codice ha 4 lettere', 'warn'); return false; }
    if (net.status !== 'offline') net.leave();
    net.setName(name); setStatus('connecting');
    tr = await connect();
    if (tr) { tr.send({ t: 'hello', name: net.name, v: 1 }); tr.send({ t: 'join', code, name: net.name }); net.transport = 'ws'; return true; }
    return joinRoomCap(code);
  };
  async function joinRoomCap(code) {
    const t = new RoomTransport(onMsg, onClose);
    try { tr = t; net.transport = 'room'; await t.open(code, net.name); return true; }
    catch (e) { tr = null; net.transport = null; setStatus('offline'); toast('Online non disponibile qui: avvia il server (docker compose up) e apri il gioco da lì', 'warn'); fire('error', { msg: String(e.message || e) }); return false; }
  }
  net.leave = () => { if (tr) { tr.send({ t: 'leave' }); tr.close(); } cleanup(); };
  function cleanup() { tr = null; net.transport = null; clearPlayers(); net.code = null; net.host = null; net.seats = { p1: null, p2: null }; hostSnap = null; net.remoteGame = false; setStatus('offline'); try { history.replaceState(null, '', location.pathname + location.hash); } catch { } }
  net.setName = n => { n = String(n || '').trim().slice(0, 16); if (n) { net.name = n; try { localStorage.setItem('bigalesso_name', n); } catch { } } };
  net.chat = text => { text = String(text || '').trim().slice(0, 200); if (!text || !tr) return; tr.send({ t: 'chat', text }); };
  net.inviteLink = () => net.code ? location.origin + location.pathname + '?room=' + net.code : null;
  const ev = e => { if (tr && net.online) tr.send({ t: 'ev', e }); };
  net.emit = e => ev(e); // broadcast a small event to the room (combat/ shots); received as net.on('ev', {from, e})

  // ---------------- players / avatars ----------------
  const list = () => [...net.players.values()].map(p => ({ id: p.id, name: p.name, color: p.color, host: p.id === net.host, you: p.id === net.id }));
  function addPlayer(p) {
    if (net.players.has(p.id)) return;
    const P = { id: p.id, name: p.name, color: p.color, avatar: null };
    net.players.set(p.id, P);
    if (p.id === net.id) net.myColor = p.color;
    else {
      P.avatar = new Avatar({ tpl, Man, anims, scene, name: p.name, color: p.color || 1 });
      P.avatar.place(CONFIG.man.path[0][0], CONFIG.man.path[0][2], -Math.PI / 2);
      P.avatar.netId = p.id;
    }
    fire('players', list()); updatePanel();
  }
  function removePlayer(id) {
    const P = net.players.get(id); if (!P) return;
    if (P.avatar) P.avatar.dispose();
    net.players.delete(id); remoteIn.delete(id);
    if (net.seats.p1 === id) net.seats.p1 = null; if (net.seats.p2 === id) net.seats.p2 = null;
    fire('players', list()); updatePanel();
  }
  function clearPlayers() { for (const id of [...net.players.keys()]) removePlayer(id); }
  function onState(id, s, now = performance.now()) {
    if (id === net.id || !s) return;
    let P = net.players.get(id);
    if (!P) { addPlayer({ id, name: s.n || 'Ospite', color: (s.c | 0) || 2 }); P = net.players.get(id); }
    if (!P.avatar) return;
    if (s.n && s.n !== P.name) { P.name = s.n; fire('players', list()); updatePanel(); }
    if (!P.avatar.buf.length) P.avatar.place(s.x, s.z, s.yw);
    P.avatar.push(now, s);
    P.seated = s.md === 'cabinet';
    if (s.ch) {
      if (P.lastCh === undefined) P.lastCh = s.ch[1];
      else if (s.ch[1] !== P.lastCh) { P.lastCh = s.ch[1]; if (net.transport === 'room') onChat(id, P.name, String(s.ch[0])); }
    }
  }
  function onChat(id, name, text) {
    const P = net.players.get(id);
    if (P && P.avatar) P.avatar.say(text);
    fire('chat', { id, name, text, you: id === net.id, color: P ? P.color : 0 });
    chatLog.push({ name, text, color: P ? P.color : 0 }); if (chatLog.length > 30) chatLog.shift();
    renderChat();
    if (id !== net.id && audio && audio.sfx) audio.sfx('pickup');
  }

  // events: gestures are in presence; ev carries dog + seats + misc
  function onEvent(from, e) {
    if (!e || typeof e !== 'object') return;
    fire('ev', { from, e }); // other modules (combat/: cosmetic shots) listen with net.on('ev')
    if (e.k === 'dog' && typeof e.r === 'string' && dog.react) dog.react(e.r);
    if (e.k === 'dogFollow' && net.role === 'host') { const P = net.players.get(from); if (P && P.avatar && dog.setFollow) { dogFollowOf = e.on ? from : null; dog.setFollow(e.on ? P.avatar.root.position : null); } }
    if (e.k === 'seat' && net.role === 'host') { seatClaim(from, !!e.on); }
    if (e.k === 'seats' && from === net.host) { net.seats = { p1: e.p1 ?? null, p2: e.p2 ?? null }; fire('seats', net.seats); }
    if (e.k === 'dogst' && from === net.host && net.role === 'guest') { dogState = e; dogStateAt = performance.now(); }
  }
  function onDirect(from, d) {
    if (!d) return;
    if (d.k === 'in' && net.role === 'host') remoteIn.set(from, { bits: d.b | 0, at: performance.now() });
  }

  // ---------------- seats (host decides) ----------------
  function seatClaim(id, on) {
    const s = net.seats;
    if (on) {
      if (s.p1 === id || s.p2 === id) return;
      if (id === net.host && s.p1 !== net.host) { if (s.p1 && !s.p2) s.p2 = s.p1; s.p1 = id; }
      else if (!s.p1) s.p1 = id; else if (!s.p2) s.p2 = id;
      else { if (id !== net.id) tr && tr.send({ t: 'to', id, d: { k: 'full' } }); }
    } else { if (s.p1 === id) s.p1 = null; if (s.p2 === id) s.p2 = null; }
    ev({ k: 'seats', p1: s.p1, p2: s.p2 }); fire('seats', s);
  }
  let wasSeated = false;
  function seatWatch() {
    const seated = world.mode === 'cabinet' && !(world.cabIndex > 0); // online co-op: original cabinet only
    if (seated !== wasSeated) {
      wasSeated = seated;
      if (net.online && net.transport === 'ws') { if (net.role === 'host') seatClaim(net.id, seated); else ev({ k: 'seat', on: seated }); }
      if (seated && net.online && net.role === 'guest') toast('Sei al cabinato: premi START per giocare con l\'host (tu sei il ' + (net.seats.p1 === net.id ? '1P' : '2P') + ')', 'gold');
    }
  }

  // ---------------- cabinet seat rigs (world space) ----------------
  const Wp = o => o.getWorldPosition(new THREE.Vector3());
  const capsCenter = names => { const c = V(); for (const n of names) c.add(Wp(cab.buttons[n].cap)); return c.multiplyScalar(1 / names.length); };
  const screenC = V(); cab.bz.getWorldPosition(screenC);
  const cabP = V(...CONFIG.cabinetPos);
  const SEATS = {
    1: { pos: V(...CONFIG.man.play), yaw: CONFIG.man.yaw, look: screenC, left: () => Wp(cab.stick1.ball).add(V(...CONFIG.man.leftOff)), right: () => capsCenter(['p1a', 'p1b', 'p1c', 'p1d', 'p1e', 'p1f']).add(V(...CONFIG.man.rightOff)) },
    2: { pos: V(cabP.x + 0.25, 0, cabP.z + 1.06), yaw: Math.PI + 0.12, look: screenC, left: () => Wp(cab.stick2.ball).add(V(...CONFIG.man.leftOff)), right: () => capsCenter(['p2a', 'p2b', 'p2c', 'p2d', 'p2e', 'p2f']).add(V(...CONFIG.man.rightOff)) },
  };
  function seatFor(av) {
    if (av === localP2) return { ...SEATS[2], press: () => game.input2.fire || game.input2.bomb };
    const P = av.netId && net.players.get(av.netId); if (!P || !P.seated) return null;
    const localSeated = world.mode === 'cabinet' && !(world.cabIndex > 0);
    if (localSeated) return SEATS[2];
    if (net.seats.p1 === P.id) return SEATS[1];
    if (net.seats.p2 === P.id) return SEATS[2];
    // no assignment known (artifact): first seated remote takes P1
    for (const Q of net.players.values()) if (Q.seated && Q.avatar) return Q === P ? SEATS[1] : SEATS[2];
    return SEATS[2];
  }

  // ---------------- local 2nd player (same keyboard) ----------------
  let localP2 = null;
  function onLocalGameEvent(ev, d) {
    if (ev === 'join2' && !net.remoteGame && !(net.role === 'host' && net.seats.p2 && net.seats.p2 !== net.id)) spawnLocalP2();
  }
  function spawnLocalP2() {
    if (localP2 || net.role === 'guest') return;
    localP2 = new Avatar({ tpl, Man, anims, scene, name: 'Giocatore 2', color: 7 });
    const path = CONFIG.man.path.map(p => V(p[0], 0, p[2])), p0 = path[0];
    localP2.place(p0.x, p0.z, Math.atan2(path[1].x - p0.x, path[1].z - p0.z));
    const S2 = SEATS[2].pos;
    localP2.walkTo([...path.slice(1, -2), V(S2.x + 0.12, 0, S2.z + 0.42), S2.clone()], { speed: 1.4, yaw: SEATS[2].yaw });
    localP2.local = true;
  }
  function dropLocalP2() {
    if (!localP2 || localP2.leaving) return;
    localP2.leaving = true; localP2.yawGoal = undefined;
    const back = CONFIG.man.path.map(p => V(p[0], 0, p[2])).reverse().slice(2);
    localP2.walkTo([V(SEATS[2].pos.x + 0.12, 0, SEATS[2].pos.z + 0.42), ...back], { speed: 1.4, then: av => { av.dispose(); if (localP2 === av) localP2 = null; } });
  }

  // ---------------- dog (host authoritative) ----------------
  let dogState = null, dogStateAt = 0, dogFollowOf = null, lastDog = 0, wasFollow = false, lastPetT = 0;
  function dogSync(now) {
    if (!net.online || net.transport !== 'ws') return;
    if (net.role === 'host') {
      if (now - lastDog > 150 && net.players.size > 1) { lastDog = now; const r = dog.root; ev({ k: 'dogst', x: r2(r.position.x), z: r2(r.position.z), y: r2(r.position.y), yw: r3(r.rotation.y) }); }
      if (dogFollowOf && !net.players.has(dogFollowOf)) { dogFollowOf = null; dog.setFollow && dog.setFollow(null); }
    } else if (dogState && now - dogStateAt < 2000) {
      const r = dog.root, k = 0.25;
      r.position.x += (dogState.x - r.position.x) * k; r.position.z += (dogState.z - r.position.z) * k;
      let d = dogState.yw - r.rotation.y; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; r.rotation.y += d * k;
    }
    // forward my whistle / petting to everyone
    const follow = !!world.dogFollow;
    if (follow !== wasFollow) { wasFollow = follow; if (net.role === 'guest') ev({ k: 'dogFollow', on: follow }); }
    if (world.mode === 'pet' && now - lastPetT > 2400) { lastPetT = now; ev({ k: 'dog', r: 'pet' }); }
  }

  // ---------------- per-frame: game hook (call BEFORE game.update) ----------------
  // returns true when the game must NOT be simulated locally (guest showing the host's game)
  net.gameHook = dt => {
    const now = performance.now();
    if (!net.online || net.transport !== 'ws') { net.remoteGame = false; return false; }
    if (net.role === 'host') {
      // remote players' inputs -> P1/P2
      const s = net.seats;
      for (const [id, inp] of remoteIn) {
        if (now - inp.at > 1500) { remoteIn.delete(id); continue; }
        if (id === s.p1 && s.p1 !== net.id) unpackIn(inp.bits, game.input);
        else if (id === s.p2) unpackIn(inp.bits, game.input2);
      }
      net.remoteGame = false; return false;
    }
    // guest: forward my inputs if seated, never start a local game
    const seated = world.mode === 'cabinet' && !(world.cabIndex > 0); // online co-op: original cabinet only
    const bits = seated ? (packIn(game.input) | packIn(game.input2)) : 0;
    if ((bits !== lastInBits || now - lastIn > 100) && net.host) { lastIn = now; lastInBits = bits; tr.send({ t: 'to', id: net.host, d: { k: 'in', b: bits } }); }
    for (const k of KEYS) { game.input[k] = 0; game.input2[k] = 0; }
    const fresh = hostSnap && now - hostSnapAt < 3000;
    if (fresh && hostSnap !== appliedSnap) {
      appliedSnap = hostSnap;
      if (hostSnap.st !== 'attract' || game.state !== 'attract') game.applySnapshot(hostSnap);
      for (const e of (hostSnap.ev || [])) origEmit(e[0], e[1]);
    }
    net.remoteGame = !!(fresh && hostSnap.st !== 'attract');
    if (net.remoteGame) { game.stepRemote(dt); return true; }
    return false;
  };

  // ---------------- per-frame: everything else (call after man.update) ----------------
  function localState() {
    const r = man.root, s = { x: r2(r.position.x), y: r2(r.position.y), z: r2(r.position.z), yw: r3(r.rotation.y), sp: r2(man.speed || 0), cr: r2(man.crouch || 0), md: (world.mode === 'cabinet' && world.cabIndex > 0) ? 'cabinet' + world.cabIndex : (world.mode || 'explore'), n: net.name, c: net.myColor || 1 };
    if (man.look > 0.02) { s.lw = r2(man.look); s.lk = [r2(man.lookTarget.x), r2(man.lookTarget.y), r2(man.lookTarget.z)]; }
    const rr = x => x && x.pos && (x.w || 0) > 0.02 ? [r2(x.pos.x), r2(x.pos.y), r2(x.pos.z), r2(x.w), palmIndex(x.palm), r2(x.grip || 0)] : 0;
    if (man.reach) { const a = rr(man.reach.left), b = rr(man.reach.right); if (a) s.rl = a; if (b) s.rr = b; }
    if (man.full && man.full.Dance && !man.full.Dance.stopping) s.dn = 1;
    if (S.press > 0.5) s.pr = 1;
    // gestures: new entries in man.active / man.upper
    for (const g of (man.active || [])) if (!seenG.has(g)) { seenG.add(g); if (g.name !== 'typeTap') { gseq++; lastGesture = [g.name, gseq, 0]; } }
    if (man.upper && man.upper.action !== lastUpper) { lastUpper = man.upper.action; gseq++; lastGesture = [lastUpper.getClip().name, gseq, 1]; }
    else if (!man.upper) lastUpper = null;
    if (lastGesture) s.g = lastGesture;
    if (lastChat) s.ch = lastChat;
    return s;
  }
  function sendState(force) {
    if (!tr || !net.online) return;
    const now = performance.now();
    if (!force && now - lastState < 1000 / (net.transport === 'room' ? 10 : STATE_HZ)) return;
    lastState = now; tr.send({ t: 'state', s: localState() });
  }
  let pingT = 0;
  net.update = dt => {
    const now = performance.now();
    seatWatch();
    sendState(false);
    // host: game snapshots
    if (net.online && net.transport === 'ws' && net.role === 'host' && net.players.size > 1) {
      const hz = game.state === 'attract' ? 2 : GAME_HZ;
      if (now - lastGame > 1000 / hz && tr.buffered < 256 * 1024) {
        lastGame = now;
        const snap = game.serialize(); if (evq.length) { snap.ev = evq.splice(0); }
        tr.send({ t: 'game', d: snap });
      }
    }
    // remote stick/buttons for the P2 seat on the host's cabinet
    if (net.role === 'host' && net.seats.p2 && net.seats.p2 !== net.id) {
      const i2 = game.input2, piv = cab.stick2.piv;
      piv.rotation.z = -(i2.right - i2.left) * 0.3; piv.rotation.x = (i2.down - i2.up) * 0.3;
    }
    dogSync(now);
    // avatars (+ other players as obstacles for my man, except those seated at the cabinet)
    const circ = [];
    for (const P of net.players.values()) if (P.avatar) { P.avatar.update(dt, now, seatFor); if (!P.seated) circ.push({ id: 'pl' + P.id, c: P.avatar.root.position, r: 0.2 }); }
    if (localP2 && !localP2.script) circ.push({ id: 'p2', c: localP2.root.position, r: 0.2 });
    world.extraCircles = circ;
    if (localP2) {
      localP2.update(dt, now, av => (av.script ? null : seatFor(av)));
      if ((game.state === 'attract' || game.players.length < 2) && !localP2.leaving && !localP2.script) dropLocalP2();
    }
    if (net.online && net.transport === 'ws' && now - pingT > 4000) { pingT = now; tr.send({ t: 'ping', ts: now }); }
  };

  // ---------------- UI: use ui.js lobby when present, else a small built-in panel ----------------
  function hudOnline() {
    S.online = net.online;
    const h = ui.hud; if (!h || typeof h.setOnline !== 'function') return;
    h.setOnline(net.status === 'offline' ? null : { status: net.online ? 'connected' : net.status, room: net.code, players: net.players.size });
  }
  const L = ui.lobby && typeof ui.lobby === 'object' && typeof ui.lobby.onCreate === 'function' ? ui.lobby : null;
  const chatLog = [];
  let panel = null;
  if (L) {
    L.onCreate(name => net.create(name));
    L.onJoin((code, name) => net.join(code, name));
    if (typeof L.onLeave === 'function') L.onLeave(() => net.leave());
    const cssList = () => list().map(p => ({ ...p, color: TAG_COLORS[p.color % 8] }));
    net.on('players', () => { L.setPlayers && L.setPlayers(cssList()); hudOnline(); });
    net.on('status', st => {
      if (st.status === 'connecting') L.setStatus && L.setStatus('Connessione…');
      L.setRoom && L.setRoom(net.online ? net.code : null);
      if (net.online && L.setStatus) L.setStatus('Stanza ' + net.code + (net.role === 'host' ? ' · sei l\'host' : ' · ospite') + ' · passa il codice agli amici');
      L.setPlayers && L.setPlayers(net.online ? cssList() : []);
    });
    net.on('error', e => L.setStatus && L.setStatus(e.msg || 'Errore di rete'));
    if (ui.chat && typeof ui.chat.onSend === 'function') { ui.chat.onSend(t => net.chat(t)); net.on('chat', c => ui.chat.add && ui.chat.add(c.name, c.text)); }
  } else panel = buildPanel();
  function renderChat() { if (!panel) return; panel.log.innerHTML = chatLog.slice(-8).map(c => `<div><b style="color:${TAG_COLORS[c.color % 8]}">${esc(c.name)}</b> ${esc(c.text)}</div>`).join(''); panel.log.scrollTop = 1e9; }
  function updatePanel() {
    if (!panel) return;
    const on = net.online, P = panel;
    P.root.dataset.st = net.status;
    P.btn.textContent = on ? 'Online · ' + net.code + ' · ' + net.players.size : 'Online';
    P.offline.hidden = on; P.onlineBox.hidden = !on;
    P.status.textContent = net.status === 'connecting' ? 'Connessione…' : on ? `Stanza ${net.code} · ${net.role === 'host' ? 'sei l\'host' : 'ospite'}${net.transport === 'room' ? ' · link claude.ai' : ''}${net.ping ? ' · ' + net.ping + ' ms' : ''}` : 'Gioca con gli amici: crea una stanza o entra con un codice.';
    P.list.innerHTML = list().map(p => `<li><i style="background:${TAG_COLORS[p.color % 8]}"></i>${esc(p.name)}${p.you ? ' <em>(tu)</em>' : ''}${p.host ? ' <em>host</em>' : ''}</li>`).join('');
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function buildPanel() {
    const st = document.createElement('style');
    st.textContent = `
#netBtn{position:fixed;left:max(12px,env(safe-area-inset-left));bottom:max(60px,calc(env(safe-area-inset-bottom) + 60px));z-index:30;min-height:44px;padding:0 16px;border-radius:12px;border:2px solid #c8f03c;background:rgba(18,10,30,.88);color:#c8f03c;font:700 15px system-ui,sans-serif;cursor:pointer}
#netBtn:focus-visible,#netPanel button:focus-visible,#netPanel input:focus-visible{outline:3px solid #ffd83a;outline-offset:2px}
#netPanel{position:fixed;left:max(12px,env(safe-area-inset-left));bottom:max(112px,calc(env(safe-area-inset-bottom) + 112px));z-index:31;width:min(340px,calc(100vw - 24px));max-height:min(70vh,560px);overflow:auto;padding:16px;border-radius:16px;background:rgba(18,10,30,.95);border:2px solid #7a2fc0;color:#efe8ff;font:15px/1.45 system-ui,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.5)}
#netPanel[hidden]{display:none}#netPanel h3{margin:0 0 6px;font-size:18px;color:#c8f03c}#netPanel p{margin:0 0 10px;color:#cbbfe6;font-size:14px}
#netPanel label{display:block;font-size:13px;color:#cbbfe6;margin:8px 0 4px}#netPanel input{width:100%;box-sizing:border-box;min-height:44px;padding:0 12px;border-radius:10px;border:1px solid #5a3a86;background:#0f0818;color:#fff;font:16px system-ui,sans-serif}
#netPanel .row{display:flex;gap:8px;margin-top:8px}#netPanel .row>*{flex:1}
#netPanel button{min-height:44px;border-radius:10px;border:0;background:#c8f03c;color:#14081f;font:700 15px system-ui,sans-serif;cursor:pointer;padding:0 12px}
#netPanel button.alt{background:#2b1846;color:#efe8ff;border:1px solid #5a3a86}#netPanel button.warn{background:#ff5a6a;color:#fff}
#netPanel ul{list-style:none;margin:8px 0;padding:0}#netPanel li{display:flex;align-items:center;gap:8px;padding:4px 0}#netPanel li i{width:10px;height:10px;border-radius:50%;display:inline-block}#netPanel em{color:#ffd83a;font-style:normal;font-size:12px}
#netPanel .log{max-height:140px;overflow:auto;background:#0f0818;border-radius:10px;padding:8px;font-size:14px;margin-top:8px}#netPanel .log:empty{display:none}`;
    document.head.appendChild(st);
    const btn = document.createElement('button'); btn.id = 'netBtn'; btn.type = 'button'; btn.textContent = 'Online'; btn.setAttribute('aria-expanded', 'false');
    const root = document.createElement('div'); root.id = 'netPanel'; root.hidden = true; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Multiplayer online');
    root.innerHTML = `<h3>Multiplayer online</h3><p class="st"></p>
      <div class="off"><label for="netName">Il tuo nome</label><input id="netName" maxlength="16" autocomplete="nickname">
        <div class="row"><button type="button" class="create">Crea stanza</button></div>
        <label for="netCode">Codice stanza</label><div class="row"><input id="netCode" maxlength="4" placeholder="ABCD" autocapitalize="characters" style="text-transform:uppercase"><button type="button" class="join alt">Entra</button></div></div>
      <div class="on" hidden><ul></ul><div class="row"><button type="button" class="copy alt">Copia invito</button><button type="button" class="leave warn">Esci</button></div>
        <div class="log" aria-live="polite"></div><div class="row"><input class="msg" maxlength="200" placeholder="Scrivi in chat…" aria-label="Messaggio"><button type="button" class="send">Invia</button></div></div>`;
    document.body.append(btn, root);
    const $ = s => root.querySelector(s);
    const P = { root, btn, status: $('.st'), offline: $('.off'), onlineBox: $('.on'), list: $('ul'), log: $('.log') };
    const nameI = $('#netName'), codeI = $('#netCode'), msgI = $('.msg');
    nameI.value = net.name;
    for (const i of [nameI, codeI, msgI]) { for (const t of ['keydown', 'keyup']) i.addEventListener(t, e => { e.stopPropagation(); if (t === 'keydown' && e.key === 'Escape') toggle(false); }); }
    const toggle = v => { root.hidden = v === undefined ? !root.hidden : !v; btn.setAttribute('aria-expanded', String(!root.hidden)); if (!root.hidden) (net.online ? msgI : nameI).focus(); };
    btn.addEventListener('click', () => { toggle(); btn.blur(); });
    $('.create').addEventListener('click', () => net.create(nameI.value));
    $('.join').addEventListener('click', () => net.join(codeI.value, nameI.value));
    codeI.addEventListener('keydown', e => { if (e.key === 'Enter') net.join(codeI.value, nameI.value); });
    $('.leave').addEventListener('click', () => net.leave());
    $('.copy').addEventListener('click', async () => { const l = net.inviteLink(); try { await navigator.clipboard.writeText(l); toast('Invito copiato: ' + l); } catch { toast('Codice stanza: ' + net.code); } });
    const send = () => { const t = msgI.value.trim(); if (!t) return; net.chat(t); msgI.value = ''; };
    $('.send').addEventListener('click', send); msgI.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
    // T opens chat when online
    addEventListener('keydown', e => { if (e.code === 'KeyT' && net.online && root.hidden && document.activeElement === document.body && world.mode !== 'type') { e.preventDefault(); toggle(true); } });
    return P;
  }
  updatePanel();

  // invite link: ?room=ABCD
  const inv = (q.get('room') || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (inv.length === 4) {
    if (panel) { panel.root.querySelector('#netCode').value = inv; }
    const nm = (ui.settings && ui.settings.playerName) || net.name;
    setTimeout(() => net.join(inv, nm), 600);
  }
  return net;
}
