// quartiere/kit.js — small geometry kit: world-space-UV boxes merged per material (1 draw call per material),
// instanced repeats, canvas sign textures. Everything static goes through a Batch.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvas } from '../util.js';

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _c = new THREE.Color();

// planar UVs from world position, picked per vertex by the dominant normal axis (1 UV unit = 1/scale m)
export function worldUV(geo, scale = 1) {
  const p = geo.attributes.position, n = geo.attributes.normal; const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i)); let u, v;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); } else if (ax >= az) { u = p.getZ(i); v = p.getY(i); } else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u * scale; uv[i * 2 + 1] = v * scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return geo;
}

function paint(geo, color) {
  _c.set(color ?? 0xffffff); const n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo;
}

// geometries collected per material; flush() merges each list into one mesh
export class Batch {
  constructor() { this.lists = new Map(); }
  add(mat, geo, { color, uv = 0 } = {}) {
    if (geo.index) geo = geo.toNonIndexed();
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (uv) worldUV(geo, uv);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    if (mat.vertexColors) paint(geo, color); else if (geo.attributes.color) geo.deleteAttribute('color');
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) geo.deleteAttribute(k);
    if (!this.lists.has(mat)) this.lists.set(mat, []);
    this.lists.get(mat).push(geo); return geo;
  }
  // axis-aligned box from min/max corners (world coords)
  box(mat, x0, y0, z0, x1, y1, z1, o = {}) {
    const g = new THREE.BoxGeometry(Math.max(1e-3, x1 - x0), Math.max(1e-3, y1 - y0), Math.max(1e-3, z1 - z0));
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return this.add(mat, g, { uv: o.uv ?? 0.5, color: o.color });
  }
  // any geometry placed with position / rotation.y / scale
  put(mat, geo, x, y, z, ry = 0, o = {}) {
    const g = geo.clone(); if (o.sx || o.sy || o.sz) g.scale(o.sx || 1, o.sy || 1, o.sz || 1); if (o.rx) g.rotateX(o.rx); if (o.rz) g.rotateZ(o.rz); if (ry) g.rotateY(ry); g.translate(x, y, z);
    return this.add(mat, g, o);
  }
  flush(parent, { cast = true, recv = true, name = '' } = {}) {
    const out = [];
    for (const [mat, geos] of this.lists) {
      if (!geos.length) continue;
      const g = mergeGeometries(geos); if (!g) continue; g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat); m.castShadow = cast && !mat.transparent; m.receiveShadow = recv; m.name = name + ':' + (mat.name || 'm'); m.matrixAutoUpdate = false; m.updateMatrix();
      parent.add(m); out.push(m); for (const x of geos) x.dispose();
    }
    this.lists.clear(); return out;
  }
}

// one InstancedMesh from a list of {x,y,z,ry,s|sx,sy,sz,color}
export function instances(geo, mat, list, { cast = true, recv = true, name = '' } = {}) {
  if (!list.length) return null;
  const im = new THREE.InstancedMesh(geo, mat, list.length); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = V(), p = V();
  list.forEach((o, i) => {
    e.set(o.rx || 0, o.ry || 0, o.rz || 0); q.setFromEuler(e); p.set(o.x, o.y || 0, o.z);
    s.set(o.sx ?? o.s ?? 1, o.sy ?? o.s ?? 1, o.sz ?? o.s ?? 1); m4.compose(p, q, s); im.setMatrixAt(i, m4);
    if (o.color !== undefined) im.setColorAt(i, _c.set(o.color));
  });
  im.castShadow = cast; im.receiveShadow = recv; im.name = name; im.computeBoundingSphere(); im.computeBoundingBox && im.computeBoundingBox();
  return im;
}

// ---------- canvas signs ----------
const texCache = new Map();
export function signTex(key, w, h, draw) {
  if (texCache.has(key)) return texCache.get(key);
  const c = canvas(w, h), x = c.getContext('2d'); draw(x, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; texCache.set(key, t); return t;
}
export function fitText(x, text, maxW, size, font = 'bold', family = 'Georgia, "Times New Roman", serif') {
  let s = size; x.font = `${font} ${s}px ${family}`;
  while (x.measureText(text).width > maxW && s > 8) { s -= 2; x.font = `${font} ${s}px ${family}`; }
  return s;
}
// painted shop sign / plaque: bg, fg, optional border and second line
export function plaqueTex(text, { w = 1024, h = 192, bg = '#1e3a2a', fg = '#e8c66a', border = '#c9a45a', family, sub = '', italic = false } = {}) {
  return signTex('pl:' + text + bg + fg + sub, w, h, (x, W, H) => {
    x.fillStyle = bg; x.fillRect(0, 0, W, H);
    if (border) { x.strokeStyle = border; x.lineWidth = H * 0.05; x.strokeRect(H * 0.06, H * 0.06, W - H * 0.12, H - H * 0.12); }
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    fitText(x, text, W * 0.86, H * (sub ? 0.48 : 0.62), (italic ? 'italic ' : '') + 'bold', family);
    x.fillText(text, W / 2, sub ? H * 0.4 : H * 0.53);
    if (sub) { fitText(x, sub, W * 0.8, H * 0.2, 'bold', family); x.fillText(sub, W / 2, H * 0.78); }
  });
}
// neon text: transparent background, coloured glow (use with additive or emissive material)
export function neonTex(text, color = '#ff3cac', { w = 1024, h = 256, family = '"Arial Black", Impact, sans-serif', sub = '' } = {}) {
  return signTex('ne:' + text + color + sub, w, h, (x, W, H) => {
    x.clearRect(0, 0, W, H); x.textAlign = 'center'; x.textBaseline = 'middle';
    const size = fitText(x, text, W * 0.9, H * (sub ? 0.5 : 0.7), '900', family);
    const y = sub ? H * 0.38 : H * 0.52;
    for (const [blur, a] of [[H * 0.18, 0.55], [H * 0.08, 0.8], [H * 0.03, 1]]) { x.shadowColor = color; x.shadowBlur = blur; x.globalAlpha = a; x.strokeStyle = color; x.lineWidth = size * 0.09; x.strokeText(text, W / 2, y); }
    x.shadowBlur = H * 0.02; x.globalAlpha = 1; x.fillStyle = '#ffffff'; x.fillText(text, W / 2, y);
    if (sub) { fitText(x, sub, W * 0.8, H * 0.2, '900', family); x.shadowBlur = H * 0.06; x.fillStyle = '#fff'; x.fillText(sub, W / 2, H * 0.8); }
  });
}
// a flat sign mesh (plane) facing +z by default
export function signMesh(texture, w, h, { emissive = 0, transparent = false, basic = false, rough = 0.6 } = {}) {
  const m = basic ? new THREE.MeshBasicMaterial({ map: texture, transparent, depthWrite: !transparent, toneMapped: false, fog: true })
    : new THREE.MeshStandardMaterial({ map: texture, roughness: rough, transparent, emissive: emissive ? 0xffffff : 0x000000, emissiveMap: emissive ? texture : null, emissiveIntensity: emissive });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); return mesh;
}
// place an object on a facade: face 'n' -> facing +z at z, 's' -> -z, 'e' -> +x, 'w' -> -x
export function faceYaw(face) { return face === 'n' ? 0 : face === 's' ? Math.PI : face === 'e' ? Math.PI / 2 : -Math.PI / 2; }

// small radial gradient sprite texture (light pools, glows)
let glowT = null;
export function glowTex() {
  if (glowT) return glowT;
  const c = canvas(128, 128), x = c.getContext('2d'); const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); glowT = new THREE.CanvasTexture(c); return glowT;
}
