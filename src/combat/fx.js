// combat/fx.js — pooled visual effects (instanced, built at start-up so the loading warm-up compiles them) and the
// synthesized weapon sounds (WebAudio through audio.js, no files).
//   splats (decals on walls/floor, fade), puffs (clouds / droplets / smoke, camera-facing), stars, beams (water jets),
//   flashes (muzzle / explosion, additive). Each pool is one InstancedMesh: one draw call when active, none when empty.
import * as THREE from 'three';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const Z = V(0, 0, 1);

function canvasTex(draw, n = 128) {
  const c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d'); draw(g, n);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 2; return t;
}
const splatTex = () => canvasTex((g, n) => {
  g.fillStyle = '#fff'; const c = n / 2;
  g.beginPath(); for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI * 2, r = n * (0.26 + Math.random() * 0.1); g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r); } g.fill();
  for (let i = 0; i < 9; i++) { const a = Math.random() * Math.PI * 2, d = n * (0.3 + Math.random() * 0.14), r = n * (0.03 + Math.random() * 0.05); g.beginPath(); g.arc(c + Math.cos(a) * d, c + Math.sin(a) * d, r, 0, 7); g.fill(); }
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = 'rgba(0,0,0,.18)'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(c + (Math.random() - 0.5) * n * 0.3, c + (Math.random() - 0.5) * n * 0.3, n * 0.06, 0, 7); g.fill(); }
});
const cloudTex = () => canvasTex((g, n) => {
  for (let i = 0; i < 7; i++) {
    const x = n * (0.3 + Math.random() * 0.4), y = n * (0.3 + Math.random() * 0.4), r = n * (0.16 + Math.random() * 0.14);
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.7, 'rgba(255,255,255,.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
});
const starTex = () => canvasTex((g, n) => {
  const c = n / 2; g.fillStyle = '#fff'; g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = n * 0.04; g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? n * 0.18 : n * 0.44; g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r); }
  g.closePath(); g.fill(); g.stroke();
});
const flashTex = () => canvasTex((g, n) => {
  const c = n / 2, gr = g.createRadialGradient(c, c, 0, c, c, c); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, n, n);
  g.fillStyle = 'rgba(255,255,255,.9)'; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(a - 0.12) * c * 0.95, c + Math.sin(a - 0.12) * c * 0.95); g.lineTo(c + Math.cos(a + 0.12) * c * 0.95, c + Math.sin(a + 0.12) * c * 0.95); g.fill(); }
}, 64);

