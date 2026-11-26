// shared/siege.mjs — "Assedio al quartiere": co-op RTS rules (see shared/README.md for the module contract).
// Up to 4 commanders share birre + tortellini, recruit the friends at the house (HQ, behind the garden gate),
// capture the quartiere's spots for income and hold them against zombie waves (boss: il Vigile Urbano Zombie).
// Win: hold every spot for `holdSecs` or survive `waves` waves. Lose: the house falls.
// Pure JS, deterministic for a seed, 10 Hz. Movement on the baked walk grid (siege_grid.mjs, 0.5 m cells):
// Dijkstra flow fields (cached per target, rebuilt when barricades change), sliding collisions, spatial hash.
import { rng } from './rng.mjs';
import { GRID } from './siege_grid.mjs';

export const meta = { type: 'siege', name: 'Assedio al quartiere', minPlayers: 1, maxPlayers: 4, tickHz: 10, dropIn: true };

// ------------------------------------------------------------------ static data (also used by the client)
export const ROLES = {
  teppista: { name: 'Teppista', hp: 230, dmg: 16, range: 1.35, cd: 0.9, speed: 3.2, aggro: 6.5, cost: { b: 3, t: 2 }, key: 'Z', desc: 'Corpo a corpo, incassa tanto' },
  tortellini: { name: 'Lanciatortellini', hp: 95, dmg: 11, range: 9, cd: 1.0, speed: 3.4, aggro: 11, cost: { b: 2, t: 4 }, key: 'X', desc: 'Tira tortellini da lontano' },
  spritz: { name: 'Spritzatore', hp: 85, dmg: 5, range: 6, cd: 1.0, speed: 3.3, aggro: 8, heal: 10, cost: { b: 4, t: 2 }, key: 'C', desc: 'Cura gli amici vicini con lo spritz' },
  rider: { name: 'Rider', hp: 70, dmg: 7, range: 1.25, cd: 0.6, speed: 6.2, aggro: 6, capMul: 2.5, cost: { b: 1, t: 2 }, key: 'V', desc: 'Velocissimo, conquista le zone in fretta' },
};
export const ROLE_KEYS = Object.keys(ROLES);
export const ZTYPES = {
  walker: { name: 'Zombie', hp: 60, dmg: 7, range: 1.2, cd: 1.0, speed: 1.5, aggro: 7, scale: 1 },
  runner: { name: 'Zombie corridore', hp: 38, dmg: 5, range: 1.1, cd: 0.7, speed: 3.6, aggro: 9, scale: 0.9 },
  brute: { name: 'Zombie buttafuori', hp: 300, dmg: 22, range: 1.5, cd: 1.4, speed: 1.15, aggro: 6, scale: 1.35, sieger: true },
  boss: { name: 'Il Vigile Urbano Zombie', hp: 1800, dmg: 30, range: 1.6, cd: 1.3, speed: 1.4, aggro: 10, scale: 1.7, multa: { range: 9, dmg: 22, cd: 3 } },
};
export const ZTYPE_KEYS = Object.keys(ZTYPES);
export const BUILDS = {
  barricata: { name: 'Barricata', hp: 450, cost: { b: 2, t: 0 }, w: 2.5, d: 0.8, max: 20, key: 'B', desc: 'Cassette di birra: blocca la strada' },
  torretta: { name: 'Torretta', hp: 260, cost: { b: 3, t: 5 }, w: 1, d: 1, range: 10, dmg: 9, cd: 0.7, max: 10, key: 'N', desc: 'Spara tortellini da sola' },
};
export const BUILD_KEYS = Object.keys(BUILDS);
// capture spots: x, z, radius, income every 5 s
export const ZONES = [
  { id: 'piazzetta', name: 'Piazzetta', x: 45, z: 27, r: 5, inc: { b: 1, t: 1 } },
  { id: 'celtic', name: 'Celtic', x: 3, z: 38, r: 4, inc: { b: 3, t: 0 } },
  { id: 'sushi', name: 'Sushi', x: 23, z: 38, r: 4, inc: { b: 0, t: 3 } },
  { id: 'petroni', name: 'Via Petroni', x: 44, z: 55, r: 5, inc: { b: 2, t: 0 } },
  { id: 'checkpoint', name: 'Checkpoint', x: -41, z: 26.5, r: 4.5, inc: { b: 1, t: 1 } },
  { id: 'teletubby', name: 'Teletubbylandia', x: -71, z: 24, r: 7, inc: { b: 0, t: 2 } },
  { id: 'millennium', name: 'Millennium', x: 44, z: 84, r: 5, inc: { b: 4, t: 0 } },
  { id: 'verdi', name: 'Piazza Verdi', x: -3, z: 64, r: 5.5, inc: { b: 2, t: 1 } },
  { id: 'maggiore', name: 'Piazza Maggiore', x: -17, z: 88, r: 6, inc: { b: 2, t: 3 } },
];
export const HQ = { x: 13.1, z: 15.2, r: 3, hp: 1500, spawn: [11.6, 17.4], rally: [13.1, 23.0] };
const SPAWNS = [[-92, 14], [-92, 44], [-62, 49], [44, 89], [-17, 102]]; // meadow edges, out of the Millennium, San Petronio's steps
const SPAWNS_LATE = [[-20, 25], [44, 67]]; // tombini, from wave 5
// friends' nicknames per role (cycled, deterministic)
const NAMES = {
  teppista: ['Seghino', 'Lombu', 'Forla', 'Ricky Catta'],
  tortellini: ['Asche', 'Parme', 'Jacopo'],
  spritz: ['Ciccio', 'Cesco', 'Mirco'],
  rider: ['Ashish', 'Zuck'],
};
const ROMAN = ['', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X'];
export const COLORS = ['#c8f03c', '#5ad1ff', '#ff7a59', '#ff4fd8']; // commander colours
// n-th friend recruited in a role → nickname (the view sends n, the client rebuilds the name: no strings per tick)
export function unitName(role, n) { const list = NAMES[role] || ['Amico'], base = list[(n - 1) % list.length], gen = Math.floor((n - 1) / list.length); return base + (gen < ROMAN.length ? ROMAN[gen] : ' ' + (gen + 1)); }

// ------------------------------------------------------------------ grid
const GX0 = GRID.x0, GZ0 = GRID.z0, CELL = GRID.cell, GW = GRID.w, GH = GRID.h, NCELL = GW * GH;
let WALK = null;
function walkGrid() {
  if (WALK) return WALK;
  const bin = typeof atob === 'function' ? atob(GRID.b64) : Buffer.from(GRID.b64, 'base64').toString('binary');
  WALK = new Uint8Array(NCELL);
  for (let k = 0; k < NCELL; k++) WALK[k] = (bin.charCodeAt(k >> 3) >> (k & 7)) & 1;
  return WALK;
}
export const gridInfo = () => ({ x0: GX0, z0: GZ0, cell: CELL, w: GW, h: GH, walk: walkGrid() });
const ci = (x, z) => { const i = Math.floor((x - GX0) / CELL), j = Math.floor((z - GZ0) / CELL); return (i < 0 || j < 0 || i >= GW || j >= GH) ? -1 : j * GW + i; };
const cx = k => GX0 + ((k % GW) + 0.5) * CELL, cz = k => GZ0 + (((k / GW) | 0) + 0.5) * CELL;
function nearestWalk(x, z, maxR = 12) {
  const W = walkGrid(), k0 = ci(x, z);
  if (k0 >= 0 && W[k0]) return [x, z];
  const i0 = Math.floor((x - GX0) / CELL), j0 = Math.floor((z - GZ0) / CELL), R = Math.ceil(maxR / CELL);
  let best = null, bd = 1e9;
  for (let r = 1; r <= R && !best; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
    const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= GW || j >= GH) continue;
    const k = j * GW + i; if (!W[k]) continue;
    const d = di * di + dj * dj; if (d < bd) { bd = d; best = [cx(k), cz(k)]; }
  }
  return best;
}
// scratch for Dijkstra (single-threaded: shared by every match in the process)
const HEAP = new Int32Array(NCELL * 4), HPRI = new Uint16Array(NCELL * 4);
const NB = [[1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10], [1, 1, 14], [1, -1, 14], [-1, 1, 14], [-1, -1, 14]];
// distance field toward cell `goal` (Uint16, 65535 = unreachable); extra[k] adds cost (barricades)
function buildField(goal, extra) {
  const W = walkGrid(), dist = new Uint16Array(NCELL).fill(65535);
  let n = 0;
  const push = (k, p) => { let i = n++; while (i > 0) { const par = (i - 1) >> 1; if (HPRI[par] <= p) break; HEAP[i] = HEAP[par]; HPRI[i] = HPRI[par]; i = par; } HEAP[i] = k; HPRI[i] = p; };
  const pop = () => { const k = HEAP[0], last = --n; if (last > 0) { const lk = HEAP[last], lp = HPRI[last]; let i = 0; for (;;) { let c = 2 * i + 1; if (c >= last) break; if (c + 1 < last && HPRI[c + 1] < HPRI[c]) c++; if (HPRI[c] >= lp) break; HEAP[i] = HEAP[c]; HPRI[i] = HPRI[c]; i = c; } HEAP[i] = lk; HPRI[i] = lp; } return k; };
  dist[goal] = 0; push(goal, 0);
  while (n > 0) {
    const p = HPRI[0], k = pop(); if (p !== dist[k]) continue;
    const i = k % GW, j = (k / GW) | 0;
    for (let q = 0; q < 8; q++) {
      const ni = i + NB[q][0], nj = j + NB[q][1]; if (ni < 0 || nj < 0 || ni >= GW || nj >= GH) continue;
      const nk = nj * GW + ni; if (!W[nk]) continue;
      if (q >= 4 && (!W[j * GW + ni] || !W[nj * GW + i])) continue; // no corner cutting
      const nd = p + NB[q][2] + (extra ? extra[nk] : 0);
      if (nd < dist[nk] && nd < 65535 && n < HEAP.length) { dist[nk] = nd; push(nk, nd); }
    }
  }
  return dist;
}
// best step from (x,z) down the field: returns [dx,dz] unit-ish or null
function fieldDir(dist, x, z, out) {
  const k = ci(x, z); if (k < 0) return false;
  const i = k % GW, j = (k / GW) | 0, W = walkGrid();
  let best = dist[k], bk = -1;
  for (let q = 0; q < 8; q++) {
    const ni = i + NB[q][0], nj = j + NB[q][1]; if (ni < 0 || nj < 0 || ni >= GW || nj >= GH) continue;
    const nk = nj * GW + ni; if (!W[nk]) continue;
    if (q >= 4 && (!W[j * GW + ni] || !W[nj * GW + i])) continue;
    if (dist[nk] < best) { best = dist[nk]; bk = nk; }
  }
  if (bk < 0) return false;
  const dx = cx(bk) - x, dz = cz(bk) - z, l = Math.hypot(dx, dz) || 1;
  out[0] = dx / l; out[1] = dz / l; return true;
}

