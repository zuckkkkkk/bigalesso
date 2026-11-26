// motor/rig.js — the visual Fiat 500 (assets/models/fiat500.glb, the one the quartiere already loads for the parked
// cars). Every car (yours, the friends' parked ones, race bots, ghosts, other players online) is a rig built at
// startup (so the preload + graphics warm-up compile everything once): body with a paint/livery shader (one program
// for all cars: the paint only touches the cream bodywork of the texture), rims (one InstancedMesh per style for all
// cars, they spin), spoiler, exhausts, neon underglow (unlit additive strip, NO real lights), number plate.
// look = { paint:'#rrggbb'|null, livery:0..4, livery2:'#rrggbb', rims:0..3, spoiler:0..2, exhaust:0..2, neon:null|'#rrggbb', plate:'BO 281' }
import * as THREE from 'three';
import { loadOptional, bakeGeometry } from '../quartiere/models.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const CAR = { halfW: 0.76, halfL: 1.48, height: 1.43, wheelX: 0.69, wheelY: 0.24, wheelZ: 0.89, rimR: 0.16, wheelR: 0.25 };
export const DEFAULT_LOOK = { paint: null, livery: 0, livery2: '#ffffff', rims: 0, spoiler: 0, exhaust: 0, neon: null, plate: 'BO 281ZK' };
const MAX_CARS = 14;

// ------------------------------------------------------------------ paint shader (patched MeshStandardMaterial)
function paintable(base) {
  const mat = base.clone();
  const U = { uPaint: { value: new THREE.Color(1, 1, 1) }, uPaintK: { value: 0 }, uLiv: { value: new THREE.Color(1, 1, 1) }, uLivT: { value: 0 } };
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vMP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvMP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vMP;\nuniform vec3 uPaint; uniform float uPaintK; uniform vec3 uLiv; uniform float uLivT;')
      .replace('#include <map_fragment>', `#include <map_fragment>
  {
    vec3 c0 = diffuseColor.rgb;
    float lum = dot(c0, vec3(0.299, 0.587, 0.114));
    float warm = (c0.r + c0.g) * 0.5 - c0.b;
    // the cream bodywork of the 500 texture: bright and slightly yellow (glass, rubber, chrome are grey)
    float m = smoothstep(0.40, 0.58, lum) * smoothstep(0.01, 0.05, warm);
    float sh = clamp(lum / 0.78, 0.0, 1.25);
    float ax = abs(vMP.x), lv = 0.0;
    if (uLivT > 0.5 && uLivT < 1.5) lv = step(0.055, ax) * step(ax, 0.16);                                  // racing stripes
    else if (uLivT > 1.5 && uLivT < 2.5) lv = step(0.40, vMP.y) * step(vMP.y, 0.53);                       // side band
    else if (uLivT > 2.5 && uLivT < 3.5) lv = mod(floor(vMP.x * 5.0 + 50.0) + floor(vMP.z * 5.0 + 50.0) + floor(vMP.y * 5.0 + 50.0), 2.0); // checkers
    else if (uLivT > 3.5) { float f = 0.30 + 0.09 * sin(vMP.z * 17.0) + 0.24 * clamp(vMP.z + 0.25, 0.0, 1.4); lv = step(vMP.y, f) * step(-0.55, vMP.z) * step(0.5, ax); } // flames
    vec3 tgt = mix(uPaint * sh, uLiv * sh, lv);
    diffuseColor.rgb = mix(c0, tgt, m * clamp(max(uPaintK, lv), 0.0, 1.0));
  }`);
  };
  mat.customProgramCacheKey = () => 'motorPaint1';
  return { mat, U };
}

