// quartiere/street.js — exterior of the neighbourhood: Bologna-style buildings with porticoes, Via Teletubbylandia,
// the piazzetta, Via Petroni, the Millennium facade, street furniture, the Due Torri on the skyline.
// Static meshes are merged per material (kit.Batch); repeats are InstancedMesh. Returns hooks for night/animation.
import * as THREE from 'three';
import { mat } from '../materials.js';
import { qmat } from './textures.js';
import { rng, canvas, clamp } from '../util.js';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { Batch, V, instances, plaqueTex, neonTex, signMesh, glowTex, signTex } from './kit.js';
import { BUILDINGS, INTERIORS, ST, PET, PIAZZA, GATE } from './layout.js';

const PI = Math.PI;

let M = null;
export function streetMats() {
  if (M) return M;
  const vc = (base, name) => { const m = base.clone(); m.vertexColors = true; m.name = name; return m; };
  const louver = signTex('louver', 64, 128, (x, W, H) => { x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.fillStyle = 'rgba(0,0,0,0.28)'; for (let y = 4; y < H; y += 9) x.fillRect(4, y, W - 8, 3); x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 6; x.strokeRect(2, 2, W - 4, H - 4); });
  M = {
    plaster: qmat('plaster', { vc: true, ns: 0.7 }),
    plasterFlat: qmat('plaster', { vc: true, ns: 0.3, rough: 0.8 }),
    brick: qmat('brick', { ns: 0.9 }),
    trim: qmat('stone', { color: 0xf2ebdd, rough: 0.85 }),
    roof: qmat('roof', { rough: 0.8 }),
    asphalt: qmat('asphalt', { rough: 0.92 }),
    sidewalk: qmat('sidewalk'),
    cobble: qmat('cobble', { ns: 1.2 }),
    portFloor: qmat('terracotta', { rough: 0.7 }),
    vault: qmat('plaster', { vc: true, ns: 0.4 }),
    curb: qmat('stone', { color: 0xa9a49c }),
    door: new THREE.MeshStandardMaterial({ color: 0x4a2f1c, roughness: 0.6, name: 'q:door' }),
    doorGlass: new THREE.MeshStandardMaterial({ color: 0x1a2230, roughness: 0.15, metalness: 0.6, emissive: 0x101a26, emissiveIntensity: 1, name: 'q:doorGlass' }),
    iron: new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.5, metalness: 0.7, name: 'q:iron' }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc9a45a, roughness: 0.3, metalness: 1, name: 'q:brass' }),
    glass: new THREE.MeshStandardMaterial({ color: 0x1a2230, roughness: 0.15, metalness: 0.6, envMapIntensity: 1.4, emissive: 0x101a26, emissiveIntensity: 1, name: 'q:winGlass' }), // tinted glass, never flat black
    glassLit: new THREE.MeshStandardMaterial({ color: 0x1a2230, roughness: 0.15, metalness: 0.6, envMapIntensity: 1.4, emissive: 0xffc27a, emissiveIntensity: 0.03, name: 'q:winLit' }),
    shopFrame: new THREE.MeshStandardMaterial({ color: 0x4a3f36, roughness: 0.45, metalness: 0.55, name: 'q:shopFrame' }), // dark bronze shop-window frame (was black iron)
    shopLit: (() => { const t = signTex('vetrina', 256, 256, (x, W, H) => { // shop interior seen through the glass
        const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#5a4630'); g.addColorStop(0.5, '#a07a4a'); g.addColorStop(1, '#3a2c1e'); x.fillStyle = g; x.fillRect(0, 0, W, H);
        x.fillStyle = 'rgba(255,230,170,0.55)'; x.fillRect(W * 0.1, 8, W * 0.8, 10);
        for (const y of [70, 130, 190]) { x.fillStyle = '#2a2016'; x.fillRect(10, y, W - 20, 6); for (let i = 0; i < 14; i++) { x.fillStyle = ['#c84a3a', '#e8c060', '#4a8ac8', '#f4f0e8', '#6ab06a', '#d08040'][(i * 7 + y) % 6]; const w = 8 + (i * 13 % 9); x.fillRect(16 + i * 16, y - 14 - (i * 5 % 12), w, 14 + (i * 5 % 12)); } }
        x.fillStyle = 'rgba(255,255,255,0.18)'; x.beginPath(); x.moveTo(W * 0.15, 0); x.lineTo(W * 0.35, 0); x.lineTo(W * 0.1, H); x.lineTo(0, H); x.fill(); });
      return new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.25, roughness: 0.12, metalness: 0.15, name: 'q:shopLit' }); })(),
    homeWin: (() => { const t = signTex('tenda', 128, 128, (x, W, H) => { x.fillStyle = '#e8dcc4'; x.fillRect(0, 0, W, H); for (let i = 0; i < W; i += 8) { x.fillStyle = 'rgba(120,90,50,0.18)'; x.fillRect(i, 0, 3, H); } x.fillStyle = 'rgba(255,255,255,0.25)'; x.fillRect(0, 0, W * 0.2, H); });
      return new THREE.MeshStandardMaterial({ map: t, emissive: 0xffc890, emissiveMap: t, emissiveIntensity: 0.0, roughness: 0.3, name: 'q:homeWin' }); })(),
    frame: new THREE.MeshStandardMaterial({ color: 0xf1ece2, roughness: 0.7, name: 'q:frame' }),
    shutter: new THREE.MeshStandardMaterial({ map: louver, roughness: 0.75, name: 'q:shutter' }),
    lampHead: new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xffc070, emissiveIntensity: 0.05, roughness: 0.3, name: 'q:lampHead' }),
    pool: new THREE.MeshBasicMaterial({ map: glowTex(), color: 0xffb860, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, name: 'q:pool' }),
    paint: new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.8, name: 'q:paint' }),
    bark: new THREE.MeshStandardMaterial({ color: 0x8a7a66, roughness: 0.95, name: 'q:bark' }),
    leaves: new THREE.MeshStandardMaterial({ color: 0x4f7a36, roughness: 0.9, name: 'q:leaves', flatShading: true }),
    carBody: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15, name: 'q:car' }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9, name: 'q:rubber' }),
    chrome: mat('chrome'),
    fabric: qmat('fabric'),
    plastic: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, name: 'q:plastic' }),
    wood: qmat('wood', { rough: 0.7 }),
    bulb: new THREE.MeshStandardMaterial({ color: 0xffe6b0, emissive: 0xffd080, emissiveIntensity: 0.3, name: 'q:bulb' }),
    person: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, name: 'q:person' }),
    skyline: new THREE.MeshStandardMaterial({ color: 0xb59a82, roughness: 1, name: 'q:skyline' }),
    tower: qmat('brick', { color: 0xd6b49a, ns: 0.5 }),
  };
  return M;
}

// facade frame of a building: u along the facade, d outward; ground = ground-floor facade line (portico set back)
export function facadeOf(b) {
  const [x0, z0, x1, z1] = b.rect;
  const f = b.face;
  if (f === 'n') return { u0: x0, u1: x1, line: z1, ground: z1, yaw: 0, pos: (u, y, d, line = z1) => V(u, y, line + d) };
  if (f === 's') { const g = b.portico ? ST.zFar : z0; return { u0: x0, u1: x1, line: z0, ground: g, yaw: PI, pos: (u, y, d, line = z0) => V(u, y, line - d) }; }
  if (f === 'e') { const g = b.portico ? PET.x0 : x1; return { u0: z0, u1: z1, line: x1, ground: g, yaw: PI / 2, pos: (u, y, d, line = x1) => V(line + d, y, u) }; }
  const g = b.portico ? PET.x1 : x0; return { u0: z0, u1: z1, line: x0, ground: g, yaw: -PI / 2, pos: (u, y, d, line = x0) => V(line - d, y, u) };
}
const portH = b => (b.face === 'e' || b.face === 'w') ? PET.portH : ST.portH;
export const groundH = b => b.portico ? portH(b) : b.club ? b.h : 3.6;
// ground-floor footprint (the portico strip is open)
export function groundRect(b) {
  const [x0, z0, x1, z1] = b.rect; if (!b.portico) return [x0, z0, x1, z1];
  if (b.face === 's') return [x0, ST.zFar, x1, z1]; if (b.face === 'e') return [x0, z0, PET.x0, z1]; return [PET.x1, z0, x1, z1];
}

