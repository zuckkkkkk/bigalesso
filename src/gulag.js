// IL GULAG DELLE DUE TORRI — secret basement easter egg (from the Corriere delle Due Torri n.313).
// Access: lounge bookshelf → pull the red book (or openPassage() from eggs.js) → shelf swings, trapdoor opens,
// stairs down → fade → the cellar (an enclosed set at x 30..42, z 0..12 on y=0; movement is 2D).
// Inside: courtroom ("Il Processo del Secolo" with IN ONDA + verdict), Cesco's cage, Gulag Suite (lava lamp, TV, snow
// window), Ghiaccio del Gulag corner (frost + colbacco), the Registro del Gulag board, posters from the paper.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvas, tex, rng, makeNoise, fbm, normalFromHeight, clamp, lerp, smooth, ease } from './util.js';
import { PROCESSO, GIUDICE, SUITE, GHIACCIO, AULA } from './gulag_assets.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const ROOM = { x0: 30, x1: 42, z0: 0, z1: 12 };
const SPRING = 2.0, RISE = 1.35;
// lounge passage (world coords, see world.js: bookshelf at (4.56,0,1.08), lounge floor x 4.35..10.2)
// the shelf swings 46° on its front/back-wall corner (a wider swing would hit the spritz cart of eggs.js at (5.55, 0.34))
const PIVOT = V(4.74, 0, 0.23), SWING = 46 * Math.PI / 180, SHELF_L = 1.72, SHELF_D = 0.38;
const HOLE = { x0: 4.38, x1: 5.02, z0: 1.12, z1: 2.04 }; // trapdoor in the strip the shelf frees; stairs run toward -x (west)
const ARRIVE = V(32.6, 0, 3.0), UPSTAIRS = V(5.35, 0, 2.55), DOWNSPOT = V(5.32, 0, 1.75);

