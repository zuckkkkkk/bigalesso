// Optional real zombie model for the night event (Tripo export: zombie.glb / zombie.fbx, UE5-mannequin rig).
// Manifest: ./models/index.json { "models": ["zombie.glb", "zombie_walk.glb", ...] } (artifact builds: "*.glb.txt" base64;
// single-file builds: window.__ASSETS.models). Anything named zombie* is considered; extra files only add clips.
// Clips are mapped by fuzzy name (Idle / Walk "Camminata" / Run "Corsa" / Slash "Fendente" / Fall "Caduta"), the
// horizontal root motion of the locomotion clips is removed (linear detrend), the facing is measured from the walk's
// own root motion, the model is scaled to 1.75 m. No manifest entry → null (the procedural zombies stay).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';

const MAP = [
  ['attack', /slash|fendent|attack|attacc|punch|pugno|swipe|bite|morso|hit/i],
  ['fall', /fall|cadut|death|morte|die|dying|dead/i],
  ['run', /run|cors|sprint|chase/i],
  ['walk', /walk|cammin|shambl|locomot|move/i],
  ['idle', /idle|fermo|stand|riposo|breath|wait/i],
];
const kindOf = name => { for (const [k, re] of MAP) if (re.test(name)) return k; return null; };

let manifestP = null;
async function manifest() {
  if (manifestP) return manifestP;
  manifestP = (async () => {
    try {
      if (window.__ASSETS) return window.__ASSETS.models ? Object.keys(window.__ASSETS.models) : [];
      if (location.protocol === 'file:') return [];
      const r = await fetch('./models/index.json', { cache: 'no-cache' }); if (!r.ok) return [];
      const j = await r.json(); const l = Array.isArray(j) ? j : (j.models || []);
      return l.map(x => (typeof x === 'string' ? x : x && (x.file || x.name))).filter(Boolean);
    } catch (e) { return []; }
  })();
  return manifestP;
}
async function bytesOf(file) {
  if (window.__ASSETS && window.__ASSETS.models && window.__ASSETS.models[file]) return Uint8Array.from(atob(window.__ASSETS.models[file]), c => c.charCodeAt(0)).buffer;
  if (/\.txt$/i.test(file)) { const b64 = await (await fetch('./models/' + file)).text(); return Uint8Array.from(atob(b64.trim()), c => c.charCodeAt(0)).buffer; }
  return await (await fetch('./models/' + file)).arrayBuffer();
}
async function parse(file) {
  const buf = await bytesOf(file), base = file.replace(/\.txt$/i, '');
  if (/\.fbx$/i.test(base)) {
    const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js');
    const obj = new FBXLoader().parse(buf, './models/');
    return { scene: obj, clips: obj.animations || [] };
  }
  const g = await new GLTFLoader().parseAsync(buf, './models/');
  return { scene: g.scene, clips: g.animations || [] };
}

