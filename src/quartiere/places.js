// quartiere/places.js — the interiors: Celtic (Irish pub), Sushi all you can eat (kaiten belt), Casa di Ashish
// (Discord station), Casa di Seghino (zombata night, spot for the ZOMBATA cabinet), Millennium (club).
// Built lazily (quartiere.js) when the player gets near the door; colliders are DATA (placeColliders) from frame 0.
import * as THREE from 'three';
import { mat } from '../materials.js';
import { qmat } from './textures.js';
import { rng, canvas, clamp } from '../util.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Batch, V, instances, plaqueTex, neonTex, signMesh, signTex, fitText, glowTex } from './kit.js';
import { INTERIORS } from './layout.js';

const PI = Math.PI;
const IN = INTERIORS;

// ---------- furniture footprints (shared by colliders + builders) ----------
const P = {
  celtic: { bar: [0.2, 42.0, 6.2, 42.7], tables: [[0.7, 36.4], [5.9, 36.3], [6.0, 39.3]], back: [-1.7, 43.2, 7.7, 43.7] },
  sushi: { arms: [[20.2, 37.6, 25.8, 38.4], [20.2, 38.4, 21.0, 41.8], [25.0, 38.4, 25.8, 41.8]], kitchen: [19.0, 42.8, 27.0, 43.7], tables: [[19.3, 35.3], [26.7, 35.3]] },
  ashish: { desk: [-19.0, 37.0, -18.3, 39.4], sofa: [-25.7, 35.2, -24.8, 38.4], tower: [-18.95, 39.6, -18.35, 40.2], shelf: [-25.7, 40.0, -24.9, 41.7] },
  seghino: { sofa: [-12.9, 13.2, -9.9, 14.1], tv: [-12.6, 18.9, -9.8, 19.7], table: [-12.0, 15.0, -10.8, 15.9], fridge: [-15.7, 17.8, -15.0, 18.6], kitchen: [-15.7, 8.6, -15.0, 12.6] },
  millennium: { booth: [42.0, 89.2, 46.0, 89.9], bar: [36.3, 80.5, 37.5, 88.0], loungeA: [50.8, 80.0, 51.7, 85.0], loungeB: [50.8, 86.5, 51.7, 90.5] },
};
export function placeColliders() {
  const c = []; const box = r => c.push({ type: 'box', min: [r[0], r[1]], max: [r[2], r[3]] }); const circ = (x, z, r) => c.push({ type: 'circle', c: [x, z], r });
  box(P.celtic.bar); box(P.celtic.back); for (const [x, z] of P.celtic.tables) circ(x, z, 0.55);
  for (const a of P.sushi.arms) box(a); box(P.sushi.kitchen); for (const [x, z] of P.sushi.tables) circ(x, z, 0.45);
  box(P.ashish.desk); box(P.ashish.sofa); box(P.ashish.tower); box(P.ashish.shelf);
  box(P.seghino.sofa); box(P.seghino.tv); box(P.seghino.table); box(P.seghino.fridge); box(P.seghino.kitchen);
  box(P.millennium.booth); box(P.millennium.bar); box(P.millennium.loungeA); box(P.millennium.loungeB);
  return c;
}

// ---------- helpers ----------
const g2 = l => mergeGeometries(l.map(g => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; }));
function shell(B, key, { floor, wall, ceiling, wainscot = null, wainH = 1.1, wallCol }) {
  const I = IN[key]; const [x0, z0, x1, z1] = I.rect, h = I.ceil, t = 0.02, [d0, d1] = I.door; const low = key !== 'seghino'; const fz = low ? z0 : z1;
  B.box(floor, x0, 0, z0, x1, 0.015, z1, { uv: 0.5 });
  B.box(ceiling, x0, h - 0.02, z0, x1, h, z1, { uv: 0.5 });
  const pan = (ax0, az0, ax1, az1, y0, y1, m) => B.box(m, ax0, y0, az0, ax1, y1, az1, { uv: 0.5, color: wallCol });
  const walls = (y0, y1, m) => {
    pan(x0, z0, x0 + t, z1, y0, y1, m); pan(x1 - t, z0, x1, z1, y0, y1, m);
    const bz = low ? z1 - t : z0; pan(x0, bz, x1, bz + t, y0, y1, m);
    const fz0 = low ? z0 : z1 - t; pan(x0, fz0, d0, fz0 + t, y0, y1, m); pan(d1, fz0, x1, fz0 + t, y0, y1, m); if (y1 > 2.45) pan(d0, fz0, d1, fz0 + t, Math.max(2.45, y0), y1, m);
  };
  if (wainscot) { walls(0, wainH, wainscot); walls(wainH, h, wall); } else walls(0, h, wall);
  void fz;
}
// interior lights are DESCRIPTORS: quartiere.js copies them into a fixed pool of real PointLights (constant light
// count while in the neighbourhood -> no shader recompiles when walking in and out of places)
function pointLight(group, color, intensity, dist, x, y, z) { void group; return { position: V(x, y, z), color: new THREE.Color(color), intensity, distance: dist, userData: { base: intensity } }; }

