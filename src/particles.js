// particles.js — GPU particle engine + effect library (explosions, impacts, gunfire, enemies, cars, ambient).
//
// Engine: three fixed-capacity ring buffers ("systems"), each ONE instanced quad mesh = one draw call while something
// is alive, zero when idle. Every particle is written once at spawn (32 floats: start position/time, velocity/life,
// sizes, two colours, gravity/drag/ground/bounce, shape/mode/additive/lit, stretch/fade/curves) and then simulated
// analytically in the vertex shader (drag + gravity, up to 2 ground bounces, wind, orbit), so the CPU cost per frame is
// a uniform update plus one bufferSubData of the slots written this frame. No allocations per frame.
//   decal  (renderOrder 1, polygon offset): scorch marks, stains, cracks, paint splats
//   smoke  (renderOrder 2): smoke, dust, mist, exhaust, tyre smoke
//   glow   (renderOrder 3): flashes, fire, sparks, tracers, debris, confetti, casings, comic stars
// Blending is premultiplied (ONE, ONE_MINUS_SRC_ALPHA) with a per-particle "additive" amount: 1 = pure glow (adds
// light, never darkens: reads at night), 0 = normal alpha (smoke, debris); fire sits in between so it still occludes
// a bright daylight sky. Glow comes from HDR colours + the existing bloom pass: NO lights, ever.
// The material is a RawShaderMaterial: its program key does not depend on the light count, fog, tone mapping or
// render target, so the single program is compiled once at install and nothing ever compiles mid-game
// (window.__particles.stats().programs). NaN-safe: every pow/sqrt/division is clamped.
//
// API (window.__particles, also re-exported by combat/fx.js as fx.explode / fx.impact / …):
//   explode(pos, {radius, kind:'fire'|'spritz'|'sugo'|'acqua'|'schiuma'|'boss'|'car', ground, shake, decal})
//   impact(pos, normal, kind 'acqua'|'sugo'|'schiuma'|'spritz'|'spark'|'dust', {ground})
//   hit(pos, dir, {element, head, crit, kill, color})       comic blood-less hit burst on enemies (confetti, tortellini)
//   muzzle(pos, dir, base) · casing(pos, dir, base, groundY) · tracer(a, b, color)
//   poof(pos, scale) · feathers(pos) · zombieSpawn(pos) · bossEntrance(pos) · bossDeath(pos) · police(pos, n)
//   exhaust(state, x, y, z, fx, fz, vx, vz, thr, dt) · nitro(state, x, y, z, fx, fz, vx, vz, dt)
//   tyreSmoke(state, x, z, vx, vz, k, dt) · dirt(state, x, z, vx, vz, k, dt) · crash(pos, dirX, dirZ, speed)
//   emit(system 'glow'|'smoke'|'decal', spec) raw spawn · spec() a reset spec · clear() · stats() · quality()
// Quality: counts scale with the preset (low 0.45 · medium 0.75 · high 1 · ultra 1.25), phones get the low budget
// (smaller buffers too); far effects are thinned, beyond 130 m skipped.
import * as THREE from 'three';
import { currentQuality } from './scene.js';
import { NETTUNO } from './quartiere/nord_layout.js';

const STRIDE = 32;
const ATTRS = ['aPos', 'aVel', 'aSize', 'aCol0', 'aCol1', 'aPhys', 'aMisc', 'aExtra'];
export const SH = { glow: 0, smoke: 1, fire: 2, spark: 3, star: 4, burst: 5, ring: 6, splat: 7, tortellino: 8, confetti: 9, chunk: 10, drop: 11, orange: 12, ice: 13, crack: 14, cap: 15 };
export const MODE = { bill: 0, streak: 1, ground: 2, tumble: 3, plane: 4, segment: 5, orbit: 6 };
const NOGROUND = -1e4;

const VERT = /* glsl */`
precision highp float;
precision highp int;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uTime;
uniform float uClear;
uniform vec3 uLight;
uniform vec3 uWind;
in vec3 position;
in vec4 aPos;
in vec4 aVel;
in vec4 aSize;
in vec4 aCol0;
in vec4 aCol1;
in vec4 aPhys;
in vec4 aMisc;
in vec4 aExtra;
out vec2 vUv;
out vec4 vCol;
out float vAdd;
out float vDepth;
vec3 rotAxis(vec3 v, vec3 a, float c, float s) { return v * c + cross(a, v) * s + a * (dot(a, v) * (1.0 - c)); }
void main() {
  vUv = vec2(0.5); vCol = vec4(0.0); vAdd = 0.0; vDepth = 0.0;
  float life = aVel.w;
  float age = uTime - aPos.w;
  if (life <= 0.0 || age < 0.0 || age >= life || aPos.w < uClear) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
  float u = clamp(age / life, 0.0, 1.0);
  int mode = int(aMisc.y + 0.5);
  float g = aPhys.x, k = aPhys.y, G = aPhys.z, rest = aPhys.w;
  float lit = clamp(aMisc.w, 0.0, 1.0), lit2 = clamp(aMisc.w - 1.0, 0.0, 1.0); // lit 0..1 ambient, 1..2 ambient² (decals: as dark as the surface at night)
  vec3 p = aPos.xyz, v = aVel.xyz;
  float tr = age;
  if (mode == 6) {                                   // orbit around p: aVel = (radius, angular speed, phase)
    float a = aVel.z + aVel.y * age;
    p += vec3(cos(a) * aVel.x, sin(age * 6.0) * 0.03, sin(a) * aVel.x);
    v = vec3(0.0);
  } else if (mode == 4 || mode == 5) {               // static: aVel.xyz = plane normal / segment vector
  } else if (rest >= 0.0 && g > 0.05) {              // ballistic with 2 ground bounces, horizontal drag + friction
    float h = max(p.y - G, 0.0);
    float t1 = (v.y + sqrt(max(v.y * v.y + 2.0 * g * h, 0.0))) / g;
    float vb = rest * abs(v.y - g * t1);
    float t2 = t1 + 2.0 * vb / g;
    float vb2 = vb * rest;
    float t3 = t2 + 2.0 * vb2 / g;
    float y; float vy;
    if (age < t1) { y = p.y + v.y * age - 0.5 * g * age * age; vy = v.y - g * age; }
    else if (age < t2) { float q = age - t1; y = G + vb * q - 0.5 * g * q * q; vy = vb - g * q; }
    else if (age < t3) { float q = age - t2; y = G + vb2 * q - 0.5 * g * q * q; vy = vb2 - g * q; }
    else { y = G; vy = 0.0; tr = t3; }
    float kh = max(k, 0.001);
    float e1 = exp(-kh * min(age, t1));
    vec2 vh = v.xz;
    vec2 d = vh * ((1.0 - e1) / kh);
    vec2 vh1 = vh * e1;
    if (age > t1) { float kg = kh + 4.0; float q = age - t1; float e2 = exp(-kg * q); vec2 vg = vh1 * 0.55; d += vg * ((1.0 - e2) / kg); vh1 = vg * e2; }
    p = vec3(p.x + d.x, max(y, G), p.z + d.y);
    v = vec3(vh1.x, vy, vh1.y);
  } else {                                           // drag + gravity (negative = buoyancy), exact
    vec3 acc = vec3(0.0, -g, 0.0);
    if (k > 0.001) { float e = exp(-k * age); float f = (1.0 - e) / k; p += v * f + acc * ((age - f) / k); v = v * e + acc * ((1.0 - e) / k); }
    else { p += v * age + acc * (0.5 * age * age); v += acc * age; }
    float drift = lit * (1.0 - clamp(g / 3.0, 0.0, 1.0)); // light lit particles (smoke, dust) drift with the wind
    float sd = aSize.z * 7.31;
    p += drift * (uWind * age + vec3(sin(age * 1.3 + sd), 0.0, cos(age * 1.1 + sd * 1.7)) * (0.22 * min(age, 1.5)));
    p.y = max(p.y, G);
  }
  float su = 1.0 - pow(max(1.0 - u, 0.0), max(aExtra.z, 0.05));
  float size = max(mix(aSize.x, aSize.y, su), 0.0);
  vec4 col = mix(aCol0, aCol1, pow(u, max(aExtra.w, 0.05)));
  col.a *= (aExtra.y > 0.0 ? clamp(age / aExtra.y, 0.0, 1.0) : 1.0) * (1.0 - smoothstep(0.82, 1.0, u)); // no fade-in: visible from its first frame
  col.rgb *= mix(vec3(1.0), uLight, lit) * mix(vec3(1.0), uLight, lit2);
  float rot = aSize.z + aSize.w * tr;
  float cs = cos(rot), sn = sin(rot);
  vec2 c = position.xy;
  vec2 q = c + 0.5;
  vec4 mv;
  if (mode == 1) {                                   // streak: stretched along the screen-space velocity, head at p
    mv = modelViewMatrix * vec4(p, 1.0);
    vec3 vv = mat3(modelViewMatrix) * v;
    float L = length(vv.xy);
    vec2 ax = L > 1e-5 ? vv.xy / L : vec2(0.0, 1.0);
    vec2 pr = vec2(-ax.y, ax.x);
    float len = size + L * max(aExtra.x, 0.0);
    mv.xy += ax * (c.y * len - 0.5 * (len - size)) + pr * (c.x * size);
  } else if (mode == 2) {                            // flat on the ground
    vec3 o = vec3(c.x * cs - c.y * sn, 0.0, c.x * sn + c.y * cs) * size;
    mv = modelViewMatrix * vec4(p + o + vec3(0.0, 0.015, 0.0), 1.0);
  } else if (mode == 3) {                            // tumbling 3D card (confetti, debris, casings)
    vec3 ax = vec3(sin(aSize.z * 3.1), cos(aSize.z * 1.7), sin(aSize.z * 5.3) + 0.3);
    float al = length(ax); ax = al > 1e-4 ? ax / al : vec3(0.0, 1.0, 0.0);
    vec3 e1 = rotAxis(vec3(1.0, 0.0, 0.0), ax, cs, sn), e2 = rotAxis(vec3(0.0, 1.0, 0.0), ax, cs, sn);
    vec3 nr = cross(e1, e2);
    col.rgb *= mix(1.0, 0.45 + 0.75 * abs(dot(nr, vec3(0.32, 0.9, 0.3))), lit);
    mv = modelViewMatrix * vec4(p + (e1 * c.x + e2 * c.y) * size, 1.0);
  } else if (mode == 4) {                            // plane facing aVel.xyz (wall decals, impact rings)
    float ln = length(v);
    vec3 n = ln > 1e-5 ? v / ln : vec3(0.0, 1.0, 0.0);
    vec3 rf = abs(n.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 ta = cross(rf, n); float tl = length(ta); ta = tl > 1e-5 ? ta / tl : vec3(1.0, 0.0, 0.0);
    vec3 tb = cross(n, ta);
    vec3 a1 = ta * cs + tb * sn, a2 = tb * cs - ta * sn;
    mv = modelViewMatrix * vec4(p + n * 0.012 + (a1 * c.x + a2 * c.y) * size, 1.0);
  } else if (mode == 5) {                            // camera-facing ribbon from p to p + aVel.xyz (beams)
    vec4 va = modelViewMatrix * vec4(p, 1.0), vb = modelViewMatrix * vec4(p + v, 1.0);
    mv = mix(va, vb, q.y);
    vec2 d = vb.xy - va.xy; float L = length(d);
    vec2 ax = L > 1e-5 ? d / L : vec2(0.0, 1.0);
    mv.xy += vec2(-ax.y, ax.x) * (c.x * size);
    q.y = 0.5;
  } else {                                           // billboard (+ orbit)
    mv = modelViewMatrix * vec4(p, 1.0);
    mv.xy += vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs) * size;
  }
  if (!(abs(mv.x) < 1e5 && abs(mv.y) < 1e5 && abs(mv.z) < 1e5 && col.a >= 0.0 && col.r >= 0.0 && col.g >= 0.0 && col.b >= 0.0)) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); vCol = vec4(0.0); return; } // NaN-safe
  vDepth = max(-mv.z, 0.0);
  col.a *= smoothstep(0.02, 0.06 + size * 0.5, vDepth); // no giant quads glued to the lens
  vCol = col; vAdd = clamp(aMisc.z, 0.0, 1.0);
  gl_Position = projectionMatrix * mv;
  float sh = floor(aMisc.x + 0.5);
  float cx = mod(sh, 4.0), cy = floor(sh * 0.25);
  vUv = vec2((cx + 0.03 + q.x * 0.94) * 0.25, 1.0 - (cy + 0.03 + (1.0 - q.y) * 0.94) * 0.25);
}`;

const FRAG = /* glsl */`
precision highp float;
uniform sampler2D uAtlas;
uniform vec3 uFogColor;
uniform vec3 uFog;
in vec2 vUv;
in vec4 vCol;
in float vAdd;
in float vDepth;
out highp vec4 fragColor;
void main() {
  vec4 tx = texture(uAtlas, vUv);                    // premultiplied atlas
  float ca = clamp(vCol.a, 0.0, 1.0);
  float a = tx.a * ca;
  if (a < 0.002) discard;
  vec3 rgb = max(tx.rgb * vCol.rgb * ca, vec3(0.0));
  float ao = a * (1.0 - vAdd);
  float f = uFog.z * smoothstep(uFog.x, uFog.y, vDepth);
  rgb = rgb * (1.0 - f) + uFogColor * (ao * f);
  fragColor = vec4(min(rgb, vec3(48.0)), clamp(ao, 0.0, 1.0));
}`;

