// combat/enemies.js — open-world enemies: zombies (zombie.glb rigs, pooled), "piccioni mutanti" (pigeon.glb flocks),
// boss "Il Vigile Urbano Zombie" (Via Petroni). Spawn director per area: only in the outdoor quartiere zones (never the
// house, the garden or interiors), out of view, capped by the quality preset (Basso 3 · Medio 6 · Alto 10 · Ultra 14),
// fewer by day. Everything is built during the preload (pools), nothing is created while playing.
// Online (src/worldsync.js sets C.sync): every client keeps running this director around its own player and owns what it
// spawns; enemies of other players are puppets here (e.remote = owner id) moved by their snapshots (puppet()), hits on
// them go to the owner (C.sync.hit), owned enemies chase the nearest player (C.sync.target) and hurt remote ones through
// C.sync.hurt; one boss per room (C.sync.bossTaken / bossSpawned). Solo: C.sync is null and nothing changes.
import * as THREE from 'three';
import { loadZombieModel, makeZombieRig } from '../minigames/zmodel.js';
import { loadOptional } from '../quartiere/models.js'; // the original (skinned) pigeon scene: SkeletonUtils clones need it
import { OUTDOOR_ZONES } from '../quartiere/layout.js';
import { zombiesOut } from '../daynight.js';
// Day/night rule (shared clock, daynight.js): THE single hook for which enemy types may walk now. Zombies and the Vigile
// only at night (nightAmount ≥ ZOMBIE_NIGHT, ≈ 20:00 → 06:00 game time); by day the director sends the mutant pigeons only.
// At dawn the zombies out in the streets cover their eyes and sink into the ground ('dawn', every client by its own clock).
export const mayWalk = (type, night) => type === 'pigeon' || zombiesOut(night);
const DAWN_LINES = ['AAAH, IL SOLE!', 'LA LUCE!', 'BRUCIAAA!', 'I MIEI OCCHI!', 'TROPPO PRESTO!'];
import { currentQuality } from '../scene.js';
import { weaponMaterial } from './weapons.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapA = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
export const CAPS = { low: 3, medium: 6, high: 10, ultra: 14 };
const AREA_LV = { 'Via Teletubbylandia': 1, 'Piazzetta': 2, 'Checkpoint': 3, 'Via Petroni': 3, 'Teletubbylandia': 4 };
const ZPOOL = 14, PPOOL = 10;

function colored(g, hex) {
  g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
// the boss cap (positioned on the head bone every frame, not parented: bone scales/axes vary between exports)
function capMesh() {
  const g = mergeGeometries([
    colored(new THREE.CylinderGeometry(0.13, 0.12, 0.1, 14).translate(0, 0.05, 0), '#f4f4f0'),
    colored(new THREE.CylinderGeometry(0.135, 0.135, 0.03, 14).translate(0, 0.01, 0), '#1a2a5a'),
    colored(new THREE.BoxGeometry(0.2, 0.012, 0.09).translate(0, 0.0, 0.12), '#111111'),
    colored(new THREE.CylinderGeometry(0.028, 0.028, 0.01, 8).rotateX(Math.PI / 2).translate(0, 0.06, 0.125), '#e8c030'),
  ]);
  const m = new THREE.Mesh(g, weaponMaterial()); m.castShadow = true; m.frustumCulled = false; return m;
}
// procedural stand-in when zombie.glb is not in the manifest (artifact builds)
function fallbackRig() {
  const g = mergeGeometries([
    colored(new THREE.BoxGeometry(0.42, 0.6, 0.24).translate(0, 1.18, 0), '#6a5a4a'), colored(new THREE.BoxGeometry(0.36, 0.8, 0.22).translate(0, 0.45, 0), '#2a3048'),
    colored(new THREE.IcosahedronGeometry(0.14, 1).translate(0, 1.62, 0.02), '#7fae4f'),
    colored(new THREE.BoxGeometry(0.1, 0.1, 0.55).translate(-0.26, 1.38, 0.26), '#7fae4f'), colored(new THREE.BoxGeometry(0.1, 0.1, 0.55).translate(0.26, 1.38, 0.26), '#7fae4f'),
  ]);
  const root = new THREE.Group(), inner = new THREE.Group(); root.add(inner);
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })); mesh.castShadow = true; inner.add(mesh);
  let t = 0, k = 'idle', rate = 1;
  return { root, busy: false, fallback: true, play(n) { k = n; }, setRate(r) { rate = r; }, has: n => n !== 'attack' && n !== 'fall', update(dt) { t += dt * rate; inner.rotation.z = Math.sin(t * 4) * (k === 'idle' ? 0.02 : 0.07); inner.position.y = k === 'idle' ? 0 : Math.abs(Math.sin(t * 8)) * 0.04; }, speed: { walk: 0.9, run: 2.4 } };
}

