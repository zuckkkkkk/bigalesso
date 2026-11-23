import * as THREE from 'three';

// deterministic RNG
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// value noise 2D, tileable with period px,py
function hash2(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function makeNoise(seed = 7) {
  return function noise(x, y, px = 1e9, py = 1e9) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const m = (a, p) => ((a % p) + p) % p;
    const x0 = m(xi, px), x1 = m(xi + 1, px), y0 = m(yi, py), y1 = m(yi + 1, py);
    const a = hash2(x0, y0, seed), b = hash2(x1, y0, seed), c = hash2(x0, y1, seed), d = hash2(x1, y1, seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
export function fbm(noise, x, y, oct = 4, px = 1e9, py = 1e9) {
  let a = 0.5, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise(x * f, y * f, px * f, py * f); n += a; a *= 0.5; f *= 2; }
  return s / n;
}

export function canvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

export function tex(c, { srgb = true, repeat = null, aniso = 8, nearest = false } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.anisotropy = aniso;
  if (nearest) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; }
  return t;
}

// normal map canvas from height Float32Array (w*h), strength
export function normalFromHeight(hgt, w, h, strength = 2, wrap = true) {
  const c = canvas(w, h); const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h); const d = img.data;
  const at = (x, y) => {
    if (wrap) { x = (x + w) % w; y = (y + h) % h; } else { x = Math.max(0, Math.min(w - 1, x)); y = Math.max(0, Math.min(h - 1, y)); }
    return hgt[y * w + x];
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
    const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    let nx = -dx, ny = dy, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * w + x) * 4;
    d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); return c;
}

export function loadImage(url) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const ease = t => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export function damp(a, b, lambda, dt) { return lerp(a, b, 1 - Math.exp(-lambda * dt)); }

// ---------------------------------------------------------------- perf: static batching
// Merge an explicit list of STATIC meshes (and the meshes inside listed groups) into one mesh per
// (material, shadow flags, render order, attribute layout). Multi-material meshes are split by
// group, so a 6-material wall box stops costing 6 draw calls. Transparent / skinned / instanced
// meshes are left untouched. Materials are shared, so material animation keeps working.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
export function batchMeshes(list, parent) {
  parent.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(parent.matrixWorld).invert();
  const meshes = [];
  for (const o of list) o.traverse(m => { if (m.isMesh && m.visible) meshes.push(m); });
  const buckets = new Map(), done = [];
  for (const o of meshes) {
    if (o.isInstancedMesh || o.isSkinnedMesh || o.morphTargetInfluences || o.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) continue;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (mats.some(m => !m || m.transparent)) continue;
    const xf = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(xf);
    const groups = Array.isArray(o.material) && g.groups.length ? g.groups : [{ start: 0, count: g.attributes.position.count, materialIndex: 0 }];
    for (const gr of groups) {
      const mat = mats[gr.materialIndex] || mats[0];
      const sub = new THREE.BufferGeometry();
      const end = Math.min(gr.start + gr.count, g.attributes.position.count);
      for (const [k, a] of Object.entries(g.attributes)) sub.setAttribute(k, new THREE.BufferAttribute(a.array.slice(gr.start * a.itemSize, end * a.itemSize), a.itemSize, a.normalized));
      const key = [mat.uuid, o.castShadow, o.receiveShadow, o.renderOrder, Object.keys(g.attributes).sort().join(',')].join('|');
      if (!buckets.has(key)) buckets.set(key, { mat, src: o, geos: [] });
      buckets.get(key).geos.push(sub);
    }
    g.dispose(); done.push(o);
  }
  let calls = 0;
  for (const { mat, src, geos } of buckets.values()) {
    let merged = null;
    try { merged = geos.length > 1 ? mergeGeometries(geos, false) : geos[0]; } catch (e) { merged = null; }
    for (const geo of merged ? [merged] : geos) { // fallback: one mesh per piece (never lose geometry)
      geo.computeBoundingSphere(); geo.computeBoundingBox();
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = src.castShadow; m.receiveShadow = src.receiveShadow; m.renderOrder = src.renderOrder;
      m.name = 'batched:' + (mat.name || mat.type) + ':' + geos.length; m.matrixAutoUpdate = false; m.updateMatrix();
      parent.add(m); calls++;
    }
    if (merged && geos.length > 1) for (const geo of geos) geo.dispose();
  }
  for (const o of done) o.parent && o.parent.remove(o);
  return { meshes: done.length, calls };
}