// ------------------------------------------------------------------ atlas (4x4 shapes, 128 px cells, drawn once)
function buildAtlas() {
  const N = 128, cv = document.createElement('canvas'); cv.width = cv.height = N * 4;
  const g = cv.getContext('2d');
  let s = 911; const R = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  const W = a => `rgba(255,255,255,${a})`, Gy = (v, a = 1) => `rgba(${v},${v},${v},${a})`;
  const rad = (x, y, r, stops) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); for (const [o, c] of stops) gr.addColorStop(o, c); return gr; };
  const poly = (pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
  const star = (n, r0, r1, jit = 0, rot = -Math.PI / 2) => { const p = []; for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n, r = (i % 2 ? r1 : r0) * (1 + (R() - 0.5) * jit); p.push([64 + Math.cos(a) * r, 64 + Math.sin(a) * r]); } return p; };
  const cell = (i, fn) => { g.save(); g.translate((i % 4) * N, Math.floor(i / 4) * N); g.beginPath(); g.rect(0, 0, N, N); g.clip(); fn(); g.restore(); };
  const shade = (fill) => { g.globalCompositeOperation = 'source-atop'; g.fillStyle = fill; g.fillRect(0, 0, N, N); g.globalCompositeOperation = 'source-over'; };
  const lin = (x0, y0, x1, y1, a, b) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, a); gr.addColorStop(1, b); return gr; };
  // 0 glow
  cell(0, () => { g.fillStyle = rad(64, 64, 60, [[0, W(1)], [0.18, W(0.8)], [0.45, W(0.25)], [0.75, W(0.06)], [1, W(0)]]); g.fillRect(0, 0, N, N); });
  // 1 smoke: overlapping soft blobs, lit from the top-left
  cell(1, () => {
    for (let i = 0; i < 11; i++) { const x = 64 + (R() - 0.5) * 46, y = 64 + (R() - 0.5) * 42, r = 20 + R() * 20; g.fillStyle = rad(x, y, r, [[0, W(0.62)], [0.62, W(0.42)], [0.85, W(0.15)], [1, W(0)]]); g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
    shade(lin(30, 20, 100, 110, Gy(255, 0), Gy(105, 0.6)));
    for (let i = 0; i < 26; i++) { const x = 24 + R() * 80, y = 24 + R() * 80, r = 3 + R() * 7; g.globalCompositeOperation = 'source-atop'; g.fillStyle = Gy(R() < 0.5 ? 140 : 255, 0.25); g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
    g.globalCompositeOperation = 'source-over';
  });
  // 2 fire: lobed hot blob, bright core, darker rim
  cell(2, () => {
    for (let i = 0; i < 9; i++) { const a = R() * 6.28, d = R() * 20, x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d, r = 22 + R() * 18; g.fillStyle = rad(x, y, r, [[0, W(0.9)], [0.65, W(0.7)], [0.88, W(0.2)], [1, W(0)]]); g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
    shade(rad(58, 56, 58, [[0, Gy(255, 0)], [0.45, Gy(230, 0.25)], [1, Gy(80, 0.9)]]));
  });
  // 3 spark (round, hot core; streak mode stretches it)
  cell(3, () => { g.fillStyle = rad(64, 64, 60, [[0, W(1)], [0.25, W(0.95)], [0.5, W(0.35)], [1, W(0)]]); g.fillRect(0, 0, N, N); });
  // 4 comic star with a dark outline
  cell(4, () => { poly(star(5, 52, 22)); g.fillStyle = W(1); g.fill(); g.lineWidth = 6; g.strokeStyle = 'rgba(60,40,10,1)'; g.lineJoin = 'round'; g.stroke(); });
  // 5 comic burst ("POW")
  cell(5, () => { g.shadowColor = '#fff'; g.shadowBlur = 5; poly(star(14, 58, 30, 0.3, 0.1)); g.fillStyle = rad(64, 64, 58, [[0, W(1)], [0.6, W(0.95)], [1, W(0.85)]]); g.fill(); });
  // 6 ring (shockwaves, splash rings)
  cell(6, () => { g.fillStyle = rad(64, 64, 62, [[0, W(0)], [0.52, W(0)], [0.76, W(1)], [0.88, W(0.4)], [1, W(0)]]); g.fillRect(0, 0, N, N); });
  // 7 splat / scorch: irregular blob + spatter (colour comes from the particle)
  cell(7, () => {
    g.shadowColor = '#fff'; g.shadowBlur = 4; const p = []; for (let i = 0; i < 30; i++) { const a = i / 30 * 6.283, r = 30 + R() * 13; p.push([64 + Math.cos(a) * r, 64 + Math.sin(a) * r]); }
    poly(p); g.fillStyle = W(1); g.fill();
    for (let i = 0; i < 11; i++) { const a = R() * 6.28, d = 44 + R() * 14, r = 2 + R() * 5; g.beginPath(); g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, r, 0, 7); g.fill(); }
    g.shadowBlur = 0; g.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 7; i++) { g.fillStyle = W(0.25); g.beginPath(); g.arc(44 + R() * 40, 44 + R() * 40, 4 + R() * 6, 0, 7); g.fill(); }
    g.globalCompositeOperation = 'source-over';
  });
  // 8 tortellino: a plump ring with a crease
  cell(8, () => {
    g.beginPath(); g.ellipse(64, 66, 50, 40, -0.3, 0, 6.283); g.ellipse(70, 70, 15, 12, -0.3, 0, 6.283, true); g.fillStyle = W(1); g.fill('evenodd');
    shade(rad(50, 50, 70, [[0, Gy(255, 0)], [0.6, Gy(230, 0.2)], [1, Gy(120, 0.8)]]));
    g.strokeStyle = Gy(150); g.lineWidth = 4; g.beginPath(); g.ellipse(68, 69, 26, 21, -0.3, 3.4, 5.9); g.stroke();
    g.strokeStyle = Gy(200); g.lineWidth = 3; g.beginPath(); g.arc(32, 44, 10, 3.6, 4.9); g.stroke();
  });
  // 9 confetti / paper / casing body
  cell(9, () => { g.fillStyle = W(1); g.fillRect(22, 38, 84, 52); shade(lin(22, 38, 106, 90, Gy(255, 0), Gy(170, 0.5))); });
  // 10 debris chunk: faceted polygon with a dark outline
  cell(10, () => {
    const p = []; for (let i = 0; i < 7; i++) { const a = i / 7 * 6.283 + R() * 0.5, r = 30 + R() * 24; p.push([64 + Math.cos(a) * r, 64 + Math.sin(a) * r]); }
    poly(p); g.fillStyle = Gy(245); g.fill(); g.lineWidth = 4; g.strokeStyle = Gy(70); g.stroke();
    poly([[64, 64], p[3], p[4], p[5]]); g.fillStyle = Gy(150); g.fill(); poly([[64, 64], p[5], p[6], p[0]]); g.fillStyle = Gy(195); g.fill();
  });
  // 11 drop: round head on top (streak mode: the head leads), tail below, highlight
  cell(11, () => { g.beginPath(); g.moveTo(64, 120); g.quadraticCurveTo(44, 74, 43, 50); g.lineTo(85, 50); g.quadraticCurveTo(84, 74, 64, 120); g.closePath(); g.moveTo(86, 46); g.arc(64, 46, 22, 0, 6.2832); g.fillStyle = rad(56, 40, 40, [[0, W(1)], [0.35, Gy(225)], [1, Gy(170)]]); g.fill(); });
  // 12 orange slice
  cell(12, () => {
    g.beginPath(); g.arc(64, 64, 54, 0, 7); g.fillStyle = Gy(200); g.fill(); g.beginPath(); g.arc(64, 64, 46, 0, 7); g.fillStyle = W(1); g.fill();
    g.strokeStyle = Gy(205); g.lineWidth = 4; for (let i = 0; i < 9; i++) { const a = i / 9 * 6.283; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(a) * 46, 64 + Math.sin(a) * 46); g.stroke(); }
    g.beginPath(); g.arc(64, 64, 7, 0, 7); g.fillStyle = Gy(235); g.fill();
  });
  // 13 ice cube
  cell(13, () => {
    const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
    rr(26, 26, 76, 76, 16); g.fillStyle = 'rgba(235,245,255,0.72)'; g.fill(); g.lineWidth = 5; g.strokeStyle = W(1); g.stroke();
    rr(38, 36, 30, 18, 8); g.fillStyle = W(0.95); g.fill();
  });
  // 14 ground cracks
  cell(14, () => {
    g.fillStyle = rad(64, 64, 34, [[0, W(0.85)], [0.6, W(0.35)], [1, W(0)]]); g.fillRect(0, 0, N, N);
    g.strokeStyle = W(1); g.lineCap = 'round';
    const crack = (x, y, a, len, w) => { let px = x, py = y; for (let i = 0; i < 6; i++) { a += (R() - 0.5) * 0.9; const nx = px + Math.cos(a) * len / 6, ny = py + Math.sin(a) * len / 6; g.lineWidth = Math.max(1, w * (1 - i / 6)); g.beginPath(); g.moveTo(px, py); g.lineTo(nx, ny); g.stroke(); if (R() < 0.3 && w > 2) crack(nx, ny, a + (R() < 0.5 ? 0.8 : -0.8), len * 0.4, w * 0.5); px = nx; py = ny; } };
    for (let i = 0; i < 8; i++) crack(64, 64, i / 8 * 6.283 + R() * 0.4, 36 + R() * 22, 5);
  });
  // 15 bottle cap (spritz bazooka "casing")
  cell(15, () => { poly(star(21, 54, 48, 0, 0)); g.fillStyle = Gy(215); g.fill(); g.beginPath(); g.arc(64, 64, 40, 0, 7); g.fillStyle = W(1); g.fill(); g.strokeStyle = Gy(175); g.lineWidth = 3; g.beginPath(); g.arc(64, 64, 30, 0, 7); g.stroke(); });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace; t.premultiplyAlpha = true; t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 1; t.name = 'particles-atlas';
  return t;
}

// ------------------------------------------------------------------ helpers
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);
const sgn = () => (Math.random() < 0.5 ? -1 : 1);
const CC = new Map(); const _col = new THREE.Color();
function lin(c) { // '#hex' | number | THREE.Color -> cached linear [r,g,b]
  if (c && c.isColor) return [c.r, c.g, c.b];
  let v = CC.get(c); if (v) return v;
  try { _col.set(c == null ? '#ffffff' : c); } catch (e) { _col.setRGB(1, 1, 1); }
  v = [_col.r, _col.g, _col.b]; if (CC.size < 512) CC.set(c, v); return v;
}
// confetti palette (the game's own: lime, purple, yellow, pink, white, cyan, orange)
const PAL = ['#c8f03c', '#8a34d0', '#ffd83a', '#ff4dc8', '#ffffff', '#4ad8ff', '#ff5a2a'].map(h => lin(h));
// element colours (HDR glow) for muzzle flashes / tracers
const ELEM = { acqua: [1.4, 3.6, 7.0], sugo: [7.0, 2.6, 0.8], schiuma: [7.0, 4.0, 1.2], spritz: [8.0, 3.8, 1.0] };

let INSTANCE = null;
export const getParticles = () => INSTANCE;

