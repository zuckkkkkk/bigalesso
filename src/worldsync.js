// worldsync.js — one shared world online (private rooms and the public "Quartiere" shards). Solo, no server, or the
// claude.ai link (presence only): nothing here runs and every system works locally exactly as before.
//
// ENEMIES — owner-authoritative, not one host simulating everything: the combat director (combat/enemies.js) spawns
// around ONE player, out of his view, and despawns at 62 m, while in a shard players are spread over the whole map.
// So each client keeps running its own director (a black box: spawn rules, night, caps untouched) and OWNS what it
// spawns. It streams its enemies ~10 Hz to the players nearby ('nev' → ev 'es': cm-quantised arrays, only what changed,
// a full keyframe every second, explicit removals). Everybody else shows them as puppets in the same pools, so they
// count against the local cap: two friends together share one cap, one flock, one boss. Owned enemies chase the nearest
// player (enemies.js C.sync.target) and hurt remote ones with a direct 'hu'. Hits on a puppet go to its owner (direct
// 'eh', batched per frame), who applies them and decides the death; the player who landed the last hit gets the kill
// (XP, drops, achievements: 'ek'), the others who hit it an assist. The boss's multe fly on every client ('mt') and hurt
// whoever they hit. An owner walking away (62 m) hands his enemy to the player closest to it ('eo'); an owner gone or
// silent (> 8 s, background tab) gets his puppets adopted by a nearby player (server claim 'ad<gid>': only one wins).
// Two streams for one enemy (a slow owner coming back, a hand-off crossing a snapshot): the holder of the claim wins,
// else the player it was just handed to, else the lower id; the other turns his copy into a puppet.
//
// WORLD STATE with a single truth lives on the SERVER (server.mjs 'ws': atomic key/value per room, sent in 'welcome'):
//   boss            one Vigile per room ({g, o}; 'mine' → freed when its owner leaves)
//   cr<i>           crate i opened at server time t, respawns after d s (cas: who opened it first)
//   d<id>           a drop: kind, start, velocity, landing spot (same for everyone), item/amount; ttl = its lifetime;
//                   op 'take' = the first who touches it gets it (rpg/worldloot.js netPick)
//   car:<id>        where a friend's 500 was left · vs:<i> where a vespa was left (motor/index.js; who is driving
//                   what comes from the presence extra 'veh')
//   nz:<id>         a night zombata: who runs it, where and when it started (minigames/nightz.js; 'mine')
//   ad<gid>         who adopted an enemy whose owner left (only one does)
// Server clock: net.serverNow() (ping RTT, net.js) for crate respawns, drop lifetimes and the zombata timer.
// Not synced, on purpose (personal or cosmetic): the NPC friends (wander, dialogues, summons and missions are each
// player's own), street life and ambient pigeons, the Banco dei pegni stock and quest items (personal economy), the other
// players' own parked 500 (each sees his own; theirs shows only while driven), splats/decals. The dog stays host-driven
// (net.js 'dogst'), cabinet co-op host-run (net.js), races/cards/BR refereed by the server (shared/*.mjs).
import * as THREE from 'three';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const r2 = v => Math.round(v * 100) / 100;
const TYPES = ['zombie', 'pigeon', 'boss'], TYPE_I = { zombie: 0, pigeon: 1, boss: 2 };
const STATES = ['rise', 'wander', 'chase', 'attack', 'dead', 'circle', 'dive', 'climb', 'idle', 'dawn'], STATE_I = Object.fromEntries(STATES.map((s, i) => [s, i]));
const SNAP_MS = 100, KEY_MS = 1000, STALE_MS = 8000, DROP_R = 90;
const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);
const hash01 = (a, b) => { let h = (a * 374761393 + Math.floor(b) * 668265263) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return (h ^ (h >>> 16)) / 4294967296; };