export function createEnemies(C) {
  const { scene, level, man, fx, hud } = C;
  const zpool = [], ppool = []; let bossRig = null, bossCap = null, ZM = null, pigeonProto = null, ready = false;
  const list = []; let nid = 1;
  const st = { spawnT: 3, bossCool: 40, petroniT: 0, outT: 0, flockT: 20, groanT: 2 };

  // ---------------------------------------------------------------- collision grid over level.colliders (2D) + zones
  let grid = null, gridN = -1; const CELL = 6;
  const key = (ix, iz) => ix * 100003 + iz;
  function buildGrid() {
    const cols = (level && level.colliders) || []; grid = new Map(); gridN = cols.length;
    for (const c of cols) {
      let x0, z0, x1, z1;
      if (c.type === 'box') { x0 = c.min[0]; z0 = c.min[1]; x1 = c.max[0]; z1 = c.max[1]; } else { x0 = c.c[0] - c.r; z0 = c.c[1] - c.r; x1 = c.c[0] + c.r; z1 = c.c[1] + c.r; }
      for (let ix = Math.floor((x0 - 0.7) / CELL); ix <= Math.floor((x1 + 0.7) / CELL); ix++) for (let iz = Math.floor((z0 - 0.7) / CELL); iz <= Math.floor((z1 + 0.7) / CELL); iz++) {
        const k = key(ix, iz); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(c);
      }
    }
  }
  // arena (wave 2, e.g. the Gulag rooms): window.__combat.arena = { contains(x, z), walkable(x, z, r) } counts as outdoor
  // ground for enemies and uses its own walls instead of the level colliders
  const arenaAt = (x, z) => { const A = window.__combat && window.__combat.arena; return A && A.contains(x, z) ? A : null; };
  const outdoorAt = (x, z) => { if (arenaAt(x, z)) return true; const zn = level && level.zoneAt ? level.zoneAt(x, z) : null; return !!zn && OUTDOOR_ZONES.has(zn); };
  function walkable(x, z, r = 0.3, needOutdoor = true) {
    const AR = arenaAt(x, z); if (AR) return AR.walkable(x, z, r);
    if (!grid || gridN !== ((level && level.colliders) || []).length) buildGrid();
    if (needOutdoor && !outdoorAt(x, z)) return false;
    const a = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))); if (!a) return true;
    for (const c of a) {
      if (c.type === 'box') { if (x > c.min[0] - r && x < c.max[0] + r && z > c.min[1] - r && z < c.max[1] + r) return false; }
      else if ((x - c.c[0]) ** 2 + (z - c.c[1]) ** 2 < (c.r + r) ** 2) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- preload: pools
  async function preload() {
    try { ZM = await loadZombieModel(); } catch (e) { ZM = null; }
    for (let i = 0; i < ZPOOL; i++) { let r; try { r = ZM ? makeZombieRig(ZM) : fallbackRig(); } catch (e) { r = fallbackRig(); } r.root.visible = false; r.root.name = 'combat-zombie'; scene.add(r.root); zpool.push(r); }
    try {
      bossRig = ZM ? makeZombieRig(ZM) : fallbackRig(); bossRig.root.name = 'combat-boss';
      const inner = bossRig.root.children[0]; inner.scale.setScalar((ZM ? ZM.scale : 1) * 1.38);
      // hi-vis tint: own materials
      bossRig.root.traverse(o => { if (o.isMesh && o.material) { o.material = o.material.clone(); if (o.material.color) o.material.color.lerp(new THREE.Color('#d8ff30'), 0.3); } });
      bossRig.root.visible = false; scene.add(bossRig.root);
      bossCap = capMesh(); bossCap.visible = false; bossCap.name = 'combat-bosscap'; scene.add(bossCap);
      bossRig.head = null; bossRig.root.traverse(o => { if (!bossRig.head && o.isBone && /^(mixamorig:?)?head$|^head$/i.test(o.name)) bossRig.head = o; });
      if (!bossRig.head) bossRig.root.traverse(o => { if (!bossRig.head && o.isBone && /head/i.test(o.name) && !/end|top/i.test(o.name)) bossRig.head = o; });
    } catch (e) { console.warn('boss rig', e); }
    const pmats = new Map();
    try { pigeonProto = await loadOptional('pigeon'); } catch (e) { pigeonProto = null; }
    const mutant = m0 => { if (!pmats.has(m0)) { const m = m0.clone(); if (m.color) m.color.lerp(new THREE.Color('#7a3cff'), 0.35); if ('emissive' in m) { m.emissive = new THREE.Color('#3a0a50'); m.emissiveIntensity = 0.6; } pmats.set(m0, m); } return pmats.get(m0); };
    const eyeGeo = new THREE.SphereGeometry(0.03, 8, 6), eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2030, toneMapped: false });
    for (let i = 0; i < PPOOL; i++) {
      const root = new THREE.Group(), body = new THREE.Group(); root.add(body); root.name = 'combat-pigeon';
      if (pigeonProto) { const m = skClone(pigeonProto); m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.scale.set(1.7, 1.7, 1.7); m.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; o.material = Array.isArray(o.material) ? o.material.map(mutant) : mutant(o.material); } }); body.add(m); } // skinned glb: SkeletonUtils clone of the original
      else { const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshStandardMaterial({ color: 0x6a6a90 })); m.scale.set(1, 0.8, 1.4); m.position.y = 0.15; body.add(m); }
      for (const s of [-1, 1]) { const e = new THREE.Mesh(eyeGeo, eyeMat); e.position.set(s * 0.05, 0.42, 0.2); body.add(e); }
      root.visible = false; scene.add(root); ppool.push({ root, body, busy: false });
    }
    ready = true;
  }

  // ---------------------------------------------------------------- spawning
  const take = pool => { const r = pool.find(x => !x.busy); if (r) r.busy = true; return r || null; };
  function newEnemy(type, pos, L, o = {}) {
    let rig = null, obj = null;
    if (type === 'zombie') { rig = take(zpool); if (!rig) return null; }
    else if (type === 'boss') { if (!bossRig || bossRig.busy) return null; bossRig.busy = true; rig = bossRig; }
    else if (type === 'pigeon') { obj = take(ppool); if (!obj) return null; }
    const e = {
      id: nid++, type, alive: true, dead: false, level: L, pos: pos.clone(), vel: V(), yaw: o.yaw ?? Math.random() * 6.28, state: 'rise', t: 0, cool: rnd(0.3, 1), rig, obj,
      rootY: 0, sc: type === 'boss' ? 1.38 : 1, mass: type === 'boss' ? 4 : type === 'pigeon' ? 0.5 : 1, slowT: 0, hitT: -9, stagT: 0, rise: type === 'pigeon' ? 1 : 0,
      wanderT: 0, wtarget: pos.clone(), lostT: 0, throwT: 3, deathT: 0, tumble: 0, tAxis: V(1, 0, 0), side: Math.random() < 0.5 ? 1 : -1,
      remote: o.remote || 0, gid: o.gid || 0, net: null,
    };
    const k = 1 + 0.28 * (L - 1);
    if (type === 'zombie') { e.max = Math.round(60 * k); e.dmg = 10 * (1 + 0.12 * (L - 1)); e.speed = 1.95 + Math.min(0.6, 0.06 * L); }
    if (type === 'boss') { e.max = Math.round(650 * (1 + 0.25 * (L - 1))); e.dmg = 22 * (1 + 0.1 * (L - 1)); e.speed = 1.45; e.name = 'Il Vigile Urbano Zombie'; }
    if (type === 'pigeon') { e.max = Math.round(18 * (1 + 0.2 * (L - 1))); e.dmg = 5 * (1 + 0.1 * (L - 1)); e.speed = 7; e.alt = rnd(5.5, 8); e.ang = Math.random() * 6.28; e.rad = rnd(4.5, 7); e.state = 'circle'; e.pos.y = e.alt + 4; }
    e.hp = e.max;
    if (o.max > 0) { e.max = o.max; e.hp = Math.min(o.max, o.hp ?? o.max); } // puppet / adopted: the owner's numbers
    if (rig) { rig.root.visible = true; rig.root.position.copy(e.pos); rig.root.position.y = -1.8; rig.root.rotation.set(0, e.yaw, 0); rig.play('idle', 0); }
    if (obj) { obj.root.visible = true; obj.root.position.copy(e.pos); }
    if (type === 'boss' && bossCap) bossCap.visible = true;
    list.push(e);
    if (type !== 'pigeon' && !o.quiet) { fx.burst(V(e.pos.x, 0.1, e.pos.z), '#6a4a2a', 6, { size: 0.5, speed: 1.2, life: 0.9, up: 0.6 }); if (type === 'boss') fx.bossEntrance(e.pos); else fx.zombieSpawn(e.pos, { dur: 1.1 }); } // particles.js: earth bursting, cracks (boss: + police lights)
    if (!e.remote) C.emit('spawn', { type, id: e.id, level: L, pos: e.pos.clone() });
    return e;
  }
  function release(e) {
    if (!e.alive) return;
    e.alive = false; if (C.sync) C.sync.released(e);
    if (e.rig) { e.rig.busy = false; e.rig.root.visible = false; e.rig.root.rotation.set(0, 0, 0); if (e.type === 'boss' && bossCap) bossCap.visible = false; }
    if (e.obj) { e.obj.busy = false; e.obj.root.visible = false; e.obj.root.rotation.set(0, 0, 0); }
    const i = list.indexOf(e); if (i >= 0) list.splice(i, 1);
  }
  function levelFor(zone, night) {
    const base = AREA_LV[zone] || 1, R = window.__rpg;
    const pl = R && (typeof R.level === 'function' ? R.level() : R.level);
    if (pl > 0) return Math.max(1, Math.round(pl + base - 2 + rnd(-1, 1.2)));
    return base + (night > 0.5 ? 1 : 0) + (Math.random() < 0.3 ? 1 : 0);
  }
  const _cf = V(), _cp = V(), _d = V();
  function inView(x, y, z) {
    const cam = C.camera; cam.getWorldDirection(_cf); cam.getWorldPosition(_cp);
    _d.set(x - _cp.x, y - _cp.y, z - _cp.z); const L = _d.length(); if (L > 48) return false; return _d.dot(_cf) / L > 0.5;
  }
  function findSpawn(P, zone, rMin = 18, rMax = 30) {
    const A = (level && level.anchors) || {};
    const edges = zone === 'Teletubbylandia' ? [1, 2, 3, 4].map(i => A['zombie_spawn_' + i]).filter(a => a && a.isVector3 && Math.hypot(a.x - P.x, a.z - P.z) < 40) : [];
    for (let k = 0; k < 36; k++) {
      let x, z;
      if (edges.length && k < 10) { const e = edges[k % edges.length]; x = e.x + rnd(-3, 3); z = e.z + rnd(-3, 3); }
      else { const a = Math.random() * 6.28, r = rnd(rMin, rMax); x = P.x + Math.cos(a) * r; z = P.z + Math.sin(a) * r; }
      if (Math.hypot(x - P.x, z - P.z) < 11) continue;
      if (!walkable(x, z, 0.45)) continue;
      if (k < 28 && inView(x, 1, z)) continue;
      return V(x, 0, z);
    }
    return null;
  }
  function spawn(type, pos, opts = {}) { // public: spawnEnemy(type, pos, {level})
    if (!ready) return null;
    const zone = level.zoneAt ? level.zoneAt(pos.x, pos.z) : null;
    if (opts.quest && !mayWalk(type, C.night()) && !arenaAt(pos.x, pos.z)) type = 'pigeon'; // quests by day: no zombies in the sun
    const e = newEnemy(type, pos, opts.level || levelFor(zone, C.night()), opts);
    if (e && opts.aggro !== false) { e.state = type === 'pigeon' ? 'circle' : 'rise'; e.aggro = true; }
    if (e && type === 'boss' && C.sync) C.sync.bossSpawned(e);
    return e;
  }
  function spawnFlock(P, n, L) {
    const a = Math.random() * 6.28; const c = V(P.x + Math.cos(a) * 20, 0, P.z + Math.sin(a) * 20);
    for (let i = 0; i < n; i++) { const e = newEnemy('pigeon', c, L); if (!e) break; e.pos.set(c.x + rnd(-2, 2), rnd(9, 12), c.z + rnd(-2, 2)); e.ang = a + Math.PI + i * 0.9; }
    C.fxSfx('coo', c, 0.8);
  }

  // ---------------------------------------------------------------- hits
  const _o = V();
  // ray vs enemies: returns {t, e, head} or null
  function ray(o, d, maxT) {
    let best = null, bt = maxT;
    for (const e of list) {
      if (!e.alive || e.dead || (e.rise < 0.6)) continue;
      if (e.type === 'pigeon') { const t = raySphere(o, d, e.pos.x, e.pos.y + 0.12, e.pos.z, 0.34, bt); if (t >= 0) { bt = t; best = { t, e, head: false }; } continue; }
      const s = e.sc, f = Math.sin(e.yaw), g = Math.cos(e.yaw);
      const th = raySphere(o, d, e.pos.x + f * 0.05 * s, e.rootY + 1.6 * s, e.pos.z + g * 0.05 * s, 0.17 * s, bt);
      if (th >= 0) { bt = th; best = { t: th, e, head: true }; }
      const tb = rayCyl(o, d, e.pos.x, e.pos.z, 0.3 * s, e.rootY + 0.1, e.rootY + 1.48 * s, bt);
      if (tb >= 0 && tb < bt) { bt = tb; best = { t: tb, e, head: false }; }
    }
    return best;
  }
  function near(p, R) { const out = []; for (const e of list) { if (!e.alive || e.dead) continue; const cy = e.type === 'pigeon' ? e.pos.y : e.rootY + 0.9 * e.sc; const d = Math.hypot(e.pos.x - p.x, cy - p.y, e.pos.z - p.z); if (d < R + 0.3 * e.sc) out.push({ e, d }); } return out; }
  function damage(e, amount, o = {}) {
    if (!e || !e.alive || e.dead) return 0;
    amount = Math.max(1, amount);
    if (e.remote && C.sync) { // puppet: the owner applies it; here only the number and a predicted bar
      C.sync.hit(e, amount, o); e.hitT = performance.now() / 1000; e.hp = Math.max(1, e.hp - amount);
      hud.num(o.point || (e.type === 'pigeon' ? e.pos : V(e.pos.x, e.rootY + (o.head ? 1.75 : 1.3) * e.sc, e.pos.z)), amount, { crit: o.head || o.crit, color: o.color });
      return amount;
    }
    if (C.sync) (e.hitBy || (e.hitBy = new Map())).set(o.by || 0, performance.now()); // kill credit / assists (0 = me)
    e.hp -= amount; e.hitT = performance.now() / 1000;
    if (o.dir && o.knock) { const k = o.knock / e.mass; e.vel.x += o.dir.x * k; e.vel.z += o.dir.z * k; if (e.type === 'pigeon') e.vel.y += Math.max(0, o.dir.y) * k; }
    if (o.slow) e.slowT = Math.max(e.slowT, o.slow);
    if (e.type === 'zombie' && (o.knock || 0) > 2.2) e.stagT = 0.35;
    if (e.state !== 'chase' && e.type !== 'pigeon' && e.state !== 'rise') e.state = 'chase';
    e.aggro = true;
    const hp = e.type === 'pigeon' ? e.pos : V(e.pos.x, e.rootY + (o.head ? 1.75 : 1.3) * e.sc, e.pos.z);
    if (!o.by) hud.num(o.point || hp, amount, { crit: o.head || o.crit, color: o.color }); // remote hits: the shooter shows it
    if (e.hp <= 0) { kill(e, o); return amount; }
    if (e.type === 'boss' && Math.random() < 0.15) C.fxSfx('whistle', e.pos, 0.6);
    return amount;
  }
  function kill(e, o) {
    e.dead = true; e.deathT = 0; e.state = 'dead'; e.hp = 0;
    const dir = o.dir ? V(o.dir.x, 0, o.dir.z) : V(Math.sin(e.yaw + Math.PI), 0, Math.cos(e.yaw + Math.PI)); if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1); dir.normalize();
    e.tAxis.set(dir.z, 0, -dir.x); e.vel.addScaledVector(dir, 1.5 + (o.knock || 0) * 0.35 / e.mass);
    if (e.rig) e.rig.play(e.rig.has('fall') ? 'fall' : 'idle', 0.12);
    if (e.type === 'pigeon') { e.vel.y = 2; C.fxSfx('squawk', e.pos, 1); fx.burst(e.pos, '#d8d8e8', 6, { size: 0.18, speed: 2, life: 0.9, grav: 1.5 }); fx.feathers(e.pos, 12); }
    else C.fxSfx('zdie', e.pos, 1);
    if (C.sync) C.sync.died(e, o); // online: may set o.noCredit (a remote player landed the last hit: credit goes to him)
    if (!o.noCredit) C.onKill(e, o);
  }

  // ---------------------------------------------------------------- per frame
  const _t = V(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), UP = V(0, 1, 0);
  const hurt = (T, e, n, k) => (T && T.id ? C.sync.hurt(T.id, n, e, k) : C.hitPlayer(n, e, k)); // T.id: a remote player (online)
  function update(dt, ctx) {
    if (!ready) return;
    const P = man.root.position, zone = level.zoneAt ? level.zoneAt(P.x, P.z) : null, outdoor = (!!zone && OUTDOOR_ZONES.has(zone)) || !!arenaAt(P.x, P.z);
    const night = C.night(), attackable = ctx.attackable && outdoor;
    // ---------- director
    if (ctx.spawning && outdoor) {
      st.outT = 0;
      const zOK = mayWalk('zombie', night), arena = !!arenaAt(P.x, P.z);
      const cap = Math.max(1, Math.round((CAPS[currentQuality()] || 6) * (zOK ? 1 : 0.55)));
      const alive = list.filter(e => !e.dead).length;
      st.spawnT -= dt; st.flockT -= dt;
      if (st.spawnT <= 0 && alive < cap) {
        st.spawnT = zOK ? rnd(1.2, 2.2) : rnd(2.4, 4);
        const L = levelFor(zone, night);
        if (st.flockT <= 0 && cap - alive >= 3 && !list.some(e => e.type === 'pigeon')) { st.flockT = zOK ? rnd(35, 70) : rnd(22, 45); spawnFlock(P, Math.min(4, cap - alive), L); }
        else if (zOK || arena) { const sp = findSpawn(P, zone); if (sp) newEnemy('zombie', sp, L, { yaw: Math.atan2(P.x - sp.x, P.z - sp.z) }); }
      }
      // dusk build-up: the first groans out of sight before they may come out
      if (!zOK && night > 0.2 && !arena) { st.duskT = (st.duskT ?? 2) - dt; if (st.duskT <= 0) { st.duskT = rnd(5, 10); const a = Math.random() * 6.28; C.fxSfx('groan', V(P.x + Math.cos(a) * 16, 0, P.z + Math.sin(a) * 16), 0.9); } }
      // boss in Via Petroni
      st.bossCool = Math.max(0, st.bossCool - dt);
      if (zone === 'Via Petroni') st.petroniT += dt; else st.petroniT = Math.max(0, st.petroniT - dt * 0.5);
      if (st.petroniT > 25 && st.bossCool <= 0 && bossRig && !bossRig.busy && mayWalk('boss', night) && !(C.sync && C.sync.bossTaken())) {
        st.bossCool = 12; // retry soon if the dice say no
        if (Math.random() < 0.5) {
          const far = P.z < 56 ? V(44, 0, 75.5) : V(44, 0, 37);
          if (walkable(far.x, far.z, 0.6)) { const b = newEnemy('boss', far, levelFor(zone, night) + 2, { yaw: Math.atan2(P.x - far.x, P.z - far.z) }); if (b) { st.bossCool = 240; C.onBoss(b); if (C.sync) C.sync.bossSpawned(b); } }
        }
      }
    } else if (!outdoor) st.outT += dt;
    // ---------- enemies
    const now = performance.now() / 1000;
    let nearest = 1e9;
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i]; e.t += dt;
      const dm = Math.hypot(P.x - e.pos.x, P.z - e.pos.z); // from me: despawn range
      if (!e.dead && (dm > 62 || (st.outT > 25 && dm > 14))) { if (!e.remote && C.sync) C.sync.handoff(e); release(e); continue; } // online: a player near it takes it over
      if (e.remote && !e.dead) { puppet(e, dt); continue; }
      // online: owned enemies go for the nearest player (T.id = remote player id, null = me)
      const T = C.sync ? C.sync.target(e, P, attackable) : null, tp = T ? T.pos : P, att = T ? T.attackable : attackable;
      const dx = tp.x - e.pos.x, dz = tp.z - e.pos.z, d = Math.hypot(dx, dz);
      if (e.type === 'pigeon') { updPigeon(e, dt, tp, d, att, now, T); continue; }
      e.rootY = 0;
      if (e.dead) {
        e.deathT += dt; e.vel.multiplyScalar(Math.exp(-dt * 3)); step(e, dt, true);
        e.tumble = Math.min(1.25, e.tumble + dt * 2.6);
        if (e.deathT > 1.35 && !e.poofed) { e.poofed = true; const c = V(e.pos.x, 0.7 * e.sc, e.pos.z); fx.burst(c, '#f4f0ff', 8, { size: 0.65 * e.sc, speed: 1.6, life: 0.8, up: 0.8 }); fx.poof(c, e.sc); fx.stars(c.add(V(0, 0.4, 0)), 6); C.fxSfx('poof', e.pos, 1); }
        if (e.deathT > 1.45) { release(e); continue; }
        poseRig(e, dt); continue;
      }
      if (e.state === 'dawn' || (!mayWalk(e.type, night) && !arenaAt(e.pos.x, e.pos.z))) { if (dawnStep(e, dt, true)) continue; poseRig(e, dt); continue; }
      if (e.state === 'rise') { e.rise = Math.min(1, e.rise + dt / 1.1); if (e.rise >= 1) e.state = e.aggro || (att && d < 22) ? 'chase' : 'wander'; if (Math.random() < dt * 6) fx.puff(V(e.pos.x + rnd(-0.3, 0.3), 0.05, e.pos.z + rnd(-0.3, 0.3)), '#6a4a2a', { size: 0.35, speed: 0.6, life: 0.7 }); poseRig(e, dt); continue; }
      e.slowT = Math.max(0, e.slowT - dt); e.stagT = Math.max(0, e.stagT - dt); e.cool = Math.max(0, e.cool - dt);
      const notice = night > 0.5 ? 22 : 18;
      if (att && (d < notice || (e.aggro && d < 34))) { if (e.state === 'wander' || e.state === 'idle') { e.state = 'chase'; if (Math.random() < 0.5) C.fxSfx('groan', e.pos, 0.9); } e.lostT = 0; }
      else if (e.state === 'chase' || e.state === 'attack') { e.lostT += dt; if (e.lostT > (att ? 4 : 1.5)) { e.state = 'wander'; e.aggro = false; e.wanderT = 0; } }
      if (!e.dead && e.state !== 'wander') nearest = Math.min(nearest, dm);
      const slowK = e.slowT > 0 ? 0.5 : 1;
      let want = 0, tyaw = e.yaw;
      if (e.state === 'chase') {
        tyaw = Math.atan2(dx, dz);
        const reach = (e.type === 'boss' ? 1.9 : 1.15) + (C.personal && !(T && T.id) ? C.personal() - 0.55 : 0);
        if (d < reach && e.cool <= 0 && att) { e.state = 'attack'; e.t = 0; e.hitDone = false; e.rig.play(e.rig.has('attack') ? 'attack' : 'idle', 0.1); }
        else if (d > reach * 0.8) want = e.speed * slowK * (e.type === 'boss' ? 1 : (d > 6 ? 1 : 0.8));
        // the boss throws "multe" from mid range
        if (e.type === 'boss') { e.throwT -= dt; if (e.throwT <= 0 && d > 4 && d < 16 && att) { e.throwT = rnd(2.8, 4.2); C.bossThrow(e, T ? T.pos : null); e.rig.play(e.rig.has('attack') ? 'attack' : 'idle', 0.1); e.state = 'attack'; e.t = 0.5; e.hitDone = true; } }
      } else if (e.state === 'attack') {
        tyaw = Math.atan2(dx, dz);
        if (!e.hitDone && e.t > 0.45) { e.hitDone = true; if (d < (e.type === 'boss' ? 2.4 : 1.6) && att) hurt(T, e, e.dmg, e.type === 'boss' ? 7 : 2.2); }
        if (e.t > 1.05) { e.state = 'chase'; e.cool = e.type === 'boss' ? 1.2 : rnd(0.6, 1.1); }
      } else { // wander
        e.wanderT -= dt;
        if (e.wanderT <= 0) { e.wanderT = rnd(3, 7); for (let k = 0; k < 6; k++) { const a = Math.random() * 6.28, r = rnd(2, 7), x = e.pos.x + Math.cos(a) * r, z = e.pos.z + Math.sin(a) * r; if (walkable(x, z, 0.4)) { e.wtarget.set(x, 0, z); break; } } }
        const wx = e.wtarget.x - e.pos.x, wz = e.wtarget.z - e.pos.z; if (Math.hypot(wx, wz) > 0.4) { tyaw = Math.atan2(wx, wz); want = 0.75 * slowK; }
      }
      if (e.stagT > 0) want = 0;
      e.yaw += wrapA(tyaw - e.yaw) * Math.min(1, dt * (e.state === 'attack' ? 6 : 3.2));
      // walk around obstacles (nightz.js approach): keep a preferred side while blocked
      if (want > 0) {
        const sp = want * dt; let moved = false;
        for (const off of [0, e.side * 0.6, e.side * 1.2, e.side * 1.8, -e.side * 0.6, -e.side * 1.2]) {
          const a = e.yaw + off, nx = e.pos.x + Math.sin(a) * sp, nz = e.pos.z + Math.cos(a) * sp;
          if (walkable(nx, nz, 0.3 * e.sc)) { e.pos.x = nx; e.pos.z = nz; moved = true; if (off && Math.sign(off) === -e.side) e.side = -e.side; break; }
        }
        if (!moved) e.side = -e.side;
        e.moving = moved ? want : 0;
      } else e.moving = 0;
      step(e, dt, false);
      // no overlap: other enemies + the player
      for (const o of list) if (o !== e && !o.dead && o.type !== 'pigeon') { const ox = e.pos.x - o.pos.x, oz = e.pos.z - o.pos.z, od = Math.hypot(ox, oz), m = 0.32 * (e.sc + o.sc); if (od < m && od > 1e-3) { e.pos.x += ox / od * (m - od) * 0.5; e.pos.z += oz / od * (m - od) * 0.5; } }
      const ps = (T && T.id ? 0.55 : C.personal ? C.personal() : 0.55) * e.sc; // first person: more room, the camera must not end up inside a head
      if (d < ps && d > 1e-3) { e.pos.x -= dx / d * (ps - d); e.pos.z -= dz / d * (ps - d); }
      poseRig(e, dt);
    }
    st.groanT -= dt; if (st.groanT <= 0) { st.groanT = rnd(2.5, 5); const z = list.find(e => !e.dead && e.type === 'zombie' && Math.random() < 0.5); if (z) C.fxSfx('groan', z.pos, 0.7); }
    return { nearest };
  }
  // knockback integration with walls
  function step(e, dt, dead) {
    if (e.vel.lengthSq() < 1e-4) return;
    const nx = e.pos.x + e.vel.x * dt, nz = e.pos.z + e.vel.z * dt;
    if (walkable(nx, nz, 0.25, !dead)) { e.pos.x = nx; e.pos.z = nz; } else { e.vel.x *= -0.3; e.vel.z *= -0.3; }
    e.vel.x *= Math.exp(-dt * 5); e.vel.z *= Math.exp(-dt * 5);
  }
  function poseRig(e, dt) {
    const r = e.rig; if (!r) return;
    const yOff = e.state === 'rise' ? -(1 - e.rise) * 1.8 : (e.sinkY || 0);
    r.root.position.set(e.pos.x, yOff, e.pos.z);
    if (e.dead) { _q.setFromAxisAngle(UP, e.yaw); _q2.setFromAxisAngle(e.tAxis, e.tumble * 0.55); r.root.quaternion.copy(_q2.multiply(_q)); r.root.position.y = -Math.max(0, e.deathT - 0.9) * 0.8; }
    else r.root.rotation.set(0, e.yaw, 0);
    if (!e.dead && e.dawnT > 0) { r.play('idle', 0.2); r.setRate(2.6); r.root.rotation.set(-0.12, e.yaw + Math.sin(e.dawnT * 19) * 0.22, Math.sin(e.dawnT * 23) * 0.07); } // trembling in the sun
    else if (!e.dead && e.state !== 'attack') {
      if (e.state === 'rise' || !e.moving) { r.play('idle', 0.3); r.setRate(1); }
      else { const run = e.moving > 1.3 && r.has('run'); r.play(run ? 'run' : 'walk', 0.3); r.setRate(clamp(e.moving / (run ? r.speed.run : r.speed.walk), 0.5, 1.7)); }
    }
    // far ones animate at half rate; off-screen ones at ~5 Hz (perf: skincull.js window.__onScreen)
    const far = Math.hypot(e.pos.x - man.root.position.x, e.pos.z - man.root.position.z) > 28;
    _t.set(e.pos.x, 1, e.pos.z); const seen = !window.__onScreen || window.__onScreen(_t, 1.8);
    e.acc = (e.acc || 0) + dt; if ((!far && seen) || e.acc > (seen ? 0.066 : 0.2)) { r.update(e.acc); e.acc = 0; }
    if (e.type === 'boss' && bossCap) {
      if (r.head) { r.root.updateMatrixWorld(true); r.head.getWorldPosition(_t); bossCap.position.copy(_t).add(V(0, 0.14, 0)); }
      else bossCap.position.set(e.pos.x, 2.35 + r.root.position.y, e.pos.z);
      bossCap.rotation.set(e.dead ? e.tumble * 0.8 : -0.12, e.yaw, 0);
    }
  }
  function updPigeon(e, dt, P, d, attackable, now, T) {
    const o = e.obj; if (!o) return;
    if (e.dead) {
      e.deathT += dt; e.vel.y -= 9.8 * dt; e.pos.addScaledVector(e.vel, dt);
      if (e.pos.y <= 0.1) { e.pos.y = 0.1; if (!e.poofed) { e.poofed = true; fx.burst(e.pos, '#ffffff', 8, { size: 0.3, speed: 1.4, life: 0.8 }); fx.feathers(e.pos, 8); fx.stars(e.pos.clone().add(V(0, 0.3, 0)), 3, { size: 0.16 }); C.fxSfx('poof', e.pos, 0.6); } e.vel.set(0, 0, 0); }
      o.root.position.copy(e.pos); o.root.rotation.x += dt * 9; o.root.rotation.z += dt * 5;
      if (e.deathT > 2.2 || (e.poofed && e.deathT > 0.6)) release(e);
      return;
    }
    e.cool = Math.max(0, (e.cool || 0) - dt);
    const head = _t.set(P.x, P.y + 1.55, P.z);
    let goal;
    if (e.state === 'dive' && attackable) {
      goal = head; const dd = e.pos.distanceTo(head);
      if (dd < 0.7) { hurt(T, e, e.dmg, 0.8); e.state = 'climb'; e.t = 0; C.fxSfx('squawk', e.pos, 0.8); }
      if (e.t > 3) { e.state = 'climb'; e.t = 0; }
    } else if (e.state === 'climb') { goal = V(e.pos.x + (e.pos.x - P.x), e.alt + 3, e.pos.z + (e.pos.z - P.z)); if (e.t > 1.4) { e.state = 'circle'; e.t = 0; } }
    else {
      e.state = 'circle'; e.ang += dt * (5.5 / e.rad);
      goal = V(P.x + Math.cos(e.ang) * e.rad, e.alt, P.z + Math.sin(e.ang) * e.rad);
      if (attackable && e.t > 2 && e.cool <= 0 && Math.random() < dt * 0.35) { e.state = 'dive'; e.t = 0; e.cool = rnd(2.5, 5); C.fxSfx('squawk', e.pos, 0.6); }
    }
    const sp = (e.state === 'dive' ? 9 : 6.5) * (e.slowT > 0 ? 0.5 : 1); e.slowT = Math.max(0, e.slowT - dt);
    _d.copy(goal).sub(e.pos); const L = _d.length(); if (L > 0.01) _d.multiplyScalar(sp / L);
    e.vel.lerp(_d, 1 - Math.exp(-dt * (e.state === 'dive' ? 5 : 2.5)));
    e.pos.addScaledVector(e.vel, dt); if (e.pos.y < 0.5) e.pos.y = 0.5;
    o.root.position.copy(e.pos);
    const yaw = Math.atan2(e.vel.x, e.vel.z), pitch = -Math.atan2(e.vel.y, Math.hypot(e.vel.x, e.vel.z) + 1e-3);
    o.root.rotation.set(clamp(pitch, -1, 1), yaw, Math.sin(e.t * 2) * 0.3, 'YXZ');
    o.body.scale.set(1 + Math.sin(e.t * 26) * 0.12, 1 - Math.sin(e.t * 26) * 0.1, 1);
  }
  // online puppet (an enemy simulated by another player, src/worldsync.js writes e.net = {x, z, y, yaw, st, hp, rise, at}):
  // eased toward the latest snapshot, the walk/run clip from the speed it really moves at, the owner's state and HP
  function puppet(e, dt) {
    const n = e.net; if (!n) return;
    const ox = e.pos.x, oz = e.pos.z, oy = e.pos.y, k = 1 - Math.exp(-dt * 9);
    if ((n.x - ox) ** 2 + (n.z - oz) ** 2 > 49) { e.pos.x = n.x; e.pos.z = n.z; } else { e.pos.x += (n.x - ox) * k; e.pos.z += (n.z - oz) * k; }
    if (e.type === 'pigeon') e.pos.y += (n.y - oy) * k;
    const sp = Math.hypot(e.pos.x - ox, e.pos.z - oz) / Math.max(dt, 1e-3);
    e.moving += ((sp > 0.2 ? sp : 0) - (e.moving || 0)) * Math.min(1, dt * 6);
    e.yaw += wrapA(n.yaw - e.yaw) * Math.min(1, dt * 8);
    if (n.st !== e.state) { e.state = n.st; e.t = 0; if (e.state === 'attack' && e.rig) e.rig.play(e.rig.has('attack') ? 'attack' : 'idle', 0.1); }
    if (e.state === 'rise') e.rise = Math.min(1, Math.max(e.rise, n.rise ?? 0) + dt / 1.1); else e.rise = 1;
    if (performance.now() / 1000 - e.hitT > 0.6) e.hp = n.hp; else e.hp = Math.min(e.hp, n.hp); // keep my predicted bar until the owner's HP arrives
    e.rootY = 0;
    if (e.type !== 'pigeon' && !e.dead && !mayWalk(e.type, C.night()) && !arenaAt(e.pos.x, e.pos.z)) dawnStep(e, dt, false);
    if (e.type !== 'pigeon') { poseRig(e, dt); return; }
    const o = e.obj; if (!o) return;
    e.vel.set((e.pos.x - ox) / Math.max(dt, 1e-3), (e.pos.y - oy) / Math.max(dt, 1e-3), (e.pos.z - oz) / Math.max(dt, 1e-3));
    o.root.position.copy(e.pos);
    const pitch = -Math.atan2(e.vel.y, Math.hypot(e.vel.x, e.vel.z) + 1e-3);
    o.root.rotation.set(clamp(pitch, -1, 1), e.yaw, Math.sin(e.t * 2) * 0.3, 'YXZ');
    o.body.scale.set(1 + Math.sin(e.t * 26) * 0.12, 1 - Math.sin(e.t * 26) * 0.1, 1);
  }
  // dawn: hands over the eyes (trembling idle), smoke and sparks from the head, then down into the ground.
  // own = this client owns it (it releases it at the end); puppets only play the visual. Returns true once released.
  function dawnStep(e, dt, own) {
    if (!(e.dawnT > 0)) {
      e.dawnT = 1e-3; e.state = own ? 'dawn' : e.state; e.aggro = false; e.moving = 0; e.vel.set(0, 0, 0);
      if (Math.random() < 0.7) hud.num(V(e.pos.x, 2.15 * e.sc, e.pos.z), 0, { text: DAWN_LINES[(Math.random() * DAWN_LINES.length) | 0], color: '#ffd25a' });
      C.fxSfx('zdie', e.pos, 0.8);
    }
    e.dawnT += dt;
    const head = V(e.pos.x, (e.sinkY || 0) + 1.7 * e.sc, e.pos.z);
    if (Math.random() < dt * 9) fx.puff(head.clone().add(V(rnd(-0.15, 0.15), 0, rnd(-0.15, 0.15))), '#d9d2c6', { size: 0.4, speed: 0.7, life: 0.9, up: 0.9 });
    if (e.dawnT < 1.2 && Math.random() < dt * 5) fx.stars(head, 1, { size: 0.12 });
    const sk = Math.max(0, Math.min(1, (e.dawnT - 0.9) / 1.3)); e.sinkY = -sk * sk * 2.1 * e.sc;
    if (e.dawnT > 0.9 && Math.random() < dt * 6) fx.puff(V(e.pos.x + rnd(-0.35, 0.35), 0.05, e.pos.z + rnd(-0.35, 0.35)), '#6a4a2a', { size: 0.4, speed: 0.6, life: 0.7 });
    if (own && e.dawnT > 2.3) { fx.burst(V(e.pos.x, 0.1, e.pos.z), '#6a4a2a', 8, { size: 0.5, speed: 1.2, life: 0.9, up: 0.6 }); C.fxSfx('poof', e.pos, 0.6); release(e); return true; }
    return false;
  }
  function clearAll() { for (const e of list.slice()) release(e); }
  function bars(now) {
    const out = [];
    for (const e of list) { if (e.dead || e.type === 'boss' || now - e.hitT > 3.5) continue; out.push({ pos: e.type === 'pigeon' ? V(e.pos.x, e.pos.y + 0.5, e.pos.z) : V(e.pos.x, (e.rootY || 0) + 2.05 * e.sc, e.pos.z), k: e.hp / e.max, level: e.level, a: Math.min(1, (3.5 - (now - e.hitT)) * 2) }); if (out.length >= 10) break; }
    return out;
  }
  return { preload, update, spawn, ray, near, damage, list, clearAll, bars, walkable, outdoorAt, get ready() { return ready; }, get model() { return !!ZM; }, st,
    ctx: C, _int: { newEnemy, release, kill, levelFor } }; // ctx.sync / _int: src/worldsync.js
}

// ---------------------------------------------------------------- ray helpers (also used by the core)
export function raySphere(o, d, cx, cy, cz, r, maxT) {
  const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz, b = ox * d.x + oy * d.y + oz * d.z, c = ox * ox + oy * oy + oz * oz - r * r;
  if (c < 0) return 0; const disc = b * b - c; if (disc < 0) return -1; const t = -b - Math.sqrt(disc); return t >= 0 && t <= maxT ? t : -1;
}
export function rayCyl(o, d, cx, cz, r, y0, y1, maxT) {
  const ox = o.x - cx, oz = o.z - cz, a = d.x * d.x + d.z * d.z, b = 2 * (ox * d.x + oz * d.z), c = ox * ox + oz * oz - r * r;
  if (c < 0) { return o.y >= y0 && o.y <= y1 ? 0 : -1; }
  if (a < 1e-8) return -1; const disc = b * b - 4 * a * c; if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a); if (t < 0 || t > maxT) return -1; const y = o.y + d.y * t; return y >= y0 && y <= y1 ? t : -1;
}