// one pool = one InstancedMesh; items are plain objects, compacted into the first `count` instances every frame
class Pool {
  constructor(scene, geo, mat, n, mode) {
    const im = new THREE.InstancedMesh(geo, mat, n); im.frustumCulled = false; im.count = 0; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.castShadow = false; im.receiveShadow = false; im.renderOrder = mode === 'splat' ? 1 : 3;
    im.setColorAt(0, new THREE.Color(1, 1, 1)); im.instanceColor.setUsage(THREE.DynamicDrawUsage);
    scene.add(im); this.im = im; this.mode = mode; this.n = n; this.next = 0;
    this.items = Array.from({ length: n }, () => ({ alive: false, pos: V(), vel: V(), q: new THREE.Quaternion(), s: 1, s1: 1, sy: 1, life: 0, max: 1, col: new THREE.Color(), rot: 0, spin: 0, grav: 0, drag: 0, len: 1 }));
  }
  spawn() { // free slot, else recycle the oldest-in-ring
    for (let k = 0; k < this.n; k++) { const i = (this.next + k) % this.n; if (!this.items[i].alive) { this.next = (i + 1) % this.n; return this.items[i]; } }
    const it = this.items[this.next]; this.next = (this.next + 1) % this.n; return it;
  }
}
const _m = new THREE.Matrix4(), _s = V(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p = V();

export function createCombatFX({ scene, camera, audio }) {
  const tex = { splat: splatTex(), cloud: cloudTex(), star: starTex(), flash: flashTex() };
  const plane = new THREE.PlaneGeometry(1, 1);
  // decals: lit (night makes them darker), polygon offset against the surface
  const splatMat = new THREE.MeshStandardMaterial({ map: tex.splat, transparent: true, depthWrite: false, roughness: 0.25, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const puffMat = new THREE.MeshBasicMaterial({ map: tex.cloud, transparent: true, depthWrite: false, fog: true });
  const starMat = new THREE.MeshBasicMaterial({ map: tex.star, transparent: true, depthWrite: false, toneMapped: false });
  const flashMat = new THREE.MeshBasicMaterial({ map: tex.flash, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true); beamGeo.rotateX(Math.PI / 2); beamGeo.translate(0, 0, 0.5); // unit length along +z
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.62, depthWrite: false, toneMapped: false });
  const P = {
    splat: new Pool(scene, plane, splatMat, 140, 'splat'),
    puff: new Pool(scene, plane, puffMat, 90, 'bill'),
    star: new Pool(scene, plane, starMat, 36, 'bill'),
    flash: new Pool(scene, plane, flashMat, 10, 'bill'),
    beam: new Pool(scene, beamGeo, beamMat, 10, 'beam'),
  };
  for (const k in P) P[k].im.name = 'combat-fx-' + k;
  let night = 0;

  function splat(pos, normal, color, size = 0.5, life = 10) {
    const it = P.splat.spawn(); it.alive = true; it.pos.copy(pos).addScaledVector(normal, 0.012);
    it.q.setFromUnitVectors(Z, normal); _q2.setFromAxisAngle(Z, Math.random() * 6.28); it.q.multiply(_q2);
    it.s1 = size * (0.8 + Math.random() * 0.45); it.s = it.s1 * 0.4; it.life = 0; it.max = life; it.col.set(color);
  }
  function puff(pos, color, o = {}) {
    const it = P.puff.spawn(); it.alive = true; it.pos.copy(pos);
    const sp = o.speed ?? 0.8; it.vel.set((Math.random() - 0.5) * sp, (o.up ?? 0.4) + Math.random() * sp * 0.6, (Math.random() - 0.5) * sp);
    if (o.vel) it.vel.add(o.vel);
    it.s = (o.size ?? 0.4) * (0.7 + Math.random() * 0.6); it.s1 = it.s * (o.grow ?? 1.9); it.life = 0; it.max = (o.life ?? 0.7) * (0.75 + Math.random() * 0.5);
    it.col.set(color); it.rot = Math.random() * 6.28; it.spin = (Math.random() - 0.5) * 2; it.grav = o.grav ?? -0.2; it.drag = o.drag ?? 1.8; it.lit = o.lit !== false;
  }
  function burst(pos, color, n = 8, o = {}) { for (let i = 0; i < n; i++) puff(pos, color, o); }
  function stars(pos, n = 5, o = {}) {
    for (let i = 0; i < n; i++) {
      const it = P.star.spawn(); it.alive = true; it.pos.copy(pos);
      const a = Math.random() * 6.28; it.vel.set(Math.cos(a) * 1.6, 1.4 + Math.random() * 1.6, Math.sin(a) * 1.6);
      it.s = it.s1 = (o.size ?? 0.22) * (0.8 + Math.random() * 0.5); it.life = 0; it.max = o.life ?? 1.1; it.col.set(o.color || '#ffe23a');
      it.rot = Math.random() * 6.28; it.spin = (Math.random() - 0.5) * 8; it.grav = 5.5; it.drag = 0.8; it.lit = false; it.orbit = o.orbit ? { c: pos.clone(), a, r: 0.32, h: pos.y } : null;
    }
  }
  function flash(pos, color, size = 0.25, life = 0.06) {
    const it = P.flash.spawn(); it.alive = true; it.pos.copy(pos); it.s = it.s1 = size; it.life = 0; it.max = life; it.col.set(color); it.rot = Math.random() * 6.28; it.spin = 0; it.vel.set(0, 0, 0); it.grav = 0; it.drag = 0; it.lit = false;
  }
  function beam(a, b, color, width = 0.022, life = 0.09) {
    const it = P.beam.spawn(); it.alive = true; it.pos.copy(a); _p.copy(b).sub(a); it.len = Math.max(0.01, _p.length());
    it.q.setFromUnitVectors(Z, _p.normalize()); it.s = it.s1 = width; it.life = 0; it.max = life; it.col.set(color);
  }

  const camQ = new THREE.Quaternion();
  function update(dt, nightAmount = 0) {
    night = nightAmount;
    camera.getWorldQuaternion(camQ);
    const lit = 1 - 0.62 * night;
    for (const key in P) {
      const pool = P[key], im = pool.im; let n = 0;
      for (const it of pool.items) {
        if (!it.alive) continue;
        it.life += dt; if (it.life >= it.max) { it.alive = false; continue; }
        const u = it.life / it.max;
        if (pool.mode === 'splat') {
          const grow = Math.min(1, it.life / 0.08), fade = u > 0.8 ? 1 - (u - 0.8) / 0.2 : 1;
          const s = it.s1 * (0.4 + 0.6 * grow) * fade; _s.set(s, s, s);
          _m.compose(it.pos, it.q, _s);
        } else if (pool.mode === 'beam') {
          const w = it.s1 * (1 - u * 0.6); _s.set(w, w, it.len); _m.compose(it.pos, it.q, _s);
        } else {
          if (it.orbit) { it.orbit.a += dt * 5; it.pos.set(it.orbit.c.x + Math.cos(it.orbit.a) * it.orbit.r, it.orbit.h + Math.sin(it.life * 6) * 0.03, it.orbit.c.z + Math.sin(it.orbit.a) * it.orbit.r); }
          else {
            it.vel.multiplyScalar(Math.exp(-it.drag * dt)); it.vel.y -= it.grav * dt; it.pos.addScaledVector(it.vel, dt);
            if (it.pos.y < 0.02 && key === 'star') { it.pos.y = 0.02; it.vel.y = Math.abs(it.vel.y) * 0.4; }
          }
          it.rot += it.spin * dt;
          const s = key === 'flash' ? it.s1 * (1 + u) : key === 'star' ? it.s1 * (u > 0.75 ? 1 - (u - 0.75) / 0.25 : 1) : it.s + (it.s1 - it.s) * (1 - (1 - u) * (1 - u));
          const sc = key === 'puff' ? s * (u > 0.6 ? 1 - (u - 0.6) / 0.4 * 0.7 : 1) : s; _s.set(sc, sc, sc);
          _q2.setFromAxisAngle(Z, it.rot); _q.copy(camQ).multiply(_q2); _m.compose(it.pos, _q, _s);
        }
        im.setMatrixAt(n, _m);
        if (pool.mode === 'bill' && key === 'puff' && it.lit) { _c.copy(it.col).multiplyScalar(lit); im.setColorAt(n, _c); } else im.setColorAt(n, it.col);
        n++;
      }
      if (n || im.count) { im.count = n; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    }
  }
  const _c = new THREE.Color();
  function clear() { for (const k in P) { for (const it of P[k].items) it.alive = false; P[k].im.count = 0; } }

  // ------------------------------------------------------------ sounds (synth; distance attenuated)
  const camPos = V();
  function vol(pos, v) { if (!pos) return v; camera.getWorldPosition(camPos); const d = camPos.distanceTo(pos); return v * Math.max(0, 1 - d / 45) / (1 + d * 0.06); }
  const A = () => (audio && audio.ctx ? audio : null);
  function sfx(name, pos = null, v = 1) {
    const a = A(); if (!a) return; const k = vol(pos, v); if (k < 0.004) return; const R = a.room, r = (lo, hi) => lo + Math.random() * (hi - lo);
    try {
      switch (name) {
        case 'acqua': a.noise(0.09, 0.09 * k, r(3800, 4600), 2200, R, 0, 1.3, 'bandpass'); a.tone('sine', r(850, 1000), 520, 0.05, 0.02 * k, R); break;
        case 'tortellini': a.tone('triangle', 230, 85, 0.14, 0.13 * k, R); a.noise(0.12, 0.09 * k, 1400, 260, R); a.tone('sine', 520, 260, 0.06, 0.04 * k, R, 0.02); break;
        case 'schiuma': a.noise(0.07, 0.14 * k, 2600, 700, R, 0, 1.6, 'bandpass'); a.tone('square', 560, 1180, 0.045, 0.022 * k, R); break;
        case 'spritz': a.tone('sine', 700, 1500, 0.06, 0.11 * k, R); a.tone('sawtooth', 170, 55, 0.55, 0.08 * k, R, 0.03); a.noise(0.7, 0.14 * k, 1000, 160, R, 0.02); break;
        case 'melee': a.noise(0.2, 0.11 * k, 500, 2600, R, 0, 1.2, 'bandpass'); break;
        case 'bonk': a.tone('square', 190, 85, 0.09, 0.1 * k, R); a.noise(0.06, 0.12 * k, 1600, 400, R); break;
        case 'splat': a.noise(0.13, 0.09 * k, r(800, 1100), 160, R); a.tone('sine', r(280, 340), 110, 0.08, 0.05 * k, R); break;
        case 'drip': a.tone('sine', r(1400, 1900), r(700, 900), 0.05, 0.03 * k, R); break;
        case 'boom': a.noise(1.0, 0.36 * k, 1800, 60, R); a.tone('sine', 85, 28, 0.7, 0.28 * k, R); a.noise(1.3, 0.06 * k, 6500, 3200, R, 0.12, 1, 'highpass'); for (let i = 0; i < 6; i++) a.tone('sine', r(900, 2200), r(1800, 3200), 0.05, 0.02 * k, R, 0.15 + i * 0.09); break;
        case 'dart': a.tone('triangle', 900, 600, 0.04, 0.05 * k, R); a.noise(0.04, 0.06 * k, 3000, 1500, R, 0, 2, 'bandpass'); break;
        case 'reload': a.tone('square', 1300, 900, 0.03, 0.035 * k, R); a.noise(0.12, 0.04 * k, 2200, 900, R, 0.08, 1.2, 'bandpass'); a.tone('square', 1500, 1100, 0.03, 0.04 * k, R, 0.22); break;
        case 'reloaded': a.tone('square', 1700, 1500, 0.03, 0.05 * k, R); a.tone('square', 1100, 1000, 0.04, 0.04 * k, R, 0.06); break;
        case 'empty': a.tone('square', 2500, 2100, 0.02, 0.05 * k, R); break;
        case 'switch': a.noise(0.08, 0.05 * k, 1800, 600, R, 0, 1, 'bandpass'); a.tone('triangle', 600, 900, 0.05, 0.03 * k, R, 0.04); break;
        case 'hit': a.tone('sine', 1850, 1750, 0.035, 0.05 * k, R); break;
        case 'head': a.tone('sine', 2400, 2300, 0.05, 0.06 * k, R); a.tone('triangle', 1200, 1200, 0.06, 0.03 * k, R, 0.03); break;
        case 'kill': a.tone('sine', 880, 880, 0.08, 0.06 * k, R); a.tone('sine', 1320, 1320, 0.14, 0.05 * k, R, 0.07); break;
        case 'hurt': a.tone('sawtooth', 210, 90, 0.2, 0.07 * k, R); a.noise(0.15, 0.07 * k, 900, 200, R); break;
        case 'poof': a.noise(0.45, 0.12 * k, 2400, 260, R); a.tone('sine', 420, 160, 0.25, 0.05 * k, R); break;
        case 'groan': { const f = r(85, 135); a.tone('sawtooth', f, f * 0.6, r(0.6, 1.0), 0.05 * k, R); a.noise(0.8, 0.035 * k, 700, 160, R, 0.05, 2, 'bandpass'); break; }
        case 'zdie': a.tone('sawtooth', 170, 55, 0.7, 0.07 * k, R); a.noise(0.5, 0.05 * k, 900, 120, R, 0.1); break;
        case 'swing': a.noise(0.25, 0.07 * k, 400, 1400, R, 0, 1.4, 'bandpass'); break;
        case 'coo': for (let i = 0; i < 3; i++) a.tone('sine', r(380, 460), r(300, 340), 0.12, 0.035 * k, R, i * 0.15); break;
        case 'squawk': a.tone('square', 900, 1700, 0.08, 0.04 * k, R); a.tone('square', 1500, 700, 0.12, 0.035 * k, R, 0.08); a.noise(0.2, 0.05 * k, 3000, 1500, R, 0, 1.5, 'bandpass'); break;
        case 'whistle': for (let i = 0; i < 5; i++) a.tone('sine', 2850 + (i % 2) * 220, 2900, 0.09, 0.07 * k, R, i * 0.08); a.tone('sine', 2900, 2700, 0.45, 0.06 * k, R, 0.42); break;
        case 'ko': for (let i = 0; i < 4; i++) a.tone('triangle', 420 - i * 70, 380 - i * 80, i === 3 ? 0.7 : 0.26, 0.09, R, i * 0.3); break;
        case 'respawn': a.tone('sine', 520, 1040, 0.3, 0.06, R); a.tone('sine', 780, 1560, 0.3, 0.04, R, 0.12); break;
        case 'boss': a.tone('sawtooth', 70, 50, 1.4, 0.1 * k, R); a.noise(1.2, 0.08 * k, 400, 80, R); break;
      }
    } catch (e) { }
  }
  return { splat, puff, burst, stars, flash, beam, update, clear, sfx, pools: P };
}
