// motor/skid.js — skid marks: a ring buffer of flat dark quads (one InstancedMesh, built at startup, no lights).
import * as THREE from 'three';

export function createSkids(scene, n = 360) {
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0x0b0b0d, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const im = new THREE.InstancedMesh(geo, mat, n); im.name = 'motorSkids'; im.frustumCulled = false; im.renderOrder = 1; im.castShadow = false; im.receiveShadow = false;
  const zero = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < n; i++) im.setMatrixAt(i, zero);
  scene.add(im);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  let head = 0;
  const last = [null, null]; // previous mark position per rear wheel
  function mark(w, x, z, y = 0.026) {
    const L = last[w];
    if (L) {
      const dx = x - L.x, dz = z - L.z, d = Math.hypot(dx, dz);
      if (d < 0.22) return; if (d > 2.5) { last[w] = { x, z }; return; }
      p.set((x + L.x) / 2, y, (z + L.z) / 2); q.setFromAxisAngle(Y, Math.atan2(dx, dz)); s.set(0.2, 1, d + 0.04);
      m4.compose(p, q, s); im.setMatrixAt(head, m4); im.instanceMatrix.needsUpdate = true; head = (head + 1) % n;
      L.x = x; L.z = z;
    } else last[w] = { x, z };
  }
  function lift() { last[0] = null; last[1] = null; }
  return { mark, lift, im };
}