// ================================================================== CELTIC
function buildCeltic(root, { low }) {
  const g = new THREE.Group(); g.name = 'celtic'; root.add(g); const B = new Batch(); const R = rng(31);
  const green = new THREE.MeshStandardMaterial({ color: 0x1d3a28, roughness: 0.55, name: 'q:celtGreen' });
  const dark = qmat('wood', { color: 0x6a4a34 }); const floor = qmat('woodFloor', { color: 0x8a6a50 });
  const plaster = qmat('plaster', { color: 0xe9dcc0 }); const brass = new THREE.MeshStandardMaterial({ color: 0xc9a45a, roughness: 0.25, metalness: 1 });
  shell(B, 'celtic', { floor, wall: plaster, ceiling: dark, wainscot: green, wainH: 1.15 });
  const I = IN.celtic, [x0, z0, x1, z1] = I.rect;
  for (let x = x0 + 0.6; x < x1; x += 1.25) B.box(dark, x - 0.09, I.ceil - 0.26, z0, x + 0.09, I.ceil - 0.02, z1, { uv: 1 }); // beams
  // bar counter + brass rail + top
  const [bx0, bz0, bx1, bz1] = P.celtic.bar;
  B.box(dark, bx0, 0, bz0, bx1, 1.0, bz1, { uv: 1 }); B.box(qmat('wood', { color: 0x4a3020 }), bx0 - 0.08, 1.0, bz0 - 0.12, bx1 + 0.08, 1.07, bz1 + 0.04, { uv: 1 });
  { const r = new THREE.CylinderGeometry(0.025, 0.025, bx1 - bx0, 8); r.rotateZ(PI / 2); B.put(brass, r, (bx0 + bx1) / 2, 0.22, bz0 - 0.18); }
  for (let x = bx0 + 0.3; x < bx1; x += 0.9) B.box(green, x, 0.1, bz0 - 0.01, x + 0.6, 0.85, bz0 + 0.01);
  // back bar: shelves, mirror, bottles
  const [kx0, kz0, kx1, kz1] = P.celtic.back;
  B.box(dark, kx0 + 1.2, 0, kz0, kx1 - 1.2, 0.95, kz1, { uv: 1 });
  B.box(new THREE.MeshStandardMaterial({ color: 0x3a4a52, roughness: 0.05, metalness: 0.9, name: 'q:mirror' }), kx0 + 1.4, 1.05, kz1 - 0.03, kx1 - 1.4, 2.55, kz1 - 0.01);
  for (const y of [1.35, 1.85, 2.35]) B.box(dark, kx0 + 1.3, y - 0.03, kz0 + 0.1, kx1 - 1.3, y, kz1 - 0.02, { uv: 1 });
  const bottles = []; const bc = ['#2a5a2a', '#6a3a1a', '#d8c8a0', '#3a2a1a', '#8a1a1a', '#c8a040', '#1a3a5a'];
  for (const y of [1.35, 1.85, 2.35]) for (let x = kx0 + 1.45; x < kx1 - 1.45; x += 0.17 + R() * 0.08) bottles.push({ x, y, z: kz0 + 0.3, s: 0.9 + R() * 0.3, color: bc[(R() * bc.length) | 0] });
  const bg = g2([(() => { const a = new THREE.CylinderGeometry(0.04, 0.04, 0.22, 8); a.translate(0, 0.11, 0); return a; })(), (() => { const a = new THREE.CylinderGeometry(0.014, 0.03, 0.1, 8); a.translate(0, 0.27, 0); return a; })()]);
  g.add(instances(bg, new THREE.MeshPhysicalMaterial({ roughness: 0.15, metalness: 0.1, transmission: 0, clearcoat: 1 }), bottles, { cast: false, name: 'bottles' }));
  // beer taps
  const taps = []; for (let i = 0; i < 5; i++) taps.push({ x: 2.3 + i * 0.35, y: 1.07, z: bz0 + 0.35 });
  const tapG = g2([(() => { const a = new THREE.CylinderGeometry(0.035, 0.045, 0.35, 10); a.translate(0, 0.175, 0); return a; })(), (() => { const a = new THREE.CylinderGeometry(0.018, 0.018, 0.12, 8); a.rotateX(PI / 2); a.translate(0, 0.3, -0.06); return a; })()]);
  const tapIm = instances(tapG, brass, taps, { name: 'taps' }); g.add(tapIm);
  const hand = new THREE.BoxGeometry(0.05, 0.2, 0.05); hand.translate(0, 0.47, 0);
  const handIm = instances(hand, new THREE.MeshStandardMaterial({ roughness: 0.5 }), taps.map((t, i) => ({ ...t, color: ['#1a1a1a', '#2a6a3a', '#c8a040', '#8a1a1a', '#f0f0e8'][i] })), { name: 'tapHandles' }); g.add(handIm);
  // stools, tables, chairs
  const stoolG = g2([(() => { const a = new THREE.CylinderGeometry(0.19, 0.19, 0.06, 14); a.translate(0, 0.76, 0); return a; })(), (() => { const a = new THREE.CylinderGeometry(0.03, 0.04, 0.74, 8); a.translate(0, 0.37, 0); return a; })(), (() => { const a = new THREE.TorusGeometry(0.15, 0.012, 6, 16); a.rotateX(PI / 2); a.translate(0, 0.28, 0); return a; })()]);
  const stools = []; for (let x = 0.8; x < 5.8; x += 0.95) stools.push({ x, z: 41.55 });
  g.add(instances(stoolG, dark, stools, { name: 'stools' }));
  const tableG = g2([(() => { const a = new THREE.CylinderGeometry(0.5, 0.5, 0.05, 20); a.translate(0, 0.74, 0); return a; })(), (() => { const a = new THREE.CylinderGeometry(0.05, 0.05, 0.72, 8); a.translate(0, 0.36, 0); return a; })(), (() => { const a = new THREE.CylinderGeometry(0.28, 0.3, 0.04, 14); a.translate(0, 0.02, 0); return a; })()]);
  g.add(instances(tableG, dark, P.celtic.tables.map(([x, z]) => ({ x, z })), { name: 'tables' }));
  const chairG = g2([(() => { const a = new THREE.BoxGeometry(0.42, 0.05, 0.42); a.translate(0, 0.46, 0); return a; })(), (() => { const a = new THREE.BoxGeometry(0.42, 0.5, 0.05); a.translate(0, 0.72, -0.19); return a; })(), ...[[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]].map(([x, z]) => { const a = new THREE.BoxGeometry(0.04, 0.46, 0.04); a.translate(x, 0.23, z); return a; })]);
  const chairs = []; for (const [tx, tz] of P.celtic.tables) for (let i = 0; i < 3; i++) { const a = i * 2.1 + R(); chairs.push({ x: tx + Math.sin(a) * 0.82, z: tz + Math.cos(a) * 0.82, ry: a + PI }); }
  g.add(instances(chairG, dark, chairs, { name: 'chairs' }));
  // pints on tables and bar
  const pint = new THREE.CylinderGeometry(0.04, 0.035, 0.15, 10); pint.translate(0, 0.075, 0);
  const pints = [{ x: 0.5, y: 0.765, z: 36.3 }, { x: 0.85, y: 0.765, z: 36.6 }, { x: 6.0, y: 0.765, z: 39.2 }, { x: 1.6, y: 1.07, z: 41.85 }, { x: 4.4, y: 1.07, z: 41.9 }];
  g.add(instances(pint, new THREE.MeshStandardMaterial({ color: 0x2a1408, emissive: 0x1a0a00, roughness: 0.2 }), pints, { cast: false, name: 'pints' }));
  // dartboard + chalkboard + plaques
  const dart = signTex('dartboard', 256, 256, (x, W) => { const c = W / 2; const ring = (r, col) => { x.fillStyle = col; x.beginPath(); x.arc(c, c, r, 0, PI * 2); x.fill(); };
    ring(c, '#111'); for (let i = 0; i < 20; i++) { x.fillStyle = i % 2 ? '#f0e8d0' : '#1a1a1a'; x.beginPath(); x.moveTo(c, c); x.arc(c, c, c * 0.78, i * PI / 10 - PI / 20, (i + 1) * PI / 10 - PI / 20); x.fill(); x.fillStyle = i % 2 ? '#2a8a3a' : '#c81e1e'; x.beginPath(); x.arc(c, c, c * 0.78, i * PI / 10 - PI / 20, (i + 1) * PI / 10 - PI / 20); x.arc(c, c, c * 0.72, (i + 1) * PI / 10 - PI / 20, i * PI / 10 - PI / 20, true); x.fill(); x.beginPath(); x.arc(c, c, c * 0.5, i * PI / 10 - PI / 20, (i + 1) * PI / 10 - PI / 20); x.arc(c, c, c * 0.45, (i + 1) * PI / 10 - PI / 20, i * PI / 10 - PI / 20, true); x.fill(); }
    ring(c * 0.08, '#2a8a3a'); ring(c * 0.04, '#c81e1e'); });
  const db = signMesh(dart, 0.46, 0.46); db.position.set(x0 + 0.03, 1.73, 38.2); db.rotation.y = PI / 2; g.add(db);
  const chalk = signMesh(signTex('celticChalk', 512, 384, (x, W, H) => { x.fillStyle = '#1e2420'; x.fillRect(0, 0, W, H); x.strokeStyle = '#7a5a3a'; x.lineWidth = 18; x.strokeRect(0, 0, W, H); x.fillStyle = '#f2efe6'; x.textAlign = 'center';
    x.font = 'bold 46px "Comic Sans MS", cursive'; x.fillText('MERCOLEDÌ', W / 2, 80); x.font = 'bold 64px "Comic Sans MS", cursive'; x.fillStyle = '#ffd86a'; x.fillText('ore 21:30', W / 2, 160);
    x.fillStyle = '#f2efe6'; x.font = '34px "Comic Sans MS", cursive'; x.fillText('si va al Celtic', W / 2, 225); x.fillText('pinta + freccette', W / 2, 280); x.font = 'italic 28px "Comic Sans MS", cursive'; x.fillStyle = '#9ad08a'; x.fillText('Sláinte!', W / 2, 340); }), 1.2, 0.9);
  chalk.position.set(x1 - 0.03, 1.8, 37.6); chalk.rotation.y = -PI / 2; g.add(chalk);
  const pl = signMesh(plaqueTex('SLÁINTE', { bg: '#163a26', fg: '#e8c66a', border: '#c9a45a', w: 512, h: 128 }), 1.8, 0.45, { emissive: 0.3 }); pl.position.set(3.2, 2.85, z1 - 0.06); pl.rotation.y = PI; g.add(pl);
  // pendant lamps
  const lamps = []; for (let x = 0.8; x < 6; x += 1.3) lamps.push({ x, y: 2.5, z: 42.3 }); for (const [x, z] of P.celtic.tables) lamps.push({ x, y: 2.4, z });
  const shade = new THREE.ConeGeometry(0.18, 0.18, 14, 1, true); g.add(instances(shade, new THREE.MeshStandardMaterial({ color: 0x1d3a28, side: THREE.DoubleSide, roughness: 0.5 }), lamps, { cast: false, name: 'shades' }));
  const bulbM = new THREE.MeshBasicMaterial({ color: 0xffd8a0 }); g.add(instances(new THREE.SphereGeometry(0.05, 8, 6), bulbM, lamps.map(l => ({ ...l, y: l.y - 0.08 })), { cast: false, name: 'bulbs' }));
  const cord = new THREE.CylinderGeometry(0.006, 0.006, 1, 4); cord.translate(0, 0.5, 0); g.add(instances(cord, new THREE.MeshBasicMaterial({ color: 0x111111 }), lamps.map(l => ({ ...l, sy: I.ceil - l.y })), { cast: false, name: 'cords' }));
  B.flush(g, { name: 'celtic' });
  const lights = [pointLight(g, 0xffb870, 26, 13, 3, 2.9, 40.4)]; if (!low) lights.push(pointLight(g, 0xffa860, 12, 9, 2.5, 2.6, 36.2));
  return { group: g, lights, door: V(3, 0, 33.6), taps: tapIm, tapHandles: handIm, darts: db, update() { } };
}

