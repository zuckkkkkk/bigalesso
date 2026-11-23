import * as THREE from 'three';
import { rng, clamp } from './util.js';

// Black toy poodle built from curly fur clumps. Faces +z.
// Poses (sit, stand, lie, sleep, roll belly-up, play bow, beg, paw), gaits (walk/trot/gallop),
// an autonomous behaviour machine (wander, sniff, greet, follow, fetch, zoomies, bed, bowl) and a petting API.
function curlGeometry() {
  const g = new THREE.SphereGeometry(1, 7, 5); // perf: 56 tris per clump (was 140)
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 0.86 + 0.12 * Math.sin(x * 5.1 + y * 3.7) * Math.sin(z * 4.3 - y * 2.9) + 0.06 * Math.sin((x + z) * 9.0);
    p.setXYZ(i, x * k, y * k, z * k);
  }
  g.computeVertexNormals();
  return g;
}

function ellipsoidPoints(R, c, r, rot, count, out, others, scale = [0.0092, 0.0138], push = 0.0025) {
  if (!count) { const p = 1.6075; const A = 4 * Math.PI * Math.pow((Math.pow(r[0] * r[1], p) + Math.pow(r[0] * r[2], p) + Math.pow(r[1] * r[2], p)) / 3, 1 / p); count = Math.round(A * 6800); }
  const e = new THREE.Euler(...(rot || [0, 0, 0])); const q = new THREE.Quaternion().setFromEuler(e);
  for (let i = 0; i < count; i++) {
    const u = R() * 2 - 1, th = R() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    const n = new THREE.Vector3(s * Math.cos(th), u, s * Math.sin(th));
    const p = new THREE.Vector3(n.x * r[0], n.y * r[1], n.z * r[2]);
    const nn = new THREE.Vector3(n.x / r[0], n.y / r[1], n.z / r[2]).normalize().applyQuaternion(q);
    p.applyQuaternion(q).add(new THREE.Vector3(...c));
    let hidden = false;
    for (const o of others) { const lp = p.clone().sub(o.c).applyQuaternion(o.qi); const d = (lp.x / o.r[0]) ** 2 + (lp.y / o.r[1]) ** 2 + (lp.z / o.r[2]) ** 2; if (d < 0.72) { hidden = true; break; } }
    if (hidden) continue;
    p.addScaledVector(nn, push * (R() - 0.3));
    out.push({ p, s: scale[0] + R() * (scale[1] - scale[0]) });
  }
}

const HIP = [0, 0.06, -0.05];   // pivot of the torso (seated rump)
const rel = (c, o = HIP) => [c[0] - o[0], c[1] - o[1], c[2] - o[2]];
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lerp = (a, b, t) => a + (b - a) * t;
const sm = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const wrapA = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const toV = (a, y = 0) => !a ? null : a.isVector3 ? a.clone() : Array.isArray(a) ? (a.length === 2 ? V(a[0], y, a[1]) : V(a[0], a[1], a[2])) : ('x' in a ? V(a.x, a.y ?? y, a.z) : null);

// thresholds (affection 0..1) for tricks
export const TRICKS = [
  { id: 'sit', key: '1', label: 'Seduto', need: 0 },
  { id: 'paw', key: '2', label: 'Dammi la zampa', need: 0.2 },
  { id: 'spin', key: '3', label: 'Gira', need: 0.1 },
  { id: 'speak', key: '4', label: 'Abbaia', need: 0.15 },
  { id: 'down', key: '5', label: 'Terra', need: 0.3 },
  { id: 'roll', key: '6', label: 'Rotola', need: 0.45 },
  { id: 'beg', key: '7', label: 'Fai il bravo', need: 0.6 },
];

