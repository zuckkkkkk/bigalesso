// perfcull.js — distance culling for small static props (cups, books, bottles, knobs, plants…).
// The house, the arcade room and the neighbourhood interiors are made of hundreds of small meshes: each one is a draw
// call (and a shadow-map draw) even when it is 40 m away behind a wall. Here every small mesh is moved to an unused
// render layer when far from the camera, so neither the camera nor the shadow map draws it. Layers, not .visible:
// other modules toggle visibility freely (swaps, interactions) and this never fights them.
import * as THREE from 'three';
import { currentQuality } from './scene.js';

const HIDE = 30; // layer the camera never renders
export function installCull({ camera, roots, maxRadius = 0.7 }) {
  const items = [], s = new THREE.Sphere(), wp = new THREE.Vector3();
  let noShadow = 0;
  function collect() {
    items.length = 0;
    const q0 = currentQuality(), shadowR = q0 === 'low' || q0 === 'medium' ? 0.55 : q0 === 'high' ? 0.4 : 0.3;
    for (const r of roots) if (r) r.traverse(o => {
      if (!(o.isMesh || o.isPoints) || o.isSkinnedMesh || o.isInstancedMesh || o.userData.noCull) return;
      for (let p = o; p; p = p.parent) if (p.userData && (p.userData.noCull || p.userData.isMan || p.userData.isDog)) return;
      const g = o.geometry; if (!g) return; if (!g.boundingSphere) g.computeBoundingSphere(); if (!g.boundingSphere) return;
      o.updateWorldMatrix(true, false); s.copy(g.boundingSphere).applyMatrix4(o.matrixWorld);
      // small things don't need to cast shadows (a cup, a bottle, a knob): that's most of the shadow-map draw calls
      if (o.castShadow && s.radius < shadowR) { o.castShadow = false; noShadow++; }
      if (s.radius > maxRadius) return;
      items.push({ o, r: s.radius, mask: o.layers.mask, off: false });
    });
    return items.length;
  }
  let acc = 0, idx = 0;
  function update(dt) {
    acc += dt; if (acc < 0.1) return; acc = 0;
    const q = currentQuality(), far = q === 'low' ? 14 : q === 'medium' ? 20 : q === 'high' ? 28 : 38;
    const cp = camera.position, n = items.length; if (!n) return;
    // a slice per tick (a few hundred meshes): no frame ever pays for the whole list
    const step = Math.min(n, 400);
    for (let k = 0; k < step; k++) {
      const it = items[idx]; idx = (idx + 1) % n;
      it.o.getWorldPosition(wp);
      const d = wp.distanceTo(cp) - it.r * 6; // bigger props stay longer
      if (d > far) { if (!it.off) { it.off = true; it.mask = it.o.layers.mask; it.o.layers.set(HIDE); } }
      else if (it.off) { it.off = false; it.o.layers.mask = it.mask; }
    }
  }
  function restoreAll() { for (const it of items) if (it.off) { it.off = false; it.o.layers.mask = it.mask; } }
  const api = { collect, update, restoreAll, get count() { return items.length; }, get noShadow() { return noShadow; }, get culled() { let c = 0; for (const it of items) if (it.off) c++; return c; } };
  window.__cull = api;
  return api;
}

// house interior (arcade room, cabinets, eggs, newspaper corner…) while the camera is out in the neighbourhood:
// it is behind walls but inside the view frustum, so without this every one of its ~600 meshes is drawn.
// Same layer trick (no fights with .visible); toggled only when the camera crosses the threshold.
export function installHouseCull({ camera, level, groups, inside = ['Sala giochi', 'Salotto', 'Giardino'], center = [6, 9], radius = 13 }) {
  const IN = new Set(inside); let hidden = false, list = null, acc = 0;
  const gather = () => { list = []; for (const g of groups()) if (g) g.traverse(o => list.push([o, o.layers.mask])); };
  function set(h) {
    if (h === hidden) return; hidden = h;
    if (h) { gather(); for (const it of list) { it[1] = it[0].layers.mask; it[0].layers.set(HIDE); } }
    else if (list) { for (const [o, m] of list) o.layers.mask = m; list = null; }
  }
  return {
    update(dt) {
      acc += dt; if (acc < 0.2) return; acc = 0;
      const c = camera.position, z = level.zoneAt ? level.zoneAt(c.x, c.z) : null;
      const far = Math.hypot(c.x - center[0], c.z - center[1]) > radius;
      set(!IN.has(z) && far && !(window.__app && window.__app.gulag && window.__app.gulag.inside));
    },
    get hidden() { return hidden; },
  };
}
