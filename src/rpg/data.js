// rpg/data.js — tables of the looter/RPG layer: rarities, comic weapon bases, perks, gadgets, consumables, ammo,
// XP curve, talent tree, plus the pure roll functions (no DOM, no three.js).
// Weapon item (shared contract with combat/): { id, kind:'weapon', base:'pistola'|'tortellini'|'nerf'|'spritz'|'ombrello' (= combat/weapons.js BASES),
//   name, rarity, level, stats:{damage,fireRate,magazine,reloadTime,spread,range,projectileSpeed,splashRadius,knockback,element},
//   perks:[ids] (combat/weapons.js PERKS ids are applied by combat; perkInfo(id) for names), mods:{…passive while equipped}, value, icon }
// Gadget: { id, kind:'gadget', key, name, rarity, level, mods, desc, value, icon }
// Consumable (stack): { id, kind:'consumable', key, name, n, icon, value }
import { BASES as CB, RARITY as CR } from '../combat/weapons.js';

export const RARITIES = [
  { id: 'comune', name: 'Comune', color: '#d4d4d8', mult: 1.0, perks: 0, w: 60, value: 1, beam: 0.42, gad: 1.0 },
  { id: 'non comune', name: 'Non comune', color: '#62d96f', mult: 1.12, perks: 1, w: 26, value: 2.2, beam: 0.62, gad: 1.3 },
  { id: 'raro', name: 'Raro', color: '#4aa8ff', mult: 1.28, perks: 1, w: 10, value: 4.5, beam: 0.85, gad: 1.6 },
  { id: 'epico', name: 'Epico', color: '#c27bff', mult: 1.5, perks: 2, w: 3.4, value: 9, beam: 1.1, gad: 2.0 },
  { id: 'leggendario', name: 'Leggendario', color: '#ffb52e', mult: 1.8, perks: 2, w: 0.6, value: 20, beam: 1.5, gad: 2.6 },
];
export const RANK = Object.fromEntries(RARITIES.map((r, i) => [r.id, i]));
export const rarityOf = id => RARITIES[RANK[id] ?? 0];

export const AMMO = {
  acqua: { name: 'Cariche d\'acqua', short: 'acqua', icon: '💧', max: 400, start: 200, pack: 60 },
  tortellini: { name: 'Tortellini', short: 'tortellini', icon: '🥟', max: 120, start: 48, pack: 16 },
  freccette: { name: 'Freccette', short: 'freccette', icon: '🎯', max: 60, start: 24, pack: 8 },
  spritz: { name: 'Razzi di spritz', short: 'spritz', icon: '🍹', max: 12, start: 4, pack: 2 },
};

