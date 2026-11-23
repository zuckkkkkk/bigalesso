// GTA-style opening: "BIGALESSO GAMES presenta" over comic panels made from the Corriere illustrations
// (assets/opening, scripts/opening_assets.py): Ken Burns pans, diagonal split screens, a comic grid assembling
// on the beat, a fast montage, the cover-art mosaic and the final sunset logo, all synced to a synth track.
// It plays over the loading (the loader sits underneath and shows only if the load is still running at the end).
// Pure DOM + CSS transforms (compositor only, no WebGL); its own short-lived AudioContext (closed at the end).
//
// playOpening({ ui, skip }) -> { done: Promise<'end'|'skip'|'off'>, replay() -> Promise, skip(), get playing }

const PANELS = ['portici', 'battaglia', 'processo', 'gulag', 'stampa', 'over80', 'cabinato'];
const BPM = 96, BEAT = 60 / BPM, BAR = BEAT * 4, STEP = BEAT / 4; // 0.625 s beat, 2.5 s bar
const T_END = 25.6;
const NO_SPLASH_UA = /Electron/i;

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lin = (t, a, b) => clamp((t - a) / (b - a));
const sm = x => x * x * (3 - 2 * x);
const out3 = x => 1 - Math.pow(1 - x, 3);
const outBack = x => { const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };

export function openingSrc(name) { return src(name); }
function src(name) {
  const E = window.__ASSETS && window.__ASSETS.opening;
  return (E && E['panel-' + name + '.jpg']) || ('./opening/panel-' + name + '.jpg');
}

