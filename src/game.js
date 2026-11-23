import { drawText, textWidth } from './font.js';
import { buildSprites, buildBackgrounds, STAGES, PAD } from './sprites.js';

export const GW = 320, GH = 240;
const TOP = 11, GROUND = 206;
const STAGE_LEN = 52;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const outBack = t => { t = clamp(t, 0, 1); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const outBounce = t => { t = clamp(t, 0, 1); const n = 7.5625, d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375; return n * (t -= 2.625 / d) * t + 0.984375; };
const blankInput = () => ({ up: 0, down: 0, left: 0, right: 0, fire: 0, bomb: 0, start: 0, pause: 0 });
const ACTIVE = ['intro', 'play', 'warn', 'boss', 'clear'];
const STAGE_LINES = ['ROMA NON SI TOCCA!', 'AVANTI SULLA VIA APPIA!', 'ULTIMA BATTAGLIA. AVE!'];
const BOSS_INFO = [['ELICOTTERONE', 'IL TERRORE DEI CIELI'], ['ELICOTTERONE MK2', 'PIU ROTORI, PIU GUAI'], ['MEGA-ROTORE', 'IL SIGNORE DEL CAOS']];
const DEFAULT_TABLE = [['BIG', 50000], ['ALE', 40000], ['SSO', 30000], ['IMP', 20000], ['ROM', 10000]];
const P_COL = ['#c8f03c', '#5ad0ff'];
const CREDITS = ['BIGALESSO', 'IMPERATORE DEL CAOS', '', '- STAGE -', 'ROMA', 'VIA APPIA', 'APOCALISSE', '', '- CAST -', 'BIGALESSO ... SE STESSO', 'ELICOTTERONE ... SE STESSO', 'MEGA-ROTORE ... SE STESSO', 'LA FOLLA ... SE STESSA', '', '- GRAFICA -', 'PIXEL FATTI A MANO', '', '- MUSICA -', 'CHIPTUNE A 8 BIT', '', 'GRAZIE PER AVER GIOCATO!', '', '(C) 2026 BIGALESSO GAMES'];

export class Game {
  constructor(images, emit, opts = {}) {
    this.isDemo = !!opts.demo;
    this.canvas = document.createElement('canvas'); this.canvas.width = GW; this.canvas.height = GH;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true }); this.ctx.imageSmoothingEnabled = false; // perf: CPU canvas, no GPU readback
    this.img = images; this.emit = emit || (() => { });
    this.S = opts.sprites || buildSprites();
    this.bgs = opts.bgs || [0, 1, 2].map(buildBackgrounds);
    this.table = DEFAULT_TABLE.map(([n, s]) => ({ n, s }));
    if (!this.isDemo) {
      try { const t = JSON.parse(localStorage.getItem('bigalesso_table') || 'null'); if (Array.isArray(t) && t.length) this.table = t.slice(0, 5).map(e => ({ n: String(e.n).slice(0, 3), s: +e.s || 0 })); } catch (e) { }
      try { const v = +localStorage.getItem('bigalesso_hi'); if (v > this.table[0].s) { this.table.unshift({ n: 'TU', s: v }); this.table.length = 5; } } catch (e) { }
    }
    this.hi = this.table[0].s;
    this.input = blankInput(); this.input2 = blankInput();
    this.prev = blankInput(); this.prev2 = blankInput();
    this.state = 'attract'; this.t = 0; this.st = 0; this.acc = 0; this.paused = false;
    this.scroll = 0; this.shake = 0; this.flash = 0; this.slowT = 0;
    this.stage = 0; this.loop = 0;
    this.players = []; this.p = null;
    this.trans = null; this.banner = null; this.attractT = 0; this.demo = null; this.demoOn = false;
    this.weather = []; this.flocks = []; this.flockT = 4;
    this.clearWorld();
  }
  get score() { return this.p ? this.p.score : 0; }
  get lives() { return this.p ? this.p.lives : 0; }
  get activePlayers() { return this.players.filter(p => p.state !== 'out').length; }
  get diff() { return (1 + this.stage * 0.2 + this.loop * 0.4) * (1 + 0.25 * Math.max(0, this.activePlayers - 1)); }

  // ---------- debug (harness only) ----------
  debugJump(s) {
    if (s === 'attract') { this.setState('attract'); this.attractT = 0; return; }
    if (s === 'info') { this.setState('attract'); this.attractT = 10; return; }
    if (s === 'demo') { this.setState('attract'); this.attractT = 16; return; }
    if (s === 'table') { this.setState('attract'); this.attractT = 29; return; }
    this.newGame(s === 'coop' ? 2 : 1); this.trans = null;
    const go = () => { this.setState('play'); for (const p of this.players) p.x = 40; };
    if (s === 'play' || s === 'coop') go();
    else if (s === 'boss') { go(); this.stageT = STAGE_LEN; this.spawnBoss(); this.setState('boss'); }
    else if (s === 'warn') { go(); this.stageT = STAGE_LEN; }
    else if (s === 'over') { go(); this.p.score = 12345; this.p.lives = -1; this.p.state = 'out'; this.gameOver(); }
    else if (s === 'ending') { this.stage = 2; this.setState('ending'); this.emit('ending'); }
    else if (s === 'clear') { go(); this.setState('clear'); }
    else if (s === 'stage2') { this.stage = 1; this.startStage(); this.trans = null; }
    else if (s === 'stage3') { this.stage = 2; this.startStage(); this.trans = null; }
  }

  clearWorld() { this.shots = []; this.eb = []; this.en = []; this.parts = []; this.pups = []; this.texts = []; this.boss = null; this.bombT = 0; }
  pressed(k) { return this.input[k] && !this.prev[k]; }
  pressed2(k) { return this.input2[k] && !this.prev2[k]; }
  pressedP(p, k) { return p.input[k] && !p.prev[k]; }
  setState(s) { this.state = s; this.st = 0; }
  iris(type, cb, dur = 0.6) { this.trans = { type, t: 0, dur, cb }; }

  makePlayer(id) {
    return {
      id, x: -30 - id * 24, y: id ? 140 : 96, inv: 0, shield: 3, fireT: 0, power: 1, bombs: 2, alive: true, state: 'play', deadT: 0, anim: 0,
      input: id ? this.input2 : this.input, prev: blankInput(), score: 0, shown: 0, lives: 3, nextExtend: 30000,
      chain: 0, chainT: 0, mult: 1, flashT: 0, lvlT: 0, hudShake: 0, contT: 0, bank: 0, conts: 0,
    };
  }
  newGame(n = 1) {
    this.stage = 0; this.loop = 0; this.slowT = 0; this.banner = null;
    this.players = []; for (let i = 0; i < n; i++) this.players.push(this.makePlayer(i));
    this.p = this.players[0];
    this.startStage();
    this.emit('start'); if (n > 1) this.emit('join2');
  }
  startStage() {
    this.clearWorld(); this.stageT = 0; this.waveT = 2.6; this.scroll = 0; this.flocks = []; this.flockT = 3;
    for (const p of this.players) {
      if (p.state === 'dead') { p.state = 'play'; p.alive = true; }
      if (p.state !== 'out') { p.x = -30 - p.id * 24; p.y = p.id ? 140 : 96; p.shield = 3.6; p.inv = 0; }
    }
    this.setState('intro'); this.emit('stage', this.stage); this.iris('open', null, 0.7);
    this.initWeather();
  }

  update(dt) {
    const pz = this.pressed('pause') || this.pressed2('pause');
    if (pz && this.state !== 'attract') this.paused = !this.paused;
    if (this.paused) { this.savePrev(); return; }
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= 1 / 60) { this.step(1 / 60); this.acc -= 1 / 60; }
  }
  savePrev() { Object.assign(this.prev, this.input); Object.assign(this.prev2, this.input2); for (const p of this.players) Object.assign(p.prev, p.input); }

  step(dt) {
    this.t += dt; this.st += dt;
    this.shake = Math.max(0, this.shake - dt * 18); this.flash = Math.max(0, this.flash - dt * 3);
    if (this.trans) { this.trans.t += dt; if (this.trans.t >= this.trans.dur) { const cb = this.trans.cb; this.trans = null; if (cb) cb(); } }
    if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null; }
    if (this.state === 'attract') { this.stepAttract(dt); this.savePrev(); return; }
    this.handleJoins();
    const s = this.state;
    const wdt = dt * (this.slowT > 0 ? 0.35 : 1); this.slowT = Math.max(0, this.slowT - dt);
    this.scroll += wdt * (s === 'clear' ? 90 : 60);
    if (s === 'intro') {
      for (const p of this.players) if (p.alive) p.x += (40 - p.x) * dt * 2.5;
      this.updatePlayers(wdt, false);
      if (this.st > 3.4) this.setState('play');
    } else if (s === 'play' || s === 'warn' || s === 'boss') {
      this.stageT += wdt;
      this.updatePlayers(wdt, true);
      if (s === 'play') {
        this.waveT -= wdt;
        if (this.waveT <= 0 && this.stageT < STAGE_LEN) { this.spawnWave(); this.waveT = rnd(2.0, 3.2) / Math.sqrt(this.diff); }
        if (this.stageT >= STAGE_LEN && this.en.length === 0) { this.setState('warn'); this.emit('warning'); }
      }
      if (s === 'warn' && this.st > 3.6) { this.spawnBoss(); this.setState('boss'); }
    } else if (s === 'clear') {
      this.updatePlayers(wdt, true, true);
      if (this.st > 1.2 && this.st - dt <= 1.2) for (const p of this.players) if (p.state !== 'out') this.addScore(p, 10000 * (this.stage + 1));
      if (this.st > 4.8 && !this.trans) this.iris('close', () => { if (this.stage === 2) { this.setState('ending'); this.emit('ending'); this.iris('open', null, 0.8); } else { this.stage++; this.startStage(); } });
    } else if (s === 'ending') {
      if (Math.random() < 0.08 && this.st < 6) this.firework(rnd(40, 280), rnd(30, 110));
      if ((this.st > 17 || (this.st > 3 && (this.pressed('start') || this.pressed2('start')))) && !this.trans) this.iris('close', () => { this.stage = 0; this.loop++; this.startStage(); });
    } else if (s === 'over') {
      this.contT -= dt;
      let cont = false;
      for (const p of this.players) if (this.st > 0.8 && this.pressedP(p, 'start')) { this.continuePlayer(p); cont = true; }
      if (this.players.length < 2 && this.st > 0.8 && this.pressed2('start')) { this.addP2(); cont = true; }
      if (cont) { this.setState(this.boss ? 'boss' : (this.overFrom === 'warn' ? 'warn' : 'play')); }
      else if (this.contT <= 0 && !this.trans) { this.recordScores(); this.iris('close', () => { this.setState('attract'); this.attractT = 0; this.players = []; this.p = null; }); }
      this.updateWeather(dt);
      this.savePrev();
      return;
    }
    this.updateWorld(wdt);
    this.updateWeather(wdt);
    this.savePrev();
  }

  // ---------- attract mode (title / info / demo / hi-score table) ----------
  get attractPhase() { const T = this.attractT % 34; return T < 9 ? 'title' : T < 16 ? 'info' : T < 28 ? 'demo' : 'table'; }
  stepAttract(dt) {
    this.attractT += dt;
    const ph = this.attractPhase;
    if (ph === 'demo') {
      if (!this.demoOn) {
        if (!this.demo) this.demo = new Game(this.img, null, { demo: true, sprites: this.S, bgs: this.bgs });
        this.demo.stage = Math.floor(this.attractT / 34) % 3; this.demo.loop = 0;
        this.demo.players = [this.demo.makePlayer(0)]; this.demo.p = this.demo.players[0]; this.demo.startStage(); this.demo.trans = null;
        this.demoOn = true;
      }
      const d = this.demo, p = d.p, i = d.input, tt = d.t;
      if (p) {
        const ty = 105 + Math.sin(tt * 0.9) * 62 + Math.sin(tt * 2.3) * 12;
        i.up = p.y > ty + 4 ? 1 : 0; i.down = p.y < ty - 4 ? 1 : 0; i.right = p.x < 60 ? 1 : 0; i.left = p.x > 95 ? 1 : 0; i.fire = 1;
        i.bomb = d.en.length > 6 && p.bombs > 0 && Math.random() < 0.01 ? 1 : 0;
      }
      d.update(dt);
    } else this.demoOn = false;
    if (this.pressed('start')) { this.demoOn = false; this.newGame(1); }
    else if (this.pressed2('start')) { this.demoOn = false; this.newGame(2); }
  }

  // ---------- players ----------
  addP2() {
    const np = this.makePlayer(1); np.x = -30; np.y = 140; np.shield = 3.2; this.players.push(np);
    this.emit('join2'); this.text('2P ENTRA IN GIOCO!', 160, 96, P_COL[1], 1.6, 2, true);
    return np;
  }
  handleJoins() {
    if (this.players.length < 2 && this.pressed2('start') && ACTIVE.includes(this.state)) this.addP2();
    for (const p of this.players) if (p.state === 'out' && this.pressedP(p, 'start') && ACTIVE.includes(this.state)) this.continuePlayer(p);
  }
  continuePlayer(p) {
    p.state = 'play'; p.alive = true; p.lives = 2; p.shield = 3; p.inv = 0; p.bombs = Math.max(p.bombs, 2); p.x = -24; p.y = 110; p.conts++;
    this.emit(p.id ? 'join2' : 'start'); this.text(p.id ? '2P CONTINUA!' : '1P CONTINUA!', 160, 100, P_COL[p.id], 1.4, 2, true);
  }
  alivePlayers() { return this.players.filter(p => p.alive); }
  anyAlive() { return this.players.some(p => p.alive); }
  nearestPlayer(x, y) { let best = null, bd = 1e9; for (const p of this.players) { if (!p.alive) continue; const d = (p.x + 17 - x) ** 2 + (p.y + 10 - y) ** 2; if (d < bd) { bd = d; best = p; } } return best; }

  updatePlayers(dt, control, free = false) {
    for (const p of this.players) {
      p.anim += dt; p.inv = Math.max(0, p.inv - dt); p.shield = Math.max(0, p.shield - dt);
      p.flashT = Math.max(0, p.flashT - dt); p.lvlT = Math.max(0, p.lvlT - dt); p.hudShake = Math.max(0, p.hudShake - dt);
      p.shown += Math.max(1, Math.ceil((p.score - p.shown) * 0.12)) * (p.shown < p.score ? 1 : 0); if (p.shown > p.score) p.shown = p.score;
      if (p.chainT > 0) { p.chainT -= dt; if (p.chainT <= 0) { if (p.chain >= 8) this.text('CATENA ' + p.chain + '!', p.x + 16, p.y - 10, '#ff5ad0', 1.2, 1, true); p.chain = 0; p.mult = 1; } }
      if (p.state === 'dead') {
        p.deadT += dt;
        if (p.deadT > 1.6) {
          if (p.lives >= 0) { p.state = 'play'; p.alive = true; p.shield = 3; p.x = -24; p.y = 110; }
          else { p.state = 'out'; p.contT = 10; }
        }
        continue;
      }
      if (p.state === 'out') { p.contT = Math.max(0, p.contT - dt); continue; }
      if (!control) { p.bank *= 0.85; continue; }
      const i = p.input, sp = 125;
      let dx = (i.right ? 1 : 0) - (i.left ? 1 : 0), dy = (i.down ? 1 : 0) - (i.up ? 1 : 0);
      if (dx && dy) { dx *= 0.7071; dy *= 0.7071; }
      p.x = clamp(p.x + dx * sp * dt, 2, GW - 34);
      p.y = clamp(p.y + dy * sp * dt, TOP + 2, GROUND - 19);
      p.bank += (dy - p.bank) * Math.min(1, dt * 10);
      p.fireT -= dt;
      if (i.fire && p.fireT <= 0) { this.fire(p); p.fireT = 0.11; }
      if (!free && this.pressedP(p, 'bomb') && p.bombs > 0 && this.bombT <= 0) this.megaBomb(p);
      if (Math.random() < 0.6) this.parts.push({ type: 'trail', x: p.x + rnd(0, 6), y: p.y + 13 + rnd(-3, 4), vx: -rnd(30, 60), vy: rnd(-5, 5), life: rnd(0.2, 0.4), max: 0.4, c: p.id ? pick(['#5ad0ff', '#c070ff', '#fff']) : pick(['#ff5a1a', '#ffd83a', '#fff4a0']) });
    }
    if (this.players.length && this.players.every(p => p.state === 'out') && this.state !== 'over') this.gameOver();
  }
  gameOver() { this.overFrom = this.state; this.setState('over'); this.contT = 10; this.emit('gameover'); this.saveHi(); }
  saveHi() { if (this.isDemo) return; try { localStorage.setItem('bigalesso_hi', String(this.hi)); } catch (e) { } }
  recordScores() {
    if (this.isDemo) return;
    for (const p of this.players) { if (p.score > this.table[this.table.length - 1].s) { this.table.push({ n: p.id ? '2P' : '1P', s: p.score, fresh: true }); } }
    this.table.sort((a, b) => b.s - a.s); this.table.length = Math.min(5, this.table.length);
    this.hi = this.table[0].s;
    try { localStorage.setItem('bigalesso_table', JSON.stringify(this.table.map(e => ({ n: e.n, s: e.s })))); localStorage.setItem('bigalesso_hi', String(this.hi)); } catch (e) { }
  }
  addScore(p, n) {
    if (!p) return;
    p.score += n; if (p.score > this.hi) this.hi = p.score;
    if (p.score >= p.nextExtend) { p.nextExtend += 50000; p.lives++; this.emit('life'); this.text('1UP!', p.x + 10, p.y - 6, '#8ee03a', 1.2, 2, true); }
  }
  text(s, x, y, c = '#fff', life = 0.9, scale = 1, center = false) { this.texts.push({ s, x, y, c, life, max: life, scale, center, age: 0 }); }
  fire(p) {
    const x = p.x + 28, y = p.y + 13;
    const mk = (vx, vy, dy = 0) => this.shots.push({ x, y: y + dy, vx, vy, dmg: 1, o: p });
    const v = 330;
    if (p.power === 1) mk(v, 0);
    else if (p.power === 2) { mk(v, 0, -3); mk(v, 0, 3); }
    else if (p.power === 3) { mk(v, 0); mk(v, -55, -2); mk(v, 55, 2); }
    else { mk(v, 0, -2); mk(v, 0, 2); mk(v, -70, -3); mk(v, 70, 3); mk(v * 0.9, -140, -4); mk(v * 0.9, 140, 4); }
    p.flashT = 0.06;
    this.emit('shoot');
  }
  // easter egg (eggs.js, Konami code): rainbow trail + bombs that never run out, until the next death
  bigalessoMode(on = true) {
    const p = this.players && this.players[0]; if (!p) return false;
    p.bigalesso = !!on;
    if (on) { p.bombs = Math.max(p.bombs, 9); p.power = 4; p.lvlT = 1.5; this.text('MODALITÀ BIGALESSO!', 160, 96, '#ffd83a', 2.4, 2, true); this.emit('power'); }
    return true;
  }
  megaBomb(p) {
    if (!p.bigalesso) p.bombs--; this.bombT = 1.9; this.flash = 1; this.shake = 10; p.inv = Math.max(p.inv, 2.2);
    this.emit('bomb');
    for (const e of this.en) this.kill(e, p, true);
    this.en = []; this.eb = [];
    if (this.boss) this.hitBoss(45, p);
    this.parts.push({ type: 'shock', x: 165, y: GROUND - 30, r: 4, vr: 380, life: 0.8, max: 0.8 });
    for (let i = 0; i < 26; i++) this.parts.push({ type: 'debris', x: rnd(40, 290), y: GROUND, vx: rnd(-50, 50), vy: rnd(-200, -80), g: 220, rot: rnd(0, 6), vr: rnd(-12, 12), s: rnd(2, 4), c: pick(['#3a2a20', '#5a4030', '#ff9a1a', '#2c2a36']), life: rnd(0.8, 1.5), max: 1.5 });
  }

  // ---------- enemies ----------
  spawnWave() {
    const d = this.diff, st = this.stage;
    const pool = ['drones', 'drones', 'helis', 'missiles', 'jets', 'tank'];
    if (st >= 1) pool.push('rockets', 'helis', 'jets');
    if (st >= 2) pool.push('missiles', 'rockets', 'drones');
    const w = pick(pool);
    if (w === 'drones') {
      const y0 = rnd(40, 150), n = 5, amp = rnd(14, 32), ph = Math.random() * 6, group = { left: n };
      for (let i = 0; i < n; i++) this.en.push({ type: 'drone', x: GW + 10 + i * 22, y: y0, y0, amp, ph: ph + i * 0.5, w: 12, h: 10, hp: 1, score: 100, vx: -80 * Math.sqrt(d), t: 0, group });
    } else if (w === 'helis') {
      const n = Math.random() < 0.5 ? 1 : 2;
      for (let i = 0; i < n; i++) { const y = n === 1 ? rnd(40, 150) : 50 + i * 80; this.en.push({ type: 'heli', x: GW + 10 + i * 30, y, by: y, hx: rnd(200, 260), w: 30, h: 12, hp: Math.round(5 * d), score: 300, t: 0, phase: 0, shotT: rnd(0.8, 1.6) }); }
    } else if (w === 'missiles') {
      const n = 2 + Math.round(d);
      for (let i = 0; i < n; i++) { const y = rnd(TOP + 10, GROUND - 20); this.en.push({ type: 'missile', x: GW + 40 + i * 40, y, w: 18, h: 5, hp: 1, score: 120, warn: 0.9 + i * 0.25, vx: -210 * Math.sqrt(d), t: 0 }); }
    } else if (w === 'jets') {
      const top = Math.random() < 0.5;
      for (let i = 0; i < 3; i++) this.en.push({ type: 'jet', x: GW + 10 + i * 26, y: top ? 30 + i * 6 : GROUND - 40 - i * 6, dir: top ? 1 : -1, w: 24, h: 9, hp: 2, score: 200, t: -i * 0.15, shot: false });
    } else if (w === 'tank') {
      this.en.push({ type: 'tank', x: GW + 10, y: GROUND - 10, w: 24, h: 10, hp: Math.round(6 * d), score: 400, t: 0, shotT: 1.2 });
    } else if (w === 'rockets') {
      for (let i = 0; i < 3; i++) this.en.push({ type: 'rocket', x: rnd(110, 300), y: GROUND - 2, w: 9, h: 11, hp: 2, score: 150, delay: 0.6 + i * 0.45, vy: 0, t: 0 });
    }
    for (const e of this.en) if (e.maxhp === undefined) e.maxhp = e.hp;
  }
  spawnBoss() {
    const big = this.stage === 2;
    this.boss = { type: 'boss', x: GW + 20, y: 70, w: 120, h: 36, sc: 2, hp: Math.round((big ? 260 : 150 + this.stage * 50) * (1 + this.loop * 0.5) * (1 + 0.4 * Math.max(0, this.activePlayers - 1))), t: 0, pat: 0, patT: 2, shotT: 0, flashT: 0, big };
    this.boss.max = this.boss.hp; this.emit('boss');
  }
  hitBoss(dmg, p) {
    const b = this.boss; if (!b || b.dead) return;
    b.hp -= dmg; b.flashT = 0.06;
    if (b.hp <= 0) {
      b.dead = true; b.deathT = 0; const pts = 5000 * (this.stage + 1);
      this.addScore(p || this.nearestPlayer(b.x, b.y), pts); this.text('+' + pts, b.x + 30, b.y, '#ffd83a', 2, 2, true);
      this.eb = []; this.slowT = 0.8; this.flash = 0.7; this.banner = { s: 'BOSS DISTRUTTO!', t: 2.6, max: 2.6 };
      this.emit('bossdie');
    }
  }
  aimed(x, y, sp, spread = 0) {
    const t = this.nearestPlayer(x, y);
    const a = t ? Math.atan2(t.y + 10 - y, t.x + 17 - x) + spread : Math.PI + spread;
    this.eb.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 2 });
  }
  kill(e, p, silent) {
    let mult = 1;
    if (p) {
      p.chain++; p.chainT = 1.8;
      const m = 1 + Math.min(3, Math.floor(p.chain / 8));
      if (m > p.mult) { p.mult = m; this.emit('combo', m); this.text('COMBO x' + m + '!', p.x + 16, p.y - 14, '#ff5ad0', 1.3, 2, true); }
      mult = p.mult; this.addScore(p, e.score * mult);
    }
    this.explode(e.x + e.w / 2, e.y + e.h / 2, e.type === 'tank' || e.type === 'heli' ? 1.4 : 0.9);
    const nd = e.type === 'tank' || e.type === 'heli' ? 8 : 4;
    for (let i = 0; i < nd; i++) this.parts.push({ type: 'debris', x: e.x + e.w / 2, y: e.y + e.h / 2, vx: rnd(-70, 50), vy: rnd(-90, -10), g: 220, rot: rnd(0, 6), vr: rnd(-14, 14), s: rnd(1.5, 3.5), c: pick(['#4a4858', '#8c8a9c', '#2c2a36', '#ff9a1a']), life: rnd(0.6, 1.2), max: 1.2 });
    if (!silent) this.text(String(e.score * mult), e.x + e.w / 2, e.y - 4, mult > 1 ? '#ff5ad0' : '#ffd83a', 0.9, 1, true);
    let drop = null;
    if (e.type === 'heli' && Math.random() < 0.45) drop = Math.random() < 0.7 ? 'L' : 'B';
    if (e.type === 'tank' && Math.random() < 0.5) drop = 'B';
    if (e.type === 'jet' && Math.random() < 0.12) drop = 'L';
    if (e.group) { e.group.left--; if (e.group.left === 0) { drop = Math.random() < 0.85 ? 'L' : 'H'; this.text('BONUS 1000', e.x, e.y + 10, '#c8f03c', 1.2, 1, true); this.addScore(p, 1000); } }
    if (Math.random() < 0.015) drop = 'H';
    if (drop) this.pups.push({ k: drop, x: e.x + e.w / 2 - 5, y: e.y, t: 0 });
  }
  explode(x, y, size = 1) {
    this.parts.push({ type: 'ring', x, y, r: 2, vr: 70 * size, life: 0.35, max: 0.35 });
    const n = Math.round(14 * size);
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, sp = rnd(30, 120) * size; this.parts.push({ type: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rnd(0.25, 0.6), max: 0.6, c: pick(['#fff4a0', '#ffd83a', '#ff9a1a', '#ff5a1a']) }); }
    for (let i = 0; i < n * 0.6; i++) this.parts.push({ type: 'smoke', x: x + rnd(-4, 4), y: y + rnd(-4, 4), vx: rnd(-20, 10) - 30, vy: rnd(-25, 5), life: rnd(0.5, 1.0), max: 1, r: rnd(2, 5) * size });
    this.shake = Math.max(this.shake, 2.5 * size);
    this.emit('explode', size);
  }
  firework(x, y) {
    const c = pick(['#ff5ad0', '#c8f03c', '#5ad0ff', '#ffd83a', '#ff5060']);
    for (let i = 0; i < 26; i++) { const a = (i / 26) * 6.283, sp = rnd(50, 80); this.parts.push({ type: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rnd(0.7, 1.1), max: 1.1, c, g: 40 }); }
    this.parts.push({ type: 'ring', x, y, r: 1, vr: 60, life: 0.25, max: 0.25 });
    this.emit('explode', 0.4);
  }
  playerDie(p) {
    if (this.isDemo) return;
    if (!p.alive || p.inv > 0 || p.shield > 0) return;
    p.alive = false; p.state = 'dead'; p.deadT = 0; p.lives--; p.hudShake = 0.7;
    this.explode(p.x + 17, p.y + 10, 2); this.shake = 8;
    for (let i = 0; i < 10; i++) this.parts.push({ type: 'debris', x: p.x + 17, y: p.y + 10, vx: rnd(-80, 80), vy: rnd(-120, -20), g: 220, rot: rnd(0, 6), vr: rnd(-14, 14), s: rnd(2, 3), c: pick(p.id ? ['#2a6ad8', '#c070ff', '#2a2440'] : ['#d8242c', '#8ee03a', '#2a2440']), life: 1.2, max: 1.2 });
    p.power = Math.max(1, p.power - 1); p.bombs = Math.max(p.bombs, 2); p.chain = 0; p.mult = 1; p.bigalesso = false;
    this.eb = [];
    this.emit('die');
  }

  updateWorld(dt) {
    const d = this.diff, alive = this.anyAlive();
    if (this.bombT > 0) {
      this.bombT -= dt;
      if (this.bombT > 1.4 && this.bombT - dt <= 1.4) this.flash = 0.6;
      if (this.boss && !this.boss.dead && Math.random() < 0.2) this.explode(this.boss.x + rnd(0, this.boss.w), this.boss.y + rnd(0, this.boss.h), 0.7);
    }
    for (const s of this.shots) { s.x += s.vx * dt; s.y += s.vy * dt; }
    this.shots = this.shots.filter(s => s.x < GW + 8 && s.y > 0 && s.y < GH && !s.dead);
    for (const e of this.en) {
      e.t += dt;
      if ((e.type === 'heli' || e.type === 'tank') && e.hp < e.maxhp / 2 && Math.random() < 0.25) this.parts.push({ type: 'smoke', x: e.x + rnd(4, e.w - 4), y: e.y + 2, vx: rnd(10, 30), vy: rnd(-25, -10), life: 0.7, max: 0.7, r: rnd(1.5, 3) });
      switch (e.type) {
        case 'drone': e.x += e.vx * dt; e.y = e.y0 + Math.sin(e.t * 3 + e.ph) * e.amp; break;
        case 'heli':
          if (e.phase === 0) { e.x += (e.hx - e.x) * dt * 1.6; if (e.t > 7.5) e.phase = 1; }
          else e.x -= 140 * dt;
          e.y = e.by + Math.sin(e.t * 1.7) * 14;
          e.shotT -= dt; if (e.shotT <= 0 && e.x < GW - 20 && alive) { this.aimed(e.x + 4, e.y + 8, 95 * Math.sqrt(d)); if (d > 1.3) this.aimed(e.x + 4, e.y + 8, 95 * Math.sqrt(d), 0.25); e.shotT = 1.5 / d; this.emit('eshot'); }
          break;
        case 'missile':
          if (e.warn > 0) { e.warn -= dt; if (e.warn <= 0) this.emit('missile'); break; }
          e.x += e.vx * dt; if (Math.random() < 0.6) this.parts.push({ type: 'smoke', x: e.x + 18, y: e.y + 2, vx: 20, vy: rnd(-6, 6), life: 0.5, max: 0.5, r: 2 });
          break;
        case 'jet':
          e.x -= 165 * dt; if (e.t > 0) e.y += Math.sin(Math.min(e.t * 1.4, 1.5)) * e.dir * 95 * dt;
          if (!e.shot && e.x < 220 && alive) { e.shot = true; this.aimed(e.x, e.y + 4, 120 * Math.sqrt(d)); }
          if (Math.random() < 0.5) this.parts.push({ type: 'trail', x: e.x + 24, y: e.y + 4, vx: 30, vy: 0, life: 0.15, max: 0.2, c: '#ffd83a' });
          break;
        case 'tank':
          e.x -= 38 * dt; e.shotT -= dt;
          if (e.shotT <= 0 && e.x < GW - 10 && alive) { e.shotT = 1.9 / d; const a = -2.2 - Math.random() * 0.5; this.eb.push({ x: e.x + 2, y: e.y + 1, vx: Math.cos(a) * 110, vy: Math.sin(a) * 110, r: 2 }); e.recoil = 0.15; this.parts.push({ type: 'smoke', x: e.x, y: e.y, vx: -20, vy: -20, life: 0.4, max: 0.4, r: 2 }); this.emit('eshot'); }
          e.recoil = Math.max(0, (e.recoil || 0) - dt);
          break;
        case 'rocket':
          if (e.delay > 0) { e.delay -= dt; break; }
          e.vy -= 150 * dt; e.y += e.vy * dt; e.x -= 20 * dt;
          this.parts.push({ type: 'spark', x: e.x + 4, y: e.y + 12, vx: rnd(-10, 10), vy: 40, life: 0.2, max: 0.3, c: pick(['#ffd83a', '#ff9a1a']) });
          if (e.y < TOP + 6) { e.dead = true; for (let k = 0; k < 5; k++) { const a = Math.PI * (0.2 + k * 0.15); this.eb.push({ x: e.x + 4, y: e.y + 4, vx: -Math.cos(a) * 70, vy: Math.sin(a) * 70, r: 2 }); } this.explode(e.x + 4, e.y + 4, 0.6); }
          break;
      }
    }
    const b = this.boss;
    if (b) {
      b.t += dt; b.flashT -= dt;
      if (!b.dead && b.hp < b.max * 0.5 && Math.random() < 0.35) this.parts.push({ type: 'smoke', x: b.x + rnd(20, b.w - 10), y: b.y + rnd(4, 20), vx: rnd(20, 50), vy: rnd(-30, -10), life: 0.9, max: 0.9, r: rnd(2, 4) });
      if (b.dead) {
        b.deathT += dt; b.y += 14 * dt; b.x += 10 * dt;
        if (Math.random() < 0.35) this.explode(b.x + rnd(0, b.w), b.y + rnd(0, b.h), rnd(0.6, 1.4));
        if (Math.random() < 0.3) this.parts.push({ type: 'debris', x: b.x + rnd(0, b.w), y: b.y + rnd(0, b.h), vx: rnd(-60, 60), vy: rnd(-110, -20), g: 220, rot: rnd(0, 6), vr: rnd(-14, 14), s: rnd(2, 5), c: pick(['#4a4858', '#8c8a9c', '#2c2a36', '#8a34d0', '#c8f03c']), life: 1.3, max: 1.3 });
        if (b.deathT > 2.6) { this.explode(b.x + b.w / 2, b.y + b.h / 2, 3); this.flash = 0.8; this.boss = null; this.setState('clear'); this.emit('clear'); }
      } else {
        const tx = GW - b.w - 14;
        if (b.x > tx) b.x -= 40 * dt; else b.x = tx + Math.sin(b.t * 0.6) * 18;
        b.y = 72 + Math.sin(b.t * 0.9) * 52;
        const rage = b.hp < b.max * 0.5 ? 1.4 : 1;
        b.patT -= dt; if (b.patT <= 0) { b.pat = (b.pat + 1) % 4; b.patT = 3.2; b.shotT = 0.3; }
        b.shotT -= dt;
        if (b.shotT <= 0 && b.x < GW - 40 && alive) {
          if (b.pat === 0) { for (let k = -1; k <= 1; k++) this.aimed(b.x + 8, b.y + 28, 115 * rage, k * 0.14); b.shotT = 0.9 / rage; }
          else if (b.pat === 1) { for (let k = 0; k < (b.big ? 11 : 8); k++) { const a = Math.PI * 0.62 + k * 0.1 + Math.sin(b.t) * 0.2; this.eb.push({ x: b.x + 10, y: b.y + 22, vx: Math.cos(a) * 85, vy: Math.sin(a) * 85 - 20, r: 2 }); } b.shotT = 1.1 / rage; }
          else if (b.pat === 2) { if (this.en.length < 8) this.en.push({ type: 'drone', x: b.x + 40, y: b.y + 34, y0: b.y + 34, amp: 20, ph: 0, w: 12, h: 10, hp: 1, maxhp: 1, score: 80, vx: -110, t: 0 }); b.shotT = 0.6; }
          else { this.eb.push({ x: b.x + 4, y: b.y + 30, vx: -150 * rage, vy: 0, r: 3 }); this.eb.push({ x: b.x + 60, y: b.y + 34, vx: -150 * rage, vy: 12, r: 3 }); b.shotT = 0.45 / rage; }
          this.emit('eshot');
        }
      }
    }
    for (const e of this.eb) { e.x += e.vx * dt; e.y += e.vy * dt; }
    this.eb = this.eb.filter(e => e.x > -6 && e.x < GW + 6 && e.y > TOP - 4 && e.y < GH + 4);
    // shots vs enemies
    for (const s of this.shots) {
      for (const e of this.en) {
        if (e.dead || (e.warn > 0) || (e.delay > 0)) continue;
        if (s.x + 6 > e.x && s.x < e.x + e.w && s.y + 2 > e.y && s.y - 1 < e.y + e.h) {
          s.dead = true; e.hp -= s.dmg; e.flash = 0.06;
          this.parts.push({ type: 'spark', x: s.x + 4, y: s.y, vx: -40, vy: rnd(-30, 30), life: 0.12, max: 0.15, c: '#fff' });
          if (e.hp <= 0) { e.dead = true; this.kill(e, s.o); } else this.emit('hit');
          break;
        }
      }
      if (!s.dead && b && !b.dead && s.x + 6 > b.x + 2 && s.x < b.x + b.w && s.y > b.y + 2 && s.y < b.y + b.h) { s.dead = true; this.hitBoss(s.dmg, s.o); this.parts.push({ type: 'spark', x: s.x + 4, y: s.y, vx: -50, vy: rnd(-30, 30), life: 0.12, max: 0.15, c: '#fff' }); this.emit('hit'); }
    }
    this.en = this.en.filter(e => !e.dead && e.x > -40 && e.y < GH + 20);
    // players vs enemies/bullets
    if (this.state === 'play' || this.state === 'boss' || this.state === 'warn') {
      for (const p of this.players) {
        if (!p.alive || p.inv > 0 || p.shield > 0) continue;
        const cx = p.x + 17, cy = p.y + 10;
        for (const e of this.eb) if (Math.abs(e.x - cx) < 3 + e.r && Math.abs(e.y - cy) < 3 + e.r) { this.playerDie(p); break; }
        if (p.alive) for (const e of this.en) { if (e.warn > 0 || e.delay > 0) continue; if (cx > e.x && cx < e.x + e.w && cy > e.y && cy < e.y + e.h) { e.dead = true; this.kill(e, p, true); this.playerDie(p); break; } }
        if (p.alive && b && !b.dead && cx > b.x + 4 && cx < b.x + b.w && cy > b.y + 2 && cy < b.y + b.h - 2) this.playerDie(p);
      }
    }
    // power-ups
    for (const u of this.pups) {
      u.t += dt; u.x -= 30 * dt; u.y += Math.sin(u.t * 3) * 0.3;
      for (const p of this.players) {
        if (u.dead || !p.alive || Math.abs(u.x + 5 - (p.x + 17)) >= 14 || Math.abs(u.y + 5 - (p.y + 10)) >= 12) continue;
        u.dead = true;
        if (u.k === 'L') { if (p.power < 4) { p.power++; p.lvlT = 1; this.text('POTENZA ' + p.power + '!', p.x + 16, p.y - 8, '#8ee03a', 1, 1, true); this.parts.push({ type: 'ring', x: p.x + 17, y: p.y + 10, r: 4, vr: 90, life: 0.35, max: 0.35, c: '#c8f03c' }); } else { this.addScore(p, 2000); this.text('2000', p.x + 16, p.y - 8, '#8ee03a', 1, 1, true); } this.emit('power'); }
        if (u.k === 'B') { p.bombs = Math.min(5, p.bombs + 1); this.text('+BOMBA', p.x + 16, p.y - 8, '#ff9a1a', 1, 1, true); this.emit('power'); }
        if (u.k === 'H') { p.lives++; this.text('1UP!', p.x + 16, p.y - 8, '#ff5060', 1.2, 2, true); this.emit('life'); }
        for (let i = 0; i < 8; i++) this.parts.push({ type: 'star', x: u.x + 5, y: u.y + 5, vx: rnd(-50, 50), vy: rnd(-50, 50), life: 0.4, max: 0.4, c: '#fff' });
      }
    }
    this.pups = this.pups.filter(u => !u.dead && u.x > -12);
    // particles
    for (const q of this.parts) {
      q.life -= dt;
      if (q.type === 'ring' || q.type === 'shock') q.r += q.vr * dt;
      else {
        q.x += q.vx * dt; q.y += q.vy * dt;
        if (q.type === 'spark') { q.vx *= 0.96; q.vy *= 0.96; if (q.g) q.vy += q.g * dt; }
        else if (q.type === 'smoke') { q.r += dt * 4; q.vy -= 8 * dt; }
        else if (q.type === 'debris') { q.vy += q.g * dt; q.rot += q.vr * dt; if (q.y > GROUND + 4) { q.y = GROUND + 4; q.vy *= -0.3; q.vx *= 0.6; } }
      }
    }
    this.parts = this.parts.filter(q => q.life > 0);
    if (this.parts.length > 900) this.parts.splice(0, this.parts.length - 900);
    for (const t of this.texts) { t.life -= dt; t.age += dt; t.y -= 12 * dt; }
    this.texts = this.texts.filter(t => t.life > 0);
  }

  // ---------- online co-op: host snapshots / guest rendering (net.js) ----------
  // Host: serialize() at ~20 Hz. Guest: applySnapshot(s) when one arrives, stepRemote(dt) every frame
  // (cosmetic extrapolation only, no simulation). Particles travel as deltas (np) and are simulated locally.
  serialize() {
    const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
    const plain = (o, skip) => { const r = {}; for (const k in o) { if (k[0] === '_' || (skip && skip.includes(k))) continue; const v = o[k]; const ty = typeof v; if (ty === 'number') r[k] = r2(v); else if (ty === 'string' || ty === 'boolean' || v === null) r[k] = v; } return r; };
    const s = {
      st: this.state, s: r2(this.st), t: r2(this.t), stage: this.stage, loop: this.loop, scroll: r1(this.scroll), shake: r2(this.shake), flash: r2(this.flash),
      slowT: r2(this.slowT), paused: this.paused, stageT: r2(this.stageT || 0), bombT: r2(this.bombT || 0), attractT: r2(this.attractT), contT: r2(this.contT || 0), overFrom: this.overFrom || null, hi: this.hi,
      banner: this.banner ? { s: this.banner.s, t: r2(this.banner.t), max: this.banner.max } : null,
      trans: this.trans ? { type: this.trans.type, t: r2(this.trans.t), dur: this.trans.dur } : null,
    };
    if (this.state === 'attract') return s;
    s.pl = this.players.map(p => plain(p, ['input', 'prev']));
    s.sh = this.shots.map(q => [r1(q.x), r1(q.y), r1(q.vx), r1(q.vy), q.o ? q.o.id : 0]);
    s.eb = this.eb.map(e => [r1(e.x), r1(e.y), r1(e.vx), r1(e.vy), e.r]);
    s.en = this.en.map(e => plain(e, ['group']));
    s.boss = this.boss ? plain(this.boss) : null;
    s.pu = this.pups.map(u => plain(u)); s.tx = this.texts.map(t => plain(t)); s.fl = this.flocks.map(f => plain(f));
    s.np = []; for (const q of this.parts) if (!q._s) { q._s = 1; s.np.push(plain(q)); }
    return s;
  }
  applySnapshot(s) {
    if (!s || !s.st) return;
    const stageChanged = s.stage !== this.stage || (this.state === 'attract' && s.st !== 'attract');
    for (const k of ['t', 'stage', 'loop', 'scroll', 'shake', 'flash', 'slowT', 'paused', 'stageT', 'bombT', 'attractT', 'contT', 'overFrom', 'hi', 'banner']) if (k in s) this[k] = s[k];
    this.state = s.st; this.st = s.s;
    this.trans = s.trans ? { ...s.trans, cb: null } : null;
    if (s.st === 'attract') { if (this.players.length) { this.players = []; this.p = null; this.clearWorld(); } return; }
    // players: keep local objects (and input refs), copy fields
    const pl = s.pl || [];
    while (this.players.length < pl.length) this.players.push(this.makePlayer(this.players.length));
    this.players.length = pl.length;
    pl.forEach((d, i) => Object.assign(this.players[i], d));
    this.p = this.players[0] || null;
    this.shots = (s.sh || []).map(a => ({ x: a[0], y: a[1], vx: a[2], vy: a[3], o: this.players[a[4]] || null, dmg: 1 }));
    this.eb = (s.eb || []).map(a => ({ x: a[0], y: a[1], vx: a[2], vy: a[3], r: a[4] }));
    this.en = s.en || []; this.boss = s.boss || null; this.pups = s.pu || []; this.texts = s.tx || []; this.flocks = s.fl || [];
    if (s.np && s.np.length) { for (const q of s.np) this.parts.push(q); if (this.parts.length > 900) this.parts.splice(0, this.parts.length - 900); }
    if (stageChanged) this.initWeather();
    this.flockT = 1e9; this._remoteAt = performance.now();
  }
  stepRemote(dt) {
    dt = Math.min(dt, 0.05);
    this.t += dt; this.st += dt;
    if (this.trans) this.trans.t = Math.min(this.trans.dur, this.trans.t + dt);
    if (this.banner) this.banner.t -= dt;
    if (this.state === 'attract') { this.attractT += dt; return; }
    if (this.paused) return;
    const w = dt * (this.slowT > 0 ? 0.35 : 1);
    this.scroll += w * (this.state === 'clear' ? 90 : 60);
    this.shake = Math.max(0, this.shake - dt * 18); this.flash = Math.max(0, this.flash - dt * 3);
    for (const q of this.shots) { q.x += q.vx * w; q.y += q.vy * w; }
    for (const e of this.eb) { e.x += e.vx * w; e.y += e.vy * w; }
    for (const e of this.en) { e.t = (e.t || 0) + w; if (e.flash) e.flash = Math.max(0, e.flash - dt); if (e.vx && e.type !== 'heli' && !(e.warn > 0)) e.x += e.vx * w; }
    if (this.boss) { this.boss.t += w; this.boss.flashT = (this.boss.flashT || 0) - dt; }
    for (const u of this.pups) u.t = (u.t || 0) + w;
    for (const p of this.players) { p.anim = (p.anim || 0) + w; }
    for (const q of this.parts) {
      q.life -= w;
      if (q.type === 'ring' || q.type === 'shock') q.r += q.vr * w;
      else {
        q.x += q.vx * w; q.y += q.vy * w;
        if (q.type === 'spark') { q.vx *= 0.96; q.vy *= 0.96; if (q.g) q.vy += q.g * w; }
        else if (q.type === 'smoke') { q.r += w * 4; q.vy -= 8 * w; }
        else if (q.type === 'debris') { q.vy += q.g * w; q.rot += q.vr * w; if (q.y > GROUND + 4) { q.y = GROUND + 4; q.vy *= -0.3; q.vx *= 0.6; } }
      }
    }
    this.parts = this.parts.filter(q => q.life > 0);
    for (const t of this.texts) { t.life -= w; t.age = (t.age || 0) + w; t.y -= 12 * w; }
    this.texts = this.texts.filter(t => t.life > 0);
    this.updateWeather(w);
  }

  // ---------- weather / ambient layers ----------
  initWeather() {
    this.weather = [];
    const n = this.stage === 2 ? 70 : this.stage === 1 ? 26 : 0;
    for (let i = 0; i < n; i++) this.weather.push(this.newFlake(true));
  }
  newFlake(init) {
    const s = this.stage;
    if (s === 2) { const ember = Math.random() < 0.5; return { k: ember ? 'ember' : 'ash', x: rnd(0, GW), y: init ? rnd(TOP, GROUND) : (ember ? GROUND : TOP), vx: rnd(-30, -8), vy: ember ? rnd(-30, -10) : rnd(10, 25), ph: rnd(0, 6) }; }
    return { k: 'fly', x: rnd(0, GW), y: rnd(120, GROUND - 6), vx: rnd(-14, 4), vy: rnd(-4, 4), ph: rnd(0, 6) };
  }
  updateWeather(dt) {
    for (const w of this.weather) {
      w.x += w.vx * dt + Math.sin(this.t * 2 + w.ph) * 0.2; w.y += w.vy * dt;
      if (w.k === 'fly') { w.vy += rnd(-10, 10) * dt; w.vy = clamp(w.vy, -8, 8); }
      if (w.x < -4 || w.y < TOP - 2 || w.y > GROUND + 2) Object.assign(w, this.newFlake(false), { x: w.x < -4 ? GW + 2 : w.x });
    }
    if (ACTIVE.includes(this.state)) {
      this.flockT -= dt;
      if (this.flockT <= 0) { this.flockT = rnd(7, 12); this.flocks.push({ x: GW + 10, y: rnd(28, 80), n: 3 + ((Math.random() * 4) | 0), heli: this.stage === 2 }); }
      for (const f of this.flocks) f.x -= (f.heli ? 22 : 30) * dt;
      this.flocks = this.flocks.filter(f => f.x > -60);
    }
  }

  // ---------- drawing ----------
  draw() {
    const x = this.ctx, s = this.state;
    x.save(); x.imageSmoothingEnabled = false;
    if (s === 'attract') { this.drawAttract(x); x.restore(); this.drawTrans(x); return; }
    const sh = this.shake; if (sh > 0) x.translate(Math.round(rnd(-sh, sh)), Math.round(rnd(-sh, sh)));
    this.drawBg(x);
    // power-ups (spinning)
    for (const u of this.pups) {
      const img = this.S['pu' + u.k], w = Math.max(2, Math.round(11 * Math.abs(Math.cos(u.t * 4))));
      if (Math.floor(u.t * 8) % 2) { x.fillStyle = '#fff'; x.fillRect(Math.round(u.x + 5.5 - w / 2) - 1, Math.round(u.y) - 1, w + 2, 13); }
      x.drawImage(img, Math.round(u.x + 5.5 - w / 2), Math.round(u.y), w, 11);
      if (w > 6) drawText(x, u.k === 'H' ? '♥' : u.k, u.x + 3, u.y + 2, '#120c1a', 1, 'left', null);
    }
    for (const e of this.en) this.drawEnemy(x, e);
    if (this.boss) this.drawBoss(x, this.boss);
    for (const p of this.players) this.drawPlayer(x, p);
    for (const q of this.shots) { const qx = Math.round(q.x), qy = Math.round(q.y); x.fillStyle = q.o && q.o.id ? '#5ad0ff' : '#c8f03c'; x.fillRect(qx, qy - 1, 7, 3); x.fillStyle = '#ffffff'; x.fillRect(qx + 3, qy, 4, 1); x.fillStyle = q.o && q.o.id ? '#183a8a' : '#3f8a1e'; x.fillRect(qx - 2, qy, 2, 1); }
    for (const e of this.eb) { const f = Math.floor(this.t * 16) % 2; x.fillStyle = f ? '#ff4060' : '#ffd0e0'; x.fillRect(Math.round(e.x - e.r), Math.round(e.y - e.r), e.r * 2, e.r * 2); x.fillStyle = '#fff'; x.fillRect(Math.round(e.x) - 1, Math.round(e.y) - 1, 1, 1); }
    this.drawParts(x);
    for (const t of this.texts) {
      const pop = t.age < 0.12 ? 2 : 1, bounce = Math.round(-Math.sin(Math.min(t.age * 9, Math.PI)) * 3);
      const fade = t.life < 0.25 && Math.floor(t.life * 20) % 2;
      if (!fade) drawText(x, t.s, t.x, t.y + bounce, t.c, t.scale * pop, t.center ? 'center' : 'left');
    }
    if (this.bombT > 0) this.drawBomb(x);
    this.drawWeather(x, true);
    x.restore();
    this.drawHud(x);
    this.drawOverlay(x);
    if (this.flash > 0) { x.fillStyle = `rgba(255,250,220,${Math.min(1, this.flash)})`; x.fillRect(0, 0, GW, GH); }
    if (this.paused) { x.fillStyle = 'rgba(10,0,20,0.6)'; x.fillRect(0, 0, GW, GH); drawText(x, 'PAUSA', GW / 2, 110 + Math.round(Math.sin(this.t * 3) * 3), '#fff', 3, 'center'); }
    this.drawTrans(x);
  }
  drawParts(x) {
    for (const q of this.parts) {
      const k = q.life / q.max;
      if (q.type === 'spark' || q.type === 'trail') { x.fillStyle = q.c; const sz = q.type === 'trail' ? 1 : 2; x.fillRect(Math.round(q.x), Math.round(q.y), sz, sz); }
      else if (q.type === 'star') { x.fillStyle = q.c; const qx = Math.round(q.x), qy = Math.round(q.y); x.fillRect(qx - 1, qy, 3, 1); x.fillRect(qx, qy - 1, 1, 3); }
      else if (q.type === 'smoke') { x.globalAlpha = Math.min(1, k * 1.3) * 0.75; x.fillStyle = k > 0.6 ? '#8a7a9a' : '#4a3e5a'; const r = Math.max(1, Math.round(q.r)), qx = Math.round(q.x), qy = Math.round(q.y); x.fillRect(qx - r, qy - r + 1, r * 2, r * 2 - 2); x.fillRect(qx - r + 1, qy - r, r * 2 - 2, r * 2); x.globalAlpha = 1; }
      else if (q.type === 'ring') { x.strokeStyle = q.c || (k > 0.5 ? '#fff4a0' : '#ff9a1a'); x.lineWidth = 2; x.beginPath(); x.arc(q.x, q.y, q.r, 0, 7); x.stroke(); }
      else if (q.type === 'shock') { x.globalAlpha = k; x.strokeStyle = '#fff8d0'; x.lineWidth = 3; x.beginPath(); x.arc(q.x, q.y, q.r, 0, 7); x.stroke(); x.globalAlpha = 1; }
      else if (q.type === 'debris') { x.save(); x.translate(Math.round(q.x), Math.round(q.y)); x.rotate(Math.round(q.rot * 2) / 2); x.fillStyle = q.c; x.fillRect(-q.s / 2, -q.s / 2, q.s, q.s * 0.6); x.restore(); }
    }
  }
  drawPlayer(x, p) {
    if (!p.alive) return;
    if (p.shield > 0 && p.shield < 0.7 && Math.floor(this.t * 20) % 2) return;
    const base = p.id ? 'p2' : 'player', fr = Math.floor(p.anim * 8) % 2 ? 'B' : 'A';
    const bank = p.bank > 0.35 ? '_dn' : p.bank < -0.35 ? '_up' : '';
    const px = Math.round(p.x), py = Math.round(p.y) - PAD;
    if (p.lvlT > 0 && Math.floor(this.t * 16) % 2) { const w = this.S[base + fr + '_w']; x.globalAlpha = 0.7; for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) x.drawImage(w, px + ox, py + oy); x.globalAlpha = 1; }
    if (p.bigalesso) { const RB = ['#ff3040', '#ff9a1a', '#ffd83a', '#8ee03a', '#3aa8ff', '#b050ff']; for (let i = 0; i < 6; i++) { x.fillStyle = RB[i]; for (let k = 0; k < 7; k++) x.fillRect(px - 6 - k * 6, py + PAD + 6 + i * 2 + Math.round(Math.sin(this.t * 9 + k * 0.9) * 1.5), 6, 2); } }
    x.drawImage(this.S[base + fr + bank], px, py);
    if (p.flashT > 0) { const fx = px + 31, fy = py + PAD + 12, f = Math.floor(this.t * 60) % 2; x.fillStyle = '#fff'; x.fillRect(fx - 1, fy - 1, 3, 3); x.fillStyle = p.id ? '#5ad0ff' : '#c8f03c'; x.fillRect(fx - 3 - f, fy, 7 + f * 2, 1); x.fillRect(fx, fy - 3 - f, 1, 7 + f * 2); }
    else { x.fillStyle = Math.floor(this.t * 12) % 2 ? (p.id ? '#5ad0ff' : '#c8f03c') : '#ffffff'; x.fillRect(px + 30, py + PAD + 12, 2, 2); }
    if (p.shield > 0) {
      x.save(); x.globalAlpha = 0.45 + 0.3 * Math.sin(this.t * 10); x.strokeStyle = P_COL[p.id]; x.lineWidth = 1; x.setLineDash([3, 2]); x.lineDashOffset = -this.t * 30;
      x.beginPath(); x.arc(px + 16, py + PAD + 10, 16 + Math.sin(this.t * 6), 0, 7); x.stroke(); x.restore();
    }
    if (this.players.length > 1) drawText(x, p.id ? '2P' : '1P', px + 14, py - 6, P_COL[p.id], 1, 'center');
  }

  drawBg(x) {
    const bg = this.bgs[this.stage]; const sc = this.scroll, st = bg.st;
    x.drawImage(bg.sky, 0, TOP - 4);
    const fo = -(sc * 0.12) % 640, co = -(sc * 0.25) % 640, mo = -(sc * 0.45) % 640;
    x.drawImage(bg.far, Math.round(fo), TOP + 14); x.drawImage(bg.far, Math.round(fo) + 640, TOP + 14);
    // flocks far away
    for (const f of this.flocks) {
      x.fillStyle = f.heli ? '#3a0a14' : '#2a1040';
      for (let i = 0; i < f.n; i++) {
        const bx = Math.round(f.x + i * 9 + (i % 2) * 3), by = Math.round(f.y + Math.abs(i - f.n / 2) * 3 + Math.sin(this.t * 3 + i) * 1.5);
        if (f.heli) { x.fillRect(bx, by, 5, 2); x.fillRect(bx + 5, by, 3, 1); x.fillRect(bx - 1, by - 1, 7, 1); }
        else { const up = Math.floor(this.t * 6 + i) % 2; x.fillRect(bx, by, 1, 1); x.fillRect(bx - 2, by - up, 2, 1); x.fillRect(bx + 1, by - up, 2, 1); }
      }
    }
    // searchlights (stage 1 and 3)
    if (this.stage !== 1) {
      x.save(); x.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 2; i++) {
        const ox = i ? 250 : 70, oy = GROUND - 10, a = -Math.PI / 2 + Math.sin(this.t * 0.5 + i * 2.1) * 0.55, L = 230, hw = 0.07;
        x.fillStyle = this.stage === 2 ? 'rgba(255,120,60,0.09)' : 'rgba(255,245,200,0.1)';
        x.beginPath(); x.moveTo(ox, oy); x.lineTo(ox + Math.cos(a - hw) * L, oy + Math.sin(a - hw) * L); x.lineTo(ox + Math.cos(a + hw) * L, oy + Math.sin(a + hw) * L); x.closePath(); x.fill();
      }
      x.restore();
    }
    x.drawImage(bg.clouds, Math.round(co), TOP + 8); x.drawImage(bg.clouds, Math.round(co) + 640, TOP + 8);
    x.drawImage(bg.mid, Math.round(mo), TOP + 14); x.drawImage(bg.mid, Math.round(mo) + 640, TOP + 14);
    this.drawWeather(x, false);
    // ground + crowd (like the cabinet art)
    x.fillStyle = st.accent; x.fillRect(0, GROUND - 2, GW, GH - GROUND + 2);
    x.fillStyle = st.ground; x.fillRect(0, GROUND + 22, GW, GH - GROUND - 22);
    for (let i = 0; i < GW; i += 4) { x.fillStyle = (i >> 2) % 3 ? '#6a9a14' : '#4a1878'; x.fillRect(i, GROUND + 2 + ((i * 7) % 5), 3, 2); }
    const cheer = this.state === 'clear' || this.state === 'ending' || (this.boss && this.boss.dead);
    const off = sc % 13;
    for (let i = -1; i < 27; i++) {
      const seed = ((i + Math.floor(sc / 13)) * 2654435761) >>> 0;
      const cx = Math.round(i * 13 - off + (seed % 4));
      const wave = Math.sin(this.t * 4 - i * 0.55) > 0.8;
      const hy = GROUND + 7 + (seed % 3) - (cheer ? Math.round(Math.abs(Math.sin(this.t * 8 + i)) * 3) : wave ? 2 : 0);
      x.fillStyle = '#0a0410';
      x.fillRect(cx - 2, hy, 6, 7); x.fillRect(cx - 3, hy + 1, 8, 5);
      x.fillRect(cx - 5, hy + 7, 12, 30);
      const up = cheer || wave || ((Math.floor(this.t * 2.5 + (seed % 7)) % 5) === 0);
      if (up) { x.fillRect(cx - 7, hy - 6, 3, 14); x.fillRect(cx + 6, hy - 6, 3, 14); x.fillRect(cx - 8, hy - 9, 4, 4); x.fillRect(cx + 6, hy - 9, 4, 4); }
      else if (seed % 2) { x.fillRect(cx + 6, hy - 4, 3, 12); x.fillRect(cx + 6, hy - 7, 4, 4); }
      x.fillStyle = '#9a3fd8'; x.fillRect(cx - 2, hy + 1, 1, 5); x.fillRect(cx - 5, hy + 8, 1, 8);
      if (cheer && seed % 5 === 0 && Math.floor(this.t * 6 + i) % 2) { x.fillStyle = '#ffd83a'; x.fillRect(cx - 8, hy - 11, 2, 2); }
    }
  }
  drawWeather(x, front) {
    for (const w of this.weather) {
      if ((w.k === 'ember') !== front) continue;
      const wx = Math.round(w.x), wy = Math.round(w.y);
      if (w.k === 'ember') { x.fillStyle = Math.sin(this.t * 12 + w.ph) > 0 ? '#ffd83a' : '#ff6a1a'; x.fillRect(wx, wy, 1, 1); }
      else if (w.k === 'ash') { x.fillStyle = 'rgba(200,180,190,0.6)'; x.fillRect(wx, wy, 2, 1); }
      else if (w.k === 'fly' && Math.sin(this.t * 3 + w.ph * 5) > 0.2) { x.fillStyle = '#d8ff5a'; x.fillRect(wx, wy, 1, 1); }
    }
  }
  drawEnemy(x, e) {
    let img;
    switch (e.type) {
      case 'drone': img = Math.floor(e.t * 10) % 2 ? 'droneB' : 'droneA'; break;
      case 'heli':
        img = Math.floor(e.t * 20) % 2 ? 'heliB' : 'heliA';
        x.globalAlpha = 0.35; x.fillStyle = '#d0d0e0'; x.fillRect(Math.round(e.x) - 3 + ((e.t * 60) % 3 | 0), Math.round(e.y), 33, 1); x.globalAlpha = 1;
        break;
      case 'missile':
        if (e.warn > 0) { if (Math.floor(e.warn * 10) % 2) { x.fillStyle = '#ff3040'; x.fillRect(GW - 14, e.y - 3, 10, 10); drawText(x, '!', GW - 11, e.y - 2, '#fff', 1, 'left', null); x.fillStyle = 'rgba(255,48,64,0.25)'; x.fillRect(0, Math.round(e.y + 2), GW - 16, 1); } return; }
        img = 'missile'; if (Math.floor(e.t * 20) % 2) { x.fillStyle = '#fff4a0'; x.fillRect(Math.round(e.x) + 18, Math.round(e.y) + 1, 3, 3); }
        break;
      case 'jet': img = 'jet'; break;
      case 'tank': img = 'tank'; break;
      case 'rocket': img = 'rocket'; break;
    }
    if (e.flash > 0) { e.flash -= 1 / 60; img += '_w'; }
    const rx = e.type === 'tank' && e.recoil > 0 ? 1 : 0;
    x.drawImage(this.S[img], Math.round(e.x) + rx, Math.round(e.y));
  }
  drawBoss(x, b) {
    const img = (Math.floor(b.t * 20) % 2 ? 'bossB' : 'bossA') + (b.flashT > 0 ? '_w' : (b.big ? '_r' : ''));
    const spr = this.S[img];
    const tilt = b.dead ? Math.min(0.4, b.deathT * 0.2) : 0;
    if (tilt) { x.save(); x.translate(Math.round(b.x + b.w / 2), Math.round(b.y + b.h / 2)); x.rotate(tilt); x.drawImage(spr, -b.w / 2, -b.h / 2, spr.width * b.sc, spr.height * b.sc); x.restore(); }
    else x.drawImage(spr, Math.round(b.x), Math.round(b.y), spr.width * b.sc, spr.height * b.sc);
    x.globalAlpha = 0.3; x.fillStyle = '#e0e0f0'; x.fillRect(Math.round(b.x) + ((b.t * 70) % 6 | 0), Math.round(b.y), b.w - 10, 2); x.globalAlpha = 1;
    if (!b.dead) {
      const info = BOSS_INFO[this.stage];
      x.fillStyle = '#120c1a'; x.fillRect(60, TOP + 4, 200, 6);
      const k = b.hp / b.max, w = Math.max(0, 198 * k);
      x.fillStyle = k < 0.3 && Math.floor(this.t * 8) % 2 ? '#fff' : '#ff3040'; x.fillRect(61, TOP + 5, w, 4);
      x.fillStyle = '#ffb0c0'; x.fillRect(61, TOP + 5, w, 1);
      drawText(x, info[0], 160, TOP + 12, '#ffd0e0', 1, 'center');
    }
  }
  drawBomb(x) {
    const k = 1 - this.bombT / 1.9; const cx = 165, base = GROUND + 4;
    const e = 1 - Math.pow(1 - Math.min(1, k * 1.6), 3);
    const size = 14 + e * 78;
    x.globalAlpha = Math.min(1, this.bombT * 1.2);
    x.fillStyle = `rgba(255,120,30,${0.28 * (1 - k)})`; x.fillRect(0, TOP, GW, GH - TOP);
    const top = base - size * 1.25;
    // heat rays behind the cap
    x.save(); x.globalCompositeOperation = 'lighter'; x.fillStyle = 'rgba(255,200,90,0.16)';
    for (let r = 0; r < 12; r++) { const a = r / 12 * 6.283 + this.t * 0.6; x.beginPath(); x.moveTo(cx, top); x.lineTo(cx + Math.cos(a - 0.08) * 300, top + Math.sin(a - 0.08) * 300); x.lineTo(cx + Math.cos(a + 0.08) * 300, top + Math.sin(a + 0.08) * 300); x.fill(); }
    x.restore();
    const cols = ['#fff4a0', '#ffd83a', '#ff9a1a', '#ff5a1a', '#c02a1a'];
    for (let i = 0; i < size * 1.25; i += 2) { const w = size * 0.22 + Math.sin(i * 0.35 + this.t * 14) * 3 + (i < 10 ? (10 - i) * 2 : 0); x.fillStyle = cols[((i >> 2) + Math.floor(this.t * 20)) % 4]; x.fillRect(Math.round(cx - w / 2), base - i, Math.round(w), 2); }
    x.fillStyle = '#ff9a1a'; x.fillRect(Math.round(cx - size * 0.5), Math.round(base - size * 0.65), Math.round(size), 3);
    for (let j = 0; j < 22; j++) { const a = (j / 21) * Math.PI; x.fillStyle = cols[(j + Math.floor(this.t * 16)) % 5]; x.beginPath(); x.arc(cx + Math.cos(a) * size * 0.75, top - Math.sin(a) * size * 0.28 + Math.sin(this.t * 9 + j) * 1.5, size * 0.3, 0, 7); x.fill(); }
    x.fillStyle = '#fff8d0'; x.beginPath(); x.ellipse(cx, top - size * 0.05, size * 0.5, size * 0.2, 0, 0, 7); x.fill();
    x.fillStyle = '#fff4a0'; x.fillRect(Math.round(cx - e * 200), base - 3, Math.round(e * 400), 3);
    x.globalAlpha = 1;
    if (this.bombT > 1.2) { const s = Math.min(1, (1.9 - this.bombT) * 6); drawText(x, 'MEGA BOMBA!', 160, 58, '#fff', 2 + s, 'center', '#a01010'); }
  }
  drawHud(x) {
    x.fillStyle = '#0a0612'; x.fillRect(0, 0, GW, TOP);
    drawText(x, 'HI ' + String(this.hi).padStart(7, '0'), 160, 2, '#ffd83a', 1, 'center');
    const p1 = this.players[0], p2 = this.players[1];
    const block = (p, side) => {
      const L = side === 0;
      const sx = L ? 2 : 260;
      drawText(x, p.id ? '2P' : '1P', sx, 2, P_COL[p.id]);
      if (p.state === 'out' && this.state !== 'over') {
        if (Math.floor(this.t * 3) % 2) drawText(x, 'CONTINUA? ' + Math.ceil(p.contT), L ? 16 : 200, 2, '#ff5060');
        return;
      }
      drawText(x, String(Math.floor(p.shown)).padStart(7, '0'), sx + 15, 2, '#fff');
      const ix = L ? 60 : 246, sh = p.hudShake > 0 ? Math.round(rnd(-1, 1)) : 0;
      x.drawImage(this.S.heart, ix + sh, 3); drawText(x, String(Math.max(0, p.lives)), ix + 6 + sh, 2, p.hudShake > 0 ? '#fff' : '#ff5060', 1, 'left', null);
      const bx = L ? 74 : 232; x.drawImage(this.S.bombIco, bx, 2); drawText(x, String(p.bombs), bx + 6, 2, '#ff9a1a', 1, 'left', null);
      const px = L ? 88 : 214;
      for (let i = 0; i < 4; i++) { x.fillStyle = i < p.power ? (p.lvlT > 0 && Math.floor(this.t * 16) % 2 ? '#fff' : '#8ee03a') : '#2a2440'; x.fillRect(px + i * 4, 3, 3, 5); }
      if (p.mult > 1 || p.chain >= 3) { const cy = TOP + 2; const s = p.mult > 1 ? 'x' + p.mult + ' CATENA ' + p.chain : 'CATENA ' + p.chain; drawText(x, s, L ? 3 : 317, cy + 1, p.mult > 1 ? '#ff5ad0' : '#e0d0ff', 1, L ? 'left' : 'right'); x.fillStyle = '#ff5ad0'; x.fillRect(L ? 3 : 317 - 40, cy + 9, Math.round(40 * Math.max(0, p.chainT) / 1.8), 1); }
    };
    if (p1) block(p1, 0);
    if (p2) block(p2, 1);
    else if (p1 && this.state !== 'attract' && Math.floor(this.t * 1.5) % 2) drawText(x, '2P PREMI START', 317, 2, P_COL[1], 1, 'right');
  }
  drawTrans(x) {
    const tr = this.trans; if (!tr) return;
    const k = clamp(tr.t / tr.dur, 0, 1), R = 210;
    const r = tr.type === 'open' ? R * k * k : R * (1 - k) * (1 - k);
    x.save(); x.fillStyle = '#0a0410'; x.beginPath(); x.rect(0, 0, GW, GH); x.arc(160, 118, Math.max(0.1, r), 0, Math.PI * 2, true); x.fill('evenodd');
    x.strokeStyle = '#c8f03c'; x.lineWidth = 2; x.beginPath(); x.arc(160, 118, Math.max(0.1, r), 0, 7); x.stroke(); x.restore();
  }
  bounceText(x, s, cx, y, col, scale, t0, shadow = '#120c1a') {
    const cw = 6 * scale, w = textWidth(s, scale), x0 = cx - w / 2;
    for (let i = 0; i < s.length; i++) {
      const tt = this.st - t0 - i * 0.05; if (tt < 0) continue;
      const yy = y - (1 - outBounce(tt / 0.6)) * 40;
      drawText(x, s[i], x0 + i * cw, yy, col, scale, 'left', shadow);
    }
  }
  waveText(x, s, cx, y, col, scale, amp = 3, shadow = '#120c1a') {
    const cw = 6 * scale, w = textWidth(s, scale), x0 = cx - w / 2;
    for (let i = 0; i < s.length; i++) drawText(x, s[i], x0 + i * cw, y + Math.round(Math.sin(this.t * 6 + i * 0.6) * amp), col, scale, 'left', shadow);
  }
  drawFace(x, fx, fy, w, h, tint) {
    if (!this.img.face) return;
    x.save(); x.imageSmoothingEnabled = true; x.drawImage(this.img.face, fx, fy, w, h); x.restore();
    if (tint) { x.fillStyle = tint; x.fillRect(fx, fy, w, h); }
    x.strokeStyle = '#c8f03c'; x.lineWidth = 1; x.strokeRect(fx - 0.5, fy - 0.5, w + 1, h + 1);
  }
  drawOverlay(x) {
    const s = this.state, st = this.st;
    if (s === 'intro') {
      this.bounceText(x, (this.loop ? 'GIRO ' + (this.loop + 1) + ' - ' : '') + 'STAGE ' + (this.stage + 1), 196, 40, '#fff', 2, 0.25, '#4a1878');
      this.bounceText(x, STAGES[this.stage].name, 196, 62, '#c8f03c', 3, 0.55);
      // portrait + speech bubble
      const k = clamp((st - 0.2) / 0.55, 0, 1), fx = Math.round(-96 + outBack(k) * 104);
      x.fillStyle = '#120c1a'; x.fillRect(fx - 3, 125, 70, 76);
      this.drawFace(x, fx, 128, 64, 60);
      drawText(x, 'BIGALESSO', fx + 32, 191, '#ffd83a', 1, 'center');
      if (st > 0.8) {
        const line = STAGE_LINES[this.stage], n = Math.min(line.length, Math.floor((st - 0.8) * 26));
        const bx = fx + 76, by = 140, bw = 236 - bx + 60, bh = 22;
        x.fillStyle = '#fff'; x.fillRect(bx, by, bw, bh); x.fillRect(bx - 4, by + 12, 5, 3); x.fillStyle = '#120c1a'; x.fillRect(bx + 1, by + 1, bw - 2, bh - 2); x.fillStyle = '#fff'; x.fillRect(bx + 2, by + 2, bw - 4, bh - 4);
        drawText(x, line.slice(0, n), bx + 6, by + 8, '#2a0e4e', 1, 'left', null);
      }
      if (st > 2.3 && st < 2.95 && Math.floor(st * 6) % 2) drawText(x, 'PRONTI?', 196, 100, '#ffd83a', 2, 'center');
      if (st >= 2.95) { const pk = Math.min(1, (st - 2.95) * 5); drawText(x, 'VIA!', 196, 96, '#ff5ad0', 2 + pk * 2, 'center', '#120c1a'); }
    }
    if (s === 'warn') {
      // cinematic bars, sirens and boss card
      const bk = clamp(st / 0.4, 0, 1) * (st > 3.2 ? clamp((3.6 - st) / 0.4, 0, 1) : 1), bh = Math.round(bk * 16);
      x.fillStyle = '#000'; x.fillRect(0, TOP, GW, bh); x.fillRect(0, GH - bh, GW, bh);
      x.save(); x.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 2; i++) { const ox = i ? GW - 6 : 6, a = this.t * 5 + i * Math.PI; x.fillStyle = 'rgba(255,40,40,0.22)'; x.beginPath(); x.moveTo(ox, TOP + bh); x.lineTo(ox + Math.cos(a - 0.25) * 200, TOP + bh + Math.abs(Math.sin(a - 0.25)) * 200); x.lineTo(ox + Math.cos(a + 0.25) * 200, TOP + bh + Math.abs(Math.sin(a + 0.25)) * 200); x.fill(); }
      x.restore();
      x.fillStyle = `rgba(200,0,30,${0.12 + 0.1 * Math.sin(this.t * 10)})`; x.fillRect(0, TOP, GW, GH - TOP);
      if (st < 1.4 && Math.floor(st * 5) % 2) drawText(x, 'ATTENZIONE!', 160, 56, '#fff', 3, 'center', '#600');
      if (st > 1.1) {
        const ck = outBack((st - 1.1) / 0.5), cx = Math.round(GW + 20 - ck * (GW - 46));
        const info = BOSS_INFO[this.stage];
        x.fillStyle = '#120c1a'; x.fillRect(cx - 4, 94, 260, 54); x.fillStyle = '#ff3040'; x.fillRect(cx - 4, 94, 260, 2); x.fillRect(cx - 4, 146, 260, 2);
        const spr = this.S.bossA_w; x.globalAlpha = 0.85; x.drawImage(spr, cx, 104, spr.width * 0.9, spr.height * 0.9); x.globalAlpha = 1;
        drawText(x, 'BOSS', cx + 64, 99, '#ff3040', 1);
        drawText(x, info[0], cx + 64, 110, '#fff', 2, 'left', '#600');
        drawText(x, info[1], cx + 64, 130, '#ffd0e0', 1);
      }
    }
    if (this.banner) { const bk = this.banner; this.waveText(x, bk.s, 160, 64, Math.floor(this.t * 10) % 2 ? '#ffd83a' : '#fff', 2, 3); }
    if (s === 'clear') {
      this.waveText(x, 'STAGE CLEAR!', 160, 72, '#c8f03c', 3, 3);
      if (st > 1.2) {
        const bonus = 10000 * (this.stage + 1), shown = Math.min(bonus, Math.floor((st - 1.2) / 0.8 * bonus / 100) * 100);
        drawText(x, 'BONUS ' + shown, 160, 108, '#ffd83a', 2, 'center');
        if (this.players.length > 1) drawText(x, 'A OGNI GIOCATORE', 160, 128, '#e0d0ff', 1, 'center');
      }
    }
    if (s === 'over') {
      x.fillStyle = 'rgba(10,0,20,0.62)'; x.fillRect(0, TOP, GW, GH - TOP);
      this.drawFace(x, 128, 24, 64, 60, 'rgba(40,0,90,0.35)');
      this.bounceText(x, 'GAME OVER', 160, 94, '#ff3040', 3, 0);
      this.players.forEach((p, i) => drawText(x, (p.id ? '2P ' : '1P ') + p.score, this.players.length > 1 ? (i ? 230 : 90) : 160, 122, P_COL[p.id], 1, 'center'));
      if (st > 0.8) {
        const n = Math.max(0, Math.ceil(this.contT)), pul = 3 + (this.contT % 1 > 0.7 ? 1 : 0);
        drawText(x, 'CONTINUA?', 160, 140, '#fff', 1, 'center');
        drawText(x, String(n), 160, 152, n <= 3 ? '#ff5060' : '#ffd83a', pul, 'center', '#120c1a');
        if (Math.floor(st * 2) % 2) drawText(x, 'PREMI START', 160, 190, '#c8f03c', 1, 'center');
      }
    }
    if (s === 'ending') {
      if (st < 6) {
        x.fillStyle = 'rgba(10,0,20,0.45)'; x.fillRect(0, TOP, GW, GH - TOP);
        this.drawFace(x, 120, 22, 80, 75);
        this.waveText(x, "L'IMPERO È SALVO!", 160, 110, '#c8f03c', 2, 3);
        this.waveText(x, 'AVE, BIGALESSO!', 160, 134, '#ffd83a', 2, 2);
      } else {
        x.fillStyle = '#0c0620'; x.fillRect(0, TOP, GW, GH - TOP);
        for (let i = 0; i < 40; i++) { x.fillStyle = i % 4 ? '#3a2a6a' : '#fff'; x.fillRect((i * 83) % GW, TOP + ((i * 47 + (st * 8 | 0)) % (GH - TOP)), 1, 1); }
        CREDITS.forEach((c, i) => { const y = GH + i * 14 + (i ? 10 : 0) - (st - 6) * 22; if (y > TOP && y < GH - 8) drawText(x, c, 160, y, i === 0 ? '#c8f03c' : c.startsWith('-') ? '#ff5ad0' : '#fff', i === 0 ? 2 : 1, 'center'); });
        if (st > 15) drawText(x, 'IL PROSSIMO GIRO È PIÙ DURO...', 160, 112, '#ffd83a', 1, 'center');
      }
    }
  }

  // ---------- attract drawing ----------
  drawTicker(x) {
    const msg = '*** BIGALESSO GAMES PRESENTA *** SALVA ROMA DAGLI ELICOTTERI *** 1 O 2 GIOCATORI *** MEGA BOMBA PER I MOMENTI DISPERATI *** RECORD ' + this.hi + ' ***   ';
    const w = textWidth(msg, 1), off = (this.t * 40) % (w + GW);
    x.fillStyle = 'rgba(10,4,16,0.8)'; x.fillRect(0, GH - 11, GW, 11);
    drawText(x, msg, GW - off, GH - 9, '#ffd83a', 1, 'left', null);
  }
  drawAttract(x) {
    const ph = this.attractPhase, T = this.attractT % 34;
    if (ph === 'title') {
      const on = (this.t % 1.1) < 0.7;
      x.imageSmoothingEnabled = true; x.drawImage(on ? this.img.title : this.img.titleClean, 0, 0, GW, GH); x.imageSmoothingEnabled = false;
      // shine sweep
      const sx = ((this.t * 160) % 900) - 200;
      x.save(); x.globalCompositeOperation = 'lighter'; x.fillStyle = 'rgba(255,255,255,0.13)';
      x.beginPath(); x.moveTo(sx, 0); x.lineTo(sx + 26, 0); x.lineTo(sx - 54, GH); x.lineTo(sx - 80, GH); x.fill(); x.restore();
      // sparkles on laurel / mushroom / missiles
      const spots = [[118, 56], [196, 50], [232, 22], [262, 34], [286, 120], [60, 130], [150, 40], [210, 92]];
      spots.forEach(([sx2, sy], i) => { const k = Math.sin(this.t * 4 + i * 1.7); if (k > 0.55) { const r = k > 0.85 ? 3 : 2; x.fillStyle = '#fff'; x.fillRect(sx2 - r, sy, r * 2 + 1, 1); x.fillRect(sx2, sy - r, 1, r * 2 + 1); x.fillStyle = '#fff8c0'; x.fillRect(sx2 - 1, sy - 1, 3, 3); } });
      drawText(x, 'HI-SCORE ' + String(this.hi).padStart(7, '0'), 160, 3, '#ffd83a', 1, 'center');
      drawText(x, 'CREDITI 99', 316, 3, '#e0d0ff', 1, 'right');
      this.drawTicker(x);
    } else if (ph === 'info') {
      x.fillStyle = '#12082a'; x.fillRect(0, 0, GW, GH);
      const go = (this.t * 10) % 16;
      for (let i = 0; i < GW + 16; i += 16) { x.fillStyle = '#1c0e3a'; x.fillRect(i - go, 0, 1, GH); }
      for (let j = 0; j < GH + 16; j += 16) { x.fillStyle = '#1c0e3a'; x.fillRect(0, j - go, GW, 1); }
      this.drawFace(x, 12, 14 + Math.round(Math.sin(this.t * 2) * 2), 70, 66);
      for (let i = 0, s = 'BIGALESSO'; i < s.length; i++) drawText(x, s[i], 92 + i * 12, 20 + Math.round(Math.sin(this.t * 6 + i * 0.7) * 2), '#c8f03c', 2, 'left', '#4a1878');
      drawText(x, 'IMPERATORE DEL CAOS', 92, 42, '#ffd83a', 1);
      drawText(x, 'SALVA ROMA DAGLI INVASORI!', 92, 56, '#fff', 1);
      drawText(x, '1 O 2 GIOCATORI', 92, 68, '#5ad0ff', 1);
      const rows = [['↑↓←→ / WASD', 'MUOVI'], ['Z / SPAZIO / J', 'SPARA'], ['X / K', 'MEGA BOMBA'], ['INVIO', 'START'], ['P', 'PAUSA']];
      rows.forEach((r, i) => { drawText(x, r[0], 20, 96 + i * 12, '#8ee03a'); drawText(x, r[1], 124, 96 + i * 12, '#fff'); });
      const en = [['heli', 300], ['drone', 100], ['missile', 120], ['jet', 200], ['tank', 400]];
      en.forEach((e, i) => { const nm = e[0] === 'heli' || e[0] === 'drone' ? e[0] + (Math.floor(this.t * 12) % 2 ? 'A' : 'B') : e[0]; const img = this.S[nm]; x.drawImage(img, 212 + Math.round(Math.sin(this.t * 3 + i) * 2), 88 + i * 16 + Math.round(Math.cos(this.t * 4 + i) * 1.5)); drawText(x, String(e[1]), 306, 90 + i * 16, '#ffd83a', 1, 'right'); });
      drawText(x, 'L', 26, 176, '#8ee03a'); drawText(x, 'POTENZA', 36, 176, '#fff');
      drawText(x, 'B', 96, 176, '#ff9a1a'); drawText(x, 'BOMBA', 106, 176, '#fff');
      drawText(x, '♥', 150, 176, '#ff5060'); drawText(x, 'VITA', 160, 176, '#fff');
      drawText(x, 'COMBO: ABBATTI NEMICI DI FILA!', 160, 190, '#ff5ad0', 1, 'center');
      if (Math.floor(this.t * 2) % 2) drawText(x, 'PREMI START', 160, 206, '#c8f03c', 2, 'center', '#4a1878');
      this.drawTicker(x);
    } else if (ph === 'demo' && this.demo) {
      this.demo.draw(); x.drawImage(this.demo.canvas, 0, 0);
      if (Math.floor(this.t * 2) % 2) drawText(x, 'DEMO', 160, 20, '#fff', 2, 'center', '#4a1878');
      drawText(x, 'PREMI START', 160, 196, '#c8f03c', 1, 'center');
      this.drawTicker(x);
    } else {
      x.fillStyle = '#0c0620'; x.fillRect(0, 0, GW, GH);
      for (let i = 0; i < 50; i++) { x.fillStyle = i % 5 ? '#3a2a6a' : '#fff'; x.fillRect((i * 97 + (this.t * (5 + i % 3 * 4) | 0)) % GW, (i * 53) % GH, 1, 1); }
      const tt = T - 28;
      for (let i = 0, s = 'CLASSIFICA'; i < s.length; i++) drawText(x, s[i], 160 - 30 * 3 + i * 18, 24 + Math.round(Math.sin(this.t * 5 + i * 0.6) * 3), '#c8f03c', 3, 'left', '#4a1878');
      const rainbow = ['#ff5060', '#ffd83a', '#c8f03c', '#5ad0ff', '#ff5ad0'];
      this.table.forEach((e, i) => {
        const k = clamp((tt - 0.2 - i * 0.15) / 0.35, 0, 1); if (k <= 0) return;
        const xo = Math.round((1 - outBack(k)) * 200), y = 70 + i * 22;
        const c = i === 0 ? rainbow[Math.floor(this.t * 8) % 5] : '#fff';
        drawText(x, (i + 1) + '.', 66 + xo, y, '#ffd83a', 2);
        drawText(x, e.n, 100 + xo, y, c, 2);
        drawText(x, String(e.s).padStart(7, '0'), 258 + xo, y, c, 2, 'right');
      });
      if (Math.floor(this.t * 2) % 2) drawText(x, 'PREMI START', 160, 196, '#c8f03c', 1, 'center');
      this.drawTicker(x);
    }
  }
}
