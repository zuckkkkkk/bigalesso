// WebAudio synth: chiptune music + arcade SFX + room sounds
export class Audio {
  constructor() { this.ctx = null; this.muted = false; this.musicOn = false; this.step = 0; this.track = null; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    this.ctx = new C();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.7; this.master.connect(this.ctx.destination);
    // cabinet speaker colouring
    this.cab = this.ctx.createBiquadFilter(); this.cab.type = 'lowpass'; this.cab.frequency.value = 5200;
    this.cabHp = this.ctx.createBiquadFilter(); this.cabHp.type = 'highpass'; this.cabHp.frequency.value = 110;
    this.cabGain = this.ctx.createGain(); this.cabGain.gain.value = 0.55;
    this.cab.connect(this.cabHp); this.cabHp.connect(this.cabGain); this.cabGain.connect(this.master);
    this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.32; this.musicGain.connect(this.cab);
    this.room = this.ctx.createGain(); this.room.gain.value = 0.9; this.room.connect(this.master);
    const len = this.ctx.sampleRate * 2; this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // room tone + CRT hum
    const n = this.ctx.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    const nf = this.ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 400;
    const ng = this.ctx.createGain(); ng.gain.value = 0.02; n.connect(nf); nf.connect(ng); ng.connect(this.room); n.start();
    this.hum = this.ctx.createOscillator(); this.hum.frequency.value = 50; this.humG = this.ctx.createGain(); this.humG.gain.value = 0;
    this.hum.connect(this.humG); this.humG.connect(this.room); this.hum.start();
    this.initAmbience();
    this.timer = setInterval(() => this.tick(), 25); if (this.vol) this.setVolumes({}); this.nextT = this.ctx.currentTime + 0.1;
  }
  // true once sound can actually be heard (context created inside a user gesture and running)
  get running() { return !!this.ctx && this.ctx.state === 'running'; }
  // ---------- ambience: distant city + garden birds / night crickets + wind ----------
  // Everything goes through one bus that is heard directly outdoors and through a "wall" (lowpass) indoors;
  // underground (gulag) the outside world fades out. main.js calls setAmbience(out, night, under) every frame.
  initAmbience() {
    const c = this.ctx, A = this.amb = { out: 0, night: 0, under: 0, nextBird: 2, nextCity: 4, nextBell: 40 + Math.random() * 60, nextCricket: 0 };
    A.bus = c.createGain(); A.bus.gain.value = 1;
    A.outG = c.createGain(); A.outG.gain.value = 0;
    A.inG = c.createGain(); A.inG.gain.value = 0.4;
    A.wall = c.createBiquadFilter(); A.wall.type = 'lowpass'; A.wall.frequency.value = 900; A.wall.Q.value = 0.4;
    A.bus.connect(A.outG); A.outG.connect(this.room);
    A.bus.connect(A.wall); A.wall.connect(A.inG); A.inG.connect(this.room);
    // city bed: low rumble of traffic, slowly breathing
    const bed = c.createBufferSource(); bed.buffer = this.noiseBuf; bed.loop = true; bed.playbackRate.value = 0.5;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; lp.Q.value = 0.3;
    A.cityG = c.createGain(); A.cityG.gain.value = 0.018; bed.connect(lp); lp.connect(A.cityG); A.cityG.connect(A.bus); bed.start(0, Math.random());
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07; const lfoG = c.createGain(); lfoG.gain.value = 0.007; lfo.connect(lfoG); lfoG.connect(A.cityG.gain); lfo.start();
    // wind in the leaves: only heard outdoors
    const wind = c.createBufferSource(); wind.buffer = this.noiseBuf; wind.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 0.45;
    A.windG = c.createGain(); A.windG.gain.value = 0; wind.connect(bp); bp.connect(A.windG); A.windG.connect(A.outG); wind.start(0, Math.random() * 1.5);
    const wl = c.createOscillator(); wl.frequency.value = 0.11; const wlG = c.createGain(); wlG.gain.value = 0.004; wl.connect(wlG); wlG.connect(A.windG.gain); wl.start();
  }
  setAmbience(out = 0, night = 0, under = 0) {
    const A = this.amb; if (!A || !this.ctx) return;
    if (Math.abs(out - A.out) < 0.02 && Math.abs(night - A.night) < 0.02 && Math.abs(under - A.under) < 0.02) return;
    A.out = out; A.night = night; A.under = under;
    const t = this.ctx.currentTime, keep = 1 - under;
    A.outG.gain.setTargetAtTime(out * keep, t, 0.35);
    A.inG.gain.setTargetAtTime((1 - out) * 0.45 * keep, t, 0.35);
    A.windG.gain.setTargetAtTime(0.009 * out * keep, t, 0.6);
    A.cityG.gain.setTargetAtTime(0.018 * (1 - night * 0.45), t, 1.0);
  }
  ambTick() {
    const A = this.amb; if (!A || this.muted || A.under > 0.95) return;
    const now = this.ctx.currentTime, B = A.bus;
    if (now >= A.nextBird) { // day: sparrows / blackbird phrases / a dove; night: a lonely owl now and then
      A.nextBird = now + (A.night > 0.5 ? 9 + Math.random() * 14 : 1.2 + Math.random() * 3.8);
      const r = Math.random(), v = 0.6 + Math.random() * 0.4;
      if (A.night > 0.5) { if (r < 0.35) { this.tone('sine', 420, 380, 0.45, 0.012 * v, B); this.tone('sine', 400, 360, 0.7, 0.012 * v, B, 0.6); } }
      else if (r < 0.5) { const n = 2 + (Math.random() * 4 | 0), f = 3400 + Math.random() * 1600; for (let i = 0; i < n; i++) this.tone('sine', f * (1 + Math.random() * 0.12), f * 0.72, 0.06, 0.010 * v, B, i * (0.09 + Math.random() * 0.05)); }
      else if (r < 0.85) { const base = 1700 + Math.random() * 700; let w = 0; for (let i = 0; i < 3 + (Math.random() * 3 | 0); i++) { const f0 = base * (0.85 + Math.random() * 0.5), d = 0.08 + Math.random() * 0.12; this.tone('sine', f0, f0 * (0.8 + Math.random() * 0.5), d, 0.009 * v, B, w); w += d + 0.03; } }
      else { for (const w of [0, 0.45, 0.75]) this.tone('sine', 390, 320, 0.3, 0.007 * v, B, w); }
    }
    if (A.night > 0.5 && A.out > 0.05 && now >= A.nextCricket) { // crickets (garden at night)
      A.nextCricket = now + 0.6 + Math.random() * 0.9;
      const f = 4300 + Math.random() * 300; for (let i = 0; i < 3; i++) this.tone('sine', f, 0, 0.025, 0.004, A.outG, i * 0.05);
    }
    if (now >= A.nextCity) { // distant traffic: scooter, car pass, rarely a horn
      A.nextCity = now + 5 + Math.random() * 11;
      const r = Math.random();
      if (r < 0.45) { const s = this.ctx.createOscillator(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain(), d = 3.2 + Math.random() * 1.5, f0 = 85 + Math.random() * 30;
        s.type = 'sawtooth'; s.frequency.setValueAtTime(f0, now); s.frequency.linearRampToValueAtTime(f0 * 1.35, now + d * 0.45); s.frequency.linearRampToValueAtTime(f0 * 0.92, now + d);
        f.type = 'lowpass'; f.frequency.value = 520; g.gain.setValueAtTime(0.0001, now); g.gain.linearRampToValueAtTime(0.006, now + d * 0.45); g.gain.linearRampToValueAtTime(0.0001, now + d);
        s.connect(f); f.connect(g); g.connect(B); s.start(now); s.stop(now + d + 0.05); }
      else if (r < 0.93) this.swell(3 + Math.random() * 2, 0.022, 1.4, 180, 700, B, 0, 0.6, 'lowpass');
      else { this.tone('square', 392, 0, 0.35, 0.004, B); this.tone('square', 330, 0, 0.35, 0.003, B, 0.04); }
    }
    if (now >= A.nextBell) { // a church bell far away (Bologna)
      A.nextBell = now + 90 + Math.random() * 120;
      for (let i = 0; i < 3; i++) { this.tone('sine', 523, 0, 2.6, 0.006, B, i * 1.6); this.tone('sine', 1250, 0, 1.4, 0.0025, B, i * 1.6); this.tone('triangle', 262, 0, 2.2, 0.004, B, i * 1.6); }
    }
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.82 * ((this.vol && this.vol.master) ?? 0.85), this.ctx.currentTime, 0.05); }
  // UI volume sliders (0..1). Music gets its own speaker chain so the sfx slider doesn't touch it.
  setVolumes(v = {}) {
    this.vol = { master: 0.85, music: 0.7, sfx: 0.9, ...(this.vol || {}), ...v };
    if (!this.ctx) return;
    if (!this._mRouted) {
      this.musicGain.disconnect();
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 5200;
      const h = this.ctx.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = 110;
      this.musicOut = this.ctx.createGain(); this.musicOut.gain.value = 0.55;
      this.musicGain.connect(f); f.connect(h); h.connect(this.musicOut); this.musicOut.connect(this.master); this._mRouted = true;
    }
    const t = this.ctx.currentTime, V = this.vol;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.82 * V.master, t, 0.05);
    this.musicOut.gain.setTargetAtTime(0.786 * V.music, t, 0.05);
    this.cabGain.gain.setTargetAtTime(0.611 * V.sfx, t, 0.05);
    this.room.gain.setTargetAtTime(1.0 * V.sfx, t, 0.05);
  }
  setHum(v) { if (!this.humG || Math.abs(v - (this._hum ?? -1)) < 0.01) return; this._hum = v; this.humG.gain.setTargetAtTime(v * 0.012, this.ctx.currentTime, 0.2); } // called every frame: only touch the param on change

  tone(type, f0, f1, dur, vol, dest = this.cab, when = 0) {
    if (!this.ctx) return; const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, vol, f0 = 3000, f1 = 200, dest = this.cab, when = 0, q = 0.7, type = 'lowpass') {
    if (!this.ctx) return; const t = this.ctx.currentTime + when;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.playbackRate.value = 1;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  // noise with attack/release envelope (surf, spray, rustle)
  swell(dur, peak, attack, f0, f1, dest = this.room, when = 0, q = 0.7, type = 'lowpass') {
    if (!this.ctx) return; const t = this.ctx.currentTime + when;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.linearRampToValueAtTime(f1, t + attack); f.frequency.linearRampToValueAtTime(f0, t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + attack); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  sfx(name, v = 1) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'shoot': this.tone('square', 1400, 500, 0.06, 0.05); break;
      case 'hit': this.tone('square', 300, 150, 0.04, 0.05); break;
      case 'eshot': this.tone('triangle', 900, 400, 0.08, 0.04); break;
      case 'explode': this.noise(0.25 + v * 0.2, 0.22 * Math.min(1.6, v), 2400, 90); this.tone('square', 140, 40, 0.2, 0.06); break;
      case 'bomb': this.noise(2.0, 0.5, 1800, 40); this.tone('sawtooth', 90, 30, 1.6, 0.25); this.noise(2.4, 0.25, 400, 30, this.room, 0.05); break;
      case 'power': [0, 0.06, 0.12, 0.18].forEach((w, i) => this.tone('square', 660 * Math.pow(1.26, i), 0, 0.08, 0.06, this.cab, w)); break;
      case 'life': [0, 0.1, 0.2, 0.3, 0.4].forEach((w, i) => this.tone('square', [523, 659, 784, 1046, 1318][i], 0, 0.12, 0.07, this.cab, w)); break;
      case 'die': this.tone('sawtooth', 600, 60, 0.9, 0.12); this.noise(0.8, 0.3, 2000, 60); break;
      case 'start': [0, 0.08, 0.16].forEach((w, i) => this.tone('square', [880, 1175, 1760][i], 0, 0.12, 0.08, this.cab, w)); break;
      case 'coin': this.tone('square', 988, 0, 0.07, 0.08); this.tone('square', 1319, 0, 0.35, 0.08, this.cab, 0.07); break;
      case 'warning': for (let i = 0; i < 4; i++) { this.tone('square', 880, 440, 0.25, 0.07, this.cab, i * 0.6); this.tone('square', 440, 880, 0.25, 0.07, this.cab, i * 0.6 + 0.3); } break;
      case 'missile': this.noise(0.4, 0.08, 600, 3000, this.cab, 0, 4, 'bandpass'); break;
      case 'bossdie': for (let i = 0; i < 8; i++) this.noise(0.5, 0.2, 2000, 80, this.cab, i * 0.3); break;
      case 'clear': [0, 0.12, 0.24, 0.36, 0.6].forEach((w, i) => this.tone('square', [523, 659, 784, 1046, 784][i], 0, 0.2, 0.08, this.cab, w)); break;
      case 'gameover': [0, 0.3, 0.6, 0.9].forEach((w, i) => this.tone('triangle', [392, 330, 262, 196][i], 0, 0.35, 0.14, this.cab, w)); break;
      case 'step': this.noise(0.09, 0.08 * v, 900, 120, this.room, 0, 0.8); this.tone('sine', 90, 50, 0.07, 0.05 * v, this.room); break;
      // surface footsteps (v = loudness 0..1.2): tile/stone = hard heel click, wood = hollow knock, grass = soft swish
      case 'step_tile': { const p = 0.85 + Math.random() * 0.3; this.noise(0.05, 0.11 * v, 3800 * p, 900, this.room, 0, 1.2, 'bandpass'); this.tone('sine', 120 * p, 60, 0.06, 0.05 * v, this.room); this.noise(0.08, 0.04 * v, 1600, 300, this.room, 0.035, 0.8); break; }
      case 'step_wood': { const p = 0.85 + Math.random() * 0.3; this.tone('triangle', 170 * p, 90, 0.09, 0.09 * v, this.room); this.noise(0.07, 0.07 * v, 1400 * p, 250, this.room, 0, 1.5, 'bandpass'); break; }
      case 'step_grass': { const p = 0.8 + Math.random() * 0.4; this.noise(0.16, 0.07 * v, 5200 * p, 1800, this.room, 0, 0.6, 'highpass'); this.noise(0.12, 0.05 * v, 700, 200, this.room, 0.02, 0.7); break; }
      case 'step_stone': { const p = 0.85 + Math.random() * 0.3; this.noise(0.06, 0.12 * v, 2600 * p, 700, this.room, 0, 1.4, 'bandpass'); this.tone('sine', 95 * p, 50, 0.08, 0.06 * v, this.room); this.noise(0.25, 0.018 * v, 1800, 900, this.room, 0.05, 2, 'bandpass'); break; }
      // entrance: keys in the lock, the door closing behind him, the dog's tags while it trots over
      case 'keys': for (let i = 0; i < 7; i++) { const w = i * 0.045 + Math.random() * 0.03, f = 3200 + Math.random() * 2600; this.tone('sine', f, f * 0.97, 0.12, 0.018 * v, this.room, w); this.tone('triangle', f * 1.5, 0, 0.05, 0.006 * v, this.room, w); } this.noise(0.05, 0.05 * v, 2400, 900, this.room, 0.32, 2, 'bandpass'); break;
      case 'door': this.noise(0.03, 0.2 * v, 3200, 1500, this.room, 0, 2, 'bandpass'); this.swell(0.5, 0.04 * v, 0.2, 400, 900, this.room, 0, 1, 'lowpass'); this.tone('sine', 95, 45, 0.28, 0.22 * v, this.room, 0.42); this.noise(0.22, 0.16 * v, 700, 90, this.room, 0.42); this.noise(0.025, 0.12 * v, 2800, 1400, this.room, 0.55, 2, 'bandpass'); break;
      case 'tags': for (let i = 0; i < 4; i++) { const f = 4100 + Math.random() * 1400; this.tone('sine', f, 0, 0.07, 0.01 * v, this.room, i * 0.11 + Math.random() * 0.04); } break;
      case 'click': this.noise(0.03, 0.25, 4000, 1500, this.room, 0, 1, 'bandpass'); this.tone('square', 2000, 800, 0.02, 0.05, this.room); break;
      case 'buzz': this.tone('sawtooth', 100, 98, 0.5, 0.03, this.room); this.noise(0.4, 0.04, 6000, 4000, this.room, 0, 2, 'bandpass'); break;
      case 'crt': this.tone('sine', 15000, 15600, 0.6, 0.015, this.room); this.noise(0.25, 0.12, 300, 60, this.room); this.tone('sine', 60, 40, 0.5, 0.15, this.room); break;
      case 'button': this.noise(0.025, 0.12, 3000, 1200, this.room, 0, 1, 'bandpass'); break;
      case 'stick': this.noise(0.02, 0.05, 2000, 900, this.room, 0, 1, 'bandpass'); break;
      case 'woof': this.tone('sawtooth', 520, 260, 0.11, 0.08, this.room); this.noise(0.1, 0.06, 1200, 400, this.room, 0, 2, 'bandpass'); break;
      // ---- 3D room interactions ----
      case 'type': this.noise(0.02, 0.22 * v, 4200, 2200, this.room, 0, 1.5, 'bandpass'); this.tone('sine', 190, 120, 0.035, 0.06 * v, this.room); break;
      case 'ding': this.tone('sine', 1760, 0, 1.3, 0.09, this.room); this.tone('sine', 2637, 0, 0.9, 0.04, this.room); this.tone('sine', 4186, 0, 0.4, 0.015, this.room); break;
      case 'carriage': for (let i = 0; i < 9; i++) this.noise(0.018, 0.12, 3500, 1800, this.room, i * 0.04, 2, 'bandpass'); this.swell(0.45, 0.05, 0.1, 900, 2400, this.room, 0, 1, 'bandpass'); this.tone('square', 220, 160, 0.05, 0.03, this.room, 0.38); break;
      case 'spray': this.swell(1.3 * v, 0.2, 0.06, 5000, 8000, this.room, 0, 0.6, 'highpass'); this.noise(0.08, 0.1, 600, 200, this.room); break;
      case 'sea': for (let k = 0; k < 2; k++) { this.swell(2.3, 0.13, 1.1, 300, 1400, this.room, k * 1.9, 0.5, 'lowpass'); this.swell(2.0, 0.05, 1.2, 2500, 5000, this.room, k * 1.9 + 0.3, 0.6, 'bandpass'); } break;
      case 'switch': this.noise(0.012, 0.3, 5000, 3000, this.room, 0, 2, 'bandpass'); this.tone('square', 1800, 600, 0.015, 0.05, this.room); this.noise(0.01, 0.15, 3000, 2000, this.room, 0.03, 2, 'bandpass'); break;
      case 'coinDrop': [0, 0.07, 0.13, 0.22, 0.3].forEach((w, i) => { this.tone('sine', [2240, 3120, 2650, 3400, 2900][i], 0, 0.18, 0.05 / (1 + i * 0.4), this.room, w); }); this.noise(0.25, 0.05, 6000, 2500, this.room, 0.32, 3, 'bandpass'); this.tone('square', 330, 0, 0.05, 0.03, this.room, 0.5); break;
      case 'pickup': this.tone('sine', 380, 900, 0.12, 0.09, this.room); this.noise(0.06, 0.06, 2500, 900, this.room, 0, 1, 'bandpass'); break;
      case 'pet': this.swell(0.45, 0.06, 0.15, 500, 900, this.room, 0, 0.6); this.swell(0.4, 0.05, 0.15, 500, 900, this.room, 0.45, 0.6); break;
      case 'whoosh': this.swell(0.5, 0.14, 0.22, 300, 2200, this.room, 0, 1.5, 'bandpass'); break;
      case 'bark2': for (const w of [0, 0.2]) { this.tone('sawtooth', 640, 300, 0.1, 0.09, this.room, w); this.tone('square', 900, 420, 0.06, 0.03, this.room, w); this.noise(0.09, 0.07, 1500, 500, this.room, w, 2, 'bandpass'); } break;
      case 'paper': this.swell(0.35, 0.09, 0.05, 1800, 4500, this.room, 0, 0.8, 'highpass'); this.noise(0.05, 0.06, 3000, 1500, this.room, 0.2, 1, 'bandpass'); break;
      case 'dance': [0, 0.1, 0.2, 0.3, 0.45, 0.55].forEach((w, i) => this.tone('square', [659, 784, 988, 1319, 988, 1319][i], 0, 0.1, 0.07, this.cab, w)); break;
      case 'join2': [0, 0.07, 0.14, 0.21].forEach((w, i) => this.tone('square', [523, 784, 1046, 1568][i], 0, 0.1, 0.08, this.cab, w)); this.tone('triangle', 262, 0, 0.3, 0.12, this.cab); break;
      case 'combo': { const b = 600 + Math.min(4, v) * 140; [0, 0.05, 0.1].forEach((w, i) => this.tone('square', b * Math.pow(1.26, i), 0, 0.07, 0.06, this.cab, w)); } break;
      // ---- dog ----
      case 'whistle': this.tone('sine', 1500, 2600, 0.22, 0.07, this.room); this.tone('sine', 2600, 1700, 0.28, 0.07, this.room, 0.24); this.noise(0.45, 0.012, 4000, 3000, this.room, 0, 3, 'bandpass'); break;
      case 'yip': this.tone('sawtooth', 900, 1300, 0.07, 0.06, this.room); this.tone('square', 1200, 700, 0.05, 0.025, this.room, 0.05); break;
      case 'whine': this.tone('sine', 820, 1150, 0.35, 0.05 * v, this.room); this.tone('triangle', 1640, 2100, 0.3, 0.015 * v, this.room); break;
      case 'dogHappy': this.tone('sine', 700, 980, 0.18, 0.04, this.room); this.tone('sine', 980, 760, 0.22, 0.035, this.room, 0.17); this.swell(0.3, 0.03, 0.1, 300, 600, this.room, 0, 0.6); break;
      case 'pant': for (let i = 0; i < 4; i++) this.swell(0.13, 0.05 * v, 0.04, 1400, 2400, this.room, i * 0.2, 1.4, 'bandpass'); break;
      case 'lap': for (let i = 0; i < 6; i++) { this.noise(0.035, 0.08, 2600, 900, this.room, i * 0.22, 2, 'bandpass'); this.tone('sine', 520, 300, 0.03, 0.03, this.room, i * 0.22 + 0.01); } break;
      case 'snore': this.swell(1.1, 0.04, 0.6, 140, 260, this.room, 0, 4, 'bandpass'); break;
      case 'squeak': this.tone('square', 1700, 2300, 0.09, 0.05, this.room); this.tone('square', 2300, 1500, 0.08, 0.04, this.room, 0.09); break;
      case 'ballBounce': this.tone('sine', 180 + 60 * v, 70, 0.08, 0.12 * Math.min(1, v), this.room); this.noise(0.03, 0.06 * Math.min(1, v), 1500, 400, this.room, 0, 1, 'bandpass'); break;
      case 'throw': this.swell(0.28, 0.1, 0.1, 500, 2600, this.room, 0, 1.2, 'bandpass'); break;
      case 'kick': for (let i = 0; i < 5; i++) this.noise(0.04, 0.06, 500, 150, this.room, i * 0.09, 1, 'lowpass'); break;
      case 'scratch': for (let i = 0; i < 4; i++) this.noise(0.05, 0.05, 3800, 2200, this.room, i * 0.07, 1.5, 'bandpass'); break;
      // ---- cronache.js (Corriere n. 281) ----
      case 'coo': for (const w of [0, 0.42, 0.7]) { this.tone('sine', 410, 330, 0.3, 0.06, this.room, w); this.tone('triangle', 205, 170, 0.3, 0.03, this.room, w); } this.swell(0.9, 0.025, 0.4, 260, 420, this.room, 0.1, 3, 'bandpass'); break;
      case 'flutter': for (let i = 0; i < 16; i++) this.noise(0.04, 0.09 * (1 - i / 20), 1700, 600, this.room, i * 0.045, 1.2, 'bandpass'); break;
      case 'meow': { const f = 620 + (v % 5) * 70; this.tone('triangle', f, f * 1.6, 0.14, 0.05, this.room); this.tone('triangle', f * 1.6, f * 0.8, 0.38, 0.05, this.room, 0.13); this.tone('sawtooth', f * 0.5, f * 0.42, 0.45, 0.012, this.room, 0.05); break; }
      case 'boo': for (let i = 0; i < 5; i++) this.tone('sawtooth', 150 + i * 13, 128 + i * 9, 1.4, 0.016, this.room, i * 0.04); this.swell(1.6, 0.12, 0.35, 280, 520, this.room, 0, 2, 'bandpass'); break;
      case 'mystic': [0, 0.14, 0.28, 0.42, 0.62].forEach((w, i) => this.tone('sine', [523, 659, 784, 1047, 1568][i], 0, 1.4, 0.035, this.room, w)); this.swell(2.2, 0.04, 0.9, 3000, 7000, this.room, 0, 4, 'bandpass'); break;
      case 'radio': this.noise(0.55, 0.12, 900, 3200, this.room, 0, 2, 'bandpass'); this.tone('sine', 1900, 700, 0.45, 0.025, this.room); [0, 0.16, 0.32].forEach((w, i) => this.tone('sine', [784, 988, 1175][i], 0, 0.5, 0.05, this.room, 0.6 + w)); break;
      case 'partyhorn': this.noise(0.12, 0.08, 1400, 600, this.room, 0, 1); this.tone('sawtooth', 300, 390, 0.75, 0.05, this.room, 0.04); this.tone('square', 600, 760, 0.75, 0.015, this.room, 0.04); this.tone('sawtooth', 390, 330, 0.25, 0.04, this.room, 0.78); break;
      case 'refwhistle': for (let i = 0; i < 9; i++) this.tone('sine', i % 2 ? 2900 : 3200, 0, 0.06, 0.06, this.room, i * 0.055); this.tone('sine', 3000, 3050, 0.6, 0.06, this.room, 0.55); break;
      case 'goal': this.swell(2.2, 0.2, 0.35, 700, 2200, this.room, 0, 0.9, 'bandpass'); this.swell(2.0, 0.08, 0.5, 300, 700, this.room, 0.1, 1.5, 'bandpass'); [0, 0.18, 0.36].forEach((w, i) => this.tone('square', [523, 659, 784][i], 0, 0.3, 0.03, this.room, 0.2 + w)); break;
      case 'cardscratch': this.noise(0.07, 0.06, 6500, 3500, this.room, 0, 1.4, 'bandpass'); break;
      case 'unwrap': for (let i = 0; i < 7; i++) this.noise(0.06 + Math.random() * 0.05, 0.1, 5200, 2200, this.room, i * 0.08 + Math.random() * 0.04, 1.2, 'bandpass'); break;
      case 'accordion': { // musette waltz phrase (v = phrase index), 4 bars of 3/4 at 200 bpm
        const ctx = this.ctx, T0 = ctx.currentTime + 0.05, B = 0.3, m2f = m => 440 * Math.pow(2, (m - 69) / 12);
        const reed = (m, t, d, vol) => {
          const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600; f.Q.value = 0.8;
          const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.03); g.gain.setValueAtTime(vol, t + d - 0.05); g.gain.linearRampToValueAtTime(0.0001, t + d);
          for (const c of [-7, 0, 7]) { const o = ctx.createOscillator(); o.type = c ? 'sawtooth' : 'square'; o.frequency.value = m2f(m); o.detune.value = c; o.connect(f); o.start(t); o.stop(t + d + 0.02); }
          f.connect(g); g.connect(this.room);
        };
        const MEL = [
          [[0, 76, 3], [3, 79, 1], [4, 77, 1], [5, 76, 1], [6, 74, 3], [9, 67, 3]],
          [[0, 74, 1], [1, 76, 1], [2, 77, 1], [3, 79, 2], [5, 77, 1], [6, 76, 2], [8, 74, 1], [9, 72, 3]],
          [[0, 72, 1], [1, 76, 1], [2, 79, 1], [3, 84, 3], [6, 83, 1], [7, 81, 1], [8, 79, 1], [9, 77, 2], [11, 76, 1]],
          [[0, 74, 2], [2, 77, 1], [3, 76, 1], [4, 74, 1], [5, 71, 1], [6, 72, 6]],
        ][v % 4];
        const CH = [[48, 52, 55, 60], [43, 50, 53, 59], [43, 50, 53, 59], [48, 52, 55, 60]];
        const CH2 = [[48, 52, 55, 60], [41, 53, 57, 60], [43, 50, 53, 59], [48, 52, 55, 60]];
        for (const [b, m, d] of MEL) reed(m, T0 + b * B, d * B - 0.02, 0.022);
        (v % 2 ? CH2 : CH).forEach(([r, a, b2, c], bar) => {
          const t = T0 + bar * 3 * B; reed(r, t, B * 0.8, 0.03);
          for (const k of [1, 2]) for (const m of [a, b2, c]) reed(m, t + k * B, B * 0.45, 0.009);
        });
        break;
      }
      case 'beat': { // ~10 s boom-bap at 92 bpm for B. Piddy's freestyle
        const ctx = this.ctx, b8 = 60 / 92 / 2;
        for (let e = 0; e < 32; e++) {
          const w = 0.05 + e * b8, s = e % 8;
          this.noise(0.035, s % 2 ? 0.025 : 0.04, 9000, 7000, this.room, w, 0.8, 'highpass');
          if (s === 0 || s === 5 || (s === 3 && e % 16 > 8)) { this.tone('sine', 130, 42, 0.3, 0.28, this.room, w); this.noise(0.02, 0.1, 1500, 400, this.room, w); }
          if (s === 2 || s === 6) { this.noise(0.17, 0.22, 2600, 900, this.room, w, 0.9, 'bandpass'); this.tone('triangle', 200, 150, 0.09, 0.06, this.room, w); }
        }
        [36, 36, 39, 34].forEach((m, i) => { const f = 440 * Math.pow(2, (m - 69) / 12); for (const k of [0, 2]) this.tone('sine', f, f * 0.98, b8 * 3.6, 0.07, this.room, 0.05 + (i * 8 + k * 2.5) * b8); });
        void ctx; break;
      }
      // ---- easter eggs (eggs.js) ----
      case 'secret': [0, 0.09, 0.18, 0.3].forEach((w, i) => this.tone('sine', [988, 1319, 1760, 2637][i], 0, 0.35, 0.05, this.room, w)); break;
      case 'hiccup': this.tone('sine', 320, 980, 0.06, 0.12, this.room); this.noise(0.04, 0.08, 2200, 900, this.room, 0, 2, 'bandpass'); break;
      case 'creak': this.tone('sawtooth', 70, 125, 1.1, 0.04, this.room); this.swell(1.2, 0.05, 0.5, 400, 900, this.room, 0, 6, 'bandpass'); this.noise(0.2, 0.12, 300, 80, this.room, 1.05); break;
      case 'punch': this.noise(0.14, 0.55, 1400, 70, this.room); this.tone('sine', 130, 38, 0.22, 0.32, this.room); break;
      case 'yawn': this.swell(1.6, 0.05, 0.6, 280, 650, this.room, 0, 3, 'bandpass'); this.tone('sine', 240, 150, 1.3, 0.035, this.room); break;
      case 'splash': this.noise(0.7, 0.32, 3200, 350, this.room); this.swell(1.0, 0.08, 0.15, 900, 2600, this.room, 0.1, 0.8, 'highpass'); break;
      case 'dig': for (let i = 0; i < 4; i++) this.noise(0.09, 0.14, 900, 160, this.room, i * 0.16, 1, 'lowpass'); break;
      case 'gulp': this.tone('sine', 280, 110, 0.13, 0.13, this.room); this.tone('sine', 260, 100, 0.12, 0.1, this.room, 0.22); break;
      case 'tvzap': this.noise(0.16, 0.16, 7000, 2500, this.room, 0, 0.7, 'highpass'); this.tone('square', 1500, 250, 0.08, 0.03, this.room); break;
      case 'wish': [0, 0.12, 0.24, 0.36, 0.5].forEach((w, i) => this.tone('triangle', [1319, 1568, 1976, 2637, 3136][i], 0, 0.4, 0.04, this.room, w)); break;
      // ---- il Gulag sotto la casa (gulag.js) ----
      case 'gavel': this.noise(0.07, 0.5, 1100, 500, this.room, 0, 3, 'bandpass'); this.tone('sine', 150, 62, 0.16, 0.3, this.room); this.noise(0.25, 0.05, 700, 200, this.room, 0.05, 1, 'lowpass'); break;
      case 'clank': this.tone('square', 1240, 910, 0.18, 0.035, this.room); this.tone('triangle', 2480, 1900, 0.3, 0.03, this.room); this.noise(0.09, 0.22, 4200, 1600, this.room, 0, 2.5, 'bandpass'); break;
      case 'drip': this.tone('sine', 1500 + Math.random() * 500, 600, 0.09, 0.05, this.room); this.tone('sine', 2200, 900, 0.05, 0.015, this.room, 0.32); break;
      case 'onair': this.tone('sine', 1000, 0, 0.5, 0.07, this.room); this.tone('sine', 1000, 0, 0.12, 0.05, this.room, 0.62); break;
      case 'shiver': for (let i = 0; i < 6; i++) this.noise(0.05, 0.05, 2600, 1400, this.room, i * 0.07, 2, 'bandpass'); this.swell(1.2, 0.09, 0.3, 1600, 5200, this.room, 0, 0.8, 'highpass'); break;
      case 'thud': this.tone('sine', 85, 38, 0.32, 0.32, this.room); this.noise(0.22, 0.2, 500, 80, this.room); break;
      // ---- IL DIRETTORE INCASSA (director.js) ----
      case 'dBell': for (const w of [0, 0.32]) { this.tone('sine', 1180, 0, 1.4, 0.09, this.cab, w); this.tone('sine', 2950, 0, 0.8, 0.035, this.cab, w); this.tone('triangle', 590, 0, 1.2, 0.04, this.cab, w); } break;
      case 'dTell': this.tone('square', 220 + v * 140, 160 + v * 90, 0.07, 0.04, this.cab); if (v >= 3) this.tone('sawtooth', 110, 80, 0.35, 0.05, this.cab, 0.05); break;
      case 'dSwing': this.noise(0.14, 0.12, 900, 2600, this.cab, 0, 2, 'bandpass'); break;
      case 'dWhoosh': this.noise(0.18, 0.1, 2600, 500, this.cab, 0, 1.6, 'bandpass'); this.tone('triangle', 660, 990, 0.08, 0.03, this.cab, 0.05); break;
      case 'dDodge': this.noise(0.05, 0.05, 1800, 900, this.cab, 0, 1.5, 'bandpass'); break;
      case 'dPunch': this.noise(0.12, 0.32 + Math.min(0.3, v * 0.01), 1600, 80, this.cab); this.tone('sine', 150, 42, 0.2, 0.2 + Math.min(0.15, v * 0.006), this.cab); this.tone('square', 90, 50, 0.06, 0.05, this.cab); break;
      case 'dBlock': this.noise(0.06, 0.18, 700, 200, this.cab); this.tone('square', 260, 180, 0.05, 0.05, this.cab); break;
      case 'dPerfect': [0, 0.05, 0.1, 0.15].forEach((w, i) => this.tone('square', [1046, 1319, 1568, 2093][i], 0, 0.09, 0.05, this.cab, w)); break;
      case 'dKiss': this.noise(0.03, 0.18, 5000, 2500, this.cab, 0, 2, 'bandpass'); this.tone('sine', 1300, 2200, 0.08, 0.06, this.cab, 0.02); this.tone('triangle', 660, 990, 0.25, 0.04, this.cab, 0.12); break;
      case 'dEx': [0, 0.12, 0.24].forEach((w, i) => this.tone('triangle', [784, 988, 1319][i], 0, 0.22, 0.05, this.cab, w)); break;
      case 'dTired': for (let i = 0; i < 3; i++) this.swell(0.2, 0.05, 0.05, 900, 1800, this.cab, i * 0.28, 1.2, 'bandpass'); break;
      case 'dFake': this.tone('square', 392, 523, 0.08, 0.05, this.cab); this.tone('square', 523, 392, 0.1, 0.05, this.cab, 0.1); break;
      case 'dCrowd': this.swell(1.6, 0.16, 0.25, 600, 1800, this.cab, 0, 0.7, 'bandpass'); this.swell(1.4, 0.08, 0.3, 2500, 4500, this.cab, 0.1, 0.8, 'bandpass'); break;
      case 'dKO': [0, 0.25, 0.5, 0.75].forEach((w, i) => this.tone('square', [330, 262, 196, 131][i], 0, 0.3, 0.09, this.cab, w)); this.noise(0.5, 0.3, 1200, 60, this.cab); break;
    }
  }
  // ---------- music sequencer ----------
  play(track) { this.track = track; this.step = 0; if (this.ctx) this.nextT = this.ctx.currentTime + 0.05; }
  stop() { this.track = null; }
  tick() {
    if (this.ctx && this.amb && this.ctx.state === 'running') this.ambTick();
    if (!this.ctx || !this.track) return;
    const T = this.track; const spb = 60 / T.bpm / 4;
    while (this.nextT < this.ctx.currentTime + 0.12) {
      const i = this.step % T.len;
      for (const ch of T.ch) {
        const n = ch.notes[i % ch.notes.length]; if (n === null || n === undefined || n === '.') continue;
        const f = 440 * Math.pow(2, (n - 69) / 12);
        if (ch.type === 'noise') this.noise(0.05 + (n > 60 ? 0.12 : 0), ch.vol, n > 60 ? 8000 : 1200, n > 60 ? 3000 : 120, this.musicGain, this.nextT - this.ctx.currentTime, 0.8, n > 60 ? 'highpass' : 'lowpass');
        else this.tone(ch.type, f, ch.slide ? f * 0.98 : 0, spb * (ch.len || 0.9), ch.vol, this.musicGain, this.nextT - this.ctx.currentTime);
      }
      this.nextT += spb; this.step++;
    }
  }
}

