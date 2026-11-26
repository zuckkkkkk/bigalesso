// gulag/index.js — "Il Gulag profondo": the roguelike run client. Rules + referee: shared/gulag.mjs via window.__match
// (seeded floor, room contents, clear validation, rewards, shop, score; online the server checks the run).
// Entry: the iron door on the west wall of the Gulag basement (gulag.js) or the phone (Giochi → Gulag profondo).
// A room at a time: one reusable arena far from the map (x 24..44, z -44..-30), walls/doors/pillars reconfigured per room,
// enemies from combat/ (spawnEnemy) with window.__combat.arena so they live in it. Permadeath: the run loadout is lost,
// the normal inventory/loadout is set aside and comes back untouched. Meta-progression: "Gettoni del Gulag" unlock
// starting perks (localStorage bigalesso_gulag_v1, synced with the rest of the save).
// Controls: as in the quartiere (weapons, Q ombrello) · E at doors / chest / Spaccio · Esc menu
// Co-op (2–4 friends, rules shared/gulag_coop.mjs): the party leader launches "⛓️ Gulag profondo co-op" (O), or the
// pre-run screen offers "Co-op con un bot" offline. The referee simulates the enemies: here they are puppets in the
// combat/ pools (combat/enemies.js e.remote + E.ctx.sync = our hooks for the run), hits go to the referee in batches,
// damage comes back as 'hurt' events, health is the referee's. At 0 hp you are DOWN: a friend holds E next to you
// (2.5 s) to revive you; after 30 s you are OUT until the next room is cleared. Shared wallet, vizi, score and timer.
// API: window.__gulagRun = { open(), quit(), state(), session, coop(session) }
import * as THREE from 'three';
import { PERKS, META } from '../../shared/gulag.mjs';
import { ARENA, LAYOUTS, DECO } from '../../shared/gulag_coop.mjs';
import { loadOptional } from '../quartiere/models.js';
import { registerPartyGame } from '../net/party.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const A0 = ARENA, AC = V((A0.x0 + A0.x1) / 2, 0, (A0.z0 + A0.z1) / 2), WALL_H = 4.2, DOOR_W = 2.4; // arena + layouts shared with the co-op referee
const DOOR_POS = { n: V(AC.x, 0, A0.z1), s: V(AC.x, 0, A0.z0), e: V(A0.x1, 0, AC.z), w: V(A0.x0, 0, AC.z) };
const DOOR_YAW = { n: 0, s: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }; // facing the door from inside
const ENTER = { n: V(AC.x, 0, A0.z1 - 1.6), s: V(AC.x, 0, A0.z0 + 1.6), e: V(A0.x1 - 1.6, 0, AC.z), w: V(A0.x0 + 1.6, 0, AC.z) };
const IRON = { x: 30.02, z: 5.5 }; // iron door in the basement (west wall, between the stairs and the cell set)
const TINTS = ['#b8a48c', '#a89a8a', '#9fae9a', '#b3a2a2', '#a3a9b8'];
const WICON = { pistola: '💧', tortellini: '🥟', nerf: '🎯', spritz: '🍹' };
const WNAME = { pistola: 'Pistola ad acqua', tortellini: 'Lanciatortellini', nerf: 'Nerf blaster', spritz: 'Spritz-Bazooka' };
const RCOL = { comune: '#d4d4d8', 'non comune': '#62d96f', raro: '#4aa8ff', epico: '#c27bff', leggendario: '#ffb52e' };
const LS = 'bigalesso_gulag_v1';