function plateTexture(text) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 32; const x = c.getContext('2d');
  x.fillStyle = '#f4f4f0'; x.fillRect(0, 0, 128, 32); x.fillStyle = '#1d4fd6'; x.fillRect(0, 0, 14, 32); x.fillRect(114, 0, 14, 32);
  x.fillStyle = '#ffd83a'; x.beginPath(); x.arc(7, 9, 3, 0, 6.3); x.fill();
  x.fillStyle = '#111'; x.font = '900 21px "Arial Narrow",Arial,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(String(text || '').toUpperCase().slice(0, 8), 64, 17);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 2; return t;
}
function rimTexture(style) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const C = 32;
  x.fillStyle = '#111'; x.fillRect(0, 0, 64, 64);
  const col = ['#c9ccd1', '#f2c230', '#1a1a1e', '#d8dde4'][style] || '#c9ccd1';
  x.fillStyle = col; x.beginPath(); x.arc(C, C, 30, 0, 6.3); x.fill();
  x.fillStyle = '#16161a';
  if (style === 0) { for (let i = 0; i < 4; i++) { x.beginPath(); x.arc(C + Math.cos(i * 1.57 + 0.78) * 15, C + Math.sin(i * 1.57 + 0.78) * 15, 5, 0, 6.3); x.fill(); } } // stock steel
  else if (style === 1) { for (let i = 0; i < 5; i++) { x.save(); x.translate(C, C); x.rotate(i * 1.2566); x.fillRect(-3, 6, 6, 22); x.restore(); } x.fillStyle = col; x.beginPath(); x.arc(C, C, 9, 0, 6.3); x.fill(); } // 5-spoke gold
  else if (style === 2) { x.strokeStyle = '#d8203a'; x.lineWidth = 3; x.beginPath(); x.arc(C, C, 27, 0, 6.3); x.stroke(); for (let i = 0; i < 8; i++) { x.save(); x.translate(C, C); x.rotate(i * 0.785); x.fillStyle = '#2b2b30'; x.fillRect(-2, 4, 4, 22); x.restore(); } } // black racing
  else { for (let i = 0; i < 16; i++) { x.save(); x.translate(C, C); x.rotate(i * 0.3927); x.fillStyle = '#9aa1aa'; x.fillRect(-0.8, 6, 1.6, 23); x.restore(); } } // chrome wire (spokes)
  x.fillStyle = '#2b2b30'; x.beginPath(); x.arc(C, C, 4, 0, 6.3); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ------------------------------------------------------------------ factory
