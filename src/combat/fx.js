// combat/fx.js — combat visual effects on the GPU particle engine (src/particles.js: pooled ring buffers, one draw
// call per family, simulated in the vertex shader, one program compiled at install) + the synthesized weapon sounds
// (WebAudio through audio.js, no files).
// Legacy API (unchanged signatures): splat (decals on walls/floor, fade), puff / burst (clouds, droplets, smoke),
//   stars (comic stars, bounce or orbit), flash (muzzle / explosion, additive), beam (water jets), update, clear, sfx.
// New: explode(pos, opts), impact(pos, normal, kind), hit(pos, dir, opts), muzzle(pos, dir, base), casing, tracer,
//   poof, feathers, zombieSpawn, bossEntrance, bossDeath, police — the same functions as window.__particles.
import * as THREE from 'three';
import { installParticles, SH, MODE } from '../particles.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _c = new THREE.Color();
const rgbOf = c => { if (c && c.isColor) return c; try { _c.set(c == null ? '#ffffff' : c); } catch (e) { _c.setRGB(1, 1, 1); } return _c; };

export function createCombatFX({ scene, camera, audio }) {
  const P = installParticles({ scene, camera });
  const S = P.spec(); // the engine's reusable spawn spec (filled, then P.emit(system, S))

  // decal on a surface (normal), grows in ~0.08 s, fades at the end; lit (darker at night)
  function splat(pos, normal, color, size = 0.5, life = 10) {
    if (!pos) return;
    P.spec(); const c = rgbOf(color), n = normal || UP;
    S.x = pos.x; S.y = pos.y; S.z = pos.z; S.vx = n.x; S.vy = n.y; S.vz = n.z; S.mode = MODE.plane; S.shape = SH.splat;
    S.s1 = size * (0.8 + Math.random() * 0.45); S.s0 = S.s1 * 0.4; S.sc = Math.max(4, life / 0.08 * 0.6); S.life = life;
    S.r0 = S.r1 = c.r; S.g0 = S.g1 = c.g; S.b0 = S.b1 = c.b; S.a0 = S.a1 = 0.92; S.lit = 2; S.add = 0; // lit 2: as dark as the wall at night
    P.emit('decal', S);
  }
  // camera-facing cloud; o: { speed, up, vel, size, grow, life, grav (down +), drag, lit }
  function puff(pos, color, o = {}) {
    if (!pos) return;
    P.spec(); const c = rgbOf(color), sp = o.speed ?? 0.8;
    S.x = pos.x; S.y = pos.y; S.z = pos.z;
    S.vx = (Math.random() - 0.5) * sp; S.vy = (o.up ?? 0.4) + Math.random() * sp * 0.6; S.vz = (Math.random() - 0.5) * sp;
    if (o.vel) { S.vx += o.vel.x; S.vy += o.vel.y; S.vz += o.vel.z; }
    S.s0 = (o.size ?? 0.4) * (0.7 + Math.random() * 0.6); S.s1 = S.s0 * (o.grow ?? 1.9); S.sc = 2;
    S.life = (o.life ?? 0.7) * (0.75 + Math.random() * 0.5); S.g = o.grav ?? -0.2; S.k = o.drag ?? 1.8;
    S.r0 = S.r1 = c.r; S.g0 = S.g1 = c.g; S.b0 = S.b1 = c.b; S.a0 = 0.95; S.a1 = 0; S.cc = 2.2;
    S.spin = (Math.random() - 0.5) * 2; S.lit = o.lit === false ? 0 : 1; S.add = 0; S.shape = SH.smoke; S.fadeIn = 0.02;
    P.emit('smoke', S);
  }
  function burst(pos, color, n = 8, o = {}) { for (let i = 0; i < n; i++) puff(pos, color, o); }
  // comic stars: fly up, fall, bounce; o.orbit = circle around pos (K.O.)
  function stars(pos, n = 5, o = {}) {
    if (!pos) return;
    const c = rgbOf(o.color || '#ffe23a'), r = c.r * 1.3, g = c.g * 1.3, b = c.b * 1.3;
    for (let i = 0; i < n; i++) {
      P.spec(); const a = Math.random() * 6.283;
      S.x = pos.x; S.y = pos.y; S.z = pos.z; S.shape = SH.star; S.s0 = S.s1 = (o.size ?? 0.22) * (0.8 + Math.random() * 0.5);
      S.life = o.life ?? 1.1; S.r0 = S.r1 = r; S.g0 = S.g1 = g; S.b0 = S.b1 = b; S.a0 = S.a1 = 1; S.add = 0.15; S.spin = (Math.random() - 0.5) * 8;
      if (o.orbit) { S.mode = MODE.orbit; S.vx = 0.32; S.vy = 5; S.vz = a + i * 6.283 / n; S.spin = 3; }
      else { S.vx = Math.cos(a) * 1.6; S.vy = 1.4 + Math.random() * 1.6; S.vz = Math.sin(a) * 1.6; S.g = 5.5; S.k = 0.8; S.G = 0.02; S.rest = 0.4; }
      P.emit('glow', S);
    }
  }
  // additive flash (grows x2 over its life)
  function flash(pos, color, size = 0.25, life = 0.06) {
    if (!pos) return;
    const c = rgbOf(color), r = c.r, g = c.g, b = c.b;
    P.spec(); S.x = pos.x; S.y = pos.y; S.z = pos.z; S.shape = SH.glow; S.s0 = size * 1.1; S.s1 = size * 2.3; S.life = life;
    S.r0 = r * 3.2; S.g0 = g * 3.2; S.b0 = b * 3.2; S.a0 = 1; S.r1 = r * 2; S.g1 = g * 2; S.b1 = b * 2; S.a1 = 0; P.emit('glow', S);
    P.spec(); S.x = pos.x; S.y = pos.y; S.z = pos.z; S.shape = SH.burst; S.s0 = size * 0.8; S.s1 = size * 1.7; S.life = life * 0.9;
    S.r0 = r * 2.4; S.g0 = g * 2.4; S.b0 = b * 2.4; S.a0 = 1; S.r1 = r; S.g1 = g; S.b1 = b; S.a1 = 0; S.add = 0.9; P.emit('glow', S);
  }
  // water jet / beam from a to b (camera-facing ribbon, thins out)
  function beam(a, b, color, width = 0.022, life = 0.09) {
    if (!a || !b) return;
    const c = rgbOf(color);
    P.spec(); S.x = a.x; S.y = a.y; S.z = a.z; S.vx = b.x - a.x; S.vy = b.y - a.y; S.vz = b.z - a.z; S.mode = MODE.segment; S.shape = SH.glow;
    S.s0 = width * 3.2; S.s1 = width * 1.3; S.life = life; S.r0 = c.r * 1.8; S.g0 = c.g * 1.8; S.b0 = c.b * 1.8; S.a0 = 0.9; S.r1 = c.r * 1.4; S.g1 = c.g * 1.4; S.b1 = c.b * 1.4; S.a1 = 0.2; S.add = 0.55;
    P.emit('glow', S);
  }
  const UP = V(0, 1, 0);
  function update(dt, nightAmount = 0) { P.update(dt, nightAmount); }
  function clear() { P.clear(); }

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
  return {
    splat, puff, burst, stars, flash, beam, update, clear, sfx, pools: P.systems,
    explode: P.explode, impact: P.impact, hit: P.hit, muzzle: P.muzzle, casing: P.casing, tracer: P.tracer, poof: P.poof, feathers: P.feathers,
    zombieSpawn: P.zombieSpawn, bossEntrance: P.bossEntrance, bossDeath: P.bossDeath, police: P.police, crash: P.crash, particles: P,
  };
}
