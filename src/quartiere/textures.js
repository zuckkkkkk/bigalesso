// quartiere/textures.js — fast, light procedural textures for the neighbourhood (256 px, built with canvas
// draw calls + bilinear-upscaled noise instead of per-pixel fbm: a few ms each, ~1/4 of the memory of a 512 bake).
//   qmat('plaster', { color, rough, vc: true })  -> cached MeshStandardMaterial (map + normalMap), UVs in metres*k
import * as THREE from 'three';
import { canvas, normalFromHeight, rng } from '../util.js';

const N = 256;
const cache = new Map(), mcache = new Map();

// tileable smooth noise layer: s×s random grid upscaled bilinearly (wraps: extra row/col = first)
function noiseLayer(ctx, s, alpha, R, lo = 0, hi = 255, tint = null) {
  const c = canvas(s + 1, s + 1), x = c.getContext('2d'), img = x.createImageData(s + 1, s + 1), d = img.data;
  const v = []; for (let j = 0; j < s; j++) { v.push([]); for (let i = 0; i < s; i++) v[j].push(lo + R() * (hi - lo)); }
  for (let j = 0; j <= s; j++) for (let i = 0; i <= s; i++) { const g = v[j % s][i % s], o = (j * (s + 1) + i) * 4; d[o] = tint ? g * tint[0] : g; d[o + 1] = tint ? g * tint[1] : g; d[o + 2] = tint ? g * tint[2] : g; d[o + 3] = 255; }
  x.putImageData(img, 0, 0);
  ctx.save(); ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(c, 0.5, 0.5, s, s, 0, 0, N, N); ctx.restore();
}
function heightOf(c) { const d = c.getContext('2d').getImageData(0, 0, N, N).data, h = new Float32Array(N * N); for (let i = 0; i < N * N; i++) h[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 765; return h; }
function mk(c, srgb) { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; }

// each generator draws albedo on A and a height map on H (both N×N)
const GEN = {
  plaster(A, H, R) { A.fillStyle = '#ece6dc'; A.fillRect(0, 0, N, N); noiseLayer(A, 8, 0.22, R, 170, 255); noiseLayer(A, 32, 0.12, R, 180, 255); noiseLayer(A, 128, 0.08, R, 150, 255);
    H.fillStyle = '#808080'; H.fillRect(0, 0, N, N); noiseLayer(H, 64, 0.5, R); noiseLayer(H, 256, 0.35, R); return 1.2; },
  brick(A, H, R) {
    A.fillStyle = '#b8b0a2'; A.fillRect(0, 0, N, N); H.fillStyle = '#202020'; H.fillRect(0, 0, N, N);
    const bw = 64, bh = 21; for (let r = 0; r < Math.ceil(N / bh); r++) { const off = (r % 2) * bw / 2; for (let i = -1; i <= N / bw; i++) { const x = i * bw + off, y = r * bh; const k = 0.78 + R() * 0.3; A.fillStyle = `rgb(${158 * k | 0},${74 * k | 0},${50 * k | 0})`; A.fillRect(x + 2, y + 2, bw - 4, bh - 4); H.fillStyle = '#c8c8c8'; H.fillRect(x + 2, y + 2, bw - 4, bh - 4); } }
    noiseLayer(A, 64, 0.15, R, 60, 255); noiseLayer(H, 128, 0.25, R); return 3; },
  roof(A, H, R) {
    A.fillStyle = '#6a3424'; A.fillRect(0, 0, N, N); H.fillStyle = '#000'; H.fillRect(0, 0, N, N);
    const tw = 32, th = 32; for (let r = 0; r < N / th; r++) for (let i = 0; i < N / tw; i++) { const x = i * tw + (r % 2) * tw / 2, y = r * th; const k = 0.75 + R() * 0.35;
      const g = A.createLinearGradient(x, 0, x + tw, 0); g.addColorStop(0, `rgb(${120 * k | 0},${56 * k | 0},${36 * k | 0})`); g.addColorStop(0.5, `rgb(${196 * k | 0},${98 * k | 0},${62 * k | 0})`); g.addColorStop(1, `rgb(${120 * k | 0},${56 * k | 0},${36 * k | 0})`);
      for (const dx of [0, -N]) { A.fillStyle = g; A.fillRect(x + dx, y, tw - 1, th - 2); const hg = H.createLinearGradient(x + dx, 0, x + dx + tw, 0); hg.addColorStop(0, '#202020'); hg.addColorStop(0.5, '#ffffff'); hg.addColorStop(1, '#202020'); H.fillStyle = hg; H.fillRect(x + dx, y, tw - 1, th - 2); } }
    noiseLayer(A, 64, 0.12, R, 80, 255); return 2.5; },
  asphalt(A, H, R) { A.fillStyle = '#3a3c40'; A.fillRect(0, 0, N, N); noiseLayer(A, 16, 0.25, R, 30, 110); noiseLayer(A, 256, 0.35, R, 20, 150);
    for (let i = 0; i < 900; i++) { const g = 90 + R() * 90 | 0; A.fillStyle = `rgb(${g},${g},${g + 4})`; A.fillRect(R() * N, R() * N, 1 + R() * 1.5, 1 + R() * 1.5); }
    H.fillStyle = '#808080'; H.fillRect(0, 0, N, N); noiseLayer(H, 256, 0.6, R); return 1.6; },
  sidewalk(A, H, R) { A.fillStyle = '#c4bcb0'; A.fillRect(0, 0, N, N); H.fillStyle = '#d0d0d0'; H.fillRect(0, 0, N, N); const s = 64;
    for (let j = 0; j < N / s; j++) for (let i = 0; i < N / s; i++) { const k = 0.9 + R() * 0.14; A.fillStyle = `rgb(${196 * k | 0},${188 * k | 0},${176 * k | 0})`; A.fillRect(i * s + 1, j * s + 1, s - 2, s - 2); }
    A.fillStyle = '#7a746c'; H.fillStyle = '#303030'; for (let i = 0; i <= N; i += s) { A.fillRect(i - 1, 0, 2, N); A.fillRect(0, i - 1, N, 2); H.fillRect(i - 1, 0, 2, N); H.fillRect(0, i - 1, N, 2); }
    noiseLayer(A, 128, 0.18, R, 90, 255); noiseLayer(H, 256, 0.2, R); return 2; },
  terracotta(A, H, R) { A.fillStyle = '#8a8070'; A.fillRect(0, 0, N, N); H.fillStyle = '#202020'; H.fillRect(0, 0, N, N); const s = 64;
    for (let j = 0; j < N / s; j++) for (let i = 0; i < N / s; i++) { const k = 0.82 + R() * 0.26; A.fillStyle = `rgb(${190 * k | 0},${100 * k | 0},${64 * k | 0})`; A.fillRect(i * s + 2, j * s + 2, s - 4, s - 4); H.fillStyle = '#d8d8d8'; H.fillRect(i * s + 2, j * s + 2, s - 4, s - 4); }
    noiseLayer(A, 64, 0.15, R, 80, 255); noiseLayer(H, 128, 0.2, R); return 2.2; },
  cobble(A, H, R) { A.fillStyle = '#5a544c'; A.fillRect(0, 0, N, N); H.fillStyle = '#000'; H.fillRect(0, 0, N, N);
    for (let j = 0; j < 9; j++) for (let i = 0; i < 9; i++) { const cx = (i + (j % 2) * 0.5) * N / 8 + (R() - 0.5) * 6, cy = j * N / 8 + (R() - 0.5) * 6, rx = 12 + R() * 3, ry = 11 + R() * 3; const k = 0.75 + R() * 0.4;
      for (const [ox, oy] of [[0, 0], [-N, 0], [0, -N], [-N, -N]]) { A.fillStyle = `rgb(${150 * k | 0},${140 * k | 0},${128 * k | 0})`; A.beginPath(); A.ellipse(cx + ox, cy + oy, rx, ry, R(), 0, 6.283); A.fill();
        const g = H.createRadialGradient(cx + ox, cy + oy, 1, cx + ox, cy + oy, rx); g.addColorStop(0, '#fff'); g.addColorStop(1, '#333'); H.fillStyle = g; H.beginPath(); H.ellipse(cx + ox, cy + oy, rx, ry, 0, 0, 6.283); H.fill(); } }
    noiseLayer(A, 128, 0.12, R, 80, 255); return 3; },
  wood(A, H, R) { A.fillStyle = '#8a5a34'; A.fillRect(0, 0, N, N); for (let i = 0; i < 120; i++) { const y = R() * N, k = 0.7 + R() * 0.4; A.strokeStyle = `rgba(${110 * k | 0},${66 * k | 0},${36 * k | 0},0.55)`; A.lineWidth = 1 + R() * 3; A.beginPath(); A.moveTo(0, y); A.bezierCurveTo(N * 0.3, y + (R() - 0.5) * 8, N * 0.7, y + (R() - 0.5) * 8, N, y); A.stroke(); }
    H.fillStyle = '#808080'; H.fillRect(0, 0, N, N); noiseLayer(H, 32, 0.3, R); return 0.8; },
  woodFloor(A, H, R) { A.fillStyle = '#6a4a30'; A.fillRect(0, 0, N, N); H.fillStyle = '#202020'; H.fillRect(0, 0, N, N); const pw = 32;
    for (let i = 0; i < N / pw; i++) { const off = R() * N; for (const L of [0, 1]) { const y = (off + L * N * 0.55) % N; const k = 0.75 + R() * 0.35; A.fillStyle = `rgb(${168 * k | 0},${112 * k | 0},${68 * k | 0})`; A.fillRect(i * pw + 1, y, pw - 2, N * 0.55 - 2); A.fillRect(i * pw + 1, y - N, pw - 2, N * 0.55 - 2); H.fillStyle = '#c0c0c0'; H.fillRect(i * pw + 1, y, pw - 2, N * 0.55 - 2); H.fillRect(i * pw + 1, y - N, pw - 2, N * 0.55 - 2); } }
    for (let i = 0; i < 160; i++) { const x = R() * N, k = 0.6 + R() * 0.3; A.strokeStyle = `rgba(${90 * k | 0},${58 * k | 0},${32 * k | 0},0.35)`; A.lineWidth = 1; A.beginPath(); A.moveTo(x, 0); A.lineTo(x + (R() - 0.5) * 4, N); A.stroke(); } return 1.4; },
  fabric(A, H, R) { A.fillStyle = '#d8d8d8'; A.fillRect(0, 0, N, N); A.fillStyle = 'rgba(0,0,0,0.08)'; for (let i = 0; i < N; i += 3) { A.fillRect(i, 0, 1, N); A.fillRect(0, i, N, 1); } noiseLayer(A, 32, 0.12, R, 160, 255);
    H.fillStyle = '#808080'; H.fillRect(0, 0, N, N); H.fillStyle = '#b0b0b0'; for (let i = 0; i < N; i += 3) { H.fillRect(i, 0, 1, N); } return 1.0; },
  tiles(A, H, R) { A.fillStyle = '#e6e0d4'; A.fillRect(0, 0, N, N); H.fillStyle = '#e0e0e0'; H.fillRect(0, 0, N, N); A.fillStyle = '#a49c90'; H.fillStyle = '#404040'; const s = 64; for (let i = 0; i <= N; i += s) { A.fillRect(i - 1, 0, 2, N); A.fillRect(0, i - 1, N, 2); H.fillRect(i - 1, 0, 2, N); H.fillRect(0, i - 1, N, 2); } noiseLayer(A, 64, 0.06, R, 200, 255); return 1.5; },
  grass(A, H, R) { A.fillStyle = '#5c8a3a'; A.fillRect(0, 0, N, N); noiseLayer(A, 8, 0.3, R, 120, 255, [0.55, 0.85, 0.4]); noiseLayer(A, 64, 0.25, R, 100, 255, [0.5, 0.8, 0.35]);
    for (let i = 0; i < 2600; i++) { const k = 0.6 + R() * 0.6; A.fillStyle = `rgba(${70 * k | 0},${120 * k | 0},${40 * k | 0},0.7)`; A.fillRect(R() * N, R() * N, 1, 2 + R() * 3); }
    H.fillStyle = '#808080'; H.fillRect(0, 0, N, N); noiseLayer(H, 256, 0.5, R); return 1.5; },
  stone(A, H, R) { A.fillStyle = '#c8c0b2'; A.fillRect(0, 0, N, N); noiseLayer(A, 16, 0.2, R, 150, 255); noiseLayer(A, 128, 0.12, R, 120, 255); H.fillStyle = '#808080'; H.fillRect(0, 0, N, N); noiseLayer(H, 64, 0.5, R); return 1.2; },
};

export function qtex(kind) {
  if (cache.has(kind)) return cache.get(kind);
  const R = rng(kind.length * 977 + kind.charCodeAt(0));
  const a = canvas(N, N), h = canvas(N, N); const A = a.getContext('2d'), H = h.getContext('2d');
  const strength = GEN[kind](A, H, R);
  const nrm = normalFromHeight(heightOf(h), N, N, strength, true);
  const out = { map: mk(a, true), normal: mk(nrm, false) }; cache.set(kind, out); return out;
}

// cached material; vc: vertex colours (per-building tint); uv repeat is in the geometry (kit.worldUV)
export function qmat(kind, o = {}) {
  const key = kind + JSON.stringify(o); if (mcache.has(key)) return mcache.get(key);
  const T = qtex(kind);
  const m = new THREE.MeshStandardMaterial({ map: T.map, normalMap: T.normal, color: o.color ?? 0xffffff, roughness: o.rough ?? 0.9, metalness: o.metal ?? 0, vertexColors: !!o.vc, side: o.side ?? THREE.FrontSide });
  const ns = o.ns ?? 1; m.normalScale.set(ns, ns); m.name = 'q:' + kind; mcache.set(key, m); return m;
}
export function setQuarterAniso(n) { for (const t of cache.values()) { t.map.anisotropy = n; t.normal.anisotropy = n; t.map.needsUpdate = t.normal.needsUpdate = true; } }
