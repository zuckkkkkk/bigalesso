// motor/race.js — races in the quartiere (client side). The rules are shared/race.mjs, run through window.__match:
// locally for time trials / races against the friends, by the server for online races (it checks checkpoints and
// timing and ranks everybody). Here: checkpoint arches (one merged mesh per track, built at startup) + a light
// curtain on the next gate, start boards with an E prompt, the race menu, HUD (position, lap, time, countdown,
// arrow to the next gate, the friends' trash talk), bot / remote cars (pooled rigs), ghost of your best time trial.
import * as THREE from 'three';
import { TRACKS, trackGeom } from '../../shared/race.mjs';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const GHOST_KEY = 'bigalesso_motor_ghosts';
const BEST_KEY = 'bigalesso_motor_best';
const BOARDS = { portici: [-34.2, 31.3, Math.PI], rally: [-49.6, 32.6, Math.PI * 0.85], notturna: [-13.2, 58.2, Math.PI / 2] }; // start boards [x, z, facing]
const BOT_LOOKS = {
  forla: { paint: '#b3202a', livery: 1, livery2: '#ffffff', rims: 1, plate: 'FORLA 1' }, asche: { paint: '#1d4fd6', livery: 2, livery2: '#f2c230', rims: 2, plate: 'SOCCIA' },
  seghino: { paint: '#3fae3a', livery: 4, livery2: '#ff7a1a', rims: 0, plate: 'ZOMBATA' }, lombu: { paint: '#141418', livery: 3, livery2: '#ffffff', rims: 3, plate: 'ARRIVO' },
  parme: { paint: '#ff7a1a', livery: 1, livery2: '#141418', rims: 1, plate: 'GREVE' }, ashish: { paint: '#6a2fb8', livery: 2, livery2: '#c8f03c', rims: 2, plate: 'GODO' },
  cesco: { paint: '#f2c230', livery: 3, livery2: '#141418', rims: 2, plate: 'DAJE' }, ricky: { paint: '#ff6fa3', livery: 0, rims: 3, plate: 'CI STA' },
};
const TALK = {
  passMe: ['Ciao core, ci vediamo al traguardo', 'Spostati, nonno', 'Guidi come mia nonna col deambulatore', 'Bella la 500, peccato il pilota', 'Freccia a sinistra, coglione', 'Ma hai la patente o l\'hai vinta col Corriere?'],
  passed: ['Ma che cazzo fai?!', 'Questa era scorretta, porca troia', 'Ti ho lasciato passare per pietà', 'Soccia che sorpasso', 'Vabbè, mi distraevo'],
  win: ['Ok ok, hai vinto. Ma la macchina era truccata', 'Offro io lo spritz. Forse', 'Vittoria rubata, ricorso al Processo AI'],
  lose: ['Torna a guidare il carrello della Coop', 'Lento come la Telecom', 'La prossima volta ti diamo 10 secondi di vantaggio'],
  go: ['Pronti… VIA!', 'Daje!', 'A tavoletta!'],
};
const rnd = a => a[(Math.random() * a.length) | 0];
const fmt = t => { if (t === null || t === undefined || !isFinite(t)) return '—'; const m = Math.floor(t / 60), s = t - m * 60; return (m ? m + ':' + (s < 10 ? '0' : '') : '') + s.toFixed(2); };