// ================================================================== SUSHI
function buildSushi(root, { low }) {
  const g = new THREE.Group(); g.name = 'sushi'; root.add(g); const B = new Batch(); const R = rng(77);
  const slats = qmat('wood', { color: 0xf0d8b0 }); const floor = qmat('stone', { color: 0xe8e0d0 }); const white = qmat('plaster', { color: 0xf6f2ea });
  shell(B, 'sushi', { floor, wall: white, ceiling: white, wainscot: slats, wainH: 1.4 });
  const I = IN.sushi, [x0, z0, x1, z1] = I.rect;
  const counter = qmat('wood', { color: 0xc89a6a }); const steel = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, metalness: 0.9, roughness: 0.25, name: 'q:steel' });
  const kaitenG = new THREE.Group(); kaitenG.name = 'kaiten'; g.add(kaitenG); const KB = new Batch(); // procedural counter (hidden when the Tripo 'sushi_conveyor' is placed)
  for (const [a0, b0, a1, b1] of P.sushi.arms) { KB.box(counter, a0, 0, b0, a1, 0.92, b1, { uv: 1 }); KB.box(qmat('wood', { color: 0x5a3a24 }), a0 - 0.04, 0.92, b0 - 0.04, a1 + 0.04, 0.96, b1 + 0.04, { uv: 1 }); }
  // belt path (closed loop around the U), steel channel under it
  const pts = [[20.42, 41.7], [20.42, 37.82], [25.58, 37.82], [25.58, 41.7], [25.22, 41.7], [25.22, 38.18], [20.78, 38.18], [20.78, 41.7]].map(([x, z]) => V(x, 0.985, z));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.05);
  { const N = 160; const geo = []; for (let i = 0; i < N; i++) { const a = curve.getPointAt(i / N), b = curve.getPointAt((i + 1) / N); const d = b.clone().sub(a); const s = new THREE.BoxGeometry(0.3, 0.02, d.length() + 0.01); s.lookAt(d); s.translate((a.x + b.x) / 2, 0.97, (a.z + b.z) / 2); geo.push(s); } KB.add(steel, g2(geo)); }
  // kitchen counter on the back wall + noren + chef window
  const [kx0, kz0, kx1, kz1] = P.sushi.kitchen; B.box(steel, kx0, 0, kz0, kx1, 0.95, kz1, { uv: 1 }); B.box(counter, kx0, 0.95, kz0, kx1, 1.0, kz1, { uv: 1 });
  const noren = signTex('noren', 256, 128, (x, W, H) => { x.fillStyle = '#1e3a6a'; x.fillRect(0, 0, W, H); x.fillStyle = '#f4ede0'; for (let i = 1; i < 4; i++) x.fillRect(i * W / 4 - 2, H * 0.3, 4, H); x.beginPath(); x.arc(W / 2, H * 0.32, H * 0.16, 0, PI * 2); x.fill(); });
  const nr = signMesh(noren, 1.5, 0.75, { rough: 0.9 }); nr.material.side = THREE.DoubleSide; nr.position.set(23, 2.0, z1 - 0.05); nr.rotation.y = PI; g.add(nr);
  // wave art (original pattern) + menu board
  const wave = signTex('waveArt', 512, 256, (x, W, H) => { x.fillStyle = '#f4ede0'; x.fillRect(0, 0, W, H); x.strokeStyle = '#1e3a6a'; x.lineWidth = 5; for (let r = 0; r < 6; r++) for (let i = -1; i < 9; i++) { const cx = i * 64 + (r % 2) * 32, cy = 40 + r * 40; for (let k = 3; k > 0; k--) { x.beginPath(); x.arc(cx, cy, k * 9, PI, 0); x.stroke(); } } });
  const wa = signMesh(wave, 2.4, 1.2); wa.position.set(x0 + 0.03, 2.1, 38.5); wa.rotation.y = PI / 2; g.add(wa);
  const menu = signMesh(plaqueTex('ALL YOU CAN EAT', { bg: '#b3261e', fg: '#ffffff', border: '#ffffff', w: 768, h: 256, sub: 'PRANZO 15,90 · CENA 25,90', family: '"Trebuchet MS", sans-serif' }), 2.0, 0.66, { emissive: 0.3 }); menu.position.set(x1 - 0.03, 2.2, 38.5); menu.rotation.y = -PI / 2; g.add(menu);
  // stools around the U, two little tables by the windows
  const stoolG = g2([(() => { const a = new THREE.CylinderGeometry(0.18, 0.18, 0.05, 14); a.translate(0, 0.66, 0); return a; })(), (() => { const a = new THREE.CylinderGeometry(0.03, 0.05, 0.64, 8); a.translate(0, 0.32, 0); return a; })()]);
  const stools = []; for (let x = 20.6; x < 25.6; x += 0.62) stools.push({ x, z: 37.15 }); for (let z = 38.9; z < 41.6; z += 0.65) { stools.push({ x: 19.75, z }); stools.push({ x: 26.25, z }); }
  kaitenG.add(instances(stoolG, qmat('wood', { color: 0x3a2a1a }), stools.filter(s => !(Math.abs(s.x - 23) < 0.3 && s.z < 37.5)), { name: 'sushiStools' }));
  const tableG = g2([(() => { const a = new THREE.BoxGeometry(0.8, 0.05, 0.8); a.translate(0, 0.72, 0); return a; })(), (() => { const a = new THREE.CylinderGeometry(0.05, 0.05, 0.7, 8); a.translate(0, 0.35, 0); return a; })()]);
  g.add(instances(tableG, counter, P.sushi.tables.map(([x, z]) => ({ x, z })), { name: 'sushiTables' }));
  // paper lanterns
  const lan = []; for (let x = 19.5; x < 27; x += 1.8) for (const z of [35.2, 40.0]) lan.push({ x, y: 2.75, z });
  const lanM = new THREE.MeshStandardMaterial({ color: 0xf4e8d4, emissive: 0xffd8a0, emissiveIntensity: 1.2, roughness: 0.9 });
  g.add(instances((() => { const a = new THREE.SphereGeometry(0.22, 12, 8); a.scale(1, 1.25, 1); return a; })(), lanM, lan, { cast: false, name: 'paperLanterns' }));
  // plates + sushi on the belt (instanced, moving)
  const NP = low ? 26 : 44; const plateCols = ['#2a5fb8', '#c8302a', '#e8c020', '#2a8a4a', '#1a1a1a', '#f4f0e8'];
  const plateG = new THREE.CylinderGeometry(0.1, 0.075, 0.018, 16); plateG.translate(0, 0.009, 0);
  const plates = new THREE.InstancedMesh(plateG, new THREE.MeshStandardMaterial({ roughness: 0.3 }), NP);
  const nig = g2([(() => { const a = new THREE.BoxGeometry(0.09, 0.035, 0.05); a.translate(0, 0.035, 0); return a; })()]);
  const topG = g2([(() => { const a = new THREE.BoxGeometry(0.1, 0.014, 0.056); a.translate(0, 0.06, 0); return a; })()]);
  const rice = new THREE.InstancedMesh(nig, new THREE.MeshStandardMaterial({ color: 0xf6f2e8, roughness: 0.8 }), NP);
  const fish = new THREE.InstancedMesh(topG, new THREE.MeshStandardMaterial({ roughness: 0.35 }), NP);
  const fishCols = ['#ff8a5a', '#c8283a', '#f4e8d8', '#ffb07a', '#2a2a2a', '#e86a4a'];
  const c = new THREE.Color();
  for (let i = 0; i < NP; i++) { plates.setColorAt(i, c.set(plateCols[i % plateCols.length])); fish.setColorAt(i, c.set(fishCols[(i * 7) % fishCols.length])); }
  for (const im of [plates, rice, fish]) { im.castShadow = false; im.receiveShadow = true; im.frustumCulled = false; kaitenG.add(im); }
  const belt = { curve, y: 0.985, speed: 0.045, offset: 0, count: NP, plates, rice, fish, hidden: new Set() };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = V(1, 1, 1), zero = V(0, 0, 0);
  function update(dt) {
    belt.offset = (belt.offset + dt * belt.speed) % 1;
    for (let i = 0; i < NP; i++) {
      const u = (belt.offset + i / NP) % 1; const p = curve.getPointAt(u); p.y = belt.y;
      m4.compose(p, q.setFromEuler(e.set(0, u * 40, 0)), belt.hidden.has(i) ? zero : one);
      plates.setMatrixAt(i, m4); rice.setMatrixAt(i, m4); fish.setMatrixAt(i, m4);
    }
    plates.instanceMatrix.needsUpdate = rice.instanceMatrix.needsUpdate = fish.instanceMatrix.needsUpdate = true;
  }
  update(0);
  KB.flush(kaitenG, { name: 'kaiten' });
  B.flush(g, { name: 'sushi' });
  const lights = [pointLight(g, 0xfff2e0, 24, 13, 23, 3.0, 38.6)];
  return { group: g, lights, door: V(23, 0, 33.6), belt, kaiten: kaitenG, update: dt => { if (kaitenG.visible) update(dt); } };
}

