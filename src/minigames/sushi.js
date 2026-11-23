// "Sushi all you can eat": grab plates when they pass in front of you (E / Space / click) and eat more than the persona
// NPCs in 60 s. Golden plates are worth 3, the green "wasabi bomb" burns for 2 s, plates are shared with the others.
// Two belts: the quartiere's sushi restaurant (anchor 'sushi_conveyor' + window.__quartiere.places.sushi.belt, used as is)
// or, without the quartiere, our own little kaiten kiosk in the garden. sushi_plates.glb (if present) is the centrepiece.
import * as THREE from 'three';
import { requestWarmup, V, rnd, smooth, shuffle, persona, personas, catchphrase, ask, SAFE, clean, esc, overlayCSS, unlock, record, phone, logEvent, anchor, cv, canvasTex, signTex } from './shared.js';
import { loadStatic, fitModel } from './zmodel.js';

const DUR = 60;
const TYPES = {
  salmone: { id: 'salmone', pts: 1, plate: 0xf4f1ea, top: 0xff8a4a, kind: 'nigiri', w: 5 },
  tonno: { id: 'tonno', pts: 1, plate: 0x3a6ad0, top: 0xc0283a, kind: 'nigiri', w: 4 },
  maki: { id: 'maki', pts: 1, plate: 0xd03030, top: 0xff9a50, kind: 'maki', w: 4 },
  cetriolo: { id: 'cetriolo', pts: 1, plate: 0x1a1a1a, top: 0x5ab84a, kind: 'maki', w: 2 },
  oro: { id: 'oro', pts: 3, plate: 0xe8b830, top: 0xffb070, kind: 'nigiri', w: 1.2 },
  wasabi: { id: 'wasabi', pts: 0, plate: 0x40b030, top: 0x7ad040, kind: 'bomb', w: 1.3 },
};
const TL = Object.values(TYPES);
const pickType = () => { const s = TL.reduce((a, t) => a + t.w, 0); let r = Math.random() * s; for (const t of TL) { r -= t.w; if (r <= 0) return t; } return TL[0]; };
const CSS = `#mg-sushi{position:fixed;left:50%;top:4vh;transform:translateX(-50%);z-index:9;display:none;gap:14px;align-items:stretch;font:600 14px/1.25 system-ui,sans-serif;color:#fff;pointer-events:none}
#mg-sushi.on{display:flex}#mg-sushi .c{background:rgba(12,12,16,.72);border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:8px 14px;min-width:86px;text-align:center;backdrop-filter:blur(4px)}
#mg-sushi .c b{display:block;font:800 24px/1.1 system-ui}#mg-sushi .c.me{border-color:#ffd040}#mg-sushi .c.burn{background:rgba(60,160,40,.6)}
#mg-sushi-res{position:fixed;inset:0;z-index:40;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.55);font:15px/1.4 system-ui,sans-serif;color:#fff}
#mg-sushi-res.on{display:flex}#mg-sushi-res .box{background:#16161c;border:1px solid #333;border-radius:14px;padding:26px 30px;width:min(520px,90vw)}
#mg-sushi-res h2{margin:0 0 14px;font:800 26px system-ui}#mg-sushi-res .row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #2a2a30}#mg-sushi-res .q{margin:16px 0 4px;color:#cfd;min-height:2.6em}#mg-sushi-res .h{color:#999;font-size:13px;margin-top:14px}
#mg-sushi-res kbd,#mg-sushi kbd{border:1px solid #888;border-radius:4px;padding:0 5px;font:600 12px ui-monospace,monospace}`;