// comic weapons: water guns, tortellini launcher, nerf, spritz-bazooka, umbrella (melee). No gore anywhere.
// Base ids and base stats come from combat/weapons.js (the shooter core) so the balance matches its enemies; this table
// adds names, icons, ammo type and drop weights. FALLBACK only if combat's registry is missing a base.
export const BASES = {
  pistola: { name: 'Pistola ad acqua', icon: '💦', ammo: 'acqua', w: 30,
    nouns: [['Spruzzino', 'm'], ['Super Soaker', 'm'], ['Pistola a spruzzo', 'f'], ['Idrante tascabile', 'm'], ['Annaffiatoio tattico', 'm'], ['Pistolina della fiera', 'f']] },
  tortellini: { name: 'Lanciatortellini', icon: '🥟', ammo: 'tortellini', w: 22,
    nouns: [['Tortelliniera', 'f'], ['Lanciatortellini', 'm'], ['Mortaio del brodo', 'm'], ['Sparapasta', 'm'], ['Cannone alla panna', 'm'], ['Sfogliatrice d\'assalto', 'f']] },
  nerf: { name: 'Nerf', icon: '🎯', ammo: 'freccette', w: 22,
    nouns: [['Nerf', 'm'], ['Fucile a freccette', 'm'], ['Balestra di gommapiuma', 'f'], ['Nerf da cecchino', 'm'], ['Cerbottana', 'f']] },
  spritz: { name: 'Spritz-bazooka', icon: '🍹', ammo: 'spritz', w: 10,
    nouns: [['Spritz-bazooka', 'm'], ['Lanciaspritz', 'm'], ['Aperol launcher', 'm'], ['Cannone dell\'happy hour', 'm'], ['Bazooka al Campari', 'm']] },
  ombrello: { name: 'Ombrello', icon: '☂️', ammo: null, w: 16,
    nouns: [['Ombrello', 'm'], ['Ombrello del portico', 'm'], ['Ombrello rotto', 'm'], ['Parasole da combattimento', 'm'], ['Ombrellino del Lidl', 'm']] },
};
export const BASE_IDS = Object.keys(BASES);
const FALLBACK = {
  pistola: { damage: 9, fireRate: 8, magazine: 24, reloadTime: 1.4, spread: 0.014, range: 24, projectileSpeed: 0, splashRadius: 0, knockback: 0.7, element: 'acqua' },
  tortellini: { damage: 24, fireRate: 1.6, magazine: 6, reloadTime: 2.1, spread: 0.02, range: 40, projectileSpeed: 19, splashRadius: 1.7, knockback: 2.6, element: 'sugo' },
  nerf: { damage: 20, fireRate: 3.2, magazine: 12, reloadTime: 1.7, spread: 0.006, range: 55, projectileSpeed: 46, splashRadius: 0, knockback: 1.3, element: 'schiuma' },
  spritz: { damage: 90, fireRate: 0.6, magazine: 2, reloadTime: 3.0, spread: 0.004, range: 70, projectileSpeed: 15, splashRadius: 3.4, knockback: 9, element: 'spritz' },
  ombrello: { damage: 32, fireRate: 1.8, magazine: 0, reloadTime: 0, spread: 0, range: 2.0, projectileSpeed: 0, splashRadius: 0, knockback: 5.5, element: 'acqua' },
};
const baseStats = b => ({ ...FALLBACK[b], ...((CB && CB[b] && CB[b].stats) || {}) });

// item perks (item.perks = array of ids). combat: true → implemented by combat/ at runtime (ids match combat/weapons.js PERKS);
// apply(stats) → baked into the stats at roll time; mods → passive multipliers while the item is equipped
export const PERKS = {
  doppio: { name: 'Spritz doppio', desc: 'Un proiettile in più a ogni colpo', not: ['ombrello'], combat: true },
  vampiro: { name: 'Scroccone', desc: 'Ti cura dell\'8% del danno che fai', combat: true },
  esplosivo: { name: 'Schizzo di brodo', desc: 'Piccola esplosione a ogni impatto', not: ['ombrello'], combat: true },
  gelo: { name: 'Granita', desc: 'Rallenta del 50% chi colpisci per 2 s', combat: true },
  rimbalzo: { name: 'Di sponda', desc: 'I proiettili rimbalzano una volta', only: ['tortellini', 'nerf', 'spritz'], combat: true },
  turbo: { name: 'Svelto come un rider', desc: 'Ricarica -35%', not: ['ombrello'], combat: true },
  critico: { name: 'Soccmel', desc: '15% di colpi che fanno il doppio', combat: true },
  sugo: { name: 'Al sugo', desc: '+15% danno, colpi al ragù', apply: s => { s.damage *= 1.15; s.element = 'sugo'; } },
  bassa: { name: 'Dalla Bassa', desc: '+30% portata', not: ['ombrello'], apply: s => { s.range *= 1.3; s.projectileSpeed *= 1.15; } },
  mezzolitro: { name: 'Mezzo litro', desc: '+50% caricatore', not: ['ombrello'], apply: s => { s.magazine = Math.max(s.magazine + 1, Math.round(s.magazine * 1.5)); } },
  spintone: { name: 'Spintone', desc: 'Il doppio della spinta', apply: s => { s.knockback *= 2; } },
  brillo: { name: 'Mezzo brillo', desc: '+25% danno, mira da sabato sera', apply: s => { s.damage *= 1.25; s.spread = s.spread * 1.6 + 0.008; } },
  raffica: { name: 'Raffica', desc: '+20% cadenza', apply: s => { s.fireRate *= 1.2; } },
  burdel: { name: 'Burdèl', desc: '+10% velocità mentre è equipaggiata', mods: { speed: 1.1 } },
  culo: { name: 'Culo', desc: '+20% fortuna col bottino', mods: { lootLuck: 1.2 } },
  pagaashish: { name: 'Paga Ashish', desc: '+40% euro dai nemici', mods: { money: 1.4 } },
};
export const LEGENDARY = {
  pistola: { id: 'idrante', name: 'Idrante del Comune', desc: 'Caricatore enorme e cadenza da pompiere', apply: s => { s.magazine = Math.round(s.magazine * 3); s.fireRate *= 1.25; } },
  tortellini: { id: 'brodonatale', name: 'Brodo di Natale', desc: 'Esplosioni di brodo più grandi, al sugo', with: 'esplosivo', apply: s => { s.splashRadius = Math.max(1.6, s.splashRadius * 1.6); s.element = 'sugo'; } },
  nerf: { id: 'testadura', name: 'Testa di freccetta', desc: 'Freccette pesanti: +40% danno, +50% spinta', apply: s => { s.damage *= 1.4; s.knockback *= 1.5; } },
  spritz: { id: 'happyhour', name: 'Happy Hour', desc: 'Razzi doppi e ricarica da barista', with: 'doppio', apply: s => { s.reloadTime *= 0.75; } },
  ombrello: { id: 'portico', name: 'Portico portatile', desc: 'Pari i colpi: -30% danni subiti', mods: { armor: 0.7 }, apply: s => { s.damage *= 1.2; } },
};
const LEG_BY_ID = Object.fromEntries(Object.values(LEGENDARY).map(l => [l.id, l]));
export const perkInfo = id => { const P = PERKS[id]; if (P) return { id, name: P.name, desc: P.desc }; const L = LEG_BY_ID[id]; return L ? { id, name: L.name, desc: L.desc, legendary: true } : { id, name: id, desc: '' }; };

