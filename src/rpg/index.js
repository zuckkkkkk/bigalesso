// rpg/index.js — BIGALESSO looter-shooter + RPG layer, all in the open world.
//   const rpg = installRPG({ scene, camera, ui, audio, level, S, man, npcs }); plugins.push(rpg.plugin); // BEFORE createWorld
//   rpg.update(dt, t)   every frame (after npcs.update)
// Loot (rarities comune → leggendario, comic weapons, perks, gadgets, food), crates around the quartiere and
// Teletubbylandia, Euro + ammo, inventory "Zaino" (I), XP / levels 1–50 / stat points / talent tree, missions from the
// friends (npcs.js option 6, phone "Missioni" app, J), the Banco dei pegni in Via Petroni.
//
// window.__rpg = {
//   onKill({type, pos, level, boss, elite}) ← combat calls it when an enemy dies (drops, XP, quests)
//   addXP(n, why), level, xp, xpNext, stats (points per stat), mods() → multipliers:
//     { damage, maxHp, speed, reload (× reload time), fireRate, lootLuck, money, xp, armor (× damage taken), sell, consumHeal,
//       ammoPack } + additive { regen (hp/s, applied here through __combat.heal), healOnKill (applied here) }
//   inventory → items array · equipped() → {weapons:[4 items|null], gadgets:[2], active} · current() → active weapon item
//   rollLoot(level, rarityBias, opts) → item · dropLoot(pos, item) · pickUp(item) → bool · give(item) (to the bag, no drop)
//   equip(id, slot) · setActive(slot) · money {get, add(n), spend(n)} · ammo {get(type), add(type,n), take(type,n) → n taken, forBase(base),
//     canReload(item), reload(item, need) → rounds granted (combat's reload should call these; starter gun + umbrella are infinite)}
//   perkInfo(id) → {name, desc} (item.perks are ids; combat implements doppio/vampiro/esplosivo/gelo/rimbalzo/turbo/critico)
//   open(tab 'bag'|'hero'|'shop') · close() · questOffer(npcId) → Promise<{line, choices, choose(text)}> (npcs.js)
//   renderHero(el) (menu page "Personaggio") · renderQuests(el) (phone app) · on(evt, fn): 'level' 'loot' 'equip' 'mods' 'money' 'quest'
// }
// Loadout → combat: __combat.give(item, i) / take(i) until combat.loadout() matches the 4 weapon slots; mods are written into
// __combat.mods (damage, fireRate, reload, armor) + __combat.player.maxHp; W.speedMul = speed mod (explore.js must read it). Also
// dispatches window event 'bigalesso:rpg' {type:'mods'|'equip'|'level', …} so combat can refresh max HP etc.
import * as THREE from 'three';
import { RARITIES, rarityOf, RANK, AMMO, BASES, STATS, TREE, CONSUMABLES, STACK, MAX_LEVEL, xpNeed, perkPicksAt, baseMods, addMods, rollItem, rollWeapon, rollGadget, makeConsumable, power, perkInfo } from './data.js';
import { loadState, saveState, BAG } from './state.js';
import { createWorldLoot } from './worldloot.js';
import { createQuests } from './quests.js';
import { createRPGUI } from './ui.js';
import { emitEvent } from '../ai.js';

const ACH = [
  { id: 'rpg_lv5', icon: '⭐', title: 'Burdèl promettente', desc: 'Arriva al livello 5' },
  { id: 'rpg_lv10', icon: '🌟', title: 'Veterano di Petroni', desc: 'Arriva al livello 10' },
  { id: 'rpg_lv25', icon: '💫', title: 'Leggenda del quartiere', desc: 'Arriva al livello 25' },
  { id: 'rpg_lv50', icon: '👑', title: 'Il titolare', desc: 'Arriva al livello 50', hidden: true },
  { id: 'loot_epic', icon: '🟣', title: 'Roba seria', desc: 'Raccogli un oggetto epico' },
  { id: 'loot_legend', icon: '🟠', title: 'Leggendario, porca troia', desc: 'Raccogli un oggetto leggendario' },
  { id: 'crates_10', icon: '📦', title: 'Frugatore', desc: 'Apri 10 casse, frighi o bauletti' },
  { id: 'crates_50', icon: '🗃️', title: 'Svuotacantine', desc: 'Apri 50 casse, frighi o bauletti' },
  { id: 'shop_buy', icon: '💸', title: 'Cliente del banco', desc: 'Compra qualcosa al Banco dei pegni' },
  { id: 'scrap_10', icon: '🔧', title: 'Rottamaio', desc: 'Smonta 10 oggetti' },
  { id: 'loadout_full', icon: '🎒', title: 'Armato fino ai denti', desc: 'Riempi tutti e quattro gli slot delle armi' },
  { id: 'quest_first', icon: '📜', title: 'Favore fatto', desc: 'Completa una missione per un amico' },
  { id: 'quest_10', icon: '🧰', title: 'Tuttofare del gruppo', desc: 'Completa 10 missioni' },
  { id: 'rich', icon: '💰', title: 'Ricco sfondato', desc: 'Metti da parte 5.000 euro' },
].map(a => ({ ...a, cat: 'Looter & RPG' }));

