// quartiere.js — "più cose, più case": the neighbourhood beyond the garden gate.
// Via Teletubbylandia (Bologna porticoes), the friends' houses, Celtic, Sushi, Casa di Ashish (Discord station),
// Casa di Seghino (zombata), Piazzetta + edicola, Via Petroni (nightlife), Millennium (club), the checkpoint of the
// "zona demilitarizzata" and Teletubbylandia (meadow in the hills).
//
// Must run BEFORE createWorld (explore.js copies level.colliders at init) and BEFORE buildGulag (it snapshots the bounds).
//   const quartiere = buildQuartiere({ scene, level, low, getFX, ui, audio, renderer });
//   plugins.push(quartiere.plugin);                       // interactables (knock, beer, DJ, checkpoint, edicola)
//   quartiere.update(dt, t, focusPos, camera);            // every frame (lazy builds, culling, night, animations)
//
// Contracts for the other modules (all available from frame 0, before any mesh exists):
//   level.anchors.<name>  Vector3 (+ .yaw, facing of someone standing there; 0 = +z):
//     street, gate, piazzetta, petroni, edicola, celtic, celtic_bar, celtic_darts, celtic_door, sushi, sushi_conveyor,
//     sushi_door, discord (DESK centre; yaw = facing of the seated player, the monitors are in front; the Tripo
//     'gaming_desk' is placed there: anchors.discord.userData.furnished === 'gaming_desk'), ashish_room, zombata (cabinet ORIGIN,
//     yaw 0: screen faces +z, play spot ≈ +1 m in z), seghino_room, millennium, millennium_floor, millennium_dj,
//     millennium_door, bellazzi, checkpoint, teletubby, zombie_spawn_1..4 (meadow edges, night zombie event),
//     house_<id> (stand here to knock: parme, seghino, forla, asche, ashish, lombu), npc_* wander points.
//   level.zones (+ zoneAt): 'Via Teletubbylandia', 'Piazzetta', 'Via Petroni', 'Millennium', 'Celtic', 'Sushi',
//     'Casa di Ashish', 'Casa di Seghino', 'Checkpoint', 'Teletubbylandia'.
//   window.__quartiere: { anchors, zones, houses, places (built interiors: sushi.belt, ashish.screen…), onPlace(cb),
//     build(name), loadOptional(name), isNight(), zoneOf(x,z) }
//   events: 'bigalesso:place' {id, name, first} on entering a place; 'bigalesso:knock' {house, name}.
import * as THREE from 'three';
import { BUILDINGS, INTERIORS, ZONES, ANCHORS, HOUSES, BOUNDS, ST, PET, MEADOW, CHECK, GATE } from './quartiere/layout.js';
import { buildStreet, groundRect, groundH } from './quartiere/street.js';
import { buildTeletubby, teletubbyColliders, TT } from './quartiere/teletubby.js';
import { PLACE_BUILDERS, placeColliders } from './quartiere/places.js';
import { loadManifest, loadOptional, swapInstanced, swapObject, instancedFrom, modelBox } from './quartiere/models.js';
import { createLife } from './quartiere/life.js';
import { createDress } from './quartiere/dress.js';
import { instances } from './quartiere/kit.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const PI = Math.PI;

