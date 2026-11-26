// combat/index.js — BIGALESSO v7 combat core: first/third person, comic weapons, player health, open-world enemies.
// Installed by main.js after the world exists:  const CB = installCombat({...});  then every frame
//   CB.pre(dt)            right after input.readPads(): keys (V, H, 0-4, wheel, R, Q), mouse fire/aim, firing
//   CB.camera(pose, dt)   after world.update: first-person / over-the-shoulder pose (pose.snap = no smoothing)
//   CB.post(dt)           after man.update: weapon in hand, projectiles, enemies, fx, health, K.O.
//   CB.afterCamera(dt)    after camera.lookAt + fov: viewmodel + HUD projected elements
//
// CONTROLS (explore): V prima/terza persona · H estrai/riponi (0 riponi) · 1-4 / rotella cambia arma (con l'arma in mano)
//   clic sinistro spara (con l'arma riposta: la estrae) · clic destro mira · R ricarica · Q ombrellata
//   gamepad: RT spara · LT mira · croce ↑ ricarica · croce ←/→ arma · croce ↓ estrai/riponi · R3 vista
//   touch: SPARA / MIRA / ⟳ / 🔫 (estrai, cambia, riponi) / 👁
//
// API (window.__combat), for LOOT-RPG / SPORT / wave 2:
//   weapons: { BASES, RARITY, RARITIES, PERKS, ELEMENTS, make(base, {rarity, level, perks, stats, name}) -> item, statsOf(item) }
//     item schema: { id, base:'pistola'|'tortellini'|'nerf'|'spritz'|'ombrello', name, rarity, level, stats:{damage, fireRate,
//       magazine, reloadTime, spread, range, projectileSpeed, splashRadius, knockback, element}, perks:[] }
//   give(item, slot?) -> slot index (first empty slot, else replaces `slot` or the current one; the replaced item is in
//     the 'give' event) · equip(slot) draws it · current() -> item|null (drawn) · loadout() -> [4 items|null] · holster()
//   setLoadout([4 items|null], activeSlot) (LOOT-RPG inventory) · refreshStats() after changing mods / player.maxHp
//   reloads use window.__rpg.ammo {canReload(item), reload(item, need) -> rounds} when present (else infinite)
//   take(slot) -> removes and returns the item in a slot (inventory UI)
//   damagePlayer(n, src?) -> damage dealt · heal(n) · player: { hp, maxHp, dead } (maxHp is writable)
//   mods: { damage, fireRate, reload, armor (0..0.8), regen } multipliers RPG can change
//   spawnEnemy(type 'zombie'|'pigeon'|'boss', pos Vector3, {level}) -> enemy · enemies() -> [{id,type,level,hp,max,pos,dead}]
//   on(evt, fn) -> off(): 'hit' {enemy, amount, head, weapon} · 'kill' {type, level, pos, boss, weapon, head} ·
//     'playerDeath' {src} · 'fire' {weapon, base} · 'reload' {weapon} · 'damage' {amount, src} · 'give' {item, slot, replaced} ·
//     'equip' {slot, item} · 'spawn' {type, id, level, pos} · 'respawn' {}
//   setEnabled(bool) (wave 2: battle royale / roguelike take over) · stats() · firstPerson(bool?) · setSpawning(bool)
//   window.__rpg?.onKill({ type, pos, level, boss, weapon, head }) is called on every kill (LOOT-RPG drops loot from it).
import * as THREE from 'three';
import { BASES, RARITY, RARITIES, PERKS, ELEMENTS, makeItem, statsOf, weaponMesh, projectileGeometry, weaponMaterial } from './weapons.js';
import { createCombatFX } from './fx.js';
import { createCombatHUD } from './hud.js';
import { createEnemies, raySphere, rayCyl } from './enemies.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const wrapA = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const UP = V(0, 1, 0);

const INSULTS = {
  any: ['Oh ma sei scemo? Mi hai bagnato tutto', 'Cazzo fai, coglione?', 'Vaffanculo, la maglia nuova!', 'Socmel, smettila!', 'Stronzo, ti faccio nero', 'Ma che cazzo, sono fradicio',
    'Te la faccio pagare al Celtic', 'Bro… seriamente?', 'Ma vai a cagare', 'Ancora una e ti spacco il telefono', 'Che palle, dai!', 'Ok, guerra. Hai scelto la guerra'],
  sugo: ['Il sugo della nonna no!', 'Mi hai tirato un tortellino in faccia??', 'Almeno col brodo, barbaro'],
  schiuma: ['Un dardo in fronte, grazie eh', 'Ahia! Coglione, mi hai preso l\'occhio'],
  spritz: ['Almeno offrimelo da bere lo spritz!', 'Ma che spreco di Aperol, criminale'],
  bonk: ['AHIA! Con l\'ombrello no!', 'Mi hai ombrellato?? Sei malato', 'Ma porca troia, che botta'],
};
const KO_LINES = ['Ti hanno fatto nero', 'Svegliati, coglione: sei a casa', 'Asfaltato in mezzo alla strada', 'Rip. Il gruppo lo saprà entro 3 secondi', 'Sconfitto da degli zombi. Greve'];