export function installGulagRun({ scene, camera, man, ui, audio, level, S, getWorld, getGulag }) {
  const W = () => getWorld && getWorld();
  const C = () => window.__combat;
  const toast = (m, c) => { try { ui.toast(m, c); } catch (e) { } };
  const sfx = n => { try { audio.sfx && audio.sfx(n); } catch (e) { } };
  const meta = (() => { try { return Object.assign({ gettoni: 0, unlocked: [], best: 0, runs: 0, wins: 0 }, JSON.parse(localStorage.getItem(LS) || '{}')); } catch (e) { return { gettoni: 0, unlocked: [], best: 0, runs: 0, wins: 0 }; } })();
  const saveMeta = () => { try { localStorage.setItem(LS, JSON.stringify(meta)); } catch (e) { } };
  const st = { on: false, s: null, v: null, room: null, fight: null, saved: null, startPerks: [], over: false, fadeT: 0 };

  // ---------------------------------------------------------------- arena meshes (built now, hidden)
  const root = new THREE.Group(); root.name = 'gulag-run'; root.visible = false; scene.add(root);
  const tex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; };
  const floorTex = tex(256, 256, (x, w, h) => { x.fillStyle = '#5a554e'; x.fillRect(0, 0, w, h); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const k = 70 + ((i * 7 + j * 13) % 5) * 9; x.fillStyle = `rgb(${k + 10},${k + 6},${k})`; x.fillRect(i * 64 + 2, j * 64 + 2, 60, 60); } x.strokeStyle = 'rgba(0,0,0,.35)'; for (let i = 0; i < 60; i++) { x.beginPath(); const a = (i * 97) % 256, b = (i * 61) % 256; x.moveTo(a, b); x.lineTo(a + 8, b + 3); x.stroke(); } });
  floorTex.repeat.set(5, 3.5);
  const wallTex = tex(256, 256, (x, w, h) => { x.fillStyle = '#d8d0c0'; x.fillRect(0, 0, w, h); x.fillStyle = '#5a7a6a'; x.fillRect(0, h * 0.62, w, h * 0.38); x.fillStyle = '#3e5a4c'; x.fillRect(0, h * 0.6, w, 6); for (let i = 0; i < 200; i++) { x.fillStyle = `rgba(60,50,40,${0.03 + (i % 5) * 0.01})`; x.fillRect((i * 53) % w, (i * 31) % h, 3 + (i % 7), 2 + (i % 4)); } });
  wallTex.repeat.set(4, 1);
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.92, emissive: 0x241e18, emissiveIntensity: 0.35 });
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.95, color: 0xb8a48c, emissive: 0x2a241c, emissiveIntensity: 0.45, side: THREE.DoubleSide });
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0x3a342e, roughness: 1, emissive: 0x16120e, emissiveIntensity: 0.4, side: THREE.DoubleSide });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x3c3f44, roughness: 0.45, metalness: 0.7, emissive: 0x111214, emissiveIntensity: 0.4 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false });
  const mesh = (g, m, x, y, z, ry = 0, parent = root) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = false; o.receiveShadow = false; parent.add(o); return o; };
  const RW = A0.x1 - A0.x0, RD = A0.z1 - A0.z0;
  { const f = mesh(new THREE.PlaneGeometry(RW, RD), floorMat, AC.x, 0.002, AC.z); f.rotation.x = -Math.PI / 2;
    const c = mesh(new THREE.PlaneGeometry(RW, RD), ceilMat, AC.x, WALL_H, AC.z); c.rotation.x = Math.PI / 2; }
  // walls: two halves + a lintel per side (the door gap in the middle)
  const wallPieces = (len) => { const half = (len - DOOR_W) / 2; return [half, half]; };
  for (const side of ['n', 's', 'e', 'w']) {
    const horiz = side === 'n' || side === 's', len = horiz ? RW : RD, [h1] = wallPieces(len), p = DOOR_POS[side];
    const g = new THREE.Group(); g.position.copy(p); g.rotation.y = horiz ? 0 : Math.PI / 2; root.add(g);
    const geo = new THREE.BoxGeometry(h1, WALL_H, 0.3);
    mesh(geo, wallMat, -(DOOR_W / 2 + h1 / 2), WALL_H / 2, 0, 0, g); mesh(geo, wallMat, DOOR_W / 2 + h1 / 2, WALL_H / 2, 0, 0, g);
    mesh(new THREE.BoxGeometry(DOOR_W, WALL_H - 2.6, 0.3), wallMat, 0, 2.6 + (WALL_H - 2.6) / 2, 0, 0, g);
  }
  // door bars per side (visible when the door is shut or there is no door) + a dark "corridor" plane behind open doors
  const doors = {};
  for (const side of ['n', 's', 'e', 'w']) {
    const horiz = side === 'n' || side === 's', g = new THREE.Group(); g.position.copy(DOOR_POS[side]); g.rotation.y = horiz ? 0 : Math.PI / 2; root.add(g);
    const bars = new THREE.Group(); g.add(bars);
    for (let i = 0; i < 9; i++) mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.6, 6), ironMat, -DOOR_W / 2 + 0.15 + i * (DOOR_W - 0.3) / 8, 1.3, 0, 0, bars);
    mesh(new THREE.BoxGeometry(DOOR_W, 0.08, 0.08), ironMat, 0, 2.55, 0, 0, bars); mesh(new THREE.BoxGeometry(DOOR_W, 0.08, 0.08), ironMat, 0, 1.2, 0, 0, bars);
    const dark = mesh(new THREE.PlaneGeometry(DOOR_W, 2.6), new THREE.MeshBasicMaterial({ color: 0x050403, side: THREE.DoubleSide }), 0, 1.3, (side === 'n' || side === 'e' ? 1 : -1) * 0.6, 0, g);
    const wallFill = mesh(new THREE.BoxGeometry(DOOR_W, 2.6, 0.3), wallMat, 0, 1.3, 0, 0, g); // no door here: solid wall
    const arrow = mesh(new THREE.ConeGeometry(0.18, 0.4, 4), bulbMat, 0, 2.85, (side === 'n' || side === 'e' ? -1 : 1) * 0.2, 0, g); arrow.rotation.x = Math.PI;
    doors[side] = { g, bars, dark, wallFill, arrow };
  }
  // bulbs (emissive only: no lights)
  for (const [dx, dz] of [[-6, 0], [6, 0], [0, 0]]) { mesh(new THREE.SphereGeometry(0.12, 10, 8), bulbMat, AC.x + dx, WALL_H - 0.35, AC.z + dz); mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.3, 4), ironMat, AC.x + dx, WALL_H - 0.15, AC.z + dz); }
  // pillars pool + their colliders
  const pillarGeo = new THREE.BoxGeometry(1.1, WALL_H, 1.1); const pillars = []; for (let i = 0; i < 4; i++) { const p = mesh(pillarGeo, wallMat, 0, WALL_H / 2, 0); p.visible = false; pillars.push(p); }
  // chest, shop counter, boss desk
  const chest = new THREE.Group(); chest.position.copy(AC); root.add(chest);
  { const wood = new THREE.MeshStandardMaterial({ color: 0x7a4a24, roughness: 0.8, emissive: 0x1a0e06, emissiveIntensity: 0.4 }); mesh(new THREE.BoxGeometry(1.1, 0.6, 0.7), wood, 0, 0.3, 0, 0, chest); const lid = mesh(new THREE.BoxGeometry(1.12, 0.14, 0.72), wood, 0, 0.67, 0, 0, chest); chest.userData.lid = lid; mesh(new THREE.BoxGeometry(0.16, 0.16, 0.05), new THREE.MeshStandardMaterial({ color: 0xffd21f, metalness: 0.8, roughness: 0.3 }), 0, 0.55, 0.37, 0, chest); }
  const shop = new THREE.Group(); shop.position.set(AC.x, 0, A0.z1 - 2.2); root.add(shop);
  { const m = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.7, emissive: 0x1a120a, emissiveIntensity: 0.4 }); mesh(new THREE.BoxGeometry(4, 1.0, 0.8), m, 0, 0.5, 0, 0, shop);
    const sign = mesh(new THREE.PlaneGeometry(2.6, 0.6), new THREE.MeshBasicMaterial({ map: tex(512, 128, (x, w, h) => { x.fillStyle = '#1a1010'; x.fillRect(0, 0, w, h); x.fillStyle = '#ffd21f'; x.font = '900 64px system-ui'; x.textAlign = 'center'; x.fillText('LO SPACCIO DI CESCO', w / 2, 86); }), toneMapped: false }), 0, 2.4, -0.05, Math.PI, shop); void sign; }
  // prison cell modules along the side walls (decor, loaded with the quartiere models; optional)
  const deco = new THREE.Group(); root.add(deco);
  let decoDone = false;
  async function loadDeco() {
    if (decoDone) return; decoDone = true;
    try {
      const cell = await loadOptional('prison_cell_set'); if (!cell) return; // same cached glb as the basement set (dress.js): shared materials, already warm
      const proto = cell.clone(true); proto.position.set(0, 0, 0); proto.rotation.set(0, 0, 0); proto.scale.set(1, 1, 1); proto.updateMatrixWorld(true); // the cached glb may be placed in the basement already
      const box = new THREE.Box3().setFromObject(proto), sz = box.getSize(V()), ctr = box.getCenter(V()), k = 2.9 / Math.max(0.5, Math.max(sz.x, sz.z));
      proto.position.set(-ctr.x, -box.min.y, -ctr.z);
      for (const [x, z, ry] of [[A0.x0 + 3.2, A0.z1 - 1.6, Math.PI], [A0.x1 - 3.2, A0.z1 - 1.6, Math.PI], [A0.x0 + 3.2, A0.z0 + 1.6, 0], [A0.x1 - 3.2, A0.z0 + 1.6, 0]]) {
        const g = new THREE.Group(), o = proto.clone(true); g.add(o); g.scale.setScalar(k); g.position.set(x, 0, z); g.rotation.y = ry; o.traverse(m => { if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; } }); deco.add(g);
      }
    } catch (e) { console.warn('gulag deco', e); }
  }
  loadDeco(); // during the loading screen (joins the quartiere model cache)
  const decoCols = DECO;
  // iron door in the basement (gulag.js set)
  const iron = new THREE.Group(); iron.name = 'gulag-iron-door'; iron.position.set(IRON.x, 0, IRON.z); iron.rotation.y = Math.PI / 2; scene.add(iron);
  { mesh(new THREE.BoxGeometry(1.2, 2.2, 0.08), ironMat, 0, 1.1, 0.04, 0, iron); for (let i = 0; i < 5; i++) mesh(new THREE.BoxGeometry(0.05, 0.05, 0.03), new THREE.MeshStandardMaterial({ color: 0x9a9da2, metalness: 0.8, roughness: 0.3 }), -0.45 + i * 0.22, 1.8, 0.1, 0, iron);
    mesh(new THREE.PlaneGeometry(0.9, 0.3), new THREE.MeshBasicMaterial({ map: tex(256, 84, (x, w, h) => { x.fillStyle = '#7a0a0a'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.font = '800 30px system-ui'; x.textAlign = 'center'; x.fillText('GULAG PROFONDO', w / 2, 54); }), toneMapped: false }), 0, 2.0, 0.09, 0, iron); }

  // ---------------------------------------------------------------- arena colliders (player: W.boxes; enemies: __combat.arena)
  const dyn = []; // {id, min, max} in W.boxes
  const rects = []; // [x0, z0, x1, z1] blocking for enemies
  function setColliders(room) {
    const w = W(); if (!w || !w.boxes) return;
    for (const b of dyn) { const i = w.boxes.indexOf(b); if (i >= 0) w.boxes.splice(i, 1); } dyn.length = 0; rects.length = 0;
    const add = (x0, z0, x1, z1) => { rects.push([x0, z0, x1, z1]); const b = { id: 'grun' + dyn.length, min: V(x0, 0, z0), max: V(x1, 0, z1) }; dyn.push(b); w.boxes.push(b); };
    if (!room) return;
    for (const [dx, dz] of LAYOUTS[room.layout % LAYOUTS.length]) add(AC.x + dx - 0.55, AC.z + dz - 0.55, AC.x + dx + 0.55, AC.z + dz + 0.55);
    for (const r of decoCols) add(...r);
    if (room.type === 'chest') add(AC.x - 0.6, AC.z - 0.4, AC.x + 0.6, AC.z + 0.4);
    if (room.type === 'shop') add(AC.x - 2, A0.z1 - 2.6, AC.x + 2, A0.z1 - 1.8);
  }
  const arena = {
    contains: (x, z) => x > A0.x0 - 0.5 && x < A0.x1 + 0.5 && z > A0.z0 - 0.5 && z < A0.z1 + 0.5,
    walkable(x, z, r = 0.3) { if (x < A0.x0 + 0.2 + r || x > A0.x1 - 0.2 - r || z < A0.z0 + 0.2 + r || z > A0.z1 - 0.2 - r) return false; for (const b of rects) if (x > b[0] - r && x < b[2] + r && z > b[1] - r && z < b[3] + r) return false; return true; },
  };

  // ---------------------------------------------------------------- DOM
  const css = document.createElement('style'); css.textContent = `
#gr-ov{position:fixed;inset:0;z-index:40;display:none;place-items:center;background:rgba(6,4,3,.9);color:#f2ece2;font:15px/1.45 system-ui,sans-serif}#gr-ov.on{display:grid}
#gr-ov .box{width:min(860px,94vw);max-height:92vh;overflow:auto}#gr-ov h1{margin:0;font:900 clamp(26px,4vw,42px)/1.05 system-ui;text-transform:uppercase;color:#e8d7b8}#gr-ov h1 em{color:#e0402a;font-style:normal}
#gr-ov .sub{opacity:.75}#gr-ov .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin:14px 0}
#gr-ov .card{padding:12px 14px;border-radius:12px;background:#1c1713;border:1px solid #4a3a2a;cursor:pointer;text-align:left;color:inherit;font:inherit}#gr-ov .card:hover,#gr-ov .card:focus{border-color:#e0b050;outline:0}
#gr-ov .card b{display:block;font-size:16px}#gr-ov .card small{opacity:.75}#gr-ov .card.off{opacity:.45;cursor:default}#gr-ov .card.on{border-color:#6ad07a;background:#16241a}
#gr-ov button.b{font:700 15px system-ui;padding:10px 18px;border-radius:10px;border:0;cursor:pointer;background:#e0b050;color:#1a1008;margin-right:8px}#gr-ov button.g{background:#2a2320;color:#fff}
#gr-ov .big{font:900 30px system-ui;color:#e0b050}
#gr-hud{position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:21;display:none;gap:8px;font:700 14px system-ui;color:#fff;pointer-events:none}#gr-hud.on{display:flex}
#gr-hud>div{background:rgba(20,14,10,.75);padding:6px 12px;border-radius:9px;border:1px solid rgba(255,220,160,.18);white-space:nowrap}
#gr-map{position:fixed;top:56px;left:12px;z-index:21;display:none;width:150px;height:150px;border-radius:9px;background:rgba(20,14,10,.72);border:1px solid rgba(255,220,160,.18)}#gr-map.on{display:block}
#gr-fade{position:fixed;inset:0;z-index:39;background:#000;opacity:0;pointer-events:none;transition:opacity .35s;display:grid;place-items:center;color:#e8d7b8;font:800 22px system-ui}#gr-fade.on{opacity:1}`;
  document.head.appendChild(css);
  const el = (tag, id) => { const e = document.createElement(tag); e.id = id; document.body.appendChild(e); return e; };
  const ov = el('div', 'gr-ov'), hud = el('div', 'gr-hud'), mapC = el('canvas', 'gr-map'), fade = el('div', 'gr-fade');
  mapC.width = mapC.height = 300;
  let ovMode = '';
  const showOv = (mode, html) => { ovMode = mode; ov.innerHTML = html; ov.classList.add('on'); document.body.dataset.overlay = 'gulag'; try { document.exitPointerLock && document.exitPointerLock(); } catch (e) { } };
  const hideOv = () => { ovMode = ''; ov.classList.remove('on'); if (document.body.dataset.overlay === 'gulag') delete document.body.dataset.overlay; };
  ov.addEventListener('keydown', e => e.stopPropagation());
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const today = () => new Date().toISOString().slice(0, 10); // UTC, like /api/daily

  function preRun() {
    const cards = Object.entries(META).map(([k, cost]) => { const P = PERKS[k], un = meta.unlocked.includes(k), on = st.startPerks.includes(k);
      return `<button class="card ${un ? (on ? 'on' : '') : (meta.gettoni >= cost ? '' : 'off')}" data-meta="${k}"><b>${P.icon} ${esc(P.name)}</b><small>${esc(P.desc)}</small><br><small>${un ? (on ? '✔ in tasca per la prossima run' : 'sbloccato · clicca per portarlo') : '🪙 ' + cost + ' gettoni per sbloccarlo'}</small></button>`; }).join('');
    showOv('pre', `<div class="box"><h1>Il Gulag <em>profondo</em></h1><p class="sub">Stanze a caso sotto la casa, nemici, lo Spaccio di Cesco e il Secondino in fondo. Se muori perdi tutto quello che hai trovato nella run (il tuo zaino resta a casa).</p>
      <p>🪙 <b>${meta.gettoni}</b> Gettoni del Gulag · record ${meta.best} · run ${meta.runs} · evasioni ${meta.wins}</p>
      <p class="sub">Vizi di partenza (sbloccali coi gettoni, massimo 3 per run):</p><div class="cards">${cards}</div>
      <button class="b" data-go="daily">Run del giorno (${today()})</button><button class="b" data-go="free">Run libera</button><button class="b g" data-go="close">Esci</button>
      <p class="sub" style="margin-top:14px">In compagnia: <button class="b g" data-go="coopbot">⛓️ Co-op con un bot</button><button class="b g" data-go="party">🎉 Co-op con gli amici (party · O)</button></p></div>`);
  }
  ov.addEventListener('click', e => {
    const m = e.target.closest('[data-meta]');
    if (m) { const k = m.dataset.meta; if (meta.unlocked.includes(k)) { st.startPerks = st.startPerks.includes(k) ? st.startPerks.filter(x => x !== k) : st.startPerks.concat(k).slice(-3); } else if (meta.gettoni >= META[k]) { meta.gettoni -= META[k]; meta.unlocked.push(k); st.startPerks = st.startPerks.concat(k).slice(-3); saveMeta(); sfx('coin'); } preRun(); return; }
    const g = e.target.closest('[data-go]');
    if (g) { const a = g.dataset.go; if (a === 'close') hideOv(); else if (a === 'daily' || a === 'free') startRun(a === 'daily'); else if (a === 'home') { hideOv(); exitRun(); } else if (a === 'coopbot') coopBot(); else if (a === 'party') { hideOv(); setTimeout(() => window.__party && window.__party.open(), 60); } return; }
    const p = e.target.closest('[data-pick]'); if (p) { act({ pick: +p.dataset.pick }); sfx('ok'); return; }
    const b = e.target.closest('[data-buy]'); if (b) { st.buyHeal = st.v && st.v.shop && st.v.shop[+b.dataset.buy] && st.v.shop[+b.dataset.buy].id === 'brodo'; act({ buy: +b.dataset.buy }); return; }
  });

  // ---------------------------------------------------------------- run lifecycle (view-driven: online act() only says "sent")
  const OPP = { n: 's', s: 'n', e: 'w', w: 'e' };
  function act(a) { try { return st.s ? st.s.act(a) || { ok: true } : { ok: false, error: 'nessuna run' }; } catch (e) { return { ok: false, error: e.message }; } }
  function open() {
    const w = W(); if (!w || S.phase !== 'world') { toast('Entra nel quartiere prima'); return false; }
    if (st.on) { if (st.v && st.v.over) showResults(); return true; }
    if (window.__br && window.__br.state && window.__br.state().on) { toast('Finisci prima la battle royale'); return false; }
    loadDeco(); preRun(); return true;
  }
  async function startRun(daily) {
    if (st.starting) return; st.starting = true; hideOv();
    let seed = 0, day = daily ? today() : null;
    if (daily) { try { const j = window.__daily ? await window.__daily('gulag') : null; if (j && /^\d{4}-\d{2}-\d{2}$/.test(j.date || '')) day = j.date; } catch (e) { } } // same (UTC) day as the server's /api/daily
    else seed = (Math.random() * 0xfffffff + 1) >>> 0;
    const net = window.__net;
    if (net && net.socket && !(net.connected && net.connected())) { try { await Promise.race([net.socket(), new Promise(r => setTimeout(r, 1500))]); } catch (e) { } } // server referee when reachable
    for (let i = 0; i < 10 && net && net.connected && net.connected() && !(net.games && net.games.length); i++) await new Promise(r => setTimeout(r, 100)); // hello reply lists the server's games
    let s = null;
    try { s = await window.__match.start('gulag', { online: 'auto', opts: { daily: day || undefined, seed: seed || undefined, start: { perks: st.startPerks.slice(0, 3) } } }); }
    catch (e) { console.warn('gulag start', e); toast('Il Gulag è chiuso, riprova'); st.starting = false; return; }
    st.starting = false;
    st.s = s; st.daily = day; st.v = null; st.room = null; st.roomId = -1; st.resultsShown = false; st.quitting = false; st.dying = false; st.pendingSide = null;
    enterRun();
    s.on('event', onEvent);
    s.on('error', e => { if (!e || !e.error) return; if (st.fight && st.fight.sent && /veloce|mancano/.test(e.error)) { st.fight.sent = false; return; } fade.classList.remove('on'); toast(e.error); if (e.fatal) { toast('Run persa: connessione caduta'); exitRun(); } });
    s.on('view', onView);
  }
  function enterRun() {
    const w = W(), c = C(), Q = window.__quartiere;
    st.on = true; meta.runs++; saveMeta();
    st.saved = { pos: man.root.position.clone(), yaw: w.yaw, camYaw: w.camYaw, bounds: { ...level.bounds }, qVis: Q && Q.root ? Q.root.visible : true, lVis: level.root ? level.root.visible : true,
      loadout: c ? c.loadout() : null, slot: c ? c.slot : 0, maxHp: c ? c.player.maxHp : 100, hp: c ? c.player.hp : 100, mods: c ? { ...c.mods } : null, speedMul: w.speedMul, dogFollow: w.dogFollow };
    w.dogFollow = false;
    if (c) { c.setEnabled(false); c.setEnabled(true); c.setSpawning(false); c.arena = arena; c.player.dead = false; c.setLoadout([null, null, null, null], 0); }
    st.wKey = '';
    st.dmgOff = c && c.on ? c.on('damage', () => { if (st.on && !st.resultsShown && c.player.hp <= 0) { c.player.hp = 0.5; if (!st.coop) onDeath(); } }) : null; // co-op: the referee decides who is down
    st.killOff = c && c.on ? c.on('kill', () => { if (st.fight) st.fight.kills++; }) : null;
    root.visible = true; if (Q && Q.root) Q.root.visible = false; if (level.root) level.root.visible = false;
    level.bounds.x0 = A0.x0 + 0.15; level.bounds.x1 = A0.x1 - 0.15; level.bounds.z0 = A0.z0 + 0.15; level.bounds.z1 = A0.z1 - 0.15;
    man.root.position.set(AC.x, 0, AC.z - 3.5); if (w) { w.vel && w.vel.set(0, 0, 0); w.setMode('explore'); }
    hud.classList.add('on'); mapC.classList.add('on'); fade.classList.add('on'); fade.textContent = 'Giù nel Gulag profondo…';
    try { window.__save && window.__save.unlock('gulag_run', { title: 'Giù nel Gulag profondo', desc: 'Hai iniziato una run nel Gulag', icon: '⛓️' }); } catch (e) { }
  }
  function onView(v) {
    if (!st.on || !v || !v.room) return;
    st.v = v;
    if (st.coop) coopPre(v);
    applyRun(v);
    if (v.room.id !== st.roomId) { st.roomId = v.room.id; buildRoom(v, st.pendingSide); st.pendingSide = null; setTimeout(() => { fade.classList.remove('on'); fade.textContent = ''; }, 120); }
    else if (v.room.cleared && st.room && !st.room.cleared) roomCleared(v);
    else if (st.room && v.room.opened && !st.room.opened) { chest.userData.lid.rotation.x = -1.1; chest.userData.lid.position.z = -0.3; }
    st.room = v.room;
    if (st.coop) coopView(v);
    if (v.offer && ovMode !== 'offer') showOffer(v.offer);
    else if (!v.offer && ovMode === 'offer') hideOv();
    else if (ovMode === 'shop') renderShop();
    drawMap();
    if (v.over && !st.resultsShown) {
      st.resultsShown = true; st.fight = null;
      if (v.over.victory) sub('Il Secondino è a terra!', 2.6);
      setTimeout(showResults, st.quitting ? 0 : v.over.victory ? 2400 : 1700);
    }
  }
  function applyRun(v) { // run loadout + perk mods → combat
    const c = C(); if (!c || !v) return;
    const key = v.weapons.map(x => x.base + x.rarity + (x.doppio ? 'd' : '')).join(',');
    if (key !== st.wKey) {
      const had = st.wKey ? st.wKey.split(',').length : 0; st.wKey = key;
      const lv = 1 + Math.floor(((v.room && v.room.depth) || 0) / 2), old = c.loadout();
      const lo = v.weapons.slice(0, 3).map((x, i) => { const o = old[i]; if (o && o.base === x.base && o.rarity === x.rarity && o.gulag) return o; const it = c.weapons.make(x.base, { rarity: x.rarity, level: lv, perks: x.doppio ? ['doppio'] : [], name: WNAME[x.base] + (x.rarity !== 'comune' ? ' ' + x.rarity : '') }); it.starter = true; it.gulag = true; return it; });
      while (lo.length < 4) lo.push(null);
      const slot = v.weapons.length > had && had > 0 ? v.weapons.length - 1 : Math.min(c.slot || 0, v.weapons.length - 1);
      c.setLoadout(lo, slot); if (!had) { try { c.equip(0); } catch (e) { } }
    }
    st.mods = v.mods; st.maxHp = v.maxHp;
    if (c.player.maxHp !== v.maxHp) { const d = v.maxHp - c.player.maxHp; c.player.maxHp = v.maxHp; if (d > 0) c.player.hp = Math.min(v.maxHp, c.player.hp + d); }
  }
  function buildRoom(v, fromSide) {
    const room = v.room, w = W();
    for (const s of ['n', 's', 'e', 'w']) { const D = doors[s], has = room.doors[s] !== undefined; D.wallFill.visible = !has; D.bars.visible = has && !room.cleared; D.dark.visible = has; D.arrow.visible = has && room.cleared; }
    const L = LAYOUTS[room.layout % LAYOUTS.length];
    pillars.forEach((p, i) => { const q = L[i]; p.visible = !!q; if (q) p.position.set(AC.x + q[0], WALL_H / 2, AC.z + q[1]); });
    wallMat.color.set(TINTS[room.tint % TINTS.length]);
    chest.visible = room.type === 'chest'; chest.userData.lid.rotation.x = room.opened ? -1.1 : 0; chest.userData.lid.position.z = room.opened ? -0.3 : 0;
    shop.visible = room.type === 'shop';
    setColliders(room);
    const c = C(); if (c) c.clearEnemies();
    const p = fromSide && ENTER[fromSide] ? ENTER[fromSide] : V(AC.x, 0, AC.z - 3.5);
    man.root.position.set(p.x, 0, p.z);
    if (w) { w.vel && w.vel.set(0, 0, 0); w.yaw = fromSide ? DOOR_YAW[fromSide] + Math.PI : 0; w.camYaw = w.yaw + Math.PI; if (w.mode !== 'explore') w.setMode('explore'); }
    if (c && st.mods && st.mods.shield) c.player.invulnT = Math.max(c.player.invulnT || 0, st.mods.shield);
    st.fight = !st.coop && !room.cleared && room.waves && room.waves.length ? { waves: room.waves, wave: -1, t: 0, tAll: 0, kills: 0, waitT: 1.4, list: [], sent: false } : null;
    if (st.coop) { const me = v.pl && v.pl.find(x => x.id === v.me); if (me) man.root.position.set(me.x, 0, me.z); for (const e of st.coop.pup.values()) { try { E() && E()._int.release(e); } catch (x) { } } st.coop.pup.clear(); }
    sub(room.name + (room.type === 'boss' ? ' — Il Secondino ti aspetta' : room.type === 'shop' ? ' — Cesco ha la merce' : room.type === 'elite' ? ' — occhio' : ''), 2.4);
    if (room.type === 'boss') sfx('boss');
  }
  function roomCleared(v) {
    st.fight = null;
    for (const s of ['n', 's', 'e', 'w']) { doors[s].bars.visible = false; doors[s].arrow.visible = v.room.doors[s] !== undefined; }
    const c = C(); if (!st.coop) act({ hp: c ? Math.round(c.player.hp) : 0 });
    if (!v.over) sub('Stanza ripulita', 1.6);
  }
  let subT = 0; const subEl = el('div', 'gr-sub'); subEl.style.cssText = 'position:fixed;left:50%;top:22%;transform:translateX(-50%);z-index:22;font:900 clamp(22px,3.4vw,40px) system-ui;color:#f2e6cf;text-shadow:0 3px 14px #000;pointer-events:none;opacity:0;transition:opacity .3s;text-align:center;text-transform:uppercase;width:90vw';
  function sub(t, d = 2) { subEl.textContent = t; subEl.style.opacity = 1; subT = d; }
  function spawnWave(f) {
    const c = C(); if (!c) return; f.wave++; f.t = 0; const wave = f.waves[f.wave]; if (!wave) return;
    const P = man.root.position;
    for (const grp of wave) for (let i = 0; i < grp.n; i++) {
      let x = 0, z = 0, ok = false;
      for (let k = 0; k < 30 && !ok; k++) { x = A0.x0 + 1.6 + Math.random() * (RW - 3.2); z = A0.z0 + 1.6 + Math.random() * (RD - 3.2); ok = Math.hypot(x - P.x, z - P.z) > 5.5 && arena.walkable(x, z, 0.5); }
      if (!ok) { x = AC.x + (Math.random() - 0.5) * 6; z = A0.z1 - 2.5; }
      const e = c.spawnEnemy(grp.t, V(x, 0, z), { level: grp.lv });
      if (!e) continue;
      f.list.push(e);
      if (grp.t === 'pigeon') { e.alt = 2.6 + Math.random() * 0.6; e.rad = 2.5 + Math.random() * 2; e.pos.y = 3.1; }
      if (grp.t === 'boss') e.name = 'Il Secondino';
    }
    if (f.wave > 0) sub('Ondata ' + (f.wave + 1), 1.4);
  }
  function onDeath() {
    if (st.dying) return;
    const v = st.v, c = C();
    if (v && v.perks.includes('crescentina') && !v.usedLife && !st.revived) { st.revived = true; act({ revive: true }); c.player.hp = c.player.maxHp / 2; c.player.invulnT = 2.5; sub('Crescentina fritta! Seconda vita', 2); sfx('respawn'); return; }
    st.dying = true; c.player.invulnT = 99; st.fight = null;
    act({ hp: 0 }); act({ died: true });
    const w = W(); if (w) { w.setMode('ko'); w.vel && w.vel.set(0, 0, 0); }
    sfx('ko'); sub('Sei rimasto nel Gulag', 2.2);
  }
  function showResults() {
    const v = st.v, o = v && v.over; if (!o) return;
    if (!st.rewarded) {
      st.rewarded = true;
      meta.gettoni += o.gettoni || 0; meta.best = Math.max(meta.best, o.score || 0); if (o.victory) meta.wins++; saveMeta();
      st.xp = Math.round(30 + (o.score || 0) / 20); try { const R = window.__rpg; R && R.addXP && R.addXP(st.xp, 'gulag'); } catch (e) { }
      try { const B = window.__board; if (B && B.submit && !o.team) B.submit(o.daily ? 'gulag-daily' : 'gulag', o.score || 0, { daily: o.daily, seed: o.seed, rooms: o.rooms, kills: o.kills, victory: o.victory }); } catch (e) { }
      try { if (o.victory) window.__save && window.__save.unlock('gulag_escape', { title: 'Evaso dal Gulag', desc: 'Hai battuto il Secondino', icon: '🗝️' }); } catch (e) { }
      try { if ((o.score || 0) >= 3000) window.__save && window.__save.unlock('gulag_3000', { title: 'Ergastolano modello', desc: '3000 punti in una run del Gulag', icon: '📜' }); } catch (e) { }
      try { window.dispatchEvent(new CustomEvent('bigalesso:event', { detail: { type: 'gulag', text: o.victory ? `è evaso dal Gulag profondo con ${o.score} punti` : `è rimasto nel Gulag profondo (${o.score} punti)` } })); } catch (e) { }
    }
    showOv('end', `<div class="box"><h1>${o.victory ? 'Sei <em>evaso</em>!' : 'Fine della <em>run</em>'}</h1><p class="sub">${esc(o.summary)}</p>
      <div class="big">${o.score} punti</div><p>${o.rooms} stanze · ${o.kills} nemici · +${o.gettoni} 🪙 Gettoni del Gulag · +${st.xp} XP${o.daily ? ' · run del giorno ' + o.daily : ''}</p>
      ${o.team ? `<p class="sub">Squadra: ${o.team.map(t => esc((t.bot ? '🤖 ' : '') + t.name) + ' ' + t.kills + ' 💀').join(' · ')}${o.mvp ? ' · MVP ' + esc(o.mvp) : ''}${o.time ? ' · tempo ' + Math.floor(o.time / 60) + ':' + String(o.time % 60).padStart(2, '0') : ''}</p>` : ''}
      <p class="sub">Gettoni totali: ${meta.gettoni} · record ${meta.best}</p>
      <button class="b" data-go="home">Torna su</button></div>`);
  }
  function exitRun() {
    const w = W(), c = C(), Q = window.__quartiere, sv = st.saved;
    if (c) c.clearEnemies(); st.fight = null;
    setColliders(null);
    if (sv) {
      Object.assign(level.bounds, sv.bounds); if (Q && Q.root) Q.root.visible = sv.qVis; if (level.root) level.root.visible = sv.lVis;
      man.root.position.copy(sv.pos);
      if (w) { w.yaw = sv.yaw; w.camYaw = sv.camYaw; w.vel && w.vel.set(0, 0, 0); w.setMode('explore'); w.speedMul = sv.speedMul; w.dogFollow = sv.dogFollow; }
      if (c) { c.arena = null; c.setEnabled(false); c.setEnabled(true); c.setSpawning(true); c.setLoadout(sv.loadout || [null, null, null, null], sv.slot); c.player.maxHp = sv.maxHp; c.player.hp = Math.max(1, sv.hp); c.player.dead = false; c.player.invulnT = 1.5; if (sv.mods) Object.assign(c.mods, sv.mods); c.refreshStats && c.refreshStats(); }
    }
    if (st.dmgOff) st.dmgOff(); if (st.killOff) st.killOff(); st.dmgOff = st.killOff = null;
    try { st.s && st.s.leave(); } catch (e) { }
    if (st.coop) coopExit();
    st.on = false; st.s = null; st.v = null; st.room = null; st.saved = null; st.wKey = ''; st.mods = null; st.rewarded = false; st.revived = false; st.dying = false;
    root.visible = false; hud.classList.remove('on'); mapC.classList.remove('on'); fade.classList.remove('on'); hideOv(); subEl.style.opacity = 0;
  }
  function quit() { if (!st.on) return; if (st.v && st.v.over) { showResults(); return; } if (st.coop) { toast('Hai lasciato la squadra nel Gulag'); exitRun(); return; } st.quitting = true; act({ quit: true }); }

  // ---------------------------------------------------------------- rewards / shop / offers
  function onEvent(e) {
    if (!e) return;
    if (st.coop && coopEvent(e)) return;
    if (e.k === 'enter') { if (e.from) st.pendingSide = e.from; }
    else if (e.k === 'cleared') { sfx('clear'); toast(`🍽️ +${e.coins} buoni pasto`, 'gold'); if (e.heal) { const c = C(); c && c.heal(e.heal); } }
    else if (e.k === 'weapon') toast(`${WICON[e.w.base] || '🔫'} ${WNAME[e.w.base] || e.w.base} ${e.w.rarity}${e.w.doppio ? ' (doppio)' : ''}`, 'gold');
    else if (e.k === 'perk') { const P = PERKS[e.perk]; if (P) toast(`${P.icon} ${P.name}`, 'gold'); }
    else if (e.k === 'buy') { sfx('coin'); if (e.item === 'brodo') { const c = C(); c && c.heal(40); } }
    else if (e.k === 'revive') { /* applied locally in onDeath */ }
  }
  function coopEvent(e) { // co-op only events (true = handled)
    const v = st.v, me = v && v.me, nm = id => { const p = v && v.pl.find(x => x.id === id); return p ? p.name : 'Un amico'; };
    if (e.k === 'hurt') { if (e.id === me) { const c = C(), en = st.coop.pup.get(e.e); if (c && c.damagePlayer) c.damagePlayer(e.n, { type: e.et || 'zombie', pos: en ? en.pos : man.root.position }); } return true; }
    if (e.k === 'down') { if (e.id !== me) { toast(`🚑 ${e.name} è a terra! Vai da lui e tieni premuto E`, 'warn'); sfx('warning'); } return true; }
    if (e.k === 'out') { if (e.id !== me) toast(`${e.name} è fuori fino alla prossima stanza`); return true; }
    if (e.k === 'up') { if (e.id !== me) toast(`${nm(e.id)} è di nuovo in piedi${e.by === me ? ': l\'hai rianimato tu!' : ''}`, e.by === me ? 'gold' : ''); if (e.by === me) { try { window.__save && window.__save.unlock('gulag_revive', { title: 'Crocerossina del Gulag', desc: 'Hai rianimato un amico nel Gulag co-op', icon: '🚑' }); } catch (x) { } } return true; }
    if (e.k === 'revive') { if (e.id === me) { sub('Crescentina fritta! Seconda vita', 2); sfx('respawn'); } return true; }
    if (e.k === 'kill') { if (e.by === me) { const c = C(), en = st.coop.pup.get(e.e); try { c && c._credit && c._credit({ type: e.t, level: en ? en.level : 1, x: en ? en.pos.x : man.root.position.x, z: en ? en.pos.z : man.root.position.z }, false); } catch (x) { } } return true; }
    if (e.k === 'weapon') { if (e.id === me) toast(`${WICON[e.w.base] || '🔫'} ${WNAME[e.w.base] || e.w.base} ${e.w.rarity}${e.w.doppio ? ' (doppio)' : ''}`, 'gold'); else toast(`${nm(e.id)} ha trovato ${WNAME[e.w.base] || e.w.base} ${e.w.rarity}`); return true; }
    if (e.k === 'buy') { sfx('coin'); if (e.item === 'brodo' && e.by === me) { const c = C(); c && c.heal(40); } if (e.by !== me) toast(`${nm(e.by)} ha comprato allo Spaccio`); return true; }
    if (e.k === 'perk') { const P = PERKS[e.perk]; if (P) toast(`${P.icon} ${P.name}${e.by && e.by !== me ? ' (scelto da ' + nm(e.by) + ')' : ''}`, 'gold'); return true; }
    if (e.k === 'enter') { if (e.from) st.pendingSide = e.from; fade.textContent = ''; fade.classList.add('on'); setTimeout(() => fade.classList.remove('on'), 900); return true; }
    if (e.k === 'wave') { if (e.i > 0) sub('Ondata ' + (e.i + 1), 1.4); return true; }
    if (e.k === 'multa') { sfx('whistle'); return true; }
    if (e.k === 'left') { toast(`${e.name} ha lasciato la run`); return true; }
    if (e.k === 'shot' || e.k === 'open') return true;
    return false; // cleared, offer… as in the solo run
  }
  function showOffer(list) {
    showOv('offer', `<div class="box"><h1>Scegli un <em>vizio</em></h1><div class="cards">${list.map((k, i) => PERKS[k] ? `<button class="card" data-pick="${i}"><b>${PERKS[k].icon} ${esc(PERKS[k].name)}</b><small>${esc(PERKS[k].desc)}</small></button>` : '').join('')}</div></div>`);
  }
  function renderShop() {
    const v = st.v; if (!v || !v.shop) { if (ovMode === 'shop') hideOv(); return; }
    showOv('shop', `<div class="box"><h1>Lo Spaccio <em>di Cesco</em></h1><p class="sub">«Qui si paga in buoni pasto, niente carte.» Hai 🍽️ <b>${v.coins}</b></p>
      <div class="cards">${v.shop.map((it, i) => `<button class="card ${it.sold || v.coins < it.price ? 'off' : ''}" data-buy="${i}"><b>${esc(it.name)}</b><small>${it.sold ? 'venduto' : '🍽️ ' + it.price}</small></button>`).join('')}</div>
      <button class="b g" data-go="close">Chiudi</button></div>`);
  }
  const mapX = mapC.getContext('2d');
  function drawMap() {
    const v = st.v; if (!v) return; const x = mapX; x.clearRect(0, 0, 300, 300);
    let gx0 = 99, gy0 = 99, gx1 = -99, gy1 = -99; for (const r of v.rooms) { gx0 = Math.min(gx0, r.gx); gy0 = Math.min(gy0, r.gy); gx1 = Math.max(gx1, r.gx); gy1 = Math.max(gy1, r.gy); }
    const S0 = Math.min(40, 280 / Math.max(1, gx1 - gx0 + 1, gy1 - gy0 + 1)), ox = 150 - (gx1 - gx0 + 1) * S0 / 2, oy = 150 - (gy1 - gy0 + 1) * S0 / 2;
    x.font = Math.round(S0 * 0.42) + 'px system-ui'; x.textAlign = 'center';
    for (const r of v.rooms) {
      const seen = r.v || Object.values(r.doors).some(id => v.rooms[id] && v.rooms[id].v); if (!seen) continue;
      const px = ox + (r.gx - gx0) * S0, py = oy + (gy1 - r.gy) * S0;
      x.fillStyle = r.id === v.room.id ? '#e0b050' : r.v ? (r.c ? '#6a5a48' : '#8a3a2a') : '#2f2823'; x.fillRect(px + 3, py + 3, S0 - 6, S0 - 6);
      const ic = { boss: '💀', shop: '🛒', chest: '🎁', elite: '⚔️', start: '🚪' }[r.type]; if (ic) x.fillText(ic, px + S0 / 2, py + S0 / 2 + S0 * 0.15);
    }
  }

  // ---------------------------------------------------------------- co-op (shared/gulag_coop.mjs)
  const E = () => { const c = C(); return c && c._debug && c._debug.E; };
  const TYPES = ['zombie', 'pigeon', 'boss'];
  function coopAttach(s) {
    if (st.on) { toast('Sei già in una run del Gulag'); try { s.leave(); } catch (e) { } return false; }
    const w = W(); if (!w || S.phase !== 'world') { try { s.leave(); } catch (e) { } return false; }
    hideOv(); loadDeco();
    st.coop = { pup: new Map(), hitQ: [], sendT: 0, hitT: 0, prevSync: undefined, reviving: null, rvT: 0, bodies: new Map(), lastSt: 'ok', hudT: 0 };
    st.s = s; st.daily = null; st.v = null; st.room = null; st.roomId = -1; st.resultsShown = false; st.quitting = false; st.dying = false; st.pendingSide = null;
    s.on('event', e => { if (st.s === s && st.on) onEvent(e); });
    s.on('error', e => { if (!e || !e.error || st.s !== s) return; if (/rianimare|avvicinati/.test(e.error)) return; fade.classList.remove('on'); toast(e.error); if (e.fatal) { toast('Run persa: connessione caduta'); if (st.on) exitRun(); else st.coop = null; } });
    s.on('view', v => { if (st.s !== s || !st.coop) return; if (!st.on) { enterRun(); fade.textContent = 'Giù nel Gulag profondo, in squadra…'; } onView(v); }); // down in the arena when the leader starts
    return true;
  }
  function coopDetach(s) { if (st.s === s && st.coop && !st.on) { st.coop = null; st.s = null; } }
  async function coopBot() {
    hideOv();
    try { const s = await window.__match.start('gulag_coop', { online: false, players: [{ id: 'bot_seghino', name: 'Seghino', bot: true }], opts: { seed: (Math.random() * 0xfffffff + 1) >>> 0 } }); coopAttach(s); }
    catch (e) { console.warn('gulag coop', e); toast('Il Gulag è chiuso, riprova'); }
  }
  // our hooks for the puppets while the run lasts (combat/enemies.js calls them instead of the open-world sync)
  const coopSync = {
    target: () => null, hurt: () => 0, released: () => { }, handoff: () => false, bossTaken: () => true, bossSpawned: () => { }, multa: () => { },
    hit(e, amount, o) { const q = st.coop && st.coop.hitQ; if (q && e.sid && q.length < 40) q.push([e.sid, Math.round(amount * 10) / 10, o && o.head ? 1 : 0]); },
    died(e, o) { if (o) o.noCredit = true; },
  };
  function coopPre(v) { // before applyRun: health is the referee's
    const c = C(); if (!c || !v.mine) return;
    st.maxHp = v.maxHp;
  }
  function coopView(v) {
    const K = st.coop, c = C(), En = E(), net = window.__net; if (!K || !c) return;
    // my health / status
    const me = v.pl.find(x => x.id === v.me);
    if (me) {
      if (c.player.maxHp !== v.maxHp) c.player.maxHp = v.maxHp;
      if (me.st === 'ok' && Math.abs(c.player.hp - v.mine.hp) > 1) c.player.hp = Math.max(0.5, v.mine.hp);
      if (me.st !== K.lastSt) {
        const w = W();
        if (me.st === 'down') { if (w) { w.setMode('ko'); w.vel && w.vel.set(0, 0, 0); } c.player.hp = 0.5; sfx('ko'); sub('A terra! Un amico può rianimarti (E)', 2.6); }
        else if (me.st === 'out') { sub('Sei fuori: rientri quando la squadra pulisce la stanza', 3); }
        else if (me.st === 'ok') { if (w && w.mode === 'ko') w.setMode('explore'); c.player.hp = Math.max(1, v.mine.hp); c.player.invulnT = 1.5; sfx('respawn'); if (K.lastSt) sub('Di nuovo in piedi!', 1.6); }
        K.lastSt = me.st;
      }
    }
    // enemies: puppets in the combat pools
    if (En) {
      const tag = (net && net.id) || 'gulag', seen = new Set();
      for (const a of v.en) {
        const [id, ty, x, z, y, yaw, hp, max, sti, , lv] = a; seen.add(id);
        let e = K.pup.get(id);
        if (e && !e.alive) { K.pup.delete(id); e = null; }
        if (!e) {
          if (sti === 3) continue;
          e = En._int.newEnemy(TYPES[ty] || 'zombie', V(x, ty === 1 ? y : 0, z), Math.max(1, lv || 1), { remote: tag, max, hp, yaw, quiet: sti !== 0 });
          if (!e) continue;
          e.sid = id; e.aggro = true; e.state = sti === 0 ? 'rise' : ty === 1 ? 'circle' : 'chase'; if (sti !== 0) e.rise = 1;
          if (ty === 2) e.name = 'Il Secondino';
          K.pup.set(id, e);
        }
        e.remote = tag;
        e.net = { x, z, y: ty === 1 ? y : 0, yaw, st: sti === 0 ? 'rise' : sti === 2 ? (ty === 1 ? 'dive' : 'attack') : ty === 1 ? 'circle' : 'chase', hp, rise: sti === 0 ? 0 : 1, at: performance.now() };
        if (sti === 3 && !e.dead) { try { En._int.kill(e, { noCredit: true }); } catch (x) { } }
      }
      for (const [id, e] of K.pup) if (!seen.has(id)) { if (e.alive && !e.dead) { try { En._int.release(e); } catch (x) { } } K.pup.delete(id); }
    }
    coopBodies(v);
  }
  // bots and friends outside my room (no presence avatar): a friend's NPC body
  function coopBodies(v) {
    const K = st.coop, net = window.__net, api = window.__npcs;
    for (const p of v.pl) {
      if (p.id === v.me) continue;
      const human = !p.bot, present = human && net && net.players && net.players.has(+String(p.id).slice(1));
      let b = K.bodies.get(p.id);
      if (present) { if (b) { coopDropBody(b); K.bodies.delete(p.id); } continue; }
      if (!b && api) {
        const used = new Set([...K.bodies.values()].map(x => x.fid));
        const fid = (String(p.id).startsWith('bot_') ? String(p.id).slice(4) : null) || ['seghino', 'asche', 'forla', 'lombu', 'cesco', 'parme'].find(f => !used.has(f));
        const n = fid && (api.get(fid) || api.spawn(fid, { at: V(p.x, 0, p.z) }));
        if (!n) continue;
        b = { fid, n, was: !!api.get(fid) }; K.bodies.set(p.id, b);
        n.state = 'match'; n.leaving = true; n.chatCD = 1e9; n.greeted = true; n.root.position.set(p.x, 0, p.z);
      }
      if (b) { b.tx = p.x; b.tz = p.z; b.tyaw = p.yaw; b.st = p.st; }
    }
    for (const [id, b] of K.bodies) if (!v.pl.some(p => p.id === id)) { coopDropBody(b); K.bodies.delete(id); }
  }
  function coopDropBody(b) { const n = b.n; if (!n) return; n.root.rotation.z = 0; n.state = 'idle'; n.leaving = false; n.chatCD = 10; n.target = null; try { if (!b.was) window.__npcs.despawn(n.id); } catch (e) { } }
  function coopUpdate(dt) {
    const K = st.coop, v = st.v, c = C(), En = E(), w = W(), now = performance.now(), I = window.__app && window.__app.input;
    if (!K) return;
    if (En && En.ctx && En.ctx.sync !== coopSync) { if (K.prevSync === undefined) K.prevSync = En.ctx.sync || null; En.ctx.sync = coopSync; }
    if (!v || v.over) return;
    const me = v.pl.find(x => x.id === v.me), ok = me && me.st === 'ok';
    if (ok && now - K.sendT > 100) { K.sendT = now; const r = man.root.position; act({ p: [Math.round(r.x * 100) / 100, Math.round(r.z * 100) / 100, Math.round((w ? w.yaw : 0) * 1000) / 1000] }); }
    if (K.hitQ.length && now - K.hitT > 90) { K.hitT = now; act({ h: K.hitQ.splice(0, 40) }); }
    if (!ok && c) { c.player.hp = Math.max(0.5, c.player.hp); if (w && w.mode !== 'ko' && me && me.st !== 'ok') w.setMode('ko'); }
    // reviving: hold E next to a downed friend
    if (K.reviving) {
      const t = v.pl.find(x => x.id === K.reviving), P = man.root.position;
      const held = I && (I.k('KeyE') || (I.tHeld && I.tHeld('act')));
      if (!t || t.st !== 'down' || !ok || !held || Math.hypot(t.x - P.x, t.z - P.z) > 2.3) { if (t && t.st === 'down' && held === false) sub('Tieni premuto E per rianimare', 1); K.reviving = null; }
      else if (now - K.rvT > 220) { K.rvT = now; act({ rv: t.id }); }
    }
    // NPC bodies of bots / far friends
    for (const b of K.bodies.values()) {
      const n = b.n; if (!n || !n.root.parent) continue;
      const p = n.root.position, k = 1 - Math.exp(-dt * 10), ox = p.x, oz = p.z;
      p.x += ((b.tx ?? p.x) - p.x) * k; p.z += ((b.tz ?? p.z) - p.z) * k; p.y = 0;
      n.speed = Math.hypot(p.x - ox, p.z - oz) / Math.max(dt, 1e-3) * 1.15; n.state = 'match'; n.yawGoal = null; n.target = null; n.leaving = true; n.chatCD = 1e9;
      let d = (b.tyaw ?? n.root.rotation.y) - n.root.rotation.y; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; n.root.rotation.y += d * Math.min(1, dt * 10);
      n.root.rotation.z = b.st === 'down' || b.st === 'out' ? -1.4 : 0;
    }
    if ((K.hudT -= dt) <= 0) { K.hudT = 0.25; coopHud(v); }
  }
  let teamEl = null;
  function coopHud(v) {
    if (!teamEl) { teamEl = el('div', 'gr-team'); teamEl.style.cssText = 'position:fixed;top:56px;right:12px;z-index:21;display:flex;flex-direction:column;gap:6px;font:700 13px system-ui;color:#fff;pointer-events:none'; }
    teamEl.style.display = st.coop && st.on ? 'flex' : 'none';
    const t = Math.max(0, v.t || 0);
    teamEl.innerHTML = `<div style="background:rgba(20,14,10,.75);padding:5px 10px;border-radius:8px;border:1px solid rgba(255,220,160,.18)">⏱️ ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')} · 🏆 ${v.score}${v.room && !v.room.cleared && v.wave ? ' · ondata ' + v.wave[0] + '/' + v.wave[1] : ''}</div>` + v.pl.map(p => {
      const k = Math.max(0, Math.min(1, p.hp / (p.max || 100))), col = p.st === 'down' ? '#ff6050' : p.st === 'out' ? '#777' : k < 0.3 ? '#ffb030' : '#6ad07a';
      return `<div style="background:rgba(20,14,10,.75);padding:5px 10px;border-radius:8px;min-width:170px;border:1px solid ${p.id === v.me ? '#e0b050' : 'rgba(255,220,160,.18)'}">${p.bot ? '🤖 ' : ''}${esc(p.name)}${p.id === v.me ? ' (tu)' : ''} · 💀 ${p.k}<div style="height:6px;border-radius:3px;background:#333;margin-top:4px;overflow:hidden"><i style="display:block;height:100%;width:${p.st === 'ok' ? k * 100 : p.st === 'down' ? (1 - p.rv) * 0 + p.rv * 100 : 0}%;background:${p.st === 'down' ? '#4aa8ff' : col}"></i></div>${p.st === 'down' ? `<small style="color:#ff8a70">A TERRA · ${p.dn}s${p.rv ? ' · rianimazione ' + Math.round(p.rv * 100) + '%' : ''}</small>` : p.st === 'out' ? '<small style="color:#aaa">fuori fino alla prossima stanza</small>' : ''}</div>`;
    }).join('');
  }
  function coopExit() {
    const K = st.coop; if (!K) return; st.coop = null;
    const En = E(); if (En && En.ctx && En.ctx.sync === coopSync) { const ws = window.__wsync; En.ctx.sync = ws && ws.attached ? ws.sync : (K.prevSync || null); }
    for (const e of K.pup.values()) { try { if (e.alive) En && En._int.release(e); } catch (x) { } }
    for (const b of K.bodies.values()) coopDropBody(b);
    if (teamEl) teamEl.style.display = 'none';
  }
  registerPartyGame('gulag_coop', {
    name: 'Gulag profondo co-op', icon: '⛓️', desc: 'la run del Gulag in squadra: nemici condivisi, rianima gli amici (E)', min: 1, max: 4, fill: false, bots: 1,
    choices: [{ id: 'free', label: 'Run libera', opts: {} }, { id: 'daily', label: 'Run del giorno', opts: { daily: today() } }],
    busy: () => st.on ? 'Sei già nel Gulag' : (window.__br && window.__br.state && window.__br.state().on) ? 'Finisci prima la battle royale' : (W() && W().mode !== 'explore' && W().mode !== 'goto') ? 'Torna a piedi prima' : null,
    attach: s => coopAttach(s),
    detach: s => coopDetach(s),
  });

  // ---------------------------------------------------------------- per frame
  let ironP = false;
  function update(dt) {
    if (subT > 0) { subT -= dt; if (subT <= 0) subEl.style.opacity = 0; }
    if (!ironP && getGulag) { const g = getGulag(); if (g && g.root) { g.root.add(iron); ironP = true; } } // shown with the basement only
    if (!st.on) return;
    if (st.coop) coopUpdate(dt);
    const c = C(), w = W(), v = st.v;
    if (c && st.mods) { c.mods.damage = 1 + st.mods.dmg; c.mods.fireRate = 1 + st.mods.rate; c.mods.armor = Math.min(0.8, st.mods.armor); if (w) w.speedMul = 1 + st.mods.speed; }
    if (c && st.dying) c.player.hp = Math.max(0.5, c.player.hp);
    // fight director: waves → all down → referee
    const f = st.fight;
    if (f && !st.dying && c) {
      f.t += dt; f.tAll += dt;
      let alive = 0; for (const e of f.list) if (!e.dead && e.alive !== false) alive++;
      if (f.wave < 0) { f.waitT -= dt; if (f.waitT <= 0) spawnWave(f); }
      else if (alive === 0 && f.t > 0.8) {
        if (f.wave < f.waves.length - 1) { f.waitT -= dt; if (f.waitT <= -1.2) { f.waitT = 0; spawnWave(f); } }
        else {
          const need = (st.room && st.room.total) || 0;
          if (!f.sent && f.tAll >= 2.2 + need * 0.5) { f.sent = true; f.sentT = f.tAll; act({ clear: { kills: Math.max(f.kills, need), t: +f.tAll.toFixed(2) } }); }
          else if (f.sent && f.tAll - f.sentT > 4) f.sent = false; // no answer: ask again
        }
      }
      // keep pigeons under the ceiling
      for (const e of f.list) if (e.type === 'pigeon' && !e.dead && e.pos.y > WALL_H - 0.5) e.pos.y = WALL_H - 0.5;
    }
    if (v && (st.hudT = (st.hudT || 0) - dt) <= 0) {
      st.hudT = 0.25;
      const t = `<div>⛓️ ${esc(v.room.name)}</div><div>🍽️ ${v.coins}</div><div>💀 ${v.kills}</div><div>${v.perks.map(p => PERKS[p] ? PERKS[p].icon : '').join(' ') || 'nessun vizio'}</div><div>${v.daily ? '📅 ' + v.daily : '🎲 ' + v.seed}</div>`;
      if (t !== st.hudHtml) { st.hudHtml = t; hud.innerHTML = t; }
    }
  }
  addEventListener('keydown', e => {
    if (!st.on || e.repeat) return;
    if (e.code === 'Escape' && (ovMode === 'shop')) { e.preventDefault(); hideOv(); }
  });

  // ---------------------------------------------------------------- explore plugin: iron door, room doors, chest, shop
  const plugin = (ctx, w) => {
    w.mgOpen = w.mgOpen || {}; w.mgOpen.gulag = () => open();
    const FAR = V(9999, 0, 9999), ironStand = V(IRON.x + 0.8, 0, IRON.z), ironTop = V(IRON.x, 1.7, IRON.z);
    const NAMES = { boss: 'Secondino', shop: 'Spaccio', chest: 'ripostiglio', elite: 'isolamento', start: 'ingresso', fight: 'già vista' };
    const doorItem = s => ({
      id: 'grun-door-' + s,
      label: () => { const r = st.room, to = r && r.doors[s], n = to !== undefined && st.v ? st.v.rooms[to] : null; return `Vai ${({ n: 'avanti', s: 'indietro', e: 'a destra', w: 'a sinistra' })[s]}${n && n.v ? ' (' + (NAMES[n.type] || '') + ')' : n && n.type === 'boss' ? ' (Secondino)' : ''}`; },
      anchor: () => (st.on && st.room && st.room.cleared && st.room.doors[s] !== undefined && !(st.v && (st.v.offer || st.v.over)) ? ENTER[s] : FAR), top: () => DOOR_POS[s].clone().setY(1.8), range: 1.9,
      act: () => go(s),
    });
    return {
      items: [
        { id: 'gulag-iron', label: () => 'Porta di ferro: Gulag profondo (run)', anchor: () => (!st.on && getGulag && getGulag() && getGulag().inside ? ironStand : FAR), top: () => ironTop, range: 1.3, act: () => open() },
        ...['n', 's', 'e', 'w'].map(doorItem),
        { id: 'grun-chest', label: () => 'Apri il ripostiglio', anchor: () => (st.on && st.room && st.room.type === 'chest' && !st.room.opened ? V(AC.x, 0, AC.z - 1.1) : FAR), top: () => V(AC.x, 0.8, AC.z), range: 1.5, act: () => { act({ open: true }); sfx('chest'); } },
        { id: 'grun-exit', label: () => st.coop ? 'Risali in superficie (lasci la squadra)' : 'Risali in superficie (finisci la run)', range: 1.4,
          anchor: () => (st.on && st.room && st.room.type === 'start' && !(st.v && (st.v.offer || st.v.over)) ? V(AC.x + 3, 0, A0.z0 + 1.2) : FAR), top: () => V(AC.x + 3, 1.6, A0.z0 + 0.4), act: () => quit() },
        ...[0, 1, 2].map(i => ({ id: 'grun-revive-' + i, range: 1.9,
          label: () => { const t = downed(i); return t ? `Tieni premuto: rianima ${t.name}${t.rv ? ' (' + Math.round(t.rv * 100) + '%)' : ''}` : ''; },
          anchor: () => { const t = downed(i); return t ? V(t.x, 0, t.z) : FAR; }, top: () => { const t = downed(i); return t ? V(t.x, 1.2, t.z) : FAR; },
          act: () => { const t = downed(i); if (t && st.coop) { st.coop.reviving = t.id; st.coop.rvT = 0; } } })),
        { id: 'grun-shop', label: () => 'Compra dallo Spaccio di Cesco', anchor: () => (st.on && st.room && st.room.type === 'shop' ? V(AC.x, 0, A0.z1 - 3.4) : FAR), top: () => V(AC.x, 1.3, A0.z1 - 2.2), range: 1.7, act: () => renderShop() },
      ],
    };
  };
  function downed(i) { // i-th downed friend (co-op), when I'm standing
    const v = st.v; if (!st.coop || !v || !v.pl) return null; const me = v.pl.find(x => x.id === v.me); if (!me || me.st !== 'ok') return null;
    return v.pl.filter(x => x.id !== v.me && x.st === 'down')[i] || null;
  }
  function go(side) {
    if (fade.classList.contains('on')) return;
    st.pendingSide = OPP[side]; fade.textContent = ''; fade.classList.add('on'); sfx('door');
    setTimeout(() => { const r = act({ move: side }); if (r && r.ok === false) { fade.classList.remove('on'); st.pendingSide = null; } }, 300);
    setTimeout(() => fade.classList.remove('on'), 2500); // safety (no answer)
  }

  const api = { coop: s => coopAttach(s), coopBot, open, quit, exit: exitRun, state: () => ({ on: st.on, room: st.room, view: st.v, meta: { ...meta }, fight: st.fight ? { wave: st.fight.wave, waves: st.fight.waves.length, alive: st.fight.list.filter(e => !e.dead).length } : null }), get session() { return st.s; }, _st: st, arena, start: startRun, _go: go };
  window.__gulagRun = api;
  return { plugin, update, api };
}