// achievements (window.__save from the menu module, guarded) — one per place
const PLACES = {
  'Via Teletubbylandia': { id: 'via', title: 'Fuori di casa', desc: 'Hai aperto il cancello su Via Teletubbylandia', icon: '🚪' },
  'Piazzetta': { id: 'piazzetta', title: 'Piazzetta dei cabinati', desc: 'Hai trovato la piazzetta con l\'edicola', icon: '📰' },
  'Via Petroni': { id: 'petroni', title: 'Piccolo stop in Petroni', desc: 'Sei passato in Via Petroni', icon: '🍻' },
  'Millennium': { id: 'millennium', title: 'Sabato sera', desc: 'Sei entrato al Millennium', icon: '🪩' },
  'Celtic': { id: 'celtic', title: 'Mercoledì, 21:30', desc: 'Hai scoperto il Celtic', icon: '🍀' },
  'Sushi': { id: 'sushi', title: 'All you can eat', desc: 'Hai scoperto il sushi', icon: '🍣' },
  'Casa di Ashish': { id: 'ashish', title: 'Sono su discord', desc: 'Sei entrato a casa di Ashish', icon: '🎧' },
  'Casa di Seghino': { id: 'seghino', title: 'Zombata', desc: 'Sei entrato a casa di Seghino', icon: '🧟' },
  'Checkpoint': { id: 'checkpoint', title: 'Zona demilitarizzata', desc: 'Sei arrivato al checkpoint', icon: '🚧' },
  'Teletubbylandia': { id: 'teletubbylandia', title: 'Teletubbylandia certificata', desc: 'Hai raggiunto le colline di Teletubbylandia', icon: '🌼' },
};
const KNOCK = [
  n => `Casa di ${n}: «Chi è? …ah sei tu. Arrivo dopo, sono in compettina»`,
  n => `Casa di ${n}: dal citofono solo un «soccia» e poi silenzio`,
  n => `Casa di ${n}: nessuno risponde. Si sente un reel a tutto volume`,
  n => `Casa di ${n}: «Scendo tra 5 minuti» (sono 40)`,
  n => `Casa di ${n}: «Stasi Celtic? Mercoledì 21:30, palese»`,
];

