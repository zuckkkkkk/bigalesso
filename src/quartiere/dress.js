// quartiere/dress.js — set dressing with the Tripo models in assets/models (metres, ground y=0, centred, front +Z,
// meshopt+webp). Every model REPLACES a procedural stand-in that stays as the fallback when the file is missing.
// Houses, portico bays, shop facades (Celtic / Sushi / Millennium, door holes cut with clipping planes so the
// interiors stay walkable), trees, hedges, benches, bikes, bins, edicola, the Due Torri, a parked city bus,
// the checkpoint booth, the sushi conveyor, a living room and a kitchen for the friends, a cell in the Gulag.
import * as THREE from 'three';
import { loadManifest, loadOptional, instancedFrom, swapInstanced, swapObject, modelBox } from './models.js';
import { ST, PET, INTERIORS, MIL_DZ } from './layout.js';
import { TT } from './teletubby.js';
import { plaqueTex, signMesh } from './kit.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const PI = Math.PI;

// ctx: { SH (street hooks), streetG, root, places, areas, C (level colliders), S (state, S.W = explore world), warm, quality }
export function createDress(ctx) {
  const { SH, streetG, C, S } = ctx;
  const done = {};
  const OFF = [-999, -999];
  function setBox(c, min, max) {
    if (!c) return; c.min[0] = min[0]; c.min[1] = min[1]; c.max[0] = max[0]; c.max[1] = max[1];
    const W = S.W; const b = W && W.boxes ? W.boxes.find(x => x.id === 'lv' + C.indexOf(c)) : null; if (b) { b.min.set(min[0], 0, min[1]); b.max.set(max[0], 0, max[1]); }
  }
  const findBox = (x0, z0) => C.find(c => c.type === 'box' && Math.abs(c.min[0] - x0) < 1e-3 && Math.abs(c.min[1] - z0) < 1e-3);
  function addBox(x0, z0, x1, z1) { // new collider after createWorld: level list + explore twin
    const c = { type: 'box', min: [x0, z0], max: [x1, z1] }; C.push(c);
    const W = S.W; if (W && W.boxes) W.boxes.push({ id: 'lv' + (C.length - 1), min: V(x0, 0, z0), max: V(x1, 0, z1) }); return c;
  }
  function place(sc, parent, x, y, z, ry = 0, s = 1, o = {}) {
    const g = sc.clone(true); g.position.set(x, y, z); g.rotation.y = ry;
    if (Array.isArray(s)) g.scale.set(s[0], s[1], s[2]); else g.scale.setScalar(s);
    g.traverse(m => { if (m.isMesh) { m.castShadow = o.cast !== false; m.receiveShadow = true; } });
    parent.add(g); return g;
  }
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  function hideInstances(im, from, to) { if (!im) return; for (let i = from; i < to; i++) im.setMatrixAt(i, zero); im.instanceMatrix.needsUpdate = true; }
  // a rectangular hole through a model (world-space box x0..x1, y<y1, z0..z1): clipping planes, clipIntersection
  function cutDoor(obj, x0, x1, y1, z0, z1) {
    const R = window.__renderer; if (R) R.localClippingEnabled = true;
    const planes = [new THREE.Plane(V(1, 0, 0), -x0), new THREE.Plane(V(-1, 0, 0), x1), new THREE.Plane(V(0, -1, 0), y1), new THREE.Plane(V(0, 0, 1), -z0), new THREE.Plane(V(0, 0, -1), z1)];
    // clipIntersection keeps a fragment unless it is on the clipped side of ALL planes -> removes the box only
    // (three.js clips the NEGATIVE side: flip so the inside of the box is "negative" for every plane)
    for (const p of planes) p.negate();
    obj.traverse(m => { if (m.isMesh) { m.material = [].concat(m.material).map(mm => { const c = mm.clone(); c.clippingPlanes = planes; c.clipIntersection = true; c.side = THREE.DoubleSide; return c; }); if (m.material.length === 1) m.material = m.material[0]; } });
  }
  // hide a procedural building replaced by a house model (group + its window instances + signs)
  function hideBuilding(id) {
    const B = SH.bld && SH.bld[id]; if (!B) return; B.group.visible = false; for (const e of B.extras) e.visible = false;
    const ims = {}; streetG.traverse(o => { if (o.isInstancedMesh) ims[o.name] = o; });
    hideInstances(ims.winGlass, B.w0.glass, B.w1.glass); hideInstances(ims.winLit, B.w0.lit, B.w1.lit); hideInstances(ims.winFrame, B.w0.frame, B.w1.frame);
    hideInstances(ims.shutters, B.w0.shutter, B.w1.shutter); hideInstances(ims.shuttersClosed, B.w0.closed, B.w1.closed); hideInstances(ims.balconies, B.w0.balc, B.w1.balc);
  }

  // ===================================================================== street (called once the manifest is known)
  async function street() {
    if (done.street) return; done.street = true;
    const list = await loadManifest(); if (!list.length) return;
    const M = n => loadOptional(n).catch(() => null);
    const [ha, hb, hc, por, torri, celt, mil, sus, tp, bench, bike, bins, edic, bus] = await Promise.all(
      ['bologna_house_a', 'bologna_house_b', 'bologna_house_c', 'portico_module', 'due_torri', 'pub_celtic', 'club_millennium', 'sushi_restaurant', 'tree_plane', 'park_bench', 'bicycle_parked', 'street_bins', 'edicola', 'city_bus'].map(M));
    // ---- houses: A on the near side (old w1+w2), B on the piazzetta (old p1, facing -x), C twice (old w3, e3)
    if (ha) { const bb = modelBox(ha), s = 14 / Math.max(13.9, bb.max.x - bb.min.x); place(ha, streetG, -29, 0, 20 - bb.max.z * s, 0, s); hideBuilding('w1'); hideBuilding('w2'); }
    if (hb) { const bb = modelBox(hb); place(hb, streetG, 50 + bb.max.z, 0, 25.6, -PI / 2, 1); hideBuilding('p1'); }
    if (hc) { const bb = modelBox(hc), w = bb.max.x - bb.min.x;
      const s1 = 6 / w; place(hc, streetG, -19, 0, 20 - bb.max.z * s1, 0, s1); hideBuilding('w3');
      const s2 = 6.4 / w; place(hc, streetG, 30.75, 0, 20 - bb.max.z * s2, 0, s2); hideBuilding('e3'); }
    // ---- portico bays (instanced), scaled to each run's bay
    if (por && SH.porticoes) {
      // the model was fitted to the old 4.4 / 4.2 m porticoes: squash it vertically to the current heights
      const bb = modelBox(por), w = 5.1, OLD = { far: 4.4, w: 4.2, e: 4.2 };
      for (const p of SH.porticoes) {
        const s = p.bay / w, t = [], sy = s * (p.run === 'far' ? ST.portH : PET.portH) / (OLD[p.run] || 4.4);
        for (let i = 0; i < p.n; i++) {
          if (p.run === 'far') t.push({ x: ST.x0 + (i + 0.5) * p.bay, z: ST.colZ + bb.max.z * s, ry: PI, s, sy });
          else if (p.run === 'w') t.push({ x: PET.colW - bb.max.z * s, z: 46 + (i + 0.5) * p.bay, ry: PI / 2, s, sy });
          else t.push({ x: PET.colE + bb.max.z * s, z: PET.z0 + (i + 0.5) * p.bay, ry: -PI / 2, s, sy });
        }
        instancedFrom(por, t, streetG);
      }
      for (const a of SH.arches || []) a.visible = false;
    }
    // ---- Due Torri far away in the haze
    if (torri) { place(torri, streetG, 44, 0, 124, 0.25, 0.7, { cast: false }); if (SH.torri) SH.torri.visible = false; }
    // ---- shop facades on the ground floors (flattened to a 0.35 m skin; door holes cut so the doors stay open)
    const facade = (sc, { x, z, face, H, doorRel, door, y1 = 2.5, sign, signY, signW, signH }) => {
      const bb = modelBox(sc), mw = bb.max.x - bb.min.x, mh = bb.max.y - bb.min.y, md = bb.max.z - bb.min.z;
      const s = Math.min(1, H / mh), sz = 0.35 / md, ry = face === 's' ? PI : 0;
      // align the model's door (doorRel: 0..1 across its front, seen from the street) with our doorway centre
      const doorLocal = bb.min.x + doorRel * mw; const ox = (face === 's' ? door + doorLocal * s : door - doorLocal * s);
      const oz = face === 's' ? z + bb.min.z * sz : z - bb.min.z * sz; // back of the skin on the wall
      const g = place(sc, streetG, ox, 0, oz, ry, [s, s, sz]);
      const [d0, d1] = [door - 0.75, door + 0.75]; cutDoor(g, d0, d1, y1, z - 1.5, z + 1.5);
      if (sign) { const front = face === 's' ? z - 0.37 : z + 0.37; sign.position.set(ox, signY ?? mh * s * 0.86, front); sign.rotation.y = ry; sign.scale.set(signW / sign.geometry.parameters.width, signH / sign.geometry.parameters.height, 1); }
      return { g, s, ox };
    };
    if (celt) { const I = INTERIORS.celtic; facade(celt, { x: 3, z: ST.zFar, face: 's', H: ST.portH - 0.1, doorRel: 0.275, door: (I.door[0] + I.door[1]) / 2, sign: SH.signs && SH.signs.celtic, signW: 3.6, signH: 0.55 }); }
    if (sus) { const I = INTERIORS.sushi; facade(sus, { x: 23, z: ST.zFar, face: 's', H: ST.portH - 0.1, doorRel: 0.69, door: (I.door[0] + I.door[1]) / 2, sign: SH.signs && SH.signs.sushi, signW: 2.5, signH: 0.62 }); for (const l of SH.sushiLanterns || []) l.visible = false; }
    if (mil) { // the club facade stands in front of the black wall (its box goes into the entrance vestibule)
      const bb = modelBox(mil), md = bb.max.z - bb.min.z; const MZ = 78 + MIL_DZ, oz = MZ + (bb.max.z - Math.min(0.9, md * 0.25));
      const g = place(mil, streetG, 44, 0, oz, PI, 1); cutDoor(g, 42.6, 45.4, 3.3, MZ - 2, MZ + 5);
      for (const o of SH.milFront || []) o.visible = false;
      const back = oz - bb.min.z; // vestibule walls inside the club
      if (back > MZ + 0.3) { addBox(40, MZ + 0.3, 42.6, back); addBox(45.4, MZ + 0.3, 48, back); }
      const ms = SH.milSign; if (ms) { const s2 = ms.clone(); s2.position.set(44, (bb.max.y - bb.min.y) * 0.84, oz - bb.max.z - 0.04); /* on the model's front (its sign board is blank): seen from Via Petroni too */ s2.scale.setScalar(0.46); streetG.add(s2); }
    }
    // ---- trees, benches, bikes, bins, edicola, bus
    if (tp && SH.trees) { instancedFrom(tp, SH.trees.map(t => ({ x: t.x, z: t.z, ry: t.ry, s: 0.7 * (t.s || 1) })), streetG); for (const im of SH.treeIms) im.visible = false; }
    if (bench && SH.benchSpots) { instancedFrom(bench, SH.benchSpots.map(b => ({ x: b.x, z: b.z, ry: b.ry + PI })), streetG); for (const im of SH.benchIms) im.visible = false; }
    if (bike && SH.bikes) await swapInstanced('bicycle_parked', [SH.bikes]);
    if (bins && SH.binSets) { instancedFrom(bins, SH.binSets.map(([x0, z, ry]) => ({ x: x0 + 1.5, z: z + 0.05, ry })), streetG); if (SH.binIm) SH.binIm.visible = false;
      for (const [x0, z] of SH.binSets) setBox(findBox(x0 - 0.45, z - 0.4), [x0 + 0.6, z - 0.55], [x0 + 2.4, z + 0.6]); }
    if (edic && SH.edicola) await swapObject('edicola', SH.edicola);
    if (bus) { // parked at the stop on the far lane, engine idling
      const g = place(bus, streetG, 33, 0, 28.0, PI / 2, 1); addBox(33 - 4.1, 26.5, 33 + 4.1, 29.5);
      const stop = signMesh(plaqueTex('FERMATA', { bg: '#f2c81e', fg: '#1a1a1a', border: '#1a1a1a', w: 384, h: 192, sub: 'LINEA 13 · PETRONI', family: '"Arial Black", Impact, sans-serif' }), 0.6, 0.3, { emissive: 0.15 });
      stop.position.set(28.4, 2.3, 29.15); stop.rotation.y = PI; streetG.add(stop);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 8), new THREE.MeshStandardMaterial({ color: 0x8a8a8a, metalness: 0.7, roughness: 0.4 })); pole.position.set(28.4, 1.3, 29.2); streetG.add(pole);
      ctx.anim.push((dt, t) => { if (g.visible) g.position.y = Math.sin(t * 31) * 0.004; });
    }
    ctx.warm(streetG); S.dressed = true;
  }

  // ===================================================================== Teletubbylandia (when built)
  async function tele(hooks, group) {
    if (done.tele || !hooks) return; done.tele = true;
    const list = await loadManifest(); if (!list.length) return;
    const [chk, lin, hedge] = await Promise.all(['checkpoint', 'tree_linden', 'hedge_bush'].map(n => loadOptional(n).catch(() => null)));
    if (chk && hooks.booth) {
      const bb = modelBox(chk); place(chk, group, -41.5, 0, 33.6 + bb.min.z, PI, 1); hooks.booth.visible = false;
      const [bx, bz, bw, bd] = TT.booth; setBox(findBox(bx - bw / 2, bz - bd / 2), [-41.5 + bb.min.x, 33.6 - (bb.max.z - bb.min.z)], [-41.5 + bb.max.x, 33.6]);
      for (const [x, z, w, d] of TT.jersey) setBox(findBox(x - w / 2, z - d / 2), OFF, OFF);
    }
    if (lin && hooks.treeIms) { const n = hooks.meadowTrees; for (const im of hooks.treeIms) hideInstances(im, 0, n); instancedFrom(lin, TT.trees.map(([x, z], i) => ({ x, z, ry: i * 1.7, s: 0.85 + (i % 3) * 0.1 })), group); }
    if (hedge) { const spots = [[-77, 44.5, 0.3] /* was -56,40: now the calcetto cage (src/sport) */, [-86, 30, 1.2], [-66, 12, 2.0], [-80, 21, 0.7], [-50.5, 13.5, 1.6], [-90.5, 40, 0.2]];
      instancedFrom(hedge, spots.map(([x, z, ry]) => ({ x, z, ry })), group); for (const [x, z] of spots) addBox(x - 1.4, z - 1.4, x + 1.4, z + 1.4); }
    ctx.warm(group);
  }

  // ===================================================================== interiors (when built)
  async function interior(id, p) {
    if (done['i_' + id] || !p) return; done['i_' + id] = true;
    const list = await loadManifest(); if (!list.length) return;
    try {
      if (id === 'celtic') {
        const tap = await loadOptional('beer_tap'); if (tap) { place(tap, p.group, 3, 1.07, 42.35, PI); if (p.taps) p.taps.visible = false; if (p.tapHandles) p.tapHandles.visible = false; }
        const tp = await loadOptional('tortellini_plate'); if (tp) place(tp, p.group, 0.62, 0.765, 36.35, 0.4);
      } else if (id === 'millennium') {
        const dj = await loadOptional('dj_booth');
        if (dj) { const bb = modelBox(dj); const z = 89.2 + MIL_DZ + bb.max.z; place(dj, p.group, 44, 0, z, PI); if (p.booth) p.booth.visible = false; setBox(findBox(42.0, 89.2 + MIL_DZ), [44 + bb.min.x, 89.2 + MIL_DZ], [44 + bb.max.x, z - bb.min.z]); }
      } else if (id === 'ashish') {
        const desk = await loadOptional('gaming_desk');
        if (desk) { const bb = modelBox(desk); const a = ctx.anchors.discord; place(desk, p.group, -18.35 + bb.min.z, 0, a.z, a.yaw - PI); a.userData.furnished = 'gaming_desk'; p.desk = true; }
        const lr = await loadOptional('living_room_set');
        if (lr) { place(lr, p.group, -23.5, 0, 38.0, PI / 2); if (p.sofa) p.sofa.visible = false; setBox(findBox(-25.7, 35.2), [-25.6, 36.4], [-25.0, 39.6]); addBox(-22.4, 36.0, -21.4, 40.1); }
      } else if (id === 'seghino') {
        const ks = await loadOptional('kitchen_set');
        if (ks) { place(ks, p.group, -15.1, 0, 10.6, PI / 2); if (p.kitchen) p.kitchen.visible = false; setBox(findBox(-15.7, 8.6), [-15.7, 9.1], [-14.5, 12.1]); setBox(findBox(-15.7, 17.8), OFF, OFF); }
        const tp = await loadOptional('tortellini_plate'); if (tp) place(tp, p.group, -15.0, ks ? 0.92 : 0.94, 10.6, PI / 2);
      } else if (id === 'sushi') {
        const sc = await loadOptional('sushi_conveyor');
        if (sc) { const bb = modelBox(sc); const a = ctx.anchors.sushi_conveyor; const z = a.z + 0.15 + bb.max.z; const cg = place(sc, p.group, a.x, 0, z, PI); cg.name = 'sushi_conveyor'; p.conveyor = cg;
          if (p.kaiten) p.kaiten.visible = false; p.conveyorModel = true;
          setBox(findBox(20.2, 37.6), [a.x + bb.min.x, a.z + 0.45], [a.x + bb.max.x, z - bb.min.z]); setBox(findBox(20.2, 38.4), OFF, OFF); setBox(findBox(25.0, 38.4), OFF, OFF); }
      }
    } catch (e) { console.warn('quartiere dress ' + id, e); }
    ctx.warm(p.group);
  }

  // ===================================================================== the Gulag (gulag.js root, attached once it exists)
  async function gulag() {
    if (done.gulag) return; const G = window.__app && window.__app.gulag; if (!G || !G.root) return; done.gulag = true;
    const list = await loadManifest(); if (!list.length) return;
    const cell = await loadOptional('prison_cell_set'); if (!cell) return;
    const s = 0.88; place(cell, G.root, 30 + (modelBox(cell).max.z) * s, 0, 9.0, PI / 2, s); // against the west wall, open side facing the room
    addBox(30, 7.58, 32.85, 7.78); addBox(30, 10.22, 32.85, 10.42);
    ctx.warm(G.root);
  }
  return { street, tele, interior, gulag, setBox, addBox };
}
