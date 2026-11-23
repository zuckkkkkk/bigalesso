// Cabinet art painted on canvas for the minigame cabinets (same layout as directorcab.js):
// marquee 1024x284, side 600x1400 (u=0 front, v=0 top at y=1.80 m), base side 640x360, base front 640x360.
import * as THREE from 'three';
import { buildCabinet } from '../cabinet.js';

const FONT = (px, w = 900) => `${w} ${px}px Impact, "Arial Black", "Helvetica Neue", Arial, sans-serif`;
function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function texOf(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
function outlined(x, txt, X, Y, px, fill, stroke, lw = 10, rot = 0, align = 'center') {
  x.save(); x.translate(X, Y); x.rotate(rot); x.font = FONT(px); x.textAlign = align; x.textBaseline = 'middle';
  x.lineJoin = 'round'; x.lineWidth = lw; x.strokeStyle = stroke; x.strokeText(txt, 0, 0); x.fillStyle = fill; x.fillText(txt, 0, 0); x.restore();
}
function drip(x, X0, X1, Y, col, n = 18, maxL = 60, seed = 3) {
  x.fillStyle = col; let s = seed;
  const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < n; i++) { const X = X0 + r() * (X1 - X0), L = 12 + r() * maxL, w = 5 + r() * 9; x.fillRect(X - w / 2, Y, w, L); x.beginPath(); x.arc(X, Y + L, w * 0.75, 0, 7); x.fill(); }
}
// a cartoon zombie (front view), arms forward
function zombie(x, cx, cy, s, shirt = '#5a4a6a', rot = 0) {
  x.save(); x.translate(cx, cy); x.rotate(rot); x.scale(s, s); x.lineWidth = 7; x.strokeStyle = '#0a1405'; x.lineJoin = 'round';
  // legs
  x.fillStyle = '#2a3048'; x.beginPath(); x.roundRect(-46, 120, 38, 130, 12); x.fill(); x.stroke(); x.beginPath(); x.roundRect(10, 120, 38, 120, 12); x.fill(); x.stroke();
  // torso (torn shirt)
  x.fillStyle = shirt; x.beginPath(); x.moveTo(-70, -10); x.lineTo(70, -10); x.lineTo(62, 130); x.lineTo(30, 118); x.lineTo(10, 136); x.lineTo(-20, 120); x.lineTo(-62, 132); x.closePath(); x.fill(); x.stroke();
  // arms reaching
  x.fillStyle = '#8fbf5a';
  x.beginPath(); x.roundRect(-110, 0, 52, 30, 14); x.fill(); x.stroke(); x.beginPath(); x.roundRect(58, 10, 60, 30, 14); x.fill(); x.stroke();
  for (const [hx, hy] of [[-120, 14], [124, 24]]) { x.beginPath(); x.arc(hx, hy, 18, 0, 7); x.fill(); x.stroke(); }
  // head
  x.beginPath(); x.ellipse(0, -62, 56, 62, 0, 0, 7); x.fill(); x.stroke();
  x.fillStyle = '#2a1a10'; x.beginPath(); x.ellipse(-10, -112, 50, 22, -0.2, 0, Math.PI, true); x.fill();
  // eyes + mouth
  x.fillStyle = '#e8ff60'; x.shadowColor = '#e8ff60'; x.shadowBlur = 18;
  x.beginPath(); x.arc(-22, -68, 12, 0, 7); x.fill(); x.beginPath(); x.arc(24, -64, 9, 0, 7); x.fill(); x.shadowBlur = 0;
  x.fillStyle = '#300'; x.beginPath(); x.ellipse(2, -24, 26, 14, 0.1, 0, 7); x.fill(); x.stroke();
  x.fillStyle = '#eee'; for (let i = -2; i <= 2; i++) x.fillRect(i * 9 - 3, -36, 6, 8);
  x.restore();
}
function zombataMarquee() {
  const c = cv(1024, 284), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 284); g.addColorStop(0, '#050a04'); g.addColorStop(1, '#14260a'); x.fillStyle = g; x.fillRect(0, 0, 1024, 284);
  // moon + skyline of Bologna (two towers) in silhouette
  x.fillStyle = '#d8ffb0'; x.shadowColor = '#b0ff60'; x.shadowBlur = 40; x.beginPath(); x.arc(880, 80, 48, 0, 7); x.fill(); x.shadowBlur = 0;
  x.fillStyle = '#020402'; x.fillRect(0, 210, 1024, 74);
  for (let i = 0; i < 20; i++) x.fillRect(i * 56, 190 + (i * 37) % 30, 48, 100);
  x.fillRect(820, 60, 26, 170); x.save(); x.translate(866, 230); x.rotate(0.06); x.fillRect(0, -120, 22, 120); x.restore();
  drip(x, 40, 1000, 0, '#3a7a10', 26, 40, 7);
  outlined(x, 'LA ZOMBATA', 470, 105, 120, '#9cff3a', '#0a1a00', 16);
  outlined(x, 'DI SEGHINO', 470, 205, 70, '#ffffff', '#0a1a00', 12, -0.03);
  zombie(x, 110, 170, 0.62, '#6a3a3a', -0.12);
  return c;
}
function zombataSide() {
  const c = cv(600, 1400), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 1400); g.addColorStop(0, '#030602'); g.addColorStop(0.55, '#16300a'); g.addColorStop(1, '#050a03'); x.fillStyle = g; x.fillRect(0, 0, 600, 1400);
  x.fillStyle = 'rgba(160,255,80,0.08)'; for (let i = 0; i < 300; i++) x.fillRect((i * 97) % 600, (i * 211) % 1400, 3, 3);
  drip(x, 0, 600, 0, '#3a7a10', 14, 120, 11);
  zombie(x, 300, 560, 1.4, '#4a5a7a', 0.08);
  zombie(x, 140, 1060, 0.9, '#7a3a3a', -0.1); zombie(x, 470, 1120, 0.8, '#5a5a5a', 0.12);
  outlined(x, 'ZOMBATA!', 300, 250, 120, '#9cff3a', '#0a1a00', 14, -0.08);
  outlined(x, 'STASI SI ZOMBA', 300, 860, 58, '#e9a0ff', '#1a0020', 9, 0.05);
  // hands from the ground
  x.fillStyle = '#8fbf5a'; x.strokeStyle = '#0a1405'; x.lineWidth = 6;
  for (const hx of [80, 250, 420, 540]) { x.beginPath(); x.roundRect(hx, 1290, 34, 110, 10); x.fill(); x.stroke(); for (let f = 0; f < 4; f++) { x.beginPath(); x.roundRect(hx - 8 + f * 12, 1262, 10, 36, 5); x.fill(); x.stroke(); } }
  return c;
}
function zombataBase(front) {
  const c = cv(640, 360), x = c.getContext('2d');
  x.fillStyle = '#071004'; x.fillRect(0, 0, 640, 360);
  if (front) {
    outlined(x, '1 GETTONE = 1 ZOMBATA', 320, 70, 44, '#9cff3a', '#0a1a00', 8);
    x.fillStyle = '#c8b890'; x.fillRect(250, 150, 140, 60); x.fillStyle = '#e8dcb0'; x.fillRect(285, 158, 70, 44); // a 500 from above
    outlined(x, 'BIRRETTA = VITA', 320, 280, 40, '#ffb020', '#2a1000', 7);
  } else { drip(x, 0, 640, 0, '#3a7a10', 10, 80, 5); zombie(x, 320, 220, 0.6, '#3a3a5a'); }
  return c;
}
function chiMarquee() {
  const c = cv(1024, 284), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 1024, 0); g.addColorStop(0, '#2a0050'); g.addColorStop(1, '#600040'); x.fillStyle = g; x.fillRect(0, 0, 1024, 284);
  for (let i = 0; i < 46; i++) { x.fillStyle = i % 2 ? '#ffd040' : '#ff40a0'; x.beginPath(); x.arc(12 + i * 22.5, 12, 6, 0, 7); x.fill(); x.beginPath(); x.arc(12 + i * 22.5, 272, 6, 0, 7); x.fill(); }
  // chat bubble
  x.fillStyle = '#1f6a4a'; x.beginPath(); x.roundRect(40, 50, 230, 150, 30); x.fill(); x.beginPath(); x.moveTo(80, 195); x.lineTo(60, 250); x.lineTo(130, 195); x.fill();
  outlined(x, '???', 155, 125, 90, '#fff', '#0a2a1e', 10);
  outlined(x, "CHI L'HA", 640, 92, 104, '#ffd040', '#3a0a00', 14);
  outlined(x, 'DETTO?', 640, 200, 124, '#ff40a0', '#30001a', 16);
  return c;
}
function chiSide() {
  const c = cv(600, 1400), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 1400); g.addColorStop(0, '#12002a'); g.addColorStop(1, '#3a0030'); x.fillStyle = g; x.fillRect(0, 0, 600, 1400);
  for (let i = 0; i < 9; i++) { x.fillStyle = `rgba(${i % 2 ? '255,64,160' : '64,160,255'},0.12)`; x.beginPath(); x.moveTo(300, -100); x.lineTo(i * 80 - 40, 1400); x.lineTo(i * 80 + 20, 1400); x.fill(); }
  const bubbles = [['SOCCIA', '#1f6a4a', 90, 260], ['COMPETTINA?', '#2a4a8a', 120, 470], ['PALESE', '#6a2a6a', 60, 680], ['ZOMBATA?', '#1f6a4a', 140, 890], ['GREVE', '#8a4a10', 80, 1100]];
  for (const [s, col, X, Y] of bubbles) { x.fillStyle = col; x.beginPath(); x.roundRect(X, Y, 380, 120, 26); x.fill(); x.beginPath(); x.moveTo(X + 50, Y + 115); x.lineTo(X + 30, Y + 160); x.lineTo(X + 100, Y + 115); x.fill(); outlined(x, s, X + 190, Y + 62, 64, '#fff', '#000', 8); }
  outlined(x, '?', 470, 1290, 220, '#ffd040', '#3a0a00', 18, 0.2);
  return c;
}
function chiBase(front) {
  const c = cv(640, 360), x = c.getContext('2d');
  x.fillStyle = '#20003a'; x.fillRect(0, 0, 640, 360);
  if (front) { outlined(x, 'IL QUIZ DEL GRUPPO', 320, 120, 52, '#fff', '#000', 8); outlined(x, 'TELETUBBYLANDIA CERTIFICATA', 320, 220, 30, '#ffd040', '#000', 6); }
  else { for (let i = 0; i < 12; i++) outlined(x, '?', 40 + i * 52, 180 + Math.sin(i) * 60, 90, i % 2 ? '#ff40a0' : '#ffd040', '#000', 8, i * 0.3); }
  return c;
}
export function buildZombataCabinet(screenTex) {
  const cab = buildCabinet({ side: texOf(zombataSide()), baseSide: texOf(zombataBase(false)), baseFront: texOf(zombataBase(true)), marquee: texOf(zombataMarquee()), screen: screenTex },
    { trim: 0x5ac81a, palette: ['#050a04', '#0f2008', '#1e4010', '#3a7a10', '#141414', '#9cff3a', '#d8ff6a', '#e9a0ff'] });
  cab.group.name = 'cabinet-zombata'; return cab;
}
export function buildChiCabinet(screenTex) {
  const cab = buildCabinet({ side: texOf(chiSide()), baseSide: texOf(chiBase(false)), baseFront: texOf(chiBase(true)), marquee: texOf(chiMarquee()), screen: screenTex },
    { trim: 0xff40a0, palette: ['#12002a', '#2a0050', '#600040', '#ff40a0', '#141414', '#ffd040', '#40e0ff', '#ffffff'] });
  cab.group.name = 'cabinet-chi'; return cab;
}
