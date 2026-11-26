// quartiere/nord.js — the northern districts: Via Zamboni (università, portici), Piazza Verdi (Teatro Comunale and its
// steps), Via Rizzoli, Piazza Maggiore (Nettuno, Crescentone, San Petronio, Palazzo d'Accursio, Palazzo del Podestà)
// and the Voltone under f4 that connects them to Via Teletubbylandia. Data in nord_layout.js.
// GPU-friendly by construction: static meshes merged per material in two spatial chunks (kit.Batch: one draw call per
// material per chunk), windows/arches/lamps/bikes/tables instanced, every plaque on ONE canvas atlas (one draw call),
// materials shared with the street (streetMats: same programs, the night hooks of street.js drive them too),
// no THREE lights (lamp glow = emissive heads + additive pools; the quartiere's fixed point-light pool picks the
// nearest lamps at night through SH.lampSpots). Everything is built during the loading screen (quartiere preload).
// The merged chunk meshes are handed to batch.js (PERF's generic BatchedMesh pass, which skips instanced meshes):
// the south and north chunk of a material end up in one draw call with per-chunk frustum culling.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { qmat } from './textures.js';
import { Batch, V, instances, neonTex, signMesh, fitText } from './kit.js';
import { canvas, rng } from '../util.js';
import { streetMats } from './street.js';
import { BUILDINGS, ST } from './layout.js';
import { NORD, ZAM, VERDI, RIZ, MAGG, VOLT, NETTUNO, CRESC, NB, NORD_PROPS, END_BLOCKS, groundRectN, columnsOf, groundSlots } from './nord_layout.js';

const PI = Math.PI;

// ---------------------------------------------------------------- small geometry kit (local copies, facing +z)
function merge(list) {
  return mergeGeometries(list.map(g => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; }));
}
function archGeo(bay, h, c, spring, depth) { // a portico bay: pier + round arch, front face z=0, local x 0..bay
  const r = (bay - 2 * c) / 2;
  const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(bay, 0); s.lineTo(bay, h); s.lineTo(0, h); s.lineTo(0, 0);
  const hole = new THREE.Path(); hole.moveTo(c, 0); hole.lineTo(bay - c, 0); hole.lineTo(bay - c, spring); hole.absarc(bay / 2, spring, r, 0, PI, false); hole.lineTo(c, 0);
  s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 12 }); g.translate(0, 0, -depth); return g;
}
function prismGeo(len, depth, hh) { // gable roof, ridge along x, base y=0
  const a = [-len / 2, 0, -depth / 2], b = [len / 2, 0, -depth / 2], c = [len / 2, 0, depth / 2], d = [-len / 2, 0, depth / 2], e = [-len / 2, hh, 0], f = [len / 2, hh, 0];
  const tri = [a, f, b, a, e, f, d, c, f, d, f, e, a, d, e, b, f, c];
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(tri.flat(), 3)); g.computeVertexNormals(); return g;
}
function lampGeo() {
  const p = [];
  const base = new THREE.CylinderGeometry(0.16, 0.2, 0.5, 8); base.translate(0, 0.25, 0); p.push(base);
  const pole = new THREE.CylinderGeometry(0.06, 0.09, 4.2, 8); pole.translate(0, 2.4, 0); p.push(pole);
  const arm = new THREE.TorusGeometry(0.45, 0.03, 5, 10, PI / 2); arm.rotateY(-PI / 2); arm.translate(0, 4.5, 0.45); p.push(arm);
  const cap = new THREE.ConeGeometry(0.26, 0.25, 6); cap.translate(0, 4.82, 0.9); p.push(cap);
  return merge(p);
}
function bikeGeo() {
  const parts = [];
  for (const z of [0.52, -0.52]) { const w = new THREE.TorusGeometry(0.33, 0.022, 5, 18); w.rotateY(PI / 2); w.translate(0, 0.35, z); parts.push(w); }
  const tube = (a, b, r = 0.018) => { const d = new THREE.Vector3().subVectors(b, a); const g = new THREE.CylinderGeometry(r, r, d.length(), 5); g.translate(0, d.length() / 2, 0); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize())); g.translate(a.x, a.y, a.z); parts.push(g); };
  tube(V(0, 0.35, -0.52), V(0, 0.75, -0.12)); tube(V(0, 0.35, -0.52), V(0, 0.35, 0.05)); tube(V(0, 0.35, 0.05), V(0, 0.75, -0.12)); tube(V(0, 0.75, -0.12), V(0, 0.78, 0.42));
  tube(V(0, 0.35, 0.52), V(0, 0.95, 0.42)); tube(V(-0.25, 0.97, 0.42), V(0.25, 0.97, 0.42));
  const seat = new THREE.BoxGeometry(0.12, 0.05, 0.24); seat.translate(0, 0.94, -0.2); parts.push(seat);
  return merge(parts);
}

// facade frame of a face of rect r: u along the facade, outward normal; pos(u, y, d) world point
function faceOf(r, face) {
  const [x0, z0, x1, z1] = r;
  if (face === 'n') return { u0: x0, u1: x1, yaw: 0, pos: (u, y, d = 0) => V(u, y, z1 + d), line: z1 };
  if (face === 's') return { u0: x0, u1: x1, yaw: PI, pos: (u, y, d = 0) => V(u, y, z0 - d), line: z0 };
  if (face === 'e') return { u0: z0, u1: z1, yaw: PI / 2, pos: (u, y, d = 0) => V(x1 + d, y, u), line: x1 };
  return { u0: z0, u1: z1, yaw: -PI / 2, pos: (u, y, d = 0) => V(x0 - d, y, u), line: x0 };
}
const along = f => f === 'n' || f === 's';

