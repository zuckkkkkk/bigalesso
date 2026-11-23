// Level around the arcade corner: LOUNGE (through a doorway in the right wall) and an Italian GARDEN
// (through the lounge glass door), with colliders, camera blockers, zones and ambient animation.
// Coordinates (metres): arcade room x[-3.6,4.2] z[0,7] (back stone wall z=0); lounge x[4.35,10.2] z[0,7];
// garden x[-4.5,16] z[7.15,20] plus side yard x[10.35,16] z[0,7.15].
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, makeNoise, fbm, canvas, tex, normalFromHeight, clamp, batchMeshes } from './util.js';
import { RESERVED, OUTDOOR_ZONES, GATE } from './quartiere/layout.js'; // the neighbourhood beyond the garden (quartiere.js)
// 0..1: how much a point is inside the quartiere's reserved rects (distant hills/trees step aside there)
const reservedK = (x, z, m = 10) => { let k = 0; for (const r of RESERVED) { const d = Math.max(r[0] - x, x - r[2], r[1] - z, z - r[3]); k = Math.max(k, clamp(1 - d / m, 0, 1)); } return k; };

const H = 3.2;          // ceiling height
const TH = 0.15;        // wall thickness
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- textures
function woodFloorTex(low) {
  const N = low ? 512 : 1024; // 1.44 m tile: 8 planks of 0.18 m, 2 rows of 0.72 m
  const R = rng(77), noise = makeNoise(31);
  const c = canvas(N, N), x = c.getContext('2d'); const img = x.createImageData(N, N), d = img.data;
  const hgt = new Float32Array(N * N);
  const pw = N / 8, pl = N / 2;
  const tones = []; for (let i = 0; i < 32; i++) tones.push([0.86 + R() * 0.22, R() * 1000, R() < 0.15 ? 0.9 : 1]);
  for (let y = 0; y < N; y++) for (let xx = 0; xx < N; xx++) {
    const col = (xx / pw) | 0, shift = (col % 2) * pl * 0.5 + (col * 97) % (pl * 0.5);
    const yy = (y + shift) % N, row = (yy / pl) | 0, ly = yy % pl, lx = xx % pw;
    const tn = tones[(col * 4 + row) % 32];
    const grain = fbm(noise, (xx + tn[1]) * 0.05, yy * 0.006, 3, N * 0.05, N * 0.006);
    const ring = Math.sin((xx + tn[1]) * 0.09 + grain * 9) * 0.5 + 0.5;
    const k = tn[0] * (0.82 + ring * 0.12 + (grain - 0.5) * 0.3) * tn[2];
    const o = (y * N + xx) * 4;
    const gap = lx < 1 || ly < 1;
    d[o] = gap ? 40 : 168 * k; d[o + 1] = gap ? 28 : 118 * k; d[o + 2] = gap ? 18 : 74 * k; d[o + 3] = 255;
    hgt[y * N + xx] = gap ? 0 : 1 - (lx < 3 || ly < 3 ? 0.3 : 0) + grain * 0.05;
  }
  x.putImageData(img, 0, 0);
  return { map: tex(c), normalMap: tex(normalFromHeight(hgt, N, N, 2, true), { srgb: false }) };
}

function noiseTex(N, seed, base, amp, scale, oct = 4, normalStrength = 0) {
  const noise = makeNoise(seed);
  const c = canvas(N, N), x = c.getContext('2d'); const img = x.createImageData(N, N), d = img.data;
  const hgt = normalStrength ? new Float32Array(N * N) : null;
  for (let y = 0; y < N; y++) for (let xx = 0; xx < N; xx++) {
    const v = fbm(noise, xx * scale, y * scale, oct, N * scale, N * scale);
    const k = 1 + (v - 0.5) * amp; const o = (y * N + xx) * 4;
    d[o] = base[0] * k; d[o + 1] = base[1] * k; d[o + 2] = base[2] * k; d[o + 3] = 255;
    if (hgt) hgt[y * N + xx] = v;
  }
  x.putImageData(img, 0, 0);
  return { map: tex(c), normalMap: hgt ? tex(normalFromHeight(hgt, N, N, normalStrength, true), { srgb: false }) : null };
}

function grassGroundTex(low) {
  const N = low ? 256 : 512, noise = makeNoise(5), n2 = makeNoise(9);
  const c = canvas(N, N), x = c.getContext('2d'); const img = x.createImageData(N, N), d = img.data;
  for (let y = 0; y < N; y++) for (let xx = 0; xx < N; xx++) {
    const v = fbm(noise, xx * 0.02, y * 0.02, 4, N * 0.02, N * 0.02), f = n2(xx * 0.7, y * 0.7, N * 0.7, N * 0.7);
    const dirt = Math.max(0, v - 0.62) * 2.2;
    let r = 62 + f * 26, g = 98 + f * 38 + v * 20, b = 34 + f * 12;
    r += (118 - r) * dirt; g += (96 - g) * dirt; b += (64 - b) * dirt;
    const o = (y * N + xx) * 4; d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
  }
  x.putImageData(img, 0, 0); return tex(c);
}

function gravelTex() {
  const N = 512, R = rng(3); const c = canvas(N, N), x = c.getContext('2d');
  x.fillStyle = '#9c9284'; x.fillRect(0, 0, N, N);
  const hgt = new Float32Array(N * N);
  for (let i = 0; i < 2600; i++) {
    const px = R() * N, py = R() * N, r = 2 + R() * 5, g = 120 + R() * 90;
    x.fillStyle = `rgb(${g + 8},${g},${g - 14})`; x.beginPath(); x.ellipse(px, py, r, r * (0.6 + R() * 0.4), R() * 3, 0, 7); x.fill();
    for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) { const dd = (xx * xx + yy * yy) / (r * r); if (dd < 1) { const ix = ((px + xx) | 0 + N) % N, iy = ((py + yy) | 0 + N) % N; hgt[iy * N + ix] = Math.max(hgt[iy * N + ix], Math.sqrt(1 - dd) * r / 6); } }
  }
  return { map: tex(c), normalMap: tex(normalFromHeight(hgt, N, N, 1.5, true), { srgb: false }) };
}

function terracottaTex() {
  const N = 512, R = rng(14), noise = makeNoise(4); const c = canvas(N, N), x = c.getContext('2d');
  const img = x.createImageData(N, N), d = img.data; const hgt = new Float32Array(N * N); const T = N / 2;
  const tint = []; for (let i = 0; i < 4; i++) tint.push(0.86 + R() * 0.2);
  for (let y = 0; y < N; y++) for (let xx = 0; xx < N; xx++) {
    const lx = xx % T, ly = y % T, e = Math.min(lx, ly, T - 1 - lx, T - 1 - ly), o = (y * N + xx) * 4;
    if (e < 4) { d[o] = 170; d[o + 1] = 160; d[o + 2] = 146; d[o + 3] = 255; continue; }
    const k = tint[((y / T) | 0) * 2 + ((xx / T) | 0)] * (0.9 + fbm(noise, xx * 0.03, y * 0.03, 3, N * 0.03, N * 0.03) * 0.2);
    d[o] = 182 * k; d[o + 1] = 92 * k; d[o + 2] = 58 * k; d[o + 3] = 255; hgt[y * N + xx] = Math.min(1, (e - 4) / 4);
  }
  x.putImageData(img, 0, 0);
  return { map: tex(c), normalMap: tex(normalFromHeight(hgt, N, N, 2, true), { srgb: false }) };
}

function barkTex() {
  const N = 256, noise = makeNoise(8); const c = canvas(N, N), x = c.getContext('2d'); const img = x.createImageData(N, N), d = img.data;
  const hgt = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let xx = 0; xx < N; xx++) {
    const v = fbm(noise, xx * 0.08, y * 0.012, 4, N * 0.08, N * 0.012);
    const ridge = Math.pow(Math.abs(Math.sin(xx * 0.18 + v * 8)), 0.6);
    const k = 0.55 + ridge * 0.45 + (v - 0.5) * 0.3, o = (y * N + xx) * 4;
    d[o] = 96 * k; d[o + 1] = 78 * k; d[o + 2] = 62 * k; d[o + 3] = 255; hgt[y * N + xx] = ridge;
  }
  x.putImageData(img, 0, 0);
  return { map: tex(c), normalMap: tex(normalFromHeight(hgt, N, N, 3, true), { srgb: false }) };
}

function leafTex(cols, seed = 2) {
  const N = 256, R = rng(seed); const c = canvas(N, N), x = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const px = 30 + R() * (N - 60), py = 30 + R() * (N - 60), a = R() * 6.28, l = 26 + R() * 22;
    x.save(); x.translate(px, py); x.rotate(a);
    x.fillStyle = cols[(R() * cols.length) | 0];
    x.beginPath(); x.moveTo(-l, 0); x.quadraticCurveTo(0, -l * 0.42, l, 0); x.quadraticCurveTo(0, l * 0.42, -l, 0); x.fill();
    x.strokeStyle = 'rgba(255,255,230,0.25)'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(-l, 0); x.lineTo(l, 0); x.stroke();
    x.restore();
  }
  const t = tex(c); t.anisotropy = 4; return t;
}

function fabricTex(base, seed = 3, stripe = null) {
  const N = 256, R = rng(seed); const c = canvas(N, N), x = c.getContext('2d'); const img = x.createImageData(N, N), d = img.data;
  for (let y = 0; y < N; y++) for (let xx = 0; xx < N; xx++) {
    const weave = ((xx + (y % 4 < 2 ? 0 : 2)) % 4 < 2 ? 0.94 : 1.04) * (0.96 + R() * 0.08);
    let k = weave; if (stripe && Math.floor(y / stripe[0]) % 2) k *= stripe[1];
    const o = (y * N + xx) * 4; d[o] = base[0] * k; d[o + 1] = base[1] * k; d[o + 2] = base[2] * k; d[o + 3] = 255;
  }
  x.putImageData(img, 0, 0); return tex(c);
}

