// "Zombata notturna": at night (shared day/night cycle, daynight.js) with the player outdoors (garden / Teletubbylandia), procedural
// zombies rise from the ground and shamble toward the player. Survive 60 s or reach the checkpoint; get caught and you
// wake up at the garden door. The extinguisher (F while carrying it) pushes them back. Flashlight on the man at night.
// Cheap: all zombies are 5 InstancedMeshes (body, arms, two legs, eyes); disabled on the "Basso" quality.
// Online (src/worldsync.js sets api.net): one zombata for the players together. The first who triggers it runs it
// (world state 'nz:<id>' with the start time on the server clock); the others outdoors within 40 m join it with the same
// timer, see his zombies (streamed, puppets here) and their spray is sent to him; his zombies go for the nearest of
// them. Getting caught / going home ends it only for you; when he ends it, it ends for everybody. Solo: unchanged.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { V, rnd, pick, clamp, smooth, unlock, phone, catchphrase, logEvent, anchor, overlayCSS } from './shared.js';
import { loadZombieModel, makeZombieRig } from './zmodel.js';
import { DN, zombiesOut } from '../daynight.js'; // zombies only at night; at dawn they cover their eyes and sink

const MAX = 10, DUR = 60;
const OUTDOOR = /giardino|teletubby|colli|via |strada|petroni|checkpoint|parco|piazzett/i;
const INDOOR = /sala giochi|salotto|gulag|casa|cucina|camera|celtic|millennium|sushi/i;

function colored(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo;
}
function strip(g) { const o = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(o.attributes)) if (!['position', 'normal', 'color'].includes(k)) o.deleteAttribute(k); return o; }
function box(w, h, d, x, y, z, col, rx = 0) { const g = new THREE.BoxGeometry(w, h, d, 1, 2, 1); if (rx) g.rotateX(rx); g.translate(x, y, z); return colored(strip(g), col); }
function zombieParts() {
  // body: torso (torn shirt), pants top, neck, head with hair (local origin at the feet)
  const head = colored(strip(new THREE.IcosahedronGeometry(0.13, 1)), '#7fae4f'); head.scale(0.95, 1.08, 1); head.translate(0, 1.64, 0.03);
  const hair = colored(strip(new THREE.IcosahedronGeometry(0.12, 1)), '#2a1a10'); hair.scale(1.02, 0.55, 1.0); hair.translate(0, 1.72, -0.01);
  const jaw = box(0.12, 0.05, 0.08, 0, 1.55, 0.08, '#5a1010');
  const body = mergeGeometries([
    box(0.42, 0.56, 0.24, 0, 1.2, 0, '#ffffff'), box(0.36, 0.14, 0.22, 0, 0.86, 0, '#2a3048'), box(0.08, 0.08, 0.08, 0, 1.5, 0.01, '#7fae4f'),
    box(0.12, 0.18, 0.02, -0.1, 1.05, 0.125, '#8a1a1a'), head, hair, jaw]);
  body.computeVertexNormals();
  // arms: both, reaching forward from the shoulder line (pivot at y=1.42)
  const arms = mergeGeometries([box(0.1, 0.1, 0.56, -0.26, 0, 0.26, '#7fae4f'), box(0.1, 0.1, 0.56, 0.26, 0, 0.26, '#7fae4f'), box(0.12, 0.12, 0.14, -0.26, 0, 0.0, '#ffffff'), box(0.12, 0.12, 0.14, 0.26, 0, 0.0, '#ffffff')]);
  // legs (pivot at the hip, y=0.86)
  const leg = mergeGeometries([box(0.15, 0.78, 0.17, 0, -0.39, 0, '#2a3048'), box(0.16, 0.08, 0.26, 0, -0.82, 0.04, '#1a1a1a')]);
  const eyes = mergeGeometries([new THREE.SphereGeometry(0.024, 8, 6).translate(-0.045, 1.67, 0.135), new THREE.SphereGeometry(0.02, 8, 6).translate(0.05, 1.665, 0.13)].map(strip));
  return { body, arms, leg, eyes };
}