let modelP = null;
// resolves to { proto, clips:{idle,walk,run,attack,fall}, rotY, scale, speed:{walk,run} } or null
export function loadZombieModel() {
  if (modelP) return modelP;
  modelP = (async () => {
    const list = (await manifest()).filter(f => /^zombie/i.test(f) && /\.(glb|gltf|fbx)(\.txt)?$/i.test(f));
    if (!list.length) return null;
    list.sort((a, b) => (/^zombie\.(glb|gltf)/i.test(a) ? -2 : /^zombie\./i.test(a) ? -1 : 0) - (/^zombie\.(glb|gltf)/i.test(b) ? -2 : /^zombie\./i.test(b) ? -1 : 0));
    let main = null; const clips = {};
    for (const f of list) {
      try {
        const r = await parse(f);
        let skinned = false; r.scene.traverse(o => { if (o.isSkinnedMesh) skinned = true; });
        if (!main && skinned) main = r;
        for (const c of r.clips) { const k = kindOf(c.name) || kindOf(f) || (r.clips.length === 1 ? 'walk' : null); if (k && !clips[k]) clips[k] = c; }
      } catch (e) { console.warn('zombie model ' + f, e); }
    }
    if (!main) return null;
    if (!clips.walk) clips.walk = clips.run || clips.idle || main.clips[0];
    if (!clips.walk) return null;
    const proto = main.scene;
    proto.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(proto), size = box.getSize(new THREE.Vector3());
    const H = Math.max(1e-4, size.y), scale = 1.75 / H;
    // facing + natural speed from the walk/run root motion (measured in world space on a temporary clone)
    const probe = skClone(proto); probe.updateMatrixWorld(true);
    const hips = (() => { let b = null; probe.traverse(o => { if (!b && o.isBone && /hips|pelvis/i.test(o.name)) b = o; }); if (!b) probe.traverse(o => { if (!b && o.isBone) b = o; }); return b; })();
    const travel = clip => {
      if (!clip || !hips) return null;
      const mx = new THREE.AnimationMixer(probe), a = mx.clipAction(clip); a.play();
      mx.setTime(0); probe.updateMatrixWorld(true); const p0 = hips.getWorldPosition(new THREE.Vector3());
      mx.setTime(clip.duration * 0.98); probe.updateMatrixWorld(true); const p1 = hips.getWorldPosition(new THREE.Vector3());
      a.stop(); mx.uncacheRoot(probe);
      const d = p1.sub(p0); d.y = 0; return { d, len: d.length(), dur: clip.duration * 0.98 };
    };
    const tw = travel(clips.walk), tr = clips.run ? travel(clips.run) : null;
    let rotY = 0; if (tw && tw.len > 0.08 * H) rotY = -Math.atan2(tw.d.x, tw.d.z);
    const speed = { walk: tw && tw.len > 0.08 * H ? tw.len * scale / tw.dur : 0.9, run: tr && tr.len > 0.08 * H ? tr.len * scale / tr.dur : 2.6 };
    // strip the travel (linear detrend of every position track that drifts) from the locomotion clips
    for (const k of ['walk', 'run', 'idle']) {
      const c = clips[k]; if (!c) continue;
      const cc = c.clone();
      for (const t of cc.tracks) {
        if (!t.name.endsWith('.position') || t.getValueSize() !== 3) continue;
        const v = t.values, n = t.times.length; if (n < 2) continue;
        const dx = v[(n - 1) * 3] - v[0], dy = v[(n - 1) * 3 + 1] - v[1], dz = v[(n - 1) * 3 + 2] - v[2];
        if (Math.hypot(dx, dy, dz) < 0.12 * H) continue;
        const T0 = t.times[0], T1 = t.times[n - 1] - T0 || 1;
        for (let i = 0; i < n; i++) { const u = (t.times[i] - T0) / T1; v[i * 3] -= dx * u; v[i * 3 + 1] -= dy * u; v[i * 3 + 2] -= dz * u; }
      }
      clips[k] = cc;
    }
    proto.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; } });
    return { proto, clips, rotY, scale, speed };
  })().catch(e => { console.warn('zombie model', e); return null; });
  return modelP;
}

// one animated clone: root (position/yaw) > inner (facing fix + scale) > model
export function makeZombieRig(M) {
  const root = new THREE.Group(), inner = new THREE.Group(); root.add(inner);
  const model = skClone(M.proto); inner.add(model);
  inner.rotation.y = M.rotY; const s = M.scale * (0.94 + Math.random() * 0.12); inner.scale.setScalar(s);
  const mixer = new THREE.AnimationMixer(model);
  const acts = {}; for (const k in M.clips) if (M.clips[k]) acts[k] = mixer.clipAction(M.clips[k]);
  if (acts.fall) { acts.fall.setLoop(THREE.LoopOnce, 1); acts.fall.clampWhenFinished = true; }
  if (acts.attack) { acts.attack.setLoop(THREE.LoopOnce, 1); acts.attack.clampWhenFinished = true; }
  let cur = null;
  const rig = {
    root, mixer, busy: false,
    play(k, fade = 0.25) {
      const a = acts[k] || acts.walk; if (!a || a === cur) return;
      a.reset().setEffectiveWeight(1).play(); if (cur) cur.crossFadeTo(a, fade, false); cur = a;
    },
    setRate(r) { if (cur) cur.timeScale = r; },
    has: k => !!acts[k],
    update(dt) { mixer.update(dt); },
    speed: M.speed,
  };
  rig.play('idle', 0);
  return rig;
}

// static optional model (e.g. sushi_plates, tortellini_plate): a clone of the glb scene, or null when not in the manifest
const statics = new Map();
export function loadStatic(name) {
  if (!statics.has(name)) statics.set(name, (async () => {
    const f = (await manifest()).find(x => x.replace(/\.txt$/i, '').replace(/\.(glb|gltf)$/i, '') === name);
    if (!f) return null;
    try { const r = await parse(f); r.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return r.scene; } catch (e) { console.warn('model ' + name, e); return null; }
  })());
  return statics.get(name).then(s => (s ? s.clone() : null));
}
// fits an object to a target size (max xz extent) with its base at y=0, centred in xz; returns the object (wrapped)
export function fitModel(obj, size) {
  const box = new THREE.Box3().setFromObject(obj), sz = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const k = size / Math.max(1e-4, Math.max(sz.x, sz.z));
  const w = new THREE.Group(); obj.position.sub(new THREE.Vector3(c.x, box.min.y, c.z)); w.add(obj); w.scale.setScalar(k); return w;
}
