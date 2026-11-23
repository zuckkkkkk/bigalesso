// "CHI L'HA DETTO?" — 320x240 arcade quiz show for the fourth cabinet (same API as Game/DirectorGame).
// Joystick selects an answer, Z confirms. 9 questions "who wrote this in the group chat?" + bonus "which line is fake?".
import { drawText, textWidth } from '../font.js';
import { buildRounds, aiFake, rankOf } from './quizcore.js';
import { persona } from './shared.js';

export const CW = 320, CH = 240;
const OK = new Set("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,!?:-'/()+=<>*ÈÀÙÌÒ #%".split(''));
export function arcadeText(s) {
  return String(s).toUpperCase().replace(/[ÉÊ]/g, 'È').replace(/[ÁÂ]/g, 'À').replace(/[ÓÔ]/g, 'Ò').replace(/[ÍÎ]/g, 'Ì').replace(/[ÚÛ]/g, 'Ù')
    .replace(/[“”"«»]/g, "'").replace(/[’‘`]/g, "'").replace(/…/g, '...').replace(/;/g, ',').replace(/&/g, 'E').replace(/@/g, 'A').replace(/_/g, ' ')
    .split('').filter(c => OK.has(c)).join('').replace(/\s+/g, ' ').trim();
}
function wrap(s, max) { const w = s.split(' '), out = []; let l = ''; for (const x of w) { if ((l + ' ' + x).trim().length > max) { if (l) out.push(l); l = x; } else l = (l + ' ' + x).trim(); } if (l) out.push(l); return out; }
const T = (x, s, X, Y, c = '#fff', sc = 1, al = 'left', sh = '#000') => drawText(x, s, Math.round(X), Math.round(Y), c, sc, al, sh);
const QT = 12; // seconds per question

export class ChiGame {
  constructor(emit) {
    this.canvas = document.createElement('canvas'); this.canvas.width = CW; this.canvas.height = CH;
    this.ctx = this.canvas.getContext('2d'); this.ctx.imageSmoothingEnabled = false;
    this.emit = emit || (() => { });
    this.input = { up: 0, down: 0, left: 0, right: 0, fire: 0, bomb: 0, start: 0, pause: 0 };
    this.prev = { ...this.input };
    this.state = 'attract'; this.t = 0; this.st = 0; this.acc = 0; this.paused = false; this.credits = 0;
    this.score = 0; this.hi = 5000; try { const v = +localStorage.getItem('chiquiz_hi'); if (v > this.hi) this.hi = v; } catch (e) { }
    this.used = new Set(); this.fake = null; this.prefetch();
    this.demo = null; this.demoT = 0;
  }
  prefetch() { this.fake = null; aiFake().then(f => { this.fake = f; }).catch(() => { }); }
  pressed(k) { return this.input[k] && !this.prev[k]; }
  setState(s) { this.state = s; this.st = 0; }
  newGame() {
    this.rounds = buildRounds(10, this.used, this.fake); this.prefetch();
    if (this.used.size > 120) this.used.clear();
    this.i = 0; this.sel = 0; this.score = 0; this.correct = 0; this.streak = 0; this.best = 0; this.qt = QT; this.res = null;
  }
  update(dt) {
    if (this.pressed('pause') && this.state === 'play') this.paused = !this.paused;
    if (this.paused) { this.prev = { ...this.input }; return; }
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= 1 / 60) { this.step(1 / 60); this.acc -= 1 / 60; this.prev = { ...this.input }; }
  }
  step(dt) {
    this.t += dt; this.st += dt;
    if (this.state === 'attract') {
      this.demoT -= dt; if (this.demoT <= 0) { this.demoT = 5; const r = buildRounds(2, new Set()); this.demo = r[0]; }
      if (this.pressed('start') || this.pressed('fire')) { if (this.credits > 0) this.credits--; this.newGame(); this.setState('play'); this.emit('start'); }
      return;
    }
    if (this.state === 'over') {
      if (this.st > 2 && (this.pressed('start') || this.pressed('fire'))) { this.newGame(); this.setState('play'); this.emit('start'); }
      if (this.st > 14) this.setState('attract');
      return;
    }
    const R = this.rounds[this.i];
    if (this.res) { // answer shown
      this.res.t -= dt;
      if (this.res.t <= 0 || (this.res.t < 1.6 && this.pressed('fire'))) {
        this.res = null; this.i++; this.sel = 0; this.qt = QT;
        if (this.i >= this.rounds.length) {
          this.setState('over'); this.rank = rankOf(this.correct, this.rounds.length);
          this.newRecord = this.score > this.hi; if (this.newRecord) { this.hi = this.score; try { localStorage.setItem('chiquiz_hi', String(this.score)); } catch (e) { } }
          this.emit('gameover', { score: this.score, correct: this.correct, n: this.rounds.length, best: this.best });
        } else this.emit(this.rounds[this.i].kind === 'fake' ? 'bonus' : 'next');
      }
      return;
    }
    // navigation (2x2 grid)
    const n = R.kind === 'fake' ? R.lines.length : R.options.length;
    if (R.kind === 'fake') { if (this.pressed('up')) { this.sel = (this.sel + n - 1) % n; this.emit('move'); } if (this.pressed('down')) { this.sel = (this.sel + 1) % n; this.emit('move'); } }
    else {
      if (this.pressed('left') || this.pressed('right')) { this.sel ^= 1; this.emit('move'); }
      if (this.pressed('up') || this.pressed('down')) { this.sel ^= 2; this.emit('move'); }
    }
    this.qt -= dt;
    if (this.pressed('fire') || this.pressed('bomb') || this.qt <= 0) this.answer(this.qt <= 0 ? -1 : this.sel);
  }
  answer(k) {
    const R = this.rounds[this.i];
    const ok = R.kind === 'fake' ? k === R.answer : (k >= 0 && R.options[k] === R.answer);
    let pts = 0;
    if (ok) { this.correct++; this.streak++; this.best = Math.max(this.best, this.streak); pts = Math.round((100 + Math.max(0, this.qt) * 25) * (1 + Math.min(4, this.streak - 1) * 0.25) * (R.kind === 'fake' ? 2 : 1) / 10) * 10; this.score += pts; }
    else this.streak = 0;
    this.res = { ok, k, pts, t: 3.2 };
    this.emit(ok ? 'right' : 'wrong', this.streak);
  }
  // ---------------------------------------------------------------- draw
  avatar(x, id, X, Y, r = 7) {
    const p = persona(id); x.fillStyle = '#000'; x.beginPath(); x.arc(X + 1, Y + 1, r, 0, 7); x.fill();
    x.fillStyle = p.color || '#88a'; x.beginPath(); x.arc(X, Y, r, 0, 7); x.fill();
    T(x, arcadeText((p.name || id)[0]), X, Y - 3, '#fff', 1, 'center', null);
  }
  draw() {
    const x = this.ctx, t = this.t;
    // studio background: purple/blue spotlights + checker floor
    const g = x.createLinearGradient(0, 0, 0, CH); g.addColorStop(0, '#120826'); g.addColorStop(1, '#2a0d3a'); x.fillStyle = g; x.fillRect(0, 0, CW, CH);
    for (let i = 0; i < 6; i++) { const a = Math.sin(t * 0.6 + i * 1.3) * 0.5; x.fillStyle = `rgba(${i % 2 ? '255,80,200' : '80,160,255'},0.07)`; x.beginPath(); x.moveTo(40 + i * 48, 0); x.lineTo(40 + i * 48 + Math.sin(a) * 140 - 30, CH); x.lineTo(40 + i * 48 + Math.sin(a) * 140 + 30, CH); x.fill(); }
    for (let i = 0; i < 40; i++) { x.fillStyle = (i + Math.floor(t * 4)) % 3 ? '#ffd040' : '#ff40a0'; x.fillRect(i * 8 + 2, 2, 3, 3); x.fillRect(i * 8 + 2, CH - 5, 3, 3); }
    if (this.state === 'attract') return this.drawAttract(x);
    if (this.state === 'over') return this.drawOver(x);
    const R = this.rounds[this.i];
    T(x, 'DOMANDA ' + (this.i + 1) + '/' + this.rounds.length, 8, 10, '#ffd040');
    T(x, 'PUNTI ' + this.score, CW - 8, 10, '#fff', 1, 'right');
    if (this.streak > 1) T(x, 'SERIE X' + this.streak, CW / 2, 10, '#40ffa0', 1, 'center');
    // timer bar
    const k = Math.max(0, this.qt / QT); x.fillStyle = '#300'; x.fillRect(8, 22, CW - 16, 4); x.fillStyle = k > 0.3 ? '#40e0ff' : '#ff4040'; x.fillRect(8, 22, Math.round((CW - 16) * (this.res ? 0 : k)), 4);
    if (R.kind === 'who') {
      // the quote in a chat bubble
      const lines = wrap(arcadeText(R.q.text), 40).slice(0, 4);
      const bh = 18 + lines.length * 11;
      x.fillStyle = '#0b2a1e'; x.fillRect(18, 36, CW - 36, bh); x.fillStyle = '#1f6a4a'; x.fillRect(20, 38, CW - 40, bh - 4);
      x.fillStyle = '#1f6a4a'; x.beginPath(); x.moveTo(40, 36 + bh - 2); x.lineTo(30, 36 + bh + 8); x.lineTo(56, 36 + bh - 2); x.fill();
      lines.forEach((l, i) => T(x, l, CW / 2, 46 + i * 11, '#fff', 1, 'center'));
      T(x, 'CHI L\'HA DETTO?', CW / 2, 36 + bh + 14, '#ff80d0', 2, 'center');
      // options
      const oy = 36 + bh + 36;
      R.options.forEach((id, i) => {
        const X = 14 + (i % 2) * 150, Y = oy + Math.floor(i / 2) * 32, sel = i === this.sel;
        let bg = sel ? '#ffd040' : '#2a2050', fg = sel ? '#000' : '#fff';
        if (this.res) { if (id === R.answer) { bg = '#20c060'; fg = '#fff'; } else if (i === this.res.k) { bg = '#d02030'; fg = '#fff'; } else { bg = '#1a1530'; fg = '#777'; } }
        x.fillStyle = '#000'; x.fillRect(X + 2, Y + 2, 142, 26); x.fillStyle = bg; x.fillRect(X, Y, 142, 26);
        this.avatar(x, id, X + 14, Y + 13);
        T(x, arcadeText(persona(id).name || id), X + 28, Y + 9, fg, 1);
        if (sel && !this.res && Math.floor(t * 4) % 2) T(x, '<', X + 136, Y + 9, '#000', 1, 'right', null);
      });
    } else {
      T(x, 'BONUS X2', CW / 2, 34, '#40ffa0', 1, 'center');
      T(x, 'QUALE FRASE È FALSA?', CW / 2, 46, '#ff80d0', 2, 'center');
      R.lines.forEach((l, i) => {
        const Y = 72 + i * 38, sel = i === this.sel;
        let bg = sel ? '#ffd040' : '#2a2050', fg = sel ? '#000' : '#fff';
        if (this.res) { if (i === R.answer) { bg = '#d02030'; fg = '#fff'; } else { bg = '#1f6a4a'; fg = '#fff'; } }
        x.fillStyle = '#000'; x.fillRect(16, Y + 2, CW - 30, 34); x.fillStyle = bg; x.fillRect(14, Y, CW - 30, 34);
        this.avatar(x, l.who, 28, Y + 17);
        wrap(arcadeText(l.text), 40).slice(0, 2).forEach((s, j) => T(x, s, 42, Y + 7 + j * 11, fg, 1));
        if (this.res) T(x, i === R.answer ? 'FALSA' : 'VERA', CW - 20, Y + 24, '#fff', 1, 'right');
      });
    }
    if (this.res) {
      const ok = this.res.ok;
      x.fillStyle = ok ? 'rgba(20,120,60,0.85)' : 'rgba(140,20,30,0.85)'; x.fillRect(60, CH - 34, 200, 22);
      T(x, ok ? 'ESATTO! +' + this.res.pts : (this.res.k < 0 ? 'TEMPO SCADUTO' : 'SBAGLIATO'), CW / 2, CH - 27, '#fff', 1, 'center');
    }
    if (this.paused) { x.fillStyle = 'rgba(0,0,0,0.6)'; x.fillRect(0, 0, CW, CH); T(x, 'PAUSA', CW / 2, 110, '#fff', 2, 'center'); }
  }
  drawAttract(x) {
    const t = this.t;
    const b = Math.sin(t * 3) * 2;
    T(x, 'CHI L\'HA', CW / 2, 26 + b, '#ffd040', 4, 'center', '#6a2000');
    T(x, 'DETTO?', CW / 2, 60 - b, '#ff40a0', 4, 'center', '#400020');
    T(x, 'IL QUIZ DEL GRUPPO', CW / 2, 96, '#fff', 1, 'center');
    if (this.demo) {
      const lines = wrap(arcadeText(this.demo.q.text), 38).slice(0, 3);
      x.fillStyle = '#1f6a4a'; x.fillRect(30, 112, CW - 60, 14 + lines.length * 11);
      lines.forEach((l, i) => T(x, l, CW / 2, 119 + i * 11, '#fff', 1, 'center'));
      T(x, '...MA CHI L\'HA SCRITTO?', CW / 2, 130 + lines.length * 11, '#ff80d0', 1, 'center');
    }
    T(x, 'RECORD ' + this.hi, CW / 2, 186, '#40e0ff', 1, 'center');
    if (Math.floor(t * 2) % 2) T(x, 'PREMI START', CW / 2, 202, '#ffd040', 2, 'center');
    T(x, 'FRECCE SCEGLI - Z CONFERMA', CW / 2, 224, '#aaa', 1, 'center');
  }
  drawOver(x) {
    T(x, 'FINE QUIZ', CW / 2, 30, '#ffd040', 3, 'center');
    T(x, this.correct + ' / ' + this.rounds.length + ' RISPOSTE GIUSTE', CW / 2, 70, '#fff', 1, 'center');
    T(x, 'PUNTI ' + this.score, CW / 2, 88, '#40e0ff', 2, 'center');
    T(x, 'SERIE MIGLIORE ' + this.best, CW / 2, 112, '#40ffa0', 1, 'center');
    T(x, 'TITOLO', CW / 2, 136, '#aaa', 1, 'center');
    T(x, arcadeText(this.rank || ''), CW / 2, 150, '#ff80d0', 2, 'center');
    if (this.newRecord && Math.floor(this.t * 4) % 2) T(x, 'NUOVO RECORD!', CW / 2, 178, '#ffd040', 1, 'center');
    if (this.st > 2) T(x, 'START PER RIGIOCARE', CW / 2, 204, '#fff', 1, 'center');
  }
}
