// shared/gulag.mjs — "Il Gulag profondo": roguelike runs under the house (rules), see shared/README.md.
// The run is a seeded floor of rooms (Isaac-like grid): start, fights, a chest, the "Spaccio" (shop), an elite room and
// the boss "Il Secondino". Enemies are simulated by the client (combat/); these rules are the referee: they generate
// the floor, decide what each room contains, validate room clears (kills/time), rewards, purchases and the score.
//
// opts: { seed?, daily?: 'YYYY-MM-DD', start?: { perks: [...] } }   (start perks are the meta unlocks, see META)
// Actions:
//   { move: 'n'|'s'|'e'|'w' }          through a door of the current room (only when it is clear)
//   { clear: { kills, t } }             the current fight is over (t = seconds spent in the room)
//   { pick: i }                         choose one of the offered perks (after elites / chests / shop)
//   { open: true }                      open the chest of the current room
//   { buy: i }                          buy shop item i (current room must be the shop)
//   { hp: n }                           report the player's health (score / death bookkeeping)
//   { died: true }                      the run ends (permadeath)
//   { revive: true }                    use the "Crescentina fritta" extra life (once)
// view(id): { seed, daily, room, rooms[], coins, perks[], weapons[], offer, shop, kills, cleared, score, over, ... }
import { rng } from './rng.mjs';

export const meta = { type: 'gulag', name: 'Il Gulag profondo', minPlayers: 1, maxPlayers: 1, tickHz: 0, dropIn: false };

export const PERKS = {
  ragu: { name: 'Tagliatella al ragù', desc: '+25 vita massima', icon: '🍝', maxHp: 25 },
  caffe: { name: 'Caffè del Bar Sport', desc: '+15% velocità', icon: '☕', speed: 0.15 },
  spritz: { name: 'Spritz in vena', desc: '+20% danno', icon: '🍹', dmg: 0.2 },
  piadina: { name: 'Piadina della nonna', desc: 'cura 20 vita a ogni stanza ripulita', icon: '🫓', roomHeal: 20 },
  mortadella: { name: 'Mortadella blindata', desc: '+20% armatura', icon: '🥓', armor: 0.2 },
  ombrello: { name: 'Ombrello rinforzato', desc: 'ombrellate +60%', icon: '☂️', melee: 0.6 },
  tper: { name: 'Abbonamento TPER', desc: '+1 buono pasto per ogni nemico', icon: '🚌', coinPerKill: 1 },
  socmel: { name: 'Socmel!', desc: '+15% cadenza di fuoco', icon: '💥', rate: 0.15 },
  crescentina: { name: 'Crescentina fritta', desc: 'una seconda vita (una volta per run)', icon: '🥟', extraLife: 1 },
  portici: { name: 'Sotto i portici', desc: '3 s di invulnerabilità entrando in una stanza', icon: '🏛️', shield: 3 },
  tortellino: { name: 'Tortellino doppio', desc: 'le armi trovate sparano due colpi', icon: '🥟', doppio: 1 },
  lambrusco: { name: 'Lambrusco frizzante', desc: '+10% danno e +10% velocità', icon: '🍷', dmg: 0.1, speed: 0.1 },
};
// meta-progression: starting perks unlocked with "Gettoni del Gulag" (kept by the client, sent as opts.start.perks)
export const META = { ragu: 3, caffe: 3, piadina: 4, tper: 4, socmel: 5, crescentina: 8 };
export const RARITIES = ['comune', 'non comune', 'raro', 'epico', 'leggendario'];
const BASES = ['pistola', 'tortellini', 'nerf', 'spritz'];
export const ROOM_NAMES = {
  start: 'Cella d\'ingresso', fight: ['Corridoio delle docce', 'Lavanderia', 'Archivio dei verbali', 'Cucina della mensa', 'Sala colloqui', 'Infermeria', 'Cortile dell\'ora d\'aria', 'Magazzino delle Moretti'],
  chest: 'Ripostiglio del secondino', shop: 'Lo Spaccio di Cesco', elite: 'Cella d\'isolamento', boss: 'Ufficio del Secondino',
};
const DIRS = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] }, OPP = { n: 's', s: 'n', e: 'w', w: 'e' };

