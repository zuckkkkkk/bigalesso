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
// noColor: the diffuse colour is left out of the key (it becomes a per-instance colour of the batch)
function matKey(m, noColor) {
  const c = x => (x && x.isColor ? x.getHexString() : '-');
  return [m.type, noColor ? '*' : c(m.color), c(m.emissive), m.emissiveIntensity, m.roughness, m.metalness, m.opacity, m.transparent, m.alphaTest, m.side,
    m.vertexColors, m.flatShading, m.fog, m.toneMapped, m.depthWrite, m.depthTest, m.blending, m.polygonOffset, m.polygonOffsetFactor, m.envMapIntensity,
    texId(m.map), texId(m.normalMap), texId(m.roughnessMap), texId(m.metalnessMap), texId(m.emissiveMap), texId(m.aoMap), texId(m.alphaMap), texId(m.envMap),
    texId(m.lightMap), m.normalScale ? m.normalScale.x + ',' + m.normalScale.y : '-', m.clearcoat, m.transmission, m.sheen, m.specularIntensity, m.ior, m.wireframe,
    m.specular ? c(m.specular) : '-', m.shininess, m.aoMapIntensity, m.lightMapIntensity, m.bumpMap ? texId(m.bumpMap) : '-', m.displacementMap ? 'D' : '-',
    m.matcap ? texId(m.matcap) : '-', m.gradientMap ? texId(m.gradientMap) : '-', m.dithering, m.premultipliedAlpha, m.colorWrite, m.stencilWrite, shaderKey(m)].join('|');
}
// snapshot of the properties code tends to animate (to notice a material changed after batching)
function matSnap(m) { return [m.color && m.color.getHex(), m.emissive && m.emissive.getHex(), m.emissiveIntensity, m.opacity, m.visible, texId(m.map), texId(m.emissiveMap), m.transparent, m.roughness, m.metalness, shaderKey(m)].join('|'); }