export function createNightZombies(M) {
  const { scene, level, audio, getFX, ui, low } = M;
  const fx = () => (getFX ? getFX() : null);
  const enabled = () => !low && !(ui && ui.settings && ui.settings.quality === 'low');
  let built = false, Z = [], parts = null, meshes = null, torch = null, torchT = null;
  // optional skinned zombies (Tripo model via models/index.json): capped by quality, the rest stay procedural
  let ZM = null; const rigs = [];
  const rigCap = () => { const q = (ui && ui.settings && ui.settings.quality) || 'auto'; return q === 'ultra' ? 8 : q === 'high' ? 6 : q === 'medium' ? 3 : q === 'low' ? 0 : 4; };
  function takeRig() {
    if (!ZM) return null;
    let r = rigs.find(x => !x.busy);
    if (!r && rigs.filter(Boolean).length < rigCap()) { try { r = newRig(); } catch (e) { console.warn('zombie rig', e); ZM = null; return null; } }
    if (!r) return null;
    r.busy = true; r.root.visible = true; r.play('idle', 0); return r;
  }
  function newRig() { const r = makeZombieRig(ZM); scene.add(r.root); rigs.push(r); try { window.__gfx && window.__gfx.addBlob && window.__gfx.addBlob(r.root, 0.34, 0.32); } catch (e) { } return r; }
  const freeRig = z => { if (z.rig) { z.rig.busy = false; z.rig.root.visible = false; z.rig = null; } };
  let NET = null, zid = 0; // online hooks (src/worldsync.js)
  const st = { on: false, follow: 0, t: 0, armed: 0, cool: 20, caught: false, outT: 0, wins: 0, sprays: 0, endT: 0, msg: null, groanT: 1, beatT: 0, firstHint: false };
  const m4 = new THREE.Matrix4(), mRoot = new THREE.Matrix4(), mLoc = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s1 = V(1, 1, 1), p0 = V();
  const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);
  function build() {
    if (built) return; built = true;
    parts = zombieParts();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xe8ff60, toneMapped: false });
    const mk = (g, m, cast) => { const im = new THREE.InstancedMesh(g, m, MAX); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.castShadow = cast; im.count = 0; scene.add(im); return im; };
    meshes = { body: mk(parts.body, mat, true), arms: mk(parts.arms, mat, false), legL: mk(parts.leg, mat, true), legR: mk(parts.leg, mat, true), eyes: mk(parts.eyes, eyeMat, false) };
    const shirts = ['#6a5a4a', '#4a5a7a', '#7a3a3a', '#5a5a5a', '#3a5a3a', '#8a7a5a'].map(c => new THREE.Color(c));
    for (let i = 0; i < MAX; i++) { meshes.body.setColorAt(i, pick(shirts)); }
    meshes.body.instanceColor.needsUpdate = true;
    // flashlight (visible only at night, like the garden lamps: one shader variant change, batched with theirs)
    torch = new THREE.SpotLight(0xfff1d6, 0, 16, 0.42, 0.55, 1.6); torch.castShadow = false; torch.visible = false;
    torchT = new THREE.Object3D(); torch.target = torchT;
    // same top-level group as the garden lamps (world root): gfx.js warms "night lamps + torch" as one light unit
    ((level && level.root) || scene).add(torch); scene.add(torchT);
    // skinned model: loaded now; one clone parked under the ground during a fresh shader warm-up, so the first
    // zombata doesn't stall on compiles (gfx.js rules: build at start-up or warm up right after)
    loadZombieModel().then(m => {
      ZM = m; if (!m || rigCap() <= 0) return;
      const r = newRig(); r.busy = false; r.root.position.set(0, -40, 0); r.root.visible = true;
      Promise.resolve(window.__gfx && window.__gfx.warmup && window.__gfx.warmup()).catch(() => { }).finally(() => { if (!r.busy) r.root.visible = false; });
    }).catch(() => { });
  }
  overlayCSS();
  if (!low) build(); // at start-up: meshes (count 0) + hidden torch are compiled by the loading warm-up
  const hud = document.createElement('div'); hud.id = 'mg-zhud'; document.body.appendChild(hud);
  const flash = document.createElement('div'); flash.id = 'mg-zflash'; document.body.appendChild(flash);
  const setHud = (title, sub) => { hud.innerHTML = title ? `${title}<small>${sub || ''}</small>` : ''; hud.classList.toggle('on', !!title); };

  function nightAmount() { const f = fx(); if (f && typeof f.nightAmount === 'number') return f.nightAmount; return DN.update().night; }
  function zone(p) { return (level && level.zoneAt && level.zoneAt(p.x, p.z)) || ''; }
  const outdoor = p => { const z = zone(p); return !!z && OUTDOOR.test(z) && !INDOOR.test(z); };
  const walk = (x, z, r = 0.28) => !level || !level.isWalkable || level.isWalkable(x, z, r);

  function spawnOne(p) {
    // in Teletubbylandia they come from the meadow edges (quartiere anchors zombie_spawn_1..4), elsewhere from a ring around you
    const A = (level && level.anchors) || {}, edges = [1, 2, 3, 4].map(i => A['zombie_spawn_' + i]).filter(a => a && a.isVector3 && Math.hypot(a.x - p.x, a.z - p.z) < 30 && Math.hypot(a.x - p.x, a.z - p.z) > 6);
    for (let k = 0; k < 40; k++) {
      const e = edges.length && k < 20 ? pick(edges) : null;
      const a = Math.random() * Math.PI * 2, r = e ? rnd(0, 3) : rnd(7, 12), x = (e ? e.x : p.x) + Math.cos(a) * r, z = (e ? e.z : p.z) + Math.sin(a) * r;
      const pt = V(x, 0, z);
      if (!walk(x, z, 0.35) || !outdoor(pt)) continue;
      const zb = { nid: ++zid, pos: pt, yaw: Math.atan2(p.x - x, p.z - z), ph: rnd(0, 6), sp: rnd(0.7, 1.12), rise: 0, stun: 0, sink: 0, tilt: rnd(-0.15, 0.15), groan: rnd(1, 5) };
      zb.rig = takeRig(); Z.push(zb); sfxRise(zb); return zb;
    }
    return null;
  }
  function sfxRise(z) { const a = audio.ctx ? audio : null; if (!a) return; a.noise(0.7, 0.05, 500, 90, a.room); a.tone('sawtooth', 120, 70, 0.9, 0.025, a.room, 0.2); }
  function groan(z, d) {
    const a = audio.ctx ? audio : null; if (!a) return;
    const v = clamp(1 - d / 12, 0, 1) * 0.06; if (v < 0.005) return;
    const f = rnd(85, 140); a.tone('sawtooth', f, f * 0.6, rnd(0.6, 1.1), v, a.room); a.noise(0.8, v * 0.8, 700, 160, a.room, 0.05, 2, 'bandpass');
  }

  function sizzle() { const a = audio.ctx ? audio : null; if (!a) return; a.noise(0.9, 0.03, 5200, 2600, a.room, 0, 1, 'highpass'); a.tone('sawtooth', rnd(150, 210), 70, 0.7, 0.02, a.room, 0.05); }
  function start(force) {
    if (st.on || (!enabled() && !force)) return false;
    build(); const w = M.getWorld && M.getWorld(); if (!w) return false;
    st.on = true; st.t = 0; st.caught = false; st.sprays = 0; st.spawnT = 0.5; st.toSpawn = 6; Z = []; st.outT = 0;
    const cp = anchor(level, 'checkpoint', { pos: V(0, 0, 0) }); st.cp = cp.real ? cp.pos : null;
    setHud('ZOMBATA NOTTURNA', 'Sopravvivi ' + DUR + 's' + (st.cp ? ' o raggiungi il checkpoint' : '') + ' · con l\'estintore (F) li respingi');
    w.toast && w.toast('🧟 Seghino: "' + catchphrase('seghino') + '" — sta per iniziare una zombata!', 'gold');
    return true;
  }
  function end(kind) {
    if (!st.on) return; st.on = false; if (NET) NET.ended(kind, st.follow); st.follow = 0; st.t0 = 0; st.cool = kind === 'win' ? 90 : 35; st.endT = 2.2;
    for (const z of Z) z.sink = z.sink || 0.001;
    const w = M.getWorld && M.getWorld();
    if (kind === 'win' || kind === 'checkpoint') {
      st.wins++;
      setHud(kind === 'checkpoint' ? 'AL SICURO AL CHECKPOINT' : 'SOPRAVVISSUTO!', 'La zombata notturna è finita');
      unlock('zombata_notte', { title: 'Zombata notturna', desc: 'Sopravvissuto agli zombi in giardino', icon: '🔦' });
      if (kind === 'checkpoint') unlock('zombata_checkpoint', { title: 'Zona demilitarizzata', desc: 'Raggiunto il checkpoint inseguito dagli zombi', icon: '🚧' });
      if (st.sprays >= 5) unlock('zombata_estintore', { title: 'Pompiere anti-zombi', desc: 'Respinti 5 zombi con l\'estintore', icon: '🧯' });
      try { audio.sfx('clear'); } catch (e) { }
      fx() && fx().confetti && M.man && fx().confetti(M.man.root.position.clone().add(V(0, 2, 0)), 120);
      phone('seghino', 'zombata superata 💀 ' + catchphrase('seghino'));
      logEvent('zombata', 'è sopravvissuto alla zombata notturna in giardino');
    } else if (kind === 'caught') {
      setHud('TI HANNO PRESO', 'Ti risvegli alla porta del giardino…');
      logEvent('zombata', 'è stato preso dagli zombi in giardino');
      phone('asche', 'raga ma chi si fa prendere dagli zombi lmaooo');
    } else if (kind === 'home') {
      setHud('BARRICATO IN CASA', 'Gli zombi tornano sottoterra');
    } else if (kind === 'dawn') {
      // comic retreat: hands over the eyes, a fizz of smoke and sparks, then down into the ground
      setHud('IL SOLE!', 'Gli zombi si coprono gli occhi e tornano sottoterra');
      st.wins++;
      unlock('zombata_alba', { title: 'Fino all\'alba', desc: 'Hai visto gli zombi scappare alle prime luci', icon: '🌅' });
      const f = fx();
      Z.forEach((z, i) => {
        z.dawn = true; z.sink = 0.001;
        setTimeout(() => { try { const h = z.pos.clone().add(V(0, 1.65, 0)); f && f.sparkles && f.sparkles(h, 10); f && f.spray && f.spray(h, V(0, 1, 0), 0.12); sizzle(); } catch (e) { } }, 80 + i * 110);
      });
      phone('seghino', rnd(['zombi sciolti dal sole 🌅', 'alba. sopravvissuti, palese', 'il sole li ha fatti neri']));
    } else if (kind === 'host') setHud('ZOMBATA FINITA', 'Chi l\'ha cominciata è stato preso o è tornato a casa');
    else setHud(null);
    setTimeout(() => { if (!st.on) setHud(null); }, 3200);
    void w;
  }
  function caught() {
    const w = M.getWorld && M.getWorld(); const man = M.man;
    flash.style.opacity = '1'; setTimeout(() => { flash.style.opacity = '0'; }, 700);
    try { audio.sfx('die'); } catch (e) { }
    end('caught');
    setTimeout(() => {
      const door = (level && level.anchors && level.anchors.gardenDoor) ? level.anchors.gardenDoor.clone().add(V(0, 0, -0.7)) : V(7.7, 0, 6.3);
      if (man) { man.root.position.copy(door); man.root.position.y = 0; }
      if (w) { w.yaw = Math.PI; w.camYaw = 0.35; w.vel && w.vel.set(0, 0, 0); w.setMode && w.setMode('explore'); }
    }, 450);
  }

  function update(dt, t) {
    const w = M.getWorld && M.getWorld(); const man = M.man;
    if (!w || !man || !M.S || M.S.phase !== 'world') return;
    if (st.endT > 0) st.endT -= dt;
    const n = nightAmount(), p = man.root.position, out = outdoor(p);
    // flashlight
    if (enabled() && n > 0.04) {
      build();
      if (!torch.visible) torch.visible = true;
      const want = (out || /piazza|voltone/i.test(zone(p))) ? n * (st.on ? 30 : 18) : 0; // (the piazze of the north district too)
      torch.intensity += (want - torch.intensity) * Math.min(1, dt * 4);
      const yaw = w.yaw ?? man.root.rotation.y, f = V(Math.sin(yaw), 0, Math.cos(yaw));
      torch.position.copy(p).add(V(0, 1.35, 0)).addScaledVector(f, 0.25); torchT.position.copy(p).addScaledVector(f, 6).add(V(0, 0.1, 0)); torchT.updateMatrixWorld();
    } else if (torch && torch.visible && n <= 0.02) { torch.visible = false; torch.intensity = 0; }
    // trigger
    const busy = ui.menuOpen || (w.mode !== 'explore' && w.mode !== 'goto') || document.body.dataset.overlay;
    if (!st.on) {
      st.cool = Math.max(0, st.cool - dt);
      // dusk build-up: the first groans from the bottom of the garden before the zombies may come out
      if (enabled() && out && n > 0.04 && !zombiesOut(n) && !busy && /giardino/i.test(zone(p))) { /* (streets: combat/enemies.js) */ st.duskT = (st.duskT ?? 3) - dt; if (st.duskT <= 0) { st.duskT = rnd(5, 9); groan(null, rnd(5, 9)); } }
      if (enabled() && zombiesOut(n) && out && !busy && (!M.S.online || NET)) {
        st.armed += dt;
        if (!st.firstHint && st.armed > 1.5) { st.firstHint = true; w.toast && w.toast('Si sentono dei lamenti dal fondo del giardino…'); }
        if (st.armed > 6 && st.cool <= 0) { if (!NET) start(); else if (!st.claiming) { st.claiming = true; NET.claim(p).then(t0 => { st.claiming = false; if (t0 && !st.on) { start(); st.t0 = t0; } else if (!st.on) st.cool = 6; }); } } // online: one per group, its start time on the server clock
      } else st.armed = Math.max(0, st.armed - dt * 2);
    } else {
      st.t = st.t0 && NET ? Math.max(0, (NET.now() - st.t0) / 1000) : st.t + dt; // online: the same timer for everybody in it
      if (!out) { st.outT += dt; if (st.outT > 1.2) end(INDOOR.test(zone(p)) || !zone(p) ? 'home' : 'home'); }
      else st.outT = 0;
      if (st.on && !zombiesOut(n)) end('dawn'); // sunrise (shared clock): the night is over
    }
    if (st.on) { // (still on: no spawn / HUD overwrite in the frame the event ended)
      // spawn
      st.spawnT -= dt;
      const alive = Z.filter(z => !z.sink).length;
      const target = Math.min(MAX, 4 + Math.floor(st.t / 8));
      if (st.spawnT <= 0 && alive < target && !st.follow) { spawnOne(p); st.spawnT = rnd(1.5, 3); }
      const left = Math.max(0, DUR - st.t);
      setHud('ZOMBATA NOTTURNA', `Sopravvivi ancora ${Math.ceil(left)}s · zombi: ${alive}` + (st.cp ? ` · checkpoint a ${Math.round(Math.hypot(st.cp.x - p.x, st.cp.z - p.z))} m` : ''));
      if (st.cp && Math.hypot(st.cp.x - p.x, st.cp.z - p.z) < 1.6) end('checkpoint');
      else if (left <= 0) end('win');
    }
    if (!built) return;
    // spray with the extinguisher pushes them back
    const I = M.getInput && M.getInput();
    const spraying = w.carry && I && I.k && I.k('KeyF');
    const yaw = w.yaw ?? 0, fwd = V(Math.sin(yaw), 0, Math.cos(yaw));
    // zombies
    let nearest = 1e9;
    for (const z of Z) {
      z.ph += dt * z.sp * (z.dawn ? 14 : 5.2);
      if (z.sink) { z.sink += dt; continue; }
      z.rise = Math.min(1, z.rise + dt / 1.4);
      z.stun = Math.max(0, z.stun - dt);
      const ld = Math.hypot(p.x - z.pos.x, p.z - z.pos.z); // from me: caught, spray, heartbeat
      const tp = NET && st.on && !st.follow ? NET.target(z.pos, p) : p; // online: his zombies go for the nearest player in it
      const dx = tp.x - z.pos.x, dz = tp.z - z.pos.z, d = Math.hypot(dx, dz);
      nearest = Math.min(nearest, ld);
      if (spraying && ld < 3.2 && (-(p.x - z.pos.x) * fwd.x - (p.z - z.pos.z) * fwd.z) / (ld || 1) > 0.72) {
        if (z.stun < 0.5) { st.sprays++; if (st.follow && NET) NET.spray(z.nid, p); }
        z.stun = 1.6; const k = 1.6 * dt; z.pos.x -= (p.x - z.pos.x) / ld * k * 1.4; z.pos.z -= (p.z - z.pos.z) / ld * k * 1.4;
      }
      if (st.follow && z.np) { const k = 1 - Math.exp(-dt * 8); z.pos.x += (z.np.x - z.pos.x) * k; z.pos.z += (z.np.z - z.pos.z) * k; let dy = z.ny - z.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2; z.yaw += dy * Math.min(1, dt * 6); }
      if (st.follow) { if (z.rise > 0.85 && st.on && ld < 0.62 && z.stun <= 0 && !st.caught && w.mode === 'explore') { st.caught = true; z.attackT = 1.2; caught(); } } // puppet: moved by his stream
      else if (z.rise > 0.85 && st.on) {
        const ty = Math.atan2(dx, dz); let dy = ty - z.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
        z.yaw += dy * Math.min(1, dt * 2.5);
        const sp = z.sp * (z.stun > 0 ? 0.0 : 1) * (0.75 + 0.25 * Math.sin(z.ph * 0.5));
        if (sp > 0 && d > 0.45) {
          // walk around obstacles: keep a preferred side while blocked (fountain, hedges, benches)
          const sd = z.side || (z.side = Math.random() < 0.5 ? 1 : -1); let moved = false;
          for (const off of [0, sd * 0.6, sd * 1.2, sd * 1.75, -sd * 0.6, -sd * 1.2, -sd * 1.75, sd * 2.4]) {
            const a = z.yaw + off, nx = z.pos.x + Math.sin(a) * sp * dt, nz = z.pos.z + Math.cos(a) * sp * dt;
            if (walk(nx, nz, 0.25)) { z.pos.x = nx; z.pos.z = nz; moved = true; if (off) z.detour = 1.2; if (Math.sign(off) === -sd) z.side = -sd; break; }
          }
          if (!moved) z.side = -sd;
        }
        // zombies don't overlap
        for (const o of Z) if (o !== z && !o.sink) { const ox = z.pos.x - o.pos.x, oz = z.pos.z - o.pos.z, od = Math.hypot(ox, oz); if (od < 0.55 && od > 1e-3) { z.pos.x += ox / od * (0.55 - od) * 0.5; z.pos.z += oz / od * (0.55 - od) * 0.5; } }
        if (ld < 0.62 && z.stun <= 0 && st.on && !st.caught && w.mode === 'explore') { st.caught = true; z.attackT = 1.2; caught(); }
      }
      z.groan -= dt; if (z.groan <= 0) { z.groan = rnd(2.5, 6); groan(z, ld); }
    }
    // skinned zombies: transform + animation state
    for (const z of Z) {
      const r = z.rig; if (!r) continue;
      const yOff = (z.sink ? -smooth((z.sink - (z.dawn ? 1.0 : 0.6)) / 1.2) * 1.9 * (z.sink > (z.dawn ? 1.0 : 0.6) ? 1 : 0) : -(1 - smooth(z.rise)) * 1.9);
      r.root.position.set(z.pos.x, yOff, z.pos.z); r.root.rotation.y = z.yaw + (z.dawn ? Math.sin(z.ph * 3.1) * 0.25 : 0);
      z.attackT = Math.max(0, (z.attackT || 0) - dt);
      if (z.sink && z.dawn) { r.play('idle', 0.2); r.setRate(2.6); }
      else if (z.sink) r.play(r.has('fall') ? 'fall' : 'idle', 0.2);
      else if (z.attackT > 0 && r.has('attack')) r.play('attack', 0.12);
      else if (z.stun > 0 || z.rise < 0.85 || !st.on) { r.play('idle', 0.3); r.setRate(1); }
      else { const run = z.sp > 1.05 && r.has('run'); r.play(run ? 'run' : 'walk', 0.3); r.setRate(clamp(z.sp / (run ? r.speed.run : r.speed.walk), 0.45, 1.8)); }
      r.update(dt);
    }
    if (st.follow) for (const z of Z) if (performance.now() - (z.seen || 0) > 1500 && !z.sink) z.sink = 0.001; // gone from his stream
    if (NET && st.on && !st.follow) NET.stream(Z);
    for (const z of Z) if (z.sink >= (z.dawn ? 2.4 : 1.6)) freeRig(z);
    Z = Z.filter(z => z.sink < (z.dawn ? 2.4 : 1.6));
    // heartbeat when they get close
    if (st.on && nearest < 3.5 && audio.ctx) { st.beatT -= dt; if (st.beatT <= 0) { st.beatT = 0.35 + nearest * 0.18; audio.tone('sine', 62, 40, 0.12, 0.12 * (1 - nearest / 3.5), audio.room); audio.tone('sine', 58, 38, 0.1, 0.08 * (1 - nearest / 3.5), audio.room, 0.16); } }
    // instances
    let i = 0;
    for (const z of Z) {
      if (i >= MAX) break;
      if (z.rig) continue;
      const yOff = z.dawn ? -smooth((z.sink - 0.9) / 1.4) * 1.9 : (z.sink ? -smooth(z.sink / 1.5) * 1.9 : -(1 - smooth(z.rise)) * 1.9);
      const sway = z.dawn ? Math.sin(z.ph * 2.3) * 0.08 : Math.sin(z.ph * 0.5) * 0.07 + z.tilt * 0.3;
      e.set(z.dawn ? -0.22 : 0.12 + (z.stun > 0 ? -0.25 : 0), z.yaw + (z.dawn ? Math.sin(z.ph * 1.7) * 0.2 : 0), sway); q.setFromEuler(e);
      p0.set(z.pos.x, yOff, z.pos.z); mRoot.compose(p0, q, s1);
      meshes.body.setMatrixAt(i, mRoot); meshes.eyes.setMatrixAt(i, mRoot);
      mLoc.makeRotationX(z.dawn ? -0.72 + Math.sin(z.ph * 2.9) * 0.06 : -0.12 + Math.sin(z.ph * 0.9) * 0.1 + (z.stun > 0 ? -0.9 : 0)).setPosition(0, 1.42, 0); m4.multiplyMatrices(mRoot, mLoc); meshes.arms.setMatrixAt(i, m4);
      const sw = Math.sin(z.ph) * 0.38 * (z.rise > 0.85 && !z.sink ? 1 : 0.2);
      mLoc.makeRotationX(sw).setPosition(-0.1, 0.86, 0); m4.multiplyMatrices(mRoot, mLoc); meshes.legL.setMatrixAt(i, m4);
      mLoc.makeRotationX(-sw).setPosition(0.1, 0.86, 0); m4.multiplyMatrices(mRoot, mLoc); meshes.legR.setMatrixAt(i, m4);
      i++;
    }
    for (const k in meshes) { const im = meshes[k]; im.count = i; im.instanceMatrix.needsUpdate = true; }
  }
  // online (src/worldsync.js): join someone's zombata with his start time · his zombies' snapshot · a spray on one of mine
  function follow(t0, owner) {
    const man = M.man; if (st.on || !enabled() || !man || !outdoor(man.root.position) || !zombiesOut(nightAmount()) || !start(true)) return false;
    st.follow = owner; st.t0 = t0; st.t = Math.max(0, (NET.now() - t0) / 1000); return true;
  }
  function puppets(list) {
    if (!st.follow || !Array.isArray(list)) return;
    const now = performance.now();
    for (const a of list) {
      if (!Array.isArray(a)) continue;
      let z = Z.find(q => q.nid === a[0]);
      if (!z) { if (Z.length >= MAX || a[6]) continue; z = { nid: a[0], pos: V(a[1] / 100, 0, a[2] / 100), yaw: a[3] / 100, ph: rnd(0, 6), sp: 1, rise: 0, stun: 0, sink: 0, tilt: rnd(-0.15, 0.15), groan: rnd(1, 5), np: V() }; z.rig = takeRig(); Z.push(z); sfxRise(z); }
      if (!z.np) z.np = V();
      z.np.set(a[1] / 100, 0, a[2] / 100); z.ny = a[3] / 100; z.rise = Math.max(z.rise, a[4] / 10); z.stun = Math.max(z.stun, a[5] / 10); if (a[6] && !z.sink) z.sink = a[6] / 10; z.seen = now;
    }
  }
  function sprayed(id, from) { const z = Z.find(q => q.nid === id); if (!z || z.sink || !from) return; if (z.stun < 0.5) st.sprays++; z.stun = 1.6; const dx = from.x - z.pos.x, dz = from.z - z.pos.z, d = Math.hypot(dx, dz) || 1; z.pos.x -= dx / d * 0.25; z.pos.z -= dz / d * 0.25; }
  return { update, start, end, follow, puppets, sprayed, set net(v) { NET = v; }, get net() { return NET; }, get state() { return st; }, get list() { return Z; }, get active() { return st.on; }, get zombies() { return Z.length; }, debug: () => Z.map(z => ({ x: +z.pos.x.toFixed(2), z: +z.pos.z.toFixed(2), rig: !!z.rig, rise: +z.rise.toFixed(2) })), get model() { return !!ZM; } };
}