// ------------------------------------------------------------------ game
export function create({ players = [], opts = {}, seed = 1 } = {}) {
  const R = rng(seed);
  const diff = opts.difficulty === 'facile' ? 0.75 : opts.difficulty === 'difficile' ? 1.35 : 1;
  const WAVES = Math.max(3, Math.min(30, opts.waves | 0 || 12)), HOLD = Math.max(20, Math.min(600, opts.holdSecs | 0 || 90));
  const W = walkGrid();
  const solid = new Uint8Array(NCELL); // cells taken by buildings (no walking)
  const extra = new Uint8Array(NCELL); // flow-field extra cost (60 on barricades: zombies path through and break them)
  let costVer = 0;
  const snap = (p) => nearestWalk(p[0], p[1]) || p;
  const spawns = SPAWNS.map(snap), spawnsLate = SPAWNS_LATE.map(snap);
  const hqP = snap([HQ.x, HQ.z]), spawnP = snap(HQ.spawn), rallyP = snap(HQ.rally);
  const S = {
    t: 0, tick: 0, phase: 'prep', wave: 0, waves: WAVES, hold: HOLD, nextWave: opts.prep || 45, holdT: 0,
    res: { b: 14, t: 14 }, hq: { x: hqP[0], z: hqP[1], hp: HQ.hp, max: HQ.hp },
    players: [], units: [], zs: [], blds: [], queue: [], nextId: 1, nameN: {},
    zones: ZONES.map(z => { const p = snap([z.x, z.z]); return { id: z.id, x: p[0], z: p[1], r: z.r, own: 0, cap: 0 }; }),
    stats: { kills: 0, lost: 0, recruited: 0, built: 0, bossKills: 0, maxZones: 0 },
    log: [], over: null, incT: 5,
  };
  let events = [], shotsThisTick = 0, hitsThisTick = 0, diesThisTick = 0;
  const ev = (e) => { events.push(e); };
  const say = (txt) => { S.log.push({ t: Math.round(S.t), txt }); if (S.log.length > 6) S.log.shift(); ev({ k: 'msg', txt }); };

  // ---------- fields (cached; barricades bump costVer) ----------
  const fields = new Map(); // key -> { dist, ver, used }
  let fieldBudget = 0;
  function fieldTo(x, z) {
    let k = ci(x, z); if (k < 0 || !W[k]) { const p = nearestWalk(x, z); if (!p) return null; k = ci(p[0], p[1]); }
    let f = fields.get(k);
    if (f && (f.ver === costVer || fieldBudget <= 0)) { f.used = S.tick; return f.dist; }
    if (fieldBudget <= 0 && !f) fieldBudget = 1; // never leave someone without a field
    fieldBudget--;
    const dist = buildField(k, costVer ? extra : null);
    if (!f && fields.size >= 24) { let ok = null, ou = 1e18; for (const [kk, ff] of fields) if (ff.used < ou && ff !== f) { ou = ff.used; ok = kk; } if (ok !== null) fields.delete(ok); }
    fields.set(k, { dist, ver: costVer, used: S.tick });
    return dist;
  }

  // ---------- spatial hash (4 m buckets) ----------
  const HB = 4, HW = Math.ceil(GW * CELL / HB), HH = Math.ceil(GH * CELL / HB);
  const head = new Int32Array(HW * HH), next = new Int32Array(1024);
  let ents = []; // index -> entity (units then zombies), rebuilt per tick
  const bucket = (x, z) => { const i = Math.max(0, Math.min(HW - 1, Math.floor((x - GX0) / HB))), j = Math.max(0, Math.min(HH - 1, Math.floor((z - GZ0) / HB))); return j * HW + i; };
  function rehash() {
    ents.length = 0; for (const u of S.units) ents.push(u); for (const z of S.zs) ents.push(z);
    head.fill(-1); const n = Math.min(ents.length, next.length);
    for (let i = 0; i < n; i++) { const e = ents[i], b = bucket(e.x, e.z); next[i] = head[b]; head[b] = i; }
  }
  // visit entities within r of (x,z): fn(e, d2) — return true to stop
  function near(x, z, r, fn) {
    const i0 = Math.max(0, Math.floor((x - r - GX0) / HB)), i1 = Math.min(HW - 1, Math.floor((x + r - GX0) / HB));
    const j0 = Math.max(0, Math.floor((z - r - GZ0) / HB)), j1 = Math.min(HH - 1, Math.floor((z + r - GZ0) / HB));
    const r2 = r * r;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) for (let k = head[j * HW + i]; k >= 0; k = next[k]) {
      const e = ents[k]; if (e.hp <= 0) continue; const dx = e.x - x, dz = e.z - z, d2 = dx * dx + dz * dz; if (d2 <= r2 && fn(e, d2)) return;
    }
  }

  // ---------- movement ----------
  const free = (x, z) => { const k = ci(x, z); return k >= 0 && W[k] === 1 && !solid[k]; };
  function moveBy(e, dx, dz) {
    const nx = e.x + dx, nz = e.z + dz;
    if (free(nx, nz)) { e.x = nx; e.z = nz; return true; }
    if (free(nx, e.z)) { e.x = nx; return true; }
    if (free(e.x, nz)) { e.z = nz; return true; }
    return false;
  }
  const DIR = [0, 0];
  // step toward (tx,tz): direct when close and clear, else down the field. returns false if stuck
  function steer(e, tx, tz, speed, dt, field) {
    const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz);
    if (d < 0.05) return true;
    let ux, uz;
    if (d < 3.5 || !field) { ux = dx / d; uz = dz / d; }
    else if (fieldDir(field, e.x, e.z, DIR)) { ux = DIR[0]; uz = DIR[1]; }
    else { ux = dx / d; uz = dz / d; }
    const st = Math.min(d, speed * dt * (e.slow ? 0.6 : 1));
    e.yaw = Math.atan2(ux, uz);
    const ok = moveBy(e, ux * st, uz * st);
    e.stuck = ok ? 0 : (e.stuck || 0) + dt;
    return ok;
  }
  function separate(dt) {
    for (const e of ents) {
      if (e.hp <= 0) continue;
      let px = 0, pz = 0;
      near(e.x, e.z, 0.75, (o, d2) => {
        if (o === e || d2 < 1e-6) { if (o !== e) { px += ((e.id * 7) % 5 - 2) * 0.05; pz += ((e.id * 3) % 5 - 2) * 0.05; } return false; }
        const d = Math.sqrt(d2), k = (0.75 - d) / d; px += (e.x - o.x) * k; pz += (e.z - o.z) * k; return false;
      });
      if (px || pz) { const l = Math.hypot(px, pz), m = Math.min(l, 1.6 * dt) / l; moveBy(e, px * m, pz * m); }
    }
  }

  // ---------- players ----------
  function addPlayer(p, free = true) {
    if (S.players.find(x => x.id === p.id)) return;
    if (S.players.length >= meta.maxPlayers) return;
    const used = new Set(S.players.map(x => x.c)); let c = 0; while (used.has(c)) c++;
    S.players.push({ id: p.id, name: String(p.name || 'Comandante').slice(0, 20), c, bot: !!p.bot, kills: 0 });
    if (free) { spawnUnit(p.id, 'teppista'); spawnUnit(p.id, 'tortellini'); }
    if (S.tick > 0) say((p.name || 'Un comandante') + ' si unisce all\'assedio');
  }
  const nextName = (role) => (S.nameN[role] = (S.nameN[role] || 0) + 1);
  function spawnUnit(owner, role) {
    const R0 = ROLES[role], p = nearestWalk(spawnP[0] + R.range(-1, 1), spawnP[1] + R.range(-0.8, 0.8)) || spawnP;
    const nn = nextName(role);
    const u = { id: S.nextId++, o: owner, r: role, nn, n: unitName(role, nn), x: p[0], z: p[1], hp: R0.hp, mhp: R0.hp, yaw: 0, cd: 0, st: 0,
      ord: { k: 'move', tx: rallyP[0] + R.range(-2.5, 2.5), tz: rallyP[1] + R.range(-1.2, 1.2), gx: rallyP[0], gz: rallyP[1] }, tgt: 0, stuck: 0 };
    S.units.push(u); S.stats.recruited++;
    return u;
  }
  const unitCap = () => 12 + 8 * Math.max(1, S.players.length);
  const ZCAP = 140;

  // ---------- waves ----------
  function startWave() {
    S.wave++; S.phase = 'wave';
    const P = Math.max(1, S.players.length), n = S.wave;
    const count = Math.round((5 + n * 3.2) * (1 + 0.45 * (P - 1)) * diff);
    const list = [];
    for (let i = 0; i < count; i++) {
      const r = R.next();
      list.push(n >= 5 && r < 0.08 + n * 0.006 ? 'brute' : n >= 3 && r < 0.3 + n * 0.012 ? 'runner' : 'walker');
    }
    const boss = n === 6 || n === 10 || n === WAVES || (n > 10 && n % 4 === 0);
    if (boss) list.push('boss');
    const pts = n >= 5 ? spawns.concat(spawnsLate) : spawns;
    for (const ty of list) { const p = R.pick(pts); S.queue.push({ ty, x: p[0], z: p[1] }); }
    ev({ k: 'wave', n, boss, count: list.length });
    say(boss ? `Ondata ${n}: arriva il Vigile Urbano Zombie con la sua orda!` : `Ondata ${n}: ${list.length} zombie in arrivo`);
    if (boss) ev({ k: 'boss' });
  }
  function spawnZombie(q) {
    const T = ZTYPES[q.ty], hpK = (1 + 0.06 * (S.wave - 1)) * (q.ty === 'boss' ? (0.7 + 0.3 * Math.max(1, S.players.length)) : 1) * diff;
    const p = nearestWalk(q.x + R.range(-1.5, 1.5), q.z + R.range(-1.5, 1.5)) || [q.x, q.z];
    const goals = S.zones.filter(z => z.own === 1);
    const goal = (q.ty === 'brute' || q.ty === 'boss' || !goals.length || R.chance(0.35)) ? 'hq' : R.pick(goals).id;
    S.zs.push({ id: S.nextId++, ty: q.ty, x: p[0], z: p[1], hp: Math.round(T.hp * hpK), mhp: Math.round(T.hp * hpK), yaw: 0, cd: R.range(0, 1), st: 1, goal, tgt: 0, stuck: 0, mcd: 2 });
  }

  // ---------- buildings ----------
  function footprint(kind, x, z, rot) {
    const B = BUILDS[kind], w = rot ? B.d : B.w, d = rot ? B.w : B.d, cells = [];
    for (let zz = z - d / 2 + CELL / 2; zz < z + d / 2; zz += CELL) for (let xx = x - w / 2 + CELL / 2; xx < x + w / 2; xx += CELL) { const k = ci(xx, zz); if (k < 0 || !W[k] || solid[k]) return null; cells.push(k); }
    return cells;
  }
  function nearOwned(x, z, R0) {
    if (Math.hypot(x - S.hq.x, z - S.hq.z) < R0) return true;
    for (const zn of S.zones) if (zn.own === 1 && Math.hypot(x - zn.x, z - zn.z) < R0 + zn.r) return true;
    for (const u of S.units) if (Math.hypot(x - u.x, z - u.z) < 4) return true;
    return false;
  }
  function placeBuilding(owner, kind, x, z, rot) {
    const B = BUILDS[kind]; if (!B) return { ok: false, error: 'cosa?' };
    if (S.blds.filter(b => b.k === kind).length >= B.max) return { ok: false, error: 'Troppe ' + B.name.toLowerCase() };
    if (S.res.b < B.cost.b || S.res.t < B.cost.t) return { ok: false, error: 'Non bastano birre e tortellini' };
    if (!Number.isFinite(x) || !Number.isFinite(z)) return { ok: false, error: 'posizione' };
    if (Math.hypot(x - S.hq.x, z - S.hq.z) < 2.5) return { ok: false, error: 'Non davanti a casa' };
    if (!nearOwned(x, z, 16)) return { ok: false, error: 'Troppo lontano dalle tue zone' };
    for (const zn of S.zones) if (Math.hypot(x - zn.x, z - zn.z) < 1.5) return { ok: false, error: 'Non sulla bandiera' };
    const cells = footprint(kind, x, z, rot ? 1 : 0); if (!cells || !cells.length) return { ok: false, error: 'Lì non ci sta' };
    for (const e of S.units) { const k = ci(e.x, e.z); if (cells.includes(k)) return { ok: false, error: 'C\'è qualcuno in mezzo' }; }
    for (const e of S.zs) { const k = ci(e.x, e.z); if (cells.includes(k)) return { ok: false, error: 'C\'è uno zombie in mezzo' }; }
    S.res.b -= B.cost.b; S.res.t -= B.cost.t;
    for (const k of cells) { solid[k] = 1; if (kind === 'barricata') extra[k] = 60; }
    if (kind === 'barricata') costVer++;
    const b = { id: S.nextId++, k: kind, o: owner, x, z, rot: rot ? 1 : 0, cells, hp: B.hp, mhp: B.hp, cd: 0 };
    S.blds.push(b); S.stats.built++;
    ev({ k: 'build', kind, x, z, by: owner });
    return { ok: true, id: b.id };
  }
  function removeBuilding(b, refund) {
    for (const k of b.cells) { solid[k] = 0; extra[k] = 0; }
    if (b.k === 'barricata') costVer++;
    if (refund) { const B = BUILDS[b.k]; S.res.b += Math.floor(B.cost.b / 2); S.res.t += Math.floor(B.cost.t / 2); }
    const i = S.blds.indexOf(b); if (i >= 0) S.blds.splice(i, 1);
  }

  // ---------- combat helpers ----------
  const byId = (list, id) => { for (const e of list) if (e.id === id) return e; return null; };
  function damageZombie(z, dmg, by) {
    if (z.hp <= 0) return;
    z.hp -= dmg;
    if (hitsThisTick < 20) { hitsThisTick++; ev({ k: 'hit', x: r1(z.x), z: r1(z.z) }); }
    if (z.hp <= 0) {
      S.stats.kills++; if (z.ty === 'boss') { S.stats.bossKills++; say('Il Vigile Urbano Zombie è stato abbattuto. Niente multa stasera!'); ev({ k: 'bossdown', x: r1(z.x), z: r1(z.z) }); }
      if (by && by.o) { const p = S.players.find(p => p.id === by.o); if (p) p.kills++; }
      if (diesThisTick < 30) { diesThisTick++; ev({ k: 'zdie', x: r1(z.x), z: r1(z.z), ty: z.ty }); }
      // bounty: a little loot from the fallen
      if (z.ty === 'brute') S.res.t += 1; if (z.ty === 'boss') { S.res.b += 10; S.res.t += 10; }
    }
  }
  function damageUnit(u, dmg) {
    if (u.hp <= 0) return; u.hp -= dmg;
    if (u.hp <= 0) { S.stats.lost++; ev({ k: 'udie', x: r1(u.x), z: r1(u.z), name: u.n, o: u.o }); say(`${u.n} è a terra: lo portano a casa a braccio`); }
  }
  const shot = (f, to, kind) => { if (shotsThisTick < 30) { shotsThisTick++; ev({ k: 'shot', f: [r1(f.x), r1(f.z)], to: [r1(to.x), r1(to.z)], kind }); } };

  // ---------- per-tick logic ----------
  function tickUnits(dt) {
    for (const u of S.units) {
      if (u.hp <= 0) continue;
      const R0 = ROLES[u.r]; u.cd -= dt; u.st = 0;
      // healer: patch up the most hurt friend in reach
      if (R0.heal) {
        let best = null, bp = 0.999;
        near(u.x, u.z, 6, e => { if (e.r && e !== u && e.hp / e.mhp < bp) { bp = e.hp / e.mhp; best = e; } return false; });
        if (best) { best.hp = Math.min(best.mhp, best.hp + R0.heal * dt); u.st = 3; u.yaw = Math.atan2(best.x - u.x, best.z - u.z); if (u.cd <= 0) { u.cd = 1.2; ev({ k: 'heal', x: r1(best.x), z: r1(best.z) }); } }
      }
      // target
      let t = u.ord.k === 'attack' && u.ord.tid ? byId(S.zs, u.ord.tid) : null;
      if (t && t.hp <= 0) { t = null; u.ord.tid = 0; if (u.ord.k === 'attack') u.ord.k = 'idle'; }
      const hold = u.ord.k === 'hold', moving = u.ord.k === 'move';
      if (!t && !(moving && !u.ord.amove)) {
        const rr = hold ? R0.range + 0.3 : R0.aggro; let bd = 1e9;
        near(u.x, u.z, rr, (e, d2) => { if (e.ty && d2 < bd) { bd = d2; t = e; } return false; });
      }
      if (t) {
        const d = Math.hypot(t.x - u.x, t.z - u.z);
        if (d <= R0.range + (ZTYPES[t.ty].scale - 1) * 0.5) {
          u.yaw = Math.atan2(t.x - u.x, t.z - u.z); if (u.st !== 3) u.st = 2;
          if (u.cd <= 0) { u.cd = R0.cd; if (R0.range > 2) shot(u, t, u.r === 'spritz' ? 's' : 't'); damageZombie(t, R0.dmg, u); }
          continue;
        }
        if (!hold) { steer(u, t.x, t.z, R0.speed, dt, null); u.st = u.st || 1; if (u.stuck < 0.6) continue; }
      }
      if (moving) {
        const gd = Math.hypot(u.ord.gx - u.x, u.ord.gz - u.z);
        const near0 = gd < 3.5, tx = near0 ? u.ord.tx : u.ord.gx, tz = near0 ? u.ord.tz : u.ord.gz;
        const dd = Math.hypot(tx - u.x, tz - u.z);
        if (dd < 0.35 || (near0 && u.stuck > 1.2)) { u.ord = { k: 'idle' }; continue; }
        steer(u, tx, tz, R0.speed, dt, near0 ? null : fieldTo(u.ord.gx, u.ord.gz)); u.st = 1;
      }
    }
  }
  function zoneGoal(z) {
    if (z.goal !== 'hq') { const zn = S.zones.find(q => q.id === z.goal); if (zn && zn.own !== 2) return zn; z.goal = 'hq'; }
    return null;
  }
  function tickZombies(dt) {
    for (const z of S.zs) {
      if (z.hp <= 0) continue;
      const T = ZTYPES[z.ty]; z.cd -= dt; z.st = 1;
      // boss: throws fines at range
      if (T.multa) {
        z.mcd -= dt;
        if (z.mcd <= 0) { let tt = null, bd = T.multa.range * T.multa.range; near(z.x, z.z, T.multa.range, (e, d2) => { if (e.r && d2 < bd) { bd = d2; tt = e; } return false; }); if (tt) { z.mcd = T.multa.cd; shot(z, tt, 'multa'); damageUnit(tt, T.multa.dmg); } }
      }
      // nearest friend in aggro range
      let t = null, bd = T.aggro * T.aggro;
      near(z.x, z.z, T.aggro, (e, d2) => { if (e.r && d2 < bd) { bd = d2; t = e; } return false; });
      if (t) {
        const d = Math.sqrt(bd);
        if (d <= T.range + 0.2) { z.st = 2; z.yaw = Math.atan2(t.x - z.x, t.z - z.z); if (z.cd <= 0) { z.cd = T.cd; damageUnit(t, T.dmg); } continue; }
        steer(z, t.x, t.z, T.speed, dt, null);
        if (z.stuck < 0.6) continue;
      }
      // the house
      const dh = Math.hypot(S.hq.x - z.x, S.hq.z - z.z);
      if (dh <= HQ.r) { z.st = 2; z.yaw = Math.atan2(S.hq.x - z.x, S.hq.z - z.z); if (z.cd <= 0) { z.cd = T.cd; S.hq.hp -= T.dmg; if (!(S.tick % 5)) ev({ k: 'hq', hp: Math.max(0, Math.round(S.hq.hp)) }); } continue; }
      // stuck against a building (or a sieger next to one): break it
      if (z.stuck > 0.5 || T.sieger) {
        let bb = null, bdd = (T.sieger ? 2.4 : 1.6) ** 2;
        for (const b of S.blds) { const d2 = (b.x - z.x) ** 2 + (b.z - z.z) ** 2; if (d2 < bdd) { bdd = d2; bb = b; } }
        if (bb) { z.st = 2; z.yaw = Math.atan2(bb.x - z.x, bb.z - z.z); if (z.cd <= 0) { z.cd = T.cd; bb.hp -= T.dmg * (T.sieger ? 1.6 : 1); if (bb.hp <= 0) { ev({ k: 'bdie', x: bb.x, z: bb.z, kind: bb.k }); say(BUILDS[bb.k].name + ' distrutta!'); removeBuilding(bb, false); } } continue; }
      }
      // march: to a spot the friends hold, or to the house
      const zn = zoneGoal(z);
      if (zn) {
        const d = Math.hypot(zn.x - z.x, zn.z - z.z);
        if (d < zn.r * 0.7) { z.st = 0; continue; } // sits on the spot and contests it
        steer(z, zn.x, zn.z, T.speed, dt, fieldTo(zn.x, zn.z));
      } else steer(z, S.hq.x, S.hq.z, T.speed, dt, fieldTo(S.hq.x, S.hq.z));
    }
  }
  function tickBuildings(dt) {
    for (const b of S.blds) {
      if (b.k !== 'torretta') continue;
      const B = BUILDS.torretta; b.cd -= dt; if (b.cd > 0) continue;
      let t = null, bd = B.range * B.range; near(b.x, b.z, B.range, (e, d2) => { if (e.ty && d2 < bd) { bd = d2; t = e; } return false; });
      if (t) { b.cd = B.cd; b.yaw = Math.atan2(t.x - b.x, t.z - b.z); shot(b, t, 'torre'); damageZombie(t, B.dmg, b); }
    }
  }
  function tickZones(dt) {
    let owned = 0;
    for (const zn of S.zones) {
      let u = 0, z = 0;
      near(zn.x, zn.z, zn.r, e => { if (e.r) u += ROLES[e.r].capMul || 1; else z += e.ty === 'brute' || e.ty === 'boss' ? 2 : 1; return false; });
      const prev = zn.own;
      if (u && !z) zn.cap = Math.min(1, zn.cap + Math.min(0.5, 0.1 * u) * dt);
      else if (z && !u) zn.cap = Math.max(-1, zn.cap - Math.min(0.5, 0.08 * z) * dt);
      if (zn.cap >= 1) zn.own = 1; else if (zn.cap <= -1) zn.own = 2;
      else if ((zn.own === 1 && zn.cap <= 0) || (zn.own === 2 && zn.cap >= 0)) zn.own = 0;
      if (zn.own !== prev) {
        const Z0 = ZONES.find(q => q.id === zn.id);
        ev({ k: 'cap', zone: zn.id, own: zn.own });
        if (zn.own === 1) say(`${Z0.name} è nostra!`); else if (zn.own === 2) say(`Gli zombie si sono presi ${Z0.name}`); else if (prev === 1) say(`Stiamo perdendo ${Z0.name}`);
      }
      if (zn.own === 1) owned++;
    }
    S.stats.maxZones = Math.max(S.stats.maxZones, owned);
    return owned;
  }
  function cleanup() {
    for (let i = S.units.length - 1; i >= 0; i--) if (S.units[i].hp <= 0) S.units.splice(i, 1);
    for (let i = S.zs.length - 1; i >= 0; i--) if (S.zs[i].hp <= 0) S.zs.splice(i, 1);
  }
  function finish(win, why) {
    if (S.over) return;
    S.phase = 'over';
    const score = Math.round(S.stats.kills * 10 + S.wave * 150 + S.stats.maxZones * 120 + (win ? 2000 : 0) + Math.max(0, S.hq.hp) * 0.5);
    const scores = {}; for (const p of S.players) scores[p.id] = p.kills;
    S.over = { win, why, winners: win ? S.players.map(p => p.id) : [], scores, score, wave: S.wave, kills: S.stats.kills, zones: S.stats.maxZones, time: Math.round(S.t),
      summary: win ? (why === 'hold' ? `Il quartiere è vostro! Tenute tutte le zone per ${HOLD} s` : `Assedio respinto: ${S.wave} ondate`) : `La casa è caduta all'ondata ${S.wave}` };
    ev({ k: win ? 'win' : 'lose', why });
  }

  function tick(dt) {
    if (S.over) return;
    dt = Math.min(0.25, Math.max(0, dt || 0.1));
    S.t += dt; S.tick++; shotsThisTick = 0; hitsThisTick = 0; diesThisTick = 0; fieldBudget = 2;
    // waves
    if (S.phase !== 'over') {
      if (S.queue.length) {
        let n = 0; while (S.queue.length && n < 4 && S.zs.length < ZCAP) { spawnZombie(S.queue.shift()); n++; }
      } else if (S.wave < WAVES || S.phase === 'prep') {
        if (S.phase === 'wave' && S.zs.length === 0) S.nextWave = Math.min(S.nextWave, 10);
        S.nextWave -= dt;
        if (S.nextWave <= 0) { S.nextWave = 40; startWave(); }
      }
    }
    // income
    S.incT -= dt;
    if (S.incT <= 0) {
      S.incT = 5; S.res.b += 1; S.res.t += 1;
      for (const zn of S.zones) if (zn.own === 1) { const Z0 = ZONES.find(q => q.id === zn.id); S.res.b += Z0.inc.b; S.res.t += Z0.inc.t; }
      S.res.b = Math.min(S.res.b, 999); S.res.t = Math.min(S.res.t, 999);
    }
    rehash();
    tickUnits(dt); tickZombies(dt); tickBuildings(dt);
    separate(dt);
    const owned = tickZones(dt);
    cleanup();
    // end
    if (S.hq.hp <= 0) { S.hq.hp = 0; finish(false, 'hq'); return; }
    if (owned === S.zones.length) { S.holdT += dt; if (S.holdT >= HOLD) { finish(true, 'hold'); return; } } else S.holdT = Math.max(0, S.holdT - dt * 2);
    if (S.wave >= WAVES && !S.queue.length && S.zs.length === 0) finish(true, 'waves');
  }

  // ---------- actions ----------
  const mine = (pid, ids) => { const set = new Set((Array.isArray(ids) ? ids : []).slice(0, 80).map(Number)); return S.units.filter(u => set.has(u.id) && u.o === pid && u.hp > 0); };
  function act(pid, a) {
    if (!a || typeof a !== 'object') return { ok: false, error: 'azione?' };
    const P = S.players.find(p => p.id === pid); if (!P) return { ok: false, error: 'non sei in partita' };
    if (S.over && a.k !== 'ping') return { ok: false, error: 'partita finita' };
    switch (a.k) {
      case 'recruit': {
        const R0 = ROLES[a.role]; if (!R0) return { ok: false, error: 'ruolo?' };
        if (S.units.length >= unitCap()) return { ok: false, error: 'Casa piena: troppi amici in giro' };
        if (S.res.b < R0.cost.b || S.res.t < R0.cost.t) return { ok: false, error: 'Non bastano birre e tortellini' };
        S.res.b -= R0.cost.b; S.res.t -= R0.cost.t;
        const u = spawnUnit(pid, a.role);
        ev({ k: 'recruit', name: u.n, role: a.role, by: pid, id: u.id });
        return { ok: true, id: u.id };
      }
      case 'move': case 'attack': {
        const us = mine(pid, a.ids); if (!us.length) return { ok: false, error: 'nessuno selezionato' };
        if (a.k === 'attack' && a.tid) { const t = byId(S.zs, +a.tid); if (!t) return { ok: false, error: 'bersaglio?' }; for (const u of us) u.ord = { k: 'attack', tid: t.id }; return { ok: true }; }
        const x = +a.x, z = +a.z; if (!Number.isFinite(x) || !Number.isFinite(z)) return { ok: false, error: 'dove?' };
        const g = nearestWalk(x, z, 6); if (!g) return { ok: false, error: 'Lì non si arriva' };
        // formation: spiral offsets around the point, each on walkable ground
        let i = 0; const amove = a.k === 'attack' || !!a.amove;
        for (const u of us) {
          const ang = i * 2.39996, rr = i ? 0.95 * Math.sqrt(i) : 0; i++;
          const p = nearestWalk(g[0] + Math.cos(ang) * rr, g[1] + Math.sin(ang) * rr, 3) || g;
          u.ord = { k: 'move', gx: g[0], gz: g[1], tx: p[0], tz: p[1], amove }; u.stuck = 0;
        }
        return { ok: true };
      }
      case 'hold': case 'stop': { const us = mine(pid, a.ids); for (const u of us) u.ord = { k: a.k === 'hold' ? 'hold' : 'idle' }; return { ok: !!us.length }; }
      case 'build': return placeBuilding(pid, a.kind, +a.x, +a.z, a.rot);
      case 'demolish': { const b = byId(S.blds, +a.id); if (!b) return { ok: false, error: 'cosa?' }; removeBuilding(b, true); ev({ k: 'bdie', x: b.x, z: b.z, kind: b.k, sold: true }); return { ok: true }; }
      case 'next': { if (S.queue.length || S.wave >= WAVES) return { ok: false, error: 'Già in arrivo' }; if (S.nextWave > 3) { S.res.b += 2; S.res.t += 2; S.nextWave = 0.01; } return { ok: true }; }
      case 'ping': { const x = +a.x, z = +a.z; if (!Number.isFinite(x)) return { ok: false }; ev({ k: 'ping', x: r1(x), z: r1(z), by: pid, c: P.c }); return { ok: true }; }
      case 'surrender': { finish(false, 'resa'); return { ok: true }; }
      default: return { ok: false, error: 'azione sconosciuta' };
    }
  }

  // ---------- view ----------
  const r1 = v => Math.round(v * 10) / 10;
  function view(pid) {
    const pIdx = new Map(S.players.map((p, i) => [p.id, i]));
    // compact tuples (no strings, no facing: the client derives it): u = [id, role, owner, x10, z10, hp%, state, nameN]
    const u = [];
    for (const e of S.units) u.push(e.id, ROLE_KEYS.indexOf(e.r), pIdx.has(e.o) ? pIdx.get(e.o) : 0, Math.round(e.x * 10), Math.round(e.z * 10), Math.max(0, Math.round(e.hp / e.mhp * 100)), e.st, e.nn || 0);
    const z = []; // [id, type, x10, z10, hp%, state]
    for (const e of S.zs) z.push(e.id, ZTYPE_KEYS.indexOf(e.ty), Math.round(e.x * 10), Math.round(e.z * 10), Math.max(0, Math.round(e.hp / e.mhp * 100)), e.st);
    const b = [];
    for (const e of S.blds) b.push(e.id, BUILD_KEYS.indexOf(e.k), pIdx.has(e.o) ? pIdx.get(e.o) : 0, Math.round(e.x * 10), Math.round(e.z * 10), e.rot, Math.max(0, Math.round(e.hp / e.mhp * 100)), Math.round((e.yaw || 0) * 100));
    return {
      v: 1, t: r1(S.t), ph: S.phase, wave: S.wave, waves: WAVES, nw: Math.max(0, Math.ceil(S.nextWave)), queued: S.queue.length,
      res: [S.res.b, S.res.t], hq: [r1(S.hq.x), r1(S.hq.z), Math.max(0, Math.round(S.hq.hp)), S.hq.max],
      zones: S.zones.map(q => [q.own, Math.round(q.cap * 100)]), hold: r1(S.holdT), holdNeed: HOLD,
      pl: S.players.map(p => ({ id: p.id, name: p.name, c: p.c, kills: p.kills })), me: pIdx.has(pid) ? pIdx.get(pid) : -1,
      u, z, b, cap: unitCap(), log: S.log.slice(-5), stats: S.stats, over: S.over,
    };
  }

  for (const p of players) addPlayer(p, true);
  return {
    act, tick, view,
    drain() { const e = events; events = []; return e; },
    join(p) { addPlayer(p, true); },
    leave(pid) {
      const i = S.players.findIndex(p => p.id === pid); if (i < 0) return;
      S.players.splice(i, 1);
      const heir = S.players[0];
      if (heir) { for (const u of S.units) if (u.o === pid) u.o = heir.id; for (const b of S.blds) if (b.o === pid) b.o = heir.id; say('Gli amici di chi è uscito passano a ' + heir.name); }
    },
    get over() { return S.over; },
    get state() { return S; }, // debug / tests
  };
}
