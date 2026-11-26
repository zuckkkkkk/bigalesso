// quartiere/life.js — street life from the Tripo models (assets/models): a cat walking along the walls, a
// neighbour's poodle walking the sidewalk (NOT the player's dog), pigeons pecking in the piazzetta / Via Petroni
// that flutter away when the player gets close. Capped by quality, off on Basso. Skinned copies via SkeletonUtils.
import * as THREE from 'three';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { loadOptional, loadManifest, clipsOf } from './models.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const PI = Math.PI;
const CAPS = { low: { cat: 0, poodle: 0, pigeon: 0 }, medium: { cat: 1, poodle: 1, pigeon: 3 }, high: { cat: 2, poodle: 1, pigeon: 6 }, ultra: { cat: 2, poodle: 1, pigeon: 6 } };
// ping-pong walks [from, to] (x,z) + speed
const WALKS = {
  cat: [{ a: [-34.5, 20.45], b: [-5.2, 20.45], sp: 0.42 }, { a: [-33, 33.25], b: [36, 33.25], sp: 0.45 }],
  poodle: [{ a: [16.8, 21.35], b: [38.8, 21.35], sp: 0.85 }],
};
const PIGEON_SPOTS = [[45.2, 27.4], [43.6, 26.6], [46.4, 26.1], [44.1, 55.2], [43.4, 57.0], [44.8, 58.6]];

function shadows(o, cast) { o.traverse(m => { if (m.isMesh) { m.castShadow = cast; m.receiveShadow = true; m.frustumCulled = false; } }); }
const findBone = (o, re) => { let b = null; o.traverse(n => { if (!b && n.isBone && re.test(n.name)) b = n; }); return b; };