// instanced plates (plate, 2 nigiri or 3 maki) in the space of `parent`; one draw call per part
function plateRenderer(parent, NP) {
  const mkI = (geo, m, n) => { const im = new THREE.InstancedMesh(geo, m, n); im.frustumCulled = false; im.castShadow = false; im.receiveShadow = true; parent.add(im); return im; };
  const plateI = mkI(new THREE.CylinderGeometry(0.085, 0.065, 0.016, 20), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25 }), NP);
  const riceI = mkI(new THREE.BoxGeometry(0.06, 0.024, 0.032), new THREE.MeshStandardMaterial({ color: 0xf6f3ea, roughness: 0.9 }), NP * 2);
  const fishI = mkI(new THREE.BoxGeometry(0.072, 0.011, 0.04), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 }), NP * 2);
  const makiI = mkI(new THREE.CylinderGeometry(0.022, 0.022, 0.032, 14), new THREE.MeshStandardMaterial({ color: 0x18261a, roughness: 0.8 }), NP * 3);
  const fillI = mkI(new THREE.CylinderGeometry(0.017, 0.017, 0.034, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), NP * 3);
  const all = [plateI, riceI, fishI, makiI, fillI];
  const col = new THREE.Color(), m4 = new THREE.Matrix4(), ml = new THREE.Matrix4(), mm = new THREE.Matrix4(), q = new THREE.Quaternion(), s1 = V(1, 1, 1), ZM = new THREE.Matrix4().makeScale(0, 0, 0), UP = V(0, 1, 0);
  return {
    hide(i) { plateI.setMatrixAt(i, ZM); for (let k = 0; k < 2; k++) { riceI.setMatrixAt(i * 2 + k, ZM); fishI.setMatrixAt(i * 2 + k, ZM); } for (let k = 0; k < 3; k++) { makiI.setMatrixAt(i * 3 + k, ZM); fillI.setMatrixAt(i * 3 + k, ZM); } },
    set(i, pos, rot, t) {
      q.setFromAxisAngle(UP, rot); m4.compose(pos, q, s1);
      plateI.setMatrixAt(i, m4); plateI.setColorAt(i, col.setHex(t.plate));
      for (let k = 0; k < 2; k++) {
        if (t.kind !== 'maki') { ml.makeTranslation(-0.025 + k * 0.05, 0.02, 0); riceI.setMatrixAt(i * 2 + k, mm.multiplyMatrices(m4, ml)); ml.makeTranslation(-0.025 + k * 0.05, 0.036, 0); fishI.setMatrixAt(i * 2 + k, mm.multiplyMatrices(m4, ml)); fishI.setColorAt(i * 2 + k, col.setHex(t.top)); }
        else { riceI.setMatrixAt(i * 2 + k, ZM); fishI.setMatrixAt(i * 2 + k, ZM); }
      }
      for (let k = 0; k < 3; k++) {
        if (t.kind === 'maki') { const a = k * 2.1; ml.makeTranslation(Math.cos(a) * 0.035, 0.024, Math.sin(a) * 0.035); mm.multiplyMatrices(m4, ml); makiI.setMatrixAt(i * 3 + k, mm); fillI.setMatrixAt(i * 3 + k, mm); fillI.setColorAt(i * 3 + k, col.setHex(t.top)); }
        else { makiI.setMatrixAt(i * 3 + k, ZM); fillI.setMatrixAt(i * 3 + k, ZM); }
      }
    },
    flush() { for (const im of all) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; } },
    set visible(v) { for (const im of all) im.visible = v; },
  };
}