const CSS = `
#mtRace{position:fixed;inset:0;pointer-events:none;z-index:6;font-family:var(--ui,system-ui);color:#fff;display:none}
#mtRace.on{display:block}
#mtRace .top{position:absolute;left:50%;top:max(14px,env(safe-area-inset-top));transform:translateX(-50%);display:flex;gap:10px;align-items:stretch}
#mtRace .box{background:rgba(14,6,34,.74);border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:7px 12px;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);text-align:center;min-width:64px}
#mtRace .box small{display:block;font:700 9px/1 var(--ui);letter-spacing:.22em;color:#bfaee0;text-transform:uppercase;margin-bottom:4px}
#mtRace .box b{font:400 26px/1 var(--gta,Impact,sans-serif);letter-spacing:.02em}
#mtRace .box b i{font-style:normal;font-size:15px;opacity:.7}
#mtRace .arrow{position:absolute;left:50%;top:calc(max(14px,env(safe-area-inset-top)) + 70px);width:44px;height:44px;margin-left:-22px;transition:opacity .3s}
#mtRace .arrow svg{width:100%;height:100%;filter:drop-shadow(0 2px 3px #000a)}
#mtRace .cd{position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);font:400 clamp(80px,14vw,170px)/1 var(--gta,Impact,sans-serif);color:#c8f03c;text-shadow:0 6px 30px #000c;opacity:0;transition:opacity .2s}
#mtRace .cd.on{opacity:1}
#mtRace .feed{position:absolute;right:max(16px,env(safe-area-inset-right));top:calc(max(14px,env(safe-area-inset-top)) + 64px);display:flex;flex-direction:column;gap:6px;align-items:flex-end;max-width:min(340px,46vw)}
#mtRace .feed div{background:rgba(14,6,34,.78);border-left:3px solid #c8f03c;border-radius:8px;padding:6px 10px;font:600 13px/1.3 var(--ui);animation:mtIn .25s ease-out}
#mtRace .feed div b{color:#c8f03c;font-weight:900;margin-right:4px}
#mtRace .tags span{position:absolute;transform:translate(-50%,-100%);font:800 11px/1 var(--ui);letter-spacing:.06em;padding:3px 6px;border-radius:6px;background:rgba(14,6,34,.7);white-space:nowrap}
@keyframes mtIn{from{opacity:0;transform:translateX(12px)}to{opacity:1;transform:none}}
#mtRaceMenu{position:fixed;inset:0;z-index:40;display:none;align-items:center;justify-content:flex-start;pointer-events:auto;
  background:linear-gradient(90deg,rgba(6,2,12,.95) 0,rgba(6,2,12,.82) 45%,rgba(6,2,12,.15) 100%);font-family:var(--ui,system-ui);color:#fff}
#mtRaceMenu.on{display:flex}
#mtRaceMenu .in{width:min(520px,92vw);padding:0 0 0 max(32px,6vw);box-sizing:border-box;max-height:100dvh;overflow-y:auto}
#mtRaceMenu h2{font:400 clamp(34px,5vw,58px)/.92 var(--gta,Impact,sans-serif);text-transform:uppercase;margin:0}
#mtRaceMenu p{margin:8px 0 14px;font:500 14px/1.45 var(--ui);color:#dcd2f0}
#mtRaceMenu .sec{margin:14px 0 6px;font:700 11px/1 var(--ui);letter-spacing:.28em;color:#9f8fc4;text-transform:uppercase}
#mtRaceMenu .chips{display:flex;gap:8px;flex-wrap:wrap}
#mtRaceMenu .chips button{padding:10px 14px;border-radius:11px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:#fff;font:800 13px/1 var(--ui);cursor:pointer}
#mtRaceMenu .chips button.sel{background:#c8f03c;color:#14082e;border-color:#c8f03c}
#mtRaceMenu .chips button:disabled{opacity:.4;cursor:default}
#mtRaceMenu .lb{font:600 13px/1.6 var(--ui);color:#efe8ff;min-height:20px}
#mtRaceMenu .lb ol{margin:0;padding-left:20px}
#mtRaceMenu .go{margin-top:18px;display:flex;gap:10px}
#mtRaceMenu .go button{padding:13px 22px;border-radius:12px;border:0;font:900 14px/1 var(--ui);letter-spacing:.14em;text-transform:uppercase;cursor:pointer;background:#c8f03c;color:#14082e}
#mtRaceMenu .go button.ghost{background:rgba(255,255,255,.1);color:#fff}
#mtRaceMenu .res td{padding:3px 10px 3px 0;font:600 14px/1.3 var(--ui)} #mtRaceMenu .res td:first-child{font:400 22px/1 var(--gta,Impact,sans-serif)}
#mtRaceMenu .res tr.me td{color:#c8f03c}
#mtRaceMenu .rew{margin-top:10px;font:800 14px/1.4 var(--ui);color:#ffd83a}
`;