const SUFFIX = ['del Celtic', 'di Petroni', 'della Bassa', 'del Millennium', 'di San Luca', 'delle Due Torri', 'del Pratello', 'di Piazza Verdi',
  'della Zombata', 'dell\'Edicola', 'del Checkpoint', 'di Teletubbylandia', 'del Sushi', 'di Bellazzi', 'della Montagnola', 'di Via Zamboni',
  'del Mercoledì', 'della Compettina', 'di Cesco', 'di Lombu', 'di Forla', 'di Ashish', 'di Seghino', 'di Ciccio', 'di Asche', 'di Parme', 'di Mirco', 'di Jacopo', 'di Ricky'];
const ADJ = [
  [['usat', 1], ['scraus', 1], ['da discount', 0], ['del Lidl', 0], ['sfigat', 1]],
  [['decente', 0], ['buon', 1], ['tirat', 1], ['lucidat', 1]],
  [['truccat', 1], ['tamarr', 1], ['pazz', 1], ['bastard', 1]],
  [['sgravat', 1], ['maledett', 1], ['proibit', 1], ['assurd', 1]],
  [['Leggendari', 1]],
];

export const GADGETS = [
  { key: 'cuffie', name: 'Cuffie da compettina', icon: '🎧', mods: { fireRate: 1.1 } },
  { key: 'marsupio', name: 'Marsupio del Lidl', icon: '👝', mods: { money: 1.3 } },
  { key: 'scarpe', name: 'Scarpe da Petroni', icon: '👟', mods: { speed: 1.08 } },
  { key: 'santino', name: 'Santino di San Luca', icon: '🙏', mods: { maxHp: 1.15 } },
  { key: 'quadrifoglio', name: 'Quadrifoglio del Celtic', icon: '🍀', mods: { lootLuck: 1.25 } },
  { key: 'occhiali', name: 'Occhiali da sole a mezzanotte', icon: '🕶️', mods: { damage: 1.08 } },
  { key: 'tessera', name: 'Tessera del Millennium', icon: '🎫', mods: { xp: 1.15 } },
  { key: 'thermos', name: 'Thermos di brodo', icon: '🥣', mods: { regen: 1.2 } },
  { key: 'bomber', name: 'Bomber imbottito', icon: '🧥', mods: { armor: 0.9 } },
  { key: 'gratta', name: 'Gratta e vinci fortunato', icon: '🎟️', mods: { lootLuck: 1.12, money: 1.12 } },
  { key: 'moka', name: 'Moka da viaggio', icon: '☕', mods: { reload: 0.9 } },
];
export const CONSUMABLES = {
  piadina: { name: 'Piadina', icon: '🌯', desc: 'Cura 50 vita', heal: 50, value: 30 },
  crescentina: { name: 'Crescentina', icon: '🥙', desc: 'Cura 25 vita', heal: 25, value: 14 },
  caffe: { name: 'Caffè al bar', icon: '☕', desc: '+25% velocità per 20 s', buff: { speed: 1.25 }, time: 20, value: 18 },
  negroni: { name: 'Negroni sbagliato', icon: '🥃', desc: '+20% danno per 20 s', buff: { damage: 1.2 }, time: 20, value: 35 },
};
export const STACK = 9;

