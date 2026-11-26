// rpg/worldloot.js — loot in the open world: pooled drops (weapons, gadgets, food, euro, ammo, quest items) with
// rarity-coloured light beams, loot crates (cassette della frutta, frigo abbandonato, bauletto della Vespa) with respawn
// timers, the "Banco dei pegni" stall in Via Petroni. Everything is built at start-up (InstancedMeshes with a hidden
// instance until the gfx warm-up is done, then drawn only when used), no lights, no per-frame allocations.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rarityOf, BASES } from './data.js';
import { PITCH } from '../quartiere/layout.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const FAR = V(1e5, 0, 1e5);
const AMMO_COL = { acqua: '#41b8ff', tortellini: '#ffd27a', freccette: '#ff6a3d', spritz: '#ff7b1c' };
const CRATE = {
  cassetta: { name: 'la cassetta della frutta', h: 0.42, r: 0.45, respawn: 180, beam: '#9fe870' },
  frigo: { name: 'il frigo abbandonato', h: 1.45, r: 0.55, respawn: 300, beam: '#6fc4ff' },
  bauletto: { name: 'il bauletto della Vespa', h: 0.5, r: 0.4, respawn: 420, beam: '#ffb52e' },
};
// [type, x, z] — nudged onto walkable ground at start-up (level.isWalkable), skipped if nothing free nearby
const CRATES = [
  ['cassetta', -3.4, 18.4], ['bauletto', 15.0, 16.2],
  ['cassetta', -24, 21.3], ['frigo', 27.5, 21.0], ['bauletto', -14, 32.8], ['cassetta', 34, 32.6], ['cassetta', 2, 21.3],
  ['cassetta', 48.8, 31.6], ['frigo', 49, 21.4],
  ['bauletto', 46.9, 66], ['cassetta', 41.1, 72.5], ['frigo', 41.1, 43],
  ['frigo', -37.6, 31.8], ['cassetta', -44.4, 21.6],
  ['frigo', -82, 40], ['cassetta', -60, 14], ['bauletto', -88, 22], ['cassetta', -56, 48.5], ['bauletto', -66, 30.5], ['cassetta', -92, 46],
];

// ---------------------------------------------------------------- pooled instanced meshes
class Pool {
  constructor(geo, mat, cap, parent, name) {
    this.mesh = new THREE.InstancedMesh(geo, mat, cap); this.mesh.name = name; this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.cap = cap; this.used = new Uint8Array(cap); this.top = 0; this.warm = true;
    const c = new THREE.Color(1, 1, 1); for (let i = 0; i < cap; i++) this.mesh.setColorAt(i, c);
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0).setPosition(0, -500, 0);
    for (let i = 0; i < cap; i++) this.mesh.setMatrixAt(i, this.zero);
    this.mesh.count = 1; // warm-up: one hidden instance so the program compiles with everything else
    parent.add(this.mesh);
  }
  alloc() { for (let i = 0; i < this.cap; i++) if (!this.used[i]) { this.used[i] = 1; if (i + 1 > this.top) this.top = i + 1; this.sync(); return i; } return -1; }
  free(i) { if (i < 0 || !this.used[i]) return; this.used[i] = 0; this.mesh.setMatrixAt(i, this.zero); this.mesh.instanceMatrix.needsUpdate = true; while (this.top > 0 && !this.used[this.top - 1]) this.top--; this.sync(); }
  sync() { this.mesh.count = this.warm ? Math.max(1, this.top) : this.top; this.mesh.visible = this.mesh.count > 0; } // empty pools: no draw call (an InstancedMesh with count 0 still costs one)
  color(i, c) { this.mesh.setColorAt(i, c); this.mesh.instanceColor.needsUpdate = true; }
  set(i, m) { this.mesh.setMatrixAt(i, m); this.mesh.instanceMatrix.needsUpdate = true; }
}

