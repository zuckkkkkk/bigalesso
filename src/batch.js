// batch.js — generic runtime batching of static meshes into THREE.BatchedMesh (WEBGL_multi_draw):
// hundreds of small meshes that share a material (after a material "dedupe" by parameters) become ONE draw call
// in the main pass and ONE in the shadow pass, with per-instance frustum culling. Geometries shared by clones
// (and identical geometry content) are stored once.
//
// API (window.__batch, created in main.js):
//   __batch.batch(group, { name })   batch a built group; call it BEFORE the gfx warm-up (new shader variants must be
//                                    compiled). Groups under quartiere.root (areas, places) and level/room/gulag
//                                    built during the preload are batched automatically by window.__batchWorld()
//                                    (gfx.js runs it right before the start-up warm-up). A group built later:
//                                    __batch.batch(g); window.__gfx.warmup(g);
//   __batch.diag(group)              dry run: { meshes, batched, batches, singles, why: {reason: count} }
//   __batch.reason(mesh, root)       why one mesh is left out ('' = batchable)
//   __batch.stats()                  { batches, meshes, geometries, unbatched, live }
//   window.__batchLog = true         logs every un-batch with its reason
// What merges: same material parameters (two materials with identical settings count as one; textures compare by
// image source + sampling, so the same image loaded twice still matches); the diffuse colour may differ (it becomes
// a per-instance colour); materials.js triplanar materials merge when their uniforms match. Left out: skinned,
// instanced, transparent, multi-material, morph targets, custom onBeforeCompile (unless material.userData.batchSafe
// = true and the shader handles USE_BATCHING), meshes hidden at batch time, userData.noBatch subtrees.
//
// Self-correcting, so code written for plain meshes keeps working: the original meshes stay in the scene graph
// (same .visible / .position / .material) but on render layer mask 0 (never drawn). A watcher checks them in slices:
//   - visibility toggled by code (lamps at night, swaps)         -> the batch instance is shown/hidden;
//   - moved, re-materialled, removed, or its material changed    -> the mesh is UN-batched (drawn on its own again).
// Opt out a subtree with obj.userData.noBatch = true (anything that animates: doors, clock hands, crowds).
import * as THREE from 'three';
import { currentQuality } from './scene.js';

const DEAD = 0; // layer mask for batched originals: no camera / shadow camera renders them
const HIDDEN = 1 << 30; // perfcull.js hides through this layer: the batch instance follows it
const ATTRS = ['position', 'normal', 'uv', 'color'];
const OK_MATS = new Set(['MeshStandardMaterial', 'MeshPhysicalMaterial', 'MeshLambertMaterial', 'MeshPhongMaterial', 'MeshBasicMaterial', 'MeshToonMaterial', 'MeshMatcapMaterial']);
const defaultOBR = THREE.Object3D.prototype.onBeforeRender;

// ---- material key: identical parameters -> same batch (the batch uses the first material seen) ----
// textures keyed by image source + sampling/transform (the same image loaded into two Texture objects that only
// differ by uuid still batches together)
const texId = t => (t ? (t.source ? t.source.uuid : t.uuid) + ':' + t.wrapS + t.wrapT + t.flipY + t.colorSpace + t.channel + t.magFilter + t.minFilter + t.anisotropy
  + t.repeat.x + ',' + t.repeat.y + ',' + t.offset.x + ',' + t.offset.y + ',' + t.rotation + ',' + t.center.x + ',' + t.center.y : '-');
const customShader = m => m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile || m.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey;
// custom shaders: triplanar materials merge when their uniforms match; any other batch-safe shader only with itself
function shaderKey(m) {
  if (!customShader(m)) return '-';
  const U = m.userData && m.userData.tri;
  if (U) return m.customProgramCacheKey() + ':' + texId(U.triMap.value) + ':' + texId(U.triRH.value) + ':' + U.triScale.value + ':' + U.triBump.value + ':' + U.triMix.value.toArray().join(',');
  return 'own:' + m.uuid;
}
// plain MeshStandardMaterials (no custom shader) also leave roughness/metalness out of the key: the batch reads them
// per instance from a small float texture (pbrMaterial below), so props that differ only by those two merge too
// a MeshPhysicalMaterial with every physical extra at its neutral value shades exactly like a MeshStandardMaterial
// (F0 = ((ior-1)/(ior+1))^2 * specularColor * specularIntensity = 0.04, F90 = 1): batched as one
const physNeutral = m => m && m.type === 'MeshPhysicalMaterial' && !customShader(m) && !m.clearcoat && !m.transmission && !m.sheen && !m.iridescence && !m.anisotropy
  && !m.dispersion && m.specularIntensity === 1 && m.specularColor && m.specularColor.getHex() === 0xffffff && !m.specularIntensityMap && !m.specularColorMap && Math.abs(m.ior - 1.5) < 1e-3;
