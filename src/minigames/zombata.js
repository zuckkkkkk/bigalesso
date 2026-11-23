// "LA ZOMBATA DI SEGHINO" — 320x240 top-down zombie survival for the third cabinet. Same API as Game/DirectorGame:
// canvas, input {up,down,left,right,fire,bomb,start,pause}, state ('attract'|'play'|'over'), update(dt), draw(), paused, credits.
// Arrows move; hold Z to shoot (while Z is held you keep facing the same way: walk backwards and shoot);
// X = molotov (clears around you). Waves of zombies, pickups (birretta, mitra, fucile, molotov), a boss every 4 waves.
import { drawText, textWidth } from '../font.js';

export const ZW = 320, ZH = 240;
const TOP = 18; // HUD height
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = a => a[Math.floor(Math.random() * a.length)];
const T = (x, s, X, Y, c = '#fff', sc = 1, al = 'left', sh = '#000') => drawText(x, String(s).toUpperCase(), Math.round(X), Math.round(Y), c, sc, al, sh);

const ZT = {
  walker: { hp: 2, sp: [20, 30], r: 5, pts: 100, body: '#4f6b3a', head: '#8fbf5a', shirt: ['#6a5a4a', '#4a5a7a', '#7a3a3a', '#5a5a5a'] },
  runner: { hp: 1, sp: [48, 58], r: 4, pts: 150, body: '#6a6a5a', head: '#c8d8a0', shirt: ['#b0b0a0', '#8a7a6a'] },
  tank: { hp: 10, sp: [14, 18], r: 8, pts: 400, body: '#3a4a2a', head: '#7aa050', shirt: ['#5a3a6a', '#3a3a3a'] },
  boss: { hp: 90, sp: [18, 22], r: 14, pts: 5000, body: '#2a3a1a', head: '#a0d060', shirt: ['#8a1010'] },
};
const OBST = [ // arena props (x, y, w, h, kind)
  [54, 66, 34, 16, 'car'], [226, 160, 34, 16, 'car'], [146, 118, 28, 28, 'fountain'], [228, 62, 26, 9, 'bench'], [62, 178, 26, 9, 'bench'],
];
const PICKS = ['birra', 'mitra', 'fucile', 'molotov', 'gettone'];
const PICK_COL = { birra: '#ffb020', mitra: '#60c0ff', fucile: '#ff7050', molotov: '#ff3030', gettone: '#ffe040' };
const PICK_NAME = { birra: 'BIRRETTA +1', mitra: 'MITRA!', fucile: 'FUCILE!', molotov: 'MOLOTOV +1', gettone: '+500' };
const TAUNTS = ['ZOMBATA?', 'ZOMBATINA', 'REGA', 'PALESE', 'TOCCA', 'DISCORD DAI', 'GROSSO ERRORE', 'RAGAZZI BELLI'];

export class ZombataGame {
  constructor(emit) {
    this.canvas = document.createElement('canvas'); this.canvas.width = ZW; this.canvas.height = ZH;
    this.ctx = this.canvas.getContext('2d'); this.ctx.imageSmoothingEnabled = false;
    this.emit = emit || (() => { });
    this.input = { up: 0, down: 0, left: 0, right: 0, fire: 0, bomb: 0, start: 0, pause: 0 };
    this.prev = { ...this.input };
    this.state = 'attract'; this.t = 0; this.st = 0; this.acc = 0; this.paused = false; this.credits = 0;
    this.score = 0; this.hi = 30000;
    try { const v = +localStorage.getItem('zombata_hi'); if (v > this.hi) this.hi = v; } catch (e) { }
    this.bg = this.buildBg();
    this.decal = document.createElement('canvas'); this.decal.width = ZW; this.decal.height = ZH; this.dx = this.decal.getContext('2d');
    this.dark = document.createElement('canvas'); this.dark.width = ZW; this.dark.height = ZH; this.dkx = this.dark.getContext('2d');
    this.fx = []; this.shake = 0; this.flash = 0; this.demoZ = [];
    this.g = null; this.taunt = null;
    for (let i = 0; i < 7; i++) this.demoZ.push({ x: rnd(0, ZW), y: rnd(130, 230), sp: rnd(10, 22) * (Math.random() < 0.5 ? -1 : 1), ph: rnd(0, 6), type: i % 5 === 0 ? 'tank' : 'walker', shirt: pick(ZT.walker.shirt) });
  }
  pressed(k) { return this.input[k] && !this.prev[k]; }
  setState(s) { this.state = s; this.st = 0; }

