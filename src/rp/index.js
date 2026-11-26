// rp/index.js — BIGALESSO roleplay (GTA-RP style) in the open world.
//   const rp = installRP({ scene, camera, ui, audio, level, S, man, npcs, input }); plugins.push(rp.plugin); // before createWorld
//   window.__preloadP = Promise.all([window.__preloadP, rp.preload()])   (templates + showroom before the gfx warm-up)
//   rp.update(dt)   every frame, after sport.update (after man.update: uniforms follow the bones)
// Jobs (rp/jobs.js): Rider, Barista al Celtic, Buttafuori al Millennium, Vigile — shifts, pay in Euro (window.__rpg.money),
// job XP and ranks Stagista → Titolare, tips, fails with consequences, uniforms. Phone apps: Lavori, Documenti (carta
// d'identità with a mugshot rendered on demand, soprannome, job, money, fedina, titles), Casa (buy furniture, place it at
// home: rp/house.js). Online (rp/social.js): /me /do /dado /lavoro in the chat, job title over your head for the others.
// Saved in localStorage 'bigalesso_rp' + 'bigalesso_rp_house' (the network layer syncs every bigalesso_* key).
// window.__rp = { start(job), end(), job (current shift or null), jobs (state), renderApp(app, el), house, transform(chat) }
import * as THREE from 'three';
import { JOBS, JOB_IDS, RANKS, rankOf, nextRankXp, FURNI, ACH } from './data.js';
import { loadRP, saveRP } from './state.js';
import { createRPUI, esc } from './ui.js';
import { buildGear, buildMarker, buildBoard, buildFallbackCar } from './gear.js';
import { createJobs } from './jobs.js';
import { createHouse } from './house.js';
import { createSocial } from './social.js';
import { loadOptional } from '../quartiere/models.js';
import { emitEvent } from '../ai.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const PI = Math.PI, FAR = V(1e5, 0, 1e5);
const BOARD = { x: 49.15, z: 31.2, ry: -PI / 2, stand: V(48.1, 0, 31.2) };