const CSS = `
#opening{position:fixed;inset:0;z-index:50;background:#000;overflow:hidden;cursor:none;color:#fff;font-family:var(--ui,system-ui);contain:strict}
#opening.fade{transition:opacity .55s ease;opacity:0}
#opening *{box-sizing:border-box}
#opening .L{position:absolute;inset:0;visibility:hidden;will-change:transform,opacity}
#opening .kb{position:absolute;inset:-6%;will-change:transform}
#opening .kb img,#opening .cell img,#opening .slab img{width:100%;height:100%;object-fit:cover;display:block}
#opening .cap{position:absolute;left:7vw;bottom:15vh;max-width:70vw;will-change:transform,opacity}
#opening .cap b{display:block;font:400 clamp(46px,8.2vw,150px)/.86 var(--gta,Impact,sans-serif);letter-spacing:.01em;text-transform:uppercase;color:#fff;
  -webkit-text-stroke:2px #000;paint-order:stroke fill;text-shadow:0 6px 0 rgba(0,0,0,.55)}
#opening .cap i{display:inline-block;margin-top:14px;padding:6px 12px;font:700 clamp(13px,1.35vw,22px)/1.2 var(--ui,system-ui);font-style:normal;letter-spacing:.14em;text-transform:uppercase;background:#000;color:#ffd25a}
#opening .cap.r{left:auto;right:7vw;text-align:right}
#opening .slab{position:absolute;top:0;bottom:0;overflow:hidden;background:#000;will-change:transform}
#opening .slab .in{position:absolute;inset:-4% -10%;will-change:transform}
#opening .slab .cap{bottom:13vh;left:17%;max-width:72%}#opening .slab .cap.r{left:auto;right:17%}#opening .slab .cap b{font-size:clamp(34px,4.6vw,88px)}
#opening .grid3{position:absolute;inset:9vh 3vw;display:grid;grid-template-columns:1.25fr 1fr;grid-template-rows:1fr 1fr;gap:12px}
#opening .cell{position:relative;overflow:hidden;background:#000;outline:5px solid #000;box-shadow:0 0 0 7px #fff;will-change:transform,opacity}
#opening .cell .tag{position:absolute;left:14px;bottom:14px;padding:6px 12px 4px;font:400 clamp(20px,2.4vw,40px)/1 var(--gta,Impact,sans-serif);text-transform:uppercase;background:#ffd25a;color:#111;transform:rotate(-2deg)}
#opening .cell:nth-child(1){grid-row:1/3}
#opening .mosaic{position:absolute;left:50%;top:50%;width:150vw;height:150vh;margin:-75vh 0 0 -75vw;display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:repeat(3,1fr);gap:14px;padding:14px;background:#fff;will-change:transform}
#opening .mosaic .cell{outline:4px solid #000;box-shadow:none}
#opening .logo{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);text-align:center;will-change:transform,opacity}
#opening .logo b{display:block;font:400 clamp(70px,14vw,250px)/.82 var(--gta,Impact,sans-serif);letter-spacing:.005em;
  background:linear-gradient(100deg,#ff3d7f 8%,#ff7a3c 45%,#ffd25a 78%,#fff2b0);-webkit-background-clip:text;background-clip:text;color:transparent;
  filter:drop-shadow(0 8px 0 #2a0640)}
#opening .logo span{display:block;margin-top:2.2vh;font:700 clamp(16px,2.2vw,38px)/1 var(--ui,system-ui);letter-spacing:.9em;padding-left:.9em;color:#fff;text-shadow:0 2px 10px #000}
#opening .logo em{display:block;margin-top:3.4vh;font:600 clamp(12px,1.1vw,17px)/1 var(--ui,system-ui);font-style:normal;letter-spacing:.32em;text-transform:uppercase;color:#ffd9b0;opacity:.9}
#opening .pres{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);text-align:center}
#opening .pres b{display:block;font:400 clamp(34px,4.6vw,78px)/1 var(--gta,Impact,sans-serif);letter-spacing:.12em;color:#fff}
#opening .pres i{display:block;margin-top:16px;font:600 14px/1 var(--ui,system-ui);font-style:normal;letter-spacing:.6em;text-transform:uppercase;color:#bbb}
#opening .streak{position:absolute;left:-30%;top:50%;width:30%;height:2px;margin-top:-1px;background:linear-gradient(90deg,transparent,#fff,transparent);will-change:transform}
#opening .sun{position:absolute;inset:0;background:radial-gradient(70% 60% at 50% 72%,#ffb35a 0%,#ff4f7b 32%,#5a1a6a 64%,#12061f 100%)}
#opening .sunbg{position:absolute;inset:-5%;background-size:cover;background-position:center;opacity:.22}
#opening .ht{position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(rgba(0,0,0,.5) 30%,transparent 32%);background-size:5px 5px;opacity:.14}
#opening .grade{position:absolute;inset:0;pointer-events:none;background:linear-gradient(160deg,rgba(255,80,140,.10),rgba(40,10,80,.04) 50%,rgba(255,170,60,.10))}
#opening .vig{position:absolute;inset:0;pointer-events:none;background:radial-gradient(120% 95% at 50% 50%,transparent 55%,rgba(0,0,0,.65) 100%)}
#opening .bars:before,#opening .bars:after{content:"";position:absolute;left:0;right:0;height:7.5vh;background:#000;z-index:3}
#opening .bars:before{top:0}#opening .bars:after{bottom:0}
#opening .flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:4}
#opening .skip{position:absolute;right:3vw;bottom:2.4vh;z-index:5;font:500 12px/1 var(--ui,system-ui);letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.6);transition:opacity .6s;opacity:0}
#opening .splash{position:absolute;inset:0;display:grid;place-items:center;text-align:center;z-index:6;cursor:pointer;
  background:radial-gradient(90% 70% at 50% 60%,#2a0b3e 0%,#0b0412 70%,#000 100%)}
#opening .splash .logo{position:static;transform:none}
#opening .splash .logo b{font-size:clamp(60px,10vw,170px)}
#opening .splash .press{margin-top:7vh;font:600 15px/1 var(--ui,system-ui);letter-spacing:.5em;text-transform:uppercase;color:#fff;animation:opPulse 1.6s ease-in-out infinite}
#opening .splash .ld{position:absolute;left:50%;bottom:7vh;width:min(320px,50vw);height:2px;margin-left:min(-160px,-25vw);background:rgba(255,255,255,.12)}
#opening .splash .ld i{display:block;height:100%;width:0;background:linear-gradient(90deg,#ff3d7f,#ffd25a);transition:width .3s}
#opening .splash small{position:absolute;left:0;right:0;bottom:4.2vh;font:500 11px/1 var(--ui,system-ui);letter-spacing:.28em;text-transform:uppercase;color:rgba(255,255,255,.42)}
@keyframes opPulse{50%{opacity:.35}}
@media (prefers-reduced-motion:reduce){#opening .splash .press{animation:none}}`;