function rugTex() {
  const W = 1024, Hh = 768; const c = canvas(W, Hh), x = c.getContext('2d'); const R = rng(21);
  x.fillStyle = '#e9e1d2'; x.fillRect(0, 0, W, Hh);
  x.strokeStyle = '#2f3b4c'; x.lineWidth = 18; x.strokeRect(40, 40, W - 80, Hh - 80);
  x.strokeStyle = '#c2643a'; x.lineWidth = 6; x.strokeRect(78, 78, W - 156, Hh - 156);
  for (let i = 0; i < 9; i++) for (let j = 0; j < 6; j++) {
    const cx = 150 + i * 90, cy = 150 + j * 94; x.save(); x.translate(cx, cy); x.rotate(Math.PI / 4);
    x.strokeStyle = (i + j) % 3 ? '#2f3b4c' : '#c2643a'; x.lineWidth = 5; x.strokeRect(-22, -22, 44, 44); x.restore();
  }
  const img = x.getImageData(0, 0, W, Hh), d = img.data; for (let i = 0; i < d.length; i += 4) { const k = 0.92 + R() * 0.12; d[i] *= k; d[i + 1] *= k; d[i + 2] *= k; }
  x.putImageData(img, 0, 0); return tex(c);
}

function posterTex(kind) {
  const c = canvas(384, 512), x = c.getContext('2d');
  if (kind === 0) {
    const g = x.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, '#2a0e4e'); g.addColorStop(0.55, '#e06a7a'); g.addColorStop(1, '#ffb03a'); x.fillStyle = g; x.fillRect(0, 0, 384, 512);
    x.fillStyle = '#ffd83a'; x.beginPath(); x.arc(192, 300, 90, 0, 7); x.fill();
    x.fillStyle = '#1a0828'; for (let i = 0; i < 7; i++) x.fillRect(30 + i * 50, 330 - (i % 3) * 20, 26, 190);
    x.fillStyle = '#fff'; x.font = 'bold 46px Arial'; x.textAlign = 'center'; x.fillText('ROMA', 192, 90); x.font = '20px Arial'; x.fillText('SALA GIOCHI · 1987', 192, 122);
  } else {
    x.fillStyle = '#f1ead8'; x.fillRect(0, 0, 384, 512);
    const cols = ['#c8f03c', '#8a34d0', '#ff5a2a', '#2a6ad8'];
    for (let i = 0; i < 4; i++) { x.fillStyle = cols[i]; x.beginPath(); x.arc(110 + (i % 2) * 160, 150 + (i >> 1) * 170, 70, 0, 7); x.fill(); }
    x.fillStyle = '#111'; x.font = 'bold 40px Arial'; x.textAlign = 'center'; x.fillText('PRESS START', 192, 470);
  }
  return tex(c);
}

