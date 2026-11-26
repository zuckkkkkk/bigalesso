// shared/br.mjs — "Ultimo in piedi a Bologna": battle royale in the quartiere (rules + bots), see shared/README.md.
// Runs on the server (referee: zone, loot table, pickups, hit validation, bots) and in the browser offline (same code).
//
// Phases: lobby (countdown, drop-in) → drop (choose where to open the umbrella, then the descent) → play → over.
// Actions (act):
//   { drop: { x, z } }                         lobby/drop: landing spot (snapped to open ground inside the first circle)
//   { pos: { x, z, yaw } }                     play: my position (~10 Hz); speed-checked, clamped to the map
//   { hit: { target, base, head, splash, k } } play: I hit someone with `base` (k = 0.45..1 splash falloff); the server
//                                              re-checks ownership, fire rate, range and line of sight, then rolls damage
//   { pickup: lootId }                         within 2.6 m; weapons go to the 3 slots (a full bag swaps the active one)
//   { slot: i }                                active weapon slot (0..2)
//   { start: true }                            lobby: the host (first human) can start now
//   { leave: true }                            give up
// view(id): { phase, t, left, n, alive, me, players[], zone, loot[] (near me), feed[], over }
// drain(): [{ k: 'shot'|'hit'|'elim'|'pickup'|'zone'|'phase'|'land', ... }]
import { rng } from './rng.mjs';
import { BR_MAP } from './br_map.mjs';

export const meta = { type: 'br', name: 'Ultimo in piedi a Bologna', minPlayers: 1, maxPlayers: 16, tickHz: 15, dropIn: true };

// weapons (mirror of src/combat/weapons.js BASES: damage per hit, shots/s, range m, splash m)
export const WEAPONS = {
  pistola: { name: 'Pistola ad acqua', dmg: 9, rate: 8, range: 24, splash: 0, head: 1.4 },
  tortellini: { name: 'Lanciatortellini', dmg: 24, rate: 1.6, range: 40, splash: 1.7, head: 1 },
  nerf: { name: 'Nerf blaster', dmg: 20, rate: 3.2, range: 55, splash: 0, head: 2.5 },
  spritz: { name: 'Spritz-Bazooka', dmg: 90, rate: 0.6, range: 70, splash: 3.4, head: 1 },
  ombrello: { name: 'Ombrello-mazza', dmg: 32, rate: 1.8, range: 2.6, splash: 0, head: 1 },
};
export const RARITIES = ['comune', 'non comune', 'raro', 'epico', 'leggendario'];
const RMULT = [1, 1.12, 1.28, 1.5, 1.8];
// loot table: weight, kind, base / amount
const LOOT = [
  [26, 'weapon', 'pistola'], [16, 'weapon', 'tortellini'], [16, 'weapon', 'nerf'], [5, 'weapon', 'spritz'],
  [14, 'heal', 'brodo', 25], [7, 'heal', 'spritz_drink', 50], [12, 'armor', 'felpa', 25], [4, 'armor', 'piumino', 50],
];
const LOOT_W = LOOT.reduce((a, l) => a + l[0], 0);
const RAR_W = [50, 27, 14, 7, 2];
export const ITEM_NAMES = { brodo: 'Brodo della nonna', spritz_drink: 'Spritz', felpa: 'Felpa imbottita', piumino: 'Piumino Moncler (tarocco)' };
// bots: the group's friends + some Bolognese characters
const BOT_NAMES = ['Seghino', 'Forla', 'Asche', 'Ashish', 'Ciccio', 'Parme', 'Lombu', 'Cesco', 'Ricky Catta', 'Jacopo', 'Mirco',
  "L'Umarell", 'Il Bidello', 'Sciura del 3°', 'Il Barista del Bellazzi', 'Il Buttafuori'];
// zone stages: wait (s), shrink (s), radius factor, damage/s outside
const STAGES = [[34, 26, 0.6, 2], [26, 20, 0.58, 4], [20, 16, 0.55, 7], [16, 14, 0.5, 10], [12, 12, 0.45, 14], [10, 10, 0, 22]];
const MAXSPD = 9.5;           // m/s accepted for player positions (sprint + leeway)
const LOBBY = { online: 25, offline: 4 }, DROP_CHOOSE = 7, DROP_FALL = 4.5;