// ================================================================== CASA DI ASHISH (Discord station)
function buildAshish(root, { low }) {
  const g = new THREE.Group(); g.name = 'ashish'; root.add(g); const B = new Batch(); const R = rng(5);
  shell(B, 'ashish', { floor: qmat('woodFloor', { color: 0xb09070 }), wall: qmat('plaster', { color: 0xdfe3ea }), ceiling: qmat('plaster', { color: 0xf4f4f2 }) });
  const I = IN.ashish, [x0, z0, x1, z1] = I.rect;
  const black = new THREE.MeshStandardMaterial({ color: 0x141418, roughness: 0.4, name: 'q:black' });
  // the gaming desk itself is the Tripo model 'gaming_desk' (quartiere.js) / the MINIGIOCHI desk at anchor 'discord'
  const rgbM = new THREE.MeshBasicMaterial({ color: 0xff00ff, toneMapped: false });
  const strip2 = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.02, 3.0), rgbM); strip2.position.set(x1 - 0.03, 1.75, 38.2); g.add(strip2);
  const strip3 = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.02, 3.0), rgbM); strip3.position.set(x1 - 0.03, 2.85, 38.2); g.add(strip3);
  // PC tower with glass side + fans
  const [tx0, tz0, tx1, tz1] = P.ashish.tower; B.box(black, tx0, 0, tz0, tx1, 0.5, tz1);
  const fans = []; for (const y of [0.15, 0.35]) fans.push({ x: tx0 - 0.005, y, z: (tz0 + tz1) / 2, ry: -PI / 2 });
  g.add(instances(new THREE.TorusGeometry(0.07, 0.012, 6, 18), rgbM, fans, { cast: false, name: 'fans' }));
  // sofa, shelf with figures, posters, rug
  const [sx0, sz0, sx1, sz1] = P.ashish.sofa; const fab = qmat('fabric', { color: 0x3a4a6a }); const sofaG = new THREE.Group(); g.add(sofaG); const SB = new Batch();
  SB.box(fab, sx0, 0, sz0, sx1, 0.45, sz1); SB.box(fab, sx0, 0.45, sz0, sx0 + 0.25, 0.9, sz1); SB.box(fab, sx0, 0.45, sz0, sx1, 0.7, sz0 + 0.18); SB.box(fab, sx0, 0.45, sz1 - 0.18, sx1, 0.7, sz1); SB.flush(sofaG, { name: 'ashSofa' });
  const [hx0, hz0, hx1, hz1] = P.ashish.shelf; const wood = qmat('wood', { color: 0xd0b090 }); B.box(wood, hx0, 0, hz0, hx1, 1.9, hz0 + 0.03); B.box(wood, hx0, 0, hz1 - 0.03, hx1, 1.9, hz1); for (const y of [0.02, 0.5, 1.0, 1.5, 1.88]) B.box(wood, hx0, y, hz0, hx1, y + 0.03, hz1);
  const figs = []; for (const y of [0.53, 1.03, 1.53]) for (let z = hz0 + 0.2; z < hz1 - 0.1; z += 0.3) figs.push({ x: (hx0 + hx1) / 2, y, z, s: 0.8 + R() * 0.6, color: ['#c8f03c', '#7a5cff', '#ff6a3c', '#3cb8ff'][(R() * 4) | 0] });
  g.add(instances((() => { const a = new THREE.CapsuleGeometry(0.04, 0.12, 3, 6); a.translate(0, 0.1, 0); return a; })(), new THREE.MeshStandardMaterial({ roughness: 0.5 }), figs, { name: 'figures' }));
  const poster = (text, sub, bg, fg, z) => { const p = signMesh(plaqueTex(text, { bg, fg, border: fg, w: 384, h: 512, sub, family: '"Arial Black", Impact, sans-serif' }), 0.7, 0.93); p.position.set(x0 + 0.03, 1.7, z); p.rotation.y = PI / 2; g.add(p); };
  poster('GG', 'COMPETTINA STASERA', '#1a1a2a', '#c8f03c', 36.0); poster('WZ', 'DROP IN 3…2…1', '#2a1a1a', '#ff6a3c', 39.6);
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.8), new THREE.MeshStandardMaterial({ map: signTex('ashRug', 128, 128, (x, W) => { x.fillStyle = '#2a2a3a'; x.fillRect(0, 0, W, W); x.strokeStyle = '#7a5cff'; x.lineWidth = 8; x.strokeRect(10, 10, W - 20, W - 20); }), roughness: 1 })); rug.rotation.x = -PI / 2; rug.position.set(-22.4, 0.02, 37.0); g.add(rug);
  B.flush(g, { name: 'ashish' });
  const lights = [pointLight(g, 0xdfe8ff, 14, 10, -22, 2.6, 37.5)]; const rgbL = low ? null : pointLight(g, 0xff00ff, 4, 4, -18.9, 1.2, 38.2); if (rgbL) lights.push(rgbL);
  const col = new THREE.Color();
  function update(dt, t) { col.setHSL((t * 0.08) % 1, 1, 0.55); rgbM.color.copy(col); if (rgbL) rgbL.color.copy(col); }
  return { group: g, lights, door: V(-22, 0, 33.6), rgb: rgbM, sofa: sofaG, update };
}

