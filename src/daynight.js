// daynight.js — the shared day/night cycle. One game day = DAY_MS of real time (24 min: dawn 1, day 15, dusk 2,
// night 6), derived from the SERVER clock (window.__net.serverNow, Date.now() offline), so everybody in a room sees the
// same sky. Everything else reads from here (no module keeps its own "night" toggle any more):
//   DN.update()            once per frame (main.js, before level.update); idempotent, others may call it too
//   DN.night               0..1 (sun below the horizon) — fx3d.nightAmount follows it, every old consumer reads that
//   DN.sunDir / moonDir    unit vectors (world, +x east, +z south), DN.elev (sun elevation, degrees)
//   DN.sunK / dayK / moonK light factors; DN.golden / DN.blue (golden hour, blue hour); colours sunCol, hemiSky,
//                          hemiGnd, fog (linear), skySunCol
//   DN.hour (0..24), DN.clock() '21:40', DN.phase 'alba' | 'giorno' | 'tramonto' | 'notte'
//   zombiesOut(n)          the single rule "zombies may walk now" (combat director + zombata use it)
// Debug (local only): window.__daynight = { now(), set(hour|null), speed(k), clear(), clock() }  ·  URL ?hour=21.5
// Lights only change intensity / colour / position here: light counts never change (lightpad.js, gfx.js warm-up).
import * as THREE from 'three';

export const CYCLE_MIN = { dawn: 1, day: 15, dusk: 2, night: 6 }; // real minutes of each phase
export const DAY_MS = (CYCLE_MIN.dawn + CYCLE_MIN.day + CYCLE_MIN.dusk + CYCLE_MIN.night) * 60000;
// game clock keyframes [real minute into the cycle, game hour]: dawn 05:30→07:00, day 07:00→19:00,
// dusk 19:00→21:00, night 21:00→05:30 (the cycle starts at dawn)
const KEYS = [[0, 5.5], [CYCLE_MIN.dawn, 7], [CYCLE_MIN.dawn + CYCLE_MIN.day, 19], [CYCLE_MIN.dawn + CYCLE_MIN.day + CYCLE_MIN.dusk, 21], [DAY_MS / 60000, 29.5]];
// sun: rises 06:15 in the east (+x), noon in the south (+z) at 58°, sets 19:45 in the west (-x)
export const SUN = { rise: 6.25, set: 19.75, maxElev: 58, minElev: 40 };
export const ZOMBIE_NIGHT = 0.5; // nightAmount from which zombies walk (≈ 20:00 → 06:00 game time)
export const zombiesOut = n => n >= ZOMBIE_NIGHT;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, k) => a + (b - a) * k;
const D2R = Math.PI / 180;

