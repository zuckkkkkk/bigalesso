// quartiere/teletubby.js — Teletubbylandia (the group's nickname for its home turf): a flowery meadow in a ring of
// green hills, an old oak, a pond, rabbits, a little windmill; and the checkpoint of the "zona demilitarizzata"
// at the end of Via Teletubbylandia (booth, barrier, sandbags, signs, the group flag). Original look, no TV-show props.
import * as THREE from 'three';
import { mat } from '../materials.js';
import { qmat } from './textures.js';
import { rng, makeNoise, fbm, clamp, smooth, canvas } from '../util.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Batch, V, instances, plaqueTex, signMesh, signTex, fitText, worldUV } from './kit.js';
import { MEADOW, CHECK, ST } from './layout.js';

const PI = Math.PI;
// static props (also used for colliders before anything is built)
export const TT = {
  oak: [-74, 31], pond: [-60, 18, 3.2], picnic: [-71.5, 27.2], sign: [-48.6, 24.2],
  trees: [[-90, 46], [-93, 20], [-55, 8.5], [-88, 9], [-50, 47], [-80, 47.5]],
  booth: [-38.6, 31.4, 1.9, 1.7], pole: [-43.8, 31.6], barrier: [-38.6, 29.1],
  jersey: [[-42.5, 23.4, 2.6, 0.6], [-44.6, 28.6, 2.6, 0.6]],
  windmill: [-108, 31],
};
export function teletubbyColliders() {
  const c = [];
  const box = (x0, z0, x1, z1) => c.push({ type: 'box', min: [x0, z0], max: [x1, z1] });
  const circ = (x, z, r) => c.push({ type: 'circle', c: [x, z], r });
  circ(TT.oak[0], TT.oak[1], 0.85); circ(TT.pond[0], TT.pond[1], TT.pond[2] + 0.15);
  for (const [x, z] of TT.trees) circ(x, z, 0.45);
  const [bx, bz, bw, bd] = TT.booth; box(bx - bw / 2, bz - bd / 2, bx + bw / 2, bz + bd / 2);
  circ(TT.pole[0], TT.pole[1], 0.12); circ(TT.sign[0], TT.sign[1], 0.2);
  for (const [x, z, w, d] of TT.jersey) box(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
  return c;
}

// signed distance (2D) to a rect, negative inside
function sdRect(x, z, r) { const dx = Math.max(r[0] - x, x - r[2]), dz = Math.max(r[1] - z, z - r[3]); const ox = Math.max(dx, 0), oz = Math.max(dz, 0); return Math.hypot(ox, oz) + Math.min(Math.max(dx, dz), 0); }
const NZ = makeNoise(4242);
export function hillHeight(x, z) {
  if (x > -36) return -0.35; // under the street / buildings
  const mr = [MEADOW.x0, MEADOW.z0, MEADOW.x1, MEADOW.z1], cr = [CHECK.x0 - 0.5, CHECK.z0, CHECK.x1 + 2, CHECK.z1];
  if (sdRect(x, z, cr) < 0) return -0.35;
  const d = sdRect(x, z, mr);
  if (d < 0) return 0.025; // flat walkable meadow (just above the world ground)
  const n = fbm(NZ, x * 0.025 + 3, z * 0.025 + 7, 4);
  const rise = smooth(d / 22) * (7 + n * 16) + smooth(d / 60) * 10;
  return 0.025 + rise;
}

function louverStripes() {
  return signTex('barrierStripes', 256, 32, (x, W, H) => { for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#f4f4f0' : '#d42a24'; x.fillRect(i * W / 8, 0, W / 8, H); } });
}
function flagTex() {
  return signTex('ttFlag', 256, 160, (x, W, H) => {
    x.fillStyle = '#6a2fb8'; x.fillRect(0, 0, W, H); x.fillStyle = '#c8f03c'; x.fillRect(0, H * 0.38, W, H * 0.24);
    x.fillStyle = '#6a2fb8'; x.beginPath(); x.arc(W * 0.5, H * 0.5, H * 0.3, 0, PI * 2); x.fill();
    x.fillStyle = '#c8f03c'; x.font = `900 ${H * 0.36}px Impact, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('T', W * 0.5, H * 0.53);
  });
}

export function buildTeletubby(root, { low = false } = {}) {
  const hooks = { anim: [], night: [], tripo: [] };
  const R = rng(919); const B = new Batch();
  // ---------- terrain ----------
  {
    const X0 = -142, X1 = -30, Z0 = -22, Z1 = 100, sx = low ? 56 : 84, sz = low ? 60 : 92;
    const g = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, sx, sz); g.rotateX(-PI / 2); g.translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
    const p = g.attributes.position; const col = new Float32Array(p.count * 3); const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), h = hillHeight(x, z); p.setY(i, h);
      const n = fbm(NZ, x * 0.08, z * 0.08, 3); const t = clamp(h / 18, 0, 1);
      c.setRGB(0.62 + n * 0.25 + t * 0.15, 0.85 + n * 0.12, 0.42 + n * 0.12 - t * 0.1); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals(); worldUV(g, 0.35);
    const gm = qmat('grass', { vc: true, rough: 0.95 }).clone(); gm.name = 'q:hills';
    const mesh = new THREE.Mesh(g, gm); mesh.receiveShadow = true; mesh.name = 'teletubbyTerrain'; root.add(mesh);
  }
  // ---------- flowers + grass tufts in the meadow ----------
  {
    const avoid = (x, z) => Math.hypot(x - TT.pond[0], z - TT.pond[1]) < TT.pond[2] + 0.4 || Math.hypot(x - TT.oak[0], z - TT.oak[1]) < 1.4 || (x > -50 && z > 19 && z < 35);
    const n = low ? 600 : 1800; const heads = [], stems = [];
    const pal = ['#ffd83a', '#ff5a8a', '#ffffff', '#9a6ad8', '#ff8a2a', '#5ab0ff', '#ff3a3a'];
    for (let i = 0; i < n; i++) {
      // clusters
      const cx = MEADOW.x0 + 2 + R() * (MEADOW.x1 - MEADOW.x0 - 4), cz = MEADOW.z0 + 2 + R() * (MEADOW.z1 - MEADOW.z0 - 4);
      const x = cx, z = cz; if (avoid(x, z)) continue;
      const h = 0.18 + R() * 0.3; const cc = pal[(fbm(NZ, x * 0.05, z * 0.05, 2) * 9 + R() * 2.5 | 0) % pal.length];
      stems.push({ x, y: 0.02, z, sy: h }); heads.push({ x, y: 0.02 + h, z, rx: R(), ry: R() * 6, s: 0.8 + R() * 0.6, color: cc });
    }
    const sg = new THREE.CylinderGeometry(0.006, 0.006, 1, 3); sg.translate(0, 0.5, 0);
    root.add(instances(sg, new THREE.MeshStandardMaterial({ color: 0x3a7a2a, roughness: 0.9 }), stems, { cast: false, name: 'ttStems' }));
    const hg = new THREE.IcosahedronGeometry(0.045, 0); hg.scale(1, 0.6, 1);
    root.add(instances(hg, new THREE.MeshStandardMaterial({ roughness: 0.6 }), heads, { cast: false, name: 'ttFlowers' }));
    if (!low) { // grass tufts
      const blades = []; const R0 = rng(5);
      for (let k = 0; k < 7; k++) { const hh = 0.14 + R0() * 0.2, w = 0.02 + R0() * 0.01; const b = new THREE.PlaneGeometry(w, hh, 1, 2); const q = b.attributes.position; for (let i = 0; i < q.count; i++) { const t = (q.getY(i) + hh / 2) / hh; q.setY(i, t * hh); q.setX(i, q.getX(i) * (1 - t * 0.9) + (R0() - 0.5) * 0.08 * t); } b.rotateY(R0() * PI); b.translate((R0() - 0.5) * 0.1, 0, (R0() - 0.5) * 0.1); blades.push(b); }
      const tg = mergeGeometries(blades); const tm = new THREE.MeshStandardMaterial({ color: 0x6fae48, roughness: 0.85, side: THREE.DoubleSide });
      const tufts = []; for (let i = 0; i < 2200; i++) { const x = MEADOW.x0 + R() * (MEADOW.x1 - MEADOW.x0), z = MEADOW.z0 + R() * (MEADOW.z1 - MEADOW.z0); if (avoid(x, z)) continue; tufts.push({ x, y: 0.02, z, ry: R() * 6, s: 0.8 + R() * 0.7 }); }
      root.add(instances(tg, tm, tufts, { cast: false, name: 'ttTufts' }));
    }
  }
  // ---------- the old oak, other trees, hillside trees ----------
  {
    const bark = new THREE.MeshStandardMaterial({ color: 0x6a5a46, roughness: 0.95 }); const leaf = new THREE.MeshStandardMaterial({ color: 0x4f8a34, roughness: 0.85, flatShading: true });
    const oakTrunk = []; { const t = new THREE.CylinderGeometry(0.45, 0.8, 4.2, 10); t.translate(0, 2.1, 0); oakTrunk.push(t); for (let i = 0; i < 5; i++) { const a = i * 1.3, br = new THREE.CylinderGeometry(0.14, 0.3, 3.2, 7); br.translate(0, 1.6, 0); br.rotateZ(0.9); br.rotateY(a); br.translate(0, 3.6, 0); oakTrunk.push(br); } }
    const oakC = []; for (let i = 0; i < 11; i++) { const a = R() * 6.28, d = R() * 3.2; const s = new THREE.IcosahedronGeometry(2.0 + R() * 1.2, 1); s.translate(Math.cos(a) * d, 6.2 + R() * 2.2, Math.sin(a) * d); oakC.push(s); }
    B.put(bark, mergeGeometries(oakTrunk.map(g => (g.index ? g.toNonIndexed() : g))), TT.oak[0], 0, TT.oak[1]);
    B.put(leaf, mergeGeometries(oakC.map(g => (g.index ? g.toNonIndexed() : g))), TT.oak[0], 0, TT.oak[1]);
    // round trees in the meadow + many on the hills
    const trunk = new THREE.CylinderGeometry(0.16, 0.26, 3, 7); trunk.translate(0, 1.5, 0);
    const crown = new THREE.IcosahedronGeometry(1.8, 1); crown.scale(1, 1.15, 1); crown.translate(0, 4.2, 0);
    const list = TT.trees.map(([x, z]) => ({ x, y: 0, z, s: 0.9 + R() * 0.4, ry: R() * 6 }));
    const hillTrees = []; for (let i = 0; i < (low ? 40 : 110); i++) { const x = -140 + R() * 104, z = -20 + R() * 118; const h = hillHeight(x, z); if (h < 1.5 || x > -38) continue; hillTrees.push({ x, y: h - 0.2, z, s: 0.8 + R() * 0.9, ry: R() * 6 }); }
    const all = list.concat(hillTrees);
    const ti = instances(trunk, bark, all, { name: 'ttTrunks' }), ci = instances(crown, leaf, all.map(t => ({ ...t, color: ['#ffffff', '#d8f0c0', '#c0e0a0'][(R() * 3) | 0] })), { name: 'ttCrowns' }); root.add(ti, ci);
    hooks.treeIms = [ti, ci]; hooks.meadowTrees = list.length;
    hooks.tripo.push({ name: 'tree_linden', ims: [], size: 6 });
  }
  // ---------- pond ----------
  {
    const [px, pz, pr] = TT.pond;
    const water = new THREE.Mesh(new THREE.CircleGeometry(pr, 40), new THREE.MeshPhysicalMaterial({ color: 0x4f8a9a, roughness: 0.05, transparent: true, opacity: 0.85, clearcoat: 1 }));
    water.rotation.x = -PI / 2; water.position.set(px, 0.06, pz); root.add(water);
    const stones = []; for (let i = 0; i < 26; i++) { const a = i / 26 * 6.28; stones.push({ x: px + Math.cos(a) * (pr + 0.12), y: 0.05, z: pz + Math.sin(a) * (pr + 0.12), s: 0.25 + R() * 0.18, ry: R() * 6, color: ['#b8b0a4', '#9a948a', '#cfc6b6'][i % 3] }); }
    root.add(instances(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: 0.9 }), stones, { name: 'pondStones' }));
    const lily = new THREE.CircleGeometry(0.28, 10); lily.rotateX(-PI / 2); const lilies = []; for (let i = 0; i < 7; i++) { const a = R() * 6.28, r = R() * pr * 0.7; lilies.push({ x: px + Math.cos(a) * r, y: 0.07, z: pz + Math.sin(a) * r, ry: R() * 6 }); }
    root.add(instances(lily, new THREE.MeshStandardMaterial({ color: 0x3f7a2a, roughness: 0.7 }), lilies, { cast: false, name: 'lilies' }));
    hooks.anim.push((dt, t) => { water.material.color.setHSL(0.53, 0.32, 0.43 + Math.sin(t * 0.8) * 0.02); });
  }
  // ---------- picnic blanket + basket under the oak ----------
  {
    const bt = signTex('picnic', 128, 128, (x, W) => { for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { x.fillStyle = (i + j) % 2 ? '#d83a3a' : '#f4eee0'; x.fillRect(i * W / 8, j * W / 8, W / 8, W / 8); } });
    const bl = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.6), new THREE.MeshStandardMaterial({ map: bt, roughness: 0.95 })); bl.rotation.x = -PI / 2; bl.rotation.z = 0.3; bl.position.set(TT.picnic[0], 0.035, TT.picnic[1]); root.add(bl);
    B.box(qmat('wood'), TT.picnic[0] + 0.5, 0.03, TT.picnic[1] - 0.2, TT.picnic[0] + 0.95, 0.33, TT.picnic[1] + 0.12);
  }
  // ---------- rabbits (hopping) ----------
  {
    const body = new THREE.SphereGeometry(0.16, 10, 8); body.scale(1, 0.85, 1.3); body.translate(0, 0.15, 0);
    const head = new THREE.SphereGeometry(0.1, 10, 8); head.translate(0, 0.27, 0.17);
    const ears = []; for (const s of [-1, 1]) { const e = new THREE.CapsuleGeometry(0.025, 0.16, 3, 6); e.rotateX(-0.25); e.translate(s * 0.04, 0.42, 0.13); ears.push(e); }
    const tail = new THREE.SphereGeometry(0.05, 6, 6); tail.translate(0, 0.18, -0.2);
    const rg = mergeGeometries([body, head, ...ears, tail].map(g => { g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); return g; }));
    const rm = new THREE.MeshStandardMaterial({ color: 0xc8b8a4, roughness: 0.9 });
    const rabbits = []; for (let i = 0; i < 6; i++) rabbits.push({ x: -85 + R() * 30, z: 12 + R() * 32, ry: R() * 6, ph: R() * 10, sp: 0.6 + R() * 0.4 });
    const im = new THREE.InstancedMesh(rg, rm, rabbits.length); im.castShadow = true; root.add(im);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s1 = V(1, 1, 1);
    hooks.anim.push((dt, t) => {
      rabbits.forEach((r, i) => {
        const cyc = (t * r.sp + r.ph) % 4; let y = 0;
        if (cyc < 1.2) { const k = (cyc % 0.4) / 0.4; y = Math.sin(k * PI) * 0.18; const sp = 1.1 * dt; r.x += Math.sin(r.ry) * sp; r.z += Math.cos(r.ry) * sp; }
        else if (cyc > 3.8) r.ry += (R() - 0.5) * 0.5;
        if (r.x < MEADOW.x0 + 3 || r.x > MEADOW.x1 - 6 || r.z < MEADOW.z0 + 3 || r.z > MEADOW.z1 - 3 || Math.hypot(r.x - TT.pond[0], r.z - TT.pond[1]) < TT.pond[2] + 0.6) { r.ry += PI; r.x += Math.sin(r.ry) * 0.3; r.z += Math.cos(r.ry) * 0.3; }
        m4.compose(V(r.x, 0.02 + y, r.z), q.setFromEuler(e.set(0, r.ry, 0)), s1); im.setMatrixAt(i, m4);
      });
      im.instanceMatrix.needsUpdate = true;
    });
    hooks.rabbits = rabbits;
  }
  // ---------- windmill on the hills ----------
  {
    const [wx, wz] = TT.windmill; const wy = hillHeight(wx, wz) - 0.3;
    const g = new THREE.Group(); g.position.set(wx, wy, wz); g.rotation.y = PI / 2 + 0.3; root.add(g);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 2.0, 7, 10), qmat('plaster', { color: 0xf0e8d8 })); tower.position.y = 3.5; tower.castShadow = true; g.add(tower);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.8, 10), qmat('roof')); cap.position.y = 7.9; g.add(cap);
    const hub = new THREE.Group(); hub.position.set(0, 6.6, 1.6); g.add(hub);
    const sailM = new THREE.MeshStandardMaterial({ color: 0xf4efe4, roughness: 0.9, side: THREE.DoubleSide });
    for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.9, 4.2, 0.05), sailM); s.position.y = 2.3; const arm = new THREE.Group(); arm.rotation.z = i * PI / 2; arm.add(s); hub.add(arm); }
    hooks.anim.push((dt) => { hub.rotation.z -= dt * 0.6; });
  }
  // ---------- welcome sign ----------
  {
    const [sx, sz] = TT.sign;
    B.box(qmat('wood'), sx - 0.06, 0, sz - 0.06, sx + 0.06, 2.0, sz + 0.06);
    const s = signMesh(plaqueTex('TELETUBBYLANDIA', { bg: '#7a5230', fg: '#f6e7c4', border: '#4a3018', w: 768, h: 220, sub: 'CERTIFICATA · DAL 2021', family: 'Georgia, serif' }), 1.9, 0.55, { rough: 0.9 });
    s.position.set(sx, 1.85, sz + 0.07); s.rotation.y = -PI / 2; root.add(s);
    const back = s.clone(); back.rotation.y = PI / 2; back.position.x -= 0.02; root.add(back);
  }

  // ================= checkpoint =================
  const chk = new THREE.Group(); chk.name = 'checkpoint'; root.add(chk);
  {
    const olive = new THREE.MeshStandardMaterial({ color: 0x5d6b45, roughness: 0.8 }); const white = qmat('plaster', { color: 0xf0ece2 });
    const CB = new Batch(); const boothG = new THREE.Group(); boothG.name = 'booth'; chk.add(boothG); const BB = new Batch(); hooks.booth = boothG;
    const [bx, bz, bw, bd] = TT.booth;
    BB.box(white, bx - bw / 2, 0, bz - bd / 2, bx + bw / 2, 0.9, bz + bd / 2);
    for (const [x0, z0, x1, z1] of [[bx - bw / 2, bz - bd / 2, bx - bw / 2 + 0.12, bz + bd / 2], [bx + bw / 2 - 0.12, bz - bd / 2, bx + bw / 2, bz + bd / 2], [bx - bw / 2, bz + bd / 2 - 0.12, bx + bw / 2, bz + bd / 2]]) BB.box(white, x0, 0.9, z0, x1, 2.2, z1);
    BB.box(olive, bx - bw / 2 - 0.15, 2.2, bz - bd / 2 - 0.15, bx + bw / 2 + 0.15, 2.38, bz + bd / 2 + 0.15);
    BB.box(new THREE.MeshStandardMaterial({ color: 0x2a3640, roughness: 0.1, metalness: 0.6 }), bx - bw / 2 + 0.12, 0.95, bz - bd / 2 + 0.01, bx + bw / 2 - 0.12, 2.15, bz - bd / 2 + 0.03);
    // jersey barriers
    for (const [x, z, w, d] of TT.jersey) { const g = new THREE.CylinderGeometry(0.15, 0.3, 0.8, 4, 1); g.rotateY(PI / 4); g.scale(w / 0.42, 1, d / 0.42); g.translate(x, 0.4, z); BB.add(qmat('stone', { color: 0xdedad2 }), g, { uv: 0.6 }); }
    // sandbag walls along the corridor sides (south z≈20, north z≈33.6) + a ring around the booth
    const bags = []; const bag = (x, z, ry, y) => bags.push({ x, y, z, ry, sx: 0.55, sy: 0.2, sz: 0.32, color: ['#b9a77e', '#a8966c', '#c4b48c'][(R() * 3) | 0] });
    for (const zz of [19.85, 33.75]) for (let row = 0; row < 3; row++) for (let x = CHECK.x0 + 0.3 + (row % 2) * 0.27; x < CHECK.x1 - 0.2; x += 0.55) bag(x, zz, (R() - 0.5) * 0.1, 0.1 + row * 0.19);
    const bgeo = new THREE.SphereGeometry(0.5, 10, 6); bgeo.scale(1, 0.9, 1);
    chk.add(instances(bgeo, qmat('fabric', { color: 0xd8c8a0 }), bags, { name: 'sandbags' }));
    // barrier arm (pivots up)
    const [rx, rz] = TT.barrier;
    CB.box(new THREE.MeshStandardMaterial({ color: 0xd8c020, roughness: 0.6 }), rx - 0.18, 0, rz - 0.18, rx + 0.18, 1.05, rz + 0.18);
    const pivot = new THREE.Group(); pivot.position.set(rx, 1.0, rz); chk.add(pivot);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 6.2), new THREE.MeshStandardMaterial({ map: louverStripes(), roughness: 0.5 }));
    arm.material.map.wrapS = THREE.RepeatWrapping; arm.position.z = -3.15; arm.geometry.attributes.uv && (() => { const uv = arm.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i)); })();
    arm.castShadow = true; pivot.add(arm);
    hooks.barrier = { pivot, up: 0, target: 0 };
    hooks.anim.push(dt => { const b = hooks.barrier; b.up += (b.target - b.up) * Math.min(1, dt * 2.5); pivot.rotation.x = b.up * 1.35; });
    // flagpole + group flag
    const [fx, fz] = TT.pole;
    CB.box(new THREE.MeshStandardMaterial({ color: 0xcfd2d6, metalness: 0.8, roughness: 0.3 }), fx - 0.05, 0, fz - 0.05, fx + 0.05, 6.5, fz + 0.05);
    const fg = new THREE.PlaneGeometry(1.6, 1.0, 12, 4); fg.translate(0.8, 0, 0);
    const flagM = new THREE.MeshStandardMaterial({ map: flagTex(), side: THREE.DoubleSide, roughness: 0.8 });
    const U = { uTime: { value: 0 } };
    flagM.onBeforeCompile = sh => { sh.uniforms.uTime = U.uTime; sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n float k = position.x / 1.6; transformed.z += sin(uTime * 4.0 - position.x * 3.0) * 0.12 * k; transformed.y += sin(uTime * 2.7 - position.x * 2.0) * 0.04 * k;'); };
    const flag = new THREE.Mesh(fg, flagM); flag.position.set(fx + 0.05, 5.9, fz); flag.rotation.y = 0.6; chk.add(flag);
    hooks.anim.push((dt, t) => { U.uTime.value = t; });
    // signs
    const dz = signMesh(plaqueTex('ZONA DEMILITARIZZATA', { bg: '#f2c81e', fg: '#141414', border: '#141414', w: 1024, h: 220, sub: 'TELETUBBYLANDIA CERTIFICATA', family: '"Arial Black", Impact, sans-serif' }), 3.2, 0.7, { emissive: 0.1 });
    CB.box(olive, -36.9, 0, 21.0, -36.75, 2.5, 21.12); CB.box(olive, -36.9, 0, 24.3, -36.75, 2.5, 24.42);
    dz.position.set(-36.7, 2.55, 22.7); dz.rotation.y = PI / 2; chk.add(dz);
    const alt = signMesh(plaqueTex('ALT! DOCUMENTI', { bg: '#c8201e', fg: '#ffffff', border: '#ffffff', w: 768, h: 192, sub: 'PASSAPORTO TELETUBBY OBBLIGATORIO', family: '"Arial Black", Impact, sans-serif' }), 1.6, 0.4, { emissive: 0.15 });
    alt.position.set(bx, 2.6, bz - bd / 2 - 0.17); alt.rotation.y = PI; boothG.add(alt);
    const dz2 = dz.clone(); dz2.position.set(-45.7, 2.4, 33.2); dz2.rotation.y = -PI / 2; dz2.scale.setScalar(0.8); chk.add(dz2);
    CB.box(olive, -45.6, 0, 32.95, -45.5, 2.1, 33.05);
    CB.flush(chk, { name: 'checkpoint' }); BB.flush(boothG, { name: 'booth' });
    hooks.night.push(k => { dz.material.emissiveIntensity = 0.1 + k * 0.5; alt.material.emissiveIntensity = 0.15 + k * 0.6; });
    hooks.tripo.push({ name: 'checkpoint', obj: null, size: 3 });
  }
  B.flush(root, { name: 'teletubby' });
  return hooks;
}