// ---------------------------------------------------------------- map helpers (1 m grid)
const M = BR_MAP;
const cellOpen = (x, z) => { const i = Math.floor(x - M.x0), j = Math.floor(z - M.z0); return i >= 0 && j >= 0 && i < M.w && j < M.h && M.rows[j].charCodeAt(i) === 49; };
export function openAt(x, z) { return cellOpen(x, z); }
// line of sight on the grid (0.5 m steps); the first/last metre around the ends is forgiven (people stand next to walls)
export function los(ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz); if (L < 1.5) return true;
  const n = Math.ceil(L / 0.5);
  for (let s = 2; s < n - 1; s++) { const t = s / n; if (!cellOpen(ax + dx * t, az + dz * t)) return false; }
  return true;
}
const OPEN = []; for (let j = 0; j < M.h; j++) for (let i = 0; i < M.w; i++) if (M.rows[j].charCodeAt(i) === 49) OPEN.push(i, j);
const OPEN_N = OPEN.length / 2;
// first circle: centre of the open area, radius to the farthest open cell
const C0 = (() => { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (let k = 0; k < OPEN_N; k++) { const x = M.x0 + OPEN[k * 2] + 0.5, z = M.z0 + OPEN[k * 2 + 1] + 0.5; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2; let r = 0; for (let k = 0; k < OPEN_N; k++) { const x = M.x0 + OPEN[k * 2] + 0.5, z = M.z0 + OPEN[k * 2 + 1] + 0.5; r = Math.max(r, Math.hypot(x - cx, z - cz)); }
  return { cx: +cx.toFixed(1), cz: +cz.toFixed(1), r: Math.ceil(r + 3) }; })();
export const FIRST_CIRCLE = C0;
function randomOpen(R, inside) { // inside: {cx, cz, r} or null
  for (let k = 0; k < 400; k++) { const c = R.int(OPEN_N); const x = M.x0 + OPEN[c * 2] + 0.2 + R.next() * 0.6, z = M.z0 + OPEN[c * 2 + 1] + 0.2 + R.next() * 0.6; if (!inside || Math.hypot(x - inside.cx, z - inside.cz) < inside.r) return { x, z }; }
  return { x: C0.cx, z: C0.cz };
}
function snapOpen(x, z, maxR = 6) {
  if (cellOpen(x, z)) return { x, z };
  for (let r = 1; r <= maxR; r++) for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, xx = x + Math.cos(a) * r, zz = z + Math.sin(a) * r; if (cellOpen(xx, zz)) return { x: xx, z: zz }; }
  return null;
}
const r1 = v => Math.round(v * 10) / 10;

