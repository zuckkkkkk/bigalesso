// prof.js — frame profiler (off unless ?prof or window.__prof.enable()).
// main.js calls P.start() at the top of the frame and P.m('section') after each block: the time since the previous
// mark is charged to that section. The renderer is wrapped to split the render into: scene.updateMatrixWorld,
// shadow pass (ms + draw calls), each composer pass (ms + draw calls), skeleton updates; AnimationMixer.update is
// counted globally (calls + ms). window.__prof.report() -> averages per frame over the collected frames.
import * as THREE from 'three';

const on0 = /[?&]prof\b/.test(location.search);
const now = () => performance.now();
const S = { on: on0, t0: 0, last: 0, frames: 0, sec: Object.create(null), max: Object.create(null), frameMs: [], cnt: Object.create(null) };

function add(k, ms) { S.sec[k] = (S.sec[k] || 0) + ms; if (!(S.max[k] >= ms)) S.max[k] = ms; }
function count(k, n = 1) { S.cnt[k] = (S.cnt[k] || 0) + n; }

export const P = {
  get on() { return S.on; },
  start() { if (!S.on) return; S.t0 = S.last = now(); const r = P._renderer; if (r) r.info.reset(); },
  m(name) { if (!S.on) return; const t = now(); add(name, t - S.last); S.last = t; },
  end() { if (!S.on) return; const t = now(); S.frameMs.push(t - S.t0); if (S.frameMs.length > 2000) S.frameMs.shift(); S.frames++; const r = P._renderer; if (r) { count('calls', r.info.render.calls); count('tris', r.info.render.triangles); count('renders'); } },
  add, count,
};

// global hooks (installed once; cheap when off)
let hooked = false;
export function hookRenderer({ renderer, scene, composer }) {
  if (hooked) return; hooked = true;
  const info = renderer.info;
  // AnimationMixer.update: calls + time
  const mu = THREE.AnimationMixer.prototype.update;
  THREE.AnimationMixer.prototype.update = function (dt) { if (!S.on) return mu.call(this, dt); const t = now(); const r = mu.call(this, dt); add('~mixers', now() - t); count('mixers'); return r; };
  // Skeleton.update (one per visible skinned mesh per render)
  const su = THREE.Skeleton.prototype.update;
  THREE.Skeleton.prototype.update = function () { if (!S.on) return su.call(this); const t = now(); su.call(this); add('~skeletons', now() - t); count('skeletons'); count('bones', this.bones.length); };
  // scene.updateMatrixWorld inside render
  const umw = scene.updateMatrixWorld.bind(scene);
  scene.updateMatrixWorld = function (force) { if (!S.on) return umw(force); const t = now(); const r = umw(force); add('~matrixWorld', now() - t); count('matrixWorld'); return r; };
  // draws as a real GPU sees them: one per object (a BatchedMesh is ONE multi-draw where WEBGL_multi_draw exists —
  // every desktop Chrome/Electron; SwiftShader lacks it and info.render.calls counts each batch instance there)
  let inShadow = false;
  const rbd = renderer.renderBufferDirect.bind(renderer);
  renderer.renderBufferDirect = function (cam, sc, geo, mat, obj, grp) {
    if (S.on) { count(inShadow ? 'gpuShadowDraws' : 'gpuDraws'); if (obj && obj.isBatchedMesh) count(inShadow ? 'gpuShadowBatches' : 'gpuBatches'); }
    return rbd(cam, sc, geo, mat, obj, grp);
  };
  // shadow pass
  const sm = renderer.shadowMap, smr = sm.render.bind(sm);
  sm.render = function (...a) {
    if (!S.on) return smr(...a);
    inShadow = true; try { var c0 = info.render.calls, tr0 = info.render.triangles, t = now(); var r = smr(...a); } finally { inShadow = false; }
    add('~shadow', now() - t); count('shadowCalls', info.render.calls - c0); count('shadowTris', info.render.triangles - tr0); count('shadowRenders'); return r;
  };
  // composer passes
  if (composer && composer.passes) {
    const wrap = p => {
      if (p.__profWrapped) return; p.__profWrapped = true;
      const pr = p.render.bind(p), name = (p.constructor && p.constructor.name) || 'pass';
      p.render = function (...a) {
        if (!S.on) return pr(...a);
        const c0 = info.render.calls, tr0 = info.render.triangles, t = now(); const r = pr(...a);
        add('~pass:' + name, now() - t); count('calls:' + name, info.render.calls - c0); count('tris:' + name, info.render.triangles - tr0); return r;
      };
    };
    composer.passes.forEach(wrap);
    const ap = composer.addPass.bind(composer); composer.addPass = p => { wrap(p); return ap(p); };
  }
  // renderer.render calls (each one re-traverses its scene; skinned meshes update their skeleton once per call)
  const rr = renderer.render.bind(renderer);
  renderer.render = function (sc, cam) { if (S.on) { count('render()'); if (sc === scene) count('render(scene)'); } return rr(sc, cam); };
  P._renderer = renderer;
  if (S.on) renderer.info.autoReset = false; // enabled before the hook (?prof): per-frame totals from now on
}

function sceneStats(scene) {
  let objs = 0, meshes = 0, vis = 0, skinned = 0, inst = 0, auto = 0, lights = 0;
  const walk = (o, v) => { objs++; if (o.matrixAutoUpdate) auto++; const vv = v && o.visible; if (o.isMesh) { meshes++; if (vv) vis++; if (o.isSkinnedMesh && vv) skinned++; if (o.isInstancedMesh) inst++; } if (o.isLight && vv) lights++; for (const c of o.children) walk(c, vv); };
  walk(scene, true); return { objs, autoMatrix: auto, meshes, visibleMeshes: vis, visibleSkinned: skinned, instanced: inst, visibleLights: lights };
}

window.__prof = {
  enable() { S.on = true; if (P._renderer) P._renderer.info.autoReset = false; this.reset(); },
  disable() { S.on = false; if (P._renderer) P._renderer.info.autoReset = true; },
  reset() { S.frames = 0; S.sec = Object.create(null); S.max = Object.create(null); S.cnt = Object.create(null); S.frameMs = []; },
  // per-frame averages; render info summed over every renderer.render() of the frame (autoReset off while profiling)
  report(scene) {
    const n = Math.max(1, S.frames), out = { frames: S.frames, ms: {}, maxMs: {}, perFrame: {} };
    for (const [k, v] of Object.entries(S.sec)) { out.ms[k] = +(v / n).toFixed(3); out.maxMs[k] = +S.max[k].toFixed(2); }
    for (const [k, v] of Object.entries(S.cnt)) out.perFrame[k] = +(v / n).toFixed(1);
    const f = S.frameMs.slice().sort((a, b) => a - b); out.frame = { avg: +(f.reduce((a, b) => a + b, 0) / Math.max(1, f.length)).toFixed(2), p95: +(f[Math.floor(f.length * 0.95)] || 0).toFixed(2), max: +(f[f.length - 1] || 0).toFixed(2) };
    const r = P._renderer; if (r) { out.info = { programs: r.info.programs ? r.info.programs.length : null, textures: r.info.memory.textures, geometries: r.info.memory.geometries }; }
    if (scene) out.scene = sceneStats(scene);
    if (performance.memory) out.heapMB = +(performance.memory.usedJSHeapSize / 1e6).toFixed(1);
    return out;
  },
  // the renderer info is per frame while profiling: main.js resets it at P.start()
  sceneStats,
};
if (on0) setTimeout(() => window.__prof.enable(), 0);
export default P;