  // ------------------------------------------------------------ game state
  newGame() {
    this.dx.clearRect(0, 0, ZW, ZH);
    this.score = 0; this.fx = [];
    this.g = {
      p: { x: ZW / 2, y: 150, r: 5, dir: [0, -1], hp: 3, inv: 2, fireT: 0, weapon: 'pistola', wT: 0, bombs: 2, step: 0, moving: false },
      z: [], b: [], picks: [], wave: 0, toSpawn: 0, spawnT: 0, waveT: 0, between: 2.2, combo: 0, comboT: 0, kills: 0, boss: null, bossWave: false,
    };
    this.nextWave();
  }
  nextWave() {
    const g = this.g; g.wave++; g.bossWave = g.wave % 4 === 0;
    g.toSpawn = g.bossWave ? 6 + g.wave : 6 + g.wave * 3; g.spawnT = 0.6; g.between = 0;
    if (g.bossWave) { this.spawn('boss'); this.emit('boss'); this.text('ARRIVA LO ZOMBONE!', ZW / 2, 100, '#ff5050', 2, 2.2); }
    else this.emit('wave', g.wave);
    this.banner = { s: 'ONDATA ' + g.wave, t: 1.8 };
  }
  spawn(type) {
    const g = this.g, D = ZT[type];
    // from the arena edges (the four portico gaps + random edge points)
    const side = Math.floor(Math.random() * 4);
    let x, y;
    if (side === 0) { x = rnd(20, ZW - 20); y = TOP - 10; } else if (side === 1) { x = rnd(20, ZW - 20); y = ZH + 10; }
    else if (side === 2) { x = -10; y = rnd(TOP + 20, ZH - 20); } else { x = ZW + 10; y = rnd(TOP + 20, ZH - 20); }
    const hpMul = 1 + (g.wave - 1) * 0.12;
    const z = { type, x, y, r: D.r, hp: Math.ceil(D.hp * (type === 'boss' ? 1 + g.wave * 0.25 : hpMul)), sp: rnd(D.sp[0], D.sp[1]) * (1 + Math.min(0.5, g.wave * 0.04)), ph: rnd(0, 6), hit: 0, shirt: pick(D.shirt), dir: [0, 1], stun: 0, enter: 1.2, charge: 0, chargeT: rnd(3, 5), summonT: 4 };
    z.maxHp = z.hp; g.z.push(z); if (type === 'boss') g.boss = z;
    return z;
  }
  text(s, x, y, c = '#fff', scale = 1, life = 0.9) { this.fx.push({ k: 'txt', s, x, y, c, scale, life, max: life }); }
  blood(x, y, n = 8, c = '#7a0a0a') {
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, s = rnd(20, 80); this.fx.push({ k: 'bit', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.2, 0.5), max: 0.5, c }); }
    const d = this.dx; d.fillStyle = 'rgba(90,8,8,0.55)';
    for (let i = 0; i < 5; i++) d.fillRect(Math.round(x + rnd(-6, 6)), Math.round(y + rnd(-5, 5)), Math.round(rnd(1, 4)), Math.round(rnd(1, 3)));
  }
  addScore(n) { const g = this.g; const m = 1 + Math.min(4, Math.floor(g.combo / 4)); const v = n * m; this.score += v; if (this.score > this.hi) this.hi = this.score; return v; }

  // ------------------------------------------------------------ update
  update(dt) {
    if (this.pressed('pause') && this.state === 'play') this.paused = !this.paused;
    if (this.paused) { this.prev = { ...this.input }; return; }
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= 1 / 60) { this.step(1 / 60); this.acc -= 1 / 60; this.prev = { ...this.input }; }
  }
  step(dt) {
    this.t += dt; this.st += dt;
    this.shake = Math.max(0, this.shake - dt * 30); this.flash = Math.max(0, this.flash - dt * 3);
    for (const f of this.fx) { f.life -= dt; if (f.vx !== undefined) { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.9; f.vy *= 0.9; } else if (f.k === 'txt') f.y -= dt * 14; }
    this.fx = this.fx.filter(f => f.life > 0);
    if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null; }
    if (this.taunt) { this.taunt.t -= dt; if (this.taunt.t <= 0) this.taunt = null; }
    const s = this.state;
    if (s === 'attract') {
      for (const z of this.demoZ) { z.x += z.sp * dt; z.ph += dt * 5; if (z.x < -20) z.x = ZW + 20; if (z.x > ZW + 20) z.x = -20; }
      if (this.pressed('start') || this.pressed('fire')) { if (this.credits > 0) this.credits--; this.newGame(); this.setState('play'); this.emit('start'); }
      return;
    }
    if (s === 'over') {
      if (this.st > 1.5 && (this.pressed('start') || this.pressed('fire'))) { this.newGame(); this.setState('play'); this.emit('start'); }
      if (this.st > 9) this.setState('attract');
      return;
    }
    this.play(dt);
  }
  collideObst(o) {
    for (const [x, y, w, h] of OBST) {
      const qx = clamp(o.x, x, x + w), qy = clamp(o.y, y, y + h), dx = o.x - qx, dy = o.y - qy, d = Math.hypot(dx, dy);
      if (d < o.r) { if (d > 1e-4) { o.x = qx + dx / d * o.r; o.y = qy + dy / d * o.r; } else { o.y = y - o.r; } }
    }
  }
  play(dt) {
    const g = this.g, p = g.p, I = this.input;
    // ---- player
    let mx = (I.right ? 1 : 0) - (I.left ? 1 : 0), my = (I.down ? 1 : 0) - (I.up ? 1 : 0);
    const m = Math.hypot(mx, my); if (m > 0) { mx /= m; my /= m; }
    p.moving = m > 0;
    if (p.moving && !I.fire) p.dir = [mx, my];
    const spd = I.fire ? 56 : 74;
    p.x += mx * spd * dt; p.y += my * spd * dt; if (p.moving) p.step += dt * 10;
    p.x = clamp(p.x, 10, ZW - 10); p.y = clamp(p.y, TOP + 10, ZH - 8);
    this.collideObst(p);
    p.inv = Math.max(0, p.inv - dt);
    if (p.wT > 0) { p.wT -= dt; if (p.wT <= 0) { p.weapon = 'pistola'; this.text('PISTOLA', p.x, p.y - 12, '#ccc'); } }
    p.fireT -= dt;
    if (I.fire && p.fireT <= 0) this.shoot();
    if (this.pressed('bomb') && p.bombs > 0) this.molotov();
    // ---- spawning / waves
    if (g.toSpawn > 0) {
      g.spawnT -= dt;
      if (g.spawnT <= 0) {
        const w = g.wave, r = Math.random();
        const type = (w >= 3 && r < 0.12) ? 'tank' : (w >= 2 && r < 0.38) ? 'runner' : 'walker';
        this.spawn(type); g.toSpawn--;
        g.spawnT = Math.max(0.22, 1.1 - w * 0.08) * rnd(0.6, 1.3);
      }
    } else if (!g.z.length) {
      if (g.between === 0) {
        g.between = 2.6; this.emit('clear', g.wave);
        const b = 250 * g.wave; this.addScore(b); this.text('ONDATA SUPERATA +' + b, ZW / 2, 110, '#d8ff6a', 1, 2.2);
        this.taunt = { s: 'SEGHINO: ' + pick(TAUNTS), t: 2.4 };
      } else { g.between -= dt; if (g.between <= 0) this.nextWave(); }
    }
    // ---- zombies
    for (const z of g.z) {
      z.ph += dt * (z.type === 'runner' ? 12 : 6); z.hit = Math.max(0, z.hit - dt); z.stun = Math.max(0, z.stun - dt); z.enter = Math.max(0, z.enter - dt);
      let tx = p.x - z.x, ty = p.y - z.y; const d = Math.hypot(tx, ty) || 1; tx /= d; ty /= d;
      z.dir = [z.dir[0] + (tx - z.dir[0]) * Math.min(1, dt * 4), z.dir[1] + (ty - z.dir[1]) * Math.min(1, dt * 4)];
      let sp = z.sp * (z.stun > 0 ? 0.15 : 1) * (0.75 + 0.25 * Math.sin(z.ph * 0.5));
      if (z.type === 'boss') {
        z.chargeT -= dt;
        if (z.charge > 0) { z.charge -= dt; sp *= 3.2; } else if (z.chargeT <= 0) { z.charge = 0.7; z.chargeT = rnd(3, 5); this.shake = 4; this.emit('roar'); }
        z.summonT -= dt; if (z.summonT <= 0) { z.summonT = rnd(4, 6); for (let i = 0; i < 2; i++) this.spawn('walker'); }
      }
      z.x += z.dir[0] * sp * dt; z.y += z.dir[1] * sp * dt;
      if (z.enter <= 0) { z.x = clamp(z.x, 6, ZW - 6); z.y = clamp(z.y, TOP + 6, ZH - 6); this.collideObst(z); }
      if (d < z.r + p.r - 1 && p.inv <= 0 && z.stun <= 0) this.hurt(z);
    }
    // separation (cheap n^2, n is small)
    const Z = g.z;
    for (let i = 0; i < Z.length; i++) for (let j = i + 1; j < Z.length; j++) {
      const a = Z[i], b = Z[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), mm = a.r + b.r - 1;
      if (d < mm && d > 1e-3) { const k = (mm - d) / d, ka = a.type === 'boss' ? 0 : (b.type === 'boss' ? 1 : 0.5), kb = b.type === 'boss' ? 0 : (a.type === 'boss' ? 1 : 0.5); a.x -= dx * k * ka; a.y -= dy * k * ka; b.x += dx * k * kb; b.y += dy * k * kb; }
    }
    // ---- bullets
    for (const b of g.b) {
      // light aim assist: steer toward the nearest zombie in front
      let best = null, bd = 60;
      for (const z of g.z) { const dx = z.x - b.x, dy = z.y - b.y, d = Math.hypot(dx, dy); if (d < bd && (dx * b.vx + dy * b.vy) / (d * b.sp) > 0.93) { bd = d; best = z; } }
      if (best) { const dx = best.x - b.x, dy = best.y - b.y, d = Math.hypot(dx, dy); b.vx += (dx / d * b.sp - b.vx) * Math.min(1, dt * 6); b.vy += (dy / d * b.sp - b.vy) * Math.min(1, dt * 6); }
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      for (const [x, y, w, h, k] of OBST) if (k !== 'bench' && b.x > x && b.x < x + w && b.y > y && b.y < y + h) { b.life = 0; this.fx.push({ k: 'bit', x: b.x, y: b.y, vx: rnd(-30, 30), vy: rnd(-30, 30), life: 0.15, max: 0.15, c: '#ffd080' }); }
      for (const z of g.z) {
        if (b.life <= 0 || z.hp <= 0) continue;
        if (Math.hypot(z.x - b.x, z.y - b.y) < z.r + 2) {
          b.life = 0; z.hp -= b.dmg; z.hit = 0.08; z.x += b.vx * 0.012 * (z.type === 'boss' ? 0.1 : 1); z.y += b.vy * 0.012 * (z.type === 'boss' ? 0.1 : 1);
          this.blood(z.x, z.y, 3); this.emit('hit');
          if (z.hp <= 0) this.kill(z);
        }
      }
    }
    g.b = g.b.filter(b => b.life > 0 && b.x > -5 && b.x < ZW + 5 && b.y > TOP - 5 && b.y < ZH + 5);
    g.z = g.z.filter(z => z.hp > 0);
    // ---- pickups
    for (const k of g.picks) {
      k.t -= dt;
      if (Math.hypot(k.x - p.x, k.y - p.y) < 9) { k.t = 0; this.take(k.kind); }
    }
    g.picks = g.picks.filter(k => k.t > 0);
    g.comboT -= dt; if (g.comboT <= 0) g.combo = 0;
  }
  shoot() {
    const g = this.g, p = g.p, [dx, dy] = p.dir;
    const fire = (a, sp = 260, dmg = 1) => { const ca = Math.cos(a), sa = Math.sin(a); const vx = (dx * ca - dy * sa) * sp, vy = (dx * sa + dy * ca) * sp; g.b.push({ x: p.x + dx * 7, y: p.y + dy * 7, vx, vy, sp, dmg, life: 1.1 }); };
    if (p.weapon === 'mitra') { fire(rnd(-0.07, 0.07)); p.fireT = 0.075; }
    else if (p.weapon === 'fucile') { for (let i = -2; i <= 2; i++) fire(i * 0.11 + rnd(-0.03, 0.03), 230, 1); p.fireT = 0.5; this.shake = Math.max(this.shake, 2); }
    else { fire(0, 270, 1); p.fireT = 0.2; }
    this.fx.push({ k: 'flash', x: p.x + dx * 9, y: p.y + dy * 9, life: 0.05, max: 0.05 });
    this.emit('shoot', p.weapon);
  }
  molotov() {
    const g = this.g, p = g.p; p.bombs--; this.flash = 1; this.shake = 6; this.emit('bomb');
    this.fx.push({ k: 'ring', x: p.x, y: p.y, life: 0.6, max: 0.6 });
    for (let i = 0; i < 26; i++) { const a = Math.random() * 6.28, s = rnd(40, 160); this.fx.push({ k: 'bit', x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.3, 0.7), max: 0.7, c: pick(['#ff9020', '#ffd040', '#ff4010']) }); }
    for (const z of g.z) { const d = Math.hypot(z.x - p.x, z.y - p.y); if (d < 80) { z.hp -= z.type === 'boss' ? 14 : 8; z.stun = 1.2; z.x += (z.x - p.x) / (d || 1) * 12; z.y += (z.y - p.y) / (d || 1) * 12; if (z.hp <= 0) this.kill(z); } }
    g.z = g.z.filter(z => z.hp > 0);
  }
  kill(z) {
    const g = this.g; g.kills++; g.combo++; g.comboT = 1.3;
    const v = this.addScore(ZT[z.type].pts);
    this.blood(z.x, z.y, z.type === 'boss' ? 40 : 10); this.text('+' + v, z.x, z.y - 8, g.combo >= 4 ? '#ffd040' : '#fff');
    if (g.combo > 0 && g.combo % 8 === 0) { this.text('COMBO X' + g.combo, ZW / 2, 60, '#ffd040', 2, 1.2); this.emit('combo', g.combo); }
    if (z.type === 'boss') { g.boss = null; this.emit('bossdie'); this.shake = 8; this.flash = 1; this.text('ZOMBONE ABBATTUTO!', ZW / 2, 90, '#d8ff6a', 2, 2.5); for (let i = 0; i < 3; i++) this.drop(z.x + rnd(-14, 14), z.y + rnd(-14, 14)); }
    else { this.emit('zdie', z.type); if (Math.random() < (z.type === 'tank' ? 0.5 : 0.08)) this.drop(z.x, z.y); }
  }
  drop(x, y) { const r = Math.random(); const kind = r < 0.3 ? 'birra' : r < 0.52 ? 'mitra' : r < 0.72 ? 'fucile' : r < 0.86 ? 'molotov' : 'gettone'; this.g.picks.push({ x: clamp(x, 12, ZW - 12), y: clamp(y, TOP + 12, ZH - 10), kind, t: 9 }); }
  take(kind) {
    const p = this.g.p;
    if (kind === 'birra') p.hp = Math.min(4, p.hp + 1);
    else if (kind === 'mitra' || kind === 'fucile') { p.weapon = kind; p.wT = 12; }
    else if (kind === 'molotov') p.bombs = Math.min(5, p.bombs + 1);
    else this.addScore(500);
    this.text(PICK_NAME[kind], p.x, p.y - 12, PICK_COL[kind]); this.emit('pickup', kind);
  }
  hurt(z) {
    const g = this.g, p = g.p; p.hp--; p.inv = 1.6; this.shake = 5; this.flash = 0.6; this.emit('hurt');
    const d = Math.hypot(p.x - z.x, p.y - z.y) || 1; p.x += (p.x - z.x) / d * 10; p.y += (p.y - z.y) / d * 10;
    this.blood(p.x, p.y, 6, '#a01010');
    if (p.hp <= 0) {
      this.setState('over'); this.emit('gameover', { score: this.score, wave: g.wave, kills: g.kills });
      try { if (this.score >= this.hi) { localStorage.setItem('zombata_hi', String(this.score)); this.newRecord = true; } else this.newRecord = false; } catch (e) { }
    }
  }

  // ------------------------------------------------------------ draw
  buildBg() {
    const c = document.createElement('canvas'); c.width = ZW; c.height = ZH; const x = c.getContext('2d');
    // night piazza: cobblestones under the porticoes of Bologna
    x.fillStyle = '#1b1712'; x.fillRect(0, 0, ZW, ZH);
    for (let yy = TOP; yy < ZH; yy += 6) for (let xx = (yy / 6) % 2 ? 0 : 4; xx < ZW; xx += 8) {
      const v = 34 + Math.floor(Math.random() * 14); x.fillStyle = `rgb(${v + 6},${v + 2},${v - 4})`; x.fillRect(xx, yy, 7, 5);
    }
    // portico arches along the edges (red brick + dark arcades)
    const brick = '#6a2a1a', dk = '#0e0a08';
    x.fillStyle = brick; x.fillRect(0, TOP, ZW, 7); x.fillRect(0, ZH - 5, ZW, 5); x.fillRect(0, TOP, 5, ZH); x.fillRect(ZW - 5, TOP, 5, ZH);
    x.fillStyle = dk; for (let xx = 10; xx < ZW - 10; xx += 28) { x.fillRect(xx, TOP, 18, 5); x.fillRect(xx, ZH - 4, 18, 4); }
    for (let yy = TOP + 14; yy < ZH - 10; yy += 26) { x.fillRect(0, yy, 4, 16); x.fillRect(ZW - 4, yy, 4, 16); }
    // obstacles
    for (const [ox, oy, w, h, k] of OBST) {
      if (k === 'car') { // a parked 500 from above
        x.fillStyle = '#000'; x.globalAlpha = 0.4; x.fillRect(ox + 2, oy + 3, w, h); x.globalAlpha = 1;
        x.fillStyle = '#c8b890'; x.fillRect(ox, oy, w, h); x.fillStyle = '#e8dcb0'; x.fillRect(ox + 9, oy + 2, 14, h - 4);
        x.fillStyle = '#304050'; x.fillRect(ox + 6, oy + 2, 3, h - 4); x.fillRect(ox + 23, oy + 2, 3, h - 4);
        x.fillStyle = '#111'; x.fillRect(ox + 4, oy - 1, 5, 2); x.fillRect(ox + 24, oy - 1, 5, 2); x.fillRect(ox + 4, oy + h - 1, 5, 2); x.fillRect(ox + 24, oy + h - 1, 5, 2);
        x.fillStyle = '#ffe9a0'; x.fillRect(ox + w - 1, oy + 2, 1, 3); x.fillRect(ox + w - 1, oy + h - 5, 1, 3);
      } else if (k === 'fountain') {
        x.fillStyle = '#8a8478'; x.beginPath(); x.arc(ox + w / 2, oy + h / 2, w / 2, 0, 7); x.fill();
        x.fillStyle = '#23405a'; x.beginPath(); x.arc(ox + w / 2, oy + h / 2, w / 2 - 3, 0, 7); x.fill();
        x.fillStyle = '#9a9488'; x.beginPath(); x.arc(ox + w / 2, oy + h / 2, 4, 0, 7); x.fill();
      } else { x.fillStyle = '#3a2614'; x.fillRect(ox, oy, w, h); x.fillStyle = '#5a3a20'; for (let i = 0; i < 3; i++) x.fillRect(ox + 1, oy + 1 + i * 3, w - 2, 2); }
    }
    // street lamps (light pools)
    for (const [lx, ly] of [[30, 40], [290, 40], [30, 220], [290, 220], [160, 60]]) {
      const gr = x.createRadialGradient(lx, ly, 2, lx, ly, 46); gr.addColorStop(0, 'rgba(255,200,120,0.28)'); gr.addColorStop(1, 'rgba(255,200,120,0)');
      x.fillStyle = gr; x.fillRect(lx - 46, ly - 46, 92, 92); x.fillStyle = '#222'; x.fillRect(lx - 1, ly - 1, 3, 3);
    }
    return c;
  }
  drawZombie(x, z, sx, sy) {
    const D = ZT[z.type], r = z.r, wob = Math.sin(z.ph) * 1.2, [dx, dy] = z.dir;
    const n = Math.hypot(dx, dy) || 1, fx = dx / n, fy = dy / n, px_ = -fy, py_ = fx;
    const X = Math.round(sx + wob * px_ * 0.5), Y = Math.round(sy + wob * py_ * 0.5);
    x.fillStyle = 'rgba(0,0,0,0.35)'; x.beginPath(); x.ellipse(X + 1, Y + 2, r + 1, r * 0.7, 0, 0, 7); x.fill();
    // arms reaching forward
    x.fillStyle = z.hit > 0 ? '#fff' : D.head;
    const arm = (side, lag) => { const ax = X + px_ * side * (r - 1), ay = Y + py_ * side * (r - 1), L = r + 3 + Math.sin(z.ph + lag) * 1.5; for (let i = 0; i < L; i += 1) x.fillRect(Math.round(ax + fx * i), Math.round(ay + fy * i), 2, 2); };
    arm(-1, 0); arm(1, 2);
    // body + head
    x.fillStyle = z.hit > 0 ? '#fff' : z.shirt; x.beginPath(); x.arc(X, Y, r, 0, 7); x.fill();
    x.fillStyle = z.hit > 0 ? '#fff' : D.head; x.beginPath(); x.arc(X + fx * r * 0.35, Y + fy * r * 0.35, Math.max(2.5, r * 0.62), 0, 7); x.fill();
    // glowing eyes
    x.fillStyle = z.type === 'boss' ? '#ff3030' : '#e8ff60';
    const ex = X + fx * r * 0.7, ey = Y + fy * r * 0.7;
    x.fillRect(Math.round(ex + px_ * 1.6), Math.round(ey + py_ * 1.6), 1, 1); x.fillRect(Math.round(ex - px_ * 1.6), Math.round(ey - py_ * 1.6), 1, 1);
    if (z.type === 'boss') { // crown of the "discors" king + hp bar
      x.fillStyle = '#ffd040'; for (let i = -2; i <= 2; i++) x.fillRect(Math.round(X + px_ * i * 3 - fx * 2), Math.round(Y + py_ * i * 3 - fy * 2) - 2, 2, 3);
    }
  }
  drawPlayer(x, p) {
    if (p.inv > 0 && Math.floor(this.t * 20) % 2 === 0 && this.state === 'play') return;
    const [dx, dy] = p.dir, X = Math.round(p.x), Y = Math.round(p.y), px_ = -dy, py_ = dx;
    x.fillStyle = 'rgba(0,0,0,0.4)'; x.beginPath(); x.ellipse(X + 1, Y + 2, 6, 4, 0, 0, 7); x.fill();
    const st = p.moving ? Math.sin(p.step) * 2 : 0; // feet
    x.fillStyle = '#222'; x.fillRect(Math.round(X + px_ * 2.5 + dx * st), Math.round(Y + py_ * 2.5 + dy * st), 2, 2); x.fillRect(Math.round(X - px_ * 2.5 - dx * st), Math.round(Y - py_ * 2.5 - dy * st), 2, 2);
    x.fillStyle = '#2b3a55'; x.beginPath(); x.arc(X, Y, 5, 0, 7); x.fill();                       // hoodie
    x.fillStyle = '#6a8ad0'; x.fillRect(X - 1, Y - 1, 2, 2);
    // gun
    x.fillStyle = p.weapon === 'fucile' ? '#9a6a3a' : '#bbb'; const L = p.weapon === 'pistola' ? 7 : 9;
    for (let i = 2; i < L; i++) x.fillRect(Math.round(X + dx * i + px_ * 2), Math.round(Y + dy * i + py_ * 2), 2, 2);
    x.fillStyle = '#e8b890'; x.beginPath(); x.arc(X + dx, Y + dy, 3, 0, 7); x.fill();             // head
    x.fillStyle = '#2a1a10'; x.beginPath(); x.arc(X - dx * 0.6, Y - dy * 0.6, 3, 0, 7); x.fill();
    // headphones
    x.fillStyle = '#d02040'; x.fillRect(Math.round(X + px_ * 3) - 1, Math.round(Y + py_ * 3) - 1, 2, 2); x.fillRect(Math.round(X - px_ * 3) - 1, Math.round(Y - py_ * 3) - 1, 2, 2);
  }
  draw() {
    const x = this.ctx, s = this.state;
    x.save();
    if (this.shake > 0) x.translate(Math.round(rnd(-this.shake, this.shake)), Math.round(rnd(-this.shake, this.shake)));
    x.drawImage(this.bg, 0, 0);
    if (s === 'attract') { this.drawAttract(x); x.restore(); return; }
    const g = this.g; if (!g) { x.restore(); return; }
    x.drawImage(this.decal, 0, 0);
    for (const k of g.picks) { // pickups (blink when expiring)
      if (k.t < 2.5 && Math.floor(this.t * 8) % 2) continue;
      const bob = Math.round(Math.sin(this.t * 5 + k.x) * 1.5), X = Math.round(k.x), Y = Math.round(k.y) + bob;
      x.fillStyle = '#000'; x.fillRect(X - 4, Y - 4, 9, 9); x.fillStyle = PICK_COL[k.kind]; x.fillRect(X - 3, Y - 3, 7, 7);
      x.fillStyle = '#000'; const ch = { birra: 'B', mitra: 'M', fucile: 'F', molotov: '*', gettone: 'G' }[k.kind]; T(x, ch, X - 2, Y - 3, '#000', 1, 'left', null);
    }
    const ents = g.z.slice().sort((a, b) => a.y - b.y);
    for (const z of ents) this.drawZombie(x, z, z.x, z.y);
    this.drawPlayer(x, g.p);
    for (const b of g.b) { x.fillStyle = '#ffe9a0'; x.fillRect(Math.round(b.x) - 1, Math.round(b.y) - 1, 2, 2); x.fillStyle = 'rgba(255,220,140,0.5)'; x.fillRect(Math.round(b.x - b.vx * 0.012), Math.round(b.y - b.vy * 0.012), 1, 1); }
    for (const f of this.fx) {
      const a = Math.max(0, f.life / f.max);
      if (f.k === 'bit') { x.globalAlpha = a; x.fillStyle = f.c; x.fillRect(Math.round(f.x), Math.round(f.y), 2, 2); x.globalAlpha = 1; }
      else if (f.k === 'flash') { x.fillStyle = '#fff6c0'; x.fillRect(Math.round(f.x) - 2, Math.round(f.y) - 2, 4, 4); }
      else if (f.k === 'ring') { x.strokeStyle = `rgba(255,150,40,${a})`; x.lineWidth = 3; x.beginPath(); x.arc(f.x, f.y, (1 - a) * 85 + 6, 0, 7); x.stroke(); }
    }
    // flashlight darkness around the player
    const dk = this.dkx, p = g.p;
    dk.globalCompositeOperation = 'source-over'; dk.clearRect(0, 0, ZW, ZH); dk.fillStyle = 'rgba(2,4,10,0.5)'; dk.fillRect(0, 0, ZW, ZH);
    dk.globalCompositeOperation = 'destination-out';
    const cx = p.x + p.dir[0] * 34, cy = p.y + p.dir[1] * 34;
    let gr = dk.createRadialGradient(cx, cy, 6, cx, cy, 70); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); dk.fillStyle = gr; dk.fillRect(0, 0, ZW, ZH);
    gr = dk.createRadialGradient(p.x, p.y, 4, p.x, p.y, 34); gr.addColorStop(0, 'rgba(0,0,0,0.9)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); dk.fillStyle = gr; dk.fillRect(0, 0, ZW, ZH);
    x.drawImage(this.dark, 0, 0);
    // zombie eyes glow through the dark
    for (const z of g.z) { const n = Math.hypot(...z.dir) || 1; const ex = z.x + z.dir[0] / n * z.r * 0.7, ey = z.y + z.dir[1] / n * z.r * 0.7; x.fillStyle = z.type === 'boss' ? '#ff4040' : '#e8ff60'; x.fillRect(Math.round(ex), Math.round(ey), 1, 1); }
    for (const f of this.fx) if (f.k === 'txt') { const a = Math.max(0, f.life / f.max); if (a > 0.15 || Math.floor(this.t * 20) % 2) T(x, f.s, f.x, f.y, f.c, f.scale, 'center'); }
    x.restore();
    if (this.flash > 0) { x.fillStyle = `rgba(255,${this.g.p.hp <= 0 ? 40 : 160},60,${this.flash * 0.35})`; x.fillRect(0, 0, ZW, ZH); }
    this.drawHud(x);
    if (this.banner) { const a = Math.min(1, this.banner.t * 2); x.globalAlpha = a; x.fillStyle = 'rgba(0,0,0,0.55)'; x.fillRect(0, 96, ZW, 26); T(x, this.banner.s, ZW / 2, 101, '#d8ff6a', 2, 'center'); x.globalAlpha = 1; }
    if (this.taunt) { x.fillStyle = 'rgba(0,0,0,0.6)'; const w = textWidth(this.taunt.s) + 8; x.fillRect(ZW / 2 - w / 2, 200, w, 13); T(x, this.taunt.s, ZW / 2, 203, '#e9a0ff', 1, 'center'); }
    if (s === 'over') {
      x.fillStyle = 'rgba(30,0,0,0.6)'; x.fillRect(0, 70, ZW, 100);
      T(x, 'TI HANNO ZOMBATO', ZW / 2, 82, '#ff4040', 2, 'center');
      T(x, 'PUNTI ' + this.score, ZW / 2, 112, '#fff', 1, 'center'); T(x, 'ONDATA ' + g.wave + ' - ZOMBI ' + g.kills, ZW / 2, 124, '#ccc', 1, 'center');
      if (this.newRecord && Math.floor(this.t * 4) % 2) T(x, 'NUOVO RECORD!', ZW / 2, 140, '#ffd040', 1, 'center');
      if (this.st > 1.5) T(x, 'START PER RIGIOCARE', ZW / 2, 156, '#9f9', 1, 'center');
    }
    if (this.paused) { x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(0, 0, ZW, ZH); T(x, 'PAUSA', ZW / 2, 110, '#fff', 2, 'center'); }
  }
  drawHud(x) {
    const g = this.g, p = g.p;
    x.fillStyle = '#07090a'; x.fillRect(0, 0, ZW, TOP - 1); x.fillStyle = '#3a6a20'; x.fillRect(0, TOP - 1, ZW, 1);
    T(x, 'PUNTI ' + String(this.score).padStart(6, '0'), 4, 5, '#d8ff6a');
    T(x, 'REC ' + this.hi, 112, 5, '#9a9');
    for (let i = 0; i < Math.max(4, p.hp); i++) { const X = 182 + i * 9; x.fillStyle = i < p.hp ? '#ffb020' : '#333'; x.fillRect(X, 5, 5, 7); x.fillStyle = i < p.hp ? '#fff' : '#444'; x.fillRect(X, 4, 5, 2); } // birrette = vite
    T(x, '*' + p.bombs, 222, 5, '#ff6030');
    T(x, p.weapon === 'pistola' ? 'PIST' : p.weapon === 'mitra' ? 'MITRA' : 'FUCILE', 244, 5, p.weapon === 'pistola' ? '#aaa' : PICK_COL[p.weapon]);
    T(x, 'W' + g.wave, ZW - 4, 5, '#fff', 1, 'right');
    if (g.boss) { const w = 200, k = Math.max(0, g.boss.hp / g.boss.maxHp); x.fillStyle = '#300'; x.fillRect(60, ZH - 12, w, 6); x.fillStyle = '#e02020'; x.fillRect(60, ZH - 12, Math.round(w * k), 6); T(x, 'ZOMBONE', 58, ZH - 13, '#fbb', 1, 'right'); }
  }
  drawAttract(x) {
    for (const z of this.demoZ) this.drawZombie(x, { ...z, r: ZT[z.type].r, hit: 0, dir: [Math.sign(z.sp), 0] }, z.x, z.y);
    x.fillStyle = 'rgba(0,0,0,0.45)'; x.fillRect(0, 0, ZW, ZH);
    // dripping title
    const t = this.t;
    T(x, 'LA ZOMBATA', ZW / 2, 28, '#9cff3a', 4, 'center', '#1a3a00');
    for (let i = 0; i < 14; i++) { const X = 48 + i * 17 + (i * 7) % 5, L = 4 + ((i * 13) % 9) + Math.max(0, Math.sin(t * 0.8 + i) * 6); x.fillStyle = '#6ac020'; x.fillRect(X, 56, 2, L); x.fillRect(X - 1, 56 + L, 4, 2); }
    T(x, 'DI SEGHINO', ZW / 2, 72, '#e9e9e9', 2, 'center');
    T(x, 'STASI SI ZOMBA', ZW / 2, 94, '#e9a0ff', 1, 'center');
    const page = Math.floor(t / 4) % 3;
    if (page === 0) {
      T(x, 'FRECCE  MUOVITI', ZW / 2, 122, '#fff', 1, 'center');
      T(x, 'Z  SPARA (TIENI: MIRA FISSA)', ZW / 2, 134, '#fff', 1, 'center');
      T(x, 'X  MOLOTOV', ZW / 2, 146, '#fff', 1, 'center');
      T(x, 'B BIRRETTA  M MITRA  F FUCILE', ZW / 2, 162, '#ffd040', 1, 'center');
    } else if (page === 1) {
      T(x, 'RECORD', ZW / 2, 126, '#ffd040', 2, 'center'); T(x, String(this.hi), ZW / 2, 148, '#fff', 2, 'center');
    } else {
      T(x, 'OGNI 4 ONDATE', ZW / 2, 126, '#fff', 1, 'center'); T(x, 'ARRIVA LO ZOMBONE', ZW / 2, 140, '#ff5050', 1, 'center'); T(x, 'CON LA CORONA DEL DISCORS', ZW / 2, 154, '#ffd040', 1, 'center');
    }
    if (Math.floor(t * 2) % 2) T(x, 'PREMI START', ZW / 2, 196, '#9cff3a', 2, 'center');
    T(x, '© BIGALESSO GAMES', ZW / 2, 226, '#888', 1, 'center');
  }
}
