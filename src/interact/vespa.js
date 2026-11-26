// interact/vespa.js — the parked vespe of Via Teletubbylandia can be ridden (E "Sali sulla Vespa").
// Arcade scooter: W/↑ gas, S/↓ brake (then reverse), A/D/←/→ steer (more at speed), Space/F horn, E/Q to get off;
// touch: the left joystick drives (forward = gas). Collisions: the level's walkable test (zones, walls, furniture,
// parked cars…) on two points of the scooter, plus NPCs / other players / the other vespe and the dog, in sub-steps.
// The parked vespa is an instance of quartiere's InstancedMesh (procedural, or the Tripo copy): while riding that
// instance is hidden and a rideable copy is shown; when you get off, the instance is written where you parked.
// The rider uses Man.sit (pelvis on the seat, feet on the floorboard) and reaches the handlebar grips.
// motor/ (v8): Shift = nitro, freeze (race countdown), place / mountAt / info / leave for races and window.__vehicles,
// st.mul (performance multipliers), st.exitGuard (a race asks before you get off).
import * as THREE from 'three';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const PI = Math.PI;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const wrapA = a => { while (a > PI) a -= 2 * PI; while (a < -PI) a += 2 * PI; return a; };
const MAX = 8.3, REV = 1.6; // m/s: ~30 km/h forward, walking pace in reverse
// seat / floorboard / grips in the model's own space (front +Z, ground y=0): measured on assets/models/vespa.glb
// and on street.js vespaGeo()
const GEOM = {
  tripo: { seatY: 0.95, seatZ: -0.26, floorY: 0.31, floorZ: 0.17, gripY: 1.08, gripZ: 0.40, gripX: 0.26, half: 0.82 },
  proc: { seatY: 1.0, seatZ: -0.3, floorY: 0.37, floorZ: 0.2, gripY: 1.29, gripZ: 0.6, gripX: 0.29, half: 0.8 },
};
const SPOTS_FALLBACK = [{ x: 6.2, z: 28.7, ry: 0.3, color: '#8fd3c0' }, { x: 7.2, z: 28.8, ry: 0.2, color: '#e9e2c8' }, { x: 41.6, z: 47.4, ry: PI / 2 + 0.2, color: '#c0302a' }];
const LINES = {
  mount: ['Ma dove cazzo vai con la Vespa di mio zio?', 'Occhio che non ha la revisione', 'Portami a Petroni, dai', 'Guida come un cristiano, eh', 'Se la righi la paghi'],
  crash: ['Ahahah che coglione', 'Patente trovata nei cereali', 'Ma frena, porca troia!', 'Il muro era lì da prima, eh'],
  horn: ['Ma suona a tua sorella', 'Che cazzo suoni?', 'Bello il clacson, peccato il pilota'],
};
const rnd = a => a[(Math.random() * a.length) | 0];