export function createRace(ctx) {
  const { scene, factory, sound, toast, motor, camera, level } = ctx;
  const st = { session: null, view: null, track: null, G: null, mode: null, sendT: 0, lastGate: -1, ghostRec: null, ghostPlay: null, ghostT: 0, results: null,
    others: [], rigFor: new Map(), feedN: 0, prevRank: null, quitAsk: 0, menuTrack: null, sel: { mode: 'race', laps: 0, veh: '500' }, finishedShown: false, startT: 0, lastLeader: null };
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const hud = document.createElement('div'); hud.id = 'mtRace';
  hud.innerHTML = `<div class="top"><div class="box pos"><small>Posizione</small><b>—</b></div><div class="box lap"><small>Giro</small><b>—</b></div><div class="box tm"><small>Tempo</small><b>0.00</b></div><div class="box bs"><small>Record</small><b>—</b></div></div>
    <div class="arrow"><svg viewBox="0 0 40 40"><path d="M20 3 L35 30 L20 23 L5 30 Z" fill="#c8f03c" stroke="#14082e" stroke-width="2"/></svg></div><div class="cd"></div><div class="feed"></div><div class="tags"></div>`;
  document.body.appendChild(hud);
  const H = s => hud.querySelector(s);
  // per-frame HUD writes go through a cache (no DOM write unless the text changed) + a pool of name tags
  const hcache = new Map();
  const setHTML = (sel, html) => { if (hcache.get(sel) === html) return; hcache.set(sel, html); H(sel).innerHTML = html; };
  const setTxt = (sel, t) => { if (hcache.get(sel) === t) return; hcache.set(sel, t); H(sel).textContent = t; };
  const tagEls = [], tagTxt = [];
  const tagBox = () => H('.tags');
  function tagAt(i, x, y, text) {
    let el = tagEls[i]; if (!el) { el = tagEls[i] = document.createElement('span'); tagBox().appendChild(el); tagTxt[i] = ''; }
    if (tagTxt[i] !== text) { tagTxt[i] = text; el.textContent = text; }
    el.style.display = ''; el.style.left = x + 'px'; el.style.top = y + 'px';
  }
  function tagsHide(from) { for (let i = from; i < tagEls.length; i++) if (tagEls[i].style.display !== 'none') tagEls[i].style.display = 'none'; }
  const menu = document.createElement('div'); menu.id = 'mtRaceMenu'; document.body.appendChild(menu);

  // ---------------------------------------------------------------- arches (merged, one mesh per track) + next-gate curtain
  const archMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: true });
  const arches = {};
  for (const id of Object.keys(TRACKS)) {
    const G = trackGeom(id); const parts = [];
    G.gateSeg.forEach((g, gi) => {
      const lx = -g.dz, lz = g.dx, half = g.w / 2 + 0.7, start = gi === 0, fin = gi === G.gateSeg.length - 1 && !G.loop;
      const col = start || fin ? [1, 1, 1] : [0.78, 0.94, 0.24];
      for (const s of [-1, 1]) parts.push(box(g.x + lx * half * s, 1.6, g.z + lz * half * s, 0.2, 3.2, 0.2, g.yaw, [0.12, 0.12, 0.14]));
      parts.push(box(g.x, 3.2, g.z, half * 2 + 0.2, 0.32, 0.16, g.yaw, col));
      if (start || fin) parts.push(checker(g.x, 3.55, g.z, half * 2, 0.4, g.yaw));
    });
    const geo = merge(parts); const mesh = new THREE.Mesh(geo, archMat); mesh.name = 'motorArches-' + id; mesh.visible = false; mesh.castShadow = false; scene.add(mesh);
    arches[id] = { mesh, G };
  }
  const curtainTex = (() => { const c = document.createElement('canvas'); c.width = 8; c.height = 64; const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, 'rgba(200,240,60,0)'); g.addColorStop(0.7, 'rgba(200,240,60,0.35)'); g.addColorStop(1, 'rgba(200,240,60,0.75)'); x.fillStyle = g; x.fillRect(0, 0, 8, 64); return new THREE.CanvasTexture(c); })();
  const curtain = new THREE.Mesh(new THREE.PlaneGeometry(1, 3), new THREE.MeshBasicMaterial({ map: curtainTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false }));
  curtain.geometry.translate(0, 1.5, 0); curtain.visible = false; curtain.renderOrder = 4; curtain.name = 'motorCurtain'; scene.add(curtain);

  // ---------------------------------------------------------------- start boards
  const boardItems = [];
  const postMat = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.6, metalness: 0.4 });
  for (const [id, [x, z, ry]] of Object.entries(BOARDS)) {
    const T = TRACKS[id]; const tex = boardTex(T.name, T.kind === 'circuit' ? 'CIRCUITO · ' + T.laps + ' GIRI' : 'SPRINT');
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; g.name = 'motorBoard-' + id;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.0, 0.1).translate(0, 1.0, 0), postMat); g.add(post);
    const bm = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.6 });
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.8, 0.05).translate(0, 2.2, 0), [postMat, postMat, postMat, postMat, bm, postMat]); g.add(board);
    scene.add(g);
    const fx = Math.sin(ry), fz = Math.cos(ry);
    boardItems.push({ id, anchor: V(x + fx * 0.85, 0, z + fz * 0.85), top: V(x, 2.6, z) });
  }

  // ---------------------------------------------------------------- pooled rigs for bots / remote racers / ghost
  function otherRig(id, look) {
    let r = st.rigFor.get(id); if (r) return r;
    r = st.others.find(o => !o.used); if (!r) return null;
    r.used = true; r.rig.setLook(look); r.rig.show(true); st.rigFor.set(id, r.rig); r.id = id; return r.rig;
  }
  function freeRigs() { for (const o of st.others) { if (o.used) { o.used = false; o.rig.show(false); } } st.rigFor.clear(); }

  // ---------------------------------------------------------------- feed (trash talk)
  function feed(who, text) {
    const f = H('.feed'); const d = document.createElement('div'); d.innerHTML = `<b>${esc(who)}</b>${esc(text)}`; f.appendChild(d);
    while (f.children.length > 4) f.firstChild.remove();
    setTimeout(() => d.remove(), 5200);
  }

  // ---------------------------------------------------------------- menu
  function bestOf(id) { try { return (JSON.parse(localStorage.getItem(BEST_KEY) || '{}'))[id] ?? null; } catch (e) { return null; } }
  function setBest(id, t) { try { const b = JSON.parse(localStorage.getItem(BEST_KEY) || '{}'); b[id] = t; localStorage.setItem(BEST_KEY, JSON.stringify(b)); } catch (e) { } }
  const onlineOK = () => !!(window.__match && window.__match.transport && window.__net && (window.__net.connected ? window.__net.connected() : false));
  function openMenu(id) {
    if (st.session) return;
    const T = TRACKS[id]; if (!T) return;
    st.menuTrack = id; if (!st.sel.laps || T.kind !== 'circuit') st.sel.laps = T.laps;
    const best = bestOf(id);
    menu.innerHTML = `<div class="in"><h2>${esc(T.name)}</h2><p>${esc(T.desc)}<br><b>Tuo record:</b> ${fmt(best)}${loadGhost(id) ? ' · fantasma salvato' : ''}</p>
      <div class="sec">Modalità</div><div class="chips m"><button data-m="race">Contro gli amici</button><button data-m="time">Contro il tempo</button><button data-m="online" ${onlineOK() ? '' : 'disabled title="Serve la connessione al server"'}>Online</button></div>
      ${T.kind === 'circuit' ? `<div class="sec">Giri</div><div class="chips l">${[2, 3, 4, 5].map(n => `<button data-l="${n}">${n}</button>`).join('')}</div>` : ''}
      <div class="sec">Mezzo</div><div class="chips v"><button data-v="500">La tua 500</button><button data-v="vespa">Vespa</button></div>
      <div class="onl" hidden><div class="sec">Gare online aperte</div><div class="lobbies">…</div></div>
      <div class="sec">Classifica</div><div class="lb">…</div>
      <div class="go"><button class="start">Via!</button><button class="ghost close">Esci</button></div></div>`;
    let lobT = 0;
    const sync = () => {
      menu.querySelectorAll('[data-m]').forEach(b => b.classList.toggle('sel', b.dataset.m === st.sel.mode));
      const onl = st.sel.mode === 'online'; menu.querySelector('.onl').hidden = !onl; menu.querySelector('.start').textContent = onl ? 'Apri una gara online' : 'Via!';
      if (onl && performance.now() - lobT > 1500) { lobT = performance.now(); refreshLobbies(menu.querySelector('.lobbies')); }
      menu.querySelectorAll('[data-l]').forEach(b => b.classList.toggle('sel', +b.dataset.l === st.sel.laps));
      menu.querySelectorAll('[data-v]').forEach(b => b.classList.toggle('sel', b.dataset.v === st.sel.veh));
    };
    if (st.sel.mode === 'online' && !onlineOK()) st.sel.mode = 'race';
    sync(); menu.classList.add('on'); document.body.dataset.overlay = 'motor';
    menu.onclick = e => {
      const b = e.target.closest('button'); if (!b) return; sound.sfx('click');
      if (b.dataset.m) st.sel.mode = b.dataset.m; if (b.dataset.l) st.sel.laps = +b.dataset.l; if (b.dataset.v) st.sel.veh = b.dataset.v;
      if (b.dataset.join) { closeMenu(); join(b.dataset.join, st.sel.veh); return; }
      if (b.classList.contains('start')) { closeMenu(); start(id, st.sel.mode, st.sel.laps, st.sel.veh); return; }
      if (b.classList.contains('close')) { closeMenu(); return; }
      sync();
    };
    addEventListener('keydown', menuKey, true);
    // leaderboard (our server) or the local record
    const lb = menu.querySelector('.lb');
    const B = window.__board;
    if (B && B.top) B.top('race:' + id, 5).then(r => { if (!menu.classList.contains('on')) return; lb.innerHTML = r && r.top && r.top.length ? `<ol>${r.top.map(e => `<li>${esc(e.name)} · ${fmt(e.score)}${e.verified ? ' ✔' : ''}</li>`).join('')}</ol>` : 'Ancora nessun tempo: fai il primo.'; }).catch(() => { lb.textContent = 'Classifica non disponibile'; });
    else lb.textContent = 'Classifica online non disponibile qui.';
  }
  function menuKey(e) {
    if (!menu.classList.contains('on')) return;
    if (e.code === 'Escape' || e.code === 'KeyQ') { e.preventDefault(); e.stopImmediatePropagation(); if (st.lobby) { st.lobby = false; closeMenu(); stop(true); } else closeMenu(); }
    else if (e.code === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); const b = menu.querySelector('.start') || menu.querySelector('.begin'); b && !b.disabled && b.click(); }
  }
  function closeMenu() { menu.classList.remove('on'); menu.onclick = null; removeEventListener('keydown', menuKey, true); if (document.body.dataset.overlay === 'motor') delete document.body.dataset.overlay; }

  // ---------------------------------------------------------------- ghosts (best time trial, compact)
  function loadGhost(id) { try { const g = JSON.parse(localStorage.getItem(GHOST_KEY) || '{}')[id]; if (!g) return null; const b = atob(g.d); const a = new Int16Array(b.length / 2); for (let i = 0; i < a.length; i++) a[i] = b.charCodeAt(i * 2) | (b.charCodeAt(i * 2 + 1) << 8); return { t: g.t, hz: g.hz, a }; } catch (e) { return null; } }
  function saveGhost(id, rec, time) {
    try {
      const a = new Int16Array(rec.length); for (let i = 0; i < rec.length; i++) a[i] = rec[i];
      let s = ''; for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i] & 255, (a[i] >> 8) & 255);
      const all = JSON.parse(localStorage.getItem(GHOST_KEY) || '{}'); all[id] = { t: time, hz: 10, d: btoa(s) }; localStorage.setItem(GHOST_KEY, JSON.stringify(all));
    } catch (e) { }
  }

  // ---------------------------------------------------------------- start / stop
  // online: the race is a server lobby (public): others join it from their race menu / phone, the host starts it
  async function refreshLobbies(el) {
    if (!el) return; const M = window.__match;
    let list = []; try { list = M && M.lobby ? await M.lobby('race') : []; } catch (e) { list = []; }
    list = (list || []).filter(l => l.lobby && !l.mine);
    el.innerHTML = list.length ? list.slice(0, 5).map(l => `<button class="jn" data-join="${esc(l.id)}">Entra · gara di ${esc((l.players && l.players[0]) || '?')} · ${(l.players || []).length}/${l.max || 8}</button>`).join('')
      : 'Nessuna gara aperta: aprine una e chiama gli altri.';
  }
  async function join(matchId, veh) {
    if (st.session) return;
    const M = window.__match; if (!M || !M.join) { toast('Online non disponibile'); return; }
    let s = null; try { s = await M.join(matchId); } catch (e) { toast('Non riesco a entrare: ' + ((e && e.message) || 'gara chiusa')); return; }
    run(s, null, 'online', veh);
  }
  async function start(id, mode, laps, veh) {
    if (st.session) return;
    const M = window.__match; if (!M) { toast('Gare non disponibili'); return; }
    const opts = { track: id, laps, mode, bots: mode === 'race' ? 3 : mode === 'online' ? 2 : 0 };
    let s = null;
    try { s = await M.start('race', mode === 'online' ? { opts, online: true, wait: true, public: true } : { opts, online: false }); }
    catch (e) { if (mode === 'online') { toast('Online non disponibile adesso: si corre contro gli amici'); mode = 'race'; opts.mode = 'race'; opts.bots = 3; try { s = await M.start('race', { opts, online: false }); } catch (e2) { } } }
    if (!s) { toast('Non riesco a far partire la gara'); return; }
    run(s, id, mode, veh);
  }
  function lobbyPanel(s, id) {
    const T = id && TRACKS[id];
    const draw = list => {
      if (!st.lobby) return;
      menu.innerHTML = `<div class="in"><h2>Gara online</h2><p>${T ? esc(T.name) + ' · ' : ''}${s.host ? 'Hai aperto la gara: gli altri la trovano nel menu dei cartelli GARA (Online) o nel telefono → Motori.' : 'Sei dentro: si parte quando chi l\'ha aperta dà il via.'}</p>
        <div class="sec">Piloti</div><ol class="pl">${(list || []).map(p => `<li>${esc(p.name)}${p.bot ? ' (bot)' : ''}${p.online === false ? ' · disconnesso' : ''}</li>`).join('') || '<li>…</li>'}</ol>
        <div class="go">${s.host ? '<button class="begin">Partenza!</button>' : ''}<button class="ghost leave">Esci</button></div></div>`;
    };
    st.lobby = true; draw([{ name: (window.__net && window.__net.name) || 'Tu' }]);
    menu.classList.add('on'); document.body.dataset.overlay = 'motor'; addEventListener('keydown', menuKey, true);
    s.on('players', list => draw(list));
    menu.onclick = e => {
      const b = e.target.closest('button'); if (!b) return; sound.sfx('click');
      if (b.classList.contains('begin')) { try { s.begin(); } catch (err) { } b.disabled = true; b.textContent = 'Si parte…'; }
      if (b.classList.contains('leave')) { st.lobby = false; closeMenu(); stop(true); }
    };
    try { window.__net && window.__net.setExtra && s.host && window.__net.setExtra('race', { id: s.id, track: id }); } catch (e) { }
  }
  async function run(s, id, mode, veh) {
    st.session = s; st.mode = mode; st.lastGate = -1; st.results = null; st.finishedShown = false; st.prevRank = null; st.startT = performance.now();
    // first view: my grid slot (the rules place everybody); into the car there, frozen until the green light.
    // An online lobby has no view until the host starts it (or it closes).
    if (s.lobby) lobbyPanel(s, id);
    const first = await new Promise(res => {
      let done = false; s.on('view', v => { st.view = v; if (!done) { done = true; res(v); } });
      s.on('error', e => { if (e && e.fatal && !done) { done = true; res(null); } });
      if (!s.lobby) setTimeout(() => { if (!done) { done = true; res(null); } }, 4000);
    });
    if (st.lobby) { st.lobby = false; closeMenu(); }
    try { window.__net && window.__net.setExtra && window.__net.setExtra('race', null); } catch (e) { }
    if (st.session !== s) return; // left the lobby
    if (!id) id = first && first.track;
    if (!id || !TRACKS[id]) { toast('La gara non è partita'); stop(true); return; }
    const T = TRACKS[id];
    st.track = id; st.G = arches[id].G;
    st.ghostRec = mode === 'time' ? [] : null; st.ghostPlay = mode === 'time' ? loadGhost(id) : null; st.ghostT = 0;
    for (const a of Object.values(arches)) a.mesh.visible = false; arches[id].mesh.visible = true;
    hud.classList.add('on'); H('.feed').innerHTML = ''; H('.bs b').textContent = fmt(bestOf(id));
    const mine = first && first.players.find(p => p.id === s.me);
    const gx = mine ? mine.x : T.grid[0][0], gz = mine ? mine.z : T.grid[0][1];
    await motor.raceVehicle(veh, gx, gz, T.dir);
    motor.freeze(true); st.frozen = true;
    s.on('event', onEvent);
    s.on('over', r => finish(r));
    if (s.act) s.act({ k: 'ready' });
    try { window.__combat && window.__combat.setSpawning && window.__combat.setSpawning(false); } catch (e) { }
    window.dispatchEvent(new CustomEvent('bigalesso:minigame', { detail: { id: 'race', phase: 'start', track: id, mode } }));
  }
  function stop(quit) {
    const s = st.session; if (!s) return;
    if (quit && s.act) try { s.act({ k: 'quit' }); } catch (e) { }
    try { s.leave(); } catch (e) { }
    st.session = null; st.view = null; st.lobby = false; freeRigs();
    for (const a of Object.values(arches)) a.mesh.visible = false; curtain.visible = false;
    hud.classList.remove('on'); H('.cd').classList.remove('on'); tagsHide(0); hcache.clear();
    motor.freeze(false); st.frozen = false;
    try { window.__combat && window.__combat.setSpawning && window.__combat.setSpawning(true); } catch (e) { }
  }

  function onEvent(e) {
    const v = st.view, me = st.session && st.session.me;
    const who = id => { const p = v && v.players.find(q => q.id === id); return p ? p.name : 'Qualcuno'; };
    if (e.k === 'countdown') { H('.cd').textContent = '3'; H('.cd').classList.add('on'); sound.sfx('beep'); }
    else if (e.k === 'beep') { H('.cd').textContent = String(e.n); sound.sfx('beep'); }
    else if (e.k === 'go') { H('.cd').textContent = 'VIA!'; sound.sfx('go'); setTimeout(() => H('.cd').classList.remove('on'), 700); motor.freeze(false); const b = v && v.players.find(p => p.bot); if (b) feed(b.name, rnd(TALK.go)); }
    else if (e.k === 'cp' && e.id === me) sound.sfx('cp');
    else if (e.k === 'lap' && e.id === me) { sound.sfx('lap'); toast(`Giro ${e.lap}: ${fmt(e.time)}`); }
    else if (e.k === 'finish' && e.id === me) { sound.sfx('lap'); H('.cd').textContent = e.rank + '°'; H('.cd').classList.add('on'); setTimeout(() => H('.cd').classList.remove('on'), 1500); }
    else if (e.k === 'finish' && e.bot && e.rank === 1) feed(who(e.id), rnd(TALK.lose));
    else if (e.k === 'warn' && e.id === me && performance.now() - (st.respawnT || 0) > 1500) toast('Ehi, niente scorciatoie teletrasportate');
    else if (e.k === 'lead' && e.id !== me && st.prevRank === 1 && v) { const p = v.players.find(q => q.id === e.id); if (p && p.bot) feed(p.name, rnd(TALK.passMe)); }
    else if (e.k === 'lead' && e.id === me && v) { const b = v.players.filter(p => p.bot); if (b.length) feed(rnd(b).name, rnd(TALK.passed)); }
  }

  function finish(r) {
    const s = st.session; if (!s || st.finishedShown) return; st.finishedShown = true;
    const v = st.view || (s.game && s.game.view(s.me)); const me = s.me, T = TRACKS[st.track];
    const mine = r.ranks.find(x => x.id === me) || {}; const n = r.ranks.length;
    // rewards
    let eur = 0, xp = 20; const tm = mine.time;
    if (st.mode === 'time') { const old = bestOf(st.track); if (tm && (!old || tm < old)) { setBest(st.track, tm); eur = 40; xp = 80; if (st.ghostRec && st.ghostRec.length > 6) saveGhost(st.track, st.ghostRec, tm); } else if (tm) xp = 30; }
    else if (tm) { const rk = mine.rank; eur = st.mode === 'online' ? [100, 60, 35][rk - 1] || 15 : [60, 35, 20][rk - 1] || 10; xp = st.mode === 'online' ? [180, 120, 80][rk - 1] || 50 : [120, 80, 60][rk - 1] || 40; const old = bestOf(st.track); if (!old || tm < old) setBest(st.track, tm); }
    try { if (window.__rpg) { if (eur) window.__rpg.money.add(eur, 'gara'); window.__rpg.addXP(xp, 'gara: ' + T.name); } } catch (e) { }
    try { if (tm && window.__board && window.__board.submit) window.__board.submit('race:' + st.track, tm, { lower: true, mode: st.mode, laps: v && v.laps }); } catch (e) { }
    // achievements + events
    const U = (id, title, desc, icon) => { try { window.__save && window.__save.unlock && window.__save.unlock(id, { title, desc, icon, cat: 'Motori', group: 'Motori' }); } catch (e) { } };
    if (tm) U('motor_race_done', 'Prima gara', 'Arriva al traguardo di una gara.', '🏁');
    if (tm && st.mode === 'time') U('motor_tt', 'Contro il cronometro', 'Finisci una prova a tempo.', '⏱️');
    if (tm && st.mode !== 'time' && mine.rank === 1) U(st.mode === 'online' ? 'motor_online_win' : 'motor_race_win', st.mode === 'online' ? 'Re della strada' : 'Pilota del quartiere', st.mode === 'online' ? 'Vinci una gara online.' : 'Vinci una gara contro gli amici.', st.mode === 'online' ? '👑' : '🏆');
    if (tm && st.mode !== 'time' && mine.rank <= 3 && n >= 3) U('motor_podium', 'Sul podio', 'Arriva tra i primi tre.', '🥉');
    try { window.dispatchEvent(new CustomEvent('bigalesso:minigame', { detail: { id: 'race', phase: 'end', track: st.track, mode: st.mode, rank: mine.rank, time: tm, win: mine.rank === 1 } })); } catch (e) { }
    try { window.dispatchEvent(new CustomEvent('bigalesso:event', { detail: { type: 'race', text: tm ? `ha corso ${T.name}: ${mine.rank}° in ${fmt(tm)}` : `si è ritirato da ${T.name}`, rank: mine.rank } })); } catch (e) { }
    const g = ctx.garage && ctx.garage(); if (g) { g.stats.races++; if (mine.rank === 1 && st.mode !== 'time') g.stats.wins++; ctx.saveGarage && ctx.saveGarage(g); }
    if (st.mode !== 'time') { const bots = r.ranks.filter(x => x.bot); if (bots.length) { const b = bots[0]; feed(b.name, mine.rank === 1 ? rnd(TALK.win) : rnd(TALK.lose)); } }
    // results panel (after a beat)
    setTimeout(() => {
      menu.innerHTML = `<div class="in"><h2>${esc(T.name)}</h2><p>${esc(r.summary || '')}</p><table class="res">${r.ranks.map(x => `<tr class="${x.id === me ? 'me' : ''}"><td>${x.rank}°</td><td>${esc(x.name)}${x.bot ? '' : ''}</td><td>${fmt(x.time)}</td>${x.best ? `<td>giro ${fmt(x.best)}</td>` : ''}</tr>`).join('')}</table>
        <div class="rew">${tm ? `+${xp} XP${eur ? ` · +€ ${eur}` : ''}` : 'Ritirato'}${st.mode === 'time' && eur ? ' · nuovo record!' : ''}</div>
        <div class="go"><button class="again">Rivincita</button><button class="ghost close">Chiudi</button></div></div>`;
      menu.classList.add('on'); document.body.dataset.overlay = 'motor';
      const id = st.track, mode = st.mode, laps = v ? v.laps : T.laps, veh = motor.current() ? motor.current().kind : '500';
      menu.onclick = e => { const b = e.target.closest('button'); if (!b) return; sound.sfx('click'); closeMenu(); stop(false); if (b.classList.contains('again')) start(id, mode, laps, veh); };
      addEventListener('keydown', menuKey, true);
    }, 1400);
  }

  // ---------------------------------------------------------------- per frame
  const tmpV = V(), proj = V();
  const seenLob = new Set(); let watchT = 2;
  function watchLobbies() {
    const N = window.__net; if (!N || !N.players || !N.players.size || st.session) return;
    for (const [, P] of N.players) {
      const r = P.extra && P.extra.race; if (!r || !r.id || seenLob.has(r.id)) continue; seenLob.add(r.id);
      const T = TRACKS[r.track]; toast(`${P.name || 'Qualcuno'} ha aperto una gara online${T ? ': ' + T.name : ''} · telefono → Motori per entrare`);
    }
  }
  function update(dt) {
    watchT -= dt; if (watchT <= 0) { watchT = 3; try { watchLobbies(); } catch (e) { } }
    const s = st.session; if (!s) return;
    const v = st.view; if (!v) return;
    const me = v.me, car = motor.current();
    // send my state (10 Hz) while racing; on the grid the rules keep me frozen
    st.sendT -= dt;
    if (car && st.sendT <= 0 && s.act) { st.sendT = 0.1; s.act({ k: 'state', x: +car.x.toFixed(2), z: +car.z.toFixed(2), yaw: +car.yaw.toFixed(3), v: +Math.abs(car.speed).toFixed(2) }); if (st.ghostRec && v.phase === 'race' && !(me && me.done)) st.ghostRec.push(Math.round(car.x * 10), Math.round(car.z * 10), Math.round(car.yaw * 1000)); }
    // frozen while the view says grid/countdown, released on the change only: the 'go' event can arrive before the
    // first 'race' view, and freezing again on every stale countdown view left the car stuck after VIA!
    const fz = v.phase === 'grid' || v.phase === 'countdown';
    if (fz !== st.frozen) { st.frozen = fz; motor.freeze(fz); }
    // HUD
    if (me) {
      setHTML('.pos b', `${me.rank}<i>/${v.n}</i>`);
      setHTML('.lap b', TRACKS[v.track].kind === 'circuit' ? `${Math.min(v.laps, me.lap + (me.done ? 0 : 1))}<i>/${v.laps}</i>` : `${Math.max(0, me.gate)}<i>/${v.gates - 1}</i>`);
      setTxt('.lap small', TRACKS[v.track].kind === 'circuit' ? 'Giro' : 'Porte');
      setTxt('.tm b', me.done ? fmt(me.time) : fmt(v.race));
      st.prevRank = me.rank;
      // next gate: curtain + arrow
      const gi = me.done ? -1 : me.gate % st.G.gateSeg.length, gs = st.G.gateSeg[gi];
      if (gs && v.phase !== 'done') {
        curtain.visible = true; curtain.position.set(gs.x, 0, gs.z); curtain.rotation.set(0, gs.yaw, 0); curtain.scale.set(gs.w + 1.4, 1, 1);
        if (car) { const ang = Math.atan2(gs.x - car.x, gs.z - car.z); camera.getWorldDirection(tmpV); const camYaw = Math.atan2(tmpV.x, tmpV.z); const rel = ang - camYaw; const deg = Math.round(-rel * 180 / Math.PI); if (hcache.get('arrowDeg') !== deg) { hcache.set('arrowDeg', deg); H('.arrow').style.transform = `rotate(${deg}deg)`; } if (hcache.get('arrowOp') !== 1) { hcache.set('arrowOp', 1); H('.arrow').style.opacity = '1'; } }
      } else { curtain.visible = false; if (hcache.get('arrowOp') !== 0) { hcache.set('arrowOp', 0); H('.arrow').style.opacity = '0'; } }
    }
    // the others: bots + remote racers (not me), ghost
    let nt = 0; const W = innerWidth, Hh = innerHeight;
    for (const p of v.players) {
      if (p.id === s.me) continue;
      const look = p.bot ? (BOT_LOOKS[p.persona] || BOT_LOOKS.forla) : remoteLook(p.id);
      const rig = otherRig(p.id, look); if (!rig) continue;
      // smooth towards the authoritative position (views come at 15 Hz)
      const o = rig._p || (rig._p = { x: p.x, z: p.z, yaw: p.yaw, v: 0 });
      const k = 1 - Math.exp(-dt * 12); o.x += (p.x - o.x) * k; o.z += (p.z - o.z) * k; let dy = p.yaw - o.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI; o.yaw += dy * k;
      rig.pose(o.x, o.z, o.yaw, p.v, 0, dy * 4, dt);
      proj.set(o.x, 1.9, o.z).project(camera);
      if (proj.z < 1 && Math.abs(proj.x) < 1.1 && Math.abs(proj.y) < 1.1) tagAt(nt++, Math.round((proj.x + 1) / 2 * W), Math.round((1 - proj.y) / 2 * Hh), p.rank + '° ' + p.name);
    }
    if (st.ghostPlay && v.phase === 'race') {
      const gp = st.ghostPlay, i = Math.floor(v.race * gp.hz) * 3;
      const rig = otherRig('ghost', { paint: '#f4f1e8', livery: 0, neon: '#ffffff', plate: 'FANTASMA' });
      if (rig && i + 5 < gp.a.length) { const f = v.race * gp.hz % 1; const x = (gp.a[i] + (gp.a[i + 3] - gp.a[i]) * f) / 10, z = (gp.a[i + 1] + (gp.a[i + 4] - gp.a[i + 1]) * f) / 10, yaw = gp.a[i + 2] / 1000; rig.pose(x, z, yaw, 10, 0, 0, dt); }
      else if (rig) rig.show(false);
    }
    tagsHide(nt);
    // a race that never got a view for too long (server gone): bail out
    if (performance.now() - st.startT > 15 * 60 * 1000) stop(true);
  }
  function remoteLook(id) {
    const P = window.__net && window.__net.players && window.__net.players.get && window.__net.players.get(id);
    const e = P && P.extra && P.extra.veh; return (e && e.look) || { paint: '#8a8f96', plate: 'OSPITE' };
  }

  // reset to the last gate (stuck / wrong way)
  function respawn() {
    const v = st.view; if (!v || !v.me || v.phase !== 'race' || v.me.done) return false;
    const n = st.G.gateSeg.length, gi = ((v.me.gate - 1) % n + n) % n; const g = st.G.gateSeg[gi];
    st.respawnT = performance.now(); motor.place(g.x - g.dx * 2, g.z - g.dz * 2, g.yaw); toast('Rimesso in pista'); return true;
  }
  function quitAsk() {
    if (!st.session) return false;
    const now = performance.now(); if (now - st.quitAsk < 3000) { stop(true); toast('Ti sei ritirato'); return false; }
    st.quitAsk = now; toast('Premi di nuovo per ritirarti dalla gara'); return true;
  }

  return {
    update, openMenu, start, join, stop, respawn, quitAsk, boardItems, arches,
    async lobbies() { const M = window.__match; try { return ((M && M.lobby ? await M.lobby('race') : []) || []).filter(l => l.lobby && !l.mine); } catch (e) { return []; } },
    get active() { return !!st.session; }, get view() { return st.view; },
    init(rigs) { st.others = rigs.map(rig => ({ rig, used: false })); },
    menuOpen: () => menu.classList.contains('on'),
  };
}