// ---------- reusable geometries (local, facing +z) ----------
function archGeo(bay, h, c, spring, depth) {
  const r = (bay - 2 * c) / 2;
  const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(bay, 0); s.lineTo(bay, h); s.lineTo(0, h); s.lineTo(0, 0);
  const hole = new THREE.Path(); hole.moveTo(c, 0); hole.lineTo(bay - c, 0); hole.lineTo(bay - c, spring); hole.absarc(bay / 2, spring, r, 0, PI, false); hole.lineTo(c, 0);
  s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 14 }); // z from 0..depth
  g.translate(0, 0, -depth); // front face at z=0, back at -depth
  return g;
}
function prismGeo(len, depth, hh) { // ridge along x, centred at origin, base y=0
  const a = [-len / 2, 0, -depth / 2], b = [len / 2, 0, -depth / 2], c = [len / 2, 0, depth / 2], d = [-len / 2, 0, depth / 2], e = [-len / 2, hh, 0], f = [len / 2, hh, 0];
  const tri = [a, f, b, a, e, f, d, c, f, d, f, e, a, d, e, b, f, c];
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(tri.flat(), 3)); g.computeVertexNormals(); return g;
}
function carGeo() { // small Italian city car, length along z (front +z), y up; parts: body, glass, wheels
  const body = [], glass = [], wheel = [];
  const rb = (w, h, d, x, y, z, list) => { const g = new THREE.BoxGeometry(w, h, d, 2, 2, 2); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const k = 1 - 0.18 * Math.pow(Math.abs(p.getY(i)) / (h / 2), 3) * 0.5; p.setX(i, p.getX(i) * k); } g.translate(x, y, z); list.push(g); };
  rb(1.52, 0.62, 3.3, 0, 0.55, 0, body);
  const cab = new THREE.CylinderGeometry(0.62, 0.74, 0.55, 4, 1); cab.rotateY(PI / 4); cab.scale(1.3, 1, 2.0); cab.translate(0, 1.12, -0.25); glass.push(cab);
  const top = new THREE.BoxGeometry(1.18, 0.06, 1.55); top.translate(0, 1.41, -0.28); body.push(top);
  for (const [x, z] of [[-0.68, 1.05], [0.68, 1.05], [-0.68, -1.1], [0.68, -1.1]]) { const w = new THREE.CylinderGeometry(0.29, 0.29, 0.2, 16); w.rotateZ(PI / 2); w.translate(x, 0.29, z); wheel.push(w); }
  return { body: merge(body), glass: merge(glass), wheel: merge(wheel) };
}
function merge(list) { return BGU.mergeGeometries(list.map(g => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; })); }
function vespaGeo() {
  const parts = [];
  const body = new THREE.SphereGeometry(0.42, 16, 10); body.scale(0.75, 0.75, 1.5); body.translate(0, 0.55, -0.35); parts.push(body);
  const shield = new THREE.BoxGeometry(0.5, 0.75, 0.12); shield.translate(0, 0.72, 0.55); parts.push(shield);
  const floor = new THREE.BoxGeometry(0.4, 0.08, 0.6); floor.translate(0, 0.32, 0.2); parts.push(floor);
  const seat = new THREE.BoxGeometry(0.32, 0.1, 0.6); seat.translate(0, 0.95, -0.35); parts.push(seat);
  const col = new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8); col.translate(0, 1.05, 0.6); parts.push(col);
  const bar = new THREE.CylinderGeometry(0.025, 0.025, 0.65, 8); bar.rotateZ(PI / 2); bar.translate(0, 1.3, 0.6); parts.push(bar);
  const head = new THREE.SphereGeometry(0.09, 12, 8); head.translate(0, 1.27, 0.68); parts.push(head);
  for (const z of [0.62, -0.62]) { const w = new THREE.CylinderGeometry(0.2, 0.2, 0.1, 14); w.rotateZ(PI / 2); w.translate(0, 0.2, z); parts.push(w); }
  return merge(parts);
}
function bikeGeo() {
  const parts = [];
  for (const z of [0.52, -0.52]) { const w = new THREE.TorusGeometry(0.33, 0.022, 6, 24); w.rotateY(PI / 2); w.translate(0, 0.35, z); parts.push(w); }
  const tube = (a, b, r = 0.018) => { const d = new THREE.Vector3().subVectors(b, a); const g = new THREE.CylinderGeometry(r, r, d.length(), 6); g.translate(0, d.length() / 2, 0); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize())); g.translate(a.x, a.y, a.z); parts.push(g); };
  tube(V(0, 0.35, -0.52), V(0, 0.75, -0.12)); tube(V(0, 0.35, -0.52), V(0, 0.35, 0.05)); tube(V(0, 0.35, 0.05), V(0, 0.75, -0.12)); tube(V(0, 0.75, -0.12), V(0, 0.78, 0.42));
  tube(V(0, 0.35, 0.52), V(0, 0.95, 0.42)); tube(V(-0.25, 0.97, 0.42), V(0.25, 0.97, 0.42)); tube(V(0, 0.75, -0.12), V(0, 0.92, -0.18));
  const seat = new THREE.BoxGeometry(0.12, 0.05, 0.24); seat.translate(0, 0.94, -0.2); parts.push(seat);
  const basket = new THREE.BoxGeometry(0.34, 0.22, 0.28); basket.translate(0, 0.98, 0.62); parts.push(basket);
  return merge(parts);
}
function lampGeo() { // street lamp: pole + curved arm + lantern frame (head separate, emissive)
  const parts = [];
  const base = new THREE.CylinderGeometry(0.16, 0.2, 0.5, 10); base.translate(0, 0.25, 0); parts.push(base);
  const pole = new THREE.CylinderGeometry(0.06, 0.09, 4.2, 10); pole.translate(0, 2.4, 0); parts.push(pole);
  const arm = new THREE.TorusGeometry(0.45, 0.03, 6, 12, PI / 2); arm.rotateY(-PI / 2); arm.translate(0, 4.5, 0.45); parts.push(arm);
  const cap = new THREE.ConeGeometry(0.26, 0.25, 6); cap.translate(0, 4.82, 0.9); parts.push(cap);
  const cage = new THREE.CylinderGeometry(0.2, 0.13, 0.42, 6, 1, true); cage.translate(0, 4.5, 0.9); parts.push(cage);
  return merge(parts);
}
function treeGeo(seed = 3) {
  const R = rng(seed); const blobs = [];
  for (let i = 0; i < 7; i++) { const a = R() * 6.28, d = R() * 1.4; const s = new THREE.IcosahedronGeometry(1.5 + R() * 0.8, 1); s.translate(Math.cos(a) * d, 5.2 + R() * 1.8, Math.sin(a) * d); blobs.push(s); }
  const trunk = new THREE.CylinderGeometry(0.18, 0.3, 5.2, 8); trunk.translate(0, 2.6, 0);
  return { canopy: merge(blobs), trunk: merge([trunk]) };
}