export function installParticles({ scene, camera, renderer = null, low = null } = {}) {
  if (INSTANCE) return INSTANCE;
  if (!scene || !camera) return null;
  const mobile = low != null ? !!low : (matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 500);
  const atlas = buildAtlas();
  const U = {
    uTime: { value: 0 }, uClear: { value: -1 }, uLight: { value: new THREE.Color(1, 1, 1) }, uWind: { value: new THREE.Vector3(0.28, 0, 0.12) },
    uAtlas: { value: atlas }, uFogColor: { value: new THREE.Color(0.8, 0.82, 0.85) }, uFog: { value: new THREE.Vector3(45, 190, 0) },
  };
  const mkMat = (name, decal) => {
    const m = new THREE.RawShaderMaterial({
      name, uniforms: U, vertexShader: VERT, fragmentShader: FRAG, glslVersion: THREE.GLSL3,
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    m.forceSinglePass = true; // double-sided quads in ONE pass (three would draw transparent DoubleSide twice)
    if (decal) { m.polygonOffset = true; m.polygonOffsetFactor = -4; m.polygonOffsetUnits = -4; }
    return m;
  };
  const root = new THREE.Group(); root.name = 'combat-particles'; root.userData.noBatch = true; root.userData.noWarm = true;
  const quad = new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3);
  function makeSystem(name, cap, order, decal) {
    const arr = new Float32Array(cap * STRIDE);
    const ib = new THREE.InstancedInterleavedBuffer(arr, STRIDE, 1); ib.setUsage(THREE.DynamicDrawUsage);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', quad); geo.setIndex([0, 1, 2, 0, 2, 3]);
    ATTRS.forEach((n, i) => geo.setAttribute(n, new THREE.InterleavedBufferAttribute(ib, 4, i * 4)));
    geo.instanceCount = 0;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const mesh = new THREE.Mesh(geo, mkMat('particles-' + name, decal));
    mesh.name = 'particles-' + name; mesh.frustumCulled = false; mesh.renderOrder = order; mesh.visible = false;
    mesh.castShadow = false; mesh.receiveShadow = false; mesh.matrixAutoUpdate = false; mesh.raycast = () => { };
    mesh.userData.noWarm = true; mesh.userData.noBatch = true; // gfx.js warm-up / batch.js: leave alone (compiled + uploaded by prewarm)
    root.add(mesh);
    const S = { name, cap, arr, ib, geo, mesh, head: 0, used: 0, wrapped: false, lastDeath: -1, pStart: 0, pCount: 0, fCount: 0, dirty: false, r0: { start: 0, count: 0 }, r1: { start: 0, count: 0 }, spawned: 0 };
    // slots written since the last CONFIRMED upload stay pending (several flushes may happen before a render)
    ib.onUpload(() => {
      if (S.pCount >= S.cap && S.fCount < S.cap) { S.fCount = 0; S.dirty = true; return; } // saturated after a partial flush: next one uploads everything
      const f = Math.min(S.fCount, S.pCount); S.pStart = (S.pStart + f) % S.cap; S.pCount -= f; S.fCount = 0; if (S.pCount > 0) S.dirty = true;
    });
    return S;
  }
  const CAP = mobile ? { glow: 1024, smoke: 768, decal: 40 } : { glow: 3072, smoke: 2048, decal: 112 };
  const SYS = { decal: makeSystem('decal', CAP.decal, 1, true), smoke: makeSystem('smoke', CAP.smoke, 2, false), glow: makeSystem('glow', CAP.glow, 3, false) };
  const LIST = [SYS.decal, SYS.smoke, SYS.glow];
  scene.add(root);

  let T = 0, Q = 1, frame = 0;
  const CAM = new THREE.Vector3(), CF = new THREE.Vector3();
  const stats = { spawned: 0, calls: 0, flushMs: 0, updMs: 0, programs0: -1, compileMs: 0 };

  // ---------------------------------------------------------------- spawn spec (one reused object, no allocations)
  const SP = {};
  function reset() {
    SP.x = 0; SP.y = 0; SP.z = 0; SP.vx = 0; SP.vy = 0; SP.vz = 0; SP.life = 1; SP.s0 = 0.2; SP.s1 = 0.2; SP.rot = Math.random() * 6.283; SP.spin = 0;
    SP.r0 = 1; SP.g0 = 1; SP.b0 = 1; SP.a0 = 1; SP.r1 = 1; SP.g1 = 1; SP.b1 = 1; SP.a1 = 0;
    SP.g = 0; SP.k = 0; SP.G = NOGROUND; SP.rest = -1; SP.shape = 0; SP.mode = 0; SP.add = 1; SP.lit = 0;
    SP.stretch = 0; SP.fadeIn = 0; SP.sc = 1; SP.cc = 1; SP.delay = 0;
    return SP;
  }
  const at = (p, jx = 0, jy = 0, jz = 0) => { SP.x = p.x + (jx ? rnd(-jx, jx) : 0); SP.y = p.y + (jy ? rnd(-jy, jy) : 0); SP.z = p.z + (jz ? rnd(-jz, jz) : 0); };
  const vel = (x, y, z) => { SP.vx = x; SP.vy = y; SP.vz = z; };
  const c0 = (c, m = 1, a = 1) => { const v = Array.isArray(c) ? c : lin(c); SP.r0 = v[0] * m; SP.g0 = v[1] * m; SP.b0 = v[2] * m; SP.a0 = a; };
  const c1 = (c, m = 1, a = 0) => { const v = Array.isArray(c) ? c : lin(c); SP.r1 = v[0] * m; SP.g1 = v[1] * m; SP.b1 = v[2] * m; SP.a1 = a; };
  const rgb0 = (r, g, b, a = 1) => { SP.r0 = r; SP.g0 = g; SP.b0 = b; SP.a0 = a; };
  const rgb1 = (r, g, b, a = 0) => { SP.r1 = r; SP.g1 = g; SP.b1 = b; SP.a1 = a; };
  // random direction: horizontal spread h, vertical in [ylo, yhi] before normalising
  const D = { x: 0, y: 0, z: 0 };
  function dir(ylo = -1, yhi = 1) { const a = Math.random() * 6.283, y = rnd(ylo, yhi), r = Math.sqrt(Math.max(0, 1 - y * y)); D.x = Math.cos(a) * r; D.y = y; D.z = Math.sin(a) * r; return D; }

  function emit(sysName) {
    const S = typeof sysName === 'string' ? SYS[sysName] : sysName; if (!S) return;
    if (!(Math.abs(SP.x) < 1e5 && Math.abs(SP.y) < 1e5 && Math.abs(SP.z) < 1e5 && Math.abs(SP.vx) < 1e5 && Math.abs(SP.vy) < 1e5 && Math.abs(SP.vz) < 1e5 && SP.life > 0 && SP.s1 >= 0)) return; // NaN / garbage in: skip
    const i = S.head, o = i * STRIDE, a = S.arr, t0 = T + Math.max(0, SP.delay || 0), life = Math.max(0.001, SP.life);
    a[o] = SP.x; a[o + 1] = SP.y; a[o + 2] = SP.z; a[o + 3] = t0;
    a[o + 4] = SP.vx; a[o + 5] = SP.vy; a[o + 6] = SP.vz; a[o + 7] = life;
    a[o + 8] = SP.s0; a[o + 9] = SP.s1; a[o + 10] = SP.rot; a[o + 11] = SP.spin;
    a[o + 12] = SP.r0; a[o + 13] = SP.g0; a[o + 14] = SP.b0; a[o + 15] = SP.a0;
    a[o + 16] = SP.r1; a[o + 17] = SP.g1; a[o + 18] = SP.b1; a[o + 19] = SP.a1;
    a[o + 20] = SP.g; a[o + 21] = SP.k; a[o + 22] = SP.G; a[o + 23] = SP.rest;
    a[o + 24] = SP.shape; a[o + 25] = SP.mode; a[o + 26] = SP.add; a[o + 27] = SP.lit;
    a[o + 28] = SP.stretch; a[o + 29] = SP.fadeIn; a[o + 30] = SP.sc; a[o + 31] = SP.cc;
    if (S.pCount === 0) S.pStart = i;
    if (S.pCount < S.cap) S.pCount++;
    S.dirty = true;
    S.head = i + 1; if (S.head >= S.cap) { S.head = 0; S.wrapped = true; }
    if (S.used < i + 1) S.used = i + 1;
    if (t0 + life > S.lastDeath) S.lastDeath = t0 + life;
    S.mesh.visible = true; S.spawned++; stats.spawned++;
  }
  function flush() {
    const t = performance.now();
    for (let j = 0; j < LIST.length; j++) {
      const S = LIST[j];
      if (S.dirty) { // the pending slots are contiguous in ring order (pStart, pCount): one or two ranges, or all
        const ur = S.ib.updateRanges; ur.length = 0;
        if (S.pCount < S.cap) {
          const s = S.pStart, e = s + S.pCount;
          if (e <= S.cap) { S.r0.start = s * STRIDE; S.r0.count = S.pCount * STRIDE; ur.push(S.r0); }
          else { S.r0.start = s * STRIDE; S.r0.count = (S.cap - s) * STRIDE; S.r1.start = 0; S.r1.count = (e - S.cap) * STRIDE; ur.push(S.r0, S.r1); }
        }
        S.ib.needsUpdate = true; S.dirty = false; S.fCount = S.pCount;
        S.geo.instanceCount = S.wrapped ? S.cap : S.used;
      }
      const vis = T < S.lastDeath; if (S.mesh.visible !== vis) S.mesh.visible = vis;
    }
    stats.flushMs = performance.now() - t;
  }
  // flush right before each frame's render collects the objects (uploads happen there, not in onBeforeRender)
  { const prev = scene.onBeforeRender; scene.onBeforeRender = function (r, s, c, rt) { flush(); if (prev) return prev.call(this, r, s, c, rt); }; }

  function rebase() { // keep the shader clock small (float precision)
    const sh = 3000; T -= sh; U.uTime.value = T; U.uClear.value -= sh;
    for (const S of LIST) { for (let i = 0; i < S.cap; i++) S.arr[i * STRIDE + 3] -= sh; S.lastDeath -= sh; S.pCount = S.cap; S.pStart = 0; S.fCount = 0; S.dirty = true; }
  }

  // ---------------------------------------------------------------- quality / LOD
  function quality() {
    if (api && api.qOverride > 0) return api.qOverride; // tests
    const lv = currentQuality();
    let m = lv === 'low' ? 0.45 : lv === 'medium' ? 0.75 : lv === 'ultra' ? 1.25 : 1;
    if (mobile) m = Math.min(m, 0.45);
    return m;
  }
  // count multiplier for an effect at p: quality x distance (0 = skip)
  function lod(p) {
    const d = Math.hypot(p.x - CAM.x, p.y - CAM.y, p.z - CAM.z);
    if (d > 130) return 0;
    return Q * (d < 35 ? 1 : d < 70 ? 0.6 : 0.32);
  }
  const cnt = (base, L) => { const x = base * L; const n = Math.floor(x); return n + (Math.random() < x - n ? 1 : 0); };

  // ---------------------------------------------------------------- camera shake (main.js applies S.shake)
  function shake(amount, p, range = 18) {
    try {
      const S = window.__app && window.__app.S; if (!S) return;
      const d = p ? Math.hypot(p.x - CAM.x, p.y - CAM.y, p.z - CAM.z) : 0;
      const k = Math.max(0, 1 - d / range); if (k <= 0) return;
      S.shake = Math.max(S.shake || 0, amount * k);
    } catch (e) { }
  }

  // ================================================================= effect library
  const _p = new THREE.Vector3();
  // ---- explosions
  function explode(p, o = {}) {
    if (!p) return;
    const L = lod(p); if (!L) return; stats.calls++;
    const kind = o.kind || 'fire', R = o.radius ?? 2.5, k = clamp(R / 2.5, 0.35, 2.4), sk = Math.sqrt(k);
    const G = o.ground ?? 0, onGround = p.y - G < 1.6 * k + 0.6;
    const wet = kind === 'sugo' || kind === 'acqua' || kind === 'schiuma';
    const big = kind === 'spritz' || kind === 'fire' || kind === 'boss' || kind === 'car';
    // flash core + comic burst
    reset(); at(p); SP.life = big ? 0.16 : 0.12; SP.s0 = 0.5 * k; SP.s1 = (big ? 3.2 : 2.6) * k; SP.sc = 3; SP.shape = SH.glow;
    if (kind === 'acqua') { rgb0(2.5, 4.5, 7, 1); rgb1(1, 2.5, 5, 0); } else if (kind === 'sugo') { rgb0(5, 2.6, 1.2, 1); rgb1(3, 0.6, 0.2, 0); } else { rgb0(9, 7.5, 5, 1); rgb1(5, 2.4, 0.6, 0); }
    emit(SYS.glow);
    reset(); at(p); SP.life = big ? 0.14 : 0.12; SP.s0 = 0.7 * k; SP.s1 = (big ? 3.1 : 2.6) * k; SP.sc = 4; SP.shape = SH.burst; SP.add = 0.85;
    if (kind === 'acqua') { rgb0(2.6, 4.2, 6, 1); rgb1(1, 2, 4, 0); } else if (wet) { rgb0(6, 4.5, 2.2, 1); rgb1(4, 1.2, 0.3, 0); } else { rgb0(7, 6, 2.6, 1); rgb1(5, 2, 0.4, 0); }
    emit(SYS.glow);
    if (big) {
      // fireball: semi-occluding hot puffs that rise and cool to deep red
      const nf = cnt(kind === 'boss' ? 30 : 20, L);
      const hot = kind === 'spritz' ? [2.6, 0.72, 0.12] : [2.5, 0.85, 0.14];
      for (let i = 0; i < nf; i++) {
        reset(); const d = dir(-0.15, 1); const sp = rnd(1.6, 5.2) * k;
        at(p); SP.x += d.x * 0.35 * k * Math.random(); SP.y += d.y * 0.35 * k * Math.random(); SP.z += d.z * 0.35 * k * Math.random();
        vel(d.x * sp, d.y * sp + 0.5, d.z * sp); SP.k = 3.2; SP.g = -1.7; SP.G = G + 0.1;
        SP.s0 = rnd(0.6, 0.9) * k; SP.s1 = rnd(1.6, 2.4) * k; SP.sc = 2.2; SP.life = rnd(0.6, 1.0); SP.spin = rnd(-1.5, 1.5);
        if (i < 3) rgb0(4.2, 2.6, 1.0, 1); else rgb0(hot[0], hot[1], hot[2], 1); rgb1(0.45, 0.06, 0.02, 0); SP.cc = 0.7; SP.add = 0.3; SP.fadeIn = 0.03; SP.shape = SH.fire; SP.delay = rnd(0, 0.05);
        emit(SYS.glow);
      }
      // embers floating up
      const ne = cnt(10, L);
      for (let i = 0; i < ne; i++) { reset(); const d = dir(0.1, 1); const sp = rnd(1, 3.4) * sk; at(p, 0.4 * k, 0.3 * k, 0.4 * k); vel(d.x * sp, d.y * sp + 1, d.z * sp); SP.k = 1.3; SP.g = -0.5; SP.life = rnd(1.2, 2.4); SP.s0 = 0.08; SP.s1 = 0.025; rgb0(7, 3, 0.7, 1); rgb1(3, 0.5, 0.05, 1); SP.delay = rnd(0.05, 0.3); emit(SYS.glow); }
      // dark smoke, lingering
      const ns = cnt(kind === 'boss' ? 22 : 15, L), light = kind === 'spritz';
      for (let i = 0; i < ns; i++) {
        reset(); const d = dir(0, 1); at(p, 0.5 * k, 0, 0.5 * k); SP.y += 0.25 * k;
        const sp = rnd(0.6, 2.2) * k; vel(d.x * sp, rnd(0.7, 1.9) * sk, d.z * sp); SP.k = 1.4; SP.g = -0.7; SP.G = G + 0.3;
        SP.s0 = 1.0 * k; SP.s1 = rnd(2.8, 3.8) * k; SP.sc = 2; SP.life = rnd(3.0, 4.8); SP.fadeIn = 0.25; SP.spin = rnd(-0.4, 0.4);
        if (light && i % 3 === 0) { rgb0(0.95, 0.45, 0.22, 0.65); rgb1(1.0, 0.8, 0.7, 0); } else { rgb0(0.07, 0.06, 0.055, 0.88); rgb1(0.3, 0.29, 0.28, 0); }
        SP.cc = 0.6; SP.lit = 1; SP.add = 0; SP.shape = SH.smoke; SP.delay = rnd(0.06, 0.3);
        emit(SYS.smoke);
      }
      // sparks with gravity and bounce
      const nk = cnt(kind === 'boss' ? 40 : 26, L);
      for (let i = 0; i < nk; i++) {
        reset(); const d = dir(-0.1, 1); const sp = rnd(5, 13) * sk; at(p); vel(d.x * sp, d.y * sp + 1, d.z * sp);
        SP.g = 9.8; SP.k = 0.9; SP.G = G; SP.rest = 0.35; SP.mode = MODE.streak; SP.stretch = 0.04; SP.shape = SH.spark;
        SP.s0 = 0.075; SP.s1 = 0.03; SP.life = rnd(0.6, 1.4); rgb0(9, 5, 1.6, 1); rgb1(4, 0.7, 0.1, 1);
        emit(SYS.glow);
      }
      // debris chunks
      const nd = cnt(9, L);
      for (let i = 0; i < nd; i++) {
        reset(); const d = dir(0.2, 1); at(p, 0.2, 0.1, 0.2); const sp = rnd(2, 5.5) * sk; vel(d.x * sp, rnd(3, 8) * sk, d.z * sp);
        SP.g = 9.8; SP.k = 0.3; SP.G = G; SP.rest = 0.4; SP.mode = MODE.tumble; SP.shape = SH.chunk; SP.s0 = SP.s1 = rnd(0.12, 0.28) * sk; SP.spin = rnd(6, 16) * sgn();
        SP.life = rnd(1.8, 3.0); rgb0(0.13, 0.11, 0.1, 1); rgb1(0.13, 0.11, 0.1, 1); SP.lit = 1; SP.add = 0;
        emit(SYS.glow);
      }
      if (onGround) {
        // shockwave on the ground + a quick air ring
        reset(); SP.x = p.x; SP.y = G; SP.z = p.z; SP.mode = MODE.ground; SP.shape = SH.ring; SP.s0 = 0.4 * k; SP.s1 = 2.3 * R; SP.sc = 3; SP.life = 0.4; rgb0(1.5, 0.95, 0.5, 0.55); rgb1(0.7, 0.4, 0.2, 0); SP.add = 0.75; emit(SYS.glow);
        // dust skirt
        const nu = cnt(10, L);
        for (let i = 0; i < nu; i++) { reset(); const a = i / Math.max(1, nu) * 6.283 + rnd(-0.2, 0.2), sp = rnd(4, 7) * k; SP.x = p.x + Math.cos(a) * 0.4 * k; SP.y = G + 0.25 * k; SP.z = p.z + Math.sin(a) * 0.4 * k; vel(Math.cos(a) * sp, 0.3, Math.sin(a) * sp); SP.k = 2.6; SP.g = -0.25; SP.G = G + 0.1; SP.s0 = 0.5 * k; SP.s1 = 1.8 * k; SP.sc = 2; SP.life = rnd(1.2, 2.0); rgb0(0.6, 0.54, 0.45, 0.6); rgb1(0.68, 0.64, 0.58, 0); SP.lit = 1; SP.add = 0; SP.shape = SH.smoke; SP.fadeIn = 0.04; emit(SYS.smoke); }
        if (o.decal !== false) {
          reset(); SP.x = p.x; SP.y = G; SP.z = p.z; SP.mode = MODE.ground; SP.shape = SH.splat; SP.s0 = 1.1 * R; SP.s1 = 1.35 * R * rnd(0.92, 1.08); SP.sc = 12; SP.life = rnd(14, 18); rgb0(0.03, 0.025, 0.02, 0.88); rgb1(0.03, 0.025, 0.02, 0.88); SP.add = 0; emit(SYS.decal);
          if (kind === 'spritz') { reset(); SP.x = p.x; SP.y = G; SP.z = p.z; SP.mode = MODE.ground; SP.shape = SH.splat; SP.s0 = 1.3 * R; SP.s1 = 1.75 * R; SP.sc = 12; SP.life = rnd(12, 15); rgb0(0.85, 0.24, 0.01, 0.55); rgb1(0.85, 0.24, 0.01, 0.55); SP.lit = 2; SP.add = 0; emit(SYS.decal); }
        }
      }
      reset(); at(p); SP.mode = MODE.bill; SP.shape = SH.ring; SP.s0 = 0.4 * k; SP.s1 = 4 * k; SP.sc = 2.5; SP.life = 0.2; rgb0(1.1, 1.0, 0.9, 0.35); rgb1(0.8, 0.7, 0.6, 0); emit(SYS.glow);
    }
    if (kind === 'spritz') {
      // the cocktail: Aperol drops, orange slices, ice, glass, a cap or two
      const nl = cnt(18, L);
      for (let i = 0; i < nl; i++) { reset(); const d = dir(0.05, 1); const sp = rnd(3, 9) * sk; at(p); vel(d.x * sp, d.y * sp + 1.5, d.z * sp); SP.g = 9.8; SP.k = 0.5; SP.G = G; SP.mode = MODE.streak; SP.stretch = 0.03; SP.shape = SH.drop; SP.s0 = SP.s1 = rnd(0.07, 0.12) * sk; SP.life = rnd(0.8, 1.3); rgb0(1.25, 0.36, 0.02, 0.95); rgb1(1.1, 0.3, 0.02, 0.8); SP.add = 0.15; SP.lit = 0.6; emit(SYS.glow); }
      const no = cnt(3, L) + 1;
      for (let i = 0; i < no; i++) { reset(); const d = dir(0.3, 1); const sp = rnd(2, 4.5) * sk; at(p); vel(d.x * sp, rnd(4, 8) * sk, d.z * sp); SP.g = 9.8; SP.k = 0.3; SP.G = G; SP.rest = 0.35; SP.mode = MODE.tumble; SP.shape = SH.orange; SP.s0 = SP.s1 = 0.24 * sk; SP.spin = rnd(6, 12) * sgn(); SP.life = rnd(2.2, 3); rgb0(1, 0.42, 0.04, 1); rgb1(1, 0.42, 0.04, 1); SP.lit = 1; SP.add = 0; emit(SYS.glow); }
      const ni = cnt(5, L);
      for (let i = 0; i < ni; i++) { reset(); const d = dir(0.3, 1); const sp = rnd(2, 5) * sk; at(p); vel(d.x * sp, rnd(3, 7) * sk, d.z * sp); SP.g = 9.8; SP.k = 0.3; SP.G = G; SP.rest = 0.45; SP.mode = MODE.tumble; SP.shape = SH.ice; SP.s0 = SP.s1 = 0.15 * sk; SP.spin = rnd(8, 14) * sgn(); SP.life = rnd(1.8, 2.6); rgb0(0.85, 0.95, 1.0, 0.85); rgb1(0.85, 0.95, 1.0, 0.85); SP.lit = 0.8; SP.add = 0.1; emit(SYS.glow); }
      const ng = cnt(7, L);
      for (let i = 0; i < ng; i++) { reset(); const d = dir(0, 1); const sp = rnd(3, 8) * sk; at(p); vel(d.x * sp, d.y * sp + 2, d.z * sp); SP.g = 9.8; SP.k = 0.4; SP.G = G; SP.rest = 0.3; SP.mode = MODE.tumble; SP.shape = SH.chunk; SP.s0 = SP.s1 = rnd(0.05, 0.1); SP.spin = rnd(10, 20) * sgn(); SP.life = rnd(1.4, 2.2); rgb0(0.5, 0.95, 0.6, 0.7); rgb1(0.5, 0.95, 0.6, 0.7); SP.lit = 0.7; SP.add = 0.35; emit(SYS.glow); }
      for (let i = 0; i < 3; i++) { reset(); const d = dir(0.4, 1); at(p); SP.y += 0.4; vel(d.x * 2.2, rnd(2, 3.5), d.z * 2.2); SP.g = 5.5; SP.k = 0.8; SP.G = G + 0.02; SP.rest = 0.4; SP.shape = SH.star; SP.s0 = SP.s1 = 0.24 * sk; SP.spin = rnd(-8, 8); SP.life = 1.1; rgb0(1.35, 1.05, 0.15, 1); rgb1(1.35, 1.05, 0.15, 1); SP.add = 0.15; emit(SYS.glow); }
    } else if (kind === 'sugo') {
      // tortellini splash: sauce, pasta, parmigiano, steam
      reset(); at(p); SP.y += 0.2; SP.shape = SH.splat; SP.s0 = 0.4; SP.s1 = 1.7 * R; SP.sc = 3; SP.life = 0.22; rgb0(0.75, 0.07, 0.02, 0.95); rgb1(0.6, 0.05, 0.02, 0); SP.add = 0; SP.lit = 0.7; emit(SYS.glow);
      const nl = cnt(24, L);
      for (let i = 0; i < nl; i++) { reset(); const d = dir(0.05, 1); const sp = rnd(2.5, 7) * sk; at(p); vel(d.x * sp, d.y * sp + 1.5, d.z * sp); SP.g = 9.8; SP.k = 0.5; SP.G = G; SP.mode = MODE.streak; SP.stretch = 0.03; SP.shape = SH.drop; SP.s0 = SP.s1 = rnd(0.1, 0.16); SP.life = rnd(0.6, 1.0); rgb0(0.7, 0.05, 0.02, 1); rgb1(0.6, 0.04, 0.02, 0.9); SP.add = 0; SP.lit = 0.8; emit(SYS.glow); }
      const nt = cnt(5, L) + 1;
      for (let i = 0; i < nt; i++) { reset(); const d = dir(0.3, 1); const sp = rnd(1.5, 4) * sk; at(p); vel(d.x * sp, rnd(3, 6), d.z * sp); SP.g = 9.8; SP.k = 0.3; SP.G = G; SP.rest = 0.4; SP.mode = MODE.tumble; SP.shape = SH.tortellino; SP.s0 = SP.s1 = rnd(0.2, 0.27); SP.spin = rnd(6, 12) * sgn(); SP.life = rnd(1.8, 2.6); rgb0(1, 0.8, 0.38, 1); rgb1(1, 0.8, 0.38, 1); SP.lit = 1; SP.add = 0; emit(SYS.glow); }
      const nc = cnt(10, L);
      for (let i = 0; i < nc; i++) { reset(); const d = dir(0.2, 1); const sp = rnd(1, 3); at(p); vel(d.x * sp, rnd(2, 4), d.z * sp); SP.g = 6; SP.k = 1.2; SP.G = G; SP.rest = 0.2; SP.mode = MODE.tumble; SP.shape = SH.confetti; SP.s0 = SP.s1 = rnd(0.05, 0.08); SP.spin = rnd(10, 20); SP.life = rnd(1, 1.6); rgb0(1, 0.95, 0.7, 1); rgb1(1, 0.95, 0.7, 1); SP.lit = 1; SP.add = 0; emit(SYS.glow); }
      const nm = cnt(4, L);
      for (let i = 0; i < nm; i++) { reset(); at(p, 0.3, 0.1, 0.3); vel(rnd(-0.5, 0.5), rnd(0.5, 1), rnd(-0.5, 0.5)); SP.k = 1.5; SP.g = -0.4; SP.s0 = 0.6 * k; SP.s1 = 2.2 * k; SP.sc = 2; SP.life = rnd(1, 1.6); rgb0(0.95, 0.92, 0.9, 0.5); rgb1(1, 1, 1, 0); SP.lit = 1; SP.add = 0; SP.shape = SH.smoke; emit(SYS.smoke); }
      if (onGround) { reset(); SP.x = p.x; SP.y = G; SP.z = p.z; SP.mode = MODE.ground; SP.shape = SH.ring; SP.s0 = 0.3; SP.s1 = 2.2 * R; SP.sc = 3; SP.life = 0.35; rgb0(1.0, 0.2, 0.06, 0.7); rgb1(0.7, 0.12, 0.04, 0); SP.add = 0.2; emit(SYS.glow); }
    } else if (kind === 'acqua' || kind === 'schiuma') {
      const water = kind === 'acqua';
      const nl = cnt(14, L);
      for (let i = 0; i < nl; i++) { reset(); const d = dir(0.05, 1); const sp = rnd(2, 5.5) * sk; at(p); vel(d.x * sp, d.y * sp + 1, d.z * sp); SP.g = 9.8; SP.k = 0.6; SP.G = G; SP.life = rnd(0.5, 0.9); SP.add = water ? 0.25 : 0; SP.lit = 0.7;
        if (water) { SP.mode = MODE.streak; SP.stretch = 0.03; SP.shape = SH.drop; SP.s0 = SP.s1 = rnd(0.08, 0.13); rgb0(0.55, 0.82, 1.0, 0.9); rgb1(0.7, 0.9, 1.0, 0.4); }
        else { SP.mode = MODE.tumble; SP.shape = SH.confetti; SP.rest = 0.2; SP.s0 = SP.s1 = rnd(0.07, 0.11); SP.spin = rnd(10, 18); c0(i % 2 ? '#ff8a1e' : '#2a6cff', 1, 1); c1(i % 2 ? '#ff8a1e' : '#2a6cff', 1, 1); SP.lit = 1; SP.life = rnd(0.9, 1.4); }
        emit(SYS.glow); }
      const nm = cnt(5, L);
      for (let i = 0; i < nm; i++) { reset(); at(p, 0.3, 0.1, 0.3); const d = dir(0, 1); vel(d.x * 1.5, d.y + 0.4, d.z * 1.5); SP.k = 2; SP.g = -0.2; SP.s0 = 0.3 * k; SP.s1 = 1.3 * k; SP.sc = 2; SP.life = rnd(0.7, 1.1); water ? (rgb0(0.85, 0.93, 1.0, 0.4), rgb1(0.9, 0.95, 1, 0)) : (rgb0(1, 1, 0.97, 0.7), rgb1(1, 1, 1, 0)); SP.lit = 1; SP.add = 0; SP.shape = SH.smoke; emit(SYS.smoke); }
      if (onGround) { reset(); SP.x = p.x; SP.y = G; SP.z = p.z; SP.mode = MODE.ground; SP.shape = SH.ring; SP.s0 = 0.3; SP.s1 = 2.2 * R; SP.sc = 3; SP.life = 0.32; water ? rgb0(0.9, 1.4, 2.0, 0.6) : rgb0(1.6, 1.3, 0.9, 0.6); rgb1(0.6, 0.8, 1, 0); SP.add = 0.5; emit(SYS.glow); }
    }
    if (kind === 'boss') {
      // "multe annullate": parking tickets raining down + police lights
      const nm = cnt(22, L);
      for (let i = 0; i < nm; i++) { reset(); const d = dir(0.2, 1); const sp = rnd(1, 3.5); at(p); vel(d.x * sp, rnd(4, 8), d.z * sp); SP.g = 3.2; SP.k = 2.2; SP.G = G; SP.rest = 0.1; SP.mode = MODE.tumble; SP.shape = SH.confetti; SP.s0 = SP.s1 = rnd(0.14, 0.2); SP.spin = rnd(4, 9) * sgn(); SP.life = rnd(3, 4.5); rgb0(0.98, 0.98, 0.93, 1); rgb1(0.98, 0.98, 0.93, 1); SP.lit = 1; SP.add = 0; emit(SYS.glow); }
      police(_p.set(p.x, p.y + 1.2, p.z), 10, 1.6);
    }
    if (o.shake !== false && (big || o.shake)) shake((kind === 'boss' ? 0.1 : 0.075) * sk, p, 22 * k);
  }

  // ---- surface impacts (n: surface normal)
  const _n = new THREE.Vector3(), _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3();
  function basis(n) { _n.set(+n.x || 0, +n.y || 0, +n.z || 0).normalize(); if (!(_n.lengthSq() > 0.5)) _n.set(0, 1, 0); if (Math.abs(_n.y) < 0.9) _t1.set(0, 1, 0); else _t1.set(1, 0, 0); _t1.cross(_n).normalize(); _t2.copy(_n).cross(_t1); }
  // direction around the normal: cone in [0..1] (0 = along n, 1 = grazing)
  function hemi(cone, out = D) { const a = Math.random() * 6.283, r = Math.random() * cone; out.x = _n.x + (_t1.x * Math.cos(a) + _t2.x * Math.sin(a)) * r; out.y = _n.y + (_t1.y * Math.cos(a) + _t2.y * Math.sin(a)) * r; out.z = _n.z + (_t1.z * Math.cos(a) + _t2.z * Math.sin(a)) * r; const l = Math.hypot(out.x, out.y, out.z) || 1; out.x /= l; out.y /= l; out.z /= l; return out; }
  function impact(p, n, kind = 'spark', o = {}) {
    if (!p) return;
    const L = lod(p); if (!L) return; stats.calls++;
    basis(n || UPV); const G = o.ground ?? 0, ground = _n.y > 0.7;
    if (kind === 'acqua' || kind === 'spritz' || kind === 'sugo') {
      const col = kind === 'acqua' ? [0.55, 0.82, 1.0] : kind === 'sugo' ? [0.72, 0.06, 0.02] : [1.2, 0.36, 0.02];
      const nd = cnt(kind === 'acqua' ? 9 : 11, L);
      for (let i = 0; i < nd; i++) { reset(); const d = hemi(1.2); const sp = rnd(1.8, 4.2); at(p); vel(d.x * sp, d.y * sp + 0.8, d.z * sp); SP.g = 9.8; SP.k = 0.6; SP.G = G; SP.mode = MODE.streak; SP.stretch = 0.035; SP.shape = SH.drop; SP.s0 = SP.s1 = rnd(0.06, 0.1); SP.life = rnd(0.35, 0.65); rgb0(col[0], col[1], col[2], 0.95); rgb1(col[0], col[1], col[2], 0.5); SP.add = kind === 'acqua' ? 0.25 : 0.05; SP.lit = 0.6; emit(SYS.glow); }
      reset(); at(p); vel(_n.x, _n.y, _n.z); SP.mode = MODE.plane; SP.shape = SH.ring; SP.s0 = 0.1; SP.s1 = kind === 'sugo' ? 0.9 : 0.75; SP.sc = 2.5; SP.life = 0.28; rgb0(col[0] * 1.4, col[1] * 1.4, col[2] * 1.4, 0.75); rgb1(col[0], col[1], col[2], 0); SP.add = 0.5; emit(SYS.glow);
      reset(); at(p); vel(_n.x * 0.8, _n.y * 0.8 + 0.15, _n.z * 0.8); SP.k = 2.5; SP.g = -0.2; SP.s0 = 0.15; SP.s1 = 0.8; SP.sc = 2; SP.life = 0.7; kind === 'acqua' ? rgb0(0.85, 0.93, 1.0, 0.35) : rgb0(0.9, 0.88, 0.85, 0.3); rgb1(1, 1, 1, 0); SP.lit = 1; SP.add = 0; SP.shape = SH.smoke; emit(SYS.smoke);
      if (kind === 'sugo' && Math.random() < 0.7) { reset(); const d = hemi(0.8); at(p); vel(d.x * 2, d.y * 2 + 2, d.z * 2); SP.g = 9.8; SP.k = 0.3; SP.G = G; SP.rest = 0.4; SP.mode = MODE.tumble; SP.shape = SH.tortellino; SP.s0 = SP.s1 = 0.2; SP.spin = rnd(6, 12); SP.life = 1.8; rgb0(1, 0.8, 0.38, 1); rgb1(1, 0.8, 0.38, 1); SP.lit = 1; SP.add = 0; emit(SYS.glow); }
    } else if (kind === 'schiuma') {
      reset(); at(p); SP.shape = SH.burst; SP.s0 = 0.2; SP.s1 = 0.7; SP.sc = 3; SP.life = 0.09; rgb0(3.2, 2.6, 1.6, 1); rgb1(2, 1, 0.4, 0); SP.add = 0.7; emit(SYS.glow);
      const nb = cnt(6, L);
      for (let i = 0; i < nb; i++) { reset(); const d = hemi(1.1); const sp = rnd(1, 2.5); at(p); vel(d.x * sp, d.y * sp + 1, d.z * sp); SP.g = 7; SP.k = 1.5; SP.G = G; SP.rest = 0.2; SP.mode = MODE.tumble; SP.shape = SH.confetti; SP.s0 = SP.s1 = rnd(0.05, 0.08); SP.spin = rnd(12, 20); SP.life = rnd(0.7, 1.1); c0(i % 2 ? '#ff7a1a' : '#ffe02a', 1, 1); c1(i % 2 ? '#ff7a1a' : '#ffe02a', 1, 1); SP.lit = 1; SP.add = 0; emit(SYS.glow); }
    } else { // generic hard hit: sparks
      reset(); at(p); SP.shape = SH.glow; SP.s0 = 0.15; SP.s1 = 0.6; SP.sc = 3; SP.life = 0.08; rgb0(8, 6, 3, 1); rgb1(4, 2, 0.5, 0); emit(SYS.glow);
      const nk = cnt(o.sparks ?? 11, L);
      for (let i = 0; i < nk; i++) { reset(); const d = hemi(1.4); const sp = rnd(2, 6); at(p); vel(d.x * sp, d.y * sp + 1, d.z * sp); SP.g = 9.8; SP.k = 1.2; SP.G = G; SP.rest = 0.3; SP.mode = MODE.streak; SP.stretch = 0.045; SP.shape = SH.spark; SP.s0 = 0.07; SP.s1 = 0.03; SP.life = rnd(0.3, 0.7); rgb0(8, 5, 1.5, 1); rgb1(3, 0.6, 0.1, 1); emit(SYS.glow); }
    }
    // dust from the surface (plaster on walls, ground dust), always a little
    const nu = cnt(ground ? 3 : 2, L);
    for (let i = 0; i < nu; i++) { reset(); const d = hemi(0.7); at(p, 0.04, 0.04, 0.04); const sp = rnd(0.5, 1.4); vel(d.x * sp, d.y * sp + 0.2, d.z * sp); SP.k = 2.2; SP.g = -0.15; SP.s0 = 0.15; SP.s1 = rnd(0.7, 1.05); SP.sc = 2; SP.life = rnd(0.7, 1.2); ground ? rgb0(0.58, 0.52, 0.44, 0.5) : rgb0(0.82, 0.78, 0.72, 0.45); rgb1(0.75, 0.72, 0.68, 0); SP.lit = 1; SP.add = 0; SP.shape = SH.smoke; SP.fadeIn = 0.03; emit(SYS.smoke); }
    if (ground && kind !== 'acqua') { const nc = cnt(2, L); for (let i = 0; i < nc; i++) { reset(); const d = hemi(0.9); at(p); vel(d.x * 1.5, rnd(1.5, 3), d.z * 1.5); SP.g = 9.8; SP.k = 0.4; SP.G = G; SP.rest = 0.3; SP.mode = MODE.tumble; SP.shape = SH.chunk; SP.s0 = SP.s1 = rnd(0.05, 0.09); SP.spin = rnd(10, 20); SP.life = rnd(0.7, 1.1); rgb0(0.3, 0.26, 0.22, 1); rgb1(0.3, 0.26, 0.22, 1); SP.lit = 1; SP.add = 0; emit(SYS.glow); } }
  }

  // ---- comic hit on an enemy: a POW flash, confetti, a tortellino or droplets, stars on head/crit
  function hit(p, d, o = {}) {
    if (!p) return;
    const L = lod(p); if (!L) return; stats.calls++;
    const dx = d ? -d.x : 0, dy = d ? -d.y : 0, dz = d ? -d.z : 0, big = !!(o.head || o.crit || o.kill);
    reset(); at(p); SP.shape = SH.burst; SP.s0 = big ? 0.4 : 0.28; SP.s1 = big ? 1.1 : 0.75; SP.sc = 3; SP.life = big ? 0.13 : 0.1; rgb0(3.6, 3.2, 1.5, 1); rgb1(2.4, 1.6, 0.4, 0); SP.add = 0.6; emit(SYS.glow);
    if (o.color) { reset(); at(p); SP.shape = SH.ring; SP.s0 = 0.2; SP.s1 = big ? 1.4 : 0.95; SP.sc = 2.5; SP.life = 0.16; c0(o.color, 2.5, 0.9); c1(o.color, 1.5, 0); SP.add = 0.7; emit(SYS.glow); }
    const nc = cnt(big ? 14 : 8, L);
    for (let i = 0; i < nc; i++) {
      reset(); const r = dir(-0.2, 1); const sp = rnd(1, 2.4); at(p); vel(dx * rnd(0.6, 2) + r.x * sp, Math.max(0, dy) + rnd(1.2, 3), dz * rnd(0.6, 2) + r.z * sp);
      SP.g = 4.5; SP.k = 2; SP.G = 0; SP.rest = 0.15; SP.mode = MODE.tumble; SP.shape = SH.confetti; SP.s0 = SP.s1 = rnd(0.08, 0.12); SP.spin = rnd(8, 16) * sgn(); SP.life = rnd(1, 1.8);
      const c = PAL[(Math.random() * PAL.length) | 0]; c0(c, 1, 1); c1(c, 1, 1); SP.lit = 0.6; SP.add = 0; emit(SYS.glow);
    }
    const el = o.element;
    if (el === 'sugo' && Math.random() < 0.7) { reset(); at(p); vel(dx * 2 + rnd(-1, 1), rnd(2, 3.5), dz * 2 + rnd(-1, 1)); SP.g = 9.8; SP.k = 0.3; SP.G = 0; SP.rest = 0.4; SP.mode = MODE.tumble; SP.shape = SH.tortellino; SP.s0 = SP.s1 = 0.2; SP.spin = rnd(6, 12); SP.life = 1.8; rgb0(1, 0.8, 0.38, 1); rgb1(1, 0.8, 0.38, 1); SP.lit = 1; SP.add = 0; emit(SYS.glow); }
    else if (el === 'acqua') { for (let i = 0; i < 3; i++) { reset(); const r = dir(-0.3, 1); at(p); vel(dx * 1.5 + r.x * 1.5, r.y * 1.5 + 1, dz * 1.5 + r.z * 1.5); SP.g = 9.8; SP.G = 0; SP.mode = MODE.streak; SP.stretch = 0.03; SP.shape = SH.drop; SP.s0 = SP.s1 = 0.07; SP.life = 0.45; rgb0(0.55, 0.82, 1.0, 0.9); rgb1(0.7, 0.9, 1, 0.4); SP.add = 0.25; SP.lit = 0.6; emit(SYS.glow); } }
    if (big) for (let i = 0; i < (o.kill ? 3 : 2); i++) { reset(); const r = dir(0.5, 1); at(p); SP.y += 0.15; vel(r.x * 1.6, rnd(1.6, 2.8), r.z * 1.6); SP.g = 5.5; SP.k = 0.8; SP.G = 0.02; SP.rest = 0.4; SP.shape = SH.star; SP.s0 = SP.s1 = 0.24; SP.spin = rnd(-8, 8); SP.life = 0.9; rgb0(1.35, 1.05, 0.15, 1); rgb1(1.35, 1.05, 0.15, 1); SP.add = 0.15; emit(SYS.glow); }
  }

  // ---- gunfire
  function muzzle(p, d, base = 'pistola') {
    if (!p || !d) return;
    const L = lod(p); if (!L) return; stats.calls++;
    const el = base === 'pistola' ? 'acqua' : base === 'tortellini' ? 'sugo' : base === 'nerf' ? 'schiuma' : base === 'spritz' ? 'spritz' : 'acqua';
    const H = ELEM[el], big = base === 'spritz';
    reset(); at(p); SP.shape = SH.glow; SP.s0 = big ? 0.3 : 0.14; SP.s1 = big ? 1.0 : 0.46; SP.sc = 3; SP.life = big ? 0.1 : 0.05; rgb0(H[0], H[1], H[2], 1); rgb1(H[0] * 0.5, H[1] * 0.5, H[2] * 0.5, 0); emit(SYS.glow);
    if (big || base === 'tortellini') { reset(); at(p); SP.shape = SH.burst; SP.s0 = big ? 0.3 : 0.12; SP.s1 = big ? 0.8 : 0.34; SP.sc = 3; SP.life = big ? 0.08 : 0.06; rgb0(H[0] * 0.8, H[1] * 0.8, H[2] * 0.8, 1); rgb1(H[0] * 0.4, H[1] * 0.3, H[2] * 0.2, 0); SP.add = 0.9; emit(SYS.glow); }
    // flame tongues / water spray along the barrel
    const nt = big ? 5 : 3;
    for (let i = 0; i < nt; i++) {
      reset(); at(p); const sp = rnd(5, 9) * (big ? 1.3 : 1), j = i ? 0.35 : 0.05;
      vel((d.x + rnd(-j, j)) * sp, (d.y + rnd(-j, j)) * sp, (d.z + rnd(-j, j)) * sp); SP.mode = MODE.streak; SP.stretch = big ? 0.05 : 0.025; SP.k = 6;
      SP.s0 = big ? 0.2 : 0.07; SP.s1 = SP.s0 * 0.6; SP.life = rnd(0.045, 0.07) * (big ? 1.6 : 1);
      if (el === 'acqua') { SP.shape = SH.drop; rgb0(1.2, 2.4, 4, 0.9); rgb1(0.6, 1.2, 2.5, 0); SP.add = 0.6; }
      else { SP.shape = SH.fire; rgb0(H[0], H[1], H[2], 0.9); rgb1(H[0] * 0.5, H[1] * 0.3, H[2] * 0.2, 0); SP.add = 0.8; }
      emit(SYS.glow);
    }
    if (el === 'acqua') for (let i = 0; i < 2; i++) { reset(); at(p); const sp = rnd(2, 4); vel(d.x * sp + rnd(-0.4, 0.4), d.y * sp + rnd(0, 0.6), d.z * sp + rnd(-0.4, 0.4)); SP.g = 9.8; SP.mode = MODE.streak; SP.stretch = 0.03; SP.shape = SH.drop; SP.s0 = SP.s1 = 0.028; SP.life = 0.4; rgb0(0.55, 0.82, 1, 0.9); rgb1(0.7, 0.9, 1, 0.3); SP.add = 0.3; SP.lit = 0.6; emit(SYS.glow); }
    // smoke / flour / foam wisps
    const ns = big ? 4 : base === 'tortellini' ? 3 : 1;
    for (let i = 0; i < ns; i++) {
      reset(); at(p, 0.03, 0.03, 0.03); const sp = rnd(0.5, 1.4) * (big ? 2 : 1); vel(d.x * sp, d.y * sp + 0.35, d.z * sp); SP.k = 2.4; SP.g = -0.35;
      SP.s0 = big ? 0.25 : 0.06; SP.s1 = big ? 1.3 : 0.4; SP.sc = 2; SP.life = rnd(0.6, 1.0) * (big ? 1.4 : 1); SP.lit = 1; SP.add = 0; SP.shape = SH.smoke; SP.fadeIn = 0.02;
      if (base === 'tortellini') rgb0(1, 0.98, 0.92, 0.55); else if (big) rgb0(0.92, 0.86, 0.8, 0.55); else rgb0(0.85, 0.9, 0.95, 0.25);
      rgb1(1, 1, 1, 0); emit(SYS.smoke);
    }
    if (big) { // back-blast behind the shoulder
      for (let i = 0; i < cnt(4, L); i++) { reset(); at(p); const sp = rnd(2.5, 5), sd = sgn() * rnd(1.5, 3); vel(-d.x * sp - d.z * sd, -d.y * sp + rnd(0.3, 1), -d.z * sp + d.x * sd); SP.x -= d.x * 0.9; SP.y -= d.y * 0.9; SP.z -= d.z * 0.9; SP.k = 3; SP.g = -0.5; SP.s0 = 0.25; SP.s1 = rnd(0.8, 1.1); SP.sc = 2; SP.life = rnd(0.6, 0.9); rgb0(0.9, 0.85, 0.8, 0.35); rgb1(1, 1, 1, 0); SP.lit = 1; SP.add = 0; SP.shape = SH.smoke; emit(SYS.smoke); }
      shake(0.03, p, 4);
    }
  }
  const UPV = new THREE.Vector3(0, 1, 0);
  function casing(p, d, base = 'pistola', groundY = 0) {
    if (!p || !d || (base !== 'pistola' && base !== 'spritz')) return;
    if (!lod(p)) return;
    // ejection to the right of the barrel, up and a bit back
    let rx = -d.z, rz = d.x; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
    reset(); at(p); SP.x -= d.x * 0.12; SP.y -= d.y * 0.12 - 0.02; SP.z -= d.z * 0.12; const cap = base === 'spritz', sp = rnd(1.2, 2.2);
    vel(rx * sp - d.x * 0.4 + rnd(-0.3, 0.3), rnd(1.6, 2.6), rz * sp - d.z * 0.4 + rnd(-0.3, 0.3));
    SP.g = 9.8; SP.k = 0.2; SP.G = groundY + 0.01; SP.rest = 0.45; SP.mode = MODE.tumble; SP.spin = rnd(15, 26) * sgn(); SP.life = cap ? 2.2 : 1.5;
    if (cap) { SP.shape = SH.cap; SP.s0 = SP.s1 = 0.075; rgb0(1.0, 0.78, 0.18, 1); rgb1(1.0, 0.78, 0.18, 1); }
    else { SP.shape = SH.confetti; SP.s0 = SP.s1 = 0.04; rgb0(1.0, 0.68, 0.22, 1); rgb1(1.0, 0.68, 0.22, 1); }
    SP.lit = 1; SP.add = 0.12; emit(SYS.glow);
  }
  function tracer(a, b, color) {
    if (!a || !b) return;
    if (!lod(a) && !lod(b)) return;
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, dist = Math.hypot(dx, dy, dz); if (dist < 0.5) return;
    const tt = clamp(dist / 110, 0.04, 0.3), sp = dist / tt;
    reset(); at(a); vel(dx / tt, dy / tt, dz / tt); SP.life = tt; SP.mode = MODE.streak; SP.stretch = Math.min(2.2, dist * 0.5) / sp; SP.shape = SH.spark; SP.s0 = SP.s1 = 0.035;
    const v = color ? lin(color) : [1, 0.8, 0.4]; rgb0(v[0] * 4, v[1] * 4, v[2] * 4, 1); rgb1(v[0] * 3, v[1] * 3, v[2] * 3, 1); SP.fadeIn = 0.01; emit(SYS.glow);
  }

  // ---- enemies
  function poof(p, s = 1, o = {}) {
    if (!p) return;
    const L = lod(p); if (!L) return; stats.calls++;
    reset(); at(p); SP.shape = SH.burst; SP.s0 = 0.5 * s; SP.s1 = 1.9 * s; SP.sc = 3; SP.life = 0.12; rgb0(1.8, 1.7, 2.4, 0.6); rgb1(1.2, 1.1, 1.8, 0); SP.add = 0.75; emit(SYS.glow);
    const nr = cnt(10, L);
    for (let i = 0; i < nr; i++) { reset(); const a = i / Math.max(1, nr) * 6.283 + rnd(-0.2, 0.2), sp = rnd(2.2, 3.2) * s; at(p); vel(Math.cos(a) * sp, rnd(0.3, 1), Math.sin(a) * sp); SP.k = 3; SP.g = -0.5; SP.s0 = 0.4 * s; SP.s1 = 1.2 * s; SP.sc = 2; SP.life = rnd(0.8, 1.3); rgb0(0.97, 0.95, 1.0, 0.9); rgb1(1, 1, 1, 0); SP.lit = 0.7; SP.add = 0; SP.shape = SH.smoke; SP.fadeIn = 0.02; emit(SYS.smoke); }
    const nb = cnt(5, L);
    for (let i = 0; i < nb; i++) { reset(); at(p, 0.25 * s, 0.25 * s, 0.25 * s); vel(rnd(-0.4, 0.4), rnd(0.6, 1.2), rnd(-0.4, 0.4)); SP.k = 2; SP.g = -0.3; SP.s0 = 0.7 * s; SP.s1 = 1.8 * s; SP.sc = 2; SP.life = rnd(0.9, 1.3); rgb0(0.95, 0.93, 1.0, 0.85); rgb1(1, 1, 1, 0); SP.lit = 0.7; SP.add = 0; SP.shape = SH.smoke; emit(SYS.smoke); }
    const nc = cnt(16, L);
    for (let i = 0; i < nc; i++) { reset(); const r = dir(0.2, 1); at(p); vel(r.x * rnd(0.6, 2.2), rnd(3, 5.5), r.z * rnd(0.6, 2.2)); SP.g = 4.5; SP.k = 1.8; SP.G = 0; SP.rest = 0.1; SP.mode = MODE.tumble; SP.shape = SH.confetti; SP.s0 = SP.s1 = rnd(0.05, 0.08); SP.spin = rnd(8, 16) * sgn(); SP.life = rnd(1.6, 2.6); const c = PAL[(Math.random() * PAL.length) | 0]; c0(c, 1, 1); c1(c, 1, 1); SP.lit = 0.6; SP.add = 0; emit(SYS.glow); }
    const ng = cnt(8, L);
    for (let i = 0; i < ng; i++) { reset(); const r = dir(-0.3, 1); const sp = rnd(1, 3); at(p); vel(r.x * sp, r.y * sp, r.z * sp); SP.k = 2; SP.g = 0.6; SP.s0 = 0.08; SP.s1 = 0.015; SP.life = rnd(0.5, 1); rgb0(5, 4, 1.5, 1); rgb1(3, 2, 0.5, 1); emit(SYS.glow); }
    if (o.tortellini !== false) for (let i = 0; i < 2; i++) { reset(); const r = dir(0.3, 1); at(p); vel(r.x * 2, rnd(3, 4.5), r.z * 2); SP.g = 9.8; SP.k = 0.3; SP.G = 0; SP.rest = 0.4; SP.mode = MODE.tumble; SP.shape = SH.tortellino; SP.s0 = SP.s1 = 0.15; SP.spin = rnd(6, 12) * sgn(); SP.life = 2.2; rgb0(1, 0.8, 0.38, 1); rgb1(1, 0.8, 0.38, 1); SP.lit = 1; SP.add = 0; emit(SYS.glow); }
  }
  function feathers(p, n = 10) {
    if (!p) return; const L = lod(p); if (!L) return; stats.calls++;
    const nf = cnt(n, L);
    for (let i = 0; i < nf; i++) { reset(); const r = dir(-0.2, 1); const sp = rnd(1, 2.6); at(p); vel(r.x * sp, r.y * sp + 0.8, r.z * sp); SP.g = 1.6; SP.k = 2.4; SP.G = 0.02; SP.rest = 0; SP.mode = MODE.tumble; SP.shape = SH.drop; SP.s0 = SP.s1 = rnd(0.08, 0.13); SP.spin = rnd(3, 7) * sgn(); SP.life = rnd(2, 3.2); const v = Math.random() < 0.4 ? [0.55, 0.35, 0.95] : [0.82, 0.82, 0.9]; rgb0(v[0], v[1], v[2], 1); rgb1(v[0], v[1], v[2], 1); SP.lit = 1; SP.add = 0; emit(SYS.glow); }
  }
  function zombieSpawn(p, o = {}) {
    if (!p) return;
    const L = lod(p); if (!L) return; stats.calls++;
    const s = o.scale || 1, G = o.ground ?? 0, dur = o.dur ?? 1.0;
    reset(); SP.x = p.x; SP.y = G; SP.z = p.z; SP.mode = MODE.ground; SP.shape = SH.crack; SP.s0 = 0.6 * s; SP.s1 = 2.1 * s; SP.sc = 25; SP.life = rnd(7, 9); rgb0(0.05, 0.04, 0.03, 0.85); rgb1(0.05, 0.04, 0.03, 0.85); SP.add = 0; emit(SYS.decal);
    reset(); SP.x = p.x; SP.y = G; SP.z = p.z; SP.mode = MODE.ground; SP.shape = SH.ring; SP.s0 = 0.3 * s; SP.s1 = 2.4 * s; SP.sc = 3; SP.life = 0.55; rgb0(0.4, 0.3, 0.2, 0.55); rgb1(0.45, 0.38, 0.3, 0); SP.add = 0; SP.lit = 1; emit(SYS.glow);
    const nd = cnt(18 * s, L);
    for (let i = 0; i < nd; i++) { reset(); const r = dir(0.4, 1); at(p, 0.35 * s, 0, 0.35 * s); SP.y = G + 0.05; vel(r.x * rnd(0.6, 2.4), rnd(2.5, 6.5) * Math.sqrt(s), r.z * rnd(0.6, 2.4)); SP.g = 9.8; SP.k = 0.3; SP.G = G; SP.rest = 0.3; SP.mode = MODE.tumble; SP.shape = SH.chunk; SP.s0 = SP.s1 = rnd(0.09, 0.2) * s; SP.spin = rnd(6, 14) * sgn(); SP.life = rnd(1.2, 2); SP.delay = i < nd / 2 ? 0 : rnd(0, dur * 0.5); rgb0(0.3, 0.2, 0.12, 1); rgb1(0.3, 0.2, 0.12, 1); SP.lit = 1; SP.add = 0; emit(SYS.glow); }
    const ng = cnt(6 * s, L);
    for (let i = 0; i < ng; i++) { reset(); const r = dir(0.4, 1); at(p, 0.3 * s, 0, 0.3 * s); SP.y = G + 0.05; vel(r.x * 1.2, rnd(2, 4), r.z * 1.2); SP.g = 6; SP.k = 1.4; SP.G = G; SP.rest = 0.15; SP.mode = MODE.tumble; SP.shape = SH.confetti; SP.s0 = SP.s1 = rnd(0.04, 0.07); SP.spin = rnd(8, 14); SP.life = rnd(1.2, 1.8); SP.delay = rnd(0, dur * 0.5); rgb0(0.28, 0.45, 0.13, 1); rgb1(0.28, 0.45, 0.13, 1); SP.lit = 1; SP.add = 0; emit(SYS.glow); }
    for (let i = 0; i < 3; i++) { reset(); at(p, 0.2 * s, 0, 0.2 * s); SP.y = G + 0.3; vel(rnd(-0.6, 0.6), rnd(1.5, 2.5), rnd(-0.6, 0.6)); SP.k = 2.5; SP.g = -0.2; SP.G = G + 0.1; SP.s0 = 0.5 * s; SP.s1 = 1.7 * s; SP.sc = 2.5; SP.life = rnd(1, 1.4); rgb0(0.26, 0.19, 0.12, 0.85); rgb1(0.42, 0.36, 0.28, 0); SP.lit = 1; SP.add = 0; SP.shape = SH.smoke; emit(SYS.smoke); } // the burst of earth
    const nu = cnt(8 * s, L);
    for (let i = 0; i < nu; i++) { reset(); const r = dir(0, 1); at(p, 0.4 * s, 0, 0.4 * s); SP.y = G + 0.2; vel(r.x * 0.6, rnd(0.5, 1.5), r.z * 0.6); SP.k = 2; SP.g = -0.3; SP.G = G + 0.1; SP.s0 = 0.4 * s; SP.s1 = rnd(1.2, 1.6) * s; SP.sc = 2; SP.life = rnd(1.2, 2); SP.delay = rnd(0, dur * 0.8); rgb0(0.34, 0.25, 0.16, 0.8); rgb1(0.45, 0.38, 0.3, 0); SP.lit = 1; SP.add = 0; SP.shape = SH.smoke; SP.fadeIn = 0.1; emit(SYS.smoke); }
  }
  function police(p, n = 8, size = 1.2) { // alternating red / blue flashes (siren), additive: no lights
    if (!p || !lod(p)) return;
    for (let i = 0; i < n; i++) { reset(); at(p, 0.3, 0.1, 0.3); SP.shape = SH.glow; SP.s0 = size; SP.s1 = size * 1.4; SP.life = 0.13; SP.delay = i * 0.14; if (i % 2) { rgb0(0.6, 1.4, 9, 1); rgb1(0.3, 0.7, 5, 0); } else { rgb0(9, 0.7, 0.5, 1); rgb1(5, 0.3, 0.2, 0); } emit(SYS.glow); }
  }
  function bossEntrance(p) {
    if (!p) return; const L = lod(p); if (!L) return;
    zombieSpawn(p, { scale: 1.8, dur: 1.2 });
    reset(); SP.x = p.x; SP.y = 0; SP.z = p.z; SP.mode = MODE.ground; SP.shape = SH.ring; SP.s0 = 0.5; SP.s1 = 10; SP.sc = 3; SP.life = 0.7; rgb0(0.6, 0.52, 0.42, 0.7); rgb1(0.6, 0.55, 0.5, 0); SP.add = 0; SP.lit = 1; emit(SYS.glow);
    const nu = cnt(16, L);
    for (let i = 0; i < nu; i++) { reset(); const a = i / Math.max(1, nu) * 6.283, sp = rnd(3, 5.5); SP.x = p.x + Math.cos(a) * 0.8; SP.y = 0.3; SP.z = p.z + Math.sin(a) * 0.8; vel(Math.cos(a) * sp, 0.4, Math.sin(a) * sp); SP.k = 2.4; SP.g = -0.25; SP.G = 0.1; SP.s0 = 0.6; SP.s1 = 2.2; SP.sc = 2; SP.life = rnd(1.6, 2.4); rgb0(0.6, 0.54, 0.45, 0.6); rgb1(0.68, 0.64, 0.58, 0); SP.lit = 1; SP.add = 0; SP.shape = SH.smoke; emit(SYS.smoke); }
    police(_p.set(p.x, 2.6, p.z), 12, 1.4);
    shake(0.045, p, 30);
  }
  function bossDeath(p) { if (!p) return; explode(_p2.set(p.x, Math.max(p.y, 1.2), p.z), { radius: 3.6, kind: 'boss' }); }
  const _p2 = new THREE.Vector3();

  // ---- cars (state objects are the caller's: { acc } accumulators, no allocation)
  function rate(st, perSec, dt) { st.acc = (st.acc || 0) + perSec * dt; const n = Math.floor(st.acc); st.acc -= n; return Math.min(n, 12); }
  function exhaust(st, x, y, z, fx, fz, vx, vz, thr, dt) {
    _p.set(x, y, z); const L = lod(_p); if (!L) return;
    const n = rate(st, (7 + 26 * thr) * Math.min(1, L * 1.4), dt);
    for (let i = 0; i < n; i++) {
      const f = (i + Math.random()) / Math.max(1, n); // spread along this frame's travel
      reset(); SP.x = x - vx * dt * f; SP.y = y; SP.z = z - vz * dt * f; const sp = rnd(0.6, 1.4);
      vel(-fx * sp + rnd(-0.2, 0.2), 0.25 + rnd(0, 0.2), -fz * sp + rnd(-0.2, 0.2)); SP.k = 1.8; SP.g = -0.4; SP.s0 = 0.07; SP.s1 = rnd(0.35, 0.6); SP.sc = 2; SP.life = rnd(0.6, 1.1);
      rgb0(0.3, 0.3, 0.32, 0.18 + 0.22 * thr); rgb1(0.55, 0.55, 0.58, 0); SP.lit = 1; SP.add = 0; SP.shape = SH.smoke; SP.fadeIn = 0.03; emit(SYS.smoke);
    }
  }
  function nitro(st, x, y, z, fx, fz, vx, vz, dt) {
    _p.set(x, y, z); if (!lod(_p)) return;
    // a flame cone glued to the pipe: the particles move WITH the car, laid out along the jet (blue core -> orange tips)
    const n = rate(st, 60, dt);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < 4; j++) {
        const d = 0.06 + j * 0.17 + rnd(0, 0.06), k = 1 - j / 4;
        reset(); SP.x = x - fx * d; SP.y = y + rnd(-0.02, 0.02); SP.z = z - fz * d; vel(vx - fx * 0.8, rnd(0, 0.15), vz - fz * 0.8);
        SP.s0 = 0.1 + 0.16 * k; SP.s1 = SP.s0 * 0.7; SP.life = rnd(0.045, 0.07); SP.shape = j ? SH.fire : SH.glow; SP.spin = rnd(-6, 6);
        if (j < 2) rgb0(1.6, 3.4, 9, 0.75); else rgb0(7, 2.6, 0.7, 0.7);
        rgb1(6, 1.6, 0.5, 0); SP.add = 0.85; emit(SYS.glow);
      }
      if (Math.random() < 0.5) { reset(); SP.x = x - fx * 0.5; SP.y = y; SP.z = z - fz * 0.5; vel(vx * 0.6 - fx * 3 + rnd(-1.5, 1.5), rnd(0, 1.5), vz * 0.6 - fz * 3 + rnd(-1.5, 1.5)); SP.k = 2; SP.g = 1; SP.s0 = 0.07; SP.s1 = 0.02; SP.life = rnd(0.25, 0.4); rgb0(8, 2, 7, 1); rgb1(2, 0.5, 3, 1); emit(SYS.glow); }
    }
  }
  function tyreSmoke(st, x, z, vx, vz, k, dt) {
    _p.set(x, 0.2, z); const L = lod(_p); if (!L) return;
    const n = rate(st, 24 * k * Math.min(1, L * 1.4), dt);
    for (let i = 0; i < n; i++) {
      reset(); SP.x = x + rnd(-0.12, 0.12); SP.y = 0.15; SP.z = z + rnd(-0.12, 0.12);
      vel(vx * 0.12 + rnd(-0.5, 0.5), rnd(0.3, 0.7), vz * 0.12 + rnd(-0.5, 0.5)); SP.k = 1.6; SP.g = -0.25; SP.G = 0.1; SP.s0 = 0.22; SP.s1 = rnd(1.1, 1.6); SP.sc = 1.6; SP.life = rnd(1.4, 2.3);
      rgb0(0.82, 0.82, 0.85, 0.42); rgb1(0.9, 0.9, 0.92, 0); SP.lit = 1; SP.add = 0; SP.shape = SH.smoke; SP.fadeIn = 0.08; emit(SYS.smoke);
    }
  }
  function dirt(st, x, z, vx, vz, k, dt) {
    _p.set(x, 0.2, z); const L = lod(_p); if (!L) return;
    const n = rate(st, 22 * k * Math.min(1, L * 1.4), dt);
    for (let i = 0; i < n; i++) {
      reset(); SP.x = x + rnd(-0.15, 0.15); SP.y = 0.12; SP.z = z + rnd(-0.15, 0.15);
      vel(vx * 0.25 + rnd(-0.6, 0.6), rnd(0.4, 0.9), vz * 0.25 + rnd(-0.6, 0.6)); SP.k = 1.8; SP.g = -0.15; SP.G = 0.05; SP.s0 = 0.25; SP.s1 = rnd(0.9, 1.3); SP.sc = 2; SP.life = rnd(1.0, 1.6);
      rgb0(0.5, 0.41, 0.29, 0.5); rgb1(0.6, 0.55, 0.45, 0); SP.lit = 1; SP.add = 0; SP.shape = SH.smoke; SP.fadeIn = 0.05; emit(SYS.smoke);
      if (Math.random() < 0.45) { reset(); SP.x = x; SP.y = 0.1; SP.z = z; vel(vx * 0.3 + rnd(-1, 1), rnd(1.5, 3), vz * 0.3 + rnd(-1, 1)); SP.g = 9.8; SP.k = 0.4; SP.G = 0; SP.rest = 0.2; SP.mode = MODE.tumble; SP.shape = SH.chunk; SP.s0 = SP.s1 = rnd(0.03, 0.06); SP.spin = rnd(10, 20); SP.life = 0.8; rgb0(0.3, 0.22, 0.14, 1); rgb1(0.3, 0.22, 0.14, 1); SP.lit = 1; SP.add = 0; emit(SYS.glow); }
    }
  }
  function crash(p, dx, dz, speed = 8) {
    if (!p) return; const L = lod(p); if (!L) return; stats.calls++;
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; const k = clamp(speed / 10, 0.4, 2);
    reset(); at(p); SP.shape = SH.burst; SP.s0 = 0.3 * k; SP.s1 = 1.1 * k; SP.sc = 3; SP.life = 0.1; rgb0(7, 6, 3, 1); rgb1(4, 2, 0.5, 0); SP.add = 0.85; emit(SYS.glow);
    const nk = cnt(clamp(speed * 2.2, 8, 34), L);
    for (let i = 0; i < nk; i++) { reset(); const r = dir(-0.1, 1); const sp = rnd(2, 7) * Math.sqrt(k); at(p, 0.3, 0.15, 0.3); vel(-dx * rnd(1, 4) + r.x * sp, r.y * sp + rnd(1, 3), -dz * rnd(1, 4) + r.z * sp); SP.g = 9.8; SP.k = 1; SP.G = 0; SP.rest = 0.35; SP.mode = MODE.streak; SP.stretch = 0.04; SP.shape = SH.spark; SP.s0 = 0.06; SP.s1 = 0.025; SP.life = rnd(0.4, 1.0); rgb0(9, 5, 1.6, 1); rgb1(4, 0.7, 0.1, 1); emit(SYS.glow); }
    const nd = cnt(clamp(speed * 0.5, 2, 9), L);
    for (let i = 0; i < nd; i++) { reset(); const r = dir(0.2, 1); at(p, 0.3, 0.1, 0.3); vel(-dx * 2 + r.x * 2.5, rnd(2, 4.5), -dz * 2 + r.z * 2.5); SP.g = 9.8; SP.k = 0.4; SP.G = 0; SP.rest = 0.35; SP.mode = MODE.tumble; SP.shape = SH.chunk; SP.s0 = SP.s1 = rnd(0.05, 0.11); SP.spin = rnd(10, 20) * sgn(); SP.life = rnd(1.4, 2.2); if (i % 2) { rgb0(0.7, 0.85, 0.95, 0.75); rgb1(0.7, 0.85, 0.95, 0.75); SP.add = 0.3; } else { rgb0(0.16, 0.16, 0.18, 1); rgb1(0.16, 0.16, 0.18, 1); SP.add = 0; } SP.lit = 1; emit(SYS.glow); }
    for (let i = 0; i < cnt(4, L); i++) { reset(); at(p, 0.4, 0.1, 0.4); vel(rnd(-0.8, 0.8), rnd(0.4, 1), rnd(-0.8, 0.8)); SP.k = 2; SP.g = -0.2; SP.s0 = 0.4; SP.s1 = rnd(1.2, 1.7); SP.sc = 2; SP.life = rnd(1, 1.6); rgb0(0.6, 0.57, 0.52, 0.5); rgb1(0.7, 0.68, 0.65, 0); SP.lit = 1; SP.add = 0; SP.shape = SH.smoke; emit(SYS.smoke); }
  }

  // ---------------------------------------------------------------- ambient (cheap, near the camera only)
  const AMB = { fountain: { acc: 0 }, nettuno: { acc: 0 }, fly: { acc: 0 }, chim: { acc: 0 }, ci: 0 };
  function mist(st, x, y0, z, r0, r1, dt) {
    const d = Math.hypot(x - CAM.x, z - CAM.z); if (d > 32) return;
    const n = rate(st, 4 * Q, dt);
    for (let i = 0; i < n; i++) { reset(); const a = Math.random() * 6.283, r = rnd(r0, r1); SP.x = x + Math.cos(a) * r; SP.y = y0 + rnd(0, 0.8); SP.z = z + Math.sin(a) * r; vel(rnd(-0.1, 0.1), rnd(0.08, 0.2), rnd(-0.1, 0.1)); SP.k = 0.5; SP.g = -0.03; SP.s0 = 0.3; SP.s1 = rnd(0.8, 1.2); SP.sc = 1.5; SP.life = rnd(2, 3); SP.fadeIn = 0.6; rgb0(0.92, 0.96, 1, 0.13); rgb1(0.95, 0.97, 1, 0); SP.lit = 1; SP.add = 0; SP.shape = SH.smoke; emit(SYS.smoke); }
  }
  function ambient(dt, night) {
    const A = window.__app; if (!A || !A.S || A.S.phase !== 'world' || dt <= 0) return;
    const lv = A.level, an = lv && lv.anchors;
    if (an && an.fountain) mist(AMB.fountain, an.fountain.x, 0.55, an.fountain.z, 0.3, 1.2, dt);
    if (NETTUNO) mist(AMB.nettuno, NETTUNO.x, 0.7, NETTUNO.z, 0.5, NETTUNO.r, dt);
    // fireflies at night over the Teletubbylandia meadow (x -96..-46, z 6..50)
    if (night > 0.45 && CAM.x > -104 && CAM.x < -38 && CAM.z > -2 && CAM.z < 58) {
      camera.getWorldDirection(CF);
      const n = rate(AMB.fly, 20 * Q * (night - 0.3), dt);
      for (let i = 0; i < n; i++) { // mostly in front of the camera, where they are seen
        reset(); SP.x = clamp(CAM.x + CF.x * 9 + rnd(-11, 11), -95, -47); SP.z = clamp(CAM.z + CF.z * 9 + rnd(-11, 11), 7, 49); SP.y = rnd(0.3, 2.4);
        vel(rnd(-0.3, 0.3), rnd(-0.1, 0.15), rnd(-0.3, 0.3)); SP.g = rnd(-0.05, 0.05); SP.s0 = 0.085; SP.s1 = 0.06; SP.life = rnd(2.5, 4.5); SP.fadeIn = 0.8; SP.cc = 1.6;
        rgb0(2.4, 4.6, 0.8, 1); rgb1(1.4, 3, 0.4, 0); emit(SYS.glow);
      }
    }
    // chimney smoke (street.js lists the chimney tops in window.__chimneys = [x, y, z, ...])
    const C = window.__chimneys;
    if (C && C.length >= 6) {
      camera.getWorldDirection(CF);
      const n = rate(AMB.chim, 9 * Q, dt);
      for (let j = 0; j < n; j++) {
        // round-robin over the chimneys near and in front of the camera (one in three smokes)
        for (let tries = 0; tries < 12; tries++) {
          AMB.ci = (AMB.ci + 3) % (C.length - (C.length % 3)); const i = AMB.ci; if (i + 2 >= C.length) continue;
          const x = C[i], y = C[i + 1], z = C[i + 2], dx = x - CAM.x, dz = z - CAM.z, d = Math.hypot(dx, dz);
          if (d > 60 || (dx * CF.x + dz * CF.z) < -0.3 * d) continue;
          reset(); SP.x = x + rnd(-0.1, 0.1); SP.y = y; SP.z = z + rnd(-0.1, 0.1); vel(rnd(-0.1, 0.1), rnd(0.5, 0.8), rnd(-0.1, 0.1)); SP.k = 0.6; SP.g = -0.1; SP.s0 = 0.3; SP.s1 = rnd(1.6, 2.4); SP.sc = 1.4; SP.life = rnd(3.5, 5); SP.fadeIn = 0.5;
          rgb0(0.55, 0.55, 0.57, 0.3); rgb1(0.75, 0.75, 0.78, 0); SP.lit = 1; SP.add = 0; SP.shape = SH.smoke; emit(SYS.smoke); break;
        }
      }
    }
  }

  // ---------------------------------------------------------------- per frame
  function update(dt, night = 0) {
    const t = performance.now();
    dt = api && api.paused ? 0 : Math.min(Math.max(+dt || 0, 0), 0.1); T += dt; frame++; // paused: tests freeze the effects
    if (T > 3600) rebase();
    U.uTime.value = T;
    const n = clamp(+night || 0, 0, 1);
    U.uLight.value.setRGB(1 - 0.84 * n, 0.97 - 0.79 * n, 0.93 - 0.66 * n);
    const f = scene.fog;
    if (f && f.isFog) { U.uFogColor.value.copy(f.color); U.uFog.value.set(f.near, Math.max(f.far, f.near + 1), 1); } else U.uFog.value.z = 0;
    camera.getWorldPosition(CAM);
    Q = quality();
    try { ambient(dt, n); } catch (e) { }
    flush();
    stats.updMs = performance.now() - t;
  }
  function step(dt, night) { const p = api.paused; api.paused = false; update(dt, night); api.paused = p; } // tests: exact time steps
  function clear() { U.uClear.value = T; } // the shader hides t0 < uClear; spawns from now on (t0 >= T) stay; meshes hide themselves at lastDeath
  function alive() { // CPU estimate of the live particles (debug / tests only: scans the buffers)
    const out = {}; for (const S of LIST) { let c = 0; for (let i = 0; i < S.cap; i++) { const o = i * STRIDE, a = T - S.arr[o + 3]; if (S.arr[o + 7] > 0 && a >= 0 && a < S.arr[o + 7] && S.arr[o + 3] >= U.uClear.value) c++; } out[S.name] = c; } return out;
  }

  // ---------------------------------------------------------------- compile + upload now (loading), never mid-game
  function prewarm() {
    renderer = renderer || (window.__composer && window.__composer.renderer) || null;
    if (!renderer) return false;
    const t0 = performance.now();
    const p0 = renderer.info.programs ? renderer.info.programs.length : 0;
    const vis = LIST.map(S => S.mesh.visible);
    try {
      for (const S of LIST) { S.mesh.visible = true; S.geo.instanceCount = 1; }
      renderer.compile(root, camera, scene);
      renderer.initTexture(atlas);
      // one 1x1 render of just the particle group: vertex/index buffers on the GPU before the first explosion
      const comp = window.__composer, rt = comp && comp.readBuffer;
      const prev = renderer.getRenderTarget(), ac = renderer.autoClear;
      if (rt) {
        const vp = rt.viewport.clone(), sc = rt.scissor.clone(), st = rt.scissorTest;
        rt.viewport.set(0, 0, 1, 1); rt.scissor.set(0, 0, 1, 1); rt.scissorTest = true;
        renderer.autoClear = false; renderer.setRenderTarget(rt);
        try { renderer.render(root, camera); } finally { rt.viewport.copy(vp); rt.scissor.copy(sc); rt.scissorTest = st; renderer.setRenderTarget(prev); renderer.autoClear = ac; }
      }
    } catch (e) { console.warn('particles: prewarm', e); }
    finally { LIST.forEach((S, i) => { S.geo.instanceCount = S.wrapped ? S.cap : S.used; S.mesh.visible = vis[i]; }); }
    stats.compileMs = Math.round(performance.now() - t0);
    stats.programs0 = renderer.info.programs ? renderer.info.programs.length : -1; stats.newPrograms = stats.programs0 - p0;
    return true;
  }
  if (!prewarm()) setTimeout(prewarm, 0);

  var api = {
    qOverride: 0, paused: false,
    explode, impact, hit, muzzle, casing, tracer, poof, feathers, zombieSpawn, bossEntrance, bossDeath, police, crash,
    exhaust, nitro, tyreSmoke, dirt, update, step, clear, flush, prewarm, shake,
    emit: (sys, spec) => { if (spec && spec !== SP) { reset(); Object.assign(SP, spec); } emit(sys); },
    spec: () => reset(), SH, MODE,
    quality: () => Q, get time() { return T; }, get mobile() { return mobile; },
    systems: SYS, root, alive,
    stats: () => ({ ...stats, time: +T.toFixed(2), q: Q, mobile, cap: { ...CAP }, used: { glow: SYS.glow.used, smoke: SYS.smoke.used, decal: SYS.decal.used }, visible: LIST.filter(S => S.mesh.visible).map(S => S.name), programs: renderer && renderer.info.programs ? renderer.info.programs.length : -1 }),
  };
  INSTANCE = api;
  window.__particles = api;
  return api;
}
