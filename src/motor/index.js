// motor/ — cars in the quartiere (v8): drive your Fiat 500 (tuned at the Officina BIGALESSO MOTORS, Via
// Teletubbylandia) or the friends' parked 500s, races on 3 tracks (motor/race.js + shared/race.mjs, refereed by the
// server online), the Vespa (interact/vespa.js) under the same API.
//
// Controls (mode 'car'): W/↑ gas · S/↓ brake/reverse · A/D steer · Space handbrake (drift) · Shift nitro · F horn ·
//   C camera · R back on the track (races) / straighten up · G Officina or race menu when close · E/Q get out ·
//   Esc pause. Pad: left stick, RT gas, LT brake, A handbrake, X nitro, LB horn, Y reset, B get out.
//   Touch: the stick drives (up = gas, down = brake), FRENO A MANO / NITRO / CLACSON buttons, ESCI.
//
// window.__vehicles = { enter(kind '500'|'vespa') -> Promise<bool>, exit(), current() -> {kind,x,z,yaw,speed,own}|null,
//   on(evt, fn) evt: 'enter'|'exit'|'crash'|'race', setLook(look) (your 500, live), look(), place(x,z,yaw), freeze(bool),
//   openGarage(), openRace(track), tracks }
// Online (net extras + the room's world state, src/worldsync.js): a player driving shows up as a moving 500 (extra 'veh'
//   {kind, id, look}) or riding a Vespa (scooter under his seated avatar); a friend's 500 or a vespa someone else is
//   using is hidden here, and where it was left ('car:<id>', 'vs:<i>') is the same for everybody, late joiners too.
import * as THREE from 'three';
import { createCarFactory, CAR, DEFAULT_LOOK } from './rig.js';
import { step, newState, stats, carBlocked } from './physics.js';
import { createMotorSound } from './sound.js';
import { createSkids } from './skid.js';
import { createGarageUI, loadGarage, saveGarage } from './tuning.js';
import { createRace } from './race.js';
import { TRACKS, trackGeom, pointAt } from '../../shared/race.mjs';
import { INTERIORS } from '../quartiere/layout.js';
import { currentQuality } from '../scene.js';
import { getParticles } from '../particles.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const PI = Math.PI;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapA = a => { while (a > PI) a -= 2 * PI; while (a < -PI) a += 2 * PI; return a; };
const CAR_ZONES = new Set(['Via Teletubbylandia', 'Piazzetta', 'Via Petroni', 'Checkpoint', 'Teletubbylandia', 'Voltone', 'Via Zamboni', 'Piazza Verdi', 'Via Rizzoli', 'Piazza Maggiore']);
// the Officina: shutter on the facade of w3 (x -22..-16, z 20), the bay on the sidewalk in front of it
const OFFICINA = { bay: [-18.1, 21.5, PI / 2], item: [-20.85, 20.95], shutter: [-18.4, 20.03] };
// the friends' 500s you can borrow (session only)
const PARKED = [
  { id: 'forla', name: 'la 500 di Forla', x: 48.6, z: 27.6, yaw: 0, look: { paint: '#b3202a', livery: 1, livery2: '#ffffff', rims: 1, plate: 'FORLA 1' } },
  { id: 'asche', name: 'la 500 di Asche', x: -49.0, z: 14.2, yaw: 0, look: { paint: '#1d4fd6', livery: 2, livery2: '#f2c230', rims: 2, plate: 'SOCCIA' } },
];
const LINES = {
  enter: ['Occhio che la frizione stacca alta', 'Non me la rigare, eh', 'Il pieno lo fai tu', 'Guida come un cristiano'],
  crash: ['Ahahah che coglione', 'Patente trovata nei cereali', 'Ma frena, porca troia!', 'Il muro era lì da prima, eh', 'Assicurazione: auguri'],
  horn: ['Ma suona a tua sorella', 'Che cazzo suoni?', 'Bello il clacson, peccato il pilota'],
};
const rnd = a => a[(Math.random() * a.length) | 0];

const CSS = `
#mtHud{position:fixed;right:max(18px,env(safe-area-inset-right));bottom:max(60px,env(safe-area-inset-bottom));z-index:6;pointer-events:none;display:none;font-family:var(--ui,system-ui);color:#fff;text-align:right}
#mtHud.on{display:block}
#mtHud .spd{font:400 64px/.9 var(--gta,Impact,sans-serif);letter-spacing:.01em;text-shadow:0 3px 14px #000a}
#mtHud .spd small{font:800 13px/1 var(--ui);letter-spacing:.2em;margin-left:6px;opacity:.85}
#mtHud .row{display:flex;gap:10px;justify-content:flex-end;align-items:center;margin-top:6px;font:800 11px/1 var(--ui);letter-spacing:.18em;text-transform:uppercase}
#mtHud .gear{width:26px;height:26px;border-radius:7px;background:rgba(14,6,34,.72);border:1px solid rgba(255,255,255,.2);display:grid;place-items:center;font:400 17px/1 var(--gta,Impact,sans-serif);letter-spacing:0}
#mtHud .nb{width:150px;height:8px;border-radius:4px;background:rgba(255,255,255,.14);overflow:hidden}
#mtHud .nb u{display:block;height:100%;width:100%;background:linear-gradient(90deg,#3cf0ff,#c8f03c);transform-origin:left}
#mtHud .nb.on u{background:linear-gradient(90deg,#ff3df0,#ffd83a)}
#mtHud .rpm{width:190px;height:5px;border-radius:3px;background:rgba(255,255,255,.12);overflow:hidden;margin-left:auto;margin-top:6px}
#mtHud .rpm u{display:block;height:100%;background:#fff;transform-origin:left}
#mtHud .keys{margin-top:8px;font:600 11px/1.5 var(--ui);letter-spacing:.06em;color:rgba(255,255,255,.78);text-shadow:0 1px 3px #000}
#mtHud .keys kbd{border:1px solid rgba(255,255,255,.55);border-radius:4px;padding:1px 5px;font:inherit;margin:0 3px 0 8px}
#mtHud .hint{margin-top:8px;display:none;font:800 13px/1 var(--ui);letter-spacing:.12em;color:#c8f03c;text-transform:uppercase}
#mtHud .hint.on{display:block}
body.touchui #mtHud{bottom:auto;top:max(64px,calc(env(safe-area-inset-top) + 58px));right:max(12px,env(safe-area-inset-right))}
body.touchui #mtHud .spd{font-size:44px} body.touchui #mtHud .keys{display:none}
#mtTouch{position:fixed;right:max(14px,env(safe-area-inset-right));bottom:max(18px,env(safe-area-inset-bottom));z-index:31;display:none;gap:12px;flex-direction:column;align-items:flex-end}
body.touchui[data-mode="car"] #mtTouch,body.touchui[data-mode="vespa"] #mtTouch{display:flex}
body.touchui[data-overlay] #mtTouch{display:none!important}
#mtTouch button{min-width:92px;height:54px;border-radius:16px;border:2px solid rgba(255,255,255,.35);background:rgba(20,8,46,.82);color:#fff;font:900 13px/1 system-ui,sans-serif;letter-spacing:.08em;touch-action:none;-webkit-tap-highlight-color:transparent}
#mtTouch button.on{background:#c8f03c;color:#14082e}
#mtTouch .r{display:flex;gap:12px}
`;

