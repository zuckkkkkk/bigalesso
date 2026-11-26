// Collezione di figurine + statistiche delle carte. Salvataggio: localStorage 'bigalesso_cards' (il profilo online di
// NET sincronizza tutte le chiavi bigalesso_*).
import { CATALOG, BY_ID, STARTER, DECK_MIN, DECK_MAX, packRoll } from '../../shared/figurine.mjs';
import { rng, newSeed } from '../../shared/rng.mjs';

const KEY = 'bigalesso_cards';
const blank = () => ({ v: 1, owned: Object.fromEntries(STARTER.map(id => [id, 1])), shiny: {}, deck: STARTER.slice(), packs: 1, opened: 0, stats: {}, seen: {} });
let st = null;
function load() {
  if (st) return st;
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); st = s && s.v === 1 ? { ...blank(), ...s } : blank(); } catch (e) { st = blank(); }
  return st;
}
const listeners = new Set();
function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { } for (const f of listeners) try { f(st); } catch (e) { } }

export const col = {
  get state() { return load(); },
  onChange(f) { listeners.add(f); return () => listeners.delete(f); },
  owned: id => load().owned[id] || 0,
  shiny: id => load().shiny[id] || 0,
  total: () => CATALOG.filter(c => load().owned[c.id]).length,
  size: () => CATALOG.length,
  add(id, shiny = false, n = 1) {
    if (!BY_ID[id]) return false; const s = load();
    const isNew = !s.owned[id];
    s.owned[id] = (s.owned[id] || 0) + n; if (shiny) s.shiny[id] = (s.shiny[id] || 0) + n;
    save(); return isNew;
  },
  remove(id, shiny = false) {
    const s = load(); if (!s.owned[id]) return false;
    if (shiny && !s.shiny[id]) return false;
    s.owned[id]--; if (shiny) s.shiny[id]--;
    if (!s.owned[id]) { delete s.owned[id]; s.deck = s.deck.filter(x => x !== id); }
    save(); return true;
  },
  dupes: () => CATALOG.filter(c => (load().owned[c.id] || 0) > 1).map(c => c.id),
  deck() {
    const s = load(); let d = s.deck.filter(id => s.owned[id]);
    if (d.length < DECK_MIN) for (const id of [...STARTER, ...CATALOG.map(c => c.id)]) { if (d.length >= DECK_MIN) break; if (!d.includes(id) && s.owned[id]) d.push(id); }
    if (d.length < DECK_MIN) d = STARTER.slice(); // mai senza mazzo
    return d.slice(0, DECK_MAX);
  },
  toggleDeck(id) {
    const s = load(); if (!s.owned[id]) return 'non ce l\'hai';
    if (s.deck.includes(id)) { if (s.deck.length <= DECK_MIN) return `il mazzo deve avere almeno ${DECK_MIN} carte`; s.deck = s.deck.filter(x => x !== id); }
    else { if (s.deck.length >= DECK_MAX) return `massimo ${DECK_MAX} carte nel mazzo`; s.deck.push(id); }
    save(); return null;
  },
  inDeck: id => load().deck.includes(id),
  packs: () => load().packs,
  addPacks(n) { load().packs += n; save(); },
  openPack() {
    const s = load(); if (s.packs <= 0) return null;
    s.packs--; s.opened++;
    const got = packRoll(rng(newSeed()));
    for (const g of got) { g.isNew = !s.owned[g.id]; s.owned[g.id] = (s.owned[g.id] || 0) + 1; if (g.shiny) s.shiny[g.id] = (s.shiny[g.id] || 0) + 1; }
    save(); return got;
  },
  stat(game, outcome) { const s = load(); const g = s.stats[game] = s.stats[game] || { w: 0, l: 0, d: 0 }; g[outcome] = (g[outcome] || 0) + 1; save(); return g; },
  stats: game => load().stats[game] || { w: 0, l: 0, d: 0 },
};
