// br/index.js — "Ultimo in piedi a Bologna": the battle royale client. Rules + referee: shared/br.mjs, run through
// window.__match (online the server is the referee, offline the same rules run here with bots).
// Entry: the "Fermata del bus della BR" on Via Teletubbylandia (E) or the phone (Giochi → Battle royale) → lobby.
// Flow: lobby (countdown, Avvia/Esci) → drop (pick where to open the umbrella on the map, then the descent) → play
// (weapons from the loot, shrinking zone, others = avatars from the server views at 15 Hz) → out (spectate) → results.
// During a match: normal enemies are cleared and stop spawning, the RPG loadout is set aside (restored after).
// Controls: E raccogli · 1-3 / rotella arma · Q ombrellata · Tab mappa · (fuori) clic / E cambia chi guardi · Esc menu
// API: window.__br = { open(), state(), leave(), session }
import * as THREE from 'three';
import { Avatar, makeTemplate } from '../avatars.js';
import { weaponMesh } from '../combat/weapons.js';
import { BR_MAP } from '../../shared/br_map.mjs';
import { currentQuality } from '../scene.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const RCOL = { comune: '#d4d4d8', 'non comune': '#62d96f', raro: '#4aa8ff', epico: '#c27bff', leggendario: '#ffb52e' };
const WNAME = { pistola: 'Pistola ad acqua', tortellini: 'Lanciatortellini', nerf: 'Nerf blaster', spritz: 'Spritz-Bazooka', ombrello: 'Ombrello' };
const ICON = { pistola: '💧', tortellini: '🥟', nerf: '🎯', spritz: '🍹', ombrello: '☂️', brodo: '🍲', spritz_drink: '🥂', felpa: '🧥', piumino: '🧥', zona: '🌩️' };
const INAME = { brodo: 'Brodo della nonna', spritz_drink: 'Spritz', felpa: 'Felpa imbottita', piumino: 'Piumino tarocco' };
const STOP = { x: 15.6, z: 21.0, yaw: 0 }; // bus stop on the near sidewalk of Via Teletubbylandia, east of the garden gate (bins at x 8-10.4, gate 12.4-13.8, lamp 23)
const SIZE = { low: 8, medium: 10, high: 12, ultra: 16 };