// stat points (one per level) and the talent tree (one pick every 5 levels, any branch, in order)
export const STATS = {
  vita: { name: 'Vita', icon: '❤️', desc: '+5% vita massima', mod: p => ({ maxHp: 1 + 0.05 * p }) },
  danno: { name: 'Danno', icon: '💥', desc: '+3% danno', mod: p => ({ damage: 1 + 0.03 * p }) },
  velocita: { name: 'Velocità', icon: '🏃', desc: '+1,2% velocità (max 25 punti)', cap: 25, mod: p => ({ speed: 1 + 0.012 * Math.min(25, p) }) },
  fortuna: { name: 'Fortuna', icon: '🍀', desc: '+4% fortuna col bottino', mod: p => ({ lootLuck: 1 + 0.04 * p }) },
};
export const TREE = [
  { id: 'teppista', name: 'Teppista', icon: '🥊', color: '#ff5a4f', perks: [
    { id: 't1', name: 'Mani pesanti', desc: '+10% danno', mods: { damage: 1.1 } },
    { id: 't2', name: 'Pellaccia', desc: '+15% vita massima', mods: { maxHp: 1.15 } },
    { id: 't3', name: 'Ricarica da strada', desc: '-15% tempo di ricarica', mods: { reload: 0.85 } },
    { id: 't4', name: 'Rissa al Pratello', desc: '+12% cadenza di fuoco', mods: { fireRate: 1.12 } },
    { id: 't5', name: 'Re del quartiere', desc: '+20% danno, +10% vita', mods: { damage: 1.2, maxHp: 1.1 } },
  ] },
  { id: 'cuoco', name: 'Cuoco', icon: '👨‍🍳', color: '#ffb52e', perks: [
    { id: 'c1', name: 'Brodo caldo', desc: 'Rigeneri 1 vita al secondo', mods: { regen: 1 } },
    { id: 'c2', name: 'Mano da sfoglina', desc: '+15% fortuna col bottino', mods: { lootLuck: 1.15 } },
    { id: 'c3', name: 'Tortellino di scorta', desc: 'Ogni nemico steso ti cura di 4', mods: { healOnKill: 4 } },
    { id: 'c4', name: 'Ragù della nonna', desc: 'Piadine e crescentine curano il doppio', mods: { consumHeal: 2 } },
    { id: 'c5', name: 'Chef stellato', desc: '+35% fortuna, vendi a +50%', mods: { lootLuck: 1.35, sell: 1.5 } },
  ] },
  { id: 'festaiolo', name: 'Festaiolo', icon: '🪩', color: '#c27bff', perks: [
    { id: 'f1', name: 'Passo da Petroni', desc: '+8% velocità', mods: { speed: 1.08 } },
    { id: 'f2', name: 'Offro io', desc: '+25% euro', mods: { money: 1.25 } },
    { id: 'f3', name: 'Spritz in mano', desc: '+50% munizioni dai pacchi', mods: { ammoPack: 1.5 } },
    { id: 'f4', name: 'Last call', desc: '+10% velocità, -10% ricarica', mods: { speed: 1.1, reload: 0.9 } },
    { id: 'f5', name: 'Re del Millennium', desc: '+20% esperienza, +15% velocità', mods: { xp: 1.2, speed: 1.15 } },
  ] },
];
export const MAX_LEVEL = 50;
export const xpNeed = L => Math.round(80 * Math.pow(L, 1.5) + 20); // xp from level L to L+1
export const perkPicksAt = L => Math.floor(L / 5);                // picks earned by level L