// ------------------------------------------------------------------ audio
function makeTrack(vol) {
  const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
  let ctx; try { ctx = new C(); } catch (e) { return null; }
  const out = ctx.createGain(); out.gain.value = 0;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
  out.connect(comp); comp.connect(ctx.destination);
  const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); { const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  // small generated reverb
  const rv = ctx.createConvolver(); { const L = Math.floor(ctx.sampleRate * 2.2), b = ctx.createBuffer(2, L, ctx.sampleRate); for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < L; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / L, 3.2); } rv.buffer = b; }
  const rvG = ctx.createGain(); rvG.gain.value = 0.32; rv.connect(rvG); rvG.connect(out);
  const dry = ctx.createGain(); dry.gain.value = 1; dry.connect(out);
  const bus = ctx.createGain(); bus.connect(dry); bus.connect(rv);
  const drums = ctx.createGain(); drums.gain.value = 1; drums.connect(dry);
  return { ctx, out, bus, drums, nb, vol };
}

function scheduleTrack(A, t0) {
  const { ctx, bus, drums, nb } = A;
  const at = s => t0 + s;
  const env = (g, t, a, peak, d) => { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
  const osc = (type, f, t, dur, peak, dest, o = {}) => {
    const s = ctx.createOscillator(); s.type = type; s.frequency.setValueAtTime(f, t); if (o.to) s.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide || dur));
    if (o.det) s.detune.value = o.det;
    const g = ctx.createGain(); env(g, t, o.a || 0.005, peak, dur);
    let n = s; if (o.lp) { const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.setValueAtTime(o.lp, t); if (o.lpTo) f2.frequency.exponentialRampToValueAtTime(o.lpTo, t + dur); f2.Q.value = o.q || 0.8; s.connect(f2); n = f2; }
    n.connect(g); g.connect(dest); s.start(t); s.stop(t + (o.a || 0.005) + dur + 0.05);
  };
  const noise = (t, dur, peak, type, f, dest, o = {}) => {
    const s = ctx.createBufferSource(); s.buffer = nb; s.loop = true;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); if (o.to) fl.frequency.exponentialRampToValueAtTime(o.to, t + dur); fl.Q.value = o.q || 0.7;
    const g = ctx.createGain();
    if (o.swell) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + dur); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.05); }
    else env(g, t, o.a || 0.002, peak, dur);
    s.connect(fl); fl.connect(g); g.connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.1);
  };
  const kick = t => { osc('sine', 150, t, 0.42, 0.95, drums, { to: 42, glide: 0.14 }); osc('triangle', 60, t, 0.2, 0.25, drums, { to: 40, glide: 0.1 }); };
  const snare = (t, v = 1) => { noise(t, 0.2, 0.5 * v, 'bandpass', 1900, drums, { q: 0.9 }); osc('triangle', 210, t, 0.12, 0.28 * v, drums, { to: 150 }); noise(t, 0.32, 0.12 * v, 'highpass', 5000, bus); };
  const hat = (t, open) => noise(t, open ? 0.22 : 0.045, open ? 0.09 : 0.07, 'highpass', 8000, drums);
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  // A minor: Am – F – C – G
  const PROG = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], ROOT = [45, 41, 48, 43];
  const LEAD = [[76, 74, 72, 74, 76, 79, 76, 74], [72, 69, 72, 74, 72, 69, 67, 69], [67, 72, 76, 74, 72, 67, 64, 67], [71, 74, 79, 78, 74, 71, 74, 76]];

  // 0 .. 2.5: riser + logo bell
  noise(at(0.05), 2.4, 0.22, 'bandpass', 300, bus, { to: 7000, swell: 1, q: 2.5 });
  osc('sawtooth', hz(33), at(0), 2.5, 0.06, bus, { a: 1.8, lp: 120, lpTo: 900, to: hz(45), glide: 2.4 });
  [81, 88, 93].forEach((m, i) => osc('triangle', hz(m), at(1.2 + i * 0.07), 1.4, 0.06, bus));
  noise(at(1.15), 0.5, 0.08, 'highpass', 3000, bus, { to: 9000 });
  // the drop at 2.5 and the beat until 20
  const impact = t => { kick(t); noise(t, 1.8, 0.28, 'highpass', 3500, bus); osc('sine', 55, t, 1.4, 0.5, drums, { to: 30 }); };
  impact(at(BAR));
  for (let b = 1; b < 8; b++) {
    const bt = at(b * BAR), ci = (b - 1) % 4, ch = PROG[ci];
    for (let s = 0; s < 16; s++) {
      const t = bt + s * STEP;
      if (s === 0 || s === 7 || s === 10) { if (!(b === 1 && s === 0)) kick(t); }
      if (s === 4 || s === 12) snare(t);
      if (s % 2 === 0) hat(t, s === 14);
      if (b === 5 && s >= 12) snare(t, 0.45 + (s - 12) * 0.12); // fill into the montage
      if (b === 7 && s >= 8 && s % 2 === 0) snare(t, 0.4 + (s - 8) * 0.07); // roll into the logo
    }
    // bass: root, octave bounce
    [[0, 0, 0.5], [3, 12, 0.18], [6, 0, 0.3], [10, 0, 0.3], [12, 7, 0.2], [14, 12, 0.15]].forEach(([s, o, d]) => osc('sawtooth', hz(ROOT[ci] - 12 + o), bt + s * STEP, d, 0.2, drums, { lp: 420, q: 4, lpTo: 180 }));
    // pad (ducked on the kick by its slow attack)
    for (const m of ch) for (const det of [-8, 7]) osc('sawtooth', hz(m), bt, BAR - 0.08, 0.022, bus, { a: 0.25, lp: 1300, det });
    // lead hook from bar 3
    if (b >= 3) LEAD[ci].forEach((m, i) => { osc('square', hz(m), bt + i * BEAT / 2, 0.24, 0.045, bus, { lp: 2600, lpTo: 900 }); osc('square', hz(m + 12), bt + i * BEAT / 2, 0.12, 0.012, bus, { det: 6 }); });
    // montage stabs
    if (b === 5) for (let k = 0; k < 4; k++) { osc('sawtooth', hz(PROG[ci][0] + 12), bt + k * BEAT, 0.18, 0.06, bus, { lp: 3000 }); noise(bt + k * BEAT, 0.25, 0.08, 'highpass', 6000, bus); }
  }
  // reverse swell into the logo + final chord
  noise(at(19.0), 1.0, 0.25, 'highpass', 600, bus, { to: 8000, swell: 1 });
  impact(at(20));
  for (const m of [45, 57, 60, 64, 71]) for (const det of [-6, 6]) osc('sawtooth', hz(m), at(20), 5.0, m < 50 ? 0.05 : 0.026, bus, { a: 0.05, lp: 2400, lpTo: 500, det });
  [69, 72, 76, 81, 84, 88].forEach((m, i) => osc('triangle', hz(m), at(20.6 + i * 0.16), 1.6, 0.05, bus));
  // master envelope
  const g = A.out.gain; g.setValueAtTime(0.0001, at(0)); g.linearRampToValueAtTime(0.75 * A.vol, at(0.4)); g.setValueAtTime(0.75 * A.vol, at(23.6)); g.linearRampToValueAtTime(0.0001, at(T_END));
}