export function createLife(root, { getQuality = () => 'high' } = {}) {
  const G = new THREE.Group(); G.name = 'streetLife'; G.userData.noBatch = true; root.add(G); // everything here moves: not for batch.js
  const S = { ready: false, walkers: [], pigeons: [], q: null, loading: false };

  async function load() {
    if (S.loading) return; S.loading = true;
    const list = await loadManifest(); if (!list.length) return;
    const [cat, poodle, pigeon] = await Promise.all(['cat', 'poodle', 'pigeon'].map(n => loadOptional(n).catch(() => null)));
    const mkWalker = (src, kind, w, idx) => {
      const o = skClone(src); shadows(o, true); G.add(o); try { window.__gfx && window.__gfx.addBlob && window.__gfx.addBlob(o, kind === 'cat' ? 0.22 : 0.3, 0.28); } catch (e) { }
      const clips = clipsOf(src); const mixer = new THREE.AnimationMixer(o);
      const clip = clips.find(c => /walk/i.test(c.name)) || clips[0]; const act = clip ? mixer.clipAction(clip) : null; if (act) { act.play(); act.time = idx * 0.37; }
      const u = idx * 0.43 % 1; o.position.set(w.a[0] + (w.b[0] - w.a[0]) * u, 0, w.a[1] + (w.b[1] - w.a[1]) * u);
      S.walkers.push({ o, kind, w, mixer, act, dir: idx % 2 ? -1 : 1, turn: 0, yaw: 0, pause: 0 });
    };
    if (cat) WALKS.cat.forEach((w, i) => mkWalker(cat, 'cat', w, i));
    if (poodle) WALKS.poodle.forEach((w, i) => mkWalker(poodle, 'poodle', w, i));
    if (pigeon) PIGEON_SPOTS.forEach(([x, z], i) => {
      const o = skClone(pigeon); shadows(o, false); G.add(o); o.position.set(x, 0, z); o.rotation.y = i * 2.1; try { window.__gfx && window.__gfx.addBlob && window.__gfx.addBlob(o, 0.1, 0.22); } catch (e) { }
      const neck = findBone(o, /Spine_1$/), head = findBone(o, /Head_0$/);
      S.pigeons.push({ o, home: V(x, 0, z), neck, head, n0: neck ? neck.quaternion.clone() : null, h0: head ? head.quaternion.clone() : null, st: 'idle', t: Math.random() * 5, hop: 0, vel: V(), k: 1, idx: i });
    });
    S.ready = true; applyQuality(true);
    try { window.__gfx && window.__gfx.warmup && window.__gfx.warmup(G); } catch (e) { }
  }

  function applyQuality(force) {
    const q = getQuality(); if (!force && q === S.q) return; S.q = q; const cap = CAPS[q] || CAPS.high;
    let nc = 0, np = 0, ng = 0;
    for (const w of S.walkers) { const on = w.kind === 'cat' ? nc++ < cap.cat : np++ < cap.poodle; w.on = on; w.o.visible = on; }
    for (const p of S.pigeons) { p.on = ng++ < cap.pigeon; p.o.visible = p.on && p.st !== 'gone'; }
    G.visible = cap.cat + cap.poodle + cap.pigeon > 0;
  }

  const tmp = V(), q = new THREE.Quaternion(), ax = V(1, 0, 0);
  function update(dt, t, player) {
    if (!S.ready) return; applyQuality(false); if (!G.visible) return;
    dt = Math.min(dt, 0.1);
    if (S.feed) { S.feed.t -= dt; if (S.feed.t <= 0) S.feed = null; } // crumbs thrown by the player (interact/index.js)
    for (const w of S.walkers) {
      if (!w.on) continue;
      const d = player ? Math.hypot(player.x - w.o.position.x, player.z - w.o.position.z) : 0;
      if (d > 70) continue; // far: frozen
      const a = w.w.a, b = w.w.b, len = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
      const tgtYaw = Math.atan2(ux * w.dir, uz * w.dir);
      if (w.pause > 0) { w.pause -= dt; if (w.act) w.act.timeScale = 0.15; }
      else {
        // step aside if the player is in the way (just slow down / wait)
        const close = player && d < 1.1; const sp = close ? 0 : w.w.sp;
        if (w.act) w.act.timeScale = close ? 0.1 : 1;
        w.o.position.x += ux * w.dir * sp * dt; w.o.position.z += uz * w.dir * sp * dt;
        const s = ((w.o.position.x - a[0]) * ux + (w.o.position.z - a[1]) * uz) / len;
        if ((s > 1 && w.dir > 0) || (s < 0 && w.dir < 0)) { w.dir *= -1; w.pause = 0.8 + Math.random() * 1.6; }
      }
      let dy = tgtYaw - w.o.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); w.o.rotation.y += dy * Math.min(1, dt * 4);
      // animation LOD: full rate on screen and near, ~8 Hz far, frozen when off screen (perf: window.__onScreen from skincull.js)
      w.macc = (w.macc || 0) + dt;
      if (d < 45 && (!window.__onScreen || window.__onScreen(w.o.position, 1.5)) && (d < 18 || w.macc > 0.12)) { w.mixer.update(w.macc); w.macc = 0; }
      else if (w.macc > 1) w.macc = 1;
    }
    for (const p of S.pigeons) {
      if (!p.on) continue;
      const d = player ? Math.hypot(player.x - p.o.position.x, player.z - p.o.position.z) : 99;
      p.t += dt;
      if (p.st === 'idle') {
        // peck / bob the head, little hops now and then
        const ph = p.t * 2.2 + p.idx; const peck = Math.max(0, Math.sin(ph * 1.7)) ** 6;
        if (p.neck && p.n0) { p.neck.quaternion.copy(p.n0).multiply(q.setFromAxisAngle(ax, peck * 0.7 + Math.sin(p.t * 9 + p.idx) * 0.06)); }
        if (p.head && p.h0) { p.head.quaternion.copy(p.h0).multiply(q.setFromAxisAngle(ax, peck * 0.4)); }
        const fd = S.feed && p.o.position.distanceTo(S.feed.pos) < 16; // crumbs: walk (hop) to them, no fear
        if (fd) { const fp = S.feed.pos; const tx = fp.x + Math.cos(p.idx * 2.4) * 0.35, tz = fp.z + Math.sin(p.idx * 2.4) * 0.35; p.o.rotation.y = Math.atan2(tx - p.o.position.x, tz - p.o.position.z); if (p.hop <= 0 && Math.hypot(tx - p.o.position.x, tz - p.o.position.z) > 0.3) p.hop = 0.35; }
        if (p.hop > 0) { p.hop -= dt; const k = 1 - p.hop / 0.35; p.o.position.y = Math.sin(k * PI) * 0.08; p.o.translateZ(dt * 0.9); if (p.hop <= 0) p.o.position.y = 0; }
        else if (Math.random() < dt * 0.25) { p.hop = 0.35; p.o.rotation.y += (Math.random() - 0.5) * 1.6; }
        if (!fd && p.o.position.distanceTo(p.home) > 1.6) p.o.rotation.y = Math.atan2(p.home.x - p.o.position.x, p.home.z - p.o.position.z);
        if (d < 2.6 && !fd) { // flutter away
          p.st = 'flee'; p.t = 0; const away = tmp.set(p.o.position.x - player.x, 0, p.o.position.z - player.z).normalize();
          p.vel.set(away.x * 2.6 + (Math.random() - 0.5), 2.4 + Math.random(), away.z * 2.6 + (Math.random() - 0.5)); p.o.rotation.y = Math.atan2(p.vel.x, p.vel.z);
        }
      } else if (p.st === 'flee') {
        p.o.position.addScaledVector(p.vel, dt); p.vel.y += dt * 0.8;
        p.o.rotation.z = Math.sin(p.t * 40) * 0.25; // wing beat wobble
        p.k = Math.max(0, 1 - p.t / 1.3); p.o.scale.setScalar(Math.max(0.001, p.k));
        if (p.t > 1.3) { p.st = 'gone'; p.t = 0; p.o.visible = false; }
      } else if (p.st === 'gone') {
        if ((p.t > 14 && d > 9) || (S.feed && p.t > 1.2)) { p.st = 'back'; p.t = 0; p.o.position.copy(p.home); p.o.rotation.set(0, Math.random() * 6, 0); p.o.visible = true; }
      } else if (p.st === 'back') {
        p.k = Math.min(1, p.t / 0.6); p.o.scale.setScalar(Math.max(0.001, p.k)); if (p.k >= 1) { p.st = 'idle'; p.t = 0; }
      }
    }
  }
  return { group: G, update, load, applyQuality, state: S };
}