export function installRP({ scene, camera, ui, audio, level, S, man, npcs, input }) {
  const st = loadRP();
  const R = createRPUI();
  try { window.__save && window.__save.define && window.__save.define(ACH); } catch (e) { }
  const unlock = (id) => { try { const s = window.__save; s && s.unlock && s.unlock(id); } catch (e) { } };
  const toast = (m, k = '') => { try { ui.toast(m, k); } catch (e) { } };
  const sfx = (n, v = 1) => { try { audio.sfx(n, v); } catch (e) { } };
  const money = n => { try { window.__rpg && window.__rpg.money.add(n); } catch (e) { } };
  const spend = n => { try { return !!(window.__rpg && window.__rpg.money.spend(n)); } catch (e) { return false; } };
  const charge = n => { try { const m = window.__rpg && window.__rpg.money; if (!m) return; const have = m.get(); m.spend(Math.min(have, n)); } catch (e) { } };
  const cash = () => { try { return window.__rpg ? window.__rpg.money.get() : 0; } catch (e) { return 0; } };

  // ---------------------------------------------------------------- meshes (startup: preload + warm-up)
  const root = new THREE.Group(); root.name = 'rp'; scene.add(root);
  const G = buildGear(); for (const k in G) for (const p of Object.values(G[k])) root.add(p);
  const marker = buildMarker(); root.add(marker);
  const board = buildBoard(); board.position.set(BOARD.x, 0, BOARD.z); board.rotation.y = BOARD.ry; root.add(board);
  let car = buildFallbackCar(); car.visible = false; root.add(car);
  // board collider (level colliders are merged by explore at init: add a box now)
  try { if (level && Array.isArray(level.colliders)) level.colliders.push({ type: 'box', min: [BOARD.x - 0.12, BOARD.z - 0.68], max: [BOARD.x + 0.12, BOARD.z + 0.68] }); } catch (e) { }

  // fade to black for teleports
  const fadeEl = document.createElement('div'); fadeEl.style.cssText = 'position:fixed;inset:0;background:#000;z-index:8;opacity:0;pointer-events:none;transition:opacity .3s'; document.body.appendChild(fadeEl);
  function fade(cb) { fadeEl.style.opacity = '1'; setTimeout(() => { try { cb(); } catch (e) { console.error(e); } setTimeout(() => { fadeEl.style.opacity = '0'; }, 120); }, 320); }

  // ---------------------------------------------------------------- uniforms on the player
  let worn = null;
  function wear(kind) {
    for (const k in G) for (const p of Object.values(G[k])) p.visible = false;
    worn = kind && G[kind] ? G[kind] : null;
  }
  const _hp = V(), _q = new THREE.Quaternion(), _fw = V();
  function followGear() {
    if (!worn) return;
    const fp = !!(window.__combat && window.__combat.state && window.__combat.state.fp);
    const B = man.bones || {}, ry = W && W.yaw != null ? W.yaw : man.root.rotation.y;
    if (worn.head) {
      const h = worn.head;
      if (B.Head && !fp && man.root.visible !== false) {
        B.Head.getWorldPosition(_hp); B.Head.getWorldQuaternion(_q);
        h.position.copy(_hp).add(_fw.set(0, 1, 0).applyQuaternion(_q).multiplyScalar(0.135));
        h.rotation.set(0, 0, 0); h.quaternion.copy(_q);
        h.visible = true;
      } else h.visible = false;
    }
    if (worn.back) {
      const b = worn.back, sp = B.Spine2 || B.Spine1 || B.Spine;
      if (sp && !fp && man.root.visible !== false) {
        sp.getWorldPosition(_hp); _fw.set(Math.sin(ry), 0, Math.cos(ry));
        b.position.set(_hp.x - _fw.x * 0.27, _hp.y + 0.02, _hp.z - _fw.z * 0.27); b.rotation.set(0, ry + PI, 0); b.visible = true;
      } else b.visible = false;
    }
  }

  // ---------------------------------------------------------------- context shared by jobs / house / social
  let W = null, H = null;
  const X = {
    scene, camera, man, level, R, st, npcs: window.__npcs || npcs, marker, get car() { return car; },
    money, spend, charge, toast, sfx, unlock, fade, wear: k => { wear(k); },
    save: (now) => saveRP(st, now), event: (t, d) => { try { emitEvent(t, d); } catch (e) { } },
    fedina(what, euro) { st.fedina.unshift({ t: Date.now(), what, euro: euro | 0 }); if (st.fedina.length > 30) st.fedina.length = 30; unlock('rp_fedina'); saveRP(st); },
    rankName: id => RANKS[rankOf(st.jobs[id].xp)].name,
  };
  const jobs = createJobs(X); X.jobs = jobs;
  const house = createHouse(X);
  const social = createSocial(X);
  const startJob = id => { if (jobs.start(id)) { st.lastJob = id; saveRP(st); try { window.__phone && window.__phone.close && window.__phone.close(); } catch (e) { } return true; } return false; };

  async function preload() {
    try {
      const sc = await loadOptional('fiat500');
      if (sc) { const c = sc.clone(true); c.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); c.visible = false; root.remove(car); car = c; root.add(car); }
    } catch (e) { }
    await house.preload();
  }

  // combat damage spoils the rider's food
  let combatHooked = false;
  function hookCombat() { const c = window.__combat; if (!c || !c.on) return; combatHooked = true; try { c.on('damage', d => jobs.onDamage(d && (d.n || d.amount || d.dmg) || 10)); } catch (e) { } }

  // ---------------------------------------------------------------- mugshot (on demand, cached)
  let mug = { url: '', t: -1e9 };
  function mugshot() {
    const r = window.__renderer; if (!r || !man.bones || !man.bones.Head) return mug.url;
    if (performance.now() - mug.t < 20000 && mug.url) return mug.url;
    try {
      const w = 192, h = 240, rt = new THREE.WebGLRenderTarget(w, h, { colorSpace: THREE.SRGBColorSpace });
      rt.texture.colorSpace = THREE.SRGBColorSpace;
      const cam = new THREE.PerspectiveCamera(24, w / h, 0.05, 20);
      const hp = man.bones.Head.getWorldPosition(V()); const yaw = W ? W.yaw : man.root.rotation.y;
      cam.position.set(hp.x + Math.sin(yaw) * 1.25, hp.y + 0.06, hp.z + Math.cos(yaw) * 1.25); cam.lookAt(hp.x, hp.y + 0.02, hp.z);
      const prev = r.getRenderTarget(); r.setRenderTarget(rt); r.clear(); r.render(scene, cam); r.setRenderTarget(prev);
      const px = new Uint8Array(w * h * 4); r.readRenderTargetPixels(rt, 0, 0, w, h, px); rt.dispose();
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); const img = g.createImageData(w, h);
      for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
      g.putImageData(img, 0, 0);
      // height chart behind, like a real mugshot
      g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#9aa8b8'; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'source-over';
      g.fillStyle = 'rgba(255,255,255,.5)'; g.font = '10px system-ui'; for (let i = 0; i < 6; i++) g.fillRect(0, 30 + i * 36, 10, 1);
      mug = { url: c.toDataURL('image/jpeg', 0.85), t: performance.now() };
    } catch (e) { console.warn('mugshot', e); }
    return mug.url;
  }

  // ---------------------------------------------------------------- phone apps
  function renderJobs(el) {
    const J = jobs.J;
    el.innerHTML = (J ? `<div class="rp-job" style="--c:${JOBS[J.id].color}"><b>${JOBS[J.id].icon} Di turno: ${esc(JOBS[J.id].name)}</b><small>Fatti ${J.done}/${JOBS[J.id].tasks} · ${J.earned + J.tips}€ · errori ${J.fails}/3</small><button class="rp-b" data-end>Finisci il turno</button></div>` : `<p style="opacity:.75;margin:4px 0 10px">Scegli un lavoro: paga in euro, mance ed esperienza. Da stagista a titolare.</p>`) +
      JOB_IDS.map(id => {
        const d = JOBS[id], j = st.jobs[id], r = rankOf(j.xp), nx = nextRankXp(j.xp), base = RANKS[r].xp;
        const pct = nx ? Math.round((j.xp - base) / (nx - base) * 100) : 100;
        return `<div class="rp-job" style="--c:${d.color}"><b>${d.icon} ${esc(d.name)}</b><small>${esc(RANKS[r].name)} · ${j.shifts} turni · record ${j.best}€ · ${esc(d.place)}</small>
          <div class="bar"><i style="width:${pct}%"></i></div><small>${esc(d.desc)}</small>${J ? '' : `<button data-job="${id}">Inizia il turno</button>`}</div>`;
      }).join('');
    el.querySelectorAll('[data-job]').forEach(b => b.onclick = () => startJob(b.dataset.job));
    const e = el.querySelector('[data-end]'); if (e) e.onclick = () => { jobs.end('quit'); renderJobs(el); };
  }
  function renderDocs(el) {
    const J = jobs.J, lj = J ? J.id : st.lastJob, d = lj && JOBS[lj];
    const nick = st.nick || '—', name = (window.__net && window.__net.name) || 'Zuck';
    const rk = lj ? RANKS[rankOf(st.jobs[lj].xp)].name : '';
    const rpg = window.__rpg;
    const n = house.list.length;
    el.innerHTML = `<div class="rp-id"><h5>REPUBBLICA DI BOLOGNA · CARTA D'IDENTITÀ</h5><div class="ph" style="background-image:url('${mugshot()}')"></div><div>
        <div class="f"><i>Nome</i>${esc(name)}</div><div class="f"><i>Soprannome</i>${esc(nick)}</div>
        <div class="f"><i>Professione</i>${d ? esc(d.icon + ' ' + d.name + ' · ' + rk) : 'disoccupato di lusso'}</div>
        <div class="f"><i>Residenza</i>Via Teletubbylandia · ${n} mobili</div>
        <div class="f"><i>Patrimonio</i>${cash()}€${rpg ? ' · livello ' + rpg.level : ''}</div></div></div>
      <div class="rp-nick"><input maxlength="24" placeholder="Soprannome (es. il Marchese di Petroni)" value="${esc(st.nick)}"><button class="rp-b" style="width:auto;margin:0">Salva</button></div>
      <div class="rp-sec">Titoli</div><div class="rp-tags">${st.titles.length ? st.titles.map(t => `<span>🏅 ${esc(t)}</span>`).join('') : '<span style="opacity:.6">Diventa titolare di un lavoro per un titolo</span>'}</div>
      <div class="rp-sec">Fedina penale</div><div class="rp-fed">${st.fedina.length ? st.fedina.map(f => `<div><b>${esc(f.what)}</b><br><small>${new Date(f.t).toLocaleDateString('it-IT')} · ${f.euro ? f.euro + '€' : 'nessuna multa'}</small></div>`).join('') : '<div style="opacity:.7">Pulita. Per ora.</div>'}</div>
      <div class="rp-sec">Statistiche</div><div class="rp-tags"><span>🛵 ${st.stats.deliveries} consegne</span><span>🍺 ${st.stats.pints} birre</span><span>🕶️ ${st.stats.doors} alla porta</span><span>👮 ${st.stats.fines} multe</span><span>💶 ${st.stats.tips}€ di mance</span></div>`;
    const inp = el.querySelector('.rp-nick input');
    inp.addEventListener('keydown', e => e.stopPropagation(), true);
    el.querySelector('.rp-nick button').onclick = () => { st.nick = String(inp.value || '').trim().slice(0, 24); saveRP(st, true); social.publish(); toast('Soprannome salvato'); renderDocs(el); };
  }
  function renderCasa(el) {
    const m = cash();
    el.innerHTML = `<p style="opacity:.75;margin:4px 0 10px">Compra e mettili a casa (giardino, salotto, sala giochi): dopo l'acquisto <b>E</b> posa, <b>R</b> ruota, <b>X</b> annulla. Per spostare o vendere avvicinati al mobile.</p>
      <div class="rp-sec">Hai ${m}€ · ${house.list.length} mobili in casa</div>
      <div class="rp-shop">${FURNI.map(f => `<button data-f="${f.id}" ${m < f.price ? 'disabled' : ''}><span>${f.icon} ${esc(f.name)}</span><em>${f.price}€</em></button>`).join('')}</div>`;
    el.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { if (house.buy(b.dataset.f)) { try { window.__phone && window.__phone.close(); } catch (e) { } } else renderCasa(el); });
  }
  function renderApp(a, el) {
    if (!el) return;
    try { if (a === 'rpjobs') renderJobs(el); else if (a === 'rpdocs') renderDocs(el); else if (a === 'rpcasa') renderCasa(el); } catch (e) { console.warn('rp app', e); }
  }

  // ---------------------------------------------------------------- explore plugin
  const plugin = (ctx, w, h) => {
    W = w; H = h; jobs.attach(w, h); house.attach(w, h);
    const items = [
      ...jobs.items, ...house.items,
      { id: 'rp_board', range: 1.8, label: () => jobs.J ? `Di turno: ${JOBS[jobs.J.id].name}` : 'Bacheca: cercasi lavoratori', alt: () => jobs.J ? 'Finisci il turno' : null,
        anchor: () => BOARD.stand, top: () => V(BOARD.x, 1.9, BOARD.z),
        act: () => { try { window.__phone && window.__phone.open('rpjobs'); } catch (e) { } }, altAct: () => jobs.end('quit') },
    ];
    return { items, owns: jobs.owns, update: jobs.modeUpdate, camera: jobs.cameraPose };
  };

  // ---------------------------------------------------------------- per frame
  function update(dt) {
    if (dt <= 0 || !S || S.phase !== 'world') { if (!S || S.phase !== 'world') { R.setHud(null); R.waypoint(null); } return; }
    if (!combatHooked) hookCombat();
    jobs.update(dt);
    house.update(dt, input);
    followGear();
    social.update(dt);
  }

  const api = {
    start: startJob, end: r => jobs.end(r || 'quit'), get job() { return jobs.J; }, get jobs() { return st.jobs; }, get state() { return st; },
    renderApp, house, transform: t => social.transform(t), mugshot, rank: id => RANKS[rankOf(st.jobs[id].xp)].name,
  };
  window.__rp = api;
  return { plugin, update, preload, api, root };
}