// ------------------------------------------------------------------ textures
function brickTex(seed = 3, tint = [1, 1, 1]) {
  const N = 512, R = rng(seed), noise = makeNoise(seed + 4);
  const col = new Uint8ClampedArray(N * N * 4), hgt = new Float32Array(N * N);
  const rows = 12, rh = N / rows, bw = 128, mort = 5;
  const pal = [[150, 70, 46], [168, 84, 54], [132, 62, 42], [178, 98, 62], [120, 58, 40], [160, 92, 66], [104, 52, 38]];
  const tints = []; for (let i = 0; i < rows * 5; i++) { const p = pal[(R() * pal.length) | 0]; const k = 0.82 + R() * 0.3; tints.push([p[0] * k, p[1] * k, p[2] * k, R()]); }
  for (let y = 0; y < N; y++) {
    const r = Math.floor(y / rh), ly = y - r * rh, off = (r % 2) * bw / 2;
    for (let x = 0; x < N; x++) {
      const xx = (x + off) % N, c = Math.floor(xx / bw), lx = xx - c * bw, i = y * N + x, o = i * 4;
      const e = Math.min(lx, bw - 1 - lx, ly, rh - 1 - ly);
      const n = fbm(noise, x * 0.05, y * 0.05, 3, N * 0.05, N * 0.05);
      if (e < mort) { const g = 92 + n * 40; col[o] = g * tint[0]; col[o + 1] = (g - 6) * tint[1]; col[o + 2] = (g - 14) * tint[2]; col[o + 3] = 255; hgt[i] = 0.1 * n; continue; }
      const t = tints[(r * 5 + c) % tints.length];
      const sp = noise(x * 0.7, y * 0.7, N * 0.7, N * 0.7);
      const k = 0.82 + n * 0.35 + (sp - 0.5) * 0.14 - (t[3] > 0.8 ? 0.18 * n : 0);
      col[o] = t[0] * k * tint[0]; col[o + 1] = t[1] * k * tint[1]; col[o + 2] = t[2] * k * tint[2]; col[o + 3] = 255;
      hgt[i] = 0.55 + Math.min(1, (e - mort) / 3) * 0.3 + n * 0.25 + sp * 0.06;
    }
  }
  const c = canvas(N, N); c.getContext('2d').putImageData(new ImageData(col, N, N), 0, 0);
  const map = tex(c), normalMap = tex(normalFromHeight(hgt, N, N, 3.2, true), { srgb: false });
  for (const t of [map, normalMap]) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return { map, normalMap };
}
function flagstoneTex(seed = 9) {
  const N = 512, R = rng(seed), noise = makeNoise(seed);
  const col = new Uint8ClampedArray(N * N * 4), hgt = new Float32Array(N * N);
  // 2m x 2m: rows of stones
  const stones = []; let y = 0;
  while (y < N) { let h = Math.round((0.32 + R() * 0.28) * 256); if (N - y - h < 60) h = N - y; let x = Math.floor(R() * 120); const x0 = x; while (x < x0 + N) { let w = Math.round((0.38 + R() * 0.5) * 256); if (x + w > x0 + N - 70) w = x0 + N - x; stones.push({ x, y, w, h, k: 0.78 + R() * 0.3, t: R() }); x += w; } y += h; }
  for (const s of stones) for (let yy = 0; yy < s.h; yy++) for (let xx = 0; xx < s.w; xx++) {
    const px = (s.x + xx) % N, py = s.y + yy, i = py * N + px, o = i * 4;
    const e = Math.min(xx, s.w - 1 - xx, yy, s.h - 1 - yy);
    const n = fbm(noise, px * 0.03, py * 0.03, 4, N * 0.03, N * 0.03);
    if (e < 3) { const g = 38 + n * 22; col[o] = g; col[o + 1] = g - 2; col[o + 2] = g - 4; col[o + 3] = 255; hgt[i] = 0; continue; }
    const g = (104 + n * 70) * s.k; const warm = s.t * 10;
    col[o] = g + warm; col[o + 1] = g + warm * 0.6; col[o + 2] = g - 4; col[o + 3] = 255;
    hgt[i] = 0.5 + Math.min(1, (e - 3) / 6) * 0.3 + n * 0.25;
  }
  const c = canvas(N, N); c.getContext('2d').putImageData(new ImageData(col, N, N), 0, 0);
  const map = tex(c), normalMap = tex(normalFromHeight(hgt, N, N, 2.6, true), { srgb: false });
  for (const t of [map, normalMap]) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return { map, normalMap };
}
function rep(t, x, y) { const c = t.clone(); c.repeat.set(x, y); c.needsUpdate = true; return c; }
function brickMat(B, rx, ry, opts = {}) { return new THREE.MeshStandardMaterial({ map: rep(B.map, rx, ry), normalMap: rep(B.normalMap, rx, ry), normalScale: new THREE.Vector2(1, 1), roughness: 0.92, color: opts.color || 0xffffff, side: opts.side || THREE.FrontSide }); }
function imgTexture(a) { const t = new THREE.TextureLoader().load(a.url); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
function drawTex(w, h, fn, o) { const c = canvas(w, h); fn(c.getContext('2d'), w, h); return tex(c, o); }
const FONT = 'system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif';

// ------------------------------------------------------------------ build
export function buildGulag(ctx) {
  const { scene, level, lights, low = false, audio, ui, man, dog } = ctx;
  const getFX = () => (ctx.getFX ? ctx.getFX() : null);
  const root = new THREE.Group(); root.name = 'gulag'; scene.add(root);
  const ext = new THREE.Group(); ext.name = 'gulagPassage'; scene.add(ext);
  const colliders = level ? level.colliders : [], blockers = level ? level.cameraBlockers : [];
  const box = (x0, z0, x1, z1, id) => { const c = { type: 'box', min: [x0, z0], max: [x1, z1] }; if (id) c.gid = id; colliders.push(c); return c; };
  const circ = (x, z, r) => colliders.push({ type: 'circle', c: [x, z], r });
  const blk = (x0, y0, z0, x1, y1, z1) => blockers.push({ min: [x0, y0, z0], max: [x1, y1, z1] });
  const shadowy = m => { m.castShadow = false; m.receiveShadow = false; return m; };
  const mesh = (geo, mat, x, y, z, parent = root, rx = 0, ry = 0, rz = 0) => { const m = shadowy(new THREE.Mesh(geo, mat)); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); parent.add(m); return m; };
  const R = rng(313);

  // ---------- materials ----------
  const B = brickTex(3), BW = brickTex(5, [0.92, 0.9, 0.9]), FS = flagstoneTex(9);
  const wallLong = brickMat(B, 12, 2), wallEnd = brickMat(BW, 1, 1, { side: THREE.DoubleSide });
  const vaultMat = new THREE.MeshStandardMaterial({ map: rep(BW.map, 7, 12), normalMap: rep(BW.normalMap, 7, 12), roughness: 0.94, side: THREE.DoubleSide, color: 0xd8cfc4 });
  const floorMat = new THREE.MeshStandardMaterial({ map: rep(FS.map, 6, 6), normalMap: rep(FS.normalMap, 6, 6), roughness: 0.86 });
  const woodDark = new THREE.MeshStandardMaterial({ color: 0x3e2414, roughness: 0.48 });
  const woodMid = new THREE.MeshStandardMaterial({ color: 0x6a4024, roughness: 0.55 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x2b2b30, metalness: 0.75, roughness: 0.42 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 1, roughness: 0.28 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.5 });
  const white = new THREE.MeshStandardMaterial({ color: 0xefeee8, roughness: 0.7 });

  // ---------- shell: floor, walls, vaults ----------
  const cx = (ROOM.x0 + ROOM.x1) / 2, cz = (ROOM.z0 + ROOM.z1) / 2, LX = ROOM.x1 - ROOM.x0, LZ = ROOM.z1 - ROOM.z0;
  mesh(new THREE.PlaneGeometry(LX, LZ), floorMat, cx, 0.001, cz, root, -Math.PI / 2);
  mesh(new THREE.PlaneGeometry(LX, SPRING), wallLong, cx, SPRING / 2, ROOM.z0);
  mesh(new THREE.PlaneGeometry(LX, SPRING), wallLong, cx, SPRING / 2, ROOM.z1, root, 0, Math.PI);
  { // end walls with the two vault arches
    const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(12, 0); s.lineTo(12, SPRING);
    for (let i = 1; i <= 24; i++) { const a = (i / 24) * Math.PI; s.lineTo(9 + 3 * Math.cos(a), SPRING + RISE * Math.sin(a)); }
    for (let i = 1; i <= 24; i++) { const a = (i / 24) * Math.PI; s.lineTo(3 + 3 * Math.cos(a), SPRING + RISE * Math.sin(a)); }
    s.closePath();
    const g = new THREE.ShapeGeometry(s, 24); g.rotateY(-Math.PI / 2);
    mesh(g, wallEnd, ROOM.x0, 0, 0); mesh(g, wallEnd, ROOM.x1, 0, 0);
  }
  for (const zc of [3, 9]) { // barrel vaults (elliptical), seen from inside
    const g = new THREE.CylinderGeometry(3, 3, LX, 28, 1, true, 0, Math.PI); g.rotateZ(Math.PI / 2); g.scale(1, RISE / 3, 1);
    mesh(g, vaultMat, cx, SPRING, zc);
  }
  mesh(new THREE.BoxGeometry(LX, 0.3, 0.46), brickMat(B, 12, 0.3), cx, SPRING + 0.1, 6);
  for (const px of [33.0, 37.0]) { // pillars on the vault valley
    mesh(new THREE.BoxGeometry(0.48, SPRING, 0.48), brickMat(B, 0.5, 2), px, SPRING / 2, 6);
    mesh(new THREE.BoxGeometry(0.62, 0.12, 0.62), new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 0.9 }), px, SPRING - 0.02, 6);
    box(px - 0.26, 5.74, px + 0.26, 6.26);
  }
  // walls + camera blockers (thick, outside the room)
  box(ROOM.x0 - 0.4, ROOM.z0 - 0.4, ROOM.x1 + 0.4, ROOM.z0); box(ROOM.x0 - 0.4, ROOM.z1, ROOM.x1 + 0.4, ROOM.z1 + 0.4);
  box(ROOM.x0 - 0.4, ROOM.z0, ROOM.x0, ROOM.z1); box(ROOM.x1, ROOM.z0, ROOM.x1 + 0.4, ROOM.z1);
  blk(ROOM.x0 - 1, 0, -1, ROOM.x0, 6, 13); blk(ROOM.x1, 0, -1, ROOM.x1 + 1, 6, 13); blk(29, 0, -1, 43, 6, ROOM.z0); blk(29, 0, ROOM.z1, 43, 6, 13);
  for (const zc of [3, 9]) for (const [a, b] of [[0, 0.5], [0.5, 1], [1, 1.6], [1.6, 2.3], [2.3, 3]]) { // vault bands
    const y = SPRING + RISE * Math.sqrt(Math.max(0, 1 - ((3 - b) / 3) ** 2)) - 0.08;
    blk(29, y, zc - 3 + a, 43, 6, zc - 3 + b); blk(29, y, zc + 3 - b, 43, 6, zc + 3 - a);
  }
  blk(29, SPRING - 0.05, 5.7, 43, 6, 6.3);

  // ---------- entrance stairs (west, going up into darkness) ----------
  const stoneStep = new THREE.MeshStandardMaterial({ map: rep(FS.map, 0.6, 0.2), color: 0xb8b0a4, roughness: 0.9 });
  for (let k = 0; k < 9; k++) { const x1 = 31.9 - k * 0.2, h = (k + 1) * 0.18; mesh(new THREE.BoxGeometry(0.2, h, 1.1), stoneStep, x1 - 0.1, h / 2, 3.0); }
  mesh(new THREE.BoxGeometry(2.42, 0.035, 0.035), iron, 31.0, 0.9 * 0.9 + 0.92, 3.6, root, 0, 0, -Math.atan(0.9));
  for (const px of [31.75, 30.4]) mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.92, 8), iron, px, (31.9 - px) * 0.9 + 0.46, 3.6);
  blk(ROOM.x0, 0, 2.35, 31.85, 3.4, 3.65); // camera stays off the stairs
  { const up = drawTex(128, 256, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#6a4a2a'); g.addColorStop(0.25, '#1a120c'); g.addColorStop(1, '#030202'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
    const arch = mesh(new THREE.PlaneGeometry(1.12, 1.6), new THREE.MeshBasicMaterial({ map: up }), ROOM.x0 + 0.012, 1.62 + 0.8, 3.0, root, 0, Math.PI / 2); arch.renderOrder = 1; }
  box(ROOM.x0, 2.42, 31.72, 3.58, 'gulagStairs');

  // ---------- courtroom: platform, bench, chair, wig, gavel, scales, flag ----------
  mesh(new THREE.BoxGeometry(2.2, 0.25, 3.6), woodDark, 40.9, 0.125, 6.0);
  const legge = drawTex(1024, 384, (x, w, h) => {
    x.fillStyle = '#3e2414'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) { x.fillStyle = `rgba(0,0,0,${0.08 + Math.random() * 0.1})`; x.fillRect(0, Math.random() * h, w, 1 + Math.random() * 2); }
    x.strokeStyle = '#c9a14a'; x.lineWidth = 6; x.strokeRect(24, 24, w - 48, h - 48);
    x.fillStyle = '#e2c271'; x.textAlign = 'center'; x.font = `700 64px Georgia,serif`; x.fillText('LA LEGGE È UGUALE PER TUTTI', w / 2, 170);
    x.font = `italic 400 40px Georgia,serif`; x.fillStyle = '#c9a14a'; x.fillText('(tranne Cesco)', w / 2, 250);
  });
  const benchFront = [woodDark, woodDark, woodDark, woodDark, woodDark, woodDark];
  benchFront[1] = new THREE.MeshStandardMaterial({ map: legge, roughness: 0.5 });
  mesh(new THREE.BoxGeometry(0.1, 1.25, 3.0), benchFront, 40.05, 0.25 + 0.625, 6.0);
  mesh(new THREE.BoxGeometry(0.82, 0.06, 3.2), woodMid, 40.36, 1.53, 6.0);
  for (const pz of [4.52, 7.48]) mesh(new THREE.BoxGeometry(0.7, 1.25, 0.06), woodDark, 40.4, 0.875, pz);
  // judge chair + wig resting on it
  mesh(new THREE.BoxGeometry(0.1, 1.5, 0.72), new THREE.MeshStandardMaterial({ color: 0x5a1414, roughness: 0.6 }), 41.55, 0.25 + 0.95, 6.0);
  mesh(new THREE.BoxGeometry(0.6, 0.1, 0.64), new THREE.MeshStandardMaterial({ color: 0x5a1414, roughness: 0.6 }), 41.25, 0.8, 6.0);
  { const n = low ? 50 : 90; const wig = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshStandardMaterial({ color: 0xf1efe8, roughness: 0.85 }), n); const m4 = new THREE.Matrix4();
    for (let i = 0; i < n; i++) { const a = R() * Math.PI * 2, u = R(); let p; if (i < n * 0.55) { const th = u * 1.3; p = V(Math.sin(th) * Math.cos(a) * 0.12, Math.cos(th) * 0.11, Math.sin(th) * Math.sin(a) * 0.12); } else { const side = R() < 0.5 ? -1 : 1; p = V(-0.02 + R() * 0.06, -0.02 - R() * 0.2, side * (0.1 + R() * 0.03)); } m4.compose(p.add(V(41.47, 2.04, 6.0)), new THREE.Quaternion(), V(1, 1, 1).multiplyScalar(0.026 + R() * 0.012)); wig.setMatrixAt(i, m4); }
    root.add(wig); }
  // gavel (animated) + sound block
  mesh(new THREE.CylinderGeometry(0.065, 0.07, 0.03, 24), woodMid, 40.2, 1.575, 6.12);
  const gavel = new THREE.Group(); gavel.position.set(40.44, 1.6, 6.12); root.add(gavel);
  mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.26, 10), woodDark, -0.13, 0.0, 0, gavel, 0, 0, Math.PI / 2);
  mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.12, 16), woodDark, -0.24, 0.0, 0, gavel, Math.PI / 2);
  for (const dz of [-0.06, 0.06]) mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.012, 16), brass, -0.24, 0, dz, gavel, Math.PI / 2);
  // scales of justice
  { const g = new THREE.Group(); g.position.set(40.3, 1.56, 7.15); root.add(g);
    mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.36, 8), brass, 0, 0.18, 0, g); mesh(new THREE.BoxGeometry(0.008, 0.008, 0.32), brass, 0, 0.35, 0, g);
    for (const dz of [-0.15, 0.15]) { mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.16, 6), brass, 0, 0.27, dz, g); mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.015, 18), brass, 0, 0.19, dz, g); }
    mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.02, 18), brass, 0, 0.01, 0, g); }
  // nameplate
  mesh(new THREE.BoxGeometry(0.04, 0.09, 0.42), [brass, brass, brass, brass, new THREE.MeshStandardMaterial({ map: drawTex(512, 110, (x, w, h) => { x.fillStyle = '#1a120a'; x.fillRect(0, 0, w, h); x.fillStyle = '#e2c271'; x.font = `700 56px Georgia,serif`; x.textAlign = 'center'; x.fillText('IL GIUDICE', w / 2, 76); }), roughness: 0.4 }), brass], 39.99, 1.6, 5.4, root, 0, -Math.PI / 2);
  // Italian flag on a pole (waving)
  const flagPole = mesh(new THREE.CylinderGeometry(0.015, 0.015, 2.0, 8), brass, 41.65, 1.25, 7.55);
  const flagGeo = new THREE.PlaneGeometry(0.66, 0.44, 14, 6); flagGeo.translate(0.33, 0, 0);
  const flag = mesh(flagGeo, new THREE.MeshStandardMaterial({ map: drawTex(96, 64, (x) => { x.fillStyle = '#009246'; x.fillRect(0, 0, 32, 64); x.fillStyle = '#f1f2f1'; x.fillRect(32, 0, 32, 64); x.fillStyle = '#ce2b37'; x.fillRect(64, 0, 32, 64); }), side: THREE.DoubleSide, roughness: 0.8 }), 41.66, 1.98, 7.55, root, 0, Math.PI * 0.75);
  const flagBase = flagGeo.attributes.position.array.slice();
  box(39.8, 4.2, 42.0, 7.8); blk(39.8, 0, 4.2, 42.0, 1.62, 7.8); // platform + bench

  // ---------- IN ONDA sign on a stand ----------
  const ondaTex = drawTex(512, 160, (x, w, h) => { x.fillStyle = '#1a0306'; x.fillRect(0, 0, w, h); x.fillStyle = '#ff2236'; x.font = `900 108px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('IN ONDA', w / 2, h / 2 + 6); });
  const ondaMat = new THREE.MeshStandardMaterial({ color: 0x220306, emissive: 0xffffff, emissiveMap: ondaTex, emissiveIntensity: 0.25, map: ondaTex, roughness: 0.3 });
  { const g = new THREE.Group(); g.position.set(41.45, 0, 8.45); root.add(g);
    mesh(new THREE.CylinderGeometry(0.02, 0.025, 1.65, 8), iron, 0, 0.82, 0, g);
    for (let i = 0; i < 3; i++) { const a = i * 2.094; mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6), iron, Math.sin(a) * 0.18, 0.2, Math.cos(a) * 0.18, g, Math.cos(a) * 0.45, 0, -Math.sin(a) * 0.45); }
    mesh(new THREE.BoxGeometry(0.12, 0.3, 0.86), [black, ondaMat, black, black, black, black], 0, 1.8, 0, g, 0, 0, 0); g.rotation.y = 0.3; }
  circ(41.45, 8.45, 0.26); blk(41.1, 1.55, 7.95, 41.8, 2.05, 8.95);
  // TV cameras on tripods + mic stand
  const camBody = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.45, metalness: 0.3 });
  const tvCam = (x, z, yaw) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; root.add(g);
    for (let i = 0; i < 3; i++) { const a = i * 2.094; mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.35, 6), iron, Math.sin(a) * 0.26, 0.62, Math.cos(a) * 0.26, g, Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4); }
    mesh(new RoundedBoxGeometry(0.24, 0.26, 0.48, 2, 0.03), camBody, 0, 1.42, 0, g);
    mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.22, 20), black, 0, 1.42, 0.33, g, Math.PI / 2);
    mesh(new THREE.CircleGeometry(0.06, 20), new THREE.MeshStandardMaterial({ color: 0x223355, metalness: 1, roughness: 0.05 }), 0, 1.42, 0.442, g);
    mesh(new THREE.BoxGeometry(0.2, 0.14, 0.02), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x4a8acc, emissiveIntensity: 0.6 }), 0.17, 1.52, -0.12, g, 0, 0.6);
    const tally = mesh(new THREE.SphereGeometry(0.018, 10, 8), new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff1a1a, emissiveIntensity: 0.2 }), 0, 1.59, 0.15, g);
    circ(x, z, 0.36); return tally;
  };
  const tallies = [tvCam(37.85, 2.35, 0.62), tvCam(37.7, 9.75, 2.45)];
  { const g = new THREE.Group(); g.position.set(39.55, 0, 5.15); root.add(g);
    mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.3, 8), iron, 0, 0.65, 0, g); mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 18), iron, 0, 0.01, 0, g);
    ['#e8102a', '#ffd400', '#1a50c8', '#f4f4f4', '#18a058'].forEach((c, i) => { const a = (i - 2) * 0.35; const m = new THREE.Group(); m.position.set(0, 1.3, 0); m.rotation.set(0, a, -0.55); g.add(m);
      mesh(new THREE.CylinderGeometry(0.013, 0.01, 0.2, 10), black, -0.1, 0, 0, m, 0, 0, Math.PI / 2); mesh(new THREE.SphereGeometry(0.024, 12, 10), new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.9 }), -0.21, 0, 0, m);
      mesh(new THREE.BoxGeometry(0.045, 0.045, 0.045), new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }), -0.15, 0, 0, m); });
    circ(39.55, 5.15, 0.2); }
  // defence table (papers) + prosecutor table (vodka)
  const table = (x, z) => { mesh(new THREE.BoxGeometry(1.4, 0.05, 0.8), woodMid, x, 0.76, z); for (const [dx, dz] of [[-0.64, -0.34], [0.64, -0.34], [-0.64, 0.34], [0.64, 0.34]]) mesh(new THREE.BoxGeometry(0.05, 0.74, 0.05), woodDark, x + dx, 0.37, z + dz); box(x - 0.72, z - 0.42, x + 0.72, z + 0.42); };
  table(36.9, 4.0); table(36.9, 8.0);
  { const paper = new THREE.MeshStandardMaterial({ color: 0xf3efe4, roughness: 0.9 }), folder = new THREE.MeshStandardMaterial({ color: 0xc89a5a, roughness: 0.8 });
    for (let i = 0; i < 9; i++) mesh(new THREE.BoxGeometry(0.24, 0.012, 0.32), i % 3 ? paper : folder, 36.6 + (R() - 0.5) * 0.04, 0.79 + i * 0.014, 3.95 + (R() - 0.5) * 0.04, root, 0, (R() - 0.5) * 0.3);
    for (let i = 0; i < 6; i++) mesh(new THREE.BoxGeometry(0.21, 0.002, 0.3), paper, 37.0 + R() * 0.45, 0.787, 3.75 + R() * 0.45, root, 0, R() * 3);
    // banker's lamp
    mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.02, 16), brass, 37.45, 0.795, 4.3); mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.26, 6), brass, 37.45, 0.92, 4.3);
    mesh(new THREE.CylinderGeometry(0.03, 0.09, 0.07, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0x0e5a2a, emissive: 0x0e5a2a, emissiveIntensity: 0.15, roughness: 0.2, side: THREE.DoubleSide }), 37.45, 1.06, 4.3, root, 0, 0, 0.3);
    // vodka + shot glass for the pubblico ministero
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.35, clearcoat: 1 });
    mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.24, 18), glass, 37.25, 0.905, 8.0); mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.06, 12), glass, 37.25, 1.055, 8.0); mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 12), new THREE.MeshStandardMaterial({ color: 0xc81818 }), 37.25, 1.09, 8.0);
    mesh(new THREE.BoxGeometry(0.07, 0.07, 0.003), new THREE.MeshStandardMaterial({ map: drawTex(64, 64, (x) => { x.fillStyle = '#f4f0e6'; x.fillRect(0, 0, 64, 64); x.fillStyle = '#c81818'; x.font = `900 15px ${FONT}`; x.textAlign = 'center'; x.fillText('ВОДКА', 32, 38); }) }), 37.25, 0.9, 8.042);
    mesh(new THREE.CylinderGeometry(0.022, 0.017, 0.05, 14), glass, 37.05, 0.81, 8.1);
    // sunglasses + scarf: the capo delle guardie was here
    mesh(new THREE.BoxGeometry(0.14, 0.035, 0.012), black, 36.6, 0.795, 8.05, root, -Math.PI / 2.2); }

  // ---------- Cesco's cage (north) ----------
  const CG = { x0: 33.4, x1: 35.8, z0: 9.4, z1: ROOM.z1, door0: 34.2, door1: 35.0 };
  const barGeo = new THREE.CylinderGeometry(0.012, 0.012, 2.0, 6);
  const bars = []; const addBars = (x0, z0, x1, z1, skip) => { const L = Math.hypot(x1 - x0, z1 - z0), n = Math.round(L / 0.12); for (let i = 0; i <= n; i++) { const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t; if (skip && skip(x, z)) continue; bars.push([x, z]); } };
  addBars(CG.x0, CG.z0, CG.x1, CG.z0, x => x > CG.door0 - 0.01 && x < CG.door1 + 0.01);
  addBars(CG.x0, CG.z0, CG.x0, CG.z1 - 0.05); addBars(CG.x1, CG.z0, CG.x1, CG.z1 - 0.05);
  const barsIM = new THREE.InstancedMesh(barGeo, iron, bars.length); { const m4 = new THREE.Matrix4(); bars.forEach((b, i) => { m4.makeTranslation(b[0], 1.0, b[1]); barsIM.setMatrixAt(i, m4); }); root.add(barsIM); }
  for (const y of [0.04, 1.0, 1.98]) { mesh(new THREE.BoxGeometry(CG.door0 - CG.x0, 0.04, 0.03), iron, (CG.x0 + CG.door0) / 2, y, CG.z0); mesh(new THREE.BoxGeometry(CG.x1 - CG.door1, 0.04, 0.03), iron, (CG.door1 + CG.x1) / 2, y, CG.z0); for (const px of [CG.x0, CG.x1]) mesh(new THREE.BoxGeometry(0.03, 0.04, CG.z1 - CG.z0), iron, px, y, (CG.z0 + CG.z1) / 2); }
  const door = new THREE.Group(); door.position.set(CG.door0, 0, CG.z0); root.add(door);
  { const W2 = CG.door1 - CG.door0; for (let i = 1; i < 7; i++) mesh(barGeo, iron, i * W2 / 7, 1.0, 0, door); for (const y of [0.04, 1.0, 1.98]) mesh(new THREE.BoxGeometry(W2, 0.04, 0.03), iron, W2 / 2, y, 0, door); mesh(new THREE.BoxGeometry(0.03, 2.0, 0.03), iron, 0.01, 1.0, 0, door); mesh(new THREE.BoxGeometry(0.03, 2.0, 0.03), iron, W2 - 0.01, 1.0, 0, door); mesh(new THREE.BoxGeometry(0.08, 0.12, 0.05), brass, W2 - 0.06, 1.05, 0.03, door); }
  box(CG.x0 - 0.05, CG.z0 - 0.05, CG.door0, CG.z0 + 0.05); box(CG.door1, CG.z0 - 0.05, CG.x1 + 0.05, CG.z0 + 0.05);
  box(CG.x0 - 0.05, CG.z0, CG.x0 + 0.05, CG.z1); box(CG.x1 - 0.05, CG.z0, CG.x1 + 0.05, CG.z1);
  const doorCol = box(CG.door0, CG.z0 - 0.05, CG.door1, CG.z0 + 0.05, 'gulagCageDoor');
  // cell content: stool, prison uniform "CESCO", plaque
  mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 16), woodMid, 35.25, 0.45, 11.3); for (let i = 0; i < 3; i++) { const a = i * 2.094; mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.45, 6), woodDark, 35.25 + Math.sin(a) * 0.12, 0.22, 11.3 + Math.cos(a) * 0.12); }
  const uniTex = drawTex(256, 320, (x, w, h) => {
    x.clearRect(0, 0, w, h); x.fillStyle = '#8f9294'; x.beginPath(); x.moveTo(70, 20); x.lineTo(186, 20); x.lineTo(250, 80); x.lineTo(220, 120); x.lineTo(196, 100); x.lineTo(196, 300); x.lineTo(60, 300); x.lineTo(60, 100); x.lineTo(36, 120); x.lineTo(6, 80); x.closePath(); x.fill();
    x.fillStyle = '#6e7173'; for (let i = 0; i < 12; i++) x.fillRect(60, 110 + i * 16, 136, 3);
    x.fillStyle = '#f4f0e6'; x.fillRect(84, 120, 90, 40); x.fillStyle = '#111'; x.font = `900 26px ${FONT}`; x.textAlign = 'center'; x.fillText('CESCO', 129, 150);
    x.fillStyle = '#c81818'; x.font = `800 18px ${FONT}`; x.fillText('№ 313', 129, 190);
  });
  mesh(new THREE.PlaneGeometry(0.62, 0.78), new THREE.MeshStandardMaterial({ map: uniTex, transparent: true, alphaTest: 0.5, roughness: 0.95, side: THREE.DoubleSide }), 34.2, 1.35, ROOM.z1 - 0.03, root, 0, Math.PI);
  mesh(new THREE.BoxGeometry(0.62, 0.22, 0.02), new THREE.MeshStandardMaterial({ map: drawTex(512, 180, (x, w, h) => { x.fillStyle = '#c9a14a'; x.fillRect(0, 0, w, h); x.fillStyle = '#2a1a08'; x.textAlign = 'center'; x.font = `900 46px ${FONT}`; x.fillText('CELLA: CESCO', w / 2, 72); x.font = `600 30px ${FONT}`; x.fillText('Occupata, per precauzione', w / 2, 128); }), metalness: 0.6, roughness: 0.35 }), (CG.x0 + CG.door0) / 2, 1.55, CG.z0 - 0.03);

  // ---------- Gulag Suite (south-east): hippie cell ----------
  const SU = { x0: 38.6, x1: ROOM.x1, z0: ROOM.z0, z1: 2.9, gap0: 40.2, gap1: 41.0 };
  const sbars = [];
  { const L = SU.x1 - SU.x0; const n = Math.round(L / 0.12); for (let i = 0; i <= n; i++) { const x = SU.x0 + L * i / n; if (x > SU.gap0 && x < SU.gap1) continue; sbars.push([x, SU.z1]); } const n2 = Math.round((SU.z1 - SU.z0) / 0.12); for (let i = 0; i < n2; i++) sbars.push([SU.x0, SU.z0 + 0.06 + (SU.z1 - SU.z0 - 0.06) * i / n2]); }
  const sIM = new THREE.InstancedMesh(barGeo, new THREE.MeshStandardMaterial({ color: 0x3a6a3a, metalness: 0.5, roughness: 0.5 }), sbars.length); { const m4 = new THREE.Matrix4(); sbars.forEach((b, i) => { m4.makeTranslation(b[0], 1.0, b[1]); sIM.setMatrixAt(i, m4); }); root.add(sIM); }
  for (const y of [0.04, 1.98]) { mesh(new THREE.BoxGeometry(SU.gap0 - SU.x0, 0.04, 0.03), iron, (SU.x0 + SU.gap0) / 2, y, SU.z1); mesh(new THREE.BoxGeometry(SU.x1 - SU.gap1, 0.04, 0.03), iron, (SU.gap1 + SU.x1) / 2, y, SU.z1); mesh(new THREE.BoxGeometry(0.03, 0.04, SU.z1 - SU.z0), iron, SU.x0, y, (SU.z0 + SU.z1) / 2); }
  { // flowers woven on the bars
    const fl = drawTex(64, 64, (x) => { x.clearRect(0, 0, 64, 64); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; x.fillStyle = '#fff'; x.beginPath(); x.ellipse(32 + Math.cos(a) * 14, 32 + Math.sin(a) * 14, 11, 7, a, 0, 7); x.fill(); } x.fillStyle = '#ffd23a'; x.beginPath(); x.arc(32, 32, 8, 0, 7); x.fill(); });
    const n = low ? 40 : 80; const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.13, 0.13), new THREE.MeshStandardMaterial({ map: fl, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 }), n); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    const cols = ['#ff6fae', '#ffd23a', '#ff8a3a', '#ffffff', '#b66bff', '#ff4a4a', '#7ad0ff'];
    for (let i = 0; i < n; i++) { const b = sbars[(R() * sbars.length) | 0]; const onFront = Math.abs(b[1] - SU.z1) < 0.01; q.setFromEuler(new THREE.Euler(0, onFront ? 0 : Math.PI / 2, R() * 6)); m4.compose(V(b[0] + (onFront ? 0 : 0.02), 0.25 + R() * 1.7, b[1] + (onFront ? 0.02 : 0)), q, V(1, 1, 1).multiplyScalar(0.7 + R() * 0.8)); im.setMatrixAt(i, m4); im.setColorAt(i, col.set(cols[(R() * cols.length) | 0])); }
    root.add(im); }
  mesh(new THREE.BoxGeometry(0.62, 0.15, 0.02), new THREE.MeshStandardMaterial({ map: drawTex(512, 124, (x, w, h) => { x.fillStyle = '#b8903c'; x.fillRect(0, 0, w, h); x.strokeStyle = '#6a4a14'; x.lineWidth = 6; x.strokeRect(8, 8, w - 16, h - 16); x.fillStyle = '#2a1a06'; x.font = `800 62px Georgia,serif`; x.textAlign = 'center'; x.fillText('GULAG · SUITE', w / 2, 84); }), metalness: 0.7, roughness: 0.3 }), 39.4, 1.62, SU.z1 + 0.03);
  // hippie wall painting (peace + rainbows + flowers) on the south wall inside the suite
  const hippie = drawTex(1024, 600, (x, w, h) => {
    x.fillStyle = '#f08a2e'; x.fillRect(0, 0, w, h);
    const rb = ['#e8282a', '#ff8c1a', '#ffd21a', '#3fae3a', '#2a7ad8', '#7a3ac8'];
    for (const [cx0, cy0, s] of [[180, 430, 1], [860, 470, 0.8]]) rb.forEach((c, i) => { x.strokeStyle = c; x.lineWidth = 26 * s; x.beginPath(); x.arc(cx0, cy0, (210 - i * 26) * s, Math.PI, 0); x.stroke(); });
    x.strokeStyle = '#c81c1c'; x.lineWidth = 26; x.beginPath(); x.arc(520, 280, 160, 0, 7); x.stroke(); x.beginPath(); x.moveTo(520, 120); x.lineTo(520, 440); x.moveTo(520, 280); x.lineTo(407, 393); x.moveTo(520, 280); x.lineTo(633, 393); x.stroke();
    for (let i = 0; i < 26; i++) { const fx0 = Math.random() * w, fy = Math.random() * h, r = 14 + Math.random() * 18; x.fillStyle = ['#ff6fae', '#ffffff', '#ffd23a', '#b66bff'][i % 4]; for (let k = 0; k < 5; k++) { const a = k * 1.2566; x.beginPath(); x.arc(fx0 + Math.cos(a) * r, fy + Math.sin(a) * r, r * 0.6, 0, 7); x.fill(); } x.fillStyle = '#ffcf33'; x.beginPath(); x.arc(fx0, fy, r * 0.45, 0, 7); x.fill(); }
    x.fillStyle = '#fff'; x.font = `italic 700 54px Georgia,serif`; x.textAlign = 'center'; x.fillText('Pace e amore', 520, 560);
  });
  mesh(new THREE.PlaneGeometry(SU.x1 - SU.x0 - 0.05, 1.7), new THREE.MeshStandardMaterial({ map: hippie, roughness: 0.92 }), (SU.x0 + SU.x1) / 2, 1.0, ROOM.z0 + 0.012);
  // orange shag carpet
  const shag = drawTex(256, 256, (x, w, h) => { x.fillStyle = '#d8661c'; x.fillRect(0, 0, w, h); for (let i = 0; i < 6000; i++) { const v = Math.random(); x.fillStyle = v < 0.5 ? '#f08a2e' : v < 0.8 ? '#b44a10' : '#ffa850'; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); } });
  shag.wrapS = shag.wrapT = THREE.RepeatWrapping; shag.repeat.set(3, 2.5);
  mesh(new THREE.PlaneGeometry(SU.x1 - SU.x0 - 0.1, SU.z1 - SU.z0 - 0.1), new THREE.MeshStandardMaterial({ map: shag, roughness: 1 }), (SU.x0 + SU.x1) / 2, 0.006, (SU.z0 + SU.z1) / 2, root, -Math.PI / 2);
  // bed with psychedelic cover
  const cover = drawTex(256, 256, (x, w, h) => { for (let y = 0; y < h; y += 4) for (let xx = 0; xx < w; xx += 4) { const v = Math.sin(xx * 0.06 + Math.sin(y * 0.05) * 3) + Math.cos(y * 0.07 - xx * 0.02); x.fillStyle = ['#ff6f3a', '#ffd23a', '#c83a8a', '#3ab0a0', '#7a3ac8'][((v + 2) * 1.2 | 0) % 5]; x.fillRect(xx, y, 4, 4); } });
  mesh(new THREE.BoxGeometry(1.95, 0.28, 1.2), woodDark, 40.92, 0.14, 0.65);
  mesh(new RoundedBoxGeometry(1.92, 0.16, 1.18, 2, 0.05), new THREE.MeshStandardMaterial({ map: cover, roughness: 0.95 }), 40.92, 0.35, 0.65);
  mesh(new RoundedBoxGeometry(0.42, 0.12, 0.32, 2, 0.05), white, 41.65, 0.48, 0.65);
  box(39.92, ROOM.z0, ROOM.x1, 1.28);
  // beanbag
  { const g = new THREE.SphereGeometry(0.42, 24, 16); g.scale(1, 0.62, 1); const bb = mesh(g, new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.55 }), 39.2, 0.24, 1.45); bb.rotation.z = 0.1; circ(39.2, 1.45, 0.38); }
  // low table with ice bucket + shots
  mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 24), woodMid, 39.6, 0.36, 2.35); mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.34, 8), woodDark, 39.6, 0.17, 2.35);
  mesh(new THREE.CylinderGeometry(0.08, 0.065, 0.14, 18, 1, true), new THREE.MeshStandardMaterial({ color: 0xd8d8dc, metalness: 1, roughness: 0.2, side: THREE.DoubleSide }), 39.55, 0.445, 2.33);
  circ(39.6, 2.35, 0.3);
  // CRT TV (toggle) on a stand
  const tvCan = canvas(160, 120), tvX = tvCan.getContext('2d'); const tvTex = tex(tvCan, { nearest: false }); tvX.fillStyle = '#050505'; tvX.fillRect(0, 0, 160, 120); tvTex.needsUpdate = true;
  const tvScreenMat = new THREE.MeshBasicMaterial({ map: tvTex, color: 0x777777 });
  const TVP = V(39.0, 0, 0.42);
  { const g = new THREE.Group(); g.position.copy(TVP); g.rotation.y = 0.55; root.add(g);
    mesh(new THREE.BoxGeometry(0.5, 0.42, 0.4), woodMid, 0, 0.21, 0, g);
    mesh(new RoundedBoxGeometry(0.52, 0.42, 0.44, 3, 0.04), new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.5 }), 0, 0.63, 0, g);
    mesh(new THREE.PlaneGeometry(0.36, 0.27), tvScreenMat, -0.04, 0.64, 0.222, g);
    for (const dx of [0.19]) { mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.02, 12), brass, dx, 0.7, 0.225, g, Math.PI / 2); mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.02, 12), brass, dx, 0.6, 0.225, g, Math.PI / 2); }
    mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.4, 4), iron, -0.12, 1.0, 0, g, 0, 0, 0.4); mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.4, 4), iron, 0.12, 1.0, 0, g, 0, 0, -0.4);
    box(38.7, 0.12, 39.32, 0.75); }
  // lava lamp on a side table
  const LAVA = V(41.62, 0, 2.42);
  const lavaBlobs = []; const lavaMat = new THREE.MeshStandardMaterial({ color: 0x401000, emissive: 0xff5a1a, emissiveIntensity: 0.4, roughness: 0.3 });
  const lavaGlass = new THREE.MeshStandardMaterial({ color: 0x3a1a6a, emissive: 0x5a2aa0, emissiveIntensity: 0.15, transparent: true, opacity: 0.55, roughness: 0.1 });
  { mesh(new THREE.BoxGeometry(0.42, 0.5, 0.36), woodMid, LAVA.x, 0.25, LAVA.z);
    mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.14, 20), brass, LAVA.x, 0.57, LAVA.z);
    mesh(new THREE.CylinderGeometry(0.045, 0.065, 0.36, 24), lavaGlass, LAVA.x, 0.82, LAVA.z);
    mesh(new THREE.CylinderGeometry(0.025, 0.045, 0.07, 18), brass, LAVA.x, 1.035, LAVA.z);
    for (let i = 0; i < 5; i++) { const b = mesh(new THREE.SphereGeometry(0.022 + R() * 0.012, 12, 10), lavaMat, LAVA.x, 0.7, LAVA.z); b.userData = { ph: R() * 6, sp: 0.25 + R() * 0.25 }; lavaBlobs.push(b); }
    box(LAVA.x - 0.22, LAVA.z - 0.19, LAVA.x + 0.22, LAVA.z + 0.19); }
  // barred window with snow (south wall, high)
  const snowMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      void main(){ vec3 col = mix(vec3(0.02,0.035,0.08), vec3(0.09,0.13,0.24), vUv.y); float s = 0.0;
        for(int l=0;l<3;l++){ float fl=float(l), sc=5.0+fl*4.0; vec2 uv=vUv*vec2(sc*1.7,sc); uv.y+=uTime*(0.35+fl*0.22); uv.x+=sin(uTime*0.4+fl*2.0+uv.y*0.5)*0.25;
          vec2 id=floor(uv), f=fract(uv)-0.5; vec2 o=vec2(h(id+3.1)-0.5,h(id+5.7)-0.5)*0.6; float d=length(f-o); s+=smoothstep(0.09-fl*0.02,0.0,d)*step(0.35,h(id+fl*7.0)); }
        col += vec3(s)*0.85; gl_FragColor = vec4(col,1.0);
        #include <colorspace_fragment>
      }` });
  mesh(new THREE.PlaneGeometry(0.56, 0.3), snowMat, 39.45, 1.72, ROOM.z0 + 0.032);
  for (const [w, h, dx, dy] of [[0.66, 0.05, 0, 0.175], [0.66, 0.05, 0, -0.175], [0.05, 0.4, 0.305, 0], [0.05, 0.4, -0.305, 0]]) mesh(new THREE.BoxGeometry(w, h, 0.06), woodDark, 39.45 + dx, 1.72 + dy, ROOM.z0 + 0.03);
  mesh(new THREE.BoxGeometry(0.62, 0.03, 0.09), woodDark, 39.45, 1.53, ROOM.z0 + 0.045);
  for (let i = 1; i < 6; i++) mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 6), iron, 39.45 - 0.28 + i * 0.0933, 1.72, ROOM.z0 + 0.05);
  // rattan pendant lamp
  { const rat = drawTex(128, 64, (x, w, h) => { x.fillStyle = '#c8924a'; x.fillRect(0, 0, w, h); x.strokeStyle = '#7a4a1a'; x.lineWidth = 2; for (let i = -64; i < 128; i += 8) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 64, 64); x.stroke(); x.beginPath(); x.moveTo(i + 64, 0); x.lineTo(i, 64); x.stroke(); } });
    mesh(new THREE.SphereGeometry(0.22, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), new THREE.MeshStandardMaterial({ map: rat, emissive: 0xffa040, emissiveIntensity: 0.6, emissiveMap: rat, side: THREE.DoubleSide, roughness: 0.8 }), 40.3, 2.38, 1.4);
    mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.75, 4), black, 40.3, 2.85, 1.4); }
  box(SU.x0 - 0.05, SU.z1 - 0.05, SU.gap0, SU.z1 + 0.05); box(SU.gap1, SU.z1 - 0.05, SU.x1, SU.z1 + 0.05); box(SU.x0 - 0.05, ROOM.z0, SU.x0 + 0.05, SU.z1);

  // ---------- Ghiaccio del Gulag corner (north-east) ----------
  const ICE = V(41.0, 0, 10.95);
  const iceMat = new THREE.MeshPhysicalMaterial({ color: 0xcfe9ff, roughness: 0.12, transparent: true, opacity: 0.78, clearcoat: 1, emissive: 0x2a5a8a, emissiveIntensity: 0.25 });
  mesh(new RoundedBoxGeometry(0.78, 0.5, 0.56, 3, 0.05), iceMat, ICE.x, 0.25, ICE.z);
  for (let i = 0; i < 5; i++) mesh(new RoundedBoxGeometry(0.1, 0.08, 0.1, 2, 0.02), iceMat, ICE.x - 0.5 + R() * 0.25, 0.04, ICE.z - 0.2 + R() * 0.5, root, 0, R() * 3);
  const bagTex = drawTex(512, 256, (x, w, h) => { x.fillStyle = '#b8141c'; x.fillRect(0, 0, w, h); for (let i = 0; i < 2000; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * 0.12})`; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); } x.fillStyle = '#f6eee8'; x.font = `900 52px Impact,${FONT}`; x.textAlign = 'center'; x.fillText('GHIACCIO', w / 4, 120); x.fillText('DEL GULAG', w / 4, 176); });
  { const g = new THREE.SphereGeometry(0.17, 28, 20); g.scale(1, 0.82, 1); const bag = mesh(g, new THREE.MeshStandardMaterial({ map: bagTex, roughness: 0.75 }), ICE.x - 0.12, 0.63, ICE.z); bag.rotation.y = -Math.PI / 2 - 0.4;
    mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.06, 20), new THREE.MeshStandardMaterial({ color: 0x9a1016, roughness: 0.8 }), ICE.x - 0.12, 0.79, ICE.z);
    mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.04, 22), new THREE.MeshStandardMaterial({ color: 0xd0d0d4, metalness: 1, roughness: 0.25 }), ICE.x - 0.12, 0.835, ICE.z); }
  // ushanka (colbacco) with red star — wearable
  function makeUshanka() {
    const g = new THREE.Group(); const fur = new THREE.MeshStandardMaterial({ color: 0x4a3c32, roughness: 1 }), furL = new THREE.MeshStandardMaterial({ color: 0x5a4a3e, roughness: 1 });
    mesh(new THREE.CylinderGeometry(0.105, 0.115, 0.11, 24), fur, 0, 0.06, 0, g); mesh(new THREE.SphereGeometry(0.105, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), fur, 0, 0.115, 0, g);
    mesh(new THREE.TorusGeometry(0.118, 0.03, 10, 28), furL, 0, 0.03, 0, g, Math.PI / 2);
    for (const s of [-1, 1]) mesh(new RoundedBoxGeometry(0.03, 0.13, 0.11, 2, 0.012), furL, s * 0.12, -0.02, 0.0, g);
    const star = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.011 : 0.026; const px = Math.cos(a) * r, py = -Math.sin(a) * r; if (i) star.lineTo(px, py); else star.moveTo(px, py); }
    mesh(new THREE.ShapeGeometry(star), new THREE.MeshStandardMaterial({ color: 0xd81818, emissive: 0x500000, metalness: 0.4, roughness: 0.3 }), 0, 0.08, 0.142, g);
    return g;
  }
  const hatOnIce = makeUshanka(); hatOnIce.position.set(ICE.x + 0.18, 0.5, ICE.z + 0.05); hatOnIce.rotation.y = -0.9; root.add(hatOnIce);
  mesh(new THREE.CylinderGeometry(0.024, 0.018, 0.055, 14), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.04, transparent: true, opacity: 0.4, clearcoat: 1 }), ICE.x + 0.24, 0.53, ICE.z - 0.18);
  // frost on walls/floor + icicles + mist
  const frostTex = drawTex(256, 256, (x, w, h) => { const g = x.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(235,248,255,0.42)'); g.addColorStop(0.55, 'rgba(210,235,255,0.16)'); g.addColorStop(1, 'rgba(210,235,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); x.strokeStyle = 'rgba(255,255,255,0.22)'; x.lineWidth = 1; for (let i = 0; i < 40; i++) { const a = Math.random() * 6.28, r = Math.random() * 70; let px = w / 2 + Math.cos(a) * r, py = h / 2 + Math.sin(a) * r; x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 4; k++) { px += (Math.random() - 0.5) * 22; py += (Math.random() - 0.5) * 22; x.lineTo(px, py); } x.stroke(); } });
  const frostMat = new THREE.MeshStandardMaterial({ map: frostTex, transparent: true, depthWrite: false, roughness: 0.3, emissive: 0x8ab8e8, emissiveIntensity: 0.02 });
  mesh(new THREE.PlaneGeometry(1.8, 1.6), frostMat, 40.9, 0.7, ROOM.z1 - 0.012, root, 0, Math.PI);
  mesh(new THREE.PlaneGeometry(1.8, 1.6), frostMat, ROOM.x1 - 0.012, 0.7, 11.0, root, 0, -Math.PI / 2);
  mesh(new THREE.PlaneGeometry(1.8, 1.6), frostMat, 41.0, 0.004, 11.0, root, -Math.PI / 2);
  for (let i = 0; i < 9; i++) { const L = 0.12 + R() * 0.25; mesh(new THREE.ConeGeometry(0.02 + R() * 0.015, L, 8), iceMat, 39.9 + i * 0.22, SPRING - L / 2 + 0.02, ROOM.z1 - 0.06, root, Math.PI); }
  const mistTex = drawTex(128, 128, (x, w, h) => { const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
  const mists = []; for (let i = 0; i < 6; i++) { const m = mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: mistTex, transparent: true, depthWrite: false, opacity: 0.16, color: 0xdff2ff }), ICE.x - 0.3 + R() * 0.6, 0.25 + R() * 0.3, ICE.z - 0.4 + R() * 0.5); m.userData = { ph: R() * 6, base: m.position.clone() }; mists.push(m); }
  box(ICE.x - 0.42, ICE.z - 0.3, ICE.x + 0.42, ICE.z + 0.3);

  // ---------- posters, register, cells board, wall stencil ----------
  const frame = (img, w, h, x, y, z, ry, matte = 0.04) => {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; root.add(g);
    mesh(new THREE.BoxGeometry(w + matte * 2 + 0.04, h + matte * 2 + 0.04, 0.03), new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.5 }), 0, 0, 0.015, g);
    mesh(new THREE.PlaneGeometry(w + matte * 2, h + matte * 2), new THREE.MeshStandardMaterial({ color: 0xece6d8, roughness: 0.9 }), 0, 0, 0.032, g);
    mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: imgTexture(img), roughness: 0.55 }), 0, 0, 0.034, g);
    mesh(new THREE.PlaneGeometry(w + matte * 2, h + matte * 2), new THREE.MeshPhysicalMaterial({ color: 0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, roughness: 0.05, envMapIntensity: 0.8 }), 0, 0, 0.04, g);
  };
  frame(PROCESSO, 0.66, 0.99, 32.95, 1.12, ROOM.z0 + 0.005, 0, 0.0);
  frame(GIUDICE, 0.42, 0.525, 34.35, 1.3, ROOM.z0 + 0.005, 0);
  frame(AULA, 0.84, 0.56, 35.95, 1.3, ROOM.z0 + 0.005, 0);
  frame(SUITE, 0.48, 0.6, 37.65, 1.3, ROOM.z0 + 0.005, 0);
  frame(GHIACCIO, 0.6, 0.6, ROOM.x1 - 0.005, 1.25, 9.6, -Math.PI / 2);
  const regTex = drawTex(1024, 720, (x, w, h) => {
    x.fillStyle = '#17241c'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; x.fillRect(Math.random() * w, Math.random() * h, 3 + Math.random() * 30, 1 + Math.random() * 3); }
    x.fillStyle = '#f2efe2'; x.textAlign = 'center'; x.font = `700 50px "Comic Sans MS","Chalkboard SE",${FONT}`; x.fillText('★ IL REGISTRO DEL GULAG ★', w / 2, 72);
    x.font = `400 26px "Comic Sans MS","Chalkboard SE",${FONT}`; x.fillStyle = '#cfd8c8'; x.fillText('Appello della settimana · puntata 2 · verbale n. 47', w / 2, 112);
    const rows = [['SGHINO', 80, 'LIBERATO (capo della Resistenza)'], ['ZUCCO', 59, 'IN LICENZA GTA'], ['FEDE', 36, 'IN REGOLA'], ['ASCHE', 31, 'SOPRAVVISSUTO ALLA POZIONE'], ['FORLA', 28, 'SOSPETTATO DI TRADIMENTO'], ['LOMBU', 27, 'EDITORE CLANDESTINO'], ['CATTA', 17, 'IN REGOLA'], ['PARME', 17, 'REO CONFESSO'], ['MIRCO', 11, 'SEGNALATO AL GULAG'], ['CESCO', 2, 'INDAGATO · IN CELLA'], ['JACOPO', 0, 'NON PERVENUTO']];
    x.textAlign = 'left'; x.font = `400 33px "Comic Sans MS","Chalkboard SE",${FONT}`;
    rows.forEach((r, i) => { const y = 168 + i * 46; x.fillStyle = i === 9 ? '#ff9a8a' : '#f2efe2'; x.fillText(r[0], 70, y); x.textAlign = 'right'; x.fillText(String(r[1]), 400, y); x.textAlign = 'left'; x.fillStyle = i === 9 ? '#ff9a8a' : '#c8d6be'; x.fillText(r[2], 440, y); });
    x.fillStyle = '#f2efe2'; x.font = `italic 400 30px "Comic Sans MS",${FONT}`; x.textAlign = 'center'; x.fillText('Il ghiaccio resta. Il direttore osserva.', w / 2, 690);
  });
  { const g = new THREE.Group(); g.position.set(37.7, 1.18, ROOM.z1 - 0.01); g.rotation.y = Math.PI; root.add(g);
    mesh(new THREE.BoxGeometry(1.62, 1.16, 0.04), woodMid, 0, 0, 0.0, g); mesh(new THREE.PlaneGeometry(1.5, 1.05), new THREE.MeshStandardMaterial({ map: regTex, roughness: 0.95 }), 0, 0, 0.022, g);
    mesh(new THREE.BoxGeometry(1.5, 0.03, 0.06), woodMid, 0, -0.6, 0.04, g); mesh(new THREE.BoxGeometry(0.08, 0.02, 0.02), white, 0.4, -0.575, 0.05, g); }
  const cellsTex = drawTex(512, 400, (x, w, h) => {
    x.fillStyle = '#2a2622'; x.fillRect(0, 0, w, h); x.strokeStyle = '#c9a14a'; x.lineWidth = 4; x.strokeRect(10, 10, w - 20, h - 20);
    x.fillStyle = '#e2c271'; x.font = `800 40px ${FONT}`; x.textAlign = 'center'; x.fillText('LE CELLE', w / 2, 62);
    x.textAlign = 'left'; x.font = `600 25px ${FONT}`; x.fillStyle = '#f0e8d8';
    [['№ 312', 'Siscov M. · «inshallah!»'], ['№ 281', 'Adelina B. · lavora a maglia'], ['CESCO', 'Occupata, per precauzione'], ['VISTA', 'Libera, per un tecnico']].forEach((r, i) => { const y = 122 + i * 66; x.fillStyle = '#e2c271'; x.fillText(r[0], 34, y); x.fillStyle = '#f0e8d8'; x.fillText(r[1], 150, y); });
  });
  { const g = new THREE.Group(); g.position.set(32.25, 1.3, ROOM.z1 - 0.01); g.rotation.y = Math.PI; root.add(g); mesh(new THREE.BoxGeometry(0.78, 0.62, 0.03), woodDark, 0, 0, 0, g); mesh(new THREE.PlaneGeometry(0.72, 0.56), new THREE.MeshStandardMaterial({ map: cellsTex, roughness: 0.8 }), 0, 0, 0.017, g); }
  const stencil = drawTex(1400, 500, (x, w, h) => {
    x.clearRect(0, 0, w, h); x.fillStyle = 'rgba(214,30,30,0.95)'; x.textAlign = 'center';
    x.font = `900 230px Impact,"Arial Black",${FONT}`; x.fillText('GЦLДG', w / 2, 230);
    x.font = `900 92px Impact,"Arial Black",${FONT}`; x.fillText('DЄLLЄ DЦЄ TOЯЯI', w / 2, 352);
    x.font = `700 44px ${FONT}`; x.fillStyle = 'rgba(30,20,18,0.85)'; x.fillText('LA PRIMA NOTTE È GRATIS, L\'USCITA NO', w / 2, 440);
    x.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 2600; i++) { x.fillStyle = `rgba(0,0,0,${Math.random() * 0.6})`; x.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 6, 2 + Math.random() * 4); }
  });
  mesh(new THREE.PlaneGeometry(3.6, 1.29), new THREE.MeshStandardMaterial({ map: stencil, transparent: true, depthWrite: false, roughness: 0.9 }), ROOM.x0 + 0.014, 1.25, 8.4, root, 0, Math.PI / 2);

  // ---------- bulbs + lights (only on while inside: avoids light-count cost/recompiles elsewhere) ----------
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  const bulbs = [];
  const bulb = (x, y, z, color, intensity, dist, top) => {
    mesh(new THREE.CylinderGeometry(0.004, 0.004, top - y, 4), black, x, (y + top) / 2 + 0.05, z);
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 10), brass, x, y + 0.07, z);
    const b = mesh(new THREE.SphereGeometry(0.045, 14, 10), bulbMat, x, y, z);
    const L = new THREE.PointLight(color, 0, dist, 2); L.position.set(x, y - 0.05, z); L.visible = false; root.add(L);
    bulbs.push({ L, base: intensity, mesh: b, ph: R() * 10 }); return L;
  };
  bulb(33.8, 2.62, 2.7, 0xffb46b, 9, 9, 3.2);
  bulb(34.6, 2.58, 9.4, 0xffb46b, 7, 8, 3.2);
  bulb(38.4, 2.5, 6.9, 0xffc27a, 13, 10, 2.9);
  bulb(40.3, 2.2, 1.4, 0xff9a50, 7, 6, 2.3);
  const redL = new THREE.PointLight(0xff2030, 0, 5, 2); redL.position.set(41.2, 1.9, 8.1); redL.visible = false; root.add(redL);
  const iceL = new THREE.PointLight(0x9ad0ff, 0, 4, 2); iceL.position.set(40.9, 1.2, 10.2); iceL.visible = false; root.add(iceL);

  // ================================================================== lounge passage
  const lroot = level && level.root ? level.root : null;
  const shelf = lroot && lroot.userData.bookshelf;
  const lf = lroot && lroot.userData.loungeFloor;
  const piv = new THREE.Group(); piv.position.copy(PIVOT); ext.add(piv);
  let book = null;
  if (shelf) {
    shelf.updateMatrixWorld(true); piv.updateMatrixWorld(true); piv.attach(shelf);
    const bt = drawTex(64, 256, (x, w, h) => { x.fillStyle = '#8a1016'; x.fillRect(0, 0, w, h); x.fillStyle = '#e2c271'; x.fillRect(0, 26, w, 6); x.fillRect(0, h - 34, w, 6); x.save(); x.translate(w / 2, h / 2); x.rotate(-Math.PI / 2); x.font = `800 26px Georgia,serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('GULAG', 0, 0); x.restore(); });
    book = new THREE.Group();
    const bm = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.27, 0.036), [new THREE.MeshStandardMaterial({ map: bt, roughness: 0.6 }), new THREE.MeshStandardMaterial({ color: 0x8a1016 }), new THREE.MeshStandardMaterial({ color: 0xe8e0cc }), new THREE.MeshStandardMaterial({ color: 0xe8e0cc }), new THREE.MeshStandardMaterial({ color: 0x8a1016 }), new THREE.MeshStandardMaterial({ color: 0x8a1016 })]);
    bm.position.set(0, 0.135, 0); bm.castShadow = true; book.add(bm);
    book.position.set(0.11, 1.2625, 0.55); book.rotation.z = -0.12; shelf.add(book);
  }
  // shelf collider (level box): swapped for a chain of small boxes along the swung shelf while open
  const shelfCol = colliders.find(c => c.type === 'box' && Math.abs(c.min[0] - 4.35) < 0.01 && Math.abs(c.min[1] - 0.2) < 0.01 && Math.abs(c.max[0] - 4.77) < 0.01);
  const shelfHome = shelfCol ? { min: [...shelfCol.min], max: [...shelfCol.max] } : null;
  const shelfSegs = [];
  { const sn = Math.sin(SWING), cs = Math.cos(SWING), N = 6;
    for (let i = 0; i < N; i++) { const s0 = SHELF_L * i / N, s1 = SHELF_L * (i + 1) / N;
      const pts = [[s0, 0], [s1, 0], [s0, SHELF_D], [s1, SHELF_D]].map(([u, w]) => [PIVOT.x + u * sn - w * cs, PIVOT.z + u * cs + w * sn]);
      const xs = pts.map(q => q[0]), zs = pts.map(q => q[1]);
      shelfSegs.push({ id: 'gulagShelf' + i, min: [Math.min(...xs) + 0.03, Math.min(...zs) + 0.03], max: [Math.max(...xs) - 0.03, Math.max(...zs) - 0.03], c: null }); } }
  const SHELF_IDS = shelfSegs.map(g => g.id);
  // cut a hole in the lounge floor + seamless trapdoor leaves + stair shaft below
  const leaves = [];
  if (lf) {
    const o = lf.geometry.parameters; const W0 = 4.35, W1 = W0 + o.width, Z0 = 3.5 - o.height / 2, Z1 = 3.5 + o.height / 2;
    const s = new THREE.Shape(); s.moveTo(W0, -Z0); s.lineTo(W1, -Z0); s.lineTo(W1, -Z1); s.lineTo(W0, -Z1); s.closePath();
    const h = new THREE.Path(); h.moveTo(HOLE.x0, -HOLE.z0); h.lineTo(HOLE.x0, -HOLE.z1); h.lineTo(HOLE.x1, -HOLE.z1); h.lineTo(HOLE.x1, -HOLE.z0); h.closePath(); s.holes.push(h);
    const g = new THREE.ShapeGeometry(s); g.rotateX(-Math.PI / 2);
    const m0 = lf.material; const mat = m0.clone(); const cl = t => { if (!t) return t; const c = t.clone(); c.repeat.set(1 / 1.44, 1 / 1.44); c.offset.set(-W0 / 1.44, Z1 / 1.44); c.needsUpdate = true; return c; };
    mat.map = cl(m0.map); mat.normalMap = cl(m0.normalMap);
    lf.geometry.dispose(); lf.geometry = g; lf.material = mat; lf.position.set(0, 0, 0); lf.rotation.set(0, 0, 0);
    // two leaves hinged on the z edges, top face mapped exactly like the floor
    const midX = (HOLE.x0 + HOLE.x1) / 2, zc = (HOLE.z0 + HOLE.z1) / 2, LZh = HOLE.z1 - HOLE.z0, LXh = HOLE.x1 - HOLE.x0;
    for (const [za, zb, hingeZ, dir, maxA] of [[HOLE.z0, zc, HOLE.z0, -1, 1.5], [zc, HOLE.z1, HOLE.z1, 1, 1.7]]) {
      const lg = new THREE.Group(); lg.position.set(0, 0, hingeZ); ext.add(lg);
      const top = new THREE.PlaneGeometry(LXh, zb - za); top.rotateX(-Math.PI / 2); top.translate(midX, 0, (za + zb) / 2 - hingeZ);
      const uv = top.attributes.uv, pos = top.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i), -(pos.getZ(i) + hingeZ));
      const tm = new THREE.Mesh(top, mat); tm.receiveShadow = true; lg.add(tm);
      const und = new THREE.Mesh(new THREE.BoxGeometry(LXh, 0.03, zb - za), woodDark); und.position.set(midX, -0.0155, (za + zb) / 2 - hingeZ); lg.add(und);
      mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 16), brass, midX, 0.004, (za + zb) / 2 - hingeZ - dir * 0.12, lg, Math.PI / 2); // ring pull
      leaves.push({ g: lg, dir, maxA });
    }
    // punch the same hole through the garden ground plane (it runs under the house at y=-0.004)
    const gr = lroot.userData.ground;
    if (gr && gr.geometry.parameters && gr.geometry.parameters.width) {
      const gw = gr.geometry.parameters.width, gh = gr.geometry.parameters.height, gx = gr.position.x, gz = gr.position.z;
      const sg = new THREE.Shape(); sg.moveTo(gx - gw / 2, -(gz - gh / 2)); sg.lineTo(gx + gw / 2, -(gz - gh / 2)); sg.lineTo(gx + gw / 2, -(gz + gh / 2)); sg.lineTo(gx - gw / 2, -(gz + gh / 2)); sg.closePath();
      const hg = new THREE.Path(); hg.moveTo(HOLE.x0, -HOLE.z0); hg.lineTo(HOLE.x0, -HOLE.z1); hg.lineTo(HOLE.x1, -HOLE.z1); hg.lineTo(HOLE.x1, -HOLE.z0); hg.closePath(); sg.holes.push(hg);
      const geo = new THREE.ShapeGeometry(sg); geo.rotateX(-Math.PI / 2);
      const P = geo.attributes.position, U2 = geo.attributes.uv; for (let i = 0; i < P.count; i++) U2.setXY(i, (P.getX(i) - gx + gw / 2) / gw, (gh / 2 - (P.getZ(i) - gz)) / gh);
      gr.geometry.dispose(); gr.geometry = geo; gr.position.set(0, gr.position.y, 0); gr.rotation.set(0, 0, 0);
    }
    // stair shaft (below the floor): dark, fading into black, red GULAG glow on the far wall
    const depth = 1.6;
    const grad = geo => { const c2 = [], p2 = geo.attributes.position; for (let i = 0; i < p2.count; i++) { const k = clamp((p2.getY(i) + depth / 2) / depth, 0, 1) ** 1.7 * 0.9 + 0.03; c2.push(k, k, k); } geo.setAttribute('color', new THREE.Float32BufferAttribute(c2, 3)); return geo; };
    const sideMat = new THREE.MeshStandardMaterial({ color: 0x8a6a52, vertexColors: true, roughness: 0.95, envMapIntensity: 0.1, map: rep(B.map, 1.2, 1.6) });
    const xw = grad(new THREE.PlaneGeometry(LZh, depth, 1, 6)), zw = grad(new THREE.PlaneGeometry(LXh, depth, 1, 6));
    const wall = (geo, x, z, ry) => { const m = new THREE.Mesh(geo, sideMat); m.position.set(x, -depth / 2 - 0.001, z); m.rotation.y = ry; ext.add(m); };
    wall(xw, HOLE.x0 + 0.001, zc, Math.PI / 2); wall(xw, HOLE.x1 - 0.001, zc, -Math.PI / 2);
    wall(zw, midX, HOLE.z0 + 0.001, 0); wall(zw, midX, HOLE.z1 - 0.001, Math.PI);
    for (let k = 0; k < 4; k++) { const y = -(k + 1) * 0.19, kk = 1 - k * 0.2, run = k < 3 ? 0.2 : LXh - 0.6; const x1 = HOLE.x1 - 0.2 * k; const st = new THREE.Mesh(new THREE.BoxGeometry(run - 0.002, depth + y, LZh - 0.004), new THREE.MeshStandardMaterial({ color: new THREE.Color(0.36 * kk, 0.26 * kk, 0.19 * kk), roughness: 0.95, envMapIntensity: 0.12 })); st.position.set(x1 - run / 2, (y - depth) / 2, zc); ext.add(st); }
    const glow = drawTex(256, 128, (x, w, h) => { x.fillStyle = '#050101'; x.fillRect(0, 0, w, h); const g2 = x.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2); g2.addColorStop(0, 'rgba(255,40,40,0.55)'); g2.addColorStop(1, 'rgba(255,40,40,0)'); x.fillStyle = g2; x.fillRect(0, 0, w, h); x.fillStyle = '#ff3030'; x.font = `900 52px Impact,${FONT}`; x.textAlign = 'center'; x.fillText('GЦLДG ↓', w / 2, 82); });
    const gm = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.31), new THREE.MeshBasicMaterial({ map: glow, transparent: true, opacity: 0 })); gm.position.set(HOLE.x0 + 0.004, -0.62, zc); gm.rotation.y = Math.PI / 2; ext.add(gm); ext.userData.glow = gm;
  }
  // dust puff (points)
  const dustN = 90, dustPos = new Float32Array(dustN * 3), dustVel = [];
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xd8c8a8, size: 0.035, transparent: true, opacity: 0, depthWrite: false })); dust.frustumCulled = false; ext.add(dust);
  function puff(at, spread = 0.9) { for (let i = 0; i < dustN; i++) { dustPos[i * 3] = at.x + (Math.random() - 0.5) * spread; dustPos[i * 3 + 1] = at.y + Math.random() * 1.8; dustPos[i * 3 + 2] = at.z + (Math.random() - 0.5) * spread * 1.6; dustVel[i] = V((Math.random() - 0.5) * 0.3, -0.05 - Math.random() * 0.12, (Math.random() - 0.5) * 0.3); } dustGeo.attributes.position.needsUpdate = true; S.dust = 3.2; }

  // ================================================================== DOM: fade, subtitles, frost, register
  const style = document.createElement('style');
  style.textContent = `
#gfade{position:fixed;inset:0;z-index:12;background:#000;opacity:0;pointer-events:none;transition:opacity .55s ease;display:grid;place-items:center}
#gfade.on{opacity:1}
#gfade span{font:600 14px/1 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;letter-spacing:.45em;color:rgba(255,255,255,.82);text-transform:uppercase}
#gsub{position:fixed;left:50%;bottom:12vh;transform:translate(-50%,8px);z-index:7;max-width:min(860px,90vw);text-align:center;opacity:0;transition:opacity .35s,transform .35s;pointer-events:none;text-shadow:0 1px 3px #000,0 0 14px rgba(0,0,0,.7)}
#gsub.on{opacity:1;transform:translate(-50%,0)}
#gsub b{display:block;margin:0 0 6px;font:700 11px/1 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;letter-spacing:.32em;text-transform:uppercase;color:#ff5a64}
#gsub span{font:500 19px/1.35 Georgia,"Times New Roman",serif;color:#fff}
#gsub.v b{color:#ffd83a}#gsub.v span{font:700 24px/1.3 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;letter-spacing:.04em}
#gfrost{position:fixed;inset:0;z-index:6;pointer-events:none;opacity:0;transition:opacity .9s;background:radial-gradient(ellipse at center,rgba(255,255,255,0) 42%,rgba(190,225,255,.38) 72%,rgba(235,248,255,.85) 100%)}
#gfrost.on{opacity:1}
#gfrost::after{content:"";position:absolute;inset:0;opacity:.55;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><g stroke='white' stroke-width='1.3' fill='none' opacity='.75'><path d='M20 30l40 18 22-30M150 20l-10 46 40 12M30 190l34-22-6-40M200 160l-40 6-10 44M90 110l20-14 24 8'/></g></svg>");-webkit-mask:radial-gradient(ellipse at center,transparent 50%,#000 85%);mask:radial-gradient(ellipse at center,transparent 50%,#000 85%)}
`;
  document.head.appendChild(style);
  const el = (id, html) => { const d = document.createElement('div'); d.id = id; d.innerHTML = html; document.body.appendChild(d); return d; };
  const fadeEl = el('gfade', '<span></span>'), subEl = el('gsub', '<b></b><span></span>'), frostEl = el('gfrost', '');
  let subT = 0;
  function sub(who, line, verdict = false, dur = 2.6) { subEl.querySelector('b').textContent = who || ''; subEl.querySelector('span').textContent = line; subEl.classList.toggle('v', !!verdict); subEl.classList.add('on'); subT = dur; }

  // ================================================================== state + helpers
  const S = { open: false, goal: 0, pk: 0, closing: false, inside: false, insideK: 0, busy: false, trans: null, queue: [], t: 0, dust: 0, cage: false, doorT: 0, doorGoal: 0, trial: null, lava: true, tv: 0, tvT: 0, hat: false, frost: 0, regIdx: 0, dripT: 3 };
  const cbs = { enter: [], open: [], any: [] };
  const emit = (n, d) => { for (const f of (cbs[n] || [])) try { f(d); } catch (e) { } for (const f of cbs.any) try { f(n, d); } catch (e) { } };
  const later = (sec, fn) => S.queue.push({ t: sec, fn });
  const sfx = (n, v) => { try { audio && audio.sfx(n, v); } catch (e) { } };
  let W = null, boxes = null;
  const outBounds = level ? { ...level.bounds } : null;
  function setBounds(inside) { if (!level) return; const b = level.bounds; if (inside) Object.assign(b, { x0: ROOM.x0 + 0.05, x1: ROOM.x1 - 0.05, z0: ROOM.z0 + 0.05, z1: ROOM.z1 - 0.05 }); else Object.assign(b, outBounds); }
  if (level && level.zones) level.zones.push({ name: 'Il Gulag', rect: [ROOM.x0 - 0.2, ROOM.z0 - 0.2, ROOM.x1 + 0.2, ROOM.z1 + 0.2] });
  // explore boxes (attached later): a level collider and its explore twin share the index → 'lv'+i
  const twin = c => (c._twin || (boxes ? boxes.find(b => b.id === 'lv' + colliders.indexOf(c)) : null));
  function setBox(c, min, max) { c.min[0] = min[0]; c.min[1] = min[1]; c.max[0] = max[0]; c.max[1] = max[1]; const b = twin(c); if (b) { b.min.set(min[0], 0, min[1]); b.max.set(max[0], 0, max[1]); } }
  const OFF = [[-999, -999], [-998, -998]];
  let holeCol = null;
  function shelfColliders(open) {
    if (shelfCol && shelfHome) setBox(shelfCol, open ? OFF[0] : shelfHome.min, open ? OFF[1] : shelfHome.max);
    for (const g of shelfSegs) {
      if (!g.c) { g.c = { type: 'box', min: [...OFF[0]], max: [...OFF[1]], gid: g.id }; colliders.push(g.c); if (boxes) { g.c._twin = { id: g.id, min: V(), max: V() }; boxes.push(g.c._twin); } }
      setBox(g.c, open ? g.min : OFF[0], open ? g.max : OFF[1]);
    }
    if (!holeCol) { holeCol = { type: 'box', min: [...OFF[0]], max: [...OFF[1]], gid: 'gulagHole' }; colliders.push(holeCol); if (boxes) { holeCol._twin = { id: 'gulagHole', min: V(), max: V() }; boxes.push(holeCol._twin); } }
  }
  function setHole(open) { if (holeCol) setBox(holeCol, open ? [HOLE.x0, HOLE.z0] : OFF[0], open ? [HOLE.x1, HOLE.z1] : OFF[1]); }

  // ================================================================== passage
  function openPassage() {
    if (S.open || !shelf) return false;
    S.open = true; S.closing = false; S.goal = 1; emit('open');
    sfx('creak'); puff(V(4.9, 0, 1.1));
    shelfColliders(true); setHole(true);
    later(2.3, () => { sfx('clank'); sfx('thud'); });
    later(3.2, () => { try { ui && ui.toast && ui.toast('Un passaggio segreto: si scende nel Gulag'); } catch (e) { } });
    return true;
  }
  function closePassage() { // the passage closes behind you when you come back up (pull the red book again to reopen)
    if (!S.open) return; S.closing = true; S.goal = 0; setHole(false); sfx('creak');
    later(1.1, () => sfx('thud'));
    later(3.4, () => { shelfColliders(false); S.open = false; S.closing = false; sfx('clank'); });
  }
  function pullBook() {
    if (S.open || S.busy) return;
    const go = () => { S.busy = true; sfx('pickup'); S.bookPull = 0; later(0.55, () => { S.busy = false; openPassage(); }); };
    if (W && W.goTo) W.goTo(V(5.3, 0, 2.12), Math.atan2(4.86 - 5.3, 1.63 - 2.12), go); else go();
  }
  // ---- transitions (black fade, teleport) ----
  function transition(caption, midFn, endFn) {
    S.trans = { t: 0, caption, midFn, endFn, mid: false }; fadeEl.querySelector('span').textContent = caption; fadeEl.classList.add('on');
  }
  function placeMan(p, yaw, camOff = 0) {
    man.root.position.set(p.x, 0, p.z); man.root.rotation.y = yaw;
    if (W) { W.yaw = yaw; W.camYaw = yaw + Math.PI + camOff; W.vel && W.vel.set(0, 0, 0); }
  }
  function moveDog(to, yaw) { if (!dog) return; dog.root.position.set(to.x, 0, to.z); dog.root.rotation.y = yaw; }
  const dogNear = () => dog && Math.hypot(dog.root.position.x - man.root.position.x, dog.root.position.z - man.root.position.z) < 3.5;
  const dogDown = () => dog && dog.root.position.x > ROOM.x0 - 1;
  function descend() {
    if (S.busy || !S.open || S.closing) return;
    S.busy = true;
    const go2 = () => {
      const takeDog = W && (W.dogFollow || dogNear());
      transition('Scendi nel Gulag…', () => {
        S.inside = true; setBounds(true);
        if (lroot) lroot.visible = false; ext.visible = false; // enclosed: skip house/garden while down here (also hides trees/ground in the footprint)
        if (takeDog) moveDog(V(33.1, 0, 3.75), Math.PI / 2);
        placeMan(ARRIVE, Math.PI / 2, -0.55);
        if (W && W.camMode === 'Cinema') W.camMode = 'Segui';
        if (W && W.setMode) W.setMode('explore');
        sfx('drip'); emit('enter', true);
      }, () => { S.busy = false; later(0.4, () => sub('Il capo delle guardie', '«Da. Benvenuto nel Gulag. La prima notte è gratis, l\'uscita no.»', false, 3.4)); });
      if (W && W.goTo) W.goTo(V(HOLE.x0 + 0.2, 0, DOWNSPOT.z), -Math.PI / 2, null, { ignore: ['gulagHole', ...SHELF_IDS], speed: 0.75 });
      S.stairsDown = true;
    };
    if (W && W.goTo) W.goTo(DOWNSPOT, -Math.PI / 2, go2); else go2();
  }
  function ascend() {
    if (S.busy) return; S.busy = true;
    const go2 = () => {
      transition('Torni di sopra…', () => {
        if (dogDown()) moveDog(V(5.9, 0, 3.05), Math.PI / 2);
        S.inside = false; setBounds(false); if (lroot) lroot.visible = true; ext.visible = true; S.trial = null; subEl.classList.remove('on'); frostEl.classList.remove('on'); S.frost = 0;
        if (S.cage) { S.cage = false; S.doorGoal = 0; setBox(doorCol, [CG.door0, CG.z0 - 0.05], [CG.door1, CG.z0 + 0.05]); }
        placeMan(UPSTAIRS, Math.PI / 2, 0.6);
        if (W && W.setMode) W.setMode('explore');
        S.closing = true; emit('enter', false);
      }, () => { S.busy = false; later(0.5, closePassage); });
      if (W && W.goTo) W.goTo(V(31.0, 0, 3.0), -Math.PI / 2, null, { ignore: ['gulagStairs'], speed: 0.7 });
      S.stairsUp = true;
    };
    if (W && W.goTo) W.goTo(V(32.2, 0, 3.0), -Math.PI / 2, go2); else go2();
  }

  // ================================================================== interactions inside
  const LINES = [
    ['Il capo delle guardie', '«Da. Processo è regolare. Giudice c\'è, avvocato c\'è, telecamere ci sono.»'],
    ['Il giudice', '«Silenzio in aula! Si processa il cittadino Cesco, latitante da una settimana.»'],
    ['L\'imputato · ore 21:06', '«Palese ero andato a letto alle 21.»'],
    ['Il capo delle guardie', '«Latitante dorme alle 21? Da. E io sono ballerina del Bolshoi.»'],
    ['La difesa', '«Vieni, unisciti alla Resistenza!»'],
    ['L\'imputato · ore 21:07', '«Bro sono sfuggito.»'],
    ['Il giudice', '«La corte si ritira. Telecamere sempre accese.»'],
  ];
  const VERDICTS = [
    ['COLPEVOLE', 'A letto alle 21 per un mese. Telecamere comprese.', 'facepalm'],
    ['ASSOLTO', 'Per insufficienza di messaggi. Il ghiaccio resta.', 'cheer'],
    ['RINVIATO', 'Sentenza: prossimamente. Il direttore osserva.', 'shrug'],
    ['CONDANNATO', 'A fare gli auguri ad Asche. In diretta.', 'facepalm'],
    ['LIBERO', 'Ma fuori fa freddo. Da.', 'cheer'],
    ['COLPEVOLE', 'Una vodka a udienza, ma solo per il pubblico ministero.', 'shrug'],
  ];
  function bang(n = 1) { for (let i = 0; i < n; i++) later(i * 0.34, () => { S.gavelT = 0.3; later(0.2, () => sfx('gavel')); }); }
  function trial() {
    if (S.trial) return;
    const go = () => {
      S.trial = { t: 0 }; emit('trial'); if (W) S.camTo = { yaw: W.yaw + Math.PI - 0.7, t: 1.6 }; // side view from the south vault: clear of the ridge
      sfx('onair'); bang(1);
      sub('In onda · Il Processo del Secolo', 'Prima udienza, in diretta ovunque.', false, 2.4);
      LINES.forEach((l, i) => later(2.5 + i * 2.6, () => { if (!S.trial) return; sub(l[0], l[1], false, 2.5); if (i === 1 || i === 6) bang(i === 6 ? 3 : 1); }));
      const tEnd = 2.5 + LINES.length * 2.6 + 0.6;
      later(tEnd, () => { if (!S.trial) return; const v = VERDICTS[(Math.random() * VERDICTS.length) | 0]; bang(1); sub('Verdetto: ' + v[0], v[1], true, 4.2);
        const F = getFX(); if (F && F.confetti) F.confetti(V(40.2, 2.0, 6.0), 160);
        try { W && W.gesture && W.gesture(v[2]); } catch (e) { }
        sfx(v[0] === 'ASSOLTO' || v[0] === 'LIBERO' ? 'clear' : 'gameover'); emit('verdict', v[0]); });
      later(tEnd + 4.4, () => { S.trial = null; });
    };
    if (W && W.goTo) W.goTo(V(39.3, 0, 6.0), Math.PI / 2, go); else go();
  }
  function toggleCage() {
    if (S.busy) return; S.busy = true;
    const openDoor = () => { S.doorGoal = 1; sfx('clank'); setBox(doorCol, OFF[0], OFF[1]); };
    const closeDoor = () => { S.doorGoal = 0; later(0.45, () => { sfx('clank'); setBox(doorCol, [CG.door0, CG.z0 - 0.05], [CG.door1, CG.z0 + 0.05]); }); };
    const mid = (CG.door0 + CG.door1) / 2;
    if (!S.cage) {
      W.goTo(V(mid, 0, 8.72), 0, () => { openDoor(); later(0.6, () => W.goTo(V(mid, 0, 10.75), Math.PI, () => { closeDoor(); S.cage = true; S.busy = false; emit('cage', true);
        later(0.5, () => { sub('Il Gulag', '«Era a letto alle 21. O no?»'); try { W && W.gesture && W.gesture('shrug'); } catch (e) { } }); later(3.3, () => sub('Il capo delle guardie', '«Libertà è fuori. Fuori fa freddo. Da.»')); }, { ignore: ['gulagCageDoor'] })); });
    } else {
      openDoor(); later(0.5, () => W.goTo(V(mid, 0, 8.7), Math.PI, () => { closeDoor(); S.cage = false; S.busy = false; emit('cage', false); sub('L\'indagato', '«Bro sono sfuggito.»'); }, { ignore: ['gulagCageDoor'] }));
    }
  }
  function touchIce() {
    const go = () => { S.frost = 4.2; frostEl.classList.add('on'); sfx('shiver'); sfx('whoosh'); emit('ice');
      for (const m of mists) m.userData.burst = 1.5;
      try { W && W.gesture && W.gesture('shrug'); } catch (e) { }
      sub('Il capo delle guardie', '«Vietato il ghiaccio in aula. È già sui muri.»', false, 3.2); };
    W.goTo(V(40.55, 0, 9.95), Math.atan2(ICE.x - 40.55, ICE.z - 9.95), go);
  }
  // colbacco: hide the fedora, attach an ushanka to the head bone
  let wornHat = null; const fedora = (() => { let f = null; man && man.model && man.model.traverse(o => { if (o.isMesh && /Headwear/i.test(o.name + (o.material && o.material.name))) f = o; }); return f; })();
  function toggleHat() {
    const head = man && man.bones && man.bones.Head; if (!head) return;
    const go = () => {
      if (!S.hat) {
        wornHat = makeUshanka(); wornHat.scale.setScalar(1.12); scene.add(wornHat);
        man.model.updateMatrixWorld(true); const hp = head.getWorldPosition(V());
        const yaw = W ? W.yaw : 0; wornHat.position.copy(hp).add(V(0, 0.1, 0)).add(V(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(0.015)); wornHat.rotation.set(0, yaw, 0);
        head.attach(wornHat); if (fedora) fedora.visible = false; hatOnIce.visible = false; S.hat = true; sfx('pickup'); emit('hat', true);
        sub('Il capo delle guardie', '«Ora sei una guardia. Da.»', false, 2.6);
      } else {
        if (wornHat) { wornHat.parent && wornHat.parent.remove(wornHat); wornHat = null; } if (fedora) fedora.visible = true; hatOnIce.visible = true; S.hat = false; sfx('pickup'); emit('hat', false);
      }
    };
    W.goTo(V(40.55, 0, 9.95), Math.atan2(ICE.x - 40.55, ICE.z - 9.95), go);
  }
  function drawTV() {
    const x = tvX, w = 160, h = 120; S.tvT += 1;
    if (S.tv === 0) { x.fillStyle = '#050505'; x.fillRect(0, 0, w, h); }
    else if (S.tv === 1) { const id = x.createImageData(w, h); for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; } x.putImageData(id, 0, 0); }
    else if (S.tv === 2) {
      x.fillStyle = '#1a0306'; x.fillRect(0, 0, w, h); x.fillStyle = (S.tvT >> 3) % 2 ? '#ff2236' : '#7a0a12'; x.font = `900 20px ${FONT}`; x.textAlign = 'center'; x.fillText('● IN ONDA', w / 2, 34);
      x.fillStyle = '#fff'; x.font = `800 14px ${FONT}`; x.fillText('IL PROCESSO', w / 2, 62); x.fillText('DEL SECOLO', w / 2, 80);
      x.fillStyle = '#ffd83a'; x.fillRect(0, 96, w, 18); x.fillStyle = '#111'; x.font = `700 11px ${FONT}`; x.textAlign = 'left';
      const tk = 'ULTIM\'ORA · Cesco: «Palese ero andato a letto alle 21» · Il direttore osserva · Il ghiaccio resta · '; x.fillText(tk + tk, -((S.tvT * 1.5) % 520), 109);
    } else { const bars = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0']; bars.forEach((c, i) => { x.fillStyle = c; x.fillRect(i * w / 7, 0, w / 7 + 1, h * 0.72); }); x.fillStyle = '#111'; x.fillRect(0, h * 0.72, w, h); x.fillStyle = '#fff'; x.font = `800 13px ${FONT}`; x.textAlign = 'center'; x.fillText('GULAG TV · CANALE 313', w / 2, h * 0.88); }
    tvTex.needsUpdate = true;
  }
  const regLines = [
    'Il registro: SGHINO 80 · liberato (capo della Resistenza).',
    'ZUCCO 59 · in licenza GTA. FEDE 36 · in regola.',
    'ASCHE 31 · sopravvissuto alla pozione. FORLA 28 · sospettato di tradimento.',
    'LOMBU 27 · editore clandestino. CATTA 17 · in regola. PARME 17 · reo confesso.',
    'MIRCO 11 · segnalato al Gulag. CESCO 2 · indagato, in cella. JACOPO 0 · non pervenuto.',
  ];

  // ================================================================== interactables (registered into explore)
  const far = () => V(1e4, 0, 1e4);
  const mid = (CG.door0 + CG.door1) / 2;
  const items = [
    { id: 'gulagBook', label: () => 'Tira il libro rosso', anchor: () => (!S.open && !S.inside && book ? V(5.3, 0, 2.05) : far()), top: () => book.getWorldPosition(V()).add(V(0.12, 0.3, 0)), range: 0.95, act: () => pullBook() },
    { id: 'gulagDown', label: () => 'Scendi nel Gulag', anchor: () => (S.open && !S.closing && S.pk > 3 && !S.inside && !S.busy ? DOWNSPOT : far()), top: () => V(4.6, 0.3, DOWNSPOT.z), range: 1.1, act: () => descend() },
    { id: 'gulagUp', label: () => 'Torna di sopra', anchor: () => (S.inside && !S.busy ? V(32.05, 0, 3.0) : far()), top: () => V(31.2, 1.9, 3.0), range: 0.62, act: () => ascend() },
    { id: 'gulagGavel', label: () => (S.trial ? 'Udienza in corso…' : 'Apri il Processo del Secolo'), anchor: () => (S.inside ? V(39.3, 0, 6.0) : far()), top: () => gavel.getWorldPosition(V()).add(V(-0.2, 0.25, 0)), range: 1.2, act: () => trial() },
    { id: 'gulagCage', label: () => (S.cage ? 'Esci dalla cella' : 'Entra nella cella di Cesco'), anchor: () => (S.inside && !S.busy ? V(mid, 0, S.cage ? 10.75 : 8.72) : far()), top: () => V(mid, 1.9, CG.z0), range: 1.0, act: () => toggleCage() },
    { id: 'gulagIce', label: () => 'Tocca il Ghiaccio del Gulag', alt: () => (S.hat ? 'Togli il colbacco' : 'Metti il colbacco'), anchor: () => (S.inside ? V(40.55, 0, 9.95) : far()), top: () => V(ICE.x, 0.95, ICE.z), range: 1.05, act: () => touchIce(), altAct: () => toggleHat() },
    { id: 'gulagLava', label: () => (S.lava ? 'Spegni la lava lamp' : 'Accendi la lava lamp'), anchor: () => (S.inside ? V(41.15, 0, 2.15) : far()), top: () => V(LAVA.x, 1.15, LAVA.z), range: 0.85, act: () => { S.lava = !S.lava; sfx('switch'); emit('lava', S.lava); } },
    { id: 'gulagTV', label: () => (S.tv ? 'Cambia canale' : 'Accendi la TV'), alt: () => (S.tv ? 'Spegni la TV' : null), anchor: () => (S.inside ? V(39.9, 0, 1.55) : far()), top: () => V(TVP.x, 1.0, TVP.z), range: 0.95, act: () => { S.tv = S.tv % 3 + 1; sfx('tvzap'); drawTV(); emit('tv', S.tv); }, altAct: () => { S.tv = 0; sfx('tvzap'); drawTV(); } },
    { id: 'gulagReg', label: () => 'Leggi il registro del Gulag', anchor: () => (S.inside ? V(37.7, 0, 11.0) : far()), top: () => V(37.7, 1.85, ROOM.z1), range: 1.15, act: () => { sub('Il registro del Gulag', regLines[S.regIdx % regLines.length], false, 3.4); S.regIdx++; sfx('paper'); emit('register'); } },
  ];

  function stairsColRef() { return colliders.find(c => c.gid === 'gulagStairs'); }
  function attach(world) {
    W = world; boxes = world.boxes || null;
    if (boxes) for (const c of [shelfCol, doorCol, stairsColRef()]) { if (!c) continue; const b = boxes.find(x => x.id === 'lv' + colliders.indexOf(c)); if (b) { c._twin = b; if (c.gid) b.id = c.gid; } }
    if (world.interactables) for (const it of items) world.interactables.push(it);
  }

  // ================================================================== update
  const tmp = V();
  function update(dt, t) {
    S.t += dt;
    // timers
    for (let i = S.queue.length - 1; i >= 0; i--) { const q = S.queue[i]; q.t -= dt; if (q.t <= 0) { S.queue.splice(i, 1); try { q.fn(); } catch (e) { console.warn(e); } } }
    if (subT > 0) { subT -= dt; if (subT <= 0) subEl.classList.remove('on'); }
    // transition
    if (S.trans) {
      const tr = S.trans; tr.t += dt;
      if (S.stairsDown) man.root.position.y = -clamp((HOLE.x1 + 0.04 - man.root.position.x) / 0.62, 0, 1) * 0.62;
      if (S.stairsUp) man.root.position.y = clamp((31.95 - man.root.position.x) / 1.0, 0, 1) * 0.85;
      if (!tr.mid && tr.t > 0.9) { tr.mid = true; S.stairsDown = S.stairsUp = false; man.root.position.y = 0; try { tr.midFn && tr.midFn(); } catch (e) { console.warn(e); } }
      if (tr.mid && tr.t > 1.55) { fadeEl.classList.remove('on'); }
      if (tr.t > 2.1) { S.trans = null; try { tr.endFn && tr.endFn(); } catch (e) { } }
    }
    // passage animation: timeline pk (0..3.4 s) runs forward to open, backward to close
    { const pk0 = S.pk; S.pk = clamp(S.pk + (S.goal ? dt : -dt * 1.25), 0, 3.4);
      if (S.pk !== pk0 || S.pk > 0) {
        piv.rotation.y = ease(clamp((S.pk - 0.35) / 2.1, 0, 1)) * SWING;
        const lk = ease(clamp((S.pk - 2.3) / 1.0, 0, 1));
        for (const l of leaves) l.g.rotation.x = l.dir * lk * l.maxA;
        if (ext.userData.glow) ext.userData.glow.material.opacity = clamp((S.pk - 2.6) / 0.8, 0, 1) * (0.75 + Math.sin(t * 3) * 0.15);
      } }
    if (book && S.bookPull !== undefined && S.bookPull < 1) { S.bookPull = Math.min(1, S.bookPull + dt * 2.5); book.rotation.z = -0.12 - S.bookPull * 0.5; book.position.x = 0.11 + S.bookPull * 0.03; }
    if (S.dust > 0) { S.dust -= dt; for (let i = 0; i < dustN; i++) { dustPos[i * 3] += dustVel[i].x * dt; dustPos[i * 3 + 1] = Math.max(0.01, dustPos[i * 3 + 1] + dustVel[i].y * dt); dustPos[i * 3 + 2] += dustVel[i].z * dt; } dustGeo.attributes.position.needsUpdate = true; dust.material.opacity = clamp(S.dust / 3.2, 0, 1) * 0.55; }
    // inside: lights / visibility
    const near = S.inside || (S.trans && S.trans.mid === false && S.stairsUp);
    S.insideK += ((S.inside ? 1 : 0) - S.insideK) * Math.min(1, dt * 6);
    const k = S.insideK;
    if (lights) {
      lights.key.intensity *= 1 - k; lights.fill.intensity *= 1 - k; lights.hemi.intensity *= 1 - 0.86 * k;
      scene.environmentIntensity *= 1 - 0.7 * k;
    }
    const on = k > 0.02 || near;
    root.visible = on || S.inside;
    const flick = 0.92 + Math.sin(t * 13.1) * 0.03 + Math.sin(t * 7.3) * 0.03 + (Math.random() < 0.004 ? -0.4 : 0);
    const trialDim = S.trial ? 0.55 : 1;
    for (const b of bulbs) { b.L.visible = on; b.L.intensity = b.base * k * flick * trialDim; }
    const onAir = S.trial ? (Math.sin(t * 7) > -0.2 ? 1 : 0.35) : 0.12;
    ondaMat.emissiveIntensity = 0.25 + onAir * 2.2; redL.visible = on; redL.intensity = k * onAir * 6;
    for (const tl of tallies) tl.material.emissiveIntensity = S.trial ? 3 : 0.2;
    iceL.visible = on; iceL.intensity = k * 2.2;
    if (!on) return;
    if (S.camTo && W) { S.camTo.t -= dt; const d = Math.atan2(Math.sin(S.camTo.yaw - W.camYaw), Math.cos(S.camTo.yaw - W.camYaw)); W.camYaw += d * Math.min(1, dt * 2.5); if (S.camTo.t <= 0) S.camTo = null; }
    // gavel
    if (S.gavelT > 0) { S.gavelT -= dt; const u = S.gavelT; gavel.rotation.z = u > 0.12 ? -0.9 * (1 - (u - 0.12) / 0.18) : -0.9 * (u / 0.12); } else gavel.rotation.z = 0;
    // flag wave
    { const p = flagGeo.attributes.position; for (let i = 0; i < p.count; i++) { const x0 = flagBase[i * 3]; p.setZ(i, Math.sin(x0 * 9 - t * 3.2) * 0.04 * (x0 / 0.66)); } p.needsUpdate = true; }
    // cage door
    S.doorT += (S.doorGoal - S.doorT) * Math.min(1, dt * 5); door.rotation.y = S.doorT * 1.65;
    // lava lamp
    lavaMat.emissiveIntensity = S.lava ? 1.6 : 0.05; lavaGlass.emissiveIntensity = S.lava ? 0.6 : 0.03;
    for (const b of lavaBlobs) { const u = b.userData; if (S.lava) u.ph += dt * u.sp; const y = 0.68 + (Math.sin(u.ph) * 0.5 + 0.5) * 0.26; b.position.y = y; b.scale.set(1, 1 + Math.sin(u.ph * 2.1) * 0.25, 1); }
    // TV
    if (S.tv) { S.tvAcc = (S.tvAcc || 0) + dt; if (S.tvAcc > 0.08) { S.tvAcc = 0; drawTV(); } }
    snowMat.uniforms.uTime.value = t;
    // mist
    for (const m of mists) { const u = m.userData; u.burst = Math.max(0, (u.burst || 0) - dt * 0.6); m.position.set(u.base.x + Math.sin(t * 0.3 + u.ph) * 0.15, u.base.y + Math.sin(t * 0.5 + u.ph) * 0.06 + (u.burst || 0) * 0.2, u.base.z + Math.cos(t * 0.27 + u.ph) * 0.12); m.lookAt(ctx.camera ? ctx.camera.position : tmp); m.material.opacity = 0.14 + (u.burst || 0) * 0.22; }
    // frost overlay
    if (S.frost > 0) { S.frost -= dt; if (S.frost <= 0) frostEl.classList.remove('on'); }
    // a dog called to heel while we're down here comes down the stairs (instead of walking through the garden walls)
    if (S.inside && !S.trans && W && W.dogFollow && dog && dog.root.position.x < ROOM.x0 - 1) moveDog(V(32.9, 0, 3.8), Math.PI / 2);
    // ambient drips
    if (S.inside) { S.dripT -= dt; if (S.dripT <= 0) { S.dripT = 2.5 + Math.random() * 5; sfx('drip'); } }
  }

  return {
    root, update, attach, openPassage, closePassage, items, interactables: items,
    get isOpen() { return S.open; }, get inside() { return S.inside; },
    onEnter(cb) { cbs.enter.push(cb); }, on(name, cb) { if (name === '*') cbs.any.push(cb); else (cbs[name] = cbs[name] || []).push(cb); },
    anchors: { arrive: ARRIVE.clone(), upstairs: UPSTAIRS.clone(), down: DOWNSPOT.clone(), bench: V(39.3, 0, 6.0), cage: V(mid, 0, 10.75), ice: ICE.clone(), suite: V(40.3, 0, 1.6), hole: V((HOLE.x0 + HOLE.x1) / 2, 0, (HOLE.z0 + HOLE.z1) / 2), book: V(5.3, 0, 2.05) },
    state: S,
  };
}
