import * as THREE from 'three';
import { clamp } from './util.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const Q = () => new THREE.Quaternion();
const _q = Q(), _q2 = Q(), _q3 = Q();
const UP = V(0, 1, 0), DOWN = V(0, -1, 0);
const sm = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const wp = (o, v = V()) => o.getWorldPosition(v);

function recolorSuit(mat) {
  const img = mat.map && mat.map.image; if (!img) return;
  const w = img.width, h = img.height;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const id = x.getImageData(0, 0, w, h), d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = mx, s = mx ? (mx - mn) / mx : 0;
    let hh = 0; if (mx !== mn) { if (mx === r) hh = ((g - b) / (mx - mn)) % 6; else if (mx === g) hh = (b - r) / (mx - mn) + 2; else hh = (r - g) / (mx - mn) + 4; hh *= 60; if (hh < 0) hh += 360; }
    // salmon / pink fabric -> charcoal navy wool
    const salmon = (hh < 32 || hh > 335) && s > 0.08 && s < 0.5 && l > 0.42;
    if (salmon) {
      const k = Math.min(1, (s - 0.08) / 0.08) * Math.min(1, (l - 0.42) / 0.08);
      const lum = (0.3 * r + 0.59 * g + 0.11 * b) / 0.68;
      const nr = 0.16 * lum, ng = 0.19 * lum, nb = 0.27 * lum;
      d[i] = (r + (nr - r) * k) * 255; d[i + 1] = (g + (ng - g) * k) * 255; d[i + 2] = (b + (nb - b) * k) * 255;
    }
  }
  x.putImageData(id, 0, 0);
  const t = new THREE.CanvasTexture(c); t.flipY = mat.map.flipY; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = mat.map.wrapS; t.wrapT = mat.map.wrapT; t.anisotropy = 8;
  mat.map = t; mat.needsUpdate = true;
}

// procedural one-shot gestures: duration (s) and per-frame spec builder
const GESTURES = {
  wave: { dur: 2.4 }, cheer: { dur: 2.0 }, facepalm: { dur: 2.2 }, shrug: { dur: 1.7 }, pointScreen: { dur: 2.0 }, typeTap: { dur: 0.22 },
  throw: { dur: 0.95 }, whistle: { dur: 1.15 }, signal: { dur: 1.0 }, twirl: { dur: 1.3 }, signalDown: { dur: 1.1 }, clap: { dur: 1.0 },
};
export const THROW_RELEASE = 0.43; // seconds into gesture('throw') when the ball leaves the hand
const LOCO = ['Idle', 'Walk', 'Run'];
const WALK_SPEED = 1.55, RUN_SPEED = 3.6; // m/s at timeScale 1 (measured from the clips)