// mods: multipliers (1 = neutral) except regen / healOnKill (additive). reload multiplies the reload TIME (<1 faster),
// armor multiplies the damage taken (<1 tougher)
export const ADD_MODS = new Set(['regen', 'healOnKill']);
export const baseMods = () => ({ damage: 1, maxHp: 1, speed: 1, reload: 1, fireRate: 1, lootLuck: 1, money: 1, xp: 1, armor: 1, sell: 1, consumHeal: 1, ammoPack: 1, regen: 0, healOnKill: 0 });
export function addMods(into, m) { if (!m) return into; for (const k in m) { if (ADD_MODS.has(k)) into[k] = (into[k] || 0) + m[k]; else into[k] = (into[k] ?? 1) * m[k]; } return into; }

// ---------------------------------------------------------------- rolls
let seq = 0;
export const uid = p => p + Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 5);
const rnd = a => a[(Math.random() * a.length) | 0];
const wpick = (list, wf) => { let s = 0; for (const x of list) s += wf(x); let r = Math.random() * s; for (const x of list) { r -= wf(x); if (r <= 0) return x; } return list[list.length - 1]; };
const r2 = v => Math.round(v * 100) / 100;

// luck >= 1 favours higher tiers; bias (0..2) shifts the table up (crates, bosses, quests)
export function rollRarity(luck = 1, bias = 0, min = 0) {
  const k = Math.min(3, Math.max(0.2, luck) * (1 + bias * 0.9));
  const r = wpick(RARITIES.filter((x, i) => i >= min), x => x.w * Math.pow(k, RANK[x.id] * 1.15));
  return r.id;
}

function gendered(stem, g) { const [s, var_] = stem; return var_ ? s + (g === 'f' ? 'a' : 'o') : s; }
export function weaponName(base, rarity) {
  const B = BASES[base], [noun, g] = rnd(B.nouns), rk = RANK[rarity] || 0;
  const adj = gendered(rnd(ADJ[rk]), g);
  if (rk === 4) return `${noun} ${adj} ${rnd(SUFFIX)}`;
  const suf = rk >= 2 || Math.random() < 0.5 ? ' ' + rnd(SUFFIX) : '';
  return rk === 0 && !suf ? `${noun} ${adj}` : (Math.random() < 0.5 && rk < 3 ? `${noun}${suf}` : `${noun} ${adj}${suf}`);
}

export function rollWeapon(level = 1, rarity = 'comune', base = null) {
  base = BASES[base] ? base : wpick(BASE_IDS, b => BASES[b].w).toString();
  const B = BASES[base], R = rarityOf(rarity), L = Math.max(1, Math.min(60, level | 0)), ri = RANK[rarity] || 0;
  const s = baseStats(base);
  const roll = (a = 0.1) => 1 + (Math.random() * 2 - 1) * a;
  // same scaling as combat/weapons.js makeItem, plus random rolls
  s.damage = s.damage * ((CR && CR[rarity] && CR[rarity].mult) || R.mult) * (1 + 0.08 * (L - 1)) * roll(0.1);
  if (s.magazine) s.magazine = Math.max(1, Math.round(s.magazine * (1 + 0.1 * ri) * roll(0.12)));
  if (s.reloadTime) s.reloadTime = s.reloadTime * (1 - 0.05 * ri) * roll(0.1);
  s.fireRate *= roll(0.08); s.spread *= roll(0.15); s.range *= roll(0.08);
  if (s.splashRadius) s.splashRadius *= roll(0.1);
  const perks = [], mods = {};
  const pool = Object.keys(PERKS).filter(id => { const P = PERKS[id]; return (!P.only || P.only.includes(base)) && (!P.not || !P.not.includes(base)); });
  const add = id => { const P = PERKS[id]; if (!P || perks.includes(id)) return; if (P.apply) P.apply(s); if (P.mods) addMods(mods, P.mods); perks.push(id); const k = pool.indexOf(id); if (k >= 0) pool.splice(k, 1); };
  if (ri === 4) { const P = LEGENDARY[base]; if (P.apply) P.apply(s); if (P.mods) addMods(mods, P.mods); perks.push(P.id); if (P.with) add(P.with); }
  for (let i = 0; i < R.perks && pool.length; i++) add(pool[(Math.random() * pool.length) | 0]);
  for (const k of ['damage', 'fireRate', 'reloadTime', 'range', 'projectileSpeed', 'splashRadius', 'knockback']) s[k] = r2(s[k]);
  s.spread = Math.round(s.spread * 10000) / 10000;
  return { id: uid('w'), kind: 'weapon', base, name: weaponName(base, rarity), rarity, level: L, stats: s, perks, mods, icon: B.icon, value: itemValue(L, rarity, base === 'spritz' ? 1.2 : 1) };
}

