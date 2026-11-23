// "IL DIRETTORE INCASSA" — 320x240 arcade boxing (defence only), same API as Game.
// You are the director (seen from behind, Punch-Out style). The furious boyfriend punches;
// dodge ←/→, duck ↓, block ↑ (hold). Z = "bacio volante" (counter when he is tired / after a
// perfect dodge, or kiss the ex when she shows up). X = drink the spritz sliding on the counter.
import { drawText } from './font.js';

export const DW = 320, DH = 240;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t * t * (3 - 2 * t);

// attack table: tell = wind-up seconds (round 1), travel = fist flight, avoid = defences that work
const ATT = {
  jab: { tell: 0.58, travel: 0.13, dmg: 7, avoid: { dodgeL: 1, dodgeR: 1, duck: 1 }, block: 1, cue: '!', col: '#ffffff', name: 'DIRETTO' },
  hookL: { tell: 0.74, travel: 0.17, dmg: 14, avoid: { dodgeR: 1, duck: 1 }, block: 0.5, cue: '!!', col: '#ffd83a', side: -1, name: 'GANCIO' },
  hookR: { tell: 0.74, travel: 0.17, dmg: 14, avoid: { dodgeL: 1, duck: 1 }, block: 0.5, cue: '!!', col: '#ffd83a', side: 1, name: 'GANCIO' },
  upper: { tell: 0.82, travel: 0.16, dmg: 18, avoid: { dodgeL: 1, dodgeR: 1 }, block: 0.5, duckMul: 1.5, cue: '!!', col: '#ff9a1a', name: 'MONTANTE' },
  hay: { tell: 1.1, travel: 0.2, dmg: 30, avoid: { duck: 1, dodgeL: 1 }, block: 0, cue: '!!!', col: '#ff3040', side: 1, name: 'IL DESTRO' },
  fake: { tell: 0.62, travel: 0, dmg: 0, fake: true, cue: '!!', col: '#ffd83a', side: 1, name: 'FINTA' },
};
const DODGE_ACT = 0.34, DUCK_ACT = 0.4, RECOVER = 0.16, PERFECT = 0.17;
const COMIC_HIT = ['SBAM!', 'POW!', 'CRACK!', 'BONK!', 'STOK!'];

function px(x, X, Y, W, H, c) { x.fillStyle = c; x.fillRect(Math.round(X), Math.round(Y), Math.round(W), Math.round(H)); }
function ell(x, cx, cy, rx, ry, c) {
  x.fillStyle = c; rx = Math.max(0.5, rx); ry = Math.max(0.5, ry);
  const yr = Math.round(ry);
  for (let yy = -yr; yy <= yr; yy++) { const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (yy * yy) / (ry * ry)))); x.fillRect(Math.round(cx - w), Math.round(cy + yy), w * 2 + 1, 1); }
}
const mixC = (a, b, t) => { const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16); const r = lerp(pa >> 16, pb >> 16, t), g = lerp((pa >> 8) & 255, (pb >> 8) & 255, t), bl = lerp(pa & 255, pb & 255, t); return '#' + ((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl)).toString(16).slice(1); };