const stdCache = new WeakMap();
function toStandard(m) {
  let s = stdCache.get(m); if (s) return s;
  s = new THREE.MeshStandardMaterial(); const ud = m.userData; m.userData = {};
  try { THREE.MeshStandardMaterial.prototype.copy.call(s, m); } finally { m.userData = ud; }
  s.userData = {}; s.name = m.name; stdCache.set(m, s); return s;
}
const asStd = m => (physNeutral(m) ? toStandard(m) : m);
// (standard and physical materials, plain or with the triplanar shader of materials.js, which keeps the chunks used here)
const pbrOK = m => !!(m && m.isMeshStandardMaterial && (!customShader(m) || (m.userData && m.userData.tri)));
// noColor: the diffuse colour is left out of the key (it becomes a per-instance colour of the batch); for plain
// standard materials roughness, metalness and emissive too (per-instance texture, pbrMaterial below)
function matKey(m, noColor) {
  m = asStd(m);
  const c = x => (x && x.isColor ? x.getHexString() : '-');
  const pbr = noColor && pbrOK(m);
  return [m.type, noColor ? '*' : c(m.color), pbr ? '*' : c(m.emissive), pbr ? '*' : m.emissiveIntensity, pbr ? '*' : m.roughness, pbr ? '*' : m.metalness, m.opacity, m.transparent, m.alphaTest, m.side,
    m.vertexColors, m.flatShading, m.fog, m.toneMapped, m.depthWrite, m.depthTest, m.blending, m.polygonOffset, m.polygonOffsetFactor, m.envMapIntensity,
    texId(m.map), texId(m.normalMap), texId(m.roughnessMap), texId(m.metalnessMap), texId(m.emissiveMap), texId(m.aoMap), texId(m.alphaMap), texId(m.envMap),
    texId(m.lightMap), m.normalScale ? m.normalScale.x + ',' + m.normalScale.y : '-', m.clearcoat, m.transmission, m.sheen, m.specularIntensity, m.ior, m.wireframe,
    m.specular ? c(m.specular) : '-', m.shininess, m.aoMapIntensity, m.lightMapIntensity, m.bumpMap ? texId(m.bumpMap) : '-', m.displacementMap ? 'D' : '-',
    m.matcap ? texId(m.matcap) : '-', m.gradientMap ? texId(m.gradientMap) : '-', m.dithering, m.premultipliedAlpha, m.colorWrite, m.stencilWrite, shaderKey(m)].join('|');
}
// snapshot of the properties code tends to animate (to notice a material changed after batching)
function matSnap(m) { return [m.color && m.color.getHex(), m.emissive && m.emissive.getHex(), m.emissiveIntensity, m.opacity, m.visible, texId(m.map), texId(m.emissiveMap), m.transparent, m.roughness, m.metalness, shaderKey(m)].join('|'); }

// ---- geometry: plain Float32 attributes, indexed, only the batchable attributes ----
// attributes the material actually reads: uv only with a texture (or a custom shader), colour only with vertexColors.
// Unused ones are dropped so that props with and without them still share a batch (BatchedMesh needs one layout)
const TEX = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap', 'lightMap', 'bumpMap', 'displacementMap', 'specularMap'];
const needOf = m => (!m || customShader(m) ? 3 : (TEX.some(k => m[k]) ? 1 : 0) | (m.vertexColors ? 2 : 0));
const geoCache = new WeakMap(); // source geometry -> [need] -> { sig, geo, hash }
function canonGeometry(src, need = 3) {
  let per = geoCache.get(src); if (!per) { per = {}; geoCache.set(src, per); }
  const c0 = per[need]; if (c0 !== undefined && (c0 === null || c0.geo)) return c0; // (geo released after a batch: rebuilt on demand)
  let out = null;
  try {
    if (!src.attributes.position || src.morphAttributes && Object.keys(src.morphAttributes).length) throw 0;
    const g = new THREE.BufferGeometry(); const names = [];
    for (const k of ATTRS) {
      const a = src.attributes[k]; if (!a) continue;
      if ((k === 'uv' && !(need & 1)) || (k === 'color' && !(need & 2))) continue;
      const n = a.count, s = a.itemSize, arr = new Float32Array(n * s);
      if (!a.isInterleavedBufferAttribute && !a.normalized && a.array instanceof Float32Array && a.array.length === n * s) arr.set(a.array);
      else for (let i = 0; i < n; i++) for (let j = 0; j < s; j++) arr[i * s + j] = a.getComponent(i, j);
      g.setAttribute(k, new THREE.BufferAttribute(arr, s)); names.push(k + s);
    }
    if (src.index) g.setIndex(new THREE.BufferAttribute(new Uint32Array(src.index.array), 1));
    else { const n = src.attributes.position.count, ix = new Uint32Array(n); for (let i = 0; i < n; i++) ix[i] = i; g.setIndex(new THREE.BufferAttribute(ix, 1)); }
    // honour a partial draw range / single group (rare for static props)
    const dr = src.drawRange; if (dr && (dr.start !== 0 || (dr.count !== Infinity && dr.count < g.index.count))) throw 0;
    // (groups are ignored: only single-material meshes are batched, so they all draw with the same material anyway)
    g.computeBoundingSphere(); g.computeBoundingBox();
    // content hash (identical geometry in different objects -> stored once)
    const p = g.attributes.position.array, ix = g.index.array; let h = 2166136261 >>> 0;
    const iv = new Uint32Array(p.buffer, p.byteOffset, p.length); const step = Math.max(1, (iv.length / 4096) | 0);
    for (let i = 0; i < iv.length; i += step) { h ^= iv[i]; h = Math.imul(h, 16777619) >>> 0; }
    for (let i = 0; i < ix.length; i += Math.max(1, (ix.length / 1024) | 0)) { h ^= ix[i]; h = Math.imul(h, 16777619) >>> 0; }
    out = { sig: names.join(','), geo: g, hash: names.join(',') + ':' + p.length + ':' + ix.length + ':' + h, verts: p.length / 3, idx: ix.length };
  } catch (e) { out = null; }
  per[need] = out; return out;
}