// real time -> game hour (0..24)
export function hourAt(ms) {
  const m = ((ms % DAY_MS) + DAY_MS) % DAY_MS / 60000;
  for (let i = 0; i < KEYS.length - 1; i++) {
    const [m0, h0] = KEYS[i], [m1, h1] = KEYS[i + 1];
    if (m <= m1) return (h0 + (h1 - h0) * (m - m0) / (m1 - m0)) % 24;
  }
  return KEYS[0][1];
}
// game hour -> real minute into the cycle (inverse of hourAt)
function minuteOf(h) {
  let x = ((h % 24) + 24) % 24; if (x < KEYS[0][1]) x += 24;
  for (let i = 0; i < KEYS.length - 1; i++) {
    const [m0, h0] = KEYS[i], [m1, h1] = KEYS[i + 1];
    if (x <= h1) return m0 + (m1 - m0) * (x - h0) / (h1 - h0);
  }
  return 0;
}
// sun elevation (degrees) and azimuth (radians, 0 = east, π/2 = south, π = west) for a game hour
export function sunAt(h) {
  const dl = SUN.set - SUN.rise;
  if (h >= SUN.rise && h <= SUN.set) { const u = (h - SUN.rise) / dl; return { elev: SUN.maxElev * Math.sin(Math.PI * u), az: Math.PI * u }; }
  const u = (((h - SUN.set) % 24) + 24) % 24 / (24 - dl); // under the horizon: west -> north -> east
  return { elev: -SUN.minElev * Math.sin(Math.PI * u), az: Math.PI + Math.PI * u };
}
export function clockOf(h, step = 5) {
  let mins = Math.floor((((h % 24) + 24) % 24) * 60 / step) * step;
  mins %= 1440; const hh = Math.floor(mins / 60), mm = mins % 60;
  return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

// colour ramps by sun elevation (degrees); sRGB hex in, linear out
const C = hex => new THREE.Color(hex);
const ramp = stops => stops.map(([e, c]) => [e, typeof c === 'number' ? C(c) : new THREE.Color().setRGB(c[0], c[1], c[2])]);
function sample(stops, e, out) {
  if (e <= stops[0][0]) return out.copy(stops[0][1]);
  for (let i = 0; i < stops.length - 1; i++) { const [e0, c0] = stops[i], [e1, c1] = stops[i + 1]; if (e <= e1) return out.copy(c0).lerp(c1, (e - e0) / (e1 - e0)); }
  return out.copy(stops[stops.length - 1][1]);
}
const SUN_COL = ramp([[-2, 0xff6a30], [2, 0xff8a42], [8, 0xffb070], [16, 0xffcc94], [32, 0xffdab2], [58, 0xffe2c2]]);
const HEMI_SKY = ramp([[-14, 0x4a5a8c], [-6, 0x6878b4], [-1, 0xb08aa0], [4, 0xf0c8a8], [12, 0xeed8c8], [24, 0xdfe5f0]]);
const HEMI_GND = ramp([[-14, 0x2a2630], [-5, 0x3c3038], [2, 0x9a6448], [10, 0xb07a58], [24, 0xb3835f]]);
// fog / sky horizon (linear values, like the old setRGB(0.9, 0.85, 0.79) of world.js)
const FOG = ramp([[-12, [0.1, 0.12, 0.22]], [-6, [0.16, 0.2, 0.38]], [-2, [0.42, 0.36, 0.48]], [1, [0.86, 0.56, 0.4]], [5, [0.96, 0.72, 0.52]], [12, [0.93, 0.82, 0.7]], [22, [0.9, 0.85, 0.79]]]);

const qs = (() => { try { return new URLSearchParams(location.search); } catch (e) { return new URLSearchParams(); } })();
const serverNow = () => { const n = window.__net; return n && n.serverNow ? n.serverNow() : Date.now(); };

export const DN = {
  hour: 12, phase: 'giorno', night: 0, elev: 45, sunK: 1, dayK: 1, moonK: 0, golden: 0, blue: 0, dusk: 0,
  sunDir: new THREE.Vector3(0, 1, 0), moonDir: new THREE.Vector3(0, 1, 0), keyDir: new THREE.Vector3(0, 1, 0),
  sunCol: new THREE.Color(), hemiSky: new THREE.Color(), hemiGnd: new THREE.Color(), fog: new THREE.Color(), skySunCol: new THREE.Color(),
  snap: 0, // bumped by set()/clear(): smoothed consumers jump straight to the new values
  _frame: -1, _ov: null, // debug override { m0 (cycle minute), t0 (performance.now), k (speed) }
  update() {
    const f = (window.__dnFrame | 0); // main.js bumps window.__dnFrame once per frame: repeated calls in a frame are free
    if (f && f === this._frame) return this;
    this._frame = f;
    const ov = this._ov;
    const h = ov ? hourAt((ov.m0 + (performance.now() - ov.t0) / 60000 * ov.k) * 60000) : hourAt(serverNow());
    this.hour = h;
    const s = sunAt(h), E = s.elev; this.elev = E;
    const ce = Math.cos(E * D2R);
    this.sunDir.set(Math.cos(s.az) * ce, Math.sin(E * D2R), Math.sin(s.az) * ce + 0.12).normalize();
    // the key light (sun shadows) never comes from below 6° (it fades out under the horizon anyway)
    const ke = Math.max(E, 6) * D2R, kc = Math.cos(ke); // (≥ 6°: grazing light stretches the shadow-map texels)
    this.keyDir.set(Math.cos(s.az) * kc, Math.sin(ke), Math.sin(s.az) * kc + 0.12).normalize();
    // the moon: opposite the sun, always above the horizon (rises in the east at dusk, south at midnight)
    this.moonDir.set(-this.sunDir.x, Math.max(0.28, -this.sunDir.y * 0.95 + 0.12), -this.sunDir.z * 0.8 + 0.1).normalize();
    this.night = sstep(3, -9, E);
    this.sunK = sstep(-1, 7, E) * mix(0.78, 1, sstep(7, 35, E));
    this.dayK = sstep(-12, 16, E);
    this.moonK = sstep(-3, -12, E);
    this.golden = sstep(22, 5, E) * sstep(-4, 1, E);
    this.blue = sstep(1, -4, E) * sstep(-14, -7, E);
    this.dusk = sstep(14, 2, E) * sstep(-7, -1, E); // warm sky (sunset / sunrise glow)
    sample(SUN_COL, E, this.sunCol); sample(HEMI_SKY, E, this.hemiSky); sample(HEMI_GND, E, this.hemiGnd); sample(FOG, E, this.fog);
    this.skySunCol.copy(this.sunCol).lerp(C(0xfff4e6), sstep(10, 40, E));
    this.phase = h >= 5.5 && h < 7 ? 'alba' : h >= 7 && h < 19 ? 'giorno' : h >= 19 && h < 21 ? 'tramonto' : 'notte';
    return this;
  },
  clock(step = 1) { return clockOf(this.hour, step); },
  icon() { return this.phase === 'notte' ? '🌙' : this.phase === 'tramonto' ? '🌇' : this.phase === 'alba' ? '🌅' : '☀️'; },
  // debug override (local only): freeze at a game hour; speed(k) runs it k× from there
  set(hour) {
    if (hour === null || hour === undefined || hour === false) { this._ov = null; this.snap++; this._frame = -1; return this.update(); }
    this._ov = { m0: minuteOf(+hour), t0: performance.now(), k: this._ov ? this._ov.k : 0 }; this.snap++; this._frame = -1; return this.update();
  },
  speed(k = 1) {
    const m = this._ov ? this._ov.m0 + (performance.now() - this._ov.t0) / 60000 * this._ov.k : minuteOf(this.hour);
    this._ov = { m0: m, t0: performance.now(), k: +k || 0 }; this._frame = -1; return this.update();
  },
};
if (qs.has('hour')) { const h = parseFloat(qs.get('hour')); if (isFinite(h)) DN.set(h); }
DN.update();

// ---------------------------------------------------------------- events: dusk warning, dawn, HUD clock
const EV = { nightWas: null, warned: false, hud: null, last: '', shownT: 0 };
function say(text) {
  try {
    const coarse = document.body.classList.contains('coarse') || matchMedia('(pointer: coarse)').matches;
    const ph = window.__phone;
    if (ph && ph.notify && !coarse) ph.notify(text, 'sys');
    else { const w = window.__app && window.__app.world; if (w && w.toast) w.toast(text); }
  } catch (e) { }
}
function hudEl() {
  if (EV.hud) return EV.hud;
  const st = document.createElement('style');
  st.textContent = `#dnClock{position:fixed;z-index:42;right:max(3.2vw,env(safe-area-inset-right));bottom:calc(2vh + 40px);pointer-events:none;
    font:600 12px/1 var(--ui,system-ui,-apple-system,Segoe UI,Roboto,sans-serif);letter-spacing:.08em;color:rgba(255,255,255,.86);text-shadow:0 1px 4px #000c;
    padding:5px 9px;border-radius:99px;background:rgba(14,12,22,.32);opacity:0;transition:opacity .6s,bottom .3s;font-variant-numeric:tabular-nums}
  #dnClock.on{opacity:1} #dnClock i{font-style:normal;margin-right:6px;font-size:11px}
  #dnClock.night{color:#bcd0ff} #dnClock.dusk{color:#ffcf9a}
  body.coarse #dnClock{right:auto;left:50%;transform:translateX(-50%);bottom:auto;top:max(8px,env(safe-area-inset-top));font-size:11px}
  body.cbArmed:not(.coarse) #dnClock{bottom:calc(max(16px,env(safe-area-inset-bottom)) + 88px)}`;
  document.head.appendChild(st);
  const el = document.createElement('div'); el.id = 'dnClock'; el.innerHTML = '<i></i><span></span>'; document.body.appendChild(el);
  EV.hud = el; return el;
}
// per frame (main.js): HUD clock + dusk / dawn notices. phase = app phase ('world' shows the clock)
export function dayNightFrame(phase) {
  window.__dnFrame = (window.__dnFrame | 0) + 1;
  DN.update();
  const inWorld = phase === 'world';
  try {
    const el = hudEl();
    const wm = window.__app && window.__app.world && window.__app.world.mode;
    el.classList.toggle('on', inWorld && !document.body.dataset.overlay && wm !== 'cabinet' && wm !== 'type' && wm !== 'shell');
    if (inWorld) {
      const s = DN.clock(1);
      if (s !== EV.last) {
        EV.last = s; el.lastChild.textContent = s; el.firstChild.textContent = DN.icon();
        el.classList.toggle('night', DN.phase === 'notte'); el.classList.toggle('dusk', DN.phase === 'tramonto' || DN.phase === 'alba');
      }
    }
  } catch (e) { }
  // dusk warning (first groans come from combat/enemies.js) and dawn
  const n = DN.night, setting = DN.hour > 15 && DN.hour < 21 && DN.elev < 6; // ≈ 19:20: ~40 s before the zombies
  if (EV.nightWas === null) { EV.nightWas = n; EV.warned = setting || n > 0.2; return; }
  if (inWorld) {
    if (!EV.warned && setting) { EV.warned = true; say('🌆 Sta calando la notte: occhio agli zombi'); fire('dusk'); }
    if (EV.nightWas >= ZOMBIE_NIGHT && n < ZOMBIE_NIGHT) { say('🌅 Sorge il sole: gli zombi tornano sottoterra'); fire('dawn'); }
    if (EV.nightWas < ZOMBIE_NIGHT && n >= ZOMBIE_NIGHT) fire('night');
  }
  if (DN.hour > 8 && DN.hour < 15) EV.warned = false;
  EV.nightWas = n;
}
function fire(kind) { try { window.dispatchEvent(new CustomEvent('bigalesso:daynight', { detail: { kind, hour: DN.hour, clock: DN.clock() } })); } catch (e) { } }

window.__daynight = {
  now: () => ({ hour: +DN.hour.toFixed(3), clock: DN.clock(1), phase: DN.phase, night: +DN.night.toFixed(3), elev: +DN.elev.toFixed(1), sunK: +DN.sunK.toFixed(3), zombies: zombiesOut(DN.night), override: !!DN._ov }),
  set: h => { DN.set(h); return window.__daynight.now(); },
  speed: k => { DN.speed(k); return window.__daynight.now(); },
  clear: () => { DN.set(null); return window.__daynight.now(); },
  clock: (step = 1) => DN.clock(step),
  DAY_MS, CYCLE_MIN, ZOMBIE_NIGHT, state: DN,
};
