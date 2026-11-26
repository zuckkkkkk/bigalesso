// rp/house.js — furniture for the player's house (Giardino, Salotto, Sala giochi): buy in the phone (Casa), place on a
// 0.5 m grid in front of you (E posa · R ruota · X annulla), walk up to a piece to move it (E) or sell it (R, 60% back).
// Templates are built at startup from the Tripo props (quartiere/models.js loadOptional) or procedural fallbacks, and a
// hidden "showroom" with one copy each is in the scene, so the loading warm-up uploads/compiles them; placed pieces are
// clones (shared geometry + materials). Colliders: circles appended to world.extraCircles every frame (no new arrays).
import * as THREE from 'three';
import { FURNI, furni, HOUSE_ZONES } from './data.js';
import { loadHouse, saveHouse } from './state.js';
import { buildFallbackFurni, buildPlaceRing } from './gear.js';
import { loadOptional } from '../quartiere/models.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const PI = Math.PI, FAR = V(1e5, 0, 1e5);
const snap = v => Math.round(v * 2) / 2;

export function createHouse(X) {
  const { scene, man } = X;
  const root = new THREE.Group(); root.name = 'rp_house'; scene.add(root);
  const show = new THREE.Group(); show.name = 'rp_showroom'; show.visible = false; scene.add(show); // warm-up only
  const ring = buildPlaceRing(); scene.add(ring);
  const tpl = {}; // id -> Object3D template
  let list = loadHouse(); // [{k, x, z, r}]
  const objs = []; // placed: { rec, obj, circle }
  let P = null; // placing { k, obj, r, ok, from: rec|null, paid }
  let W = null, H = null;
  const circles = [];

  async function preload() {
    await Promise.all(FURNI.map(async f => {
      let o = null;
      if (f.model) try { const sc = await loadOptional(f.model); if (sc) { o = sc.clone(true); o.position.set(0, 0, 0); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1); } } catch (e) { }
      if (!o) o = buildFallbackFurni(f.fb);
      o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      tpl[f.id] = o;
      const c = o.clone(true); show.add(c);
    }));
    rebuild();
  }

  const zoneOk = (x, z) => { const zn = X.level && X.level.zoneAt ? X.level.zoneAt(x, z) : null; return HOUSE_ZONES.includes(zn); };
  function clearAt(x, z, r, skip) {
    if (!zoneOk(x, z)) return false;
    if (X.level && X.level.isWalkable && !X.level.isWalkable(x, z, Math.min(0.35, r * 0.5))) return false;
    for (const o of objs) { if (o === skip) continue; const f = furni(o.rec.k); if (Math.hypot(o.rec.x - x, o.rec.z - z) < (f ? f.r : 0.5) + r - 0.15) return false; }
    const p = man.root.position; if (Math.hypot(p.x - x, p.z - z) < r * 0.6 + 0.3 && !P) return false;
    return true;
  }
  function spawnObj(rec) {
    const t = tpl[rec.k]; if (!t) return null;
    const obj = t.clone(true); obj.position.set(rec.x, 0, rec.z); obj.rotation.y = (rec.r | 0) * PI / 2; root.add(obj);
    const f = furni(rec.k); const circle = { id: 'rpf' + objs.length, c: obj.position, r: f ? f.r : 0.5, rp: true };
    const o = { rec, obj, circle }; objs.push(o); return o;
  }
  function rebuild() {
    for (const o of objs) root.remove(o.obj); objs.length = 0;
    list = list.filter(r => furni(r.k));
    for (const r of list) spawnObj(r);
    syncCircles();
  }
  function syncCircles() { circles.length = 0; for (const o of objs) circles.push(o.circle); }
  const persist = () => { saveHouse(list); if (list.length >= 5) X.unlock('rp_house'); };

  // ---------------- buying / placing
  function buy(k) {
    const f = furni(k); if (!f) return false;
    if (P) { X.toast('Stai già sistemando un mobile: posalo (E) o annulla (X)', 'warn'); return false; }
    if (!zoneOk(man.root.position.x, man.root.position.z)) { X.toast('Vai a casa (giardino, salotto o sala giochi) per sistemare i mobili', 'warn'); return false; }
    if (!X.spend(f.price)) { X.toast(`Non hai ${f.price}€ per ${f.name}`, 'warn'); return false; }
    startPlacing(k, null, f.price);
    X.toast(`${f.icon} ${f.name}: E posa · R ruota · X annulla (rimborso)`, 'gold'); X.sfx('coin');
    return true;
  }
  function startPlacing(k, from, paid = 0) {
    const t = tpl[k]; if (!t) return;
    const obj = from ? from.obj : t.clone(true);
    if (!from) root.add(obj);
    P = { k, obj, r: from ? from.rec.r | 0 : 0, ok: false, from, paid };
    if (from) { const i = objs.indexOf(from); if (i >= 0) objs.splice(i, 1); syncCircles(); }
  }
  function place() {
    if (!P) return;
    if (!P.ok) { X.toast('Qui non ci sta: spazio libero in casa o in giardino', 'warn'); X.sfx('buzz'); return; }
    const f = furni(P.k), x = P.obj.position.x, z = P.obj.position.z;
    let rec = P.from ? P.from.rec : null;
    if (rec) { rec.x = x; rec.z = z; rec.r = P.r; const o = { rec, obj: P.obj, circle: P.from.circle }; objs.push(o); }
    else { rec = { k: P.k, x, z, r: P.r }; list.push(rec); const o = { rec, obj: P.obj, circle: { id: 'rpf' + objs.length, c: P.obj.position, r: f.r, rp: true } }; objs.push(o); }
    P = null; ring.visible = false; syncCircles(); persist(); X.sfx('click');
  }
  function cancel() {
    if (!P) return;
    if (P.from) { P.obj.position.set(P.from.rec.x, 0, P.from.rec.z); P.obj.rotation.y = P.from.rec.r * PI / 2; objs.push(P.from); syncCircles(); }
    else { root.remove(P.obj); if (P.paid) { X.money(P.paid); X.toast('Annullato: soldi restituiti'); } }
    P = null; ring.visible = false;
  }
  function sell(o) {
    const f = furni(o.rec.k); const back = Math.round((f ? f.price : 0) * 0.6);
    root.remove(o.obj); objs.splice(objs.indexOf(o), 1); list.splice(list.indexOf(o.rec), 1); syncCircles(); persist();
    if (back) X.money(back); X.toast(`${f ? f.icon + ' ' + f.name : 'Mobile'} venduto · +${back}€`, 'gold'); X.sfx('coin');
  }
  const nearest = () => { const p = man.root.position; let best = null, bd = 1.7; for (const o of objs) { const d = Math.hypot(o.rec.x - p.x, o.rec.z - p.z); if (d < bd) { bd = d; best = o; } } return best; };

  // ---------------- per frame
  function update(dt, I) {
    if (W && circles.length) { const ec = W.extraCircles || (W.extraCircles = []); if (ec.indexOf(circles[0]) < 0) for (const c of circles) ec.push(c); }
    if (!P) return;
    if (!W || !/^(explore|goto)$/.test(W.mode)) { return; }
    const p = man.root.position, f = furni(P.k), d = 1.2 + f.r;
    const x = snap(p.x + Math.sin(W.yaw) * d), z = snap(p.z + Math.cos(W.yaw) * d);
    P.obj.position.set(x, 0, z); P.obj.rotation.y = P.r * PI / 2;
    P.ok = clearAt(x, z, f.r, P.from);
    ring.visible = true; ring.position.set(x, 0, z); ring.scale.setScalar(f.r + 0.1); ring.material.color.set(P.ok ? 0x40e070 : 0xe04050);
    if (I && I.pressed('KeyX')) cancel();
  }

  const items = [
    { id: 'rp_place', range: 99,
      label: () => P ? `Posa: ${(furni(P.k) || {}).name || ''}${P.ok ? '' : ' (qui non ci sta)'}` : '', alt: () => P ? 'Ruota' : null,
      extra: () => P ? [{ key: 'X', label: P.from ? 'Rimetti dov\'era' : 'Annulla' }] : [],
      anchor: () => P ? man.root.position : FAR, top: () => P ? P.obj.position.clone().add(V(0, 1.2, 0)) : FAR,
      act: () => place(), altAct: () => { if (P) { P.r = (P.r + 1) % 4; X.sfx('click'); } } },
    { id: 'rp_furni', range: 1.7,
      label: () => { const o = nearest(); const f = o && furni(o.rec.k); return f ? `Sposta: ${f.name}` : ''; },
      alt: () => { const o = nearest(); const f = o && furni(o.rec.k); return f ? `Vendi (+${Math.round(f.price * 0.6)}€)` : null; },
      anchor: () => { if (P) return FAR; const o = nearest(); return o ? o.obj.position : FAR; },
      top: () => { const o = nearest(); return o ? o.obj.position.clone().add(V(0, 1.1, 0)) : FAR; },
      act: () => { const o = nearest(); if (o) { startPlacing(o.rec.k, o); X.toast('E posa · R ruota · X rimetti dov\'era'); } },
      altAct: () => { const o = nearest(); if (o) sell(o); } },
  ];

  return {
    preload, update, items, buy, cancel, attach(w, h) { W = w; H = h; },
    get placing() { return !!P; }, get list() { return list; }, root, show,
  };
}