// ---- geometry: plain Float32 attributes, indexed, only the batchable attributes ----
const geoCache = new WeakMap(); // source geometry -> { sig, geo, hash }
function canonGeometry(src) {
  const c0 = geoCache.get(src); if (c0 !== undefined && (c0 === null || c0.geo)) return c0; // (geo released after a batch: rebuilt on demand)
  let out = null;
  try {
    if (!src.attributes.position || src.morphAttributes && Object.keys(src.morphAttributes).length) throw 0;
    const g = new THREE.BufferGeometry(); const names = [];
    for (const k of ATTRS) {
      const a = src.attributes[k]; if (!a) continue;
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
  geoCache.set(src, out); return out;
}

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
    if (!o.frustumCulled) return 'unculled'; // pools that place instances anywhere (and draw with frustumCulled off)
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
      const cg = canonGeometry(o.geometry); if (!cg) { why.geometry = (why.geometry || 0) + 1; return; }
      const key = matKey(o.material, instColor) + '#' + cg.sig + '#' + (o.castShadow ? 1 : 0) + (o.receiveShadow ? 1 : 0);
      groups.set(key, (groups.get(key) || 0) + 1);
    });
    let inGroups = 0, nGroups = 0, singles = 0;
    for (const n of groups.values()) if (n >= 2) { inGroups += n; nGroups++; } else singles++;
    return { meshes, why, batches: nGroups, batched: inGroups, singles };
  }

  function batch(root, { name = root.name || 'batch', minGroup = 2, maxInstances = 4096, instColor = true } = {}) {
    if (!root) return null;
    try { splitMulti(root); } catch (e) { console.warn('batch split', e); }
    root.updateMatrixWorld(true);
    _inv.copy(root.matrixWorld).invert();
    const groups = new Map(); // key -> { mat, list: [{o, cg, inst?}], verts, idx, geos: Map(hash -> cg) }
    const addTo = (o, cg, inst) => {
      const key = matKey(o.material, instColor) + '#' + cg.sig + '#' + (o.castShadow ? 1 : 0) + (o.receiveShadow ? 1 : 0);
      let G = groups.get(key); if (!G) { G = { mat: o.material, list: [], geos: new Map(), verts: 0, idx: 0, tint: false }; groups.set(key, G); }
      if (instColor && G.mat.color && o.material.color && !G.mat.color.equals(o.material.color)) G.tint = true;
      if (inst !== undefined && o.instanceColor) G.tint = true;
      if (!G.geos.has(cg.hash)) { G.geos.set(cg.hash, cg); G.verts += cg.verts; G.idx += cg.idx; }
      G.list.push({ o, cg: G.geos.get(cg.hash), inst });
    };
    root.traverse(o => {
      if (o.isInstancedMesh) {
        if (imReason(o, root)) return;
        const cg = canonGeometry(o.geometry); if (!cg) { stats.skipped++; return; }
        for (let i = 0; i < o.count; i++) addTo(o, cg, i);
        return;
      }
      if (!eligible(o, root)) return;
      const cg = canonGeometry(o.geometry); if (!cg) { stats.skipped++; return; }
      addTo(o, cg);
    });
    const made = [];
    for (const G of groups.values()) {
      if (G.list.length < minGroup) continue; // a lone mesh: nothing to gain
      for (let k = 0; k < G.list.length; k += maxInstances) {
        const part = G.list.slice(k, k + maxInstances);
        const geos = new Map(); let verts = 0, idxN = 0;
        for (const it of part) if (!geos.has(it.cg)) { geos.set(it.cg, -1); verts += it.cg.verts; idxN += it.cg.idx; }
        // different diffuse colours in one batch: a white copy of the material + a per-instance colour
        let mat = G.mat;
        if (G.tint) {
          const ud = G.mat.userData; G.mat.userData = {};
          try { mat = G.mat.clone(); } finally { G.mat.userData = ud; }
          mat.userData = ud; mat.onBeforeCompile = G.mat.onBeforeCompile; mat.customProgramCacheKey = G.mat.customProgramCacheKey;
          mat.color.set(0xffffff); mat.name = (G.mat.name || G.mat.type) + '+tint';
        }
        const bm = new THREE.BatchedMesh(part.length, Math.max(3, verts), Math.max(3, idxN), mat);
        bm.name = 'batch:' + name + ':' + (G.mat.name || G.mat.type);
        bm.sortObjects = false; bm.perObjectFrustumCulled = true;
        bm.castShadow = part[0].o.castShadow; bm.receiveShadow = part[0].o.receiveShadow;
        bm.userData.noBatch = true; bm.userData.noCull = true;
        for (const [cg] of geos) geos.set(cg, bm.addGeometry(cg.geo));
        for (const it of part) {
          if (it.inst !== undefined) { // an instance of a static InstancedMesh
            const im = it.o, id = bm.addInstance(geos.get(it.cg));
            im.getMatrixAt(it.inst, _mi); _m.multiplyMatrices(_inv, im.matrixWorld).multiply(_mi); bm.setMatrixAt(id, _m);
            if (G.tint) { if (im.instanceColor) { im.getColorAt(it.inst, _c); if (im.material.color) _c.multiply(im.material.color); bm.setColorAt(id, _c); } else bm.setColorAt(id, im.material.color || _c.set(0xffffff)); }
            let e = imEntries.get(im);
            if (!e) {
              im.updateWorldMatrix(true, false);
              e = { im: true, o: im, ids: [], bms: [], root, mat: im.material, mask: im.layers.mask, vis: true, parent: im.parent, dead: false, mw: im.matrixWorld.elements.slice(),
                ver: im.instanceMatrix.version, cver: im.instanceColor ? im.instanceColor.version : -1, count: im.count, mau: im.matrixAutoUpdate };
              imEntries.set(im, e); entries.push(e);
              im.userData.batched = e; im.userData.noCull = true; adopt(im, e); im.matrixAutoUpdate = false;
              if (!matSnaps.has(im.material)) matSnaps.set(im.material, matSnap(im.material));
            }
            e.ids.push(id); e.bms.push(bm); stats.meshes++;
            continue;
          }
          const o = it.o, id = bm.addInstance(geos.get(it.cg));
          _m.multiplyMatrices(_inv, o.matrixWorld); bm.setMatrixAt(id, _m);
          if (G.tint) bm.setColorAt(id, o.material.color);
          o.updateWorldMatrix(false, false);
          const cg = it.cg, ws = cg.geo.boundingSphere, sc = o.matrixWorld.getMaxScaleOnAxis();
          const c = ws.center.clone().applyMatrix4(o.matrixWorld);
          const e = { o, bm, id, root, mat: o.material, mask: o.layers.mask, vis: true, on: true, mw: o.matrixWorld.elements.slice(), parent: o.parent, dead: false,
            loc: [o.position.x, o.position.y, o.position.z, o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w, o.scale.x, o.scale.y, o.scale.z],
            cx: c.x, cy: c.y, cz: c.z, r: ws.radius * sc, mau: o.matrixAutoUpdate };
          // originals: never drawn, and no per-frame matrix recompose (their world matrix still follows the parents)
          o.userData.batched = e; o.userData.noCull = true; adopt(o, e); o.matrixAutoUpdate = false;
          if (!visIn(o, root) || o.layers.mask === HIDDEN) { e.vis = false; bm.setVisibleAt(id, false); }
          if (!matSnaps.has(o.material)) matSnaps.set(o.material, matSnap(o.material));
          entries.push(e); stats.meshes++;
        }
        bm.computeBoundingBox(); bm.computeBoundingSphere();
        root.add(bm); made.push(bm); batches.push({ root, mesh: bm }); stats.batches++; stats.geometries += geos.size;
        for (const e of imEntries.values()) if (!e.vis0) { e.vis0 = true; if (!visIn(e.o, e.root) || e.o.layers.mask === HIDDEN) { e.vis = false; for (let j = 0; j < e.ids.length; j++) e.bms[j].setVisibleAt(e.ids[j], false); } }
      }
    }
    // the canonical copies were copied into the batches: free them (the originals keep their own geometry)
    for (const G of groups.values()) for (const cg of G.geos.values()) if (cg.geo) { cg.geo.dispose(); cg.geo = null; }
    return made;
  }

  function unbatch(e, why) {
    if (e.dead) return; e.dead = true; stats.unbatched++;
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
  // world matrix unchanged? (translation + diagonal: catches any move/turn/scale of an ancestor at a third of the cost)
  const same = (a, b) => Math.abs(a[12] - b[12]) + Math.abs(a[13] - b[13]) + Math.abs(a[14] - b[14]) + Math.abs(a[0] - b[0]) + Math.abs(a[5] - b[5]) + Math.abs(a[10] - b[10]) + Math.abs(a[1] - b[1]) + Math.abs(a[8] - b[8]) < 1e-5;
  const movedLocal = (o, L) => { const p = o.position, q = o.quaternion, s = o.scale; return Math.abs(p.x - L[0]) + Math.abs(p.y - L[1]) + Math.abs(p.z - L[2]) + Math.abs(q.x - L[3]) + Math.abs(q.y - L[4]) + Math.abs(q.z - L[5]) + Math.abs(q.w - L[6]) + Math.abs(s.x - L[7]) + Math.abs(s.y - L[8]) + Math.abs(s.z - L[9]) > 1e-5; };
  // watcher: a slice of entries per frame (whole list every few frames). cam: camera position for the distance cull
  // of small props (what perfcull.js did for single meshes): far small instances are skipped in both passes.
  let far = 28, tick = 0;
  function update(n = 400, cam = null, farDist) {
    if (farDist) far = farDist;
    const N = entries.length; if (!N) return;
    const k = Math.min(N, n);
    for (let c = 0; c < k; c++) {
      const e = entries[idx]; idx = (idx + 1) % N; if (e.dead) continue;
      const o = e.o;
      if (e.im) {
        if (o.parent !== e.parent || o.material !== e.mat || !e.root.parent || o.count !== e.count || o.instanceMatrix.version !== e.ver || (o.instanceColor ? o.instanceColor.version : -1) !== e.cver) { unbatch(e, 'instanced changed'); continue; }
        if (o.layers.mask !== DEAD && o.layers.mask !== HIDDEN) { unbatch(e, 'layers'); continue; }
        if (!same(o.matrixWorld.elements, e.mw)) { unbatch(e, 'moved'); continue; }
        const v = o.layers.mask !== HIDDEN && visIn(o, e.root);
        if (v !== e.vis) { e.vis = v; for (let j = 0; j < e.ids.length; j++) e.bms[j].setVisibleAt(e.ids[j], v); }
        continue;
      }
      if (o.parent !== e.parent || o.material !== e.mat || !e.root.parent) { unbatch(e, 'parent/material'); continue; }
      if (o.layers.mask !== DEAD && o.layers.mask !== HIDDEN) { unbatch(e, 'layers'); continue; }
      if (movedLocal(o, e.loc) || !same(o.matrixWorld.elements, e.mw)) { unbatch(e, 'moved'); continue; }
      let v = o.layers.mask !== HIDDEN && visIn(o, e.root); // (perfcull.js distance / house cull hide through layer 30)
      if (v && cam && e.r < 0.7) { const dx = e.cx - cam.x, dy = e.cy - cam.y, dz = e.cz - cam.z; if (Math.sqrt(dx * dx + dy * dy + dz * dz) - e.r * 6 > far) v = false; }
      if (v !== e.vis) { e.vis = v; e.bm.setVisibleAt(e.id, v); }
    }
    // materials animated by code (emissive pulses, colour swaps): their meshes go back to plain rendering
    if (++tick % 30 === 0) for (const [m, s] of matSnaps) if (matSnap(m) !== s) { matSnaps.delete(m); for (const e of entries) if (!e.dead && e.mat === m) unbatch(e, 'material changed'); }
    if (entries.length > 2 * stats.meshes) { const live = entries.filter(e => !e.dead); entries.length = 0; entries.push(...live); idx = 0; }
  }
  const api = { batch, diag, reason, update, unbatch, stats: () => ({ ...stats, live: entries.filter(e => !e.dead).length }), batches, entries };
  return api;
}
