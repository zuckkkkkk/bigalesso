// Dog play: petting (stroke with drag/keys, scratch, favourite spot, belly rub), tricks menu, paw handshake,
// whistle/come, ball pickup + throw + fetch. Plugged into explore.js through a few hooks.
import * as THREE from 'three';
import { clamp } from './util.js';
import { createDogProps } from './dogprops.js';
import { TRICKS } from './dog.js';
import { THROW_RELEASE } from './man.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const sm = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const OWN = ['pet', 'paw', 'pickball', 'throw', 'whistle', 'trickcmd'];

export function createDogPlay(ctx, W, h) {
  const { scene, man, dog, audio, ui, camera } = ctx;
  const { goTo, setMode, toast, manPos, headPos, fwdOf, dogHead, fx, has } = h;
  const level = ctx.level || ctx.levelInfo || null;
  const anchors = (level && level.anchors) || {};
  const dprops = createDogProps(scene, { anchors });
  const ball = dprops.ball;
  ball.onBounce = v => audio.sfx('ballBounce', v);
  const boxesFn = () => (h.boxes || []);
  dprops.setEnv({ bounds: h.bounds, colliders: [...boxesFn(), ...(h.circles ? h.circles().filter(c => c.id !== 'dog') : []), ...((level && level.colliders) || []).filter(c => c.type === 'circle')], isWalkable: level && level.isWalkable ? (x, z) => level.isWalkable(x, z, 0.04) : null, isGrass: level && (level.isGrass || (level.zoneAt && ((x, z) => level.zoneAt(x, z) === 'Giardino'))) });
  const dogApi = has(dog, 'setEnv');
  if (dogApi) {
    const portals = [];
    const an = (n) => anchors[n] && (anchors[n].isVector3 ? anchors[n].clone() : V(anchors[n][0], 0, anchors[n][anchors[n].length - 1]));
    if (level && level.zoneAt) {
      const d1 = an('doorway'), d2 = an('gardenDoor');
      if (d1) portals.push({ a: level.zoneAt(d1.x - 0.6, d1.z) || 'Sala giochi', b: level.zoneAt(d1.x + 0.6, d1.z) || 'Salotto', p: d1, n: V(1, 0, 0) });
      if (d2) portals.push({ a: level.zoneAt(d2.x, d2.z - 0.6) || 'Salotto', b: level.zoneAt(d2.x, d2.z + 0.6) || 'Giardino', p: d2, n: V(0, 0, 1) });
    }
    // explore's boxes already include the level's box colliders; add round ones (extinguisher, trees…)
    const cols = [...boxesFn(), ...(h.circles ? h.circles().filter(c => c.id !== 'dog') : [])];
    if (level && level.colliders) for (const c of level.colliders) if (c.type === 'circle') cols.push(c);
    dog.setEnv({ isWalkable: level && level.isWalkable ? (x, z) => level.isWalkable(x, z, 0.12) : null, colliders: cols, anchors: { dogBed: dprops.anchors.bed, dogBowl: dprops.anchors.bowl, ...anchors }, zoneAt: level && level.zoneAt, portals });
    dog.observe({ ballObj: ball });
  }
  const P = { menu: false, menuT: 0, ballHeld: false, pet: null, items: null, camSide: 1, lastAff: -1 };
  W.dogPlay = P;
  const aff = () => (dogApi ? dog.affection : 0.5);
  const dogPos = () => dog.root.position;
  const dogNear = (r = 4) => Math.hypot(dogPos().x - manPos().x, dogPos().z - manPos().z) < r;

  // ---------------- interactables ----------------
  const dogItem = {
    id: 'dog',
    label: () => P.ballHeld ? 'Lancia la palla' : (dogApi && dog.isBellyUp() ? 'Grattagli la pancia' : 'Accarezza il cane'),
    alt: () => W.dogFollow ? 'Resta lì' : 'Vieni con me',
    extra: () => dogApi ? [{ key: 'G', label: 'Trucchi e giochi' }] : [],
    anchor: () => dogPos().clone(), top: () => dogHead().add(V(0, 0.2, 0)), range: 1.05,
    act: () => {
      if (W.carry) { toast('Prima posa l\'estintore'); return; }
      if (P.ballHeld) { startThrow(); return; }
      startPet();
    },
    altAct: () => toggleFollow(),
  };
  const ballAvail = () => !P.ballHeld && !ball.holder && (ball.state === 'rest' || ball.speed() < 0.6);
  const ballItem = {
    id: 'ball', label: () => 'Raccogli la palla', anchor: () => { const p = ball.pos; p.y = 0; return p; }, top: () => ball.pos.add(V(0, 0.16, 0)),
    get range() { return ballAvail() && !W.carry ? 0.85 : -1; },
    act: () => pickBall(),
  };

  // ---------------- actions ----------------
  function startPet() {
    W.dancing && W.stopDance && W.stopDance();
    const dp = dogPos(); const d = V(manPos().x - dp.x, 0, manPos().z - dp.z); if (d.length() < 0.01) d.set(0, 0, 1); d.normalize();
    const belly = dogApi && dog.isBellyUp();
    // kneel at the dog's side for belly rubs, in front otherwise
    const off = d.clone();
    const tp = dp.clone().addScaledVector(off, 0.46); tp.y = 0;
    // stand so the dog sits at the man's front-right (right knee on the floor, right hand free)
    const yaw0 = Math.atan2(dp.x - tp.x, dp.z - tp.z);
    const rightV = V(-Math.cos(yaw0), 0, Math.sin(yaw0));
    tp.addScaledVector(rightV, -0.13);
    const yaw = Math.atan2(dp.x - tp.x, dp.z - tp.z) - 0.25;
    P.wasFollow = W.dogFollow;
    if (W.dogFollow) { W.dogFollow = false; has(dog, 'setFollow') && dog.setFollow(null); }
    if (dogApi && !belly) dog.command('stay');
    goTo(tp, yaw, () => {
      setMode('pet');
      W.m = { u: 0.12, v: 0, idle: 0, amount: 0, scratch: 0, heartT: 0, auto: 0 };
      dogApi ? dog.startPet() : has(dog, 'react') && dog.react('pet');
      audio.sfx('pet');
      P.items = null;
      if (!P.petTold) { P.petTold = 1; toast('Trascina o usa WASD per accarezzarlo · tieni premuto E per grattarlo · Esc per smettere'); }
    }, { ignore: ['dog'] });
  }
  function toggleFollow() {
    W.dogFollow = !W.dogFollow;
    man.gesture && man.gesture(W.dogFollow ? 'whistle' : 'signal');
    if (has(dog, 'setFollow')) dog.setFollow(W.dogFollow ? manPos() : null);
    if (W.dogFollow) { audio.sfx('whistle'); setTimeout(() => { has(dog, 'react') && dog.react('bark'); }, 380); toast('Il cane ti segue'); }
    else { toast('Il cane resta qui'); has(dog, 'react') && dog.react('happy'); }
  }
  function whistle() {
    if (!dogApi) return;
    man.gesture && man.gesture('whistle'); audio.sfx('whistle');
    if (W.dogFollow) { toast('Il cane ti sta già seguendo'); return; }
    setTimeout(() => dog.command('come'), 250);
    toast('Fischio: il cane arriva!');
  }
  function pickBall() {
    if (W.carry) { toast('Hai le mani occupate'); return; }
    const bp = ball.pos; const d = V(manPos().x - bp.x, 0, manPos().z - bp.z); if (d.length() < 0.01) d.set(0, 0, 1); d.normalize();
    const tp = V(bp.x, 0, bp.z).addScaledVector(d, 0.36);
    goTo(tp, Math.atan2(bp.x - tp.x, bp.z - tp.z), () => { setMode('pickball'); W.m = { got: false }; }, { ignore: ['dog'] });
  }
  function startThrow() {
    if (!P.ballHeld) return;
    W.dancing && W.stopDance && W.stopDance();
    // aim where the camera looks
    const f = V(-Math.sin(W.camYaw), 0, -Math.cos(W.camYaw));
    W.yaw = Math.atan2(f.x, f.z);
    setMode('throw'); W.m = { released: false };
    man.gesture && man.gesture('throw');
  }
  function trick(id) {
    if (!dogApi) return;
    P.menu = false;
    const tr = TRICKS.find(t => t.id === id);
    if (id === 'fetch') {
      if (P.ballHeld) { toast('Ce l\'hai tu la palla: lanciala! (E o clic)'); return; }
      if (ball.holder) { toast('Ce l\'ha già in bocca'); return; }
      dog.command('fetch'); man.gesture && man.gesture('signal'); toast('Porta la palla!'); audio.sfx('whistle'); return;
    }
    if (tr && aff() + 1e-6 < tr.need) {
      dog.react('confused'); man.gesture && man.gesture('shrug');
      toast(`"${tr.label}" si sblocca con affetto al ${Math.round(tr.need * 100)}%: accarezzalo e gioca con lui`, 'warn');
      return;
    }
    if (id === 'paw') { startPaw(); return; }
    const g = { sit: 'signal', down: 'signalDown', spin: 'twirl', roll: 'twirl', speak: 'clap', beg: 'signal' }[id] || 'signal';
    man.gesture && man.gesture(g);
    const r = dog.command(id);
    if (r && r.ok) {
      toast(tr ? tr.label + '!' : 'Bravo!');
      if (id === 'roll') setTimeout(() => toast('Ora grattagli la pancia: E', 'gold'), 1800);
    }
  }
  function startPaw() {
    const dp = dogPos(); const d = V(manPos().x - dp.x, 0, manPos().z - dp.z); if (d.length() < 0.01) d.set(0, 0, 1); d.normalize();
    if (d.length() && Math.hypot(dp.x - manPos().x, dp.z - manPos().z) > 2.2) { dog.command('come', 'none'); }
    const go = () => {
      const dp2 = dogPos(); const d2 = V(manPos().x - dp2.x, 0, manPos().z - dp2.z); if (d2.length() < 0.01) d2.set(0, 0, 1); d2.normalize();
      const tp = dp2.clone().addScaledVector(d2, 0.56); tp.y = 0;
      goTo(tp, Math.atan2(dp2.x - tp.x, dp2.z - tp.z), () => { setMode('paw'); W.m = { asked: false }; }, { ignore: ['dog'] });
    };
    go();
  }

  // ---------------- explore hook: returns true when the input was consumed ----------------
  function handleExplore(I, focus, actP, altP) {
    // trick menu
    const tPressed = I.pressed('KeyG') || I.padPressed(0, 9);
    if (tPressed && dogApi && dogNear(5)) { P.menu = !P.menu; P.menuT = 0; if (P.menu) audio.sfx('click'); return true; }
    if (P.menu) {
      if (I.pressed('Escape') || !dogNear(6)) { P.menu = false; return true; }
      for (const it of menuList(true)) if (it.code && I.pressed(it.code)) { it.run(); P.menu = false; return true; }
      if (actP && focus && focus.id === 'dog') { P.menu = false; }
    }
    // throw the ball anywhere (E with no other focus, F, or a click)
    if (P.ballHeld && (I.pressed('KeyF') || I.drag.click || (actP && (!focus || focus.id === 'dog')))) { I.drag.click = false; startThrow(); return true; }
    // whistle from anywhere
    if (altP && (!focus || (focus.id !== 'dog' && !(focus.alt && focus.alt())))) { whistle(); return true; }
    return false;
  }
  function menuList(all) {
    const list = TRICKS.map((t, i) => ({ key: String(i + 1), code: 'Digit' + (i + 1), label: t.label, locked: aff() + 1e-6 < t.need, need: t.need, run: () => trick(t.id) }));
    list.push({ key: '8', code: 'Digit8', label: P.ballHeld ? 'Lancia la palla (E)' : 'Porta la palla', run: () => P.ballHeld ? startThrow() : trick('fetch') });
    if (all) return list;
    // compact view for the bubble: unlocked tricks in pairs, locked ones summarised
    const open = list.filter(it => !it.locked), locked = list.filter(it => it.locked);
    const rows = [];
    for (let i = 0; i < open.length; i += 2) { const a = open[i], b = open[i + 1]; rows.push({ key: a.key + (b ? '·' + b.key : ''), label: a.label + (b ? ' · ' + b.label : '') }); }
    if (locked.length) rows.push({ key: '…', label: `${locked.length === 1 ? locked[0].label : locked.length + ' trucchi'} da sbloccare · affetto ${Math.round(locked[0].need * 100)}%` });
    return rows;
  }
  const menuOpen = () => P.menu;

  // ---------------- per-mode update ----------------
  const owns = m => OWN.includes(m);
  function updateMode(mode, dt, I, k) {
    const o = {};
    const f = fwdOf(W.yaw);
    if (mode === 'pet') {
      const m = W.m; const belly = dogApi && dog.isBellyUp();
      // stroke cursor: drag, keys, stick
      let du = 0, dv = 0;
      du += I.drag.dy * 0.004; dv += -I.drag.dx * 0.004;
      const kk = I.k;
      if (kk('KeyW') || kk('ArrowUp')) du -= dt * 0.9; if (kk('KeyS') || kk('ArrowDown')) du += dt * 0.9;
      if (kk('KeyA') || kk('ArrowLeft')) dv += dt * 1.6; if (kk('KeyD') || kk('ArrowRight')) dv -= dt * 1.6;
      const Pd = I.pads[0]; du += Pd.axes[1] * dt * 0.9; dv -= Pd.axes[0] * dt * 1.6;
      if (I.touch.active) { du += I.touch.y * dt * 0.9; dv -= I.touch.x * dt * 1.6; }
      const scratching = kk('KeyE') || I.tHeld('act') || I.padHeld(0, 0);
      const moved = Math.abs(du) + Math.abs(dv);
      if (moved > 1e-4) m.idle = 0; else m.idle += dt;
      if (m.idle > 1.3) { // gentle automatic strokes
        m.auto += dt;
        const tgtU = belly ? 0.55 + Math.sin(m.auto * 1.3) * 0.25 : 0.08 + (Math.sin(m.auto * 1.15 - 1.4) * 0.5 + 0.5) * 0.62;
        du += (tgtU - m.u) * Math.min(1, dt * 3); dv += (Math.sin(m.auto * 0.6) * 0.25 - m.v) * Math.min(1, dt * 2);
      }
      m.u = clamp(m.u + du, belly ? 0.25 : 0.0, belly ? 0.9 : 1.0); m.v = clamp(m.v + dv, -1, 1);
      const speedNow = (Math.abs(du) * 2.2 + Math.abs(dv)) / Math.max(dt, 1e-3);
      m.amount += (clamp(speedNow * 0.9, 0, 1.4) + (scratching ? 0.9 : 0) - m.amount) * (1 - Math.exp(-dt * 6));
      m.scratch += ((scratching ? 1 : 0) - m.scratch) * (1 - Math.exp(-dt * 10));
      let sp = null;
      if (dogApi) sp = dog.stroke(m.u, m.v, m.amount, dt);
      const target = sp ? sp.point.clone() : dogHead().add(V(0, 0.07, 0));
      const nrm = sp ? sp.normal.clone() : V(0, 1, 0);
      if (m.scratch > 0.05) target.addScaledVector(nrm, Math.sin(W.t * 26) * 0.006 * m.scratch);
      // fingers point away from the man across the dog's body
      const across = V(dogPos().x - manPos().x, 0, dogPos().z - manPos().z).normalize();
      const dir = across.clone().addScaledVector(nrm, -across.dot(nrm)).normalize();
      const w = sm((W.t - 0.25) / 0.45);
      o.rR = { pos: target.addScaledVector(nrm, 0.028).addScaledVector(dir, -0.07), w, palm: 'down', grip: 0.08 + m.scratch * (0.35 + 0.3 * Math.sin(W.t * 24)), dir, normal: nrm.clone().negate() };
      o.kneelT = 1; o.crouchT = 0; o.leanT = belly ? 1.35 : 1.5; o.lookW = 1; o.lookAt = sp ? sp.point : dogHead();
      if (sp && sp.ev === 'heart') fx().hearts && fx().hearts(sp.point.clone().add(V(0, 0.12, 0)), 3);
      if (sp && sp.ev === 'kick') { toast(belly ? 'Pancia felice!' : 'Punto preferito: dietro le orecchie!', 'gold'); fx().sparkles && fx().sparkles(sp.point.clone().add(V(0, 0.1, 0)), 24); }
      if (m.scratch > 0.5 && (W.m.scrT = (W.m.scrT || 0) - dt) <= 0) { W.m.scrT = 0.35; audio.sfx('scratch'); }
      P.items = [{ key: 'Trascina', label: belly ? 'Gratta la pancia' : 'Accarezza' }, { key: 'E', label: 'Grattino · Esc basta' }];
      if (k.backP || I.pressed('KeyR')) { dogApi ? dog.endPet() : null; P.items = null; setMode('standup'); if (P.wasFollow) { W.dogFollow = true; has(dog, 'setFollow') && dog.setFollow(manPos()); } }
    } else if (mode === 'paw') {
      const m = W.m; o.kneelT = 1; o.leanT = 1.6; o.lookW = 1; o.lookAt = dogHead();
      if (!m.asked && W.t > 0.35) { m.asked = true; dog.command('paw'); audio.sfx('pet'); }
      const tip = dogApi ? dog.pawTip() : dogHead();
      const pawUp = dogApi ? dog.state.P.paw : 0;
      const offer = dogPos().clone().add(V(0, 0.17, 0)).addScaledVector(V(manPos().x - dogPos().x, 0, manPos().z - dogPos().z).normalize(), 0.13);
      const shake = pawUp > 0.6 ? Math.sin(W.t * 9) * 0.022 : 0;
      const toMan = V(manPos().x - dogPos().x, 0, manPos().z - dogPos().z).normalize();
      const tgt = offer.lerp(tip.clone().add(V(0, -0.03 + shake, 0)).addScaledVector(toMan, 0.06), sm((pawUp - 0.2) / 0.5));
      o.rR = { pos: tgt, w: sm((W.t - 0.2) / 0.4) * (W.m.done ? 0 : 1), palm: 'up', grip: pawUp > 0.6 ? 0.45 : 0.15 };
      if (pawUp > 0.6 && !m.shook) { m.shook = W.t; }
      if (m.shook && W.t - m.shook > 0.6 && !m.heart) { m.heart = 1; fx().hearts && fx().hearts(tip.clone().add(V(0, 0.12, 0)), 4); toast('Dammi la zampa: bravo!', 'gold'); dog.affection = aff() + 0.03; }
      if ((W.t > 1.2 && dogApi && dog.mode !== 'trick') || W.t > 5 || k.backP) { setMode('standup'); }
    } else if (mode === 'pickball') {
      const m = W.m; o.crouchT = 0.8; o.leanT = 0.3; o.lookW = 1; o.lookAt = ball.pos;
      const w = sm(W.t / 0.4) * (m.got ? 1 - sm((W.t - 0.75) / 0.3) : 1);
      o.rR = { pos: ball.pos.add(V(0, 0.05, 0)).addScaledVector(f, -0.02), w, palm: 'down', grip: m.got ? 0.75 : 0.2 };
      if (!m.got && W.t > 0.5) {
        const hand = man.bones && man.bones.RightHand;
        if (hand) {
          const hf = man.handFrame ? man.handFrame('Right') : { f: f.clone(), palm: V(0, -1, 0) };
          const at = hand.getWorldPosition(V()).addScaledVector(hf.f, 0.075).addScaledVector(hf.palm, 0.042);
          ball.attachTo(hand, hand.worldToLocal(at.clone()));
        }
        m.got = true; P.ballHeld = true; audio.sfx('pickup');
        if (dogApi) { dog.react('yip'); }
      }
      if (W.t > 1.1) { setMode('explore'); if (!P.throwTold) { P.throwTold = 1; toast('E, F o clic per lanciare la palla: il cane la riporta!'); } }
      if (k.backP && !m.got) setMode('explore');
    } else if (mode === 'throw') {
      const m = W.m; o.lookW = 0.6; o.lookAt = headPos().addScaledVector(fwdOf(W.yaw), 3).add(V(0, 0.3, 0));
      if (!m.released && W.t >= THROW_RELEASE) {
        m.released = true; P.ballHeld = false;
        const camPitch = clamp(W.camPitch, -0.1, 0.9);
        const vel = fwdOf(W.yaw).multiplyScalar(5.2 - camPitch * 1.5).add(V(0, 2.3 + (0.3 - camPitch) * 1.2, 0));
        ball.throw(vel); audio.sfx('throw');
        if (dogApi) dog.onBall('thrown'); else has(dog, 'react') && dog.react('jump');
      }
      if (W.t > 0.95) setMode('explore');
    }
    return o;
  }

  // ---------------- per-frame ----------------
  function frame(dt) {
    dprops.update(dt);
    if (W.carry && P.ballHeld) { P.ballHeld = false; ball.detach(V(0, 0.5, 0)); }
    if (dogApi) {
      dog.auto = true;
      dog.observe({ pos: manPos(), head: headPos(), mode: W.mode, vel: W.vel, ball: P.ballHeld, ballObj: ball });
    }
    // affection HUD: near the dog or while playing with it
    const show = dogApi && (owns(W.mode) || P.menu || (W.focus && W.focus.id === 'dog') || dogNear(1.6));
    if (ui.hud && ui.hud.setAffection) { const v = show ? aff() : null; if (v !== P.lastAff) { ui.hud.setAffection(v); P.lastAff = v; } }
    if (P.menu) { P.menuT += dt; if (P.menuT > 12) P.menu = false; }
  }
  function prompt() {
    if (!ui.prompt) return false;
    if (P.menu) { ui.prompt(menuList().concat([{ key: 'G', label: 'Chiudi' }]), dogHead().add(V(0, 0.22, 0)), camera); return true; }
    if (W.mode === 'pet' && P.items) { ui.prompt(P.items, dogPos().clone().add(V(0, 0.05, 0)).lerp(dogHead(), 0.3), camera); return true; }
    return false;
  }
  function camera_(pose) {
    if (W.mode !== 'pet' && W.mode !== 'paw') return null;
    const mp = manPos(), dp = dogPos();
    const md = V(dp.x - mp.x, 0, dp.z - mp.z); const L = md.length() || 1; md.divideScalar(L);
    const side = V(md.z, 0, -md.x);
    // keep the camera on the side it already is
    if (pose && P.camLock === undefined) { const c = camera.position; P.camSide = (c.x - mp.x) * side.x + (c.z - mp.z) * side.z >= 0 ? 1 : -1; P.camLock = 1; }
    const mid = mp.clone().lerp(dp, 0.55);
    const pos = mid.clone().addScaledVector(side, 1.6 * P.camSide).addScaledVector(md, -0.1).add(V(0, 0.82, 0));
    const look = dogHead().lerp(headPos(), 0.42);
    return { pos, look, fov: 48 };
  }
  function onModeChange(m) {
    if (m !== 'pet' && m !== 'paw') P.camLock = undefined;
    // modes that need both hands: put the ball down at the man's feet
    if (P.ballHeld && !['explore', 'goto', 'throw', 'pickball', 'standup', 'leaving'].includes(m)) { P.ballHeld = false; ball.detach(fwdOf(W.yaw).multiplyScalar(0.4).add(V(0, 0.6, 0))); }
  }
  function dogLook() {
    if (W.mode === 'cabinet') return null;
    if (owns(W.mode)) return { look: headPos(), excite: 0.8 };
    return undefined; // let explore decide
  }
  return { dogItem, ballItem, handleExplore, menuOpen, owns, updateMode, frame, prompt, camera: camera_, dogLook, onModeChange, props: dprops, ball, P };
}
