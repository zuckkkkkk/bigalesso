// rts/index.js — "Assedio al quartiere": the RTS mode in the open world.
// Enter from the command table in the garden (near the gate) or from the phone (Giochi → Assedio): lobby → solo or
// online (rules in shared/siege.mjs, run locally or refereed by the server through window.__match).
// In the mode: high angled camera over the real quartiere, the friends as instanced figures, zombies, flags, HUD.
//
// main.js wiring:
//   const rts = installRTS({...}); plugins.push(rts.plugin);           // table collider before createWorld
//   camera:  const c = rts.camera(<previous camera pick>, dt) || playCamera(t);
//   focus:   level.update / quartiere.update get rts.focus() || man.root.position (areas around the RTS view)
//   frame:   rts.update(dt, t) after sport.update
// API: window.__rts = { open(), start({online, opts, matchId}), exit(), get active(), state }
//
// Controls: drag = select · right click = move (on a zombie: attack) · double click = all of that kind
//   WASD/arrows/screen edge/middle drag = pan · wheel = zoom · Q/E = rotate · Space = house
//   Z X C V recruit · B barricade · N turret (R rotates, right click cancels) · T attack-move · H hold · Y stop
//   F all my friends · Ctrl+1..9 group · 1..9 select group (twice: go there) · G call the wave · P ping · Canc demolish
import * as THREE from 'three';
import { ROLES, ROLE_KEYS, BUILDS, BUILD_KEYS, ZONES, HQ, COLORS, ZTYPE_KEYS, gridInfo, unitName } from '../../shared/siege.mjs';
import { createRTSRender } from './render.js';
import { createHUD } from './hud.js';

const TABLE = { x: 9.6, z: 18.2 }; // garden, near the gate (nudged to free ground at start-up)