// per-instance roughness/metalness for a batch: the shared material is set to roughness = metalness = 1 and the
// fragment shader multiplies by the instance's values (texel at the instance id, like three's batchingColorTexture).
// One program for every such batch (customProgramCacheKey), each batch has its own texture uniform.
// Emissive too (colour x intensity, second texel of the instance): neon/screen props of different glow share a batch.
function pbrMaterial(base, maxInstances) {
  base = asStd(base);
  const ud = base.userData; base.userData = {};
  let mat; try { mat = base.clone(); } finally { base.userData = ud; }
  const own = customShader(base), prevOBC = base.onBeforeCompile, prevKey = base.customProgramCacheKey; // triplanar: its hook runs first
  mat.userData = { batchPBR: true }; if (ud && ud.tri) mat.userData.tri = ud.tri;
  mat.color.set(0xffffff); mat.roughness = 1; mat.metalness = 1; mat.emissive.set(0xffffff); mat.emissiveIntensity = 1; mat.name = (base.name || base.type) + '+pbr';
  const size = Math.max(1, Math.ceil(Math.sqrt(maxInstances * 2)));
  const tex = new THREE.DataTexture(new Float32Array(size * size * 4), size, size, THREE.RGBAFormat, THREE.FloatType);
  tex.needsUpdate = true;
  mat.onBeforeCompile = (sh, r) => {
    if (own) prevOBC.call(base, sh, r);
    sh.uniforms.batchPBR = { value: tex };
    sh.vertexShader = sh.vertexShader
      .replace('#include <batching_pars_vertex>', '#include <batching_pars_vertex>\nuniform highp sampler2D batchPBR;\nvarying vec4 vBatchPBR;\nvarying vec3 vBatchEm;')
      .replace('#include <batching_vertex>', '#include <batching_vertex>\n#ifdef USE_BATCHING\n{ int j = int( getIndirectIndex( gl_DrawID ) ) * 2; int bs = textureSize( batchPBR, 0 ).x;'
        + ' vBatchPBR = texelFetch( batchPBR, ivec2( j % bs, j / bs ), 0 ); vBatchEm = texelFetch( batchPBR, ivec2( ( j + 1 ) % bs, ( j + 1 ) / bs ), 0 ).rgb; }\n#else\nvBatchPBR = vec4( 1.0 ); vBatchEm = vec3( 0.0 );\n#endif');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vBatchPBR;\nvarying vec3 vBatchEm;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= clamp( vBatchEm, 0.0, 64.0 );')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= clamp( vBatchPBR.x, 0.0, 1.0 );')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= clamp( vBatchPBR.y, 0.0, 1.0 );');
  };
  mat.customProgramCacheKey = () => 'batchPBR2' + (own ? ':' + prevKey.call(base) : '');
  return { mat, tex, set(id, m) {
    const a = tex.image.data, i = id * 8, e = m.emissive, k = m.emissiveIntensity === undefined ? 1 : m.emissiveIntensity;
    a[i] = m.roughness; a[i + 1] = m.metalness; a[i + 4] = e ? e.r * k : 0; a[i + 5] = e ? e.g * k : 0; a[i + 6] = e ? e.b * k : 0; tex.needsUpdate = true;
  } };
}

// per-frame instance list of a batch (replaces BatchedMesh.onBeforeRender/onBeforeShadow, unsorted path): the
// instances are static, so their bounding spheres are precomputed in batch space (userData.sph) and tested against
// the 6 frustum planes inline — a fraction of three's per-instance getMatrixAt + sphere transform.
// The shadow pass also skips the non-casters (userData.noSh): casters and non-casters share one batch.
const _cf = new THREE.Frustum(), _cm = new THREE.Matrix4();
function cullList(bm, renderer, cam, geometry, noSh) {
  const sph = bm.userData.sph, index = geometry.getIndex(), bpe = index === null ? 1 : index.array.BYTES_PER_ELEMENT;
  const info = bm._instanceInfo, starts = bm._multiDrawStarts, counts = bm._multiDrawCounts, geos = bm._geometryInfo, ind = bm._indirectTexture.image.data;
  _cm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).multiply(bm.matrixWorld);
  _cf.setFromProjectionMatrix(_cm, renderer.coordinateSystem);
  const P = _cf.planes;
  const ax = P[0].normal.x, ay = P[0].normal.y, az = P[0].normal.z, ac = P[0].constant, bx = P[1].normal.x, by = P[1].normal.y, bz = P[1].normal.z, bc = P[1].constant;
  const cx = P[2].normal.x, cy = P[2].normal.y, cz = P[2].normal.z, cc = P[2].constant, dx = P[3].normal.x, dy = P[3].normal.y, dz = P[3].normal.z, dc = P[3].constant;
  const ex = P[4].normal.x, ey = P[4].normal.y, ez = P[4].normal.z, ec = P[4].constant, fx = P[5].normal.x, fy = P[5].normal.y, fz = P[5].normal.z, fc = P[5].constant;
  let n = 0;
  for (let i = 0, l = info.length; i < l; i++) {
    const it = info[i]; if (!it.visible || !it.active || (noSh !== null && noSh[i])) continue;
    const j = i * 4, x = sph[j], y = sph[j + 1], z = sph[j + 2], r = -sph[j + 3];
    if (ax * x + ay * y + az * z + ac < r || bx * x + by * y + bz * z + bc < r || cx * x + cy * y + cz * z + cc < r
      || dx * x + dy * y + dz * z + dc < r || ex * x + ey * y + ez * z + ec < r || fx * x + fy * y + fz * z + fc < r) continue;
    const g = geos[it.geometryIndex]; starts[n] = g.start * bpe; counts[n] = g.count; ind[n] = i; n++;
  }
  bm._indirectTexture.needsUpdate = true; bm._multiDrawCount = n; bm._visibilityChanged = false;
}
function batchRender(renderer, scene, camera, geometry) { cullList(this, renderer, camera, geometry, null); }
function batchShadow(renderer, object, camera, shadowCamera, geometry) { cullList(this, renderer, shadowCamera, geometry, this.userData.noSh || null); }