export function installRPG({ scene, camera, ui, audio, level, S, man, npcs }) {
  const st = loadState();
  const save = (now) => saveState(st, now);
  const cbs = {};
  const emit = (n, d) => { for (const f of cbs[n] || []) try { f(d); } catch (e) { console.error(e); } try { window.dispatchEvent(new CustomEvent('bigalesso:rpg', { detail: { type: n, ...(d || {}) } })); } catch (e) { } };
  const C = () => window.__combat || null;
  let W = null; // explore world (from the plugin factory)
  const tmpV = new THREE.Vector3();
  const playerPos = () => man.root.position;
  const zoneAt = (x, z) => (level && level.zoneAt ? level.zoneAt(x, z) : null);
  const unlock = (id, meta) => { try { const s = window.__save; s && s.unlock && s.unlock(id, meta); } catch (e) { } };
  try { window.__save && window.__save.define && window.__save.define(ACH); } catch (e) { }

  // ---------------------------------------------------------------- items
  const byId = id => id ? st.items.find(x => x.id === id) || null : null;
  const isEq = id => st.eq.w.includes(id) || st.eq.g.includes(id);
  const bag = () => st.items.filter(x => !isEq(x.id));
  const slotOf = id => { let i = st.eq.w.indexOf(id); if (i >= 0) return { kind: 'w', i, label: String(i + 1) }; i = st.eq.g.indexOf(id); return i >= 0 ? { kind: 'g', i, label: 'A' + (i + 1) } : null; };
  const equippedList = () => [...st.eq.w, ...st.eq.g].map(byId).filter(Boolean);
  const firstFree = kind => { const arr = kind === 'gadget' ? st.eq.g : st.eq.w; const i = arr.indexOf(null); return i >= 0 ? i : (kind === 'gadget' ? 0 : st.eq.active); };
  const compareRef = it => { const same = st.eq.w.map(byId).find(x => x && x.base === it.base); return same || byId(st.eq.w[st.eq.active]) || st.eq.w.map(byId).find(Boolean) || null; };
  function addToBag(item) {
    if (item.kind === 'consumable') {
      const s = st.items.find(x => x.kind === 'consumable' && x.key === item.key && x.n < STACK);
      if (s) { const k = Math.min(STACK - s.n, item.n); s.n += k; item.n -= k; if (item.n <= 0) return true; }
    }
    if (bag().length >= BAG) return false;
    st.items.push(item); return true;
  }

  // ---------------------------------------------------------------- mods
  let modsCache = null; const buffs = [];
  function dirty(why = 'mods') { modsCache = null; emit('mods', { why }); pushMods(); }
  function mods() {
    if (buffs.length) { const now = performance.now(); let ch = false; for (let i = buffs.length - 1; i >= 0; i--) if (buffs[i].until < now) { buffs.splice(i, 1); ch = true; } if (ch) dirty('buff'); }
    if (modsCache) return modsCache;
    const m = baseMods();
    for (const k in STATS) addMods(m, STATS[k].mod(st.stats[k] || 0));
    for (const id of st.talents) { for (const b of TREE) { const p = b.perks.find(x => x.id === id); if (p) addMods(m, p.mods); } }
    for (const id of [...st.eq.w, ...st.eq.g]) { const it = byId(id); if (it && it.mods) addMods(m, it.mods); }
    for (const b of buffs) addMods(m, b.mods);
    m.speed = Math.min(m.speed, 1.6); m.armor = Math.max(0.35, m.armor); m.reload = Math.max(0.4, m.reload);
    return (modsCache = m);
  }
  let questLuck = 0;

  // ---------------------------------------------------------------- loadout + mods → combat (combat/index.js API)
  // slots: __combat.give(item, i) / take(i) until combat.loadout() matches the 4 RPG weapon slots (ids); mods are written into
  // __combat.mods (damage, fireRate, reload = speed factor, armor = reduction 0..0.8) and __combat.player.maxHp
  let syncKey = '', combatHooked = false, syncing = false;
  function syncCombat(force = false) {
    const c = C(); if (!c) return;
    const Wp = st.eq.w.map(byId);
    const key = Wp.map(x => x ? x.id : '-').join(',');
    if (!force && key === syncKey) return; syncKey = key;
    syncing = true;
    try {
      if (typeof c.setLoadout === 'function') c.setLoadout(Wp, st.eq.active);
      else if (typeof c.give === 'function') {
        const cur = typeof c.loadout === 'function' ? c.loadout() : [];
        for (let i = 0; i < 4; i++) {
          const want = Wp[i], have = cur[i];
          if ((have && have.id) === (want && want.id)) continue;
          if (want) c.give(want, i); else if (typeof c.take === 'function') c.take(i);
        }
      }
    } catch (e) { console.warn('rpg → combat loadout', e); }
    syncing = false;
  }
  function pushMods() {
    const c = C(), m = mods();
    if (W) W.speedMul = m.speed; // explore.js: max walk/run speed × W.speedMul (if supported)
    if (!c) return;
    try {
      if (c.mods) { c.mods.damage = m.damage; c.mods.fireRate = m.fireRate; c.mods.reload = 1 / Math.max(0.3, m.reload); c.mods.armor = Math.min(0.8, Math.max(0, 1 - m.armor)); }
      const P = c.player; if (P) { const max = Math.round(100 * m.maxHp); if (P.maxHp !== max) { const d = max - P.maxHp; P.maxHp = max; if (!P.dead) P.hp = Math.max(1, Math.min(max, P.hp + Math.max(0, d))); } }
      c.refreshStats && c.refreshStats();
    } catch (e) { }
  }
  function adopt(it) { // an item given to combat by someone else (wave 2 modes, debug) joins the inventory
    if (!it || !it.id || byId(it.id)) return byId(it && it.id);
    const B = BASES[it.base]; if (!B) return null;
    const x = { ...it, kind: 'weapon', perks: (it.perks || []).slice(), mods: it.mods || {}, icon: B.icon, value: it.value || Math.round(12 * rarityOf(it.rarity).value * (1 + 0.12 * ((it.level || 1) - 1))) };
    st.items.push(x); return x;
  }
  function hookCombat() {
    const c = C(); if (!c || combatHooked) return; combatHooked = true;
    try {
      if (c.on) {
        c.on('playerDeath', () => { const lost = Math.round(st.money * 0.1); if (lost > 0) { st.money -= lost; UI.feedAdd('💸', `− € ${lost}`, 'Ti hanno fregato il portafoglio', '#ff5a5a'); save(); } });
        c.on('equip', d => { const i = d && typeof d.slot === 'number' ? d.slot : null; if (i != null && i >= 0 && i < 4 && i !== st.eq.active) { st.eq.active = i; save(); } });
        c.on('give', d => {
          if (syncing || !d || !d.item) return;
          const x = adopt(d.item); if (!x || !(d.slot >= 0 && d.slot < 4)) return;
          const old = st.eq.w.indexOf(x.id); if (old >= 0 && old !== d.slot) st.eq.w[old] = null;
          st.eq.w[d.slot] = x.id; syncKey = st.eq.w.join(','); dirty('equip'); save();
        });
        c.on('respawn', () => pushMods());
      }
    } catch (e) { console.warn('rpg combat hooks', e); }
    syncCombat(true); dirty('combat');
  }
  function equip(id, slot) {
    const it = byId(id); if (!it || it.kind === 'consumable') return false;
    const arr = it.kind === 'gadget' ? st.eq.g : st.eq.w; slot = Math.max(0, Math.min(arr.length - 1, slot | 0));
    const old = arr.indexOf(id); if (old >= 0) arr[old] = arr[slot];
    arr[slot] = id;
    if (it.kind === 'weapon') st.eq.active = slot;
    if (st.eq.w.every(Boolean)) unlock('loadout_full', ACH.find(a => a.id === 'loadout_full'));
    sfx('equip'); save(); dirty('equip'); syncCombat();
    if (it.kind === 'weapon') try { const c = C(); if (c && c.state && c.state.drawn && c.equip) c.equip(slot); } catch (e) { }
    emit('equip', { item: it, slot });
    return true;
  }
  function unequip(id) {
    const s = slotOf(id); if (!s) return false;
    if (s.kind === 'w' && st.eq.w.filter(Boolean).length <= 1) { UI.feedAdd('✋', 'Almeno un\'arma tienila', '', '#ff5a5a'); sfx('err'); return false; }
    if (bag().length >= BAG) { UI.feedAdd('🎒', 'Zaino pieno', 'Smonta qualcosa prima', '#ff5a5a'); sfx('err'); return false; }
    (s.kind === 'w' ? st.eq.w : st.eq.g)[s.i] = null;
    if (s.kind === 'w' && st.eq.active === s.i) st.eq.active = Math.max(0, st.eq.w.findIndex(Boolean));
    sfx('equip'); save(); dirty('equip'); syncCombat(); return true;
  }
  function removeItem(id) { const i = st.items.findIndex(x => x.id === id); if (i < 0 || isEq(id)) return null; return st.items.splice(i, 1)[0]; }
  const scrapPrice = it => Math.max(1, Math.round((it.value || 5) * 0.25 * (it.n || 1)));
  const sellPrice = it => Math.max(1, Math.round((it.value || 5) * 0.4 * mods().sell * (it.n || 1)));
  const buyPrice = it => Math.max(1, Math.round((it.price || it.value || 5)));
  function scrap(id) { const it = byId(id); if (!it || it.starter || isEq(id)) return false; removeItem(id); st.money += scrapPrice(it); st.scrapped++; if (st.scrapped >= 10) unlock('scrap_10', ACH.find(a => a.id === 'scrap_10')); sfx('scrap'); UI.feedAdd('🔧', it.name, `smontato · + € ${scrapPrice(it)}`, '#9aa7b8'); save(); return true; }
  function sell(id) { const it = byId(id); if (!it || it.starter || isEq(id)) return false; const p = sellPrice(it); removeItem(id); st.money += p; sfx('coin'); UI.feedAdd('💶', it.name, `venduto · + € ${p}`, '#7dff8a'); save(); return true; }
  function dropItem(id) { const it = byId(id); if (!it || it.starter || isEq(id)) return false; removeItem(id); const p = playerPos(), y = W ? W.yaw : 0; loot.dropItem({ x: p.x + Math.sin(y) * 0.9, y: 0.6, z: p.z + Math.cos(y) * 0.9 }, it, 0.2); sfx('tick'); save(); return true; }
  function use(id) {
    const it = byId(id); if (!it || it.kind !== 'consumable') return false; const D = CONSUMABLES[it.key]; if (!D) return false;
    const c = C();
    if (D.heal) { if (c && c.player && c.player.hp >= (c.player.maxHp || 100) - 0.5) { UI.feedAdd(it.icon, 'Sei già in forma', '', '#9aa7b8'); return false; } try { c && c.heal && c.heal(D.heal * mods().consumHeal); } catch (e) { } }
    if (D.buff) { buffs.push({ mods: D.buff, until: performance.now() + D.time * 1000 }); dirty('buff'); }
    it.n--; if (it.n <= 0) removeItem(id);
    sfx('pick'); UI.feedAdd(it.icon, D.name, D.desc, '#7dff8a'); save(); return true;
  }

  // ---------------------------------------------------------------- money / ammo
  const money = {
    get: () => st.money,
    add(n, why) { n = Math.round(n); if (!n) return; st.money = Math.max(0, st.money + n); if (st.money >= 5000) unlock('rich', ACH.find(a => a.id === 'rich')); save(); emit('money', { n, why }); },
    spend(n) { if (st.money < n) return false; st.money -= n; save(); emit('money', { n: -n }); return true; },
  };
  const ammo = {
    get: t => st.ammo[t] || 0,
    add(t, n) { const A = AMMO[t]; if (!A) return 0; const k = Math.max(0, Math.min(A.max - (st.ammo[t] || 0), n)); st.ammo[t] = (st.ammo[t] || 0) + k; if (k) save(); return k; },
    take(t, n) { const k = Math.max(0, Math.min(st.ammo[t] || 0, n)); st.ammo[t] = (st.ammo[t] || 0) - k; if (k) save(); return k; },
    forBase: b => (BASES[b] || {}).ammo || null,
    // for combat's reload: the starter water gun and the umbrella never run dry, everything else eats the reserve
    canReload: it => !it || it.starter || !BASES[it.base] || !BASES[it.base].ammo || (st.ammo[BASES[it.base].ammo] || 0) > 0,
    reload(it, need) { if (!it || it.starter) return need; const t = BASES[it.base] && BASES[it.base].ammo; return t ? ammo.take(t, need) : need; },
  };

  // ---------------------------------------------------------------- XP / levels
  function addXP(n, why = '') {
    if (st.level >= MAX_LEVEL) return 0;
    n = Math.max(1, Math.round(n * mods().xp));
    st.xp += n; st.xpTotal += n;
    const before = st.level;
    while (st.level < MAX_LEVEL && st.xp >= xpNeed(st.level)) { st.xp -= xpNeed(st.level); st.level++; st.points++; }
    if (st.level >= MAX_LEVEL) st.xp = 0;
    UI.xpPop(n);
    if (st.level > before) levelUp(before);
    save(); return n;
  }
  function levelUp(from) {
    const L = st.level, perk = Math.floor(L / 5) > Math.floor(from / 5);
    UI.banner('Promosso', 'Livello ' + L, `+${L - from} ${L - from === 1 ? 'punto abilità' : 'punti abilità'}${perk ? ' · nuovo talento da scegliere' : ''} · ${ui && ui.coarse ? '🎒 Zaino → Personaggio' : 'I → Personaggio'}`);
    sfx('level');
    try { const c = C(); c && c.heal && c.heal(9999); } catch (e) { }
    for (const [lv, id] of [[5, 'rpg_lv5'], [10, 'rpg_lv10'], [25, 'rpg_lv25'], [50, 'rpg_lv50']]) if (L >= lv) unlock(id, ACH.find(a => a.id === id));
    emitEvent('levelup', { level: L, text: `Zuck è salito al livello ${L}` });
    emit('level', { level: L }); dirty('level');
  }
  const talentPicks = () => Math.max(0, perkPicksAt(st.level) - st.talents.length);
  function spendPoint(k) { if (!st.points || !STATS[k]) return false; const cap = STATS[k].cap; if (cap && st.stats[k] >= cap) return false; st.stats[k]++; st.points--; sfx('equip'); save(); dirty('stat'); return true; }
  function pickTalent(id) {
    if (!talentPicks() || st.talents.includes(id)) return false;
    const br = TREE.find(b => b.perks.some(p => p.id === id)); if (!br) return false;
    const got = st.talents.filter(x => br.perks.some(p => p.id === x)).length;
    if (br.perks[got].id !== id) return false;
    st.talents.push(id); sfx('done'); save(); dirty('talent');
    UI.feedAdd(br.icon, br.perks[got].name, 'Talento ' + br.name, br.color); return true;
  }

  // ---------------------------------------------------------------- loot rolls / pickups
  const luck = () => mods().lootLuck * (1 + questLuck);
  const lootLevel = L => Math.max(1, Math.min(st.level + 2, Math.round(L || st.level)));
  const rollLoot = (L = st.level, bias = 0, opts = {}) => rollItem(lootLevel(L), { luck: luck(), bias, ...opts });
  const posOf = p => !p ? playerPos() : p.isVector3 ? p : Array.isArray(p) ? { x: p[0], y: p[1], z: p[2] } : { x: p.x || 0, y: p.y || 0, z: p.z || 0 };
  function pickUp(item, silent = false) {
    if (!item) return false;
    const name = item.name, n0 = item.n;
    if (!addToBag(item)) { UI.feedAdd('🎒', 'Zaino pieno', ui && ui.coarse ? 'Apri lo zaino e smonta qualcosa' : 'Premi I e smonta qualcosa', '#ff5a5a'); sfx('err'); return false; }
    // empty slot? equip it straight away
    if (item.kind === 'weapon' && st.eq.w.includes(null) && !isEq(item.id)) { st.eq.w[st.eq.w.indexOf(null)] = item.id; dirty('equip'); syncCombat(); }
    else if (item.kind === 'gadget' && st.eq.g.includes(null) && !isEq(item.id)) { st.eq.g[st.eq.g.indexOf(null)] = item.id; dirty('equip'); }
    const R_ = rarityOf(item.rarity), rk = RANK[item.rarity] || 0;
    if (!silent) {
      UI.feedAdd(item.icon, name + (item.kind === 'consumable' && n0 > 1 ? ' x' + n0 : ''), item.kind === 'consumable' ? item.desc : `${R_.name} · liv. ${item.level}${item.kind === 'weapon' ? ' · potenza ' + power(item) : ''}${isEq(item.id) ? ' · equipaggiato' : ''}`, R_.color);
      sfx(rk >= 4 ? 'legend' : rk >= 2 ? 'rare' : 'pick');
    }
    if (rk >= 3) { st.found[item.rarity] = (st.found[item.rarity] || 0) + 1; unlock(rk >= 4 ? 'loot_legend' : 'loot_epic', ACH.find(a => a.id === (rk >= 4 ? 'loot_legend' : 'loot_epic'))); if (rk >= 4) unlock('loot_epic', ACH.find(a => a.id === 'loot_epic')); emitEvent('loot', { text: `Zuck ha trovato ${name} (${R_.name.toLowerCase()})` }); }
    Q.onLoot(item); emit('loot', { item }); save();
    return true;
  }
  function giveLoot(bias = 0.7) { const it = rollLoot(st.level, bias, { kind: Math.random() < 0.8 ? 'weapon' : 'gadget', minRarity: 1 }); if (!pickUp(it)) loot.dropItem({ x: playerPos().x, y: 0.8, z: playerPos().z }, it); }
  function crateLoot(type) {
    const L = st.level, out = [], m = mods().money, r = Math.random;
    if (type === 'cassetta') {
      out.push({ money: (3 + 2 * L) * (0.7 + r() * 0.6) * m });
      if (r() < 0.6) out.push(ammoDrop());
      if (r() < 0.32 * luck()) out.push({ item: rollLoot(L, 0) });
      if (r() < 0.25) out.push({ item: makeConsumable('crescentina') });
    } else if (type === 'frigo') {
      out.push({ item: makeConsumable(r() < 0.6 ? 'piadina' : 'negroni') });
      if (r() < 0.4) out.push({ item: makeConsumable(r() < 0.5 ? 'caffe' : 'crescentina') });
      if (r() < 0.62 * Math.min(1.5, luck())) out.push({ item: rollLoot(L, 0.4) });
      if (r() < 0.4) out.push(ammoDrop());
    } else {
      out.push({ item: rollLoot(L, 1.0, { minRarity: 1 }) }, { money: (8 + 4 * L) * (0.7 + r() * 0.6) * m });
      if (r() < 0.3 * luck()) out.push({ item: rollLoot(L, 0.5) });
    }
    return out;
  }
  function ammoDrop() {
    const eq = st.eq.w.map(byId).filter(x => x && BASES[x.base].ammo);
    const t = eq.length && Math.random() < 0.75 ? BASES[eq[(Math.random() * eq.length) | 0].base].ammo : Object.keys(AMMO)[(Math.random() * 4) | 0];
    return { ammo: t, amount: AMMO[t].pack };
  }

  // ---------------------------------------------------------------- combat → kills
  function onKill(e = {}) {
    const pos = posOf(e.pos), L = Math.max(1, e.level || st.level), M = mods();
    const boss = !!(e.boss || /boss/i.test(e.type || '')), elite = !!(e.elite || /elite|capo/i.test(e.type || ''));
    st.kills++;
    addXP(12 * (1 + 0.25 * (L - 1)) * (boss ? 12 : elite ? 3 : 1), 'kill');
    if (M.healOnKill) try { const c = C(); c && c.heal && c.heal(M.healOnKill); } catch (x) { }
    const p = { x: pos.x, y: (pos.y || 0) + 0.6, z: pos.z };
    loot.dropMoney(p, (2 + 1.5 * L) * (0.6 + Math.random() * 0.8) * M.money * (boss ? 8 : elite ? 2.5 : 1));
    if (Math.random() < 0.45) { const a = ammoDrop(); loot.dropAmmo(p, a.ammo, a.amount); }
    const chance = boss ? 1 : (elite ? 0.6 : 0.2) * Math.min(2, luck());
    if (Math.random() < chance) loot.dropItem(p, rollLoot(L, boss ? 1.4 : elite ? 0.6 : 0, boss ? { minRarity: 2 } : {}));
    if (boss && Math.random() < 0.6) loot.dropItem(p, rollLoot(L, 1.0));
    Q.onKill(pos, zoneAt(playerPos().x, playerPos().z));
    save();
  }
  let qSpawned = [];
  function spawnQuestEnemy(q, player) {
    const c = C(); if (!c || typeof c.spawnEnemy !== 'function') return;
    qSpawned = qSpawned.filter(e => e && !(e.dead || e.removed || e.alive === false || e.hp <= 0));
    if (qSpawned.length >= Math.min(3, q.need - q.have)) return;
    for (let k = 0; k < 10; k++) {
      const a = Math.random() * Math.PI * 2, r = 9 + Math.random() * 7, x = player.x + Math.cos(a) * r, z = player.z + Math.sin(a) * r;
      if (zoneAt(x, z) !== q.target.zone || (level.isWalkable && !level.isWalkable(x, z, 0.4))) continue;
      let e = null; const type = q.target.zone === 'Piazzetta' && Math.random() < 0.6 ? 'pigeon' : 'zombie';
      try { e = c.spawnEnemy(type, new THREE.Vector3(x, 0, z), { level: st.level, quest: q.id }); } catch (err) { console.warn('rpg spawnEnemy', err); }
      qSpawned.push(e || { t: performance.now() }); break;
    }
    if (qSpawned.some(e => e && e.t && performance.now() - e.t > 20000)) qSpawned = qSpawned.filter(e => !(e && e.t && performance.now() - e.t > 20000));
  }

  // ---------------------------------------------------------------- shop (Banco dei pegni)
  function shopStock() {
    const now = Date.now();
    if (!st.shop || now - st.shop.t > 8 * 60000 || Math.abs(st.shop.level - st.level) >= 2) rollShop();
    const fixed = Object.keys(CONSUMABLES).map(k => ({ ...makeConsumable(k), id: 'shop_' + k, price: CONSUMABLES[k].value }))
      .concat(Object.entries(AMMO).map(([k, a]) => ({ id: 'shop_ammo_' + k, kind: 'ammo', ammo: k, name: `${a.name} x${a.pack}`, icon: a.icon, n: a.pack, rarity: 'comune', level: 1, desc: `Pacco da ${a.pack} · ne hai ${st.ammo[k]}/${a.max}`, price: { acqua: 12, tortellini: 18, freccette: 18, spritz: 35 }[k] })));
    return st.shop.stock.concat(fixed);
  }
  function rollShop() {
    const stock = [];
    for (let i = 0; i < 7; i++) { const it = rollItem(lootLevel(st.level + (i < 2 ? 1 : 0)), { luck: luck(), bias: 0.55 + (i === 0 ? 0.6 : 0), kind: i < 5 ? 'weapon' : 'gadget', minRarity: i < 2 ? 1 : 0 }); it.price = Math.round(it.value * 1.15); stock.push(it); }
    st.shop = { t: Date.now(), level: st.level, stock }; save();
  }
  const rerollPrice = () => 15 + st.level * 3;
  function reroll() { if (!money.spend(rerollPrice())) { sfx('err'); UI.feedAdd('💸', 'Non hai abbastanza euro', '', '#ff5a5a'); return; } rollShop(); sfx('coin'); }
  function buy(it) {
    const p = buyPrice(it);
    if (st.money < p) { sfx('err'); UI.feedAdd('💸', 'Non hai abbastanza euro', '', '#ff5a5a'); return false; }
    if (it.kind === 'ammo') { if (ammo.add(it.ammo, it.n) <= 0) { UI.feedAdd(it.icon, 'Sei già pieno', '', '#9aa7b8'); return false; } st.money -= p; sfx('coin'); UI.feedAdd(it.icon, it.name, `comprato · − € ${p}`, '#7dff8a'); save(); unlock('shop_buy', ACH.find(a => a.id === 'shop_buy')); return true; }
    let item = it;
    if (it.kind === 'consumable') item = makeConsumable(it.key, 1);
    else { const { price, ...rest } = it; item = rest; }
    st.money -= p;
    if (!pickUp(item, true)) { st.money += p; return false; }
    if (it.kind !== 'consumable') st.shop.stock = st.shop.stock.filter(x => x.id !== it.id);
    sfx('coin'); UI.feedAdd(item.icon, item.name, `comprato · − € ${p}`, rarityOf(item.rarity).color); save();
    unlock('shop_buy', ACH.find(a => a.id === 'shop_buy'));
    return true;
  }

  // ---------------------------------------------------------------- sounds (WebAudio tones through the game mixer)
  function sfx(k) {
    const a = audio; if (!a || !a.ctx || a.muted) return;
    const T = (type, f0, f1, d, v, w = 0) => a.tone(type, f0, f1, d, v, a.room, w);
    try {
      switch (k) {
        case 'tick': T('sine', 1250, 0, 0.035, 0.025); break;
        case 'tab': T('triangle', 680, 920, 0.07, 0.035); break;
        case 'coin': T('square', 1320, 0, 0.05, 0.018); T('square', 1760, 0, 0.09, 0.018, 0.05); break;
        case 'ammo': T('triangle', 260, 520, 0.09, 0.05); T('square', 900, 0, 0.03, 0.012, 0.07); break;
        case 'pick': [523, 659, 784].forEach((f, i) => T('triangle', f, 0, 0.16, 0.045, i * 0.045)); break;
        case 'rare': [587, 740, 880, 1175].forEach((f, i) => T('triangle', f, 0, 0.22, 0.05, i * 0.055)); T('sine', 1760, 0, 0.5, 0.02, 0.22); break;
        case 'legend': [392, 523, 659, 784, 1047, 1319].forEach((f, i) => T('triangle', f, 0, 0.45, 0.06, i * 0.07)); T('sine', 2093, 0, 1.1, 0.03, 0.42); a.noise && a.noise(0.9, 0.02, 9000, 2000, a.room, 0.3, 0.5, 'highpass'); break;
        case 'crate': T('sawtooth', 170, 90, 0.16, 0.035); T('triangle', 420, 680, 0.2, 0.035, 0.07); break;
        case 'level': [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => T('triangle', f, 0, 0.55, 0.065, i * 0.08)); T('sine', 2093, 0, 1.2, 0.03, 0.48); T('square', 131, 0, 0.6, 0.02, 0.48); break;
        case 'quest': [440, 554, 659].forEach((f, i) => T('sine', f, 0, 0.3, 0.05, i * 0.09)); break;
        case 'done': [523, 784, 659, 1047].forEach((f, i) => T('triangle', f, 0, 0.35, 0.06, i * 0.1)); T('sine', 1568, 0, 0.8, 0.025, 0.4); break;
        case 'equip': T('square', 220, 330, 0.06, 0.03); T('triangle', 660, 0, 0.05, 0.02, 0.04); break;
        case 'scrap': T('sawtooth', 700, 120, 0.22, 0.03); break;
        case 'err': T('square', 190, 150, 0.14, 0.035); break;
      }
    } catch (e) { }
  }

  // ---------------------------------------------------------------- world loot + quests + ui
  const hooks = {
    crateLoot,
    crateOpened(c, name) { st.crates++; sfx('crate'); addXP(8, 'crate'); if (st.crates >= 10) unlock('crates_10', ACH.find(a => a.id === 'crates_10')); if (st.crates >= 50) unlock('crates_50', ACH.find(a => a.id === 'crates_50')); save(); },
    pickItem: it => pickUp(it),
    addMoney(n) { money.add(n, 'pickup'); sfx('coin'); UI.feedAdd('💶', '+ € ' + n, '', '#7dff8a'); return true; },
    addAmmo(t, n) { const k = ammo.add(t, Math.round(n * mods().ammoPack)); if (!k) return false; sfx('ammo'); UI.feedAdd(AMMO[t].icon, `+${k} ${AMMO[t].short}`, '', '#5ff7ff'); return true; },
    questPicked: qid => Q.picked(qid),
    openShop: () => UI.open('shop', true),
  };
  const loot = createWorldLoot({ scene, level, hooks });
  const walkNear = (x, z) => { for (let r = 0; r <= 3; r += 0.5) for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (!level.isWalkable || level.isWalkable(px, pz, 0.3)) return { x: px, z: pz }; if (!r) break; } return null; };
  const npcPos = id => { const n = npcs && npcs.get && npcs.get(id); return n && n.root && n.root.visible !== false && !n.leaving ? n.root.position : null; };
  const ensureNpc = (id, call = false) => { try { if (npcPos(id) || !npcs) return; if (call && npcs.call) npcs.call(id); else if (npcs.spawn) npcs.spawn(id); } catch (e) { } };
  const R = {
    get state() { return st; }, level, loot, BAG, ui: null,
    byId, bag, slotOf, equippedList, firstFree, compareRef, equip, unequip, use, scrap, sell, dropItem, buy, reroll, rerollPrice, shopStock, buyPrice, sellPrice, scrapPrice,
    talentPicks, mods, spendPoint, pickTalent, sfx, save, addXP, addMoney: (n, w) => money.add(n, w), giveLoot, unlock, zoneAt, walkNear, npcPos, ensureNpc, spawnQuestEnemy,
    playerPos: () => playerPos(),
    onOverlay(open) { try { const app = window.__app; if (open && app && app.input) { app.input.keys.clear(); app.input.releaseLock && app.input.releaseLock(); } } catch (e) { } }, // closing: click to grab the mouse again (like the phone)
  };
  const Q = createQuests(R);
  R.quests = { list: () => Q.list(), track: id => Q.track(id), abandon: id => Q.abandon(id) };
  const UI = createRPGUI(R); R.ui = UI;

  // ---------------------------------------------------------------- game events → XP
  addEventListener('bigalesso:minigame', e => { const d = e.detail || {}; const t = String(d.text || ''); if (!t || /iniziato/.test(t)) return; const win = /vinto|primo|sopravvissuto|innocente/.test(t); addXP(win ? 110 : 40, 'minigame'); Q.onMinigame(d.kind, t); });
  addEventListener('bigalesso:place', e => { const d = e.detail || {}; if (d.first) { addXP(60, 'place'); UI.feedAdd('🗺️', d.name || 'Nuovo posto', '+ esperienza esplorazione', '#5ff7ff'); } });
  addEventListener('bigalesso:event', e => { const d = e.detail || {}; if (d.type === 'egg') addXP(30, 'egg'); });
  try { window.__save && window.__save.on && window.__save.on('unlock', id => { if (!/^rpg_|^loot_|^crates_|^quest_|^scrap_|^shop_|^rich|^loadout/.test(id)) addXP(25, 'achievement'); }); } catch (e) { }

  // ---------------------------------------------------------------- keys: I zaino · J missioni
  const canOpen = () => S && S.phase === 'world' && W && ['explore', 'goto', 'vespa'].includes(W.mode) && !(ui && ui.menuOpen) && (!document.body.dataset.overlay || document.body.dataset.overlay === 'phone');
  addEventListener('keydown', e => {
    if (e.defaultPrevented || e.repeat || UI.isOpen) return;
    const t = e.target; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    if (e.code !== 'KeyI' && e.code !== 'KeyJ') return;
    if (!canOpen()) return;
    e.preventDefault(); e.stopPropagation();
    if (e.code === 'KeyI') { try { window.__phone && window.__phone.isOpen && window.__phone.isOpen() && window.__phone.close(); } catch (x) { } openInv('bag'); }
    else { try { window.__phone && window.__phone.open('quests'); } catch (x) { } }
  }, true);
  function openInv(tab = 'bag', shop = false) { UI.open(tab, shop); sfx('tab'); }
  // touch: a backpack button in the mobile bar (mobile.js #mobBar)
  if (ui && ui.coarse) {
    const addBtn = () => { const bar = document.getElementById('mobBar'); if (!bar) return false; const b = document.createElement('button'); b.textContent = '🎒'; b.title = 'Zaino'; b.addEventListener('click', e => { e.preventDefault(); if (canOpen()) openInv('bag'); }); bar.appendChild(b); const q = document.createElement('button'); q.textContent = '📜'; q.title = 'Missioni'; q.addEventListener('click', e => { e.preventDefault(); try { window.__phone && window.__phone.open('quests'); } catch (x) { } }); bar.appendChild(q); return true; };
    if (!addBtn()) setTimeout(addBtn, 1500);
  }
  // pause menu "Zaino" action (ui.js data-act="inv")
  try { ui && ui.onMenu && ui.onMenu(a => { if (a === 'inv') { ui.menu.hide(); setTimeout(() => openInv('bag'), 60); } }); } catch (e) { }

  // ---------------------------------------------------------------- explore plugin (pickups, crates, shop)
  const plugin = (ctx, w) => { W = w; return { items: loot.items }; };

  // ---------------------------------------------------------------- per frame
  const _proj = new THREE.Vector3();
  let regenT = 0, warmed = false, hudT = 0, trackT = 0;
  function update(dt, t) {
    if (!warmed && window.__gfx && window.__gfx.ready) { warmed = true; loot.warmDone(); }
    if (!combatHooked && C()) hookCombat();
    if (C()) syncCombat();
    const inWorld = S && S.phase === 'world' && W;
    const mode = inWorld ? W.mode : '';
    const p = inWorld ? playerPos() : null;
    loot.update(dt, t, p, inWorld && ['explore', 'goto', 'vespa'].includes(mode) && !UI.isOpen);
    if (!inWorld) { UI.waypoint(null); UI.setTracker(null); return; }
    questLuck = S && st.quests.some(q => q.type === 'legendary') ? 0.5 : 0;
    Q.update(dt, p, mode);
    // regen
    const M = mods();
    if (M.regen > 0) { regenT += dt; if (regenT > 0.5) { const c = C(); try { if (c && c.player && !c.player.dead && c.player.hp < (c.player.maxHp || 100)) c.heal(M.regen * regenT); } catch (e) { } regenT = 0; } }
    // HUD
    hudT -= dt; if (hudT <= 0) { hudT = 0.2; UI.refreshHud(); }
    // tracker + waypoint
    trackT -= dt;
    const q = Q.tracked(), tg = q ? Q.targetOf(q) : null;
    if (trackT <= 0) { trackT = 0.25; UI.setTracker(q ? { ...Q.view(q), hint: tg && tg.hint ? tg.hint : tg && tg.inside ? 'Sei nella zona: falli fuori' : '' } : null); }
    if (tg && tg.x != null && !UI.isOpen) {
      const d = Math.hypot(tg.x - p.x, tg.z - p.z);
      if (d < 2.2) UI.waypoint(null);
      else {
        _proj.set(tg.x, tg.y || 1.6, tg.z).project(camera);
        const w = innerWidth, h = innerHeight, m = 44;
        let x = (_proj.x * 0.5 + 0.5) * w, y = (-_proj.y * 0.5 + 0.5) * h;
        const behind = _proj.z > 1, off = behind || x < m || x > w - m || y < m || y > h - m;
        if (off) {
          let dx = x - w / 2, dy = y - h / 2; if (behind) { dx = -dx; dy = -dy; if (Math.abs(dy) < 1 && Math.abs(dx) < 1) dy = 1; }
          const k = Math.min((w / 2 - m) / Math.max(1e-3, Math.abs(dx)), (h / 2 - m) / Math.max(1e-3, Math.abs(dy)));
          x = w / 2 + dx * k; y = h / 2 + dy * k;
          UI.waypoint(x, y, d, true, Math.atan2(dy, dx) + Math.PI / 2);
        } else UI.waypoint(x, y, d, false);
      }
    } else UI.waypoint(null);
  }

  // ---------------------------------------------------------------- public API
  const api = {
    get state() { return st; },
    onKill, addXP, mods,
    get level() { return st.level; }, get xp() { return st.xp; }, get xpNext() { return xpNeed(st.level); }, get stats() { return { ...st.stats }; },
    get inventory() { return st.items; },
    equipped: () => ({ weapons: st.eq.w.map(byId), gadgets: st.eq.g.map(byId), active: st.eq.active }),
    current: () => byId(st.eq.w[st.eq.active]) || st.eq.w.map(byId).find(Boolean) || null,
    setActive(i) { if (i >= 0 && i < 4 && st.eq.w[i]) { st.eq.active = i; save(); syncCombat(); try { const c = C(); c && c.equip && c.equip(i); } catch (e) { } } },
    rollLoot, dropLoot: (pos, item) => loot.dropItem(posOf(pos), item || rollLoot()), pickUp, give: it => pickUp(it),
    equip, unequip: id => unequip(id), money, ammo,
    open: (tab = 'bag') => openInv(tab, tab === 'shop'), close: () => UI.close(),
    questOffer: id => Q.offer(id), quests: R.quests,
    renderHero: el => UI.renderHero(el), renderQuests: el => UI.renderQuests(el),
    perkInfo, // id -> {name, desc, legendary?} for HUDs (item.perks holds ids)
    on(n, f) { (cbs[n] = cbs[n] || []).push(f); },
    // debug / tests
    _loot: loot, _q: Q, _ui: UI, _roll: { rollWeapon, rollGadget, rollItem, RARITIES },
  };
  window.__rpg = api;
  return { plugin, update, api };
}