// stable 32-bit hash for a daily seed ('2026-11-25' → same floor for everyone that day)
export function seedOf(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

export function generate(seed) {
  const R = rng(seed), N = 7, cells = new Map(), key = (x, y) => x + ',' + y;
  const want = 10 + R.int(3);
  const start = { x: 3, y: 3, d: 0 }; cells.set(key(3, 3), start);
  const q = [start];
  let guard = 0;
  while (cells.size < want && guard++ < 2000) {
    const c = q.length ? q[R.int(q.length)] : start;
    const dir = R.pick(['n', 's', 'e', 'w']), [dx, dy] = DIRS[dir], x = c.x + dx, y = c.y + dy;
    if (x < 0 || y < 0 || x >= N || y >= N || cells.has(key(x, y))) continue;
    let nb = 0; for (const [ex, ey] of Object.values(DIRS)) if (cells.has(key(x + ex, y + ey))) nb++;
    if (nb > 1) continue; // keep branches (Isaac rule)
    const n = { x, y, d: c.d + 1, parent: c }; cells.set(key(x, y), n); q.push(n);
  }
  const list = [...cells.values()];
  const rooms = list.map((c, i) => ({ id: i, gx: c.x, gy: c.y, depth: c.d, type: 'fight', doors: {}, waves: [], layout: 0, cleared: false, visited: false, opened: false }));
  const at = new Map(rooms.map(r => [key(r.gx, r.gy), r]));
  for (const r of rooms) for (const [k, [dx, dy]] of Object.entries(DIRS)) { const o = at.get(key(r.gx + dx, r.gy + dy)); if (o) r.doors[k] = o.id; }
  rooms[0].type = 'start';
  const dead = rooms.filter(r => r.id !== 0 && Object.keys(r.doors).length === 1).sort((a, b) => b.depth - a.depth);
  const pool = dead.length >= 4 ? dead : rooms.filter(r => r.id !== 0).sort((a, b) => b.depth - a.depth);
  const assign = (t) => { const r = pool.find(x => x.type === 'fight'); if (r) r.type = t; return r; };
  assign('boss'); assign('elite'); assign('chest'); assign('shop');
  for (const r of rooms) {
    r.layout = R.int(6); r.tint = R.int(5);
    r.name = r.type === 'fight' ? ROOM_NAMES.fight[R.int(ROOM_NAMES.fight.length)] : ROOM_NAMES[r.type];
    const lv = 1 + Math.floor(r.depth * 0.8);
    if (r.type === 'fight') { const w = 1 + (r.depth > 2 ? 1 : 0) + (R.chance(0.3) ? 1 : 0); for (let k = 0; k < w; k++) r.waves.push([{ t: 'zombie', n: 2 + Math.min(4, Math.floor(r.depth / 1.5)) + R.int(2), lv }, ...(R.chance(0.35) ? [{ t: 'pigeon', n: 2 + R.int(2), lv }] : [])]); }
    if (r.type === 'elite') r.waves = [[{ t: 'zombie', n: 4, lv: lv + 2 }, { t: 'pigeon', n: 3, lv: lv + 1 }], [{ t: 'zombie', n: 5, lv: lv + 3 }]];
    if (r.type === 'boss') r.waves = [[{ t: 'boss', n: 1, lv: lv + 4 }, { t: 'zombie', n: 2, lv: lv + 1 }], [{ t: 'zombie', n: 4, lv: lv + 2 }]];
  }
  return rooms;
}
const enemiesIn = r => r.waves.reduce((a, w) => a + w.reduce((b, e) => b + e.n, 0), 0);

export function create({ players = [], opts = {}, seed = 1 } = {}) {
  const me = players[0] || { id: 'me', name: 'Tu' };
  const daily = typeof opts.daily === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(opts.daily) ? opts.daily : null;
  const runSeed = daily ? seedOf('gulag:' + daily) : (Number.isFinite(+opts.seed) && +opts.seed > 0 ? (+opts.seed >>> 0) : seed >>> 0);
  const R = rng(runSeed ^ 0x5bd1e995);
  const rooms = generate(runSeed);
  const startPerks = ((opts.start && opts.start.perks) || []).filter(p => META[p] && PERKS[p]).slice(0, 3);
  const S = {
    seed: runSeed, daily, cur: 0, coins: 0, kills: 0, cleared: 0, perks: [...startPerks], usedLife: false,
    weapons: [{ base: 'pistola', rarity: 'comune' }], offer: null, shop: null, hp: 100, over: null, ev: [], t: 0, fightT: 0, boss: false,
  };
  rooms[0].visited = true; rooms[0].cleared = true;
  const push = e => S.ev.push(e);
  const cur = () => rooms[S.cur];
  const has = k => S.perks.includes(k);
  const sum = f => S.perks.reduce((a, p) => a + (PERKS[p][f] || 0), 0);
  const maxHp = () => 100 + sum('maxHp');
  function rollWeapon(minR = 0) { let ri = minR; while (ri < 4 && R.chance(0.42)) ri++; return { base: BASES[R.int(BASES.length)], rarity: RARITIES[ri], doppio: has('tortellino') }; }
  function giveWeapon(w) { if (S.weapons.length < 3) S.weapons.push(w); else { let lo = 0; for (let i = 1; i < 3; i++) if (RARITIES.indexOf(S.weapons[i].rarity) < RARITIES.indexOf(S.weapons[lo].rarity)) lo = i; S.weapons[lo] = w; } push({ k: 'weapon', w }); }
  function offerPerks(n = 3) { const pool = Object.keys(PERKS).filter(p => !S.perks.includes(p)); R.shuffle(pool); S.offer = pool.slice(0, n); push({ k: 'offer', perks: S.offer }); }
  function makeShop() { S.shop = [{ id: 'brodo', name: 'Brodo della nonna (+40 vita)', price: 5 }, { id: 'perk', name: 'Un vizio a scelta (perk)', price: 14 }, { id: 'weapon', name: 'Arma rara o meglio', price: 11 }, { id: 'armor', name: 'Felpa imbottita (+20% armatura per la stanza)', price: 6 }].map(x => ({ ...x, sold: false })); }
  function score() { return S.cleared * 100 + S.kills * 10 + S.coins * 5 + (S.boss ? 2500 : 0) + S.perks.length * 20; }
  function end(victory, why) {
    if (S.over) return;
    const sc = score(), gettoni = Math.floor(sc / 300) + (victory ? 5 : 0);
    S.over = { winners: victory ? [me.id] : [], scores: { [me.id]: sc }, summary: victory ? 'Il Secondino è a terra: sei evaso dal Gulag!' : (why || 'Sei rimasto nel Gulag.'), victory: !!victory, score: sc, gettoni, rooms: S.cleared, kills: S.kills, daily: S.daily, seed: S.seed };
    push({ k: 'over', victory: !!victory, score: sc, gettoni });
  }
  const game = {
    act(id, a) {
      if (!a || typeof a !== 'object') return { ok: false, error: 'azione' };
      if (S.over) return { ok: false, error: 'run finita' };
      const r = cur();
      if (a.move) {
        const to = r.doors[a.move]; if (to === undefined) return { ok: false, error: 'lì c\'è un muro' };
        if (!r.cleared) return { ok: false, error: 'le porte sono chiuse finché la stanza non è pulita' };
        if (S.offer) return { ok: false, error: 'scegli prima un vizio' };
        S.cur = to; const n = rooms[to]; const first = !n.visited; n.visited = true; S.fightT = 0;
        if (n.type === 'chest' || n.type === 'shop' || n.type === 'start') n.cleared = true;
        if (n.type === 'shop' && !S.shop) makeShop();
        push({ k: 'enter', room: to, from: OPP[a.move], first, type: n.type });
        return { ok: true };
      }
      if (a.clear) {
        if (r.cleared || !r.waves.length) return { ok: false, error: 'niente da pulire' };
        const kills = Math.max(0, a.clear.kills | 0), t = +a.clear.t || 0, need = enemiesIn(r);
        if (kills < need) return { ok: false, error: `mancano ${need - kills} nemici` };
        if (t < 2 + need * 0.5) return { ok: false, error: 'troppo veloce per essere vero' };
        r.cleared = true; S.cleared++; S.kills += need;
        const coins = 2 + Math.floor(r.depth / 2) + R.int(3) + sum('coinPerKill') * need + (r.type === 'elite' ? 8 : 0); S.coins += coins;
        const heal = sum('roomHeal');
        push({ k: 'cleared', room: r.id, coins, heal });
        if (r.type === 'elite') offerPerks(3);
        else if (r.type === 'boss') { S.boss = true; end(true); }
        else if (R.chance(0.3)) { const w = rollWeapon(0); giveWeapon(w); }
        return { ok: true, coins, heal };
      }
      if (a.pick !== undefined) { if (!S.offer) return { ok: false, error: 'nessuna scelta' }; const p = S.offer[a.pick | 0]; if (!p) return { ok: false, error: 'scelta' }; S.perks.push(p); S.offer = null; push({ k: 'perk', perk: p }); return { ok: true, perk: p }; }
      if (a.open) {
        if (r.type !== 'chest' || r.opened) return { ok: false, error: 'niente da aprire' };
        r.opened = true;
        if (R.chance(0.5)) { const w = rollWeapon(2); giveWeapon(w); } else offerPerks(3);
        S.coins += 4; return { ok: true };
      }
      if (a.buy !== undefined) {
        if (r.type !== 'shop' || !S.shop) return { ok: false, error: 'non sei allo Spaccio' };
        const it = S.shop[a.buy | 0]; if (!it || it.sold) return { ok: false, error: 'esaurito' };
        if (S.coins < it.price) return { ok: false, error: 'non hai abbastanza buoni pasto' };
        S.coins -= it.price; it.sold = it.id !== 'brodo';
        if (it.id === 'perk') offerPerks(2); else if (it.id === 'weapon') giveWeapon(rollWeapon(2));
        push({ k: 'buy', item: it.id }); return { ok: true, item: it.id };
      }
      if (a.hp !== undefined) { S.hp = Math.max(0, Math.min(maxHp(), +a.hp || 0)); return { ok: true }; }
      if (a.revive) { if (!has('crescentina') || S.usedLife) return { ok: false, error: 'niente seconda vita' }; S.usedLife = true; S.hp = Math.round(maxHp() / 2); push({ k: 'revive' }); return { ok: true }; }
      if (a.died) { end(false, `Sei caduto nella ${cur().name}.`); return { ok: true }; }
      if (a.quit) { end(false, 'Sei scappato dal Gulag a metà run.'); return { ok: true }; }
      return { ok: false, error: 'azione sconosciuta' };
    },
    view() {
      const r = cur();
      return {
        seed: S.seed, daily: S.daily, room: { id: r.id, type: r.type, name: r.name, depth: r.depth, doors: r.doors, waves: r.cleared ? [] : r.waves, cleared: r.cleared, layout: r.layout, tint: r.tint, opened: r.opened, total: enemiesIn(r) },
        rooms: rooms.map(x => ({ id: x.id, gx: x.gx, gy: x.gy, type: x.visited || x.type === 'boss' ? x.type : '?', v: x.visited, c: x.cleared, doors: x.doors })),
        coins: S.coins, perks: S.perks.slice(), weapons: S.weapons.map(w => ({ ...w })), offer: S.offer ? S.offer.slice() : null, shop: r.type === 'shop' ? S.shop : null,
        kills: S.kills, cleared: S.cleared, score: score(), maxHp: maxHp(), hp: S.hp, usedLife: S.usedLife,
        mods: { dmg: sum('dmg'), speed: sum('speed'), armor: sum('armor'), rate: sum('rate'), melee: sum('melee'), shield: sum('shield'), roomHeal: sum('roomHeal') },
        over: S.over,
      };
    },
    drain() { const e = S.ev; S.ev = []; return e; },
    get over() { return S.over; },
    _state: S, _rooms: rooms,
  };
  return game;
}