// ================================================================== build
export function buildStreet(root, { low = false, quality = 'high', interiorDoors = true } = {}) {
  const TM = { t: performance.now() }; const mark = k => { const n = performance.now(); TM[k] = Math.round(n - TM.t); TM.t = n; };
  const m = streetMats(); mark('mats'); const B = new Batch(); const R = rng(2024);
  const hooks = { night: [], anim: [], tripo: [], timings: TM };
  const win = { glass: [], lit: [], frame: [], shutter: [], closed: [], sill: [] };
  const lit = [];

  // ---------- buildings ----------
  // buildings that a Tripo house can replace get their own batch/group (hidden when the model is placed)
  const REPL = new Set(['w1', 'w2', 'w3', 'e3', 'p1']); hooks.bld = {};
  const winLists = () => ({ glass: win.glass.length, lit: win.lit.length, frame: win.frame.length, shutter: win.shutter.length, closed: win.closed.length, balc: (hooks.balconies || []).length });
  for (const b of BUILDINGS) {
    const own = REPL.has(b.id); const BB = own ? new Batch() : B; const w0 = winLists(); const extras = [];
    const [x0, z0, x1, z1] = b.rect; const F = facadeOf(b); const ph = portH(b);
    const wallMat = b.brick ? m.brick : b.club ? m.plasterFlat : m.plaster; const col = b.brick ? undefined : b.col; const wuv = b.brick ? 1.0 : 0.5;
    const room = b.interior ? INTERIORS[b.interior] : null;
    // mass: footprint minus portico (ground floor) minus room
    const g = groundRect(b);
    const solid = (a, c, y0, y1) => { if (c[0] - a[0] > 1e-3 && c[1] - a[1] > 1e-3 && y1 - y0 > 1e-3) BB.box(wallMat, a[0], y0, a[1], c[0], y1, c[1], { color: col, uv: wuv }); };
    const gh = groundH(b);
    if (room) { // hollow ground floor: walls around the room (door gap on the street side) + slab over it
      const [rx0, rz0, rx1, rz1] = room.rect, [d0, d1] = room.door, low = b.face === 's';
      solid([g[0], g[1]], [rx0, g[3]], 0, gh); solid([rx1, g[1]], [g[2], g[3]], 0, gh);
      const fz0 = low ? g[1] : rz1, fz1 = low ? rz0 : g[3], bz0 = low ? rz1 : g[1], bz1 = low ? g[3] : rz0;
      solid([rx0, bz0], [rx1, bz1], 0, gh);
      solid([rx0, fz0], [d0, fz1], 0, gh); solid([d1, fz0], [rx1, fz1], 0, gh); solid([d0, fz0], [d1, fz1], 2.45, gh);
      solid([rx0, rz0], [rx1, rz1], room.ceil, gh);
    } else solid([g[0], g[1]], [g[2], g[3]], 0, gh);
    if (gh < b.h - 1e-3) BB.box(wallMat, x0, gh, z0, x1, b.h, z1, { color: col, uv: wuv }); // upper floors (over the portico)
    // cornice + string course
    const fl = F.u1 - F.u0, cu = (F.u0 + F.u1) / 2;
    const band = (y0, y1, d) => { const p = F.pos(cu, 0, 0); if (b.face === 'n' || b.face === 's') { const zz = F.line, s = b.face === 'n' ? 1 : -1; BB.box(m.trim, F.u0 - 0.05, y0, Math.min(zz, zz + s * d), F.u1 + 0.05, y1, Math.max(zz, zz + s * d)); } else { const xx = F.line, s = b.face === 'e' ? 1 : -1; BB.box(m.trim, Math.min(xx, xx + s * d), y0, F.u0 - 0.05, Math.max(xx, xx + s * d), y1, F.u1 + 0.05); } void p; };
    if (!b.club) { band(b.h - 0.45, b.h, 0.42); band(b.h - 0.62, b.h - 0.45, 0.22); band(b.portico ? ph : 3.6, (b.portico ? ph : 3.6) + 0.18, 0.12); }
    // roof
    if (!b.club) {
      const along = b.face === 'n' || b.face === 's';
      const len = (along ? x1 - x0 : z1 - z0) + 0.7, dep = (along ? z1 - z0 : x1 - x0) + 0.7, hh = Math.min(3.2, dep * 0.22);
      const pg = prismGeo(len, dep, hh); if (!along) pg.rotateY(PI / 2); pg.translate((x0 + x1) / 2, b.h, (z0 + z1) / 2);
      BB.add(m.roof, pg, { uv: 0.8 });
      // chimneys
      for (let i = 0; i < 2; i++) { const cx = x0 + 1 + R() * (x1 - x0 - 2), cz = z0 + 1 + R() * (z1 - z0 - 2); BB.box(m.brick, cx - 0.3, b.h, cz - 0.3, cx + 0.3, b.h + hh + 0.9, cz + 0.3, { uv: 1 }); BB.box(m.trim, cx - 0.4, b.h + hh + 0.9, cz - 0.4, cx + 0.4, b.h + hh + 1.0, cz + 0.4); }
    }
    // windows on the upper floors
    const base = b.portico ? ph : 3.6; const floors = Math.max(0, Math.floor((b.h - base - 0.7) / 3.1));
    const nW = Math.max(1, Math.floor(fl / 2.7)); const step = fl / nW;
    for (let f = 0; f < floors; f++) {
      const y = base + 0.95 + f * 3.1 + 0.8;
      for (let i = 0; i < nW; i++) {
        const u = F.u0 + step * (i + 0.5); const p = F.pos(u, y, 0); const yaw = F.yaw; const k = R();
        win.frame.push({ x: p.x, y: p.y, z: p.z, ry: yaw });
        if (k < 0.22 && !b.club) win.closed.push({ x: p.x, y: p.y, z: p.z, ry: yaw, color: b.brick ? '#4a5f3c' : (R() < 0.5 ? '#41603d' : '#6b4b2e') });
        else {
          (R() < 0.38 ? win.lit : win.glass).push({ x: p.x, y: p.y, z: p.z, ry: yaw });
          const sc = b.brick ? '#4a5f3c' : (R() < 0.55 ? '#41603d' : '#6b4b2e');
          for (const s of [-1, 1]) { const q = F.pos(u + s * 0.78 * (b.face === 's' || b.face === 'e' ? -1 : 1), y, 0); win.shutter.push({ x: q.x, y: q.y, z: q.z, ry: yaw, color: sc }); }
        }
        if (f === 0 && R() < 0.3 && !b.club) { // little balcony
          const q = F.pos(u, y - 0.85, 0.35); const along = b.face === 'n' || b.face === 's';
          if (along) BB.box(m.trim, q.x - 0.8, q.y - 0.08, q.z - 0.35, q.x + 0.8, q.y, q.z + 0.35); else BB.box(m.trim, q.x - 0.35, q.y - 0.08, q.z - 0.8, q.x + 0.35, q.y, q.z + 0.8);
          hooks.balconies = (hooks.balconies || []); hooks.balconies.push({ x: q.x, y: q.y, z: q.z, ry: F.yaw });
        }
      }
    }
    // ground floor: door + shop / window
    if (!b.club) {
      const gl = b.portico ? F.ground : F.line; const dp = F.pos(b.door, 0, 0.01, gl);
      const enter = room && interiorDoors;
      if (!enter) { // closed door (wood, two leaves) with a stone frame
        const dg = new THREE.BoxGeometry(1.3, 2.45, 0.08); dg.translate(0, 1.225, 0.04); BB.put(m.door, dg, dp.x, 0, dp.z, F.yaw);
        const fr = new THREE.BoxGeometry(1.6, 2.7, 0.1); fr.translate(0, 1.35, 0.0); BB.put(m.trim, fr, dp.x, 0, dp.z, F.yaw);
        const kn = new THREE.SphereGeometry(0.05, 8, 6); kn.translate(0.2, 1.15, 0.11); BB.put(m.brass, kn, dp.x, 0, dp.z, F.yaw);
      } else { // open doorway frame (the interior is built by places.js)
        const w = room.door[1] - room.door[0];
        const fr = new THREE.BoxGeometry(w + 0.36, 0.25, 0.14); fr.translate(0, 2.55, 0.0); BB.put(m.trim, fr, dp.x, 0, dp.z, F.yaw);
        for (const s of [-1, 1]) { const j = new THREE.BoxGeometry(0.18, 2.6, 0.14); j.translate(s * (w / 2 + 0.09), 1.3, 0); BB.put(m.trim, j, dp.x, 0, dp.z, F.yaw); }
      }
      // shop window / ground floor windows on the facade
      const glen = F.u1 - F.u0;
      for (const u of [F.u0 + glen * 0.2, F.u0 + glen * 0.8]) {
        if (Math.abs(u - b.door) < 1.6) continue;
        const p = F.pos(u, 0, 0.012, gl);
        if (b.shop || b.portico) {
          const sg = new THREE.PlaneGeometry(Math.min(2.6, glen * 0.3), 2.2); sg.translate(0, 1.5, 0.06); BB.put(b.shop ? m.shopLit : m.homeWin, sg, p.x, 0, p.z, F.yaw);
          const fr = new THREE.BoxGeometry(Math.min(2.6, glen * 0.3) + 0.2, 2.45, 0.06); fr.translate(0, 1.42, 0); BB.put(m.shopFrame, fr, p.x, 0, p.z, F.yaw);
        } else {
          const q = F.pos(u, 1.9, 0, gl); win.frame.push({ x: q.x, y: q.y, z: q.z, ry: F.yaw }); win.closed.push({ x: q.x, y: q.y, z: q.z, ry: F.yaw, color: '#5a5f55' });
        }
      }
    }
    // shop sign (plaque over the door / shop window)
    if (b.shop) {
      const gl = b.portico ? F.ground : F.line; const p = F.pos(b.door + (b.face === 's' || b.face === 'e' ? -1.8 : 1.8), 0, 0.03, gl);
      const neon = b.bar;
      const t = neon ? neonTex(b.shop, b.shop === 'PUB' ? '#3cff8a' : b.shop === 'COCKTAIL BAR' ? '#ff4fd8' : '#ffb03c') : plaqueTex(b.shop, { bg: '#f3ead8', fg: '#7a2d1e', border: '#7a2d1e', w: 768, h: 160 });
      const s = signMesh(t, 2.6, neon ? 0.65 : 0.55, neon ? { basic: true, transparent: true } : { emissive: 0.15 });
      s.position.set(p.x, b.portico ? ph - 0.75 : 3.0, p.z); s.rotation.y = F.yaw; root.add(s); extras.push(s);
      if (neon) hooks.night.push(k => { s.material.opacity = 0.55 + k * 0.45; });
      else hooks.night.push(k => { s.material.emissiveIntensity = 0.12 + k * 0.6; });
    }
    if (own) { const g = new THREE.Group(); g.name = 'bld_' + b.id; root.add(g); BB.flush(g, { name: 'bld_' + b.id }); hooks.bld[b.id] = { group: g, w0, w1: winLists(), extras }; }
  }

  mark('// ---------- porticoes (insta');
  // ---------- porticoes (instanced arch bays) ----------
  const porticoes = [];
  { // far side of Via Teletubbylandia: front face at z = 29.4, facing -z
    const n = Math.round((ST.x1 - ST.x0) / ST.bay), bay = (ST.x1 - ST.x0) / n;
    const geo = archGeo(bay, ST.portH, 0.28, 2.75, 0.55);
    const list = []; for (let i = 0; i < n; i++) list.push({ x: ST.x0 + (i + 1) * bay, y: 0, z: ST.colZ, ry: PI }); // rotated PI: local x runs -x
    porticoes.push({ geo, list, run: 'far', bay, n });
    B.box(m.vault, ST.x0, ST.portH - 0.12, ST.colZ, ST.x1, ST.portH, ST.zFar, { color: '#efe4d2' });
    B.box(m.portFloor, ST.x0, 0, ST.colZ, ST.x1, 0.012, ST.zFar, { uv: 0.75 });
  }
  { // Via Petroni, west (front face x=42.5 facing +x) and east (front face x=45.5 facing -x)
    const runs = [{ z0: 46, z1: PET.z1, x: PET.colW, yaw: PI / 2, side: 'w' }, { z0: PET.z0, z1: PET.z1, x: PET.colE, yaw: -PI / 2, side: 'e' }];
    for (const r of runs) {
      const n = Math.round((r.z1 - r.z0) / 3.2), bay = (r.z1 - r.z0) / n; const geo = archGeo(bay, PET.portH, 0.26, 2.55, 0.5);
      const list = []; for (let i = 0; i < n; i++) list.push(r.yaw > 0 ? { x: r.x, y: 0, z: r.z0 + (i + 1) * bay, ry: r.yaw } : { x: r.x, y: 0, z: r.z0 + i * bay, ry: r.yaw });
      porticoes.push({ geo, list, run: r.side, bay, n });
      const xa = r.side === 'w' ? PET.x0 : PET.colE, xb = r.side === 'w' ? PET.colW : PET.x1;
      B.box(m.vault, xa, PET.portH - 0.12, r.z0, xb, PET.portH, r.z1, { color: '#efe2cc' });
      B.box(m.portFloor, xa, 0, r.z0, xb, 0.012, r.z1, { uv: 0.75 });
    }
  }
  const archMat = m.plaster.clone(); archMat.vertexColors = false; archMat.name = 'q:arch';
  const arches = [];
  for (const p of porticoes) {
    // colour each bay like the building above it
    const list = p.list.map(o => { const bx = BUILDINGS.find(b => b.portico && o.x >= b.rect[0] - 0.01 && o.x <= b.rect[2] + 0.01 && o.z >= b.rect[1] - 0.6 && o.z <= b.rect[3] + 0.6); return { ...o, color: bx ? bx.col : '#e0b070' }; });
    const im = instances(p.geo, archMat, list, { name: 'arches' }); root.add(im); arches.push(im);
  }
  hooks.porticoes = porticoes; hooks.arches = arches;
  hooks.tripo.push({ name: 'portico_module', ims: arches, size: ST.portH });

  mark('// ---------- ground: road, si');
  // ---------- ground: road, sidewalks, piazzetta, Petroni ----------
  B.box(m.asphalt, -46, -0.01, ST.curbNear, ST.x1, 0.004, ST.curbFar, { uv: 0.5 });
  B.box(m.sidewalk, ST.x0, 0, ST.zNear, ST.x1, 0.012, ST.curbNear, { uv: 0.7 });
  B.box(m.sidewalk, ST.x0, 0, ST.curbFar - 0.01, ST.x1, 0.012, ST.colZ + 0.01, { uv: 0.7 });
  B.box(m.curb, ST.x0, 0, ST.curbNear - 0.16, ST.x1, 0.07, ST.curbNear, { uv: 1 });
  B.box(m.curb, ST.x0, 0, ST.curbFar, ST.x1, 0.07, ST.curbFar + 0.16, { uv: 1 });
  B.box(m.cobble, PIAZZA.x0, -0.005, PIAZZA.z0, PIAZZA.x1, 0.01, PIAZZA.z1, { uv: 0.8 });
  B.box(m.cobble, PET.colW, -0.005, PET.z0, PET.colE, 0.01, PET.z1, { uv: 0.8 });
  B.box(m.portFloor, PET.x0, 0, PET.z0, PET.colW, 0.012, 46, { uv: 0.75 }); // corner strip under f9
  // road markings: centre dashes + a zebra crossing in front of the garden gate
  const dash = []; for (let x = -44; x < ST.x1 - 1; x += 4.5) if (Math.abs(x - 13) > 3.2) dash.push({ x, y: 0.006, z: 26, sx: 2.2, sz: 0.14 });
  const zebra = []; for (let i = 0; i < 7; i++) zebra.push({ x: 13.1, y: 0.006, z: ST.curbNear + 0.5 + i * 0.92, sx: 3.0, sz: 0.5 });
  { const pg = new THREE.PlaneGeometry(1, 1); pg.rotateX(-PI / 2); root.add(instances(pg, m.paint, dash.concat(zebra), { cast: false, name: 'marks' })); }
  // garden gate: brick pillars + open iron leaf + path stones
  for (const x of [GATE.x0 - 0.2, GATE.x1 + 0.2]) { B.box(m.brick, x - 0.2, 0, GATE.z - 0.2, x + 0.2, 1.7, GATE.z + 0.2, { uv: 1 }); B.box(m.trim, x - 0.26, 1.7, GATE.z - 0.26, x + 0.26, 1.8, GATE.z + 0.26); }
  { const leaf = new THREE.Group(); const bars = []; for (let i = 0; i < 9; i++) { const g = new THREE.BoxGeometry(0.025, 1.25, 0.025); g.translate(0.08 + i * 0.14, 0.7, 0); bars.push(g); } for (const y of [0.15, 1.25]) { const g = new THREE.BoxGeometry(1.25, 0.04, 0.03); g.translate(0.63, y, 0); bars.push(g); }
    const lm = new THREE.Mesh(merge(bars), m.iron); lm.castShadow = true; leaf.add(lm); leaf.position.set(GATE.x0 + 0.02, 0, GATE.z - 0.05); leaf.rotation.y = 1.9; root.add(leaf); }
  for (let i = 0; i < 4; i++) B.box(m.sidewalk, 12.75 + (i % 2) * 0.1, 0.0, 17.2 + i * 0.7, 13.55 + (i % 2) * 0.1, 0.03, 17.65 + i * 0.7, { uv: 1 });

  mark('// ---------- windows (instanc');
  // ---------- windows (instanced, all buildings) ----------
  {
    const gGlass = new THREE.PlaneGeometry(1.0, 1.6); gGlass.translate(0, 0, 0.012);
    const fr = []; for (const [w, h, x, y] of [[1.16, 0.08, 0, 0.84], [1.16, 0.08, 0, -0.84], [0.08, 1.76, -0.58, 0], [0.08, 1.76, 0.58, 0], [0.04, 1.6, 0, 0], [1.0, 0.04, 0, 0.3]]) { const g = new THREE.BoxGeometry(w, h, 0.07); g.translate(x, y, 0.035); fr.push(g); }
    const sill = new THREE.BoxGeometry(1.32, 0.07, 0.2); sill.translate(0, -0.9, 0.08); fr.push(sill);
    const gFrame = merge(fr);
    const gSh = new THREE.BoxGeometry(0.54, 1.66, 0.035); gSh.translate(0, 0, 0.03);
    const gClosed = new THREE.BoxGeometry(1.04, 1.64, 0.035); gClosed.translate(0, 0, 0.03);
    const add = (geo, matl, list, o) => { const im = instances(geo, matl, list, o); if (im) root.add(im); return im; };
    add(gGlass, m.glass, win.glass, { cast: false, name: 'winGlass' });
    add(gGlass, m.glassLit, win.lit, { cast: false, name: 'winLit' });
    add(gFrame, m.frame, win.frame, { name: 'winFrame' });
    add(gSh, m.shutter, win.shutter, { name: 'shutters' });
    add(gClosed, m.shutter, win.closed, { name: 'shuttersClosed' });
    if (hooks.balconies) { const rg = []; const post = new THREE.BoxGeometry(0.025, 0.9, 0.025); for (let i = 0; i < 12; i++) { const g = post.clone(); g.translate(-0.75 + i * 0.136, 0.45, 0.32); rg.push(g); } const top = new THREE.BoxGeometry(1.6, 0.04, 0.05); top.translate(0, 0.9, 0.32); rg.push(top); for (const s of [-1, 1]) { const t = new THREE.BoxGeometry(0.05, 0.04, 0.68); t.translate(s * 0.78, 0.9, 0); rg.push(t); }
      add(merge(rg), m.iron, hooks.balconies.map(o => ({ ...o, z: o.z, x: o.x })), { name: 'balconies' }); }
    hooks.night.push(k => { m.glassLit.emissiveIntensity = 0.03 + k * 1.4; m.shopLit.emissiveIntensity = 0.25 + k * 0.9; m.homeWin.emissiveIntensity = k * 0.7; });
  }

  mark('// ---------- street lamps + p');
  // ---------- street lamps + portico lanterns + light pools ----------
  {
    const lamps = []; for (const x of [-31, -20, -9, 2, 23, 34]) lamps.push({ x, z: ST.curbNear - 0.45, ry: 0 });
    lamps.push({ x: 41, z: 21.2, ry: PI / 4 }, { x: 49, z: 32.6, ry: -3 * PI / 4 });
    const lg = lampGeo(); const poles = instances(lg, m.iron, lamps.map(o => ({ x: o.x, y: 0, z: o.z, ry: o.ry })), { name: 'lamps' }); root.add(poles);
    const head = new THREE.CylinderGeometry(0.17, 0.11, 0.36, 6); head.translate(0, 4.5, 0.9);
    const heads = instances(head, m.lampHead, lamps.map(o => ({ x: o.x, y: 0, z: o.z, ry: o.ry })), { cast: false, name: 'lampHeads' }); root.add(heads);
    // hanging lanterns under the porticoes (every other bay)
    const lan = [];
    { const p = porticoes[0]; for (let i = 0; i < p.n; i += 2) lan.push({ x: ST.x0 + (i + 0.5) * p.bay, y: ST.portH - 0.55, z: (ST.colZ + ST.zFar) / 2 }); }
    for (let z = 48; z < 78; z += 6.4) { lan.push({ x: (PET.x0 + PET.colW) / 2, y: PET.portH - 0.55, z }); lan.push({ x: (PET.colE + PET.x1) / 2, y: PET.portH - 0.55, z: z - 3.2 }); }
    const lanG = merge([(() => { const g = new THREE.CylinderGeometry(0.14, 0.1, 0.32, 6); return g; })()]);
    root.add(instances(lanG, m.lampHead, lan, { cast: false, name: 'lanterns' }));
    const chain = new THREE.CylinderGeometry(0.01, 0.01, 0.4, 4); chain.translate(0, 0.36, 0); root.add(instances(chain, m.iron, lan, { cast: false, name: 'chains' }));
    // additive light pools on the ground (no lighting cost)
    const pg = new THREE.PlaneGeometry(1, 1); pg.rotateX(-PI / 2);
    const pools = lamps.map(o => ({ x: o.x + Math.sin(o.ry) * 0.9, y: 0.02, z: o.z + Math.cos(o.ry) * 0.9, s: 7 })).concat(lan.map(o => ({ x: o.x, y: 0.022, z: o.z, s: 4.2 })));
    const poolIm = instances(pg, m.pool, pools, { cast: false, recv: false, name: 'pools' }); poolIm.renderOrder = 2; root.add(poolIm);
    hooks.night.push(k => { m.lampHead.emissiveIntensity = 0.05 + k * 3.2; m.pool.opacity = k * 0.55; poolIm.visible = k > 0.02; });
    hooks.mats = m;
    hooks.lampSpots = lamps.map(o => V(o.x + Math.sin(o.ry) * 0.9, 4.4, o.z + Math.cos(o.ry) * 0.9)).concat(lan.map(o => V(o.x, o.y - 0.3, o.z)));
    hooks.lamps = { list: lamps, poles, heads, poolIm, n: lamps.length };
  }

  mark('// ---------- parked cars, ves');
  // ---------- parked cars, vespe, bikes, bins, benches, trees ----------
  {
    const cg = carGeo(); const cars = [];
    const cols = ['#c8202a', '#f2efe6', '#7ab8d8', '#e8c040', '#2f4a3a', '#d06a2a', '#8a8f96'];
    [-29.5, -24.5, -15, -2.5, 3, 20, 26.5, 35].forEach((x, i) => cars.push({ x, y: 0, z: ST.curbNear + 1.05, ry: i % 3 === 0 ? -PI / 2 : PI / 2, color: cols[i % cols.length] }));
    const body = instances(cg.body, m.carBody, cars, { name: 'cars' }); root.add(body);
    const glass = instances(cg.glass, m.glass, cars.map(c => ({ ...c, color: undefined })), { name: 'carGlass' }); root.add(glass);
    const wheels = instances(cg.wheel, m.rubber, cars.map(c => ({ ...c, color: undefined })), { name: 'carWheels' }); root.add(wheels);
    hooks.tripo.push({ name: 'fiat500', ims: [body, glass, wheels] });
    const vg = vespaGeo(); const ves = [{ x: 6.2, z: 28.7, ry: 0.3, color: '#8fd3c0' }, { x: 7.2, z: 28.8, ry: 0.2, color: '#e9e2c8' }, { x: 41.6, z: 47.4, ry: PI / 2 + 0.2, color: '#c0302a' }].map(o => ({ ...o, y: 0 }));
    const vim = instances(vg, m.carBody, ves, { name: 'vespe' }); root.add(vim); hooks.tripo.push({ name: 'vespa', ims: [vim] });
    const bg = bikeGeo(); const bikes = [];
    for (const x of [-9.5, -8.9, -8.3, 9.2, 9.8, 16.6, 17.2, 31.4]) bikes.push({ x, y: 0, z: ST.curbFar + 0.55, ry: 0.1 * (R() - 0.5) });
    for (const z of [50, 50.6, 63.5]) bikes.push({ x: 42.25, y: 0, z, ry: PI / 2 });
    const bim = instances(bg, m.iron, bikes, { name: 'bikes' }); root.add(bim); hooks.bikes = bim; hooks.tripo.push({ name: 'bicycle_parked', ims: [bim], size: 1.75, fit: 'width' });
    // recycling bins (grey / blue / yellow / brown)
    const bin = new THREE.BoxGeometry(0.9, 1.25, 0.8); bin.translate(0, 0.625, 0); const lid = new THREE.BoxGeometry(0.96, 0.08, 0.86); lid.translate(0, 1.29, 0); const bgeo = merge([bin, lid]);
    const bins = []; for (const [x0, z, ry] of [[8.0, 20.5, 0], [29.0, 20.5, 0], [-38.2, 20.6, 0]]) ['#6d7277', '#2f5fa8', '#e0c020', '#6a4a30'].forEach((c, i) => bins.push({ x: x0 + i * 1.0, y: 0, z, ry, color: c }));
    const binIm = instances(bgeo, m.plastic, bins, { name: 'bins' }); root.add(binIm); hooks.binSets = [[8.0, 20.5, 0], [29.0, 20.5, 0], [-38.2, 20.6, 0]]; hooks.binIm = binIm; hooks.tripo.push({ name: 'street_bins', ims: [binIm], size: 1.35 });
    // benches (piazzetta)
    const bp = []; for (let i = 0; i < 4; i++) { const g = new THREE.BoxGeometry(1.7, 0.05, 0.1); g.translate(0, 0.46, -0.2 + i * 0.13); bp.push(g); } for (let i = 0; i < 2; i++) { const g = new THREE.BoxGeometry(1.7, 0.1, 0.04); g.translate(0, 0.64 + i * 0.16, 0.3); bp.push(g); }
    const bl = []; for (const s of [-0.75, 0.75]) { const g = new THREE.BoxGeometry(0.06, 0.46, 0.55); g.translate(s, 0.23, 0); bl.push(g); const h = new THREE.BoxGeometry(0.06, 0.4, 0.05); h.translate(s, 0.72, 0.3); bl.push(h); }
    const benches = [{ x: 42.3, z: 25.0, ry: PI / 2 }, { x: 47.8, z: 30.8, ry: -PI / 2 + 0.3 }, { x: 46.0, z: 21.0, ry: PI }].map(o => ({ ...o, y: 0 }));
    const bw = instances(merge(bp), m.wood, benches, { name: 'benches' }); const bi = instances(merge(bl), m.iron, benches, { name: 'benchLegs' }); root.add(bw, bi);
    hooks.tripo.push({ name: 'park_bench', ims: [bw, bi], size: 1.8, fit: 'width' });
    hooks.benchSpots = benches; hooks.benchIms = [bw, bi];
    // plane trees (piazzetta) — instanced trunk + canopy
    const tg = treeGeo(5); const trees = [{ x: 44.5, z: 29.2 }, { x: 48.4, z: 24.5 }, { x: 41.4, z: 30.8 }].map(o => ({ ...o, y: 0, ry: R() * 6, s: 0.85 + R() * 0.25 }));
    const tt = instances(tg.trunk, m.bark, trees, { name: 'treeTrunks' }); const tc = instances(tg.canopy, m.leaves, trees.map(t => ({ ...t, color: '#ffffff' })), { name: 'treeCanopy' }); root.add(tt, tc);
    hooks.tripo.push({ name: 'tree_plane', ims: [tt, tc], size: 8.5 });
    hooks.trees = trees; hooks.treeIms = [tt, tc];
  }

  mark('// ---------- edicola (newssta');
  // ---------- edicola (newsstand) in the piazzetta ----------
  {
    const g = new THREE.Group(); g.position.set(44.3, 0, 24.0); g.rotation.y = PI; root.add(g);
    const kb = new Batch(); const kiosk = new THREE.MeshStandardMaterial({ color: 0x2f5a3a, roughness: 0.55, metalness: 0.3, name: 'q:kiosk' });
    kb.box(kiosk, -1.1, 0, -0.8, 1.1, 2.4, 0.8); kb.box(kiosk, -1.35, 2.4, -1.0, 1.35, 2.55, 1.2); kb.box(m.iron, -1.0, 0.7, 0.8, 1.0, 1.8, 1.0);
    for (let i = 0; i < 5; i++) kb.box(m.shopLit, -0.95 + i * 0.4, 0.9, 1.0, -0.62 + i * 0.4, 1.35, 1.02);
    kb.flush(g, { name: 'edicola' });
    const s = signMesh(plaqueTex('EDICOLA', { bg: '#2f5a3a', fg: '#f3e6b8', border: '#f3e6b8', w: 512, h: 128 }), 1.6, 0.4, { emissive: 0.2 }); s.position.set(0, 2.15, 0.81); g.add(s);
    const cov = signMesh(plaqueTex('CORRIERE DELLE DUE TORRI', { bg: '#f4f0e4', fg: '#1a1a1a', border: '', w: 768, h: 160, sub: 'EDIZIONE STRAORDINARIA' }), 1.9, 0.4); cov.position.set(0, 1.6, 1.035); g.add(cov);
    hooks.tripo.push({ name: 'edicola', obj: g, size: 2.7 });
    hooks.edicola = g;
  }

  mark('// ---------- street name plaq');
  // ---------- street name plaques (Bologna marble plaques) ----------
  const plaque = (text, x, y, z, ry, w = 1.7) => { const s = signMesh(plaqueTex(text, { bg: '#ece7dc', fg: '#2a2a2a', border: '#9a9286', w: 768, h: 192, family: 'Georgia, serif' }), w, w * 0.25); s.position.set(x, y, z); s.rotation.y = ry; root.add(s); return s; };
  plaque('VIA TELETUBBYLANDIA', -34.6, 3.0, 20.04, 0); plaque('VIA TELETUBBYLANDIA', 11.0, 2.6, 20.25, 0, 1.4);
  plaque('VIA TELETUBBYLANDIA', 38.6, 3.0, ST.zFar - 0.02, PI); plaque('PIAZZETTA DEI CABINATI', 50 - 0.02, 3.2, 31.5, -PI / 2, 2.0);
  plaque('VIA PETRONI', PET.x0 + 0.02, 3.0, 44.6, PI / 2); plaque('VIA PETRONI', PET.x1 - 0.02, 3.1, 35.2, -PI / 2);
  // house name plates next to the friends' doors (readable up close)
  for (const b of BUILDINGS) if (b.house) {
    const F = facadeOf(b); const gl = b.portico ? F.ground : F.line; const side = (b.face === 's' || b.face === 'e') ? -1 : 1;
    const p = F.pos(b.door + side * 1.05, 1.45, 0.03, gl); const name = b.house.charAt(0).toUpperCase() + b.house.slice(1);
    const s = signMesh(plaqueTex(name.toUpperCase(), { bg: '#c9a45a', fg: '#2b2010', border: '#7a5a20', w: 384, h: 128, family: 'Georgia, serif' }), 0.36, 0.12, { emissive: 0.05 }); s.position.copy(p); s.rotation.y = F.yaw; root.add(s); if (hooks.bld[b.id]) hooks.bld[b.id].extras.push(s);
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 10), m.brass); bell.rotation.x = PI / 2; bell.position.copy(F.pos(b.door + side * 1.05, 1.3, 0.04, gl)); bell.rotation.z = F.yaw; root.add(bell); if (hooks.bld[b.id]) hooks.bld[b.id].extras.push(bell);
  }

  mark('// ---------- Celtic + Sushi f');
  // ---------- Celtic + Sushi frontages ----------
  {
    const cel = signMesh(plaqueTex('CELTIC', { bg: '#163a26', fg: '#e8c66a', border: '#c9a45a', w: 1024, h: 220, sub: 'IRISH PUB · DAL MERCOLEDÌ' }), 4.6, 1.0, { emissive: 0.25 });
    cel.position.set(3, ST.portH - 0.75, ST.zFar - 0.03); cel.rotation.y = PI; root.add(cel);
    const cel2 = signMesh(plaqueTex('CELTIC', { bg: '#163a26', fg: '#e8c66a', border: '#c9a45a', w: 512, h: 160 }), 1.3, 0.42, { emissive: 0.3 }); // hanging sign under the arches
    cel2.position.set(3, ST.portH - 0.45, ST.colZ + 0.9); cel2.rotation.y = PI; root.add(cel2);
    const cel2b = cel2.clone(); cel2b.rotation.y = 0; cel2b.position.z += 0.01; root.add(cel2b);
    const sus = signMesh(plaqueTex('SUSHI ALL YOU CAN EAT', { bg: '#f4ede0', fg: '#b3261e', border: '#b3261e', w: 1024, h: 200, sub: 'PRANZO · CENA', family: '"Trebuchet MS", sans-serif' }), 4.6, 0.9, { emissive: 0.25 });
    sus.position.set(23, ST.portH - 0.75, ST.zFar - 0.03); sus.rotation.y = PI; root.add(sus);
    // red paper lanterns at the sushi door
    const lm = new THREE.MeshStandardMaterial({ color: 0xd8302a, emissive: 0xff4a2a, emissiveIntensity: 0.3, roughness: 0.6 });
    hooks.signs = { celtic: cel, sushi: sus };
    hooks.sushiLanterns = []; for (const x of [21.6, 24.4]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), lm); l.scale.y = 1.3; l.position.set(x, 3.2, ST.zFar - 0.35); root.add(l); hooks.sushiLanterns.push(l); }
    hooks.night.push(k => { cel.material.emissiveIntensity = 0.2 + k * 0.9; cel2.material.emissiveIntensity = 0.25 + k * 0.9; sus.material.emissiveIntensity = 0.2 + k * 0.8; lm.emissiveIntensity = 0.3 + k * 2.0; });
  }

  mark('// ---------- Via Petroni: str');
  // ---------- Via Petroni: string lights + bar crowd placeholders ----------
  {
    const bulbs = [], wires = [];
    for (let z = 36; z < 77; z += 5.2) {
      const a = V(PET.colW, 4.0, z), b = V(PET.colE, 4.0, z + 1.2);
      for (let i = 0; i <= 8; i++) { const t = i / 8, s = Math.sin(t * PI) * 0.45; bulbs.push({ x: a.x + (b.x - a.x) * t, y: 4.0 - s, z: a.z + (b.z - a.z) * t, s: 1 }); }
      for (let i = 0; i < 8; i++) { const t0 = i / 8, t1 = (i + 1) / 8; wires.push(a.x + (b.x - a.x) * t0, 4.0 - Math.sin(t0 * PI) * 0.45 + 0.05, a.z + (b.z - a.z) * t0, a.x + (b.x - a.x) * t1, 4.0 - Math.sin(t1 * PI) * 0.45 + 0.05, a.z + (b.z - a.z) * t1); }
    }
    const bm = m.bulb; const bi = instances(new THREE.SphereGeometry(0.05, 8, 6), bm, bulbs, { cast: false, name: 'stringBulbs' }); root.add(bi);
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3)); root.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x222222 })));
    hooks.night.push(k => { bm.emissiveIntensity = 0.4 + k * 3.0; });
    // crowd: capsule people outside the bars, more at night
    const body = new THREE.CapsuleGeometry(0.21, 0.95, 4, 8); body.translate(0, 0.72, 0); const headG = new THREE.SphereGeometry(0.13, 10, 8); headG.translate(0, 1.62, 0);
    const ppl = []; const shirt = ['#2a2a3a', '#7a2a2a', '#d8d0c0', '#2f5a8a', '#3a6a3a', '#c88a2a', '#5a3a6a', '#1a1a1a'];
    const spots = [[41.3, 61], [46.7, 52], [46.7, 68], [41.3, 72], [44, 76.4]];
    for (const [sx, sz] of spots) for (let i = 0; i < 4; i++) { const a = R() * 6.28, r = 0.6 + R() * 0.7; ppl.push({ x: clamp(sx + Math.cos(a) * r, PET.x0 + 0.4, PET.x1 - 0.4), y: 0, z: sz + Math.sin(a) * r, ry: R() * 6.28, s: 0.92 + R() * 0.14, color: shirt[(R() * shirt.length) | 0], night: i > 1 }); }
    const crowdMat = m.person.clone(); crowdMat.name = 'q:crowd';
    crowdMat.onBeforeCompile = sh => { sh.uniforms.uTime = hooks.uTime; sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_INSTANCING\n float ph = instanceMatrix[3].x * 3.1 + instanceMatrix[3].z * 1.7;\n transformed.y += max(0.0, sin(uTime * 2.4 + ph)) * 0.035 * smoothstep(0.3, 1.6, position.y);\n transformed.x += sin(uTime * 1.3 + ph) * 0.03 * smoothstep(0.6, 1.7, position.y);\n#endif'); };
    hooks.uTime = { value: 0 };
    const pb = instances(body, crowdMat, ppl, { name: 'crowd' }), ph = instances(headG, m.person, ppl.map(p => ({ ...p, color: '#d9b08c' })), { name: 'crowdHeads' });
    root.add(pb, ph);
    const dayCount = ppl.filter(p => !p.night).length;
    // order: day people first so .count can hide the night ones
    const order = ppl.map((p, i) => [p.night ? 1 : 0, i]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
    const m4 = new THREE.Matrix4(); const tmpB = [], tmpH = []; for (const i of order) { pb.getMatrixAt(i, m4); tmpB.push(m4.clone()); ph.getMatrixAt(i, m4); tmpH.push(m4.clone()); }
    const cTmp = order.map(i => { const c = new THREE.Color(); pb.getColorAt(i, c); return c; });
    tmpB.forEach((mm, i) => { pb.setMatrixAt(i, mm); pb.setColorAt(i, cTmp[i]); ph.setMatrixAt(i, tmpH[i]); });
    // placeholders only after dark (the real NPCs are PERSONAGGI's); by day the street belongs to them
    hooks.night.push(k => { const n = k > 0.4 ? ppl.length : 0; pb.count = n; ph.count = n; pb.visible = ph.visible = n > 0; void dayCount; });
    hooks.crowd = ppl;
  }

  mark('// ---------- Millennium facad');
  // ---------- Millennium facade: neon sign, door glow, stanchions ----------
  {
    const t = neonTex('MILLENNIUM', '#c04cff', { sub: 'DISCO CLUB · SABATO' });
    const s = signMesh(t, 9.0, 2.25, { basic: true, transparent: true }); s.position.set(44, 6.4, 77.96); s.rotation.y = PI; root.add(s); hooks.milSign = s;
    const nm = mat('neon', { color: 0xff3cac, intensity: 2.4 }).clone(); nm.name = 'q:milNeon';
    const nb = new Batch();
    for (const [x0, y0, x1, y1] of [[42.0, 0, 42.12, 3.4], [45.88, 0, 46.0, 3.4], [42.0, 3.3, 46.0, 3.42]]) nb.box(nm, x0, y0, 77.85, x1, y1, 77.95);
    for (const [x0, y0, x1, y1] of [[36.4, 8.5, 51.6, 8.62], [36.4, 0.25, 36.52, 8.6], [51.48, 0.25, 51.6, 8.6]]) nb.box(nm, x0, y0, 77.88, x1, y1, 77.96);
    hooks.milFront = nb.flush(root, { cast: false, name: 'milNeon' });
    const st = []; for (const x of [41.0, 42.0, 46.0, 47.0]) { const g = new THREE.CylinderGeometry(0.04, 0.04, 0.9, 8); g.translate(x, 0.45, 76.6); st.push(g); const k = new THREE.SphereGeometry(0.06, 8, 6); k.translate(x, 0.92, 76.6); st.push(k); }
    const stm = new THREE.Mesh(merge(st), m.chrome); root.add(stm); hooks.milFront.push(stm);
    const rope = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(41.0, 0.85, 76.6), V(41.5, 0.68, 76.6), V(42.0, 0.85, 76.6)]), 10, 0.025, 6), new THREE.MeshStandardMaterial({ color: 0x8a1022, roughness: 0.6 }));
    root.add(rope); const r2 = rope.clone(); r2.position.x = 5; root.add(r2); hooks.milFront.push(rope, r2);
    hooks.night.push(k => { s.material.opacity = 0.7 + k * 0.3; nm.emissiveIntensity = 1.2 + k * 2.4; });
    hooks.anim.push((dt, t) => { const f = 0.85 + 0.15 * Math.sin(t * 9.0) * (Math.sin(t * 0.7) > 0.8 ? 1 : 0.1); s.material.color.setScalar(f); });
  }

  mark('// ---------- Due Torri on the');
  // ---------- Due Torri on the skyline + distant roofs ----------
  {
    const tb = new Batch(); const T = m.tower;
    const tower = (cx, cz, w, h, lean) => {
      const g = new THREE.BoxGeometry(w, h, w, 1, 8, 1); const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const y = p.getY(i) + h / 2, k = 1 - 0.18 * y / h; p.setX(i, p.getX(i) * k + lean * y); p.setZ(i, p.getZ(i) * k); p.setY(i, y); }
      g.computeVertexNormals(); g.translate(cx, 0, cz); tb.add(T, g, { uv: 0.25 });
      const top = new THREE.BoxGeometry(w * 0.9, 1.4, w * 0.9); top.translate(cx + lean * h, h + 0.7, cz); tb.add(T, top, { uv: 0.5 });
      return g;
    };
    tower(44, 124, 7.5, 68, 0); tower(50.5, 121, 7, 34, 0.07);
    { const g = new THREE.CylinderGeometry(1.6, 2.2, 5, 8); g.translate(44, 71.6, 124); tb.add(T, g, { uv: 0.5 }); } // lantern on the Asinelli
    const torriG = new THREE.Group(); torriG.name = 'dueTorri'; root.add(torriG); tb.flush(torriG, { cast: false, name: 'dueTorri' }); hooks.torri = torriG;
    hooks.tripo.push({ name: 'due_torri', obj: null, size: 68 });
    // distant roofs: low boxes around the reserved area (fogged silhouettes)
    const sky = []; const R2 = rng(77);
    for (let i = 0; i < 70; i++) {
      const side = i % 3; let x, z;
      if (side === 0) { x = -30 + R2() * 110; z = 98 + R2() * 22; } else if (side === 1) { x = 66 + R2() * 20; z = 20 + R2() * 90; } else { x = -28 + R2() * 56; z = 50 + R2() * 44; }
      if (x > 28 && x < 64 && z > 44 && z < 96) continue; // keep Petroni/Millennium clear
      const w = 6 + R2() * 10, d = 6 + R2() * 10, h = 8 + R2() * 14;
      sky.push({ x, y: h / 2, z, sx: w, sy: h, sz: d, color: ['#b98a6a', '#c9a07a', '#a87058', '#d0b08a'][(R2() * 4) | 0] });
    }
    const box = new THREE.BoxGeometry(1, 1, 1); root.add(instances(box, m.skyline, sky, { cast: false, recv: false, name: 'skyline' }));
    const roofs = sky.map(s => ({ x: s.x, y: s.y + s.sy / 2, z: s.z, sx: s.sx + 0.6, sy: 2.2, sz: s.sz + 0.6 }));
    const rp = prismGeo(1, 1, 1); root.add(instances(rp, m.roof, roofs, { cast: false, recv: false, name: 'skylineRoofs' }));
  }

  mark('const meshes = B.flush(root, {');
  const meshes = B.flush(root, { name: 'street' });
  for (const mm of meshes) if (mm.material === m.roof || mm.material === m.vault) mm.castShadow = mm.material === m.roof;
  mark('flush'); delete TM.t;
  return hooks;
}