export function installRTS({ scene, camera, renderer, level, ui, input, audio, low }) {
  const R3 = createRTSRender(scene, { low });
  const el = renderer.domElement;
  const W = () => window.__app && window.__app.world;
  const sfx = (n, v) => { try { audio && audio.sfx && audio.sfx(n, v); } catch (e) { } };
  const ST = {
    active: false, sess: null, view: null, vT: 0, me: -1, stamp: 0,
    cam: { x: HQ.rally[0], z: HQ.rally[1] + 6, yaw: 0, dist: 44, tx: HQ.rally[0], tz: HQ.rally[1] + 6, tyaw: 0, tdist: 44 },
    sel: new Set(), selB: 0, groups: {}, lastGroup: { n: 0, t: 0 }, placing: null, rot: 0, amove: false,
    keys: new Set(), mouse: { x: 0, y: 0, in: false }, down: null, pan: null, pinch: null,
    fog: null, prevCapture: null, lastOpts: null, rewarded: false, npcHidden: false, hudT: 0, mmT: 0,
  };
  const ent = { units: new Map(), zs: new Map(), blds: new Map(), view: null };
  const events = [];

  // ---------------- command table in the garden (collider + prop) ----------------
  const table = new THREE.Group(); table.name = 'rts-table'; scene.add(table);
  {
    const wood = new THREE.MeshStandardMaterial({ color: 0x7a5232, roughness: 0.8 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 1.0), wood); top.position.y = 0.86; table.add(top);
    for (const [x, z] of [[-0.7, -0.42], [0.7, -0.42], [-0.7, 0.42], [0.7, 0.42]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.84, 0.07), wood); l.position.set(x, 0.42, z); table.add(l); }
    // the map on top: the walk grid painted on a canvas
    const G = gridInfo(), cv = document.createElement('canvas'); cv.width = 256; cv.height = 175; const c = cv.getContext('2d'), im = c.createImageData(256, 175);
    for (let y = 0; y < 175; y++) for (let x = 0; x < 256; x++) { const i = Math.floor(x / 256 * G.w), j = Math.min(G.h - 1, Math.floor((1 - y / 175) * G.h)); const w = G.walk[j * G.w + i]; const o = (y * 256 + x) * 4; im.data[o] = w ? 226 : 150; im.data[o + 1] = w ? 214 : 120; im.data[o + 2] = w ? 182 : 80; im.data[o + 3] = 255; }
    c.putImageData(im, 0, 0); c.fillStyle = '#c0392b'; for (const z of ZONES) { const x = (z.x - G.x0) / (G.w * G.cell) * 256, y = (1 - (z.z - G.z0) / (G.h * G.cell)) * 175; c.beginPath(); c.arc(x, y, 3.5, 0, 6.3); c.fill(); }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const map = new THREE.Mesh(new THREE.PlaneGeometry(1.42, 0.84).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })); map.position.y = 0.905; table.add(map);
    for (let i = 0; i < 6; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 5), new THREE.MeshStandardMaterial({ color: i < 3 ? 0xc8f03c : 0xff5a45 })); f.position.set(-0.5 + i * 0.2, 0.97, (i % 2 ? 0.15 : -0.2)); table.add(f); }
    // nudge onto free ground (garden furniture/trees)
    let px = TABLE.x, pz = TABLE.z;
    if (level && level.isWalkable) { outer: for (let r = 0; r <= 3; r += 0.4) for (let k = 0; k < 12; k++) { const x = TABLE.x + Math.cos(k * 0.52) * r, z = TABLE.z + Math.sin(k * 0.52) * r; if (level.isWalkable(x, z, 1.05)) { px = x; pz = z; break outer; } } }
    table.position.set(px, 0, pz); TABLE.x = px; TABLE.z = pz;
    table.traverse(o => { if (o.isMesh) { o.castShadow = !low; o.receiveShadow = true; } });
    if (level && level.colliders) level.colliders.push({ type: 'box', min: [px - 0.85, pz - 0.55], max: [px + 0.85, pz + 0.55] });
  }

  // ---------------- HUD ----------------
  const hud = createHUD({
    recruit: r => act({ k: 'recruit', role: r }, true),
    build: k => startPlacing(k),
    cmd: c => command(c),
    start: o => start(o),
    closeLobby: () => { hud.closeLobby(); if (!ST.active) restoreLobbyInput(); },
    menu: m => menuAction(m),
    mmLook: (x, z) => { ST.cam.tx = x; ST.cam.tz = z; },
    mmOrder: (x, z) => orderMove(x, z),
    click: () => sfx('click', 0.5),
  });

  // ---------------- session ----------------
  let lobbyCapture = null;
  function restoreLobbyInput() { if (lobbyCapture !== null) { input.capture = lobbyCapture.prev; lobbyCapture = null; if (document.body.dataset.overlay === 'rts-lobby') delete document.body.dataset.overlay; } }
  function open() {
    if (ST.active) return;
    const w = W(); if (w && w.mode && !['explore', 'goto', 'npcTalk'].includes(w.mode)) { toast('Prima torna a piedi, poi apri l\'assedio'); return; }
    const online = !!(window.__net && window.__net.online) || !!(window.__match && window.__match.transport);
    hud.openLobby(window.__match ? window.__match.lobby('siege') : Promise.resolve([]), online);
    if (lobbyCapture === null) { lobbyCapture = { prev: input.capture }; input.capture = e => { if (e.code === 'Escape') { hud.closeLobby(); restoreLobbyInput(); } return true; }; document.body.dataset.overlay = 'rts-lobby'; }
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { }
  }
  async function start(o) {
    hud.closeLobby(); restoreLobbyInput(); hud.closeResults();
    if (ST.sess) leaveSession();
    ST.lastOpts = o;
    let s = null;
    try {
      if (!window.__match) throw new Error('match non disponibile');
      s = o.matchId && window.__match.join ? await window.__match.join(o.matchId)
        : await window.__match.start('siege', { online: o.online ? true : false, opts: o.opts || {}, players: [], public: !!o.online }); // drop-in: friends join from the lobby list
    } catch (e) {
      if (o.online) { try { s = await window.__match.start('siege', { online: false, opts: o.opts || {} }); toast('Online non disponibile adesso: partita da solo'); } catch (e2) { } }
      if (!s) { toast('Non riesco ad aprire l\'assedio'); console.warn('rts start', e); return; }
    }
    ST.sess = s; ST.rewarded = false; ST.view = null; ST.me = -1; ST.sel.clear(); ST.selB = 0; ST.groups = {}; ST.placing = null; ST.amove = false;
    ent.units.clear(); ent.zs.clear(); ent.blds.clear(); ent.view = null; events.length = 0;
    s.on('view', v => onView(v));
    s.on('event', e => { if (events.length < 400) events.push(e); });
    s.on('over', o2 => onOver(o2));
    s.on('error', e => { if (e && e.error) hud.tip(e.error); });
    s.on('players', () => { });
    enter();
  }
  function leaveSession() { const s = ST.sess; ST.sess = null; if (s) try { s.leave(); } catch (e) { } }
  function enter() {
    if (ST.active) return;
    ST.active = true;
    const w = W(); if (w && w.setMode) { ST.prevMode = w.mode; w.setMode('rts'); }
    try { window.__combat && window.__combat.setEnabled && window.__combat.setEnabled(false); } catch (e) { }
    ST.prevCapture = input.capture; input.capture = onKey;
    input.keys.clear(); input.edges.clear();
    document.body.dataset.overlay = 'rts';
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { }
    R3.root.visible = true; table.visible = true;
    hud.show(true); hud.selection([], null);
    if (scene.fog && !ST.fog) { ST.fog = [scene.fog.near, scene.fog.far]; scene.fog.near = 90; scene.fog.far = 260; }
    Object.assign(ST.cam, { tx: HQ.rally[0], tz: HQ.rally[1] - 1, tyaw: 0, tdist: 36 }); ST.cam.x = ST.cam.tx; ST.cam.z = ST.cam.tz - 10; ST.cam.dist = 70; ST.cam.yaw = 0;
    sfx('whoosh');
    hud.tip('Trascina per selezionare · clic destro per muovere · Z X C V per reclutare', 4500);
  }
  function exit() {
    leaveSession();
    if (!ST.active) return;
    ST.active = false;
    input.capture = ST.prevCapture || null; ST.prevCapture = null; input.keys.clear(); input.edges.clear(); ST.keys.clear();
    if (document.body.dataset.overlay === 'rts') delete document.body.dataset.overlay;
    const w = W(); if (w && w.setMode) w.setMode('explore');
    try { window.__combat && window.__combat.setEnabled && window.__combat.setEnabled(true); } catch (e) { }
    R3.idle(); R3.root.visible = false; hud.show(false); hud.menu(false); hud.closeResults(); hud.box(null);
    if (scene.fog && ST.fog) { scene.fog.near = ST.fog[0]; scene.fog.far = ST.fog[1]; ST.fog = null; }
    showNPCs(true);
    ent.units.clear(); ent.zs.clear(); ent.blds.clear(); ent.view = null; ST.view = null;
  }
  const toast = (t) => { try { const w = W(); w && w.toast ? w.toast(t) : ui && ui.toast && ui.toast(t); } catch (e) { } };

  // ---------------- view → interpolated entities ----------------
  function onView(v) {
    const now = performance.now(), stamp = ++ST.stamp;
    ST.view = v; ent.view = v; ST.me = v.me;
    const up = (map, id, x, z, yaw) => {
      let e = map.get(id);
      if (!e) { e = { id, x, z, px: x, pz: z, tx: x, tz: z, yaw: yaw || 0, pyaw: yaw || 0, tyaw: yaw || 0, t0: now, alive: true }; map.set(id, e); }
      else { e.px = e.x; e.pz = e.z; e.tx = x; e.tz = z; e.pyaw = e.yaw; if (yaw !== null) e.tyaw = yaw; e.t0 = now; }
      e.alive = true; e.stamp = stamp; return e;
    };
    const u = v.u; for (let i = 0; i < u.length; i += 8) { const e = up(ent.units, u[i], u[i + 3] / 10, u[i + 4] / 10, null); e.r = u[i + 1]; e.o = u[i + 2]; e.hp = u[i + 5]; e.st = u[i + 6]; if (e.nn !== u[i + 7]) { e.nn = u[i + 7]; e.name = unitName(ROLE_KEYS[e.r], e.nn); } }
    const z = v.z; for (let i = 0; i < z.length; i += 6) { const e = up(ent.zs, z[i], z[i + 2] / 10, z[i + 3] / 10, null); e.ty = z[i + 1]; e.hp = z[i + 4]; e.st = z[i + 5]; }
    // facing (not sent): along the step when walking, toward the nearest enemy when fighting
    const face = (e, others) => {
      const dx = e.tx - e.px, dz = e.tz - e.pz;
      if (e.st === 2 || e.st === 3) { let b = null, bd = 144; for (const o of others.values()) { const d = (o.tx - e.tx) ** 2 + (o.tz - e.tz) ** 2; if (d < bd) { bd = d; b = o; } } if (b) e.tyaw = Math.atan2(b.tx - e.tx, b.tz - e.tz); }
      else if (dx * dx + dz * dz > 1e-4) e.tyaw = Math.atan2(dx, dz);
    };
    for (const e of ent.units.values()) if (e.stamp === stamp) face(e, e.st === 3 ? ent.units : ent.zs);
    for (const e of ent.zs.values()) if (e.stamp === stamp) face(e, ent.units);
    const b = v.b; for (let i = 0; i < b.length; i += 8) { const e = up(ent.blds, b[i], b[i + 3] / 10, b[i + 4] / 10, b[i + 7] / 100); e.k = b[i + 1]; e.o = b[i + 2]; e.rot = b[i + 5]; e.hp = b[i + 6]; e.x = e.tx; e.z = e.tz; }
    for (const m of [ent.units, ent.zs, ent.blds]) for (const [id, e] of m) if (e.stamp !== stamp) m.delete(id);
    for (const id of ST.sel) if (!ent.units.has(id)) ST.sel.delete(id);
    if (ST.selB && !ent.blds.has(ST.selB)) ST.selB = 0;
    ST.vT = now;
  }
  const lerpA = (a, b, k) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * k; };
  function interpolate() {
    const now = performance.now();
    for (const m of [ent.units, ent.zs]) for (const e of m.values()) {
      const k = Math.min(1, (now - e.t0) / 110);
      e.x = e.px + (e.tx - e.px) * k; e.z = e.pz + (e.tz - e.pz) * k; e.yaw = lerpA(e.pyaw, e.tyaw, Math.min(1, k * 1.5));
    }
  }

  // ---------------- actions ----------------
  function act(a, loud) {
    const s = ST.sess; if (!s) return;
    let r; try { r = s.act(a); } catch (e) { r = { ok: false, error: e.message }; }
    const done = res => { if (res && res.ok === false && res.error) { hud.tip(res.error); if (loud) sfx('buzz', 0.4); } else if (loud) sfx(a.k === 'recruit' ? 'pickup' : 'button', 0.6); };
    if (r && typeof r.then === 'function') r.then(done, () => { }); else done(r);
    return r;
  }
  const mySel = () => [...ST.sel].filter(id => { const e = ent.units.get(id); return e && e.o === ST.me; });
  function orderMove(x, z) {
    const ids = mySel(); if (!ids.length) { act({ k: 'ping', x, z }); return; }
    act({ k: 'move', ids, x, z, amove: ST.amove });
    R3.order(x, z, ST.amove ? 0xff7a59 : 0xc8f03c); sfx('click', 0.5);
    ST.amove = false; hud.markButtons(ST.placing, false);
  }
  function command(c) {
    const ids = mySel();
    if (c === 'hold' || c === 'stop') { if (ids.length) act({ k: c, ids }, true); }
    else if (c === 'amove') { ST.amove = !ST.amove; hud.markButtons(ST.placing, ST.amove); if (ST.amove) hud.tip('Clic destro dove andare: attaccano tutto quello che incontrano'); }
    else if (c === 'all') { ST.sel.clear(); for (const e of ent.units.values()) if (e.o === ST.me) ST.sel.add(e.id); ST.selB = 0; refreshSel(); }
    else if (c === 'next') act({ k: 'next' }, true);
    else if (c === 'demolish') { if (ST.selB) { act({ k: 'demolish', id: ST.selB }, true); ST.selB = 0; refreshSel(); } }
    else if (c === 'menu') { hud.menu(true, menuInfo()); }
  }
  function menuInfo() { const v = ST.view; return v ? `Ondata ${v.wave}/${v.waves} · ${v.stats.kills} zombie abbattuti · ${ST.sess && ST.sess.online ? 'online' : 'partita da solo'}` : ''; }
  function menuAction(m) {
    if (m === 'resume') hud.menu(false);
    else if (m === 'surrender') { act({ k: 'surrender' }); hud.menu(false); }
    else if (m === 'exit') exit();
    else if (m === 'again') { const o = ST.lastOpts || { online: false, opts: hud.opts }; exit(); start({ ...o, matchId: undefined }); }
  }
  function startPlacing(k) {
    if (!BUILDS[k]) return;
    ST.placing = ST.placing === k ? null : k; hud.markButtons(ST.placing, ST.amove);
    if (ST.placing) hud.tip(`${BUILDS[k].name}: clic sinistro per piazzare · R ruota · clic destro annulla`, 3000); else R3.ghost(null);
  }
  function refreshSel() {
    if (ST.selB) { const b = ent.blds.get(ST.selB); hud.selection([], b ? { k: b.k, hp: b.hp } : null); return; }
    const list = []; for (const id of ST.sel) { const e = ent.units.get(id); if (e) list.push({ r: e.r, name: e.name }); }
    hud.selection(list, null);
  }

  // ---------------- picking ----------------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3(), tv = new THREE.Vector3();
  function ground(px, py) {
    const r = el.getBoundingClientRect(); ndc.set((px - r.left) / r.width * 2 - 1, -((py - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera); return ray.ray.intersectPlane(plane, hit) ? [hit.x, hit.z] : null;
  }
  function screen(x, y, z) { const r = el.getBoundingClientRect(); tv.set(x, y, z).project(camera); return tv.z > 1 ? null : [r.left + (tv.x + 1) / 2 * r.width, r.top + (1 - tv.y) / 2 * r.height]; }
  function pickUnit(px, py, mineOnly, maxD = 24) {
    let best = null, bd = maxD * maxD;
    for (const e of ent.units.values()) { if (mineOnly && e.o !== ST.me) continue; const s = screen(e.x, 0.8, e.z); if (!s) continue; const d = (s[0] - px) ** 2 + (s[1] - py) ** 2; if (d < bd) { bd = d; best = e; } }
    return best;
  }
  function pickZombie(px, py) {
    let best = null, bd = 26 * 26;
    for (const e of ent.zs.values()) { const s = screen(e.x, 0.8, e.z); if (!s) continue; const d = (s[0] - px) ** 2 + (s[1] - py) ** 2; if (d < bd) { bd = d; best = e; } }
    return best;
  }
  function pickBuilding(px, py) {
    let best = null, bd = 34 * 34;
    for (const e of ent.blds.values()) { const s = screen(e.x, 0.4, e.z); if (!s) continue; const d = (s[0] - px) ** 2 + (s[1] - py) ** 2; if (d < bd) { bd = d; best = e; } }
    return best;
  }
  function selectBox(x0, y0, x1, y1, add) {
    if (!add) ST.sel.clear(); ST.selB = 0;
    const a = Math.min(x0, x1), b = Math.max(x0, x1), c = Math.min(y0, y1), d = Math.max(y0, y1);
    for (const e of ent.units.values()) { if (e.o !== ST.me) continue; const s = screen(e.x, 0.8, e.z); if (s && s[0] >= a && s[0] <= b && s[1] >= c && s[1] <= d) ST.sel.add(e.id); }
    refreshSel(); if (ST.sel.size) sfx('click', 0.4);
  }
  function clickSelect(px, py, add, dbl) {
    const u = pickUnit(px, py, true);
    if (u) {
      if (!add) ST.sel.clear(); ST.selB = 0;
      if (dbl) { for (const e of ent.units.values()) if (e.o === ST.me && e.r === u.r && screen(e.x, 0.8, e.z)) ST.sel.add(e.id); }
      else if (add && ST.sel.has(u.id)) ST.sel.delete(u.id); else ST.sel.add(u.id);
      refreshSel(); sfx('click', 0.4); return;
    }
    const b = pickBuilding(px, py);
    if (b) { ST.sel.clear(); ST.selB = b.id; refreshSel(); return; }
    if (!add) { ST.sel.clear(); ST.selB = 0; refreshSel(); }
  }
  function placeAt(px, py) {
    const g = ground(px, py); if (!g) return;
    const k = ST.placing, x = Math.round(g[0] * 2) / 2, z = Math.round(g[1] * 2) / 2;
    act({ k: 'build', kind: k, x, z, rot: ST.rot }, true);
    if (!ST.keys.has('ShiftLeft') && !ST.keys.has('ShiftRight')) { ST.placing = null; R3.ghost(null); hud.markButtons(null, ST.amove); }
  }
  function rightClick(px, py) {
    if (ST.placing) { ST.placing = null; R3.ghost(null); hud.markButtons(null, ST.amove); return; }
    const ids = mySel();
    const z = pickZombie(px, py);
    if (z && ids.length) { act({ k: 'attack', ids, tid: z.id }); R3.order(z.x, z.z, 0xff4b3a); sfx('click', 0.5); return; }
    const g = ground(px, py); if (g) orderMove(g[0], g[1]);
  }

  // ---------------- mouse / touch ----------------
  const busy = () => !ST.active || hud.menuOpen() || hud.lobbyOpen();
  el.addEventListener('contextmenu', e => { if (ST.active) e.preventDefault(); });
  el.addEventListener('pointerdown', e => {
    if (busy()) return;
    e.preventDefault();
    if (e.pointerType === 'touch') {
      if (ST.down && ST.down.touch && ST.down.id !== e.pointerId) { // second finger: pinch zoom
        ST.pinch = { a: ST.down, b: { id: e.pointerId, x: e.clientX, y: e.clientY }, d: Math.hypot(e.clientX - ST.down.x, e.clientY - ST.down.y), dist: ST.cam.tdist }; ST.down.cancel = true; return;
      }
      ST.down = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, touch: true, t: performance.now(), moved: 0 }; return;
    }
    if (e.button === 1) { ST.pan = { x: e.clientX, y: e.clientY }; return; }
    if (e.button === 2) { ST.down = { btn: 2, sx: e.clientX, sy: e.clientY, moved: 0 }; return; }
    if (e.button === 0) {
      if (ST.placing) { placeAt(e.clientX, e.clientY); return; }
      ST.down = { btn: 0, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, moved: 0, t: performance.now() };
    }
  });
  addEventListener('pointermove', e => {
    ST.mouse.x = e.clientX; ST.mouse.y = e.clientY; ST.mouse.in = true;
    if (!ST.active) return;
    if (ST.pinch) {
      const P = ST.pinch; if (e.pointerId === P.a.id) { P.a.x = e.clientX; P.a.y = e.clientY; } else if (e.pointerId === P.b.id) { P.b.x = e.clientX; P.b.y = e.clientY; }
      const d = Math.hypot(P.a.x - P.b.x, P.a.y - P.b.y); ST.cam.tdist = clamp(P.dist * P.d / Math.max(20, d), 16, 95); return;
    }
    if (ST.pan) { panScreen(e.clientX - ST.pan.x, e.clientY - ST.pan.y); ST.pan.x = e.clientX; ST.pan.y = e.clientY; return; }
    const D = ST.down; if (!D) return;
    D.moved = Math.max(D.moved, Math.hypot(e.clientX - D.sx, e.clientY - D.sy));
    if (D.touch) { if (D.moved > 10) { panScreen(e.clientX - D.x, e.clientY - D.y); } D.x = e.clientX; D.y = e.clientY; return; }
    if (D.btn === 0 && D.moved > 6) hud.box([Math.min(D.sx, e.clientX), Math.min(D.sy, e.clientY), Math.abs(e.clientX - D.sx), Math.abs(e.clientY - D.sy)]);
  });
  addEventListener('pointerup', e => {
    if (ST.pan && e.button === 1) { ST.pan = null; return; }
    if (ST.pinch && (e.pointerId === ST.pinch.a.id || e.pointerId === ST.pinch.b.id)) { ST.pinch = null; ST.down = null; return; }
    const D = ST.down; if (!D || !ST.active) { ST.down = null; return; }
    ST.down = null; hud.box(null);
    if (D.cancel) return;
    if (D.touch) {
      if (D.moved > 10) return;
      // tap: own friend → select; zombie or ground with a selection → order; else deselect
      const u = pickUnit(e.clientX, e.clientY, true, 34);
      if (u) { clickSelect(e.clientX, e.clientY, true, false); return; }
      if (ST.placing) { placeAt(e.clientX, e.clientY); return; }
      if (ST.sel.size) rightClick(e.clientX, e.clientY); else clickSelect(e.clientX, e.clientY, false, false);
      return;
    }
    if (D.btn === 2) { if (D.moved < 8) rightClick(e.clientX, e.clientY); return; }
    const add = e.shiftKey;
    if (D.moved > 6) selectBox(D.sx, D.sy, e.clientX, e.clientY, add);
    else { const dbl = performance.now() - (ST.lastClick || 0) < 320; ST.lastClick = performance.now(); clickSelect(e.clientX, e.clientY, add, dbl); }
  });
  el.addEventListener('wheel', e => { if (busy()) return; e.preventDefault(); ST.cam.tdist = clamp(ST.cam.tdist * Math.exp(e.deltaY * 0.0012), 16, 95); }, { passive: false });
  addEventListener('mouseout', e => { if (!e.relatedTarget) ST.mouse.in = false; });
  addEventListener('blur', () => { ST.keys.clear(); ST.mouse.in = false; });
  addEventListener('keyup', e => ST.keys.delete(e.code));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function panScreen(dx, dy) {
    // the ground follows the finger/cursor: camera forward f = (sin yaw, cos yaw), screen right r = (-cos yaw, sin yaw)
    const k = ST.cam.dist * 0.0021, c = Math.cos(ST.cam.yaw), sn = Math.sin(ST.cam.yaw);
    ST.cam.tx += (dx * c + dy * sn) * k; ST.cam.tz += (-dx * sn + dy * c) * k;
    ST.cam.tx = clamp(ST.cam.tx, -96, 62); ST.cam.tz = clamp(ST.cam.tz, 0, 108);
  }

  // ---------------- keyboard (input.capture while in the mode) ----------------
  function onKey(e) {
    if (!ST.active) return false;
    const tag = (e.target && e.target.tagName) || ''; if (/INPUT|TEXTAREA/.test(tag)) return false;
    if (/^F\d+$/.test(e.code)) return false; // F3/F4/F11 for desktop.js / the browser
    ST.keys.add(e.code);
    if (e.repeat) return true;
    if (hud.menuOpen() || hud.lobbyOpen()) { if (e.code === 'Escape') { hud.menu(false); } return true; }
    if (/Arrow/.test(e.code) || e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    const ctrl = e.ctrlKey || e.metaKey, dig = /^Digit([1-9])$/.exec(e.code);
    if (dig) {
      const n = +dig[1]; e.preventDefault();
      if (ctrl) { ST.groups[n] = mySel(); hud.tip(`Gruppo ${n}: ${ST.groups[n].length} amici`); return true; }
      const g = (ST.groups[n] || []).filter(id => ent.units.has(id)); if (!g.length) return true;
      ST.sel = new Set(g); ST.selB = 0; refreshSel();
      const now = performance.now(); if (ST.lastGroup.n === n && now - ST.lastGroup.t < 400) { let x = 0, z = 0; for (const id of g) { const u = ent.units.get(id); x += u.x; z += u.z; } ST.cam.tx = x / g.length; ST.cam.tz = z / g.length; }
      ST.lastGroup = { n, t: now }; return true;
    }
    switch (e.code) {
      case 'Escape': if (ST.placing) { ST.placing = null; R3.ghost(null); hud.markButtons(null, ST.amove); } else if (ST.amove) { ST.amove = false; hud.markButtons(ST.placing, false); } else hud.menu(true, menuInfo()); break;
      case 'KeyZ': case 'KeyX': case 'KeyC': case 'KeyV': { const r = ROLE_KEYS.find(k => 'Key' + ROLES[k].key === e.code); if (r) act({ k: 'recruit', role: r }, true); break; }
      case 'KeyB': startPlacing('barricata'); break;
      case 'KeyN': startPlacing('torretta'); break;
      case 'KeyR': ST.rot = ST.rot ? 0 : 1; break;
      case 'KeyT': command('amove'); break;
      case 'KeyH': command('hold'); break;
      case 'KeyY': command('stop'); break;
      case 'KeyF': command('all'); break;
      case 'KeyG': command('next'); break;
      case 'KeyP': { const g = ground(ST.mouse.x, ST.mouse.y); if (g) act({ k: 'ping', x: g[0], z: g[1] }); break; }
      case 'Delete': case 'Backspace': command('demolish'); break;
      case 'Space': if (ST.view) { ST.cam.tx = ST.view.hq[0]; ST.cam.tz = ST.view.hq[1] + 6; } break;
    }
    return true;
  }

  // ---------------- per frame ----------------
  const camOut = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 40, snap: true };
  const focusV = new THREE.Vector3();
  function cameraPick(prev, dt) {
    if (!ST.active) return prev;
    const C = ST.cam, k = 1 - Math.exp(-dt * 10);
    C.x += (C.tx - C.x) * k; C.z += (C.tz - C.z) * k; C.dist += (C.tdist - C.dist) * k; C.yaw = lerpA(C.yaw, C.tyaw, k);
    // nearly top-down so the streets show between the 10-16 m buildings: 70° close up, 78° zoomed out
    const pitch = 1.22 + (C.dist - 16) / 79 * 0.14, hd = Math.cos(pitch) * C.dist, h = Math.sin(pitch) * C.dist;
    camOut.look.set(C.x, 0, C.z); camOut.pos.set(C.x - Math.sin(C.yaw) * hd, h, C.z - Math.cos(C.yaw) * hd);
    return camOut;
  }
  function focus() { if (!ST.active) return null; return focusV.set(ST.cam.x, 0, ST.cam.z); }
  function showNPCs(on) {
    const N = window.__npcs; if (!N || !N.active) return;
    for (const id of N.active()) { const n = N.get(id); if (n && n.root) n.root.visible = on; }
    ST.npcHidden = !on;
  }
  function camMove(dt) {
    const C = ST.cam, K = ST.keys, sp = C.dist * 0.9 * dt;
    let fx = 0, fz = 0;
    if (K.has('KeyW') || K.has('ArrowUp')) fz += 1; if (K.has('KeyS') || K.has('ArrowDown')) fz -= 1;
    if (K.has('KeyD') || K.has('ArrowRight')) fx -= 1; if (K.has('KeyA') || K.has('ArrowLeft')) fx += 1;
    // screen edges (mouse, desktop only)
    if (ST.mouse.in && !ui.coarse && document.hasFocus() && !ST.down && !hud.menuOpen() && !hud.lobbyOpen()) {
      const m = 6; if (ST.mouse.x <= m) fx += 1; if (ST.mouse.x >= innerWidth - m) fx -= 1; if (ST.mouse.y <= m) fz += 1; if (ST.mouse.y >= innerHeight - m) fz -= 1;
    }
    if (fx || fz) { const c = Math.cos(C.yaw), s = Math.sin(C.yaw); C.tx += (fz * s + fx * c) * sp; C.tz += (fz * c - fx * s) * sp; }
    if (K.has('KeyQ')) C.tyaw += dt * 1.6; if (K.has('KeyE')) C.tyaw -= dt * 1.6;
    if (K.has('Equal') || K.has('NumpadAdd')) C.tdist = clamp(C.tdist * (1 - dt * 1.5), 16, 95); if (K.has('Minus') || K.has('NumpadSubtract')) C.tdist = clamp(C.tdist * (1 + dt * 1.5), 16, 95);
    C.tx = clamp(C.tx, -96, 62); C.tz = clamp(C.tz, -4, 108);
  }
  function processEvents() {
    let shots = 0;
    for (const e of events) {
      switch (e.k) {
        case 'shot': R3.addShot(e.f, e.to, e.kind); if (shots++ < 3) sfx('throw', 0.12); break;
        case 'zdie': R3.addPuff(e.x, e.z, e.ty === 'boss' ? 1.4 : 0.7, '#a6c48a'); break;
        case 'udie': R3.addPuff(e.x, e.z, 0.8, '#ffffff'); sfx('boo', 0.5); break;
        case 'bdie': R3.addPuff(e.x, e.z, 1.3, '#c9a24a'); sfx(e.sold ? 'button' : 'explode', 0.5); break;
        case 'heal': R3.addPuff(e.x, e.z, 0.35, '#ff8a3a'); break;
        case 'wave': hud.tip(e.boss ? `Ondata ${e.n}: c'è il Vigile Urbano Zombie!` : `Ondata ${e.n}: ${e.count} zombie`, 3200); sfx(e.boss ? 'whistle' : 'warning', 0.7); break;
        case 'bossdown': sfx('bossdie', 0.8); R3.addPuff(e.x, e.z, 2, '#ffffff'); break;
        case 'cap': sfx(e.own === 1 ? 'coin' : 'warning', 0.6); break;
        case 'hq': if (e.hp < 600 && !(ST.hqWarn > performance.now())) { ST.hqWarn = performance.now() + 6000; hud.tip('La casa è sotto attacco!', 2000); sfx('warning', 0.6); } break;
        case 'msg': hud.log(e.txt); break;
        case 'ping': R3.ping(e.x, e.z, COLORS[e.c % 4]); sfx('ding', 0.4); break;
        case 'build': R3.addPuff(e.x, e.z, 0.9, '#f0c048'); break;
      }
    }
    events.length = 0;
  }
  function labels() {
    hud.labBegin();
    for (const z of ZONES) { const s = screen(z.x, 4.6, z.z); if (s && s[0] > 0 && s[0] < innerWidth && s[1] > 40 && s[1] < innerHeight) hud.lab(z.name, s[0], s[1], true); }
    if (ST.view) { const s = screen(ST.view.hq[0], 5.4, ST.view.hq[1]); if (s) hud.lab('Casa', s[0], s[1], true); }
    let n = 0;
    for (const id of ST.sel) { if (n++ > 12) break; const e = ent.units.get(id); if (!e) continue; const s = screen(e.x, 2.05, e.z); if (s) hud.lab(e.name || '', s[0], s[1], false); }
    if (ST.cam.dist < 30 && n === 0) for (const e of ent.units.values()) { if (n++ > 10) break; const s = screen(e.x, 2.05, e.z); if (s && s[0] > 0 && s[0] < innerWidth && s[1] > 0 && s[1] < innerHeight) hud.lab(e.name || '', s[0], s[1], false); }
    hud.labEnd();
  }
  const corners = [[0, 0], [0, 0], [0, 0], [0, 0]];
  function camCorners() {
    const r = el.getBoundingClientRect(), pts = [[r.left, r.top], [r.right, r.top], [r.right, r.bottom], [r.left, r.bottom]];
    for (let i = 0; i < 4; i++) { const g = ground(pts[i][0], pts[i][1]); if (!g) return null; corners[i][0] = g[0]; corners[i][1] = g[1]; }
    return corners;
  }
  function placementOk(kind, x, z, rot) {
    const G = gridInfo(), B = BUILDS[kind], w = rot ? B.d : B.w, d = rot ? B.w : B.d;
    for (let zz = z - d / 2 + 0.25; zz < z + d / 2; zz += 0.5) for (let xx = x - w / 2 + 0.25; xx < x + w / 2; xx += 0.5) { const i = Math.floor((xx - G.x0) / G.cell), j = Math.floor((zz - G.z0) / G.cell); if (i < 0 || j < 0 || i >= G.w || j >= G.h || !G.walk[j * G.w + i]) return false; }
    for (const b of ent.blds.values()) if (Math.hypot(b.x - x, b.z - z) < 1.2) return false;
    const v = ST.view; if (!v) return false;
    if (Math.hypot(x - v.hq[0], z - v.hq[1]) < 2.5) return false;
    let near = Math.hypot(x - v.hq[0], z - v.hq[1]) < 16;
    for (let i = 0; i < ZONES.length && !near; i++) if (v.zones[i][0] === 1 && Math.hypot(x - ZONES[i].x, z - ZONES[i].z) < 16 + ZONES[i].r) near = true;
    for (const u of ent.units.values()) if (!near && Math.hypot(u.x - x, u.z - z) < 4) near = true;
    return near && (v.res[0] >= B.cost.b && v.res[1] >= B.cost.t);
  }
  function update(dt, t) {
    if (!ST.active) { if (ST.npcHidden) showNPCs(true); return; }
    showNPCs(false);
    if (dt > 0) camMove(dt);
    interpolate();
    processEvents();
    R3.update(dt, t, camera, ent, ST.sel, ST.selB);
    if (ST.placing && ST.mouse.in) { const g = ground(ST.mouse.x, ST.mouse.y); if (g) { const x = Math.round(g[0] * 2) / 2, z = Math.round(g[1] * 2) / 2; R3.ghost(ST.placing, x, z, ST.rot, placementOk(ST.placing, x, z, ST.rot)); } }
    else R3.ghost(null);
    labels();
    ST.hudT -= dt; if (ST.hudT <= 0) { ST.hudT = 0.1; hud.update(ST.view, ent, ST.sel, ST.me); if (ST.selB) refreshSel(); }
    ST.mmT -= dt; if (ST.mmT <= 0) { ST.mmT = 0.12; hud.drawMinimap(ST.view, ent, camCorners(), ST.me); }
  }
  function onOver(o) {
    if (!o) return;
    let reward = '';
    if (!ST.rewarded) {
      ST.rewarded = true;
      const xp = Math.round(80 + (o.wave || 0) * 35 + (o.kills || 0) * 2 + (o.win ? 500 : 0)), euro = Math.round((o.score || 0) / 25);
      try { window.__rpg && window.__rpg.addXP && window.__rpg.addXP(xp, 'Assedio al quartiere'); } catch (e) { }
      try { window.__rpg && window.__rpg.money && window.__rpg.money.add && window.__rpg.money.add(euro); } catch (e) { }
      reward = `+${xp} XP · +${euro} €`;
      const un = (id, title, desc, icon) => { try { window.__save && window.__save.unlock && window.__save.unlock(id, { title, desc, icon, cat: 'Assedio', group: 'Assedio' }); } catch (e) { } };
      un('siege_play', 'Comandante', 'Hai giocato un assedio al quartiere', '🗺️');
      if (o.win) un('siege_win', 'Il quartiere tiene', 'Hai vinto un assedio', '🚩');
      if (o.win && o.why === 'hold') un('siege_hold', 'Il quartiere è nostro', 'Tutte le zone tenute fino alla fine', '🏴');
      if ((o.kills || 0) >= 200) un('siege_200', 'Disinfestazione', '200 zombie in un assedio', '🧟');
      if (ST.view && ST.view.stats && ST.view.stats.bossKills) un('siege_vigile', 'Niente multa', 'Hai abbattuto il Vigile Urbano Zombie', '👮');
      try { const B = window.__board; if (B && B.submit) B.submit('siege', o.score || 0, { wave: o.wave, kills: o.kills, win: !!o.win, online: !!(ST.sess && ST.sess.online) }); } catch (e) { }
      try { dispatchEvent(new CustomEvent('bigalesso:event', { detail: { type: 'siege', win: !!o.win, wave: o.wave, kills: o.kills, text: o.summary } })); } catch (e) { }
    }
    sfx(o.win ? 'clear' : 'gameover', 0.8);
    hud.results({ ...o, reward });
  }

  // ---------------- explore plugin: the command table ----------------
  const plugin = (ctx, w, h) => {
    const anchor = new THREE.Vector3(TABLE.x, 0, TABLE.z + 0.95), top = new THREE.Vector3(TABLE.x, 1.3, TABLE.z);
    return { items: [{ id: 'rts_table', range: 1.6, label: () => 'Tavolo del comando: Assedio al quartiere', anchor: () => anchor, top: () => top,
      act: () => h.goTo(new THREE.Vector3(TABLE.x, 0, TABLE.z + 0.8), Math.PI, () => open(), { ignore: ['rts_table'] }) }] };
  };
  const api = { plugin, update, camera: cameraPick, focus, open, start, exit, get active() { return ST.active; }, state: ST, ent };
  window.__rts = api;
  return api;
}
