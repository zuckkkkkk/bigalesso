// Explore mode: third-person control of the man, collisions, interactions with the room.
import * as THREE from 'three';
import { clamp, lerp, smooth } from './util.js';
import { createDogPlay } from './dogplay.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const wrapA = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const dampA = (a, b, k) => a + wrapA(b - a) * k;

// ---------------------------------------------------------------- input
export function createInput(el) {
  const keys = new Set(), edges = new Set();
  const I = {
    keys, edges, capture: null, drag: { dx: 0, dy: 0, wheel: 0, last: 0 }, touch: { x: 0, y: 0, active: false, btn: {}, edge: new Set() },
    k: c => keys.has(c), pressed: c => edges.has(c),
    // FIX-2: the one "who owns the keyboard" check. '' = the world (explore keys may fire); otherwise the full-screen
    // overlay / menu that has the keys (cards, RTS, BR/Gulag lobby, race menu, inventory, phone, NPC talk, minigames,
    // pause menu, reader). Explore E/R, dog keys, 1-4 gestures, weapon keys and sport kicks all check it.
    owned: () => document.body.dataset.overlay || (document.querySelector('#menu.show') ? 'menu' : '') || (document.querySelector('#rdr.on') ? 'reader' : '') || (window.__rts && window.__rts.active ? 'rts' : '') || '',
    tPressed: b => I.touch.edge.has(b), tHeld: b => !!I.touch.btn[b],
    endFrame() { edges.clear(); I.touch.edge.clear(); I.drag.dx = 0; I.drag.dy = 0; I.drag.wheel = 0; for (const p of I.pads) p.prev = p.cur.slice(); if (I.edgeTurn) I.edgeTurn(); },
    pads: [{ cur: [], prev: [], axes: [0, 0, 0, 0] }, { cur: [], prev: [], axes: [0, 0, 0, 0] }],
    padHeld: (i, b) => !!I.pads[i].cur[b], padPressed: (i, b) => !!I.pads[i].cur[b] && !I.pads[i].prev[b],
    readPads() {
      const ps = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
      for (let i = 0; i < 2; i++) {
        const p = ps[i], P = I.pads[i];
        if (!p) { P.cur = []; P.axes = [0, 0, 0, 0]; continue; }
        P.cur = p.buttons.map(b => b && b.pressed);
        const dz = v => Math.abs(v) < 0.18 ? 0 : v;
        P.axes = [dz(p.axes[0] || 0), dz(p.axes[1] || 0), dz(p.axes[2] || 0), dz(p.axes[3] || 0)];
      }
    },
  };
  addEventListener('keydown', e => {
    if (I.capture && I.capture(e)) return;
    if (!e.repeat) edges.add(e.code);
    keys.add(e.code);
    if (/^(Arrow|Space|Tab)/.test(e.code)) e.preventDefault();
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  // MOUSE LOOK: a click locks the pointer (Pointer Lock API); while locked, mouse movement turns the camera
  // directly (no drag) and clicks are actions. If the lock is refused (e.g. a sandboxed frame), mouse movement
  // over the scene turns the camera without buttons (cursor hidden). main.js decides when locking is allowed.
  const LK = I.look = { locked: false, failed: false, releasing: false, ever: false, lastReq: 0, exitT: -1e9, pendingClick: false, timer: 0 };
  I.canLock = () => false; I.onLockLost = null; I.freeMove = false; I.mouseHeld = false;
  // A refusal after the lock already worked once is transient (Chrome refuses re-locking for ~1 s after Esc):
  // we stay in normal mode and the next click grabs the mouse again ("Clic per controllare la visuale").
  // A refusal before it ever worked means a sandbox without pointer lock: edge-turn fallback (cursor at the edges).
  const fail = () => { if (LK.locked) return; if (LK.ever) { LK.failed = false; LK.pendingClick = true; } else LK.failed = true; };
  I.requestLock = () => {
    if (LK.locked || LK.failed) return;
    if (!el.requestPointerLock) { LK.failed = true; return; }
    // inside the post-Esc cooldown: wait it out (the click's user activation is still valid for a few seconds)
    const wait = 1250 - (performance.now() - LK.exitT);
    if (wait > 0) { clearTimeout(LK.timer); LK.timer = setTimeout(() => { if (I.canLock()) I.requestLock(); }, wait); return; }
    LK.lastReq = performance.now();
    try {
      const r = el.requestPointerLock({ unadjustedMovement: true });
      if (r && r.catch) r.catch(() => { try { const r2 = el.requestPointerLock(); if (r2 && r2.catch) r2.catch(fail); } catch (e) { fail(); } });
    } catch (e) { try { el.requestPointerLock(); } catch (e2) { fail(); } }
  };
  I.releaseLock = () => { if (LK.locked) { LK.releasing = true; try { document.exitPointerLock(); } catch (e) { } } };
  document.addEventListener('pointerlockchange', () => {
    const L = document.pointerLockElement === el, was = LK.locked; LK.locked = L;
    if (L) { LK.ever = true; LK.failed = false; LK.releasing = false; LK.retries = 0; LK.pendingClick = false; return; }
    I.mouseHeld = false; LK.exitT = performance.now();
    if (was && !LK.releasing && I.onLockLost) I.onLockLost();
    if (was && !LK.releasing) LK.pendingClick = true;
    LK.releasing = false;
  });
  // an error can come from the first attempt (unadjustedMovement unsupported) while the plain retry succeeds: only give up if still unlocked
  document.addEventListener('pointerlockerror', () => { if (performance.now() - LK.lastReq < 3000) setTimeout(fail, 600); });
  I.lookFree = () => I.freeMove || (LK.failed && I.canLock());
  el.addEventListener('mousemove', e => {
    if (!(LK.locked || I.lookFree())) return;
    const k = I.freeMove && !LK.locked ? 1 : 0.5; // mouse-look is gentler than the old drag; petting strokes keep full speed
    I.drag.dx += (e.movementX || 0) * k; I.drag.dy += (e.movementY || 0) * k; I.drag.last = performance.now();
  });
  addEventListener('mouseup', e => { if (e.button === 0) I.mouseHeld = false; });
  // Pointer Events send no pointerdown for a button pressed while another is already held (right = aim,
  // then left = fire): mousedown still fires for every button, so the chord registers here.
  el.addEventListener('mousedown', e => {
    if (e.button !== 0 || !(e.buttons & ~1)) return;
    I.mouseHeld = true; if (LK.locked || I.lookFree()) I.drag.click = true;
  });
  // EDGE-TURN fallback (pointer lock refused, e.g. inside a sandboxed iframe): the cursor can't go past the
  // screen edge, so keeping it in the outer ~8% of the scene keeps the camera turning (top/bottom = pitch).
  const CUR = I.cursor = { x: 0.5, y: 0.5, inside: false };
  el.addEventListener('mousemove', e => { I.mouseT = performance.now(); const r = el.getBoundingClientRect(); CUR.x = (e.clientX - r.left) / r.width; CUR.y = (e.clientY - r.top) / r.height; CUR.inside = true; });
  el.addEventListener('mouseleave', () => { CUR.inside = false; });
  const edgeGlow = document.createElement('div');
  edgeGlow.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:3;opacity:0;transition:opacity .15s';
  document.body.appendChild(edgeGlow);
  let lastEdgeT = performance.now(), cursorHidden = false, glowKey = '';
  I.edgeMode = () => LK.failed && !LK.locked && I.canLock() && !I.freeMove;
  I.edgeTurn = () => {
    const now = performance.now(), dt = Math.min(0.05, (now - lastEdgeT) / 1000); lastEdgeT = now;
    const on = I.edgeMode();
    if (on !== cursorHidden) { cursorHidden = on; el.style.cursor = on ? 'none' : ''; if (on && !I.edgeAnnounced) { I.edgeAnnounced = true; dispatchEvent(new CustomEvent('bigalesso:edgemode')); } }
    let ex = 0, ey = 0;
    if (on && CUR.inside) {
      const Z = 0.08, zone = v => v < Z ? -(1 - v / Z) : v > 1 - Z ? (v - (1 - Z)) / Z : 0;
      ex = zone(CUR.x); ey = zone(CUR.y) * 0.6;
      const spd = 900; // px-equivalent per second at full depth (×0.006 rad in the camera = ~5.4 rad/s)
      I.drag.dx += Math.sign(ex) * ex * ex * spd * dt * 0.55; I.drag.dy += Math.sign(ey) * ey * ey * spd * dt * 0.35;
      if (ex || ey) I.drag.last = now;
    }
    const key = ex < 0 ? 'l' : ex > 0 ? 'r' : ey < 0 ? 't' : ey > 0 ? 'b' : '';
    if (key !== glowKey) {
      glowKey = key; edgeGlow.style.opacity = key ? '1' : '0';
      const dir = { l: 'to right', r: 'to left', t: 'to bottom', b: 'to top' }[key];
      if (dir) edgeGlow.style.background = `linear-gradient(${dir}, rgba(200,240,60,.16), rgba(200,240,60,0) 9%)`;
    }
  };
  // drag to orbit: fingers on the scene (and the mouse only where mouse-look is off, e.g. at the cabinet)
  let dragId = null, lx = 0, ly = 0;
  el.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') {
      if (e.button === 0) I.mouseHeld = true;
      if (LK.locked) { if (e.button === 0) I.drag.click = true; return; } // locked: clicks are actions (spray, throw…)
      if (I.canLock() && !LK.failed) { I.requestLock(); return; }         // the first click just grabs the mouse
      // a refused lock is retried on later clicks (Chrome refuses re-locking right after Esc; sandboxes always refuse → edge-turn stays)
      if (I.canLock() && LK.failed && !I.freeMove && (LK.retries || 0) < 6 && performance.now() - LK.lastReq > 1500) { LK.retries = (LK.retries || 0) + 1; LK.failed = false; I.requestLock(); return; }
      if (I.lookFree()) { if (e.button === 0) I.drag.click = true; return; } // free mouse-look / petting: no drag
    }
    if (dragId !== null) return; dragId = e.pointerId; lx = e.clientX; ly = e.clientY; el.setPointerCapture(e.pointerId); I.drag.down = performance.now(); I.drag.moved = 0; });
  el.addEventListener('pointermove', e => { if (e.pointerId !== dragId) return; const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY; I.drag.dx += dx; I.drag.dy += dy; I.drag.moved += Math.abs(dx) + Math.abs(dy); I.drag.last = performance.now(); });
  const end = e => { if (e.pointerId !== dragId) return; dragId = null; if (I.drag.moved < 6 && performance.now() - I.drag.down < 350) I.drag.click = true; };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  el.addEventListener('wheel', e => { I.drag.wheel += e.deltaY; e.preventDefault(); }, { passive: false });
  el.addEventListener('contextmenu', e => e.preventDefault());
  return I;
}