export function installCombat(ctx) {
  const { scene, camera, man, dog, ui, audio, level, input, S, getWorld, getFX, npcs } = ctx;
  const Q = new URLSearchParams(location.search);
  const fx = createCombatFX({ scene, camera, audio });
  const hud = createCombatHUD({ camera });
  const listeners = {};
  const emit = (e, d) => { for (const f of listeners[e] || []) { try { f(d); } catch (x) { console.error(x); } } };
  const nightAmount = () => { const f = getFX && getFX(); return f && typeof f.nightAmount === 'number' ? f.nightAmount : 0; };
  const now = () => performance.now() / 1000;
  const save = () => window.__save;
  const unlock = (id, m) => { try { const s = save(); if (s && s.unlock) return s.unlock(id, { cat: 'Combattimento', ...m }); } catch (e) { } return false; };
  const statInc = (k, d = 1) => { try { const s = save(); if (s && s.stat) return s.stat(k, d); } catch (e) { } return 0; };
  const phoneEvent = (text, win) => { try { window.dispatchEvent(new CustomEvent('bigalesso:event', { detail: { type: 'minigame', name: 'combattimento', text, win } })); } catch (e) { } };
  try {
    const s = save(); if (s && s.define) s.define([
      { id: 'cb_first_kill', title: 'Battesimo dell\'acqua', desc: 'Primo nemico steso nel quartiere', icon: '💦', cat: 'Combattimento' },
      { id: 'cb_kills_100', title: 'Derattizzazione', desc: '100 nemici stesi', icon: '🧹', cat: 'Combattimento' },
      { id: 'cb_boss', title: 'Multa annullata', desc: 'Hai steso il Vigile Urbano Zombie in Via Petroni', icon: '👮', cat: 'Combattimento' },
      { id: 'cb_headshot', title: 'Dritto in fronte', desc: 'Un colpo in testa', icon: '🎯', cat: 'Combattimento' },
      { id: 'cb_pigeon', title: 'Piccione di sola andata', desc: 'Abbattuto un piccione mutante', icon: '🕊️', cat: 'Combattimento' },
      { id: 'cb_triple', title: 'Spritz per tre', desc: '3 nemici con un solo splash', icon: '🍹', cat: 'Combattimento' },
      { id: 'cb_melee', title: 'Ombrellata', desc: 'Steso qualcuno a ombrellate', icon: '☂️', cat: 'Combattimento' },
      { id: 'cb_ko', title: 'Fatto nero', desc: 'Andato K.O. nel quartiere', icon: '💫', cat: 'Combattimento' },
      { id: 'cb_fp', title: 'Prima persona', desc: 'Hai provato la visuale in prima persona (V)', icon: '👀', cat: 'Combattimento' },
    ]);
  } catch (e) { }

  // ---------------------------------------------------------------- state
  const ST = {
    enabled: !Q.has('nocombat'), spawning: !Q.has('nospawn'), slots: [makeItem('pistola'), null, null, null], cur: 0, want: false, drawn: false, fp: false,
    aimHeld: false, aimToggle: false, aimK: 0, aimPitch: 0.12, cool: 0, reloadT: 0, reloadDur: 1, switchT: 0, meleeT: 0, recoil: 0, kick: 0,
    lastFire: -9, wheelAcc: 0, touchFire: false, bob: 0, eyeH: 1.58, pivot: V(), pivotOk: false, face: 0, wasAllowed: false, lastNet: 0,
  };
  const ammo = new Map();
  const ammoOf = it => { if (!it) return 0; if (!ammo.has(it.id)) ammo.set(it.id, statsOf(it).magazine || 0); return ammo.get(it.id); };
  const player = { hp: 100, maxHp: 100, dead: false, invulnT: 0, lastHurt: -9, koT: 0, koShown: false };
  const mods = { damage: 1, fireRate: 1, reload: 1, armor: 0, regen: 1 };
  const stats = { shots: 0, hits: 0, kills: 0, headshots: 0, dealt: 0, taken: 0, deaths: 0, bosses: 0, byType: {} };

  // ---------------------------------------------------------------- weapon meshes (built now: the start-up warm-up compiles them)
  const vm = new THREE.Group(); vm.name = 'combat-viewmodel'; scene.add(vm);
  const wm = new THREE.Group(); wm.name = 'combat-worldmodel'; scene.add(wm);
  const VMESH = {}, WMESH = {};
  for (const b of Object.keys(BASES)) {
    const v = weaponMesh(b, true); v.visible = false; v.renderOrder = 5; vm.add(v); VMESH[b] = v;
    const w = weaponMesh(b, false); w.visible = false; w.castShadow = true; w.scale.setScalar(b === 'spritz' || b === 'ombrello' ? 1.15 : 1.4); wm.add(w); WMESH[b] = w; // comic: a bit bigger in third person
  }
  // camera space (x right, y up, -z forward): hip = bottom-right, aim = closer to the centre but below the line of sight
  const VM_OFF = { pistola: [0.19, -0.225, -0.38], tortellini: [0.18, -0.24, -0.38], nerf: [0.17, -0.21, -0.38], spritz: [0.21, -0.28, -0.17], ombrello: [0.22, -0.25, -0.34] };
  const VM_AIM = { pistola: [0.1, -0.225, -0.37], tortellini: [0.08, -0.255, -0.36], nerf: [0.06, -0.185, -0.34], spritz: [0.15, -0.27, -0.15], ombrello: [0.22, -0.25, -0.34] };
  // projectiles: instanced pools
  const PKINDS = { tortellini: 28, nerf: 40, spritz: 6, multa: 12 };
  const PIM = {};
  for (const k in PKINDS) { const im = new THREE.InstancedMesh(projectileGeometry(k), weaponMaterial(), PKINDS[k]); im.count = 0; im.frustumCulled = false; im.castShadow = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.name = 'combat-proj-' + k; scene.add(im); PIM[k] = im; }
  const projs = Array.from({ length: 90 }, () => ({ alive: false, kind: '', pos: V(), prev: V(), vel: V(), g: 0, life: 0, max: 3, item: null, st: null, hostile: false, cosmetic: false, stuck: false, bounced: false, q: new THREE.Quaternion(), spin: 0, trailT: 0, dmg: 0 }));

  // ---------------------------------------------------------------- enemies
  const E = createEnemies({
    scene, level, man, fx, hud, camera, emit, night: nightAmount, personal: () => (ST.fp ? 0.95 : 0.55),
    fxSfx: (n, p, v) => fx.sfx(n, p, v),
    onKill: (e, o) => onKill(e, o),
    onBoss: b => { fx.sfx('whistle', null, 1); fx.sfx('boss', null, 0.8); ui.toast('🚨 Il Vigile Urbano Zombie ti ha beccato senza biglietto in Via Petroni!', 'gold'); phoneEvent('ha incontrato il Vigile Urbano Zombie in Via Petroni', undefined); },
    hitPlayer: (n, src, knock) => damagePlayer(n, src, knock),
    bossThrow: e => bossThrow(e),
  });
  // preload hook: the pools join the start-up preload (gfx.js warms everything once they exist)
  try { window.__preloadP = Promise.all([window.__preloadP, E.preload().catch(e => console.warn('combat preload', e))]); } catch (e) { }

  // ---------------------------------------------------------------- helpers
  const W = () => getWorld && getWorld();
  const item = () => ST.slots[ST.cur] || null;
  const baseOf = it => BASES[it && it.base] || BASES.pistola;
  const inPlay = () => { const w = W(); return S.phase === 'world' && w && (w.mode === 'explore' || w.mode === 'goto'); };
  const typing = () => { const w = W(); return (w && w.mode === 'type') || (ui.chat && ui.chat.focused) || (document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)); };
  function allowed() {
    const w = W();
    return ST.enabled && inPlay() && !w.carry && !(w.DP && w.DP.P && w.DP.P.ballHeld) && !ui.menuOpen && !document.body.dataset.overlay && !player.dead;
  }
  const toast = (m, c) => { try { ui.toast(m, c); } catch (e) { } };

  // ---------------------------------------------------------------- world ray casts (3D camera blockers grid + ground + actors)
  let bgrid = null, bgN = -1; const BC = 8, bkey = (ix, iz) => ix * 100003 + iz;
  function buildBGrid() {
    const bl = (level && level.cameraBlockers) || []; bgrid = new Map(); bgN = bl.length;
    for (const b of bl) for (let ix = Math.floor(b.min[0] / BC); ix <= Math.floor(b.max[0] / BC); ix++) for (let iz = Math.floor(b.min[2] / BC); iz <= Math.floor(b.max[2] / BC); iz++) { const k = bkey(ix, iz); let a = bgrid.get(k); if (!a) bgrid.set(k, a = []); a.push(b); }
  }
  let stamp = 1; const seen = new WeakMap(); const _n = V();
  function rayBoxN(o, d, b, maxT, n) {
    let t0 = 0, t1 = maxT, ax = -1, sg = 0;
    for (let i = 0; i < 3; i++) {
      const O = i === 0 ? o.x : i === 1 ? o.y : o.z, D = i === 0 ? d.x : i === 1 ? d.y : d.z;
      if (Math.abs(D) < 1e-8) { if (O < b.min[i] || O > b.max[i]) return -1; continue; }
      let a = (b.min[i] - O) / D, c = (b.max[i] - O) / D, s = -1; if (a > c) { const x = a; a = c; c = x; s = 1; }
      if (a > t0) { t0 = a; ax = i; sg = s; } if (c < t1) t1 = c; if (t0 > t1) return -1;
    }
    if (ax < 0) return -1; n.set(0, 0, 0); if (ax === 0) n.x = sg; else if (ax === 1) n.y = sg; else n.z = sg; return t0;
  }
  function rayBlockers(o, d, maxT, out) { // nearest blocker hit: returns t (or -1), normal into out
    if (!bgrid || bgN !== ((level && level.cameraBlockers) || []).length) buildBGrid();
    stamp++; let best = -1;
    const step = 2.5, n = Math.ceil(maxT / step);
    for (let i = 0; i <= n; i++) {
      const s = Math.min(maxT, i * step), x = o.x + d.x * s, z = o.z + d.z * s;
      const a = bgrid.get(bkey(Math.floor(x / BC), Math.floor(z / BC))); if (!a) continue;
      for (const b of a) {
        if (seen.get(b) === stamp) continue; seen.set(b, stamp);
        const t = rayBoxN(o, d, b, best >= 0 ? best : maxT, _n); if (t >= 0 && (best < 0 || t < best)) { best = t; out.copy(_n); }
      }
      if (best >= 0 && best < s - 6) break;
    }
    return best;
  }
  const HIT = { t: 0, point: V(), normal: V(), kind: 'none', e: null, head: false, npc: null, pid: null, tid: null };
  // remote targets (wave 2: battle royale players/bots refereed by the server): api.setTargets(list, onHit)
  //   list() -> [{ id, x, y, z }] (reused array, no allocations) · onHit({ id, amount, head, base, item, splash, k, melee })
  //   damage is NOT applied here: the mode sends the hit to its referee (shared/br.mjs) and shows the result
  const TG = { list: null, hit: null };
  const _bn = V();
  function raycast(o, d, maxT, opt = {}) {
    HIT.t = maxT; HIT.kind = 'none'; HIT.e = null; HIT.head = false; HIT.npc = null; HIT.pid = null; HIT.tid = null; HIT.normal.set(0, 1, 0);
    const t0 = opt.skip || 0;
    if (!opt.hostile) {
      const r = E.ray(o, d, HIT.t); if (r && r.t >= t0) { HIT.t = r.t; HIT.kind = 'enemy'; HIT.e = r.e; HIT.head = r.head; }
      // friends (no damage, they react), the dog, other players
      if (npcs && npcs.active) for (const id of npcs.active()) { const nn = npcs.get(id); if (!nn || !nn.root) continue; const p = nn.root.position; const t = rayCyl(o, d, p.x, p.z, 0.3, p.y, p.y + 1.8, HIT.t); if (t >= t0 && t >= 0 && t < HIT.t) { HIT.t = t; HIT.kind = 'npc'; HIT.npc = nn; } }
      if (dog && dog.root) { const p = dog.root.position; const t = raySphere(o, d, p.x, p.y + 0.3, p.z, 0.32, HIT.t); if (t >= t0 && t >= 0 && t < HIT.t) { HIT.t = t; HIT.kind = 'dog'; } }
      const net = window.__net; if (net && net.online && net.players && !TG.list) for (const P of net.players.values()) { if (!P.avatar || !P.avatar.root) continue; const p = P.avatar.root.position; const t = rayCyl(o, d, p.x, p.z, 0.3, p.y, p.y + 1.8, HIT.t); if (t >= t0 && t >= 0 && t < HIT.t) { HIT.t = t; HIT.kind = 'player'; HIT.pid = P.id; } }
      if (TG.list) for (const T of TG.list()) { const y = T.y || 0; const t = rayCyl(o, d, T.x, T.z, 0.32, y, y + 1.8, HIT.t); if (t >= t0 && t >= 0 && t < HIT.t) { HIT.t = t; HIT.kind = 'target'; HIT.tid = T.id; HIT.head = raySphere(o, d, T.x, y + 1.62, T.z, 0.18, t + 0.6) >= 0; } }
    } else {
      const p = man.root.position; const t = rayCyl(o, d, p.x, p.z, 0.36, p.y, p.y + 1.8, HIT.t); if (t >= 0 && t < HIT.t) { HIT.t = t; HIT.kind = 'me'; }
    }
    const tb = rayBlockers(o, d, HIT.t, _bn); if (tb >= 0 && tb >= t0 && tb < HIT.t) { HIT.t = tb; HIT.kind = 'wall'; HIT.normal.copy(_bn); }
    if (d.y < -1e-4) { const tg = -o.y / d.y; if (tg >= 0 && tg < HIT.t) { HIT.t = tg; HIT.kind = 'ground'; HIT.normal.set(0, 1, 0); } }
    HIT.point.copy(o).addScaledVector(d, HIT.t);
    return HIT;
  }

  // ---------------------------------------------------------------- loadout API
  function give(it, slot) {
    if (!it || !it.base) return -1;
    if (!it.id) it = makeItem(it.base, it);
    let s = Number.isInteger(slot) && slot >= 0 && slot < 4 ? slot : ST.slots.findIndex(x => !x);
    if (s < 0) s = ST.cur;
    const replaced = ST.slots[s]; ST.slots[s] = it; ammo.delete(it.id);
    emit('give', { item: it, slot: s, replaced });
    if (s === ST.cur) { ST.reloadT = 0; ST.switchT = 0.35; }
    return s;
  }
  function equip(s) {
    if (!(s >= 0 && s < 4) || !ST.slots[s]) return false;
    if (s !== ST.cur) { ST.cur = s; ST.reloadT = 0; ST.switchT = 0.35; fx.sfx('switch'); }
    ST.want = true; emit('equip', { slot: s, item: ST.slots[s] }); return true;
  }
  function holster() { ST.want = false; ST.aimToggle = false; }
  function cycle(dir) {
    for (let k = 1; k <= 4; k++) { const s = (ST.cur + dir * k + 8) % 4; if (ST.slots[s]) { if (s !== ST.cur) equip(s); return; } }
  }

  // ---------------------------------------------------------------- input (before world.update)
  addEventListener('mousedown', e => { if (e.button === 2) ST.aimHeld = true; }, true);
  addEventListener('mouseup', e => { if (e.button === 2) ST.aimHeld = false; }, true);
  addEventListener('blur', () => { ST.aimHeld = false; ST.touchFire = false; });
  if (ui.coarse || matchMedia('(pointer: coarse)').matches) hud.touch({
    fireDown: () => { if (!ST.drawn) { ST.want = true; return; } ST.touchFire = true; }, fireUp: () => { ST.touchFire = false; },
    aim: () => { ST.aimToggle = !ST.aimToggle; },
    reload: () => startReload(),
    sw: () => { if (!ST.want) { ST.want = true; fx.sfx('switch'); return; } const n = ST.slots.filter(Boolean).length; let nx = -1; for (let k = ST.cur + 1; k < 4; k++) if (ST.slots[k]) { nx = k; break; } if (nx < 0 || n < 2) { holster(); fx.sfx('switch'); } else equip(nx); },
    view: () => setFP(!ST.fp),
  });
  function setFP(v) { ST.fp = !!v; toast(ST.fp ? 'Prima persona (V per tornare in terza)' : 'Terza persona'); if (ST.fp) unlock('cb_fp'); }

  function pre(dt) {
    const w = W(); if (!w || S.phase !== 'world') return;
    const I = input, P0 = I.pads[0] || { axes: [0, 0, 0, 0], cur: [] };
    const ok = allowed();
    ST.drawn = ok && ST.want;
    if (!ok && ST.wasAllowed) { ST.touchFire = false; }
    ST.wasAllowed = ok;
    const keysOk = inPlay() && !ui.menuOpen && !document.body.dataset.overlay && !(I.owned && I.owned()) && !typing() && !player.dead && ST.enabled; // I.owned: FIX-2 central keyboard-owner check (explore.js)
    // aim + mouse sensitivity (before explore consumes the drag)
    ST.aiming = ST.drawn && (ST.aimHeld || ST.aimToggle || I.padHeld(0, 6)) && ST.meleeT <= 0;
    ST.aimK += ((ST.aiming ? 1 : 0) - ST.aimK) * (1 - Math.exp(-dt * 14));
    if (ST.aimK > 0.05) { const k = 1 - 0.45 * ST.aimK; I.drag.dx *= k; I.drag.dy *= k; }
    if (ST.fp || ST.drawn) {
      const sens = I.sens || 1, inv = I.invertY ? -1 : 1;
      ST.aimPitch = clamp(ST.aimPitch + (I.drag.dy * 0.004 + (P0.axes[3] || 0) * dt * 1.6) * sens * inv, -1.3, 1.25);
    } else ST.aimPitch += ((w.camPitch - 0.18) - ST.aimPitch) * (1 - Math.exp(-dt * 4)); // follows the orbit when nothing overrides
    if (keysOk) {
      if (I.pressed('KeyV') || I.padPressed(0, 11)) { setFP(!ST.fp); I.edges.delete('KeyV'); }
      if (I.pressed('KeyH') || I.padPressed(0, 13)) { if (ST.want) holster(); else { ST.want = true; fx.sfx('switch'); } I.edges.delete('KeyH'); }
      if (I.pressed('Digit0')) { holster(); I.edges.delete('Digit0'); }
      if (ST.drawn) {
        // the dog's trick menu (G) also uses the digits: leave them to it while it's open
        if (!(w.DP && w.DP.menuOpen && w.DP.menuOpen())) for (let i = 0; i < 4; i++) if (I.pressed('Digit' + (i + 1))) { I.edges.delete('Digit' + (i + 1)); if (ST.slots[i]) equip(i); else toast('Slot ' + (i + 1) + ' vuoto'); }
        if (I.padPressed(0, 15)) cycle(1); if (I.padPressed(0, 14)) cycle(-1);
        if (I.drag.wheel) { ST.wheelAcc += I.drag.wheel; I.drag.wheel = 0; if (Math.abs(ST.wheelAcc) > 60) { cycle(Math.sign(ST.wheelAcc)); ST.wheelAcc = 0; } }
        const f = w.focus, alt = f && f.alt && f.alt() && f.altAct;
        if ((I.pressed('KeyR') && !alt) || I.padPressed(0, 12)) { I.edges.delete('KeyR'); startReload(); }
      }
      // Q = umbrella hit; during a calcetto match (unarmed) Q is the pass (sport/), so leave it to the sport
      if (I.pressed('KeyQ') && w.mode === 'explore' && (ST.drawn || !(window.__sport && window.__sport.match))) { I.edges.delete('KeyQ'); melee(); }
    }
    // fire / draw on click
    const locked = I.look && (I.look.locked || I.look.failed);
    const mouseFire = locked && I.mouseHeld;
    if (ok && !ST.drawn && I.drag.click && locked && w.mode === 'explore' && !w.focus) { ST.want = true; I.drag.click = false; fx.sfx('switch'); ST.switchT = 0.3; }
    ST.cool = Math.max(0, ST.cool - dt); ST.switchT = Math.max(0, ST.switchT - dt);
    if (ST.reloadT > 0) { ST.reloadT -= dt; if (ST.reloadT <= 0) finishReload(); }
    if (!ST.drawn) { ST.reloadT = 0; return; }
    const it = item(); if (!it) return;
    const held = mouseFire || ST.touchFire || I.padHeld(0, 7);
    if (held) { I.drag.click = false; }
    const B = baseOf(it), stt = statsOf(it);
    if (held && ST.cool <= 0 && ST.switchT <= 0 && ST.meleeT <= 0) {
      if (B.kind === 'melee') { melee(it); }
      else if (ST.reloadT > 0) { /* reloading */ }
      else if (ammoOf(it) <= 0) { fx.sfx('empty'); ST.cool = 0.25; startReload(); }
      else { fire(it, B, stt); }
    }
    if (B.kind !== 'melee' && ammoOf(it) <= 0 && ST.reloadT <= 0 && ST.cool <= 0 && !held) startReload();
  }

  // ---------------------------------------------------------------- firing
  const _o = V(), _d = V(), _a = V(), _b = V(), _t = V(), _m = V(), _p = V(), _r1 = V(), _r2 = V();
  function aimRay(spread) {
    camera.getWorldPosition(_o); camera.getWorldDirection(_d);
    if (spread > 0) {
      _r1.crossVectors(_d, Math.abs(_d.y) > 0.95 ? V(1, 0, 0) : UP).normalize(); _r2.crossVectors(_d, _r1).normalize();
      const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * spread;
      _d.addScaledVector(_r1, Math.cos(a) * r).addScaledVector(_r2, Math.sin(a) * r).normalize();
    }
    // third person: skip what lies between the camera and the player
    const hp = _t.copy(man.root.position); hp.y += 1.4;
    const skip = ST.fp ? 0 : Math.max(0, _a.copy(hp).sub(_o).dot(_d) - 0.25);
    return skip;
  }
  function muzzleWorld(out) {
    const it = item(), b = it ? it.base : 'pistola';
    const mesh = ST.fp ? VMESH[b] : WMESH[b];
    if (mesh && mesh.visible) { mesh.updateWorldMatrix(true, false); return out.copy(mesh.userData.muzzle).applyMatrix4(mesh.matrixWorld); }
    out.copy(man.root.position); out.y += 1.35; out.addScaledVector(_d, 0.5); return out;
  }
  function spreadOf(stt) {
    const w = W(), mv = w ? Math.min(1, w.vel.length() / 2.7) : 0;
    return stt.spread * (1 - 0.55 * ST.aimK) * (1 + mv * 0.8) * (ST.fp ? 0.85 : 1) + ST.recoil * 0.02;
  }
  function fire(it, B, stt) {
    const w = W();
    const rate = Math.max(0.2, stt.fireRate * mods.fireRate);
    ST.cool = 1 / rate; ST.lastFire = now(); ST.face = 1;
    ammo.set(it.id, ammoOf(it) - 1); stats.shots++;
    const n = it.perks && it.perks.includes('doppio') ? 2 : 1;
    const color = ELEMENTS[stt.element] || ELEMENTS[B.element];
    let mz = null;
    for (let k = 0; k < n; k++) {
      const skip = aimRay(spreadOf(stt) + (k ? 0.03 : 0));
      const range = stt.range || 30;
      const hit = raycast(_o, _d, range, { skip });
      mz = muzzleWorld(_m);
      if (B.kind === 'hitscan') {
        fx.beam(mz, hit.point, color, 0.018 + Math.random() * 0.008, 0.08); fx.tracer(mz, hit.point, color);
        if (hit.kind !== 'none') impact(hit, it, B, stt, _d, false, null);
        else fx.burst(hit.point, color, 1, { size: 0.12, speed: 0.6, life: 0.4, grav: 3 });
      } else {
        // projectile toward the aim point, with ballistic lift so arcs land near the crosshair
        _t.copy(hit.point).sub(mz); const dist = _t.length(); _t.normalize();
        const sp = stt.projectileSpeed || 20, g = B.gravity || 0;
        const vel = _p.copy(_t).multiplyScalar(sp); vel.y += 0.5 * g * (dist / sp);
        spawnProj(it.base, mz, vel, { item: it, st: stt, g, B });
      }
    }
    // feedback
    fx.muzzle(mz, _d, it.base); fx.casing(mz, _d, it.base, man.root.position.y); // particles.js: flash, flame/spray, smoke, casing / bottle cap
    fx.sfx(B.element, null, 1);
    ST.kick = Math.min(1, ST.kick + (B.rocket ? 1 : B.kind === 'hitscan' ? 0.18 : 0.45));
    ST.recoil = Math.min(1, ST.recoil + (B.rocket ? 1 : B.kind === 'hitscan' ? 0.12 : 0.35));
    ST.aimPitch -= (B.rocket ? 0.05 : B.kind === 'hitscan' ? 0.004 : 0.012) * (1 - 0.5 * ST.aimK);
    if (B.rocket && ui.settings && ui.settings.cameraShake) S.shake = Math.max(S.shake || 0, 0.035);
    emit('fire', { weapon: it, base: it.base });
    // network: cosmetic
    const net = window.__net;
    if (net && net.online && net.emit && now() - ST.lastNet > 0.12) { ST.lastNet = now(); try { net.emit({ k: 'cb', a: 'f', w: it.base, o: [+mz.x.toFixed(2), +mz.y.toFixed(2), +mz.z.toFixed(2)], t: [+HIT.point.x.toFixed(2), +HIT.point.y.toFixed(2), +HIT.point.z.toFixed(2)] }); } catch (e) { } }
    void w;
  }
  function startReload() {
    const it = item(); if (!it || !ST.drawn) return;
    const stt = statsOf(it), B = baseOf(it);
    if (B.kind === 'melee' || ST.reloadT > 0 || ammoOf(it) >= (stt.magazine || 0)) return;
    const A = window.__rpg && window.__rpg.ammo;
    if (A && typeof A.canReload === 'function' && !A.canReload(it)) { if (now() - (startReload.warnT || 0) > 2.5) { startReload.warnT = now(); toast('Niente munizioni per ' + it.name + ': cercale nelle casse o al Banco dei pegni'); } fx.sfx('empty'); return; }
    const turbo = it.perks && it.perks.includes('turbo') ? 0.65 : 1;
    ST.reloadDur = ST.reloadT = Math.max(0.3, stt.reloadTime * turbo / Math.max(0.2, mods.reload));
    fx.sfx('reload'); emit('reload', { weapon: it });
  }
  // reserve ammo: window.__rpg.ammo {canReload(item), reload(item, need) -> rounds granted} when LOOT-RPG is there, else infinite
  // (rpg keeps the starter gun and the umbrella infinite)
  function finishReload() {
    const it = item(); ST.reloadT = 0; if (!it) return;
    const mag = statsOf(it).magazine || 0, have = ammoOf(it), need = Math.max(0, mag - have), A = window.__rpg && window.__rpg.ammo;
    let got = need; if (A && typeof A.reload === 'function') { try { got = clamp(+A.reload(it, need) || 0, 0, need); } catch (e) { got = need; } }
    ammo.set(it.id, have + got); fx.sfx('reloaded');
  }

  // ---------------------------------------------------------------- impacts
  function npcReact(nn, element) {
    if (!nn) return; const t = now(); if ((nn._cbT || 0) > t) return; nn._cbT = t + 3.5;
    const pool = INSULTS[element] && Math.random() < 0.5 ? INSULTS[element] : INSULTS.any;
    try { nn.say(pick(pool), 3.2); } catch (e) { }
    try { if (nn.man && nn.man.playGesture) nn.man.playGesture(Math.random() < 0.5 ? 'headShake' : 'facepalm'); } catch (e) { }
  }
  function dogReact() { const t = now(); if ((dogReact.t || 0) > t) return; dogReact.t = t + 1.5; try { dog.react && dog.react('jump'); audio.sfx('woof'); } catch (e) { } }
  function impact(hit, it, B, stt, dir, isProj, pr) {
    const color = ELEMENTS[stt.element] || '#5cc8ff';
    let dmg = stt.damage * mods.damage * (pr && pr.cosmetic ? 0 : 1);
    const perks = (it && it.perks) || [];
    const crit = perks.includes('critico') && Math.random() < 0.15;
    if (crit) dmg *= 2;
    const knockDir = _a.copy(dir); knockDir.y = 0.25; knockDir.normalize();
    if (hit.kind === 'enemy' && dmg > 0) {
      const head = hit.head; const d = dmg * (head ? (B.headMult || 1.6) : 1);
      const dealt = E.damage(hit.e, d, { dir: knockDir, knock: stt.knockback, head, crit, point: hit.point.clone(), slow: perks.includes('gelo') ? 2 : 0, color: head ? null : undefined });
      stats.hits++; stats.dealt += dealt; if (head) { stats.headshots++; unlock('cb_headshot'); }
      hud.hitMarker(hit.e.dead); fx.sfx(hit.e.dead ? 'kill' : head ? 'head' : 'hit', null, 1);
      if (perks.includes('vampiro')) heal(dealt * 0.08);
      emit('hit', { enemy: hit.e, amount: dealt, head, weapon: it });
      fx.hit(hit.point, dir, { element: stt.element, head, crit, kill: hit.e.dead, color }); // comic, blood-less: POW + confetti (+ tortellino / drops)
    } else if (hit.kind === 'npc') { npcReact(hit.npc, stt.element); fx.burst(hit.point, color, 4, { size: 0.2, speed: 1.2, life: 0.5, grav: 3 }); }
    else if (hit.kind === 'dog') { dogReact(); fx.burst(hit.point, color, 4, { size: 0.18, speed: 1.2, life: 0.5, grav: 3 }); }
    else if (hit.kind === 'player') { fx.burst(hit.point, color, 5, { size: 0.22, speed: 1.2, life: 0.5, grav: 3 }); }
    else if (hit.kind === 'target') {
      if (dmg > 0 && TG.hit) { try { TG.hit({ id: hit.tid, amount: dmg * (hit.head ? (B.headMult || 1.6) : 1), head: hit.head, base: it ? it.base : 'pistola', item: it, splash: false, k: 1 }); } catch (e) { console.warn(e); } hud.hitMarker(false); fx.sfx(hit.head ? 'head' : 'hit', null, 1); }
      fx.hit(hit.point, dir, { element: stt.element, head: hit.head, color });
    }
    else if (hit.kind === 'wall' || hit.kind === 'ground') {
      if (!B.rocket) fx.splat(hit.point, hit.normal, color, stt.splashRadius ? 0.75 : B.kind === 'hitscan' ? 0.32 : 0.28, 10); // the bazooka leaves its own scorch + stain (explode)
      fx.impact(hit.point, hit.normal, stt.element || B.element); // droplets / sauce / foam / sparks + dust
      if (B.kind === 'hitscan' && Math.random() < 0.3) fx.sfx('drip', hit.point, 0.5);
    }
    const R = (stt.splashRadius || 0) + (perks.includes('esplosivo') ? 1.2 : 0);
    if (isProj && R > 0) explode(hit.point, R, (stt.splashRadius ? dmg * 0.75 : dmg * 0.4), stt.knockback, color, B, it, hit.kind === 'enemy' ? hit.e : null, hit.kind === 'target' ? hit.tid : null);
    else if (isProj && hit.kind !== 'none') fx.sfx(B.stick ? 'dart' : 'splat', hit.point, 0.9);
  }
  function explode(p, R, dmg, knock, color, B, it, skipE, skipT = null) {
    const big = B.rocket;
    // particles.js: flash, fireball, smoke, sparks, debris, shockwave, scorch, shake (spritz: Aperol, orange slices, ice)
    fx.explode(p, { radius: R, kind: big ? 'spritz' : (B.element || 'sugo'), ground: 0 });
    if (!big) fx.splat(_b.set(p.x, 0, p.z), UP, color, R * 0.9, 14);
    fx.sfx(big ? 'boom' : 'splat', p, big ? 1.2 : 1);
    if (big && ui.settings && ui.settings.cameraShake) { const d = man.root.position.distanceTo(p); S.shake = Math.max(S.shake || 0, 0.06 * Math.max(0, 1 - d / 18)); }
    let kills = 0;
    if (dmg > 0) for (const { e, d } of E.near(p, R)) {
      if (e === skipE) continue;
      const k = 1 - clamp(d / R, 0, 1) * 0.55; const dir = _b.set(e.pos.x - p.x, 0.4, e.pos.z - p.z).normalize();
      const dealt = E.damage(e, dmg * k, { dir: dir.clone(), knock: knock * k, color: '#ffd21f' }); stats.dealt += dealt; stats.hits++;
      if (e.dead) kills++;
      emit('hit', { enemy: e, amount: dealt, head: false, weapon: it });
    }
    if (skipE && skipE.dead) kills++;
    if (dmg > 0 && TG.list && TG.hit) for (const T of TG.list()) { // remote targets in the splash (the referee re-checks)
      if (T.id === skipT) continue; const dd = Math.hypot(T.x - p.x, (T.y || 0) + 0.9 - p.y, T.z - p.z);
      if (dd < R + 0.3) { const k = 1 - clamp(dd / R, 0, 1) * 0.55; try { TG.hit({ id: T.id, amount: dmg * k, head: false, base: it ? it.base : B === BASES.spritz ? 'spritz' : 'tortellini', item: it, splash: true, k }); } catch (e) { console.warn(e); } hud.hitMarker(false); }
    }
    if (kills > 0) hud.hitMarker(true);
    if (kills >= 3) unlock('cb_triple');
    if (npcs && npcs.active) for (const id of npcs.active()) { const nn = npcs.get(id); if (nn && nn.root && nn.root.position.distanceTo(p) < R + 0.5) npcReact(nn, B.element); }
    if (dog && dog.root && dog.root.position.distanceTo(p) < R + 0.5) dogReact();
    // the player is never hurt by his own splash: just a comic push
    const mp = man.root.position, w = W(); const dd = Math.hypot(mp.x - p.x, mp.z - p.z);
    if (big && w && dd < R && w.mode === 'explore') { const k = (1 - dd / R) * 3.5; w.vel.x += (mp.x - p.x) / (dd || 1) * k; w.vel.z += (mp.z - p.z) / (dd || 1) * k; }
  }

  // ---------------------------------------------------------------- melee (ombrello)
  const MELEE_DUR = 0.45;
  function melee(it) {
    if (ST.meleeT > 0 || !allowed()) return;
    const um = it && it.base === 'ombrello' ? it : null;
    ST.meleeT = MELEE_DUR; ST.meleeItem = um; ST.meleeHit = false; ST.face = 1; ST.lastFire = now();
    const stt = statsOf(um || { base: 'ombrello' });
    ST.cool = 1 / Math.max(0.3, stt.fireRate * mods.fireRate);
    fx.sfx('swing'); fx.sfx('melee');
  }
  function meleeHit() {
    const it = ST.meleeItem, stt = statsOf(it || { base: 'ombrello' }), B = BASES.ombrello;
    const p = man.root.position, w = W(); camera.getWorldDirection(_d); _d.y = 0; _d.normalize();
    let any = false;
    for (const e of E.list) {
      if (e.dead || !e.alive) continue;
      const ex = e.pos.x - p.x, ez = e.pos.z - p.z, ey = (e.type === 'pigeon' ? e.pos.y : 1) - 1.2, d = Math.hypot(ex, ez);
      if (d > stt.range + 0.35 * e.sc || Math.abs(ey) > 1.6) continue;
      if (d > 0.4 && (ex * _d.x + ez * _d.z) / d < 0.35) continue;
      const dir = V(ex / (d || 1), 0.3, ez / (d || 1));
      const dealt = E.damage(e, stt.damage * mods.damage, { dir, knock: stt.knockback, color: '#ffffff' }); stats.dealt += dealt; stats.hits++; any = true;
      fx.stars(V(e.pos.x, e.type === 'pigeon' ? e.pos.y + 0.3 : 1.9 * e.sc, e.pos.z), 4, { size: 0.18 });
      if (e.dead) unlock('cb_melee');
      emit('hit', { enemy: e, amount: dealt, head: false, weapon: it || { base: 'ombrello' } });
    }
    if (npcs && npcs.active) for (const id of npcs.active()) { const nn = npcs.get(id); if (!nn || !nn.root) continue; const q = nn.root.position, ex = q.x - p.x, ez = q.z - p.z, d = Math.hypot(ex, ez); if (d < stt.range && (ex * _d.x + ez * _d.z) / (d || 1) > 0.3) { nn._cbT = 0; npcReact(nn, 'bonk'); fx.stars(V(q.x, 1.95, q.z), 3, { size: 0.15 }); any = true; } }
    if (dog && dog.root && dog.root.position.distanceTo(p) < stt.range) dogReact();
    if (TG.list && TG.hit) for (const T of TG.list()) { const ex = T.x - p.x, ez = T.z - p.z, d = Math.hypot(ex, ez); if (d < stt.range + 0.3 && (d < 0.4 || (ex * _d.x + ez * _d.z) / d > 0.35)) { try { TG.hit({ id: T.id, amount: stt.damage * mods.damage, head: false, base: 'ombrello', item: it, splash: false, k: 1, melee: true }); } catch (e) { console.warn(e); } fx.stars(V(T.x, (T.y || 0) + 1.9, T.z), 3, { size: 0.15 }); any = true; } }
    if (any) { fx.sfx('bonk'); hud.hitMarker(false); }
    void B; void w;
  }

  // ---------------------------------------------------------------- projectiles
  function spawnProj(kind, pos, vel, o = {}) {
    const pr = projs.find(x => !x.alive) || projs.reduce((a, b) => (a.life > b.life ? a : b));
    pr.alive = true; pr.kind = kind; pr.pos.copy(pos); pr.prev.copy(pos); pr.vel.copy(vel); pr.g = o.g || 0; pr.life = 0;
    pr.max = o.max || Math.min(5, ((o.st && o.st.range) || 40) / Math.max(1, vel.length()) * 1.6 + 0.6);
    pr.item = o.item || null; pr.st = o.st || null; pr.B = o.B || BASES[kind] || null; pr.hostile = !!o.hostile; pr.cosmetic = !!o.cosmetic; pr.dmg = o.dmg || 0;
    pr.stuck = false; pr.bounced = false; pr.spin = kind === 'tortellini' || kind === 'multa' ? rnd(8, 14) : 0; pr.trailT = 0; pr.rot = Math.random() * 6;
    return pr;
  }
  const _seg = V(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _mm = new THREE.Matrix4(), _one = V(1, 1, 1), Zf = V(0, 0, 1);
  function updProjs(dt) {
    for (const pr of projs) {
      if (!pr.alive) continue;
      pr.life += dt; if (pr.life > (pr.stuck ? 6 : pr.max)) { pr.alive = false; continue; }
      if (pr.stuck) continue;
      pr.prev.copy(pr.pos); pr.vel.y -= pr.g * dt; pr.pos.addScaledVector(pr.vel, dt); pr.rot += pr.spin * dt;
      if (pr.kind === 'spritz') { pr.trailT -= dt; if (pr.trailT <= 0) { pr.trailT = 0.025; fx.puff(pr.prev, Math.random() < 0.5 ? '#ffffff' : '#ffb070', { size: 0.22, speed: 0.3, life: 0.6, up: 0.2 }); } }
      _seg.copy(pr.pos).sub(pr.prev); const L = _seg.length(); if (L < 1e-5) continue; _seg.multiplyScalar(1 / L);
      const hit = raycast(pr.prev, _seg, L, { hostile: pr.hostile });
      if (pr.cosmetic && (hit.kind === 'enemy' || hit.kind === 'npc' || hit.kind === 'dog')) hit.kind = 'none';
      if (hit.kind === 'none') continue;
      if (pr.hostile) {
        if (hit.kind === 'me') damagePlayer(pr.dmg, { type: 'multa' }, 1.5);
        fx.burst(hit.point, '#fbfbf2', 5, { size: 0.16, speed: 1.2, life: 0.6 }); fx.sfx('splat', hit.point, 0.5);
        pr.alive = false; continue;
      }
      const it = pr.item, B = pr.B || BASES.pistola, stt = pr.st || B.stats;
      const surf = hit.kind === 'wall' || hit.kind === 'ground';
      if (surf && it && it.perks && it.perks.includes('rimbalzo') && !pr.bounced) {
        pr.bounced = true; const vn = pr.vel.dot(hit.normal); pr.vel.addScaledVector(hit.normal, -2 * vn).multiplyScalar(0.6); pr.pos.copy(hit.point).addScaledVector(hit.normal, 0.03); continue;
      }
      impact(hit, it, B, stt, _seg, true, pr);
      if (surf && B.stick) { pr.stuck = true; pr.life = 0; pr.pos.copy(hit.point).addScaledVector(_seg, 0.02); continue; }
      pr.alive = false;
    }
    // draw
    const cnt = {}; for (const k in PIM) cnt[k] = 0;
    for (const pr of projs) {
      if (!pr.alive) continue; const im = PIM[pr.kind]; if (!im) continue; const i = cnt[pr.kind]; if (i >= PKINDS[pr.kind]) continue;
      if (!pr.stuck) { const vl = pr.vel.length(); if (vl > 1e-3) pr.q.setFromUnitVectors(Zf, _p.copy(pr.vel).multiplyScalar(1 / vl)); }
      _q2.setFromAxisAngle(Zf, pr.rot); _q.copy(pr.q).multiply(_q2);
      if (pr.kind === 'tortellini' || pr.kind === 'multa') { _q2.setFromAxisAngle(V(1, 0, 0), pr.rot * 0.7); _q.multiply(_q2); }
      _mm.compose(pr.pos, _q, _one); im.setMatrixAt(i, _mm); cnt[pr.kind] = i + 1;
    }
    for (const k in PIM) { const im = PIM[k]; if (cnt[k] || im.count) { im.count = cnt[k]; im.instanceMatrix.needsUpdate = true; } }
  }
  function bossThrow(e, tgt) { // tgt: the remote player it aims at (online, src/worldsync.js), else me
    const p = tgt || man.root.position, from = V(e.pos.x, 2.1, e.pos.z);
    const to = V(p.x, 1.2, p.z); const d = to.clone().sub(from); const dist = d.length(); d.normalize();
    const sp = 11, g = 4; const vel = d.multiplyScalar(sp); vel.y += 0.5 * g * dist / sp;
    spawnProj('multa', from, vel, { hostile: true, g, dmg: 8 + e.level, max: 4 });
    fx.sfx('whistle', e.pos, 0.8);
    if (E.ctx.sync) E.ctx.sync.multa(from, vel, g, 8 + e.level); // the others fly the same multa: it hurts whoever it hits
  }

  // ---------------------------------------------------------------- player health
  function damagePlayer(n, src, knock = 0) {
    const w = W();
    if (!ST.enabled || player.dead || player.invulnT > 0 || !w || !(w.mode === 'explore' || w.mode === 'goto' || w.mode === 'ia')) return 0;
    n = Math.max(0, n * (1 - clamp(mods.armor, 0, 0.8))); if (!n) return 0;
    player.hp -= n; player.lastHurt = now(); stats.taken += n;
    hud.hurt(n / player.maxHp); fx.sfx('hurt');
    if (ui.settings && ui.settings.cameraShake) S.shake = Math.max(S.shake || 0, 0.015 + Math.min(0.03, n * 0.0015));
    if (knock && src && src.pos && w.vel) { const dx = man.root.position.x - src.pos.x, dz = man.root.position.z - src.pos.z, l = Math.hypot(dx, dz) || 1; w.vel.x += dx / l * knock; w.vel.z += dz / l * knock; }
    emit('damage', { amount: n, src: src && src.type });
    if (player.hp <= 0) ko(src);
    return n;
  }
  function heal(n) { if (player.dead) return 0; const b = player.hp; player.hp = Math.min(player.maxHp, player.hp + Math.max(0, n)); return player.hp - b; }
  function ko(src) {
    const w = W(); player.hp = 0; player.dead = true; player.koT = 0; player.koShown = false; stats.deaths++;
    ST.touchFire = false; ST.aimToggle = false;
    if (w) { w.setMode('ko'); w.vel && w.vel.set(0, 0, 0); }
    fx.sfx('ko'); fx.stars(man.root.position.clone().add(V(0, 1.2, 0)), 5, { orbit: true, life: 2.4, size: 0.16 });
    emit('playerDeath', { src: src && src.type });
    unlock('cb_ko', { title: 'Fatto nero', desc: 'Andato K.O. nel quartiere', icon: '💫' });
    if (now() - (ko.lastPhone || -99) > 90) { ko.lastPhone = now(); phoneEvent('è andato K.O. ' + (src && src.type === 'boss' ? 'contro il Vigile Urbano Zombie' : src && src.type === 'pigeon' ? 'beccato dai piccioni mutanti' : 'contro gli zombi') + ' nel quartiere', false); }
  }
  function safeSpot() {
    const A = (level && level.anchors) || {};
    for (const a of [A.patio, A.gardenCenter, A.loungeCenter]) if (a && a.isVector3) {
      for (let r = 0; r < 3; r += 0.5) for (let k = 0; k < 8; k++) { const x = a.x + Math.cos(k * 0.785) * r, z = a.z + Math.sin(k * 0.785) * r; if (!level.isWalkable || level.isWalkable(x, z, 0.35)) return V(x, 0, z); }
    }
    return V(7.6, 0, 8.7);
  }
  function respawn() {
    const w = W(); const p = safeSpot();
    man.root.position.copy(p);
    if (w) { w.vel && w.vel.set(0, 0, 0); w.yaw = Math.PI; w.camYaw = 0.35; w.setMode('explore'); }
    player.dead = false; player.hp = player.maxHp; player.invulnT = 3; player.lastHurt = -9;
    for (const e of E.list) { e.aggro = false; if (e.state === 'chase' || e.state === 'attack') e.state = 'wander'; }
    fx.sfx('respawn'); emit('respawn', {});
    toast('Ti risvegli a casa. Gli zombi in strada ti aspettano…');
  }

  // ---------------------------------------------------------------- kills
  function onKill(e, o) {
    stats.kills++; stats.byType[e.type] = (stats.byType[e.type] || 0) + 1;
    const total = statInc('cb_kills');
    const it = item();
    const info = { type: e.type, level: e.level, pos: V(e.pos.x, 0, e.pos.z), boss: e.type === 'boss', weapon: it ? it.base : 'ombrello', head: !!(o && o.head) };
    emit('kill', info);
    try { const R = window.__rpg; if (R && typeof R.onKill === 'function') R.onKill(info); } catch (x) { console.warn('rpg.onKill', x); }
    unlock('cb_first_kill');
    if (total >= 100 || stats.kills >= 100) unlock('cb_kills_100');
    if (e.type === 'pigeon') unlock('cb_pigeon');
    if (e.type === 'boss') {
      stats.bosses++; unlock('cb_boss'); statInc('cb_bosses');
      toast('👮 Il Vigile Urbano Zombie è stato steso. Multa annullata!', 'gold');
      const f = getFX && getFX(); try { f && f.confetti && f.confetti(V(e.pos.x, 2.2, e.pos.z), 160); } catch (x) { }
      fx.bossDeath(V(e.pos.x, 1.2, e.pos.z)); // particles.js: big blast, parking tickets raining, police lights
      phoneEvent('ha steso il Vigile Urbano Zombie in Via Petroni e ha vinto', true);
    } else if (stats.kills % 25 === 0) phoneEvent('ha già steso ' + stats.kills + ' zombi nel quartiere (primo della classe)', true);
  }

  // ---------------------------------------------------------------- camera (after world.update)
  const OUT = { pos: V(), look: V(), fov: 50, snap: true };
  const _h = V(), _aimDir = V(), _right = V(), _piv = V(), _cn = V();
  function aimDirOf(out) { const w = W(), cy = w.camYaw, p = ST.aimPitch; return out.set(-Math.sin(cy) * Math.cos(p), -Math.sin(p), -Math.cos(cy) * Math.cos(p)); }
  function camera_(pose, dt) {
    const w = W(); if (!pose || !w || S.phase !== 'world') return pose;
    const m = w.mode, play = m === 'explore' || m === 'goto';
    ST.face = Math.max(0, ST.face - dt * 0.8);
    const faceAim = play && !player.dead && (ST.fp || (ST.drawn && (ST.aiming || now() - ST.lastFire < 1.1 || ST.meleeT > 0)));
    if (faceAim && m === 'explore') {
      const goal = w.camYaw + Math.PI;
      w.yaw = ST.fp ? goal : w.yaw + wrapA(goal - w.yaw) * (1 - Math.exp(-dt * 22));
      man.root.rotation.y = w.yaw;
      // walking backwards while aiming: reverse the walk clip instead of moonwalking
      const sp = Math.hypot(w.vel.x, w.vel.z);
      if (sp > 0.15 && man.setSpeed) { const back = (w.vel.x * Math.sin(w.yaw) + w.vel.z * Math.cos(w.yaw)) / sp < -0.35; man.setSpeed(sp, back); }
    }
    if (!play || player.dead) { ST.pivotOk = false; return pose; }
    aimDirOf(_aimDir);
    const root = man.root.position;
    if (ST.fp) {
      if (man.bones && man.bones.Head) { man.bones.Head.getWorldPosition(_h); const h = clamp(_h.y - root.y + 0.07, 0.8, 1.9); ST.eyeH += (h - ST.eyeH) * Math.min(1, dt * 10); }
      const sp = Math.hypot(w.vel.x, w.vel.z); ST.bob += dt * (2 + sp * 3.2);
      const bk = Math.min(1, sp / 2.7);
      const fy = Math.sin(w.yaw), fz = Math.cos(w.yaw);
      OUT.pos.set(root.x + fy * 0.12 + Math.cos(w.yaw) * Math.cos(ST.bob) * 0.012 * bk, root.y + ST.eyeH + Math.sin(ST.bob * 2) * 0.022 * bk, root.z + fz * 0.12 - Math.sin(w.yaw) * Math.cos(ST.bob) * 0.012 * bk);
      OUT.look.copy(OUT.pos).addScaledVector(_aimDir, 6);
      OUT.fov = 68 - 14 * ST.aimK + (w.runK || 0) * 4; OUT.snap = true;
      return OUT;
    }
    if (ST.drawn && m === 'explore') {
      const cy = w.camYaw; _right.set(Math.cos(cy), 0, -Math.sin(cy));
      const head = _h.set(root.x, root.y + 1.5 - (w.crouch || 0) * 0.35, root.z);
      let side = 0.46 - 0.08 * ST.aimK;
      const ts = rayBlockers(head, _right, side + 0.2, _cn); if (ts >= 0) side = Math.max(0.05, ts - 0.2);
      _piv.copy(head).addScaledVector(_right, side);
      if (!ST.pivotOk) { ST.pivot.copy(_piv); ST.pivotOk = true; } else ST.pivot.lerp(_piv, 1 - Math.exp(-dt * 22));
      let dist = 1.75 - 0.75 * ST.aimK;
      _b.copy(_aimDir).negate(); const tb = rayBlockers(ST.pivot, _b, dist + 0.2, _cn); if (tb >= 0) dist = Math.max(0.3, tb - 0.18);
      OUT.pos.copy(ST.pivot).addScaledVector(_aimDir, -dist); if (OUT.pos.y < 0.22) OUT.pos.y = 0.22;
      OUT.look.copy(ST.pivot).addScaledVector(_aimDir, 8);
      OUT.fov = 54 - 16 * ST.aimK + (w.runK || 0) * 4; OUT.snap = true;
      return OUT;
    }
    ST.pivotOk = false;
    return pose;
  }

  // hands in third person (explore.js extPose hook, chained after the easter eggs)
  const HP = { rR: null, rL: null, crouchT: undefined, leanT: undefined };
  const RR = { pos: V(), w: 1, palm: 'in', grip: 0.9 }, RL = { pos: V(), w: 1, palm: 'up', grip: 0.6 };
  function handPose(dt, mode) {
    if (player.dead && mode === 'ko') { HP.rR = undefined; HP.rL = undefined; HP.crouchT = 0.9; HP.leanT = 0.55; return HP; }
    HP.crouchT = undefined; HP.leanT = undefined;
    const melee = ST.meleeT > 0;
    if (!(ST.drawn || melee) || ST.fp || !(mode === 'explore' || mode === 'goto')) return null;
    const w = W(), root = man.root.position, yaw = w.yaw;
    const fx_ = Math.sin(yaw), fz = Math.cos(yaw), sx = -Math.cos(yaw), sz = Math.sin(yaw); // forward, man's right
    const it = item(), B = melee ? BASES.ombrello : baseOf(it);
    const ready = (ST.aiming || now() - ST.lastFire < 1.1) ? 1 : 0;
    w._cbReady = (w._cbReady || 0) + (ready - (w._cbReady || 0)) * Math.min(1, dt * 12); const r = w._cbReady;
    const pit = ST.aimPitch * r;
    let y = 1.1 + 0.22 * r - Math.sin(pit) * 0.32 * r, f = 0.28 + 0.2 * r, s = 0.15;
    if (B.shoulder && !melee) { y = 1.34; f = 0.12; s = 0.17; }
    if (melee) { const u = 1 - ST.meleeT / MELEE_DUR; y = 1.55 - u * 0.6; f = 0.25 + Math.sin(u * Math.PI) * 0.25; s = 0.3 - u * 0.55; }
    RR.pos.set(root.x + fx_ * f + sx * s, root.y + y, root.z + fz * f + sz * s); RR.palm = melee ? 'side' : 'in';
    HP.rR = RR; HP.rL = undefined;
    if (B.hands === 2 && !melee) { RL.pos.set(RR.pos.x + fx_ * 0.2 - sx * 0.12, RR.pos.y - 0.03, RR.pos.z + fz * 0.2 - sz * 0.12); HP.rL = RL; }
    return HP;
  }
  {
    const w = W(); if (w) {
      const prev = w.extPose;
      w.extPose = (dt, mode) => {
        const o = prev ? prev(dt, mode) : null, c = handPose(dt, mode);
        if (!c) return o; if (!o) return c;
        return { ...o, rR: o.rR !== undefined ? o.rR : c.rR, rL: o.rL !== undefined ? o.rL : c.rL, crouchT: o.crouchT !== undefined ? o.crouchT : c.crouchT, leanT: o.leanT !== undefined ? o.leanT : c.leanT };
      };
    }
  }

  // ---------------------------------------------------------------- per frame (after man.update)
  const _hand = V(), _fwd = V();
  let spawnHold = 0;
  function post(dt) {
    const w = W(); if (!w) return;
    const inWorld = S.phase === 'world';
    document.body.classList.toggle('cbOn', ST.enabled && inWorld);
    document.body.classList.toggle('cbArmed', ST.drawn);
    // melee timeline
    if (ST.meleeT > 0) { const before = ST.meleeT; ST.meleeT = Math.max(0, ST.meleeT - dt); if (!ST.meleeHit && before > MELEE_DUR - 0.16 && ST.meleeT <= MELEE_DUR - 0.16) { ST.meleeHit = true; meleeHit(); } }
    ST.kick *= Math.exp(-dt * 9); ST.recoil *= Math.exp(-dt * 5);
    // world model in the hand (third person)
    const it = item(), b = ST.meleeT > 0 ? 'ombrello' : it ? it.base : null;
    for (const k in WMESH) WMESH[k].visible = false;
    if (inWorld && b && (ST.drawn || ST.meleeT > 0) && !ST.fp && man.model.visible) {
      const g = WMESH[b];
      if (man.bones && man.bones.RightHand) man.bones.RightHand.getWorldPosition(_hand); else _hand.copy(man.root.position).add(V(0, 1.2, 0));
      const r = w._cbReady || 0;
      if (b === 'ombrello' && ST.meleeT > 0) { const u = 1 - ST.meleeT / MELEE_DUR; _fwd.set(Math.sin(w.yaw + 0.9 - u * 1.8), 0.6 - u * 1.4, Math.cos(w.yaw + 0.9 - u * 1.8)).normalize(); }
      else if (r > 0.3) aimDirOf(_fwd); else _fwd.set(Math.sin(w.yaw), -0.35, Math.cos(w.yaw)).normalize();
      g.position.copy(_hand).addScaledVector(_fwd, 0.05); g.position.y -= 0.02;
      g.lookAt(_t.copy(g.position).add(_fwd)); g.visible = true;
    }
    // projectiles, enemies, fx
    updProjs(dt);
    const P = man.root.position;
    const nightEv = (window.__minigames && window.__minigames.night && window.__minigames.night.active) || (window.__sport && window.__sport.match); // zombata notturna / calcetto: no spawns
    spawnHold = Math.max(0, spawnHold - dt);
    const res = E.update(dt, { attackable: ST.enabled && inWorld && !player.dead && (w.mode === 'explore' || w.mode === 'goto') && player.invulnT <= 0 && !(window.__sport && window.__sport.match), spawning: ST.enabled && ST.spawning && inWorld && !nightEv && !player.dead && spawnHold <= 0 && !(S.online && Q.has('noonlinespawn')) });
    fx.update(dt, nightAmount());
    // health
    player.invulnT = Math.max(0, player.invulnT - dt);
    if (!player.dead && player.hp < player.maxHp && now() - player.lastHurt > 6) player.hp = Math.min(player.maxHp, player.hp + 5 * mods.regen * dt);
    if (player.hp > player.maxHp) player.hp = player.maxHp;
    if (player.dead) {
      player.koT += dt;
      if (player.koT > 0.9 && !player.koShown) { player.koShown = true; hud.showKO(true, pick(KO_LINES)); }
      if (player.koT > 2.7 && player.dead) respawn();
      if (w.mode !== 'ko' && player.koT < 2.7 && player.koT > 0.1) respawn(); // something forced another mode: just come back
    } else if (player.koShown) { player.koT += dt; if (player.koT > 3.2) { player.koShown = false; hud.showKO(false); } }
    // HUD
    const R = window.__rpg, lv = R && (typeof R.level === 'function' ? R.level() : R.level);
    hud.setHP(player.hp, player.maxHp, ''); void lv; // the level is in the RPG HUD right above
    if (ST.drawn && it) { const st2 = statsOf(it); hud.setWeapon(it, baseOf(it), ammoOf(it), st2.magazine || 0, ST.slots, ST.cur, ST.reloadT > 0 ? 1 - ST.reloadT / ST.reloadDur : 0); }
    else hud.setWeapon(null);
    const boss = E.list.find(e => e.type === 'boss' && !e.dead);
    hud.setBoss(boss && inWorld ? { name: boss.name, level: boss.level, hp: boss.hp, max: boss.max } : null);
    ST.near = res ? res.nearest : 1e9;
    hud.touchState({ aim: ST.aimToggle, icon: ST.want && it ? baseOf(it).icon : '🔫' });
    void P;
  }

  // ---------------------------------------------------------------- viewmodel + projected HUD (after the camera is placed)
  const _cq = new THREE.Quaternion(), _cp = V();
  let vmSway = 0, vmLastYaw = 0, vmLastPitch = 0, swayX = 0, swayY = 0;
  function afterCamera(dt) {
    const w = W(); const inWorld = S.phase === 'world';
    const it = item(), b = ST.meleeT > 0 ? 'ombrello' : it ? it.base : null;
    for (const k in VMESH) VMESH[k].visible = false;
    const showVM = inWorld && ST.fp && b && (ST.drawn || ST.meleeT > 0) && w && (w.mode === 'explore' || w.mode === 'goto') && !player.dead;
    if (showVM) {
      camera.updateMatrixWorld(); camera.getWorldPosition(_cp); camera.getWorldQuaternion(_cq);
      vm.position.copy(_cp); vm.quaternion.copy(_cq);
      const m = VMESH[b]; m.visible = true;
      const off = VM_OFF[b], aim = VM_AIM[b], k = ST.aimK;
      const sp = Math.hypot(w.vel.x, w.vel.z), bk = Math.min(1, sp / 2.7) * (1 - 0.7 * k);
      // sway from the look speed
      const dy = wrapA(w.camYaw - vmLastYaw), dp = ST.aimPitch - vmLastPitch; vmLastYaw = w.camYaw; vmLastPitch = ST.aimPitch;
      swayX += (clamp(dy * 1.5, -0.04, 0.04) - swayX) * Math.min(1, dt * 10); swayY += (clamp(-dp * 1.5, -0.03, 0.03) - swayY) * Math.min(1, dt * 10);
      vmSway += dt;
      const rk = ST.reloadT > 0 ? Math.sin(Math.PI * clamp(1 - ST.reloadT / ST.reloadDur, 0, 1)) : 0;
      const sw = ST.switchT > 0 ? ST.switchT / 0.35 : 0;
      m.position.set(
        off[0] + (aim[0] - off[0]) * k + Math.cos(ST.bob) * 0.012 * bk + swayX,
        off[1] + (aim[1] - off[1]) * k + Math.abs(Math.sin(ST.bob)) * 0.01 * bk + Math.sin(vmSway * 1.6) * 0.003 - rk * 0.12 - sw * 0.2 + swayY,
        off[2] + (aim[2] - off[2]) * k + ST.kick * 0.05);
      m.rotation.set(ST.kick * 0.25 - rk * 0.7, Math.PI + swayX * 2, -rk * 0.4);
      if (ST.meleeT > 0) { const u = 1 - ST.meleeT / MELEE_DUR; m.rotation.set(0.3 - u * 1.2, Math.PI + 0.9 - u * 1.9, -0.6 + u * 0.8); m.position.x = 0.25 - u * 0.4; }
    }
    // HUD
    const now_ = now();
    const stt = it ? statsOf(it) : null;
    const showHp = inWorld && ST.enabled && w && (ST.drawn || player.hp < player.maxHp - 0.5 || now_ - player.lastHurt < 8 || (ST.near || 1e9) < 26 || player.dead);
    hud.frame(dt, {
      crosshair: inWorld && ST.drawn && w && w.mode === 'explore' && !ui.menuOpen && baseOf(it).kind !== 'melee',
      spread: stt ? spreadOf(stt) : 0, showHp, lowHp: !player.dead && player.hp / player.maxHp < 0.3 && inWorld,
      bars: inWorld ? E.bars(now_) : [],
    });
  }

  // ---------------------------------------------------------------- network (cosmetic shots of the other players)
  // a shot drawn for someone else (other players online, battle-royale bots): no damage, just beam/projectile + sound
  const _cs = V();
  function cosmeticShot(base, o, t) {
    const B = BASES[base]; if (!B || !o || !t || o.distanceTo(t) > 120) return;
    const color = ELEMENTS[B.element];
    if (B.kind !== 'melee') { _cs.copy(t).sub(o).normalize(); fx.muzzle(o, _cs, base); } // remote shots look like ours (particles.js)
    if (B.kind === 'hitscan') { fx.beam(o, t, color, 0.02, 0.09); fx.tracer(o, t, color); fx.impact(t, _cs.negate(), B.element); fx.sfx(B.element, o, 0.7); }
    else if (B.kind === 'projectile') { const d = t.clone().sub(o), dist = d.length(); d.normalize(); const sp = B.stats.projectileSpeed, g = B.gravity || 0; const vel = d.multiplyScalar(sp); vel.y += 0.5 * g * dist / sp; spawnProj(base, o, vel, { cosmetic: true, g, B, st: B.stats }); fx.sfx(B.element, o, 0.7); }
    else if (B.kind === 'melee') { fx.stars(t.clone().add(V(0, 0.4, 0)), 3, { size: 0.15 }); fx.sfx('bonk', t, 0.7); }
  }
  function hookNet() {
    const net = window.__net; if (!net || !net.on || hookNet.done) return; hookNet.done = true;
    net.on('ev', ({ from, e }) => {
      if (!e || e.k !== 'cb' || e.a !== 'f' || !BASES[e.w]) return;
      const P = net.players && net.players.get(from); const av = P && P.avatar && P.avatar.root;
      const o = Array.isArray(e.o) ? V(+e.o[0] || 0, +e.o[1] || 0, +e.o[2] || 0) : av ? av.position.clone().add(V(0, 1.35, 0)) : null;
      const t = Array.isArray(e.t) ? V(+e.t[0] || 0, +e.t[1] || 0, +e.t[2] || 0) : null;
      cosmeticShot(e.w, o, t);
    });
  }
  setTimeout(hookNet, 0);

  // ---------------------------------------------------------------- API
  const api = {
    weapons: { BASES, RARITY, RARITIES, PERKS, ELEMENTS, make: makeItem, statsOf },
    give, equip, holster, take(s) { if (!(s >= 0 && s < 4)) return null; const it = ST.slots[s]; ST.slots[s] = null; if (s === ST.cur) { const n = ST.slots.findIndex(Boolean); if (n >= 0) ST.cur = n; else holster(); } return it; },
    current: () => (ST.drawn ? item() : null), loadout: () => ST.slots.slice(), get slot() { return ST.cur; },
    // LOOT-RPG: the 4 weapon slots at once (items or null) + the active slot; magazines are kept per item id
    setLoadout(arr, active) {
      const prevId = item() && item().id;
      for (let i = 0; i < 4; i++) ST.slots[i] = (arr && arr[i] && arr[i].base) ? arr[i] : null;
      if (Number.isInteger(active) && ST.slots[active]) ST.cur = active; else if (!ST.slots[ST.cur]) { const n = ST.slots.findIndex(Boolean); if (n >= 0) ST.cur = n; else holster(); }
      if ((item() && item().id) !== prevId) { ST.reloadT = 0; ST.switchT = 0.3; }
      return ST.slots.slice();
    },
    refreshStats() { if (player.hp > player.maxHp) player.hp = player.maxHp; },
    ammo: it => ammoOf(it || item()),
    damagePlayer, heal, player, mods,
    spawnEnemy: (type, pos, o) => E.spawn(type, pos && pos.isVector3 ? pos : V(...(pos || [0, 0, 0])), o || {}),
    enemies: () => E.list.map(e => ({ id: e.id, type: e.type, level: e.level, hp: e.hp, max: e.max, pos: e.pos.clone(), dead: e.dead, state: e.state })),
    killAll: () => { for (const e of E.list.slice()) if (!e.dead) E.damage(e, 1e6, {}); },
    clearEnemies: () => E.clearAll(),
    on(evt, fn) { (listeners[evt] ||= []).push(fn); return () => { listeners[evt] = listeners[evt].filter(f => f !== fn); }; },
    setEnabled(v) { ST.enabled = !!v; if (!v) { holster(); E.clearAll(); } },
    setSpawning(v) { ST.spawning = !!v; },
    get enabled() { return ST.enabled; },
    firstPerson(v) { if (v !== undefined) setFP(v); return ST.fp; },
    stats: () => ({ ...stats, byType: { ...stats.byType }, hp: Math.round(player.hp), maxHp: player.maxHp, enemies: E.list.filter(e => !e.dead).length, model: E.model, ready: E.ready }),
    giveAll() { give(makeItem('tortellini')); give(makeItem('nerf', { rarity: 'raro' })); give(makeItem('spritz', { rarity: 'epico' })); return this.loadout(); },
    get state() { return { drawn: ST.drawn, want: ST.want, fp: ST.fp, aiming: ST.aiming, cur: ST.cur, reload: ST.reloadT, aimPitch: ST.aimPitch }; },
    _debug: { ST, E, fx, hud, raycast, projs },
    ownsKey: code => code === 'KeyH' && inPlay(),
    // wave 2 hooks (battle royale / Gulag): remote targets, hurt feedback without HP logic, cosmetic shots
    setTargets(list, onHit) { TG.list = typeof list === 'function' ? list : null; TG.hit = typeof onHit === 'function' ? onHit : null; },
    hurtFx(k = 0.2) { hud.hurt(clamp(k, 0, 1)); fx.sfx('hurt'); if (ui.settings && ui.settings.cameraShake) S.shake = Math.max(S.shake || 0, 0.012 + 0.03 * clamp(k, 0, 1)); },
    fxShot(base, o, t) { cosmeticShot(base, o && o.isVector3 ? o : V(...(o || [0, 0, 0])), t && t.isVector3 ? t : V(...(t || [0, 0, 0]))); },
    // online shared world (src/worldsync.js): a multa thrown by a boss someone else simulates; kill credit for my last hit
    // on someone else's enemy (assist: only XP + the boss achievement)
    _throw(o, v, g, dmg) { spawnProj('multa', V(+o[0] || 0, +o[1] || 0, +o[2] || 0), V(+v[0] || 0, +v[1] || 0, +v[2] || 0), { hostile: true, g: +g || 4, dmg: clamp(+dmg || 8, 0, 80), max: 4 }); fx.sfx('whistle', V(+o[0] || 0, 0, +o[2] || 0), 0.8); },
    _credit(info, assist) {
      const e = { type: info.type, level: info.level, pos: V(info.x, 0, info.z) };
      if (!assist) { onKill(e, { head: !!info.head }); hud.hitMarker(true); return; }
      try { const R = window.__rpg; R && R.addXP && R.addXP(Math.round(12 * (1 + 0.25 * (Math.max(1, e.level) - 1)) * (e.type === 'boss' ? 12 : 1) * 0.4), 'assist'); } catch (x) { }
      if (e.type === 'boss') { stats.bosses++; unlock('cb_boss'); statInc('cb_bosses'); toast('👮 Il Vigile Urbano Zombie è stato steso: multa annullata anche per te!', 'gold'); }
    },
  };
  window.__combat = api;
  return { pre, camera: camera_, post, afterCamera, api };
}
