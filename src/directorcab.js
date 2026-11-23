// Second cabinet: "IL DIRETTORE INCASSA" — comic red/black/yellow art painted on canvas.
import * as THREE from 'three';
import { buildCabinet } from './cabinet.js';

const FONT = (px, w = 900) => `${w} ${px}px Impact, "Arial Black", "Helvetica Neue", Arial, sans-serif`;
function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function texOf(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }

function halftone(x, w, h, col, step = 14, rmax = 5, fx = 0.5, fy = 0.5) {
  x.fillStyle = col;
  for (let yy = 0; yy < h; yy += step) for (let xx = (yy / step) % 2 ? step / 2 : 0; xx < w; xx += step) {
    const d = Math.hypot(xx / w - fx, yy / h - fy); const r = rmax * Math.max(0, 1 - d * 1.4);
    if (r > 0.6) { x.beginPath(); x.arc(xx, yy, r, 0, 7); x.fill(); }
  }
}
function burst(x, cx, cy, r1, r2, n, fill, stroke) {
  x.beginPath(); for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * Math.PI * 2 + 0.2, r = i % 2 ? r2 : r1 * (0.85 + ((i * 37) % 7) / 30); x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } x.closePath();
  x.fillStyle = fill; x.fill(); if (stroke) { x.lineWidth = 6; x.strokeStyle = stroke; x.stroke(); }
}
function outlined(x, txt, X, Y, px, fill, stroke, lw = 10, align = 'center', rot = 0) {
  x.save(); x.translate(X, Y); x.rotate(rot); x.font = FONT(px); x.textAlign = align; x.textBaseline = 'middle';
  x.lineJoin = 'round'; x.lineWidth = lw; x.strokeStyle = stroke; x.strokeText(txt, 0, 0); x.fillStyle = fill; x.fillText(txt, 0, 0); x.restore();
}
function fist(x, cx, cy, s, rot = 0) {
  x.save(); x.translate(cx, cy); x.rotate(rot); x.scale(s, s);
  x.lineWidth = 6; x.strokeStyle = '#1a0606'; x.fillStyle = '#f0b890';
  x.beginPath(); x.roundRect(-60, -42, 120, 84, 26); x.fill(); x.stroke();
  for (let i = 0; i < 4; i++) { x.beginPath(); x.roundRect(-56 + i * 28, -50, 30, 40, 12); x.fill(); x.stroke(); }
  x.beginPath(); x.roundRect(-70, -8, 44, 34, 14); x.fill(); x.stroke();
  x.fillStyle = '#e8b880'; x.fillRect(60, -30, 70, 60); x.strokeRect(60, -30, 70, 60); // wrist
  x.restore();
}
function spritz(x, cx, cy, s) {
  x.save(); x.translate(cx, cy); x.scale(s, s); x.lineWidth = 4; x.strokeStyle = '#1a0606';
  x.fillStyle = 'rgba(255,130,30,0.95)'; x.beginPath(); x.moveTo(-30, -40); x.lineTo(30, -40); x.lineTo(24, 30); x.quadraticCurveTo(0, 46, -24, 30); x.closePath(); x.fill(); x.stroke();
  x.fillStyle = '#fff'; x.fillRect(-28, -40, 56, 6); x.fillStyle = '#ff4a10'; x.beginPath(); x.arc(22, -44, 12, 0, 7); x.fill(); x.stroke();
  x.fillStyle = '#ddd'; x.fillRect(-3, 38, 6, 40); x.fillRect(-24, 76, 48, 6); x.restore();
}
function speedLines(x, w, h, cx, cy, col, n = 60) {
  x.strokeStyle = col; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; x.lineWidth = 2 + (i % 3) * 2; x.beginPath(); x.moveTo(cx + Math.cos(a) * 80, cy + Math.sin(a) * 80); x.lineTo(cx + Math.cos(a) * 2000, cy + Math.sin(a) * 2000); x.stroke(); }
}