export class Man {
  constructor(gltf, animJson) {
    this.root = new THREE.Group();
    this.model = gltf.scene;
    this.root.add(this.model);
    this.bones = {}; this.allBones = []; this.morphs = [];
    this.model.traverse(o => {
      if (o.isBone) { this.bones[o.name] = o; this.allBones.push(o); o.userData.q0 = o.quaternion.clone(); o.userData.p0 = o.position.clone(); o.userData.qa = o.quaternion.clone(); o.userData.pa = o.position.clone(); }
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
        const m = o.material;
        if (m && /Outfit_Top|Outfit_Bottom/.test(m.name)) recolorSuit(m);
        if (m) { m.envMapIntensity = 0.8; }
        if (m && m.name === 'Wolf3D_Skin') { m.roughness = 0.62; }
        if (o.morphTargetDictionary && o.morphTargetInfluences) this.morphs.push(o);
      }
    });
    const B = this.bones;
    this.model.updateMatrixWorld(true);
    const inv = b => b.getWorldQuaternion(Q()).invert();
    this.headLocalFwd = V(0, 0, 1).applyQuaternion(inv(B.Head)); // character faces +Z in bind pose
    this.eyeLocalFwd = {};
    for (const e of ['LeftEye', 'RightEye']) if (B[e]) this.eyeLocalFwd[e] = V(0, 0, 1).applyQuaternion(inv(B[e]));
    this.clips = {};
    for (const j of animJson) { const c = THREE.AnimationClip.parse(j); this.clips[c.name] = c; }
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const n in this.clips) this.actions[n] = this.mixer.clipAction(this.clips[n]);
    this.locoW = { Idle: 1, Walk: 0, Run: 0 };
    for (const n of LOCO) if (this.actions[n]) { this.actions[n].play(); this.actions[n].setEffectiveWeight(n === 'Idle' ? 1 : 0); }
    this.full = {}; // full-body clips: name -> {action, target}
    this.upper = null; // legacy upper-body clip (headShake / agree)
    this.speed = 0;
    // cabinet IK (legacy API used by main.js)
    this.ik = 0; this.lean = 0; this.look = 0; this.press = 0;
    this.lookTarget = V(); this.leftTarget = V(); this.rightTarget = V();
    this.fwd = V(0, 0, -1); // kept for compatibility; body forward is derived from root rotation
    this.walkW = 0; // legacy
    // new procedural layers
    this.crouch = 0; // 0..1
    this.kneel = 0; // 0..1 one-knee kneel
    this.kneelSide = 'Right'; // which knee goes on the floor (the other foot is planted forward)
    this.reach = { left: null, right: null }; // {pos:Vector3, w:0..1, palm:'down'|'forward'|'in'|'up'|'side'|'face', grip:0..1, pole?, dir?, normal?}
    this.smile = 0.15; this.mouth = 0;
    this.active = []; // procedural gestures
    this.t = 0; this._sacc = { t: 0, yaw: 0, pitch: 0, ty: 0, tp: 0 };
    this._expr = { smile: 0.15, mouth: 0 };
  }

  // ---------- clips ----------
  setSpeed(s, back = false) { this.speed = Math.max(0, s); this.back = !!back && s > 0.05; } // back: walking backwards (Walk clip reversed)
  playClip(name, { loop = false, fade = 0.25, timeScale = 1 } = {}) {
    const a = this.actions[name]; if (!a) return 0;
    a.reset(); a.timeScale = timeScale; a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    a.clampWhenFinished = true; a.setEffectiveWeight(1); a.fadeIn(fade); a.play();
    this.full[name] = { action: a, loop, fade };
    return a.getClip().duration / timeScale;
  }
  stopClip(name, fade = 0.35) { const f = this.full[name]; if (!f || f.stopping) return; f.action.fadeOut(fade); f.stopping = true; f.stopFade = fade; f.stopT = 0; }
  stopAllClips(fade = 0.35) { for (const n in this.full) this.stopClip(n, fade); }
  playGesture(name) { // upper-body baked gestures: 'headShake', 'agree'
    const a = this.actions[name]; if (!a) return 0;
    a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = false; a.setEffectiveWeight(1); a.fadeIn(0.25); a.play();
    this.upper = { action: a, t: 0, dur: a.getClip().duration, fading: false };
    return a.getClip().duration;
  }
  gesture(name) {
    const g = GESTURES[name]; if (!g) return 0;
    if (name !== 'typeTap') this.active = this.active.filter(x => x.name === 'typeTap');
    this.active.push({ name, t: 0, dur: g.dur, seed: Math.random() * 10 });
    return g.dur;
  }
  fullWeight() { let w = 0; for (const n in this.full) w += this.full[n].action.getEffectiveWeight(); return Math.min(1, w); }

  // ---------- frame update ----------
  update(dt) {
    this.t += dt;
    // locomotion blend
    const v = this.speed;
    const wIdle = 1 - sm(v / 0.35), wRun = sm((v - 2.0) / 0.9), wWalk = 1 - wIdle - wRun;
    const k = 1 - Math.exp(-dt * 7);
    this.locoW.Idle += (wIdle - this.locoW.Idle) * k; this.locoW.Walk += (Math.max(0, wWalk) - this.locoW.Walk) * k; this.locoW.Run += (wRun - this.locoW.Run) * k;
    this.walkW = this.locoW.Walk + this.locoW.Run;
    // full-body clips housekeeping
    for (const n in this.full) {
      const f = this.full[n], a = f.action;
      if (!f.loop && !f.stopping && a.time >= a.getClip().duration / Math.max(0.01, a.timeScale) * a.timeScale - f.fade - 0.01) this.stopClip(n, f.fade + 0.1);
      if (f.stopping) { f.stopT = (f.stopT || 0) + dt; if (f.stopT > (f.stopFade || 0.35) + 0.05) { a.stop(); delete this.full[n]; } }
    }
    const full = this.fullWeight();
    const A = this.actions;
    if (A.Idle) A.Idle.setEffectiveWeight(this.locoW.Idle * (1 - full));
    // cadence follows the ground speed down to ~0.5 m/s (less skating when starting/stopping);
    // backwards: clip reversed and a shorter stride (people step back slower)
    if (A.Walk) { A.Walk.setEffectiveWeight(this.locoW.Walk * (1 - full)); A.Walk.timeScale = (v > 0.05 ? clamp(v / (this.back ? WALK_SPEED * 0.7 : WALK_SPEED), 0.32, 1.5) : 0.85) * (this.back ? -1 : 1); }
    if (A.Run) { A.Run.setEffectiveWeight(this.locoW.Run * (1 - full)); A.Run.timeScale = clamp(v / RUN_SPEED, 0.6, 1.3); }
    // legacy upper-body clip
    if (this.upper) {
      const u = this.upper; u.t += dt;
      if (!u.fading && u.t > u.dur - 0.4) { u.action.fadeOut(0.4); u.fading = true; }
      if (u.t > u.dur + 0.1) { u.action.stop(); this.upper = null; }
    }
    // Restore last frame's pure animation pose before the mixer runs. three's PropertyMixer only writes a
    // property when its blended value changed, so resetting to the bind pose here made near-static tracks
    // (idle spine/neck) randomly snap back to bind pose (visible twitching). Restoring the previous animated
    // pose keeps unchanged tracks correct and still discards last frame's procedural (IK) edits.
    for (const b of this.allBones) { b.quaternion.copy(b.userData.qa); b.position.copy(b.userData.pa); }
    this.mixer.update(dt);
    for (const b of this.allBones) { b.userData.qa.copy(b.quaternion); b.userData.pa.copy(b.position); }
    this.root.updateMatrixWorld(true);
    this.post(dt, full);
  }

  rotateWorld(bone, q) {
    bone.getWorldQuaternion(_q2);
    _q3.copy(q).multiply(_q2);
    bone.parent.getWorldQuaternion(_q2).invert();
    bone.quaternion.copy(_q2.multiply(_q3));
    bone.updateMatrixWorld(true);
  }
  // body axes in world space
  axes() {
    const q = this.root.getWorldQuaternion(Q());
    return { fwd: V(0, 0, 1).applyQuaternion(q), left: V(1, 0, 0).applyQuaternion(q) };
  }

  post(dt, full) {
    const B = this.bones; const { fwd, left } = this.axes();
    const live = 1 - full;
    const upperW = this.upper ? this.upper.action.getEffectiveWeight() : 0;
    // gestures: advance + envelope
    const specs = { Left: null, Right: null }; let hop = 0, headDown = 0, shoulderUp = 0, twist = 0;
    let smileT = this.smile, mouthT = this.mouth;
    for (const g of this.active) g.t += dt;
    this.active = this.active.filter(g => g.t < g.dur);
    const sh = { Left: wp(B.LeftArm), Right: wp(B.RightArm) };
    const head = wp(B.Head);
    for (const g of this.active) {
      const e = sm(g.t / 0.32) * sm((g.dur - g.t) / 0.38) * live; if (e <= 0) continue;
      const out = s => left.clone().multiplyScalar(s === 'Left' ? 1 : -1);
      const put = (s, pos, palm, grip, pole, extra = {}) => { specs[s] = { pos, palm, grip, pole, e, ...extra }; };
      if (g.name === 'wave') {
        const p = sh.Right.clone().addScaledVector(UP, 0.3).addScaledVector(out('Right'), 0.2 + Math.sin(g.t * 11) * 0.07).addScaledVector(fwd, 0.12);
        put('Right', p, 'forward', 0.05, sh.Right.clone().addScaledVector(out('Right'), 0.45).addScaledVector(DOWN, 0.25));
        smileT = Math.max(smileT, 0.8 * e);
      } else if (g.name === 'cheer') {
        const pump = Math.abs(Math.sin(g.t * 5.5));
        for (const s of ['Left', 'Right']) put(s, sh[s].clone().addScaledVector(UP, 0.36 + pump * 0.16).addScaledVector(out(s), 0.1).addScaledVector(fwd, 0.06), 'forward', 1, sh[s].clone().addScaledVector(out(s), 0.5).addScaledVector(DOWN, 0.2));
        hop = Math.max(hop, pump * 0.05 * e); smileT = Math.max(smileT, e); mouthT = Math.max(mouthT, 0.55 * e);
      } else if (g.name === 'facepalm') {
        const p = head.clone().addScaledVector(fwd, 0.13).addScaledVector(DOWN, 0.06);
        put('Right', p, 'face', 0.25, sh.Right.clone().addScaledVector(DOWN, 0.45).addScaledVector(fwd, 0.25).addScaledVector(out('Right'), 0.1));
        headDown = Math.max(headDown, 0.35 * e); smileT = Math.min(smileT, 1 - e); mouthT = Math.max(mouthT, 0.15 * e);
      } else if (g.name === 'shrug') {
        const hips = wp(B.Hips);
        for (const s of ['Left', 'Right']) put(s, hips.clone().addScaledVector(out(s), 0.36).addScaledVector(fwd, 0.22).addScaledVector(UP, 0.12), 'up', 0.1, sh[s].clone().addScaledVector(out(s), 0.2).addScaledVector(DOWN, 0.5).addScaledVector(fwd, -0.2));
        shoulderUp = Math.max(shoulderUp, 0.18 * e); smileT = Math.min(smileT, 0.3 + 0.2 * (1 - e)); mouthT = Math.max(mouthT, 0.1 * e);
      } else if (g.name === 'throw') {
        const u = g.t;
        const back = sh.Right.clone().addScaledVector(UP, 0.06).addScaledVector(fwd, -0.24).addScaledVector(out('Right'), 0.2);
        const rel = sh.Right.clone().addScaledVector(UP, 0.12).addScaledVector(fwd, 0.5).addScaledVector(out('Right'), 0.02);
        const thru = sh.Right.clone().addScaledVector(UP, -0.28).addScaledVector(fwd, 0.36).addScaledVector(out('Right'), -0.1);
        const p = u < 0.36 ? back : u < 0.5 ? back.clone().lerp(rel, sm((u - 0.36) / 0.14)) : rel.clone().lerp(thru, sm((u - 0.5) / 0.3));
        put('Right', p, u < 0.45 ? 'forward' : 'down', u < 0.45 ? 0.75 : 0.15, sh.Right.clone().addScaledVector(out('Right'), 0.45).addScaledVector(DOWN, 0.2).addScaledVector(fwd, -0.2));
        put('Left', sh.Left.clone().addScaledVector(fwd, 0.38).addScaledVector(UP, -0.05 + (u < 0.4 ? 0.12 : 0)).addScaledVector(out('Left'), 0.05), 'down', 0.3, sh.Left.clone().addScaledVector(out('Left'), 0.4).addScaledVector(DOWN, 0.4));
        twist = (u < 0.4 ? -0.45 * sm(u / 0.3) : -0.45 + 0.8 * sm((u - 0.4) / 0.2)) * e;
        mouthT = Math.max(mouthT, 0.25 * e);
      } else if (g.name === 'whistle') {
        put('Right', head.clone().addScaledVector(fwd, 0.1).addScaledVector(DOWN, 0.075).addScaledVector(out('Right'), 0.015), 'face', 0.55, sh.Right.clone().addScaledVector(DOWN, 0.45).addScaledVector(fwd, 0.2).addScaledVector(out('Right'), 0.15));
        mouthT = Math.max(mouthT, 0.2 * e); smileT = Math.min(smileT, 0.2);
      } else if (g.name === 'signal') {
        const lift = Math.sin(Math.min(1, g.t / g.dur) * Math.PI);
        put('Right', sh.Right.clone().addScaledVector(fwd, 0.42).addScaledVector(UP, 0.02 + 0.12 * lift).addScaledVector(out('Right'), 0.04), 'forward', 0.05, sh.Right.clone().addScaledVector(out('Right'), 0.4).addScaledVector(DOWN, 0.4));
        smileT = Math.max(smileT, 0.5 * e);
      } else if (g.name === 'signalDown') {
        const k2 = sm(g.t / (g.dur * 0.8));
        put('Right', sh.Right.clone().addScaledVector(fwd, 0.42).addScaledVector(UP, 0.05 - 0.4 * k2).addScaledVector(out('Right'), 0.06), 'down', 0.05, sh.Right.clone().addScaledVector(out('Right'), 0.4).addScaledVector(DOWN, 0.4));
      } else if (g.name === 'twirl') {
        const a = g.t * 9;
        put('Right', sh.Right.clone().addScaledVector(UP, 0.3).addScaledVector(fwd, 0.18 + Math.cos(a) * 0.06).addScaledVector(out('Right'), 0.08 + Math.sin(a) * 0.06), 'in', 0.85, sh.Right.clone().addScaledVector(out('Right'), 0.45).addScaledVector(DOWN, 0.3), { point: true });
        smileT = Math.max(smileT, 0.6 * e);
      } else if (g.name === 'clap') {
        const c = Math.abs(Math.sin(g.t * 11)) * 0.06;
        const mid = sh.Right.clone().lerp(sh.Left, 0.5).addScaledVector(fwd, 0.36).addScaledVector(DOWN, 0.18);
        put('Right', mid.clone().addScaledVector(out('Right'), 0.02 + c), 'in', 0.05, sh.Right.clone().addScaledVector(out('Right'), 0.4).addScaledVector(DOWN, 0.35));
        put('Left', mid.clone().addScaledVector(out('Left'), 0.02 + c), 'in', 0.05, sh.Left.clone().addScaledVector(out('Left'), 0.4).addScaledVector(DOWN, 0.35));
        smileT = Math.max(smileT, e); mouthT = Math.max(mouthT, 0.3 * e);
      } else if (g.name === 'pointScreen') {
        const dir = this.lookTarget.clone().sub(sh.Right).normalize();
        put('Right', sh.Right.clone().addScaledVector(dir, 0.5), 'down', 0.85, sh.Right.clone().addScaledVector(out('Right'), 0.3).addScaledVector(DOWN, 0.4), { point: true });
        smileT = Math.max(smileT, 0.5 * e);
      }
    }
    // smoothed expression
    const ek = 1 - Math.exp(-dt * 8);
    this._expr.smile += (Math.max(smileT, full * 0.9) - this._expr.smile) * ek; this._expr.mouth += (mouthT - this._expr.mouth) * ek;
    for (const m of this.morphs) { const d = m.morphTargetDictionary; if (d.mouthSmile !== undefined) m.morphTargetInfluences[d.mouthSmile] = this._expr.smile; if (d.mouthOpen !== undefined) m.morphTargetInfluences[d.mouthOpen] = this._expr.mouth; }

    // relax: keep un-driven upper arms close to the body (retargeted clips hold them a bit wide)
    for (const s of ['Left', 'Right']) {
      const r = this.reach[s === 'Left' ? 'left' : 'right'];
      const driven = Math.max(r ? r.w || 0 : 0, this.ik, specs[s] ? specs[s].e : 0);
      const k = live * (1 - driven); if (k < 0.01) continue;
      const out = left.clone().multiplyScalar(s === 'Left' ? 1 : -1);
      const a = wp(B[s + 'Arm']), d = wp(B[s + 'ForeArm']).sub(a); const L = d.length(); d.normalize();
      const lat = d.dot(out), maxLat = Math.sin(0.16);
      if (lat > maxLat) { const d2 = d.clone().addScaledVector(out, -(lat - maxLat)).normalize(); _q.setFromUnitVectors(d, d2); this.rotateWorld(B[s + 'Arm'], Q().slerp(_q, k)); }
    }
    // narrower, natural stance when standing
    const st = this.locoW.Idle * live * (1 - this.crouch);
    if (st > 0.02) {
      const hp = wp(B.Hips);
      for (const s of ['Left', 'Right']) {
        const foot = B[s + 'Foot'], fp = wp(foot), sg = s === 'Left' ? 1 : -1;
        const lat = fp.clone().sub(hp).dot(left) * sg;
        if (lat > 0.12) {
          const fq = foot.getWorldQuaternion(Q());
          const T = fp.clone().addScaledVector(left, -sg * (lat - 0.12) * st);
          this.twoBone(B[s + 'UpLeg'], B[s + 'Leg'], foot, T, wp(B[s + 'Leg']).addScaledVector(fwd, 0.6));
          foot.quaternion.copy(foot.parent.getWorldQuaternion(Q()).invert().multiply(fq)); foot.updateMatrixWorld(true);
        }
      }
    }
    // idle life: breathing + shoulders
    const br = Math.sin(this.t * 1.7);
    _q.setFromAxisAngle(left, -br * 0.012 * live); this.rotateWorld(B.Spine2, _q);
    for (const s of ['Left', 'Right']) { const b = B[s + 'Shoulder']; if (!b) continue; _q.setFromAxisAngle(fwd, (s === 'Left' ? 1 : -1) * (br * 0.01 + shoulderUp)); this.rotateWorld(b, _q); }
    if (hop > 0) { B.Hips.position.y += hop / Math.max(1e-6, this.model.scale.y); B.Hips.updateMatrixWorld(true); }
    if (Math.abs(twist) > 1e-3) { _q.setFromAxisAngle(UP, twist * 0.5); this.rotateWorld(B.Spine1, _q); _q.setFromAxisAngle(UP, twist * 0.5); this.rotateWorld(B.Spine2, _q); }

    // crouch with planted feet
    const kn = this.kneel * live, cr = this.crouch * live * (1 - Math.min(1, this.kneel));
    if (kn > 0.001) this.applyKneel(kn, fwd, left);
    if (cr > 0.001) this.applyCrouch(cr, fwd, left);
    // cabinet lean
    const lean = this.lean * live;
    if (lean > 0.001) for (const [n, kk] of [['Spine', 0.35], ['Spine1', 0.35], ['Spine2', 0.3]]) { _q.setFromAxisAngle(left, lean * kk); this.rotateWorld(B[n], _q); }
    // head look (gestures / clips reduce it so they stay visible)
    const look = this.look * live * (1 - 0.85 * upperW);
    if (look > 0.001) {
      const tgt = this.lookTarget.clone().addScaledVector(DOWN, headDown);
      this.aimBone(B.Neck, this.headLocalFwd, B.Head, tgt, look * 0.45);
      this.aimBone(B.Head, this.headLocalFwd, B.Head, tgt, look * 0.85);
    } else if (headDown > 0) { _q.setFromAxisAngle(left, headDown); this.rotateWorld(B.Head, _q); }
    // micro head motion + eye saccades
    const S = this._sacc; S.t -= dt;
    if (S.t <= 0) { S.t = 1.5 + Math.random() * 3.5; S.ty = (Math.random() - 0.5) * 0.16; S.tp = (Math.random() - 0.5) * 0.08; }
    S.yaw += (S.ty - S.yaw) * (1 - Math.exp(-dt * 5)); S.pitch += (S.tp - S.pitch) * (1 - Math.exp(-dt * 5));
    const micro = live * (1 - 0.6 * look) * (1 - upperW);
    if (micro > 0.01) { _q.setFromAxisAngle(UP, S.yaw * 0.35 * micro); this.rotateWorld(B.Head, _q); }
    const eyeT = look > 0.2 ? this.lookTarget : head.clone().addScaledVector(fwd, 2).addScaledVector(left, S.yaw * 3).addScaledVector(UP, S.pitch * 3);
    for (const e in this.eyeLocalFwd) this.aimBone(B[e], this.eyeLocalFwd[e], B[e], eyeT, 0.9 * live, 0.35);

    // arms
    for (const s of ['Left', 'Right']) {
      const key = s === 'Left' ? 'left' : 'right';
      let base = null;
      const r = this.reach[key];
      if (r && r.w > 0.001) base = { pos: r.pos, w: r.w, palm: r.palm || 'down', grip: r.grip ?? 0.3, pole: r.pole, dir: r.dir, normal: r.normal };
      else if (this.ik > 0.001) base = { pos: s === 'Left' ? this.leftTarget : this.rightTarget, w: this.ik, mode: s === 'Left' ? 'stick' : 'buttons' };
      const g = specs[s];
      if (!base && !g && this.kneel > 0.25 && this._kneelFront === s && B[s + 'Leg']) { // rest the free hand on the raised knee
        const kp = wp(B[s + 'Leg']).addScaledVector(UP, 0.07).addScaledVector(fwd, -0.04);
        base = { pos: kp, w: sm((this.kneel - 0.25) / 0.6) * live, palm: 'down', grip: 0.35 };
      }
      if (!base && !g) continue;
      this.solveArm(s, base, g, live, fwd, left);
    }
    // finger taps (typing) on hands that are reaching
    const taps = this.active.filter(g => g.name === 'typeTap');
    if (taps.length) for (const s of ['Left', 'Right']) {
      const r = this.reach[s === 'Left' ? 'left' : 'right']; if (!r || r.w < 0.3) continue;
      const g = taps[taps.length - 1]; const ph = Math.sin(Math.PI * g.t / g.dur);
      const fing = ['Index', 'Middle', 'Ring'][Math.floor(g.seed + (s === 'Left' ? 0 : 1.5)) % 3];
      const ax = this.fingerAxis(s); if (!ax) continue;
      for (let j = 1; j <= 2; j++) { const bn = B[s + 'Hand' + fing + j]; if (bn) { _q.setFromAxisAngle(ax, ph * 0.45 * r.w); this.rotateWorld(bn, _q); } }
    }
  }

  // rotate `bone` so that `ref` bone's local forward points at target (weight w, optional max angle)
  aimBone(bone, localFwd, ref, target, w, maxAng = 1.4) {
    const p = wp(ref); const want = target.clone().sub(p).normalize();
    const cur = localFwd.clone().applyQuaternion(ref.getWorldQuaternion(_q2)).normalize();
    let ang = cur.angleTo(want); if (ang < 1e-4) return;
    const axis = V().crossVectors(cur, want).normalize();
    ang = Math.min(ang, maxAng) * w;
    _q.setFromAxisAngle(axis, ang); this.rotateWorld(bone, _q.clone());
  }

  applyCrouch(c, fwd, left) {
    const B = this.bones;
    const legs = ['Left', 'Right'].map(s => ({ s, up: B[s + 'UpLeg'], lo: B[s + 'Leg'], foot: B[s + 'Foot'] }));
    for (const L of legs) { L.fp = wp(L.foot); L.fq = L.foot.getWorldQuaternion(Q()); }
    // drop + tilt pelvis, spine compensates
    const drop = 0.36 * c;
    const hips = B.Hips; const parentQ = hips.parent.getWorldQuaternion(Q()).invert();
    const dLocal = V(0, -drop, 0).addScaledVector(fwd, -0.06 * c).applyQuaternion(parentQ);
    const ps = hips.parent.getWorldScale(V());
    hips.position.add(dLocal.divide(ps)); hips.updateMatrixWorld(true);
    _q.setFromAxisAngle(left, 0.45 * c); this.rotateWorld(hips, _q);
    _q.setFromAxisAngle(left, -0.16 * c); this.rotateWorld(B.Spine, _q);
    _q.setFromAxisAngle(left, -0.08 * c); this.rotateWorld(B.Spine1, _q);
    for (const L of legs) {
      const knee = wp(L.lo).addScaledVector(fwd, 0.6).addScaledVector(left, (L.s === 'Left' ? 1 : -1) * 0.12);
      this.twoBone(L.up, L.lo, L.foot, L.fp, knee);
      // restore planted foot orientation
      const pq = L.foot.parent.getWorldQuaternion(Q()).invert();
      L.foot.quaternion.copy(pq.multiply(L.fq)); L.foot.updateMatrixWorld(true);
    }
  }

  // one-knee kneel: one knee down on the floor behind, the other foot planted forward; feet stay planted while blending
  applyKneel(k, fwd, left) {
    const B = this.bones;
    const dn = this.kneelSide === 'Left' ? 'Left' : 'Right', fr = dn === 'Left' ? 'Right' : 'Left';
    const lat = s => left.clone().multiplyScalar(s === 'Left' ? 1 : -1);
    const D = { up: B[dn + 'UpLeg'], lo: B[dn + 'Leg'], foot: B[dn + 'Foot'] }, F = { up: B[fr + 'UpLeg'], lo: B[fr + 'Leg'], foot: B[fr + 'Foot'] };
    for (const g of [D, F]) { g.fp = wp(g.foot); g.fq = g.foot.getWorldQuaternion(Q()); }
    const e = sm(k);
    const hips = B.Hips; const parentQ = hips.parent.getWorldQuaternion(Q()).invert();
    const h0 = wp(hips);
    const ground = Math.min(D.fp.y, F.fp.y) - 0.08; // ankle height above the floor in the clip ≈ 0.08
    const drop = Math.max(0, h0.y - (ground + 0.49)) * e;
    const dLocal = V(0, -drop, 0).addScaledVector(fwd, -0.05 * e).applyQuaternion(parentQ);
    hips.position.add(dLocal.divide(hips.parent.getWorldScale(V()))); hips.updateMatrixWorld(true);
    _q.setFromAxisAngle(left, 0.1 * e); this.rotateWorld(hips, _q);
    _q.setFromAxisAngle(left, -0.08 * e); this.rotateWorld(B.Spine, _q);
    const hp = wp(hips);
    // front leg: foot forward, knee up
    const fT = hp.clone().addScaledVector(fwd, 0.36).addScaledVector(lat(fr), 0.13); fT.y = F.fp.y;
    this.twoBone(F.up, F.lo, F.foot, F.fp.clone().lerp(fT, e), wp(F.lo).addScaledVector(fwd, 0.8).addScaledVector(UP, 0.4));
    F.foot.quaternion.copy(F.foot.parent.getWorldQuaternion(Q()).invert().multiply(F.fq)); F.foot.updateMatrixWorld(true);
    // kneeling leg: knee on the floor, shin back, toes tucked
    const dT = hp.clone().addScaledVector(fwd, -0.42).addScaledVector(lat(dn), 0.11); dT.y = ground + 0.11;
    this.twoBone(D.up, D.lo, D.foot, D.fp.clone().lerp(dT, e), hp.clone().addScaledVector(DOWN, 1.0).addScaledVector(fwd, 0.45).addScaledVector(lat(dn), 0.08));
    const toes = Q().setFromAxisAngle(left, 1.25 * e).multiply(D.fq);
    D.foot.quaternion.copy(D.foot.parent.getWorldQuaternion(Q()).invert().multiply(toes)); D.foot.updateMatrixWorld(true);
    this._kneelFront = fr;
  }

  twoBone(up, lo, end, target, pole) {
    const A = wp(up), Bp = wp(lo), C = wp(end);
    const l1 = A.distanceTo(Bp), l2 = Bp.distanceTo(C);
    const AT = V().subVectors(target, A); const d = clamp(AT.length(), Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.002);
    const dir = AT.normalize();
    const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    const P = V().subVectors(pole, A); const perp = P.addScaledVector(dir, -P.dot(dir));
    if (perp.lengthSq() < 1e-8) perp.set(0, -1, 0); perp.normalize();
    const E = V().copy(A).addScaledVector(dir, l1 * cosA).addScaledVector(perp, l1 * sinA);
    const Tc = V().copy(A).addScaledVector(dir, d);
    _q.setFromUnitVectors(V().subVectors(Bp, A).normalize(), V().subVectors(E, A).normalize()); this.rotateWorld(up, _q.clone());
    wp(lo, Bp); wp(end, C);
    _q.setFromUnitVectors(V().subVectors(C, Bp).normalize(), V().subVectors(Tc, Bp).normalize()); this.rotateWorld(lo, _q.clone());
  }

  handFrame(s) { // current world frame of the hand: f (to middle finger), palm normal
    const B = this.bones, h = wp(B[s + 'Hand']);
    const f = wp(B[s + 'HandMiddle1']).sub(h).normalize();
    const sd = wp(B[s + 'HandIndex1']).sub(wp(B[s + 'HandPinky1'])).normalize();
    const palm = V().crossVectors(f, sd).normalize().multiplyScalar(s === 'Left' ? 1 : -1);
    palm.addScaledVector(f, -palm.dot(f)).normalize();
    return { f, palm };
  }
  fingerAxis(s) { const { f, palm } = this.handFrame(s); return V().crossVectors(f, palm).normalize(); }
  frameQ(F, N) { const n = N.clone().addScaledVector(F, -N.dot(F)).normalize(); return Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(F, n, V().crossVectors(F, n))); }
  palmFrame(type, s, fwd, left, spec) {
    const out = left.clone().multiplyScalar(s === 'Left' ? 1 : -1);
    if (spec && spec.dir && spec.normal) return [spec.dir.clone().normalize(), spec.normal.clone().normalize()];
    switch (type) {
      case 'up': return [fwd.clone(), UP.clone()];
      case 'forward': return [UP.clone().addScaledVector(fwd, 0.15).normalize(), fwd.clone()];
      case 'in': return [UP.clone().multiplyScalar(0.75).addScaledVector(fwd, 0.3).normalize(), out.clone().negate()];
      case 'face': return [UP.clone().addScaledVector(out, -0.2).normalize(), fwd.clone().negate()];
      case 'side': return [fwd.clone().addScaledVector(DOWN, 0.2).normalize(), out.clone().negate()];
      case 'stick': return [fwd.clone().addScaledVector(DOWN, 0.9).addScaledVector(out, -0.25).normalize(), DOWN.clone().addScaledVector(out, -0.35)];
      case 'buttons': return [fwd.clone().addScaledVector(DOWN, 0.5).normalize(), DOWN.clone()];
      default: return [fwd.clone().addScaledVector(DOWN, 0.35).normalize(), DOWN.clone()];
    }
  }

  // base: {pos,w,palm,grip,pole,mode} or null; g: gesture spec {pos,palm,grip,pole,e,point} or null
  solveArm(s, base, g, live, fwd, left) {
    const B = this.bones;
    const up = B[s + 'Arm'], lo = B[s + 'ForeArm'], hand = B[s + 'Hand'];
    const out = left.clone().multiplyScalar(s === 'Left' ? 1 : -1);
    const A = wp(up), C = wp(hand);
    const bw = base ? base.w * live : 0, ge = g ? g.e : 0;
    const w = Math.max(bw, ge); if (w < 0.001) return;
    // base target along a natural arc: from the hanging hand forward/up in front of the body, never past the hips
    let T = C.clone();
    if (base && bw > 0) {
      const high = base.pos.y > A.y - 0.12;
      const M = A.clone().addScaledVector(fwd, 0.32).addScaledVector(out, high ? 0.14 : 0.05).addScaledVector(DOWN, high ? 0.12 : 0.36);
      const u = sm(bw);
      T = C.clone().multiplyScalar((1 - u) * (1 - u)).addScaledVector(M, 2 * (1 - u) * u).addScaledVector(base.pos, u * u);
    }
    if (g) T.lerp(g.pos, ge);
    // elbow pole
    const poleRaise = A.clone().addScaledVector(out, 0.18).addScaledVector(DOWN, 0.5).addScaledVector(fwd, -0.25);
    const poleBase = base && base.pole ? base.pole : A.clone().addScaledVector(out, 0.35).addScaledVector(DOWN, 0.45).addScaledVector(fwd, -0.15);
    const pole = poleRaise.clone().lerp(poleBase, sm(bw));
    if (g && g.pole) pole.lerp(g.pole, ge);
    this.twoBone(up, lo, hand, T, pole);
    // hand orientation
    const cur = this.handFrame(s);
    const qCur = this.frameQ(cur.f, cur.palm);
    let qDes;
    if (base) { const [F, N] = this.palmFrame(base.mode || base.palm, s, fwd, left, base); qDes = this.frameQ(F, N); }
    if (g) { const [F, N] = this.palmFrame(g.palm, s, fwd, left); const qg = this.frameQ(F, N); qDes = qDes ? qDes.slerp(qg, ge) : qg; }
    const delta = qDes.multiply(qCur.invert());
    this.rotateWorld(hand, Q().slerp(delta, w));
    // fingers
    const ax = this.fingerAxis(s);
    let curls;
    if (base && base.mode === 'stick' && !(g && ge > 0.5)) curls = { Index: [0.55, 0.8, 0.45], Middle: [0.6, 0.85, 0.45], Ring: [0.65, 0.85, 0.45], Pinky: [0.7, 0.8, 0.45], th: [0.5, 0.35] };
    else if (base && base.mode === 'buttons' && !(g && ge > 0.5)) { const p = this.press; curls = { Index: [0.2 + p * 0.4, 0.28 + p * 0.3, 0.2], Middle: [0.22 + p * 0.35, 0.3 + p * 0.2, 0.2], Ring: [0.4, 0.55, 0.35], Pinky: [0.5, 0.6, 0.35], th: [0.25, 0.35] }; }
    else {
      const grip = g && ge > 0.5 ? g.grip : (base ? base.grip : 0.3);
      const c = (a, b) => [0.12 + grip * a, 0.15 + grip * b, 0.1 + grip * b * 0.6];
      curls = { Index: c(1.05, 1.35), Middle: c(1.1, 1.4), Ring: c(1.15, 1.4), Pinky: c(1.2, 1.35), th: [0.2 + grip * 0.5, 0.2 + grip * 0.5] };
      if (g && g.point && ge > 0.3) curls.Index = [0.05, 0.05, 0.02];
    }
    for (const fn of ['Index', 'Middle', 'Ring', 'Pinky']) for (let j = 0; j < 3; j++) {
      const bn = B[s + 'Hand' + fn + (j + 1)]; if (!bn) continue;
      _q.setFromAxisAngle(ax, curls[fn][j] * w); this.rotateWorld(bn, _q.clone());
    }
    const t1 = B[s + 'HandThumb1'], t2 = B[s + 'HandThumb2'];
    if (t1) { _q.setFromAxisAngle(ax, curls.th[0] * w); this.rotateWorld(t1, _q.clone()); }
    if (t2) { _q.setFromAxisAngle(ax, curls.th[1] * w); this.rotateWorld(t2, _q.clone()); }
  }
}