export function installMotor({ scene, level, man, input, ui, audio, camera, S, IA }) {
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const VS = IA && IA.vespa;
  const factory = createCarFactory(scene);
  const sound = createMotorSound(audio);
  const skids = createSkids(scene);
  let G = loadGarage();
  const toast = (m, c) => { try { ui.toast(m, c); } catch (e) { } };
  const listeners = {};
  const emit = (k, d) => { for (const f of listeners[k] || []) try { f(d); } catch (e) { console.warn(e); } };
  const unlock = (id, title, desc, icon) => { try { window.__save && window.__save.unlock && window.__save.unlock(id, { title, desc, icon, cat: 'Motori', group: 'Motori' }); } catch (e) { } };
  const event = (type, text) => { try { window.dispatchEvent(new CustomEvent('bigalesso:event', { detail: { type, text } })); } catch (e) { } };
  // the closest friend within 12 m comments (speech bubble)
  const say = line => { try { const N = window.__npcs; if (!N || !N.active) return; let best = null, bd = 144; const p = man.root.position;
    for (const id of N.active()) { const n = N.get(id); if (!n || !n.root || n.talking) continue; const d = n.root.position.distanceToSquared(p); if (d < bd) { bd = d; best = n; } }
    if (best && best.say) best.say(line, 4); } catch (e) { } };

  // ---------------------------------------------------------------- the cars
  const park = G.park && isFinite(G.park.x) ? G.park : { x: OFFICINA.bay[0], z: OFFICINA.bay[1], yaw: OFFICINA.bay[2] };
  const cars = [{ id: 'mine', name: 'la tua 500', own: true, x: park.x, z: park.z, yaw: park.yaw, look: G.look }, ...PARKED.map(p => ({ ...p, own: false }))];
  for (const c of cars) { c.rig = factory.make(c.look, c.id); c.rig.show(true); c.rig.pose(c.x, c.z, c.yaw, 0, 0, 0, 0.016); c.circles = [{ c: V(), r: 0.78, motor: true, id: 'motor_' + c.id + '_a' }, { c: V(), r: 0.78, motor: true, id: 'motor_' + c.id + '_b' }]; }
  const others = []; for (let i = 0; i < 10; i++) { const r = factory.make(DEFAULT_LOOK, 'other' + i); others.push(r); }
  const remotePool = others.slice(7), racePool = others.slice(0, 7);
  const own = cars[0];

  // ---------------------------------------------------------------- the Officina (shutter + sign) — built at startup
  {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256; const x = c.getContext('2d');
    x.fillStyle = '#8c939b'; x.fillRect(0, 0, 256, 256); for (let i = 0; i < 256; i += 10) { x.fillStyle = i % 20 ? '#7b828a' : '#a4abb3'; x.fillRect(0, i, 256, 5); }
    x.fillStyle = 'rgba(30,30,34,.85)'; x.font = '900 34px Impact,"Arial Narrow",sans-serif'; x.textAlign = 'center'; x.save(); x.translate(128, 150); x.rotate(-0.06); x.fillText('TUNING · NITRO', 0, 0); x.fillText('NEON · CERCHI', 0, 40); x.restore();
    x.fillStyle = '#d42a24'; x.font = '900 22px sans-serif'; x.fillText('SOCCIA CHE MACCHINE', 128, 238);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 2.7), new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, metalness: 0.5 }));
    sh.position.set(OFFICINA.shutter[0], 1.35, OFFICINA.shutter[1]); sh.name = 'motorShutter'; scene.add(sh);
    const c2 = document.createElement('canvas'); c2.width = 512; c2.height = 96; const y = c2.getContext('2d');
    y.fillStyle = '#14082e'; y.fillRect(0, 0, 512, 96); y.strokeStyle = '#c8f03c'; y.lineWidth = 6; y.strokeRect(5, 5, 502, 86);
    y.fillStyle = '#c8f03c'; y.font = '400 50px Impact,"Arial Narrow",sans-serif'; y.textAlign = 'center'; y.textBaseline = 'middle'; y.fillText('BIGALESSO MOTORS', 256, 50);
    const t2 = new THREE.CanvasTexture(c2); t2.colorSpace = THREE.SRGBColorSpace;
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.64), new THREE.MeshStandardMaterial({ map: t2, emissiveMap: t2, emissive: 0xffffff, emissiveIntensity: 0.75, roughness: 0.6 }));
    sg.position.set(OFFICINA.shutter[0], 3.1, OFFICINA.shutter[1] + 0.02); sg.name = 'motorSign'; scene.add(sg);
  }

  // ---------------------------------------------------------------- driving state
  const D = { car: null, S: null, st: stats(G.perf), phase: null, t: 0, frozen: false, camFar: 0, hornT: 0, sayT: 0, driftT: 0, nitroUsed: false, topV: 0, prev: null, from: V(), W: null, H: null };
  const env = {
    blocked(x, z, r) {
      if (!level || !level.isWalkable) return false;
      if (!level.isWalkable(x, z, r)) return true;
      const zn = level.zoneAt ? level.zoneAt(x, z) : null; if (zn && !CAR_ZONES.has(zn)) return true;
      const W = D.W;
      for (const c of (W && W.extraCircles) || []) { if (c.motor && D.car && c.id.startsWith('motor_' + D.car.id + '_')) continue; const dx = x - c.c.x, dz = z - c.c.z, m = c.r + r; if (dx * dx + dz * dz < m * m) return true; }
      const d = window.__app && window.__app.dog; if (d && d.root) { const dx = x - d.root.position.x, dz = z - d.root.position.z; if (dx * dx + dz * dz < 0.45 * 0.45) return true; }
      return false;
    },
    curb(x, z) {
      if (x > -36 && x < 40 && z > 20 && z < 33.6) return z < 22.6 || z > 29.4;
      if (x > 40 && x < 48 && z > 33.6 && z < 78) return x < 42.5 || x > 45.5;
      return false;
    },
  };
  const indoor = (x, z) => Object.values(INTERIORS).some(I => x > I.rect[0] - 0.5 && x < I.rect[2] + 0.5 && z > I.rect[1] - 0.5 && z < I.rect[3] + 0.5);

  function updateCircles(c) {
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    c.circles[0].c.set(c.x + fx * 0.72, 0, c.z + fz * 0.72); c.circles[1].c.set(c.x - fx * 0.72, 0, c.z - fz * 0.72);
  }
  for (const c of cars) updateCircles(c);
  const doorOf = c => V(c.x + Math.cos(c.yaw) * (CAR.halfW + 0.55) + Math.sin(c.yaw) * 0.15, 0, c.z - Math.sin(c.yaw) * (CAR.halfW + 0.55) + Math.cos(c.yaw) * 0.15);

  function setNetLook(on) {
    try { const N = window.__net; if (!N || !N.setExtra) return; if (on && D.car) N.setExtra('veh', { on: 1, kind: '500', id: D.car.own ? 'mine' : D.car.id, look: compact(D.car.rig.look) }); else N.setExtra('veh', null); } catch (e) { }
  }
  const compact = L => ({ paint: L.paint, livery: L.livery | 0, livery2: L.livery2, rims: L.rims | 0, spoiler: L.spoiler | 0, exhaust: L.exhaust | 0, neon: L.neon, plate: String(L.plate || '').slice(0, 8) });

  // get in (after walking to the door, or straight away from code)
  function enterCar(c, W, H) {
    if (D.car) return;
    try { window.__combat && window.__combat.holster && window.__combat.holster(); } catch (e) { }
    D.car = c; D.W = W || D.W; D.H = H || D.H; D.S = newState(c.x, c.z, c.yaw); D.st = stats(c.own ? G.perf : { motore: 1, gomme: 1 }); D.phase = 'in'; D.t = 0; D.from.copy(man.root.position);
    D.driftT = 0; D.topV = 0;
    D.H.setMode('car');
    sound.start(c.own ? (G.look.exhaust | 0) : 0);
    skids.lift();
    unlock('motor_drive', 'Patente B', 'Guida una 500 per il quartiere.', '🚗');
    if (!c.own) { say(rnd(LINES.enter)); event('motor', `ha preso in prestito ${c.name}`); }
    else event('motor', 'è salito sulla sua 500');
    setNetLook(true); emit('enter', { kind: '500', own: c.own, id: c.id });
  }
  function exitCar() {
    const c = D.car; if (!c) return;
    // get out on the driver side, or wherever there is room
    const sides = [[Math.cos(c.yaw), -Math.sin(c.yaw)], [-Math.cos(c.yaw), Math.sin(c.yaw)], [-Math.sin(c.yaw), -Math.cos(c.yaw)], [Math.sin(c.yaw), Math.cos(c.yaw)]];
    let px = c.x + sides[0][0] * 1.4, pz = c.z + sides[0][1] * 1.4;
    for (const [sx, sz] of sides) { const qx = c.x + sx * (CAR.halfW + 0.65), qz = c.z + sz * (CAR.halfW + 0.65); if (level.isWalkable(qx, qz, 0.25)) { px = qx; pz = qz; break; } }
    man.root.position.set(px, 0, pz); man.root.visible = true;
    sound.stop(); skids.lift();
    if (c.own) { G.park = { x: +c.x.toFixed(2), z: +c.z.toFixed(2), yaw: +c.yaw.toFixed(3) }; saveGarage(G); }
    else try { const N = window.__net; c._nwT = performance.now(); N && N.online && N.wset && N.wset('car:' + c.id, { x: +c.x.toFixed(2), z: +c.z.toFixed(2), yaw: +c.yaw.toFixed(3) }); } catch (e) { } // online: left here for everybody
    D.car = null; D.S = null; D.phase = null;
    updateCircles(c); c.rig.pose(c.x, c.z, c.yaw, 0, 0, 0, 0.016);
    setNetLook(false); emit('exit', { kind: '500', id: c.id });
    if (D.H) D.H.setMode('explore');
  }
  function placeCar(c, x, z, yaw) { c.x = x; c.z = z; c.yaw = yaw; if (D.car === c && D.S) { D.S.x = x; D.S.z = z; D.S.yaw = yaw; D.S.vx = D.S.vz = 0; D.S.yawRate = 0; } updateCircles(c); c.rig.pose(x, z, yaw, 0, 0, 0, 0.016); skids.lift(); }

  // ---------------------------------------------------------------- per frame in 'car' mode (explore plugin)
  const keysHint = '<kbd>W</kbd>gas<kbd>S</kbd>freno<kbd>Spazio</kbd>derapa<kbd>Shift</kbd>nitro<kbd>E</kbd>scendi';
  const hud = document.createElement('div'); hud.id = 'mtHud';
  hud.innerHTML = `<div class="spd"><b>0</b><small>KM/H</small></div><div class="row"><span>Nitro</span><span class="nb"><u></u></span><span class="gear">1</span></div><div class="rpm"><u></u></div><div class="hint"></div><div class="keys">${keysHint}</div>`;
  document.body.appendChild(hud);
  const hb = { spd: hud.querySelector('.spd b'), nb: hud.querySelector('.nb'), nu: hud.querySelector('.nb u'), gear: hud.querySelector('.gear'), rpm: hud.querySelector('.rpm u'), hint: hud.querySelector('.hint') };
  let lastSpd = -1, hintTxt = '';
  function hudShow(on) { hud.classList.toggle('on', !!on); }
  const hc = { n: -1, r: -1, on: null, hn: null, g: null };
  function hudSet(kmh, nitro, nitroOn, gear, rpm, hasNitro) {
    const k = Math.round(kmh); if (k !== lastSpd) { lastSpd = k; hb.spd.textContent = String(k); }
    const n = hasNitro ? Math.round(nitro * 50) : 0, r = Math.round(clamp(rpm, 0, 1) * 50), on = !!nitroOn, g = gear < 0 ? -1 : gear | 0, hn = !!hasNitro;
    if (n !== hc.n) { hc.n = n; hb.nu.style.transform = `scaleX(${n / 50})`; }
    if (r !== hc.r) { hc.r = r; hb.rpm.style.transform = `scaleX(${r / 50})`; }
    if (on !== hc.on) { hc.on = on; hb.nb.classList.toggle('on', on); }
    if (hn !== hc.hn) { hc.hn = hn; hb.nb.parentElement.style.opacity = hn ? '1' : '0.35'; }
    if (g !== hc.g) { hc.g = g; hb.gear.textContent = g < 0 ? 'R' : String(g); }
  }
  function setHint(t) { if (t === hintTxt) return; hintTxt = t; hb.hint.textContent = t; hb.hint.classList.toggle('on', !!t); }

  // touch buttons (car + vespa)
  const tbar = document.createElement('div'); tbar.id = 'mtTouch';
  tbar.innerHTML = '<div class="r"><button data-k="horn">CLACSON</button><button data-k="nitro">NITRO</button></div><div class="r"><button data-k="hand">FRENO A MANO</button></div>';
  document.body.appendChild(tbar);
  tbar.addEventListener('pointerdown', e => { const b = e.target.closest('button'); if (!b) return; e.preventDefault(); e.stopPropagation(); b.classList.add('on'); input.touch.btn[b.dataset.k] = true; input.touch.edge.add(b.dataset.k); try { b.setPointerCapture(e.pointerId); } catch (x) { } });
  const tUp = e => { const b = e.target.closest('button'); if (!b) return; b.classList.remove('on'); input.touch.btn[b.dataset.k] = false; };
  tbar.addEventListener('pointerup', tUp); tbar.addEventListener('pointercancel', tUp);

  function nearStart() {
    if (!D.car && !(VS && VS.riding)) return null;
    const p = D.car ? D.S : VS.info(); if (!p) return null;
    for (const b of race.boardItems) { const T = TRACKS[b.id]; const g = T.grid[0]; if (Math.hypot(p.x - g[0], p.z - g[1]) < 9 || Math.hypot(p.x - b.anchor.x, p.z - b.anchor.z) < 6) return b.id; }
    return null;
  }
  const nearOfficina = () => D.car && D.car.own && Math.hypot(D.S.x - OFFICINA.bay[0], D.S.z - OFFICINA.bay[1]) < 6;

  function updateCar(W, H, dt, I) {
    const c = D.car, S0 = D.S; if (!c || !S0) { H.setMode('explore'); return {}; }
    D.W = W; D.H = H; W.focus = null; W.vel && W.vel.set(0, 0, 0);
    D.t += dt;
    if (D.phase === 'in') { man.root.position.lerpVectors(D.from, V(c.x, 0, c.z), Math.min(1, D.t / 0.35)); if (D.t > 0.35) { D.phase = 'drive'; man.root.visible = false; } }
    // ---- input
    let thr = 0, brk = 0, st = 0;
    if (I.k('KeyW') || I.k('ArrowUp')) thr = 1; if (I.k('KeyS') || I.k('ArrowDown')) brk = 1;
    if (I.k('KeyA') || I.k('ArrowLeft')) st += 1; if (I.k('KeyD') || I.k('ArrowRight')) st -= 1;
    const P = I.pads && I.pads[0];
    if (P) { st -= P.axes[0] || 0; if (I.padHeld(0, 7)) thr = 1; if (I.padHeld(0, 6)) brk = 1; if ((P.axes[1] || 0) < -0.3) thr = Math.max(thr, -(P.axes[1])); }
    if (I.touch && I.touch.active) { st -= I.touch.x; if (I.touch.y < -0.15) thr = Math.max(thr, clamp(-I.touch.y * 1.4, 0, 1)); if (I.touch.y > 0.25) brk = Math.max(brk, clamp(I.touch.y * 1.4, 0, 1)); }
    const hand = I.k('Space') || (P && I.padHeld(0, 0)) || I.tHeld('hand');
    const nitro = I.k('ShiftLeft') || I.k('ShiftRight') || (P && (I.padHeld(0, 2) || I.padHeld(0, 5))) || I.tHeld('nitro');
    if (D.frozen || D.phase !== 'drive') { thr = 0; brk = D.frozen ? 1 : 0; st = 0; }
    const inp = { thr, brk, steer: clamp(st, -1, 1), hand: !!hand && !D.frozen, nitro: !!nitro && !D.frozen };
    // ---- physics (2 sub-steps at low frame rates)
    const n = dt > 0.034 ? 2 : 1;
    for (let i = 0; i < n; i++) step(S0, inp, D.st, dt / n, env);
    if (D.frozen) { S0.vx = S0.vz = 0; S0.yawRate = 0; }
    c.x = S0.x; c.z = S0.z; c.yaw = S0.yaw;
    if (indoor(c.x, c.z)) { /* never: blocked by env */ }
    const v = Math.hypot(S0.vx, S0.vz), kmh = v * 3.6;
    c.rig.pose(c.x, c.z, c.yaw, S0.fwd, S0.acc, S0.yawRate, dt, S0.bump);
    man.root.position.set(c.x, 0, c.z); W.yaw = c.yaw;
    // ---- skids, sound, HUD
    const sliding = S0.slip > 2.4 || (inp.hand && v > 4) || (brk && S0.fwd > 9);
    if (sliding && skidQ) for (let w = 0; w < 2; w++) { const sx = w ? 1 : -1; skids.mark(w, c.x + Math.cos(c.yaw) * sx * CAR.wheelX - Math.sin(c.yaw) * CAR.wheelZ, c.z - Math.sin(c.yaw) * sx * CAR.wheelX - Math.cos(c.yaw) * CAR.wheelZ); }
    else skids.lift();
    { const PX = getParticles(); if (PX) carFx(PX, c, S0, thr, sliding, dt); } // particles.js: exhaust, nitro flames, tyre smoke, dust, crash sparks
    sound.set(S0.rpm, thr, S0.slip, S0.nitroOn);
    hudShow(true); hudSet(kmh, S0.nitro, S0.nitroOn, S0.gear, S0.rpm, D.st.nitroTank > 0);
    // ---- achievements / comments
    if (S0.drift > 0.6 && v > 6) { D.driftT += dt; if (D.driftT > 3) unlock('motor_drift', 'Derapata in Petroni', 'Tieni una derapata per 3 secondi.', '💨'); } else D.driftT = 0;
    if (S0.nitroOn && !D.nitroUsed) { D.nitroUsed = true; unlock('motor_nitro', 'Nitro!', 'Usa il nitro.', '🔥'); }
    if (kmh > 100) unlock('motor_100', 'Cento all\'ora', 'Supera i 100 km/h nel quartiere.', '💯');
    D.sayT = Math.max(0, D.sayT - dt);
    if (S0.hit > 6) {
      sound.sfx('crash', S0.hit / 12); try { window.__app && window.__app.S && (window.__app.S.shake = Math.max(window.__app.S.shake || 0, Math.min(0.08, S0.hit * 0.006))); } catch (e) { }
      if (S0.hit > 11) { unlock('motor_crash', 'Patente nei cereali', 'Vai a sbattere a più di 40 km/h.', '💥'); event('motor', 'si è schiantato con la 500'); }
      if (D.sayT <= 0) { D.sayT = 5; say(rnd(LINES.crash)); }
      emit('crash', { speed: S0.hit });
    }
    // ---- buttons
    if (I.pressed('KeyF') || (P && I.padPressed(0, 4)) || I.tPressed('horn')) { sound.sfx('horn'); if (D.hornT <= 0 && Math.random() < 0.5) say(rnd(LINES.horn)); D.hornT = 4; }
    D.hornT = Math.max(0, D.hornT - dt);
    if (I.pressed('KeyC')) D.camFar = (D.camFar + 1) % 3;
    if (I.pressed('KeyR') || (P && I.padPressed(0, 3))) { if (!race.respawn()) straighten(); }
    const ns = !race.active && nearStart(), no = !race.active && nearOfficina();
    setHint(ns ? 'G · gara: ' + TRACKS[ns].name : no ? 'G · officina' : race.active ? 'R · rimettiti in pista' : '');
    if (I.pressed('KeyG')) { if (ns) race.openMenu(ns); else if (no) openGarage(); }
    if (I.pressed('Escape') && ui.menu && ui.menu.show) { ui.menu.show('pause'); I.edges.delete('Escape'); }
    const exitP = I.pressed('KeyE') || I.pressed('KeyQ') || (P && I.padPressed(0, 1)) || I.tPressed('act') || I.tPressed('back');
    if (exitP && D.phase === 'drive' && D.t > 0.5) {
      if (race.active) { race.quitAsk(); }
      else if (v > 3) toast('Prima fermati, poi scendi');
      else exitCar();
    }
    return { lookW: 0 };
  }
  // ---- particles (particles.js): per-car rate accumulators, no allocations per frame
  const PFX = new Map();
  const pfx = id => { let st = PFX.get(id); if (!st) PFX.set(id, st = { ex: {}, ex2: {}, ni: {}, ni2: {}, t0: {}, t1: {}, d0: {}, d1: {} }); return st; };
  function carFx(PX, c, S0, thr, sliding, dt) {
    const st = pfx(c.id), fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
    const v = Math.hypot(S0.vx, S0.vz), ex = (c.rig.look && c.rig.look.exhaust) | 0, px = ex === 2 ? 0.5 : 0.42, bk = CAR.halfL + 0.05;
    const X = c.x + rx * px - fx * bk, Z = c.z + rz * px - fz * bk, X2 = c.x - rx * px - fx * bk, Z2 = c.z - rz * px - fz * bk;
    PX.exhaust(st.ex, X, 0.22, Z, fx, fz, S0.vx, S0.vz, D.phase === 'drive' ? thr : 0, dt);
    if (ex === 2) PX.exhaust(st.ex2, X2, 0.22, Z2, fx, fz, S0.vx, S0.vz, thr, dt);
    if (S0.nitroOn) { PX.nitro(st.ni, X, 0.22, Z, fx, fz, S0.vx, S0.vz, dt); if (ex === 2) PX.nitro(st.ni2, X2, 0.22, Z2, fx, fz, S0.vx, S0.vz, dt); }
    const wx = CAR.wheelX, wz = CAR.wheelZ, lx = c.x - rx * wx - fx * wz, lz = c.z - rz * wx - fz * wz, qx = c.x + rx * wx - fx * wz, qz = c.z + rz * wx - fz * wz;
    if (sliding && v > 2) { const k = Math.min(1.5, 0.35 + S0.slip / 5 + S0.drift * 0.4); PX.tyreSmoke(st.t0, lx, lz, S0.vx, S0.vz, k, dt); PX.tyreSmoke(st.t1, qx, qz, S0.vx, S0.vz, k, dt); }
    if (v > 3 && level && level.zoneAt && level.zoneAt(c.x, c.z) === 'Teletubbylandia') { const k = Math.min(1.5, v / 12); PX.dirt(st.d0, lx, lz, S0.vx, S0.vz, k, dt); PX.dirt(st.d1, qx, qz, S0.vx, S0.vz, k, dt); }
    if (S0.hit > 6) { const sg = S0.fwd < 0 ? -1 : 1; PX.crash(V(c.x + fx * sg * (CAR.halfL + 0.1), 0.5, c.z + fz * sg * (CAR.halfL + 0.1)), fx * sg, fz * sg, S0.hit); }
  }
  function vespaFx(i, dt) {
    const PX = getParticles(); if (!PX || !i) return;
    const st = pfx('vespa'), fx = Math.sin(i.yaw), fz = Math.cos(i.yaw), rx = Math.cos(i.yaw), rz = -Math.sin(i.yaw), vx = fx * i.speed, vz = fz * i.speed;
    const X = i.x + rx * 0.16 - fx * 0.85, Z = i.z + rz * 0.16 - fz * 0.85;
    PX.exhaust(st.ex, X, 0.3, Z, fx, fz, vx, vz, Math.min(1, Math.abs(i.speed) / 8), dt);
    if (i.nitroOn) PX.nitro(st.ni, X, 0.3, Z, fx, fz, vx, vz, dt);
  }
  function straighten() { const c = D.car; if (!c) return; // nudge to the closest drivable spot nearby and face along the street
    for (let r = 0; r < 4; r += 0.5) for (let a = 0; a < 8; a++) { const x = c.x + Math.cos(a * 0.785) * r, z = c.z + Math.sin(a * 0.785) * r; if (!carBlocked(x, z, c.yaw, env)) { placeCar(c, x, z, c.yaw); return; } }
  }

  // ---------------------------------------------------------------- chase camera ('car') + orbit ('garage')
  const camOut = { pos: V(), look: V(), fov: 55 }, cTmp = V();
  function carCamera(W, pose, dt) {
    const c = D.car || (D.garageCar); if (!c || !pose) return null;
    if (W.mode === 'garage') {
      // swing over the street side only (the bay is on the sidewalk, the Officina's facade right behind it)
      D.orbit = (D.orbit ?? 0) + dt * 0.22 + (input.drag.dx || 0) * 0.004;
      const th = Math.sin(D.orbit) * 1.1, r = 5.4, cx = c.x + Math.sin(th) * r, cz = c.z + Math.cos(th) * r;
      camOut.pos.set(cx, 1.75, cz); camOut.fov = 50;
      // the menu covers the left of the screen: aim to the car's screen-left so the car sits on the right
      const dx = c.x - cx, dz = c.z - cz, L = Math.hypot(dx, dz) || 1;
      camOut.look.set(c.x + (dz / L) * 1.7, 0.55, c.z - (dx / L) * 1.7);
      return camOut;
    }
    const S0 = D.S; const v = S0 ? Math.hypot(S0.vx, S0.vz) : 0;
    const dragging = performance.now() - (input.drag ? input.drag.last : 0) < 1500;
    if (!dragging) { const velYaw = v > 2 ? Math.atan2(S0.vx, S0.vz) : c.yaw; const want = (S0 && S0.fwd < -1 ? c.yaw : velYaw) + PI; W.camYaw += wrapA(want - W.camYaw) * (1 - Math.exp(-dt * 3.2)); }
    const keepD = W.camDist, keepP = W.camPitch;
    W.camDist = [4.6, 6.4, 3.2][D.camFar] + clamp(v / 25, 0, 1) * 1.2; W.camPitch = [0.2, 0.3, 0.12][D.camFar];
    const p = W.followPose(cTmp.set(c.x, 0.1, c.z), W.camYaw);
    W.camDist = keepD; W.camPitch = keepP;
    // circle colliders (portico columns, trees, lamps) don't stop followPose: pull the camera in front of them
    const ox = p.look.x, oz = p.look.z, dx = p.pos.x - ox, dz = p.pos.z - oz, L = Math.hypot(dx, dz);
    if (L > 0.5) {
      const ux = dx / L, uz = dz / L; let best = L;
      for (const cc of (level && level.colliders) || []) {
        if (cc.type !== 'circle') continue;
        const cx = cc.c[0] - ox, cz = cc.c[1] - oz; if (cx * cx + cz * cz > (L + 1) * (L + 1)) continue;
        const tca = cx * ux + cz * uz; if (tca < 0) continue;
        const d2 = cx * cx + cz * cz - tca * tca, rr = cc.r + 0.22; if (d2 > rr * rr) continue;
        const th = tca - Math.sqrt(Math.max(0, rr * rr - d2)); if (th > 0.3 && th < best) best = th;
      }
      if (best < L) { const k = Math.max(1.2, best - 0.1) / L; p.pos.set(ox + dx * k, p.look.y + (p.pos.y - p.look.y) * k + (1 - k) * 0.4, oz + dz * k); }
    }
    camOut.pos.copy(p.pos); camOut.look.copy(p.look);
    camOut.fov = 56 + clamp(v / 26, 0, 1) * 14 + (S0 && S0.nitroOn ? 6 : 0);
    return camOut;
  }

  // ---------------------------------------------------------------- the Officina
  const garageUI = createGarageUI({
    sfx: k => sound.sfx(k),
    onPreview: d => { own.rig.setLook(d.look); },
    onClose: g => {
      G = g; own.look = g.look; own.rig.setLook(g.look); if (D.car === own) { D.st = stats(G.perf); setNetLook(true); sound.start(G.look.exhaust | 0); }
      const W = D.W, H = D.H; D.garageCar = null;
      if (W && H) { if (D.car) { H.setMode('car'); man.root.visible = false; } else { man.root.visible = true; H.setMode('explore'); } }
      if (Object.values(G.owned.paint).length || G.owned.neon || G.perf.motore) unlock('motor_tuning', 'Tamarro', 'Compra il primo pezzo in officina.', '🔧');
      if (G.owned.neon) unlock('motor_neon', 'Fast & Bolognese', 'Monta i neon sotto la 500.', '🌈');
    },
  });
  garageUI.onBuy = (g, n) => { event('motor', `ha speso € ${n} in officina per la sua 500`); };
  function openGarage() {
    if (garageUI.open) return;
    const W = D.W, H = D.H; if (!W || !H) return;
    // your 500 comes to the bay (if you're driving it, you drive in; otherwise the tow truck brings it)
    const [bx, bz, by] = OFFICINA.bay;
    if (D.car && !D.car.own) { toast('In officina ci va la tua 500, non quella degli altri'); return; }
    if (!D.car && Math.hypot(own.x - bx, own.z - bz) > 3) toast('Il carro attrezzi ti porta la 500 in officina');
    if (D.car) { D.S.vx = D.S.vz = 0; sound.stop(); }
    placeCar(own, bx, bz, by); D.garageCar = own;
    if (D.car) { man.root.visible = false; }
    H.setMode('garage'); garageUI.show(G);
  }

  // ---------------------------------------------------------------- races
  const race = createRace({
    scene, factory, sound, toast, camera, level, garage: () => G, saveGarage: g => saveGarage(g),
    motor: {
      current: () => api.current(), freeze: v => api.freeze(v), place: (x, z, yaw) => api.place(x, z, yaw),
      async raceVehicle(kind, x, z, yaw) {
        if (kind === 'vespa') {
          if (D.car) exitCar();
          if (VS) { await VS.mountAt(x, z, yaw); VS.state.exitGuard = () => race.active && race.quitAsk(); }
          return;
        }
        if (VS && VS.riding) VS.leave();
        if (D.car && !D.car.own) exitCar();
        placeCar(own, x, z, yaw);
        if (!D.car) enterCar(own, D.W, D.H); else { D.S.vx = D.S.vz = 0; }
      },
    },
  });
  race.init(racePool);

  // ---------------------------------------------------------------- explore plugin
  const plugin = (ctx, W, H) => {
    D.W = W; D.H = H;
    const FAR = V(1e5, 0, 1e5);
    const items = [];
    for (const c of cars) {
      items.push({
        id: 'mt_car_' + c.id, label: () => (c.own ? 'Guida la tua 500' : 'Prendi ' + c.name), range: 1.4,
        anchor: () => (D.car === c || c.netHidden ? FAR : doorOf(c)), top: () => (D.car === c || c.netHidden ? FAR : V(c.x, 1.6, c.z)),
        act: () => {
          if (W.carry) { toast('Posa prima l\'estintore'); return; }
          H.goTo(doorOf(c), wrapA(c.yaw + PI / 2), () => enterCar(c, W, H), { ignore: c.circles.map(x => x.id) });
        },
      });
    }
    items.push({ id: 'mt_officina', label: () => 'Officina: tuning della tua 500', range: 1.3, anchor: () => V(OFFICINA.item[0], 0, OFFICINA.item[1]), top: () => V(OFFICINA.item[0], 2.4, OFFICINA.item[1] - 0.6),
      act: () => H.goTo(V(OFFICINA.item[0], 0, OFFICINA.item[1]), 0, () => openGarage()) });
    for (const b of race.boardItems) items.push({ id: 'mt_race_' + b.id, label: () => 'Gara: ' + TRACKS[b.id].name, range: 1.3, anchor: () => b.anchor, top: () => b.top, act: () => race.openMenu(b.id) });
    return {
      items, owns: m => m === 'car' || m === 'garage',
      update: (mode, dt, I) => {
        if (mode === 'car') return updateCar(W, H, dt, I);
        if (mode === 'garage') { W.focus = null; W.vel && W.vel.set(0, 0, 0); if (!garageUI.open) H.setMode(D.car ? 'car' : 'explore'); return {}; }
        return {};
      },
      camera: (pose, dt) => carCamera(W, pose, dt),
    };
  };

  // ---------------------------------------------------------------- every frame (any mode)
  function pre(dt) {
    const W = D.W; if (!W) return;
    // parked cars are dynamic colliders (the one you're driving too: the NPCs and the others bump into it)
    const ec = W.extraCircles || (W.extraCircles = []); let j = 0; // in place: no per-frame arrays
    for (let i = 0; i < ec.length; i++) if (!ec[i].motor) ec[j++] = ec[i];
    ec.length = j;
    for (const c of cars) { if (D.car === c) updateCircles(c); for (let i = 0; i < c.circles.length; i++) ec.push(c.circles[i]); }
    for (const rig of remoteOn.values()) if (rig._circ) ec.push(rig._circ[0], rig._circ[1]); // the others' moving 500s are obstacles too
    // online: my vespa as a presence extra, where I leave it in the room's world state
    const vs = VS && VS.riding && VS.state.riding ? VS.state.riding.s : null;
    if (vs !== myVespa) {
      const N = window.__net;
      try { if (N && N.setExtra) N.setExtra('veh', vs ? { on: 1, kind: 'vespa', s: vs.i, c: vs.color } : (D.car ? N.extras.veh : null)); } catch (e) { }
      if (myVespa && !vs && N && N.online && N.wset) myVespa._nwT = performance.now(), N.wset('vs:' + myVespa.i, { x: +myVespa.x.toFixed(2), z: +myVespa.z.toFixed(2), ry: +myVespa.ry.toFixed(3) });
      myVespa = vs;
    }
    // the vespa: nitro / freeze / race reset
    if (VS && VS.riding && W.mode === 'vespa') {
      const info = VS.info(); hudShow(true);
      if (info) hudSet(Math.abs(info.speed) * 3.6, info.nitro, info.nitroOn, info.speed < -0.2 ? -1 : 1, Math.abs(info.speed) / 11, true);
      if (info) vespaFx(info, dt); // particles.js: exhaust + nitro flame
      const ns = !race.active && nearStart(); setHint(ns ? 'G · gara: ' + TRACKS[ns].name : race.active ? 'R · rimettiti in pista' : '');
      if (input.pressed('KeyG') && ns) race.openMenu(ns);
      if (input.pressed('KeyR') && race.active) race.respawn();
      if (!VS.state.exitGuard) VS.state.exitGuard = () => race.active && race.quitAsk();
    } else if (!D.car) hudShow(false);
  }

  const remoteOn = new Map(), remoteSeen = new Set(); // net id -> rig
  let myVespa = null;
  // quality caps (checked every 2 s): low = no skid marks and only your own 500 casts a shadow
  let qT = 0, qLast = null, skidQ = true;
  function applyQuality() {
    const q = currentQuality(); if (q === qLast) return; qLast = q; skidQ = q !== 'low';
    for (const r of factory.rigs || []) if (r.body) r.body.castShadow = q !== 'low' || r === own.rig;
  }
  function update(dt) {
    qT -= dt; if (qT <= 0) { qT = 2; try { applyQuality(); } catch (e) { } }
    race.update(dt);
    if (!D.car && man.root.visible === false && !(D.W && D.W.mode === 'garage')) man.root.visible = true;
    // other players driving their 500 (net extras): a car instead of a walking avatar
    const N = window.__net;
    if (N && N.players && N.players.size) {
      const seen = remoteSeen; seen.clear();
      for (const [id, P] of N.players) {
        const e = P.extra && P.extra.veh; if (!e || !e.on || e.kind !== '500' || !P.avatar || P.far || (race.active && race.view && race.view.players.some(p => p.id === id))) continue;
        let rig = remoteOn.get(id); if (!rig) { rig = remotePool.find(r => ![...remoteOn.values()].includes(r)); if (!rig) continue; remoteOn.set(id, rig); rig.show(true); rig.setLook(e.look || {}); rig._l = JSON.stringify(e.look || {}); }
        if (e.look !== rig._lo) { rig._lo = e.look; const ls = JSON.stringify(e.look || {}); if (ls !== rig._l) { rig._l = ls; rig.setLook(e.look || {}); } }
        const r = P.avatar.root; const o = rig._r || (rig._r = { x: r.position.x, z: r.position.z }); const sp = Math.hypot(r.position.x - o.x, r.position.z - o.z) / Math.max(dt, 1e-3); o.x = r.position.x; o.z = r.position.z;
        rig.pose(r.position.x, r.position.z, r.rotation.y, Math.min(40, sp), 0, 0, dt); r.visible = false; seen.add(id);
        const cc = rig._circ || (rig._circ = [{ c: V(), r: 0.78, motor: true, id: 'motor_net' + id + '_a' }, { c: V(), r: 0.78, motor: true, id: 'motor_net' + id + '_b' }]), fy = Math.sin(r.rotation.y) * 0.72, fz = Math.cos(r.rotation.y) * 0.72;
        cc[0].c.set(r.position.x + fy, 0, r.position.z + fz); cc[1].c.set(r.position.x - fy, 0, r.position.z - fz);
      }
      for (const [id, rig] of remoteOn) if (!seen.has(id)) { rig.show(false); rig._circ = null; remoteOn.delete(id); const P = N.players.get(id); if (P && P.avatar && !P.far) P.avatar.root.visible = true; }
    } else if (remoteOn.size) { for (const rig of remoteOn.values()) { rig.show(false); rig._circ = null; } remoteOn.clear(); }
    netShared(N);
  }

  // ---------------------------------------------------------------- online: the others' vespe, the shared parked vehicles
  // A remote rider: a copy of the scooter under his avatar, placed one frame behind the avatar root like his seated pose
  // (written now, applied by the avatar at its next update), so body and scooter stay together at any speed.
  const VG = (VS && VS.GEOM) || { tripo: { seatY: 0.95, seatZ: -0.26, floorY: 0.31, floorZ: 0.17 }, proc: { seatY: 1.0, seatZ: -0.3, floorY: 0.37, floorZ: 0.2 } };
  const rvPool = [], rvOn = new Map(), rvSeen = new Set();
  function rvBody(o, color) {
    const Qr = window.__quartiere, SH = Qr && Qr.street, h = SH && SH.tripo && SH.tripo.find(x => x.name === 'vespa');
    const kind = h && Array.isArray(h.swapped) && h.swapped.length && Qr.loadOptional ? 'tripo' : 'proc';
    if (o.kind === kind && (o.body || kind === 'tripo')) { if (o.body && kind === 'proc') o.body.material.color.set(color); return; }
    if (o.body) { o.g.remove(o.body); o.body = null; }
    o.kind = kind;
    if (kind === 'tripo') Qr.loadOptional('vespa').then(sc => { if (!sc || o.kind !== 'tripo' || o.body) return; o.body = sc.clone(true); o.body.traverse(m => { if (m.isMesh) m.castShadow = true; }); o.g.add(o.body); }).catch(() => { });
    else { o.body = new THREE.Mesh((SH && SH.vespaGeo) || new THREE.BoxGeometry(0.6, 1.0, 1.6).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.25 })); o.body.castShadow = true; o.g.add(o.body); }
  }
  const _hp = V();
  function toW(o, x, y, z, out) { const c = Math.cos(o.yaw), s_ = Math.sin(o.yaw); return out.set(o.x + x * c + z * s_, y, o.z - x * s_ + z * c); }
  function netShared(N) {
    const on = N && N.online && N.players && N.players.size > 1;
    rvSeen.clear();
    const drove = new Set();
    if (on) for (const [id, P] of N.players) {
      if (id === N.id) continue;
      const e = P.extra && P.extra.veh; if (!e || !e.on) continue;
      if (e.kind === '500' && e.id && e.id !== 'mine') drove.add(e.id);
      if (e.kind !== 'vespa' || !P.avatar || P.far) continue;
      const L = VS && VS.spots && VS.spots(), sp = L && L[e.s | 0];
      if (sp && !sp.netHidden && !(VS.state.riding && VS.state.riding.s === sp)) { sp.netHidden = true; sp.hidden = true; VS.writeInstance(sp, false); const ci = VS.state.circles[sp.i]; if (ci) ci.c.set(1e5, 0, 1e5); }
      let o = rvOn.get(id);
      if (!o) { o = rvPool.find(x => !x.busy); if (!o && rvPool.length < 3) { o = { g: new THREE.Group(), busy: false, body: null, kind: null, sit: { src: 'vespa', hip: V(), feet: { Left: V(), Right: V() }, w: 1, tilt: 0.12 } }; o.g.name = 'vespaRemote'; scene.add(o.g); rvPool.push(o); } if (!o) continue; o.busy = true; o.prev = null; rvBody(o, e.c || '#8fd3c0'); rvOn.set(id, o); }
      rvSeen.add(id);
      const r = P.avatar.root, g = VG[o.kind] || VG.proc, yaw = r.rotation.y;
      const cur = { x: r.position.x - Math.sin(yaw) * g.seatZ, z: r.position.z - Math.cos(yaw) * g.seatZ, yaw };
      const at = o.prev || cur; o.g.position.set(at.x, 0, at.z); o.g.rotation.set(0, at.yaw, 0); o.g.visible = true; o.prev = cur;
      const S1 = o.sit; toW(cur, 0, g.seatY + 0.08, g.seatZ + 0.04, S1.hip); toW(cur, 0.12, g.floorY + 0.09, g.floorZ, S1.feet.Left); toW(cur, -0.12, g.floorY + 0.09, g.floorZ, S1.feet.Right);
      P.avatar.man.sit = S1;
    }
    for (const [id, o] of rvOn) if (!rvSeen.has(id)) { o.busy = false; o.g.visible = false; rvOn.delete(id); const P = N && N.players && N.players.get(id); if (P && P.avatar && P.avatar.man.sit === o.sit) P.avatar.man.sit = null; }
    // a friend's 500 driven by someone else: hidden here (he shows up as a moving car); then where he left it
    for (const c of cars) {
      if (c.own || D.car === c || performance.now() - (c._nwT || -1e9) < 3000) continue; // just parked by me: my 'car:' update is on its way
      const hid = drove.has(c.id);
      if (hid !== !!c.netHidden) { c.netHidden = hid; c.rig.show(!hid); if (hid) for (const k of c.circles) k.c.set(1e5, 0, 1e5); else updateCircles(c); }
      const v = on || (N && N.online) ? N.ws && N.ws['car:' + c.id] : null;
      if (!hid && v && (Math.abs(v.x - c.x) > 0.05 || Math.abs(v.z - c.z) > 0.05 || Math.abs(wrapA(v.yaw - c.yaw)) > 0.02)) placeCar(c, +v.x || 0, +v.z || 0, +v.yaw || 0);
    }
    // vespe: back where their rider left them
    const L = VS && VS.spots && N && N.online && VS.spots();
    if (L) for (const sp of L) {
      if ((VS.state.riding && VS.state.riding.s === sp) || performance.now() - (sp._nwT || -1e9) < 3000) continue;
      const ridden = [...rvOn.keys()].some(id => { const P = N.players.get(id), e = P && P.extra && P.extra.veh; return e && (e.s | 0) === sp.i; });
      const v = N.ws && N.ws['vs:' + sp.i];
      if (sp.netHidden && !ridden) { sp.netHidden = false; sp.hidden = false; VS.writeInstance(sp, true); const ci = VS.state.circles[sp.i]; if (ci) ci.c.set(sp.x, 0, sp.z); } // back (moved below if he parked it elsewhere)
      if (!ridden && v && (Math.abs(v.x - sp.x) > 0.05 || Math.abs(v.z - sp.z) > 0.05 || Math.abs(wrapA(v.ry - sp.ry)) > 0.02 || sp._nw !== v)) {
        sp._nw = v; sp.x = +v.x || 0; sp.z = +v.z || 0; sp.ry = +v.ry || 0; VS.writeInstance(sp, true); const ci = VS.state.circles[sp.i]; if (ci) ci.c.set(sp.x, 0, sp.z);
      }
    }
  }

  // ---------------------------------------------------------------- API
  const api = {
    async enter(kind = '500') {
      const W = D.W, H = D.H; if (!W || !H) return false;
      if (kind === 'vespa') { if (D.car) exitCar(); if (!VS) return false; const p = man.root.position; return VS.mountAt(p.x + Math.sin(W.yaw) * 0.9, p.z + Math.cos(W.yaw) * 0.9, W.yaw); }
      if (D.car) return true; if (VS && VS.riding) VS.leave();
      const p = man.root.position;
      if (Math.hypot(own.x - p.x, own.z - p.z) > 8) { // the tow truck: your 500 next to you, facing the same way
        const yaw = W.yaw; let placed = false;
        for (const d of [2.4, 3.2, -2.4, 4]) { const x = p.x + Math.cos(yaw) * d, z = p.z - Math.sin(yaw) * d; if (!carBlocked(x, z, yaw, env)) { placeCar(own, x, z, yaw); placed = true; break; } }
        if (!placed) { toast('Qui non c\'è posto per la 500'); return false; }
        toast('Ecco la tua 500');
      }
      enterCar(own, W, H); return true;
    },
    exit() { if (D.car) exitCar(); else if (VS && VS.riding) VS.leave(); },
    current() {
      if (D.car && D.S) return { kind: '500', x: D.S.x, z: D.S.z, yaw: D.S.yaw, speed: D.S.fwd, own: D.car.own, id: D.car.id };
      const i = VS && VS.info(); if (i) return { kind: 'vespa', x: i.x, z: i.z, yaw: i.yaw, speed: i.speed, own: false, id: 'vespa' };
      return null;
    },
    on(k, f) { (listeners[k] || (listeners[k] = [])).push(f); return () => { listeners[k] = listeners[k].filter(x => x !== f); }; },
    setLook(look) { own.rig.setLook({ ...G.look, ...(look || {}) }); if (D.car === own) setNetLook(true); },
    look: () => ({ ...G.look }),
    place(x, z, yaw) { if (D.car) placeCar(D.car, x, z, yaw); else if (VS && VS.riding) VS.place(x, z, yaw); },
    freeze(v) { D.frozen = !!v; if (VS) VS.freeze(v); },
    openGarage, openRace: id => race.openMenu(id || 'notturna'), tracks: TRACKS, race,
    // phone app "Motori" (phone.js calls this with the section's container)
    renderApp(el) {
      if (!el) return;
      let best = {}; try { best = JSON.parse(localStorage.getItem('bigalesso_motor_best') || '{}'); } catch (e) { }
      const fmt = t => { if (!t) return '—'; const m = Math.floor(t / 60), s = t - m * 60; return (m ? m + ':' + (s < 10 ? '0' : '') : '') + s.toFixed(2); };
      const perf = G.perf || {}, O = G.owned || {}, lv = Object.values(perf).reduce((a, b) => a + (b | 0), 0) + Object.keys(O.paint || {}).length + Object.keys(O.livery || {}).length + Object.keys(O.rims || {}).length + Object.keys(O.spoiler || {}).length + Object.keys(O.exhaust || {}).length + (O.neon ? 1 : 0);
      el.innerHTML = `<div class="ph-list ph-games">
        ${Object.entries(TRACKS).map(([id, T]) => `<button data-mt="race:${id}"><b>🏁 ${T.name}</b><small>${T.kind === 'circuit' ? 'circuito' : 'sprint'} · record ${fmt(best[id])}</small></button>`).join('')}
        <button data-mt="garage"><b>🔧 Officina BIGALESSO MOTORS</b><small>tuning della 500 · pezzi montati: ${lv} · il carro attrezzi te la porta</small></button>
        <button data-mt="drive"><b>🚗 Chiama la 500</b><small>gare fatte ${G.stats?.races | 0} · vinte ${G.stats?.wins | 0}</small></button>
        <div class="mt-onl"></div>
      </div>`;
      race.lobbies().then(list => {
        const box = el.querySelector('.mt-onl'); if (!box || !list.length) return;
        box.innerHTML = list.slice(0, 4).map(l => `<button data-mt="join:${String(l.id).replace(/[^\w-]/g, '')}"><b>🌐 Gara online di ${String((l.players && l.players[0]) || '?').replace(/[<>&"]/g, '')}</b><small>${(l.players || []).length}/${l.max || 8} piloti · entra e aspetta il via</small></button>`).join('');
      });
      el.onclick = e => {
        const b = e.target.closest('[data-mt]'); if (!b) return; e.preventDefault();
        const k = b.dataset.mt; try { window.__phone && window.__phone.close(); } catch (err) { }
        setTimeout(() => {
          if (race.active) { toast('Sei già in gara'); return; }
          if (k.startsWith('race:')) race.openMenu(k.slice(5));
          else if (k.startsWith('join:')) race.join(k.slice(5), '500');
          else if (k === 'garage') openGarage();
          else if (k === 'drive' && !D.car) {
            const p = man.root.position; let x = p.x + 2.2, z = p.z, yaw = 0;
            for (const [dx, dz] of [[2.2, 0], [-2.2, 0], [0, 2.6], [0, -2.6], [3.2, 2], [-3.2, -2]]) if (!carBlocked(p.x + dx, p.z + dz, yaw, env) && level.isWalkable(p.x + dx, p.z + dz, 0.5)) { x = p.x + dx; z = p.z + dz; break; }
            if (carBlocked(x, z, yaw, env)) { toast('Qui la 500 non ci sta: vai in strada'); return; }
            placeCar(own, x, z, yaw); toast('Ecco la tua 500');
          }
        }, 80);
      };
    },
    get state() { return { D, G, cars, factory }; },
    // tests: points of a track where the 500 would hit something (center line + grid slots)
    _check(id) {
      const T = TRACKS[id], Gm = trackGeom(id), out = { line: [], grid: [] };
      for (let x = 0; x < Gm.L; x += 1.5) { const q = pointAt(Gm, x, 0, {}); if (carBlocked(q.x, q.z, q.yaw, env)) out.line.push([+q.x.toFixed(1), +q.z.toFixed(1)]); }
      for (const g of T.grid) if (carBlocked(g[0], g[1], T.dir, env)) out.grid.push(g);
      return out;
    },
    // tests: the racing line sampled every ds metres for `laps` laps (+ a few metres past the finish)
    _path(id, ds = 2, laps = 1) {
      const Gm = trackGeom(id), out = [], end = Gm.loop ? Gm.L * laps + 6 : Gm.L, q = {};
      for (let s = 0; s <= end; s += ds) { pointAt(Gm, s, 0, q); out.push([+q.x.toFixed(2), +q.z.toFixed(2), +q.yaw.toFixed(3)]); }
      if (!Gm.loop) { const l = out[out.length - 1]; for (let k = 1; k <= 4; k++) out.push([l[0] + Math.sin(l[2]) * ds * k, l[1] + Math.cos(l[2]) * ds * k, l[2]]); }
      return out;
    },
  };
  window.__vehicles = api;
  window.__motor = api; // tests

  return { plugin, pre, update, api, race };
}