function marqueeArt() {
  const c = cv(1024, 284), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 284); g.addColorStop(0, '#2a0306'); g.addColorStop(1, '#5a0a10'); x.fillStyle = g; x.fillRect(0, 0, 1024, 284);
  speedLines(x, 1024, 284, 512, 142, 'rgba(255,60,40,0.25)', 70);
  halftone(x, 1024, 284, 'rgba(255,216,58,0.18)', 16, 6);
  burst(x, 900, 140, 150, 110, 12, '#ffd83a', '#1a0606');
  outlined(x, 'POW!', 900, 140, 86, '#e01818', '#1a0606', 12);
  spritz(x, 110, 132, 1.1);
  outlined(x, 'IL DIRETTORE', 500, 82, 96, '#ffffff', '#1a0606', 14);
  outlined(x, 'INCASSA', 500, 196, 132, '#ffd83a', '#a01010', 16);
  return c;
}
function sideArt() {
  // u = 0 at the cabinet front (left of the canvas), v = 0 at the top (y = 1.80 m), bottom = 0.40 m
  const c = cv(600, 1400), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 1400); g.addColorStop(0, '#120204'); g.addColorStop(0.5, '#8a0e14'); g.addColorStop(1, '#2a0306'); x.fillStyle = g; x.fillRect(0, 0, 600, 1400);
  speedLines(x, 600, 1400, 160, 420, 'rgba(255,90,40,0.22)', 80);
  halftone(x, 600, 1400, 'rgba(0,0,0,0.35)', 18, 7, 0.6, 0.6);
  burst(x, 220, 420, 230, 160, 14, '#ffd83a', '#1a0606');
  fist(x, 260, 420, 1.55, -0.25);
  outlined(x, 'SBAM!', 300, 180, 120, '#e01818', '#1a0606', 14, 'center', -0.12);
  // the director dodging (silhouette with glasses)
  x.save(); x.translate(380, 820); x.rotate(0.18);
  x.fillStyle = '#1c2a4a'; x.beginPath(); x.roundRect(-110, 40, 220, 300, 60); x.fill(); x.lineWidth = 8; x.strokeStyle = '#0a0a14'; x.stroke();
  x.fillStyle = '#f0c0a0'; x.beginPath(); x.arc(0, -40, 90, 0, 7); x.fill(); x.stroke();
  x.fillStyle = '#3a2414'; x.beginPath(); x.arc(0, -80, 92, Math.PI, 0); x.fill();
  x.lineWidth = 10; x.strokeStyle = '#111'; x.beginPath(); x.arc(-34, -40, 26, 0, 7); x.stroke(); x.beginPath(); x.arc(34, -40, 26, 0, 7); x.stroke(); x.beginPath(); x.moveTo(-8, -40); x.lineTo(8, -40); x.stroke();
  x.fillStyle = '#fff'; x.beginPath(); x.ellipse(0, 20, 30, 18, 0, 0, 7); x.fill(); x.stroke(); // "oh no" mouth
  x.fillStyle = '#f2ecdc'; x.fillRect(40, 130, 70, 50); x.fillStyle = '#c01830'; x.fillRect(46, 136, 58, 10);
  x.restore();
  outlined(x, 'DIRETTORE', 380, 1010, 64, '#ffd83a', '#1a0606', 10, 'center', 0.18);
  spritz(x, 120, 1080, 1.4); spritz(x, 500, 1180, 1.0);
  outlined(x, 'GLU GLU', 140, 1220, 56, '#ff9a1a', '#1a0606', 9, 'center', -0.1);
  // crowd at the bottom
  x.fillStyle = '#0a0204';
  for (let i = 0; i < 9; i++) { const cx = 20 + i * 70, hy = 1290 + (i % 2) * 14; x.beginPath(); x.arc(cx, hy, 26, 0, 7); x.fill(); x.fillRect(cx - 34, hy + 18, 68, 120); if (i % 3 === 0) { x.fillRect(cx - 44, hy - 60, 12, 70); x.fillRect(cx + 32, hy - 60, 12, 70); } }
  return c;
}
function baseSideArt() {
  const c = cv(640, 360), x = c.getContext('2d');
  x.fillStyle = '#1a0306'; x.fillRect(0, 0, 640, 360);
  halftone(x, 640, 360, 'rgba(224,24,24,0.55)', 16, 7, 0.5, 0.4);
  for (let i = 0; i < 3; i++) fist(x, 120 + i * 200, 200, 0.7, i % 2 ? 0.3 : -0.3);
  outlined(x, 'STOK!', 320, 80, 70, '#ffd83a', '#1a0606', 9);
  return c;
}
function baseFrontArt() {
  // a newspaper front page: the story the game is based on
  const c = cv(640, 360), x = c.getContext('2d');
  x.fillStyle = '#efe6d0'; x.fillRect(0, 0, 640, 360);
  x.fillStyle = 'rgba(120,90,40,0.08)'; for (let i = 0; i < 400; i++) x.fillRect(Math.random() * 640, Math.random() * 360, 2, 2);
  x.fillStyle = '#1a1a1a'; x.font = 'italic 700 40px Georgia, "Times New Roman", serif'; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  x.fillText('Il Corriere delle Due Torri', 320, 54);
  x.fillRect(20, 66, 600, 3); x.fillRect(20, 72, 600, 1);
  x.font = '600 14px Georgia, serif'; x.fillText('CRONACA NERA · LA CENA GOLIARDICA', 320, 92);
  x.font = FONT(58); x.fillStyle = '#a01010'; x.fillText('IL DIRETTORE INCASSA', 320, 152);
  x.fillStyle = '#333'; x.font = 'italic 18px Georgia, serif'; x.fillText('Bacio, fidanzato, destro. Ora tocca a te schivare.', 320, 184);
  x.fillStyle = '#c9bea4'; x.fillRect(30, 204, 230, 136);
  fist(x, 150, 270, 0.75, 0.2);
  x.fillStyle = '#555'; for (let r = 0; r < 8; r++) x.fillRect(290, 210 + r * 16, r === 7 ? 200 : 320, 6);
  x.strokeStyle = '#1a1a1a'; x.lineWidth = 6; x.strokeRect(3, 3, 634, 354);
  return c;
}

export function buildDirectorCabinet(screenTex) {
  const textures = {
    side: texOf(sideArt()), baseSide: texOf(baseSideArt()), baseFront: texOf(baseFrontArt()), marquee: texOf(marqueeArt()), screen: screenTex,
  };
  const cab = buildCabinet(textures, {
    trim: 0xd8141c,
    palette: ['#120406', '#3a0608', '#7a0c12', '#b81820', '#1a1a1a', '#ffb81a', '#ffd83a', '#ffffff'],
  });
  cab.group.name = 'cabinet-direttore';
  return cab;
}
