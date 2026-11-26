// skincull.js — frustum culling for skinned characters (zombies, pigeons, friends, cats, the dog…).
// Many SkinnedMeshes are created with frustumCulled = false (the bind-pose bounds of a skinned mesh are unreliable),
// so every one of them was drawn — main pass AND shadow pass — and had its skeleton re-uploaded every render even
// behind the camera or 80 m away. Here each one gets bounds computed from its current pose, inflated so any clip
// stays inside, and normal culling back on. New characters (spawned later) are picked up by a slow rescan.
// Opt out: mesh.userData.keepUnculled = true (e.g. something attached to the camera).
// Also: window.__camFrustum (updated by main.js every frame) + onScreen(pos, r) for animation LOD elsewhere.
import * as THREE from 'three';

export const camFrustum = new THREE.Frustum();
const _pv = new THREE.Matrix4(), _s = new THREE.Sphere();
export function updateCamFrustum(camera) {
  camera.updateMatrixWorld(); _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); camFrustum.setFromProjectionMatrix(_pv);
}
// true when a sphere (world centre p, radius r) can be on screen this frame
export function onScreen(p, r = 1) { _s.center.copy(p); _s.radius = r; return camFrustum.intersectsSphere(_s); }

export function installSkinCull({ scene, every = 2 }) {
  let acc = every, fixed = 0;
  function fix(o) {
    if (!o.isSkinnedMesh || o.frustumCulled || o.userData.keepUnculled || o.userData.__skinCulled) return;
    try {
      o.updateWorldMatrix(true, false);
      if (o.skeleton) o.skeleton.update();
      o.computeBoundingSphere(); // current pose (bone transforms applied)
      const bs = o.boundingSphere; if (!bs || !isFinite(bs.radius) || bs.radius <= 0) return;
      bs.radius = bs.radius * 1.8 + 0.25; // any clip (attack swings, flapping wings, dance) stays inside
      o.frustumCulled = true; o.userData.__skinCulled = true; fixed++;
    } catch (e) { }
  }
  function update(dt) {
    acc += dt; if (acc < every) return; acc = 0;
    scene.traverse(fix);
  }
  const api = { update, get fixed() { return fixed; } };
  window.__skinCull = api;
  window.__onScreen = onScreen;
  return api;
}