// ------------------------------------------------------------------ visuals
function build(root) {
  const el = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; (parent || root).appendChild(e); return e; };
  const img = (parent, name) => { const i = el('img', '', parent); i.alt = ''; i.decoding = 'async'; i.src = src(name); return i; };
  const kb = (parent, name) => { const k = el('div', 'kb', parent); img(k, name); return k; };
  const cap = (parent, big, small, right) => el('div', 'cap' + (right ? ' r' : ''), parent, `<b>${big}</b>${small ? `<i>${small}</i>` : ''}`);
  const V = {};
  // 0: presents
  V.L0 = el('div', 'L', root); V.streak = el('div', 'streak', V.L0); V.pres = el('div', 'pres', V.L0, '<b>BIGALESSO GAMES</b><i>presenta</i>');
  // 1: portici
  V.L1 = el('div', 'L', root); V.k1 = kb(V.L1, 'portici'); V.c1 = cap(V.L1, 'Bologna', 'Sotto i portici non dorme nessuno');
  // 2: split
  V.L2 = el('div', 'L', root);
  V.sA = el('div', 'slab', V.L2); V.sA.style.cssText = 'left:-8%;width:62%;clip-path:polygon(0 0,100% 0,84% 100%,0 100%)';
  V.iA = el('div', 'in', V.sA); img(V.iA, 'battaglia'); V.cA = cap(V.sA, 'Cappelletti Man<br>vs Tortellino Man', 'Lo scontro del secolo');
  V.sB = el('div', 'slab', V.L2); V.sB.style.cssText = 'right:-8%;width:62%;clip-path:polygon(16% 0,100% 0,100% 100%,0 100%)';
  V.iB = el('div', 'in', V.sB); img(V.iB, 'processo'); V.cB = cap(V.sB, 'Il processo', 'La corte si ritira, il giudice no', true);
  V.gut = el('div', '', V.L2); V.gut.style.cssText = 'position:absolute;left:50%;top:-10%;width:14px;height:120%;margin-left:-7px;background:#fff;transform:rotate(9.5deg);box-shadow:0 0 0 5px #000';
  // 3: comic grid
  V.L3 = el('div', 'L', root); V.L3.style.background = '#fff';
  const g3 = el('div', 'grid3', V.L3);
  V.g = [['gulag', 'Gulag Suite'], ['stampa', 'Stampa clandestina'], ['over80', 'Spritz a 2 euro']].map(([n, t]) => { const c = el('div', 'cell', g3); const k = kb(c, n); el('div', 'tag', c, t); return { c, k }; });
  // 4: cabinato
  V.L4 = el('div', 'L', root); V.k4 = kb(V.L4, 'cabinato'); V.c4 = cap(V.L4, 'Inserisci<br>un gettone', 'Il cabinato ti aspetta');
  // 5: montage
  V.L5 = el('div', 'L', root); V.m = ['over80', 'battaglia', 'gulag', 'portici'].map(n => { const k = kb(V.L5, n); k.style.visibility = 'hidden'; return k; });
  // 6: mosaic
  V.L6 = el('div', 'L', root); V.L6.style.background = '#fff';
  V.mo = el('div', 'mosaic', V.L6);
  V.mc = ['battaglia', 'portici', 'processo', 'stampa', 'over80', 'cabinato', 'gulag', 'portici', 'stampa', 'processo', 'battaglia', 'over80'].map(n => { const c = el('div', 'cell', V.mo); img(c, n); return c; });
  // 7: final logo
  V.L7 = el('div', 'L', root); el('div', 'sun', V.L7); V.sb = el('div', 'sunbg', V.L7); V.sb.style.backgroundImage = `url("${src('cabinato')}")`;
  V.logo = el('div', 'logo', V.L7, '<b>BIGALESSO</b><span>GAMES</span><em>Edizione Corriere delle Due Torri</em>');
  // overlays
  el('div', 'grade', root); el('div', 'ht', root); el('div', 'vig', root);
  V.bars = el('div', 'bars', root); V.bars.style.cssText = 'position:absolute;inset:0;pointer-events:none';
  V.flash = el('div', 'flash', root);
  V.skip = el('div', 'skip', root, 'Premi un tasto per saltare');
  return V;
}