const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _mi = new THREE.Matrix4(), _c = new THREE.Color();
export function createBatcher({ scene } = {}) {
  const batches = []; // { root, mesh: BatchedMesh, entries: [] }
  const entries = []; // all live entries (watcher)
  const matSnaps = new Map(); // material -> snapshot string
  const imEntries = new Map(); // InstancedMesh -> entry (all its batch instances)
  const stats = { batches: 0, meshes: 0, geometries: 0, unbatched: 0, skipped: 0 };
  let idx = 0;

  // an original joins a batch: it stops drawing (layer DEAD). If the house/perf cull is hiding it right now (layer 30,
  // counter in userData.__cullN) it stays on layer 30 and the cull will restore it to DEAD, not to the camera layer.
  function adopt(o, e) {
    const u = o.userData, hid = o.layers.mask === HIDDEN || u.__cullN > 0;
    e.mask = hid ? (u.__cullMask !== undefined && u.__cullMask !== DEAD ? u.__cullMask : 1) : o.layers.mask; // restored on un-batch
    if (hid) { u.__cullMask = DEAD; o.layers.mask = HIDDEN; } else o.layers.mask = DEAD;
  }
  // effective visibility of o inside root (root's own visibility handled by the BatchedMesh being its child)
  function visIn(o, root) { for (let p = o; p && p !== root; p = p.parent) if (!p.visible) return false; return true; }
  function noBatch(o, root) { for (let p = o; p; p = p.parent) { if (p.userData && p.userData.noBatch) return true; if (p === root) break; } return false; }

  // why a mesh can't be batched ('' = it can)
  function reason(o, root) {
    if (!o.isMesh) return 'not-mesh';
    if (o.isSkinnedMesh) return 'skinned'; if (o.isInstancedMesh) return 'instanced'; if (o.isBatchedMesh) return 'batched-mesh'; if (o.userData.batched) return 'already';
    if (Array.isArray(o.material)) return 'multi-material';
    if (!o.material || !OK_MATS.has(o.material.type)) return 'mat:' + (o.material ? o.material.type : 'none');
    const m = o.material;
    if (m.transparent) return 'transparent';
    if (m.clippingPlanes && m.clippingPlanes.length) return 'clipping';
    if (customShader(m) && !(m.userData && (m.userData.tri || m.userData.batchSafe))) return 'custom-shader'; // (materials.js triplanar handles USE_BATCHING)
    if (o.onBeforeRender !== defaultOBR) return 'onBeforeRender';
    if (o.morphTargetInfluences) return 'morph';
    if (!(o.layers.mask & 1) && o.layers.mask !== HIDDEN) return 'layer-hidden'; // other layers: leave alone (HIDDEN = house/perf cull: tracked)
    if (noBatch(o, root)) return 'noBatch';
    return ''; // (hidden meshes are batched too: the watcher keeps the instance's visibility in sync with the original)
  }
  // static instanced meshes (windows, tiles, lamps, trees…) join the batches: every instance becomes a batch instance
  // and the InstancedMesh stops drawing. Pools/particles (dynamic usage, count changes) stay as they are.
  function imReason(o, root) {
    if (!o.isInstancedMesh || o.isSkinnedMesh) return 'not-instanced';
    if (Array.isArray(o.material) || !o.material || !OK_MATS.has(o.material.type)) return 'mat';
    const m = o.material;
    if (m.transparent) return 'transparent';
    if (m.clippingPlanes && m.clippingPlanes.length) return 'clipping';
    if (customShader(m) && !(m.userData && (m.userData.tri || m.userData.batchSafe))) return 'custom-shader';
    if (o.onBeforeRender !== defaultOBR || o.morphTexture) return 'onBeforeRender';
    if (o.instanceMatrix.usage === THREE.DynamicDrawUsage) return 'dynamic';
    if (!(o.count > 0) || o.count > 2048) return 'count';
    // (frustumCulled = false alone is no reason: static decorations often switch it off; the batch culls per instance.
    // Pools that move instances later are caught by the watcher: instanceMatrix version/count change -> un-batched)
    if (!(o.layers.mask & 1) && o.layers.mask !== HIDDEN) return 'layer-hidden';
    if (noBatch(o, root)) return 'noBatch';
    return '';
  }
  // multi-material meshes (cabinets, furniture): split into one child per material group, the parent stops drawing;
  // the children batch like any other mesh (and follow the parent if it ever moves or hides)
  function splitMulti(root) {
    const list = [];
    root.traverse(o => {
      if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || !Array.isArray(o.material) || o.userData.split || noBatch(o, root)) return;
      const g = o.geometry; if (!g || !g.groups || !g.groups.length || g.morphAttributes && Object.keys(g.morphAttributes).length) return;
      if (o.material.some(m => !m || !OK_MATS.has(m.type) || m.transparent || (customShader(m) && !(m.userData && (m.userData.tri || m.userData.batchSafe))))) return;
      if (o.onBeforeRender !== defaultOBR || !(o.layers.mask & 1)) return;
      list.push(o);
    });
    for (const o of list) {
      const g = o.geometry, parts = [];
      const idx = g.index ? g.index.array : null, n = g.index ? g.index.count : g.attributes.position.count;
      for (const gr of g.groups) {
        const mat = o.material[gr.materialIndex]; if (!mat) continue;
        const start = Math.max(0, gr.start), end = Math.min(n, gr.start + gr.count); if (end <= start) continue;
        const sub = new THREE.BufferGeometry();
        for (const k of Object.keys(g.attributes)) sub.setAttribute(k, g.attributes[k]);
        const ix = new Uint32Array(end - start);
        if (idx) for (let i = start; i < end; i++) ix[i - start] = idx[i]; else for (let i = start; i < end; i++) ix[i - start] = i;
        sub.setIndex(new THREE.BufferAttribute(ix, 1));
        const c = new THREE.Mesh(sub, mat); c.name = (o.name || 'mesh') + ':' + gr.materialIndex;
        c.castShadow = o.castShadow; c.receiveShadow = o.receiveShadow; c.renderOrder = o.renderOrder; c.frustumCulled = o.frustumCulled;
        c.userData.splitOf = o; c.raycast = () => { };
        parts.push(c);
      }
      if (!parts.length) continue;
      for (const c of parts) o.add(c); // children: identity transform, they follow o
      o.userData.split = { parts, mask: o.layers.mask, mat: o.material };
      o.layers.mask = DEAD; // o itself no longer draws (its children do)
      stats.split = (stats.split || 0) + 1;
    }
  }
  const eligible = (o, root) => !reason(o, root);

  // what batch(root) would do, without touching anything: reasons for the meshes left out and group sizes
  function diag(root, { instColor = true } = {}) {
    const why = {}, groups = new Map(); let meshes = 0;
    root.traverse(o => {
      if (!o.isMesh) return; meshes++;
      const r = reason(o, root); if (r) { why[r] = (why[r] || 0) + 1; return; }
      const cg = canonGeometry(o.geometry, needOf(o.material)); if (!cg) { why.geometry = (why.geometry || 0) + 1; return; }
      const key = matKey(o.material, instColor) + '#' + cg.sig + '#' + (o.receiveShadow ? 1 : 0);
      groups.set(key, (groups.get(key) || 0) + 1);
    });
    let inGroups = 0, nGroups = 0, singles = 0;
    for (const n of groups.values()) if (n >= 2) { inGroups += n; nGroups++; } else singles++;
    return { meshes, why, batches: nGroups, batched: inGroups, singles };
  }

  // small props don't cast sun shadows (a cup, a book, a knob): decided HERE, before grouping, because once batched
  // the BatchedMesh's castShadow is what counts (perfcull.js used to flip it on the originals after batching: no effect)
  const shadowMinFor = q => (q === 'low' || q === 'medium' ? 0.55 : q === 'high' ? 0.4 : 0.3);
  const _sph = new THREE.Sphere();
  // batch(root): one set of BatchedMeshes inside root (they follow the root's transform and visibility).
  // batchRoots(roots, { merge: true }): the static meshes of ALL the roots grouped together by material and by a
  // ground cell (96 m by default, so a batch stays spatially compact and is still culled whole when off screen); the
  // BatchedMeshes live in one scene-level holder and each root's visibility is mirrored per instance every frame
  // (rootStates), so hiding a district/mode root still hides its props at once. One draw per material per cell
  // instead of one per material per root.
  const rootStates = new Map(); // root -> { root, on, entries: [] }
  const chainOn = r => { for (let p = r; p; p = p.parent) { if (!p.visible) return false; if (p === scene) return true; } return !scene; };
  const _v = new THREE.Vector3(), _mw = new THREE.Matrix4();
  function batch(root, opts = {}) { return root ? batchRoots([root], { name: root.name || 'batch', ...opts, merge: false }) : null; }
  function batchRoots(roots, { name = 'batch', minGroup = 2, maxInstances = 4096, instColor = true, shadowMin = shadowMinFor(currentQuality()), merge = false, cell = 96, origin = [6, 9] } = {}) {
    roots = roots.filter(Boolean); if (!roots.length) return [];
    let holder = roots[0];
    if (merge) {
      holder = new THREE.Group(); holder.name = 'batches:' + name; holder.userData.noBatch = true; holder.userData.noCull = true;
      holder.matrixAutoUpdate = false; holder.updateMatrixWorld(true); scene.add(holder);
    }
    const groups = new Map(); // key -> { mat, list: [{o, cg, inst?, root, rs}], verts, idx, geos: Map(hash -> cg) }
    const cellOf = v => (merge ? '#c' + Math.floor((v.x - origin[0]) / cell + 0.5) + ',' + Math.floor((v.z - origin[1]) / cell + 0.5) : '');
    // (castShadow is not part of the key: non-casters are skipped per instance in the shadow pass, see cullList)
    const addTo = (o, cg, inst, root, rs, ck) => {
      const key = matKey(o.material, instColor) + '#' + cg.sig + '#' + (o.receiveShadow ? 1 : 0) + ck;
      let G = groups.get(key); if (!G) { G = { key, mat: asStd(o.material), list: [], geos: new Map(), verts: 0, idx: 0, tint: false }; groups.set(key, G); }
      if (instColor && G.mat.color && o.material.color && !G.mat.color.equals(o.material.color)) G.tint = true;
      const m = o.material;
      if (instColor && pbrOK(G.mat) && (G.mat.roughness !== m.roughness || G.mat.metalness !== m.metalness || G.mat.emissiveIntensity !== m.emissiveIntensity || !G.mat.emissive.equals(m.emissive))) G.pbr = true;
      if (inst !== undefined && o.instanceColor) G.tint = true;
      if (!G.geos.has(cg.hash)) { G.geos.set(cg.hash, cg); G.verts += cg.verts; G.idx += cg.idx; }
      G.list.push({ o, cg: G.geos.get(cg.hash), inst, root, rs });
    };
    for (const root of roots) {
      try { splitMulti(root); } catch (e) { console.warn('batch split', e); }
      root.updateMatrixWorld(true);
      // small props don't cast sun shadows (a cup, a book, a knob): decided HERE, before grouping, because once batched
      // the BatchedMesh's castShadow is what counts (perfcull.js used to flip it on the originals after batching: no effect)
      if (shadowMin > 0) root.traverse(o => {
        if (!o.isMesh || !o.castShadow || o.isSkinnedMesh || o.isInstancedMesh || o.isBatchedMesh || !o.geometry) return;
        const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); if (!g.boundingSphere) return;
        _sph.copy(g.boundingSphere).applyMatrix4(o.matrixWorld); if (_sph.radius < shadowMin) { o.castShadow = false; stats.noShadow = (stats.noShadow || 0) + 1; }
      });
      let rs = null;
      if (merge) { rs = rootStates.get(root); if (!rs) { rs = { root, on: chainOn(root), entries: [] }; rootStates.set(root, rs); } }
      root.traverse(o => {
        if (o.isInstancedMesh) {
          if (imReason(o, root)) return;
          const cg = canonGeometry(o.geometry, needOf(o.material)); if (!cg) { stats.skipped++; return; }
          for (let i = 0; i < o.count; i++) {
            let ck = ''; if (merge) { o.getMatrixAt(i, _mi); _mw.multiplyMatrices(o.matrixWorld, _mi); ck = cellOf(_v.copy(cg.geo.boundingSphere.center).applyMatrix4(_mw)); }
            addTo(o, cg, i, root, rs, ck);
          }
          return;
        }
        if (!eligible(o, root)) return;
        const cg = canonGeometry(o.geometry, needOf(o.material)); if (!cg) { stats.skipped++; return; }
        addTo(o, cg, undefined, root, rs, merge ? cellOf(_v.copy(cg.geo.boundingSphere.center).applyMatrix4(o.matrixWorld)) : '');
      });
    }
    holder.updateMatrixWorld(true);
    _inv.copy(holder.matrixWorld).invert();
    const made = [];
    for (const G of groups.values()) {
      if (G.list.length < minGroup) { for (const it of G.list) { it.o.userData.batchSingle = 1; if (window.__batchLog) it.o.userData.batchKey = G.key; } continue; } // a lone mesh: nothing to gain
      for (let k = 0; k < G.list.length; k += maxInstances) {
        const part = G.list.slice(k, k + maxInstances);
        const geos = new Map(); let verts = 0, idxN = 0;
        for (const it of part) if (!geos.has(it.cg)) { geos.set(it.cg, -1); verts += it.cg.verts; idxN += it.cg.idx; }
        // different diffuse colours in one batch: a white copy of the material + a per-instance colour
        let mat = G.mat, pbr = null;
        if (G.pbr) { pbr = pbrMaterial(G.mat, part.length); mat = pbr.mat; G.tint = true; }
        else if (G.tint) {
          const ud = G.mat.userData; G.mat.userData = {};
          try { mat = G.mat.clone(); } finally { G.mat.userData = ud; }
          mat.userData = ud; mat.onBeforeCompile = G.mat.onBeforeCompile; mat.customProgramCacheKey = G.mat.customProgramCacheKey;
          mat.color.set(0xffffff); mat.name = (G.mat.name || G.mat.type) + '+tint';
        }
        const bm = new THREE.BatchedMesh(part.length, Math.max(3, verts), Math.max(3, idxN), mat);
        bm.name = 'batch:' + name + ':' + (G.mat.name || G.mat.type);
        bm.sortObjects = false; bm.perObjectFrustumCulled = true;
        const casts = part.filter(it => it.o.castShadow).length;
        bm.castShadow = casts > 0; bm.receiveShadow = part[0].o.receiveShadow;
        const noSh = casts > 0 && casts < part.length ? new Uint8Array(part.length) : null;
        const sph = new Float32Array(part.length * 4); // per-instance bounding sphere in batch space (static: moved props leave the batch)
        bm.userData.noSh = noSh; bm.userData.sph = sph; bm.onBeforeRender = batchRender; bm.onBeforeShadow = batchShadow;
        bm.userData.noBatch = true; bm.userData.noCull = true; if (window.__batchLog) bm.userData.key = G.key;
        for (const [cg] of geos) geos.set(cg, bm.addGeometry(cg.geo));
        const putSphere = (id, cg) => { const bs = cg.geo.boundingSphere; _v.copy(bs.center).applyMatrix4(_m); const j = id * 4; sph[j] = _v.x; sph[j + 1] = _v.y; sph[j + 2] = _v.z; sph[j + 3] = bs.radius * _m.getMaxScaleOnAxis(); };
        for (const it of part) {
          const rs = it.rs, ron = rs ? rs.on : true;
          if (it.inst !== undefined) { // an instance of a static InstancedMesh
            const im = it.o, id = bm.addInstance(geos.get(it.cg));
            if (noSh && !im.castShadow) noSh[id] = 1;
            im.getMatrixAt(it.inst, _mi); _m.multiplyMatrices(_inv, im.matrixWorld).multiply(_mi); bm.setMatrixAt(id, _m); putSphere(id, it.cg);
            if (G.tint) { if (im.instanceColor) { im.getColorAt(it.inst, _c); if (im.material.color) _c.multiply(im.material.color); bm.setColorAt(id, _c); } else bm.setColorAt(id, im.material.color || _c.set(0xffffff)); }
            if (pbr) pbr.set(id, im.material);
            let e = imEntries.get(im);
            if (!e) {
              im.updateWorldMatrix(true, false);
              e = { im: true, o: im, ids: [], bms: [], root: it.root, rs, mat: im.material, mask: im.layers.mask, vis: true, parent: im.parent, dead: false, mw: im.matrixWorld.elements.slice(),
                ver: im.instanceMatrix.version, cver: im.instanceColor ? im.instanceColor.version : -1, count: im.count, mau: im.matrixAutoUpdate, insts: [], ls: sphArr(it.cg) };
              e.vis = !(im.layers.mask === HIDDEN || im.userData.__cullN > 0) && visIn(im, it.root);
              imEntries.set(im, e); entries.push(e); if (rs) rs.entries.push(e);
              im.userData.batched = e; im.userData.noCull = true; adopt(im, e); im.matrixAutoUpdate = false;
              if (!matSnaps.has(im.material)) matSnaps.set(im.material, matSnap(im.material));
            }
            e.ids.push(id); e.bms.push(bm); e.insts.push(it.inst); stats.meshes++;
            if (!(e.vis && ron)) bm.setVisibleAt(id, false);
            continue;
          }
          const o = it.o, id = bm.addInstance(geos.get(it.cg));
          if (noSh && !o.castShadow) noSh[id] = 1;
          _m.multiplyMatrices(_inv, o.matrixWorld); bm.setMatrixAt(id, _m); putSphere(id, it.cg);
          if (G.tint) bm.setColorAt(id, o.material.color);
          if (pbr) pbr.set(id, o.material);
          o.updateWorldMatrix(false, false);
          const cg = it.cg, ws = cg.geo.boundingSphere, sc = o.matrixWorld.getMaxScaleOnAxis();
          const c = ws.center.clone().applyMatrix4(o.matrixWorld);
          const e = { o, bm, id, root: it.root, rs, mat: o.material, mask: o.layers.mask, vis: true, on: true, mw: o.matrixWorld.elements.slice(), parent: o.parent, dead: false,
            loc: [o.position.x, o.position.y, o.position.z, o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w, o.scale.x, o.scale.y, o.scale.z],
            cx: c.x, cy: c.y, cz: c.z, r: ws.radius * sc, mau: o.matrixAutoUpdate, ls: sphArr(cg) };
          // originals: never drawn, and no per-frame matrix recompose (their world matrix still follows the parents)
          o.userData.batched = e; o.userData.noCull = true; adopt(o, e); o.matrixAutoUpdate = false;
          if (!visIn(o, it.root) || o.layers.mask === HIDDEN) e.vis = false;
          if (!(e.vis && ron)) bm.setVisibleAt(id, false);
          if (!matSnaps.has(o.material)) matSnaps.set(o.material, matSnap(o.material));
          entries.push(e); if (rs) rs.entries.push(e); stats.meshes++;
        }
        bm.computeBoundingBox(); bm.computeBoundingSphere();
        holder.add(bm); made.push(bm); batches.push({ root: holder, roots: merge ? roots : null, mesh: bm }); stats.batches++; stats.geometries += geos.size;
      }
    }
    // the canonical copies were copied into the batches: free them (the originals keep their own geometry)
    for (const G of groups.values()) for (const cg of G.geos.values()) if (cg.geo) { cg.geo.dispose(); cg.geo = null; }
    return made;
  }

  function unbatch(e, why) {
    if (e.dead) return; e.dead = true; stats.unbatched++; e.o.userData.unbatchedWhy = why;
    if (e.im) {
      for (let j = 0; j < e.ids.length; j++) try { e.bms[j].setVisibleAt(e.ids[j], false); } catch (x) { }
      const o = e.o; if (o.layers.mask === DEAD) o.layers.mask = e.mask; else if (o.userData.__cullN > 0 && o.userData.__cullMask === DEAD) o.userData.__cullMask = e.mask;
      o.userData.batched = null; o.matrixAutoUpdate = e.mau; imEntries.delete(o);
      if (window.__batchLog) console.log('unbatch instanced', why, o.name || o.type);
      return;
    }
    try { e.bm.setVisibleAt(e.id, false); } catch (x) { }
    const o = e.o; if (o.layers.mask === DEAD) o.layers.mask = e.mask; else if (o.userData.__cullN > 0 && o.userData.__cullMask === DEAD) o.userData.__cullMask = e.mask;
    o.userData.batched = null; o.matrixAutoUpdate = e.mau;
    if (window.__batchLog) console.log('unbatch', why, o.name || o.type);
  }
  // a batched prop that moves (or whose root moves) a few times — placed by code after the batching, a district
  // shifted once — is re-synced in its batch instead of leaving it; past 3 moves it is animated: back to plain drawing
  const sphArr = cg => { const b = cg.geo.boundingSphere; return [b.center.x, b.center.y, b.center.z, b.radius]; };
  const dirtyB = new Set(), _rs = new THREE.Vector3(), _ri = new THREE.Matrix4();
  function putInst(bm, id, m, ls) {
    bm.setMatrixAt(id, m); const sph = bm.userData.sph; if (!sph) return;
    _rs.set(ls[0], ls[1], ls[2]).applyMatrix4(m); const j = id * 4; sph[j] = _rs.x; sph[j + 1] = _rs.y; sph[j + 2] = _rs.z; sph[j + 3] = ls[3] * m.getMaxScaleOnAxis();
    dirtyB.add(bm);
  }
  function resync(e) {
    if ((e.moves = (e.moves || 0) + 1) > 3 || !e.ls) return false;
    const o = e.o;
    try {
      if (e.im) {
        o.updateMatrix(); o.updateWorldMatrix(true, false);
        for (let j = 0; j < e.ids.length; j++) { const bm = e.bms[j]; _ri.copy(bm.parent.matrixWorld).invert(); o.getMatrixAt(e.insts[j], _mi); _m.multiplyMatrices(_ri, o.matrixWorld).multiply(_mi); putInst(bm, e.ids[j], _m, e.ls); }
      } else {
        o.updateMatrix(); o.updateWorldMatrix(true, false);
        _ri.copy(e.bm.parent.matrixWorld).invert(); _m.multiplyMatrices(_ri, o.matrixWorld); putInst(e.bm, e.id, _m, e.ls);
        e.loc = [o.position.x, o.position.y, o.position.z, o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w, o.scale.x, o.scale.y, o.scale.z];
        _rs.set(e.ls[0], e.ls[1], e.ls[2]).applyMatrix4(o.matrixWorld); e.cx = _rs.x; e.cy = _rs.y; e.cz = _rs.z; e.r = e.ls[3] * o.matrixWorld.getMaxScaleOnAxis();
      }
    } catch (x) { return false; }
    e.mw = o.matrixWorld.elements.slice(); stats.resynced = (stats.resynced || 0) + 1;
    return true;
  }
  // world matrix unchanged? (translation + diagonal: catches any move/turn/scale of an ancestor at a third of the cost)
  const same = (a, b) => Math.abs(a[12] - b[12]) + Math.abs(a[13] - b[13]) + Math.abs(a[14] - b[14]) + Math.abs(a[0] - b[0]) + Math.abs(a[5] - b[5]) + Math.abs(a[10] - b[10]) + Math.abs(a[1] - b[1]) + Math.abs(a[8] - b[8]) < 1e-5;
  const movedLocal = (o, L) => { const p = o.position, q = o.quaternion, s = o.scale; return Math.abs(p.x - L[0]) + Math.abs(p.y - L[1]) + Math.abs(p.z - L[2]) + Math.abs(q.x - L[3]) + Math.abs(q.y - L[4]) + Math.abs(q.z - L[5]) + Math.abs(q.w - L[6]) + Math.abs(s.x - L[7]) + Math.abs(s.y - L[8]) + Math.abs(s.z - L[9]) > 1e-5; };
  // watcher: a slice of entries per frame (whole list every few frames). cam: camera position for the distance cull
  // of small props (what perfcull.js did for single meshes): far small instances are skipped in both passes.
  let far = 28, tick = 0;
  function update(n = 400, cam = null, farDist) {
    if (farDist) far = farDist;
    // merged batches: a root hidden/shown (district, mode props) -> all its instances at once
    for (const rs of rootStates.values()) {
      const on = chainOn(rs.root); if (on === rs.on) continue; rs.on = on;
      for (const e of rs.entries) if (!e.dead) { const v = e.vis && on; if (e.im) { for (let j = 0; j < e.ids.length; j++) e.bms[j].setVisibleAt(e.ids[j], v); } else e.bm.setVisibleAt(e.id, v); }
    }
    if (dirtyB.size) { for (const bm of dirtyB) bm.computeBoundingSphere(); dirtyB.clear(); }
    const N = entries.length; if (!N) return;
    const k = Math.min(N, n);
    for (let c = 0; c < k; c++) {
      const e = entries[idx]; idx = (idx + 1) % N; if (e.dead) continue;
      const o = e.o;
      if (e.im) {
        if (o.parent !== e.parent || o.material !== e.mat || !e.root.parent || o.count !== e.count || o.instanceMatrix.version !== e.ver || (o.instanceColor ? o.instanceColor.version : -1) !== e.cver) { unbatch(e, 'instanced changed'); continue; }
        if (o.layers.mask !== DEAD && o.layers.mask !== HIDDEN) { unbatch(e, 'layers'); continue; }
        if (!same(o.matrixWorld.elements, e.mw)) { if (!resync(e)) unbatch(e, 'moved'); continue; }
        const v = o.layers.mask !== HIDDEN && visIn(o, e.root);
        if (v !== e.vis) { e.vis = v; const w = v && (!e.rs || e.rs.on); for (let j = 0; j < e.ids.length; j++) e.bms[j].setVisibleAt(e.ids[j], w); }
        continue;
      }
      if (o.parent !== e.parent || o.material !== e.mat || !e.root.parent) { unbatch(e, 'parent/material'); continue; }
      if (o.layers.mask !== DEAD && o.layers.mask !== HIDDEN) { unbatch(e, 'layers'); continue; }
      if (movedLocal(o, e.loc) || !same(o.matrixWorld.elements, e.mw)) { if (!resync(e)) unbatch(e, 'moved'); continue; }
      let v = o.layers.mask !== HIDDEN && visIn(o, e.root); // (perfcull.js distance / house cull hide through layer 30)
      if (v && cam && e.r < 0.7) { const dx = e.cx - cam.x, dy = e.cy - cam.y, dz = e.cz - cam.z; if (Math.sqrt(dx * dx + dy * dy + dz * dz) - e.r * 6 > far) v = false; }
      if (v !== e.vis) { e.vis = v; e.bm.setVisibleAt(e.id, v && (!e.rs || e.rs.on)); }
    }
    // materials animated by code (emissive pulses, colour swaps): their meshes go back to plain rendering
    if (++tick % 30 === 0) for (const [m, s] of matSnaps) if (matSnap(m) !== s) { matSnaps.delete(m); for (const e of entries) if (!e.dead && e.mat === m) unbatch(e, 'material changed'); }
    if (entries.length > 2 * stats.meshes) { const live = entries.filter(e => !e.dead); entries.length = 0; entries.push(...live); idx = 0; }
  }
  const api = { batch, batchRoots, diag, reason, imReason, update, unbatch, stats: () => ({ ...stats, live: entries.filter(e => !e.dead).length }), batches, entries };
  return api;
}