// ---------------------------------------------------------------- rules
export function create({ players = [], opts = {}, seed = 1 } = {}) {
  const R = rng(seed);
  const online = !!opts.online;
  const size = Math.max(2, Math.min(meta.maxPlayers, opts.size | 0 || 12));
  const speed = opts.fastZone ? 0.8 : 1; // offline: a slightly quicker zone
  const S = {
    phase: 'lobby', t: 0, left: opts.lobby ?? (online ? LOBBY.online : LOBBY.offline), seq: 0, over: null,
    P: new Map(), order: [], loot: [], lootSeq: 1, feed: [], ev: [], zone: { cx: C0.cx, cz: C0.cz, r: C0.r, ncx: C0.cx, ncz: C0.cz, nr: C0.r, stage: -1, t: 0, shrinking: false, from: null, dps: 1 },
    host: null, placeNext: 0, startN: 0,
  };
  const push = e => { S.ev.push(e); if (S.ev.length > 400) S.ev.splice(0, S.ev.length - 400); };
  let colorSeq = 0;
  function addPlayer(p, bot = false) {
    if (S.P.has(p.id)) return S.P.get(p.id);
    const q = { id: String(p.id), name: String(p.name || (bot ? 'Bot' : 'Giocatore')).slice(0, 20), bot: !!(bot || p.bot), alive: true, hp: 100, armor: 0, x: C0.cx, z: C0.cz, yaw: 0,
      inv: [null, null, null], slot: 0, kills: 0, place: 0, drop: null, landed: false, lastShot: {}, lastPosT: -1, c: (colorSeq++ % 8),
      dmg: 0, ai: bot ? { goal: null, goalT: 0, target: null, thinkT: R.next() * 0.5, shotT: 0, stuck: 0, side: R.chance(0.5) ? 1 : -1, aim: 0.5 + R.next() * 0.35, lootId: null } : null };
    S.P.set(q.id, q); S.order.push(q.id);
    if (!q.bot && !S.host) S.host = q.id;
    return q;
  }
  for (const p of players) addPlayer(p, !!p.bot);
  const humans = () => [...S.P.values()].filter(p => !p.bot);
  const aliveList = () => { const a = []; for (const p of S.P.values()) if (p.alive) a.push(p); return a; };

  // ------------------------------------------------ phases
  function startDrop() {
    // bots to fill the bus
    let k = 0; const used = new Set([...S.P.values()].map(p => p.name));
    while (S.P.size < size && k < 64) { const nm = BOT_NAMES[(R.int(BOT_NAMES.length) + k) % BOT_NAMES.length]; const name = used.has(nm) ? nm + ' ' + (2 + k % 3) : nm; used.add(name); addPlayer({ id: 'bot' + (++k), name }, true); }
    S.phase = 'drop'; S.t = 0; S.left = DROP_CHOOSE + DROP_FALL; S.startN = S.P.size; S.placeNext = S.P.size;
    // loot on the map: ~1 item every 14 open cells, clustered a bit near crossings
    const n = Math.round(Math.min(150, Math.max(50, OPEN_N / 26)));
    for (let i = 0; i < n; i++) { const s = randomOpen(R, null); spawnLoot(s.x, s.z, rollLoot()); }
    for (const p of S.P.values()) if (p.bot) { const s = randomOpen(R, { cx: C0.cx, cz: C0.cz, r: C0.r }); p.drop = s; }
    push({ k: 'phase', phase: 'drop' });
  }
  function startPlay() {
    S.phase = 'play'; S.t = 0; S.left = 0;
    for (const p of S.P.values()) {
      if (!p.drop) p.drop = randomOpen(R, null);
      p.x = p.drop.x; p.z = p.drop.z; p.yaw = R.next() * 6.28; p.landed = true; p.lastPosT = S.t;
      p.inv = [null, null, null]; p.slot = 0; p.hp = 100; p.armor = 0;
    }
    nextStage();
    push({ k: 'phase', phase: 'play' });
  }
  function nextStage() {
    const Z = S.zone; Z.stage++;
    const st = STAGES[Math.min(Z.stage, STAGES.length - 1)];
    Z.cx = Z.ncx; Z.cz = Z.ncz; Z.r = Z.nr;
    const nr = Math.max(0, Math.round(Z.r * st[2]));
    // next centre: open ground inside the current circle so the new one fits inside it
    let c = null; for (let k = 0; k < 80 && !c; k++) { const s = randomOpen(R, { cx: Z.cx, cz: Z.cz, r: Math.max(1, Z.r - nr) }); if (Math.hypot(s.x - Z.cx, s.z - Z.cz) <= Math.max(0, Z.r - nr)) c = s; }
    if (!c) c = { x: Z.cx, z: Z.cz };
    Z.ncx = r1(c.x); Z.ncz = r1(c.z); Z.nr = nr; Z.t = 0; Z.wait = st[0] * speed; Z.shrink = st[1] * speed; Z.dps = st[3]; Z.shrinking = false; Z.from = { cx: Z.cx, cz: Z.cz, r: Z.r };
    push({ k: 'zone', stage: Z.stage, wait: Z.wait });
  }
  function updZone(dt) {
    const Z = S.zone; Z.t += dt;
    if (!Z.shrinking && Z.t >= Z.wait) { Z.shrinking = true; Z.t = 0; push({ k: 'zone', stage: Z.stage, shrinking: true }); }
    if (Z.shrinking) {
      const k = Math.min(1, Z.t / Math.max(0.1, Z.shrink)), f = Z.from;
      Z.cx = f.cx + (Z.ncx - f.cx) * k; Z.cz = f.cz + (Z.ncz - f.cz) * k; Z.r = f.r + (Z.nr - f.r) * k;
      if (k >= 1 && Z.stage < STAGES.length - 1) nextStage();
    }
  }
  const outside = p => Math.hypot(p.x - S.zone.cx, p.z - S.zone.cz) > S.zone.r;

  // ------------------------------------------------ loot
  function rollLoot() {
    let w = R.next() * LOOT_W, L = LOOT[0]; for (const l of LOOT) { if ((w -= l[0]) < 0) { L = l; break; } }
    if (L[1] === 'weapon') { let rw = R.next() * 100, ri = 0; for (; ri < 4; ri++) if ((rw -= RAR_W[ri]) < 0) break; return { kind: 'weapon', base: L[2], rarity: RARITIES[ri] }; }
    return { kind: L[1], item: L[2], amount: L[3] };
  }
  function spawnLoot(x, z, it) { const l = { id: S.lootSeq++, x: r1(x), z: r1(z), ...it, taken: false }; S.loot.push(l); return l; }
  function pickup(p, l) {
    if (l.kind === 'weapon') {
      let i = p.inv.indexOf(null);
      if (i < 0) { i = p.slot; const old = p.inv[i]; spawnLoot(p.x + 0.6, p.z + 0.3, { kind: 'weapon', base: old.base, rarity: old.rarity }); }
      p.inv[i] = { base: l.base, rarity: l.rarity }; p.slot = i;
    } else if (l.kind === 'heal') { if (p.hp >= 100) return false; p.hp = Math.min(100, p.hp + l.amount); }
    else if (l.kind === 'armor') { if (p.armor >= 100) return false; p.armor = Math.min(100, p.armor + l.amount); }
    l.taken = true; push({ k: 'pickup', id: l.id, by: p.id, kind: l.kind, base: l.base || l.item, rarity: l.rarity });
    return true;
  }

  // ------------------------------------------------ damage
  function weaponOf(p, base) {
    if (base === 'ombrello') return { base, rarity: 'comune' };
    return p.inv.find(w => w && w.base === base) || null;
  }
  function dmgRoll(w, head, k) {
    const W0 = WEAPONS[w.base], ri = Math.max(0, RARITIES.indexOf(w.rarity));
    return W0.dmg * RMULT[ri] * (head ? W0.head : 1) * Math.max(0.3, Math.min(1, k));
  }
  function applyDamage(victim, amount, by, base, head) {
    if (!victim.alive || amount <= 0) return 0;
    let a = amount;
    if (victim.armor > 0) { const ab = Math.min(victim.armor, a * 0.6); victim.armor -= ab; a -= ab; }
    victim.hp -= a; if (by) by.dmg += amount;
    push({ k: 'hit', target: victim.id, by: by ? by.id : null, amount: Math.round(amount), base, head: !!head, hp: Math.max(0, Math.round(victim.hp)) });
    if (victim.hp <= 0) eliminate(victim, by, base);
    return amount;
  }
  function eliminate(v, by, base) {
    if (!v.alive) return;
    v.alive = false; v.hp = 0; v.place = aliveList().length + 1;
    if (by && by !== v) by.kills++;
    // drop the bag
    for (const w of v.inv) if (w) spawnLoot(v.x + (R.next() - 0.5) * 1.6, v.z + (R.next() - 0.5) * 1.6, { kind: 'weapon', base: w.base, rarity: w.rarity });
    if (v.armor > 10) spawnLoot(v.x, v.z, { kind: 'armor', item: 'felpa', amount: 25 });
    const f = { t: Math.round(S.t), victim: v.name, vid: v.id, killer: by && by !== v ? by.name : null, kid: by && by !== v ? by.id : null, base: base || null };
    S.feed.push(f); if (S.feed.length > 8) S.feed.shift();
    push({ k: 'elim', ...f, place: v.place });
    const al = aliveList();
    if (al.length <= 1 && S.phase === 'play') finish(al[0] || by || v);
  }
  function finish(w) {
    S.phase = 'over'; S.t = 0;
    if (w && w.alive) w.place = 1;
    const scores = {}, kills = {}; for (const p of S.P.values()) { scores[p.id] = p.place || 1; kills[p.id] = p.kills; }
    S.over = { winners: w ? [w.id] : [], scores, kills, summary: w ? `${w.name} è l'ultimo in piedi a Bologna` : 'Nessuno in piedi: ha vinto la zona', winner: w ? w.name : null };
    push({ k: 'phase', phase: 'over', winner: w ? w.id : null });
  }

  // ------------------------------------------------ bots
  const nearestLoot = (p, maxD, kind) => { let best = null, bd = maxD; for (const l of S.loot) { if (l.taken || (kind && l.kind !== kind)) continue; if (l.kind === 'heal' && p.hp > 80) continue; if (l.kind === 'armor' && p.armor >= 60) continue; if (l.kind === 'weapon' && p.inv.indexOf(null) < 0 && !better(p, l)) continue; const d = Math.hypot(l.x - p.x, l.z - p.z); if (d < bd) { bd = d; best = l; } } return best; };
  const better = (p, l) => { const cur = p.inv[p.slot]; return !cur || RARITIES.indexOf(l.rarity) > RARITIES.indexOf(cur.rarity) + 1; };
  function botThink(p) {
    const ai = p.ai;
    // target: closest visible enemy within 26 m (bots see a bit less at range)
    let tgt = null, td = S.t < 22 ? 12 : 24; // the first seconds: loot first, fight only who comes close
    for (const q of S.P.values()) {
      if (q === p || !q.alive || !q.landed) continue;
      const d = Math.hypot(q.x - p.x, q.z - p.z); if (d >= td) continue;
      if (!los(p.x, p.z, q.x, q.z)) continue;
      tgt = q; td = d;
    }
    ai.target = tgt ? tgt.id : null;
    // weapon: the best one in the bag for this range
    let bi = -1, bs = -1; for (let i = 0; i < 3; i++) { const w = p.inv[i]; if (!w) continue; const W0 = WEAPONS[w.base]; if (tgt && td > W0.range * 0.9) continue; const s = W0.dmg * W0.rate * RMULT[RARITIES.indexOf(w.rarity)]; if (s > bs) { bs = s; bi = i; } }
    if (bi >= 0) p.slot = bi;
    // movement goal
    const Z = S.zone, inNext = Math.hypot(p.x - Z.ncx, p.z - Z.ncz) < Z.nr * 0.85;
    if (outside(p) || (!inNext && (Z.shrinking || Z.t > Z.wait * 0.5))) { ai.goal = { x: Z.ncx + (R.next() - 0.5) * Z.nr * 0.6, z: Z.ncz + (R.next() - 0.5) * Z.nr * 0.6 }; ai.lootId = null; }
    else if (tgt && p.hp < 35 && td > 6) { // hurt: run away from the target, toward something to heal
      const l = nearestLoot(p, 25); const a = Math.atan2(p.x - tgt.x, p.z - tgt.z);
      ai.goal = l && l.kind !== 'weapon' ? { x: l.x, z: l.z } : { x: p.x + Math.sin(a) * 10, z: p.z + Math.cos(a) * 10 }; ai.lootId = l ? l.id : null;
    } else if (tgt && !p.inv.some(Boolean) && (ai.gun = nearestLoot(p, 16, 'weapon'))) { // unarmed: grab a gun before the umbrella duel
      ai.goal = { x: ai.gun.x, z: ai.gun.z }; ai.lootId = ai.gun.id;
    } else if (tgt) {
      const W0 = WEAPONS[(p.inv[p.slot] || { base: 'ombrello' }).base]; const want = W0.range * 0.55;
      const a = Math.atan2(p.x - tgt.x, p.z - tgt.z) + ai.side * 0.7;
      ai.goal = td > want ? { x: tgt.x, z: tgt.z } : { x: tgt.x + Math.sin(a) * want, z: tgt.z + Math.cos(a) * want };
    } else {
      const l = nearestLoot(p, 30);
      if (l) { ai.goal = { x: l.x, z: l.z }; ai.lootId = l.id; }
      else if (!ai.goal || Math.hypot(ai.goal.x - p.x, ai.goal.z - p.z) < 1.5) { const s = randomOpen(R, { cx: Z.ncx, cz: Z.ncz, r: Math.max(6, Z.nr) }); ai.goal = s; ai.lootId = null; }
    }
  }
  function botStep(p, dt) {
    const ai = p.ai;
    ai.thinkT -= dt; if (ai.thinkT <= 0) { ai.thinkT = 0.45 + R.next() * 0.3; botThink(p); }
    // shoot
    ai.shotT -= dt;
    const tgt = ai.target ? S.P.get(ai.target) : null;
    const w = p.inv[p.slot] || { base: 'ombrello', rarity: 'comune' }, W0 = WEAPONS[w.base];
    if (tgt && tgt.alive && ai.shotT <= 0) {
      const d = Math.hypot(tgt.x - p.x, tgt.z - p.z);
      if (d <= W0.range && los(p.x, p.z, tgt.x, tgt.z)) {
        ai.shotT = 1 / (W0.rate * 0.3) * (0.8 + R.next() * 0.5);
        const pHit = Math.max(0.1, Math.min(0.75, ai.aim - d / 55 + (W0.splash ? 0.1 : 0)));
        const hit = R.chance(pHit);
        push({ k: 'shot', from: p.id, to: tgt.id, base: w.base, hit, x: r1(tgt.x + (hit ? 0 : (R.next() - 0.5) * 2)), z: r1(tgt.z + (hit ? 0 : (R.next() - 0.5) * 2)) });
        if (hit) applyDamage(tgt, dmgRoll(w, R.chance(0.1), 1) * 0.6, p, w.base, false);
      }
    }
    // move
    if (ai.goal) {
      const dx = ai.goal.x - p.x, dz = ai.goal.z - p.z, L = Math.hypot(dx, dz);
      if (L > 0.6) {
        const sp = (tgt ? 3.2 : outside(p) ? 4.6 : 3.8) * dt, a0 = Math.atan2(dx, dz);
        let moved = false;
        for (const off of [0, ai.side * 0.6, ai.side * 1.2, -ai.side * 0.6, ai.side * 1.8, -ai.side * 1.2, ai.side * 2.5]) {
          const a = a0 + off, nx = p.x + Math.sin(a) * sp, nz = p.z + Math.cos(a) * sp;
          if (cellOpen(nx, nz)) { p.x = nx; p.z = nz; p.yaw = tgt ? Math.atan2(tgt.x - p.x, tgt.z - p.z) : a; moved = true; break; }
        }
        if (!moved) { ai.stuck += dt; ai.side = -ai.side; if (ai.stuck > 1.5) { ai.goal = null; ai.stuck = 0; } } else ai.stuck = 0;
      } else if (ai.lootId) { const l = S.loot.find(x => x.id === ai.lootId); if (l && !l.taken && Math.hypot(l.x - p.x, l.z - p.z) < 1.8) pickup(p, l); ai.lootId = null; ai.goal = null; }
      if (tgt) p.yaw = Math.atan2(tgt.x - p.x, tgt.z - p.z);
    }
    // opportunistic pickup on the way
    if (!tgt && (S.seq % 5 === 0)) for (const l of S.loot) { if (!l.taken && Math.abs(l.x - p.x) < 1.6 && Math.abs(l.z - p.z) < 1.6) { if (l.kind !== 'weapon' || p.inv.indexOf(null) >= 0 || better(p, l)) pickup(p, l); break; } }
  }

  // ------------------------------------------------ public game object
  const game = {
    act(id, a) {
      const p = S.P.get(String(id)); if (!p || !a || typeof a !== 'object') return { ok: false, error: 'giocatore sconosciuto' };
      if (a.leave) { if (S.phase === 'play' && p.alive) eliminate(p, null, null); else if (S.phase === 'lobby') { S.P.delete(p.id); S.order = S.order.filter(x => x !== p.id); if (S.host === p.id) S.host = (humans()[0] || {}).id || null; } return { ok: true }; }
      if (a.start) { if (S.phase === 'lobby' && (S.host === p.id || !online)) { S.left = Math.min(S.left, 0.01); return { ok: true }; } return { ok: false, error: 'solo l\'host può partire' }; }
      if (a.drop) {
        if (S.phase !== 'lobby' && !(S.phase === 'drop' && S.t < DROP_CHOOSE)) return { ok: false, error: 'troppo tardi per scegliere' };
        const x = +a.drop.x, z = +a.drop.z; if (!Number.isFinite(x) || !Number.isFinite(z)) return { ok: false, error: 'punto non valido' };
        const s = snapOpen(x, z, 8); if (!s || Math.hypot(s.x - C0.cx, s.z - C0.cz) > C0.r) return { ok: false, error: 'lì non si atterra' };
        p.drop = { x: r1(s.x), z: r1(s.z) }; return { ok: true, drop: p.drop };
      }
      if (S.phase !== 'play') return { ok: false, error: 'partita non iniziata' };
      if (!p.alive) return { ok: false, error: 'sei fuori' };
      if (a.pos) {
        const x = +a.pos.x, z = +a.pos.z; if (!Number.isFinite(x) || !Number.isFinite(z)) return { ok: false, error: 'posizione' };
        const dt = Math.max(0.05, S.t - p.lastPosT), d = Math.hypot(x - p.x, z - p.z), max = MAXSPD * dt + 1.5;
        if (d > max) { const k = max / d; p.x += (x - p.x) * k; p.z += (z - p.z) * k; } else { p.x = x; p.z = z; }
        p.x = Math.max(M.x0, Math.min(M.x0 + M.w, p.x)); p.z = Math.max(M.z0, Math.min(M.z0 + M.h, p.z));
        if (Number.isFinite(+a.pos.yaw)) p.yaw = +a.pos.yaw;
        p.lastPosT = S.t; return { ok: true, clamped: d > max };
      }
      if (a.slot !== undefined) { const i = a.slot | 0; if (i >= 0 && i < 3) p.slot = i; return { ok: true }; }
      if (a.pickup !== undefined) {
        const l = S.loot.find(x => x.id === (a.pickup | 0)); if (!l || l.taken) return { ok: false, error: 'già preso' };
        if (Math.hypot(l.x - p.x, l.z - p.z) > 2.6) return { ok: false, error: 'troppo lontano' };
        return pickup(p, l) ? { ok: true } : { ok: false, error: 'non ti serve' };
      }
      if (a.hit) {
        const h = a.hit, v = S.P.get(String(h.target)); if (!v || !v.alive || v === p) return { ok: false, error: 'bersaglio' };
        const base = String(h.base || ''), w = weaponOf(p, base), W0 = WEAPONS[base]; if (!w || !W0) return { ok: false, error: 'arma non tua' };
        // fire rate: one shot per 1/rate s (25% leeway); a splash may hit several targets with the same shot (60 ms window)
        const last = p.lastShot[base] ?? -9, gap = S.t - last;
        if (gap < 0.75 / W0.rate && !(h.splash && W0.splash && gap < 0.06)) return { ok: false, error: 'troppo veloce' };
        const d = Math.hypot(v.x - p.x, v.z - p.z);
        if (d > W0.range * 1.2 + 1.5 + (h.splash ? W0.splash : 0)) return { ok: false, error: 'fuori portata' };
        if (d > 3 && !los(p.x, p.z, v.x, v.z) && !(h.splash && W0.splash)) return { ok: false, error: 'muro' };
        if (gap >= 0.06 || !h.splash) p.lastShot[base] = S.t;
        const k = h.splash ? Math.max(0.45, Math.min(1, +h.k || 1)) : 1;
        push({ k: 'shot', from: p.id, to: v.id, base, hit: true, x: r1(v.x), z: r1(v.z), player: true });
        applyDamage(v, dmgRoll(w, !!h.head && !h.splash, k), p, base, !!h.head);
        return { ok: true };
      }
      if (a.fire) { // a miss (cosmetic for the others): rate-limited
        const base = String(a.fire.base || ''); if (!WEAPONS[base] || !weaponOf(p, base)) return { ok: false };
        if (S.t - (p.lastFx || -9) < 0.12) return { ok: true }; p.lastFx = S.t;
        push({ k: 'shot', from: p.id, to: null, base, hit: false, x: r1(+a.fire.x || p.x), z: r1(+a.fire.z || p.z), player: true }); return { ok: true };
      }
      return { ok: false, error: 'azione sconosciuta' };
    },
    tick(dt) {
      dt = Math.min(0.25, Math.max(0, dt)); S.t += dt; S.seq++;
      if (S.phase === 'lobby') {
        S.left -= dt;
        if (humans().length === 0 && online) return;
        if (S.left <= 0) startDrop();
      } else if (S.phase === 'drop') {
        S.left = Math.max(0, DROP_CHOOSE + DROP_FALL - S.t);
        if (S.t >= DROP_CHOOSE && !S.fell) { S.fell = true; for (const p of S.P.values()) if (!p.drop) p.drop = randomOpen(R, null); push({ k: 'land', at: S.t }); }
        if (S.t >= DROP_CHOOSE + DROP_FALL) startPlay();
      } else if (S.phase === 'play') {
        updZone(dt);
        const Z = S.zone;
        for (const p of S.P.values()) {
          if (!p.alive) continue;
          if (p.bot) botStep(p, dt);
          if (outside(p)) { p.zoneAcc = (p.zoneAcc || 0) + Z.dps * dt; if (p.zoneAcc >= 1) { const n = Math.floor(p.zoneAcc); p.zoneAcc -= n; p.hp -= n; push({ k: 'hit', target: p.id, by: null, amount: n, base: 'zona', hp: Math.max(0, Math.round(p.hp)) }); if (p.hp <= 0) eliminate(p, null, 'zona'); } }
          else p.zoneAcc = 0;
          if (S.phase !== 'play') break;
        }
        // a human that stopped sending positions for 20 s online is dropped (disconnected)
        if (online) for (const p of S.P.values()) if (!p.bot && p.alive && S.t - p.lastPosT > 20) eliminate(p, null, 'disconnesso');
      }
    },
    view(id) {
      const me = S.P.get(String(id)) || null, Z = S.zone;
      const cx = me ? me.x : Z.cx, cz = me ? me.z : Z.cz;
      // spectating: near the one I follow (client tells which via opts? keep it simple: whole map loot only when alive)
      const players = []; for (const p of S.P.values()) players.push({ id: p.id, n: p.name, b: p.bot ? 1 : 0, x: r1(p.x), z: r1(p.z), y: Math.round(p.yaw * 100) / 100, a: p.alive ? 1 : 0, hp: Math.round(p.hp), ar: Math.round(p.armor), w: (p.inv[p.slot] || {}).base || 'ombrello', k: p.kills, c: p.c, pl: p.place });
      const loot = []; const rad = S.phase === 'play' ? 55 : 0;
      if (rad) for (const l of S.loot) { if (l.taken) continue; if (Math.abs(l.x - cx) > rad || Math.abs(l.z - cz) > rad) continue; loot.push({ id: l.id, x: l.x, z: l.z, kind: l.kind, base: l.base || l.item, r: l.rarity || null, n: l.amount || 0 }); }
      let alive = 0; for (const p of S.P.values()) if (p.alive) alive++;
      return {
        phase: S.phase, t: Math.round(S.t * 10) / 10, left: Math.max(0, Math.round(S.left * 10) / 10), n: S.P.size, size, alive, host: S.host,
        me: me ? { id: me.id, alive: me.alive, hp: Math.max(0, Math.round(me.hp)), armor: Math.round(me.armor), inv: me.inv.map(w => w ? { base: w.base, rarity: w.rarity } : null), slot: me.slot, kills: me.kills, place: me.place, x: r1(me.x), z: me.z, drop: me.drop, landed: me.landed } : null,
        players,
        zone: { cx: r1(Z.cx), cz: r1(Z.cz), r: r1(Z.r), ncx: Z.ncx, ncz: Z.ncz, nr: Z.nr, shrinking: Z.shrinking, tl: Math.max(0, Math.round(((Z.shrinking ? Z.shrink : Z.wait) - Z.t) * 10) / 10), dps: Z.dps, stage: Z.stage },
        first: C0, loot, feed: S.feed.slice(-5), over: S.over,
      };
    },
    drain() { const e = S.ev; S.ev = []; return e; },
    join(p) { if (S.phase === 'lobby') { const q = addPlayer(p, !!p.bot); return { ok: true, id: q.id }; } return { ok: false, error: 'partita già iniziata: aspetta la prossima' }; },
    leave(id) { return game.act(id, { leave: true }); },
    get over() { return S.over; },
    // tests / debug
    _state: S,
  };
  return game;
}
