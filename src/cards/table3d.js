// Tavolo da carte al Celtic (il secondo tavolino, vicino alla parete est): sedie nuove a 4 posti, carte 3D sul piano
// (presa della briscola, carte in tavola della scopa, mazzo con la briscola sotto, mazzetti delle prese, dorsi delle
// mani degli avversari), amici seduti come avversari. Tutto costruito all'avvio (preload/warm-up), niente luci nuove.
// Il giocatore siede sempre a sud; i posti degli altri ruotano in base al suo indice nella partita.
import * as THREE from 'three';
import { atlas, cellUV, BACK } from './art.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TOP = 0.768, R_SEAT = 0.74, R_STAND = 1.08, CARD_W = 0.078, CARD_H = 0.124;
// direzioni dal centro del tavolo ai posti: 0 sud (io), 1 est, 2 nord, 3 ovest
const DIRS = [V(0, 0, -1), V(1, 0, 0), V(0, 0, 1), V(-1, 0, 0)];
const yawFacing = d => Math.atan2(-d.x, -d.z); // guarda verso il centro

export function createTable3D({ scene, level }) {
  const A = (level && level.anchors) || {};
  const cel = A.celtic; // [3, 35, 0] → il secondo tavolino è a (+2.9, +1.3)
  const C = cel ? V((cel.x ?? cel[0]) + 2.9, 0, (cel.z ?? cel[1]) + 1.3) : V(5.9, 0, 36.3);
  const g = new THREE.Group(); g.name = 'cardsTable'; scene.add(g);
  const at = atlas();
  // ---- sedie (4) al posto delle 3 messe a caso dal Celtic ----
  const wood = new THREE.MeshStandardMaterial({ color: 0x2b1a10, roughness: 0.7 });
  const chairG = (() => {
    const parts = [[0.42, 0.05, 0.42, 0, 0.46, 0], [0.42, 0.5, 0.05, 0, 0.72, -0.19]];
    for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) parts.push([0.04, 0.46, 0.04, x, 0.23, z]);
    const gs = parts.map(([w, h, d, x, y, z]) => { const b = new THREE.BoxGeometry(w, h, d); b.translate(x, y, z); return b; });
    return mergeGeos(gs);
  })();
  const chairs = DIRS.map(d => { const m = new THREE.Mesh(chairG, wood); m.position.copy(C).addScaledVector(d, R_SEAT + 0.05); m.rotation.y = yawFacing(d); m.castShadow = true; m.receiveShadow = true; m.visible = false; g.add(m); return m; });
  let celticChairsHidden = false;
  function hideCelticChairs() { // i 3 posti originali del secondo tavolino (istanze 3,4,5 di 'chairs' nel Celtic)
    if (celticChairsHidden) return; const celt = scene.getObjectByName('celtic'); if (!celt) return;
    let im = null; celt.traverse(o => { if (o.isInstancedMesh && o.name === 'chairs') im = o; });
    if (!im) return;
    const m4 = new THREE.Matrix4(), p = V(), q = new THREE.Quaternion(), s = V(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, m4); m4.decompose(p, q, s); if (Math.hypot(p.x - C.x, p.z - C.z) < 1.2) im.setMatrixAt(i, zero); }
    im.instanceMatrix.needsUpdate = true; celticChairsHidden = true;
    for (const c of chairs) c.visible = true;
  }
  // ---- carte: 40 facce (una per carta) + 12 dorsi + mazzo + 4 mazzetti ----
  const faceMat = new THREE.MeshBasicMaterial({ map: at.tex, color: 0xeeeeee });
  const plane = i => { const gg = new THREE.PlaneGeometry(CARD_W, CARD_H); const { u0, u1, v0, v1 } = cellUV(i); const uv = gg.attributes.uv; uv.setXY(0, u0, v1); uv.setXY(1, u1, v1); uv.setXY(2, u0, v0); uv.setXY(3, u1, v0); gg.rotateX(-Math.PI / 2); return gg; };
  const mk = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.visible = false; m.renderOrder = 2; m.userData.tp = V(); m.userData.ty = 0; m.userData.on = false; g.add(m); return m; };
  const faces = []; for (let i = 0; i < 40; i++) faces.push(mk(plane(i), faceMat));
  const backGeo = plane(BACK), backs = []; for (let i = 0; i < 12; i++) backs.push(mk(backGeo, faceMat));
  const side = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.8 });
  const { u0, u1, v0, v1 } = cellUV(BACK);
  const topTex = at.tex.clone(); topTex.needsUpdate = true; topTex.repeat.set(u1 - u0, v1 - v0); topTex.offset.set(u0, v0);
  const topMat = new THREE.MeshBasicMaterial({ map: topTex, color: 0xeeeeee });
  const boxGeo = new THREE.BoxGeometry(CARD_W, 1, CARD_H); boxGeo.translate(0, 0.5, 0);
  const stackMats = [side, side, topMat, side, side, side];
  const deck = mk(boxGeo, stackMats), piles = [0, 1, 2, 3].map(() => mk(boxGeo, stackMats));
  for (const m of [deck, ...piles]) m.renderOrder = 1;
  for (const m of [...faces, ...backs, deck, ...piles]) { m.castShadow = false; m.receiveShadow = false; }
  g.visible = false;

  // ---- stato ----
  let me = 0, n = 2, active = false;
  const seatOf = p => { const k = (p - me + n) % n; return n === 2 ? (k ? 2 : 0) : k; };
  const tmp = V(), right = V(-1, 0, 0); // destra vista da sud = -x
  function place(m, x, z, y, yaw) { m.userData.on = true; if (!m.visible) { m.visible = true; m.position.set(x, y, z); m.rotation.y = yaw; } m.userData.tp.set(x, y, z); m.userData.ty = yaw; }
  function setView(v) {
    if (!active || !v) return;
    me = Math.max(0, v.me); n = v.n || 2;
    if (v.type !== 'briscola' && v.type !== 'scopa') { for (const m of [...faces, ...backs, deck, ...piles]) { m.userData.on = false; m.visible = false; } return; }
    for (const m of faces) m.userData.on = false; for (const m of backs) m.userData.on = false; deck.userData.on = false; for (const m of piles) m.userData.on = false;
    const y0 = TOP + 0.003;
    // mazzo e briscola (o niente nella scopa: solo il mazzo)
    if (v.deck > 0) {
      const h = Math.max(0.004, v.deck * 0.0011); place(deck, C.x + 0.32, C.z + 0.04, y0, 0.15); deck.scale.y = h;
      if (v.type === 'briscola' && v.trumpOnTable) place(faces[v.trump], C.x + 0.3, C.z + 0.04, y0 + 0.001, Math.PI / 2 + 0.15);
    }
    // carte in mano agli altri (dorsi)
    let b = 0;
    (v.players || []).forEach((p, i) => {
      if (i === me) return;
      const d = DIRS[seatOf(i)], rt = V(-d.z, 0, d.x);
      for (let k = 0; k < p.cards && b < backs.length; k++, b++) place(backs[b], C.x + d.x * 0.36 + rt.x * (k - 1) * 0.05, C.z + d.z * 0.36 + rt.z * (k - 1) * 0.05, y0 + 0.002 + k * 0.0006, yawFacing(d) + (k - 1) * 0.12);
    });
    // mazzetti delle prese
    if (v.type === 'briscola') (v.players || []).forEach((p, i) => { if (!p.pile) return; const d = DIRS[seatOf(i)], rt = V(-d.z, 0, d.x); place(piles[i], C.x + d.x * 0.3 - rt.x * 0.22, C.z + d.z * 0.3 - rt.z * 0.22, y0, yawFacing(d) + 0.4); piles[i].scale.y = Math.max(0.003, p.pile * 0.0011); });
    if (v.type === 'scopa') (v.teams || []).forEach((t, k) => { if (!t.pile) return; const pi = (v.players || []).findIndex(p => p.team === k); const d = DIRS[seatOf(pi < 0 ? k : pi)], rt = V(-d.z, 0, d.x); place(piles[k], C.x + d.x * 0.3 - rt.x * 0.22, C.z + d.z * 0.3 - rt.z * 0.22, y0, yawFacing(d) + 0.4); piles[k].scale.y = Math.max(0.003, t.pile * 0.0011); });
    // presa in corso (briscola) o tavola (scopa)
    if (v.type === 'briscola') {
      const tr = v.trick && v.trick.length ? v.trick : (v.phase === 'show' && v.last ? v.last.cards : []);
      tr.forEach((t, k) => { const d = DIRS[seatOf(t.p)]; place(faces[t.c], C.x + d.x * 0.15 + (k - 1) * 0.01, C.z + d.z * 0.15, y0 + 0.003 + k * 0.001, yawFacing(d) + (k - 1.5) * 0.08); });
    } else if (v.type === 'scopa') {
      const tb = v.table || [], cols = Math.min(5, Math.max(1, Math.ceil(tb.length / 2)));
      tb.forEach((c, k) => { const row = Math.floor(k / cols), cIdx = k % cols, rowN = Math.min(cols, tb.length - row * cols); place(faces[c], C.x - ((cIdx - (rowN - 1) / 2) * 0.088), C.z + 0.02 + (row - (tb.length > cols ? 0.5 : 0)) * 0.135, y0 + 0.002, 0); });
    }
    for (const m of [...faces, ...backs, deck, ...piles]) if (!m.userData.on) m.visible = false;
  }
  function update(dt) {
    if (!active) return;
    hideCelticChairs();
    const k = 1 - Math.exp(-dt * 9);
    for (const m of faces) if (m.visible) { m.position.lerp(m.userData.tp, k); m.rotation.y += (m.userData.ty - m.rotation.y) * k; }
    for (const m of backs) if (m.visible) { m.position.lerp(m.userData.tp, k); m.rotation.y += (m.userData.ty - m.rotation.y) * k; }
    for (const m of misc) if (m.visible) { m.position.lerp(m.userData.tp, k); m.rotation.y = m.userData.ty; }
  }
  const misc = [deck, ...piles];
  // occhi del giocatore seduto al posto sud: main.js nasconde il proprio corpo quando la camera è dentro la testa
  const camS = C.clone().addScaledVector(DIRS[0], R_SEAT - 0.08);
  const CAM = { pos: V(camS.x, 1.2, camS.z), look: V(C.x, TOP, C.z - DIRS[0].z * 0.04), fov: 58 };
  const api = {
    center: C, top: TOP,
    seatPos: s => C.clone().addScaledVector(DIRS[s], R_SEAT),
    standPos: s => C.clone().addScaledVector(DIRS[s], R_STAND),
    seatYaw: s => yawFacing(DIRS[s]),
    dir: s => DIRS[s].clone(),
    seatOf,
    enter() { active = true; g.visible = true; hideCelticChairs(); },
    exit() { active = false; g.visible = false; for (const m of [...faces, ...backs, deck, ...piles]) m.visible = false; },
    get active() { return active; },
    // in partita, durante il caricamento: tutte le carte visibili una volta, così il warm-up le prepara
    warmShow(on) { g.visible = on; for (let i = 0; i < 40; i++) { faces[i].visible = on; faces[i].position.set(C.x, TOP + 0.003, C.z); } backs[0].visible = on; deck.visible = on; deck.position.set(C.x, TOP, C.z); deck.scale.y = 0.01; },
    setView, update,
    camera() { return CAM; }, // dietro e sopra il mio posto, guarda il centro del tavolo (fisso: non va modificato)
  };
  return api;
}

function mergeGeos(list) {
  // fusione semplice (stesse attribute: position, normal, uv)
  let nv = 0, ni = 0; for (const g of list) { nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, ov * 3); nor.set(g.attributes.normal.array, ov * 3); uv.set(g.attributes.uv.array, ov * 2);
    const id = g.index.array; for (let i = 0; i < id.length; i++) idx[oi + i] = id[i] + ov;
    ov += g.attributes.position.count; oi += id.length; g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
