// shared/gulag_coop.mjs — "Il Gulag profondo" in co-op (2–4 friends): the same seeded floor as the solo run
// (shared/gulag.mjs generate()), but the referee simulates the ENEMIES (zombie guards, mutant pigeons, the Secondino):
// spawn, chase the nearest standing player, attacks and damage. Clients render them as puppets (combat/ enemies) and
// send their hits; the referee checks them (alive, in range, damage cap per hit and per second). Shared: floor, doors,
// wallet (buoni pasto), vizi (perks), score, run timer. Per player: health, weapons. A player at 0 hp goes DOWN: a friend
// revives them holding E next to them (2.5 s); after 30 s down they are OUT until the next room is cleared.
// Everyone down/out = the run is over. Bots (offline / fill) are simple allies that shoot and revive.
// opts: { seed?, daily?: 'YYYY-MM-DD' }
// Actions:
//   { p: [x, z, yaw] }                 my position (≈10 Hz; speed cap, arena bounds)
//   { h: [[enemyId, dmg, head], ...] } my hits since the last batch
//   { rv: playerId }                   I'm reviving them (repeat ≈4 Hz while holding E)
//   { move: 'n'|'s'|'e'|'w' } · { pick: i } · { open: true } · { buy: i } · { quit: true }
// view(id): { seed, daily, ph, room, rooms, coins, perks, offer, shop, kills, cleared, score, t, maxHp, mods, me,
//   pl:[{ id, name, bot, x, z, yaw, hp, max, st:'ok'|'down'|'out', rv, dn }], mine:{ hp, weapons, felpa }, weapons,
//   en:[[id, type 0 zombie|1 pigeon|2 boss, x, z, y, yaw, hp, max, st 0 rise|1 chase|2 attack|3 dead, atk, level]], wave:[i, n], over }
import { rng } from './rng.mjs';
import { generate, seedOf, PERKS, RARITIES } from './gulag.mjs';