// ---------------------------------------------------------------- world
export function createWorld(ctx) {
  const { scene, camera, man, dog, cab, game, audio, ui, CONFIG, S, props, playMusic, TRACKS, input } = ctx;
  const cp = V(...CONFIG.cabinetPos);
  const fx = () => ctx.getFX();
  const has = (o, k) => o && typeof o[k] === 'function';
  const manCrouch = 'crouch' in man;
  const W = {
    mode: 'explore', yaw: Math.PI, vel: V(), camYaw: 0, camPitch: 0.3, camDist: 2.25, camMode: 'Segui',
    camPos: V(), camLook: V(), camFov: 50, focus: null, t: 0, m: {}, carry: false, night: false, dogFollow: false, dancing: false,
    crouch: 0, crouchT: 0, leanT: 0, lookT: 0, lookW: 0, ikT: 0, credits: 0, lightTarget: 1, reachL: null, reachR: null, gest: null,
  };
  const tw = props.typewriter, ext = props.extinguisher, shell = props.shell, sw = props.lightSwitch;
  const tableP = props.table.getWorldPosition(V());

  // ---------------- collision ----------------
  const R = 0.24;
  const boxes = [
    { id: 'cab', min: V(cp.x - 0.33, 0, cp.z - 0.05), max: V(cp.x + 0.33, 0, cp.z + 0.8) },
    { id: 'table', min: V(tableP.x - 0.5, 0, tableP.z - 0.27), max: V(tableP.x + 0.5, 0, tableP.z + 0.27) },
    { id: 'brick', min: V(cp.x + 0.84, 0, cp.z + 0.27), max: V(cp.x + 0.96, 0, cp.z + 0.36) },
  ];
  // all cabinets (main.js passes ctx.cabinets; index 0 = the original BIGALESSO cabinet)
  const CABS = (ctx.cabinets && ctx.cabinets.length) ? ctx.cabinets : [{ cab, game, name: 'Bigalesso Games', pos: cp.clone(), play: { pos: V(...CONFIG.man.play), yaw: CONFIG.man.yaw } }];
  for (let i = 1; i < CABS.length; i++) { const q = CABS[i].pos; boxes.push({ id: 'cab' + i, min: V(q.x - 0.33, 0, q.z - 0.05), max: V(q.x + 0.33, 0, q.z + 0.8) }); }
  const cabAt = i => CABS[Number.isInteger(i) && CABS[i] ? i : 0];
  W.cabIndex = 0;
  const extP = ext ? ext.standPos() : V(1.62, 0, 0.13);
  const circles = () => [
    { id: 'ext', c: V(extP.x, 0, extP.z + 0.05), r: 0.27 },
    { id: 'dog', c: dog.root.position, r: 0.2 },
  ];
  // level (world.js): walls, furniture, trees… as colliders; coarse outer bounds
  const level = ctx.level || null;
  const bounds = level ? level.bounds : { x0: -3.55, x1: 4.15, z0: 0.05, z1: 6.9 };
  if (level) for (let i = 0; i < level.colliders.length; i++) { const c = level.colliders[i]; if (c.type === 'box') boxes.push({ id: 'lv' + i, min: V(c.min[0], 0, c.min[1]), max: V(c.max[0], 0, c.max[1]) }); }
  const levelCircles = level ? level.colliders.filter(c => c.type === 'circle').map((c, i) => ({ id: 'lc' + i, c: V(c.c[0], 0, c.c[1]), r: c.r })) : [];
  W.level = level;
  function collide(p, ignore) {
    for (const b of boxes) {
      if (ignore && ignore.includes(b.id)) continue;
      const qx = clamp(p.x, b.min.x, b.max.x), qz = clamp(p.z, b.min.z, b.max.z);
      const dx = p.x - qx, dz = p.z - qz, d = Math.hypot(dx, dz);
      if (d < R) {
        if (d > 1e-5) { p.x = qx + dx / d * R; p.z = qz + dz / d * R; }
        else { // inside: push out along shortest axis
          const opts = [[b.min.x - R - p.x, 0], [b.max.x + R - p.x, 0], [0, b.min.z - R - p.z], [0, b.max.z + R - p.z]];
          opts.sort((a, c) => Math.hypot(...a) - Math.hypot(...c)); p.x += opts[0][0]; p.z += opts[0][1];
        }
      }
    }
    for (const c of circles().concat(levelCircles, W.extraCircles || [])) { // extraCircles: other players (net.js)
      if (ignore && ignore.includes(c.id)) continue;
      const dx = p.x - c.c.x, dz = p.z - c.c.z, d = Math.hypot(dx, dz), m = R + c.r;
      if (d < m && d > 1e-5) { p.x = c.c.x + dx / d * m; p.z = c.c.z + dz / d * m; }
    }
    p.x = clamp(p.x, bounds.x0 + R, bounds.x1 - R); p.z = clamp(p.z, bounds.z0 + R, bounds.z1 - R);
  }

  // ---------------- helpers ----------------
  const manPos = () => man.root.position;
  const fwdOf = y => V(Math.sin(y), 0, Math.cos(y));
  const headPos = () => (man.bones && man.bones.Head ? man.bones.Head.getWorldPosition(V()) : manPos().clone().add(V(0, 1.6, 0)));
  const handPos = side => (man.bones && man.bones[side + 'Hand'] ? man.bones[side + 'Hand'].getWorldPosition(V()) : manPos().clone().add(V(0, 0.9, 0)));
  const dogHead = () => (dog.headPivot ? dog.headPivot.getWorldPosition(V()) : dog.root.position.clone().add(V(0, 0.3, 0)));
  function toast(msg, cls = '') { ui.toast(msg, cls); }
  addEventListener('bigalesso:edgemode', () => toast('Il browser non permette di catturare il mouse: porta il cursore ai bordi per girare la visuale'));
  W.toast = toast;
  function setMode(m) {
    if (W.mode === m) return;
    W.mode = m; W.t = 0; W.m = {};
    document.body.dataset.mode = m;
    ctx.onMode && ctx.onMode(m);
    W.DP && W.DP.onModeChange(m);
  }
  W.setMode = setMode;
  W.goTo = goTo; W.boxes = boxes; // used by gulag.js (scripted walks, dynamic colliders)
  function reach(side, pos, w, palm = 'down', grip = 0) {
    const o = { pos, w, palm, grip };
    if (side === 'left') W.reachL = w > 0.001 ? o : null; else W.reachR = w > 0.001 ? o : null;
  }
  function goTo(pos, yaw, then, opts = {}) {
    // a short move to a spot behind him that ends facing (about) the same way is a step back, not
    // "turn around, walk, turn around again": keep the facing and walk backwards (Walk clip in reverse)
    const p = manPos(), dx = pos.x - p.x, dz = pos.z - p.z, dl = Math.hypot(dx, dz);
    const behind = dl > 0.04 && dl < 0.6 && fwdOf(W.yaw).dot(V(dx / dl, 0, dz / dl)) < -0.45 && Math.abs(wrapA((yaw ?? W.yaw) - W.yaw)) < 0.9;
    const back = opts.back ?? behind;
    setMode('goto'); W.m = { pos: pos.clone(), yaw, then, ignore: opts.ignore || [], stuck: 0, last: manPos().clone(), speed: back ? Math.min(opts.speed || 1.25, 0.55) : (opts.speed || 1.25), back };
  }

  // ---------------- interactables ----------------
  const coinSlot = () => cab.group.localToWorld(V(0.05, 0.725, 0.675));
  const DP = createDogPlay(ctx, W, { goTo, setMode, toast, manPos, headPos, fwdOf, dogHead, fx, has, boxes, circles, bounds });
  W.DP = DP;
  const inter = [
    ...CABS.map((C, i) => ({
      id: i ? 'cab' + i : 'cab', label: () => W.carry ? 'Posa prima l\'estintore' : (i ? 'Gioca a ' + C.name : 'Gioca al cabinato'), alt: () => W.carry ? null : 'Inserisci un gettone',
      anchor: () => V(C.pos.x - 0.12, 0, C.pos.z + 1.02), top: () => C.cab.group.localToWorld(V(0, 1.25, 0.6)), range: 1.0,
      act: () => { if (W.carry) { toast('Hai le mani occupate: rimetti l\'estintore sul suo supporto'); return; } enterCabinet(i); },
      altAct: () => insertCoin(i),
    })),
    DP.dogItem, DP.ballItem, // dog + ball interactions live in dogplay.js
    tw && {
      id: 'tw', label: () => 'Scrivi a macchina', anchor: () => { const k = tw.keyCenter(); return V(k.x, 0, tableP.z + 0.55); }, top: () => tw.keyCenter().add(V(0, 0.16, 0)), range: 0.75,
      act: () => { if (W.carry) { toast('Prima posa l\'estintore'); return; } startType(); },
    },
    shell && {
      id: 'shell', label: () => 'Ascolta la conchiglia', anchor: () => { const s = shell.group.getWorldPosition(V()); return V(s.x, 0, tableP.z + 0.55); }, top: () => shell.group.getWorldPosition(V()).add(V(0, 0.14, 0)), range: 0.6,
      act: () => { if (W.carry) { toast('Prima posa l\'estintore'); return; } startShell(); },
    },
    ext && {
      id: 'ext', label: () => W.carry ? 'Rimetti l\'estintore' : 'Prendi l\'estintore', anchor: () => V(extP.x - 0.08, 0, extP.z + 0.56), top: () => V(extP.x, 1.05, extP.z + 0.05), range: 0.95,
      act: () => W.carry ? putBackExt() : grabExt(),
    },
    sw && {
      id: 'sw', label: () => W.night ? 'Accendi la luce' : 'Spegni la luce', anchor: () => { const a = sw.anchor(); return V(a.x, 0, 0.42); }, top: () => sw.anchor().add(V(0, 0.14, 0)), range: 0.8,
      act: () => { if (W.carry) { toast('Prima posa l\'estintore'); return; } flipSwitch(); },
    },
  ].filter(Boolean);
  W.interactables = inter;
  // plugins (newspaper.js, mural.js, …): each adds interactables + owns its own modes + optional camera
  // plugin factory: (ctx, W, helpers) => { items?, owns?(mode), update?(mode, dt, input, keys) -> {rL,rR,crouchT,leanT,lookW,lookAt}, camera?(pose, dt) }
  const PL = (ctx.plugins || []).map(f => { try { return f(ctx, W, { goTo, setMode, toast, manPos, headPos, handPos, fwdOf, fx, has, reach }); } catch (e) { console.warn('plugin', e); return null; } }).filter(Boolean);
  for (const pl of PL) if (pl.items) inter.push(...pl.items);
  W.plugins = PL;
  const plOwner = m => PL.find(pl => pl.owns && pl.owns(m));

  function pickFocus() {
    const p = manPos(), f = fwdOf(W.yaw); let best = null, bs = 1e9;
    for (const it of inter) {
      const a = it.anchor(); const d = Math.hypot(a.x - p.x, a.z - p.z);
      if (d > it.range) continue;
      const tp = it.top(); const dir = V(tp.x - p.x, 0, tp.z - p.z).normalize();
      const face = f.dot(dir);
      if (face < 0.15 && d > 0.4) continue;
      const score = d - face * 0.35;
      if (score < bs) { bs = score; best = it; }
    }
    return best;
  }

  // ---------------- bubble (rendered by ui.js) ----------------
  const touchUI = ui.coarse ?? matchMedia('(pointer: coarse)').matches;
  function updateBubble(it) {
    if (!it || W.mode !== 'explore') { ui.prompt(null); return; }
    const lab = it.label(), alt = it.alt ? it.alt() : null;
    ui.prompt((alt ? [{ key: 'E', label: lab }, { key: 'R', label: alt }] : [{ key: 'E', label: lab }]).concat(it.extra ? it.extra() : []), it.top(), camera);
  }

  // ---------------- actions ----------------
  function enterCabinet(i = 0) {
    const idx = Number.isInteger(i) && CABS[i] ? i : 0, C = cabAt(idx), g = C.game;
    W.dancing && stopDance();
    goTo(C.play.pos.clone(), C.play.yaw, () => {
      W.cabIndex = idx; setMode('cabinet'); W.ikT = 1;
      if (g.paused) g.paused = false;
      audio.sfx('whoosh');
      toast(g.state === 'attract' ? (idx ? C.name + ': premi INVIO (START) · Esc per alzarti' : 'Premi INVIO (START) per giocare · Esc per alzarti') : 'Si riprende! · Esc per alzarti');
    });
  }
  W.enterCabinet = enterCabinet;
  function leaveCabinet() {
    if (W.mode !== 'cabinet') return;
    W.ikT = 0;
    const g = cabAt(W.cabIndex).game;
    const inGame = !['attract', 'over'].includes(g.state);
    if (inGame && !g.paused && (!S.online || W.cabIndex > 0)) { g.paused = true; toast('Partita in pausa: torna al cabinato per riprendere'); }
    const back = manPos().clone().add(V(0, 0, 0.32));
    setMode('leaving'); W.m = { back };
  }
  W.leaveCabinet = leaveCabinet;
  function insertCoin(i = 0) {
    const idx = Number.isInteger(i) && CABS[i] ? i : 0, C = cabAt(idx);
    const slot = C.cab.group.localToWorld(V(0.05, 0.725, 0.675));
    goTo(V(C.pos.x + 0.02, 0, C.pos.z + 1.0), Math.PI, () => { setMode('coin'); W.m = { slot, sent: false, game: C.game, ci: idx }; });
  }
  function startPet() {
    W.dancing && stopDance();
    const dp = dog.root.position; const d = V(manPos().x - dp.x, 0, manPos().z - dp.z); if (d.length() < 0.01) d.set(0, 0, 1); d.normalize();
    const tp = dp.clone().addScaledVector(d, 0.5); tp.y = 0;
    const yaw = Math.atan2(dp.x - tp.x, dp.z - tp.z);
    if (has(dog, 'setFollow') && W.dogFollow) dog.setFollow(null);
    W.m.petFollowWas = W.dogFollow; const was = W.dogFollow; W.dogFollow = false;
    goTo(tp, yaw, () => { setMode('pet'); W.m.wasFollow = was; has(dog, 'react') && dog.react('pet'); audio.sfx('pet'); }, { ignore: ['dog'] });
  }
  function toggleFollow() {
    W.dogFollow = !W.dogFollow;
    if (has(dog, 'setFollow')) dog.setFollow(W.dogFollow ? manPos() : null);
    if (W.dogFollow) { audio.sfx('whistle'); setTimeout(() => { has(dog, 'react') && dog.react('bark'); audio.sfx('woof'); }, 350); toast('Il cane ti segue'); }
    else { toast('Il cane resta seduto'); has(dog, 'react') && dog.react('happy'); }
    W.gest = { name: W.dogFollow ? 'point' : 'stay', t: 0, dur: 1.0 };
  }
  function startType() {
    W.dancing && stopDance();
    const k = tw.keyCenter();
    goTo(V(k.x, 0, tableP.z + 0.53), Math.PI, () => {
      setMode('type'); audio.sfx('paper'); tw.insertPaper();
      ui.typing ? (ui.typing.show(true), ui.typing.setLines(tw.state.lines)) : (ui.typeHint.hidden = false);
      if (touchUI && ui.kbd) { ui.kbd.value = ''; ui.kbd.focus(); }
      input.capture = e => {
        if (W.mode !== 'type') return false;
        if (e.code === 'Escape') { exitType(); e.preventDefault(); return true; }
        if (e.key === 'Enter') { e.preventDefault(); typeKey('\n'); return true; }
        if (e.key === 'Backspace') { e.preventDefault(); tw.backspace(); audio.sfx('type'); return true; }
        if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey) { e.preventDefault(); typeKey(e.key); return true; }
        return true; // swallow everything else while typing
      };
    });
  }
  let lineBuf = '';
  function typeKey(ch) {
    const syncPaper = () => ui.typing && ui.typing.setLines(tw.state.lines);
    if (ch === '\n') { const wrapped = tw.newline(); audio.sfx('carriage'); W.m.ret = 0.5; lineBuf = ''; if (wrapped) { audio.sfx('paper'); toast('Foglio nuovo'); } syncPaper(); return; }
    const r = tw.type(ch); audio.sfx('type'); if (has(man, 'gesture')) man.gesture('typeTap'); syncPaper();
    W.m.tapSide = (W.m.tapSide === 'L' ? 'R' : 'L'); W.m['tap' + W.m.tapSide] = 0.12;
    if (r.bell) audio.sfx('ding');
    if (r.full) { audio.sfx('ding'); }
    lineBuf = (lineBuf + ch).slice(-24).toUpperCase();
    if (/BIGALESSO$|AVE CESARE$|AVE BIGALESSO$/.test(lineBuf)) { fx().confetti(tw.keyCenter().add(V(0, 0.25, 0)), 90); audio.sfx('power'); toast('AVE, BIGALESSO!', 'gold'); }
    W.onTyped && W.onTyped(lineBuf, ch); // easter eggs (eggs.js)
  }
  W.typeKey = typeKey;
  function exitType() {
    input.capture = null; ui.typing ? ui.typing.show(false) : (ui.typeHint.hidden = true); if (ui.kbd) ui.kbd.blur();
    setMode('standup'); W.m = { from: 'type' };
  }
  W.exitType = exitType;
  function startShell() {
    W.dancing && stopDance();
    const s = shell.group.getWorldPosition(V());
    goTo(V(s.x, 0, tableP.z + 0.52), Math.PI, () => { setMode('shell'); W.m = { phase: 0, seaT: 0 }; });
  }
  function exitShell() { if (W.mode === 'shell' && W.m.phase === 1) { W.m.phase = 2; W.m.pt = 0; } }
  function grabExt() {
    W.dancing && stopDance();
    const sp = ext.standPos(); const tp = V(sp.x - 0.06, 0, sp.z + 0.55);
    goTo(tp, Math.atan2(sp.x - tp.x, sp.z - tp.z), () => { setMode('grab'); W.m = { attached: false }; }, { ignore: ['ext'] });
  }
  function putBackExt() {
    const sp = ext.standPos(); const tp = V(sp.x - 0.06, 0, sp.z + 0.55);
    goTo(tp, Math.atan2(sp.x - tp.x, sp.z - tp.z), () => { setMode('ungrab'); W.m = {}; }, { ignore: ['ext'] });
  }
  function flipSwitch() {
    W.dancing && stopDance();
    const a = sw.anchor();
    goTo(V(a.x, 0, 0.4), Math.PI, () => { setMode('switch'); W.m = { done: false }; });
  }
  function setNight(on) {
    W.night = on; sw.set(!on);
    const f = fx(); f.setNight && f.setNight(on);
    W.lightTarget = (on && f.fallback) ? 0.07 : 1; // real fx3d dims the room itself in night mode
    toast(on ? 'Luci spente: modalità sala giochi' : 'Luci accese');
  }
  W.setNight = setNight;
  // gestures
  function gesture(name) {
    if (W.mode !== 'explore') return;
    if (name === 'dance') { W.dancing ? stopDance() : startDance(); return; }
    W.dancing && stopDance();
    const d = has(man, 'gesture') ? man.gesture(name) : 0;
    W.gest = { name, t: 0, dur: (typeof d === 'number' && d > 0) ? d : (name === 'wave' ? 1.8 : 1.5), native: typeof d === 'number' && d > 0 };
    if (name === 'cheer') { fx().confetti(headPos().add(V(0, 0.4, 0)), 50); audio.sfx('power'); has(dog, 'react') && dog.react('jump'); }
    if (name === 'wave') { has(dog, 'react') && dog.react('happy'); }
  }
  W.gesture = gesture;
  function startDance() {
    W.dancing = true; W.danceT = 0;
    if (has(man, 'playClip')) man.playClip('Dance', { loop: true, fade: 0.4 });
    if (TRACKS && TRACKS.dance) playMusic('dance');
    fx().confetti(headPos().add(V(0, 0.5, 0)), 70);
    toast('Si balla! (3 per smettere)');
  }
  function stopDance() {
    if (!W.dancing) return; W.dancing = false;
    if (has(man, 'stopClip')) man.stopClip('Dance');
    ctx.musicBack && ctx.musicBack();
  }
  W.stopDance = stopDance;

  // ---------------- per-frame ----------------
  const camTmp = V();
  const CAB_BOX = { min: [0.0, 0.0, -0.02], max: [0.7, 1.86, 0.9] };
  const CAB_BOXES = CABS.map(C => ({ min: [C.pos.x - 0.35, 0.0, C.pos.z - 0.04], max: [C.pos.x + 0.35, 1.86, C.pos.z + 0.88] }));
  function rayBox(o, d, b) {
    let t0 = 0, t1 = 1e9; const O = [o.x, o.y, o.z], D = [d.x, d.y, d.z];
    for (let i = 0; i < 3; i++) {
      if (Math.abs(D[i]) < 1e-6) { if (O[i] < b.min[i] || O[i] > b.max[i]) return -1; continue; }
      let a = (b.min[i] - O[i]) / D[i], c = (b.max[i] - O[i]) / D[i]; if (a > c) [a, c] = [c, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 > t1) return -1;
    }
    return t0;
  }
  function followPose(target) {
    const cy = W.camYaw, cpit = W.camPitch;
    const off = V(Math.sin(cy) * Math.cos(cpit), Math.sin(cpit), Math.cos(cy) * Math.cos(cpit));
    // shorten distance to stay inside the room
    let dist = W.camDist; const m = 0.18;
    const lim = (o, p, lo, hi) => { if (o > 1e-4) return (hi - p) / o; if (o < -1e-4) return (lo - p) / o; return 1e9; };
    if (level) {
      // walls/roofs/tall furniture block the camera (doorways stay open); outer bounds + floor
      dist = Math.min(dist, lim(off.x, target.x, bounds.x0 + m, bounds.x1 - m), lim(off.z, target.z, bounds.z0 + m, bounds.z1 - m), lim(off.y, target.y, 0.25, 9.0));
      for (const b of level.cameraBlockers) { const h = rayBox(target, off, b); if (h > 0 && h < dist) dist = Math.max(0.35, h - 0.14); }
    } else dist = Math.min(dist, lim(off.x, target.x, bounds.x0 + m, bounds.x1 - m), lim(off.z, target.z, -0.0 + m + 0.05, bounds.z1 - m), lim(off.y, target.y, 0.25, 3.0));
    // don't let the camera pass through the cabinet (world AABB)
    for (const cb of CAB_BOXES) { const hit = rayBox(target, off, cb); if (hit > 0 && hit < dist) dist = Math.max(0.35, hit - 0.12); }
    dist = Math.max(0.35, dist);
    return { pos: target.clone().addScaledVector(off, dist), look: target.clone(), fov: 50 };
  }
  W.followPose = (pos, yaw) => { const keep = W.camYaw; W.camYaw = yaw; const p = followPose(pos.clone().add(V(0, 1.38, 0))); W.camYaw = keep; return p; };

  function moveInput() {
    const k = input.k; let x = 0, y = 0;
    if (k('KeyA') || k('ArrowLeft')) x -= 1; if (k('KeyD') || k('ArrowRight')) x += 1;
    if (k('KeyW') || k('ArrowUp')) y += 1; if (k('KeyS') || k('ArrowDown')) y -= 1;
    const P = input.pads[0]; x += P.axes[0]; y -= P.axes[1];
    if (input.touch.active) { x += input.touch.x; y -= input.touch.y; }
    let mag = Math.hypot(x, y); if (mag > 1) { x /= mag; y /= mag; mag = 1; }
    const run = k('ShiftLeft') || k('ShiftRight') || input.padHeld(0, 4) || input.padHeld(0, 5) || input.padHeld(0, 10) || (input.touch.active && mag > 0.95);
    return { x, y, mag, run };
  }

  W.update = function (dt) {
    W.t += dt;
    const p = manPos();
    const I = input;
    const actP = I.pressed('KeyE') || I.pressed('Enter') || I.padPressed(0, 0) || I.padPressed(0, 2) || I.tPressed('act');
    const altP = I.pressed('KeyR') || I.padPressed(0, 3) || I.tPressed('alt');
    const backP = I.pressed('Escape') || I.pressed('KeyQ') || I.padPressed(0, 1) || I.tPressed('back');
    // orbit camera
    const P0 = I.pads[0];
    const sens = I.sens || 1, inv = I.invertY ? -1 : 1;
    W.camYaw -= (I.drag.dx * 0.006 + P0.axes[2] * dt * 2.4) * sens;
    W.camPitch = clamp(W.camPitch + (I.drag.dy * 0.004 + P0.axes[3] * dt * 1.6) * sens * inv, -0.15, 1.05);
    W.camDist = clamp(W.camDist + I.drag.wheel * 0.0015, 1.1, 3.6);
    const dragging = performance.now() - I.drag.last < 1500;
    let speed = 0;

    // reach decay defaults
    let rL = null, rR = null, crouchT = 0, leanT = 0, lookW = 0, lookAt = null, kneelT = 0;
    const mode = W.mode;
    if (mode === 'explore' || mode === 'goto') {
      if (mode === 'explore') {
        const mv = moveInput();
        const fwd = V(-Math.sin(W.camYaw), 0, -Math.cos(W.camYaw)), right = V(Math.cos(W.camYaw), 0, -Math.sin(W.camYaw));
        const want = right.multiplyScalar(mv.x).add(fwd.multiplyScalar(mv.y));
        let max = (mv.run ? 2.7 : 1.35) * mv.mag * (W.speedMul || 1); if (W.carry) max = Math.min(max, mv.run ? 1.7 : 1.0); // speedMul: rpg (Velocità, caffè, talenti)
        want.multiplyScalar(max);
        W.vel.lerp(want, 1 - Math.exp(-dt * (want.lengthSq() > W.vel.lengthSq() ? 7 : 9)));
        if (mv.mag > 0.1 && W.dancing) stopDance();
        if (W.gest && mv.mag > 0.1 && !W.gest.native) W.gest = null;
      } else {
        const g = W.m; const d = V(g.pos.x - p.x, 0, g.pos.z - p.z); const dl = d.length();
        if (dl > 0.035 && !g.arrived) {
          const sp = Math.min(g.speed, dl * 3.2 + 0.25);
          W.vel.lerp(d.normalize().multiplyScalar(sp), 1 - Math.exp(-dt * 8));
          g.stuck = (p.distanceTo(g.last) < dt * 0.15) ? g.stuck + dt : 0; g.last.copy(p);
          if (g.stuck > 0.6) g.arrived = true; // blocked: act from here
        } else {
          g.arrived = true;
          W.vel.multiplyScalar(Math.exp(-dt * 12));
          W.yaw = dampA(W.yaw, g.yaw, 1 - Math.exp(-dt * 6.5)); // a person pivots, not a turret: a bit slower (feet step, see turnStep)
          if (Math.abs(wrapA(g.yaw - W.yaw)) < 0.06 && W.vel.length() < 0.08) { W.yaw = g.yaw; W.vel.set(0, 0, 0); const then = g.then; setMode('explore'); then && then(); }
        }
        if (backP && W.mode === 'goto') setMode('explore');
      }
      p.addScaledVector(W.vel, dt);
      const gotoNow = W.mode === 'goto';
      collide(p, gotoNow ? W.m.ignore : null);
      speed = Math.hypot(W.vel.x, W.vel.z);
      if (speed > 0.06 && !(gotoNow && (W.m.back || W.m.arrived || V(W.m.pos.x - p.x, 0, W.m.pos.z - p.z).length() < 0.035))) W.yaw = dampA(W.yaw, Math.atan2(W.vel.x, W.vel.z), 1 - Math.exp(-dt * 10));
      // auto camera behind the man while walking
      if (mode === 'explore' && speed > 0.3 && !dragging && !(I.look && (I.look.locked || I.look.failed)) && W.camMode === 'Segui') W.camYaw = dampA(W.camYaw, W.yaw + Math.PI, 1 - Math.exp(-dt * 0.9));
      if (gotoNow && !dragging) W.camYaw = dampA(W.camYaw, W.m.yaw + Math.PI, 1 - Math.exp(-dt * 1.2));
      // interactions
      if (W.mode === 'explore') {
        W.focus = pickFocus();
        const kbOwned = !!(I.owned && I.owned()); // an overlay/menu has the keys: no E/R, dog keys or gestures behind it
        const dpUsed = !kbOwned && DP.handleExplore(I, W.focus, actP, altP);
        if (kbOwned || dpUsed) { /* overlay owns the keys / dog play consumed the input */ } else if (W.focus && actP) W.focus.act(); else if (W.focus && altP && W.focus.altAct && W.focus.alt && W.focus.alt()) W.focus.altAct();
        if (!kbOwned && !dpUsed && !DP.menuOpen()) { if (I.pressed('Digit1')) gesture('wave'); if (I.pressed('Digit2')) gesture('cheer'); if (I.pressed('Digit3')) gesture('dance'); if (I.pressed('Digit4')) gesture('facepalm'); }
      } else W.focus = null;
      // carrying: spray
      if (W.carry && W.mode === 'explore') {
        const spray = I.k('KeyF') || I.k('Space') || I.padHeld(0, 7) || I.tHeld('spray') || (I.drag.click) || (I.look && I.look.locked && I.mouseHeld);
        if (spray) {
          W.sprayT = (W.sprayT || 0) - dt;
          const dir = fwdOf(W.yaw).add(V(0, -0.12, 0)).normalize();
          W.sprayEmit = (W.sprayEmit || 0) - dt;
          const F = fx();
          if (F.fallback) F.spray(ext.nozzle(), dir, dt);
          else if (W.sprayEmit <= 0) { F.spray(ext.nozzle(), dir, 0.3); W.sprayEmit = 0.2; }
          if (W.sprayT <= 0) { audio.sfx('spray'); W.sprayT = 0.22; }
          const dd = dog.root.position.clone().sub(p); dd.y = 0;
          if (dd.length() < 2.0 && dd.normalize().dot(fwdOf(W.yaw)) > 0.8 && (!W.dogScare || W.t - W.dogScare > 1.4)) {
            W.dogScare = W.t; has(dog, 'react') && dog.react('jump'); audio.sfx('woof');
            if (!has(dog, 'setFollow')) { W.dogFlee = 1.2; }
          }
        }
        I.drag.click = false;
      }
    } else if (mode === 'cabinet') {
      W.focus = null; W.vel.set(0, 0, 0);
      if (backP) leaveCabinet();
    } else if (mode === 'leaving') {
      if (W.t > 0.45) { goTo(W.m.back, W.yaw, () => { }, { back: true, speed: 0.5 }); W.m.ignore = []; } // one step back from the cabinet, still facing it
    } else if (mode === 'coin') {
      crouchT = 0.45; leanT = 0.15;
      const w = smooth(W.t / 0.45) * (1 - smooth((W.t - 1.1) / 0.4));
      rR = { pos: W.m.slot.clone().add(V(0.0, 0.02, 0.07)), w, palm: 'forward', grip: 0.6 };
      lookW = 1; lookAt = W.m.slot;
      if (W.t > 0.45 && !W.m.sent) {
        W.m.sent = true;
        const cg = W.m.game || game, cci = W.m.ci || 0;
        fx().coin(handPos('Right'), W.m.slot, () => { audio.sfx('coinDrop'); W.credits++; S.coinFlash = 1; S.coinCab = cci; if ('credits' in cg) cg.credits++; toast(`+1 credito (${W.credits})`, 'gold'); });
      }
      if (W.t > 1.6) setMode('explore');
    } else if (plOwner(mode)) { // plugin modes (newspaper reading, mural, …)
      const o = (plOwner(mode).update && plOwner(mode).update(mode, dt, I, { actP, altP, backP })) || {};
      if (o.rR !== undefined) rR = o.rR; if (o.rL !== undefined) rL = o.rL;
      if (o.crouchT !== undefined) crouchT = o.crouchT; if (o.leanT !== undefined) leanT = o.leanT;
      if (o.lookW !== undefined) lookW = o.lookW; if (o.lookAt) lookAt = o.lookAt;
      kneelT = o.kneelT || 0;
    } else if (DP.owns(mode)) {
      const o = DP.updateMode(mode, dt, I, { actP, altP, backP });
      if (o.rR !== undefined) rR = o.rR; if (o.rL !== undefined) rL = o.rL;
      if (o.crouchT !== undefined) crouchT = o.crouchT; if (o.leanT !== undefined) leanT = o.leanT;
      if (o.lookW !== undefined) lookW = o.lookW; if (o.lookAt) lookAt = o.lookAt;
      kneelT = o.kneelT || 0;
    } else if (mode === 'type') {
      crouchT = 1; leanT = manCrouch ? 0.32 : 0.6;
      const w = smooth(W.t / 0.5);
      W.m.tapL = Math.max(0, (W.m.tapL || 0) - dt); W.m.tapR = Math.max(0, (W.m.tapR || 0) - dt); W.m.ret = Math.max(0, (W.m.ret || 0) - dt);
      const kl = tw.keySide(-1).add(V(0, 0.03 - Math.sin(W.m.tapL / 0.12 * Math.PI) * 0.018, 0.03));
      const kr = tw.keySide(1).add(V(0, 0.03 - Math.sin(W.m.tapR / 0.12 * Math.PI) * 0.018, 0.03));
      if (W.m.ret > 0) { kl.lerp(tw.tw.localToWorld(V(-0.19, 0.18, 0.02)), Math.sin(W.m.ret / 0.5 * Math.PI)); }
      rL = { pos: kl, w, palm: 'down', grip: 0.35 }; rR = { pos: kr, w, palm: 'down', grip: 0.35 };
      lookW = 1; lookAt = tw.keyCenter().add(V(0, 0.12, -0.1));
      if (I.tPressed('back')) exitType();
    } else if (mode === 'standup') {
      if (W.t > 0.5) setMode('explore');
    } else if (mode === 'shell') {
      const g = W.m; g.pt = (g.pt || 0) + dt;
      const home = shell.home;
      if (g.phase === 0) { // reach to the shell
        crouchT = 0.75; leanT = 0.3;
        const sp = shell.group.getWorldPosition(V());
        rR = { pos: sp.clone().add(V(0, 0.05, 0.05)), w: smooth(g.pt / 0.55), palm: 'down', grip: 0.3 };
        lookW = 1; lookAt = sp;
        if (g.pt > 0.6) {
          scene.attach(shell.group); g.from = shell.group.position.clone(); g.fromQ = shell.group.quaternion.clone();
          g.phase = 1; g.pt = 0; audio.sfx('pickup');
        }
      } else if (g.phase === 1) { // to the ear
        crouchT = 0; leanT = 0;
        const hp = headPos(); const side = V(-Math.cos(W.yaw), 0, Math.sin(W.yaw)); // man's right
        const ear = hp.clone().addScaledVector(side, 0.085).add(V(0, -0.005, 0)).addScaledVector(fwdOf(W.yaw), -0.005);
        const shellAt = ear.clone().addScaledVector(side, 0.075).addScaledVector(fwdOf(W.yaw), 0.015);
        if (shell.group.parent !== home.parent) {
          const mesh = shell.group.children[0];
          const coil = V(0, 1, 0).applyQuaternion(mesh ? mesh.quaternion : new THREE.Quaternion());
          const qEar = new THREE.Quaternion().setFromUnitVectors(coil, side.clone().negate());
          const k = smooth(g.pt / 0.55);
          shell.group.position.lerpVectors(g.from, shellAt, k); shell.group.quaternion.slerpQuaternions(g.fromQ, qEar, k);
          shell.group.scale.copy(home.scale).multiplyScalar(1 - 0.18 * k);
          g.earPos = shell.group.position.clone(); g.earQ = shell.group.quaternion.clone();
        }
        rR = { pos: shellAt.clone().add(V(0, -0.075, 0)).addScaledVector(side, 0.02), w: smooth(g.pt / 0.6), palm: 'up', grip: 0.55 };
        lookW = 0.6; lookAt = hp.clone().addScaledVector(side, -0.6).add(V(0, -0.15, 0)).addScaledVector(fwdOf(W.yaw), 0.6);
        g.seaT -= dt; if (g.seaT <= 0 && g.pt > 0.4) { audio.sfx('sea'); g.seaT = 2.6; }
        if (g.pt > 0.8 && (backP || actP)) { g.phase = 2; g.pt = 0; }
        if (g.pt > 0.6 && !g.told) { g.told = 1; toast('Senti il mare… (E o Esc per posarla)'); }
      } else { // back to the table
        crouchT = 0.75; leanT = 0.3;
        const target = home.parent.localToWorld(home.pos.clone());
        rR = { pos: target.clone().add(V(0, 0.05, 0.05)), w: 1 - smooth((g.pt - 0.6) / 0.35), palm: 'down', grip: 0.3 };
        lookW = 1; lookAt = target;
        if (shell.group.parent !== home.parent && g.earPos) {
          const k = smooth(g.pt / 0.55), hq = new THREE.Quaternion(); home.parent.getWorldQuaternion(hq); hq.multiply(home.quat);
          shell.group.position.lerpVectors(g.earPos, target, k); shell.group.quaternion.slerpQuaternions(g.earQ, hq, k);
          shell.group.scale.copy(home.scale).multiplyScalar(0.82 + 0.18 * k);
        }
        if (g.pt > 0.55 && shell.group.parent !== home.parent) { home.parent.add(shell.group); shell.group.position.copy(home.pos); shell.group.quaternion.copy(home.quat); shell.group.scale.copy(home.scale); audio.sfx('pickup'); }
        if (g.pt > 1.0) setMode('explore');
      }
    } else if (mode === 'grab') {
      crouchT = 0.55; leanT = 0.25;
      const w = smooth(W.t / 0.5);
      rR = { pos: ext.handle(), w, palm: 'down', grip: 0.8 }; rL = { pos: ext.bottom(), w, palm: 'in', grip: 0.6 };
      lookW = 1; lookAt = ext.body.getWorldPosition(V());
      if (W.t > 0.55 && !W.m.attached) { man.root.attach(ext.body); W.m.attached = true; W.m.from = ext.body.position.clone(); W.m.fromQ = ext.body.quaternion.clone(); audio.sfx('pickup'); }
      if (W.m.attached) { const k = smooth((W.t - 0.55) / 0.5); ext.body.position.lerpVectors(W.m.from, V(0.04, 0.8, 0.3), k); ext.body.quaternion.slerpQuaternions(W.m.fromQ, new THREE.Quaternion(), k); }
      if (W.t > 1.1) { W.carry = true; setMode('explore'); toast('F / Spazio / clic per spruzzare · E sul supporto per rimetterlo'); }
    } else if (mode === 'ungrab') {
      crouchT = 0.55; leanT = 0.25;
      if (!W.m.from) { W.m.from = ext.body.getWorldPosition(V()); ext.home.parent.attach(ext.body); W.m.lp = ext.body.position.clone(); W.m.lq = ext.body.quaternion.clone(); }
      const k = smooth(W.t / 0.6);
      ext.body.position.lerpVectors(W.m.lp, ext.home.pos, k); ext.body.quaternion.slerpQuaternions(W.m.lq, ext.home.quat, k);
      const w = 1 - smooth((W.t - 0.6) / 0.35);
      rR = { pos: ext.handle(), w, palm: 'down', grip: 0.8 }; rL = { pos: ext.bottom(), w, palm: 'in', grip: 0.6 };
      if (W.t > 1.0) { W.carry = false; audio.sfx('pickup'); setMode('explore'); }
    } else if (mode === 'switch') {
      const a = sw.anchor();
      const w = smooth(W.t / 0.35) * (1 - smooth((W.t - 0.7) / 0.3));
      rR = { pos: a.clone().add(V(0, 0.0, 0.06)), w, palm: 'forward', grip: 0.2 };
      lookW = 0.8; lookAt = a;
      if (W.t > 0.38 && !W.m.done) { W.m.done = true; audio.sfx('switch'); setNight(!W.night); }
      if (W.t > 1.05) setMode('explore');
    } else if (mode !== 'cabinet') {
      // modes driven from outside (eggs.js, gulag.js…): safety net, a second Esc always brings you back
      // (the first one is left to the owner, which usually ends its own cinematic)
      if (backP) { W.m.esc = (W.m.esc || 0) + 1; if (W.m.esc >= 2) { W.reachL = W.reachR = null; setMode('explore'); } }
    }

    // carrying pose hands
    if (W.carry && !rR && W.mode !== 'ungrab') { rR = { pos: ext.handle(), w: 1, palm: 'down', grip: 0.8 }; rL = { pos: ext.bottom(), w: 1, palm: 'in', grip: 0.6 }; }
    // gestures (fallback procedural when man.gesture is missing)
    if (W.gest) {
      const g = W.gest; g.t += dt; const k = smooth(g.t / 0.25) * (1 - smooth((g.t - g.dur + 0.3) / 0.3));
      if (!g.native && !rR) {
        const hp = headPos(), side = V(-Math.cos(W.yaw), 0, Math.sin(W.yaw)), f = fwdOf(W.yaw);
        if (g.name === 'wave') rR = { pos: hp.clone().addScaledVector(side, 0.28 + Math.sin(g.t * 11) * 0.08).add(V(0, 0.18, 0)).addScaledVector(f, 0.12), w: k, palm: 'forward', grip: 0 };
        else if (g.name === 'cheer') { const up = Math.abs(Math.sin(g.t * 7)) * 0.07; rR = { pos: hp.clone().addScaledVector(side, 0.2).add(V(0, 0.3 + up, 0)), w: k, palm: 'forward', grip: 0.9 }; rL = { pos: hp.clone().addScaledVector(side, -0.2).add(V(0, 0.3 + up, 0)), w: k, palm: 'forward', grip: 0.9 }; }
        else if (g.name === 'facepalm') { rR = { pos: hp.clone().addScaledVector(f, 0.1).add(V(0, 0.0, 0)), w: k, palm: 'in', grip: 0 }; leanT = 0.15 * k; }
        else if (g.name === 'point') rR = { pos: hp.clone().addScaledVector(f, 0.55).add(V(0, -0.15, 0)), w: k, palm: 'in', grip: 0.7 };
        else if (g.name === 'stay') rR = { pos: hp.clone().addScaledVector(f, 0.45).add(V(0, -0.25, 0)), w: k, palm: 'down', grip: 0 };
      }
      if (g.t > g.dur) W.gest = null;
    }
    if (W.dancing) {
      W.danceT += dt;
      if (!has(man, 'playClip')) { // fallback groove
        const hp = headPos(), side = V(-Math.cos(W.yaw), 0, Math.sin(W.yaw));
        const b = Math.sin(W.danceT * 7.5);
        rR = { pos: hp.clone().addScaledVector(side, 0.25).add(V(0, 0.15 + b * 0.12, 0)), w: 1, palm: 'forward', grip: 0.5 };
        rL = { pos: hp.clone().addScaledVector(side, -0.25).add(V(0, 0.15 - b * 0.12, 0)), w: 1, palm: 'forward', grip: 0.5 };
        W.yaw += Math.sin(W.danceT * 1.9) * dt * 1.5;
      }
      if (Math.floor(W.danceT / 2) !== Math.floor((W.danceT - dt) / 2)) { has(dog, 'react') && dog.react(Math.random() < 0.5 ? 'spin' : 'jump'); fx().sparkles(headPos().add(V(0, 0.3, 0))); }
    }

    // apply to the man
    // turning on the spot: feed the turn rate to the locomotion blend so the feet step around instead of skating
    const yawRate = dt > 0 ? Math.abs(wrapA(W.yaw - (W.prevYaw ?? W.yaw))) / dt : 0; W.prevYaw = W.yaw;
    W.turnStep = (W.turnStep || 0) + (((W.mode === 'explore' || W.mode === 'goto') && speed < 0.3 ? clamp((yawRate - 0.8) * 0.22, 0, 0.6) : 0) - (W.turnStep || 0)) * (1 - Math.exp(-dt * 10));
    man.root.rotation.y = W.yaw;
    if (W.mode !== 'cabinet' && W.mode !== 'leaving' && W.mode !== 'goto') man.setSpeed(Math.max(speed, W.turnStep));
    else if (W.mode === 'goto') man.setSpeed(Math.max(speed, W.turnStep), !!W.m.back);
    else man.setSpeed(0);
    if (W.extPose) { const o = W.extPose(dt, W.mode); if (o) { if (o.rL !== undefined) rL = o.rL; if (o.rR !== undefined) rR = o.rR; if (o.crouchT !== undefined) crouchT = o.crouchT; if (o.leanT !== undefined) leanT = o.leanT; if (o.lookW !== undefined) lookW = o.lookW; if (o.lookAt) lookAt = o.lookAt; } } // easter eggs (eggs.js)
    W.crouch += (crouchT - W.crouch) * (1 - Math.exp(-dt * 6));
    if (manCrouch) man.crouch = W.crouch; else leanT = Math.max(leanT, W.crouch * 0.45);
    W.kneel = (W.kneel || 0) + (kneelT - (W.kneel || 0)) * (1 - Math.exp(-dt * 4.5));
    if ('kneel' in man) man.kneel = W.kneel;
    DP.frame(dt);
    // reach (contract) — smoothed weights
    const sm = (cur, tgt) => {
      if (!tgt) { if (!cur) return null; cur.w *= Math.exp(-dt * 7); return cur.w < 0.01 ? null : cur; }
      if (!cur) cur = { pos: tgt.pos.clone(), w: 0, palm: tgt.palm, grip: tgt.grip };
      cur.pos.lerp(tgt.pos, 1 - Math.exp(-dt * 18)); cur.w += (tgt.w - cur.w) * (1 - Math.exp(-dt * 10)); cur.palm = tgt.palm; cur.grip = tgt.grip; cur.dir = tgt.dir; cur.normal = tgt.normal; cur.pole = tgt.pole; return cur;
    };
    W.reachL = sm(W.reachL, rL); W.reachR = sm(W.reachR, rR);
    man.reach = { left: W.reachL, right: W.reachR };
    // cabinet ik / lean / look (main applies S.* to the man)
    const inCab = W.mode === 'cabinet';
    S.ik += ((inCab ? 1 : 0) - S.ik) * (1 - Math.exp(-dt * (inCab ? 3.5 : 7)));
    const leanGoal = inCab ? CONFIG.man.lean : leanT;
    S.lean += (leanGoal - S.lean) * (1 - Math.exp(-dt * 5));
    const lookGoal = inCab ? 1 : lookW;
    S.look += (lookGoal - S.look) * (1 - Math.exp(-dt * 5));
    if (!inCab && lookAt) { W.lookAt = (W.lookAt || lookAt.clone()).lerp(lookAt, 1 - Math.exp(-dt * 8)); }
    W.lookAtOut = inCab ? null : W.lookAt;

    // dog fallback follow / flee
    if (!has(dog, 'setFollow')) {
      const dp = dog.root.position; let goal = null;
      if (W.dogFlee > 0) { W.dogFlee -= dt; const away = dp.clone().sub(p); away.y = 0; away.normalize(); goal = dp.clone().addScaledVector(away, 1); }
      else if (W.dogFollow) { const d = p.clone().sub(dp); d.y = 0; if (d.length() > 0.85) goal = p.clone().addScaledVector(d.normalize(), -0.7); }
      if (goal) {
        const d = goal.sub(dp); d.y = 0; const l = d.length();
        if (l > 0.05) { const sp = Math.min(W.dogFlee > 0 ? 2.2 : 1.6, l * 2.5); dp.addScaledVector(d.normalize(), sp * dt); dog.root.rotation.y = dampA(dog.root.rotation.y, Math.atan2(d.x, d.z), 1 - Math.exp(-dt * 8)); W.dogHop = (W.dogHop || 0) + dt * 12; dog.root.position.y = Math.abs(Math.sin(W.dogHop)) * 0.035; }
        else dog.root.position.y *= 0.8;
        const c = dog.root.position; c.x = clamp(c.x, bounds.x0 + 0.3, bounds.x1 - 0.3); c.z = clamp(c.z, 0.3, bounds.z1 - 0.3);
        for (const b of boxes) { const qx = clamp(c.x, b.min.x, b.max.x), qz = clamp(c.z, b.min.z, b.max.z); const dx = c.x - qx, dz = c.z - qz, dd = Math.hypot(dx, dz); if (dd < 0.18 && dd > 1e-5) { c.x = qx + dx / dd * 0.18; c.z = qz + dz / dd * 0.18; } }
      } else dog.root.position.y *= 0.85;
    }

    // camera
    if (!DP.prompt()) updateBubble(W.focus);
    let pose = null;
    if (W.mode !== 'cabinet') {
      const hp = p.clone().add(V(0, 1.38 - W.crouch * 0.35, 0));
      if (W.camMode === 'Cinema') {
        const c = CONFIG.cams.cinema; W.orb = (W.orb || 0) + dt;
        const a = Math.atan2(p.x - 0.1, p.z - 0.9) * 0.3 + Math.sin(W.orb * 0.12) * 0.9;
        pose = { pos: V(0.1 + Math.sin(a) * c.radius * 1.2, 1.5, 1.2 + Math.cos(a) * c.radius * 1.2), look: hp, fov: 42 };
      } else {
        const close = W.mode === 'type' || W.mode === 'pet' || W.mode === 'shell' || W.mode === 'coin';
        // cinematic side angles for the close-up actions (the user can still drag)
        const sideCam = { pet: 1.75, shell: 0.95, coin: 2.45, grab: 2.0, ungrab: 2.0, switch: 2.3, type: -1.8 }[W.mode];
        if (sideCam !== undefined && !dragging) W.camYaw = dampA(W.camYaw, W.yaw + sideCam, 1 - Math.exp(-dt * 2.2));
        const keepD = W.camDist; if (close) W.camDist = Math.min(W.camDist, W.mode === 'type' ? 1.1 : W.mode === 'shell' ? 1.0 : 1.6);
        const keepP = W.camPitch; if (W.mode === 'type') W.camPitch = Math.max(W.camPitch, 0.5); if (W.mode === 'shell') W.camPitch = 0.12;
        pose = followPose(hp);
        W.camDist = keepD; W.camPitch = keepP;
        // a touch wider when running (smoothed so it never pops)
        W.runK = (W.runK || 0) + ((W.mode === 'explore' ? clamp((speed - 1.5) / 1.1, 0, 1) : 0) - (W.runK || 0)) * (1 - Math.exp(-dt * 3));
        pose.fov += W.runK * 5;
        if (W.mode === 'type' && !dragging) { // over the right shoulder, looking down at the sheet
          const head = headPos(), fw = fwdOf(W.yaw), rt = V(-Math.cos(W.yaw), 0, Math.sin(W.yaw));
          const paperC = tw.tw.localToWorld(V(0, 0.2, -0.1));
          pose.pos = head.clone().add(V(0, 0.42, 0)).addScaledVector(fw, -0.46).addScaledVector(rt, 0.46);
          pose.look = paperC.lerp(tw.keyCenter(), 0.25); pose.fov = 46;
        } else if (W.mode === 'type') pose.look = tw.keyCenter().add(V(0, 0.1, -0.02)).lerp(hp, 0.2);
        if (W.mode === 'shell' && man.bones && man.bones.Head) { // frame head + shell from the shell side
          const head = man.bones.Head.getWorldPosition(V()), sp = shell.group.getWorldPosition(V());
          const side = sp.clone().sub(head); side.y = 0; if (side.lengthSq() < 1e-4) side.set(Math.cos(W.yaw), 0, -Math.sin(W.yaw)); side.normalize();
          const fw = V(Math.sin(W.yaw), 0, Math.cos(W.yaw));
          pose.pos = head.clone().addScaledVector(side, 0.42).addScaledVector(fw, 0.85).add(V(0, 0.06, 0));
          pose.look = head.clone().lerp(sp, 0.3); pose.fov = 45;
        }
      }
    }
    if (W.mode !== 'cabinet' && W.camMode !== 'Cinema') { const dpc = DP.camera(pose, dt); if (dpc) pose = dpc; }
    if (W.mode !== 'cabinet' && pose) { const po = plOwner(W.mode); if (po && po.camera) { const c = po.camera(pose, dt); if (c) pose = c; } }
    return pose;
  };

  W.dogLook = () => {
    const dpl = DP.dogLook(); if (dpl !== undefined) return dpl;
    if (W.mode === 'pet') return { look: headPos(), excite: 1 };
    if (W.dancing) return { look: headPos(), excite: 1 };
    const d = dog.root.position.distanceTo(manPos());
    if (W.dogFollow || d < 1.6 || W.vel.length() > 0.2) return { look: headPos(), excite: W.dogFollow ? 0.6 : 0.2 };
    return null;
  };
  return W;
}