// ------------------------------------------------------------------ belt adapter: our own kiosk (garden fallback)
function ownKiosk(ctx, W, A) {
  const L = 2.2, RAD = 0.36, PERIM = 2 * L + 2 * Math.PI * RAD, NP = 22, H0 = 0.88;
  const pathAt = (s, out) => {
    s = ((s % PERIM) + PERIM) % PERIM;
    if (s < L) return out.set(L / 2 - s, 0, -RAD);
    s -= L; if (s < Math.PI * RAD) { const a = s / RAD; return out.set(-L / 2 - Math.sin(a) * RAD, 0, -Math.cos(a) * RAD); }
    s -= Math.PI * RAD; if (s < L) return out.set(-L / 2 + s, 0, RAD);
    s -= L; const a = s / RAD; return out.set(L / 2 + Math.sin(a) * RAD, 0, Math.cos(a) * RAD);
  };
  const yaw = A.yaw ?? 0;
  const g = new THREE.Group(); g.position.copy(A.pos); g.position.y = 0; g.rotation.y = yaw; ctx.scene.add(g);
  const add = (geo, m, x, y, z, parent = g, cast = true) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = cast; o.receiveShadow = true; parent.add(o); return o; };
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.6 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.3, metalness: 0.8 });
  const sh = new THREE.Shape(); sh.absarc(-L / 2, 0, RAD + 0.32, Math.PI / 2, Math.PI * 1.5); sh.absarc(L / 2, 0, RAD + 0.32, -Math.PI / 2, Math.PI / 2);
  const top = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: false }); top.rotateX(Math.PI / 2); top.translate(0, H0, 0); add(top, wood, 0, 0, 0);
  const base = new THREE.ExtrudeGeometry(sh, { depth: H0 - 0.05, bevelEnabled: false }); base.rotateX(Math.PI / 2); base.translate(0, H0 - 0.05, 0); base.scale(0.92, 1, 0.82);
  add(base, new THREE.MeshStandardMaterial({ color: 0x3a2418, roughness: 0.8 }), 0, 0, 0);
  const bc = cv(256, 32), bx = bc.getContext('2d'); bx.fillStyle = '#2a2c30'; bx.fillRect(0, 0, 256, 32); bx.fillStyle = '#44474d'; for (let i = 0; i < 256; i += 8) bx.fillRect(i, 0, 2, 32);
  const beltTex = canvasTex(bc); beltTex.wrapS = beltTex.wrapT = THREE.RepeatWrapping; beltTex.repeat.set(12, 1);
  const ring = new THREE.Shape(); ring.absarc(-L / 2, 0, RAD + 0.09, Math.PI / 2, Math.PI * 1.5); ring.absarc(L / 2, 0, RAD + 0.09, -Math.PI / 2, Math.PI / 2);
  const hole = new THREE.Path(); hole.absarc(-L / 2, 0, RAD - 0.09, Math.PI / 2, Math.PI * 1.5); hole.absarc(L / 2, 0, RAD - 0.09, -Math.PI / 2, Math.PI / 2); ring.holes.push(hole);
  const beltG = new THREE.ShapeGeometry(ring, 24); beltG.rotateX(-Math.PI / 2);
  add(beltG, new THREE.MeshStandardMaterial({ map: beltTex, roughness: 0.5, metalness: 0.3 }), 0, H0 + 0.012, 0, g, false);
  for (const z of [-1, 1]) add(new THREE.BoxGeometry(L, 0.03, 0.012), steel, 0, H0 + 0.02, z * (RAD + 0.095), g, false);
  add(new THREE.BoxGeometry(L, 0.06, 0.44), wood, 0, H0 + 0.04, 0); // middle island
  const seat = (x, z) => { const s = new THREE.Group(); s.position.set(x, 0, z); g.add(s); add(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 16), new THREE.MeshStandardMaterial({ color: 0xb02020, roughness: 0.5 }), 0, 0.66, 0, s); add(new THREE.CylinderGeometry(0.025, 0.025, 0.64, 8), steel, 0, 0.32, 0, s); add(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 12), steel, 0, 0.01, 0, s); };
  const SEATS = [{ x: 0, z: -1 }, { x: -0.85, z: -1 }, { x: -0.6, z: 1 }, { x: 0.6, z: 1 }];
  for (const s of SEATS) seat(s.x, s.z * (RAD + 0.55));
  // kiosk: posts, roof, sign, noren, lanterns
  const post = new THREE.MeshStandardMaterial({ color: 0x5a1a10, roughness: 0.6 });
  for (const [x, z] of [[-1.85, -1.25], [1.85, -1.25], [-1.85, 1.25], [1.85, 1.25]]) add(new THREE.BoxGeometry(0.1, 2.5, 0.1), post, x, 1.25, z);
  add(new THREE.BoxGeometry(4.1, 0.1, 2.9), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.7 }), 0, 2.55, 0);
  const sign = add(new THREE.PlaneGeometry(2.4, 0.5), new THREE.MeshBasicMaterial({ map: signTex('SUSHI ALL YOU CAN EAT', { w: 1024, h: 200, bg: '#1a0a08', fg: '#ffe0b0', font: '900 96px Impact, "Arial Black", sans-serif', glow: '#ff5020' }), toneMapped: false }), 0, 2.25, -1.3, g, false);
  sign.rotation.y = Math.PI;
  const nc = cv(256, 128), nx = nc.getContext('2d'); nx.fillStyle = '#1d3a7a'; nx.fillRect(0, 0, 256, 128); nx.fillStyle = '#fff'; nx.font = '900 64px serif'; nx.textAlign = 'center'; nx.fillText('寿司', 128, 86);
  add(new THREE.PlaneGeometry(1.2, 0.45), new THREE.MeshStandardMaterial({ map: canvasTex(nc), side: THREE.DoubleSide, roughness: 0.9 }), -1.2, 1.95, -1.3, g, false).rotation.y = Math.PI;
  const lantern = new THREE.MeshStandardMaterial({ color: 0xff4020, emissive: 0xff3010, emissiveIntensity: 1.6, roughness: 0.7 });
  for (const x of [-1.7, 1.7]) add(new THREE.SphereGeometry(0.16, 14, 10), lantern, x, 2.1, -1.35, g, false).scale.y = 1.3;
  g.updateMatrixWorld(true);
  const cw = [[-L / 2 - RAD - 0.32, -RAD - 0.32], [L / 2 + RAD + 0.32, -RAD - 0.32], [-L / 2 - RAD - 0.32, RAD + 0.32], [L / 2 + RAD + 0.32, RAD + 0.32]].map(([x, z]) => g.localToWorld(V(x, 0, z)));
  if (W.boxes) W.boxes.push({ id: 'mg-sushi', min: V(Math.min(...cw.map(p => p.x)), 0, Math.min(...cw.map(p => p.z))), max: V(Math.max(...cw.map(p => p.x)), 0, Math.max(...cw.map(p => p.z))) });
  // the centrepiece (sushi_plates.glb) on the island
  loadStatic('sushi_plates').then(o => { if (!o) return; const w = fitModel(o, 0.44); w.position.set(0, H0 + 0.07, 0); g.add(w); requestWarmup(); });
  const R = plateRenderer(g, NP), pp = V();
  const plates = []; for (let i = 0; i < NP; i++) plates.push({ s: i * PERIM / NP, type: pickType(), gone: 0 });
  return {
    NP, stand: g.localToWorld(V(0, 0, -(RAD + 0.95))).setY(0), yaw, top: g.localToWorld(V(0, 1.2, -RAD)), y: H0 + 0.03,
    seat: k => g.localToWorld(V(SEATS[k].x, H0 + 0.03, SEATS[k].z * RAD)),
    stackAt: k => g.localToWorld(V(SEATS[k].x + 0.2, H0 + 0.05, SEATS[k].z * (RAD + 0.2))),
    tagAt: k => g.localToWorld(V(SEATS[k].x, 1.55, SEATS[k].z * (RAD + 0.55))),
    cam: () => ({ pos: g.localToWorld(V(0.05, 1.75, -(RAD + 1.35))), look: g.localToWorld(V(0, H0 - 0.05, 0.05)), fov: 50 }),
    pos(i, out) { const p = plates[i]; if (p.gone) return null; return g.localToWorld(pathAt(p.s, out).setY(H0 + 0.03)); },
    type: i => plates[i].type,
    take(i) { plates[i].gone = 0.001; },
    restart() { for (const p of plates) { p.type = pickType(); p.gone = 0; } },
    tick(dt, speed, camPos) {
      if (camPos && camPos.distanceTo(g.position) > 16) return;
      beltTex.offset.x -= dt * speed * 3.2;
      for (let i = 0; i < NP; i++) {
        const p = plates[i]; p.s += dt * speed;
        if (p.gone) { p.gone += dt; if (p.gone > 4 && ((p.s % PERIM) + PERIM) % PERIM > L + 0.4) { p.gone = 0; p.type = pickType(); } }
        if (p.gone) { R.hide(i); continue; }
        R.set(i, pathAt(p.s, pp).setY(H0 + 0.022), p.s * 0.6, p.type);
      }
      R.flush();
    },
    setSpeedFor() { }, end() { },
  };
}