export const meta = { type: 'gulag_coop', name: 'Gulag profondo co-op', minPlayers: 1, maxPlayers: 4, tickHz: 15, viewHz: 10, dropIn: false };
// the run arena (src/gulag/index.js builds it here, far from the map): one room at a time, reconfigured per room
export const ARENA = { x0: 24, x1: 44, z0: -44, z1: -30 };
export const AC = { x: (ARENA.x0 + ARENA.x1) / 2, z: (ARENA.z0 + ARENA.z1) / 2 };
export const LAYOUTS = [[], [[-4, -2.5], [4, 2.5]], [[-4, 2.5], [4, -2.5], [0, 0]], [[-6, 0], [6, 0]], [[-3, -3], [3, -3], [-3, 3], [3, 3]], [[0, -3], [0, 3]]];
export const DECO = [[ARENA.x0 + 1.4, ARENA.z1 - 3.2, ARENA.x0 + 5, ARENA.z1], [ARENA.x1 - 5, ARENA.z1 - 3.2, ARENA.x1 - 1.4, ARENA.z1], [ARENA.x0 + 1.4, ARENA.z0, ARENA.x0 + 5, ARENA.z0 + 3.2], [ARENA.x1 - 5, ARENA.z0, ARENA.x1 - 1.4, ARENA.z0 + 3.2]];
export const ENTER = { n: [AC.x, ARENA.z1 - 1.6], s: [AC.x, ARENA.z0 + 1.6], e: [ARENA.x1 - 1.6, AC.z], w: [ARENA.x0 + 1.6, AC.z] };
export const VMAX = 6.5, HIT_MAX = 800, DPS_CAP = 1400, DPS_BURST = 2600, REVIVE_T = 2.5, DOWN_T = 30, REVIVE_R = 2.3;
const OPP = { n: 's', s: 'n', e: 'w', w: 'e' };
const POOL_CAP = { zombie: 12, pigeon: 8, boss: 1 };
const BASES = ['pistola', 'tortellini', 'nerf', 'spritz'];
const T_CODE = { zombie: 0, pigeon: 1, boss: 2 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r2 = v => Math.round(v * 100) / 100;
const wrapA = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
// blocking rectangles of a room (pillars of its layout + the cell decor + chest / shop counter) — same as the client
export function roomRects(room) {
  const out = [];
  if (!room) return out;
  for (const [dx, dz] of LAYOUTS[room.layout % LAYOUTS.length]) out.push([AC.x + dx - 0.55, AC.z + dz - 0.55, AC.x + dx + 0.55, AC.z + dz + 0.55]);
  for (const r of DECO) out.push(r);
  if (room.type === 'chest') out.push([AC.x - 0.6, AC.z - 0.4, AC.x + 0.6, AC.z + 0.4]);
  if (room.type === 'shop') out.push([AC.x - 2, ARENA.z1 - 2.6, AC.x + 2, ARENA.z1 - 1.8]);
  return out;
}
export function walkable(rects, x, z, r = 0.3) {
  if (x < ARENA.x0 + 0.2 + r || x > ARENA.x1 - 0.2 - r || z < ARENA.z0 + 0.2 + r || z > ARENA.z1 - 0.2 - r) return false;
  for (const b of rects) if (x > b[0] - r && x < b[2] + r && z > b[1] - r && z < b[3] + r) return false;
  return true;
}
// enemy stats = combat/enemies.js formulas
export function enemyStats(t, L) {
  const k = 1 + 0.28 * (L - 1);
  if (t === 'boss') return { max: Math.round(650 * (1 + 0.25 * (L - 1))), dmg: 22 * (1 + 0.1 * (L - 1)), sp: 1.45 };
  if (t === 'pigeon') return { max: Math.round(18 * (1 + 0.2 * (L - 1))), dmg: 5 * (1 + 0.1 * (L - 1)), sp: 6.5 };
  return { max: Math.round(60 * k), dmg: 10 * (1 + 0.12 * (L - 1)), sp: 1.95 + Math.min(0.6, 0.06 * L) };
}

export function create({ players = [], opts = {}, seed = 1 } = {}) {
  const daily = typeof opts.daily === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(opts.daily) ? opts.daily : null;
  const runSeed = daily ? seedOf('gulag:' + daily) : (Number.isFinite(+opts.seed) && +opts.seed > 0 ? (+opts.seed >>> 0) : seed >>> 0);
  const R = rng(runSeed ^ 0x2c00b);
  const rooms = generate(runSeed);
  const pl = new Map();
  players.slice(0, 4).forEach((p, i) => pl.set(p.id, { id: p.id, i, name: String(p.name || 'Giocatore').slice(0, 16), bot: !!p.bot, x: AC.x + (i - 1.5) * 1.2, z: AC.z - 3.5, yaw: 0, hp: 100, st: 'ok', downT: 0, rv: null, weapons: [{ base: 'pistola', rarity: 'comune' }], kills: 0, dmg: 0, rt: 0, holdT: 0, bucket: DPS_BURST, usedLife: false, felpa: false, gone: false, cool: 0, think: 0, tx: 0, tz: 0, revT: 0 }));
  const S = { cur: 0, coins: 0, kills: 0, cleared: 0, perks: [], offer: null, shop: null, over: null, ev: [], t: 0, boss: false, ph: 'room', wave: -1, waveT: 0, en: [], nid: 1, rects: roomRects(rooms[0]), roomT: 0, deadT: 0 };
  rooms[0].visited = true; rooms[0].cleared = true;
  const push = e => { if (S.ev.length < 80) S.ev.push(e); };
  const cur = () => rooms[S.cur];
  const has = k => S.perks.includes(k);
  const sum = f => S.perks.reduce((a, p) => a + ((PERKS[p] && PERKS[p][f]) || 0), 0);
  const maxHp = () => 100 + sum('maxHp');
  const live = () => [...pl.values()].filter(p => !p.gone);
  const standing = () => live().filter(p => p.st === 'ok');
  const nHum = () => Math.max(1, live().length);
  function rollWeapon(minR = 0) { let ri = minR; while (ri < 4 && R.chance(0.42)) ri++; return { base: BASES[R.int(BASES.length)], rarity: RARITIES[ri], doppio: has('tortellino') }; }
  function giveWeapon(p, w) {
    if (p.weapons.length < 3) p.weapons.push(w);
    else { let lo = 0; for (let i = 1; i < 3; i++) if (RARITIES.indexOf(p.weapons[i].rarity) < RARITIES.indexOf(p.weapons[lo].rarity)) lo = i; p.weapons[lo] = w; }
    push({ k: 'weapon', id: p.id, w });
  }
  function offerPerks(n = 3) { const pool = Object.keys(PERKS).filter(p => !S.perks.includes(p)); R.shuffle(pool); S.offer = pool.slice(0, n); push({ k: 'offer', perks: S.offer }); }
  function makeShop() { S.shop = [{ id: 'brodo', name: 'Brodo della nonna (+40 vita a chi lo compra)', price: 5 }, { id: 'perk', name: 'Un vizio a scelta per la squadra', price: 14 }, { id: 'weapon', name: 'Arma rara o meglio', price: 11 }, { id: 'armor', name: 'Felpa imbottita (+20% armatura per la stanza)', price: 6 }].map(x => ({ ...x, sold: false })); }
  function score() { return S.cleared * 100 + S.kills * 10 + S.coins * 5 + (S.boss ? 2500 : 0) + S.perks.length * 20; }
  function end(victory, why) {
    if (S.over) return;
    S.ph = 'over';
    const tb = victory ? Math.max(0, Math.round((900 - S.t) * 2)) : 0, sc = score() + tb, gettoni = Math.floor(sc / 300) + (victory ? 5 : 0);
    const list = [...pl.values()], mvp = list.slice().sort((a, b) => b.kills - a.kills || b.dmg - a.dmg)[0];
    S.over = { winners: victory ? list.filter(p => !p.bot).map(p => p.id) : [], scores: Object.fromEntries(list.map(p => [p.id, sc])), victory: !!victory, score: sc, timeBonus: tb, gettoni,
      rooms: S.cleared, kills: S.kills, time: Math.round(S.t), daily, seed: runSeed, mvp: mvp ? mvp.name : null,
      team: list.map(p => ({ id: p.id, name: p.name, kills: p.kills, dmg: Math.round(p.dmg), bot: p.bot })),
      summary: victory ? `Il Secondino è a terra: la squadra è evasa dal Gulag in ${Math.floor(S.t / 60)}:${String(Math.floor(S.t % 60)).padStart(2, '0')}!` : (why || 'La squadra è rimasta nel Gulag.') };
    push({ k: 'over', victory: !!victory, score: sc });
  }
  // ---------------- rooms / waves / enemies
  function placeTeam(side) {
    const at = ENTER[side] || [AC.x, AC.z - 3.5], horiz = side === 'n' || side === 's';
    let k = 0;
    for (const p of pl.values()) {
      const off = (k++ - (pl.size - 1) / 2) * 1.1;
      p.x = at[0] + (horiz ? off : 0); p.z = at[1] + (horiz ? 0 : off); p.rt = S.t; p.holdT = S.t + 0.6;
      if (!walkable(S.rects, p.x, p.z, 0.3)) { p.x = at[0]; p.z = at[1]; }
    }
  }
  function enterRoom(to, from) {
    S.cur = to; const n = rooms[to]; const first = !n.visited; n.visited = true;
    S.rects = roomRects(n); S.en = []; S.wave = -1; S.waveT = 1.4; S.roomT = 0;
    if (n.type === 'chest' || n.type === 'shop' || n.type === 'start') n.cleared = true;
    if (n.type === 'shop' && !S.shop) makeShop();
    S.ph = n.cleared ? 'room' : 'fight';
    for (const p of pl.values()) p.felpa = false;
    placeTeam(from);
    push({ k: 'enter', room: to, from, first, type: n.type });
  }
  function spawnWave() {
    const r = cur(); S.wave++; const wave = r.waves[S.wave]; if (!wave) return;
    const k = 1 + 0.5 * (nHum() - 1);
    for (const grp of wave) {
      const aliveT = S.en.filter(e => e.st !== 3 && e.t === grp.t).length, cap = POOL_CAP[grp.t] || 1; // the clients' enemy pools (combat/enemies.js)
      const count = Math.max(0, Math.min(cap - aliveT, grp.t === 'boss' ? grp.n : Math.round(grp.n * k)));
      for (let i = 0; i < count; i++) {
        let x = AC.x, z = ARENA.z1 - 2.5, okp = false;
        for (let t = 0; t < 30 && !okp; t++) {
          x = ARENA.x0 + 1.6 + R.next() * (ARENA.x1 - ARENA.x0 - 3.2); z = ARENA.z0 + 1.6 + R.next() * (ARENA.z1 - ARENA.z0 - 3.2);
          okp = walkable(S.rects, x, z, 0.5) && live().every(p => Math.hypot(x - p.x, z - p.z) > 5.5);
        }
        const st = enemyStats(grp.t, grp.lv);
        const max = grp.t === 'boss' ? Math.round(st.max * (1 + 0.6 * (nHum() - 1))) : st.max;
        S.en.push({ id: S.nid++, t: grp.t, lv: grp.lv, x, z, y: grp.t === 'pigeon' ? 3.1 : 0, yaw: R.next() * 6.28, hp: max, max, sp: st.sp, dmg: st.dmg, st: grp.t === 'pigeon' ? 1 : 0, riseT: 0, cool: 0.4 + R.next() * 0.6, atkT: 0, atk: 0, tg: null, side: R.chance(0.5) ? 1 : -1, deadT: 0, throwT: 3, ang: R.next() * 6.28, rad: 2.5 + R.next() * 2, dive: 0, alt: 2.6 + R.next() * 0.6 });
      }
    }
    push({ k: 'wave', i: S.wave, n: r.waves.length });
  }
  function roomCleared() {
    const r = cur(); r.cleared = true; S.cleared++; S.ph = 'room';
    const need = S.en.length;
    const coins = 2 + Math.floor(r.depth / 2) + R.int(3) + sum('coinPerKill') * need + (r.type === 'elite' ? 8 : 0); S.coins += coins;
    const heal = sum('roomHeal');
    for (const p of live()) { if (p.st !== 'ok') { p.st = 'ok'; p.hp = Math.round(maxHp() * 0.3); p.rv = null; push({ k: 'up', id: p.id, by: null }); } else if (heal) p.hp = Math.min(maxHp(), p.hp + heal); }
    push({ k: 'cleared', room: r.id, coins, heal });
    if (r.type === 'elite') offerPerks(3);
    else if (r.type === 'boss') { S.boss = true; end(true); }
    else if (R.chance(0.3)) { const ps = live(); giveWeapon(ps[R.int(ps.length)], rollWeapon(0)); }
  }
  function hurt(p, n, e) {
    if (p.st !== 'ok' || p.holdT > S.t) return;
    const armor = Math.min(0.8, sum('armor') + (p.felpa ? 0.2 : 0));
    const d = Math.max(0, n * (1 - armor)); if (!d) return;
    p.hp -= d; push({ k: 'hurt', id: p.id, n: Math.round(n * 10) / 10, e: e ? e.id : 0, et: e ? e.t : '' });
    if (p.hp <= 0) {
      if (has('crescentina') && !p.usedLife) { p.usedLife = true; p.hp = Math.round(maxHp() / 2); p.holdT = S.t + 2.5; push({ k: 'revive', id: p.id, self: true }); return; }
      p.hp = 0; p.st = 'down'; p.downT = 0; p.rv = null; push({ k: 'down', id: p.id, name: p.name });
      if (!standing().length) end(false, 'Tutta la squadra è a terra: siete rimasti nel Gulag.');
    }
  }
  function nearest(x, z) { let best = null, bd = 1e9; for (const p of pl.values()) { if (p.gone || p.st !== 'ok') continue; const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p; } } return best ? { p: best, d: bd } : null; }
  function moveEnemy(e, want, dt) {
    const sp = want * dt;
    for (const off of [0, e.side * 0.6, e.side * 1.2, e.side * 1.8, -e.side * 0.6, -e.side * 1.2]) {
      const a = e.yaw + off, nx = e.x + Math.sin(a) * sp, nz = e.z + Math.cos(a) * sp;
      if (walkable(S.rects, nx, nz, e.t === 'boss' ? 0.42 : 0.3)) { e.x = nx; e.z = nz; if (off && Math.sign(off) === -e.side) e.side = -e.side; return true; }
    }
    e.side = -e.side; return false;
  }
  function stepEnemies(dt) {
    for (const e of S.en) {
      if (e.st === 3) { e.deadT += dt; continue; }
      if (e.st === 0) { e.riseT += dt; if (e.riseT >= 1.1) e.st = 1; continue; }
      e.cool = Math.max(0, e.cool - dt);
      const N = nearest(e.x, e.z);
      if (!N) continue;
      const tg = N.p, d = N.d; e.tg = tg.id;
      if (e.t === 'pigeon') {
        e.cool -= 0;
        if (e.dive > 0) {
          e.dive += dt; const dx = tg.x - e.x, dz = tg.z - e.z, L = Math.hypot(dx, dz) || 1; e.x += dx / L * Math.min(L, 9 * dt); e.z += dz / L * Math.min(L, 9 * dt); e.y += (1.5 - e.y) * Math.min(1, dt * 5); e.yaw = Math.atan2(dx, dz);
          if (L < 0.8) { hurt(tg, e.dmg, e); e.dive = 0; e.cool = 2.5 + R.next() * 2.5; e.atk++; }
          else if (e.dive > 3) { e.dive = 0; e.cool = 2; }
        } else {
          e.ang += dt * (5.5 / e.rad); const gx = tg.x + Math.cos(e.ang) * e.rad, gz = tg.z + Math.sin(e.ang) * e.rad;
          const dx = gx - e.x, dz = gz - e.z, L = Math.hypot(dx, dz) || 1; e.x += dx / L * Math.min(L, e.sp * dt); e.z += dz / L * Math.min(L, e.sp * dt); e.y += (e.alt - e.y) * Math.min(1, dt * 2); e.yaw = Math.atan2(dx, dz);
          if (e.cool <= 0 && R.next() < dt * 0.5) { e.dive = 0.01; e.atk++; }
        }
        e.x = clamp(e.x, ARENA.x0 + 0.5, ARENA.x1 - 0.5); e.z = clamp(e.z, ARENA.z0 + 0.5, ARENA.z1 - 0.5);
        continue;
      }
      const reach = e.t === 'boss' ? 1.9 : 1.15, tyaw = Math.atan2(tg.x - e.x, tg.z - e.z);
      e.yaw += wrapA(tyaw - e.yaw) * Math.min(1, dt * (e.st === 2 ? 6 : 3.2));
      if (e.st === 1) {
        if (d < reach && e.cool <= 0) { e.st = 2; e.atkT = 0; e.hit = false; e.atk++; }
        else if (d > reach * 0.8) moveEnemy(e, e.sp * (e.t === 'boss' ? 1 : d > 6 ? 1 : 0.8), dt);
        if (e.t === 'boss') { e.throwT -= dt; if (e.throwT <= 0 && d > 4 && d < 16) { e.throwT = 2.8 + R.next() * 1.4; e.atk++; push({ k: 'multa', e: e.id, tg: tg.id }); if (R.next() < 0.6) hurt(tg, 8 + e.lv, e); } }
      } else if (e.st === 2) {
        e.atkT += dt;
        if (!e.hit && e.atkT > 0.45) { e.hit = true; if (d < (e.t === 'boss' ? 2.4 : 1.6)) hurt(tg, e.dmg, e); }
        if (e.atkT > 1.05) { e.st = 1; e.cool = e.t === 'boss' ? 1.2 : 0.6 + R.next() * 0.5; }
      }
    }
    // no overlap between enemies on the ground, nor with the players
    for (const e of S.en) if (e.st !== 3 && e.t !== 'pigeon') {
      for (const o of S.en) if (o !== e && o.st !== 3 && o.t !== 'pigeon') { const ox = e.x - o.x, oz = e.z - o.z, od = Math.hypot(ox, oz), m = e.t === 'boss' || o.t === 'boss' ? 0.75 : 0.64; if (od < m && od > 1e-3) { e.x += ox / od * (m - od) * 0.5; e.z += oz / od * (m - od) * 0.5; } }
      for (const p of pl.values()) { if (p.gone) continue; const dx = e.x - p.x, dz = e.z - p.z, dd = Math.hypot(dx, dz); if (dd < 0.55 && dd > 1e-3) { e.x += dx / dd * (0.55 - dd); e.z += dz / dd * (0.55 - dd); } }
    }
    S.en = S.en.filter(e => !(e.st === 3 && e.deadT > 1.6));
  }
  function damageEnemy(p, e, dmg) {
    if (!e || e.st === 3 || (e.st === 0 && e.riseT < 0.6)) return false;
    e.hp -= dmg; p.dmg += Math.min(dmg, e.hp + dmg);
    if (e.hp <= 0) { e.hp = 0; e.st = 3; e.deadT = 0; p.kills++; S.kills++; push({ k: 'kill', e: e.id, by: p.id, t: e.t }); }
    return true;
  }
  // ---------------- bots: walk toward the nearest enemy, keep ~5 m, shoot; revive a downed friend nearby
  function botStep(p, dt) {
    if (p.st !== 'ok') return;
    p.cool -= dt; p.think -= dt;
    const downed = [...pl.values()].find(o => o !== p && !o.gone && o.st === 'down');
    let tx = p.x, tz = p.z;
    const alive = S.en.filter(e => e.st !== 3 && !(e.st === 0 && e.riseT < 0.6));
    if (downed && (!alive.length || Math.hypot(downed.x - p.x, downed.z - p.z) < 6)) {
      tx = downed.x + 0.8; tz = downed.z;
      if (Math.hypot(downed.x - p.x, downed.z - p.z) < REVIVE_R - 0.3) { downed.rv = { by: p.id, t: (downed.rv && downed.rv.by === p.id ? downed.rv.t : 0), at: S.t }; tx = p.x; tz = p.z; }
    } else if (alive.length) {
      let e = alive[0], bd = 1e9; for (const x of alive) { const d = Math.hypot(x.x - p.x, x.z - p.z); if (d < bd) { bd = d; e = x; } }
      if (bd > 6) { tx = e.x; tz = e.z; } else if (bd < 3.5) { tx = p.x - (e.x - p.x); tz = p.z - (e.z - p.z); }
      p.yaw = Math.atan2(e.x - p.x, e.z - p.z);
      if (p.cool <= 0 && bd < 16) { p.cool = 0.55 + R.next() * 0.3; if (R.next() < 0.7) damageEnemy(p, e, 14 * (1 + sum('dmg')) * (1 + 0.15 * (p.weapons.length - 1))); push({ k: 'shot', id: p.id, e: e.id }); }
    } else if (cur().cleared) { const lead = [...pl.values()].find(o => !o.bot && !o.gone); if (lead && Math.hypot(lead.x - p.x, lead.z - p.z) > 2.5) { tx = lead.x; tz = lead.z; } }
    const dx = tx - p.x, dz = tz - p.z, L = Math.hypot(dx, dz);
    if (L > 0.2) { const s = Math.min(2.6, L * 2) * dt; const nx = p.x + dx / L * s, nz = p.z + dz / L * s; if (walkable(S.rects, nx, nz, 0.3)) { p.x = nx; p.z = nz; } else if (walkable(S.rects, nx, p.z, 0.3)) p.x = nx; else if (walkable(S.rects, p.x, nz, 0.3)) p.z = nz; if (!alive.length) p.yaw = Math.atan2(dx, dz); }
  }
  const game = {
    act(id, a) {
      const p = pl.get(id);
      if (!p || p.gone) return { ok: false, error: 'non sei nella run' };
      if (!a || typeof a !== 'object') return { ok: false, error: 'azione' };
      if (S.over) return { ok: false, error: 'run finita' };
      const r = cur();
      if (a.p) {
        const [x, z, yaw] = a.p; if (![x, z, yaw].every(Number.isFinite)) return { ok: false, error: 'posizione' };
        if (p.st !== 'ok' || p.holdT > S.t) return { ok: true };
        const dt = Math.max(0.03, S.t - p.rt), max = (VMAX * (1 + sum('speed'))) * dt + 0.5;
        let dx = x - p.x, dz = z - p.z; const d = Math.hypot(dx, dz); if (d > max) { dx *= max / d; dz *= max / d; }
        p.x = clamp(p.x + dx, ARENA.x0 + 0.3, ARENA.x1 - 0.3); p.z = clamp(p.z + dz, ARENA.z0 + 0.3, ARENA.z1 - 0.3); p.yaw = wrapA(+yaw); p.rt = S.t;
        return { ok: true };
      }
      if (a.h) {
        if (!Array.isArray(a.h) || a.h.length > 40) return { ok: false, error: 'colpi' };
        if (p.st !== 'ok') return { ok: false, error: 'sei a terra' };
        let n = 0;
        for (const h of a.h) {
          if (!Array.isArray(h)) continue;
          const e = S.en.find(x => x.id === (h[0] | 0)); let dmg = +h[1];
          if (!e || !Number.isFinite(dmg) || dmg <= 0) continue;
          if (Math.hypot(e.x - p.x, e.z - p.z) > 45) continue;
          dmg = Math.min(HIT_MAX, dmg); if (p.bucket < dmg) dmg = Math.max(0, p.bucket); if (dmg <= 0) break;
          p.bucket -= dmg;
          if (damageEnemy(p, e, dmg)) n++;
        }
        return { ok: true, n };
      }
      if (a.rv !== undefined) {
        const t = pl.get(String(a.rv));
        if (!t || t === p || t.st !== 'down' || p.st !== 'ok') return { ok: false, error: 'niente da rianimare' };
        if (Math.hypot(t.x - p.x, t.z - p.z) > REVIVE_R) return { ok: false, error: 'avvicinati di più' };
        t.rv = { by: p.id, t: t.rv && t.rv.by === p.id ? t.rv.t : 0, at: S.t };
        return { ok: true };
      }
      if (a.move) {
        const to = r.doors[a.move]; if (to === undefined) return { ok: false, error: 'lì c\'è un muro' };
        if (!r.cleared) return { ok: false, error: 'le porte sono chiuse finché la stanza non è pulita' };
        if (S.offer) return { ok: false, error: 'scegliete prima un vizio' };
        if (p.st !== 'ok') return { ok: false, error: 'sei a terra' };
        enterRoom(to, OPP[a.move]);
        return { ok: true };
      }
      if (a.pick !== undefined) { if (!S.offer) return { ok: false, error: 'nessuna scelta' }; const k = S.offer[a.pick | 0]; if (!k) return { ok: false, error: 'scelta' }; S.perks.push(k); S.offer = null; push({ k: 'perk', perk: k, by: p.id }); if (PERKS[k].maxHp) for (const x of pl.values()) if (x.st === 'ok') x.hp = Math.min(maxHp(), x.hp + PERKS[k].maxHp); return { ok: true, perk: k }; }
      if (a.open) {
        if (r.type !== 'chest' || r.opened) return { ok: false, error: 'niente da aprire' };
        r.opened = true;
        if (R.chance(0.5)) giveWeapon(p, rollWeapon(2)); else offerPerks(3);
        S.coins += 4; push({ k: 'open', by: p.id }); return { ok: true };
      }
      if (a.buy !== undefined) {
        if (r.type !== 'shop' || !S.shop) return { ok: false, error: 'non siete allo Spaccio' };
        const it = S.shop[a.buy | 0]; if (!it || it.sold) return { ok: false, error: 'esaurito' };
        if (S.coins < it.price) return { ok: false, error: 'non avete abbastanza buoni pasto' };
        S.coins -= it.price; it.sold = it.id !== 'brodo';
        if (it.id === 'perk') offerPerks(2); else if (it.id === 'weapon') giveWeapon(p, rollWeapon(2)); else if (it.id === 'brodo') p.hp = Math.min(maxHp(), p.hp + 40); else if (it.id === 'armor') p.felpa = true;
        push({ k: 'buy', item: it.id, by: p.id }); return { ok: true, item: it.id };
      }
      if (a.quit) { game.leave(id); return { ok: true }; }
      return { ok: false, error: 'azione sconosciuta' };
    },
    tick(dt) {
      if (S.over) return;
      S.t += dt; S.roomT += dt;
      for (const p of pl.values()) p.bucket = Math.min(DPS_BURST, p.bucket + DPS_CAP * dt);
      const r = cur();
      if (S.ph === 'fight') {
        const alive = S.en.filter(e => e.st !== 3).length;
        if (S.wave < 0 || (alive === 0 && S.wave < r.waves.length - 1)) { S.waveT -= dt; if (S.waveT <= 0) { S.waveT = 1.2; spawnWave(); } }
        else if (alive === 0 && S.wave >= r.waves.length - 1) roomCleared();
        stepEnemies(dt);
      } else if (S.en.length) stepEnemies(dt);
      // downs, revives
      for (const p of pl.values()) {
        if (p.gone) continue;
        if (p.st === 'down') {
          p.downT += dt;
          if (p.rv && S.t - p.rv.at < 0.45) { const by = pl.get(p.rv.by); if (by && by.st === 'ok' && Math.hypot(by.x - p.x, by.z - p.z) <= REVIVE_R) { p.rv.t += dt; if (p.rv.t >= REVIVE_T) { p.st = 'ok'; p.hp = Math.round(maxHp() * 0.35); p.holdT = S.t + 1.5; push({ k: 'up', id: p.id, by: by.id }); p.rv = null; } } else p.rv = null; }
          else if (p.rv && S.t - p.rv.at >= 0.45) p.rv = null;
          if (p.st === 'down' && p.downT >= DOWN_T) { p.st = 'out'; p.rv = null; push({ k: 'out', id: p.id, name: p.name }); }
        }
        if (p.bot && S.ph !== 'over') botStep(p, dt);
      }
      if (!S.over && live().length && !standing().length) end(false, 'Tutta la squadra è a terra: siete rimasti nel Gulag.');
      if (!S.over && !live().some(p => !p.bot)) end(false, 'La squadra ha lasciato il Gulag.');
    },
    view(id) {
      const r = cur(), p = pl.get(id);
      return {
        seed: runSeed, daily, ph: S.ph, t: Math.round(S.t), me: id,
        room: { id: r.id, type: r.type, name: r.name, depth: r.depth, doors: r.doors, cleared: r.cleared, layout: r.layout, tint: r.tint, opened: r.opened, total: S.en.length, waves: r.cleared ? [] : r.waves.map(w => w.length) },
        rooms: rooms.map(x => ({ id: x.id, gx: x.gx, gy: x.gy, type: x.visited || x.type === 'boss' ? x.type : '?', v: x.visited, c: x.cleared, doors: x.doors })),
        coins: S.coins, perks: S.perks.slice(), offer: S.offer ? S.offer.slice() : null, shop: r.type === 'shop' ? S.shop : null,
        kills: S.kills, cleared: S.cleared, score: score(), maxHp: maxHp(),
        mods: { dmg: sum('dmg'), speed: sum('speed'), armor: sum('armor') + (p && p.felpa ? 0.2 : 0), rate: sum('rate'), melee: sum('melee'), shield: sum('shield'), roomHeal: sum('roomHeal') },
        pl: [...pl.values()].filter(x => !x.gone).map(x => ({ id: x.id, name: x.name, bot: x.bot, x: r2(x.x), z: r2(x.z), yaw: r2(x.yaw), hp: Math.round(x.hp), max: maxHp(), st: x.st, rv: x.rv ? Math.round(x.rv.t / REVIVE_T * 100) / 100 : 0, dn: x.st === 'down' ? Math.ceil(DOWN_T - x.downT) : 0, k: x.kills })),
        mine: p ? { hp: Math.round(p.hp * 10) / 10, weapons: p.weapons.map(w => ({ ...w })), felpa: p.felpa, st: p.st, usedLife: p.usedLife } : null,
        weapons: p ? p.weapons.map(w => ({ ...w })) : [], usedLife: p ? p.usedLife : false, hp: p ? Math.round(p.hp) : 0,
        en: S.en.map(e => [e.id, T_CODE[e.t], r2(e.x), r2(e.z), r2(e.y), r2(e.yaw), Math.max(0, Math.round(e.hp)), e.max, e.st, e.atk, e.lv]),
        wave: [Math.max(0, S.wave + 1), r.waves.length],
        over: S.over,
      };
    },
    drain() { const e = S.ev; S.ev = []; return e; },
    leave(id) {
      const p = pl.get(id); if (!p || p.gone) return;
      p.gone = true; p.st = 'out'; push({ k: 'left', id, name: p.name });
      if (!live().some(x => !x.bot)) end(false, 'La squadra ha lasciato il Gulag.');
    },
    get over() { return S.over; },
    _state: S, _rooms: rooms, _pl: pl,
  };
  return game;
}