export function rollGadget(level = 1, rarity = 'comune', key = null) {
  const G = key ? GADGETS.find(g => g.key === key) : rnd(GADGETS), R = rarityOf(rarity), L = Math.max(1, level | 0);
  const f = R.gad * (1 + 0.01 * (L - 1)), mods = {};
  for (const k in G.mods) { const v = G.mods[k]; mods[k] = ADD_MODS.has(k) ? r2(v * f) : (v < 1 ? r2(Math.max(0.5, 1 - (1 - v) * f)) : r2(1 + (v - 1) * f)); }
  return { id: uid('g'), kind: 'gadget', key: G.key, name: R.id === 'leggendario' ? G.name + ' leggendario' : G.name, rarity, level: L, mods, desc: modsText(mods), icon: G.icon, value: itemValue(L, rarity, 0.9) };
}
export const makeConsumable = (key, n = 1) => { const C = CONSUMABLES[key]; return { id: uid('c'), kind: 'consumable', key, name: C.name, n, icon: C.icon, desc: C.desc, value: C.value, rarity: 'comune', level: 1 }; };

export function rollItem(level = 1, { luck = 1, bias = 0, kind = null, minRarity = 0 } = {}) {
  const rarity = rollRarity(luck, bias, minRarity);
  kind = kind || (Math.random() < 0.78 ? 'weapon' : Math.random() < 0.82 ? 'gadget' : 'consumable');
  if (kind === 'consumable') return makeConsumable(wpick(Object.keys(CONSUMABLES), k => ({ piadina: 3, crescentina: 4, caffe: 2, negroni: 1 })[k]), 1);
  return kind === 'gadget' ? rollGadget(level, rarity) : rollWeapon(level, rarity);
}
export const itemValue = (L, rarity, k = 1) => Math.round(12 * rarityOf(rarity).value * (1 + 0.12 * (L - 1)) * k);

// ---------------------------------------------------------------- text helpers
const MOD_TXT = { damage: 'danno', maxHp: 'vita', speed: 'velocità', reload: 'tempo di ricarica', fireRate: 'cadenza', lootLuck: 'fortuna', money: 'euro', xp: 'esperienza', armor: 'danni subiti', sell: 'prezzo di vendita', consumHeal: 'cure dal cibo', ammoPack: 'munizioni dai pacchi' };
export function modsText(m) {
  const out = [];
  for (const k in m) {
    const v = m[k];
    if (k === 'regen') out.push(`+${v} vita/s`); else if (k === 'healOnKill') out.push(`+${v} vita per nemico steso`);
    else { const p = Math.round((v - 1) * 100); if (p) out.push(`${p > 0 ? '+' : ''}${p}% ${MOD_TXT[k] || k}`); }
  }
  return out.join(' · ');
}
// a single "power" number for comparisons (weapons: sustained dps; gadgets: sum of bonuses)
export function power(it) {
  if (!it) return 0;
  if (it.kind === 'weapon') {
    const s = it.stats, P = it.perks || [], crit = 1 + (P.includes('critico') ? 0.15 : 0), shots = (P.includes('doppio') ? 2 : 1);
    const sustained = s.magazine > 0 ? (s.magazine * s.damage * shots) / (s.magazine / s.fireRate + s.reloadTime) : s.damage * s.fireRate;
    return Math.round(sustained * crit * (1 + (s.splashRadius || 0) * 0.25) * (P.includes('esplosivo') ? 1.15 : 1));
  }
  if (it.kind === 'gadget') { let p = 0; for (const k in it.mods) p += ADD_MODS.has(k) ? it.mods[k] * 8 : Math.abs(it.mods[k] - 1) * 100; return Math.round(p * (1 + 0.02 * it.level)); }
  return 0;
}