export function buildDog() {
  const R = rng(1234);
  const root = new THREE.Group();
  const rollPivot = new THREE.Group(); rollPivot.position.y = 0.075; root.add(rollPivot);
  const bodyG = new THREE.Group(); bodyG.position.y = -0.075; rollPivot.add(bodyG);
  const hip = new THREE.Group(); hip.position.set(...HIP); bodyG.add(hip);
  const torso = new THREE.Group(); hip.add(torso);
  const body = torso; // compatibility name
  const headPivot = new THREE.Group(); headPivot.position.set(...rel([0, 0.262, 0.066])); torso.add(headPivot);
  const tailPivot = new THREE.Group(); tailPivot.position.set(...rel([0, 0.075, -0.112])); torso.add(tailPivot);
  const fur = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.48, sheen: 1, sheenColor: new THREE.Color(0x7c7a8a), sheenRoughness: 0.36, specularIntensity: 0.6, envMapIntensity: 0.9 });
  const geo = curlGeometry();
  const mkOthers = list => list.map(o => { const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(o.rot || [0, 0, 0]))); return { c: new THREE.Vector3(...o.c), r: o.r, qi: q.clone().invert() }; });
  let total = 0;
  const parts = []; // analytic ellipsoids for petting ray hits
  const build = (list, parent, colBase = 0.026) => {
    const pts = []; const others = mkOthers(list);
    list.forEach((o, i) => {
      ellipsoidPoints(R, o.c, o.r, o.rot, o.n, pts, others.filter((_, j) => j !== i), o.sc);
      if (o.name) parts.push({ name: o.name, group: parent, c: V(...o.c), r: V(o.r[0] + 0.009, o.r[1] + 0.009, o.r[2] + 0.009), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(...(o.rot || [0, 0, 0]))) });
    });
    const im = new THREE.InstancedMesh(geo, fur, pts.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    pts.forEach((p, i) => {
      q.setFromEuler(new THREE.Euler(R() * 6, R() * 6, R() * 6));
      m.compose(p.p, q, new THREE.Vector3(p.s, p.s * (0.85 + R() * 0.3), p.s));
      im.setMatrixAt(i, m);
      const v = colBase + R() * 0.03; col.setRGB(v, v, v * 1.1); im.setColorAt(i, col);
    });
    im.castShadow = true; im.receiveShadow = true; parent.add(im); total += pts.length;
    return im;
  };
  build([
    { name: 'fianchi', c: rel([0.046, 0.058, -0.035]), r: [0.044, 0.058, 0.074], rot: [0.15, 0, 0] },
    { name: 'fianchi', c: rel([-0.046, 0.058, -0.035]), r: [0.044, 0.058, 0.074], rot: [0.15, 0, 0] },
    { name: 'schiena', c: rel([0, 0.062, -0.07]), r: [0.052, 0.052, 0.048] },
    { name: 'schiena', c: rel([0, 0.148, -0.004]), r: [0.052, 0.098, 0.052], rot: [-0.32, 0, 0] },
    { name: 'petto', c: rel([0, 0.172, 0.04]), r: [0.047, 0.056, 0.042] },
    { name: 'collo', c: rel([0, 0.232, 0.056]), r: [0.027, 0.044, 0.028], rot: [-0.35, 0, 0] },
  ], torso);
  build([
    { name: 'testa', c: [0, 0.045, 0.0], r: [0.046, 0.046, 0.048] },
    { name: 'testa', c: [0, 0.089, -0.004], r: [0.043, 0.036, 0.043] },
    { name: 'muso', c: [0, 0.016, 0.062], r: [0.02, 0.019, 0.046], sc: [0.0075, 0.0105] },
  ], headPivot);
  // lower jaw + tongue (pant, bark, hold the ball)
  const jaw = new THREE.Group(); jaw.position.set(0, 0.006, 0.03); headPivot.add(jaw);
  build([{ c: [0, -0.006, 0.03], r: [0.016, 0.008, 0.032], sc: [0.0062, 0.0088] }], jaw);
  const tongue = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), new THREE.MeshPhysicalMaterial({ color: 0xd8607a, roughness: 0.35, clearcoat: 0.6 }));
  tongue.scale.set(0.011, 0.003, 0.02); tongue.position.set(0, 0.0, 0.05); jaw.add(tongue);
  const mouth = new THREE.Object3D(); mouth.position.set(0, -0.004, 0.092); mouth.userData.isMouth = true; headPivot.add(mouth);
  const ears = [];
  for (const s of [-1, 1]) {
    const ep = new THREE.Group(); ep.position.set(s * 0.05, 0.05, -0.004); headPivot.add(ep);
    build([{ name: 'orecchie', c: [s * 0.006, -0.055, -0.004], r: [0.019, 0.062, 0.028], rot: [0.1, 0, -s * 0.18] }], ep);
    ears.push(ep);
  }
  const legGroup = (parent, pos, len) => {
    const g = new THREE.Group(); g.position.set(...pos); parent.add(g);
    build([{ c: [0, -len / 2, 0], r: [0.018, len / 2 + 0.004, 0.019] }, { c: [0, -len + 0.008, 0.016], r: [0.021, 0.013, 0.027] }], g);
    g.userData.len = len;
    return g;
  };
  const front = [-1, 1].map(s => legGroup(torso, rel([s * 0.027, 0.168, 0.074]), 0.162)); // [0] = right paw (dog faces +z)
  const hind = [-1, 1].map(s => legGroup(bodyG, [s * 0.052, 0.028, -0.03], 0.11));
  build([{ c: [0, 0.03, -0.012], r: [0.024, 0.028, 0.024], rot: [0.5, 0, 0] }], tailPivot, 0.03);
  const gloss = new THREE.MeshPhysicalMaterial({ color: 0x050505, roughness: 0.15, clearcoat: 1 });
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.0095, 16, 12), gloss); nose.position.set(0, 0.022, 0.108); nose.scale.set(1.25, 0.85, 0.9); headPivot.add(nose);
  const eyes = [];
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 16, 12), new THREE.MeshPhysicalMaterial({ color: 0x1a0d06, roughness: 0.05, clearcoat: 1 })); e.position.set(s * 0.02, 0.055, 0.046); headPivot.add(e); eyes.push(e); }
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.0045, 8, 32), new THREE.MeshStandardMaterial({ color: 0x6a1a1a, roughness: 0.5 }));
  collar.position.set(...rel([0, 0.228, 0.058])); collar.rotation.x = Math.PI / 2 - 0.4; torso.add(collar);
  const tag = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.002, 18), new THREE.MeshStandardMaterial({ color: 0xffc23a, metalness: 1, roughness: 0.25 }));
  tag.rotation.x = Math.PI / 2; tag.position.set(...rel([0, 0.205, 0.092])); torso.add(tag);
  root.userData.clumps = total;

  // ---------------------------------------------------------------- state
  let aff0 = 0.12; try { const v = parseFloat(localStorage.getItem('bigalesso_dog_aff')); if (v >= 0 && v <= 1) aff0 = v; } catch (e) { }
  const state = {
    yaw: 0, pitch: 0, wag: 0, t: R() * 10, alert: 0, speed: 0, gait: 0, react: null, follow: null, earLag: 0, prevYaw: 0,
    mode: 'idle', modeT: 0, idleT: 0, decideT: 4, nav: null, stuck: 0, detour: 0, detourYaw: 0, lastPos: V(),
    fatigue: 0, pet: null, trick: null, auto: false, holding: false, greetCd: 0, manFar: true, plays: 0, kick: 0, hold: 0,
    P: { stand: 0, lie: 0, roll: 0, bow: 0, beg: 0, paw: 0, sniff: 0, sleep: 0, jaw: 0, eyes: 1, lean: 0, tilt: 0, headDown: 0, earsBack: 0, tailUp: 0 },
  };
  const api = {
    root, update, state, headPivot, mouth, react, setFollow, onSound: null, onAffection: null,
    get affection() { return state.aff; }, set affection(v) { setAff(v); },
    setEnv, observe, command, startPet, stroke, endPet, surfacePoint, pawTip, isBellyUp, setMode, onBall, wantsPlay: () => state.mode === 'idle' && state.wantPlay > 0,
    get mode() { return state.mode; }, set auto(v) { state.auto = !!v; }, get auto() { return state.auto; },
  };
  state.aff = aff0;
  function setAff(v) { state.aff = clamp(v, 0, 1); try { localStorage.setItem('bigalesso_dog_aff', state.aff.toFixed(3)); } catch (e) { } api.onAffection?.(state.aff); }
  const sound = n => api.onSound?.(n);

  // ---------------------------------------------------------------- environment
  const env = {
    isWalkable: (x, z) => x > -3.3 && x < 3.95 && z > 0.3 && z < 6.6,
    colliders: [
      { type: 'box', min: [-1.98, 0.0], max: [-0.86, 0.7] }, { type: 'box', min: [0.0, 0.0], max: [0.72, 0.92] },
      { type: 'circle', c: [1.62, 0.2], r: 0.32 },
    ],
    anchors: {},
  };
  function setEnv(e) {
    if (!e) return;
    if (e.isWalkable) env.isWalkable = e.isWalkable; if (e.colliders) env.colliders = e.colliders; if (e.anchors) env.anchors = { ...env.anchors, ...e.anchors }; if (e.extra) env.extra = e.extra;
    if (e.zoneAt) env.zoneAt = e.zoneAt; if (e.portals) env.portals = e.portals;
  }
  // room-to-room routing through door portals {a, b, p:Vector3, n:Vector3 (a->b)}
  function routeVia(p, tgt) {
    if (!env.zoneAt || !env.portals || !env.portals.length) return tgt;
    const zA = env.zoneAt(p.x, p.z), zB = env.zoneAt(tgt.x, tgt.z);
    if (!zA || !zB || zA === zB) return tgt;
    // BFS over zones
    const prev = { [zA]: null }, q = [zA];
    while (q.length) { const z = q.shift(); if (z === zB) break; for (const pt of env.portals) { const o = pt.a === z ? pt.b : pt.b === z ? pt.a : null; if (o && !(o in prev)) { prev[o] = { from: z, pt }; q.push(o); } } }
    if (!(zB in prev)) return tgt;
    let z = zB, step = null; while (prev[z] && prev[z].from !== undefined) { step = prev[z]; if (step.from === zA) break; z = step.from; }
    if (!step) return tgt;
    const pt = step.pt, sgn = pt.a === zA ? 1 : -1;
    const n = pt.n.clone().multiplyScalar(sgn);
    const side = (p.x - pt.p.x) * n.x + (p.z - pt.p.z) * n.z; // < 0: still on our side
    const appr = pt.p.clone().addScaledVector(n, -0.5), exit = pt.p.clone().addScaledVector(n, 0.7);
    const lat = Math.hypot(p.x - appr.x, p.z - appr.z);
    return (side < -0.3 && lat > 0.35) ? appr : exit;
  }
  const cX = c => c.c ? (c.c.x ?? c.c[0]) : 0, cZ = c => c.c ? (c.c.z ?? c.c[1]) : 0;
  function blocked(x, z, m = 0.14) {
    if (!env.isWalkable(x, z)) return true;
    for (const c of [...env.colliders, ...(env.extra || [])]) {
      if (c.min && c.max) { const x0 = (c.min.x ?? c.min[0]) - m, x1 = (c.max.x ?? c.max[0]) + m, z0 = (c.min.z ?? c.min[1]) - m, z1 = (c.max.z ?? c.max[1]) + m; if (x > x0 && x < x1 && z > z0 && z < z1) return true; }
      else if (c.r !== undefined) { if (Math.hypot(x - cX(c), z - cZ(c)) < c.r + m) return true; }
    }
    return false;
  }
  function pushOut(p) {
    for (const c of [...env.colliders, ...(env.extra || [])]) {
      const m = 0.13;
      if (c.min && c.max) {
        const x0 = (c.min.x ?? c.min[0]) - m, x1 = (c.max.x ?? c.max[0]) + m, z0 = (c.min.z ?? c.min[1]) - m, z1 = (c.max.z ?? c.max[1]) + m;
        if (p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1) { const pen = [p.x - x0, x1 - p.x, p.z - z0, z1 - p.z]; const i = pen.indexOf(Math.min(...pen)); if (i === 0) p.x = x0; else if (i === 1) p.x = x1; else if (i === 2) p.z = z0; else p.z = z1; }
      } else if (c.r !== undefined) { const dx = p.x - cX(c), dz = p.z - cZ(c), d = Math.hypot(dx, dz), r = c.r + m; if (d < r && d > 1e-5) { p.x = cX(c) + dx / d * r; p.z = cZ(c) + dz / d * r; } }
    }
  }
  // observed man
  const man = { pos: V(), head: V(0, 1.5, 0), mode: 'explore', ball: false, vel: V(), dist: 9 };
  function observe(o) {
    if (o.pos) man.pos.copy(o.pos); if (o.head) man.head.copy(o.head); if (o.mode) man.mode = o.mode; if ('ball' in o) man.ball = o.ball; if (o.vel) man.vel.copy(o.vel);
    if (o.ballObj) api.ballObj = o.ballObj;
  }

  // ---------------------------------------------------------------- reactions
  const REACT = { pet: 2.4, bark: 0.75, happy: 1.6, jump: 0.85, spin: 1.2, kick: 1.3, nudge: 0.9, confused: 1.4, yip: 0.5, shake: 1.0 };
  function react(name) {
    if (!REACT[name]) return 0;
    if (state.mode === 'sleep' && name !== 'jump') wake();
    state.react = { name, t: 0, dur: REACT[name], barked: 0, spin0: root.rotation.y };
    if (name === 'bark') sound('woof');
    if (name === 'yip') sound('yip');
    if (name === 'kick') sound('kick');
    if (name === 'happy' || name === 'pet' || name === 'nudge') state.wag = 1;
    return REACT[name];
  }
  function setFollow(target) {
    state.follow = target ? (target.isVector3 ? target : V(target.x, target.y, target.z)) : null;
    if (state.follow) { if (state.mode === 'sleep') wake(); setMode('follow'); } else if (state.mode === 'follow') setMode('idle');
  }
  function setMode(m, extra = {}) { state.mode = m; state.modeT = 0; state.nav = null; Object.assign(state, extra); }
  function wake() { if (state.mode === 'sleep' || state.mode === 'lie') { setMode('idle'); state.P.eyes = 0.6; sound('yip'); } }

  // ---------------------------------------------------------------- commands / tricks
  // returns {ok, reason, dur}
  function command(name, arg) {
    const tr = TRICKS.find(t => t.id === name);
    if (tr && state.aff + 1e-6 < tr.need) { react('confused'); return { ok: false, reason: 'affection', need: tr.need }; }
    if (state.mode === 'sleep') wake();
    if (state.holding && name !== 'drop') dropBall();
    state.wantPlay = 0;
    const far = Math.hypot(man.pos.x - root.position.x, man.pos.z - root.position.z) > 1.5;
    if (tr && far && name !== 'speak') { setMode('come', { then: name }); return { ok: true, dur: 3 }; }
    switch (name) {
      case 'come': setMode('come', { then: arg || null }); return { ok: true, dur: 2 };
      case 'stay': setMode('idle'); state.follow = null; return { ok: true };
      case 'free': setMode('idle'); return { ok: true };
      case 'bed': setMode('tobed'); return { ok: true };
      case 'drink': setMode('todrink'); return { ok: true };
      case 'zoomies': startZoomies(); return { ok: true, dur: 4 };
      case 'fetch': setMode('fetch', { fetchT: 0 }); return { ok: true };
      case 'drop': dropBall(); return { ok: true };
      default:
        if (!tr) return { ok: false };
        const dur = { sit: 3, paw: 3.6, spin: 1.4, speak: 1.4, down: 6, roll: 7, beg: 3.2 }[name];
        setMode('trick', { trick: { id: name, t: 0, dur, barks: 0 } });
        if (name === 'spin') state.trick.spin0 = root.rotation.y;
        faceMan();
        return { ok: true, dur };
    }
  }
  function faceMan() { const dx = man.pos.x - root.position.x, dz = man.pos.z - root.position.z; state.faceYaw = Math.atan2(dx, dz); }
  function startZoomies() {
    const c = root.position.clone(); const r = 1.0 + R() * 0.4; const dir = R() < 0.5 ? 1 : -1;
    setMode('zoom', { zoom: { c, r, a: Math.atan2(root.position.x - c.x, root.position.z - c.z), dir, laps: 0 } });
    state.zoom.c.x -= Math.sin(state.zoom.a) * r; state.zoom.c.z -= Math.cos(state.zoom.a) * r;
    sound('yip');
  }
  function onBall(ev) { // 'thrown' | 'dropped' events from the play system
    if (ev === 'thrown' && !['pet', 'trick'].includes(state.mode)) { if (state.mode === 'sleep') wake(); state.alert = 1; setMode('fetch', { fetchT: 0 }); sound('yip'); }
  }
  function dropBall() {
    const b = api.ballObj; if (!b || !state.holding) return;
    const f = V(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y));
    b.detach(f.multiplyScalar(0.35).add(V(0, 0.4, 0)));
    state.holding = false; sound('squeak');
  }

  // ---------------------------------------------------------------- petting
  // the man strokes the dog: stroke(u, v, active, dt) with u along head(0)->tail(1), v side -1..1
  function startPet() { if (state.mode === 'sleep') wake(); if (state.holding) dropBall(); setMode('pet', { pet: { t: 0, fav: 0, gain: 0, lastU: 0.2, lastV: 0, hearts: 0, purr: 0, belly: isBellyUp() } }); faceMan(); state.wag = 1; }
  function endPet() { if (state.mode !== 'pet') return; const belly = state.pet && state.pet.belly; setMode('idle'); state.decideT = 5 + R() * 4; state.wantPlay = 2.5; if (belly) { state.P.roll = Math.max(state.P.roll, 0.9); state.unroll = 0.6; } react('nudge'); sound('whine'); }
  function isBellyUp() { return state.P.roll > 0.6 || (state.mode === 'trick' && state.trick && state.trick.id === 'roll' && state.trick.t > 1.2); }
  const _ray = new THREE.Ray(), _m = new THREE.Matrix4(), _o = V(), _d = V();
  function hitParts(origin, dir) {
    let best = null;
    for (const p of parts) {
      _m.copy(p.group.matrixWorld).invert();
      _o.copy(origin).applyMatrix4(_m); _d.copy(dir).transformDirection(_m);
      const qi = p.q.clone().invert();
      const o = _o.clone().sub(p.c).applyQuaternion(qi), d = _d.clone().applyQuaternion(qi);
      o.divide(p.r); d.divide(p.r);
      const a = d.dot(d), b = 2 * o.dot(d), c = o.dot(o) - 1, disc = b * b - 4 * a * c; if (disc < 0) continue;
      const t = (-b - Math.sqrt(disc)) / (2 * a); if (t < 0) continue;
      const lp = o.clone().addScaledVector(d, t); // unit-sphere space
      const n = lp.clone().divide(p.r).applyQuaternion(p.q).normalize();
      const P = lp.clone().multiply(p.r).applyQuaternion(p.q).add(p.c);
      const wpnt = p.group.localToWorld(P.clone());
      const wn = n.transformDirection(p.group.matrixWorld);
      const dist = wpnt.distanceTo(origin);
      if (!best || dist < best.dist) best = { point: wpnt, normal: wn, part: p.name, dist };
    }
    return best;
  }
  function spinePoint(u) {
    root.updateMatrixWorld(true);
    const pts = [headPivot.localToWorld(V(0, 0.075, -0.004)), torso.localToWorld(V(...rel([0, 0.232, 0.052]))), torso.localToWorld(V(...rel([0, 0.16, -0.02]))), torso.localToWorld(V(...rel([0, 0.08, -0.08])))];
    const k = clamp(u, 0, 1) * 3, i = Math.min(2, Math.floor(k)), f = k - i;
    return pts[i].clone().lerp(pts[i + 1], f);
  }
  // world point on the dog's fur for a stroke parameter, seen from `from` (e.g. the man's shoulder)
  function surfacePoint(u, v, from) {
    const right = V(-1, 0, 0).applyQuaternion(root.quaternion);
    let P = spinePoint(u);
    let region;
    if (u < 0.2 && Math.abs(v) > 0.55) { // behind the ears
      const ep = ears[v > 0 ? 0 : 1]; const p = ep.localToWorld(V(0, -0.012, -0.012));
      const n = p.clone().sub(headPivot.localToWorld(V(0, 0.045, 0))).normalize();
      return { point: p.addScaledVector(n, 0.012), normal: n, region: 'orecchie', fav: true };
    }
    P.addScaledVector(right, v * 0.045);
    const fromDir = (from ? from.clone().sub(P) : V(0, 1, 0)); fromDir.y = Math.max(fromDir.y, fromDir.length() * 0.45); fromDir.normalize();
    const origin = P.clone().addScaledVector(fromDir, 0.4);
    const hit = hitParts(origin, P.clone().sub(origin).normalize());
    if (hit) { region = hit.part; if (isBellyUp() && u > 0.25) region = 'pancia'; return { point: hit.point.addScaledVector(hit.normal, 0.006), normal: hit.normal, region, fav: region === 'pancia' }; }
    return { point: P.add(V(0, 0.05, 0)), normal: V(0, 1, 0), region: u < 0.2 ? 'testa' : 'schiena', fav: false };
  }
  // called every frame while petting; amount = stroke motion (0..1+), active = the player is stroking
  function stroke(u, v, amount, dt) {
    const p = state.pet; if (!p || state.mode !== 'pet') return null;
    p.t += dt; p.lastU = u; p.lastV = v; p.belly = isBellyUp();
    const sp = surfacePoint(u, v, man.head);
    const fav = sp.fav;
    const gain = amount * dt * (fav ? 0.05 : 0.022) * (p.belly ? 1.6 : 1);
    p.gain += gain; setAff(state.aff + gain * 0.5);
    p.purr = clamp(p.purr + amount * dt * 0.8 - dt * 0.35, 0, 1);
    if (fav && amount > 0.25) p.fav += dt; else p.fav = Math.max(0, p.fav - dt * 0.5);
    let ev = null;
    if (p.fav > 1.1) { p.fav = -1.5; react('kick'); ev = 'kick'; }
    p.hearts -= dt * (0.6 + amount);
    if (p.hearts <= 0 && amount > 0.15) { p.hearts = 1.0; ev = ev || 'heart'; }
    if (amount > 0.2 && R() < dt * 0.35) sound(p.belly ? 'dogHappy' : 'whine');
    state.wag = Math.max(state.wag, 0.6 + p.purr * 0.4);
    return { ...sp, ev, purr: p.purr };
  }
  function pawTip() { return front[0].localToWorld(V(0, -front[0].userData.len + 0.01, 0.02)); }

  // ---------------------------------------------------------------- locomotion
  function navTo(target, speed, arrive = 0.25) { state.nav = { target: target.clone ? target.clone() : V(target.x, 0, target.z), speed, arrive }; }
  function stepNav(dt) {
    const n = state.nav; const p = root.position;
    if (!n) { state.speed += (0 - state.speed) * (1 - Math.exp(-dt * 6)); return false; }
    const dx = n.target.x - p.x, dz = n.target.z - p.z, dist = Math.hypot(dx, dz);
    if (dist < n.arrive) { state.speed += (0 - state.speed) * (1 - Math.exp(-dt * 7)); state.nav = null; return true; }
    if (state.P.stand < 0.8) { state.speed = 0; return false; } // get up first
    const way = routeVia(p, n.target);
    let want = Math.atan2(way.x - p.x, way.z - p.z);
    // steering: first free heading near the desired one
    if (state.detour > 0) { state.detour -= dt; want = state.detourYaw; }
    const look = clamp(0.25 + state.speed * 0.25, 0.25, 0.7);
    let chosen = null;
    for (const off of [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.45, -1.45, 1.9, -1.9, 2.5, -2.5]) {
      const h = want + off;
      const ok = !blocked(p.x + Math.sin(h) * look, p.z + Math.cos(h) * look) && !blocked(p.x + Math.sin(h) * look * 0.5, p.z + Math.cos(h) * look * 0.5);
      if (ok) { chosen = h; break; }
    }
    const v = clamp(Math.min(n.speed, (dist - n.arrive) * 2.4 + 0.25), 0, n.speed);
    if (chosen === null) { state.speed *= Math.exp(-dt * 8); chosen = want; }
    else state.speed += (v - state.speed) * (1 - Math.exp(-dt * (v > state.speed ? 3.5 : 6)));
    const turn = (state.speed > 1.8 ? 4.2 : 6) * dt;
    const dy = wrapA(chosen - root.rotation.y); root.rotation.y += clamp(dy, -turn, turn);
    const slow = Math.abs(dy) > 1.2 ? 0.4 : 1;
    p.x += Math.sin(root.rotation.y) * state.speed * slow * dt; p.z += Math.cos(root.rotation.y) * state.speed * slow * dt;
    pushOut(p);
    // stuck detection
    if (p.distanceTo(state.lastPos) < state.speed * dt * 0.25 && state.speed > 0.2) state.stuck += dt; else state.stuck = Math.max(0, state.stuck - dt);
    state.lastPos.copy(p);
    if (state.stuck > 0.9) { state.stuck = 0; state.detour = 0.9; state.detourYaw = want + (R() < 0.5 ? 1 : -1) * (1.1 + R() * 0.6); }
    state.fatigue = clamp(state.fatigue + dt * Math.max(0, state.speed - 1.5) * 0.12, 0, 1);
    return false;
  }
  function randomSpotNear(c, r) {
    for (let i = 0; i < 14; i++) { const a = R() * Math.PI * 2, d = r * (0.35 + R() * 0.65); const x = c.x + Math.sin(a) * d, z = c.z + Math.cos(a) * d; if (!blocked(x, z, 0.2)) return V(x, 0, z); }
    return null;
  }
  const anchor = n => toV(env.anchors[n]);

  // ---------------------------------------------------------------- behaviour machine
  function behave(dt, lookAt) {
    const p = root.position; const st = state; st.modeT += dt;
    const dMan = Math.hypot(man.pos.x - p.x, man.pos.z - p.z); man.dist = dMan;
    const T = { stand: 0, lie: 0, roll: 0, bow: 0, beg: 0, paw: 0, sniff: 0, sleep: 0, jaw: 0, eyes: 1, lean: 0, tilt: 0, headDown: 0, earsBack: 0, tailUp: 0 };
    let gaze = lookAt ? lookAt.clone() : null;
    st.greetCd = Math.max(0, st.greetCd - dt); st.wantPlay = Math.max(0, (st.wantPlay || 0) - dt);
    const moving = () => { T.stand = 1; };
    // greet the man when he comes back
    if (st.auto && st.manFar && dMan < 2.2 && st.greetCd <= 0 && ['idle', 'lie', 'wander'].includes(st.mode) && man.mode !== 'cabinet') { setMode('come', { greet: true }); st.greetCd = 25; st.wag = 1; }
    if (dMan > 3.4) st.manFar = true; else if (dMan < 2.2) st.manFar = false;
    switch (st.mode) {
      case 'idle': {
        st.idleT += dt;
        if (st.wantPlay > 0) { T.bow = st.modeT < 1.2 ? 1 : 0; T.stand = 1; gaze = man.head.clone(); }
        if (!st.auto) break;
        st.decideT -= dt;
        if (man.mode === 'cabinet' && dMan > 1.6) { // keep the player company
          const spot = V(man.pos.x - 0.75, 0, man.pos.z + 0.25); if (!blocked(spot.x, spot.z, 0.18)) { setMode('goto', { goal: spot, speedGoal: 1.0, after: 'idle' }); break; }
        }
        if (st.decideT <= 0) {
          st.decideT = 5 + R() * 7;
          const r = R(), bed = anchor('dogBed') || anchor('bed'), bowl = anchor('dogBowl') || anchor('bowl');
          if (dMan < 2.6 && man.mode !== 'cabinet') {
            if (r < 0.2 && st.aff > 0.25) { st.wantPlay = 3; sound('yip'); st.wag = 1; }
            else if (r < 0.45) { const s = randomSpotNear(man.pos, 1.4); if (s) setMode('wander', { goal: s }); }
          } else {
            if (r < 0.3) { const s = randomSpotNear(p, 2.2); if (s) setMode('wander', { goal: s }); }
            else if (r < 0.45 && bowl) setMode('todrink');
            else if (r < 0.62 && bed && st.idleT > 25) setMode('tobed');
            else if (r < 0.8 && st.idleT > 12) setMode('lie');
          }
        }
        break;
      }
      case 'goto':
        moving();
        if (!st.nav) navTo(st.goal, st.speedGoal || 1.0, 0.18);
        if (stepNav(dt) || st.modeT > 12) setMode(st.after || 'idle');
        break;
      case 'wander':
        moving(); T.sniff = st.speed < 0.6 ? 0.8 : 0.4;
        if (!st.nav) navTo(st.goal, 0.55, 0.2);
        gaze = null;
        if (stepNav(dt) || st.modeT > 10) { setMode('idle'); st.decideT = 2 + R() * 3; }
        if (R() < dt * 0.3) sound('pant');
        break;
      case 'lie':
        T.lie = 1; T.stand = 1;
        if (st.modeT > 40 && R() < dt * 0.05) setMode('sleep');
        if (dMan < 1.2 && man.vel.length() > 0.3) setMode('idle');
        break;
      case 'tobed': {
        const b = anchor('dogBed') || anchor('bed'); if (!b) { setMode('lie'); break; }
        moving(); if (!st.nav) navTo(b, 0.9, 0.12);
        if (stepNav(dt)) setMode('sleep');
        if (st.modeT > 15) setMode('lie');
        break;
      }
      case 'sleep':
        T.lie = 1; T.stand = 1; T.sleep = 1; T.eyes = 0; gaze = null;
        if (R() < dt * 0.12) sound('snore');
        if (dMan < 1.0 && man.vel.length() > 0.2 && st.modeT > 3) wake();
        break;
      case 'todrink': {
        const b = anchor('dogBowl') || anchor('bowl'); if (!b) { setMode('idle'); break; }
        const f = V(p.x - b.x, 0, p.z - b.z); const d = f.length(); f.normalize();
        moving(); if (!st.nav) navTo(b.clone().addScaledVector(f.lengthSq() ? f : V(0, 0, 1), 0.17), 0.8, 0.06);
        if (stepNav(dt) || (d < 0.3 && st.modeT > 1)) setMode('drink', { bowlP: b });
        if (st.modeT > 14) setMode('idle');
        break;
      }
      case 'drink': {
        moving(); T.headDown = 0.75; T.sniff = 0.4; T.jaw = 0.2 + 0.2 * Math.max(0, Math.sin(st.modeT * 12));
        const dy = wrapA(Math.atan2(st.bowlP.x - p.x, st.bowlP.z - p.z) - root.rotation.y); root.rotation.y += clamp(dy, -dt * 3, dt * 3);
        if (Math.floor(st.modeT / 1.4) !== Math.floor((st.modeT - dt) / 1.4)) sound('lap');
        gaze = null;
        if (st.modeT > 4.2) { st.fatigue = 0; setMode('idle'); }
        break;
      }
      case 'follow': {
        if (!st.follow) { setMode('idle'); break; }
        const tgt = st.follow; const d = Math.hypot(tgt.x - p.x, tgt.z - p.z);
        if (d > 0.95 || (st.speed > 0.1 && d > 0.8)) {
          moving(); const dir = V(p.x - tgt.x, 0, p.z - tgt.z).normalize();
          navTo(V(tgt.x + dir.x * 0.75, 0, tgt.z + dir.z * 0.75), clamp((d - 0.7) * 1.6, 0.6, 2.6), 0.12);
          stepNav(dt); st.stillT = 0;
        } else { st.nav = null; stepNav(dt); st.stillT = (st.stillT || 0) + dt; T.stand = st.stillT < 0.8 ? 1 : 0; gaze = man.head.clone(); }
        break;
      }
      case 'come': {
        moving(); const tgt = man.pos;
        const dir = V(p.x - tgt.x, 0, p.z - tgt.z); if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1); dir.normalize();
        navTo(V(tgt.x + dir.x * 0.6, 0, tgt.z + dir.z * 0.6), clamp(dMan * 1.2, 0.8, 2.4), 0.12);
        gaze = man.head.clone();
        if (stepNav(dt) || dMan < 0.7) {
          faceMan();
          const then = st.then, greet = st.greet; setMode('idle');
          if (then) command(then); else if (greet) react('happy');
        }
        if (st.modeT > 10) setMode('idle');
        break;
      }
      case 'fetch': {
        const b = api.ballObj; if (!b) { setMode('idle'); break; }
        st.fetchT = (st.fetchT || 0) + dt;
        const bp = b.pos; moving();
        if (b.holder && !b.holder.userData.isMouth) { setMode('idle'); st.wantPlay = 2; break; } // man picked it up first
        navTo(bp, 3.0, 0.1); gaze = bp.clone();
        stepNav(dt);
        const hd = Math.hypot(bp.x - p.x, bp.z - p.z);
        if (hd < 0.22 && bp.y < 0.12 && b.speed() < 3.0) {
          b.attachTo(mouth, V(0, 0, 0)); st.holding = true; sound('squeak'); setMode('return'); st.plays++;
        }
        if (st.fetchT > 9) setMode('idle');
        break;
      }
      case 'return': {
        moving(); T.jaw = 0.35; T.tailUp = 0.4;
        const dir = V(p.x - man.pos.x, 0, p.z - man.pos.z); if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1); dir.normalize();
        navTo(V(man.pos.x + dir.x * 0.5, 0, man.pos.z + dir.z * 0.5), 2.3, 0.1);
        gaze = man.head.clone();
        if (stepNav(dt) || dMan < 0.62) { faceMan(); setMode('drop'); }
        if (st.modeT > 10) { dropBall(); setMode('idle'); }
        break;
      }
      case 'drop':
        T.stand = 1; T.headDown = 0.45; gaze = null;
        if (st.modeT > 0.45 && st.holding) { dropBall(); setAff(st.aff + 0.04); }
        if (st.modeT > 0.9) {
          setMode('idle'); st.wantPlay = 4; react(R() < 0.5 ? 'bark' : 'happy');
          if (st.plays % 3 === 0 && R() < 0.6) startZoomies();
        }
        break;
      case 'zoom': {
        const z = st.zoom; moving(); T.jaw = 0.5; T.earsBack = 0.6;
        z.a += z.dir * dt * 3.0 / z.r;
        const tgt = V(z.c.x + Math.sin(z.a) * z.r, 0, z.c.z + Math.cos(z.a) * z.r);
        if (blocked(tgt.x, tgt.z, 0.18)) { z.dir *= -1; z.a += z.dir * 0.4; }
        navTo(tgt, 3.2, 0.05); stepNav(dt); gaze = null;
        if (st.modeT > 4.2) { setMode('idle'); st.fatigue = 1; faceMan(); }
        break;
      }
      case 'trick': {
        const k = st.trick; k.t += dt; gaze = man.head.clone();
        const id = k.id;
        if (id === 'sit') { T.stand = 0; T.tilt = 0.12 * Math.sin(k.t * 2); if (k.t > 0.3 && !k.done) { k.done = 1; st.wag = 1; } }
        if (id === 'paw') { T.stand = 0; T.paw = sm((k.t - 0.4) / 0.4) * (1 - sm((k.t - k.dur + 0.4) / 0.4)); T.beg = 0.35 * T.paw; }
        if (id === 'spin') { T.stand = 1; const u = clamp(k.t / 1.2, 0, 1); root.rotation.y = k.spin0 + Math.PI * 2 * sm(u); T.jaw = 0.3; }
        if (id === 'speak') { T.stand = 0; const b = Math.floor(k.t / 0.42); if (b < 3 && b >= k.barks) { k.barks = b + 1; react('bark'); } }
        if (id === 'down') { T.stand = 1; T.lie = 1; }
        if (id === 'roll') { T.stand = 1; T.lie = 1; T.roll = sm((k.t - 0.6) / 0.7); T.jaw = 0.45 * T.roll; T.tilt = 0.3 * T.roll; }
        if (id === 'beg') { T.beg = sm(k.t / 0.4) * (1 - sm((k.t - k.dur + 0.4) / 0.4)); T.jaw = 0.25; }
        if (k.t > k.dur) { setMode('idle'); setAff(st.aff + 0.015); if (id === 'roll') st.unroll = 0.8; }
        break;
      }
      case 'pet': {
        const pt = st.pet; T.stand = 0; gaze = man.head.clone();
        if (pt && pt.belly) { T.stand = 1; T.lie = 1; T.roll = 1; T.jaw = 0.35 + 0.2 * pt.purr; T.tilt = 0.25; }
        else {
          // lean into the hand: tilt toward the stroked side, eyes squint with pleasure
          T.lean = clamp(pt ? pt.lastV : 0, -1, 1) * 0.6 * (pt ? pt.purr : 0);
          T.tilt = (pt ? -pt.lastV : 0) * 0.35 * (pt ? pt.purr + 0.3 : 0.3);
          T.headDown = pt && pt.lastU < 0.25 ? -0.12 * pt.purr : 0.05;
          T.jaw = pt ? pt.purr * 0.3 : 0;
        }
        T.eyes = 1 - 0.75 * (pt ? pt.purr : 0);
        T.earsBack = 0.5 * (pt ? pt.purr : 0);
        break;
      }
    }
    if (st.mode !== 'idle') st.idleT = 0;
    if (st.mode !== 'wander' && !['goto', 'come', 'fetch', 'return', 'zoom', 'follow', 'tobed', 'todrink'].includes(st.mode)) { state.nav = null; stepNav(dt); }
    // settling face direction when still
    if (st.faceYaw !== undefined && st.speed < 0.1 && ['idle', 'trick', 'pet', 'drop'].includes(st.mode) && !(st.mode === 'trick' && st.trick.id === 'spin')) {
      const dy = wrapA(st.faceYaw - root.rotation.y); root.rotation.y += clamp(dy, -dt * 2.6, dt * 2.6); if (Math.abs(dy) < 0.02) st.faceYaw = undefined;
    }
    if (st.unroll > 0) { st.unroll -= dt; T.lie = 1; T.stand = 1; }
    if (st.speed > 0.08) T.stand = 1;
    // panting when tired/excited
    st.fatigue = Math.max(0, st.fatigue - dt * 0.05);
    const pant = Math.max(st.fatigue, st.mode === 'zoom' ? 1 : 0);
    if (pant > 0.2 && !st.holding) T.jaw = Math.max(T.jaw, (0.3 + 0.12 * Math.sin(st.t * 15)) * pant);
    if (st.holding) T.jaw = 0.32;
    if (st.mode === 'sleep') gaze = null;
    return { T, gaze };
  }

  // ---------------------------------------------------------------- pose + update
  const tmp = new THREE.Vector3();
  function update(dt, lookAt, excite = 0) {
    dt = Math.min(dt, 0.05);
    state.t += dt; const t = state.t;
    const r = state.react; if (r) { r.t += dt; if (r.t >= r.dur) state.react = null; }
    const { T, gaze } = behave(dt, lookAt);
    if (r && (r.name === 'jump' || r.name === 'shake')) T.stand = 1;
    // smooth pose params
    const P = state.P;
    const rate = { stand: 5, lie: 3, roll: 3.2, bow: 6, beg: 5, paw: 7, sniff: 4, sleep: 1.5, jaw: 14, eyes: 10, lean: 5, tilt: 4, headDown: 5, earsBack: 5, tailUp: 4 };
    for (const k in P) P[k] += (T[k] - P[k]) * (1 - Math.exp(-dt * rate[k]));
    const s = P.stand, l = P.lie, ro = P.roll, bw = P.bow * s, bg = P.beg * (1 - s), pw = P.paw * (1 - s);
    // gait
    const moving = state.speed > 0.05;
    const gallop = sm((state.speed - 1.6) / 0.6);
    if (moving) state.gait += dt * Math.PI * 2 * state.speed / lerp(0.34, 0.7, gallop);
    const gw = clamp(state.speed / 0.4, 0, 1) * (1 - l);
    // ---- body ----
    let hipY = HIP[1] + 0.13 * s, hipZ = HIP[2] + 0.02 * s, pitch = 0.95 * s;
    hipY = lerp(hipY, 0.052, l); hipZ = lerp(hipZ, -0.02, l);
    pitch = pitch + 0.38 * bw; hipY += 0.01 * bw;
    pitch = lerp(pitch, -0.32, bg); hipY += 0.012 * bg;
    const bob = gw * (lerp(Math.abs(Math.sin(state.gait)) * 0.012, (Math.sin(state.gait) * 0.5 + 0.5) * 0.028, gallop));
    hipY += bob;
    pitch += gw * gallop * Math.sin(state.gait + 0.6) * 0.1;
    // reactions
    let rx = 0, ry = 0, rz = 0, jumpY = 0, headP = 0, headR = 0, wagK = 0, squint = 0, kick = 0, nudge = 0, jawR = 0;
    if (r) {
      const k = Math.sin(Math.PI * clamp(r.t / r.dur, 0, 1));
      if (r.name === 'pet') { headR = 0.28 * k; headP = 0.18 * k; rz = -0.06 * k; wagK = 1; squint = k; }
      if (r.name === 'bark') { const b = Math.max(0, Math.sin(r.t * Math.PI / 0.3)); headP = -0.25 * b; rx = -0.05 * b; jawR = 0.6 * b; if (r.barked === 0 && r.t > 0.36) { r.barked = 1; sound('woof'); } }
      if (r.name === 'yip') { const b = Math.max(0, Math.sin(r.t * Math.PI / 0.25)); headP = -0.2 * b; jawR = 0.5 * b; }
      if (r.name === 'happy') { ry = Math.sin(r.t * 18) * 0.16 * k; jumpY = Math.abs(Math.sin(r.t * 9)) * 0.02 * k; wagK = 1; jawR = 0.3 * k; }
      if (r.name === 'jump') { const u = clamp((r.t - 0.15) / 0.55, 0, 1); jumpY = Math.sin(Math.PI * u) * 0.2; rx = -0.35 * Math.sin(Math.PI * u); wagK = 1; }
      if (r.name === 'spin') { root.rotation.y = r.spin0 + Math.PI * 2 * (r.t / r.dur) * (r.t / r.dur) * (3 - 2 * r.t / r.dur); jumpY = Math.abs(Math.sin(r.t * 10)) * 0.015; wagK = 1; }
      if (r.name === 'kick') { kick = k; wagK = 1; squint = k; headR = 0.3 * k; jawR = 0.4 * k; }
      if (r.name === 'nudge') { nudge = k; headP = 0.15 * k; wagK = 1; }
      if (r.name === 'confused') { headR = 0.45 * k * Math.sign(Math.sin(r.t * 1.3) + 0.3); }
      if (r.name === 'shake') { rz = Math.sin(r.t * 40) * 0.25 * k; ry = Math.sin(r.t * 40 + 1) * 0.12 * k; }
    }
    // lean into the hand (sideways) when petted
    rz += P.lean * 0.12;
    hip.position.set(0, hipY + jumpY, hipZ + nudge * 0.02);
    torso.rotation.set(pitch + rx - nudge * 0.08, ry, rz);
    rollPivot.rotation.z = ro * 2.55 * (1 - 0.06 * Math.sin(t * 3) * ro);
    rollPivot.position.y = 0.075 + ro * 0.01;
    const br = Math.sin(t * (state.mode === 'sleep' ? 1.2 : 2.4 + state.fatigue * 4));
    torso.scale.set(1 + br * 0.006, 1 + br * 0.004, 1);
    // ---- front legs ----
    front.forEach((g, i) => {
      const ph = state.gait + (i ? Math.PI : 0) * (1 - gallop) + (i ? 0.35 : 0) * gallop;
      let rot = -1.45 * l - 1.0 * bw - 1.25 * bg;
      if (i === 0) rot -= 2.0 * pw; else rot += 0.6 * pw * P.beg; // the other paw stays down while shaking
      rot += Math.sin(ph) * lerp(0.45, 0.75, gallop) * gw;
      rot = lerp(rot, -0.55, ro); // paws in the air when rolled
      const pitchT = pitch + rx - nudge * 0.08;
      g.rotation.x = -pitchT + rot;
      g.rotation.z = i === 0 ? -0.15 * pw : 0;
      const legLen = g.userData.len, shoulderY = hip.position.y + g.position.y * Math.cos(pitchT) - g.position.z * Math.sin(pitchT);
      const auto = clamp(shoulderY / (legLen * Math.max(0.4, Math.cos(rot))), 0.6, 1.08);
      const w = sm((Math.abs(rot) - 0.45) / 0.6);
      g.scale.y = lerp(auto, i === 0 && pw > 0.3 ? 0.95 : 0.78, Math.max(w, ro));
    });
    // ---- hind legs ----
    hind.forEach((g, i) => {
      const sg = i ? 1 : -1, ph = state.gait + (i ? 0 : Math.PI) * (1 - gallop) + Math.PI * gallop + (i ? 0.35 : 0) * gallop;
      const seat = [sg * 0.052, 0.028, -0.03], stand = [sg * 0.05, hip.position.y, hip.position.z - 0.05], lie = [sg * 0.062, 0.03, -0.0];
      const pos = seat.map((v, k) => lerp(lerp(v, stand[k], s), lie[k], l));
      g.position.set(pos[0], pos[1] + jumpY * s * (1 - l), pos[2]);
      let rot = lerp(lerp(-1.45, 0, s), -1.5, l) + Math.sin(ph) * lerp(0.4, 0.7, gallop) * gw;
      rot = lerp(rot, -0.9, ro);
      if (i === 0 && kick > 0) { rot += Math.sin(t * 30) * 0.6 * kick - 0.5 * kick; g.position.y += 0.02 * kick; }
      g.rotation.x = rot;
      g.scale.y = lerp(lerp(0.75 + 0.95 * s, 0.8, l), 0.85, ro);
    });
    // ---- head ----
    const look = gaze || (state.speed > 0.2 ? root.localToWorld(V(0, 0.3, 1.5)) : null);
    if (look) {
      tmp.copy(look); root.worldToLocal(tmp);
      tmp.sub(V(0, 0.3, 0.08 + 0.1 * s));
      const yaw = clamp(Math.atan2(tmp.x, tmp.z), -1.25, 1.25);
      const p = clamp(Math.atan2(tmp.y, Math.hypot(tmp.x, tmp.z)), -0.35, 0.5);
      const k = 1 - Math.exp(-dt * 3.4);
      state.yaw += (yaw - state.yaw) * k; state.pitch += (p - state.pitch) * k;
    } else { const k = 1 - Math.exp(-dt * 1.5); state.yaw += (Math.sin(t * 0.37) * 0.35 * (1 - P.sleep) - state.yaw) * k; state.pitch += (0 - state.pitch) * k; }
    const headDown = P.headDown + P.sniff * 0.8 + P.sleep * 0.55 + l * 0.05 - P.beg * 0.1;
    const sniffWob = P.sniff * Math.sin(t * 9) * 0.06;
    const tilt = Math.sin(t * 0.7) * 0.06 + excite * Math.sin(t * 3) * 0.1 + headR + P.tilt;
    headPivot.rotation.set(-state.pitch * (1 - P.sleep) - headP - (pitch + rx) * 0.85 + headDown, state.yaw * (1 - 0.7 * P.sleep) - ry * 0.5 + sniffWob, tilt, 'YXZ');
    jaw.rotation.x = clamp(Math.max(P.jaw, jawR), 0, 0.7) * 0.55;
    tongue.visible = jaw.rotation.x > 0.08;
    tongue.position.z = 0.04 + jaw.rotation.x * 0.04;
    // ears
    const yawVel = (state.yaw - state.prevYaw) / Math.max(dt, 1e-4); state.prevYaw = state.yaw;
    state.earLag += (clamp(-yawVel * 0.08, -0.4, 0.4) - state.earLag) * (1 - Math.exp(-dt * 6));
    ears.forEach((e, i) => { e.rotation.z = state.earLag + (i ? -1 : 1) * (0.05 + Math.abs(Math.sin(state.gait)) * 0.12 * gw + jumpY * 1.5 + P.earsBack * 0.25); e.rotation.x = -pitch * 0.15 + headP * 0.5 - P.earsBack * 0.35 + gw * gallop * 0.5; });
    // eyes (blink every few seconds)
    const blink = (t % 4.3) < 0.12 ? 0.1 : 1;
    for (const e of eyes) e.scale.y = Math.max(0.1, Math.min(P.eyes, blink) * (1 - 0.65 * squint));
    // tail
    state.wag = Math.max(state.wag - dt * 0.25, excite * 0.9, wagK, gw * 0.6, state.wantPlay > 0 ? 1 : 0);
    if (state.mode === 'sleep') state.wag = Math.min(state.wag, 0.05);
    const wf = 14 + 8 * clamp(state.wag - 0.7, 0, 1) / 0.3;
    tailPivot.rotation.y = Math.sin(t * wf) * 0.5 * state.wag;
    tailPivot.rotation.x = -0.4 + state.wag * 0.2 - s * 0.5 + P.tailUp * 0.6 + bw * 0.9 - l * 0.4;
  }
  return api;
}