// ------------------------------------------------------------------ belt adapter: the quartiere's restaurant (belt used as is)
function quartiereBelt(A) {
  const Q = window.__quartiere;
  const getBelt = () => { try { const pl = (Q.places && Q.places.sushi) || (Q.build && Q.build('sushi')); return pl && pl.belt; } catch (e) { return null; } };
  const yaw = A.yaw ?? 0, f = V(Math.sin(yaw), 0, Math.cos(yaw));
  const stand = A.pos.clone().setY(0);
  const COLS = [TYPES.tonno, TYPES.maki, TYPES.oro, TYPES.wasabi, TYPES.cetriolo, TYPES.salmone]; // the belt's plate colours: blue red yellow green black white
  let B = null, len = 10, seats = [], outs = [], oldSpeed = null;
  const hiddenAt = new Map(), tmp = V(); let clock = 0;
  function setup() {
    B = getBelt(); if (!B) return false;
    if (seats.length) return true;
    len = B.curve.getLength();
    const want = stand.clone().addScaledVector(f, 0.75); let best = 0, bd = 1e9;
    for (let i = 0; i < 400; i++) { const p = B.curve.getPointAt(i / 400, tmp); const d = Math.hypot(p.x - want.x, p.z - want.z); if (d < bd) { bd = d; best = i / 400; } }
    const uSeat = [best, (best + 0.09) % 1, (best + 0.45) % 1, (best + 0.62) % 1];
    const c = V(); for (let i = 0; i < 40; i++) c.add(B.curve.getPointAt(i / 40, tmp)); c.multiplyScalar(1 / 40);
    seats = uSeat.map(u => B.curve.getPointAt(u, V()).setY(B.y + 0.01));
    outs = seats.map((p, k) => (k === 0 ? f.clone().negate() : V(p.x - c.x, 0, p.z - c.z).normalize()));
    return true;
  }
  const uOf = i => (B.offset + i / B.count) % 1;
  return {
    get NP() { return B ? B.count : 0; }, stand, yaw, top: A.pos.clone().addScaledVector(f, 0.75).setY(1.25), get y() { return B ? B.y + 0.01 : 1; },
    ready: setup,
    seat: k => seats[k].clone(),
    stackAt: k => seats[k].clone().addScaledVector(outs[k], k === 0 ? 0.32 : 0.36).setY(B.y - 0.02),
    tagAt: k => seats[k].clone().addScaledVector(outs[k], 0.75).setY(1.6),
    cam: () => ({ pos: stand.clone().addScaledVector(f, -0.55).setY(1.78), look: seats[0].clone().addScaledVector(f, 0.25).setY(B.y - 0.08), fov: 52 }),
    pos(i, out) { if (B.hidden.has(i)) return null; const p = B.curve.getPointAt(uOf(i), out); p.y = B.y; return p; },
    type: i => COLS[i % COLS.length],
    take(i) { B.hidden.add(i); hiddenAt.set(i, clock); },
    restart() { for (const i of hiddenAt.keys()) B.hidden.delete(i); hiddenAt.clear(); },
    tick(dt) { clock += dt; if (!B) return; for (const [i, t0] of hiddenAt) if (clock - t0 > 5) { B.hidden.delete(i); hiddenAt.delete(i); } },
    setSpeedFor(v) { if (!B) return; if (oldSpeed === null) oldSpeed = B.speed; B.speed = v / len; },
    end() { if (B && oldSpeed !== null) { B.speed = oldSpeed; oldSpeed = null; } },
  };
}


