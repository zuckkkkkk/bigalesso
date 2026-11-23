// quartiere/models.js — optional real models (Tripo exports) that replace the procedural props when present.
// assets/models/index.json lists what exists: { "models": ["due_torri.glb", "vespa.glb", ...] } (empty now).
// Nothing is fetched for a name that is not in the manifest (no 404 spam); every failure keeps the procedural prop.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const TRIPO_NAMES = ['bologna_house_a', 'bologna_house_b', 'bologna_house_c', 'portico_module', 'due_torri', 'pub_celtic', 'club_millennium',
  'sushi_restaurant', 'sushi_conveyor', 'checkpoint', 'edicola', 'bunker_corridor', 'prison_cell_set', 'tree_plane', 'tree_linden', 'hedge_bush',
  'park_bench', 'bicycle_parked', 'street_bins', 'living_room_set', 'kitchen_set', 'city_bus', 'street_lamp', 'vespa', 'fiat500', 'beer_tap',
  'dj_booth', 'sushi_plates', 'gaming_desk'];

let manifestP = null;
export function loadManifest() {
  if (manifestP) return manifestP;
  manifestP = (async () => {
    try {
      if (window.__ASSETS) return window.__ASSETS.models ? Object.keys(window.__ASSETS.models) : []; // single-file build: embedded or none
      if (location.protocol === 'file:') return [];
      const r = await fetch('./models/index.json', { cache: 'no-cache' }); if (!r.ok) return [];
      const j = await r.json(); return Array.isArray(j) ? j : (j.models || []);
    } catch (e) { return []; }
  })();
  return manifestP;
}

const cache = new Map();
const CLIPS = new WeakMap(); // scene -> AnimationClip[] (not in userData: clone() would JSON-copy them)
export const clipsOf = sc => CLIPS.get(sc) || [];
// resolves to a THREE.Group (scene of the glb) or null; files may be .glb or base64 .txt (artifact hosts refuse .glb)
export async function loadOptional(name) {
  if (cache.has(name)) return cache.get(name);
  const p = (async () => {
    const list = await loadManifest(); const file = list.find(f => f.replace(/\.(glb|txt)$/i, '').replace(/\.glb$/i, '') === name);
    if (!file) return null;
    try {
      const loader = new GLTFLoader(); const keep = g => { CLIPS.set(g.scene, g.animations || []); return g.scene; };
      if (window.__ASSETS && window.__ASSETS.models) { const bin = Uint8Array.from(atob(window.__ASSETS.models[file]), c => c.charCodeAt(0)); return keep(await loader.parseAsync(bin.buffer, './')); }
      if (/\.txt$/i.test(file)) { const b64 = await (await fetch('./models/' + file)).text(); const bin = Uint8Array.from(atob(b64.trim()), c => c.charCodeAt(0)); return keep(await loader.parseAsync(bin.buffer, './')); }
      return keep(await loader.loadAsync('./models/' + file));
    } catch (e) { console.warn('model ' + name, e); return null; }
  })();
  cache.set(name, p); return p;
}

// normalise a model: base at y=0, centred in xz, scaled so its height (or max xz extent when fit='width') = size
function normalised(scene, size, fit = 'height') {
  if (!size) return new THREE.Matrix4(); // assets/models are already in metres, ground y=0, centred, front +Z
  const box = new THREE.Box3().setFromObject(scene), sz = box.getSize(new THREE.Vector3());
  const k = size / Math.max(1e-4, fit === 'width' ? Math.max(sz.x, sz.z) : sz.y);
  const c = box.getCenter(new THREE.Vector3());
  const m = new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(-c.x, -box.min.y, -c.z));
  return m;
}

// meshopt/quantized models store positions as normalized int16/int8 (the node scale maps them to metres):
// bake into plain Float32 BEFORE applying a transform, otherwise setXYZ clamps everything to [-1, 1]
export function bakeGeometry(src, matrix) {
  const geo = new THREE.BufferGeometry(); const get = ['getX', 'getY', 'getZ', 'getW'];
  for (const k of Object.keys(src.attributes)) {
    const a = src.attributes[k], n = a.count, s = a.itemSize, arr = new Float32Array(n * s);
    for (let i = 0; i < n; i++) for (let j = 0; j < s; j++) arr[i * s + j] = a[get[j]](i);
    geo.setAttribute(k, new THREE.BufferAttribute(arr, s));
  }
  if (src.index) geo.setIndex(src.index.clone());
  for (const g of src.groups) geo.addGroup(g.start, g.count, g.materialIndex);
  geo.applyMatrix4(matrix); if (geo.attributes.normal) geo.normalizeNormals(); return geo;
}
// one InstancedMesh per mesh of the model, at the given transforms [{x,y,z,ry,s}] (no rescale by default)
export function instancedFrom(sc, list, parent, { size, fit, cast = true } = {}) {
  const norm = normalised(sc, size, fit); sc.updateMatrixWorld(true); const out = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  sc.traverse(o => {
    if (!o.isMesh || o.isSkinnedMesh) return;
    const geo = bakeGeometry(o.geometry, new THREE.Matrix4().multiplyMatrices(norm, o.matrixWorld));
    const im = new THREE.InstancedMesh(geo, o.material, list.length);
    list.forEach((t, i) => { m4.compose(p.set(t.x, t.y || 0, t.z), q.setFromEuler(e.set(0, t.ry || 0, 0)), s.setScalar(t.s || 1)); im.setMatrixAt(i, m4); });
    im.castShadow = cast; im.receiveShadow = true; im.computeBoundingSphere(); parent.add(im); out.push(im);
  });
  return out;
}
// local bounding box of a model (assets are centred; useful to sit them against walls)
export function modelBox(sc) { return new THREE.Box3().setFromObject(sc); }

// swap a placed procedural object for the model (same parent/position/rotation)
export async function swapObject(name, obj, size, fit) {
  const sc = await loadOptional(name); if (!sc || !obj.parent) return false;
  const holder = new THREE.Group(); holder.position.copy(obj.position); holder.quaternion.copy(obj.quaternion);
  const inner = sc.clone(true); inner.applyMatrix4(normalised(sc, size, fit));
  inner.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  holder.add(inner); obj.parent.add(holder); obj.visible = false; return true;
}

// swap an InstancedMesh group (same transforms) for instanced copies of every mesh of the model
export async function swapInstanced(name, ims, size, fit) {
  const sc = await loadOptional(name); if (!sc) return false;
  ims = ims.filter(Boolean); if (!ims.length) return false;
  const base = ims[0]; const n = base.count, norm = normalised(sc, size, fit);
  sc.updateMatrixWorld(true);
  const m4 = new THREE.Matrix4(), inst = new THREE.Matrix4();
  sc.traverse(o => {
    if (!o.isMesh) return;
    const geo = bakeGeometry(o.geometry, new THREE.Matrix4().multiplyMatrices(norm, o.matrixWorld));
    const im = new THREE.InstancedMesh(geo, o.material, n);
    for (let i = 0; i < n; i++) { base.getMatrixAt(i, inst); m4.copy(inst); // keep translation + rotation, drop the procedural scale
      const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); m4.decompose(p, q, s); m4.compose(p, q, new THREE.Vector3(1, 1, 1)); im.setMatrixAt(i, m4); }
    im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); base.parent.add(im);
  });
  for (const b of ims) b.visible = false; return true;
}
