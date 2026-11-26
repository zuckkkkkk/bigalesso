// Carte italiane disegnate a mano su canvas (all'avvio, una volta): atlante 10 x 5 celle (40 carte + dorso),
// usato come texture per le carte 3D al tavolo del Celtic e come sprite CSS per la mano a schermo.
// Semi alla bolognese: denari (monete d'oro), coppe (calici rossi), spade (azzurre, dritte), bastoni (verdi nodosi).
// Le figurine degli amici sono disegnate a parte, su richiesta (DOM: non pesano sulla GPU).
import * as THREE from 'three';
import { suitOf, rankOf } from '../../shared/carte.mjs';
import { BY_ID } from '../../shared/figurine.mjs';

export const CW = 128, CH = 208, COLS = 10, ROWS = 5;
export const BACK = 40; // cella del dorso
const INK = ['#b07d12', '#b3261e', '#1f5fa8', '#2f6b2a'];
const SUIT_FILL = ['#f2c232', '#d8382c', '#3d86d6', '#4f8f3a'];
const LETTER = { 8: 'F', 9: 'C', 10: 'R' };

function rr(x, X, Y, W, H, R) { x.beginPath(); x.moveTo(X + R, Y); x.arcTo(X + W, Y, X + W, Y + H, R); x.arcTo(X + W, Y + H, X, Y + H, R); x.arcTo(X, Y + H, X, Y, R); x.arcTo(X, Y, X + W, Y, R); x.closePath(); }
// un seme centrato in (cx, cy), grande s
export function pip(x, suit, cx, cy, s) {
  x.save(); x.translate(cx, cy); x.lineJoin = 'round'; x.lineCap = 'round';
  const ink = INK[suit], fill = SUIT_FILL[suit];
  if (suit === 0) { // denaro: moneta con raggi
    x.fillStyle = fill; x.strokeStyle = ink; x.lineWidth = s * 0.09;
    x.beginPath(); x.arc(0, 0, s * 0.48, 0, Math.PI * 2); x.fill(); x.stroke();
    x.beginPath(); x.arc(0, 0, s * 0.3, 0, Math.PI * 2); x.stroke();
    x.fillStyle = '#c0392b'; x.beginPath(); x.arc(0, 0, s * 0.11, 0, Math.PI * 2); x.fill();
    x.strokeStyle = ink; x.lineWidth = s * 0.04;
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; x.beginPath(); x.moveTo(Math.cos(a) * s * 0.14, Math.sin(a) * s * 0.14); x.lineTo(Math.cos(a) * s * 0.28, Math.sin(a) * s * 0.28); x.stroke(); }
  } else if (suit === 1) { // coppa: calice
    x.fillStyle = fill; x.strokeStyle = ink; x.lineWidth = s * 0.07;
    x.beginPath(); x.moveTo(-s * 0.36, -s * 0.42); x.quadraticCurveTo(-s * 0.36, s * 0.02, 0, s * 0.06); x.quadraticCurveTo(s * 0.36, s * 0.02, s * 0.36, -s * 0.42); x.closePath(); x.fill(); x.stroke();
    x.fillStyle = '#f2c232'; x.fillRect(-s * 0.05, s * 0.06, s * 0.1, s * 0.26); x.strokeRect(-s * 0.05, s * 0.06, s * 0.1, s * 0.26);
    x.beginPath(); x.ellipse(0, s * 0.38, s * 0.24, s * 0.08, 0, 0, Math.PI * 2); x.fill(); x.stroke();
    x.strokeStyle = '#ffe9a8'; x.lineWidth = s * 0.05; x.beginPath(); x.moveTo(-s * 0.22, -s * 0.34); x.lineTo(-s * 0.18, -s * 0.12); x.stroke();
  } else if (suit === 2) { // spada dritta
    x.strokeStyle = ink; x.fillStyle = fill; x.lineWidth = s * 0.06;
    x.beginPath(); x.moveTo(0, -s * 0.5); x.lineTo(s * 0.09, -s * 0.36); x.lineTo(s * 0.07, s * 0.2); x.lineTo(-s * 0.07, s * 0.2); x.lineTo(-s * 0.09, -s * 0.36); x.closePath(); x.fill(); x.stroke();
    x.fillStyle = '#f2c232'; x.beginPath(); x.ellipse(0, s * 0.24, s * 0.28, s * 0.06, 0, 0, Math.PI * 2); x.fill(); x.stroke();
    x.fillStyle = '#7a3e1d'; x.fillRect(-s * 0.05, s * 0.28, s * 0.1, s * 0.16); x.strokeRect(-s * 0.05, s * 0.28, s * 0.1, s * 0.16);
    x.fillStyle = '#f2c232'; x.beginPath(); x.arc(0, s * 0.48, s * 0.06, 0, Math.PI * 2); x.fill(); x.stroke();
  } else { // bastone nodoso
    x.rotate(-0.35);
    x.fillStyle = fill; x.strokeStyle = ink; x.lineWidth = s * 0.06;
    x.beginPath(); x.moveTo(-s * 0.09, s * 0.5); x.lineTo(-s * 0.13, -s * 0.38); x.quadraticCurveTo(0, -s * 0.56, s * 0.13, -s * 0.38); x.lineTo(s * 0.08, s * 0.5); x.closePath(); x.fill(); x.stroke();
    x.fillStyle = '#7a4a1d';
    for (const [k, sd] of [[-0.22, -1], [0.02, 1], [0.26, -1]]) { x.beginPath(); x.ellipse(sd * s * 0.13, s * k, s * 0.06, s * 0.035, sd * 0.6, 0, Math.PI * 2); x.fill(); }
  }
  x.restore();
}
// posizioni dei semi per le carte numerali (in unità di cella)
const LAY = {
  1: [[0.5, 0.5]], 2: [[0.5, 0.27], [0.5, 0.73]], 3: [[0.5, 0.22], [0.5, 0.5], [0.5, 0.78]],
  4: [[0.3, 0.28], [0.7, 0.28], [0.3, 0.72], [0.7, 0.72]], 5: [[0.3, 0.26], [0.7, 0.26], [0.5, 0.5], [0.3, 0.74], [0.7, 0.74]],
  6: [[0.3, 0.24], [0.7, 0.24], [0.3, 0.5], [0.7, 0.5], [0.3, 0.76], [0.7, 0.76]], 7: [[0.3, 0.22], [0.7, 0.22], [0.5, 0.37], [0.3, 0.52], [0.7, 0.52], [0.3, 0.78], [0.7, 0.78]],
};
function drawFigure(x, suit, rank, W, H) {
  // figura stilizzata: re con corona, cavallo (testa di cavallo), fante col cappello; tiene il seme
  const cx = W / 2, col = SUIT_FILL[suit], ink = INK[suit];
  x.save();
  x.fillStyle = '#f6e8c8'; rr(x, W * 0.17, H * 0.17, W * 0.66, H * 0.66, 10); x.fill();
  x.strokeStyle = ink; x.lineWidth = 3; x.stroke();
  // mantello
  x.fillStyle = col; x.beginPath(); x.moveTo(cx - W * 0.24, H * 0.8); x.lineTo(cx - W * 0.17, H * 0.47); x.quadraticCurveTo(cx, H * 0.42, cx + W * 0.17, H * 0.47); x.lineTo(cx + W * 0.24, H * 0.8); x.closePath(); x.fill(); x.stroke();
  x.fillStyle = rank === 10 ? '#7a2fa0' : rank === 9 ? '#2a6a8a' : '#b35a1f'; x.fillRect(cx - W * 0.05, H * 0.5, W * 0.1, H * 0.3);
  if (rank === 9) { // cavallo: testa equina accanto
    x.fillStyle = '#8a5a32'; x.beginPath(); x.ellipse(cx - W * 0.17, H * 0.43, W * 0.08, H * 0.05, -0.6, 0, Math.PI * 2); x.fill(); x.stroke();
    x.beginPath(); x.moveTo(cx - W * 0.2, H * 0.37); x.lineTo(cx - W * 0.16, H * 0.31); x.lineTo(cx - W * 0.13, H * 0.38); x.fill();
  }
  // testa
  x.fillStyle = '#f2c9a0'; x.beginPath(); x.arc(cx, H * 0.36, W * 0.1, 0, Math.PI * 2); x.fill(); x.stroke();
  x.fillStyle = '#2a1a10'; x.beginPath(); x.arc(cx - W * 0.035, H * 0.355, 2.2, 0, Math.PI * 2); x.arc(cx + W * 0.035, H * 0.355, 2.2, 0, Math.PI * 2); x.fill();
  if (rank === 10) { // corona
    x.fillStyle = '#f2c232'; x.beginPath(); x.moveTo(cx - W * 0.1, H * 0.3); x.lineTo(cx - W * 0.1, H * 0.24); x.lineTo(cx - W * 0.05, H * 0.27); x.lineTo(cx, H * 0.22); x.lineTo(cx + W * 0.05, H * 0.27); x.lineTo(cx + W * 0.1, H * 0.24); x.lineTo(cx + W * 0.1, H * 0.3); x.closePath(); x.fill(); x.stroke();
  } else if (rank === 8) { // cappello piumato
    x.fillStyle = '#1f3a6a'; x.beginPath(); x.ellipse(cx, H * 0.285, W * 0.13, H * 0.025, 0, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#d8382c'; x.lineWidth = 3; x.beginPath(); x.moveTo(cx + W * 0.06, H * 0.28); x.quadraticCurveTo(cx + W * 0.16, H * 0.22, cx + W * 0.13, H * 0.18); x.stroke();
  } else { x.fillStyle = '#4a3a2a'; x.beginPath(); x.arc(cx, H * 0.31, W * 0.1, Math.PI, 0); x.fill(); }
  x.restore();
  pip(x, suit, cx + W * 0.13, H * 0.62, W * 0.24);
}
function drawCard(x, c, X, Y, W, H) {
  x.save(); x.translate(X, Y);
  x.fillStyle = '#fbf6ea'; rr(x, 2, 2, W - 4, H - 4, 10); x.fill();
  x.strokeStyle = '#3a2a1a'; x.lineWidth = 2; x.stroke();
  x.strokeStyle = 'rgba(160,120,60,.45)'; x.lineWidth = 1.5; rr(x, 7, 7, W - 14, H - 14, 7); x.stroke();
  const s = suitOf(c), r = rankOf(c);
  if (r <= 7) for (const [px, py] of LAY[r]) pip(x, s, W * px, H * py, r === 1 ? W * 0.62 : W * 0.3);
  else drawFigure(x, s, r, W, H);
  // indici d'angolo, grandi per leggerli anche piccoli
  x.fillStyle = INK[s]; x.font = '900 30px Georgia, "Times New Roman", serif'; x.textAlign = 'center'; x.textBaseline = 'top';
  const lab = LETTER[r] || String(r);
  x.fillText(lab, 21, 9);
  x.save(); x.translate(W - 21, H - 9); x.rotate(Math.PI); x.fillText(lab, 0, 0); x.restore();
  pip(x, s, 21, 54, 22);
  x.restore();
}
function drawBack(x, X, Y, W, H) {
  x.save(); x.translate(X, Y);
  x.fillStyle = '#6a1424'; rr(x, 2, 2, W - 4, H - 4, 10); x.fill();
  x.strokeStyle = '#f2c232'; x.lineWidth = 3; rr(x, 8, 8, W - 16, H - 16, 7); x.stroke();
  x.strokeStyle = 'rgba(242,194,50,.35)'; x.lineWidth = 1.2;
  for (let k = -H; k < W + H; k += 12) { x.beginPath(); x.moveTo(k, 8); x.lineTo(k + H, H - 8); x.stroke(); x.beginPath(); x.moveTo(k + H, 8); x.lineTo(k, H - 8); x.stroke(); }
  x.fillStyle = '#6a1424'; x.beginPath(); x.arc(W / 2, H / 2, 30, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#f2c232'; x.lineWidth = 3; x.stroke();
  x.fillStyle = '#f2c232'; x.font = '900 15px Impact, "Arial Black", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('BIGA', W / 2, H / 2 - 7); x.fillText('LESSO', W / 2, H / 2 + 9);
  x.restore();
}

let ATLAS = null;
export function atlas() {
  if (ATLAS) return ATLAS;
  const c = document.createElement('canvas'); c.width = CW * COLS; c.height = CH * ROWS;
  const x = c.getContext('2d');
  for (let i = 0; i < 40; i++) drawCard(x, i, (i % COLS) * CW, Math.floor(i / COLS) * CH, CW, CH);
  drawBack(x, 0, 4 * CH, CW, CH);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  let url = null;
  ATLAS = { canvas: c, tex, get url() { return url || (url = c.toDataURL('image/png')); } };
  return ATLAS;
}
// UV della cella (per PlaneGeometry)
export function cellUV(i) {
  const col = i % COLS, row = Math.floor(i / COLS);
  return { u0: col / COLS, u1: (col + 1) / COLS, v0: 1 - (row + 1) / ROWS, v1: 1 - row / ROWS };
}
// stile CSS per una carta a schermo (sprite dall'atlante)
export function cardCSS(i) {
  const col = i % COLS, row = Math.floor(i / COLS);
  return `background-image:url(${atlas().url});background-size:${COLS * 100}% ${ROWS * 100}%;background-position:${col / (COLS - 1) * 100}% ${row / (ROWS - 1) * 100}%`;
}

// ---------------- figurine degli amici (DOM, su richiesta) ----------------
const FIG = new Map();
const RCOL = { comune: '#9aa7b8', rara: '#4aa8ff', epica: '#b35cff', leggendaria: '#ffc23a' };
export const rarityColor = r => RCOL[r] || '#9aa7b8';
export function figurinaURL(id, { personas = [], shiny = false } = {}) {
  const key = id + (shiny ? '*' : '');
  if (FIG.has(key)) return FIG.get(key);
  const d = BY_ID[id] || { name: id, cost: 0, power: 0, rarity: 'comune', title: '', text: '' };
  const p = (d.who && personas.find(q => q.id === d.who)) || {};
  const color = d.color || p.color || '#888', emoji = d.emoji || p.emoji || '🙂';
  const W = 240, H = 336, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  const rc = rarityColor(d.rarity);
  // cornice
  x.fillStyle = rc; rr(x, 0, 0, W, H, 18); x.fill();
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1b1426'); g.addColorStop(1, '#0c0912');
  x.fillStyle = g; rr(x, 7, 7, W - 14, H - 14, 13); x.fill();
  // ritratto: alone del colore dell'amico + emoji grande + iniziale
  const rg = x.createRadialGradient(W / 2, 112, 10, W / 2, 112, 110); rg.addColorStop(0, color); rg.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = rg; x.fillRect(10, 18, W - 20, 190);
  x.fillStyle = 'rgba(255,255,255,.08)'; x.beginPath(); x.arc(W / 2, 112, 70, 0, Math.PI * 2); x.fill();
  x.strokeStyle = color; x.lineWidth = 4; x.stroke();
  x.font = '86px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(emoji, W / 2, 116);
  // costo (birre) e potenza
  const gem = (cx, cy, v, bg, label) => { x.fillStyle = bg; x.beginPath(); x.arc(cx, cy, 22, 0, Math.PI * 2); x.fill(); x.strokeStyle = '#fff'; x.lineWidth = 3; x.stroke(); x.fillStyle = '#fff'; x.font = '900 24px Impact, "Arial Black", sans-serif'; x.fillText(String(v), cx, cy + 1); x.font = '700 9px system-ui, sans-serif'; x.fillText(label, cx, cy + 31); };
  gem(34, 36, d.cost, '#d98a1a', 'BIRRE'); gem(W - 34, 36, d.power, '#c0392b', 'POTENZA');
  // nome
  x.fillStyle = color; rr(x, 16, 196, W - 32, 34, 8); x.fill();
  x.fillStyle = '#111'; x.font = '900 20px Impact, "Arial Black", sans-serif'; x.fillText(d.name.toUpperCase(), W / 2, 214, W - 40);
  // abilità
  x.fillStyle = '#ffe8a8'; x.font = '800 13px system-ui, sans-serif'; x.fillText(d.title, W / 2, 246, W - 30);
  x.fillStyle = '#e8e2f2'; x.font = '12px system-ui, sans-serif';
  const words = String(d.text).split(' '); let line = '', y = 266;
  for (const w of words) { const t = line ? line + ' ' + w : w; if (x.measureText(t).width > W - 36 && line) { x.fillText(line, W / 2, y); line = w; y += 15; } else line = t; }
  if (line) x.fillText(line, W / 2, y);
  x.fillStyle = rc; x.font = '800 10px system-ui, sans-serif'; x.fillText(d.rarity.toUpperCase() + (shiny ? ' · LUCIDA' : ''), W / 2, H - 16);
  if (shiny) { // riflesso olografico
    const h = x.createLinearGradient(0, 0, W, H); h.addColorStop(0, 'rgba(255,80,200,.18)'); h.addColorStop(0.35, 'rgba(80,220,255,.22)'); h.addColorStop(0.6, 'rgba(255,255,120,.18)'); h.addColorStop(1, 'rgba(120,255,160,.2)');
    x.globalCompositeOperation = 'screen'; x.fillStyle = h; rr(x, 7, 7, W - 14, H - 14, 13); x.fill(); x.globalCompositeOperation = 'source-over';
  }
  const url = c.toDataURL('image/png'); FIG.set(key, url); return url;
}
