// rpg/state.js — the persistent part of the looter/RPG layer (localStorage 'bigalesso_rpg_v1'; the save export in
// save.js copies every bigalesso_* key, so backups/imports include it).
import { AMMO, rollWeapon, makeConsumable } from './data.js';

const KEY = 'bigalesso_rpg_v1';
export const BAG = 30; // backpack slots

const fresh = () => {
  const start = rollWeapon(1, 'comune', 'pistola'); start.name = 'Spruzzino di casa'; start.starter = true;
  const umb = rollWeapon(1, 'comune', 'ombrello'); umb.name = 'Ombrello del portico';
  return {
    v: 1, level: 1, xp: 0, xpTotal: 0, money: 25,
    points: 0, stats: { vita: 0, danno: 0, velocita: 0, fortuna: 0 }, talents: [],
    items: [start, umb, makeConsumable('piadina', 2)],
    eq: { w: [start.id, umb.id, null, null], g: [null, null], active: 0 },
    ammo: Object.fromEntries(Object.entries(AMMO).map(([k, a]) => [k, a.start])),
    quests: [], questsDone: 0, giverCd: {}, tracked: null,
    crates: 0, kills: 0, scrapped: 0, found: { epico: 0, leggendario: 0 },
    shop: null,
  };
};

export function loadState() {
  let S = null;
  try { S = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { S = null; }
  const F = fresh();
  if (!S || typeof S !== 'object' || S.v !== 1) return F;
  for (const k in F) if (!(k in S)) S[k] = F[k];
  if (!Array.isArray(S.items)) S.items = F.items;
  if (!S.eq || !Array.isArray(S.eq.w)) S.eq = F.eq;
  for (const k in F.ammo) if (typeof S.ammo[k] !== 'number') S.ammo[k] = F.ammo[k];
  for (const k in F.stats) if (typeof S.stats[k] !== 'number') S.stats[k] = 0;
  S.quests = (S.quests || []).filter(q => q && q.id && q.state !== 'done');
  return S;
}

let wt = 0, cur = null;
export function saveState(S, now = false) {
  cur = S; clearTimeout(wt);
  const w = () => { try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch (e) { } };
  if (now) w(); else wt = setTimeout(w, 700);
}
if (typeof addEventListener === 'function') { addEventListener('pagehide', () => cur && saveState(cur, true)); addEventListener('beforeunload', () => cur && saveState(cur, true)); }
export const resetState = () => { try { localStorage.removeItem(KEY); } catch (e) { } };