// ---------------------------------------------------------------- plaque atlas: all signs on one texture
function plaqueAtlas(items) { // one row per plaque; the row is as wide as the plaque's aspect (no stretched text)
  const W = 1024, rowH = 96, H = THREE.MathUtils.ceilPowerOfTwo(items.length * rowH);
  const c = canvas(W, H), x = c.getContext('2d'); const widths = [];
  items.forEach((it, i) => {
    const y = i * rowH, w = Math.min(W, Math.round(rowH * it.w / it.h)), h = rowH; widths.push(w);
    x.fillStyle = it.bg; x.fillRect(0, y, w, h);
    if (it.border) { x.strokeStyle = it.border; x.lineWidth = 5; x.strokeRect(6, y + 6, w - 12, h - 12); }
    x.fillStyle = it.fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    fitText(x, it.text, w * 0.86, h * (it.sub ? 0.42 : 0.56), 'bold', it.family || 'Georgia, "Times New Roman", serif');
    x.fillText(it.text, w / 2, y + (it.sub ? h * 0.38 : h * 0.53));
    if (it.sub) { fitText(x, it.sub, w * 0.8, h * 0.2, 'bold', it.family || 'Georgia, serif'); x.fillText(it.sub, w / 2, y + h * 0.77); }
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return { tex: t, uv: i => [0, 1 - ((i + 1) * rowH) / H, widths[i] / W, 1 - (i * rowH) / H] };
}

// ================================================================== build
export function buildNord(root, { low = false, SH = null } = {}) {
  const hooks = { night: [], anim: [], lampSpots: [] };
  const m = streetMats(); const R = rng(4711);
  const marble = qmat('stone', { color: 0xf0e4d6, rough: 0.55 });
  const marbleP = qmat('stone', { color: 0xe7c9bc, rough: 0.6 }); // the Crescentone's pinkish slabs
  const brickR = qmat('brick', { color: 0xd28a6a, ns: 1.1 });     // San Petronio / Accursio / Podestà: Bologna red brick
  const bronze = new THREE.MeshStandardMaterial({ color: 0x5c4a2e, roughness: 0.38, metalness: 0.95, name: 'n:bronze' });
  const water = new THREE.MeshStandardMaterial({ color: 0x2f5866, roughness: 0.08, metalness: 0.35, envMapIntensity: 1.6, name: 'n:water' });
  const dark = new THREE.MeshStandardMaterial({ color: 0x241a14, roughness: 0.85, name: 'n:portal' });
  const jet = new THREE.MeshStandardMaterial({ color: 0xdff0f4, roughness: 0.15, emissive: 0x6f8890, emissiveIntensity: 0.35, name: 'n:jet' }); // the fountain's jets: foamy white
  // two chunks (south: Voltone, Via Zamboni, Piazza Verdi; north: Via Rizzoli, Piazza Maggiore) so frustum/shadow
  // culling can drop the half that is not in view
  const BS = new Batch(), BN = new Batch();
  const Bz = z => (z < RIZ.z0 - 0.01 ? BS : BN);
  const win = { glass: [], lit: [], frame: [], shutter: [], closed: [] };
  const plaques = []; // {text, bg, fg, border, x, y, z, ry, w, h}
  const arches = [];  // {x, z, ry, sx, color}
  const lamps = [];   // {x, z, ry}

  // ---------- ground ----------
  {
    const S = BS, N = BN;
    // Voltone: floor, vaulted ceiling, side walls (the passage through f4)
    S.box(m.portFloor, VOLT.x0, 0, VOLT.z0, VOLT.x1, 0.014, VOLT.z1, { uv: 0.75 });
    S.box(m.vault, VOLT.x0, VOLT.h - 0.12, VOLT.z0, VOLT.x1, VOLT.h, VOLT.z1, { color: '#efe4d2' });
    // Via Zamboni: sidewalk along the backs of the far row, cobbled lane, arcade floor
    S.box(m.sidewalk, NORD.x0, 0, ZAM.z0, NORD.x1, 0.012, ZAM.walkS, { uv: 0.7 });
    S.box(m.curb, NORD.x0, 0, ZAM.walkS - 0.14, NORD.x1, 0.06, ZAM.walkS, { uv: 1 });
    S.box(m.cobble, NORD.x0, -0.004, ZAM.walkS, NORD.x1, 0.01, ZAM.roadN, { uv: 0.8 });
    S.box(m.portFloor, NORD.x0, 0, ZAM.roadN, NORD.x1, 0.013, ZAM.z1, { uv: 0.75 });
    // Piazza Verdi: stone slabs, a darker band where the arcade would be
    S.box(m.sidewalk, VERDI.x0, 0, ZAM.z1, VERDI.x1 + 3.6, 0.012, RIZ.z0, { uv: 0.45 });
    // Via Rizzoli: asphalt with sidewalks
    N.box(m.sidewalk, NORD.x0, 0, RIZ.z0, NORD.x1, 0.012, RIZ.z0 + 1.4, { uv: 0.7 });
    N.box(m.asphalt, NORD.x0, -0.004, RIZ.z0 + 1.4, NORD.x1, 0.006, RIZ.z1 - 1.0, { uv: 0.5 });
    N.box(m.sidewalk, NORD.x0, 0, RIZ.z1 - 1.0, NORD.x1, 0.012, RIZ.z1 + 3.4, { uv: 0.7 });
    // Piazza Maggiore: large slabs + the raised Crescentone in the middle
    N.box(m.sidewalk, MAGG.x0, 0, MAGG.z0, MAGG.x1 + 3.6, 0.012, MAGG.z1, { uv: 0.32 });
    N.box(marbleP, CRESC.x0, 0, CRESC.z0, CRESC.x1, CRESC.h, CRESC.z1, { uv: 0.4 });
    N.box(m.curb, CRESC.x0 - 0.15, 0, CRESC.z0 - 0.15, CRESC.x1 + 0.15, CRESC.h - 0.02, CRESC.z1 + 0.15, { uv: 1 });
    // anything left under the district (between blocks) gets plain paving so the hills never show
    N.box(m.sidewalk, NORD.x0, -0.02, RIZ.z1, NORD.x1, -0.008, 112, { uv: 0.3 });
  }

  // ---------- buildings ----------
  const plaster = m.plaster; // vertex-coloured (per building tint), shared with the street
  for (const b of NB) {
    const [x0, z0, x1, z1] = b.rect; const B = Bz((z0 + z1) / 2);
    const wall = b.brick ? brickR : plaster; const col = b.brick ? undefined : b.col; const wuv = b.brick ? 0.9 : 0.5;
    const g = groundRectN(b); const P = b.portico; const PH = P ? (P.depth > 3.5 ? 4.8 : ZAM.portH) : 0;
    // mass: ground floor (behind the arcade) + upper floors over the whole footprint
    if (P) { B.box(wall, g[0], 0, g[1], g[2], PH, g[3], { color: col, uv: wuv }); B.box(wall, x0, PH, z0, x1, b.h, z1, { color: col, uv: wuv }); }
    else B.box(wall, x0, 0, z0, x1, b.h, z1, { color: col, uv: wuv });
    if (b.kind === 'petronio') { buildPetronio(b, B); continue; }
    // cornice + string course on every street face
    for (const f of b.faces) {
      const F = faceOf(b.rect, f);
      const band = (y0, y1, d) => { if (along(f)) { const z = F.line, s = f === 'n' ? 1 : -1; B.box(m.trim, F.u0 - 0.05, y0, Math.min(z, z + s * d), F.u1 + 0.05, y1, Math.max(z, z + s * d)); } else { const x = F.line, s = f === 'e' ? 1 : -1; B.box(m.trim, Math.min(x, x + s * d), y0, F.u0 - 0.05, Math.max(x, x + s * d), y1, F.u1 + 0.05); } };
      if (!b.brick) { band(b.h - 0.45, b.h, 0.42); band(b.h - 0.62, b.h - 0.45, 0.22); }
      band(P ? PH : 3.8, (P ? PH : 3.8) + 0.18, 0.12);
    }
    // roof (or battlements on the civic palaces)
    if (b.kind === 'accursio' || b.kind === 'podesta') {
      const merl = []; const top = b.h; const step = 1.1;
      for (const f of b.faces) { const F = faceOf(b.rect, f); for (let u = F.u0 + 0.4; u < F.u1 - 0.3; u += step) { const p = F.pos(u, top, -0.25); merl.push(p); } }
      for (const p of merl) B.box(wall, p.x - 0.28, p.y, p.z - 0.28, p.x + 0.28, p.y + 0.9, p.z + 0.28, { color: col, uv: wuv });
      const flat = new THREE.BoxGeometry(x1 - x0 - 0.6, 0.2, z1 - z0 - 0.6); flat.translate((x0 + x1) / 2, b.h - 0.1, (z0 + z1) / 2); B.add(m.roof, flat, { uv: 0.8 });
    } else {
      const al = (x1 - x0) >= (z1 - z0); const len = (al ? x1 - x0 : z1 - z0) + 0.7, dep = (al ? z1 - z0 : x1 - x0) + 0.7, hh = Math.min(3.4, dep * 0.2);
      const pg = prismGeo(len, dep, hh); if (!al) pg.rotateY(PI / 2); pg.translate((x0 + x1) / 2, b.h, (z0 + z1) / 2); B.add(m.roof, pg, { uv: 0.8 });
      for (let i = 0; i < 2; i++) { const cx = x0 + 1 + R() * (x1 - x0 - 2), cz = z0 + 1 + R() * (z1 - z0 - 2); B.box(m.brick, cx - 0.3, b.h, cz - 0.3, cx + 0.3, b.h + hh + 0.9, cz + 0.3, { uv: 1 }); }
    }
    // towers: Specola on the università, Torre dell'Orologio on Accursio, Torre dell'Arengo on the Podestà
    if (b.kind === 'uni') { const cx = x0 + 3, cz = z1 - 4; B.box(wall, cx - 2.2, b.h, cz - 2.2, cx + 2.2, b.h + 8, cz + 2.2, { color: '#d4915e', uv: wuv }); B.box(m.trim, cx - 2.5, b.h + 8, cz - 2.5, cx + 2.5, b.h + 8.4, cz + 2.5); B.box(m.roof, cx - 1.4, b.h + 8.4, cz - 1.4, cx + 1.4, b.h + 10.6, cz + 1.4, { uv: 0.8 }); }
    if (b.kind === 'accursio') { const cx = -33, cz = 90; B.box(wall, cx - 2.3, b.h, cz - 2.3, cx + 2.3, b.h + 13, cz + 2.3, { uv: wuv }); for (const [dx, dz] of [[-1.9, -1.9], [1.9, -1.9], [-1.9, 1.9], [1.9, 1.9]]) B.box(wall, cx + dx - 0.35, b.h + 13, cz + dz - 0.35, cx + dx + 0.35, b.h + 14.1, cz + dz + 0.35, { uv: wuv });
      plaques.push({ clock: true, x: cx + 2.33, y: b.h + 9.5, z: cz, ry: PI / 2, w: 2.6, h: 2.6 }); }
    if (b.kind === 'podesta') { const cx = 2.5, cz = 92; B.box(wall, cx - 2.6, b.h, cz - 2.6, cx + 2.6, b.h + 11, cz + 2.6, { uv: wuv }); B.box(m.roof, cx - 2.9, b.h + 11, cz - 2.9, cx + 2.9, b.h + 11.3, cz + 2.9, { uv: 0.8 });
      for (const [dx, dz] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) B.box(wall, cx + dx - 0.35, b.h + 11.3, cz + dz - 0.35, cx + dx + 0.35, b.h + 12.3, cz + dz + 0.35, { uv: wuv }); }
    // windows on the upper floors of every street face
    for (const f of b.faces) {
      const F = faceOf(b.rect, f); const base = P ? PH : 3.8; const fl = F.u1 - F.u0;
      const floors = Math.max(0, Math.floor((b.h - base - 0.8) / 3.2)); const nW = Math.max(1, Math.floor(fl / 2.8)); const step = fl / nW;
      for (let k = 0; k < floors; k++) {
        const y = base + 1.0 + k * 3.2 + 0.8;
        for (let i = 0; i < nW; i++) {
          const u = F.u0 + step * (i + 0.5); const p = F.pos(u, y, 0); const r = R();
          win.frame.push({ x: p.x, y: p.y, z: p.z, ry: F.yaw });
          if (r < 0.2 && !b.kind) win.closed.push({ x: p.x, y: p.y, z: p.z, ry: F.yaw, color: R() < 0.5 ? '#41603d' : '#6b4b2e' });
          else {
            (R() < 0.42 ? win.lit : win.glass).push({ x: p.x, y: p.y, z: p.z, ry: F.yaw });
            if (!b.brick) { const sc = R() < 0.55 ? '#41603d' : '#6b4b2e'; for (const s of [-1, 1]) { const q = F.pos(u + s * 0.78 * (f === 's' || f === 'e' ? -1 : 1), y, 0); win.shutter.push({ x: q.x, y: q.y, z: q.z, ry: F.yaw, color: sc }); } }
          }
        }
      }
    }
    // portico: arches along the open side, vaulted ceiling, lanterns every other bay
    if (P) {
      const cols = columnsOf(b); const n = cols.length - 1; const color = b.brick ? '#b8664a' : b.col;
      if (P.side === 's') {
        for (let i = 0; i < n; i++) arches.push({ x: x0 + i * cols[0].bay, z: z0, ry: PI, sx: cols[0].bay / 3.6, sy: PH / ZAM.portH, color });
        B.box(m.vault, x0, PH - 0.12, z0, x1, PH, z0 + P.depth, { color: '#efe4d2' });
        for (let i = 0; i < n; i += 2) lamps.push({ lantern: true, x: x0 + (i + 0.5) * cols[0].bay, y: PH - 0.55, z: z0 + P.depth / 2 });
      } else if (P.side === 'w') {
        for (let i = 0; i < n; i++) arches.push({ x: x0, z: z0 + (i + 1) * cols[0].bay, ry: -PI / 2, sx: cols[0].bay / 3.6, sy: PH / ZAM.portH, color });
        B.box(m.vault, x0, PH - 0.12, z0, x0 + P.depth, PH, z1, { color: '#efe4d2' });
        for (let i = 0; i < n; i += 2) lamps.push({ lantern: true, x: x0 + P.depth / 2, y: PH - 0.55, z: z0 + (i + 0.5) * cols[0].bay });
      }
    }
    // ground floor: shop windows / doors (slots shared with nord_layout: RP's delivery doors are the 'door' slots)
    for (const sl of groundSlots(b)) {
      const p = V(sl.x + Math.sin(sl.yaw) * 0.012, 0, sl.z + Math.cos(sl.yaw) * 0.012);
      if (sl.kind === 'shop') {
        const sg = new THREE.PlaneGeometry(2.4, 2.2); sg.translate(0, 1.5, 0.06); B.put(m.shopLit, sg, p.x, 0, p.z, sl.yaw);
        const fr = new THREE.BoxGeometry(2.6, 2.45, 0.06); fr.translate(0, 1.42, 0); B.put(m.shopFrame, fr, p.x, 0, p.z, sl.yaw);
      } else {
        const dg = new THREE.BoxGeometry(1.3, 2.45, 0.08); dg.translate(0, 1.225, 0.04); B.put(m.door, dg, p.x, 0, p.z, sl.yaw);
        const fr = new THREE.BoxGeometry(1.6, 2.7, 0.1); fr.translate(0, 1.35, 0); B.put(m.trim, fr, p.x, 0, p.z, sl.yaw);
      }
    }
    // signs
    const sign = (text, opt = {}) => {
      const f = opt.face || (P ? P.side : b.faces[0]); const onArcade = P && P.side === f; const F = faceOf(onArcade ? g : b.rect, f); const u = opt.u ?? (F.u0 + (F.u1 - F.u0) * 0.5);
      const p = F.pos(u, opt.y ?? (onArcade ? PH - 0.9 : 3.2), 0.03); plaques.push({ text, x: p.x, y: p.y, z: p.z, ry: F.yaw, w: opt.w || 2.6, h: opt.h || 0.5, bg: opt.bg || '#f3ead8', fg: opt.fg || '#7a2d1e', border: opt.border ?? '#7a2d1e', sub: opt.sub, family: opt.family });
    };
    if (b.shop && !b.bar) sign(b.shop);
    if (b.kind === 'uni') { sign('UNIVERSITÀ DI BOLOGNA', { w: 4.2, h: 0.7, sub: 'ALMA MATER STUDIORUM · 1088', bg: '#ece7dc', fg: '#2a2a2a', border: '#9a9286' }); sign('PALAZZO POGGI', { face: 'e', w: 3.2, h: 0.6, y: 3.3, bg: '#ece7dc', fg: '#2a2a2a', border: '#9a9286' }); }
    if (b.kind === 'teatro') sign('TEATRO COMUNALE', { w: 5.6, h: 0.9, sub: 'STAGIONE LIRICA', bg: '#2a2622', fg: '#e8cf8a', border: '#c9a45a', y: PH - 1.0 });
    if (b.kind === 'accursio') sign("PALAZZO D'ACCURSIO", { face: 'e', w: 4.4, h: 0.7, y: 4.6, sub: 'COMUNE DI BOLOGNA', bg: '#ece7dc', fg: '#2a2a2a', border: '#9a9286' });
    if (b.kind === 'podesta') sign('PALAZZO DEL PODESTÀ', { face: 'w', w: 4.0, h: 0.7, bg: '#ece7dc', fg: '#2a2a2a', border: '#9a9286' });
    if (b.bar) { // neon for the bar on the corner of Via Rizzoli (only this one: neon = its own draw call)
      const F = faceOf(g, 's'); const p = F.pos(F.u0 + (F.u1 - F.u0) * 0.5, PH - 0.8, 0.04);
      const s = signMesh(neonTex(b.shop, '#ffb03c'), 2.8, 0.7, { basic: true, transparent: true }); s.position.copy(p); s.rotation.y = F.yaw; root.add(s);
      hooks.night.push(k => { s.material.opacity = 0.5 + k * 0.5; });
    }
  }
  // street-name plaques (marble, Georgia) at the corners
  const street = (text, x, y, z, ry, w = 1.8) => plaques.push({ text, x, y, z, ry, w, h: w * 0.25, bg: '#ece7dc', fg: '#2a2a2a', border: '#9a9286', family: 'Georgia, serif' });
  street('VIA ZAMBONI', -9.0, 3.0, 46.03, 0); street('VIA ZAMBONI', 20, 3.4, ZAM.colZ - 0.03, PI); street('PIAZZA GIUSEPPE VERDI', -13.97, 3.3, 60, PI / 2, 2.2);
  street('VIA RIZZOLI', -20, 3.1, RIZ.z0 + 0.03, 0); street('PIAZZA MAGGIORE', -29.98, 3.5, 84, PI / 2, 2.2); street('IL VOLTONE', -5, VOLT.h - 0.42, ST.zFar - 0.03, PI, 1.5);

  // ---------- the far row's backs (they face Via Zamboni now): windows + back doors ----------
  for (const b of BUILDINGS) {
    if (!(b.face === 's' && b.portico && b.rect[3] === 46)) continue;
    const F = faceOf(b.rect, 'n'); const fl = F.u1 - F.u0; const floors = Math.floor((b.h - 3.8 - 0.7) / 3.1); const nW = Math.max(1, Math.floor(fl / 2.7)), step = fl / nW;
    for (let k = 0; k < floors; k++) for (let i = 0; i < nW; i++) {
      const u = F.u0 + step * (i + 0.5), p = F.pos(u, 3.8 + 0.95 + k * 3.1 + 0.8, 0); if (p.x > NORD.x1 - 0.8) continue; // behind Via Petroni's west row
      win.frame.push({ x: p.x, y: p.y, z: p.z, ry: 0 });
      if (R() < 0.3) win.closed.push({ x: p.x, y: p.y, z: p.z, ry: 0, color: '#41603d' }); else (R() < 0.4 ? win.lit : win.glass).push({ x: p.x, y: p.y, z: p.z, ry: 0 });
    }
    if (b.id === 'f4') continue; // the voltone opens here
    const p = F.pos(b.door, 0, 0.012); const dg = new THREE.BoxGeometry(1.3, 2.45, 0.08); dg.translate(0, 1.225, 0.04); BS.put(m.door, dg, p.x, 0, p.z, 0);
    const fr = new THREE.BoxGeometry(1.6, 2.7, 0.1); fr.translate(0, 1.35, 0); BS.put(m.trim, fr, p.x, 0, p.z, 0);
    for (const s of [-1, 1]) { const q = F.pos(b.door + s * 2.6, 1.9, 0); if (q.x > F.u0 + 0.8 && q.x < F.u1 - 0.8) { win.frame.push({ x: q.x, y: q.y, z: q.z, ry: 0 }); win.closed.push({ x: q.x, y: q.y, z: q.z, ry: 0, color: '#5a5f55' }); } }
  }
  // Via Petroni's pw1 shows its west flank at the end of Via Zamboni (x 30, z 46..51.6): a few windows
  { const F = faceOf([30, 46, 42.5, 56], 'w'); for (let k = 0; k < 3; k++) for (const u of [47.4, 50.2]) { const p = F.pos(u, 4.6 + 0.95 + k * 3.1, 0); win.frame.push({ x: p.x, y: p.y, z: p.z, ry: F.yaw }); if (k === 1) win.lit.push({ x: p.x, y: p.y, z: p.z, ry: F.yaw }); else win.closed.push({ x: p.x, y: p.y, z: p.z, ry: F.yaw, color: '#41603d' }); } }
  // end blocks closing Via Zamboni / Via Rizzoli (beyond the walkable area)
  for (const [x0, z0, x1, z1, h, c] of END_BLOCKS) {
    const B = Bz((z0 + z1) / 2); B.box(plaster, x0, 0, z0, x1, h, z1, { color: c, uv: 0.5 }); const pg = prismGeo(x1 - x0 + 0.7, z1 - z0 + 0.7, 2.2); pg.rotateY(PI / 2); pg.translate((x0 + x1) / 2, h, (z0 + z1) / 2); B.add(m.roof, pg, { uv: 0.8 });
    const F = faceOf([x0, z0, x1, z1], x0 < 0 ? 'e' : 'w'); for (let k = 0; k < 3; k++) for (let i = 0; i < 3; i++) { const p = F.pos(F.u0 + (F.u1 - F.u0) * (i + 0.5) / 3, 4.6 + k * 3.1, 0); win.frame.push({ x: p.x, y: p.y, z: p.z, ry: F.yaw }); win.glass.push({ x: p.x, y: p.y, z: p.z, ry: F.yaw }); }
  }

  // ---------- Teatro Comunale: the steps against the arcade wall (people sit there) ----------
  { const [x0, z0, x1, z1] = NORD_PROPS.steps;
    for (let k = 0; k < 3; k++) BS.box(marble, x0 + k * 0.3, 0, z0, x1, 0.16 + k * 0.16, z1, { uv: 0.8 }); }

  // ---------- San Petronio ----------
  function buildPetronio(b, B) {
    const [x0, z0, x1, z1] = b.rect; const cx = (x0 + x1) / 2; const W = x1 - x0; const z = z0;
    // facade: marble base (0..10 m) with pilasters and three portals, rough brick above (the facade never finished)
    B.box(marble, x0 - 0.2, 0, z - 0.5, x1 + 0.2, 10, z, { uv: 0.6 });
    const portals = [[cx, 3.4, 7.2], [cx - 7.6, 2.4, 5.6], [cx + 7.6, 2.4, 5.6]];
    for (let i = 0; i <= 6; i++) { const x = x0 + 0.6 + i * (W - 1.2) / 6; if (portals.some(([px, pw]) => Math.abs(x - px) < pw / 2 + 1.2)) continue; B.box(marble, x - 0.45, 0, z - 0.95, x + 0.45, 10.4, z - 0.45, { uv: 0.6 }); }
    B.box(marble, x0 - 0.3, 10, z - 1.0, x1 + 0.3, 10.6, z - 0.3, { uv: 0.6 });
    B.box(marbleP, x0 - 0.2, 6.9, z - 0.56, x1 + 0.2, 7.25, z - 0.5, { uv: 0.6 }); // rose marble string course
    for (const [px, pw, ph] of portals) {
      B.box(dark, px - pw / 2, 0, z - 0.52, px + pw / 2, ph, z - 0.5);
      const ag = archGeo(pw + 1.2, ph + 1.6, 0.6, ph, 0.25); ag.translate(-(pw + 1.2) / 2, 0, 0); B.put(m.trim, ag, px, 0, z - 0.75, PI, {}); // frame proud of the marble base
      const st = new THREE.CylinderGeometry(0.24, 0.26, ph + 0.4, 8); for (const s of [-1, 1]) B.put(marble, st, px + s * (pw / 2 + 0.35), (ph + 0.4) / 2, z - 0.75, 0, { uv: 0.5 });
    }
    // upper brick facade with pilasters, gable and the roof
    B.box(brickR, x0, 10.6, z - 0.4, x1, b.h, z, { uv: 0.9 });
    for (let i = 0; i <= 6; i++) { const x = x0 + 0.6 + i * (W - 1.2) / 6; B.box(brickR, x - 0.4, 10.6, z - 0.8, x + 0.4, b.h - 0.2, z - 0.4, { uv: 0.9 }); }
    const gab = new THREE.BufferGeometry(); const gh = 7.5;
    gab.setAttribute('position', new THREE.Float32BufferAttribute([x0, b.h, z - 0.4, x1, b.h, z - 0.4, cx, b.h + gh, z - 0.4, x1, b.h, z - 0.4, x0, b.h, z - 0.4, cx, b.h + gh, z - 0.4].map((v, i) => v), 3));
    gab.computeVertexNormals(); B.add(brickR, gab, { uv: 0.9 });
    const pg = prismGeo(z1 - z0, W, gh); pg.rotateY(PI / 2); pg.translate(cx, b.h, (z0 + z1) / 2); B.add(m.roof, pg, { uv: 0.8 });
    // side chapels' buttresses along the flanks
    for (let zz = z0 + 3; zz < z1; zz += 4) for (const x of [x0 - 1.2, x1]) B.box(brickR, x, 0, zz - 0.5, x + 1.2, b.h - 4, zz + 0.5, { uv: 0.9 });
    plaques.push({ text: 'BASILICA DI SAN PETRONIO', x: cx, y: 8.3, z: z - 0.56, ry: PI, w: 5.6, h: 0.6, bg: '#ece2d4', fg: '#3a2a20', border: '', family: 'Georgia, serif' });
  }

  // ---------- Nettuno: octagonal basin, pedestal, bronze figure with the trident ----------
  {
    const { x, z, r } = NETTUNO; const B = BN;
    const basin = new THREE.CylinderGeometry(r, r + 0.15, 0.75, 8, 1, true); B.put(marble, basin, x, 0.375, z, PI / 8, { uv: 0.6 });
    const rim = new THREE.TorusGeometry(r, 0.16, 5, 8); rim.rotateX(PI / 2); B.put(marble, rim, x, 0.75, z, PI / 8, { uv: 0.6 });
    const wat = new THREE.CircleGeometry(r - 0.05, 8); wat.rotateX(-PI / 2); B.put(water, wat, x, 0.6, z, PI / 8);
    const steps = new THREE.CylinderGeometry(r + 0.9, r + 1.1, 0.22, 8); B.put(marble, steps, x, 0.11, z, PI / 8, { uv: 0.6 });
    const ped1 = new THREE.BoxGeometry(2.2, 1.6, 2.2); B.put(marble, ped1, x, 1.4, z, 0, { uv: 0.6 });
    const ped2 = new THREE.BoxGeometry(1.5, 1.4, 1.5); B.put(marble, ped2, x, 2.9, z, 0, { uv: 0.6 });
    const bodyParts = [];
    const add = (geo, px, py, pz, rx = 0, rz = 0) => { geo.rotateX(rx); geo.rotateZ(rz); geo.translate(px, py, pz); bodyParts.push(geo); };
    add(new THREE.CylinderGeometry(0.34, 0.42, 1.2, 10), 0, 4.45, 0);          // torso
    add(new THREE.CylinderGeometry(0.42, 0.3, 0.5, 10), 0, 3.75, 0);           // hips
    add(new THREE.CylinderGeometry(0.15, 0.12, 1.1, 8), -0.18, 3.15, 0.05, 0, 0.12); // legs
    add(new THREE.CylinderGeometry(0.15, 0.12, 1.1, 8), 0.2, 3.15, -0.08, 0, -0.18);
    add(new THREE.SphereGeometry(0.24, 10, 8), 0, 5.3, 0.02);                   // head
    add(new THREE.ConeGeometry(0.26, 0.3, 8), 0, 5.06, 0.08, PI);                 // beard
    add(new THREE.CylinderGeometry(0.1, 0.09, 0.95, 8), 0.48, 5.05, 0, 0, -1.0); // raised arm
    add(new THREE.CylinderGeometry(0.1, 0.09, 0.9, 8), -0.5, 4.55, 0.18, 0.5, 0.9); // arm out
    add(new THREE.CylinderGeometry(0.035, 0.035, 3.4, 6), 0.88, 4.6, 0.05);      // trident shaft
    for (const dx of [-0.16, 0, 0.16]) add(new THREE.ConeGeometry(0.045, 0.4, 5), 0.88 + dx, 6.45, 0.05);
    add(new THREE.BoxGeometry(0.4, 0.05, 0.05), 0.88, 6.25, 0.05);
    for (const [dx, dz] of [[1.25, 1.25], [-1.25, 1.25], [1.25, -1.25], [-1.25, -1.25]]) add(new THREE.SphereGeometry(0.28, 8, 6), dx, 2.25, dz); // the corner putti
    const statue = merge(bodyParts); B.put(bronze, statue, x, 0, z, -PI / 2 - 0.5);
    // water: four jets from the corners (thin glossy tubes) — still geometry, the shader of `water` does the sparkle
    for (const [dx, dz] of [[1.2, 1.2], [-1.2, 1.2], [1.2, -1.2], [-1.2, -1.2]]) {
      const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(V(x + dx * (1 + t * 0.9), 2.2 + Math.sin(t * PI) * 0.4 - t * 1.6, z + dz * (1 + t * 0.9))); }
      const tg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.022, 5); B.add(jet, tg);
    }
  }

  // ---------- street furniture ----------
  for (const [x, z, ry] of NORD_PROPS.lamps) lamps.push({ x, z, ry });
  {
    const street = lamps.filter(l => !l.lantern), lan = lamps.filter(l => l.lantern);
    const poles = instances(lampGeo(), m.iron, street.map(o => ({ x: o.x, y: 0, z: o.z, ry: o.ry })), { name: 'n:lamps' }); root.add(poles);
    const head = new THREE.CylinderGeometry(0.17, 0.11, 0.36, 6); head.translate(0, 4.5, 0.9);
    const lanG = new THREE.CylinderGeometry(0.14, 0.1, 0.32, 6);
    // heads + lanterns: ONE instanced mesh (the lantern geometry is the head geometry moved/scaled per instance)
    const heads = instances(head, m.lampHead, street.map(o => ({ x: o.x, y: 0, z: o.z, ry: o.ry })).concat(lan.map(o => ({ x: o.x, y: o.y - 4.5 * 0.85, z: o.z - 0.9 * 0.85, s: 0.85 }))), { cast: false, name: 'n:lampHeads' }); root.add(heads); void lanG;
    const pg = new THREE.PlaneGeometry(1, 1); pg.rotateX(-PI / 2);
    const pools = street.map(o => ({ x: o.x + Math.sin(o.ry) * 0.9, y: 0.024, z: o.z + Math.cos(o.ry) * 0.9, s: 7 })).concat(lan.map(o => ({ x: o.x, y: 0.026, z: o.z, s: 4.2 })));
    const poolIm = instances(pg, m.pool, pools, { cast: false, recv: false, name: 'n:pools' }); poolIm.renderOrder = 2; root.add(poolIm);
    hooks.night.push(k => { poolIm.visible = k > 0.02; });
    hooks.lampSpots = street.map(o => V(o.x + Math.sin(o.ry) * 0.9, 4.4, o.z + Math.cos(o.ry) * 0.9)).concat(lan.map(o => V(o.x, o.y - 0.3, o.z)));
  }
  // bikes chained along the università arcade (Bologna)
  { const bikes = []; const colX = NB.flatMap(b => columnsOf(b).filter(c => Math.abs(c.z - ZAM.colZ - 0.3) < 0.01).map(c => c.x));
    for (const [x0, x1, z] of NORD_PROPS.bikes) for (let x = x0 + 0.3; x < x1 - 0.2; x += 0.62) { if (colX.some(c => Math.abs(c - x) < 0.45)) continue; bikes.push({ x, y: 0, z, ry: 0.08 * (R() - 0.5), color: ['#2a2a2a', '#7a1e1e', '#2f4a6a', '#c8c0b0', '#3a5a3a'][(R() * 5) | 0] }); }
    root.add(instances(bikeGeo(), m.iron, bikes, { name: 'n:bikes' })); hooks.bikes = bikes; }
  // café tables + chairs outside the Cantina and the Gelateria (instanced; tops and legs in two meshes)
  {
    const t = NORD_PROPS.tables.map(([x, z]) => ({ x, y: 0, z, ry: R() * 6 }));
    const top = new THREE.CylinderGeometry(0.42, 0.42, 0.04, 14); top.translate(0, 0.74, 0);
    const leg = new THREE.CylinderGeometry(0.03, 0.03, 0.72, 6); leg.translate(0, 0.36, 0); const foot = new THREE.CylinderGeometry(0.22, 0.24, 0.03, 10); foot.translate(0, 0.015, 0);
    const ch = []; for (const a of [0, PI]) { const s = new THREE.BoxGeometry(0.42, 0.04, 0.42); s.translate(0, 0.46, 0.72); s.rotateY(a); ch.push(s); const bk = new THREE.BoxGeometry(0.42, 0.45, 0.04); bk.translate(0, 0.7, 0.92); bk.rotateY(a); ch.push(bk); for (const dx of [-0.18, 0.18]) for (const dz of [0.54, 0.9]) { const l = new THREE.CylinderGeometry(0.018, 0.018, 0.46, 5); l.translate(dx, 0.23, dz); l.rotateY(a); ch.push(l); } }
    root.add(instances(top, m.plastic, t.map(o => ({ ...o, color: '#f2efe6' })), { name: 'n:tableTops' }), instances(merge([leg, foot, ...ch]), m.plastic, t.map(o => ({ ...o, color: '#9c948a' })), { name: 'n:tableLegs' }));
    hooks.tables = t;
  }
  // ---------- instanced: windows, arches ----------
  {
    const gGlass = new THREE.PlaneGeometry(1.0, 1.6); gGlass.translate(0, 0, 0.012);
    const fr = []; for (const [w, h, x, y] of [[1.16, 0.08, 0, 0.84], [1.16, 0.08, 0, -0.84], [0.08, 1.76, -0.58, 0], [0.08, 1.76, 0.58, 0], [0.04, 1.6, 0, 0], [1.0, 0.04, 0, 0.3]]) { const g = new THREE.BoxGeometry(w, h, 0.07); g.translate(x, y, 0.035); fr.push(g); }
    const sill = new THREE.BoxGeometry(1.32, 0.07, 0.2); sill.translate(0, -0.9, 0.08); fr.push(sill);
    const gSh = new THREE.BoxGeometry(0.54, 1.66, 0.035); gSh.translate(0, 0, 0.03);
    const gClosed = new THREE.BoxGeometry(1.04, 1.64, 0.035); gClosed.translate(0, 0, 0.03);
    const add = (geo, mm, list, o) => { const im = instances(geo, mm, list, o); if (im) root.add(im); return im; };
    add(gGlass, m.glass, win.glass, { cast: false, name: 'n:winGlass' });
    add(gGlass, m.glassLit, win.lit, { cast: false, name: 'n:winLit' });
    add(merge(fr), m.frame, win.frame, { cast: false, name: 'n:winFrame' });
    add(gSh, m.shutter, win.shutter, { cast: false, name: 'n:shutters' });
    add(gClosed, m.shutter, win.closed, { cast: false, name: 'n:shuttersClosed' });
    hooks.windows = win;
    const archMat = streetMats().plaster.clone(); archMat.vertexColors = false; archMat.name = 'n:arch';
    const ag = archGeo(3.6, ZAM.portH, 0.3, 2.85, 0.55); ag.translate(-3.6, 0, 0); // local x -3.6..0: the bay ends at the instance origin
    const im = instances(ag, archMat, arches, { name: 'n:arches' }); if (im) root.add(im);
  }

  // ---------- plaque atlas (one draw call for every marble/shop plaque + the clock) ----------
  {
    const items = plaques.filter(p => !p.clock);
    const A = plaqueAtlas(items.map(p => ({ text: p.text, bg: p.bg, fg: p.fg, border: p.border, sub: p.sub, family: p.family, w: p.w, h: p.h })));
    const geos = items.map((p, i) => { const g = new THREE.PlaneGeometry(p.w, p.h); const [u0, v0, u1, v1] = A.uv(i); const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) ? u1 : u0, uv.getY(k) ? v1 : v0); g.rotateY(p.ry); g.translate(p.x, p.y, p.z); return g; });
    // the clock of Palazzo d'Accursio: drawn on its own little canvas, merged as an extra quad of the same mesh
    const clockP = plaques.find(p => p.clock); let clockTex = null;
    const mat = new THREE.MeshStandardMaterial({ map: A.tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: A.tex, emissiveIntensity: 0.12, name: 'n:plaques' });
    const mesh = new THREE.Mesh(merge(geos), mat); mesh.name = 'n:plaques'; mesh.castShadow = false; root.add(mesh);
    hooks.night.push(k => { mat.emissiveIntensity = 0.12 + k * 0.5; });
    if (clockP) {
      const c = canvas(256, 256), x = c.getContext('2d'); x.fillStyle = '#efe6d0'; x.beginPath(); x.arc(128, 128, 120, 0, 6.283); x.fill(); x.strokeStyle = '#2a1f14'; x.lineWidth = 10; x.stroke();
      x.fillStyle = '#2a1f14'; for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; x.fillRect(128 + Math.sin(a) * 96 - 4, 128 - Math.cos(a) * 96 - 10, 8, 20); }
      clockTex = new THREE.CanvasTexture(c); clockTex.colorSpace = THREE.SRGBColorSpace;
      const cm = new THREE.MeshStandardMaterial({ map: clockTex, emissive: 0xffe6b0, emissiveMap: clockTex, emissiveIntensity: 0.1, roughness: 0.5, name: 'n:clock' });
      const face = new THREE.Mesh(new THREE.CircleGeometry(clockP.w / 2, 24), cm); face.position.set(clockP.x, clockP.y, clockP.z); face.rotation.y = clockP.ry; root.add(face);
      // hands: two thin boxes, turned once a second with the real time of day
      const hand = (len, w) => { const g = new THREE.BoxGeometry(w, len, 0.03); g.translate(0, len / 2, 0); const mm = new THREE.Mesh(g, bronze); mm.userData.noBatch = true; mm.position.set(clockP.x + 0.03, clockP.y, clockP.z); mm.rotation.y = clockP.ry; root.add(mm); return mm; }; // they turn: not for batch.js
      const hh = hand(0.7, 0.09), mh = hand(1.0, 0.06); let acc = 1;
      hooks.anim.push(dt => { acc += dt; if (acc < 1) return; acc = 0; const d = new Date(), h = (d.getHours() % 12) + d.getMinutes() / 60, mi = d.getMinutes() + d.getSeconds() / 60; hh.rotation.x = -h / 12 * 2 * PI; mh.rotation.x = -mi / 60 * 2 * PI; });
      hooks.night.push(k => { cm.emissiveIntensity = 0.1 + k * 1.2; });
    }
  }

  // ---------- flush the two chunks ----------
  const gs = new THREE.Group(); gs.name = 'nord:sud'; root.add(gs);
  const gn = new THREE.Group(); gn.name = 'nord:nord'; root.add(gn);
  const ms = BS.flush(gs, { name: 'nord-s' }), mn = BN.flush(gn, { name: 'nord-n' });
  // the two chunks are left to batch.js (PERF): same-material chunks become ONE BatchedMesh with per-chunk culling
  for (const mm of ms.concat(mn)) { if (mm.material === m.vault || mm.material === water || mm.material === m.portFloor || mm.material === m.sidewalk || mm.material === m.cobble || mm.material === m.asphalt || mm.material === marbleP) mm.castShadow = false; }
  hooks.chunks = { south: gs, north: gn };
  return hooks;
}

// cheap stand-in for the far view (from the garden / the near sidewalk): boxes + roofs of the district's blocks,
// two instanced draw calls, shown only while the real district is hidden
export function nordSilhouette(root) {
  const m = streetMats(); const box = new THREE.BoxGeometry(1, 1, 1);
  const list = NB.map(b => { const [x0, z0, x1, z1] = b.rect; return { x: (x0 + x1) / 2, y: b.h / 2, z: (z0 + z1) / 2, sx: x1 - x0, sy: b.h, sz: z1 - z0, color: b.brick ? '#b4553a' : b.col }; });
  list.push({ x: -33, y: 25, z: 90, sx: 4.6, sy: 14, sz: 4.6, color: '#b4553a' }, { x: 2.5, y: 22.5, z: 92, sx: 5.2, sy: 11, sz: 5.2, color: '#a84a32' }, { x: -23, y: 19, z: 69, sx: 4.4, sy: 8, sz: 4.4, color: '#d4915e' });
  const im = instances(box, m.skyline, list, { cast: false, recv: false, name: 'n:silhouette' });
  const roofs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), m.roof, 1); roofs.visible = false; void roofs;
  const g = new THREE.Group(); g.name = 'nord:silhouette'; g.add(im); root.add(g); return g;
}
