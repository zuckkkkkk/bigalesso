// rts/render.js — what the siege looks like in 3D: instanced friends, zombies, barricades, turrets, flags,
// selection rings, hp bars, tortellini in flight, puffs, order markers, build ghost.
// Everything is built at start-up (hidden) so the loading warm-up compiles it; no lights; no per-frame allocations.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ROLE_KEYS, ZTYPE_KEYS, ZTYPES, BUILDS, ZONES, COLORS } from '../../shared/siege.mjs';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const MAXU = 64, MAXZ = 160, MAXB = 32, MAXP = 72, MAXFX = 48;

// box with a flat vertex colour, placed at (x,y,z)
function box(w, h, d, x, y, z, col, rx = 0) {
  const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); g.translate(x, y, z);
  const c = new THREE.Color(col), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
function cyl(rt, rb, h, x, y, z, col, seg = 8) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg); g.translate(x, y, z);
  const c = new THREE.Color(col), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
const merge = (gs) => { const m = mergeGeometries(gs.map(g => g.index ? g.toNonIndexed() : g)); gs.forEach(g => g.dispose()); m.computeBoundingSphere(); return m; };

// friend figure: base (jeans, skin, hair) + shirt (torso + arms, white: the role colour comes from instanceColor)
const friendBaseGeo = () => merge([
  box(0.16, 0.5, 0.18, -0.11, 0.25, 0, '#3b4a6b'), box(0.16, 0.5, 0.18, 0.11, 0.25, 0, '#3b4a6b'),
  box(0.28, 0.3, 0.28, 0, 1.22, 0, '#e8b48a'), box(0.3, 0.1, 0.3, 0, 1.4, 0, '#3a2a1e'),
]);
const friendShirtGeo = () => merge([box(0.46, 0.55, 0.26, 0, 0.78, 0, '#ffffff'), box(0.13, 0.48, 0.14, -0.3, 0.8, 0, '#ffffff'), box(0.13, 0.48, 0.14, 0.3, 0.8, 0, '#ffffff')]);
// zombie: skin (head, arms forward, mouth) + clothes (torso + legs, white: tinted per type)
const zombieSkinGeo = () => merge([
  box(0.13, 0.13, 0.5, -0.3, 0.95, 0.27, '#9bc27a'), box(0.13, 0.13, 0.5, 0.3, 0.98, 0.25, '#9bc27a'),
  box(0.3, 0.3, 0.3, 0, 1.2, 0.06, '#9bc27a'), box(0.12, 0.05, 0.02, 0, 1.17, 0.215, '#2a1010'),
]);
const zombieClothesGeo = () => merge([box(0.17, 0.5, 0.18, -0.12, 0.25, 0, '#cccccc'), box(0.17, 0.5, 0.18, 0.12, 0.25, 0.04, '#cccccc'), box(0.48, 0.56, 0.28, 0, 0.78, 0.02, '#ffffff')]);
const PROP = {
  teppista: () => merge([box(0.32, 0.08, 0.32, 0, 1.44, 0, '#e0453a'), box(0.08, 0.08, 0.2, 0, 1.44, -0.22, '#e0453a')]), // bandana
  tortellini: () => merge([box(0.3, 0.34, 0.16, 0, 0.82, -0.22, '#c79a3a'), cyl(0.09, 0.09, 0.06, 0.34, 0.6, 0.12, '#f2c94c', 10)]), // pentola + tortellino
  spritz: () => merge([cyl(0.07, 0.05, 0.18, 0.36, 0.95, 0.12, '#ff7a1a', 10), cyl(0.012, 0.012, 0.14, 0.38, 1.08, 0.12, '#ffffff', 4)]), // spritz glass
  rider: () => merge([box(0.42, 0.42, 0.34, 0, 0.92, -0.32, '#20c4b0'), box(0.3, 0.04, 0.3, 0, 1.4, 0.02, '#20c4b0')]), // box + cap
};
const ROLE_TINT = { teppista: '#d65a4a', tortellini: '#f0c048', spritz: '#ff8a3a', rider: '#3ad0c0' };
const ZTINT = { walker: '#8d8f78', runner: '#9aa6b8', brute: '#2a2a2e', boss: '#26407e' }; // clothes: rags, tracksuit, bouncer suit, police blue