export class DirectorGame {
  constructor(images, emit) {
    this.canvas = document.createElement('canvas'); this.canvas.width = DW; this.canvas.height = DH;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true }); this.ctx.imageSmoothingEnabled = false; // perf: CPU canvas, no GPU readback
    this.emit = emit || (() => { });
    this.input = { up: 0, down: 0, left: 0, right: 0, fire: 0, bomb: 0, start: 0, pause: 0 };
    this.prev = { ...this.input };
    this.state = 'attract'; this.t = 0; this.st = 0; this.acc = 0; this.paused = false; this.credits = 0;
    this.score = 0; this.hi = 25000;
    try { const v = +localStorage.getItem('direttore_hi'); if (v > this.hi) this.hi = v; } catch (e) { }
    this.bg = this.buildBg();
    this.f = null; this.demo = false; this.attractT = 0;
    this.fx = []; this.shake = 0; this.flash = 0; this.flashC = '#fff'; this.slow = 0;
  }
  pressed(k) { return this.input[k] && !this.prev[k]; }
  setState(s) { this.state = s; this.st = 0; }

  // ---------------------------------------------------------------- fight state
  newFight(demo) {
    this.demo = !!demo;
    this.f = {
      round: 1, timer: 40, hp: 100, hpShow: 100, combo: 0, alcol: 0, alcolT: 0, swapT: 0, swapCd: 6,
      pl: { mode: 'idle', t: 9, start: -9, block: false, x: 0, y: 0, tilt: 0, drinkT: 0, hitT: 0 },
      bf: { state: 'guard', t: 0, att: null, attName: null, gap: 1.4, anger: 0.1, combo: 0, comboLeft: 0, sinceTired: 0, fist: 1, followJab: false },
      counterT: 0, ex: null, exCd: rnd(14, 22), spritz: null, spritzCd: rnd(6, 10), score: 0, crowd: 0,
    };
    if (!demo) this.score = 0;
  }
  get tellScale() { const f = this.f; return Math.max(0.5, 1 - 0.09 * (f.round - 1)) * (1 - 0.28 * f.bf.anger); }
  addScore(n) {
    const f = this.f; const m = this.mult();
    const v = Math.round(n * m / 10) * 10; f.score += v;
    if (!this.demo) { this.score = f.score; if (this.score > this.hi) this.hi = this.score; }
    return v;
  }
  mult() { const f = this.f; return Math.min(5, (1 + Math.min(3, f.combo * 0.25)) * (1 + 0.5 * f.alcol)); }
  text(s, x, y, c = '#fff', scale = 2, life = 0.9, burst = null) { this.fx.push({ k: 'txt', s, x, y, c, scale, life, max: life, burst }); }
  hearts(x, y, n = 6) { for (let i = 0; i < n; i++) this.fx.push({ k: 'heart', x: x + rnd(-10, 10), y: y + rnd(-6, 6), vx: rnd(-30, 30), vy: rnd(-60, -25), life: rnd(0.7, 1.2), max: 1.2 }); }
  stars(x, y, n = 8, c = '#ffd83a') { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, s = rnd(40, 120); this.fx.push({ k: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.25, 0.55), max: 0.55, c }); } }

  // ---------------------------------------------------------------- update
  update(dt) {
    if (this.pressed('pause') && this.state === 'play') this.paused = !this.paused;
    if (this.paused) { this.prev = { ...this.input }; return; }
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= 1 / 60) { this.step(1 / 60); this.acc -= 1 / 60; this.prev = { ...this.input }; }
  }

  step(dt0) {
    this.t += dt0;
    const slowK = this.slow > 0 ? 0.3 : 1; this.slow = Math.max(0, this.slow - dt0);
    const dt = dt0 * slowK;
    this.st += dt0;
    this.shake = Math.max(0, this.shake - dt0 * 22); this.flash = Math.max(0, this.flash - dt0 * 3.5);
    for (const p of this.fx) { p.life -= dt0; if (p.vx !== undefined) { p.x += p.vx * dt0; p.y += p.vy * dt0; if (p.k === 'heart') p.vy -= 20 * dt0; else { p.vx *= 0.94; p.vy *= 0.94; } } else if (p.k === 'txt') p.y -= 10 * dt0; }
    this.fx = this.fx.filter(p => p.life > 0);
    const s = this.state;
    if (s === 'attract') {
      this.attractT += dt0;
      if (this.attractT > 31) { this.attractT = 0; this.f = null; }
      if (this.attractT > 16 && !this.f) this.newFight(true);
      if (this.f && this.attractT > 16) this.fight(dt, this.botInput());
      if (this.pressed('start')) { this.newFight(false); this.setState('intro'); this.emit('start'); this.emit('bell'); }
      return;
    }
    if (s === 'intro') { this.f.pl.mode = 'idle'; this.animIdle(dt); if (this.st > 2.2) { this.setState('play'); this.emit('bell'); this.emit('round', this.f.round); } return; }
    if (s === 'play') { this.fight(dt, this.input); return; }
    if (s === 'roundwin') {
      this.animIdle(dt);
      if (this.st > 3.0) { const f = this.f; f.round++; f.timer = 40; f.bf.state = 'guard'; f.bf.t = 0; f.bf.gap = 1.2; f.spritz = null; f.ex = null; this.setState('intro'); this.emit('bell'); }
      return;
    }
    if (s === 'ko') { if (this.st > 2.4) { this.setState('over'); this.emit('gameover'); this.saveHi(); } return; }
    if (s === 'over') {
      if (this.st > 2.5 && this.pressed('start')) { this.newFight(false); this.setState('intro'); this.emit('start'); this.emit('bell'); return; }
      if (this.st > 10) { this.setState('attract'); this.attractT = 0; this.f = null; }
    }
  }
  saveHi() { try { localStorage.setItem('direttore_hi', String(this.hi)); } catch (e) { } }
  animIdle(dt) { const f = this.f; if (!f) return; const pl = f.pl; pl.x = lerp(pl.x, 0, 1 - Math.exp(-dt * 12)); pl.y = lerp(pl.y, 0, 1 - Math.exp(-dt * 12)); pl.tilt = lerp(pl.tilt, 0, 1 - Math.exp(-dt * 12)); f.bf.t += dt; f.hpShow = lerp(f.hpShow, f.hp, 1 - Math.exp(-dt * 6)); }

  // bot used by the attract demo: reads the tell and answers correctly (most of the time)
  botInput() {
    const f = this.f, b = f.bf, i = { up: 0, down: 0, left: 0, right: 0, fire: 0, bomb: 0, start: 0, pause: 0 };
    if (b.state === 'windup' && !ATT[b.attName].fake) {
      const left = ATT[b.attName].tell * this.tellScale - b.t;
      if (left < 0.16 && Math.random() < 0.9) {
        const n = b.attName;
        if (n === 'jab') i.up = 1; else if (n === 'hookR' || n === 'hay') i.left = 1; else if (n === 'hookL') i.right = 1; else if (n === 'upper') i.right = 1;
      }
    }
    if (b.state === 'tired' || f.counterT > 0 || f.ex) i.fire = Math.random() < 0.2 ? 1 : 0;
    if (f.spritz && Math.abs(f.spritz.x - 160) < 12 && f.alcol < 2) i.bomb = 1;
    // edges: the bot holds keys for one step only
    const out = { ...i }; for (const k in out) if (this._botPrev && this._botPrev[k] && out[k] && k !== 'up') out[k] = 0;
    this._botPrev = i; return out;
  }

  fight(dt, inp) {
    const f = this.f, pl = f.pl, b = f.bf;
    const pressed = k => inp[k] && !(this.demo ? false : this.prev[k]);
    f.hpShow = lerp(f.hpShow, f.hp, 1 - Math.exp(-dt * 6));
    // ---- timers
    if (b.state !== 'windup' && b.state !== 'strike') f.timer -= dt;
    f.counterT = Math.max(0, f.counterT - dt);
    f.alcolT += dt; if (f.alcol > 0 && f.alcolT > 14) { f.alcol--; f.alcolT = 0; }
    if (f.alcol >= 2) { f.swapCd -= dt; if (f.swapCd <= 0) { f.swapT = 1.6; f.swapCd = rnd(5, 9) / (f.alcol - 1); this.text('VEDO DOPPIO!', 160, 64, '#ff9a1a', 1, 1.2); } }
    f.swapT = Math.max(0, f.swapT - dt);
    // ---- player
    let L = inp.left, R = inp.right; if (f.swapT > 0) [L, R] = [R, L];
    const eL = this.demo ? inp.left : pressed('left'), eR = this.demo ? inp.right : pressed('right');
    const leftEdge = f.swapT > 0 ? eR : eL, rightEdge = f.swapT > 0 ? eL : eR;
    pl.t += dt; pl.hitT = Math.max(0, pl.hitT - dt);
    const busy = (pl.mode === 'dodgeL' || pl.mode === 'dodgeR') ? pl.t < DODGE_ACT + RECOVER : pl.mode === 'duck' ? pl.t < DUCK_ACT + RECOVER : pl.mode === 'stagger' ? pl.t < 0.32 : pl.mode === 'drink' ? pl.t < 0.62 : pl.mode === 'whiff' ? pl.t < 0.3 : false;
    if (!busy) {
      pl.mode = 'idle';
      const down = this.demo ? inp.down : pressed('down');
      if (leftEdge) { pl.mode = 'dodgeL'; pl.t = 0; pl.start = this.t; this.emit('dodge'); }
      else if (rightEdge) { pl.mode = 'dodgeR'; pl.t = 0; pl.start = this.t; this.emit('dodge'); }
      else if (down) { pl.mode = 'duck'; pl.t = 0; pl.start = this.t; this.emit('dodge'); }
    }
    pl.block = pl.mode === 'idle' && !!inp.up;
    // fire: kiss the ex > counter (bacio volante) > whiff
    if ((this.demo ? inp.fire : pressed('fire')) && (pl.mode === 'idle')) {
      if (f.ex && f.ex.t > 0.3) {
        const v = this.addScore(1000); f.hp = Math.min(100, f.hp + 5); b.anger = Math.min(1, b.anger + 0.3);
        this.hearts(f.ex.side < 0 ? 70 : 250, 120, 10); this.text('BACIO! +' + v, 160, 70, '#ff6aa0', 2, 1.2); this.emit('kiss');
        f.ex.leave = true; f.counterT = 0;
        // jealousy: he goes straight for the big one
        b.state = 'windup'; b.attName = 'hay'; b.t = -0.15; b.comboLeft = 0; this.text('COSA?!', 160, 40, '#ff3040', 2, 1.0); this.emit('tell', 'hay');
      } else if (f.counterT > 0 || b.state === 'tired') {
        const v = this.addScore(500); b.state = 'flustered'; b.t = 0; b.anger = Math.min(1, b.anger + 0.12); f.counterT = 0;
        this.hearts(160, 90, 7); this.text('BACIO VOLANTE! +' + v, 160, 60, '#ff6aa0', 1, 1.1); this.emit('counter');
      } else { pl.mode = 'whiff'; pl.t = 0; this.text('MUAH?', 160, 175, '#ffd0e0', 1, 0.6); }
    }
    // bomb: drink the spritz on the counter
    if (f.spritz && (this.demo ? inp.bomb : pressed('bomb')) && pl.mode === 'idle' && Math.abs(f.spritz.x - 160) < 30) {
      f.spritz = null; pl.mode = 'drink'; pl.t = 0; f.alcol = Math.min(3, f.alcol + 1); f.alcolT = 0; f.hp = Math.min(100, f.hp + 8);
      const v = this.addScore(250); this.text('GLU GLU! +' + v, 160, 160, '#ff9a1a', 1, 1.0); this.emit('drink', f.alcol);
      if (f.alcol === 3) this.text('PIENO DI ALCOL!', 160, 50, '#ff9a1a', 2, 1.4);
    }
    // player pose targets
    const tx = pl.mode === 'dodgeL' && pl.t < DODGE_ACT ? -58 : pl.mode === 'dodgeR' && pl.t < DODGE_ACT ? 58 : 0;
    const ty = pl.mode === 'duck' && pl.t < DUCK_ACT ? 30 : pl.mode === 'drink' ? 4 : pl.mode === 'stagger' ? 8 : 0;
    const k = 1 - Math.exp(-dt * 26);
    pl.x = lerp(pl.x, tx, k); pl.y = lerp(pl.y, ty, k); pl.tilt = lerp(pl.tilt, tx / 58 * 0.25 + (pl.mode === 'stagger' ? Math.sin(pl.t * 40) * 0.15 : 0), k);

    // ---- boyfriend AI
    b.t += dt;
    b.anger = Math.max(0, b.anger - dt * 0.006);
    switch (b.state) {
      case 'guard':
        if (b.t > b.gap) this.chooseAttack();
        break;
      case 'windup': {
        const a = ATT[b.attName], tell = a.tell * this.tellScale * (b.quick ? 0.5 : 1);
        if (b.t >= tell) {
          if (a.fake) { b.state = 'guard'; b.t = 0; b.gap = 0.12; b.followJab = true; this.text('AH-AH!', 160, 40, '#ffd83a', 1, 0.8); this.emit('fake'); }
          else { b.state = 'strike'; b.t = 0; this.emit('swing', b.attName); }
        }
        break;
      }
      case 'strike':
        if (b.t >= ATT[b.attName].travel) { this.resolve(); }
        break;
      case 'recover': if (b.t > 0.3) { b.state = b.comboLeft > 0 ? 'guard' : (b.sinceTired >= 5 ? 'tired' : 'guard'); if (b.state === 'tired') { b.sinceTired = 0; this.text('È STANCO! (Z)', 160, 46, '#c8f03c', 1, 1.4); this.emit('tired'); } b.t = 0; b.gap = b.comboLeft > 0 ? 0.08 : rnd(0.45, 1.05) * this.tellScale; } break;
      case 'tired': if (b.t > 1.7) { b.state = 'guard'; b.t = 0; b.gap = 0.4; } break;
      case 'flustered': if (b.t > 1.2) { b.state = 'guard'; b.t = 0; b.gap = 0.5; } break;
      case 'taunt': if (b.t > 0.7) { b.state = 'guard'; b.t = 0; b.gap = rnd(0.4, 0.8) * this.tellScale; } break;
    }
    // ---- ex-girlfriend + spritz
    f.exCd -= dt;
    if (!f.ex && f.exCd <= 0 && b.state === 'guard') { f.ex = { side: Math.random() < 0.5 ? -1 : 1, t: 0, leave: false }; f.exCd = rnd(18, 28); this.emit('ex'); }
    if (f.ex) { f.ex.t += dt; if (f.ex.t > 4.2) f.ex.leave = true; if (f.ex.leave) { f.ex.out = (f.ex.out || 0) + dt; if (f.ex.out > 0.5) f.ex = null; } }
    f.spritzCd -= dt;
    if (!f.spritz && f.spritzCd <= 0) { f.spritz = { x: -16, v: rnd(62, 84) }; f.spritzCd = rnd(9, 14); }
    if (f.spritz) { f.spritz.x += f.spritz.v * dt; if (f.spritz.x > DW + 16) f.spritz = null; }
    f.crowd = Math.max(0, f.crowd - dt);
    // ---- round end / KO
    if (f.hp <= 0) {
      f.hp = 0; if (!this.demo) { this.setState('ko'); this.slow = 1.0; this.emit('ko'); this.saveHi(); }
      else { this.newFight(true); }
      return;
    }
    if (f.timer <= 0 && (b.state === 'guard' || b.state === 'tired' || b.state === 'flustered' || b.state === 'taunt')) {
      if (this.demo) { this.newFight(true); return; }
      const v = this.addScore(1500 * f.round + f.hp * 10); f.hp = Math.min(100, f.hp + 25); b.anger *= 0.6;
      this.text('ROUND SUPERATO!', 160, 80, '#c8f03c', 2, 2.5); this.text('+' + v, 160, 104, '#ffd83a', 2, 2.5); f.crowd = 2;
      this.setState('roundwin'); this.emit('roundwin', f.round);
    }
  }

  chooseAttack() {
    const f = this.f, b = f.bf, r = f.round;
    let name;
    if (b.followJab) { name = 'jab'; b.followJab = false; b.quick = true; }
    else {
      b.quick = false;
      const w = [['jab', 34], ['hookL', 18], ['hookR', 18], ['upper', r >= 1 ? 12 : 0], ['fake', 9 + r * 2], ['hay', r >= 2 ? 8 + r * 2 : 3]];
      let tot = w.reduce((s, x) => s + x[1], 0), q = Math.random() * tot; name = w[0][0];
      for (const [n, ww] of w) { if ((q -= ww) <= 0) { name = n; break; } }
      if (b.comboLeft <= 0 && r >= 2 && Math.random() < 0.25 + r * 0.05) b.comboLeft = 1 + (Math.random() < 0.3 ? 1 : 0);
      else if (b.comboLeft > 0) { b.comboLeft--; if (name === 'hay' || name === 'fake') name = 'jab'; }
    }
    b.state = 'windup'; b.t = 0; b.attName = name; b.fist = ATT[name].side || (Math.random() < 0.5 ? -1 : 1);
    this.emit('tell', name);
  }

  resolve() {
    const f = this.f, pl = f.pl, b = f.bf, a = ATT[b.attName];
    const active = (pl.mode === 'dodgeL' || pl.mode === 'dodgeR') ? pl.t < DODGE_ACT : pl.mode === 'duck' ? pl.t < DUCK_ACT : false;
    let dmg = a.dmg;
    b.sinceTired++;
    if (active && a.avoid[pl.mode]) {
      const perfect = this.t - pl.start <= PERFECT + a.travel;
      f.combo++;
      if (perfect) {
        const v = this.addScore(300); this.text('PERFETTO! +' + v, 160, 70, '#c8f03c', 2, 1.0, '#2a6a14'); this.slow = 0.35; f.counterT = 0.75; this.emit('perfect', f.combo); f.crowd = 1;
      } else { const v = this.addScore(100); this.text('SCHIVATO! +' + v, 160 + (pl.mode === 'dodgeL' ? 50 : pl.mode === 'dodgeR' ? -50 : 0), 150, '#ffffff', 1, 0.7); this.emit('miss'); }
      if (f.combo >= 3 && f.combo % 3 === 0) { this.text('COMBO X' + f.combo, 160, 30, '#ffd83a', 1, 1.0); this.emit('combo', f.combo); }
      b.state = 'recover'; b.t = 0;
      return;
    }
    if (pl.block && a.block > 0) {
      dmg = Math.round(dmg * (1 - a.block));
      if (dmg <= 0) { f.combo++; const v = this.addScore(50); this.text('PARATA! +' + v, 160, 160, '#9fe8ff', 1, 0.7); this.emit('block'); b.state = 'recover'; b.t = 0; return; }
      this.text('PARATA A METÀ', 160, 160, '#9fe8ff', 1, 0.7); this.emit('block');
    } else if (pl.mode === 'duck' && a.duckMul) dmg = Math.round(dmg * a.duckMul);
    // hit!
    f.hp -= dmg; f.combo = 0; pl.mode = 'stagger'; pl.t = 0; pl.hitT = 0.25;
    this.shake = Math.min(10, 3 + dmg * 0.25); this.flash = 0.5; this.flashC = '#ff2030';
    this.text(COMIC_HIT[(Math.random() * COMIC_HIT.length) | 0], 160 + rnd(-30, 30), 150 + rnd(-20, 0), '#ffd83a', 3, 0.7, '#e01818');
    this.stars(160 + pl.x, 175 + pl.y, 10);
    f.crowd = 1.2; this.emit('hit', dmg);
    b.state = 'taunt'; b.t = 0; b.comboLeft = 0;
    if (Math.random() < 0.5) this.text(['E VAI!', 'TOMA!', 'BACIA QUESTO!', 'ANCORA?'][(Math.random() * 4) | 0], 160, 40, '#ffffff', 1, 0.8);
  }

  // ---------------------------------------------------------------- drawing
  buildBg() {
    const c = document.createElement('canvas'); c.width = DW; c.height = DH; const x = c.getContext('2d');
    // wall: dark red wallpaper with stripes
    for (let y = 0; y < 150; y++) { px(x, 0, y, DW, 1, mixC('#3a0a14', '#6a1a22', y / 150)); }
    for (let i = 0; i < DW; i += 14) { px(x, i, 0, 4, 150, 'rgba(0,0,0,0.12)'); px(x, i + 6, 0, 1, 150, 'rgba(255,200,120,0.06)'); }
    // wood wainscot
    px(x, 0, 92, DW, 4, '#2a1408'); px(x, 0, 96, DW, 54, '#4a2410'); for (let i = 0; i < DW; i += 32) px(x, i, 96, 2, 54, '#341808');
    // frames
    for (const [fx, fy, w, h, col] of [[18, 24, 34, 26, '#2a5a8a'], [262, 20, 40, 30, '#8a6a2a'], [70, 34, 22, 30, '#5a8a3a'], [226, 40, 22, 22, '#7a2a6a']]) {
      px(x, fx - 3, fy - 3, w + 6, h + 6, '#c8a040'); px(x, fx, fy, w, h, col); px(x, fx + 3, fy + h - 8, w - 6, 5, 'rgba(0,0,0,0.25)');
    }
    // banner
    px(x, 104, 54, 112, 14, '#f2ecdc'); px(x, 104, 68, 112, 2, '#a01818');
    drawText(x, 'CENA GOLIARDICA', 160, 57, '#a01818', 1, 'center', null);
    // floor (dark wood) between the long table and the counter
    for (let y = 150; y < 222; y++) px(x, 0, y, DW, 1, mixC('#3a1a10', '#5a2a16', (y - 150) / 72));
    for (let i = -10; i < 12; i++) { x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 1; x.beginPath(); x.moveTo(160 + i * 18, 150); x.lineTo(160 + i * 46, 222); x.stroke(); }
    for (let y = 160; y < 222; y += 12) px(x, 0, y, DW, 1, 'rgba(0,0,0,0.15)');
    // the long table behind (crowd sits here)
    px(x, 0, 128, DW, 4, '#d8d4c8'); px(x, 0, 132, DW, 24, '#f0ece0'); px(x, 0, 154, DW, 2, '#b8b0a0');
    for (let i = 0; i < DW; i += 20) px(x, i, 132, 1, 24, 'rgba(0,0,0,0.05)');
    for (let i = 6; i < DW; i += 26) { ell(x, i + 8, 131, 7, 2, '#ffffff'); ell(x, i + 8, 130, 4, 1, '#e8c060'); }
    for (let i = 20; i < DW; i += 52) { px(x, i, 114, 4, 16, '#1a5a2a'); px(x, i + 1, 108, 2, 7, '#1a5a2a'); px(x, i + 1, 120, 2, 4, '#f2ecdc'); }
    for (let i = 36; i < DW; i += 44) { px(x, i, 120, 5, 9, 'rgba(255,140,40,0.85)'); px(x, i + 2, 129, 1, 3, '#dddddd'); px(x, i - 1, 120, 7, 1, '#fff'); }
    // bar counter in the foreground (spritz slides here)
    px(x, 0, 222, DW, 3, '#7a4a20'); px(x, 0, 225, DW, 15, '#4a2410'); for (let i = 0; i < DW; i += 40) px(x, i, 225, 1, 15, '#341808');
    return c;
  }

  drawCrowd(x) {
    const f = this.f, cheer = f ? f.crowd : 0;
    for (let i = 0; i < 12; i++) {
      const cx = 14 + i * 27 + (i % 2) * 6; if (cx > 118 && cx < 202) continue;
      const bob = cheer > 0 ? Math.abs(Math.sin(this.t * 9 + i)) * 4 : Math.sin(this.t * 1.5 + i) * 0.8;
      const hy = 104 - bob;
      const shirt = ['#2a3a6a', '#5a2a2a', '#2a5a3a', '#4a4a4a', '#6a4a1a'][i % 5];
      px(x, cx - 9, hy + 10, 18, 18, shirt); ell(x, cx, hy + 3, 6, 7, ['#e8b890', '#c89070', '#f0c8a0'][i % 3]); px(x, cx - 6, hy - 4, 12, 4, ['#2a1a10', '#6a4a2a', '#1a1a1a', '#a08060'][i % 4]);
      if (cheer > 0 || (i * 7 + Math.floor(this.t * 0.7)) % 9 === 0) { px(x, cx - 12, hy - 6 + bob * 0.5, 3, 16, shirt); px(x, cx + 9, hy - 6 + bob * 0.5, 3, 16, shirt); }
      if (i % 4 === 1) { px(x, cx + 9, hy - 2, 5, 8, '#111'); if (Math.floor(this.t * 3 + i) % 3 === 0) px(x, cx + 10, hy - 1, 3, 3, '#fff'); } // phone filming
    }
  }

  // boyfriend pose -> body + fists
  bfPose() {
    const f = this.f, b = f.bf, a = b.attName ? ATT[b.attName] : null;
    const P = { lean: 0, crouch: 0, fists: [{ x: 138, y: 112, s: 1 }, { x: 182, y: 112, s: 1 }], face: 'angry', aura: 0, glint: null };
    const bob = Math.sin(this.t * 6) * 1.5; P.fists[0].y += bob; P.fists[1].y += bob * -1;
    if (b.state === 'windup' && a) {
      const tell = a.tell * this.tellScale * (b.quick ? 0.5 : 1), k = ease(clamp(b.t / tell, 0, 1)), fi = (b.fist > 0) ? 1 : 0, sgn = b.fist > 0 ? 1 : -1;
      const F = P.fists[fi];
      if (b.attName === 'jab') { F.x += sgn * 6 * k; F.y += 4 * k; F.s = 1 - 0.2 * k; P.lean = sgn * 3 * k; }
      else if (b.attName === 'hookL' || b.attName === 'hookR' || b.attName === 'fake') { F.x += sgn * 40 * k; F.y -= 8 * k; F.s = 1 - 0.15 * k; P.lean = sgn * 9 * k; }
      else if (b.attName === 'upper') { P.crouch = 12 * k; F.x = lerp(F.x, 166, k); F.y += 44 * k; F.s = 1 - 0.1 * k; }
      else if (b.attName === 'hay') { F.x += 30 * k; F.y -= 52 * k; F.s = 1 + 0.15 * k; P.lean = 12 * k; P.aura = k; }
      if (k > 0.65) P.glint = { x: F.x, y: F.y, c: a.col, k: (k - 0.65) / 0.35 };
      P.cue = a.cue; P.cueC = a.col;
    } else if (b.state === 'strike' && a) {
      const k = clamp(b.t / a.travel, 0, 1), fi = (b.fist > 0) ? 1 : 0, sgn = b.fist > 0 ? 1 : -1, F = P.fists[fi];
      const tx = 160 + (f.pl.x || 0) * 0.4, ty = 170;
      if (b.attName === 'jab') { F.x = lerp(F.x + sgn * 6, tx, k); F.y = lerp(F.y + 4, ty, k); F.s = lerp(0.8, 2.7, k); }
      else if (b.attName === 'hookL' || b.attName === 'hookR') { F.x = lerp(160 + sgn * 70, 160 - sgn * 50, k); F.y = lerp(104, ty - 8, k); F.s = lerp(0.9, 2.4, k); P.lean = sgn * lerp(9, -8, k); }
      else if (b.attName === 'upper') { F.x = lerp(166, tx, k); F.y = lerp(156, 140, k); F.s = lerp(0.9, 2.6, k); P.crouch = lerp(12, -6, k); }
      else if (b.attName === 'hay') { F.x = lerp(212, tx, k); F.y = lerp(60, ty, k); F.s = lerp(1.15, 3.1, k); P.lean = lerp(12, -10, k); P.aura = 1 - k; }
    } else if (b.state === 'tired') { P.crouch = 14 + Math.sin(this.t * 7) * 2; P.fists[0] = { x: 130, y: 160, s: 0.9 }; P.fists[1] = { x: 190, y: 160, s: 0.9 }; P.face = 'tired'; }
    else if (b.state === 'flustered') { P.face = 'blush'; P.lean = Math.sin(this.t * 10) * 3; P.fists[0].y += 20; P.fists[1].y += 20; }
    else if (b.state === 'taunt') { P.face = 'grin'; P.fists[1] = { x: 196, y: 80 + Math.sin(this.t * 14) * 3, s: 1.1 }; }
    else if (b.state === 'recover') { P.face = 'angry'; }
    return P;
  }

  drawBF(x, P, ghost) {
    const f = this.f, b = f.bf;
    const cx = 160 + P.lean, top = 60 + P.crouch;
    const anger = b.anger, skin = mixC('#e8b090', '#ff7060', clamp(anger * 0.8 + (P.face === 'blush' ? 0.4 : 0), 0, 1)), skinD = mixC('#b07850', '#c04030', anger);
    if (P.aura > 0) { const r = 60 + Math.sin(this.t * 30) * 4; x.fillStyle = `rgba(255,40,60,${0.18 * P.aura})`; x.beginPath(); x.arc(cx, top + 60, r, 0, 7); x.fill(); }
    // torso (tank top) + shoulders + arms behind fists
    const sh = top + 42;
    ell(x, cx - 34, sh + 4, 15, 12, skinD); ell(x, cx + 34, sh + 4, 15, 12, skinD);
    ell(x, cx - 34, sh + 3, 13, 10, skin); ell(x, cx + 34, sh + 3, 13, 10, skin);
    for (let y = 0; y < 150; y++) { const yy = sh + 70 + y; if (yy > 222) break; const w = 29 + y * 0.12; px(x, cx - w, yy, w * 2, 1, y < 4 ? '#3a2a1a' : (y % 9 ? '#2a4a7a' : '#24406a')); } // jeans
    for (let y = 0; y < 72; y++) { const w = lerp(38, 29, y / 72); px(x, cx - w, sh + y, w * 2, 1, y < 2 ? '#c8c8c8' : '#f2f2f2'); }
    px(x, cx - 29, sh + 64, 58, 2, '#d8d8d8');
    px(x, cx - 14, sh, 28, 8, skin); ell(x, cx, sh + 8, 14, 6, skin); // neckline
    for (let i = -12; i <= 12; i++) px(x, cx + i, sh + 10 + Math.round((i * i) / 18), 1, 1, '#ffd83a'); // gold chain
    px(x, cx - 26, sh + 22, 52, 1, 'rgba(0,0,0,0.08)');
    // neck + head
    px(x, cx - 9, top + 28, 18, 16, skin);
    ell(x, cx, top + 18, 17, 20, '#2a140a'); ell(x, cx, top + 18, 15, 18, skin);
    ell(x, cx, top + 3, 15, 7, '#2a1a10'); px(x, cx - 15, top + 2, 30, 4, '#2a1a10'); // buzz cut
    ell(x, cx - 16, top + 18, 3, 5, skin); ell(x, cx + 16, top + 18, 3, 5, skin);
    // face
    const ey = top + 16;
    if (P.face === 'tired') { px(x, cx - 9, ey, 6, 1, '#1a0a0a'); px(x, cx + 3, ey, 6, 1, '#1a0a0a'); ell(x, cx, ey + 12, 4, 4, '#3a0a0a'); px(x, cx - 12, ey - 5, 3, 6, '#9fe8ff'); }
    else if (P.face === 'blush') { px(x, cx - 9, ey, 6, 2, '#1a0a0a'); px(x, cx + 3, ey, 6, 2, '#1a0a0a'); ell(x, cx - 10, ey + 7, 4, 2, '#ff5a7a'); ell(x, cx + 10, ey + 7, 4, 2, '#ff5a7a'); px(x, cx - 3, ey + 11, 6, 1, '#3a0a0a'); }
    else {
      px(x, cx - 10, ey - 5, 8, 2, '#1a0a0a'); px(x, cx + 2, ey - 5, 8, 2, '#1a0a0a'); px(x, cx - 4, ey - 4, 2, 2, '#1a0a0a'); px(x, cx + 2, ey - 4, 2, 2, '#1a0a0a'); // brows
      px(x, cx - 8, ey, 4, 3, '#fff'); px(x, cx + 4, ey, 4, 3, '#fff'); px(x, cx - 7, ey + 1, 2, 2, '#1a0a0a'); px(x, cx + 5, ey + 1, 2, 2, '#1a0a0a');
      if (P.face === 'grin') { px(x, cx - 6, ey + 10, 12, 4, '#fff'); px(x, cx - 6, ey + 12, 12, 1, '#7a2a2a'); }
      else { px(x, cx - 6, ey + 10, 12, 3, '#fff'); px(x, cx - 6, ey + 11, 12, 1, '#999'); px(x, cx - 7, ey + 9, 14, 1, '#5a1a1a'); }
    }
    px(x, cx - 2, ey + 4, 4, 4, skinD); // nose
    if (anger > 0.55 && !ghost) { const v = Math.floor(this.t * 6) % 2; px(x, cx + 9, top + 2, 2, 4, '#c01010'); px(x, cx + 7 + v, top + 4, 6, 2, '#c01010'); }
    // arms to fists (upper arm + forearm with a bent elbow)
    x.lineCap = 'round'; x.lineJoin = 'round';
    for (let i = 0; i < 2; i++) {
      const F = P.fists[i], sgn = i ? 1 : -1, shx = cx + sgn * 34, shy = sh + 6;
      const ex = lerp(shx, F.x, 0.45) + sgn * 14, ey = Math.max(shy + 14, lerp(shy, F.y, 0.5) + 16);
      const w = 13 * lerp(1, F.s, 0.35);
      for (const [lw, col] of [[w + 3, '#3a1408'], [w, skin]]) { x.strokeStyle = col; x.lineWidth = lw; x.beginPath(); x.moveTo(shx, shy); x.lineTo(ex, ey); x.lineTo(F.x, F.y); x.stroke(); }
      x.strokeStyle = skinD; x.lineWidth = 2; x.beginPath(); x.moveTo(shx + sgn * 3, shy + 6); x.lineTo(ex, ey); x.stroke();
    }
    // fists drawn after (they come toward the camera)
    for (let i = 0; i < 2; i++) this.drawFist(x, P.fists[i], skin, skinD, i);
    if (P.glint && !ghost) { const g = P.glint, r = 3 + g.k * 7; x.fillStyle = g.c; px(x, g.x - r, g.y - 1, r * 2, 2, g.c); px(x, g.x - 1, g.y - r, 2, r * 2, g.c); }
    if (P.cue && !ghost && b.state === 'windup') drawText(x, P.cue, cx, top - 18, P.cueC, 2, 'center', '#000');
    if (b.state === 'tired' && !ghost) for (let i = 0; i < 3; i++) { const a = this.t * 3 + i * 2.1; px(x, cx + Math.cos(a) * 22 - 2, top - 6 + Math.sin(a) * 5, 4, 4, '#ffd83a'); }
  }
  drawFist(x, F, skin, skinD, i) {
    const r = 10 * F.s;
    ell(x, F.x, F.y, r + 1.5, r * 0.85 + 1.5, '#3a1408');
    ell(x, F.x, F.y, r, r * 0.85, skin);
    for (let k = -1; k <= 2; k++) px(x, F.x - r * 0.75 + (k + 1) * r * 0.4, F.y - r * 0.55, Math.max(1, r * 0.08), r * 0.6, skinD);
    ell(x, F.x + (i ? -1 : 1) * r * 0.55, F.y + r * 0.3, r * 0.35, r * 0.25, skinD);
  }

  drawEx(x) {
    const f = this.f, e = f.ex; if (!e) return;
    const k = e.leave ? 1 - clamp((e.out || 0) / 0.5, 0, 1) : clamp(e.t / 0.35, 0, 1);
    const cx = e.side < 0 ? lerp(-40, 58, ease(k)) : lerp(360, 262, ease(k)), top = 92;
    ell(x, cx, top + 14, 15, 22, '#8a2a10'); // hair back
    px(x, cx - 16, top + 30, 32, 60, '#c01830'); ell(x, cx, top + 32, 18, 8, '#c01830'); // dress
    px(x, cx - 6, top + 22, 12, 10, '#f0c8a8');
    ell(x, cx, top + 12, 11, 13, '#f0c8a8');
    px(x, cx - 6, top + 9, 4, 2, '#1a0a0a'); px(x, cx + 2, top + 9, 4, 2, '#1a0a0a'); px(x, cx - 3, top + 17, 6, 2, '#d0204a');
    ell(x, cx - 10, top + 6, 6, 10, '#a83a18'); ell(x, cx + 10, top + 6, 6, 10, '#a83a18'); ell(x, cx, top - 1, 12, 6, '#a83a18');
    px(x, cx + (e.side < 0 ? 14 : -20), top + 36, 6, 9, 'rgba(255,140,40,0.9)');
    if (!e.leave && Math.floor(this.t * 3) % 2 === 0) { const bx = e.side < 0 ? cx + 18 : cx - 74; px(x, bx, top - 22, 56, 14, '#fff'); drawText(x, 'CIAO ♥', bx + 28, top - 19, '#c01830', 1, 'center', null); }
  }

  drawDirector(x) {
    const f = this.f, pl = f.pl;
    const cx = 160 + pl.x, by = 188 + pl.y, tilt = pl.tilt;
    x.save(); x.globalAlpha = 0.93;
    x.translate(cx, by); x.rotate(tilt); x.translate(-cx, -by);
    // jacket back + shoulders
    ell(x, cx, by + 40, 52, 30, '#0a0a14'); ell(x, cx, by + 40, 50, 28, '#1c2a4a');
    px(x, cx - 1, by + 24, 2, 30, '#121a30');
    drawText(x, 'DIRETTORE', cx, by + 32, '#ffd83a', 1, 'center', null);
    // collar + neck + head (back of head)
    px(x, cx - 9, by + 4, 18, 12, '#e8b890'); px(x, cx - 12, by + 12, 24, 4, '#f2f2f2');
    ell(x, cx, by - 6, 16, 18, '#0a0604'); ell(x, cx, by - 6, 14, 16, '#3a2414');
    for (let i = 0; i < 6; i++) ell(x, cx - 10 + i * 4, by - 18 + (i % 2) * 3, 3, 3, '#4a301c');
    ell(x, cx - 15, by - 4, 3, 5, '#e8b890'); ell(x, cx + 15, by - 4, 3, 5, '#e8b890');
    px(x, cx - 15, by - 8, 4, 1, '#111'); px(x, cx + 11, by - 8, 4, 1, '#111'); // glasses temples
    // block: forearms up beside the head
    if (pl.block) { for (const s of [-1, 1]) { px(x, cx + s * 18 - 6, by - 24, 12, 34, '#1c2a4a'); ell(x, cx + s * 18, by - 26, 7, 7, '#e8b890'); } }
    else if (pl.mode === 'drink') { px(x, cx + 20, by - 18, 10, 30, '#1c2a4a'); px(x, cx + 18, by - 30, 7, 12, 'rgba(255,140,40,0.9)'); }
    else { for (const s of [-1, 1]) ell(x, cx + s * 30, by + 18, 8, 10, '#1c2a4a'); }
    // press badge lanyard
    px(x, cx + 26, by + 30, 12, 9, '#f2ecdc'); px(x, cx + 27, by + 31, 10, 2, '#c01830');
    x.restore();
    if (pl.hitT > 0) { x.fillStyle = `rgba(255,40,40,${pl.hitT})`; x.fillRect(cx - 50, by - 26, 100, 80); }
  }

  drawHud(x) {
    const f = this.f;
    px(x, 0, 0, DW, 24, 'rgba(10,4,12,0.85)');
    drawText(x, 'DIRETTORE', 4, 2, '#ffd83a', 1, 'left', null);
    px(x, 4, 11, 104, 7, '#000'); px(x, 6, 13, 100 * f.hpShow / 100, 3, '#ff9a9a'); px(x, 6, 13, 100 * f.hp / 100, 3, f.hp > 35 ? '#8ee03a' : '#ff3040');
    for (let i = 0; i < 3; i++) px(x, 112 + i * 6, 11, 4, 7, i < f.alcol ? '#ff9a1a' : '#3a2a3a');
    drawText(x, 'ROUND ' + f.round, 160, 2, '#fff', 1, 'center', null);
    const tm = Math.max(0, Math.ceil(f.timer)); drawText(x, '0:' + String(tm).padStart(2, '0'), 160, 12, tm <= 5 ? '#ff3040' : '#c8f03c', 1, 'center', null);
    drawText(x, 'RABBIA', 316, 2, '#ff6a6a', 1, 'right', null);
    px(x, 212, 11, 104, 7, '#000'); px(x, 214, 13, 100 * f.bf.anger, 3, '#ff3040');
    drawText(x, String(this.demo ? f.score : this.score).padStart(7, '0'), 4, 27, '#fff', 1, 'left', '#000');
    drawText(x, 'HI ' + String(this.hi).padStart(7, '0'), 316, 27, '#ffd83a', 1, 'right', '#000');
    if (f.combo >= 2) drawText(x, 'COMBO X' + f.combo, 160, 27, '#ffd83a', 1, 'center', '#000');
    if (this.mult() > 1.01) drawText(x, 'X' + this.mult().toFixed(1), 4, 37, '#ff9a1a', 1, 'left', '#000');
  }

  drawFx(x) {
    for (const p of this.fx) {
      const k = p.life / p.max;
      if (p.k === 'txt') {
        const sc = p.scale * (k > 0.85 ? 1 + (k - 0.85) * 2.5 : 1);
        if (p.burst) { const w = p.s.length * 6 * sc * 0.5 + 10, h = 7 * sc * 0.5 + 8; x.fillStyle = p.burst; x.beginPath(); for (let i = 0; i < 16; i++) { const a = i / 16 * 6.283, r = i % 2 ? 0.75 : 1; x.lineTo(p.x + Math.cos(a) * w * r, p.y + 3 * sc + Math.sin(a) * h * r); } x.fill(); }
        drawText(x, p.s, p.x, p.y, p.c, Math.max(1, Math.round(sc)), 'center', '#000');
      } else if (p.k === 'heart') drawText(x, '♥', p.x, p.y, '#ff5a8a', 1, 'center', null);
      else if (p.k === 'spark') px(x, p.x, p.y, 2, 2, p.c);
    }
  }

  draw() {
    const x = this.ctx, s = this.state;
    x.save(); x.imageSmoothingEnabled = false;
    if (s === 'attract' && !(this.f && this.attractT > 16)) { this.drawAttract(x); x.restore(); return; }
    if (s === 'over') { this.drawOver(x); x.restore(); return; }
    const f = this.f;
    const sway = f ? f.alcol * 2.2 * Math.sin(this.t * 1.6) : 0;
    if (this.shake > 0) x.translate(Math.round(rnd(-this.shake, this.shake)), Math.round(rnd(-this.shake, this.shake)));
    if (sway) { x.translate(160, 120); x.rotate(sway * 0.006); x.translate(-160 + sway, -120); }
    x.drawImage(this.bg, 0, 0);
    // string lights
    for (let i = 0; i < 20; i++) { const lx = 8 + i * 16, ly = 30 + Math.sin(i * 0.9) * 3; px(x, lx, ly, 3, 3, (Math.floor(this.t * 2) + i) % 3 ? '#ffd870' : '#ff9a40'); }
    this.drawCrowd(x);
    const P = this.bfPose();
    if (f.alcol >= 2) { x.save(); x.globalAlpha = 0.3; x.translate(5 + Math.sin(this.t * 2) * 3, 0); this.drawBF(x, P, true); x.restore(); }
    this.drawBF(x, P, false);
    this.drawEx(x);
    // counter + spritz
    x.drawImage(this.bg, 0, 222, DW, 18, 0, 222, DW, 18);
    if (f.spritz) { const sx = f.spritz.x; px(x, sx - 5, 206, 10, 14, 'rgba(255,140,40,0.92)'); px(x, sx - 5, 206, 10, 2, '#fff'); px(x, sx - 1, 220, 2, 3, '#ddd'); px(x, sx - 4, 222, 8, 1, '#ddd'); px(x, sx + 2, 203, 4, 4, '#ff5a20'); if (Math.abs(sx - 160) < 30 && Math.floor(this.t * 6) % 2) drawText(x, 'X', sx, 194, '#ffd83a', 1, 'center', '#000'); }
    this.drawDirector(x);
    if (f.ex && !f.ex.leave && Math.floor(this.t * 4) % 2) drawText(x, 'Z = BACIO', f.ex.side < 0 ? 58 : 262, 196, '#ff6aa0', 1, 'center', '#000');
    this.drawFx(x);
    x.restore();
    this.drawHud(x);
    if (this.flash > 0) { x.fillStyle = this.flashC; x.globalAlpha = Math.min(0.5, this.flash); x.fillRect(0, 0, DW, DH); x.globalAlpha = 1; }
    if (s === 'intro') {
      px(x, 0, 92, DW, 50, 'rgba(0,0,0,0.6)');
      drawText(x, 'ROUND ' + f.round, 160, 98, '#ffd83a', 3, 'center', '#a01818');
      if (this.st > 1.1) drawText(x, 'VIA!', 160, 124, '#fff', 2, 'center', '#a01818');
    }
    if (s === 'ko') {
      px(x, 0, 86, DW, 60, 'rgba(0,0,0,0.55)');
      drawText(x, 'K.O.!', 160, 92, '#ff3040', 4, 'center', '#000');
      if (this.st > 0.9) drawText(x, 'IL DIRETTORE INCASSA', 160, 128, '#ffd83a', 1, 'center', '#000');
    }
    if (this.demo && s === 'attract') { px(x, 0, 214, DW, 26, 'rgba(0,0,0,0.6)'); drawText(x, 'DEMO - PREMI START', 160, 222, Math.floor(this.t * 2) % 2 ? '#c8f03c' : '#fff', 1, 'center', null); }
    if (this.paused) { x.fillStyle = 'rgba(10,0,20,0.6)'; x.fillRect(0, 0, DW, DH); drawText(x, 'PAUSA', 160, 110, '#fff', 3, 'center'); }
  }

  drawAttract(x) {
    const T = this.attractT;
    x.drawImage(this.bg, 0, 0);
    px(x, 0, 0, DW, DH, 'rgba(10,0,8,0.55)');
    if (T < 9) {
      // comic title + punching fist
      const k = clamp(T / 0.6, 0, 1), punch = (Math.sin(this.t * 4) + 1) / 2;
      x.fillStyle = '#ffd83a'; x.beginPath(); for (let i = 0; i < 24; i++) { const a = i / 24 * 6.283, r = (i % 2 ? 62 : 92) * (0.9 + punch * 0.1); x.lineTo(232 + Math.cos(a) * r, 150 + Math.sin(a) * r * 0.75); } x.fill();
      drawText(x, 'POW!', 232, 140, '#e01818', 3, 'center', '#000');
      this.drawFist(x, { x: 70 + punch * 40, y: 150, s: 2.4 + punch * 0.6 }, '#e8b090', '#b07850', 1);
      drawText(x, 'IL DIRETTORE', 160, 34 - (1 - k) * 60, '#fff', 3, 'center', '#a01818');
      drawText(x, 'INCASSA', 160, 64 - (1 - k) * 60, '#ffd83a', 4, 'center', '#a01818');
      drawText(x, 'UNA STORIA VERA DEL CORRIERE', 160, 100, '#f2ecdc', 1, 'center', '#000');
      if (Math.floor(this.t * 2) % 2) drawText(x, 'PREMI START', 160, 206, '#c8f03c', 2, 'center', '#000');
      drawText(x, 'HI ' + String(this.hi).padStart(7, '0'), 160, 228, '#ffd83a', 1, 'center', '#000');
    } else {
      drawText(x, 'COME SI GIOCA', 160, 18, '#ffd83a', 2, 'center', '#a01818');
      const rows = [['← →', 'SCHIVA'], ['↓', 'ABBASSATI'], ['↑', 'PARA (TIENI)'], ['Z', 'BACIO VOLANTE'], ['X', 'BEVI LO SPRITZ']];
      rows.forEach((r, i) => { drawText(x, r[0], 96, 50 + i * 16, '#c8f03c', 1, 'right', '#000'); drawText(x, r[1], 110, 50 + i * 16, '#fff', 1, 'left', '#000'); });
      drawText(x, '!  DIRETTO: PARA O SCHIVA', 160, 140, '#ffffff', 1, 'center', '#000');
      drawText(x, '!! GANCIO: SCHIVA DALL\'ALTRA PARTE', 160, 152, '#ffd83a', 1, 'center', '#000');
      drawText(x, '!! MONTANTE DAL BASSO: DI LATO', 160, 164, '#ff9a1a', 1, 'center', '#000');
      drawText(x, '!!! IL DESTRO: ABBASSATI!', 160, 176, '#ff3040', 1, 'center', '#000');
      drawText(x, 'LA EX? Z PER UN BACIO... ATTENTO', 160, 194, '#ff6aa0', 1, 'center', '#000');
      if (Math.floor(this.t * 2) % 2) drawText(x, 'PREMI START', 160, 218, '#c8f03c', 2, 'center', '#000');
    }
  }

  drawOver(x) {
    const k = ease(clamp(this.st / 1.2, 0, 1)), f = this.f;
    x.fillStyle = '#120608'; x.fillRect(0, 0, DW, DH);
    x.save(); x.translate(160, 120); x.rotate((1 - k) * 12); x.scale(0.1 + k * 0.9, 0.1 + k * 0.9);
    px(x, -150, -110, 300, 220, '#f2ecdc'); px(x, -150, -110, 300, 2, '#1a1a1a');
    drawText(x, 'IL CORRIERE DELLE DUE TORRI', 0, -102, '#1a1a1a', 1, 'center', null);
    px(x, -140, -90, 280, 1, '#1a1a1a');
    drawText(x, 'IL DIRETTORE', 0, -82, '#a01818', 3, 'center', null);
    drawText(x, 'INCASSA', 0, -56, '#a01818', 3, 'center', null);
    px(x, -140, -28, 120, 80, '#d8d0bc'); // photo: director down with stars
    ell(x, -80, 30, 40, 10, '#1c2a4a'); ell(x, -110, 22, 11, 9, '#3a2414');
    for (let i = 0; i < 4; i++) { const a = this.t * 4 + i * 1.57; px(x, -110 + Math.cos(a) * 16, 8 + Math.sin(a) * 4, 3, 3, '#e0a000'); }
    drawText(x, 'KO AL ROUND ' + (f ? f.round : 1), 40, -22, '#1a1a1a', 1, 'center', null);
    drawText(x, 'PUNTI', 40, -6, '#555', 1, 'center', null);
    drawText(x, String(this.score), 40, 6, '#1a1a1a', 2, 'center', null);
    if (this.score >= this.hi && this.score > 0) drawText(x, 'NUOVO RECORD!', 40, 30, '#a01818', 1, 'center', null);
    drawText(x, 'PIENO DI ALCOL? LA REDAZIONE', 40, 46, '#555', 1, 'center', null);
    drawText(x, 'NON COMMENTA.', 40, 56, '#555', 1, 'center', null);
    x.restore();
    if (this.st > 2.5 && Math.floor(this.t * 2) % 2) drawText(x, 'PREMI START', 160, 226, '#c8f03c', 1, 'center', '#000');
  }
}
