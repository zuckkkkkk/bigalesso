// lightpad.js — keeps the number of point/spot lights the shaders see constant, so nothing recompiles while playing.
// three.js builds one shader program per light count: every time a lamp, the lounge light, the Gulag lights or the
// night torch are shown/hidden, every material in view needed a new program. On Windows (ANGLE → Direct3D) compiling
// those takes tens to hundreds of ms each: the "random" stutters with the GPU at 30%.
// Here: before every render, invisible zero-intensity "pad" lights fill the gap up to the highest count seen so far,
// so the count only ever grows (one compile per new maximum, normally during the loading warm-up) and never flips.
// The maximum is remembered per browser/app (localStorage), so from the second start the warm-up compiles the final
// shaders up front. Pad lights sit far below the map with a tiny range: they add no light, only a few shader
// instructions per extra light.
import * as THREE from 'three';

const LS = 'bigalesso.lightpad.v1';
const TYPES = ['PointLight', 'SpotLight'];

export function installLightPad({ scene }) {
  // software renderers (SwiftShader/llvmpipe) pay every padded light per pixel on the CPU and compile lazily anyway
  const g = window.__gfx && window.__gfx.gpu;
  if (g && g.software && !/[?&]lightpad\b/.test(location.search)) return null;
  const root = new THREE.Group(); root.name = 'lightpad'; root.userData.noWarm = true; scene.add(root);
  const target = { PointLight: 0, SpotLight: 0 };
  try { const s = JSON.parse(localStorage.getItem(LS) || '{}'); for (const t of TYPES) if (s[t] > 0) target[t] = Math.min(24, s[t] | 0); } catch (e) { }
  const pads = { PointLight: [], SpotLight: [] };
  let lights = [], dirty = true, saved = JSON.stringify(target);

  // lights added later (minigames, effects) mark the list dirty: patch Object3D.add once
  const add0 = THREE.Object3D.prototype.add;
  if (!add0.__lightpad) {
    const add = function (...objs) {
      for (const o of objs) if (o && (o.isLight || (o.children && o.children.length))) {
        if (o.isLight) dirty = true; else o.traverse(c => { if (c.isLight) dirty = true; });
      }
      return add0.apply(this, objs);
    };
    add.__lightpad = true; THREE.Object3D.prototype.add = add;
  }

  function scan() {
    dirty = false; lights = [];
    scene.traverse(o => { if (o.isLight && (o.isPointLight || o.isSpotLight) && !o.userData.lightpad) lights.push(o); });
  }
  const shown = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; }; // same rule as the renderer (stops at hidden parents)
  function pad(type, n) {
    const arr = pads[type];
    while (arr.length < n) {
      const L = type === 'PointLight' ? new THREE.PointLight(0x000000, 0, 0.01, 2) : new THREE.SpotLight(0x000000, 0, 0.01, 0.3, 0.5, 2);
      L.position.set(0, -2000, 0); L.castShadow = false; L.userData.lightpad = true; L.userData.noWarm = true; L.visible = false;
      add0.call(root, L); if (L.target) { L.target.position.set(0, -2001, 0); add0.call(root, L.target); }
      arr.push(L);
    }
  }
  const counts = { PointLight: 0, SpotLight: 0 };
  function update() {
    if (dirty) scan();
    counts.PointLight = 0; counts.SpotLight = 0;
    for (let i = 0; i < lights.length; i++) {
      const L = lights[i];
      if (!L.parent) { dirty = true; continue; } // removed: rescan next frame
      if (L.layers.mask & 1 && shown(L)) counts[L.isSpotLight ? 'SpotLight' : 'PointLight']++;
    }
    let grew = false;
    for (const t of TYPES) {
      if (counts[t] > target[t]) { target[t] = counts[t]; grew = true; }
      const need = target[t] - counts[t]; pad(t, target[t]);
      const arr = pads[t]; for (let i = 0; i < arr.length; i++) arr[i].visible = i < need;
    }
    if (grew) { const s = JSON.stringify(target); if (s !== saved) { saved = s; try { localStorage.setItem(LS, s); } catch (e) { } } }
  }

  // before every render (main view, composer passes, warm-up render-all): adjust the pads, then let three collect lights
  const prev = scene.onBeforeRender;
  scene.onBeforeRender = function (...a) { update(); return prev && prev.apply(this, a); };

  const api = { update, target, counts, stats: () => ({ target: { ...target }, visible: { ...counts }, lights: lights.length, pads: { PointLight: pads.PointLight.length, SpotLight: pads.SpotLight.length } }) };
  window.__lightpad = api;
  return api;
}