export function createRTSRender(scene, { low } = {}) {
  const root = new THREE.Group(); root.name = 'rts'; root.visible = false; scene.add(root);
  const matV = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  const matFlat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false });
  const PARK = new THREE.Matrix4().makeTranslation(0, -500, 0).scale(V(0.001, 0.001, 0.001));
  const mk = (geo, mat, cap, shadow) => {
    const m = new THREE.InstancedMesh(geo, mat, cap); m.count = 1; m.setMatrixAt(0, PARK); m.frustumCulled = false;
    m.castShadow = !!shadow && !low; m.receiveShadow = false;
    m.setColorAt(0, new THREE.Color(1, 1, 1)); root.add(m); return m;
  };
  const friends = mk(friendBaseGeo(), matV, MAXU, true), shirts = mk(friendShirtGeo(), matV, MAXU, true);
  const props = {}; for (const r of ROLE_KEYS) props[r] = mk(PROP[r](), matV, MAXU, false);
  const zombies = mk(zombieSkinGeo(), matV, MAXZ, true), zclothes = mk(zombieClothesGeo(), matV, MAXZ, true);
  const capGeo = merge([cyl(0.2, 0.2, 0.12, 0, 1.42, 0.06, '#f4f4f4', 12), box(0.42, 0.03, 0.2, 0, 1.36, 0.2, '#1a1a1a')]);
  const caps = mk(capGeo, matV, 8, false);
  // buildings
  const barGeo = merge([
    box(0.8, 0.42, 0.78, -0.85, 0.21, 0, '#c9a24a'), box(0.8, 0.42, 0.78, 0, 0.21, 0, '#b5892f'), box(0.8, 0.42, 0.78, 0.85, 0.21, 0, '#c9a24a'),
    box(0.8, 0.42, 0.78, -0.42, 0.63, 0, '#b5892f'), box(0.8, 0.42, 0.78, 0.42, 0.63, 0, '#c9a24a'),
    box(2.5, 0.05, 0.05, 0, 0.92, 0.4, '#e04030'), box(2.5, 0.05, 0.05, 0, 0.92, -0.4, '#e04030'),
  ]);
  const barr = mk(barGeo, matV, BUILDS.barricata.max + 4, true);
  const turGeo = merge([cyl(0.48, 0.55, 0.5, 0, 0.25, 0, '#6b6f78', 10), cyl(0.3, 0.3, 0.35, 0, 0.67, 0, '#d9d9d9', 10), box(0.16, 0.16, 0.9, 0, 0.75, 0.45, '#f0c048'), box(0.22, 0.22, 0.12, 0, 0.75, 0.92, '#c79a3a')]);
  const turr = mk(turGeo, matV, BUILDS.torretta.max + 4, true);
  // flat helpers
  const ringGeo = new THREE.RingGeometry(0.42, 0.55, 20).rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });
  const teamRings = mk(ringGeo, ringMat, MAXU, false); teamRings.renderOrder = 2;
  const selGeo = new THREE.RingGeometry(0.56, 0.72, 24).rotateX(-Math.PI / 2);
  const selRings = mk(selGeo, new THREE.MeshBasicMaterial({ color: 0xc8f03c, transparent: true, opacity: 0.95, depthWrite: false }), MAXU + 8, false); selRings.renderOrder = 3;
  const barGeoHp = new THREE.PlaneGeometry(1, 0.09);
  const hpBack = mk(barGeoHp, new THREE.MeshBasicMaterial({ color: 0x140a18, transparent: true, opacity: 0.75, depthWrite: false }), MAXU + MAXZ + MAXB, false); hpBack.renderOrder = 4;
  const hpFill = mk(barGeoHp, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false, depthTest: true }), MAXU + MAXZ + MAXB, false); hpFill.renderOrder = 5;
  const projGeo = merge([cyl(0.09, 0.09, 0.07, 0, 0, 0, '#f2c94c', 8)]);
  const proj = mk(projGeo, matV, MAXP, false);
  const puffGeo = new THREE.IcosahedronGeometry(0.35, 0);
  const puffs = mk(puffGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }), MAXFX, false);
  // zones: pole + flag + capture ring each; HQ banner
  const zoneObj = ZONES.map(z => {
    const g = new THREE.Group(); g.position.set(z.x, 0, z.z); root.add(g);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.2, 6), new THREE.MeshStandardMaterial({ color: 0x8a8f99, roughness: 0.5 })); pole.position.y = 2.1; g.add(pole);
    const flagMat = new THREE.MeshStandardMaterial({ color: 0xbbbbbb, roughness: 0.8, side: THREE.DoubleSide });
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.8, 4, 1), flagMat); flag.position.set(0.68, 3.75, 0); g.add(flag);
    const ringMat2 = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(z.r - 0.18, z.r, 48).rotateX(-Math.PI / 2), ringMat2); ring.position.y = 0.04; ring.renderOrder = 1; g.add(ring);
    const progMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
    const prog = new THREE.Mesh(new THREE.CircleGeometry(z.r - 0.2, 40).rotateX(-Math.PI / 2), progMat); prog.position.y = 0.03; prog.renderOrder = 1; g.add(prog);
    return { g, flag, flagMat, ring, ringMat: ringMat2, prog, progMat };
  });
  const hq = new THREE.Group(); root.add(hq);
  {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 5, 6), new THREE.MeshStandardMaterial({ color: 0x8a8f99 })); pole.position.y = 2.5; hq.add(pole);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.0), new THREE.MeshStandardMaterial({ color: 0xc8f03c, side: THREE.DoubleSide, roughness: 0.8 })); fl.position.set(0.92, 4.4, 0); hq.add(fl);
    hq.userData.flag = fl;
    const r = new THREE.Mesh(new THREE.RingGeometry(2.8, 3.0, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xc8f03c, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide })); r.position.y = 0.05; hq.add(r);
  }
  // order marker + pings
  const mark = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.55, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xc8f03c, transparent: true, opacity: 0, depthWrite: false }));
  mark.renderOrder = 6; root.add(mark);
  const pings = []; for (let i = 0; i < 4; i++) { const p = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.05, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })); p.renderOrder = 6; root.add(p); pings.push({ m: p, t: 9 }); }
  // build ghost
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0x66ff66, transparent: true, opacity: 0.45, depthWrite: false });
  const ghostBar = new THREE.Mesh(barGeo, ghostMat), ghostTur = new THREE.Mesh(turGeo, ghostMat);
  ghostBar.visible = ghostTur.visible = false; root.add(ghostBar, ghostTur);

  // ---------------------------------------------------------------- per frame
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = V(), Sc = V(1, 1, 1), E = new THREE.Euler(), C = new THREE.Color(), UP = V(0, 1, 0);
  const tint = {}; for (const r of ROLE_KEYS) tint[r] = new THREE.Color(ROLE_TINT[r]);
  const ztint = {}; for (const z of ZTYPE_KEYS) ztint[z] = new THREE.Color(ZTINT[z]);
  const team = COLORS.map(c => new THREE.Color(c));
  const camQ = new THREE.Quaternion();
  const setI = (mesh, i, x, y, z, yaw, s, sx) => { E.set(0, yaw, 0); Q.setFromEuler(E); P.set(x, y, z); Sc.set(sx || s, s, s); M.compose(P, Q, Sc); mesh.setMatrixAt(i, M); };
  const RIGHT = V(1, 0, 0);
  function hpBar(i, x, y, z, pct, col) { // billboards facing the camera; the fill empties toward the right
    P.set(x, y, z); Sc.set(1, 1, 1); M.compose(P, camQ, Sc); hpBack.setMatrixAt(i, M);
    const w = Math.max(0.02, pct / 100), off = (1 - w) / 2;
    P.set(x - RIGHT.x * off, y - RIGHT.y * off, z - RIGHT.z * off); Sc.set(w, 1, 1); M.compose(P, camQ, Sc);
    hpFill.setMatrixAt(i, M); hpFill.setColorAt(i, col);
  }
  const cGreen = new THREE.Color(0x6dff6d), cYel = new THREE.Color(0xffd23f), cRed = new THREE.Color(0xff4b3a), cZ = new THREE.Color(0xff7a59);
  const hpCol = p => p > 60 ? cGreen : p > 30 ? cYel : cRed;

  // fx pools
  const shots = []; for (let i = 0; i < MAXP; i++) shots.push({ t: 1, d: 0.3, fx: 0, fz: 0, tx: 0, tz: 0, h: 1 });
  let shotI = 0;
  const pf = []; for (let i = 0; i < MAXFX; i++) pf.push({ t: 1, d: 0.5, x: 0, z: 0, s: 1, c: new THREE.Color() });
  let pfI = 0;
  function addShot(f, to, kind) { const s = shots[shotI++ % MAXP]; s.t = 0; s.fx = f[0]; s.fz = f[1]; s.tx = to[0]; s.tz = to[1]; s.d = kind === 'multa' ? 0.45 : 0.28; s.h = kind === 'torre' ? 0.9 : kind === 'multa' ? 1.4 : 1.1; s.k = kind; }
  function addPuff(x, z, s, col) { const p = pf[pfI++ % MAXFX]; p.t = 0; p.x = x; p.z = z; p.s = s; p.d = 0.5; p.c.set(col); }
  let markT = 9;
  function order(x, z, col) { mark.position.set(x, 0.06, z); mark.material.color.set(col || 0xc8f03c); markT = 0; }
  function ping(x, z, col) { const p = pings.find(q => q.t > 1.5) || pings[0]; p.t = 0; p.m.position.set(x, 0.07, z); p.m.material.color.set(col || '#ffffff'); }
  function ghost(kind, x, z, rot, ok) {
    ghostBar.visible = kind === 'barricata'; ghostTur.visible = kind === 'torretta';
    const g = kind === 'barricata' ? ghostBar : ghostTur; if (!kind) return;
    g.position.set(x, 0.02, z); g.rotation.y = rot ? Math.PI / 2 : 0; ghostMat.color.set(ok ? 0x66ff66 : 0xff5544);
  }

  // R: render state from the client (interpolated entities); sel: Set of selected unit ids; myIdx
  function update(dt, t, camera, R, sel, selB) {
    if (!root.visible) return;
    camQ.copy(camera.quaternion); RIGHT.set(1, 0, 0).applyQuaternion(camQ);
    let hb = 0;
    // friends
    let n = 0, pn = { teppista: 0, tortellini: 0, spritz: 0, rider: 0 }, sn = 0;
    for (const e of R.units.values()) {
      if (!e.alive || n >= MAXU) continue;
      const role = ROLE_KEYS[e.r] || 'teppista', mv = e.st === 1, at = e.st === 2;
      const bob = mv ? Math.abs(Math.sin(t * 9 + e.id)) * 0.07 : 0, lunge = at ? Math.max(0, Math.sin(t * 8 + e.id)) * 0.12 : 0;
      const x = e.x + Math.sin(e.yaw) * lunge, z = e.z + Math.cos(e.yaw) * lunge;
      setI(friends, n, x, bob, z, e.yaw, 1); setI(shirts, n, x, bob, z, e.yaw, 1); shirts.setColorAt(n, tint[role]);
      const pm = props[role]; setI(pm, pn[role]++, x, bob, z, e.yaw, 1);
      setI(teamRings, n, e.x, 0.04, e.z, 0, 1); teamRings.setColorAt(n, team[e.o % 4]);
      if (sel.has(e.id)) setI(selRings, sn++, e.x, 0.05, e.z, 0, 1);
      if ((e.hp < 100 || sel.has(e.id)) && hb < MAXU + MAXZ + MAXB) hpBar(hb++, e.x, 1.75, e.z, e.hp, hpCol(e.hp));
      n++;
    }
    friends.count = n; shirts.count = n; teamRings.count = n;
    for (const r of ROLE_KEYS) props[r].count = pn[r];
    // zombies
    let zn = 0, cn = 0;
    for (const e of R.zs.values()) {
      if (!e.alive || zn >= MAXZ) continue;
      const ty = ZTYPE_KEYS[e.ty] || 'walker', T = ZTYPES[ty], s = T.scale;
      const mv = e.st === 1, sway = Math.sin(t * (ty === 'runner' ? 9 : 4) + e.id) * (mv ? 0.12 : 0.05);
      const lunge = e.st === 2 ? Math.max(0, Math.sin(t * 6 + e.id)) * 0.18 : 0;
      const x = e.x + Math.sin(e.yaw) * lunge, z = e.z + Math.cos(e.yaw) * lunge;
      E.set(0, e.yaw, sway); Q.setFromEuler(E); P.set(x, 0, z); Sc.set(s, s, s); M.compose(P, Q, Sc); zombies.setMatrixAt(zn, M); zclothes.setMatrixAt(zn, M); zclothes.setColorAt(zn, ztint[ty]);
      if (ty === 'boss' && cn < 8) { caps.setMatrixAt(cn++, M); }
      if (e.hp < 100 && hb < MAXU + MAXZ + MAXB) hpBar(hb++, e.x, 1.6 * s + 0.12, e.z, e.hp, cZ);
      zn++;
    }
    zombies.count = zn; zclothes.count = zn; caps.count = cn;
    // buildings
    let bn = 0, tn = 0;
    for (const e of R.blds.values()) {
      if (!e.alive) continue;
      if (e.k === 0) setI(barr, bn++, e.x, 0, e.z, e.rot ? Math.PI / 2 : 0, 1);
      else setI(turr, tn++, e.x, 0, e.z, e.yaw || 0, 1);
      if ((e.hp < 100 || (selB && selB === e.id)) && hb < MAXU + MAXZ + MAXB) hpBar(hb++, e.x, e.k === 0 ? 1.25 : 1.35, e.z, e.hp, hpCol(e.hp));
      if (selB && selB === e.id) setI(selRings, sn++, e.x, 0.05, e.z, 0, e.k === 0 ? 2.2 : 1.4);
    }
    barr.count = bn; turr.count = tn; selRings.count = sn;
    hpBack.count = hb; hpFill.count = hb;
    // zones
    if (R.view) {
      const zs = R.view.zones;
      for (let i = 0; i < zoneObj.length; i++) {
        const o = zoneObj[i], [own, cap] = zs[i] || [0, 0];
        const col = own === 1 ? team[0] : own === 2 ? cZ : C.set(0xbbbbbb);
        o.flagMat.color.copy(col); o.ringMat.color.copy(col); o.ringMat.opacity = 0.45 + 0.25 * Math.sin(t * 3) * (own === 0 ? 1 : 0.3);
        const k = Math.abs(cap) / 100; o.prog.scale.setScalar(Math.max(0.01, k)); o.progMat.color.copy(cap >= 0 ? team[0] : cZ); o.progMat.opacity = 0.12 + 0.22 * k;
        o.flag.rotation.y = Math.sin(t * 2 + i) * 0.25; o.flag.position.y = 0.6 + 3.15 * (0.5 + cap / 200);
      }
      const h = R.view.hq; if (h) { hq.position.set(h[0], 0, h[1]); hq.userData.flag.rotation.y = Math.sin(t * 1.7) * 0.2; }
    }
    // shots
    let pc = 0;
    for (const s of shots) {
      if (s.t >= 1) continue; s.t += dt / s.d; if (s.t >= 1) { addPuff(s.tx, s.tz, s.k === 'multa' ? 0.6 : 0.35, s.k === 'multa' ? '#ffffff' : s.k === 's' ? '#ff8a3a' : '#f2c94c'); continue; }
      const k = s.t, x = s.fx + (s.tx - s.fx) * k, z = s.fz + (s.tz - s.fz) * k, y = s.h + Math.sin(k * Math.PI) * 1.2;
      E.set(t * 14, t * 9, 0); Q.setFromEuler(E); P.set(x, y, z); Sc.set(s.k === 'multa' ? 2.2 : 1, s.k === 'multa' ? 0.2 : 1, s.k === 'multa' ? 1.6 : 1); M.compose(P, Q, Sc);
      proj.setMatrixAt(pc, M); proj.setColorAt(pc, s.k === 'multa' ? C.set(0xffffff) : s.k === 's' ? C.set(0xff8a3a) : C.set(0xffffff)); pc++;
    }
    proj.count = pc;
    let fc = 0;
    for (const p of pf) {
      if (p.t >= 1) continue; p.t += dt / p.d; if (p.t >= 1) continue;
      const s = p.s * (0.6 + p.t * 1.4); P.set(p.x, 0.4 + p.t * 0.8, p.z); Sc.set(s, s, s); Q.identity(); M.compose(P, Q, Sc);
      puffs.setMatrixAt(fc, M); puffs.setColorAt(fc, C.copy(p.c).multiplyScalar(1 - p.t * 0.6)); fc++;
    }
    puffs.count = fc;
    for (const m of [friends, shirts, zombies, zclothes, caps, barr, turr, teamRings, selRings, hpBack, hpFill, proj, puffs, ...Object.values(props)]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    // markers
    markT += dt; mark.material.opacity = Math.max(0, 0.9 - markT * 1.2); mark.scale.setScalar(1 + markT * 0.8);
    for (const p of pings) { p.t += dt; p.m.material.opacity = p.t < 1.5 ? 0.9 * (1 - p.t / 1.5) : 0; p.m.scale.setScalar(1 + p.t * 2.5); }
  }
  // restore warm-up instances after a session (count 1 parked)
  function idle() { for (const m of [friends, shirts, zombies, zclothes, caps, barr, turr, teamRings, selRings, hpBack, hpFill, proj, puffs, ...Object.values(props)]) { m.count = 1; m.setMatrixAt(0, PARK); m.instanceMatrix.needsUpdate = true; } ghost(null); }
  return { root, update, addShot, addPuff, order, ping, ghost, idle, zoneObj };
}