// ------------------------------------------------------------------ geometry helpers (vertex-coloured boxes)
function box(x, y, z, w, h, d, yaw, col) {
  const g = new THREE.BoxGeometry(w, h, d); g.rotateY(yaw); g.translate(x, y, z);
  const n = g.attributes.position.count, c = new Float32Array(n * 3); for (let i = 0; i < n; i++) c.set(col, i * 3); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g.toNonIndexed();
}
function checker(x, y, z, w, h, yaw) {
  const parts = [], nx = Math.max(4, Math.round(w / 0.4)), cw = w / nx;
  for (let i = 0; i < nx; i++) for (let j = 0; j < 2; j++) {
    const col = (i + j) % 2 ? [0.06, 0.06, 0.07] : [1, 1, 1];
    const g = new THREE.BoxGeometry(cw, h / 2, 0.06); g.translate(-w / 2 + cw * (i + 0.5), (j - 0.5) * h / 2, 0); g.rotateY(yaw); g.translate(x, y, z);
    const n = g.attributes.position.count, c = new Float32Array(n * 3); for (let k = 0; k < n; k++) c.set(col, k * 3); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    parts.push(g.toNonIndexed());
  }
  return merge(parts);
}
function merge(geos) {
  const out = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'color']) {
    const size = geos[0].attributes[k].itemSize, n = geos.reduce((a, g) => a + g.attributes[k].count, 0), arr = new Float32Array(n * size);
    let o = 0; for (const g of geos) { arr.set(g.attributes[k].array, o); o += g.attributes[k].array.length; }
    out.setAttribute(k, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingSphere(); return out;
}
function boardTex(name, sub) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 160; const x = c.getContext('2d');
  x.fillStyle = '#14082e'; x.fillRect(0, 0, 256, 160);
  for (let i = 0; i < 16; i++) { x.fillStyle = i % 2 ? '#111' : '#f4f4f0'; x.fillRect(i * 16, 0, 16, 12); x.fillStyle = i % 2 ? '#f4f4f0' : '#111'; x.fillRect(i * 16, 12, 16, 12); }
  x.fillStyle = '#c8f03c'; x.font = '900 13px system-ui,sans-serif'; x.textAlign = 'center'; x.fillText('GARA · ' + sub, 128, 46);
  x.fillStyle = '#fff'; x.font = '400 30px Impact,"Arial Narrow",sans-serif'; const words = name.toUpperCase().split(' '); let line = '', y = 84;
  for (const w of words) { const t = line ? line + ' ' + w : w; if (x.measureText(t).width > 230 && line) { x.fillText(line, 128, y); line = w; y += 32; } else line = t; }
  x.fillText(line, 128, y);
  x.fillStyle = '#ffd83a'; x.font = '800 13px system-ui,sans-serif'; x.fillText('E PER CORRERE', 128, 150);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
