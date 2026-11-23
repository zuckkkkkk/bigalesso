// Runtime performance helpers (installed once by main.js):
//  - shadow map re-rendered at ~40 Hz (not every frame), and not at all when the sun is (almost) off;
//  - tiny meshes stop casting shadows (their shadows are sub-pixel anyway);
//  - live game screens: drawn + uploaded every frame only when a mesh showing them is on screen, otherwise at ~10 Hz;
//  - dynamic resolution in 'auto' quality: the pixel ratio slides between 60% and 100% of the preset to hold ~55 fps.
import * as THREE from 'three';

export function installPerf({ renderer, scene, camera, composer, lights, resize, getQuality, protect = [], screens = [] }) {
  const q = new URLSearchParams(location.search);
  const S = { frame: 0, shadowAcc: 1, force: true, ema: 1 / 60, evalT: 0, scale: 1, base: renderer.getPixelRatio(), set: renderer.getPixelRatio(), stableT: 0, frustumFrame: -1 };

  // ---------- shadows ----------
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  // ---------- small shadow casters off ----------
  const isProtected = o => { for (let p = o; p; p = p.parent) if (protect.includes(p)) return true; return false; };
  const sph = new THREE.Sphere(), scl = new THREE.Vector3();
  function pruneCasters(root = scene) {
    let n = 0;
    root.updateMatrixWorld(true);
    root.traverse(o => {
      if (!o.isMesh || !o.castShadow || o.isInstancedMesh || o.isSkinnedMesh || isProtected(o)) return;
      const g = o.geometry; if (!g) return;
      if (!g.boundingSphere) g.computeBoundingSphere();
      o.matrixWorld.decompose(sph.center, new THREE.Quaternion(), scl);
      const r = g.boundingSphere.radius * Math.max(scl.x, scl.y, scl.z);
      if (r < 0.045) { o.castShadow = false; n++; }
    });
    return n;
  }
  const pruned = pruneCasters();

  // ---------- screens (live CanvasTextures) ----------
  // screens: [{ tex, extra: [meshes] }] -> the meshes that show tex are found automatically
  const usesTex = (m, t) => m && (m.map === t || m.emissiveMap === t || (m.uniforms && m.uniforms.tex && m.uniforms.tex.value === t));
  for (const sc of screens) {
    sc.meshes = [...(sc.extra || [])];
    scene.traverse(o => { if (o.isMesh && [].concat(o.material).some(m => usesTex(m, sc.tex)) && !sc.meshes.includes(o)) sc.meshes.push(o); });
    sc.slot = screens.indexOf(sc) * 2;
  }
  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4();
  const visible = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  function onScreen(mesh) {
    if (!visible(mesh)) return false;
    const g = mesh.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
    sph.copy(g.boundingSphere).applyMatrix4(mesh.matrixWorld);
    return frustum.intersectsSphere(sph);
  }
  // true when this screen must be redrawn this frame
  function screenDue(i) {
    const sc = screens[i]; if (!sc) return true;
    if (S.frustumFrame !== S.frame) { camera.updateMatrixWorld(); pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pv); S.frustumFrame = S.frame; }
    for (const m of sc.meshes) if (onScreen(m)) return true;
    return (S.frame + sc.slot) % 6 === 0; // off screen: ~10 Hz keeps the screen light colour alive
  }

  // ---------- dynamic resolution (auto quality only) ----------
  const dynOff = q.has('nodyn');
  function applyScale(s) {
    S.scale = s; const pr = Math.max(0.5, S.base * s);
    renderer.setPixelRatio(pr); S.set = renderer.getPixelRatio();
    if (composer && composer.setPixelRatio) composer.setPixelRatio(S.set);
    resize && resize();
  }

  function update(dt) {
    S.frame++;
    if (S.frame === 150) pruneCasters(); // catch props added after start-up
    // shadow map: ~40 Hz; skip entirely while the sun is down (night, Gulag)
    const sun = lights && lights.key ? lights.key.intensity : 1;
    S.shadowAcc += dt;
    if (S.force || (sun > 0.25 && S.shadowAcc >= 1 / 40)) { renderer.shadowMap.needsUpdate = true; S.shadowAcc = 0; S.force = false; }
    // somebody else changed the pixel ratio (quality preset) -> rebase
    if (Math.abs(renderer.getPixelRatio() - S.set) > 1e-3) { S.base = renderer.getPixelRatio(); S.set = S.base; S.scale = 1; S.force = true; }
    if (dynOff || !getQuality || getQuality() !== 'auto' || dt <= 0) return;
    S.ema += (Math.min(dt, 0.1) - S.ema) * 0.05;
    S.evalT += dt;
    if (S.evalT < 1.5) return;
    S.evalT = 0;
    const fps = 1 / S.ema;
    if (fps < 48 && S.scale > 0.61) { applyScale(Math.max(0.6, +(S.scale - 0.1).toFixed(2))); S.stableT = 0; }
    else if (fps > 58 && S.scale < 1) { S.stableT += 1.5; if (S.stableT >= 4.5) { applyScale(Math.min(1, +(S.scale + 0.1).toFixed(2))); S.stableT = 0; } }
    else S.stableT = 0;
  }

  const api = { update, screenDue, pruneCasters, forceShadow() { S.force = true; }, get scale() { return S.scale; }, stats: () => ({ pruned, scale: S.scale, screens: screens.map(s => s.meshes.length) }) };
  window.__perfApi = api;
  return api;
}