// ================================================================== CASA DI SEGHINO (zombata)
function buildSeghino(root, { low }) {
  const g = new THREE.Group(); g.name = 'seghino'; root.add(g); const B = new Batch(); const R = rng(13);
  shell(B, 'seghino', { floor: qmat('tiles', { color: 0xd8d0c0 }), wall: qmat('plaster', { color: 0xd8dcc8 }), ceiling: qmat('plaster', { color: 0xf2f0ea }) });
  const I = IN.seghino, [x0, z0, x1, z1] = I.rect;
  const fab = qmat('fabric', { color: 0x5a4a3a }), black = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.4 }), wood = qmat('wood', { color: 0xb08860 });
  // sofa facing the TV (+z), TV on the front wall
  const [sx0, sz0, sx1, sz1] = P.seghino.sofa; B.box(fab, sx0, 0, sz0, sx1, 0.45, sz1); B.box(fab, sx0, 0.45, sz0, sx1, 0.95, sz0 + 0.22); B.box(fab, sx0, 0.45, sz0, sx0 + 0.22, 0.7, sz1); B.box(fab, sx1 - 0.22, 0.45, sz0, sx1, 0.7, sz1);
  const [vx0, vz0, vx1, vz1] = P.seghino.tv; B.box(wood, vx0, 0, vz0, vx1, 0.5, vz1);
  const tvTex = signTex('zombataTV', 512, 288, (x, W, H) => { x.fillStyle = '#060a06'; x.fillRect(0, 0, W, H); x.fillStyle = '#7aff4a'; x.textAlign = 'center'; x.font = '900 86px Impact, sans-serif'; x.shadowColor = '#3aff2a'; x.shadowBlur = 24; x.fillText('ZOMBATA', W / 2, H * 0.48);
    x.shadowBlur = 0; for (let i = 0; i < 14; i++) { const dx = 60 + i * 30 + (i * 37 % 11); x.fillRect(dx, H * 0.5, 5, 14 + (i * 53 % 40)); } x.font = 'bold 24px monospace'; x.fillStyle = '#d0ffc0'; x.fillText('PREMI START · 2 GIOCATORI', W / 2, H * 0.85); });
  const tv = signMesh(tvTex, 1.6, 0.9, { basic: true }); tv.position.set((vx0 + vx1) / 2, 1.25, vz0 + 0.05); tv.rotation.y = PI; g.add(tv);
  B.box(black, (vx0 + vx1) / 2 - 0.84, 0.77, vz0 + 0.06, (vx0 + vx1) / 2 + 0.84, 1.73, vz0 + 0.1);
  // coffee table with pizza box + cans
  const [tx0, tz0, tx1, tz1] = P.seghino.table; B.box(wood, tx0, 0.38, tz0, tx1, 0.42, tz1); for (const [x, z] of [[tx0 + 0.05, tz0 + 0.05], [tx1 - 0.1, tz0 + 0.05], [tx0 + 0.05, tz1 - 0.1], [tx1 - 0.1, tz1 - 0.1]]) B.box(wood, x, 0, z, x + 0.05, 0.38, z + 0.05);
  B.box(qmat('fabric', { color: 0xe8dcc0 }), tx0 + 0.15, 0.42, tz0 + 0.12, tx0 + 0.6, 0.46, tz0 + 0.57);
  const cans = [{ x: tx1 - 0.25, z: tz0 + 0.3 }, { x: tx1 - 0.15, z: tz0 + 0.5 }, { x: tx1 - 0.35, z: tz1 - 0.2 }].map(c => ({ ...c, y: 0.42, color: ['#2a8a3a', '#c81e1e', '#1e5ab8'][(R() * 3) | 0] }));
  g.add(instances((() => { const a = new THREE.CylinderGeometry(0.033, 0.033, 0.12, 10); a.translate(0, 0.06, 0); return a; })(), new THREE.MeshStandardMaterial({ metalness: 0.8, roughness: 0.3 }), cans, { name: 'cans' }));
  // kitchenette + fridge
  const kitG = new THREE.Group(); g.add(kitG); const KB = new Batch();
  const [kx0, kz0, kx1, kz1] = P.seghino.kitchen; KB.box(qmat('plaster', { color: 0xf0ece4 }), kx0, 0, kz0, kx1, 0.9, kz1); KB.box(new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.3 }), kx0, 0.9, kz0, kx1, 0.94, kz1);
  const [fx0, fz0, fx1, fz1] = P.seghino.fridge; KB.box(new THREE.MeshStandardMaterial({ color: 0xeef0f0, roughness: 0.3, metalness: 0.2 }), fx0, 0, fz0, fx1, 1.85, fz1);
  // posters (original): LA NOTTE DEI ZOMBI + ZOMBATA DI SEGHINO
  const poster = (t, s, z, side) => { const p = signMesh(plaqueTex(t, { bg: '#0e140e', fg: '#7aff4a', border: '#3a8a2a', w: 384, h: 540, sub: s, family: 'Impact, sans-serif' }), 0.75, 1.05); p.position.set(side < 0 ? x0 + 0.03 : x1 - 0.03, 1.75, z); p.rotation.y = side < 0 ? PI / 2 : -PI / 2; g.add(p); };
  poster('ZOMBI', 'LA NOTTE DI SEGHINO', 14.5, -1); poster('ZOMBATA', 'VENERDÌ · PORTA LE BIRRE', 10.5, 1); poster('2P', 'NESSUNO RESTA INDIETRO', 15.5, 1);
  // the cabinet spot (anchor 'zombata'): a lit floor mark + a sticky note until MINIGIOCHI puts the cabinet here
  const spot = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({ map: glowTex(), color: 0x7aff4a, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
  spot.rotation.x = -PI / 2; spot.position.set(-11.2, 0.03, 7.4); g.add(spot); // beside the ZOMBATA cabinet (anchor 'zombata' at x -13.6)
  const note = signMesh(plaqueTex('ZOMBATA', { bg: '#ffe86a', fg: '#1a1a1a', border: '', w: 384, h: 256, sub: 'VENERDÌ · PORTA LE BIRRE', family: '"Comic Sans MS", cursive' }), 0.45, 0.3); note.position.set(-11.2, 1.5, z0 + 0.03); g.add(note);
  // a floor lamp (warm) and a green "zombie" accent light
  B.box(black, -9.0, 0, 17.6, -8.9, 1.6, 17.7); const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.3, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0xf0e0c0, emissive: 0xffc080, emissiveIntensity: 0.8, side: THREE.DoubleSide })); shade.position.set(-8.95, 1.7, 17.65); g.add(shade);
  KB.flush(kitG, { name: 'segKitchen' });
  B.flush(g, { name: 'seghino' });
  const lights = [pointLight(g, 0xffc890, 15, 12, -11.5, 2.5, 14.5)]; if (!low) lights.push(pointLight(g, 0x5aff3a, 3, 5, -11.2, 1.2, 18.6));
  return { group: g, lights, door: V(-12, 0, 20), tv, spot, note, kitchen: kitG, update(dt, t) { spot.material.opacity = 0.25 + Math.sin(t * 2) * 0.1; } };
}