export function installWorldSync({ man, level, ui } = {}) {
  const net = window.__net, CB = window.__combat, R = window.__rpg;
  if (!net || !CB || !CB._debug || !CB._debug.E) return null;
  const E = CB._debug.E, loot = R && R._loot, fx = CB._debug.fx;
  const toast = (m, k) => { try { ui && ui.toast && ui.toast(m, k); } catch (e) { } };
  const live = () => net.online && net.transport === 'ws' && net.id != null;
  const others = () => net.players.size > 1;
  const P = () => man.root.position;
  const byGid = new Map(); // gid -> enemy (mine and puppets)
  const sent = new Map();  // gid -> last sent entry (string) — "only what changed"
  const removals = [], hitQ = new Map(), credited = new Set(), bossSeen = new Set();
  let snapT = 0, keyT = 0, scanT = 0, dseq = 0, attached = false;
  const dbg = { sent: 0, recv: 0, hitsOut: 0, hitsIn: 0, adopt: 0, handoff: 0, ticks: 0, maxGap: 0 }; let lastTick = 0;
  const cfg = { stale: STALE_MS }; // tests: software GL can freeze a page for 10+ s while it compiles shaders
  const gidOf = e => e.gid || (e.gid = (net.id || 0) * 100000 + (e.id % 100000));
  const track = e => { byGid.set(gidOf(e), e); return e; };

  // ---------------------------------------------------------------- enemies: hooks called by combat/enemies.js
  const meT = { pos: null, id: null, attackable: false }, tgts = new Map();
  const sync = {
    // nearest player for an enemy I simulate; re-chosen every 0.4 s
    target(e, Pm, attackable) {
      meT.pos = Pm; meT.attackable = attackable;
      if (!others()) return null;
      const t = performance.now();
      if (e._tgT > t && e._tgO && (e._tgO === meT || net.players.has(e._tgO.id))) return e._tgO;
      e._tgT = t + 400;
      let best = attackable ? meT : null, bd = attackable ? Math.hypot(Pm.x - e.pos.x, Pm.z - e.pos.z) : 1e9;
      for (const Pl of net.players.values()) {
        if (Pl.id === net.id || !Pl.avatar || Pl.far || Pl.seated) continue;
        const s = Pl.avatar.s, md = s && s.md; if (md && md !== 'explore' && md !== 'goto') continue; // driving, K.O., at a cabinet…
        const p = Pl.avatar.root.position, d = Math.hypot(p.x - e.pos.x, p.z - e.pos.z);
        if (d > 40 || d >= bd * (e._tgO && e._tgO.id === Pl.id ? 1.25 : 0.9) || !E.outdoorAt(p.x, p.z)) continue;
        let T = tgts.get(Pl.id); if (!T) tgts.set(Pl.id, T = { pos: null, id: Pl.id, attackable: true });
        T.pos = p; best = T; bd = d;
      }
      return (e._tgO = best || meT);
    },
    hurt(id, n, e, k) { net.to(id, { k: 'hu', n: r2(n), ty: e.type, x: r2(e.pos.x), z: r2(e.pos.z), kn: r2(k || 0) }); return n; },
    hit(e, amount, o) {
      const owner = e.remote; if (!owner) return;
      let b = hitQ.get(owner); if (!b) hitQ.set(owner, b = []);
      if (b.length < 48) b.push([e.gid, r2(amount), o.head ? 1 : 0, o.crit ? 1 : 0, o.dir ? r2(o.dir.x) : 0, o.dir ? r2(o.dir.z) : 0, r2(o.knock || 0), num(o.slow)]);
      dbg.hitsOut++;
    },
    // my enemy died: credit to whoever landed the last hit, assists to the others who hit it
    died(e, o) {
      if (e.remote) return;
      const g = gidOf(e), killer = o.by && net.players.has(o.by) ? o.by : 0;
      const info = { k: 'ek', g, ty: e.type, lv: e.level, x: r2(e.pos.x), z: r2(e.pos.z), h: o.head ? 1 : 0 };
      for (const [id] of e.hitBy || []) if (id && id !== killer && net.players.has(id)) net.to(id, { ...info, a: 1 });
      if (killer) { net.to(killer, info); o.noCredit = true; if (e.hitBy && e.hitBy.has(0)) CB._credit({ type: e.type, level: e.level, x: e.pos.x, z: e.pos.z }, true); }
    },
    released(e) {
      const g = e.gid; if (g && byGid.get(g) === e) byGid.delete(g);
      if (e.remote || !g) return;
      if (!e.handed && sent.has(g)) removals.push(g);
      sent.delete(g);
      const b = net.ws.boss; if (e.type === 'boss' && !e.handed && b && b.g === g && b.o === net.id) net.wset('boss', null);
    },
    // too far from me: the player closest to it carries on
    handoff(e) {
      if (e.dead || !others()) return false;
      let best = null, bd = 30;
      for (const Pl of net.players.values()) { if (Pl.id === net.id || !Pl.avatar || Pl.far) continue; const p = Pl.avatar.root.position, d = Math.hypot(p.x - e.pos.x, p.z - e.pos.z); if (d < bd) { bd = d; best = Pl; } }
      if (!best) return false;
      e.handed = true; net.to(best.id, { k: 'eo', s: entry(e), ag: e.aggro ? 1 : 0 }); dbg.handoff++;
      return true;
    },
    bossTaken() { const b = net.ws.boss; return !!(b && b.o !== net.id); },
    bossSpawned(b) {
      track(b);
      net.wset('boss', { g: gidOf(b), o: net.id }, { op: 'new', mine: true }).then(r => {
        if (!r.ok && !r.offline && !r.gone && !r.timeout && b.alive && !b.dead && !b.remote) E._int.release(b); // someone else's Vigile is out: mine never was
      });
    },
    multa(from, vel, g, dmg) { if (others()) net.emitNear({ k: 'mt', o: [r2(from.x), r2(from.y), r2(from.z)], v: [r2(vel.x), r2(vel.y), r2(vel.z)], g: r2(g), d: r2(dmg) }); },
  };

  // snapshot entry: [gid, type, level, max, x cm, z cm, y cm, yaw cr, hp, state, rise*10]
  function entry(e) {
    return [gidOf(e), TYPE_I[e.type] | 0, e.level | 0, Math.round(e.max), Math.round(e.pos.x * 100), Math.round(e.pos.z * 100), e.type === 'pigeon' ? Math.round(e.pos.y * 100) : 0,
      Math.round(e.yaw * 100), Math.max(0, Math.round(e.hp)), e.dead ? 4 : (STATE_I[e.state] ?? 2), Math.round((e.rise || 0) * 10)];
  }
  function sendSnap(now) {
    const key = now - keyT >= KEY_MS; if (key) keyT = now;
    const l = [];
    for (const e of E.list) {
      if (e.remote || !e.alive) continue;
      track(e);
      const a = entry(e), s = a.join(',');
      if (key || sent.get(a[0]) !== s) { l.push(a); sent.set(a[0], s); }
    }
    if (!l.length && !removals.length) return;
    const m = { k: 'es', l }; if (removals.length) m.r = removals.splice(0, 64);
    if (l.length > 40) l.length = 40;
    net.emitNear(m); dbg.sent++;
  }
  function onSnap(from, m) {
    if (!Array.isArray(m.l)) return;
    dbg.recv++;
    const me = P(), now = performance.now();
    for (const a of m.l) {
      if (!Array.isArray(a) || a.length < 11) continue;
      const g = num(a[0]); let e = byGid.get(g);
      if (e && !e.alive) { byGid.delete(g); e = null; }
      const st = STATES[a[9]] || 'chase', dead = st === 'dead', x = num(a[4]) / 100, z = num(a[5]) / 100, y = num(a[6]) / 100;
      if (e && !e.remote) { // someone else streams one of mine
        if (e.dead || (e.handFrom === from && now - e.handAt < 4000)) continue; // just handed to me: his last snapshots are old
        const claim = net.ws['ad' + g]; if (claim ? claim !== from : from > net.id) continue; // mine stays mine: he gives way when he gets my snapshot
        e.remote = from; sent.delete(g);
      }
      if (!e) {
        if (dead || Math.hypot(x - me.x, z - me.z) > 60 || !TYPES[a[1]]) continue;
        e = E._int.newEnemy(TYPES[a[1]], V(x, y, z), Math.max(1, num(a[2], 1)), { remote: from, gid: g, max: num(a[3], 60), hp: num(a[8], 60), yaw: num(a[7]) / 100, quiet: st !== 'rise' });
        if (!e) continue; // pool full
        e.state = st; e.aggro = true; e.rise = st === 'rise' ? num(a[10]) / 10 : 1; if (e.type === 'pigeon') e.pos.y = y;
        byGid.set(g, e);
        if (e.type === 'boss' && !bossSeen.has(g)) { bossSeen.add(g); try { fx.sfx('whistle', null, 1); fx.sfx('boss', null, 0.8); } catch (x) { } toast('🚨 Il Vigile Urbano Zombie è arrivato in Via Petroni: aiutate gli amici!', 'gold'); }
      }
      e.remote = from; e.max = Math.max(1, num(a[3], e.max)); e.level = num(a[2], e.level);
      const n = e.net || (e.net = {});
      n.x = x; n.z = z; n.y = y; n.yaw = num(a[7]) / 100; n.hp = num(a[8]); n.st = st; n.rise = num(a[10]) / 10; n.at = now;
      if (dead && !e.dead) {
        E._int.kill(e, { noCredit: true });
        if (e.type === 'boss') setTimeout(() => { if (!credited.has(g)) toast('👮 Il Vigile Urbano Zombie è stato steso!', 'gold'); }, 1500);
      }
    }
    for (const g of m.r || []) { const e = byGid.get(g); if (e && e.remote && !e.dead) E._int.release(e); }
  }
  // hits from the others on my enemies
  function onHits(from, l) {
    if (!Array.isArray(l)) return;
    for (const h of l.slice(0, 48)) {
      const e = byGid.get(num(h[0])); if (!e || e.remote || !e.alive || e.dead) continue;
      dbg.hitsIn++;
      E.damage(e, Math.min(5000, Math.max(0, num(h[1]))), { dir: V(num(h[4]), 0.25, num(h[5])).normalize(), knock: Math.min(20, num(h[6])), head: !!h[2], crit: !!h[3], slow: Math.min(5, num(h[7])), by: from });
    }
  }
  // an enemy handed to me (its owner walked away) or adopted (owner gone)
  function takeOver(a, aggro, from) {
    const g = num(a[0]); let e = byGid.get(g);
    if (e && !e.alive) e = null;
    const x = num(a[4]) / 100, z = num(a[5]) / 100;
    if (e) { e.remote = 0; e.net = null; e.pos.set(x, e.type === 'pigeon' ? num(a[6]) / 100 : 0, z); }
    else {
      const st = STATES[a[9]]; if (st === 'dead' || !TYPES[a[1]]) return;
      e = E._int.newEnemy(TYPES[a[1]], V(x, num(a[6]) / 100, z), Math.max(1, num(a[2], 1)), { gid: g, max: num(a[3], 60), hp: num(a[8], 60), yaw: num(a[7]) / 100, quiet: true });
      if (!e) return; e.rise = 1; byGid.set(g, e);
    }
    e.handed = false; e.state = e.type === 'pigeon' ? 'circle' : 'chase'; e.aggro = !!aggro; e.lostT = 0; e._tgT = 0; sent.delete(g);
    e.handFrom = from || 0; e.handAt = performance.now();
    if (e.type === 'boss') net.wset('boss', { g, o: net.id }, { mine: true });
    dbg.adopt++;
  }
  // puppets whose owner is gone or silent: a nearby player adopts them (one only: server claim)
  function watchPuppets(now) {
    const me = P();
    for (const e of E.list) {
      if (!e.remote || !e.alive || e.dead || !e.net) continue;
      const gone = !net.players.has(e.remote), age = now - e.net.at;
      if (!gone && age < cfg.stale) continue;
      if (Math.hypot(e.pos.x - me.x, e.pos.z - me.z) > 45 || (!gone && age > cfg.stale + 3000)) { if (age > 2500 || gone) E._int.release(e); continue; }
      if (e._adopting) continue;
      const a = entry(e), ag = e.aggro;
      if (net.ws['ad' + e.gid] === net.id) { takeOver(a, ag); continue; } // adopted it once already: the claim is still mine
      e._adopting = true;
      net.wset('ad' + e.gid, net.id, { op: 'new', mine: true, ttl: 900 }).then(r => { e._adopting = false; if (r.ok && e.alive && e.remote && !e.dead) takeOver(a, ag); });
    }
  }

  // ---------------------------------------------------------------- loot: hooks called by rpg/worldloot.js
  const dropsByNid = new Map();
  const lootNet = {
    dropped(d) { // a drop I made: shared, with the landing spot everybody uses
      const nid = net.id + '.' + (++dseq); d.nid = nid; dropsByNid.set(nid, d);
      const g = 9.8, vy = d.vel.y, h = Math.max(0, d.y - 0.3), t = (vy + Math.sqrt(vy * vy + 2 * g * h)) / g;
      let lx = d.pos.x + d.vel.x * t, lz = d.pos.z + d.vel.z * t;
      if (level && level.isWalkable && !level.isWalkable(lx, lz, 0.05)) { lx = d.pos.x; lz = d.pos.z; d.vel.x = 0; d.vel.z = 0; }
      d.land = [lx, lz];
      const life = isFinite(d.life) ? d.life : 900;
      const v = { k: d.kind, x: r2(d.pos.x), z: r2(d.pos.z), y: r2(d.y), v: [r2(d.vel.x), r2(d.vel.y), r2(d.vel.z)], l: [r2(lx), r2(lz)], e: Math.round(net.serverNow() + life * 1000) };
      if (d.kind === 'money') v.a = d.amount; else if (d.kind === 'ammo') { v.am = d.ammo; v.a = d.amount; } else v.it = d.item;
      net.wset('d' + nid, v, { op: 'new', ttl: Math.ceil(life) + 5 });
    },
    take(d) { return net.wset('d' + d.nid, null, { op: 'take' }).then(r => (r.ok || r.offline || r.gone ? true : r.timeout ? null : false)); },
    crate(c, go, respawn) {
      const k = 'cr' + c.i, cur = net.ws[k] || null, t = net.serverNow();
      if (cur && t < num(cur.t) + num(cur.d) * 1000) return true; // already open for the room: my copy closes with the 'ws' update
      if (c.pending) return true;
      const d = Math.round(respawn * (0.8 + 0.4 * hash01(c.i + 1, t / 1000)));
      c.pending = true;
      net.wset(k, { t: Math.round(t), d }, { op: 'cas', if: cur }).then(r => {
        c.pending = false;
        if (r.ok) { go(); c.timer = d + 2; } else if (r.offline || r.gone) go(); // fail: someone opened it first
      });
      return true;
    },
  };
  function spawnDrop(nid, v) {
    if (!loot || dropsByNid.has(nid) || !v || typeof v !== 'object') return;
    const life = (num(v.e) - net.serverNow()) / 1000; if (life <= 1) return;
    const lx = Array.isArray(v.l) ? num(v.l[0], v.x) : num(v.x), lz = Array.isArray(v.l) ? num(v.l[1], v.z) : num(v.z), me = P();
    if (Math.hypot(lx - me.x, lz - me.z) > DROP_R) return;
    let d;
    if (v.k === 'money') d = { kind: 'money', amount: Math.max(1, Math.round(num(v.a, 1))) };
    else if (v.k === 'ammo') d = { kind: 'ammo', ammo: String(v.am), amount: Math.max(1, num(v.a, 1)) };
    else if (v.k === 'item' && v.it && typeof v.it === 'object' && v.it.kind) d = { kind: 'item', item: v.it };
    else return;
    const dd = loot._spawnNet({ x: num(v.x), y: num(v.y) - 0.6, z: num(v.z) }, d); if (!dd) return; // pool full
    dd.nid = nid; dd.land = [lx, lz]; dd.life = Math.min(dd.life, life); dd.t = 0;
    if (Array.isArray(v.v)) dd.vel.set(num(v.v[0]), num(v.v[1]), num(v.v[2]));
    if (v.age) { dd.landed = true; dd.y = 0.3; dd.pos.set(lx, 0, lz); } // already on the ground (joined later / came in range)
    dropsByNid.set(nid, dd);
  }
  function dropGone(nid) { const d = dropsByNid.get(nid); dropsByNid.delete(nid); if (d && loot && !d.removed) loot.remove(d); }
  function crateState(i, v) {
    if (!loot) return; const c = loot.crates[i]; if (!c) return;
    if (!v) return;
    const left = (num(v.t) + num(v.d) * 1000 - net.serverNow()) / 1000;
    if (left > 0 && !c.open) loot._shutCrate(c, left + 2);
    else if (left > 0) c.timer = Math.max(c.timer, left + 2);
  }

  // ---------------------------------------------------------------- the night zombata (minigames/nightz.js): one per group
  const NZ = window.__minigames && window.__minigames.night;
  let nzSnapT = 0;
  const nzNear = p => { const sn = net.serverNow(); for (const k in net.ws) if (k.startsWith('nz:')) { const v = net.ws[k]; if (v && v.o !== net.id && sn - num(v.t) < 60000 && Math.hypot(num(v.x) - p.x, num(v.z) - p.z) < 40) return v; } return null; };
  const nightNet = NZ && {
    now: () => net.serverNow(),
    claim(p) { // someone's zombata nearby: join it; else mine, with the start time on the server clock
      const near = nzNear(p); if (near) { NZ.follow(num(near.t), near.o); return Promise.resolve(0); }
      const t = Math.round(net.serverNow());
      return net.wset('nz:' + net.id, { o: net.id, t, x: r2(p.x), z: r2(p.z) }, { mine: true, ttl: 120 }).then(r => (r.ok || r.offline ? t : 0)); // -> start time, 0 = no
    },
    target(zp, p) {
      let best = p, bd = Math.hypot(p.x - zp.x, p.z - zp.z);
      for (const Pl of net.players.values()) {
        if (Pl.id === net.id || !Pl.avatar || Pl.far) continue; const s = Pl.avatar.s; if (s && s.md && s.md !== 'explore' && s.md !== 'goto') continue;
        const q = Pl.avatar.root.position, d = Math.hypot(q.x - zp.x, q.z - zp.z); if (d < bd && d < 25) { bd = d; best = q; }
      }
      return best;
    },
    stream(Z) {
      const now = performance.now(); if (now - nzSnapT < SNAP_MS || !others()) return; nzSnapT = now;
      net.emitNear({ k: 'nzs', l: Z.slice(0, 10).map(z => [z.nid, Math.round(z.pos.x * 100), Math.round(z.pos.z * 100), Math.round(z.yaw * 100), Math.round(z.rise * 10), Math.round(z.stun * 10), z.sink ? Math.max(1, Math.round(z.sink * 10)) : 0]) });
    },
    spray(id, p) { const o = NZ.state.follow; if (o) net.to(o, { k: 'nzp', id, x: r2(p.x), z: r2(p.z) }); },
    ended(kind, follow) { if (!follow && net.ws['nz:' + net.id]) net.wset('nz:' + net.id, null); },
  };
  function nzWatch() { // walked into (or joined the room during) a zombata of the others
    if (!NZ || NZ.active || NZ.state.cool > 0) return; const v = nzNear(P()); if (v) NZ.follow(num(v.t), v.o); // cool: just caught / ended, as solo
  }

  // ---------------------------------------------------------------- messages
  net.on('ev', ({ from, e }) => {
    if (!live() || !e) return;
    if (e.k === 'es') onSnap(from, e);
    else if (e.k === 'mt' && Array.isArray(e.o) && Array.isArray(e.v)) CB._throw(e.o, e.v, e.g, e.d);
    else if (e.k === 'nzs' && NZ && NZ.state.follow === from) NZ.puppets(e.l);
  });
  net.on('msg', ({ from, d }) => {
    if (!live() || !d) return;
    if (d.k === 'eh') onHits(from, d.l);
    else if (d.k === 'hu') { try { CB.damagePlayer(Math.min(200, Math.max(0, num(d.n))), { type: String(d.ty || 'zombie'), pos: V(num(d.x), 0, num(d.z)) }, Math.min(10, num(d.kn))); } catch (x) { } }
    else if (d.k === 'ek') { credited.add(num(d.g)); CB._credit({ type: TYPES.includes(d.ty) ? d.ty : 'zombie', level: Math.max(1, num(d.lv, 1)), x: num(d.x), z: num(d.z), head: !!d.h }, !!d.a); }
    else if (d.k === 'eo' && Array.isArray(d.s)) takeOver(d.s, d.ag, from);
    else if (d.k === 'nzp' && NZ && NZ.active && !NZ.state.follow) NZ.sprayed(num(d.id), { x: num(d.x), z: num(d.z) });
  });
  net.on('ws', ({ k, v, by, reset }) => {
    if (reset) { // joined a room: the room's crates and drops
      for (const e of E.list.slice()) if (e.remote) E._int.release(e);
      byGid.clear(); sent.clear(); dropsByNid.clear(); for (const e of E.list) e.gid = 0;
      for (const key in net.ws) wsKey(key, net.ws[key], 0, true);
      return;
    }
    if (k) wsKey(k, v, by, false);
  });
  function wsKey(k, v, by, initial) {
    if (k[0] === 'd' && k[1] !== undefined && /^d\d/.test(k)) { const nid = k.slice(1); if (v === null) dropGone(nid); else if (by !== net.id || initial) spawnDrop(nid, initial ? { ...v, age: 3 } : v); }
    else if (/^cr\d+$/.test(k)) crateState(+k.slice(2), v);
    else if (k.startsWith('nz:') && NZ) { if (v === null && NZ.active && NZ.state.follow === +k.slice(3)) NZ.end('host'); else if (v && !initial) nzWatch(); }
  }

  // ---------------------------------------------------------------- attach / per frame (after net.update)
  function attach(on) {
    if (on === attached) return; attached = on;
    E.ctx.sync = on ? sync : null;
    if (loot) loot.net = on ? lootNet : null;
    if (NZ) { if (!on && NZ.active && NZ.state.follow) NZ.end('host'); NZ.net = on ? nightNet : null; }
    if (!on) { // back to solo: puppets go, my enemies stay mine
      for (const e of E.list.slice()) if (e.remote) E._int.release(e);
      byGid.clear(); sent.clear(); removals.length = 0; hitQ.clear(); dropsByNid.clear();
      for (const e of E.list) e.gid = 0;
    }
  }
  const upd = net.update;
  net.update = dt => {
    upd(dt);
    attach(live());
    if (!attached) return;
    const now = performance.now();
    dbg.ticks++; if (lastTick) dbg.maxGap = Math.max(dbg.maxGap, Math.round(now - lastTick)); lastTick = now;
    for (const [id, b] of hitQ) { if (b.length) net.to(id, { k: 'eh', l: b }); }
    hitQ.clear();
    if (now - snapT >= SNAP_MS) { snapT = now; if (others() || removals.length) sendSnap(now); else removals.length = 0; }
    if (now - scanT >= 500) {
      scanT = now; watchPuppets(now); nzWatch();
      // drops of the room that came within range (pools are small: only those near me are spawned)
      const sn = net.serverNow();
      for (const k in net.ws) {
        if (!/^d\d/.test(k)) continue;
        const v = net.ws[k], nid = k.slice(1);
        if (!v || num(v.e) < sn) { delete net.ws[k]; dropsByNid.delete(nid); continue; } // expired on the server too (ttl)
        if (!dropsByNid.has(nid)) spawnDrop(nid, { ...v, age: 3 });
      }
    }
  };
  const api = { sync, lootNet, byGid, dbg, cfg, get attached() { return attached; } };
  window.__wsync = api;
  return api;
}