// ------------------------------------------------------------------ belt adapter: sushi_conveyor.glb placed by the quartiere
// The U counter's world bbox gives the path: front arm (the side nearest the anchor) + the two side arms, along the
// middle of the counter top at ~0.975 m; plates go back hidden across the open (kitchen) side. Our plates, our renderer;
// the quartiere's procedural belt plates (made for its own counter) are hidden while the model is there.
function findConveyor(scene) {
  const Q = window.__quartiere, pl = Q && Q.places && Q.places.sushi;
  let o = pl && (pl.conveyor || pl.conveyorModel) || null;
  if (!o) (pl && pl.group || scene).traverse(x => { if (!o && x.visible && /sushi_conveyor/i.test(x.name || '') && x.children.length) o = x; });
  return o;
}
function glbBelt(A, obj, scene) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj), c = box.getCenter(V()), sz = box.getSize(V());
  // customers' side: the model's +Z (stools), snapped to an axis; the anchor's side if the model axis is unclear
  const wd = obj.getWorldDirection(V()); wd.y = 0;
  const dx = A.pos.x - c.x, dz = A.pos.z - c.z;
  const n = wd.lengthSq() > 0.25 ? (Math.abs(wd.x) > Math.abs(wd.z) ? V(Math.sign(wd.x), 0, 0) : V(0, 0, Math.sign(wd.z)))
    : (Math.abs(dx) / Math.max(0.1, sz.x) > Math.abs(dz) / Math.max(0.1, sz.z) ? V(Math.sign(dx) || 1, 0, 0) : V(0, 0, Math.sign(dz) || 1));
  const t = V(-n.z, 0, n.x);
  const hx = (n.x ? sz.z : sz.x) / 2, hz = (n.x ? sz.x : sz.z) / 2; // lateral / depth half-extents
  const a = Math.min(0.4, Math.max(0.22, Math.min(hx, hz) * 0.18)), Y = 0.975;
  const W2 = (lat, dep, out = V()) => out.copy(c).addScaledVector(t, lat).addScaledVector(n, dep).setY(Y);
  const P = [[-(hx - a), -hz + 0.12], [-(hx - a), hz - a], [hx - a, hz - a], [hx - a, -hz + 0.12]];
  const seg = []; let tot = 0;
  for (let i = 0; i < 4; i++) { const p0 = P[i], p1 = P[(i + 1) % 4]; const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]); seg.push({ p0, p1, L, s0: tot, hidden: i === 3 }); tot += L; }
  const at = (s, out) => { s = ((s % tot) + tot) % tot; for (const g of seg) if (s <= g.s0 + g.L) { const u = (s - g.s0) / g.L; return { p: W2(g.p0[0] + (g.p1[0] - g.p0[0]) * u, g.p0[1] + (g.p1[1] - g.p0[1]) * u, out), hidden: g.hidden }; } return { p: W2(P[0][0], P[0][1], out), hidden: true }; };
  const NP = 30, R = plateRenderer(scene, NP), plates = []; for (let i = 0; i < NP; i++) plates.push({ s: i * tot / NP, type: pickType(), gone: 0 });
  // seats: you in front of the anchor; one more on the front arm, one per side arm
  const latMe = Math.max(-(hx - a) + 0.3, Math.min(hx - a - 0.3, (A.pos.x - c.x) * t.x + (A.pos.z - c.z) * t.z));
  const S = [[latMe, hz - a, n], [latMe + (latMe > 0 ? -0.95 : 0.95), hz - a, n], [-(hx - a), 0, t.clone().negate()], [hx - a, 0, t.clone()]];
  const seats = S.map(([l, d]) => W2(l, d)), outs = S.map(s => s[2]);
  // stand on the stools side, in front of your seat (the anchor if it is outside the counter)
  const inside = Math.abs(dx) < sz.x / 2 + 0.15 && Math.abs(dz) < sz.z / 2 + 0.15;
  const stand = inside ? W2(latMe, hz + 0.45).setY(0) : A.pos.clone().setY(0);
  const hideQ = () => { try { const B = window.__quartiere.places.sushi.belt; for (const k of ['plates', 'rice', 'fish']) if (B[k]) B[k].visible = false; } catch (e) { } };
  hideQ();
  let speed = 0.16;
  return {
    NP, stand, yaw: Math.atan2(-n.x, -n.z), top: seats[0].clone().setY(1.25), y: Y,
    ready: () => true,
    seat: k => seats[k].clone(),
    stackAt: k => seats[k].clone().addScaledVector(outs[k], a * 0.75).setY(Y - 0.01),
    tagAt: k => seats[k].clone().addScaledVector(outs[k], 0.8).setY(1.6),
    cam: () => ({ pos: stand.clone().addScaledVector(n, 0.55).setY(1.78), look: seats[0].clone().addScaledVector(n, -0.25).setY(Y - 0.08), fov: 52 }),
    pos(i, out) { const p = plates[i]; if (p.gone) return null; const r = at(p.s, out); return r.hidden ? null : r.p; },
    type: i => plates[i].type,
    take(i) { plates[i].gone = 0.001; },
    restart() { for (const p of plates) { p.type = pickType(); p.gone = 0; } hideQ(); },
    tick(dt, sp, camPos) {
      speed = sp || speed;
      if (camPos && camPos.distanceTo(c) > 18) return;
      const tmp = V();
      for (let i = 0; i < NP; i++) {
        const p = plates[i]; p.s += dt * speed;
        const r = at(p.s, tmp);
        if (p.gone) { p.gone += dt; if (p.gone > 4 && r.hidden) { p.gone = 0; p.type = pickType(); } }
        if (p.gone || r.hidden) R.hide(i); else R.set(i, r.p, p.s * 0.6, p.type);
      }
      R.flush();
    },
    setSpeedFor() { }, end() { },
  };
}