// ================================================================== MILLENNIUM
function buildMillennium(root, { low }) {
  const g = new THREE.Group(); g.name = 'millennium'; root.add(g); const B = new Batch(); const R = rng(99);
  const black = new THREE.MeshStandardMaterial({ color: 0x0c0c10, roughness: 0.25, metalness: 0.2, name: 'q:clubFloor' });
  const wallM = new THREE.MeshStandardMaterial({ color: 0x16141c, roughness: 0.8, name: 'q:clubWall' });
  shell(B, 'millennium', { floor: black, wall: wallM, ceiling: new THREE.MeshStandardMaterial({ color: 0x08080a, roughness: 1 }) });
  const I = IN.millennium, [x0, z0, x1, z1] = I.rect;
  // trusses
  const truss = new THREE.MeshStandardMaterial({ color: 0x2a2a30, metalness: 0.8, roughness: 0.4 });
  for (const z of [81, 85, 89]) B.box(truss, x0, 5.6, z - 0.12, x1, 5.84, z + 0.12);
  // dance floor (unlit instanced tiles, colours animated)
  const tiles = []; for (let i = 0; i < 7; i++) for (let j = 0; j < 6; j++) tiles.push({ x: 40.5 + 0.5 + i, y: 0.02, z: 81.5 + 0.5 + j, i, j });
  const tg = new THREE.BoxGeometry(0.96, 0.03, 0.96);
  const tileM = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const floor = instances(tg, tileM, tiles.map(t => ({ ...t, color: '#000000' })), { cast: false, name: 'danceFloor' }); g.add(floor);
  // DJ booth + turntables + LED front (procedural; hidden when the Tripo 'dj_booth' model is placed)
  const boothG = new THREE.Group(); boothG.name = 'djBooth'; g.add(boothG); const BB = new Batch();
  const [bx0, bz0, bx1, bz1] = P.millennium.booth; BB.box(truss, bx0, 0, bz0, bx1, 1.08, bz1);
  const ledF = new THREE.MeshBasicMaterial({ color: 0xc04cff, toneMapped: false }); const ledFront = new THREE.Mesh(new THREE.PlaneGeometry(bx1 - bx0 - 0.1, 0.8), ledF); ledFront.position.set((bx0 + bx1) / 2, 0.55, bz0 - 0.005); ledFront.rotation.y = PI; boothG.add(ledFront);
  for (const x of [42.8, 45.2]) { const tt = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 24), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 })); tt.position.set(x, 1.1, (bz0 + bz1) / 2); boothG.add(tt); }
  BB.box(new THREE.MeshStandardMaterial({ color: 0x222228, roughness: 0.4 }), 43.6, 1.08, bz0 + 0.15, 44.4, 1.16, bz1 - 0.15);
  BB.flush(boothG, { name: 'booth' });
  // LED wall behind the DJ (shader stripes / equaliser)
  const ledU = { uTime: { value: 0 }, uMode: { value: 0 } };
  const ledM = new THREE.ShaderMaterial({ uniforms: ledU, toneMapped: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uTime, uMode; varying vec2 vUv;
      vec3 pal(float t){ return 0.5 + 0.5*cos(6.2832*(vec3(0.0,0.33,0.67) + t)); }
      void main(){ vec2 g = floor(vUv * vec2(48.0, 20.0)); vec2 f = fract(vUv * vec2(48.0, 20.0));
        float bar = abs(sin(g.x*0.37 + uTime*3.1) * 0.6 + sin(g.x*0.11 - uTime*1.7)*0.4);
        float on = step(g.y/20.0, bar);
        float wave = step(0.5, fract(vUv.x*3.0 - uTime*0.6 + sin(vUv.y*6.0+uTime)*0.2));
        float k = mix(on, wave, step(0.5, uMode));
        float led = smoothstep(0.5, 0.35, length(f-0.5));
        vec3 c = pal(g.x/48.0 + uTime*0.1) * k * led * 1.6;
        gl_FragColor = vec4(c, 1.0); }` });
  const led = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.6), ledM); led.position.set(44, 2.6, z1 - 0.04); led.rotation.y = PI; g.add(led);
  // bar with neon edge + bottles
  const [ax0, az0, ax1, az1] = P.millennium.bar; B.box(truss, ax0, 0, az0, ax1, 1.1, az1);
  const neonBar = mat('neon', { color: 0x3cf0ff, intensity: 2.6 }); B.box(neonBar, ax1, 1.04, az0, ax1 + 0.03, 1.1, az1);
  const bottles = []; for (let z = az0 + 0.2; z < az1 - 0.1; z += 0.2) for (const y of [1.6, 2.1]) bottles.push({ x: x0 + 0.15, y, z, color: ['#3cf0ff', '#ff3cac', '#c8f03c', '#ffb03c'][(R() * 4) | 0] });
  B.box(truss, x0 + 0.02, 1.55, az0, x0 + 0.3, 1.58, az1); B.box(truss, x0 + 0.02, 2.05, az0, x0 + 0.3, 2.08, az1);
  g.add(instances((() => { const a = new THREE.CylinderGeometry(0.035, 0.035, 0.28, 8); a.translate(0, 0.14, 0); return a; })(), new THREE.MeshBasicMaterial({ toneMapped: false }), bottles, { cast: false, name: 'clubBottles' }));
  // lounge sofas (velvet)
  const velvet = qmat('fabric', { color: 0x5a1a4a }); for (const r of [P.millennium.loungeA, P.millennium.loungeB]) { B.box(velvet, r[0], 0, r[1], r[2], 0.45, r[3]); B.box(velvet, r[2] - 0.25, 0.45, r[1], r[2], 1.0, r[3]); }
  // neon tubes on the walls
  const neon2 = mat('neon', { color: 0xff3cac, intensity: 2.4 }); for (const z of [80, 84, 88]) B.box(neon2, x1 - 0.06, 0.4, z, x1 - 0.03, 3.4, z + 0.06);
  const neon3 = mat('neon', { color: 0x7a5cff, intensity: 2.4 }); B.box(neon3, x0 + 0.03, 4.2, z0 + 0.5, x0 + 0.06, 4.26, z1 - 0.5); B.box(neon3, x1 - 0.06, 4.2, z0 + 0.5, x1 - 0.03, 4.26, z1 - 0.5);
  // light beams (additive cones hanging from the trusses) + mirror ball
  const beamM = []; const beams = [];
  for (let i = 0; i < (low ? 4 : 8); i++) { const col = new THREE.Color().setHSL(i / 8, 1, 0.55); const m = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }); beamM.push(m);
    const cone = new THREE.ConeGeometry(0.9, 5.4, 18, 1, true); cone.translate(0, -2.7, 0); const piv = new THREE.Group(); piv.position.set(39 + (i % 4) * 3.4, 5.5, i < 4 ? 81 : 89); const mm = new THREE.Mesh(cone, m); piv.add(mm); g.add(piv); beams.push({ piv, ph: R() * 6, sp: 0.6 + R() * 0.8 }); }
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 2), new THREE.MeshStandardMaterial({ color: 0xe8e8f0, metalness: 1, roughness: 0.08, flatShading: true })); ball.position.set(44, 5.2, 84.5); g.add(ball);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.2, 4), truss); cord.position.set(44, 5.9, 84.5); g.add(cord);
  // sparkles of the mirror ball on the walls (additive points, rotating)
  let sparks = null;
  if (!low) { const N = 260, pos = new Float32Array(N * 3); for (let i = 0; i < N; i++) { const a = R() * 6.28, h = 0.5 + R() * 5.5; const rr = 7.5; pos[i * 3] = Math.cos(a) * rr; pos[i * 3 + 1] = h; pos[i * 3 + 2] = Math.sin(a) * rr * 0.85; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sparks = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.09, map: glowTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); sparks.position.set(44, 0, 85); g.add(sparks); }
  B.flush(g, { name: 'millennium' });
  const lights = [pointLight(g, 0xff3cac, 30, 16, 41, 4.5, 84.5), pointLight(g, 0x3cf0ff, 30, 16, 47, 4.5, 84.5)];
  const state = { mode: 0, beat: 0 };
  const c = new THREE.Color();
  function update(dt, t) {
    ledU.uTime.value = t; ledU.uMode.value = state.mode % 2;
    const bpm = 124 / 60, beat = t * bpm, pulse = Math.pow(1 - (beat % 1), 3);
    for (let n = 0; n < tiles.length; n++) { const tt = tiles[n]; let h, l;
      if (state.mode % 3 === 0) { h = ((tt.i + tt.j) * 0.08 + beat * 0.25) % 1; l = ((tt.i + tt.j + Math.floor(beat)) % 2) ? 0.5 * (0.4 + pulse * 0.6) : 0.06; }
      else if (state.mode % 3 === 1) { const d = Math.hypot(tt.i - 3, tt.j - 2.5); h = (beat * 0.1 + d * 0.05) % 1; l = Math.max(0.04, 0.55 * (0.5 + 0.5 * Math.sin(d * 1.6 - beat * PI))); }
      else { h = (n * 0.137 + Math.floor(beat) * 0.31) % 1; l = (((n * 7 + Math.floor(beat * 2)) % 5) === 0) ? 0.55 : 0.05; }
      floor.setColorAt(n, c.setHSL(h, 1, l)); }
    floor.instanceColor.needsUpdate = true;
    ledF.color.setHSL((t * 0.1) % 1, 1, 0.3 + pulse * 0.25);
    for (const b of beams) { b.piv.rotation.z = Math.sin(t * b.sp + b.ph) * 0.6; b.piv.rotation.x = Math.cos(t * b.sp * 0.8 + b.ph) * 0.45; }
    beamM.forEach((m, i) => { m.color.setHSL((i / 8 + t * 0.05) % 1, 1, 0.55); m.opacity = 0.08 + pulse * 0.1; });
    ball.rotation.y += dt * 0.5; if (sparks) sparks.rotation.y += dt * 0.35;
    lights[0].color.setHSL((t * 0.07) % 1, 1, 0.55); lights[1].color.setHSL((t * 0.07 + 0.5) % 1, 1, 0.55);
    lights[0].intensity = lights[0].userData.base * (0.6 + pulse * 0.6); lights[1].intensity = lights[1].userData.base * (0.6 + (1 - pulse) * 0.5);
  }
  return { group: g, lights, door: V(44, 0, 78), state, led, booth: boothG, update };
}

export const PLACE_BUILDERS = { celtic: buildCeltic, sushi: buildSushi, ashish: buildAshish, seghino: buildSeghino, millennium: buildMillennium };