export function createCarFactory(scene) {
  const root = new THREE.Group(); root.name = 'motorCars'; scene.add(root);
  const F = { ready: false, rigs: [], bodyGeo: null, bodyMat: null };
  // a procedural stand-in until (or if) the model loads: a rounded box the size of the 500
  const fallbackGeo = (() => { const g = new THREE.BoxGeometry(CAR.halfW * 2, 0.85, CAR.halfL * 2, 1, 1, 1); g.translate(0, 0.55, 0); const r = new THREE.BoxGeometry(CAR.halfW * 1.7, 0.5, CAR.halfL * 1.1); r.translate(0, 1.15, -0.15); return mergeSimple([g, r]); })();
  const fallbackMat = new THREE.MeshStandardMaterial({ color: 0xece4c8, roughness: 0.45, metalness: 0.1 });
  // rims: one InstancedMesh per style, MAX_CARS*4 slots, zero-scale when unused
  const rimGeo = new THREE.CylinderGeometry(CAR.rimR, CAR.rimR, 0.03, 18, 1); rimGeo.rotateZ(Math.PI / 2);
  const rimIMs = [0, 1, 2, 3].map(s => {
    const m = new THREE.MeshStandardMaterial({ map: rimTexture(s), roughness: s === 2 ? 0.5 : 0.25, metalness: s === 2 ? 0.2 : 0.85 });
    const im = new THREE.InstancedMesh(rimGeo, m, MAX_CARS * 4); im.name = 'motorRims' + s; im.frustumCulled = false; im.castShadow = false;
    const z = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < MAX_CARS * 4; i++) im.setMatrixAt(i, z); root.add(im); return im;
  });
  const spoilerGeo = [null, (() => { const a = new THREE.BoxGeometry(1.1, 0.05, 0.28); a.translate(0, 1.34, -1.24); const b = new THREE.BoxGeometry(0.05, 0.12, 0.12); b.translate(-0.4, 1.28, -1.2); const c = b.clone(); c.translate(0.8, 0, 0); return mergeSimple([a, b, c]); })(),
    (() => { const a = new THREE.BoxGeometry(1.36, 0.05, 0.34); a.translate(0, 1.0, -1.62); const b = new THREE.BoxGeometry(0.06, 0.34, 0.1); b.translate(-0.55, 0.82, -1.52); const c = b.clone(); c.translate(1.1, 0, 0); return mergeSimple([a, b, c]); })()];
  const spoilerMat = new THREE.MeshStandardMaterial({ color: 0x15151a, roughness: 0.35, metalness: 0.4 });
  const pipeGeo = [null, (() => { const p = new THREE.CylinderGeometry(0.045, 0.045, 0.22, 10); p.rotateX(Math.PI / 2); p.translate(0.42, 0.22, -1.5); return p; })(),
    (() => { const ps = []; for (const x of [-0.5, -0.36, 0.36, 0.5]) { const p = new THREE.CylinderGeometry(0.04, 0.05, 0.24, 10); p.rotateX(Math.PI / 2); p.translate(x, 0.22, -1.52); ps.push(p); } return mergeSimple(ps); })()];
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.2, metalness: 1.0 });
  const glowGeo = new THREE.PlaneGeometry(CAR.halfW * 2.5, CAR.halfL * 2.4); glowGeo.rotateX(-Math.PI / 2); glowGeo.translate(0, 0.03, 0);
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 4, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.55, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); return t; })();
  const plateGeo = new THREE.PlaneGeometry(0.42, 0.105); plateGeo.rotateY(Math.PI); plateGeo.translate(0, 0.42, -CAR.halfL - 0.012);

  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e3 = new THREE.Euler(), p3 = V(), s3 = V(1, 1, 1), zero = new THREE.Matrix4().makeScale(0, 0, 0);

  function make(look = DEFAULT_LOOK, name = 'car') {
    const idx = F.rigs.length; if (idx >= MAX_CARS) throw new Error('troppe macchine');
    const g = new THREE.Group(); g.name = 'motor-' + name; g.visible = false; root.add(g);
    const susp = new THREE.Group(); g.add(susp);
    const { mat, U } = paintable(F.bodyMat || fallbackMat);
    const body = new THREE.Mesh(F.bodyGeo || fallbackGeo, mat); body.castShadow = true; body.receiveShadow = true; susp.add(body);
    const spoiler = new THREE.Mesh(spoilerGeo[1], spoilerMat); spoiler.visible = false; spoiler.castShadow = true; susp.add(spoiler);
    const pipes = new THREE.Mesh(pipeGeo[1], pipeMat); pipes.visible = false; susp.add(pipes);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x3cf0ff, map: glowTex, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const glow = new THREE.Mesh(glowGeo, glowMat); glow.visible = false; glow.renderOrder = 3; g.add(glow);
    const plateMat = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.2, map: plateTexture(look.plate) });
    const plate = new THREE.Mesh(plateGeo, plateMat); susp.add(plate);
    const rig = {
      idx, name, group: g, susp, body, U, look: { ...DEFAULT_LOOK }, spin: 0, pitch: 0, roll: 0, bob: 0, bobV: 0, plateText: look.plate, ghost: false,
      setLook(L) {
        L = { ...DEFAULT_LOOK, ...(L || {}) }; this.look = L;
        if (L.paint) { U.uPaint.value.set(L.paint); U.uPaintK.value = 1; } else U.uPaintK.value = 0;
        U.uLiv.value.set(L.livery2 || '#ffffff'); U.uLivT.value = L.livery | 0;
        spoiler.visible = (L.spoiler | 0) > 0; if (spoiler.visible) spoiler.geometry = spoilerGeo[L.spoiler | 0] || spoilerGeo[1];
        pipes.visible = (L.exhaust | 0) > 0; if (pipes.visible) pipes.geometry = pipeGeo[L.exhaust | 0] || pipeGeo[1];
        glow.visible = !!L.neon && g.visible; glowMat.color.set(L.neon || '#3cf0ff'); this.neon = !!L.neon;
        if ((L.plate || '') !== this.plateText) { this.plateText = L.plate; const old = plateMat.map; plateMat.map = plateTexture(L.plate); plateMat.needsUpdate = false; old && old.dispose(); }
      },
      show(v) { g.visible = !!v; glow.visible = !!v && !!this.neon; if (!v) for (let w = 0; w < 4; w++) for (const im of rimIMs) im.setMatrixAt(idx * 4 + w, zero), im.instanceMatrix.needsUpdate = true; },
      // place the car: ground position + heading, speed (wheel spin), accel / yaw rate (body pitch / roll), dt
      pose(x, z, yaw, v = 0, acc = 0, yawRate = 0, dt = 0.016, bump = 0) {
        g.position.set(x, 0, z); g.rotation.set(0, yaw, 0);
        const k = 1 - Math.exp(-dt * 7);
        this.pitch += (Math.max(-0.05, Math.min(0.05, -acc * 0.006)) - this.pitch) * k;
        this.roll += (Math.max(-0.06, Math.min(0.06, -yawRate * v * 0.0035)) - this.roll) * k;
        if (bump) this.bobV += bump;
        this.bobV += (-this.bob * 160 - this.bobV * 14) * dt; this.bob += this.bobV * dt; this.bob = Math.max(-0.06, Math.min(0.08, this.bob));
        susp.position.y = this.bob; susp.rotation.set(this.pitch, 0, this.roll);
        this.spin = (this.spin + v * dt / CAR.wheelR) % (Math.PI * 2);
        if (!g.visible) return;
        g.updateMatrixWorld(true);
        const st = this.look.rims | 0;
        for (let w = 0; w < 4; w++) {
          const sx = w & 1 ? 1 : -1, sz = w & 2 ? 1 : -1;
          p3.set(sx * CAR.wheelX, CAR.wheelY, sz * CAR.wheelZ).applyMatrix4(g.matrixWorld);
          q4.setFromEuler(e3.set(sx > 0 ? this.spin : -this.spin, yaw, 0, 'YXZ'));
          m4.compose(p3, q4, s3);
          for (let s = 0; s < rimIMs.length; s++) { rimIMs[s].setMatrixAt(idx * 4 + w, s === st ? m4 : zero); rimIMs[s].instanceMatrix.needsUpdate = true; }
        }
      },
    };
    rig.setLook(look);
    F.rigs.push(rig);
    return rig;
  }

  // swap the stand-in for the real model as soon as it is loaded (preload loads it for the parked cars anyway)
  F.loaded = loadOptional('fiat500').then(sc => {
    if (!sc) return false;
    sc.updateMatrixWorld(true); let mesh = null; sc.traverse(o => { if (!mesh && o.isMesh) mesh = o; }); if (!mesh) return false;
    F.bodyGeo = bakeGeometry(mesh.geometry, mesh.matrixWorld.clone()); F.bodyMat = mesh.material;
    for (const r of F.rigs) { const { mat, U } = paintable(F.bodyMat); const old = r.body.material; r.body.material = mat; r.body.geometry = F.bodyGeo; Object.assign(r.U, {}); r.U.uPaint = U.uPaint; r.U.uPaintK = U.uPaintK; r.U.uLiv = U.uLiv; r.U.uLivT = U.uLivT; old.dispose(); r.setLook(r.look); }
    F.ready = true; return true;
  }).catch(e => { console.warn('motor: fiat500', e); return false; });
  F.make = make; F.root = root;
  return F;
}

function mergeSimple(geos) {
  // tiny merge (position/normal/uv, non-indexed) — avoids pulling BufferGeometryUtils just for 3 boxes
  const parts = geos.map(g => (g.index ? g.toNonIndexed() : g));
  const out = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv']) {
    const size = parts[0].attributes[k].itemSize, n = parts.reduce((a, g) => a + g.attributes[k].count, 0), arr = new Float32Array(n * size);
    let o = 0; for (const g of parts) { arr.set(g.attributes[k].array, o); o += g.attributes[k].array.length; }
    out.setAttribute(k, new THREE.BufferAttribute(arr, size));
  }
  return out;
}