export function sushiPlugin(M) {
  return (ctx, W, H) => {
    const { goTo, setMode, toast } = H;
    const { audio, scene } = ctx;
    const A = anchor(ctx.level, 'sushi_conveyor', { pos: V(12.6, 0, 14.5), yaw: Math.PI / 2 });
    const useQ = A.real && window.__quartiere;
    const BtQ = useQ ? quartiereBelt(A) : null;
    let Bt = BtQ || ownKiosk(ctx, W, A.real ? { pos: A.pos.clone().addScaledVector(V(Math.sin(A.yaw || 0), 0, Math.cos(A.yaw || 0)), 1.31), yaw: A.yaw || 0 } : A);
    // the quartiere may swap its counter for sushi_conveyor.glb (async): switch to the model's path when it shows up
    let lookT = 0, glbOn = false;
    const checkGlb = () => { if (!useQ || glbOn || (G && !G.over)) return; const o = findConveyor(scene); if (o) { try { Bt = glbBelt(A, o, scene); glbOn = true; } catch (e) { console.warn('sushi glb', e); glbOn = true; } } };
    // the grab ring, plate stacks and name tags (world space)
    const zone = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.122, 28), new THREE.MeshBasicMaterial({ color: 0xffd040, transparent: true, opacity: 0, toneMapped: false, depthWrite: false }));
    zone.rotation.x = -Math.PI / 2; zone.visible = false; scene.add(zone);
    const stripe = cv(16, 64), stx = stripe.getContext('2d'); for (let i = 0; i < 64; i += 4) { stx.fillStyle = i % 8 ? '#f4f1ea' : '#c8c2b4'; stx.fillRect(0, i, 16, 4); }
    const stacks = [0, 1, 2, 3].map(() => { const t = canvasTex(stripe); t.wrapT = THREE.RepeatWrapping; const m = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 1, 18), new THREE.MeshStandardMaterial({ color: 0xffffff, map: t, roughness: 0.3 })); m.visible = false; m.castShadow = true; scene.add(m); return m; });
    const tags = [0, 1, 2, 3].map(i => { if (!i) return null; const c = cv(256, 80); const t = canvasTex(c); const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); sp.scale.set(0.5, 0.156, 1); sp.visible = false; sp.renderOrder = 5; scene.add(sp); return { c, t, sp }; });
    const flyGeo = new THREE.CylinderGeometry(0.085, 0.065, 0.016, 16);
    const flyers = [];
    function setStack(i, n) { const m = stacks[i]; m.visible = n > 0; const h = Math.max(0.012, n * 0.014); const p = Bt.stackAt(i); m.position.set(p.x, p.y + h / 2, p.z); m.scale.y = h; m.material.map.repeat.set(1, Math.max(1, n) / 4); }
    function setTag(i, id, n) { const T = tags[i]; if (!T) return; const p = persona(id); const x = T.c.getContext('2d'); x.clearRect(0, 0, 256, 80); x.fillStyle = 'rgba(10,10,14,.78)'; x.beginPath(); x.roundRect(4, 4, 248, 72, 14); x.fill(); x.fillStyle = p.color || '#fff'; x.font = '700 30px system-ui'; x.textAlign = 'center'; x.fillText(`${p.emoji || ''} ${p.name || id}`, 128, 36); x.fillStyle = '#fff'; x.font = '600 24px system-ui'; x.fillText(n + ' piatti', 128, 66); T.t.needsUpdate = true; T.sp.position.copy(Bt.tagAt(i)); T.sp.visible = true; }

    overlayCSS(CSS);
    const hud = document.createElement('div'); hud.id = 'mg-sushi'; document.body.appendChild(hud);
    const res = document.createElement('div'); res.id = 'mg-sushi-res'; document.body.appendChild(res);
    let G = null;
    function drawHud() {
      if (!G) { hud.classList.remove('on'); return; }
      hud.classList.add('on');
      hud.innerHTML = `<div class="c">⏱<b>${Math.ceil(Math.max(0, DUR - G.t))}</b></div>` + G.eaters.map((e, i) => `<div class="c${i ? '' : ' me'}${!i && G.burn > 0 ? ' burn' : ''}">${i ? esc((persona(e.id).emoji || '') + ' ' + persona(e.id).name) : '🫵 Tu'}<b>${e.pts}</b>${e.n} piatti</div>`).join('') + `<div class="c" style="min-width:150px;font-weight:500"><kbd>E</kbd> / <kbd>Spazio</kbd> prendi<br><small style="color:#aaa">oro = 3 · verde = wasabi!</small></div>`;
    }
    function begin() {
      checkGlb();
      if (Bt.ready && !Bt.ready()) { toast('Il nastro del sushi non è ancora pronto'); return; }
      const have = new Set(personas().map(p => p.id));
      const opp = shuffle(['ashish', 'parme', 'asche', 'lombu', 'forla'].filter(id => have.has(id))).slice(0, 3);
      G = { t: 0, burn: 0, cd: 0, eaters: [{ id: 'me', n: 0, pts: 0 }, ...opp.map(id => ({ id, n: 0, pts: 0, cd: rnd(1, 3), skill: rnd(0.55, 0.85) }))], over: false };
      Bt.restart();
      G.eaters.forEach((e, i) => { setStack(i, 0); if (i) setTag(i, e.id, 0); });
      const zp = Bt.seat(0); zone.position.set(zp.x, Bt.y + 0.012, zp.z); zone.visible = true;
      res.classList.remove('on'); drawHud();
      toast('Sushi all you can eat: 60 secondi! E o Spazio quando un piatto passa nel cerchio');
      try { audio.ctx && audio.sfx('start'); } catch (e) { }
    }
    function eat(ei, i) {
      const e = G.eaters[ei], t = Bt.type(i), from = Bt.pos(i, V()); if (!from) return;
      Bt.take(i);
      flyers.push({ from, to: Bt.stackAt(ei), t: 0, ei, col: t.plate });
      if (t.id === 'wasabi') { if (!ei) { G.burn = 2; toast('🌶️ BRUCIA! Wasabi bomb'); try { audio.ctx && audio.noise(0.6, 0.12, 5000, 900, audio.room, 0, 1, 'highpass'); } catch (x) { } } else e.cd += 2; }
      else { e.n++; e.pts += t.pts; setStack(ei, e.n); if (ei) setTag(ei, e.id, e.n); }
      if (!ei) { try { audio.ctx && audio.sfx('pickup'); if (t.pts >= 3) audio.sfx('coin'); } catch (x) { } }
      drawHud();
    }
    function finish() {
      G.over = true; hud.classList.remove('on'); zone.visible = false; Bt.end();
      const rank = G.eaters.map((e, i) => ({ ...e, i })).sort((a, b) => b.pts - a.pts || b.n - a.n);
      const me = G.eaters[0], win = rank[0].i === 0;
      res.innerHTML = `<div class="box"><h2>${win ? '🏆 Hai vinto l\'all you can eat!' : '🍣 Fine dell\'all you can eat'}</h2>${rank.map((e, k) => `<div class="row"><span>${k + 1}. ${e.i ? esc((persona(e.id).emoji || '') + ' ' + persona(e.id).name) : '🫵 Tu'}</span><span>${e.pts} punti · ${e.n} piatti</span></div>`).join('')}<div class="q"><span class="mg-dots"><span>.</span><span>.</span><span>.</span></span></div><div class="h"><kbd>E</kbd> rigioca · <kbd>Esc</kbd> alzati</div></div>`;
      res.classList.add('on');
      unlock('sushi_play', { title: 'All you can eat', desc: 'Prima sfida al sushi', icon: '🍣' });
      if (win) unlock('sushi_win', { title: 'Re del sushi', desc: 'Hai mangiato più di tutti', icon: '👑' });
      if (me.n >= 20) unlock('sushi_20', { title: 'Polleg', desc: '20 piatti in un minuto', icon: '🥢' });
      const isRec = record('sushi_record', me.pts);
      logEvent('sushi', `all'all you can eat: ${me.n} piatti (${me.pts} punti), ${win ? 'primo' : (rank.findIndex(e => e.i === 0) + 1) + '°'}`);
      const top = rank.find(e => e.i) || rank[0]; const who = win ? top.id : rank[0].id;
      ask({ model: 'fast', maxTokens: 50, persona: who, system: `Sei ${persona(who).name}, amico al sushi all you can eat. Stile: ${persona(who).tone}. Una battuta breve (max 14 parole) sul risultato. ${SAFE}`,
        prompt: win ? `Hai perso la sfida di sushi: l'amico ha fatto ${me.n} piatti, tu ${top.n}.` : `Hai vinto la sfida di sushi con ${rank[0].n} piatti; l'amico ne ha fatti ${me.n}.` },
        () => catchphrase(who) + (win ? ', rivincita la prossima volta' : ', polleg è casa mia'), 6000)
        .then(t => { const q = res.querySelector('.q'); if (q) q.innerHTML = `<b style="color:${esc(persona(who).color || '#fff')}">${esc(persona(who).name)}:</b> ${esc(clean(t, 120))}`; });
      if (isRec && me.n > 5) phone(who, `${me.n} piatti?? ${catchphrase(who)}`);
      try { audio.ctx && audio.sfx(win ? 'clear' : 'gameover'); } catch (x) { }
    }
    function stop() { if (G && !G.over) Bt.end(); G = null; hud.classList.remove('on'); res.classList.remove('on'); zone.visible = false; for (let i = 0; i < 4; i++) { stacks[i].visible = false; if (tags[i]) tags[i].sp.visible = false; } }
    function start() { goTo(Bt.stand.clone(), Bt.yaw, () => { setMode('mg_sushi'); }); }
    W.mgOpen = W.mgOpen || {}; W.mgOpen.sushi = () => { if (W.mode === 'explore' && H.manPos().distanceTo(Bt.stand) < 4) { start(); return true; } toast('Il sushi all you can eat si gioca al nastro: ' + (window.__quartiere ? 'ristorante in Via Teletubbylandia' : 'chiosco in giardino')); return false; };
    const items = [{ id: 'mg-sushi', label: () => 'Siediti: sushi all you can eat', anchor: () => Bt.stand, top: () => Bt.top, range: 1.2, act: () => { if (W.carry) { toast('Prima posa l\'estintore'); return; } start(); } }];
    const pp = V();
    function plateInZone() { const s = Bt.seat(0); let best = -1, bd = 0.14; for (let i = 0; i < Bt.NP; i++) { const p = Bt.pos(i, pp); if (!p) continue; const d = Math.hypot(p.x - s.x, p.z - s.z); if (d < bd) { bd = d; best = i; } } return best; }
    function npcs(dt) {
      for (let k = 1; k < G.eaters.length; k++) {
        const e = G.eaters[k]; e.cd -= dt; if (e.cd > 0) continue;
        const s = Bt.seat(k);
        for (let i = 0; i < Bt.NP; i++) {
          const p = Bt.pos(i, pp); if (!p || Math.hypot(p.x - s.x, p.z - s.z) > 0.1) continue;
          if (Bt.type(i).id === 'wasabi' && Math.random() < 0.8) continue;
          if (Math.random() < e.skill) { eat(k, i); e.cd = rnd(1.6, 3.2); } else e.cd = 0.4;
          break;
        }
      }
    }
    return {
      items,
      owns: m => m === 'mg_sushi',
      update(mode, dt, I, keys) {
        if (!G && W.t > 0.4 && !W.m.tried) { W.m.tried = true; begin(); if (!G) setMode('standup'); }
        if (!G) return { crouchT: 0.6 };
        if (keys.backP) { stop(); setMode('standup'); return {}; }
        if (!G.over) {
          G.t += dt; G.burn = Math.max(0, G.burn - dt); G.cd = Math.max(0, G.cd - dt);
          Bt.setSpeedFor(0.26 + G.t * 0.003);
          const i = plateInZone();
          zone.material.opacity = i >= 0 ? 0.95 : 0.35; zone.material.color.setHex(G.burn > 0 ? 0x40c030 : i >= 0 && Bt.type(i).pts >= 3 ? 0xffe060 : 0xffd040);
          const grab = keys.actP || I.pressed('Space') || I.drag.click;
          if (grab && G.burn <= 0 && G.cd <= 0) { if (i >= 0) { eat(0, i); G.cd = 0.3; } else { G.cd = 0.45; try { audio.ctx && audio.noise(0.04, 0.05, 2000, 800, audio.room); } catch (x) { } } }
          npcs(dt);
          if (Math.floor(G.t * 4) !== Math.floor((G.t - dt) * 4)) drawHud();
          if (G.t >= DUR) finish();
        } else if (keys.actP || I.pressed('Space')) begin();
        const fl = flyers.find(f => f.ei === 0);
        return { crouchT: 0.6, leanT: 0.15, lookW: 1, lookAt: Bt.seat(0), rR: fl ? { pos: Bt.seat(0).add(V(0, 0.06, 0)), w: 1 - Math.abs(fl.t - 0.5) * 2, palm: 'down', grip: 0.6 } : undefined };
      },
      camera() { return W.mode === 'mg_sushi' && G ? Bt.cam() : null; },
      tick(dt, camPos) {
        if (W.mode !== 'mg_sushi' && G) stop();
        lookT -= dt; if (lookT <= 0) { lookT = 2; if (camPos && camPos.distanceTo(Bt.stand) < 25) checkGlb(); }
        Bt.tick(dt, G && !G.over ? 0.26 + G.t * 0.003 : 0.16, camPos);
        for (const f of flyers) { // plates flying to the stacks
          if (!f.mesh) { f.mesh = new THREE.Mesh(flyGeo, new THREE.MeshStandardMaterial({ color: f.col, roughness: 0.3 })); scene.add(f.mesh); }
          f.t += dt / 0.35; f.mesh.position.lerpVectors(f.from, f.to, smooth(f.t)); f.mesh.position.y += Math.sin(Math.min(1, f.t) * Math.PI) * 0.18;
          if (f.t >= 1) { scene.remove(f.mesh); f.mesh.material.dispose(); f.done = true; }
        }
        for (let i = flyers.length - 1; i >= 0; i--) if (flyers[i].done) flyers.splice(i, 1);
      },
    };
  };
}