export function createVespa({ scene, man, audio, input, level, say, ev, unlock, toast }) {
  const st = { spots: null, riding: null, dist: 0, crashT: 0, hornT: 0, commentT: 0, eng: null, circles: [], mul: { max: 1, acc: 1 }, nitro: 1, nitroOn: false, frozen: false, exitGuard: null, W: null, H: null, startMode: null };
  const Q = () => window.__quartiere;
  const t1 = V(), t2 = V(), m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s1 = V(1, 1, 1), s0 = V(0, 0, 0), YA = V(0, 1, 0);

  // ---------------------------------------------------------------- parked vespe (data from street.js)
  function spots() {
    if (st.spots) return st.spots;
    const SH = Q() && Q().street; if (!SH) return null;
    const list = (SH.vespaSpots || SPOTS_FALLBACK).map((o, i) => ({ i, x: o.x, z: o.z, ry: o.ry || 0, color: o.color || '#8fd3c0', hidden: false }));
    st.spots = list;
    st.circles = list.map(s => ({ c: V(s.x, 0, s.z), r: 0.5, vespa: true, id: 'vespa' + s.i }));
    return list;
  }
  const hook = () => { const SH = Q() && Q().street; return SH && SH.tripo && SH.tripo.find(h => h.name === 'vespa'); };
  const meshes = () => { const h = hook(); if (!h) return []; return (h.ims || []).concat(Array.isArray(h.swapped) ? h.swapped : []).filter(Boolean); };
  const tripoOn = () => { const h = hook(); return !!(h && Array.isArray(h.swapped) && h.swapped.length); };
  function writeInstance(s, show) {
    for (const im of meshes()) {
      if (s.i >= im.count) continue;
      if (show) m4.compose(t1.set(s.x, 0, s.z), q4.setFromAxisAngle(YA, s.ry), s1); else m4.compose(t1.set(s.x, -50, s.z), q4.identity(), s0);
      im.setMatrixAt(s.i, m4); im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
    }
  }

  // ---------------------------------------------------------------- the rideable copy
  const rig = new THREE.Group(); rig.name = 'vespaRide'; rig.visible = false;
  const leanG = new THREE.Group(); rig.add(leanG);
  let body = null, bodyKind = null;
  async function ensureBody(s) {
    const kind = tripoOn() ? 'tripo' : 'proc';
    if (body && bodyKind === kind) { if (kind === 'proc') body.material.color.set(s.color); return; }
    if (body) { leanG.remove(body); body = null; }
    if (kind === 'tripo') {
      const sc = Q() && Q().loadOptional ? await Q().loadOptional('vespa') : null;
      if (sc) { body = sc.clone(true); body.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); }
    }
    if (!body) {
      const SH = Q() && Q().street; const g = SH && SH.vespaGeo;
      body = new THREE.Mesh(g || new THREE.BoxGeometry(0.6, 1.0, 1.6).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: s.color, roughness: 0.35, metalness: 0.25 }));
      body.castShadow = true; body.receiveShadow = true; bodyKind = 'proc';
    } else bodyKind = 'tripo';
    leanG.add(body);
  }
  scene.add(rig);
  const G = () => GEOM[bodyKind || 'proc'];
  // a point in the scooter's space (with the lean) -> world
  const toWorld = (x, y, z, out = V()) => leanG.localToWorld(out.set(x, y, z));

  // ---------------------------------------------------------------- items (one per parked vespa)
  function items(W, H, startMode) {
    st.W = W; st.H = H; st.startMode = startMode;
    const out = [];
    for (let k = 0; k < 3; k++) {
      const sp = () => { const L = spots(); const s = L && L[k]; return s && !s.hidden ? s : null; };
      const sideOf = s => V(s.x + Math.cos(s.ry) * 0.75, 0, s.z - Math.sin(s.ry) * 0.75); // the rider's left side
      out.push({
        id: 'ia_vespa' + k, label: () => 'Sali sulla Vespa', range: 1.25,
        anchor: () => { const s = sp(); return s ? sideOf(s) : FAR; }, top: () => { const s = sp(); return s ? V(s.x, 1.35, s.z) : FAR; },
        act: () => {
          const s = sp(); if (!s) return;
          if (W.carry) { toast('Con l\'estintore in mano? Posalo prima'); return; }
          H.goTo(sideOf(s), s.ry, () => mount(s, W, H, startMode), { ignore: ['vespa' + s.i] });
        },
      });
    }
    return out;
  }
  const FAR = V(1e5, 0, 1e5);

  async function mount(s, W, H, startMode) {
    await ensureBody(s);
    rig.position.set(s.x, 0, s.z); rig.rotation.set(0, s.ry, 0); leanG.rotation.set(0, 0, 0); rig.visible = true; rig.updateMatrixWorld(true);
    s.hidden = true; writeInstance(s, false);
    st.riding = { s, yaw: s.ry, speed: 0, steer: 0, lean: 0, phase: 'mount', t: 0, from: man.root.position.clone(), crash: 0, prevPos: rig.position.clone() };
    startMode();
    try { window.__combat && window.__combat.holster && window.__combat.holster(); } catch (e) { } // motor (v8): no weapons on the Vespa
    engineStart();
    unlock('vespa');
    ev('è salito su una Vespa che non è sua');
    say(rnd(LINES.mount), 'sei salito su una Vespa parcheggiata in strada');
    toast('In sella! W/S gas e freno · A/D sterzo · Spazio clacson · E per scendere');
  }
  function dismount(W, H) {
    const R = st.riding; if (!R || R.phase !== 'ride') return;
    R.phase = 'off'; R.t = 0; R.speed = 0; engineStop();
  }
  function finishOff(W, H) {
    const R = st.riding; if (!R) return;
    const s = R.s; s.x = rig.position.x; s.z = rig.position.z; s.ry = R.yaw; s.hidden = false;
    st.circles[s.i] && st.circles[s.i].c.set(s.x, 0, s.z);
    writeInstance(s, true); rig.visible = false;
    man.sit = null; man.model.rotation.z = 0;
    st.riding = null;
    H.setMode('explore');
  }

  // ---------------------------------------------------------------- engine (WebAudio, created on mount)
  function engineStart() {
    const A = audio && audio.ctx; if (!A || st.eng) return;
    try {
      const out = A.createGain(); out.gain.value = 0;
      const lp = A.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 2;
      const o1 = A.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 32;
      const o2 = A.createOscillator(); o2.type = 'square'; o2.frequency.value = 64.5;
      const g2 = A.createGain(); g2.gain.value = 0.35;
      const am = A.createGain(); am.gain.value = 0.55; // putt-putt: amplitude chopped by an LFO at the firing rate
      const lfo = A.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 9; const lfoG = A.createGain(); lfoG.gain.value = 0.45;
      lfo.connect(lfoG); lfoG.connect(am.gain);
      o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(am); am.connect(out); out.connect(audio.room || audio.master);
      const t = A.currentTime; o1.start(t); o2.start(t); lfo.start(t);
      out.gain.linearRampToValueAtTime(0.11 * ((audio.vol && audio.vol.sfx) ?? 0.9), t + 0.4);
      st.eng = { A, out, lp, o1, o2, lfo };
      audio.sfx && audio.sfx('click', 0.5);
    } catch (e) { st.eng = null; }
  }
  function engineSet(rpm) {
    const E = st.eng; if (!E) return; const t = E.A.currentTime;
    E.o1.frequency.setTargetAtTime(30 + rpm * 62, t, 0.08); E.o2.frequency.setTargetAtTime((30 + rpm * 62) * 2.02, t, 0.08);
    E.lfo.frequency.setTargetAtTime(8 + rpm * 26, t, 0.08); E.lp.frequency.setTargetAtTime(520 + rpm * 1500, t, 0.1);
  }
  function engineStop() {
    const E = st.eng; if (!E) return; st.eng = null; const t = E.A.currentTime;
    try { E.out.gain.cancelScheduledValues(t); E.out.gain.setValueAtTime(E.out.gain.value, t); E.out.gain.linearRampToValueAtTime(0, t + 0.5); for (const o of [E.o1, E.o2, E.lfo]) o.stop(t + 0.6); } catch (e) { }
    setTimeout(() => { try { E.out.disconnect(); } catch (e) { } }, 900);
  }
  function horn() {
    const A = audio && audio.ctx; if (!A) return; const t = A.currentTime;
    try {
      const g = A.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.09, t + 0.02); g.gain.setValueAtTime(0.09, t + 0.32); g.gain.linearRampToValueAtTime(0, t + 0.4);
      const lp = A.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; g.connect(lp); lp.connect(audio.room || audio.master);
      for (const f of [415, 523]) { const o = A.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + 0.42); }
    } catch (e) { }
  }

  // ---------------------------------------------------------------- collisions
  const dogPos = () => { const d = window.__app && window.__app.dog; return d && d.root ? d.root.position : null; };
  // probes: the leading end (front going forward, rear in reverse) + the middle. The trailing end is not tested, so a
  // vespa parked against something (the neighbour scooter, a wall) can always drive away from it.
  function blockedAt(x, z, yaw, W, dir = 1) {
    const g = G(), fx = Math.sin(yaw), fz = Math.cos(yaw);
    for (const k of [(dir >= 0 ? 1 : -1) * (g.half - 0.25), 0]) {
      const px = x + fx * k, pz = z + fz * k;
      if (level && level.isWalkable && !level.isWalkable(px, pz, 0.3)) return true;
      for (const c of (W.extraCircles || [])) { if (c.vespa && c.id === 'vespa' + (st.riding && st.riding.s.i)) continue; const cx = c.c.x, cz = c.c.z; if ((px - cx) ** 2 + (pz - cz) ** 2 < (c.r + 0.3) ** 2) return true; }
      const dp = dogPos(); if (dp && (px - dp.x) ** 2 + (pz - dp.z) ** 2 < 0.45 ** 2) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- per frame (mode 'vespa')
  function update(W, H, dt, I, keys) {
    const R = st.riding; if (!R) { H.setMode('explore'); return {}; }
    W.focus = null; W.vel && W.vel.set(0, 0, 0);
    R.t += dt;
    const g = G();
    let sitW = 1;
    if (R.phase === 'mount') { sitW = smooth(R.t / 0.55); if (R.t > 0.55) { R.phase = 'ride'; R.t = 0; } }
    else if (R.phase === 'off') { sitW = 1 - smooth(R.t / 0.5); }
    else {
      // ---- input
      let x = 0, y = 0;
      if (I.k('KeyW') || I.k('ArrowUp')) y += 1; if (I.k('KeyS') || I.k('ArrowDown')) y -= 1;
      if (I.k('KeyA') || I.k('ArrowLeft')) x -= 1; if (I.k('KeyD') || I.k('ArrowRight')) x += 1;
      const P = I.pads && I.pads[0]; if (P) { x += P.axes[0] || 0; y -= P.axes[1] || 0; if (I.padHeld && I.padHeld(0, 7)) y = Math.max(y, 1); if (I.padHeld && I.padHeld(0, 6)) y = Math.min(y, -1); }
      if (I.touch && I.touch.active) { x += I.touch.x; y -= I.touch.y; }
      x = clamp(x, -1, 1); y = clamp(y, -1, 1);
      if (st.frozen) { x = 0; y = 0; R.speed = 0; }
      // ---- nitro (Shift / RB / touch NITRO): +35% top speed, punchier, a tank that refills slowly
      const wantN = !st.frozen && y > 0.1 && (I.k('ShiftLeft') || I.k('ShiftRight') || (I.padHeld && I.padHeld(0, 5)) || (I.tHeld && I.tHeld('nitro')));
      st.nitroOn = wantN && st.nitro > 0.02; st.nitro = st.nitroOn ? Math.max(0, st.nitro - dt / 3) : Math.min(1, st.nitro + dt * 0.07);
      const MX = MAX * st.mul.max * (st.nitroOn ? 1.35 : 1), AC = st.mul.acc * (st.nitroOn ? 1.6 : 1);
      // ---- longitudinal
      let a = 0;
      if (y > 0.05) a = (R.speed < 0 ? 6 : 3.4 * AC * (1 - smooth(R.speed / MX) * 0.85)) * y;
      else if (y < -0.05) a = R.speed > 0.25 ? -7.5 * -y : -1.8 * -y;
      else a = -Math.sign(R.speed) * Math.min(Math.abs(R.speed) / Math.max(dt, 1e-3), 0.9 + Math.abs(R.speed) * 0.12);
      R.speed = clamp(R.speed + a * dt, -REV, Math.max(MX, Math.min(R.speed, MAX * 1.5)));
      // ---- steering: stronger at low speed, gentle at full speed, none when still
      R.steer += (x - R.steer) * (1 - Math.exp(-dt * 6));
      const sp = Math.abs(R.speed), dir = Math.sign(R.speed || 1);
      const yawRate = -R.steer * clamp(sp / 2.2, 0, 1) * (2.1 - 1.0 * clamp(sp / MAX)) * dir;
      R.yaw = wrapA(R.yaw + yawRate * dt);
      // ---- move in sub-steps (no tunnelling through thin walls)
      const dist = R.speed * dt, n = Math.max(1, Math.ceil(Math.abs(dist) / 0.12));
      for (let k = 0; k < n; k++) {
        const nx = rig.position.x + Math.sin(R.yaw) * dist / n, nz = rig.position.z + Math.cos(R.yaw) * dist / n;
        if (blockedAt(nx, nz, R.yaw, W, Math.sign(R.speed) || 1)) {
          const hit = Math.abs(R.speed);
          // try sliding along the obstacle by nudging the heading a little
          let slid = false;
          for (const dy of [0.25, -0.25]) { const y2 = R.yaw + dy * Math.sign(R.steer || 1); const sx = rig.position.x + Math.sin(y2) * dist / n * 0.6, sz = rig.position.z + Math.cos(y2) * dist / n * 0.6; if (hit < 3 && !blockedAt(sx, sz, R.yaw, W, Math.sign(R.speed) || 1)) { rig.position.x = sx; rig.position.z = sz; R.speed *= 0.6; slid = true; break; } }
          if (!slid) { R.speed = -R.speed * 0.25; if (hit > 2.2) crash(hit); }
          break;
        }
        rig.position.x = nx; rig.position.z = nz;
      }
      st.dist += rig.position.distanceTo(R.prevPos); R.prevPos.copy(rig.position);
      if (st.dist > 300 && !st.giro) { st.giro = 1; unlock('vespa300'); ev('ha fatto il giro dei portici in Vespa'); }
      // ---- lean + engine
      const leanT = -R.steer * clamp(sp / MAX * 1.6, 0, 1) * 0.32 * dir;
      R.lean += (leanT - R.lean) * (1 - Math.exp(-dt * 4));
      engineSet(clamp(sp / MAX) * 0.85 + (y > 0.05 ? 0.15 : 0));
      // ---- horn / comments / get off
      if (I.pressed('Space') || I.pressed('KeyF') || (I.tPressed && I.tPressed('alt'))) { horn(); if (st.hornT <= 0 && Math.random() < 0.5) say(rnd(LINES.horn), 'ti suona col clacson della Vespa'); st.hornT = 4; }
      st.hornT = Math.max(0, st.hornT - dt); st.commentT = Math.max(0, st.commentT - dt);
      if ((keys.actP || keys.backP) && R.t > 0.4 && !(st.exitGuard && st.exitGuard())) dismount(W, H);
    }
    // ---- place the scooter, the rider and his limbs
    rig.rotation.y = R.yaw; leanG.rotation.z = R.phase === 'ride' ? R.lean : R.lean * sitW; rig.updateMatrixWorld(true);
    const seatProj = toWorld(0, 0, g.seatZ, t2); seatProj.y = 0;
    if (R.phase === 'mount') man.root.position.lerpVectors(R.from, seatProj, sitW);
    else if (R.phase === 'off') { const side = V(rig.position.x + Math.cos(R.yaw) * 0.75, 0, rig.position.z - Math.sin(R.yaw) * 0.75); man.root.position.lerpVectors(seatProj, side, 1 - sitW); if (R.t > 0.55) { finishOff(W, H); return {}; } }
    else man.root.position.copy(seatProj);
    W.yaw = R.yaw; man.model.rotation.z = leanG.rotation.z * sitW;
    man.sit = {
      src: 'vespa', hip: toWorld(0, g.seatY + 0.08, g.seatZ + 0.04),
      feet: { Left: toWorld(0.12, g.floorY + 0.09, g.floorZ), Right: toWorld(-0.12, g.floorY + 0.09, g.floorZ) },
      w: sitW, tilt: 0.12,
    };
    const gl = toWorld(g.gripX, g.gripY, g.gripZ), gr = toWorld(-g.gripX, g.gripY, g.gripZ);
    const ahead = V(rig.position.x + Math.sin(R.yaw) * 6, 1.4, rig.position.z + Math.cos(R.yaw) * 6);
    return { rL: { pos: gl, w: sitW, palm: 'down', grip: 1 }, rR: { pos: gr, w: sitW, palm: 'down', grip: 1 }, lookW: 1, lookAt: ahead };
  }
  function crash(hit) {
    const R = st.riding; if (!R) return;
    audio && audio.sfx && (audio.sfx('thud', Math.min(1, hit / 6)), audio.sfx('clank', 0.5));
    R.shake = Math.min(1, hit / 6);
    if (st.commentT <= 0) { st.commentT = 5; say(rnd(LINES.crash), 'sei andato a sbattere con la Vespa'); }
    if (hit > 5) { toast('Ahia! Piano con la Vespa'); ev('è andato a sbattere con la Vespa'); }
  }

  // ---------------------------------------------------------------- chase camera
  const camOut = { pos: V(), look: V(), fov: 50 };
  function camera(W, pose, dt) {
    const R = st.riding; if (!R || !pose) return null;
    const dragging = performance.now() - (input.drag ? input.drag.last : 0) < 1500;
    if (!dragging && R.phase === 'ride' && Math.abs(R.speed) > 0.4) {
      const want = R.yaw + PI; let d = wrapA(want - W.camYaw); W.camYaw += d * (1 - Math.exp(-dt * 2.6));
    }
    const keepD = W.camDist, keepP = W.camPitch;
    W.camDist = 3.4 + clamp(Math.abs(R.speed) / MAX) * 1.4; W.camPitch = Math.max(0.16, Math.min(keepP, 0.55));
    const p = W.followPose(rig.position.clone().add(V(0, 0.35, 0)), W.camYaw);
    W.camDist = keepD; W.camPitch = keepP;
    // portico columns, trees, lamps (circle colliders) don't block followPose: pull the camera in front of them
    {
      const ox = p.look.x, oz = p.look.z, dx = p.pos.x - ox, dz = p.pos.z - oz, L = Math.hypot(dx, dz);
      if (L > 0.5) {
        const ux = dx / L, uz = dz / L; let best = L;
        for (const c of (level && level.colliders) || []) {
          if (c.type !== 'circle') continue;
          const cx = c.c[0] - ox, cz = c.c[1] - oz; if (cx * cx + cz * cz > (L + 1) * (L + 1)) continue;
          const tca = cx * ux + cz * uz; if (tca < 0) continue;
          const d2 = cx * cx + cz * cz - tca * tca, r = c.r + 0.22; if (d2 > r * r) continue;
          const th = tca - Math.sqrt(r * r - d2); if (th > 0.3 && th < best) best = th;
        }
        if (best < L) { const k = Math.max(0.9, best - 0.1) / L; p.pos.set(ox + dx * k, p.look.y + (p.pos.y - p.look.y) * k + (1 - k) * 0.35, oz + dz * k); }
      }
    }
    camOut.pos.copy(p.pos); camOut.look.copy(p.look); camOut.fov = 52 + clamp(Math.abs(R.speed) / MAX) * 8;
    if (R.shake > 0) { R.shake = Math.max(0, R.shake - dt * 2.5); camOut.pos.x += (Math.random() - 0.5) * 0.12 * R.shake; camOut.pos.y += (Math.random() - 0.5) * 0.12 * R.shake; }
    return camOut;
  }

  // ---------------------------------------------------------------- per frame, any mode (colliders of the parked vespe)
  function pre(W) {
    if (!W) return;
    const L = spots(); if (!L) return;
    W.extraCircles = (W.extraCircles || []).filter(c => !c.vespa).concat(st.circles.filter((c, i) => !L[i].hidden));
    if (!st.riding) { if (man.model.rotation.z !== 0) man.model.rotation.z = 0; if (man.sit && man.sit.src === 'vespa') man.sit = null; }
  }

  // ---------------------------------------------------------------- motor/ hooks (races, window.__vehicles)
  function place(x, z, yaw) { const R = st.riding; if (!R) return false; rig.position.set(x, 0, z); R.yaw = yaw; R.speed = 0; R.prevPos.copy(rig.position); return true; }
  // get on a vespa right here (no walk): the nearest parked one is moved under you
  async function mountAt(x, z, yaw) {
    if (st.riding) { place(x, z, yaw); return true; }
    const L = spots(); if (!L || !st.W) return false;
    let best = null, bd = 1e9; for (const s of L) { if (s.hidden) continue; const d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < bd) { bd = d; best = s; } }
    if (!best) return false;
    best.x = x; best.z = z; best.ry = yaw; st.circles[best.i] && st.circles[best.i].c.set(x, 0, z); writeInstance(best, true);
    man.root.position.set(x + Math.cos(yaw) * 0.75, 0, z - Math.sin(yaw) * 0.75);
    await mount(best, st.W, st.H, st.startMode); return true;
  }
  const info = () => { const R = st.riding; return R ? { x: rig.position.x, z: rig.position.z, yaw: R.yaw, speed: R.speed, nitro: st.nitro, nitroOn: st.nitroOn, phase: R.phase } : null; };
  const leave = () => { if (st.riding && st.W) dismount(st.W, st.H); };
  const api = { items, update, camera, pre, get riding() { return !!st.riding; }, state: st, dismount, rig, place, mountAt, info, leave, freeze: v => { st.frozen = !!v; }, writeInstance, spots, GEOM, ensureBody }; // writeInstance/spots/GEOM: motor/ shows the others' vespe online
  window.__vespa = api; // debug / tests
  return api;
}