export function installBR({ scene, camera, man, ui, audio, level, S, gltf, Man, anims, getWorld }) {
  const tpl = makeTemplate(gltf.scene); // bind pose: must run before the man's first update (like net.js / npcs.js)
  const st = { on: false, s: null, v: null, me: null, phase: 'off', prev: null, spec: null, specI: 0, fall: null, posT: 0, lastHp: 100, results: false, mapOpen: false, enteredAt: null, kills: 0, startedOnline: false };
  const W = () => getWorld && getWorld();
  const C = () => window.__combat;
  const toast = (m, c) => { try { ui.toast(m, c); } catch (e) { } };
  const sfx = (n, v) => { try { audio.sfx && audio.sfx(n, v); } catch (e) { } };

  // ---------------------------------------------------------------- meshes (built now: preload + warm-up cover them)
  const root = new THREE.Group(); root.name = 'br'; scene.add(root);
  // bus stop: pole, sign, shelter roof (cheap, vertex-free materials)
  const stopG = new THREE.Group(); stopG.name = 'br-stop'; stopG.position.set(STOP.x, 0, STOP.z); scene.add(stopG);
  {
    const metal = new THREE.MeshStandardMaterial({ color: 0x2c3a44, roughness: 0.5, metalness: 0.6 });
    const sign = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, map: signTex() });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 2.6, 10), metal); pole.position.y = 1.3; stopG.add(pole);
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.04), sign); s.position.set(0, 2.45, 0.03); stopG.add(s);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 1.0), metal); roof.position.set(1.1, 2.3, 0.45); stopG.add(roof);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.7, 0.03), new THREE.MeshStandardMaterial({ color: 0x9ad0ff, transparent: true, opacity: 0.28, roughness: 0.1, depthWrite: false })); glass.position.set(1.1, 1.3, -0.02); stopG.add(glass);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.38), new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.7 })); bench.position.set(1.1, 0.48, 0.2); stopG.add(bench);
    stopG.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }
  if (level && level.colliders) { level.colliders.push({ type: 'circle', c: [STOP.x, STOP.z], r: 0.12 }); level.colliders.push({ type: 'box', min: [STOP.x, STOP.z - 0.06], max: [STOP.x + 2.2, STOP.z + 0.4] }); } // glass + bench
  function signTex() {
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
    x.fillStyle = '#ffd21f'; x.fillRect(0, 0, 256, 256); x.fillStyle = '#1a1a1a'; x.fillRect(10, 10, 236, 236); x.fillStyle = '#ffd21f';
    x.font = '900 64px system-ui'; x.textAlign = 'center'; x.fillText('BR', 128, 110); x.font = '700 26px system-ui'; x.fillText('ULTIMO IN', 128, 160); x.fillText('PIEDI', 128, 194);
    x.font = '600 18px system-ui'; x.fillText('linea 🌩️ zona', 128, 230);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  // zone wall: open cylinder with a gradient shader (no lights, alpha clamped: no NaN in the bloom)
  const zoneMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    uniforms: { uTime: { value: 0 }, uCol: { value: new THREE.Color('#7a4cff') } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uTime; uniform vec3 uCol; varying vec2 vUv;
      void main(){ float y = clamp(vUv.y, 0.0, 1.0); float x = clamp(vUv.x, 0.0, 1.0);
        float bands = 0.5 + 0.5 * sin(x * 220.0 - uTime * 2.0 + y * 10.0);
        float a = (1.0 - y) * (0.22 + 0.16 * bands) + smoothstep(0.0, 0.04, y) * 0.0;
        gl_FragColor = vec4(uCol * (1.2 + 0.6 * bands), clamp(a, 0.0, 0.6)); }`,
  });
  const zoneMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 45, 96, 1, true), zoneMat); zoneMesh.position.y = 22.5; zoneMesh.visible = false; zoneMesh.frustumCulled = false; zoneMesh.name = 'br-zone'; root.add(zoneMesh);
  const nextMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const nextMesh = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 128), nextMat); nextMesh.rotation.x = -Math.PI / 2; nextMesh.position.y = 0.06; nextMesh.visible = false; nextMesh.frustumCulled = false; root.add(nextMesh);
  // loot pool: weapon models + consumables + rarity rings
  const LOOT_N = 48, lootPool = [];
  const ringGeo = new THREE.RingGeometry(0.26, 0.36, 24); ringGeo.rotateX(-Math.PI / 2);
  const ringMats = {}; for (const r in RCOL) ringMats[r] = new THREE.MeshBasicMaterial({ color: RCOL[r], transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false });
  ringMats.item = new THREE.MeshBasicMaterial({ color: '#7fe0ff', transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false });
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.1, 0.11, 14), new THREE.MeshStandardMaterial({ color: 0xf3e6c8, roughness: 0.4 }));
  const glassG = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.16, 12), new THREE.MeshStandardMaterial({ color: 0xff6a00, roughness: 0.2, transparent: true, opacity: 0.85 }));
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.32), new THREE.MeshStandardMaterial({ color: 0x3b5b8c, roughness: 0.8 }));
  const protos = { pistola: weaponMesh('pistola'), tortellini: weaponMesh('tortellini'), nerf: weaponMesh('nerf'), spritz: weaponMesh('spritz'), brodo: bowl, spritz_drink: glassG, felpa: vest, piumino: vest };
  for (let i = 0; i < LOOT_N; i++) {
    const g = new THREE.Group(); g.visible = false; g.name = 'br-loot';
    const ring = new THREE.Mesh(ringGeo, ringMats.comune); ring.position.y = 0.03; g.add(ring);
    const models = {}; for (const k in protos) { const m = protos[k].clone(); m.visible = false; m.position.y = 0.42; m.scale.setScalar(k in WNAME ? 1.6 : 1.3); g.add(m); models[k] = m; }
    root.add(g); lootPool.push({ g, ring, models, id: -1, key: '' });
  }
  // umbrella-parachute over the man during the descent
  const umb = new THREE.Group(); umb.visible = false; umb.name = 'br-umbrella';
  { const can = new THREE.Mesh(new THREE.ConeGeometry(1.15, 0.55, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0xe0457b, roughness: 0.6, side: THREE.DoubleSide })); can.position.y = 2.95; umb.add(can);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.3, 6), new THREE.MeshStandardMaterial({ color: 0x222222 })); stick.position.y = 2.25; umb.add(stick); }
  scene.add(umb);
  // other players / bots: avatar pool (built now, hidden)
  const AV_N = 15, avPool = [];
  for (let i = 0; i < AV_N; i++) { const a = new Avatar({ tpl, Man, anims, scene, name: 'Bot', color: i % 8 }); a.root.visible = false; a.root.name = 'br-avatar'; a.root.position.set(0, -50, 0); avPool.push({ a, id: null, last: null, alive: true, deadT: 0, k: 0 }); }
  const avById = new Map();

  // ---------------------------------------------------------------- DOM
  const css = document.createElement('style'); css.textContent = `
#br-ov{position:fixed;inset:0;z-index:40;display:none;place-items:center;background:radial-gradient(ellipse at center,rgba(20,8,40,.86),rgba(4,2,10,.95));color:#f4eefe;font:15px/1.4 system-ui,sans-serif}
#br-ov.on{display:grid}#br-ov .box{width:min(980px,94vw);max-height:92vh;overflow:auto;display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:18px}
#br-ov h1{margin:0 0 4px;font:900 clamp(26px,4vw,44px)/1 system-ui;letter-spacing:-.02em;text-transform:uppercase}#br-ov h1 em{color:#ffd21f;font-style:normal}
#br-ov .sub{opacity:.75;margin:0 0 12px}#br-ov canvas.map{width:auto;max-width:100%;max-height:68vh;display:block;border-radius:10px;background:#120a22;cursor:crosshair;border:1px solid #3a2a5a}
#br-ov .side{display:flex;flex-direction:column;gap:10px}#br-ov .pl{display:grid;grid-template-columns:1fr 1fr;gap:4px 10px;font-size:13px;max-height:260px;overflow:auto}
#br-ov .pl span{padding:3px 8px;border-radius:6px;background:rgba(255,255,255,.06);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#br-ov .pl span.me{background:rgba(255,210,31,.2)}
#br-ov .big{font:900 34px system-ui;color:#ffd21f}#br-ov .row{display:flex;gap:10px;flex-wrap:wrap}
#br-ov button{font:700 15px system-ui;padding:10px 18px;border-radius:10px;border:0;cursor:pointer;background:#ffd21f;color:#1a1020}#br-ov button.g{background:rgba(255,255,255,.1);color:#fff}
#br-ov .hint{font-size:13px;opacity:.7}#br-ov .res{grid-column:1/-1;text-align:center}#br-ov .res .pass{display:inline-block;margin:10px auto;padding:16px 26px;border-radius:14px;background:linear-gradient(135deg,#0f6b3a,#1a8f4c);border:2px dashed #ffd21f;font:800 20px system-ui}
#br-hud{position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:21;display:none;gap:8px;font:700 14px system-ui;color:#fff;pointer-events:none}
#br-hud.on{display:flex}#br-hud>div{background:rgba(12,6,24,.72);padding:6px 12px;border-radius:9px;border:1px solid rgba(255,255,255,.12);white-space:nowrap}
#br-hud .zone.warn{background:rgba(110,40,200,.85)}#br-feed{position:fixed;top:56px;right:12px;z-index:21;display:none;flex-direction:column;gap:4px;font:600 13px system-ui;color:#fff;pointer-events:none;align-items:flex-end}
#br-feed.on{display:flex}#br-feed div{background:rgba(12,6,24,.72);padding:4px 10px;border-radius:7px}#br-feed b{color:#ffd21f}#br-feed i{font-style:normal;opacity:.8}
#br-mini{position:fixed;top:56px;left:12px;z-index:21;display:none;width:150px;height:auto;border-radius:9px;background:rgba(12,6,24,.72);border:1px solid rgba(255,255,255,.15)}#br-mini.on{display:block}
#br-inv{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:21;display:none;gap:6px;pointer-events:none}#br-inv.on{display:flex}
#br-inv div{min-width:92px;padding:6px 10px;border-radius:9px;background:rgba(12,6,24,.78);border:2px solid #555;color:#fff;font:700 12px system-ui;text-align:center}#br-inv div.cur{transform:translateY(-4px);box-shadow:0 0 0 2px #fff}
#br-inv div small{display:block;font-weight:500;opacity:.8}#br-storm{position:fixed;inset:0;z-index:19;pointer-events:none;opacity:0;transition:opacity .4s;background:radial-gradient(ellipse at center,rgba(90,30,200,0) 35%,rgba(90,30,200,.45) 75%,rgba(40,10,120,.8) 100%)}
#br-banner{position:fixed;left:50%;top:30%;transform:translate(-50%,-50%);z-index:22;font:900 clamp(30px,5vw,60px)/1 system-ui;color:#fff;text-shadow:0 3px 18px #000;pointer-events:none;opacity:0;transition:opacity .3s;text-align:center;text-transform:uppercase}
#br-banner small{display:block;font:700 18px system-ui;color:#ffd21f;margin-top:8px;text-transform:none}
@media (max-width:700px){#br-ov .box{grid-template-columns:1fr}#br-mini{width:110px}}`;
  document.head.appendChild(css);
  const el = (tag, id, html = '') => { const e = document.createElement(tag); e.id = id; e.innerHTML = html; document.body.appendChild(e); return e; };
  const ov = el('div', 'br-ov'), hud = el('div', 'br-hud'), feedEl = el('div', 'br-feed'), mini = el('canvas', 'br-mini'), invEl = el('div', 'br-inv'), storm = el('div', 'br-storm'), banner = el('div', 'br-banner');
  mini.width = 300; mini.height = Math.round(300 * BR_MAP.h / BR_MAP.w); // same aspect as the grid
  const mapBg = (() => { const c = document.createElement('canvas'); c.width = BR_MAP.w; c.height = BR_MAP.h; const x = c.getContext('2d'); const im = x.createImageData(c.width, c.height);
    for (let j = 0; j < BR_MAP.h; j++) for (let i = 0; i < BR_MAP.w; i++) { const o = ((BR_MAP.h - 1 - j) * c.width + i) * 4, op = BR_MAP.rows[j].charCodeAt(i) === 49; im.data[o] = op ? 120 : 28; im.data[o + 1] = op ? 112 : 18; im.data[o + 2] = op ? 140 : 44; im.data[o + 3] = 255; }
    x.putImageData(im, 0, 0); return c; })();
  // map coords (world x,z → canvas px); +z up on the map
  const mapXY = (cv, x, z) => [(x - BR_MAP.x0) / BR_MAP.w * cv.width, (1 - (z - BR_MAP.z0) / BR_MAP.h) * cv.height];
  function drawMap(cv, v, big) {
    const x = cv.getContext('2d'); x.imageSmoothingEnabled = false; x.clearRect(0, 0, cv.width, cv.height); x.drawImage(mapBg, 0, 0, cv.width, cv.height);
    const sx = cv.width / BR_MAP.w; const Z = v && v.zone;
    const circle = (cx, cz, r, col, w, fill) => { const [px, pz] = mapXY(cv, cx, cz); x.beginPath(); x.arc(px, pz, r * sx, 0, Math.PI * 2); if (fill) { x.fillStyle = fill; x.fill(); } x.strokeStyle = col; x.lineWidth = w; x.stroke(); };
    if (v && v.phase !== 'play' && v.first) circle(v.first.cx, v.first.cz, v.first.r, '#7a4cff', 2);
    if (Z && v.phase === 'play') { circle(Z.cx, Z.cz, Z.r, '#9a6cff', big ? 3 : 2); circle(Z.ncx, Z.ncz, Z.nr, '#ffffff', 1.5); }
    if (v && v.players) for (const p of v.players) { if (!p.a) continue; const isMe = st.me && p.id === st.me; if (!isMe && v.phase === 'play') continue; /* no radar on the others while playing */ const [px, pz] = mapXY(cv, p.x, p.z); x.fillStyle = isMe ? '#ffd21f' : p.b ? '#ff5a6a' : '#5ab4ff'; x.beginPath(); x.arc(px, pz, isMe ? 4 * (big ? 1.4 : 1) : 3, 0, 6.3); x.fill(); }
    if (v && v.me && v.me.drop && v.phase !== 'play') { const [px, pz] = mapXY(cv, v.me.drop.x, v.me.drop.z); x.fillStyle = '#ffd21f'; x.font = `${big ? 22 : 14}px system-ui`; x.textAlign = 'center'; x.fillText('☂️', px, pz + 6); }
    if (v && v.phase === 'play' && v.me && !big) { const p = man.root.position; const [px, pz] = mapXY(cv, p.x, p.z); x.fillStyle = '#ffd21f'; x.beginPath(); x.arc(px, pz, 4, 0, 6.3); x.fill(); }
  }
  const banner_ = (t, sub = '', dur = 2.4) => { banner.innerHTML = t + (sub ? `<small>${sub}</small>` : ''); banner.style.opacity = 1; clearTimeout(banner_.t); banner_.t = setTimeout(() => { banner.style.opacity = 0; }, dur * 1000); };
  function feed(html) { const d = document.createElement('div'); d.innerHTML = html; feedEl.prepend(d); while (feedEl.children.length > 5) feedEl.lastChild.remove(); setTimeout(() => d.remove(), 9000); }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------------------------------------------------------------- overlay (lobby / drop map / results)
  let ovMode = '';
  function showOv(mode) {
    ovMode = mode; ov.classList.add('on'); document.body.dataset.overlay = 'br';
    try { document.exitPointerLock && document.exitPointerLock(); } catch (e) { }
    renderOv();
  }
  function hideOv() { ovMode = ''; ov.classList.remove('on'); if (document.body.dataset.overlay === 'br') delete document.body.dataset.overlay; }
  function renderOv() {
    const v = st.v;
    if (ovMode === 'lobby' || ovMode === 'drop') {
      const list = v ? v.players.map(p => `<span class="${p.id === st.me ? 'me' : ''}">${p.b ? '🤖' : '🧍'} ${esc(p.n)}</span>`).join('') : '';
      const isHost = v && v.host === st.me;
      const t = v ? Math.ceil(v.left) : 0;
      const drop = ovMode === 'drop';
      ov.innerHTML = `<div class="box"><div><h1>Ultimo in piedi <em>a Bologna</em></h1><p class="sub">${drop ? 'Clicca sulla mappa dove aprire l\'ombrello' : 'Battle royale nel quartiere: raccogli le armi, resta dentro la zona, sii l\'ultimo.'}</p>
        <canvas class="map" width="632" height="${Math.round(632 * BR_MAP.h / BR_MAP.w)}"></canvas><p class="hint">☂️ = dove atterri · viola = zona iniziale · ${st.s && st.s.online ? 'online: il server fa da arbitro' : 'offline: amici-bot'}</p></div>
        <div class="side"><div class="big">${drop ? 'Lancio tra ' + Math.max(0, Math.ceil((v ? v.left : 0) - 4.5)) + ' s' : 'Si parte tra ' + t + ' s'}</div>
        <div>${v ? v.players.length : 0} / ${v ? v.size : 0} in partita ${v && v.players.length < v.size ? '· il resto sono bot' : ''}</div><div class="pl">${list}</div>
        <div class="row">${!drop && (isHost || !(st.s && st.s.online)) ? '<button data-a="start">Parti adesso</button>' : ''}<button class="g" data-a="quit">Esci</button></div>
        <p class="hint">Comandi: E raccogli · 1-3 cambia arma · Q ombrellata · V visuale · Tab mappa</p></div></div>`;
      const cv = ov.querySelector('canvas.map'); drawMap(cv, v, true);
      cv.onclick = e => { const r = cv.getBoundingClientRect(); const px = (e.clientX - r.left) / r.width, pz = (e.clientY - r.top) / r.height; const x = BR_MAP.x0 + px * BR_MAP.w, z = BR_MAP.z0 + (1 - pz) * BR_MAP.h; const res = act({ drop: { x, z } }); if (res && res.ok === false) toast(res.error || 'Lì non si atterra'); else sfx('ui'); };
    } else if (ovMode === 'map') {
      ov.innerHTML = `<div class="box" style="grid-template-columns:1fr"><div><h1>Mappa</h1><canvas class="map" width="790" height="${Math.round(790 * BR_MAP.h / BR_MAP.w)}"></canvas><p class="hint">bianco = prossima zona · Tab per chiudere</p></div></div>`;
      drawMap(ov.querySelector('canvas.map'), v, true);
    } else if (ovMode === 'results') {
      const o = v && v.over, mePl = o && o.scores ? o.scores[st.me] : null, win = o && o.winners && o.winners[0] === st.me, kills = o && o.kills ? o.kills[st.me] || 0 : 0;
      ov.innerHTML = `<div class="box"><div class="res"><h1>${win ? 'Ultimo in piedi!' : 'Partita finita'}</h1><p class="sub">${esc(o ? o.summary : '')}</p>
        ${win ? '<div class="pass">🎟️ PASS DEL CELTIC<br><small>una birra offerta (virtuale) dal titolare</small></div>' : ''}
        <div class="big">${mePl ? mePl + '° posto' : ''}</div><p>${kills} eliminazioni · ${st.reward || ''}</p>
        <div class="row" style="justify-content:center"><button data-a="again">Un'altra</button><button class="g" data-a="quit">Torna al quartiere</button></div></div></div>`;
    }
  }
  ov.addEventListener('click', e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const a = b.dataset.a;
    if (a === 'start') act({ start: true });
    else if (a === 'quit') leave(true);
    else if (a === 'again') { leave(false); setTimeout(() => open(), 200); }
  });
  addEventListener('keydown', e => {
    if (!st.on) return;
    if (e.code === 'Escape' && (ovMode === 'map')) { e.preventDefault(); e.stopPropagation(); hideOv(); return; }
    if (e.code === 'Escape' && (ovMode === 'lobby' || ovMode === 'results') && st.phase !== 'play') { e.preventDefault(); e.stopPropagation(); leave(true); return; } // Esc leaves the lobby / results like the Esci button
    if (e.code === 'Tab' && !e.repeat && st.phase === 'play' && !(document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName))) { e.preventDefault(); if (ovMode === 'map') hideOv(); else if (!ovMode) showOv('map'); }
    if ((e.code === 'KeyE' || e.code === 'Space') && st.phase === 'spec') { e.preventDefault(); st.specI++; }
  }, true);
  ov.addEventListener('keydown', e => e.stopPropagation());

  // ---------------------------------------------------------------- session
  function act(a) { try { return st.s ? st.s.act(a) : { ok: false }; } catch (e) { return { ok: false, error: e.message }; } }
  async function open() {
    if (st.on) { showOv(st.phase === 'over' ? 'results' : 'lobby'); return true; }
    const w = W(); if (!w || S.phase !== 'world') { toast('Entra nel quartiere prima'); return false; }
    if (!window.__match) { toast('Battle royale non disponibile'); return false; }
    if (window.__gulagRun && window.__gulagRun.state().on) { toast('Prima esci dal Gulag profondo'); return false; }
    st.on = true; st.phase = 'lobby'; st.results = false; st.reward = '';
    st.prev = { pos: man.root.position.clone(), yaw: w.yaw };
    showOv('lobby');
    const net = window.__net;
    if (net && net.socket && !(net.connected && net.connected())) { try { await Promise.race([net.socket(), new Promise(r => setTimeout(r, 1500))]); } catch (e) { } } // server referee when reachable
    for (let i = 0; i < 10 && net && net.connected && net.connected() && !(net.games && net.games.length); i++) await new Promise(r => setTimeout(r, 100)); // hello reply lists the server's games
    const size = SIZE[currentQuality()] || 12;
    const on = !!(net && net.connected && net.connected() && net.games && net.games.includes('br')); // same test as __match.start('auto')
    try {
      st.s = await window.__match.start('br', { online: 'auto', opts: { size, online: on, fastZone: !on } });
    } catch (e) { console.warn('br start', e); toast('Non riesco a creare la partita'); st.on = false; hideOv(); return false; }
    st.me = st.s.me; st.startedOnline = !!st.s.online;
    st.s.on('view', v => onView(v));
    st.s.on('event', e => onEvent(e));
    st.s.on('over', r => { if (r && st.on && st.phase !== 'over' && st.phase !== 'off') { st.v = Object.assign({}, st.v || {}, { phase: 'over', over: r }); finishMatch(st.v); } }); // server may stop the views at the end
    st.s.on('error', e => { if (e && e.error && st.phase === 'play' && !/troppo veloce|bersaglio|muro|portata/.test(e.error)) toast(e.error); });
    if (!st.s.online) { act({ drop: randomDropNear(st.prev.pos) }); if (on) act({ start: true }); } // fell back to local: no lobby wait
    return true;
  }
  function randomDropNear(p) { return { x: clamp(p.x, BR_MAP.x0 + 2, BR_MAP.x0 + BR_MAP.w - 2), z: clamp(Math.max(p.z, 21), 1, BR_MAP.h - 2) }; }
  function enterMatch() { // lobby → drop: set the world aside
    const c = C(); const r = window.__rpg;
    st.saved = { loadout: c ? c.loadout() : null, slot: c ? c.slot : 0, maxHp: c ? c.player.maxHp : 100, hp: c ? c.player.hp : 100, spawning: true };
    if (c) { c.setEnabled(false); c.setEnabled(true); c.setSpawning(false); c.setLoadout([null, null, null, null], 0); c.player.maxHp = 100; c.player.hp = 100; c.player.dead = false; c.setTargets(targetList, onTargetHit); }
    void r;
    st.equipOff = c && c.on ? c.on('equip', d => { if (st.phase === 'play' && d && d.slot >= 0 && d.slot < 3) act({ slot: d.slot }); }) : null;
    st.fireOff = c && c.on ? c.on('fire', d => { if (st.phase !== 'play') return; const p = man.root.position, w = W(); act({ fire: { base: d.base, x: p.x + Math.sin(w.yaw) * 12, z: p.z + Math.cos(w.yaw) * 12 } }); }) : null;
  }
  function exitMatch() {
    const c = C();
    if (c && st.saved) { c.setTargets(null, null); c.setEnabled(false); c.setEnabled(true); c.setSpawning(true); c.setLoadout(st.saved.loadout || [null, null, null, null], st.saved.slot); c.player.maxHp = st.saved.maxHp; c.player.hp = Math.max(1, st.saved.hp); c.player.dead = false; }
    if (st.equipOff) st.equipOff(); if (st.fireOff) st.fireOff(); st.equipOff = st.fireOff = null; st.saved = null;
  }
  function leave(back = true) {
    if (!st.on) return;
    try { if (st.s) { if (st.phase === 'play' && st.v && st.v.me && st.v.me.alive) act({ leave: true }); st.s.leave(); } } catch (e) { }
    const w = W(), wasIn = st.phase !== 'lobby' && st.phase !== 'off';
    if (wasIn) exitMatch();
    st.on = false; st.s = null; st.v = null; st.phase = 'off'; hideOv();
    hud.classList.remove('on'); feedEl.classList.remove('on'); mini.classList.remove('on'); invEl.classList.remove('on'); storm.style.opacity = 0; zoneMesh.visible = nextMesh.visible = false; umb.visible = false;
    for (const L of lootPool) { L.g.visible = false; L.id = -1; } for (const A of avPool) { A.a.root.visible = false; A.id = null; } avById.clear();
    man.model.visible = true; man.root.position.y = 0;
    if (w) { if (w.mode && w.mode.startsWith('br_')) w.setMode('explore'); if (back && wasIn) { man.root.position.set(STOP.x + 1.1, 0, STOP.z + 1.3); w.yaw = 0; w.camYaw = Math.PI; } }
  }

  // ---------------------------------------------------------------- server views → world
  const targets = []; // reused list for combat.setTargets: [{ id, x, y, z }]
  function targetList() { return targets; }
  function onTargetHit(h) { if (st.phase !== 'play') return; act({ hit: { target: h.id, base: h.base, head: !!h.head, splash: !!h.splash, k: h.k || 1 } }); }
  function onView(v) {
    const prevPhase = st.v ? st.v.phase : null; st.v = v;
    if (v.phase === 'lobby') { st.phase = 'lobby'; if (ovMode === 'lobby') renderOvThrottled(); return; }
    if (v.phase === 'drop') {
      if (prevPhase !== 'drop') { st.phase = 'drop'; enterMatch(); showOv('drop'); sfx('start'); }
      if (v.t >= 7 && !st.fall) startFall(v);
      else if (ovMode === 'drop') renderOvThrottled();
      return;
    }
    if (v.phase === 'play') {
      if (prevPhase !== 'play') beginPlay(v);
      st.vt = performance.now();
      if (st.phase === 'play' || st.phase === 'spec') applyPlay(v);
      return;
    }
    if (v.phase === 'over' && st.phase !== 'over') finishMatch(v);
  }
  let ovT = 0; function renderOvThrottled() { const t = performance.now(); if (t - ovT > 250) { ovT = t; renderOv(); } }
  function startFall(v) {
    hideOv();
    const d = (v.me && v.me.drop) || { x: 13, z: 25 }, w = W();
    st.fall = { t: 0, dur: 4.3, to: V(d.x, 0, d.z), from: V(d.x - 6, 32, d.z - 10) };
    man.root.position.copy(st.fall.from); if (w) { w.setMode('br_drop'); w.yaw = Math.atan2(d.x - st.fall.from.x, d.z - st.fall.from.z); }
    umb.visible = true; banner_('Lancio!', 'apri l\'ombrello e scendi sul quartiere', 2.2); sfx('whoosh');
  }
  function beginPlay(v) {
    const w = W(); st.phase = 'play'; st.fall = null; umb.visible = false; hideOv();
    const me = v.me; if (me && me.landed) { man.root.position.set(me.x, 0, me.z); }
    if (w) { w.setMode('explore'); w.vel && w.vel.set(0, 0, 0); }
    hud.classList.add('on'); feedEl.classList.add('on'); mini.classList.add('on'); invEl.classList.add('on'); zoneMesh.visible = true; nextMesh.visible = true;
    banner_('Ultimo in piedi', `${v.alive} in gioco · trova un'arma`, 2.6);
    try { window.__save && window.__save.unlock('br_play', { title: 'Biglietto per la BR', desc: 'Hai giocato una battle royale nel quartiere', icon: '🚌' }); } catch (e) { }
  }
  const _o = V(), _t = V();
  function applyPlay(v) {
    const me = v.me, c = C();
    // targets (others alive) for combat ray casts
    targets.length = 0;
    for (const p of v.players) {
      if (p.id === st.me) continue;
      let A = avById.get(p.id);
      if (!A) { A = avPool.find(x => !x.id); if (!A) continue; A.id = p.id; avById.set(p.id, A); A.a.setName(p.n, p.c); A.a.buf.length = 0; A.a.place(p.x, p.z, p.y); A.a.root.visible = true; A.alive = true; A.deadT = 0; A.sp = 0; if (A.pv) A.pv.t = 0; A.a.root.scale.setScalar(1); }
      A.last = p;
      if (p.a) { const tn = performance.now(), pv = A.pv; let sp = 0; if (pv && pv.t > 0 && tn > pv.t) sp = Math.min(9, Math.hypot(p.x - pv.x, p.z - pv.z) / ((tn - pv.t) / 1000)); const q = A.pv || (A.pv = { x: 0, z: 0, t: 0 }); q.x = p.x; q.z = p.z; q.t = tn; A.sp = (A.sp || 0) * 0.6 + sp * 0.4; A.a.push(tn, { x: p.x, z: p.z, yw: p.y, sp: A.sp < 0.25 ? 0 : A.sp, n: p.n }); targets.push(A.t || (A.t = { id: p.id, x: 0, y: 0, z: 0 })); A.t.x = A.a.root.position.x; A.t.z = A.a.root.position.z; A.t.id = p.id; }
      else if (A.alive) { A.alive = false; A.deadT = 0; }
    }
    // me
    if (me) {
      if (c) { const hp = me.hp, mx = c.player.maxHp || 100; if (hp < st.lastHp - 0.5) c.hurtFx && c.hurtFx((st.lastHp - hp) / 100); c.player.hp = Math.max(me.alive ? 1 : 0, hp / 100 * mx); st.lastHp = hp; }
      // weapons from the server bag → combat loadout (slots 0..2)
      const key = me.inv.map(w => w ? w.base + ':' + w.rarity : '-').join(',');
      if (c && key !== st.invKey) {
        const lo = c.loadout(), next = [0, 1, 2].map(i => { const w = me.inv[i]; if (!w) return null; const old = lo[i]; if (old && old.base === w.base && old.rarity === w.rarity) return old; const it = c.weapons.make(w.base, { rarity: w.rarity, level: 1, name: WNAME[w.base] + (w.rarity !== 'comune' ? ' ' + w.rarity : '') }); it.starter = true; return it; }).concat([null]); // starter: infinite reserve (rpg ammo)
        const had = st.invKey ? st.invKey.split(',').filter(x => x !== '-').length : 0; st.invKey = key;
        c.setLoadout(next, me.slot); if (next.filter(Boolean).length > had) { try { c.equip(me.slot); } catch (e) { } }
        renderInv(me);
      } else if (st.slotShown !== me.slot) renderInv(me);
      if (!me.alive && st.phase === 'play') goSpectate(v);
    }
    // zone
    const Z = v.zone; zoneMesh.scale.set(Math.max(0.5, Z.r), 1, Math.max(0.5, Z.r)); zoneMesh.position.x = Z.cx; zoneMesh.position.z = Z.cz;
    nextMesh.scale.set(Math.max(0.5, Z.nr), Math.max(0.5, Z.nr), 1); nextMesh.position.x = Z.ncx; nextMesh.position.z = Z.ncz;
    const mp = man.root.position, out = Math.hypot(mp.x - Z.cx, mp.z - Z.cz) > Z.r;
    storm.style.opacity = st.phase === 'play' && out ? 1 : 0;
    const hh = `<div>🧍 ${v.alive} in piedi</div><div>💀 ${me ? me.kills : 0}</div><div>🧥 ${me ? me.armor : 0}</div><div class="zone ${out ? 'warn' : ''}">${Z.shrinking ? '🌩️ la zona si stringe: ' : '⏳ zona tra '}${Math.ceil(Z.tl)} s${out ? ' · SEI FUORI' : ''}</div>`;
    if (hh !== st.hudHtml || (st.phase === 'spec' && !hud.querySelector('.spec'))) { st.hudHtml = hh; hud.innerHTML = hh; }
    // loot near me
    let i = 0;
    for (const l of v.loot) {
      if (i >= LOOT_N) break; const L = lootPool[i++];
      const key = l.id + ':' + l.base; if (L.key !== key) {
        L.key = key; L.id = l.id; L.l = l; for (const k in L.models) L.models[k].visible = k === l.base;
        L.ring.material = l.kind === 'weapon' ? ringMats[l.r] || ringMats.comune : ringMats.item; L.g.position.set(l.x, 0, l.z); L.g.visible = true;
      }
    }
    for (; i < LOOT_N; i++) { const L = lootPool[i]; if (L.g.visible) { L.g.visible = false; L.id = -1; L.key = ''; } }
    if (performance.now() - (st.miniT || 0) > 200) { st.miniT = performance.now(); drawMap(mini, v, false); }
  }
  function renderInv(me) {
    st.slotShown = me.slot;
    invEl.innerHTML = [0, 1, 2].map(i => { const w = me.inv[i]; return `<div class="${i === me.slot && w ? 'cur' : ''}" style="border-color:${w ? RCOL[w.rarity] : '#444'}">${i + 1} ${w ? ICON[w.base] + ' ' + WNAME[w.base] : '—'}<small>${w ? w.rarity : 'vuoto'}</small></div>`; }).join('') + `<div style="border-color:#888">Q ☂️ Ombrello<small>sempre</small></div>`;
  }
  function onEvent(e) {
    if (!st.on) return;
    const c = C();
    if (e.k === 'shot' && e.from !== st.me) {
      const A = avById.get(e.from); if (!A || !c || !c.fxShot) return;
      _o.copy(A.a.root.position); _o.y = 1.35;
      const T = e.to === st.me ? man.root.position : e.to ? (avById.get(e.to) || {}).a && avById.get(e.to).a.root.position : null;
      _t.set(T ? T.x : e.x, 1.1, T ? T.z : e.z); if (!e.hit) { _t.x += (Math.random() - 0.5) * 1.2; _t.z += (Math.random() - 0.5) * 1.2; }
      c.fxShot(e.base, _o.clone(), _t.clone());
      A.a.root.rotation.y = Math.atan2(_t.x - _o.x, _t.z - _o.z);
    } else if (e.k === 'hit' && e.target !== st.me && e.by === st.me) {
      // my hit confirmed by the referee: damage number over the target
      const A = avById.get(e.target); const h = c && c._debug && c._debug.hud; if (A && h && h.num) h.num(A.a.root.position.clone().add(V(0, 2.1, 0)), e.amount, { crit: e.head });
    } else if (e.k === 'elim') {
      const meK = e.kid === st.me, meV = e.vid === st.me;
      feed(e.killer ? `<b>${esc(e.killer)}</b> <i>${ICON[e.base] || '💥'}</i> ${esc(e.victim)}` : `${esc(e.victim)} <i>${e.base === 'zona' ? '🌩️ zona' : '🏳️'}</i>`);
      const A = avById.get(e.vid); if (A) { const fx = c && c._debug && c._debug.fx; if (fx) { const p = A.a.root.position.clone().add(V(0, 0.9, 0)); fx.burst(p, '#f4f0ff', 12, { size: 0.6, speed: 1.6, life: 0.8, up: 0.8 }); fx.stars(p.add(V(0, 0.5, 0)), 5); } }
      if (meK) { st.kills++; banner_('Eliminato!', esc(e.victim), 1.6); sfx('kill'); if (st.kills === 3) try { window.__save && window.__save.unlock('br_kill3', { title: 'Tris al Celtic', desc: '3 eliminazioni in una battle royale', icon: '🎯' }); } catch (x) { } }
      if (meV) { banner_('Sei fuori', `${e.place}° posto${e.killer ? ' · ti ha fatto nero ' + esc(e.killer) : ''}`, 3); sfx('ko'); }
    } else if (e.k === 'zone' && e.shrinking) { banner_('La zona si stringe', 'torna dentro il cerchio bianco', 2); sfx('whistle'); }
    else if (e.k === 'pickup' && e.by === st.me) { sfx('equip'); toast(`${ICON[e.base] || '📦'} ${e.kind === 'weapon' ? WNAME[e.base] + ' ' + e.rarity : INAME[e.base] || e.base}`, e.kind === 'weapon' ? '' : 'gold'); }
  }
  function goSpectate(v) {
    st.phase = 'spec'; const w = W(); if (w) w.setMode('br_spec');
    man.model.visible = false; invEl.classList.remove('on'); storm.style.opacity = 0;
    const c = C(); if (c) c.holster();
    void v;
  }
  function finishMatch(v) {
    st.phase = 'over';
    const o = v.over || {}, win = o.winners && o.winners[0] === st.me, place = o.scores ? o.scores[st.me] : null, kills = o.kills ? o.kills[st.me] || 0 : 0;
    const R = window.__rpg; const xp = 40 + kills * 20 + (win ? 300 : 0) + Math.max(0, (v.size - (place || v.size)) * 6), euro = win ? 60 : kills * 4;
    try { if (R) { R.addXP && R.addXP(xp, 'battle royale'); euro && R.money && R.money.add && R.money.add(euro); } } catch (e) { }
    st.reward = `+${xp} XP${euro ? ' · +€ ' + euro : ''}`;
    try { const sv = window.__save; if (sv) { if (win) sv.unlock('br_win', { title: 'Ultimo in piedi', desc: 'Hai vinto una battle royale a Bologna', icon: '🎟️' }); } } catch (e) { }
    try { const B = window.__board; if (B && B.submit) B.submit('br', (v.size - (place || v.size) + 1) * 10 + kills * 25 + (win ? 200 : 0), { place, kills, size: v.size, online: st.startedOnline }); } catch (e) { }
    try { window.dispatchEvent(new CustomEvent('bigalesso:event', { detail: { type: 'br', text: win ? `ha vinto la battle royale nel quartiere con ${kills} eliminazioni` : `è arrivato ${place}° alla battle royale`, win } })); } catch (e) { }
    if (win) banner_('Ultimo in piedi!', 'Pass del Celtic sbloccato', 3);
    setTimeout(() => { if (st.on) { exitMatch(); man.model.visible = true; const w = W(); if (w && w.mode && w.mode.startsWith('br_')) w.setMode('explore'); man.root.position.y = 0; hud.classList.remove('on'); mini.classList.remove('on'); invEl.classList.remove('on'); zoneMesh.visible = nextMesh.visible = false; storm.style.opacity = 0; showOv('results'); } }, win ? 2600 : 1800);
  }

  // ---------------------------------------------------------------- per frame
  let posT = 0;
  function update(dt) {
    zoneMat.uniforms.uTime.value += dt;
    if (!st.on) return;
    const now = performance.now(), w = W();
    // descent
    if (st.fall && w) {
      const f = st.fall; f.t += dt; const k = clamp(f.t / f.dur, 0, 1), e = 1 - (1 - k) * (1 - k);
      man.root.position.lerpVectors(f.from, f.to, e); man.root.position.y = f.from.y * (1 - e);
      umb.position.copy(man.root.position); umb.rotation.z = Math.sin(f.t * 2.3) * 0.08; umb.rotation.x = Math.sin(f.t * 1.7) * 0.06;
      if (k >= 1) { man.root.position.y = 0; umb.visible = false; }
    }
    // avatars
    for (const A of avPool) {
      if (!A.id) continue;
      if (!A.alive) { A.deadT += dt; const s = Math.max(0.01, 1 - A.deadT * 1.6); A.a.root.scale.setScalar(s); if (A.deadT > 0.7) { A.a.root.visible = false; } continue; }
      const d = Math.hypot(A.a.root.position.x - man.root.position.x, A.a.root.position.z - man.root.position.z);
      A.k += dt; if (d < 30 || A.k > 0.1) { A.a.update(A.k, now, null); A.k = 0; }
      if (A.t) { A.t.x = A.a.root.position.x; A.t.z = A.a.root.position.z; }
    }
    // my position to the referee (10 Hz)
    if (st.phase === 'play' && w && (posT += dt) > 0.1) { posT = 0; const p = man.root.position; act({ pos: { x: +p.x.toFixed(2), z: +p.z.toFixed(2), yaw: +w.yaw.toFixed(2) } }); }
    // spectate target
    if (st.phase === 'spec' && st.v) {
      const alive = st.v.players.filter(p => p.a && p.id !== st.me);
      const p = alive.length ? alive[st.specI % alive.length] : null; st.spec = p ? avById.get(p.id) : null;
      if (st.spec) { man.root.position.x = st.spec.a.root.position.x; man.root.position.z = st.spec.a.root.position.z; }
      if (!hud.querySelector('.spec') && p) { const d = document.createElement('div'); d.className = 'spec'; hud.appendChild(d); }
      const sd = hud.querySelector('.spec'); if (sd && p) sd.textContent = `👀 guardi ${p.n} · E cambia`;
    }
    // loot bob
    const t = now / 1000;
    for (const L of lootPool) if (L.g.visible) { for (const k in L.models) if (L.models[k].visible) { L.models[k].rotation.y = t * 1.4 + L.id; L.models[k].position.y = 0.42 + Math.sin(t * 2 + L.id) * 0.06; } }
  }

  // ---------------------------------------------------------------- explore plugin: bus stop + pickups + drop/spectate modes
  const plugin = (ctx, w, H) => {
    w.mgOpen = w.mgOpen || {}; w.mgOpen.br = () => { open(); return true; };
    const stand = V(STOP.x + 1.1, 0, STOP.z + 1.2), top = V(STOP.x, 2.4, STOP.z);
    const near = { id: -1 };
    const nearestLoot = () => {
      near.id = -1; if (!st.on || st.phase !== 'play' || !st.v) return null;
      const p = man.root.position; let best = null, bd = 2.3;
      for (const L of lootPool) { if (!L.g.visible) continue; const d = Math.hypot(L.g.position.x - p.x, L.g.position.z - p.z); if (d < bd) { bd = d; best = L; } }
      if (best) near.id = best.id; return best;
    };
    const FAR = V(9999, 0, 9999);
    return {
      items: [
        { id: 'br-stop', label: () => st.on ? 'Battle royale in corso' : 'Fermata del bus della BR: gioca a "Ultimo in piedi"', anchor: () => stand, top: () => top, range: 1.6,
          act: () => { if (!st.on) open(); } },
        { id: 'br-loot', label: () => { const L = nearestLoot(); if (!L || !L.l) return ''; const l = L.l; return `Raccogli ${l.kind === 'weapon' ? ICON[l.base] + ' ' + WNAME[l.base] + ' (' + l.r + ')' : ICON[l.base] + ' ' + (INAME[l.base] || l.base)}`; },
          anchor: () => { const L = nearestLoot(); return L ? L.g.position : FAR; }, top: () => { const L = nearestLoot(); return L ? L.g.position : FAR; }, range: 2.3,
          act: () => { const L = nearestLoot(); if (L) { const r = act({ pickup: L.id }); if (r && r.ok === false) toast(r.error); } } },
      ],
      owns: m => m === 'br_drop' || m === 'br_spec',
      update(mode) { return mode === 'br_drop' ? { lookW: 0 } : {}; },
      camera(pose) {
        if (w.mode === 'br_drop' && st.fall) { const p = man.root.position; return { pos: V(p.x - Math.sin(w.yaw) * 7, p.y + 5.5, p.z - Math.cos(w.yaw) * 7), look: V(p.x, p.y + 1.6, p.z), fov: 58 }; }
        if (w.mode === 'br_spec' && st.spec) { const p = st.spec.a.root.position, y = st.spec.a.root.rotation.y; return { pos: V(p.x - Math.sin(y) * 4.5, 3.2, p.z - Math.cos(y) * 4.5), look: V(p.x, 1.4, p.z), fov: 60 }; }
        return pose;
      },
    };
  };

  const api = { open, leave: () => leave(true), state: () => ({ on: st.on, phase: st.phase, online: !!(st.s && st.s.online), me: st.me, view: st.v }), get session() { return st.s; }, _st: st };
  window.__br = api;
  return { plugin, update, api };
}