export function buildQuartiere({ scene, level, low = false, getFX = null, ui = null, audio = null, renderer = null } = {}) {
  const root = new THREE.Group(); root.name = 'quartiere'; scene.add(root);
  const t0 = performance.now();

  // ================= data -> level (colliders / zones / bounds / anchors / blockers) =================
  const C = level.colliders, BL = level.cameraBlockers;
  const box = (x0, z0, x1, z1) => C.push({ type: 'box', min: [x0, z0], max: [x1, z1] });
  const blk = (x0, y0, z0, x1, y1, z1) => BL.push({ min: [x0, y0, z0], max: [x1, y1, z1] });
  for (const b of BUILDINGS) {
    const g = groundRect(b), gh = groundH(b), room = b.interior ? INTERIORS[b.interior] : null;
    if (room) {
      const [rx0, rz0, rx1, rz1] = room.rect, [d0, d1] = room.door, low_ = b.face === 's';
      const parts = [[g[0], g[1], rx0, g[3]], [rx1, g[1], g[2], g[3]]];
      const fz0 = low_ ? g[1] : rz1, fz1 = low_ ? rz0 : g[3], bz0 = low_ ? rz1 : g[1], bz1 = low_ ? g[3] : rz0;
      parts.push([rx0, bz0, rx1, bz1], [rx0, fz0, d0, fz1], [d1, fz0, rx1, fz1]);
      for (const [a, c, e, f] of parts) if (e - a > 1e-3 && f - c > 1e-3) { box(a, c, e, f); blk(a, 0, c, e, gh, f); }
      blk(d0, 2.45, fz0, d1, gh, fz1); blk(rx0, room.ceil, rz0, rx1, gh + 0.01, rz1);
    } else { box(g[0], g[1], g[2], g[3]); blk(g[0], 0, g[1], g[2], gh, g[3]); }
    if (gh < b.h) blk(b.rect[0], gh, b.rect[1], b.rect[2], b.h + 3, b.rect[3]);
  }
  // portico columns
  { const n = Math.round((ST.x1 - ST.x0) / ST.bay), bay = (ST.x1 - ST.x0) / n; for (let i = 0; i <= n; i++) { const x = ST.x0 + i * bay; box(x - 0.28, ST.colZ, x + 0.28, ST.colZ + 0.55); }
    for (const r of [{ z0: 46, z1: PET.z1, xa: PET.colW - 0.5, xb: PET.colW }, { z0: PET.z0, z1: PET.z1, xa: PET.colE, xb: PET.colE + 0.5 }]) { const m = Math.round((r.z1 - r.z0) / 3.2), b = (r.z1 - r.z0) / m; for (let i = 0; i <= m; i++) { const z = r.z0 + i * b; box(r.xa, z - 0.26, r.xb, z + 0.26); } } }
  // boundaries: checkpoint corridor + meadow ring (invisible walls; the hills/sandbags show them)
  box(CHECK.x0, CHECK.z0 - 0.4, CHECK.x1, CHECK.z0); box(CHECK.x0, CHECK.z1, CHECK.x1, CHECK.z1 + 0.4);
  box(MEADOW.x1, MEADOW.z0, MEADOW.x1 + 0.4, CHECK.z0); box(MEADOW.x1, CHECK.z1, MEADOW.x1 + 0.4, MEADOW.z1);
  box(MEADOW.x0, MEADOW.z0 - 0.4, MEADOW.x1 + 0.4, MEADOW.z0); box(MEADOW.x0, MEADOW.z1, MEADOW.x1 + 0.4, MEADOW.z1 + 0.4); box(MEADOW.x0 - 0.4, MEADOW.z0, MEADOW.x0, MEADOW.z1);
  blk(MEADOW.x0, 0, -30, MEADOW.x1 + 0.4, 40, MEADOW.z0 - 0.2); blk(MEADOW.x0, 0, MEADOW.z1 + 0.2, MEADOW.x1 + 0.4, 40, 100); blk(-46, 0, -30, -36, 40, CHECK.z0 - 0.3); blk(-46, 0, CHECK.z1 + 0.3, -36, 40, 100);
  // street props + interiors + teletubbylandia (data only)
  for (const c of teletubbyColliders()) C.push(c);
  for (const c of placeColliders()) C.push(c);
  // zones, bounds, anchors
  for (const z of ZONES) level.zones.push({ name: z.name, rect: z.rect.slice() });
  Object.assign(level.bounds, { x0: Math.min(level.bounds.x0, BOUNDS.x0), x1: Math.max(level.bounds.x1, BOUNDS.x1), z1: Math.max(level.bounds.z1, BOUNDS.z1) });
  const anchors = {};
  for (const [k, [x, z, yaw]] of Object.entries(ANCHORS)) { const v = V(x, 0, z); v.yaw = yaw; v.userData = { yaw }; anchors[k] = v; if (!(k in level.anchors)) level.anchors[k] = v; }
  level.houses = HOUSES; level.quartiere = null; // set below

  // ================= meshes =================
  // the street is the backdrop of the garden: built now (merged/instanced); the rest lazily by distance
  const streetG = new THREE.Group(); streetG.name = 'via'; root.add(streetG);
  const SH = buildStreet(streetG, { low });
  // colliders of the street furniture (cars, lamps, bins, benches, trees, edicola)
  for (const x of [-29.5, -24.5, -15, -2.5, 3, 20, 26.5, 35]) box(x - 1.7, ST.curbNear + 0.25, x + 1.7, ST.curbNear + 1.85);
  for (const x of [-31, -20, -9, 2, 23, 34]) C.push({ type: 'circle', c: [x, ST.curbNear - 0.45], r: 0.2 });
  C.push({ type: 'circle', c: [41, 21.2], r: 0.2 }, { type: 'circle', c: [49, 32.6], r: 0.2 });
  for (const [x0, z] of [[8.0, 20.5], [29.0, 20.5], [-38.2, 20.6]]) box(x0 - 0.45, z - 0.4, x0 + 3.45, z + 0.4);
  for (const b of SH.benchSpots) C.push({ type: 'circle', c: [b.x, b.z], r: 0.55 });
  for (const t of SH.trees) C.push({ type: 'circle', c: [t.x, t.z], r: 0.35 });
  box(42.95, 22.8, 45.65, 24.8); // edicola
  for (const [x, z] of [[6.2, 28.7], [7.2, 28.8], [41.6, 47.4]]) C.push({ type: 'circle', c: [x, z], r: 0.45 });

  const areas = {
    // visible from the west half of the street (through the checkpoint) and from inside; never from the house/garden
    tele: { center: V(-46, 0, 27), buildR: 70, showR: 140, see: p => (p.x < 10 && p.z > 19.5) || p.x < -30, group: null, hooks: null, build: () => { const g = new THREE.Group(); g.name = 'teletubbylandia'; root.add(g); const h = buildTeletubby(g, { low }); return { group: g, hooks: h }; } },
  };
  const places = {}; // id -> built interior (from places.js)
  const placeDefs = Object.entries(INTERIORS).map(([id, I]) => { const [x0, z0, x1, z1] = I.rect; return { id, I, door: V((I.door[0] + I.door[1]) / 2, 0, id === 'seghino' ? z1 : z0), center: V((x0 + x1) / 2, 0, (z0 + z1) / 2) }; });

  const S = { night: 0, zone: null, visited: new Set(), cbs: [], beers: 0, inGulag: false, frame: 0, tripoDone: false, buildQueue: [] };
  try { const v = JSON.parse(localStorage.getItem('bigalesso_places_v1') || '[]'); for (const x of v) S.visited.add(x); } catch (e) { }
  const saveVisited = () => { try { localStorage.setItem('bigalesso_places_v1', JSON.stringify([...S.visited])); } catch (e) { } };

  function buildPlace(id) {
    if (places[id] || !PLACE_BUILDERS[id]) return places[id];
    const t = performance.now();
    try { places[id] = PLACE_BUILDERS[id](root, { low }); } catch (e) { console.warn('quartiere: place ' + id, e); places[id] = { group: new THREE.Group(), lights: [], update() { } }; }
    places[id].built = performance.now() - t;
    placeModels(id);
    try { window.__gfx && window.__gfx.warmup && window.__gfx.warmup(places[id].group); } catch (e) { }
    return places[id];
  }
  function buildArea(k) {
    const a = areas[k]; if (a.group) return a;
    try { const r = a.build(); a.group = r.group; a.hooks = r.hooks; } catch (e) { console.warn('quartiere: area ' + k, e); a.group = new THREE.Group(); a.hooks = { anim: [], night: [], tripo: [] }; }
    try { window.__gfx && window.__gfx.warmup && window.__gfx.warmup(a.group); } catch (e) { }
    if (k === 'tele') { S.barrier = a.hooks.barrier; dress.tele(a.hooks, a.group); }
    return a;
  }

  // ================= Tripo models (assets/models/index.json): swap the procedural props when present =================
  // (assets are already in metres, ground y=0, centred, front +Z: no rescale)
  const warm = o => { try { window.__gfx && window.__gfx.warmup && window.__gfx.warmup(o); } catch (e) { } };
  function setBox(c, min, max) { // move a level collider + its explore twin ('lv' + index), like gulag.js
    c.min[0] = min[0]; c.min[1] = min[1]; c.max[0] = max[0]; c.max[1] = max[1];
    const W = S.W; const b = W && W.boxes ? W.boxes.find(x => x.id === 'lv' + C.indexOf(c)) : null; if (b) { b.min.set(min[0], 0, min[1]); b.max.set(max[0], 0, max[1]); }
  }
  function place(sc, parent, x, y, z, ry = 0) { const o = sc.clone(true); o.position.set(x, y, z); o.rotation.y = ry; o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); parent.add(o); return o; }
  async function applyModels() {
    const list = await loadManifest(); if (!list.length) return;
    // street lamps: model at the pole, glow + light pool at its lantern (~3.6 m)
    const lampSc = await loadOptional('street_lamp');
    if (lampSc) {
      const L = SH.lamps; instancedFrom(lampSc, L.list.map(o => ({ x: o.x, z: o.z, ry: o.ry })), streetG);
      L.poles.visible = false; L.heads.visible = false;
      streetG.add(instances(new THREE.SphereGeometry(0.11, 10, 8), SH.mats.lampHead, L.list.map(o => ({ x: o.x, y: 3.62, z: o.z })), { cast: false, name: 'lampGlow' }));
      const m4 = new THREE.Matrix4(); L.list.forEach((o, i) => { L.poolIm.setMatrixAt(i, m4.compose(V(o.x, 0.02, o.z), new THREE.Quaternion(), V(7, 1, 7))); SH.lampSpots[i] = V(o.x, 3.6, o.z); });
      L.poolIm.instanceMatrix.needsUpdate = true;
    }
    for (const h of SH.tripo) { if (h.name !== 'fiat500' && h.name !== 'vespa') continue; try { await swapInstanced(h.name, h.ims); } catch (e) { console.warn(e); } }
    await dress.street();
    warm(streetG);
    for (const id of Object.keys(places)) placeModels(id);
  }
  function placeModels(id) { dress.interior(id, places[id]); }
  const dress = createDress({ SH, streetG, root, places, areas, C, S, anchors, warm, anim: SH.anim, quality: () => quality() });
  applyModels();
  const life = createLife(root, { getQuality: () => quality() });
  // real point lights: a FIXED pool (count only changes with the quality preset / when leaving the neighbourhood, so
  // three.js never recompiles every material while walking around). Inside a place: its light descriptors;
  // outside at night: the nearest street lamps; otherwise intensity 0.
  const QZ = new Set(ZONES.map(z => z.name));
  const pool = []; for (let i = 0; i < 3; i++) { const L = new THREE.PointLight(0xffc27a, 0, 13, 2); L.visible = false; root.add(L); pool.push(L); }
  let lampT = 0, lampSrc = [];
  const WARM = new THREE.Color(0xffc27a);
  function updatePool(dt, p, zn) {
    const nearGate = p.x > 11.5 && p.x < 14.7 && p.z > 18.8 && p.z < 20.6;
    const inQ = QZ.has(zn) || nearGate; const q = quality(); const n = q === 'low' ? 1 : q === 'medium' ? 2 : 3;
    for (let i = 0; i < pool.length; i++) pool[i].visible = inQ && i < n;
    if (!inQ) return;
    let src = null;
    const d = placeDefs.find(d => d.I.name === zn); const pl = d && places[d.id];
    if (pl) src = pl.lights;
    else if (S.night > 0.15) {
      lampT -= dt;
      if (lampT <= 0) { lampT = 0.4; lampSrc = SH.lampSpots.map(v => [v, (v.x - p.x) ** 2 + (v.z - p.z) ** 2]).filter(a => a[1] < 30 * 30).sort((a, b) => a[1] - b[1]).slice(0, 3).map(a => ({ position: V(a[0].x, a[0].y - 0.25, a[0].z), color: WARM, distance: 13, intensity: 0 })); }
      for (const l of lampSrc) l.intensity = S.night * 14; src = lampSrc;
    }
    for (let i = 0; i < n; i++) { const L = pool[i], l = src && src[i]; if (l) { L.position.copy(l.position); L.color.copy(l.color); L.intensity = l.intensity; L.distance = l.distance; } else L.intensity = 0; }
  }

  // ================= night / quality =================
  function nightK() { const fx = getFX ? getFX() : null; return fx && typeof fx.nightAmount === 'number' ? fx.nightAmount : (fx && fx.night ? 1 : 0); }
  function quality() { const q = ui && ui.settings ? ui.settings.quality : 'auto'; return q === 'auto' ? (low ? 'low' : 'high') : q; }
  let lastNight = -1;
  function applyNight(k) {
    for (const f of SH.night) f(k);
    for (const a of Object.values(areas)) if (a.hooks) for (const f of a.hooks.night) f(k);
  }

  // ================= update =================
  const tmp = V();
  function update(dt, t, focus, cam) {
    S.frame++;
    const p = focus || (cam ? cam.position : tmp.set(13, 0, 15));
    const zn = level.zoneAt ? level.zoneAt(p.x, p.z) : null;
    // inside the gulag: everything off
    const inG = zn === 'Il Gulag' || (window.__app && window.__app.gulag && window.__app.gulag.inside);
    root.visible = !inG; if (inG) return;
    // night (throttled)
    const k = nightK(); if (Math.abs(k - lastNight) > 0.01) { lastNight = k; S.night = k; applyNight(k); }
    if (SH.uTime) SH.uTime.value = t;
    for (const f of SH.anim) f(dt, t);
    // lazy builds: at most one per frame
    let built = false;
    for (const [key, a] of Object.entries(areas)) { const d = Math.hypot(p.x - a.center.x, p.z - a.center.z); if (!a.group && !built && d < a.buildR) { buildArea(key); built = true; applyNight(S.night); } if (a.group) a.group.visible = d < a.showR && a.see(p); }
    for (const d of placeDefs) {
      const dist = Math.hypot(p.x - d.door.x, p.z - d.door.z), inside = zn === d.I.name;
      if (!places[d.id] && !built && (dist < 18 || inside)) { buildPlace(d.id); built = true; }
      const pl = places[d.id]; if (!pl) continue;
      const vis = inside || dist < 22; pl.group.visible = vis;
      if (vis && pl.update) pl.update(dt, t);
    }
    if (areas.tele.group && areas.tele.group.visible) for (const f of areas.tele.hooks.anim) f(dt, t);
    // street life (Tripo cat / poodle / pigeons): loaded once the player is out in the world
    if (focus && S.frame > 30) life.load();
    if (S.frame > 60) dress.gulag();
    life.update(dt, t, p);
    updatePool(dt, p, zn);
    // first-time hint: the neighbourhood is behind the garden gate (players kept missing it)
    if (focus && !S.visited.has('via') && !S.gateHint) {
      S.hintT = (S.hintT || 0) + dt;
      if (zn === 'Giardino' || S.hintT > 25) {
        S.gateHint = 1;
        try { if (ui && ui.toast) ui.toast(zn === 'Giardino' ? 'Il cancello in fondo al giardino è aperto: fuori c\'è Via Teletubbylandia con tutto il quartiere' : 'Esci in giardino: dal cancello si va nel quartiere (Celtic, sushi, Millennium, Petroni…)'); } catch (e) { }
      }
    }
    // zone change -> discovery
    if (focus && zn !== S.zone) {
      S.zone = zn;
      const info = PLACES[zn];
      if (info) {
        const first = !S.visited.has(info.id);
        if (first) { S.visited.add(info.id); saveVisited(); try { if (ui && ui.toast) ui.toast('Hai scoperto: ' + zn); } catch (e) { } }
        try { window.__save && window.__save.unlock && window.__save.unlock('luogo_' + info.id, { title: info.title, desc: info.desc, icon: info.icon, group: 'Luoghi' }); } catch (e) { }
        window.dispatchEvent(new CustomEvent('bigalesso:place', { detail: { id: info.id, name: zn, first } }));
        for (const cb of S.cbs) { try { cb(info.id, zn, first); } catch (e) { } }
      }
    }
  }

  // ================= explore plugin: interactables =================
  function plugin(ctx, W, h) {
    S.W = W;
    const items = [];
    const at = (x, z) => V(x, 0, z);
    // knock on the friends' closed doors
    for (const ho of HOUSES) {
      if (ho.enterable) continue; const a = anchors['house_' + ho.id]; if (!a) continue;
      const door = V(a.x + Math.sin(a.yaw) * 0.9, 1.7, a.z + Math.cos(a.yaw) * 0.9);
      let n = 0;
      items.push({ id: 'knock_' + ho.id, label: () => 'Bussa da ' + ho.name, anchor: () => a, top: () => door, range: 1.6,
        act: () => { if (audio) { audio.sfx('click'); setTimeout(() => audio.sfx('click'), 180); setTimeout(() => audio.sfx('click'), 360); } h.toast(KNOCK[(n++ + ho.id.length) % KNOCK.length](ho.name)); window.dispatchEvent(new CustomEvent('bigalesso:knock', { detail: { house: ho.id, name: ho.name } })); } });
    }
    // checkpoint: show the documents -> the barrier goes up
    { const a = at(-38.6, 29.8); items.push({ id: 'checkpoint', label: () => (S.barrier && S.barrier.target > 0.5) ? 'Abbassa la sbarra' : 'Mostra i documenti', anchor: () => a, top: () => V(-38.6, 1.9, 30.5), range: 1.8,
      act: () => { if (!S.barrier) buildArea('tele'); const b = S.barrier; if (!b) return; const up = b.target < 0.5; b.target = up ? 1 : 0; if (audio) audio.sfx('creak');
        h.toast(up ? 'Passaporto teletubby verificato. Benvenuto nella zona demilitarizzata' : 'Sbarra abbassata');
        if (up) try { window.__save && window.__save.unlock && window.__save.unlock('passaporto_teletubby', { title: 'Passaporto teletubby', desc: 'Hai superato il checkpoint coi documenti in regola', icon: '🛂', group: 'Luoghi' }); } catch (e) { } } }); }
    // Celtic: a pint at the bar
    { const a = anchors.celtic_bar; items.push({ id: 'celtic_beer', label: () => S.beers ? `Un'altra pinta (${S.beers})` : 'Ordina una pinta', anchor: () => a, top: () => V(3, 1.35, 42.2), range: 1.4,
      act: () => { S.beers++; if (audio) audio.sfx('gulp'); const fx = h.fx && h.fx(); if (fx && fx.pulse) fx.pulse(0xffc060, 0.5);
        h.toast(['Pinta servita. Sláinte!', 'Seconda pinta: il Celtic approva', 'Terza pinta: mercoledì da leoni', 'Basta così, campione'][Math.min(3, S.beers - 1)]);
        if (S.beers === 3) try { window.__save && window.__save.unlock && window.__save.unlock('mercoledi_leoni', { title: 'Mercoledì da leoni', desc: 'Tre pinte al Celtic', icon: '🍺', group: 'Luoghi' }); } catch (e) { } } }); }
    // Celtic: darts
    { const a = anchors.celtic_darts; items.push({ id: 'celtic_darts', label: () => 'Tira una freccetta', anchor: () => a, top: () => V(-1.6, 1.73, 38.2), range: 1.6,
      act: () => { const r = Math.random(); const s = r < 0.06 ? 'BULLSEYE! 50' : r < 0.2 ? 'Tripla 20: 60!' : r < 0.5 ? String(1 + (Math.random() * 20 | 0)) : r < 0.8 ? String(5 + (Math.random() * 40 | 0)) : 'Fuori bersaglio. Ti guardano tutti'; if (audio) audio.sfx('click'); h.toast('Freccetta: ' + s);
        if (s.startsWith('BULL')) try { window.__save && window.__save.unlock && window.__save.unlock('bullseye_celtic', { title: 'Occhio di bue', desc: 'Bullseye al Celtic', icon: '🎯', group: 'Luoghi' }); } catch (e) { } } }); }
    // Millennium: the DJ console changes the light show
    { const a = anchors.millennium_dj; items.push({ id: 'mil_dj', label: () => 'Cambia il light show', anchor: () => a, top: () => V(44, 1.4, 89.5), range: 1.5,
      act: () => { const p = places.millennium; if (p) p.state.mode++; if (audio) audio.sfx('beat'); h.toast(['Luci: scacchiera', 'Luci: onda', 'Luci: strobo'][(p ? p.state.mode : 0) % 3]); } }); }
    // edicola
    { const a = at(44.3, 22.6); a.yaw = 0; let n = 0; items.push({ id: 'edicola', label: () => 'Compra il Corriere', anchor: () => a, top: () => V(44.3, 1.9, 23.2), range: 1.6,
      act: () => { if (audio) audio.sfx('paper'); h.toast(['Corriere delle Due Torri: «Sempre in prima pagina»', 'L\'edicolante: «Oggi c\'è l\'inserto sul Gulag»', 'L\'edicolante: «Il numero nuovo? Lo stanno ancora scrivendo»'][n++ % 3]); window.dispatchEvent(new CustomEvent('bigalesso:edicola')); } }); }
    // Seghino's TV
    { const a = anchors.seghino_room; items.push({ id: 'seghino_tv', label: () => 'Guarda la TV', anchor: () => a, top: () => V(-11.2, 1.3, 19.4), range: 1.8,
      act: () => { if (audio) audio.sfx('tvzap'); h.toast('Sullo schermo: ZOMBATA — premi start. Il cabinato arriva presto'); } }); }
    // the dog follows through the new doors: rebuild dogplay's portals + ours
    try {
      const dog = ctx.dog; if (dog && typeof dog.setEnv === 'function' && level.zoneAt) {
        const an = level.anchors; const portals = [];
        if (an.doorway) portals.push({ a: level.zoneAt(an.doorway.x - 0.6, an.doorway.z) || 'Sala giochi', b: level.zoneAt(an.doorway.x + 0.6, an.doorway.z) || 'Salotto', p: an.doorway.clone(), n: V(1, 0, 0) });
        if (an.gardenDoor) portals.push({ a: level.zoneAt(an.gardenDoor.x, an.gardenDoor.z - 0.6) || 'Salotto', b: level.zoneAt(an.gardenDoor.x, an.gardenDoor.z + 0.6) || 'Giardino', p: an.gardenDoor.clone(), n: V(0, 0, 1) });
        const P = (a, b, x, z, nx, nz) => portals.push({ a, b, p: V(x, 0, z), n: V(nx, 0, nz) });
        P('Giardino', 'Via Teletubbylandia', 13.1, 20, 0, 1);
        P('Via Teletubbylandia', 'Piazzetta', 40, 26, 1, 0); P('Piazzetta', 'Via Petroni', 44, 33.6, 0, 1); P('Via Petroni', 'Millennium', 44, 78.1, 0, 1);
        P('Via Teletubbylandia', 'Celtic', 3, 33.75, 0, 1); P('Via Teletubbylandia', 'Sushi', 23, 33.75, 0, 1); P('Via Teletubbylandia', 'Casa di Ashish', -22, 33.75, 0, 1);
        P('Via Teletubbylandia', 'Casa di Seghino', -12, 19.85, 0, -1); P('Via Teletubbylandia', 'Checkpoint', -36, 26.8, -1, 0); P('Checkpoint', 'Teletubbylandia', -46, 26.8, -1, 0);
        dog.setEnv({ portals });
      }
    } catch (e) { console.warn('quartiere portals', e); }
    return { items };
  }

  const API = {
    root, anchors, zones: ZONES, houses: HOUSES, places, update, plugin, loadOptional,
    build: id => (areas[id] ? buildArea(id) : buildPlace(id)),
    onPlace: cb => S.cbs.push(cb), isNight: () => S.night > 0.5, zoneOf: (x, z) => level.zoneAt(x, z),
    get barrier() { return S.barrier; }, buildTime: 0, state: S, street: SH, areas, life,
  };
  API.buildTime = performance.now() - t0;
  level.quartiere = API;
  window.__quartiere = API;
  return API;
}