// note helpers
const N = s => s.split(' ').map(x => x === '.' ? null : +x);
function arp(roots, pattern, len = 4) { const o = []; for (const r of roots) for (let k = 0; k < len; k++) o.push(r + pattern[k % pattern.length]); return o; }
export const TRACKS = {
  director: { // IL DIRETTORE INCASSA: punchy boxing loop
    bpm: 132, len: 32, ch: [
      { type: 'sawtooth', vol: 0.032, len: 0.5, notes: N('62 . 62 65 . 62 67 . 62 . 62 65 . 69 67 65 60 . 60 63 . 60 65 . 60 . 60 63 . 67 65 63') },
      { type: 'triangle', vol: 0.2, len: 0.6, notes: N('38 . 38 . 50 . 38 . 38 . 38 . 50 . 41 43 36 . 36 . 48 . 36 . 36 . 36 . 48 . 39 41') },
      { type: 'noise', vol: 0.07, notes: N('30 . 70 . 50 . 70 30 30 . 70 . 50 . 70 70') },
    ]
  },
  title: {
    bpm: 112, len: 64, ch: [
      { type: 'square', vol: 0.05, notes: arp([57, 57, 53, 53, 48, 48, 55, 55, 57, 57, 53, 53, 50, 50, 52, 52], [12, 19, 24, 19]) },
      { type: 'triangle', vol: 0.16, notes: N('45 . . . 45 . . . 41 . . . 41 . . . 36 . . . 36 . . . 43 . . . 43 . . . 45 . . . 45 . . . 41 . . . 41 . . . 38 . . . 38 . . . 40 . . . 40 . 40 .') },
      { type: 'noise', vol: 0.05, notes: N('30 . 70 . . . 70 . 30 . 70 . . 70 70 .') },
    ]
  },
  game: {
    bpm: 150, len: 64, ch: [
      { type: 'square', vol: 0.045, len: 0.8, notes: N('69 . 72 . 76 . 74 72 . 69 . 67 69 . . . 69 . 72 . 76 . 79 77 . 76 . 74 76 . . . 65 . 69 . 72 . 70 69 . 65 . 64 65 . . . 67 . 71 . 74 . 72 71 . 74 . 76 79 . . .') },
      { type: 'square', vol: 0.025, len: 0.5, notes: arp([57, 57, 57, 57, 53, 53, 55, 55], [0, 7, 12, 7]) },
      { type: 'triangle', vol: 0.2, len: 0.7, notes: N('45 45 57 45 45 57 45 57 45 45 57 45 45 57 45 57 45 45 57 45 45 57 45 57 45 45 57 45 45 57 45 57 41 41 53 41 41 53 41 53 41 41 53 41 41 53 41 53 43 43 55 43 43 55 43 55 43 43 55 43 43 55 43 55') },
      { type: 'noise', vol: 0.07, notes: N('30 . 70 . 50 . 70 . 30 30 70 . 50 . 70 70') },
    ]
  },
  dance: {
    bpm: 124, len: 32, ch: [
      { type: 'square', vol: 0.045, len: 0.55, notes: N('76 . 79 . 83 . 79 76 . 74 . 76 . 79 . . 76 . 79 . 84 . 83 79 . 76 . 74 76 . . .') },
      { type: 'square', vol: 0.022, len: 0.4, notes: arp([64, 64, 60, 62], [0, 7, 12, 16], 8) },
      { type: 'triangle', vol: 0.22, len: 0.5, notes: N('40 . 52 . 40 . 52 . 40 . 52 . 40 . 52 . 36 . 48 . 36 . 48 . 38 . 50 . 38 . 50 .') },
      { type: 'noise', vol: 0.09, notes: N('30 . 70 . 30 . 70 . 30 . 70 . 30 . 70 70') },
    ]
  },
  ending: {
    bpm: 96, len: 64, ch: [
      { type: 'square', vol: 0.05, len: 0.9, notes: N('72 . . . 76 . . . 79 . . . 84 . . . 83 . . . 79 . . . 76 . . . 79 . . . 77 . . . 81 . . . 84 . . . 81 . . . 79 . . . 83 . . . 86 . . . 84 . . .') },
      { type: 'square', vol: 0.02, len: 0.4, notes: arp([60, 60, 65, 67], [0, 4, 7, 12], 16) },
      { type: 'triangle', vol: 0.2, len: 0.9, notes: N('48 . . . 48 . . . 48 . . . 48 . . . 53 . . . 53 . . . 55 . . . 55 . . . 53 . . . 53 . . . 55 . . . 55 . . . 55 . . . 55 . . . 48 . . . 48 . . .') },
      { type: 'noise', vol: 0.04, notes: N('30 . . . 70 . . . 30 . 30 . 70 . . .') },
    ]
  },
  boss: {
    bpm: 168, len: 32, ch: [
      { type: 'sawtooth', vol: 0.035, len: 0.6, notes: N('57 . 60 57 63 . 62 60 57 . 60 57 64 . 63 62 56 . 59 56 62 . 61 59 56 . 59 56 63 . 62 61') },
      { type: 'triangle', vol: 0.22, len: 0.6, notes: N('33 33 45 33 33 45 33 45 33 33 45 33 33 45 33 45 32 32 44 32 32 44 32 44 32 32 44 32 32 44 32 44') },
      { type: 'noise', vol: 0.08, notes: N('30 70 70 70 50 70 70 70 30 70 30 70 50 70 70 50') },
    ]
  },
};