function render(V, t) {
  const show = (L, a, b) => { const on = t >= a && t < b; if (L._on !== on) { L._on = on; L.style.visibility = on ? 'visible' : 'hidden'; } return on; };
  const tf = (e, s) => { e.style.transform = s; };
  let flash = 0;
  // 0: presents
  if (show(V.L0, 0, BAR)) {
    tf(V.streak, `translateX(${lin(t, 0.9, 1.6) * 440}%)`); V.streak.style.opacity = 1 - lin(t, 1.45, 1.65);
    V.pres.style.opacity = sm(lin(t, 1.2, 1.8)) * (1 - lin(t, 2.3, 2.5)); tf(V.pres, `translateY(-50%) scale(${1.08 - 0.08 * out3(lin(t, 1.2, 2.5))})`);
    V.pres.lastChild.style.opacity = sm(lin(t, 1.8, 2.2));
  }
  // 1: portici
  if (show(V.L1, BAR, 2 * BAR)) {
    const u = lin(t, BAR, 2 * BAR);
    tf(V.k1, `translate3d(${-2 + u * 3}%,${1 - u * 2}%,0) scale(${1.06 + u * 0.1})`);
    const c = out3(lin(t, BAR + 0.15, BAR + 0.7)); V.c1.style.opacity = c; tf(V.c1, `translateX(${(1 - c) * -60}px)`);
    flash = Math.max(flash, 1 - lin(t, BAR, BAR + 0.35));
  }
  // 2: split screen
  if (show(V.L2, 2 * BAR, 3 * BAR)) {
    const a = out3(lin(t, 2 * BAR, 2 * BAR + 0.45)), b = out3(lin(t, 2 * BAR + BEAT, 2 * BAR + BEAT + 0.45)), u = lin(t, 2 * BAR, 3 * BAR);
    tf(V.sA, `translateX(${(1 - a) * -105}%)`); tf(V.sB, `translateX(${(1 - b) * 105}%)`);
    tf(V.iA, `translate3d(${u * 4}%,0,0) scale(${1.05 + u * 0.06})`); tf(V.iB, `translate3d(${-u * 4}%,0,0) scale(${1.1 - u * 0.05})`);
    V.cA.style.opacity = lin(t, 2 * BAR + 0.3, 2 * BAR + 0.6); V.cB.style.opacity = lin(t, 2 * BAR + BEAT + 0.3, 2 * BAR + BEAT + 0.6);
    V.gut.style.opacity = b;
  }
  // 3: comic grid, one cell per beat
  if (show(V.L3, 3 * BAR, 4 * BAR)) {
    V.g.forEach((o, i) => {
      const s = 3 * BAR + i * BEAT, p = outBack(lin(t, s, s + 0.38)), u = lin(t, s, 4 * BAR);
      o.c.style.opacity = lin(t, s, s + 0.08); tf(o.c, `translateY(${(1 - p) * 40}px) scale(${0.86 + 0.14 * p}) rotate(${(1 - p) * (i % 2 ? 3 : -3)}deg)`);
      tf(o.k, `scale(${1.04 + u * 0.08}) translate3d(${(i - 1) * u * 2}%,0,0)`);
    });
  }
  // 4: cabinato
  if (show(V.L4, 4 * BAR, 5 * BAR)) {
    const u = lin(t, 4 * BAR, 5 * BAR);
    tf(V.k4, `translate3d(${2 - u * 3}%,${-u * 2}%,0) scale(${1.04 + u * 0.14})`);
    const c = out3(lin(t, 4 * BAR + 0.2, 4 * BAR + 0.8)); V.c4.style.opacity = c; tf(V.c4, `translateY(${(1 - c) * 40}px)`);
    flash = Math.max(flash, (1 - lin(t, 4 * BAR, 4 * BAR + 0.3)) * 0.7);
  }
  // 5: montage on the beat
  if (show(V.L5, 5 * BAR, 6 * BAR)) {
    const k = clamp(Math.floor((t - 5 * BAR) / BEAT), 0, 3), lt = (t - 5 * BAR) - k * BEAT;
    V.m.forEach((m, i) => { const on = i === k; if (m._on !== on) { m._on = on; m.style.visibility = on ? 'visible' : 'hidden'; } });
    tf(V.m[k], `scale(${1.22 - 0.12 * out3(clamp(lt / BEAT))}) rotate(${(k % 2 ? 1.5 : -1.5) * (1 - lt / BEAT)}deg)`);
    flash = Math.max(flash, (1 - clamp(lt / 0.12)) * 0.55);
  }
  // 6: cover-art mosaic
  if (show(V.L6, 6 * BAR, 8 * BAR)) {
    const u = lin(t, 6 * BAR, 8 * BAR);
    tf(V.mo, `rotate(-8deg) scale(${1.9 - 0.95 * out3(u)}) translate3d(${-4 + u * 6}%,${3 - u * 4}%,0)`);
    V.mc.forEach((c, i) => { const s = 6 * BAR + (i % 6) * (BEAT / 2) * 0.8; const p = out3(lin(t, s, s + 0.4)); c.style.opacity = p; });
    flash = Math.max(flash, lin(t, 8 * BAR - 0.35, 8 * BAR));
  }
  // 7: logo
  if (show(V.L7, 8 * BAR, T_END + 1)) {
    const u = lin(t, 8 * BAR, T_END);
    flash = Math.max(flash, 1 - lin(t, 8 * BAR, 8 * BAR + 0.6));
    const p = outBack(lin(t, 8 * BAR + 0.15, 8 * BAR + 0.85));
    V.logo.style.opacity = lin(t, 8 * BAR + 0.1, 8 * BAR + 0.3) * (1 - lin(t, T_END - 1.2, T_END - 0.2));
    tf(V.logo, `translateY(-50%) scale(${(0.7 + 0.3 * p) * (1 + u * 0.06)})`);
    V.logo.children[1].style.opacity = lin(t, 8 * BAR + 0.7, 8 * BAR + 1.2);
    V.logo.children[2].style.opacity = lin(t, 8 * BAR + 1.6, 8 * BAR + 2.3);
    tf(V.sb, `scale(${1.05 + u * 0.08})`);
  }
  V.flash.style.opacity = flash.toFixed(3);
  V.skip.style.opacity = t > 1.2 && t < T_END - 2 ? 1 : 0;
}