function geoms() {
  const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const cyl = (rt, rb, h, seg, x = 0, y = 0, z = 0, rz = 0, rx = 0) => { const g = new THREE.CylinderGeometry(rt, rb, h, seg); if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz); return g.translate(x, y, z); };
  const strip = g => { g.deleteAttribute('uv'); return g; };
  const M = list => mergeGeometries(list.map(strip));
  const PI = Math.PI;
  return {
    pistola: M([box(0.3, 0.09, 0.07), box(0.07, 0.13, 0.06, -0.08, -0.09, 0), cyl(0.05, 0.05, 0.12, 10, 0.03, 0.09, 0), cyl(0.015, 0.015, 0.1, 6, 0.19, 0.01, 0, PI / 2)]),
    tortellini: M([new THREE.TorusGeometry(0.085, 0.048, 8, 16, PI * 1.6).rotateZ(PI * 0.7), new THREE.SphereGeometry(0.055, 10, 8).translate(0, 0.02, 0)]),
    nerf: M([box(0.42, 0.07, 0.07), box(0.08, 0.14, 0.06, -0.12, -0.09, 0), cyl(0.03, 0.03, 0.2, 8, 0.24, 0.02, 0, PI / 2), box(0.1, 0.05, 0.05, 0.02, 0.06, 0)]),
    spritz: M([cyl(0.06, 0.06, 0.55, 12, 0, 0, 0, PI / 2), cyl(0.001, 0.075, 0.12, 12, 0.33, 0, 0, -PI / 2), box(0.06, 0.12, 0.05, -0.05, -0.1, 0)]),
    ombrello: M([cyl(0.012, 0.012, 0.72, 6), cyl(0.012, 0.075, 0.4, 10, 0, 0.12, 0), new THREE.TorusGeometry(0.05, 0.012, 6, 10, PI).rotateZ(PI).translate(0.05, -0.36, 0)]),
    gadget: new THREE.OctahedronGeometry(0.12, 0),
    consumable: M([box(0.18, 0.11, 0.12), box(0.19, 0.02, 0.13, 0, 0.06, 0)]),
    money: cyl(0.075, 0.075, 0.022, 16, 0, 0, 0, 0, PI / 2),
    ammo: M([box(0.17, 0.1, 0.11), box(0.12, 0.03, 0.06, 0, 0.065, 0)]),
    quest: new THREE.IcosahedronGeometry(0.14, 0),
  };
}

