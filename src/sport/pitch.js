// sport/pitch.js — the calcetto cage in Teletubbylandia: artificial turf, boards + nets, two 5-a-side goals, a bench,
// the chalkboard ("Sfida gli amici") and a basketball hoop outside the east end. Few draw calls: one turf plane, one
// vertex-coloured merged mesh (boards, posts, frames, bench, hoop pole), one alpha-tested net mesh, two small signs.
// Data: PITCH from quartiere/layout.js. Colliders for the player (boards with a gate, goal boxes, bench, hoop pole).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PITCH } from '../quartiere/layout.js';

const P = PITCH, PI = Math.PI;
export const HOOP = { x: -54, z: 24.0, rimH: 3.05, rimR: 0.23, board: 24.42, rimZ: 24.7, spot: [-54, 28.9] }; // south of the cage (outside the gate), backboard facing +z
export const BENCH = { x: -62, z: 46.3 }; // north side, outside the boards
export const BOARD_SIGN = { x: -60.6, z: 33.35 }; // chalkboard by the gate (south side)

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }

function turfTex() {
  const L = P.x1 - P.x0, W = P.z1 - P.z0, ppm = 56, w = Math.round(L * ppm), h = Math.round(W * ppm);
  const [c, x] = canvas(w, h);
  const stripes = 9;
  for (let i = 0; i < stripes; i++) { x.fillStyle = i % 2 ? '#3f9a45' : '#37893c'; x.fillRect(i * w / stripes, 0, w / stripes + 1, h); }
  // speckle (rubber crumb)
  const img = x.getImageData(0, 0, w, h), d = img.data; let s = 1234567;
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
  for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * 26; d[i] = Math.max(0, d[i] + n * 0.6); d[i + 1] = Math.max(0, d[i + 1] + n); d[i + 2] = Math.max(0, d[i + 2] + n * 0.5); }
  x.putImageData(img, 0, 0);
  // lines (metres -> px; x along the pitch length, y across)
  const X = m => m * ppm, lw = 0.09 * ppm;
  x.strokeStyle = 'rgba(245,248,240,.93)'; x.lineWidth = lw; x.fillStyle = 'rgba(245,248,240,.93)';
  const ins = 0.25;
  x.strokeRect(X(ins), X(ins), w - 2 * X(ins), h - 2 * X(ins));
  x.beginPath(); x.moveTo(w / 2, X(ins)); x.lineTo(w / 2, h - X(ins)); x.stroke();
  x.beginPath(); x.arc(w / 2, h / 2, X(1.8), 0, PI * 2); x.stroke();
  x.beginPath(); x.arc(w / 2, h / 2, X(0.12), 0, PI * 2); x.fill();
  for (const side of [0, 1]) {
    const gx = side ? w - X(ins) : X(ins), dir = side ? -1 : 1, r = X(3.6), cz = h / 2, hw = X(0.8);
    // calcio a 5 area: two quarter circles joined by a short line
    x.beginPath();
    x.moveTo(gx, cz - hw - r);
    x.arc(gx, cz - hw, r, side ? -PI / 2 : -PI / 2, side ? -PI : 0, !!side);
    x.lineTo(gx + dir * r, cz + hw);
    x.arc(gx, cz + hw, r, side ? PI : 0, PI / 2, !side);
    x.stroke();
    x.beginPath(); x.arc(gx + dir * X(5), cz, X(0.1), 0, PI * 2); x.fill(); // penalty spot
  }
  // corner arcs
  for (const [cx, cy, a0] of [[X(ins), X(ins), 0], [w - X(ins), X(ins), PI / 2], [w - X(ins), h - X(ins), PI], [X(ins), h - X(ins), -PI / 2]]) { x.beginPath(); x.arc(cx, cy, X(0.4), a0, a0 + PI / 2); x.stroke(); }
  // painted logo in the centre circle (faint)
  x.save(); x.globalAlpha = 0.18; x.font = `900 ${X(0.62)}px Impact, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('BIGALESSO', w / 2, h / 2 - X(0.75)); x.fillText('F.C.', w / 2, h / 2 + X(0.75)); x.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function netTex() {
  const [c, x] = canvas(64, 64);
  x.clearRect(0, 0, 64, 64); x.strokeStyle = '#f2f2ee'; x.lineWidth = 3;
  x.beginPath(); x.moveTo(0, 0); x.lineTo(64, 64); x.moveTo(64, 0); x.lineTo(0, 64); x.stroke();
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}
function signTex(lines, { w = 512, h = 320, bg = '#1f3a2c', fg = '#f4f1e6' } = {}) {
  const [c, x] = canvas(w, h);
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  x.globalAlpha = 0.08; for (let i = 0; i < 40; i++) { x.fillStyle = '#fff'; x.fillRect(Math.random() * w, Math.random() * h, 40 + Math.random() * 120, 2); } x.globalAlpha = 1;
  x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
  lines.forEach((l, i) => { x.font = l.f; x.fillStyle = l.c || fg; x.fillText(l.t, w / 2, l.y * h); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
export function ballTex() {
  const [c, x] = canvas(512, 256);
  x.fillStyle = '#f7f7f2'; x.fillRect(0, 0, 512, 256);
  // 12 pentagons at the icosahedron vertices (equirectangular, stretched near the poles)
  const g = new THREE.IcosahedronGeometry(1, 0), p = g.attributes.position, seen = [];
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i).normalize(); if (seen.some(s => s.distanceTo(v) < 1e-3)) continue; seen.push(v);
    const lat = Math.asin(v.y), lon = Math.atan2(v.z, v.x); const cx = (lon / (2 * PI) + 0.5) * 512, cy = (0.5 - lat / PI) * 256;
    const sx = 1 / Math.max(0.2, Math.cos(lat));
    x.fillStyle = '#16161c';
    for (const off of [-512, 0, 512]) { x.save(); x.translate(cx + off, cy); x.scale(sx, 1); x.beginPath(); for (let k = 0; k < 5; k++) { const a = k / 5 * PI * 2 - PI / 2; x.lineTo(Math.cos(a) * 20, Math.sin(a) * 20); } x.closePath(); x.fill(); x.restore(); }
  }
  g.dispose();
  // seams
  x.strokeStyle = 'rgba(0,0,0,.18)'; x.lineWidth = 1.5; for (let i = 0; i < 9; i++) { x.beginPath(); x.moveTo(i * 57, 0); x.bezierCurveTo(i * 57 + 30, 90, i * 57 - 30, 170, i * 57, 256); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// geometry helpers (vertex colours, merged)
function colored(g, hex) { g = g.index ? g.toNonIndexed() : g; const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); if (g.attributes.uv) g.deleteAttribute('uv'); return g; }
const boxG = (x0, y0, z0, x1, y1, z1, col) => { const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return colored(g, col); };
const cyl = (x, z, y0, y1, r, col, seg = 8) => { const g = new THREE.CylinderGeometry(r, r, y1 - y0, seg); g.translate(x, (y0 + y1) / 2, z); return colored(g, col); };
function bar(a, b, r, col, seg = 8) { // cylinder from a to b
  const d = new THREE.Vector3().subVectors(b, a), L = d.length(), g = new THREE.CylinderGeometry(r, r, L, seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); return colored(g, col);
}
// net panel in a vertical plane from (x0,z0) to (x1,z1), y0..y1; or horizontal (roof) when y0===y1 — UVs in world units
function netPanel(x0, z0, x1, z1, y0, y1, cell = 0.16) {
  const L = Math.hypot(x1 - x0, z1 - z0), H = y1 - y0, g = new THREE.PlaneGeometry(L, H);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L / cell, uv.getY(i) * H / cell);
  g.rotateY(-Math.atan2(z1 - z0, x1 - x0)); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return g;
}
function netTop(x0, z0, x1, z1, y, cell = 0.16) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (x1 - x0) / cell, uv.getY(i) * (z1 - z0) / cell);
  g.rotateX(-PI / 2); g.translate((x0 + x1) / 2, y, (z0 + z1) / 2); return g;
}

// colliders for the player / NPC walkability (2D boxes + circles), pushed into level.colliders before createWorld
export function pitchColliders() {
  const c = [], t = 0.07;
  const box = (x0, z0, x1, z1) => c.push({ type: 'box', min: [x0, z0], max: [x1, z1], sport: true });
  const [g0, g1] = P.gate, m0 = P.cz - P.goalW / 2, m1 = P.cz + P.goalW / 2;
  box(P.x0, P.z0 - t, g0, P.z0 + t); box(g1, P.z0 - t, P.x1, P.z0 + t); // south boards with the gate
  box(P.x0, P.z1 - t, P.x1, P.z1 + t);                                 // north boards
  for (const gx of [P.x0, P.x1]) { box(gx - t, P.z0, gx + t, m0); box(gx - t, m1, gx + t, P.z1); } // end boards beside the goals
  box(P.x0 - P.goalD - t, m0 - t, P.x0, m1 + t); box(P.x1, m0 - t, P.x1 + P.goalD + t, m1 + t); // the goal boxes (players can't walk into the nets)
  box(BENCH.x - 1.3, BENCH.z - 0.25, BENCH.x + 1.3, BENCH.z + 0.25);
  c.push({ type: 'circle', c: [HOOP.x, HOOP.z], r: 0.16, sport: true });
  c.push({ type: 'circle', c: [BOARD_SIGN.x, BOARD_SIGN.z - 0.45], r: 0.3, sport: true });
  return c;
}

export function buildPitch(parent, { low = false } = {}) {
  const G = new THREE.Group(); G.name = 'calcetto'; parent.add(G);
  const L = P.x1 - P.x0, W = P.z1 - P.z0;
  // turf
  { const g = new THREE.PlaneGeometry(L, W); g.rotateX(-PI / 2); g.translate(P.cx, 0.035, P.cz);
    const m = new THREE.MeshStandardMaterial({ map: turfTex(), roughness: 0.92, metalness: 0 }); m.name = 'sport:turf';
    const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; mesh.name = 'calcettoTurf'; G.add(mesh);
    // goal floors
    const gf = []; for (const s of [-1, 1]) { const g2 = new THREE.PlaneGeometry(P.goalD, P.goalW); g2.rotateX(-PI / 2); g2.translate(s < 0 ? P.x0 - P.goalD / 2 : P.x1 + P.goalD / 2, 0.034, P.cz); gf.push(g2); }
    const fm = new THREE.MeshStandardMaterial({ color: 0x37893c, roughness: 0.95 }); const fl = new THREE.Mesh(mergeGeometries(gf), fm); fl.receiveShadow = true; G.add(fl);
  }
  // frame: boards, posts, goal frames, bench, hoop pole/rim (one vertex-coloured mesh)
  const parts = [], t = 0.05, BH = P.board, NH = P.net;
  const BOARD = '#2f5f9e', POST = '#3a3d44', WHITE = '#f4f4ef', WOOD = '#9b6a3e', RED = '#e0472f';
  const [g0, g1] = P.gate, m0 = P.cz - P.goalW / 2, m1 = P.cz + P.goalW / 2;
  const runs = [[P.x0, P.z0, g0, P.z0], [g1, P.z0, P.x1, P.z0], [P.x0, P.z1, P.x1, P.z1], [P.x0, P.z0, P.x0, m0], [P.x0, m1, P.x0, P.z1], [P.x1, P.z0, P.x1, m0], [P.x1, m1, P.x1, P.z1]];
  for (const [x0, z0, x1, z1] of runs) {
    parts.push(boxG(Math.min(x0, x1) - t, 0, Math.min(z0, z1) - t, Math.max(x0, x1) + t, BH, Math.max(z0, z1) + t, BOARD));
    parts.push(boxG(Math.min(x0, x1) - t * 1.4, BH - 0.06, Math.min(z0, z1) - t * 1.4, Math.max(x0, x1) + t * 1.4, BH, Math.max(z0, z1) + t * 1.4, WHITE)); // top rail
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 3));
    for (let i = 0; i <= n; i++) { const k = i / n; parts.push(cyl(x0 + (x1 - x0) * k, z0 + (z1 - z0) * k, 0, NH + 0.05, 0.045, POST, 6)); }
    parts.push(bar(new THREE.Vector3(x0, NH, z0), new THREE.Vector3(x1, NH, z1), 0.03, POST, 5)); // top wire
  }
  // the gate frame
  parts.push(cyl(g0, P.z0, 0, 2.3, 0.05, POST, 6), cyl(g1, P.z0, 0, 2.3, 0.05, POST, 6), bar(new THREE.Vector3(g0, 2.3, P.z0), new THREE.Vector3(g1, 2.3, P.z0), 0.05, POST, 6));
  // goals: white frames (posts, crossbar, back frame)
  for (const s of [-1, 1]) {
    const gx = s < 0 ? P.x0 : P.x1, bx = gx + s * P.goalD, r = 0.05;
    for (const z of [m0, m1]) { parts.push(cyl(gx, z, 0, P.goalH, r, WHITE, 10)); parts.push(bar(new THREE.Vector3(gx, P.goalH, z), new THREE.Vector3(bx, P.goalH * 0.75, z), 0.025, WHITE, 6)); parts.push(bar(new THREE.Vector3(bx, 0.03, z), new THREE.Vector3(bx, P.goalH * 0.75, z), 0.025, WHITE, 6)); parts.push(bar(new THREE.Vector3(gx, 0.03, z), new THREE.Vector3(bx, 0.03, z), 0.025, WHITE, 6)); }
    parts.push(bar(new THREE.Vector3(gx, P.goalH, m0 - r), new THREE.Vector3(gx, P.goalH, m1 + r), r, WHITE, 10));
    parts.push(bar(new THREE.Vector3(bx, P.goalH * 0.75, m0), new THREE.Vector3(bx, P.goalH * 0.75, m1), 0.025, WHITE, 6));
  }
  // bench (north side, outside the boards)
  { const { x, z } = BENCH; parts.push(boxG(x - 1.25, 0.42, z - 0.2, x + 1.25, 0.47, z + 0.2, WOOD)); parts.push(boxG(x - 1.25, 0.5, z + 0.17, x + 1.25, 0.85, z + 0.22, WOOD));
    for (const dx of [-1.1, 1.1]) parts.push(boxG(x + dx - 0.04, 0, z - 0.18, x + dx + 0.04, 0.42, z + 0.18, POST)); }
  // chalkboard easel
  { const { x, z } = BOARD_SIGN; for (const dx of [-0.42, 0.42]) parts.push(bar(new THREE.Vector3(x + dx, 0, z - 0.75), new THREE.Vector3(x + dx * 0.8, 1.55, z - 0.42), 0.025, WOOD, 5)); parts.push(boxG(x - 0.46, 0.66, z - 0.6, x + 0.46, 1.42, z - 0.55, WOOD)); }
  // basketball hoop: pole, arm, backboard frame, rim
  { const { x, z } = HOOP; parts.push(cyl(x, z, 0, 3.4, 0.07, POST, 10)); parts.push(bar(new THREE.Vector3(x, 3.25, z), new THREE.Vector3(x, 3.25, HOOP.board - 0.02), 0.04, POST, 6));
    const rg = new THREE.TorusGeometry(HOOP.rimR, 0.016, 6, 18); rg.rotateX(PI / 2); rg.translate(x, HOOP.rimH, HOOP.rimZ); parts.push(colored(rg, RED));
    parts.push(bar(new THREE.Vector3(x, HOOP.rimH, HOOP.board), new THREE.Vector3(x, HOOP.rimH, HOOP.rimZ - HOOP.rimR), 0.012, RED, 4)); }
  const fm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.15 }); fm.name = 'sport:frame';
  const frame = new THREE.Mesh(mergeGeometries(parts), fm); frame.castShadow = !low; frame.receiveShadow = true; frame.name = 'calcettoFrame'; G.add(frame);
  // nets: above the boards all around + the goal nets (alpha-tested, double-sided)
  { const ng = [];
    for (const [x0, z0, x1, z1] of runs) ng.push(netPanel(x0, z0, x1, z1, BH, NH));
    ng.push(netPanel(g0, P.z0, g1, P.z0, 2.3, NH));
    for (const s of [-1, 1]) {
      const gx = s < 0 ? P.x0 : P.x1, bx = gx + s * P.goalD, hb = P.goalH * 0.75;
      ng.push(netPanel(bx, m0, bx, m1, 0.03, hb)); // back
      for (const z of [m0, m1]) { const g = netPanel(gx, z, bx, z, 0.03, P.goalH); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const k = Math.abs(p.getX(i) - gx) / P.goalD; if (p.getY(i) > 1) p.setY(i, P.goalH - (P.goalH - hb) * k); } ng.push(g); } // sides (sloped top)
      const top = new THREE.PlaneGeometry(P.goalD * 1.03, P.goalW); const uv = top.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * P.goalD / 0.16, uv.getY(i) * P.goalW / 0.16);
      top.rotateX(-PI / 2); top.rotateZ(s * Math.atan2(P.goalH - hb, P.goalD)); top.translate((gx + bx) / 2, (P.goalH + hb) / 2, P.cz); ng.push(top);
    }
    const nm = new THREE.MeshStandardMaterial({ map: netTex(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8, transparent: false }); nm.name = 'sport:net';
    const net = new THREE.Mesh(mergeGeometries(ng.map(g => g.index ? g.toNonIndexed() : g)), nm); net.name = 'calcettoNets'; net.castShadow = false; G.add(net);
  }
  // signs: chalkboard (challenge) + hoop backboard + a banner on the north boards
  {
    const ch = signTex([{ t: 'CALCETTO', f: '900 74px Impact, sans-serif', y: 0.2, c: '#ffe066' }, { t: 'di Teletubbylandia', f: 'italic 600 34px Georgia, serif', y: 0.38 }, { t: 'Sfida gli amici: 3 contro 3', f: '600 34px system-ui, sans-serif', y: 0.6 }, { t: 'Rigori · Tiri liberi al canestro', f: '500 28px system-ui, sans-serif', y: 0.78 }, { t: 'Vietato bestemmiare (ci proviamo)', f: 'italic 22px system-ui, sans-serif', y: 0.92, c: '#b8d8c0' }]);
    const sg = new THREE.PlaneGeometry(0.86, 0.7); sg.rotateY(PI); sg.translate(BOARD_SIGN.x, 1.04, BOARD_SIGN.z - 0.615);
    const sm = new THREE.MeshStandardMaterial({ map: ch, roughness: 0.9 }); const s = new THREE.Mesh(sg, sm); s.name = 'calcettoSign'; G.add(s);
    // backboard (faces +z, toward the free-throw spot)
    const bb = signTex([{ t: '', f: '10px sans-serif', y: 0.5 }], { w: 256, h: 160, bg: '#f4f4f0' });
    { const c = bb.image, x = c.getContext('2d'); x.strokeStyle = '#e0472f'; x.lineWidth = 8; x.strokeRect(6, 6, 244, 148); x.strokeRect(88, 70, 80, 64); x.fillStyle = '#16161c'; x.font = '900 22px Impact, sans-serif'; x.textAlign = 'center'; x.fillText('BIGALESSO', 128, 44); bb.needsUpdate = true; }
    const bg = new THREE.BoxGeometry(1.7, 1.05, 0.05); bg.translate(HOOP.x, HOOP.rimH + 0.38, HOOP.board);
    const bm = new THREE.MeshStandardMaterial({ map: bb, roughness: 0.5 }); const b = new THREE.Mesh(bg, bm); b.castShadow = !low; b.name = 'hoopBoard'; G.add(b);
    // hoop net: a short cone of net
    const cg = new THREE.CylinderGeometry(HOOP.rimR, HOOP.rimR * 0.62, 0.42, 14, 1, true); const uv = cg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 8, uv.getY(i) * 3);
    cg.translate(HOOP.x, HOOP.rimH - 0.21, HOOP.rimZ);
    const hn = new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ map: netTex(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 })); hn.name = 'hoopNet'; G.add(hn);
  }
  return { group: G };
}