// ------------------------------------------------------------------ player
export function playOpening(opts = {}) {
  const ui = opts.ui || null;
  const forced = /[?&]opening\b/.test(location.search);
  const autoSkip = !!opts.skip || (navigator.webdriver && !forced);
  const enabled = () => !(ui && ui.settings && ui.settings.opening === false);
  if (!document.getElementById('openingCss')) { const st = document.createElement('style'); st.id = 'openingCss'; st.textContent = CSS; document.head.appendChild(st); }

  let cur = null;
  const log = m => { (window.__openingLog = window.__openingLog || []).push(Math.round(performance.now()) + ' ' + m); };
  const api = {
    get playing() { return !!cur; },
    skip() { if (cur) cur.stop('skip'); },
    replay() { return run(false); },
    done: null,
  };

  function run(splash) {
    if (cur) cur.stop('skip');
    // preload the panels (decode before the first frame they appear in)
    const pre = PANELS.map(n => { const i = new Image(); i.src = src(n); return i.decode ? i.decode().catch(() => { }) : Promise.resolve(); });
    const root = document.createElement('div'); root.id = 'opening'; root.setAttribute('aria-label', 'Intro Bigalesso Games'); document.body.appendChild(root);
    document.body.dataset.opening = '1';
    let resolve; const p = new Promise(r => { resolve = r; });
    let A = null, t0 = 0, raf = 0, started = false, stopped = false, V = null, splashEl = null, ldT = 0;
    const vol = () => { const s = (ui && ui.settings) || {}; return clamp((s.master ?? 0.85) * (0.4 + 0.6 * (s.music ?? 0.7)), 0, 1); };
    // the game's own audio (replay from the menu): silent while the opening plays
    const G = window.__app && window.__app.audio, gMuted = G ? !!G.muted : true;
    function begin(why) {
      if (started || stopped) return; started = true; log('begin ' + (why || ''));
      if (G && !gMuted && G.setMuted) try { G.setMuted(true); } catch (e) { }
      if (splashEl) { splashEl.remove(); splashEl = null; } clearInterval(ldT);
      A = makeTrack(vol());
      V = build(root);
      Promise.race([Promise.all(pre), new Promise(r => setTimeout(r, 1200))]).then(() => {
        if (stopped) return;
        if (A) { try { A.ctx.resume(); } catch (e) { } t0 = A.ctx.currentTime + 0.12; scheduleTrack(A, t0); }
        const p0 = performance.now() + 120;
        const now = () => (A && A.ctx.state === 'running' ? A.ctx.currentTime - t0 : (performance.now() - p0) / 1000);
        const loop = () => {
          if (stopped) return;
          const t = now();
          if (t >= 0) render(V, t);
          if (t >= T_END) { try { window.__save && window.__save.unlock('opening'); } catch (e) { } stop('end'); return; }
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      });
    }
    function stop(why) {
      if (stopped) return; stopped = true; log('stop ' + why); cancelAnimationFrame(raf); clearInterval(ldT);
      removeEventListener('keydown', onKey, true); root.removeEventListener('pointerdown', onPtr);
      if (A) { try { const g = A.out.gain, n = A.ctx.currentTime; g.cancelScheduledValues(n); g.setValueAtTime(g.value, n); g.linearRampToValueAtTime(0.0001, n + 0.45); } catch (e) { } setTimeout(() => { try { A.ctx.close(); } catch (e) { } }, 700); }
      root.classList.add('fade');
      if (G && !gMuted && G.setMuted) setTimeout(() => { try { G.setMuted(false); } catch (e) { } }, 400);
      setTimeout(() => { root.remove(); if (cur === ctl) cur = null; delete document.body.dataset.opening; resolve(why); }, why === 'end' ? 560 : 520);
    }
    const tStart = performance.now();
    function onKey(e) {
      if (e.repeat) return;
      if (/^(Shift|Control|Alt|Meta|CapsLock|Tab)/.test(e.key)) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (!started) begin('key ' + e.code); else if (performance.now() - tStart > 700) stop('skip');
    }
    function onPtr(e) { e.preventDefault(); if (!started) begin('pointer'); else if (performance.now() - tStart > 700) stop('skip'); }
    addEventListener('keydown', onKey, true); root.addEventListener('pointerdown', onPtr);
    const ctl = { stop }; cur = ctl;
    if (splash) {
      splashEl = document.createElement('div'); splashEl.className = 'splash';
      splashEl.innerHTML = '<div><div class="logo"><b>BIGALESSO</b><span>GAMES</span></div><div class="press">Premi un tasto</div></div><div class="ld"><i></i></div><small>Consigliato con l\'audio</small>';
      root.appendChild(splashEl);
      const bar = splashEl.querySelector('.ld i'), lb = document.getElementById('lbar');
      ldT = setInterval(() => { if (lb && bar) bar.style.width = lb.style.width || '0%'; }, 200);
    } else begin('auto');
    return p;
  }

  if (autoSkip || !enabled()) { api.done = Promise.resolve(autoSkip ? 'skip' : 'off'); return api; }
  // the desktop app can start audio without a gesture: no "press a key" card there
  const needGesture = !NO_SPLASH_UA.test(navigator.userAgent) && !(navigator.userActivation && navigator.userActivation.hasBeenActive);
  api.done = run(needGesture);
  return api;
}