function plankTex() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64; const x = c.getContext('2d');
  x.fillStyle = '#3a2614'; x.fillRect(0, 0, 128, 64);
  for (let i = 0; i < 4; i++) { const y = 2 + i * 16; x.fillStyle = ['#b98a55', '#c79a62', '#a97b48', '#bf9159'][i]; x.fillRect(0, y, 128, 12); x.fillStyle = 'rgba(0,0,0,.12)'; for (let k = 0; k < 7; k++) x.fillRect(Math.random() * 128, y + Math.random() * 10, 20 + Math.random() * 30, 1); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function signTex(lines, w = 512, h = 160) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#2a1640'); g.addColorStop(1, '#130a20'); x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.strokeStyle = '#ffb52e'; x.lineWidth = 8; x.strokeRect(6, 6, w - 12, h - 12);
  x.textAlign = 'center'; x.fillStyle = '#ffd36b'; x.font = '900 62px Impact, "Arial Black", sans-serif'; x.fillText(lines[0], w / 2, 78);
  x.fillStyle = '#f3e9ff'; x.font = '700 30px system-ui, sans-serif'; x.fillText(lines[1], w / 2, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export function createWorldLoot({ scene, level, hooks }) {
  const root = new THREE.Group(); root.name = 'rpg-loot'; scene.add(root);
  const G = geoms();
  const itemMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.38, metalness: 0.15, emissive: 0x1c1c1c });
  const P = {};
  for (const k of ['pistola', 'tortellini', 'nerf', 'spritz', 'ombrello', 'gadget', 'consumable']) P[k] = new Pool(G[k], itemMat, 10, root, 'loot-' + k);
  P.money = new Pool(G.money, itemMat, 24, root, 'loot-money');
  P.ammo = new Pool(G.ammo, itemMat, 16, root, 'loot-ammo');
  P.quest = new Pool(G.quest, itemMat, 4, root, 'loot-quest');
  const beamGeo = new THREE.CylinderGeometry(0.035, 0.17, 1, 12, 1, true).translate(0, 0.5, 0);
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying float vY; varying vec3 vC; varying float vPh;
      void main(){ vY = uv.y;
        #ifdef USE_INSTANCING_COLOR
        vC = instanceColor;
        #else
        vC = vec3(1.0);
        #endif
        vPh = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 1.3;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uTime; varying float vY; varying vec3 vC; varying float vPh;
      // vY is clamped: with MSAA the interpolated uv can fall just outside 0..1 at the edges, and pow() of a negative
      // number is NaN; NaN in the float buffers gets smeared by the bloom into big black areas on screen
      void main(){ float y = clamp(vY, 0.0, 1.0); float a = pow(max(1.0 - y, 0.0), 1.7) * (0.5 + 0.22 * sin(uTime * 3.0 + vPh + y * 7.0)) * smoothstep(0.0, 0.05, y);
        gl_FragColor = vec4(vC * 1.7, clamp(a, 0.0, 1.0)); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
  });
  P.beam = new Pool(beamGeo, beamMat, 64, root, 'loot-beams'); P.beam.mesh.renderOrder = 5;

  // ---------------------------------------------------------------- crates
  const wood = new THREE.MeshStandardMaterial({ map: plankTex(), roughness: 0.85 });
  const fruitMat = new THREE.MeshStandardMaterial({ color: 0xff8a1e, roughness: 0.55, emissive: 0x2a1000 });
  const fridgeMat = new THREE.MeshStandardMaterial({ color: 0xe6e8ea, roughness: 0.32, metalness: 0.1 });
  const caseMat = new THREE.MeshStandardMaterial({ color: 0x9c1426, roughness: 0.28, metalness: 0.2 });
  const cg = {
    cassetta: new THREE.BoxGeometry(0.6, 0.3, 0.4).translate(0, 0.15, 0),
    fruit: mergeGeometries([[-0.18, -0.06], [0, -0.07], [0.18, -0.06], [-0.09, 0.08], [0.09, 0.08], [0.2, 0.09]].map(([x, z]) => { const g = new THREE.SphereGeometry(0.075, 10, 8).translate(x, 0.3, z); g.deleteAttribute('uv'); return g; })),
    frigo: mergeGeometries([new THREE.BoxGeometry(0.7, 1.45, 0.6).translate(0, 0.725, -0.03), new THREE.BoxGeometry(0.66, 0.04, 0.05).translate(0, 0.97, 0.27)]),
    door: mergeGeometries([new THREE.BoxGeometry(0.7, 1.4, 0.05).translate(0.35, 0.72, 0.025), new THREE.BoxGeometry(0.03, 0.32, 0.04).translate(0.62, 0.95, 0.07)]),
    bauletto: new THREE.BoxGeometry(0.46, 0.24, 0.36).translate(0, 0.12, 0),
    lid: new THREE.BoxGeometry(0.46, 0.14, 0.36).translate(0, 0.07, 0.18),
  };
  const mk = (g, m, n, name) => { const im = new THREE.InstancedMesh(g, m, Math.max(1, n)); im.name = name; im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; root.add(im); return im; };
  const crates = [];
  const inPitch = (x, z, r) => PITCH && x > PITCH.x0 - r - 1 && x < PITCH.x1 + r + 1 && z > PITCH.z0 - r - 1 && z < PITCH.z1 + r + 1; // calcetto cage (sport/)
  const free = (x, z, r) => !inPitch(x, z, r) && (!level || !level.isWalkable || level.isWalkable(x, z, r));
  for (const [type, x0, z0] of CRATES) {
    let at = null;
    for (let rad = 0; rad <= 3 && !at; rad += 0.5) for (let a = 0; a < 8 && !at; a++) { const x = x0 + Math.cos(a * Math.PI / 4) * rad, z = z0 + Math.sin(a * Math.PI / 4) * rad; if (free(x, z, CRATE[type].r + 0.35)) at = [x, z]; if (!rad) break; }
    if (!at) continue;
    const c = { i: crates.length, type, pos: V(at[0], 0, at[1]), yaw: Math.random() * Math.PI * 2, open: 0, openK: 0, timer: 0, beam: -1, k: 0 };
    crates.push(c);
    level && level.colliders && level.colliders.push({ type: 'circle', c: [at[0], at[1]], r: CRATE[type].r });
  }
  const byType = t => crates.filter(c => c.type === t);
  const IM = {
    cassetta: mk(cg.cassetta, wood, byType('cassetta').length, 'crate-cassetta'), fruit: mk(cg.fruit, fruitMat, byType('cassetta').length, 'crate-fruit'),
    frigo: mk(cg.frigo, fridgeMat, byType('frigo').length, 'crate-frigo'), door: mk(cg.door, fridgeMat, byType('frigo').length, 'crate-door'),
    bauletto: mk(cg.bauletto, caseMat, byType('bauletto').length, 'crate-bauletto'), lid: mk(cg.lid, caseMat, byType('bauletto').length, 'crate-lid'),
  };
  for (const t of ['cassetta', 'frigo', 'bauletto']) byType(t).forEach((c, k) => { c.k = k; });
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = V(1, 1, 1), _p = V(), _c = new THREE.Color();
  function placeCrate(c) {
    const yaw = c.yaw, o = c.openK;
    _q.setFromEuler(_e.set(0, yaw, 0)); _s.set(1, 1, 1);
    if (c.type === 'cassetta') {
      _m.compose(c.pos, _q, _s); IM.cassetta.setMatrixAt(c.k, _m);
      _s.setScalar(o > 0.5 ? 0.0001 : 1); _m.compose(c.pos, _q, _s); IM.fruit.setMatrixAt(c.k, _m);
      IM.cassetta.instanceMatrix.needsUpdate = IM.fruit.instanceMatrix.needsUpdate = true;
    } else if (c.type === 'frigo') {
      _m.compose(c.pos, _q, _s); IM.frigo.setMatrixAt(c.k, _m);
      // door hinge: front-left corner, swings open around y
      _p.set(-0.35, 0, 0.27).applyQuaternion(_q).add(c.pos);
      _q.setFromEuler(_e.set(0, yaw - o * 1.7, 0)); _m.compose(_p, _q, _s); IM.door.setMatrixAt(c.k, _m);
      IM.frigo.instanceMatrix.needsUpdate = IM.door.instanceMatrix.needsUpdate = true;
    } else {
      _m.compose(c.pos, _q, _s); IM.bauletto.setMatrixAt(c.k, _m);
      _p.set(0, 0.24, -0.18).applyQuaternion(_q).add(c.pos);
      _q.setFromEuler(_e.set(-o * 1.5, yaw, 0, 'YXZ')); _m.compose(_p, _q, _s); IM.lid.setMatrixAt(c.k, _m);
      IM.bauletto.instanceMatrix.needsUpdate = IM.lid.instanceMatrix.needsUpdate = true;
    }
  }
  function crateBeam(c, on) {
    if (on && c.beam < 0) { c.beam = P.beam.alloc(); if (c.beam >= 0) { P.beam.color(c.beam, _c.set(CRATE[c.type].beam)); _s.set(1.6, 1.1 + CRATE[c.type].h, 1.6); _q.identity(); _m.compose(c.pos, _q, _s); P.beam.set(c.beam, _m); } }
    else if (!on && c.beam >= 0) { P.beam.free(c.beam); c.beam = -1; }
  }
  for (const c of crates) { placeCrate(c); crateBeam(c, true); }

  // ---------------------------------------------------------------- Banco dei pegni (Via Petroni)
  let shop = null;
  {
    let at = null;
    for (const [sx, sz, ax] of [[47.45, 54.2, 46.5], [47.45, 51, 46.5], [47.45, 57.4, 46.5], [48.6, 25.5, 47.3]]) {
      if (free(ax, sz, 0.3) && free(sx, sz, 0.05)) { at = [sx, sz, ax]; break; }
    }
    if (!at) at = [47.45, 54.2, 46.5];
    const [sx, sz, ax] = at;
    const g = new THREE.Group(); g.name = 'rpg-shop'; g.position.set(sx, 0, sz); g.rotation.y = -Math.PI / 2; // front faces -x (the street)
    const table = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.82, 0.62).translate(0, 0.41, 0), wood); table.castShadow = table.receiveShadow = true; g.add(table);
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.02, 0.68).translate(0, 0.83, 0), new THREE.MeshStandardMaterial({ color: 0x5a1a6e, roughness: 0.9 })); g.add(cloth);
    const poleM = new THREE.MeshStandardMaterial({ color: 0x2b2b30, roughness: 0.5, metalness: 0.6 });
    for (const x of [-0.72, 0.72]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.25, 6).translate(x, 1.45, -0.26), poleM); g.add(p); }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.47), new THREE.MeshBasicMaterial({ map: signTex(['BANCO DEI PEGNI', 'compro oro · vendo armi ad acqua']), toneMapped: false }));
    sign.position.set(0, 1.9, -0.26); g.add(sign);
    const back = sign.clone(); back.rotation.y = Math.PI; back.position.z = -0.265; g.add(back);
    const deco = [[P.spritz, -0.42, 0.93, 0.05, '#ffb52e'], [P.nerf, 0.05, 0.9, 0.08, '#3d9bff'], [P.tortellini, 0.45, 0.91, 0.02, '#b05cff']];
    for (const [pool, x, y, z, col] of deco) { const m = new THREE.Mesh(pool.mesh.geometry, new THREE.MeshStandardMaterial({ color: col, roughness: 0.4, emissive: 0x111111 })); m.position.set(x, y, z); m.rotation.y = 0.5; g.add(m); }
    root.add(g); g.updateMatrixWorld(true);
    level && level.colliders && level.colliders.push({ type: 'box', min: [sx - 0.36, sz - 0.8], max: [sx + 0.36, sz + 0.8] });
    shop = { pos: V(ax, 0, sz), top: V(sx, 1.35, sz), group: g };
  }

  // ---------------------------------------------------------------- drops
  const drops = []; // {kind:'item'|'money'|'ammo'|'quest', item, amount, ammo, pool, idx, beam, pos, vel, y, t, life, landed, spin, qid}
  const poolFor = d => d.kind === 'money' ? P.money : d.kind === 'ammo' ? P.ammo : d.kind === 'quest' ? P.quest
    : d.item.kind === 'weapon' ? P[d.item.base] || P.gadget : d.item.kind === 'gadget' ? P.gadget : P.consumable;
  function spawn(pos, d, scatter = 1) {
    const pool = poolFor(d), idx = pool.alloc(); if (idx < 0) return null;
    d.pool = pool; d.idx = idx; d.pos = V(pos.x ?? pos[0], 0, pos.z ?? pos[2]); d.y = (pos.y ?? pos[1] ?? 0.5) + 0.6;
    const a = Math.random() * Math.PI * 2, sp = (0.8 + Math.random() * 1.4) * scatter;
    d.vel = V(Math.cos(a) * sp, 3 + Math.random() * 1.5, Math.sin(a) * sp); d.t = 0; d.landed = false; d.spin = Math.random() * 6;
    d.life = d.kind === 'quest' ? Infinity : d.kind === 'item' ? (d.item.rarity === 'leggendario' ? 900 : 300) : 120;
    const col = d.kind === 'money' ? '#ffcc33' : d.kind === 'ammo' ? AMMO_COL[d.ammo] || '#fff' : d.kind === 'quest' ? '#5ff7ff' : rarityOf(d.item.rarity).color;
    pool.color(idx, _c.set(col));
    d.beam = -1;
    if (d.kind === 'item' || d.kind === 'quest') { d.beam = P.beam.alloc(); if (d.beam >= 0) P.beam.color(d.beam, _c.set(col)); d.beamH = d.kind === 'quest' ? 5 : 4 * rarityOf(d.item.rarity).beam; }
    drops.push(d); return d;
  }
  function remove(d) { const i = drops.indexOf(d); if (i < 0) return; drops.splice(i, 1); d.pool.free(d.idx); if (d.beam >= 0) P.beam.free(d.beam); d.removed = true; }
  const api = {
    root, crates, shop, drops,
    dropItem(pos, item, scatter) { return spawn(pos, { kind: 'item', item }, scatter); },
    dropMoney(pos, amount) { return spawn(pos, { kind: 'money', amount: Math.max(1, Math.round(amount)) }); },
    dropAmmo(pos, ammo, amount) { return spawn(pos, { kind: 'ammo', ammo, amount }); },
    spawnQuest(qid, pos, item) { const d = spawn(pos, { kind: 'quest', qid, item }, 0); if (d) { d.vel.set(0, 0, 0); d.y = 0.35; d.landed = true; } return d; },
    removeQuest(qid) { for (const d of drops.slice()) if (d.kind === 'quest' && d.qid === qid) remove(d); },
    remove,
    near: [],
    warmDone() { for (const k in P) { P[k].warm = false; P[k].sync(); } },
  };

  // ---------------------------------------------------------------- explore interactables (plugin items)
  const items = [];
  for (let i = 0; i < 6; i++) items.push({
    id: 'rpg_drop_' + i,
    label: () => { const d = api.near[i]; if (!d) return ''; if (d.kind === 'quest') return 'Prendi ' + (d.item && d.item.name || 'l\'oggetto'); const it = d.item; return 'Prendi ' + it.name + (it.kind === 'consumable' ? '' : ' · ' + rarityOf(it.rarity).name.toUpperCase()) + (it.kind === 'weapon' ? ' · liv. ' + it.level : ''); },
    anchor: () => { const d = api.near[i]; return d && d.landed ? d.pos : FAR; },
    top: () => { const d = api.near[i]; return d ? _top.set(d.pos.x, d.y + 0.45, d.pos.z) : FAR; },
    range: 1.6,
    act: () => { const d = api.near[i]; if (!d) return; if (d.kind === 'quest') { if (hooks.questPicked(d.qid, d)) remove(d); return; } if (hooks.pickItem(d.item, d)) remove(d); },
  });
  const _top = V();
  const CR_LABEL = { cassetta: 'Apri la cassetta della frutta', frigo: 'Apri il frigo abbandonato', bauletto: 'Apri il bauletto della Vespa' };
  for (const c of crates) items.push({
    id: 'rpg_crate_' + c.i, label: () => CR_LABEL[c.type],
    anchor: () => c.open ? FAR : c.pos, top: () => V(c.pos.x, CRATE[c.type].h + 0.35, c.pos.z), range: 1.5,
    act: () => openCrate(c),
  });
  if (shop) items.push({ id: 'rpg_shop', label: () => 'Banco dei pegni · compra e vendi', anchor: () => shop.pos, top: () => shop.top, range: 1.7, act: () => hooks.openShop() });

  function openCrate(c) {
    if (c.open) return;
    c.open = 1; c.timer = CRATE[c.type].respawn * (0.8 + Math.random() * 0.4); crateBeam(c, false);
    const front = V(Math.sin(c.yaw), 0, Math.cos(c.yaw)).multiplyScalar(0.6).add(c.pos); front.y = CRATE[c.type].h;
    for (const d of hooks.crateLoot(c.type)) {
      if (d.item) spawn(front, { kind: 'item', item: d.item }, 0.6);
      else if (d.money) spawn(front, { kind: 'money', amount: d.money }, 0.6);
      else if (d.ammo) spawn(front, { kind: 'ammo', ammo: d.ammo, amount: d.amount }, 0.6);
    }
    hooks.crateOpened && hooks.crateOpened(c, CRATE[c.type].name);
  }

  // ---------------------------------------------------------------- per frame
  const hold = [];
  api.update = (dt, t, player, canAuto) => {
    beamMat.uniforms.uTime.value = t;
    if (shop && player) shop.group.visible = Math.abs(player.x - shop.top.x) + Math.abs(player.z - shop.top.z) < 80; // ~9 draw calls only nearby
    // crate meshes (6 unculled instanced draws, + 6 in the shadow pass) only with a crate of that kind within ~50 m,
    // shadows only within ~10 m (the sun shadow map covers a few metres around the player)
    if (player && (api._cv = (api._cv || 0) + 1) % 8 === 1) {
      for (const [t, a, b] of [['cassetta', IM.cassetta, IM.fruit], ['frigo', IM.frigo, IM.door], ['bauletto', IM.bauletto, IM.lid]]) {
        let d = 1e9; for (const c of crates) if (c.type === t) d = Math.min(d, Math.abs(player.x - c.pos.x) + Math.abs(player.z - c.pos.z));
        a.visible = b.visible = d < 70; a.castShadow = b.castShadow = d < 14;
      }
    }
    // crates: lid animation + respawn
    for (const c of crates) {
      const want = c.open ? 1 : 0;
      if (c.openK !== want) { c.openK += Math.sign(want - c.openK) * Math.min(Math.abs(want - c.openK), dt * 2.2); placeCrate(c); }
      if (c.open) { c.timer -= dt; if (c.timer <= 0 && (!player || player.distanceTo(c.pos) > 12)) { c.open = 0; crateBeam(c, true); } }
    }
    // drops: physics, bob, spin, magnet, lifetime
    hold.length = 0;
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i]; d.t += dt;
      if (d.t > d.life) { remove(d); continue; }
      if (!d.landed) {
        d.vel.y -= 9.8 * dt; d.pos.x += d.vel.x * dt; d.pos.z += d.vel.z * dt; d.y += d.vel.y * dt;
        if (level && level.isWalkable && !level.isWalkable(d.pos.x, d.pos.z, 0.05)) { d.pos.x -= d.vel.x * dt; d.pos.z -= d.vel.z * dt; d.vel.x *= -0.3; d.vel.z *= -0.3; }
        if (d.y <= 0.3 && d.vel.y < 0) { d.y = 0.3; d.landed = true; }
      }
      const yy = d.landed ? 0.32 + Math.sin(t * 2.4 + d.spin) * 0.05 : d.y;
      d.y = d.landed ? yy : d.y;
      if (player && d.landed && canAuto && (d.kind === 'money' || d.kind === 'ammo')) {
        const dx = player.x - d.pos.x, dz = player.z - d.pos.z, L = Math.hypot(dx, dz);
        if (L < 0.8) { if (d.kind === 'money' ? hooks.addMoney(d.amount, d) : hooks.addAmmo(d.ammo, d.amount, d)) { remove(d); continue; } }
        else if (L < 3.2) { const k = Math.min(1, dt * (7 / L)); d.pos.x += dx * k; d.pos.z += dz * k; }
      }
      const blink = d.t > d.life - 10 && Math.sin(d.t * 18) > 0 ? 0.0001 : 1;
      _q.setFromEuler(_e.set(d.kind === 'money' ? 0 : 0.25, d.t * 1.6 + d.spin, 0));
      _s.setScalar((d.kind === 'item' && d.item.kind === 'weapon' ? 1.25 : 1) * blink);
      _p.set(d.pos.x, yy, d.pos.z); _m.compose(_p, _q, _s); d.pool.set(d.idx, _m);
      if (d.beam >= 0) { _q.identity(); _s.set(1, d.beamH * blink, 1); _p.y = 0.02; _m.compose(_p, _q, _s); P.beam.set(d.beam, _m); }
      if (d.kind === 'item' || d.kind === 'quest') hold.push(d);
    }
    // nearest pickables for the E prompt
    if (player) hold.sort((a, b) => (a.pos.x - player.x) ** 2 + (a.pos.z - player.z) ** 2 - ((b.pos.x - player.x) ** 2 + (b.pos.z - player.z) ** 2));
    for (let i = 0; i < 6; i++) api.near[i] = hold[i] || null;
  };
  api.items = items;
  api.crateName = t => CRATE[t] && CRATE[t].name;
  api.baseShape = b => BASES[b] ? b : 'gadget';
  return api;
}