// ---------------------------------------------------------------- shader helpers
function addSway(mat, uniforms, amp, mode) {
  // mode 'inst': instanced tufts (bend by local height); 'world': whole mesh, bend by height above ground
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = uniforms.uTime; sh.uniforms.uWind = uniforms.uWind;
    sh.vertexShader = 'uniform float uTime; uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      {
      #ifdef USE_INSTANCING
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      #else
        vec3 ip = (modelMatrix * vec4(0.0,0.0,0.0,1.0)).xyz;
      #endif
        ${mode === 'world' ? 'vec3 wp = (modelMatrix * vec4(position,1.0)).xyz; float hh = max(wp.y - 0.6, 0.0); hh *= 0.35;' : 'float hh = max(position.y, 0.0);'}
        float w = sin(uTime*1.6 + ip.x*0.55 + ip.z*0.4) * 0.6 + sin(uTime*2.7 + ip.x*1.3 - ip.z*0.9 + position.x*2.0) * 0.3;
        transformed.x += w * ${amp.toFixed(3)} * uWind * hh * hh;
        transformed.z += w * ${(amp * 0.55).toFixed(3)} * uWind * hh * hh;
      }`);
  };
  mat.customProgramCacheKey = () => 'sway' + mode + amp;
}

// ---------------------------------------------------------------- level
export function buildLevel(scene, opts = {}) {
  const { low = false, lights = null, camera = null, screenTex = null, getFX = null } = opts;
  const root = new THREE.Group(); root.name = 'level'; scene.add(root);
  const colliders = [], cameraBlockers = [];
  const U = { uTime: { value: 0 }, uWind: { value: 1 } };
  const shadowy = m => { m.castShadow = true; m.receiveShadow = true; return m; };
  const recv = m => { m.receiveShadow = true; return m; };
  const box = (min, max) => colliders.push({ type: 'box', min: [min[0], min[1]], max: [max[0], max[1]] });
  const circ = (c, r) => colliders.push({ type: 'circle', c: [c[0], c[1]], r });
  const blocker = (min, max) => cameraBlockers.push({ min, max });
  if (camera) { camera.far = Math.max(camera.far, 260); camera.updateProjectionMatrix(); }
  scene.fog = new THREE.Fog(0xd6dde6, 45, 190);

  // ---------- materials ----------
  const arcadePlaster = new THREE.MeshStandardMaterial({ color: 0xe9e6e0, roughness: 0.95 });
  const loungePlaster = new THREE.MeshStandardMaterial({ color: 0xeee4d6, roughness: 0.93 });
  const accentPaint = new THREE.MeshStandardMaterial({ color: 0x4a6656, roughness: 0.9 });
  const st = noiseTex(256, 12, [222, 190, 140], 0.16, 0.05, 4, 1.2);
  st.map.wrapS = st.map.wrapT = st.normalMap.wrapS = st.normalMap.wrapT = THREE.RepeatWrapping; st.map.repeat.set(3, 2); st.normalMap.repeat.set(3, 2);
  const stucco = new THREE.MeshStandardMaterial({ map: st.map, normalMap: st.normalMap, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.92 });
  const roofTop = new THREE.MeshStandardMaterial({ color: 0x6d6158, roughness: 0.95 });
  const whiteTrim = new THREE.MeshStandardMaterial({ color: 0xf3f0e8, roughness: 0.6 });
  const woodDark = new THREE.MeshPhysicalMaterial({ color: 0x5a3b22, roughness: 0.45, clearcoat: 0.3 });
  const woodMid = new THREE.MeshPhysicalMaterial({ color: 0x8a5d36, roughness: 0.5, clearcoat: 0.2 });
  const metalBlack = new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.45, metalness: 0.6 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a45a, roughness: 0.3, metalness: 1 });
  const windowGlass = new THREE.MeshPhysicalMaterial({ color: 0xdfeef4, roughness: 0.04, transparent: true, opacity: 0.16, depthWrite: false, envMapIntensity: 1.4, side: THREE.DoubleSide });
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xcfc6b6, roughness: 0.85 });

  // ---------- wall builder (axis-aligned boxes with openings) ----------
  // dir 'z': wall at x0..x0+th spanning z from a to b ; dir 'x': wall at z0..z0+th spanning x from a to b
  // mats: [px, nx, py, ny, pz, nz]
  function wall(dir, at, a, b, openings, mats, { y0 = 0, y1 = H, collide = true } = {}) {
    const parts = []; let cur = a;
    const ops = [...openings].sort((p, q) => p.a - q.a);
    const add = (s, e, lo, hi) => { if (e - s < 1e-3 || hi - lo < 1e-3) return; parts.push([s, e, lo, hi]); };
    for (const o of ops) { add(cur, o.a, y0, y1); add(o.a, o.b, y0, o.bottom || 0); add(o.a, o.b, o.top, y1); cur = o.b; }
    add(cur, b, y0, y1);
    for (const [s, e, lo, hi] of parts) {
      const len = e - s, h = hi - lo;
      const g = dir === 'z' ? new THREE.BoxGeometry(TH, h, len) : new THREE.BoxGeometry(len, h, TH);
      const m = new THREE.Mesh(g, mats); m.receiveShadow = true;
      if (dir === 'z') m.position.set(at + TH / 2, lo + h / 2, (s + e) / 2); else m.position.set((s + e) / 2, lo + h / 2, at + TH / 2);
      root.add(m);
      const min = dir === 'z' ? [at, lo, s] : [s, lo, at], max = dir === 'z' ? [at + TH, hi, e] : [e, hi, at + TH];
      blocker(min, max);
      if (collide && lo < 0.05) box([min[0], min[2]], [max[0], max[2]]);
    }
    // casing around openings
    for (const o of ops) {
      const w = 0.07, d = 0.02;
      for (const side of [-1, 1]) {
        const off = side < 0 ? -d / 2 : TH + d / 2;
        const mk = (sx, sy, sz, px, py, pz) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), whiteTrim); m.position.set(px, py, pz); root.add(m); };
        const bot = o.bottom || 0, hh = o.top - bot;
        if (dir === 'z') {
          mk(d, hh + w, w, at + off, bot + hh / 2 + (bot ? 0 : -w / 2) + (bot ? 0 : w / 2), o.a - w / 2);
          mk(d, hh + w, w, at + off, bot + hh / 2, o.b + w / 2);
          mk(d, w, o.b - o.a + 2 * w, at + off, o.top + w / 2, (o.a + o.b) / 2);
          if (bot) mk(d + 0.04, 0.04, o.b - o.a + 2 * w, at + off + side * 0.02, bot - 0.02, (o.a + o.b) / 2);
        } else {
          mk(w, hh + w, d, o.a - w / 2, bot + hh / 2, at + off);
          mk(w, hh + w, d, o.b + w / 2, bot + hh / 2, at + off);
          mk(o.b - o.a + 2 * w, w, d, (o.a + o.b) / 2, o.top + w / 2, at + off);
          if (bot) mk(o.b - o.a + 2 * w, 0.04, d + 0.04, (o.a + o.b) / 2, bot - 0.02, at + off + side * 0.02);
        }
      }
    }
  }
  function windowPane(dir, at, a, b, bottom, top, mullions = 1) {
    const g = new THREE.Group(); root.add(g);
    const len = b - a, h = top - bottom, cx = (a + b) / 2, cy = (bottom + top) / 2;
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(len, h), windowGlass);
    const frame = (sx, sy, px, py) => { const m = new THREE.Mesh(new THREE.BoxGeometry(dir === 'z' ? 0.05 : sx, sy, dir === 'z' ? sx : 0.05), whiteTrim); if (dir === 'z') m.position.set(at + TH / 2, py, px); else m.position.set(px, py, at + TH / 2); g.add(m); };
    if (dir === 'z') { glass.rotation.y = Math.PI / 2; glass.position.set(at + TH / 2, cy, cx); } else glass.position.set(cx, cy, at + TH / 2);
    g.add(glass);
    for (let i = 1; i <= mullions; i++) frame(0.04, h, a + len * i / (mullions + 1), cy);
    frame(len, 0.04, cx, cy + h * 0.18);
    frame(len, 0.05, cx, bottom + 0.025); frame(len, 0.05, cx, top - 0.025); frame(0.05, h, a + 0.025, cy); frame(0.05, h, b - 0.025, cy);
    return g;
  }

  // ---------- architecture ----------
  const archFrom = root.children.length; // perf: everything up to the lounge floor is static -> batched below
  const A = arcadePlaster, Lp = loungePlaster, S = stucco;
  // arcade <-> lounge partition (x 4.2..4.35) with doorway z 2.2..5.0
  wall('z', 4.2, -0.15, 7.15, [{ a: 2.2, b: 5.0, top: 2.55 }], [Lp, A, Lp, Lp, S, Lp]);
  // arcade front wall (z 7..7.15) with two windows
  const arcWin = [{ a: -2.5, b: -0.9, bottom: 0.9, top: 2.35 }, { a: 1.3, b: 2.9, bottom: 0.9, top: 2.35 }];
  wall('x', 7.0, -3.61, 4.2, arcWin, [S, S, S, S, S, A]);
  for (const o of arcWin) windowPane('x', 7.0, o.a, o.b, o.bottom, o.top, 1);
  // arcade left exterior skin (stone plane inside stays from room.js)
  { const m = new THREE.Mesh(new THREE.BoxGeometry(TH, H, 7.3), [S, S, S, S, S, S]); m.position.set(-3.61 - TH / 2, H / 2, 3.5); root.add(m); box([-3.76, -0.15], [-3.61, 7.15]); blocker([-3.76, 0, -0.15], [-3.61, H, 7.15]); }
  // arcade back: invisible collider/blocker behind the stone plane (z<0)
  box([-3.76, -0.3], [4.2, 0.0]); blocker([-3.76, 0, -0.3], [4.2, H, 0.0]);
  // lounge walls
  wall('x', -0.15, 4.35, 10.2, [], [Lp, Lp, Lp, Lp, accentPaint, S]);
  const lwin = { a: 2.5, b: 4.7, bottom: 0.82, top: 2.42 };
  wall('z', 10.2, -0.15, 7.15, [lwin], [S, Lp, S, Lp, S, S]);
  windowPane('z', 10.2, lwin.a, lwin.b, lwin.bottom, lwin.top, 1);
  const door = { a: 6.4, b: 9.0, top: 2.5 };
  wall('x', 7.0, 4.35, 10.2, [door], [S, S, S, S, S, Lp]);
  // roof slabs (ceilings) + parapet + cornice
  const slab = (x0, x1, ceil) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.28, 7.6), [S, S, roofTop, ceil, S, S]);
    m.position.set((x0 + x1) / 2, H + 0.14, 3.5); root.add(m); blocker([x0, H, -0.3], [x1, H + 0.6, 7.3]);
  };
  slab(-3.76, 4.2, A); slab(4.2, 10.35, Lp);
  for (const [sx, sz, px, pz] of [[14.11, 0.15, 3.295, 7.225], [0.15, 7.3, -3.685, 3.5], [0.15, 7.3, 10.275, 3.5]]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.45, sz), S); p.position.set(px, H + 0.5, pz); root.add(p);
  }
  { const c = new THREE.Mesh(new THREE.BoxGeometry(14.4, 0.12, 0.12), whiteTrim); c.position.set(3.3, H + 0.02, 7.2); root.add(c); }
  // lounge ceiling trim + baseboards
  for (const [sx, sz, px, pz] of [[5.85, 0.02, 7.275, 0.01], [5.85, 0.02, 7.275, 6.99]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.1, sz), whiteTrim); b.position.set(px, 0.05, pz); root.add(b); }
  for (const [pz0, pz1] of [[0, 2.5], [4.7, 7]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, pz1 - pz0), whiteTrim); b.position.set(10.19, 0.05, (pz0 + pz1) / 2); root.add(b); }

  batchMeshes(root.children.slice(archFrom), root); // perf: ~200 wall/trim/frame draw calls -> ~10

  // ---------- lounge floor ----------
  const wf = woodFloorTex(low);
  for (const t of [wf.map, wf.normalMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5.85 / 1.44, 7.15 / 1.44); }
  const lf = new THREE.Mesh(new THREE.PlaneGeometry(5.85, 7.15), new THREE.MeshStandardMaterial({ map: wf.map, normalMap: wf.normalMap, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.38 }));
  lf.rotation.x = -Math.PI / 2; lf.position.set(7.275, 0, 3.5); recv(lf); root.add(lf);
  root.userData.loungeFloor = lf; // gulag.js cuts the trapdoor hole here
  // doorway thresholds
  for (const [sx, sz, px, pz] of [[0.15, 2.8, 4.275, 3.6], [2.6, 0.15, 7.7, 7.075]]) { const t = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.012, sz), stoneMat); t.position.set(px, 0.006, pz); recv(t); root.add(t); }

  // ---------- lounge furniture ----------
  const fabricSofa = new THREE.MeshStandardMaterial({ map: fabricTex([46, 96, 104], 4), roughness: 0.95 });
  const fabricChair = new THREE.MeshStandardMaterial({ map: fabricTex([196, 140, 54], 6), roughness: 0.95 });
  const rbox = (w, h, d, r, mat, x, y, z, ry = 0, parent = root) => { const m = shadowy(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat)); m.position.set(x, y, z); m.rotation.y = ry; parent.add(m); return m; };
  // rug
  { const r = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.55), new THREE.MeshStandardMaterial({ map: rugTex(), roughness: 1 })); r.rotation.x = -Math.PI / 2; r.position.set(7.3, 0.006, 3.15); recv(r); root.add(r); }
  // sofa (faces -z toward the TV)
  { const g = new THREE.Group(); g.position.set(7.3, 0, 4.62); root.add(g);
    rbox(2.25, 0.42, 0.95, 0.05, fabricSofa, 0, 0.23, 0, 0, g);
    for (const sx of [-1, 1]) rbox(0.22, 0.62, 0.95, 0.07, fabricSofa, sx * 1.02, 0.33, 0, 0, g);
    for (let i = 0; i < 3; i++) { rbox(0.6, 0.15, 0.78, 0.06, fabricSofa, -0.62 + i * 0.62, 0.5, -0.05, 0, g); rbox(0.6, 0.5, 0.2, 0.08, fabricSofa, -0.62 + i * 0.62, 0.72, 0.34, 0, g).rotation.x = -0.12; }
    rbox(0.4, 0.32, 0.1, 0.05, fabricChair, -0.7, 0.72, 0.18, 0.3, g).rotation.x = -0.3;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const l = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.015, 0.06, 8), woodDark)); l.position.set(sx * 1.05, 0.0, sz * 0.4); g.add(l); }
    box([6.15, 4.13], [8.45, 5.12]); }
  // armchair near the window (faces -x)
  { const g = new THREE.Group(); g.position.set(9.4, 0, 2.7); g.rotation.y = -Math.PI / 2 + 0.35; root.add(g);
    rbox(0.82, 0.4, 0.8, 0.05, fabricChair, 0, 0.24, 0, 0, g); for (const sx of [-1, 1]) rbox(0.16, 0.6, 0.8, 0.06, fabricChair, sx * 0.4, 0.32, 0, 0, g);
    rbox(0.82, 0.55, 0.18, 0.07, fabricChair, 0, 0.7, 0.32, 0, g).rotation.x = -0.15; rbox(0.6, 0.12, 0.62, 0.05, fabricChair, 0, 0.48, -0.04, 0, g);
    circ([9.4, 2.7], 0.5); }
  // coffee table + stuff
  { const g = new THREE.Group(); g.position.set(7.3, 0, 3.0); root.add(g);
    rbox(1.1, 0.05, 0.58, 0.015, woodMid, 0, 0.42, 0, 0, g);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const l = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.016, 0.4, 10), woodDark)); l.position.set(sx * 0.48, 0.2, sz * 0.22); l.rotation.z = sx * 0.06; g.add(l); }
    const bookC = ['#7a2a2a', '#2a4a6a', '#d0b060', '#3a3a3a'];
    for (let i = 0; i < 3; i++) rbox(0.28 - i * 0.03, 0.035, 0.2 - i * 0.02, 0.005, new THREE.MeshStandardMaterial({ color: bookC[i], roughness: 0.7 }), -0.25, 0.465 + i * 0.036, 0.05, i * 0.2, g);
    const mug = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.09, 20), new THREE.MeshPhysicalMaterial({ color: 0xc8f03c, roughness: 0.2, clearcoat: 1 }))); mug.position.set(0.25, 0.49, -0.08); g.add(mug);
    const pl = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.1, 16), new THREE.MeshStandardMaterial({ color: 0xd9d2c4, roughness: 0.6 }))); pl.position.set(0.3, 0.5, 0.12); g.add(pl);
    box([6.73, 2.69], [7.87, 3.31]); }
  // TV console + TV showing the arcade game
  { const g = new THREE.Group(); g.position.set(7.3, 0, 0.27); root.add(g);
    rbox(2.0, 0.48, 0.46, 0.02, woodMid, 0, 0.26, 0, 0, g);
    for (let i = 0; i < 3; i++) { const d = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.36, 0.01), woodDark); d.position.set(-0.64 + i * 0.64, 0.26, 0.232); g.add(d); }
    for (const sx of [-1, 1]) { const l = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.012, 0.05, 8), metalBlack)); l.position.set(sx * 0.9, 0.0, 0); g.add(l); }
    const tv = new THREE.Group(); tv.position.set(0, 0.52, -0.02); g.add(tv);
    rbox(1.3, 0.76, 0.06, 0.01, metalBlack, 0, 0.42, 0, 0, tv);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.22, 0.69), screenTex ? new THREE.MeshBasicMaterial({ map: screenTex, color: 0xd8d8d8 }) : new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.1 }));
    scr.position.set(0, 0.42, 0.031); tv.add(scr);
    const st2 = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.18), metalBlack)); st2.position.set(0, 0.0, 0); tv.add(st2);
    // speakers
    for (const sx of [-1, 1]) { rbox(0.22, 0.34, 0.2, 0.01, woodDark, sx * 0.85, 0.67, 0, 0, g); const cone = new THREE.Mesh(new THREE.CircleGeometry(0.07, 24), metalBlack); cone.position.set(sx * 0.85, 0.62, 0.101); g.add(cone); }
    box([6.28, 0.0], [8.32, 0.52]); blocker([6.28, 0, 0.0], [8.32, 1.3, 0.52]); }
  // bookshelf on the partition (lounge side, left of the doorway)
  { const g = new THREE.Group(); g.position.set(4.56, 0, 1.08); root.add(g); root.userData.bookshelf = g; // gulag.js swings it open
    const sideM = woodDark; const W2 = 1.7, Hs = 2.05, D = 0.36;
    const pnl = (sx, sy, sz, px, py, pz) => { const m = shadowy(new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), sideM)); m.position.set(px, py, pz); g.add(m); };
    pnl(D, Hs, 0.03, 0, Hs / 2, -W2 / 2); pnl(D, Hs, 0.03, 0, Hs / 2, W2 / 2); pnl(0.02, Hs, W2, -D / 2 + 0.01, Hs / 2, 0);
    for (let i = 0; i < 6; i++) pnl(D, 0.025, W2, 0, 0.05 + i * 0.4, 0);
    const R = rng(8); const nb = low ? 70 : 140; const geo = new THREE.BoxGeometry(1, 1, 1);
    const books = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.75 }), nb); let k = 0; const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    const pal = ['#7a2a2a', '#2a4a6a', '#d0b060', '#3a3a3a', '#5a7a3a', '#b86a3a', '#e8e0d0', '#4a2a5a'];
    for (let sh = 0; sh < 5 && k < nb; sh++) { let z = -W2 / 2 + 0.04; while (z < W2 / 2 - 0.08 && k < nb) { const w = 0.025 + R() * 0.035, h = 0.22 + R() * 0.12, d = 0.18 + R() * 0.1; if (R() < 0.08) { z += 0.08; continue; } const lean = R() < 0.1 ? 0.2 : 0; m4.compose(V(-0.02, 0.0625 + sh * 0.4 + h / 2, z + w / 2), q.setFromEuler(new THREE.Euler(lean, 0, 0)), V(d, h, w)); books.setMatrixAt(k, m4); books.setColorAt(k, col.set(pal[(R() * pal.length) | 0])); k++; z += w + 0.003; } }
    books.count = k; books.castShadow = true; books.receiveShadow = true; g.add(books);
    box([4.35, 0.2], [4.77, 1.96]); blocker([4.35, 0, 0.2], [4.77, 2.1, 1.96]); }
  // sideboard with record player (right of the garden door)
  { const g = new THREE.Group(); g.position.set(9.6, 0, 6.72); root.add(g);
    rbox(1.0, 0.62, 0.42, 0.015, woodMid, 0, 0.33, 0, 0, g);
    rbox(0.42, 0.1, 0.34, 0.01, woodDark, -0.18, 0.69, 0, 0, g);
    const platter = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.012, 32), new THREE.MeshPhysicalMaterial({ color: 0x0c0c0c, roughness: 0.25, clearcoat: 1 }))); platter.position.set(-0.2, 0.75, 0); g.add(platter);
    const label = new THREE.Mesh(new THREE.CircleGeometry(0.05, 24), new THREE.MeshStandardMaterial({ color: 0xc8f03c })); label.rotation.x = -Math.PI / 2; label.position.set(-0.2, 0.757, 0); g.add(label);
    g.userData.platter = platter; root.userData.platter = platter;
    const arm = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.2), brass)); arm.position.set(-0.03, 0.77, 0.03); arm.rotation.y = 0.4; g.add(arm);
    box([9.08, 6.49], [10.12, 6.95]); }
  // posters on the back wall
  [[5.35, 0], [9.25, 1]].forEach(([px, k]) => {
    const fr = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.82, 0.03), metalBlack)); fr.position.set(px, 1.65, 0.02); root.add(fr);
    const pp = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.74), new THREE.MeshStandardMaterial({ map: posterTex(k), roughness: 0.5 })); pp.position.set(px, 1.65, 0.036); root.add(pp);
  });
  // pendant lamp + floor lamp
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xffd8a0, emissiveIntensity: 0.0, roughness: 0.5 });
  { const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.9, 6), metalBlack); cord.position.set(7.3, H - 0.45, 3.0); root.add(cord);
    const sh = shadowy(new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.24, 32, 1, true), new THREE.MeshStandardMaterial({ color: 0x2a3a30, roughness: 0.5, side: THREE.DoubleSide }))); sh.position.set(7.3, H - 1.0, 3.0); root.add(sh);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), lampMat); bulb.position.set(7.3, H - 1.08, 3.0); root.add(bulb); }
  { const g = new THREE.Group(); g.position.set(4.85, 0, 5.55); root.add(g);
    const base = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.04, 24), metalBlack)); base.position.y = 0.02; g.add(base);
    const curve = new THREE.CatmullRomCurve3([V(0, 0.04, 0), V(0, 1.2, 0), V(0.25, 1.85, -0.2), V(0.7, 1.95, -0.6), V(1.0, 1.75, -0.85)]);
    g.add(shadowy(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.012, 8), brass)));
    const hood = shadowy(new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd9d2c4, roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide }))); hood.position.set(1.0, 1.75, -0.85); g.add(hood);
    const b2 = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), lampMat); b2.position.set(1.0, 1.68, -0.85); g.add(b2);
    circ([4.85, 5.55], 0.2); }
  const loungeLamp = new THREE.PointLight(0xffc98a, 0, 7, 2); loungeLamp.position.set(7.3, 2.0, 3.0); loungeLamp.visible = false; root.add(loungeLamp);

  // ---------- plants (pot + leaf cards) ----------
  const plantLeaf = new THREE.MeshStandardMaterial({ map: leafTex(['#2f6a2a', '#3f7d32', '#285a24', '#4d8c3a'], 5), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.7 });
  addSway(plantLeaf, U, 0.06, 'world');
  const potMat = new THREE.MeshStandardMaterial({ color: 0xb8673e, roughness: 0.8 });
  function plant(x, z, h = 1.4, s = 1, pot = true) {
    const g = new THREE.Group(); g.position.set(x, 0, z); root.add(g); const R = rng((x * 100 + z * 7) | 0);
    if (pot) { const p = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.2 * s, 0.15 * s, 0.38 * s, 20), potMat)); p.position.y = 0.19 * s; g.add(p); }
    const stem = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, h, 6), woodDark)); stem.position.y = h / 2 + 0.2; g.add(stem);
    const n = low ? 14 : 26; const cards = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.5 * s, 0.5 * s), plantLeaf, n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (let i = 0; i < n; i++) { const a = R() * 6.28, rr = 0.05 + R() * 0.25 * s, y = 0.5 + R() * h; m4.compose(V(Math.cos(a) * rr, y, Math.sin(a) * rr), q.setFromEuler(new THREE.Euler(R() * 1.2 - 0.6, a, R() * 1.2 - 0.6)), V(1, 1, 1)); cards.setMatrixAt(i, m4); }
    cards.castShadow = true; cards.receiveShadow = true; g.add(cards);
    circ([x, z], 0.26 * s); return g;
  }
  plant(5.0, 6.55, 1.3); plant(9.8, 0.55, 1.6, 1.1); plant(4.75, 2.05 + 0.25, 0.9, 0.8);

  // curtains at the lounge window (cloth with wind)
  const curtainMat = new THREE.MeshStandardMaterial({ color: 0xf2eadb, roughness: 0.9, side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
  curtainMat.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float hang = clamp((1.3 - position.y) / 2.6, 0.0, 1.0);
      transformed.x += (sin(uTime*1.3 + position.y*2.0) * 0.035 + sin(uTime*2.1 + position.y*3.7) * 0.015) * hang * hang;
      transformed.x += sin(position.z * 40.0) * 0.012;`);
  };
  for (const [z0, w] of [[2.25, 0.55], [4.55, 0.55]]) {
    const geo = new THREE.PlaneGeometry(w, 2.6, 18, 20); geo.rotateY(Math.PI / 2);
    const m = new THREE.Mesh(geo, curtainMat); m.position.set(10.1, 1.32, z0 + w / 2 - 0.05); m.castShadow = true; root.add(m);
  }
  { const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 2.9, 8), brass); rod.rotation.x = Math.PI / 2; rod.position.set(10.12, 2.64, 3.6); root.add(rod); }
  // sliding glass doors (open, stacked to the right of the opening)
  for (const k of [0, 1]) {
    const g = new THREE.Group(); g.position.set(9.0 + 0.62 + k * 0.05, 1.25, 7.2 + k * 0.06); root.add(g);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.45), windowGlass); g.add(gl);
    for (const [sx, sy, px, py] of [[1.24, 0.05, 0, 1.22], [1.24, 0.05, 0, -1.22], [0.05, 2.45, -0.6, 0], [0.05, 2.45, 0.6, 0]]) { const f = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, 0.04), metalBlack); f.position.set(px, py, 0); g.add(f); }
  }

  // ---------- garden ground ----------
  const gTex = grassGroundTex(low); gTex.wrapS = gTex.wrapT = THREE.RepeatWrapping; gTex.repeat.set(10, 7);
  const groundMat = new THREE.MeshStandardMaterial({ map: gTex, roughness: 0.95 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), groundMat);
  gTex.repeat.set(240 / 2.2, 240 / 2.2);
  ground.rotation.x = -Math.PI / 2; ground.position.set(5.75, -0.004, 10); recv(ground); root.add(ground);
  root.userData.ground = ground; // gulag.js punches the stairwell through it
  // patio (terracotta) in front of the lounge door + under the arcade facade
  const tc = terracottaTex(); for (const t of [tc.map, tc.normalMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5.75 / 0.8, 3.0 / 0.8); }
  const patio = new THREE.Mesh(new THREE.PlaneGeometry(5.75, 3.0), new THREE.MeshStandardMaterial({ map: tc.map, normalMap: tc.normalMap, roughness: 0.75 }));
  patio.rotation.x = -Math.PI / 2; patio.position.set(7.475, 0.003, 8.65); recv(patio); root.add(patio);
  // gravel path (ribbon)
  const gv = gravelTex(); for (const t of [gv.map, gv.normalMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  const gravelMat = new THREE.MeshStandardMaterial({ map: gv.map, normalMap: gv.normalMap, roughness: 0.95 });
  const pathCurves = [
    new THREE.CatmullRomCurve3([V(7.6, 0, 10.0), V(7.9, 0, 11.6), V(8.2, 0, 12.4)]),
    new THREE.CatmullRomCurve3([V(10.4, 0, 14.7), V(12.0, 0, 15.6), V(12.9, 0, 16.4)]),
    new THREE.CatmullRomCurve3([V(10.2, 0, 13.6), V(12.4, 0, 11.4), V(13.0, 0, 8.0), V(13.1, 0, 4.5)]),
    new THREE.CatmullRomCurve3([V(6.3, 0, 14.2), V(3.6, 0, 14.0), V(1.2, 0, 15.2)]),
  ];
  const ribbon = (curve, w) => {
    const n = 60, pos = [], uv = [], idx = []; let acc = 0, prev = curve.getPoint(0);
    for (let i = 0; i <= n; i++) {
      const t = i / n, p = curve.getPoint(t), tg = curve.getTangent(t); const nx = -tg.z, nz = tg.x; acc += p.distanceTo(prev); prev = p;
      pos.push(p.x + nx * w / 2, 0.006, p.z + nz * w / 2, p.x - nx * w / 2, 0.006, p.z - nz * w / 2); uv.push(0, acc / 1.2, w / 1.2, acc / 1.2);
      if (i < n) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  };
  const ringGeo = (cx, cz, r0, r1) => { const g = new THREE.RingGeometry(r0, r1, 64, 1); g.rotateX(-Math.PI / 2); g.translate(cx, 0.006, cz); const uv = g.attributes.uv, p = g.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 1.2, p.getZ(i) / 1.2); return g; };
  const FC = [8.5, 14.5];
  const pathGeo = mergeGeometries([...pathCurves.map(c => ribbon(c, 1.25)), ringGeo(FC[0], FC[1], 1.35, 2.55)].map(g => { g.deleteAttribute('normal'); return g; }));
  pathGeo.computeVertexNormals();
  const pathMesh = recv(new THREE.Mesh(pathGeo, gravelMat)); root.add(pathMesh);
  const nearPath = (x, z) => {
    if (Math.hypot(x - FC[0], z - FC[1]) < 2.8) return true;
    if (x > 4.4 && x < 10.5 && z < 10.3) return true; // patio
    for (const c of pathCurves) for (let i = 0; i <= 20; i++) { const p = c.getPoint(i / 20); if ((p.x - x) ** 2 + (p.z - z) ** 2 < 0.75 ** 2) return true; }
    return false;
  };

  // ---------- fence + hedges ----------
  const picketMat = new THREE.MeshStandardMaterial({ color: 0xece6da, roughness: 0.7 });
  const fenceRuns = [[[-4.5, 20], [GATE.x0, 20]], [[GATE.x1, 20], [16, 20]], [[16, 20], [16, 0]], [[-4.5, 7.15], [-4.5, 20]], [[10.35, 0.0], [16, 0.0]]];
  { const pk = []; for (const [[x0, z0], [x1, z1]] of fenceRuns) { const L = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(L / 0.16); for (let i = 0; i <= n; i++) pk.push([x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n, Math.atan2(x1 - x0, z1 - z0)]); }
    const pg = new THREE.BoxGeometry(0.075, 1.05, 0.022); pg.translate(0, 0.525, 0);
    const pkm = new THREE.InstancedMesh(pg, picketMat, pk.length); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    pk.forEach(([x, z, a], i) => { m4.compose(V(x, 0, z), q.setFromEuler(new THREE.Euler(0, a + Math.PI / 2, 0)), V(1, 0.94 + ((i * 37) % 7) / 60, 1)); pkm.setMatrixAt(i, m4); });
    pkm.castShadow = true; pkm.receiveShadow = true; root.add(pkm);
    for (const [[x0, z0], [x1, z1]] of fenceRuns) {
      const L = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(x1 - x0, z1 - z0);
      for (const y of [0.3, 0.8]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.07, L), picketMat); r.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); r.rotation.y = a; r.castShadow = true; root.add(r); }
      const t = 0.12; box([Math.min(x0, x1) - t, Math.min(z0, z1) - t], [Math.max(x0, x1) + t, Math.max(z0, z1) + t]);
    } }
  const hedgeMat = new THREE.MeshStandardMaterial({ color: 0x3d6a2c, roughness: 0.9 });
  const hedgeLeaf = new THREE.MeshStandardMaterial({ map: leafTex(['#2e5a22', '#3f7a2c', '#4a8a34', '#2a4e1e'], 11), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 });
  addSway(hedgeLeaf, U, 0.03, 'world');
  function hedge(x0, z0, x1, z1, h = 1.1) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, sx = Math.abs(x1 - x0), sz = Math.abs(z1 - z0);
    const core = shadowy(new THREE.Mesh(new RoundedBoxGeometry(sx, h, sz, 3, 0.15), hedgeMat)); core.position.set(cx, h / 2, cz); root.add(core);
    const n = Math.floor((sx + sz) * h * (low ? 14 : 30)); const cards = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.42, 0.42), hedgeLeaf, n); const R = rng((x0 * 13 + z1 * 7) | 0); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (let i = 0; i < n; i++) { const face = R(); let px, py, pz; if (face < 0.2) { px = cx + (R() - 0.5) * sx; pz = cz + (R() - 0.5) * sz; py = h; } else { const side = (R() * 4) | 0; py = R() * h; if (side < 2) { px = cx + (side ? 0.5 : -0.5) * sx; pz = cz + (R() - 0.5) * sz; } else { pz = cz + (side === 3 ? 0.5 : -0.5) * sz; px = cx + (R() - 0.5) * sx; } }
      m4.compose(V(px + (R() - 0.5) * 0.1, py, pz + (R() - 0.5) * 0.1), q.setFromEuler(new THREE.Euler(R() * 3, R() * 3, R() * 3)), V(1, 1, 1)); cards.setMatrixAt(i, m4); }
    cards.castShadow = true; cards.receiveShadow = true; root.add(cards);
    box([Math.min(x0, x1), Math.min(z0, z1)], [Math.max(x0, x1), Math.max(z0, z1)]);
  }
  hedge(-4.6, 6.95, -3.76, 7.4, 1.15);
  hedge(-4.2, 19.2, 3.8, 19.75, 1.2);
  hedge(15.25, 6.0, 15.75, 13.5, 1.25);
  hedge(-4.2, 10.0, -3.65, 16.5, 1.1);
  // flower beds along the facade
  const flowerCols = [0xffd83a, 0xff5a8a, 0xffffff, 0x9a6ad8, 0xff8a2a];
  function flowerBed(x0, z0, x1, z1) {
    const soil = recv(new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.12, z1 - z0), new THREE.MeshStandardMaterial({ color: 0x4a3222, roughness: 1 }))); soil.position.set((x0 + x1) / 2, 0.06, (z0 + z1) / 2); root.add(soil);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 0.08, 0.16, 0.06), stoneMat); edge.position.set((x0 + x1) / 2, 0.08, z1 + 0.03); root.add(edge);
    const n = Math.floor((x1 - x0) * (z1 - z0) * (low ? 30 : 70)); const R = rng((x0 * 9) | 0);
    const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.004, 0.004, 1, 4).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0x3a6a2a }), n);
    const heads = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.03, 0), new THREE.MeshStandardMaterial({ roughness: 0.6 }), n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    for (let i = 0; i < n; i++) { const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0), h = 0.2 + R() * 0.35; m4.compose(V(x, 0.12, z), q.identity(), V(1, h, 1)); stems.setMatrixAt(i, m4); m4.compose(V(x, 0.12 + h, z), q.setFromEuler(new THREE.Euler(R(), R(), R())), V(1, 0.7, 1)); heads.setMatrixAt(i, m4); heads.setColorAt(i, col.setHex(flowerCols[(R() * flowerCols.length) | 0])); }
    stems.receiveShadow = true; heads.castShadow = true; root.add(stems, heads);
    box([x0, z0], [x1, z1 + 0.06]);
  }
  flowerBed(-3.6, 7.2, -0.5, 7.75); flowerBed(0.6, 7.2, 4.3, 7.75);

  // ---------- trees ----------
  const bk = barkTex(); for (const t of [bk.map, bk.normalMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 3); }
  const barkMat = new THREE.MeshStandardMaterial({ map: bk.map, normalMap: bk.normalMap, roughness: 0.95 });
  const canopyLeaf = new THREE.MeshStandardMaterial({ map: leafTex(['#3e7a2e', '#4f8f36', '#2f6224', '#6aa040', '#5a8a2a'], 17), alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.75 });
  addSway(canopyLeaf, U, 0.05, 'world');
  const canopyCore = new THREE.MeshStandardMaterial({ color: 0x2f5a22, roughness: 0.9 });
  addSway(canopyCore, U, 0.04, 'world');
  const treeTops = [];
  function tree(x, z, h = 5, r = 2.2, seed = 1) {
    const g = new THREE.Group(); g.position.set(x, 0, z); root.add(g); const R = rng(seed);
    const trunk = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.26, h * 0.6, 12, 4), barkMat)); trunk.position.y = h * 0.3; g.add(trunk);
    for (let i = 0; i < 4; i++) { const a = i * 1.7 + R(), br = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.1, h * 0.35, 8), barkMat)); br.position.set(Math.cos(a) * 0.35, h * 0.62, Math.sin(a) * 0.35); br.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7); g.add(br); }
    const cy = h * 0.72; const blobs = [];
    for (let i = 0; i < 7; i++) { const a = R() * 6.28, d = R() * r * 0.55; blobs.push([Math.cos(a) * d, cy + (R() - 0.3) * r * 0.5, Math.sin(a) * d, r * (0.45 + R() * 0.3)]); }
    const core = mergeGeometries(blobs.map(([bx, by, bz, br]) => { const s = new THREE.IcosahedronGeometry(br * 0.85, 2); const p = s.attributes.position; const nz = makeNoise(seed + 3); for (let i = 0; i < p.count; i++) { const k = 0.85 + 0.3 * nz(p.getX(i) * 2 + 9, p.getY(i) * 2 + p.getZ(i)); p.setXYZ(i, p.getX(i) * k + bx, p.getY(i) * k + by, p.getZ(i) * k + bz); } s.deleteAttribute('uv'); return s; }));
    core.computeVertexNormals(); g.add(shadowy(new THREE.Mesh(core, canopyCore)));
    const n = low ? 160 : 420; const cards = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.7, 0.7), canopyLeaf, n); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (let i = 0; i < n; i++) { const b = blobs[(R() * blobs.length) | 0]; const u = R() * 2 - 1, th = R() * 6.28, s = Math.sqrt(1 - u * u), rr = b[3] * (0.75 + R() * 0.3); m4.compose(V(b[0] + s * Math.cos(th) * rr, b[1] + u * rr, b[2] + s * Math.sin(th) * rr), q.setFromEuler(new THREE.Euler(R() * 6, R() * 6, R() * 6)), V(1, 1, 1)); cards.setMatrixAt(i, m4); }
    cards.castShadow = true; cards.receiveShadow = true; g.add(cards);
    circ([x, z], 0.36); treeTops.push(V(x, cy, z));
    return g;
  }
  tree(-2.9, 18.2, 5.4, 2.3, 3); tree(14.3, 18.0, 6.0, 2.6, 5); tree(14.2, 10.2, 4.8, 2.1, 7); tree(13.5, 2.1, 5.2, 2.2, 9);
  // cypresses along the far fence (Italian touch)
  const cypMat = new THREE.MeshStandardMaterial({ color: 0x24401c, roughness: 0.95 }); addSway(cypMat, U, 0.025, 'world');
  function cypress(x, z, h) { const geo = new THREE.LatheGeometry(Array.from({ length: 14 }, (_, i) => { const t = i / 13; return new THREE.Vector2(Math.max(0.02, Math.sin(Math.pow(t, 0.75) * Math.PI) * 0.55 * (1 - t * 0.35)), t * h); }), 12); const p = geo.attributes.position, nz = makeNoise(x * 10 | 0); for (let i = 0; i < p.count; i++) { const k = 0.85 + 0.3 * nz(p.getX(i) * 4 + 3, p.getY(i) * 3 + p.getZ(i) * 4); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } geo.computeVertexNormals(); const m = shadowy(new THREE.Mesh(geo, cypMat)); m.position.set(x, 0, z); root.add(m); circ([x, z], 0.4); }
  cypress(5.2, 19.45, 6.5); cypress(7.2, 19.4, 7.2); cypress(9.4, 19.45, 6.2); cypress(11.5, 19.4, 6.8);

  // ---------- fountain ----------
  const fountainGroup = new THREE.Group(); fountainGroup.position.set(FC[0], 0, FC[1]); root.add(fountainGroup);
  const travertine = new THREE.MeshStandardMaterial({ map: noiseTex(256, 41, [214, 204, 186], 0.18, 0.06, 4).map, roughness: 0.8 });
  { const outer = new THREE.LatheGeometry([V(1.05, 0), V(1.32, 0), V(1.32, 0.4), V(1.38, 0.46), V(1.38, 0.52), V(1.18, 0.52), V(1.12, 0.44), V(1.05, 0.08)].map(v => new THREE.Vector2(v.x, v.y)), 64);
    fountainGroup.add(shadowy(new THREE.Mesh(outer, travertine)));
    const ped = new THREE.LatheGeometry([[0.0, 0], [0.32, 0], [0.26, 0.2], [0.16, 0.3], [0.14, 0.9], [0.2, 0.95], [0.62, 1.05], [0.66, 1.12], [0.6, 1.14], [0.2, 1.08], [0.1, 1.2], [0.06, 1.38], [0.0, 1.4]].map(([a, b]) => new THREE.Vector2(a, b)), 48);
    fountainGroup.add(shadowy(new THREE.Mesh(ped, travertine))); }
  const waterU = { uTime: U.uTime };
  const waterMat = new THREE.MeshPhysicalMaterial({ color: 0x5b8f9a, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.82, envMapIntensity: 1.3, clearcoat: 1, clearcoatRoughness: 0.05 });
  waterMat.onBeforeCompile = sh => {
    sh.uniforms.uTime = waterU.uTime;
    sh.vertexShader = 'uniform float uTime;\nvarying vec2 vWq;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWq = position.xy;');
    sh.fragmentShader = 'uniform float uTime;\nvarying vec2 vWq;\n' + sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      { float r = length(vWq); vec2 d = normalize(vWq + 1e-4);
        float w = sin(r*26.0 - uTime*5.0) * 0.5 + sin(vWq.x*13.0 + uTime*1.7) * 0.25 + sin(vWq.y*11.0 - uTime*1.3) * 0.25;
        normal = normalize(normal + vec3(d * w * 0.12, 0.0)); }`);
  };
  { const w = new THREE.Mesh(new THREE.CircleGeometry(1.12, 48), waterMat); w.rotation.x = -Math.PI / 2; w.position.y = 0.4; fountainGroup.add(w);
    const w2 = new THREE.Mesh(new THREE.CircleGeometry(0.58, 32), waterMat); w2.rotation.x = -Math.PI / 2; w2.position.y = 1.11; fountainGroup.add(w2); }
  // analytic water jets (points, no CPU work)
  { const N = low ? 260 : 700; const g = new THREE.BufferGeometry(); const a = new Float32Array(N * 3); const R = rng(4);
    for (let i = 0; i < N; i++) { a[i * 3] = R() * 6.2832; a[i * 3 + 1] = R(); a[i * 3 + 2] = i < N * 0.35 ? 0 : 1; }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3)); g.setAttribute('aP', new THREE.BufferAttribute(a, 3));
    g.boundingSphere = new THREE.Sphere(V(0, 1, 0), 2);
    const m = new THREE.ShaderMaterial({ uniforms: { uTime: U.uTime, uScale: { value: 600 } }, transparent: true, depthWrite: false,
      vertexShader: `attribute vec3 aP; uniform float uTime, uScale; varying float vA;
        void main(){ float ang = aP.x; float ph = fract(uTime * (aP.z > 0.5 ? 0.55 : 0.9) + aP.y);
          vec3 p;
          if (aP.z < 0.5) { float t = ph * 0.9; p = vec3(cos(ang)*0.02*t, 1.38 + 1.6*t - 4.9*t*t*0.9, sin(ang)*0.02*t); p.y = max(p.y, 1.12); }
          else { float t = ph * 0.55; float r = 0.6 + t*0.55; p = vec3(cos(ang)*r, 1.12 - 0.2*t - 4.9*t*t*0.55, sin(ang)*r); p.y = max(p.y, 0.4); }
          vA = (1.0 - ph) * 0.8;
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(0.035 * uScale / -mv.z, 1.0, 40.0); }`,
      fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord-0.5)*2.0; float a = smoothstep(1.0,0.0,d)*vA; if(a<0.01) discard; gl_FragColor = vec4(vec3(0.85,0.93,1.0), a*0.7); }` });
    const pts = new THREE.Points(g, m); fountainGroup.add(pts); root.userData.jetMat = m; }
  circ(FC, 1.45);

  // ---------- benches + lamps ----------
  function bench(x, z, ry) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; root.add(g);
    for (let i = 0; i < 4; i++) { const s = shadowy(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.035, 0.09), woodMid)); s.position.set(0, 0.45, -0.18 + i * 0.11); g.add(s); }
    for (let i = 0; i < 3; i++) { const s = shadowy(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.09, 0.03), woodMid)); s.position.set(0, 0.62 + i * 0.12, 0.27 + i * 0.02); s.rotation.x = -0.15; g.add(s); }
    for (const sx of [-0.7, 0.7]) { const leg = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.45, 0.5), metalBlack)); leg.position.set(sx, 0.225, 0.02); g.add(leg); const back = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.45, 0.05), metalBlack)); back.position.set(sx, 0.7, 0.29); back.rotation.x = -0.15; g.add(back); }
    const c = Math.cos(ry), s = Math.sin(ry); const pts = [[-0.85, -0.3], [0.85, -0.3], [-0.85, 0.35], [0.85, 0.35]].map(([a, b]) => [x + a * c + b * s, z - a * s + b * c]);
    box([Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1]))], [Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))]);
  }
  bench(12.0, 16.9, Math.PI + 0.55); bench(-2.9, 13.2, Math.PI / 2);
  const lampGlass = new THREE.MeshStandardMaterial({ color: 0xfff4d8, emissive: 0xffc870, emissiveIntensity: 0, roughness: 0.3, transparent: true, opacity: 0.9 });
  const gardenLamps = [];
  const lampSpots = low ? [[6.4, 11.6], [11.2, 12.6]] : [[6.4, 11.6], [11.2, 12.6], [8.6, 17.4], [0.4, 9.0], [12.5, 5.5]];
  for (const [x, z] of lampSpots) {
    const g = new THREE.Group(); g.position.set(x, 0, z); root.add(g);
    const pole = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 2.6, 10), metalBlack)); pole.position.y = 1.3; g.add(pole);
    const base = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.25, 12), metalBlack)); base.position.y = 0.12; g.add(base);
    const cage = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.11, 0.32, 6, 1, true), metalBlack)); cage.material = metalBlack; cage.position.y = 2.75; g.add(cage);
    const gl = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.3, 6), lampGlass); gl.position.y = 2.75; g.add(gl);
    const hat = shadowy(new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.18, 6), metalBlack)); hat.position.y = 3.0; g.add(hat);
    const L = new THREE.PointLight(0xffc27a, 0, 13, 2); L.position.set(x, 2.7, z); L.visible = false; root.add(L); gardenLamps.push(L);
    circ([x, z], 0.16);
  }
  // pergola over the patio
  { const posts = [[4.75, 9.95], [7.55, 9.95], [10.25, 9.95]];
    for (const [x, z] of posts) { const p = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.7, 0.16), woodDark)); p.position.set(x, 1.35, z); root.add(p); circ([x, z], 0.14); }
    const beam = shadowy(new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.18, 0.12), woodDark)); beam.position.set(7.5, 2.75, 9.95); root.add(beam);
    for (let i = 0; i < 9; i++) { const r = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 3.05), woodDark)); r.position.set(4.8 + i * 0.68, 2.9, 8.5); root.add(r); }
    const vine = new THREE.MeshStandardMaterial({ map: leafTex(['#3e7a2e', '#5a8a2a', '#2f6224', '#c89adf', '#a070d0'], 23), alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.8 });
    addSway(vine, U, 0.04, 'world');
    const n = low ? 160 : 380, R = rng(12); const cards = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.55, 0.55), vine, n); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (let i = 0; i < n; i++) { const hang = R() < 0.3; m4.compose(V(4.7 + R() * 5.6, hang ? 2.4 + R() * 0.5 : 2.95 + R() * 0.15, 7.2 + R() * 2.8), q.setFromEuler(new THREE.Euler(hang ? R() * 0.6 : -Math.PI / 2 + R() * 0.8, R() * 6, R() * 0.6)), V(1, 1, 1)); cards.setMatrixAt(i, m4); }
    cards.castShadow = true; root.add(cards); }
  // raised vegetable beds + shed in the side yard
  { for (const [x, z] of [[11.6, 4.6], [11.6, 6.2]]) { const b = shadowy(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.35, 0.9), woodMid)); b.position.set(x, 0.175, z); root.add(b); const s = recv(new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.02, 0.8), new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 1 }))); s.position.set(x, 0.34, z); root.add(s); box([x - 0.9, z - 0.45], [x + 0.9, z + 0.45]); plant(x - 0.5, z, 0.25, 0.6, false); plant(x + 0.4, z + 0.1, 0.3, 0.7, false); }
    const shed = new THREE.Group(); shed.position.set(14.8, 0, 1.3); root.add(shed);
    const sb = shadowy(new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.1, 1.6), new THREE.MeshStandardMaterial({ color: 0x6a8a7a, roughness: 0.8 }))); sb.position.y = 1.05; shed.add(sb);
    const rf = shadowy(new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.08, 1.9), metalBlack)); rf.position.y = 2.15; rf.rotation.z = 0.08; shed.add(rf);
    const dr = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.7), woodDark); dr.position.set(-0.905, 0.9, 0); dr.rotation.y = -Math.PI / 2; shed.add(dr);
    box([13.9, 0.5], [15.7, 2.1]); blocker([13.9, 0, 0.5], [15.7, 2.2, 2.1]); }

  // ---------- distant countryside (no shadows, fogged) ----------
  { const hillMat = new THREE.MeshStandardMaterial({ color: 0x6f8a52, roughness: 1 });
    const ring = new THREE.RingGeometry(36, 110, 96, 6); ring.rotateX(-Math.PI / 2); const p = ring.attributes.position, nz = makeNoise(77);
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z), a = Math.atan2(z, x); const h = (fbm(nz, Math.cos(a) * 3 + 5, Math.sin(a) * 3 + 5, 4) - 0.35) * 22 * clamp((r - 36) / 30, 0, 1) * (1 - reservedK(x + 5.75, z + 10)); p.setY(i, Math.max(-0.5, h)); }
    ring.computeVertexNormals(); const hills = new THREE.Mesh(ring, hillMat); hills.position.set(5.75, -0.02, 10); root.add(hills);
    const N = low ? 70 : 180, R = rng(31); const geo = new THREE.IcosahedronGeometry(1, 1); const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x3a5a2c, roughness: 1 }), N); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    for (let i = 0; i < N; i++) { const a = R() * 6.28, r = 24 + R() * 30, x = 5.75 + Math.cos(a) * r, z = 10 + Math.sin(a) * r; const cyp = R() < 0.4; const s = (cyp ? 0.9 + R() * 0.5 : 2 + R() * 2.5) * (reservedK(x, z, 3) > 0 ? 0 : 1); m4.compose(V(x, cyp ? s * 3 : s * 0.9, z), q.identity(), cyp ? V(s, s * 4, s) : V(s * 1.2, s, s * 1.2)); im.setMatrixAt(i, m4); im.setColorAt(i, col.setRGB(0.18 + R() * 0.08, 0.3 + R() * 0.12, 0.15 + R() * 0.05)); }
    root.add(im); }

  // ---------- sky dome ----------
  const sunDir = lights && lights.key ? lights.key.position.clone().sub(lights.key.target.position).normalize() : V(-0.55, 0.62, 0.55).normalize();
  const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTime: U.uTime, uNight: { value: 0 }, uSun: { value: sunDir } },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform float uTime, uNight; uniform vec3 uSun; varying vec3 vD;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      float fb(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<4;i++){ s+=a*n(p); p*=2.03; a*=0.5; } return s; }
      void main(){
        vec3 d = normalize(vD); float y = clamp(d.y, -0.2, 1.0);
        vec3 zen = mix(vec3(0.24,0.45,0.78), vec3(0.025,0.04,0.1), uNight);
        vec3 hor = mix(vec3(0.78,0.84,0.9), vec3(0.1,0.12,0.22), uNight);
        vec3 c = mix(hor, zen, pow(max(y,0.0), 0.55));
        float s = max(dot(d, normalize(uSun)), 0.0);
        c += vec3(1.0,0.9,0.7) * (pow(s, 64.0) * 1.5 + pow(s, 6.0) * 0.18) * (1.0 - uNight);
        if (d.y > 0.0) {
          vec2 uv = d.xz / (d.y + 0.25) * 1.6 + vec2(uTime*0.006, uTime*0.002);
          float cl = smoothstep(0.5, 0.78, fb(uv)); cl *= smoothstep(0.0, 0.25, d.y);
          vec3 cc = mix(vec3(1.0,0.98,0.95), vec3(0.12,0.13,0.18), uNight);
          c = mix(c, cc * (0.85 + 0.15*fb(uv*2.0)), cl * 0.85);
          float st = step(0.9965, h(floor(d.xz/(d.y+0.3)*160.0))) * uNight * smoothstep(0.05,0.3,d.y);
          c += vec3(st);
          float m = max(dot(d, normalize(vec3(0.4,0.55,-0.6))), 0.0); c += vec3(0.9,0.92,1.0) * pow(m, 900.0) * 2.0 * uNight;
        }
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), skyMat); sky.frustumCulled = false; sky.renderOrder = 1000; scene.add(sky); // drawn after opaques: only fills empty (depth=1) pixels

  // ---------- critters: butterflies + birds + falling leaves ----------
  const flyers = [];
  { const wingMat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.6, emissive: 0x000000 });
    const cols = [0xffd83a, 0xffffff, 0xff8a2a, 0x8ad0ff];
    for (let i = 0; i < (low ? 4 : 9); i++) {
      const g = new THREE.Group(); const m = wingMat.clone(); m.color.setHex(cols[i % cols.length]);
      for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.CircleGeometry(0.035, 6), m); w.geometry.translate(0.035 * s, 0, 0); w.userData.s = s; g.add(w); }
      root.add(g); flyers.push({ g, home: V(-3 + Math.random() * 16, 0.6, 7.8 + Math.random() * 10), ph: Math.random() * 99, sp: 0.5 + Math.random() * 0.5 });
    } }
  const birds = [];
  { const bm = new THREE.MeshBasicMaterial({ color: 0x1a1a22, side: THREE.DoubleSide, fog: true });
    for (let i = 0; i < (low ? 3 : 7); i++) { const g = new THREE.Group(); for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.08), bm); w.geometry.translate(0.175 * s, 0, 0); w.userData.s = s; g.add(w); } root.add(g); birds.push({ g, r: 10 + Math.random() * 10, y: 13 + Math.random() * 6, ph: Math.random() * 6.28, sp: 0.15 + Math.random() * 0.1 }); } }
  const leaves = [];
  { const lm = new THREE.MeshStandardMaterial({ color: 0xc89a3a, side: THREE.DoubleSide, roughness: 0.8 });
    const lg = new THREE.PlaneGeometry(0.06, 0.04);
    for (let i = 0; i < (low ? 8 : 24); i++) { const m = new THREE.Mesh(lg, lm); m.castShadow = false; root.add(m); leaves.push({ m, t: Math.random() * 8, src: treeTops[i % treeTops.length], ph: Math.random() * 6.28 }); }
    for (const l of leaves) resetLeaf(l);
  }
  function resetLeaf(l) { const s = l.src; l.m.position.set(s.x + (Math.random() - 0.5) * 3, s.y + Math.random() * 1.5, s.z + (Math.random() - 0.5) * 3); l.v = 0.35 + Math.random() * 0.3; }

  // ---------- grass tufts (instanced, swaying) — built last so it can avoid every collider ----------
  const blockedAt = (x, z) => { for (const c of colliders) { if (c.type === 'box') { if (x > c.min[0] - 0.05 && x < c.max[0] + 0.05 && z > c.min[1] - 0.05 && z < c.max[1] + 0.05) return true; } else if ((x - c.c[0]) ** 2 + (z - c.c[1]) ** 2 < (c.r + 0.05) ** 2) return true; } return false; };
  { const blade = (() => { // tuft of 9 thin tapered blades with a dark-root → sunlit-tip gradient
      const R0 = rng(5), geos = [];
      for (let k = 0; k < 9; k++) {
        const h = 0.11 + R0() * 0.17, w = 0.014 + R0() * 0.01, g = new THREE.PlaneGeometry(w, h, 1, 3); const p = g.attributes.position;
        const lean = (R0() - 0.5) * 0.5, bend = 0.05 + R0() * 0.08;
        for (let i = 0; i < p.count; i++) { const t = (p.getY(i) + h / 2) / h; p.setY(i, t * h); p.setX(i, p.getX(i) * (1 - t * 0.92) + lean * t * h); p.setZ(i, bend * t * t); }
        g.rotateY(R0() * Math.PI); g.translate((R0() - 0.5) * 0.09, 0, (R0() - 0.5) * 0.09); geos.push(g);
      }
      const m = mergeGeometries(geos); const p = m.attributes.position, c = [];
      for (let i = 0; i < p.count; i++) { const t = Math.min(1, p.getY(i) / 0.25); c.push(0.22 + t * 0.62, 0.38 + t * 0.5, 0.12 + t * 0.16); }
      m.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); return m; })();
    const gm = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8, color: 0x8fb85a });
    addSway(gm, U, 1.1, 'inst');
    const R = rng(99); const per = low ? 1500 : 3600; const tiles = [];
    const regions = [[-4.3, 7.9, 15.8, 19.1], [10.5, 0.25, 15.8, 7.9]];
    for (const [x0, z0, x1, z1] of regions) for (let tx = x0; tx < x1; tx += 5) for (let tz = z0; tz < z1; tz += 5) tiles.push([tx, tz, Math.min(x1, tx + 5), Math.min(z1, tz + 5)]);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    for (const [x0, z0, x1, z1] of tiles) {
      const pts = []; const n = Math.round(per * (x1 - x0) * (z1 - z0) / 100);
      for (let i = 0; i < n * 1.6 && pts.length < n; i++) { const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0); if (nearPath(x, z)) continue; if (Math.hypot(x - FC[0], z - FC[1]) < 1.5 || blockedAt(x, z)) continue; pts.push([x, z]); }
      if (!pts.length) continue;
      const im = new THREE.InstancedMesh(blade, gm, pts.length);
      pts.forEach(([x, z], i) => { const s = 0.75 + R() * 0.6; m4.compose(V(x, 0, z), q.setFromEuler(new THREE.Euler(0, R() * 6.28, 0)), V(s, s * (0.7 + R() * 0.7), s)); im.setMatrixAt(i, m4); const v = 0.8 + R() * 0.35; im.setColorAt(i, col.setRGB(v * (0.9 + R() * 0.2), v, v * 0.85)); });
      im.receiveShadow = !low; im.computeBoundingSphere(); root.add(im);
    } }

  // ---------- zones / walkability ----------
  const zones = [
    { name: 'Sala giochi', rect: [-3.6, 0, 4.2, 7.0] },
    { name: 'Salotto', rect: [4.2, -0.15, 10.2, 7.15] },
    { name: 'Giardino', rect: [-4.5, 7.0, 16, 20] },
    { name: 'Giardino', rect: [10.2, -0.15, 16, 7.15] },
  ];
  const zoneAt = (x, z) => { for (const zn of zones) { const r = zn.rect; if (x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]) return zn.name; } return null; };
  const bounds = { x0: -4.45, x1: 15.95, z0: 0.0, z1: 19.95 };
  function isWalkable(x, z, r = 0.2) {
    if (x < bounds.x0 + r || x > bounds.x1 - r || z < bounds.z0 + r || z > bounds.z1 - r) return false;
    if (!zoneAt(x, z)) return false;
    for (const c of colliders) {
      if (c.type === 'box') { if (x > c.min[0] - r && x < c.max[0] + r && z > c.min[1] - r && z < c.max[1] + r) return false; }
      else if ((x - c.c[0]) ** 2 + (z - c.c[1]) ** 2 < (c.r + r) ** 2) return false;
    }
    return true;
  }

  const anchors = {
    dogBed: V(9.5, 0, 0.95), dogBowl: V(8.75, 0, 0.42), ballSpawn: V(2.0, 0, 12.2), gardenCenter: V(1.2, 0, 14.0),
    loungeCenter: V(7.3, 0, 5.9), spawnArcade: V(0.22, 0, 1.36), fountain: V(FC[0], 0, FC[1]), patio: V(7.6, 0, 8.7), doorway: V(4.27, 0, 3.6), gardenDoor: V(7.7, 0, 7.07),
  };

  // ---------- light follow / outdoor / night ----------
  const key = lights && lights.key;
  const keyBase = key ? { p: key.position.clone(), t: key.target.position.clone(), sc: { l: key.shadow.camera.left, r: key.shadow.camera.right, t: key.shadow.camera.top, b: key.shadow.camera.bottom } } : null;
  const keyOff = keyBase ? keyBase.p.clone().sub(keyBase.t) : null;
  const st8 = { arc: 1, out: 0, zone: null, night: 0 };
  const tmpT = V();
  function update(dt, t, focus, cam) {
    U.uTime.value = t;
    U.uWind.value = 0.8 + Math.sin(t * 0.21) * 0.25 + Math.sin(t * 0.53) * 0.12;
    const fp = focus || (cam ? cam.position : V());
    const zn = zoneAt(fp.x, fp.z) || 'Giardino';
    const fx = getFX ? getFX() : null;
    const night = fx && typeof fx.nightAmount === 'number' ? fx.nightAmount : (fx && fx.night ? 1 : 0);
    st8.night += (night - st8.night) * Math.min(1, dt * 2);
    const camZone = cam ? zoneAt(cam.position.x, cam.position.z) : zn;
    // key light: exact original placement in the arcade (intro shots), follow the player elsewhere
    st8.arc += ((zn === 'Sala giochi' ? 1 : 0) - st8.arc) * Math.min(1, dt * 1.2);
    if (key) {
      const sn = 0.05; tmpT.set(Math.round(fp.x / sn) * sn, 0.5, Math.round(fp.z / sn) * sn);
      tmpT.lerp(keyBase.t, st8.arc);
      key.target.position.copy(tmpT); key.position.copy(tmpT).add(keyOff); key.target.updateMatrixWorld();
      const k = 1 + (1 - st8.arc) * 0.8, sc = key.shadow.camera;
      const nl = keyBase.sc.l * k, nr = keyBase.sc.r * k; if (Math.abs(sc.left - nl) > 0.01) { sc.left = nl; sc.right = nr; sc.top = keyBase.sc.t * k; sc.bottom = keyBase.sc.b * k; sc.updateProjectionMatrix(); }
    }
    const outT = (zn === 'Giardino' || OUTDOOR_ZONES.has(zn)) ? 1 : zn === 'Salotto' ? 0.22 : 0;
    st8.out += (outT - st8.out) * Math.min(1, dt * 1.5);
    if (fx && fx.setOutdoor) fx.setOutdoor(st8.out);
    // reflector only when the camera is in the arcade room (saves a full scene render elsewhere)
    if (opts.room && opts.room.reflector) opts.room.reflector.visible = camZone === 'Sala giochi';
    // night: lamps, sky, fog
    const n = st8.night;
    skyMat.uniforms.uNight.value = n;
    if (scene.fog) scene.fog.color.setRGB(0.84 - 0.74 * n, 0.87 - 0.75 * n, 0.9 - 0.68 * n);
    lampGlass.emissiveIntensity = n * 2.2;
    // point lights cost every lit pixel even at intensity 0: only enable them at night
    const lampsOn = n > 0.04;
    for (const L of gardenLamps) { L.visible = lampsOn; L.intensity = n * 15; } // pools of light, not floodlights: night has to read as night
    loungeLamp.visible = lampsOn; loungeLamp.intensity = n * 11; lampMat.emissiveIntensity = 0.4 + n * 2.0;
    sky.position.copy(cam ? cam.position : fp);
    if (root.userData.jetMat && cam) root.userData.jetMat.uniforms.uScale.value = (opts.renderer ? opts.renderer.getDrawingBufferSize(new THREE.Vector2()).y : innerHeight) * cam.projectionMatrix.elements[5] * 0.5;
    if (root.userData.platter) root.userData.platter.rotation.y -= dt * 3.5;
    // critters
    for (const f of flyers) {
      const a = t * f.sp + f.ph; f.g.position.set(f.home.x + Math.sin(a) * 1.6 + Math.sin(a * 2.3) * 0.4, f.home.y + Math.sin(a * 3.1) * 0.25 + (1 - n) * 0.2, f.home.z + Math.cos(a * 0.8) * 1.4);
      f.g.rotation.y = a + Math.PI / 2; const flap = Math.sin(t * 22 + f.ph) * 1.0;
      for (const w of f.g.children) w.rotation.y = w.userData.s * flap; f.g.visible = n < 0.5;
    }
    for (const b of birds) { const a = t * b.sp + b.ph; b.g.position.set(5.75 + Math.cos(a) * b.r, b.y + Math.sin(a * 2) * 0.6, 12 + Math.sin(a) * b.r); b.g.rotation.y = -a; const flap = Math.sin(t * 7 + b.ph) * 0.6; for (const w of b.g.children) w.rotation.z = w.userData.s * flap; b.g.visible = n < 0.5; }
    for (const l of leaves) { l.m.position.y -= l.v * dt; l.m.position.x += Math.sin(t * 1.3 + l.ph) * 0.4 * dt + U.uWind.value * 0.12 * dt; l.m.rotation.set(t * 1.7 + l.ph, t * 1.1, Math.sin(t * 2 + l.ph)); if (l.m.position.y < 0.01) resetLeaf(l); }
    // zone change → UI
    if (focus && zn !== st8.zone) { st8.zone = zn; opts.onZone && opts.onZone(zn); }
  }

  return { root, update, colliders, isWalkable, cameraBlockers, zones, zoneAt, anchors, bounds, lights: { gardenLamps, loungeLamp }, sky, get zone() { return st8.zone; }, get outdoor() { return st8.out; } };
}
