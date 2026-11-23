// Easter eggs + secrets registry ("Segreti trovati N/M" in the Esc menu).
// createEggs(opts) runs BEFORE createWorld (builds props, pushes colliders into level.colliders);
// eggs.attach(ctx) runs after the world exists; preUpdate(dt,t) before world.update, update(dt,t) after camera.lookAt.
// Other modules can call window.__eggs.found(id) / window.__eggs.register({id,name,desc,hint}).
import * as THREE from 'three';
import { PROMO, COURT } from './eggs_imgs.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const LS_KEY = 'bigalesso_secrets_v1';

const SECRETS = [
  { id: 'bigalesso', name: 'Ave, Bigalesso', desc: 'Hai battuto BIGALESSO sulla macchina da scrivere.', hint: 'La macchina da scrivere conosce il nome del padrone di casa.' },
  { id: 'gulagword', name: 'Parola d\'ordine', desc: 'GULAG, battuto a macchina, fa muovere qualcosa in salotto.', hint: 'Batti a macchina il nome di un certo posto «sotto casa».' },
  { id: 'gulagin', name: 'Sotto la casa', desc: 'Sei sceso nel Gulag.', hint: 'Il salotto nasconde una scala. I libri sanno dove.' },
  { id: 'direttore', name: 'Il direttore incassa', desc: 'Bacio, fidanzato, destro.', hint: 'Scrivi a macchina chi dirige il Corriere.' },
  { id: 'cesco', name: 'Palese ero a letto', desc: 'CESCO a macchina: l\'imputato chiede di tornare a letto.', hint: 'Scrivi a macchina il nome dell\'imputato del secolo.' },
  { id: 'konami', name: 'Modalità Bigalesso', desc: '↑ ↑ ↓ ↓ ← → ← → B A al cabinato.', hint: 'Al cabinato funziona un vecchissimo codice da sala giochi.' },
  { id: 'spritz', name: 'Spritz 2€', desc: 'Hai bevuto al carrello del salotto.', hint: 'In salotto una lavagnetta promette un prezzo onesto.' },
  { id: 'sbronza', name: 'Pieno di alcol', desc: 'Cinque spritz e samba spontanea.', hint: 'Uno spritz tira l\'altro… fino a cinque.' },
  { id: 'bedtime', name: 'Sono le 21', desc: 'Qualcuno è già a letto.', hint: 'Chiedi l\'ora all\'orologio della sala giochi, o passa alle 21.' },
  { id: 'tg', name: 'TG In Onda', desc: 'Il telegiornale del Corriere sulla TV del salotto.', hint: 'La TV del salotto non trasmette solo il cabinato.' },
  { id: 'wish', name: 'Desiderio agli atti', desc: 'Una monetina nella fontana.', hint: 'In giardino l\'acqua accetta monetine.' },
  { id: 'dig', name: 'Ghiaccio del Gulag', desc: 'Il cane ha scavato in giardino.', hint: 'In giardino c\'è terra smossa: serve un buon naso.' },
];

const HEADLINES = [
  'LA RESISTENZA SFIDA IL CORRIERE: NASCE L\'INDIPENDENTE BOLOGNESE',
  'BACIO, FIDANZATO, DESTRO: IL DIRETTORE INCASSA',
  'VIA RIZZOLI, ROUND 3: TORTELLINO MAN CONTRO CAPPELLETTI MAN · IL BOCCALE DI RE ENZO È ILLESO',
  '«MA CHE SEI, DE ROMA?»: TORTELLINO MAN CACCIATO DAL BAR, RIENTRA ROSSOBLÙ',
  'CESCO INDAGATO: IL GULAG LO PROCESSA IN DIRETTA · «PALESE ERO ANDATO A LETTO ALLE 21»',
  'BOLLETTINO DEL GULAG: «PROCESSO È REGOLARE. VODKA SOLO PER PUBBLICO MINISTERO»',
  'AMSTERDAM: COMPLEANNO RIUSCITO STOP TIRAMISÙ STOP VOTO 4,5 SU 5',
  'È USCITO GTA VI: LA CITTÀ SI FERMA, LA DIREZIONE CHIEDE IL PC',
  'IL CANTIERE: «VIVERE SOTTO UN PORTICO È PIÙ SALUTARE»',
  'PUBBLICITÀ · VIETATO AI MINORI DI 21 ORE',
];

function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function canvasTex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
function loadImg(src) { return new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }); }

// small instanced particle bursts (dirt, cappelletti, splash drops)
function burst(scene, geo, mat, max, { gravity = 9, floor = 0.01, life = 2.5, spin = 6 } = {}) {
  const im = new THREE.InstancedMesh(geo, mat, max); im.frustumCulled = false; im.castShadow = true; im.count = 0; scene.add(im);
  const P = []; const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = V();
  return {
    spawn(pos, n, vel, spread = 1, scale = 1) {
      for (let i = 0; i < n; i++) {
        if (P.length >= max) P.shift();
        P.push({ p: pos.clone().add(V((Math.random() - 0.5) * 0.1 * spread, 0, (Math.random() - 0.5) * 0.1 * spread)), v: vel.clone().add(V((Math.random() - 0.5) * 2 * spread, Math.random() * spread, (Math.random() - 0.5) * 2 * spread)), r: V(Math.random() * 6, Math.random() * 6, Math.random() * 6), w: V((Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin), t: 0, life: life * (0.7 + Math.random() * 0.6), s: scale * (0.7 + Math.random() * 0.6) });
      }
    },
    update(dt) {
      let k = 0;
      for (let i = P.length - 1; i >= 0; i--) {
        const o = P[i]; o.t += dt;
        if (o.t > o.life) { P.splice(i, 1); continue; }
        if (o.p.y > floor) { o.v.y -= gravity * dt; o.p.addScaledVector(o.v, dt); o.r.addScaledVector(o.w, dt); if (o.p.y < floor) { o.p.y = floor; o.v.multiplyScalar(0.25); o.v.y = 0; o.w.multiplyScalar(0.2); } }
      }
      for (const o of P) { const f = 1 - smooth((o.t - o.life + 0.5) / 0.5); m4.compose(o.p, q.setFromEuler(e.set(o.r.x, o.r.y, o.r.z)), s.setScalar(o.s * f)); im.setMatrixAt(k++, m4); }
      im.count = k; im.instanceMatrix.needsUpdate = true;
    },
  };
}

export function createEggs(opts) {
  const { scene, level, room, screenTex } = opts;
  let ctx = null, W = null;
  // ---------------------------------------------------------------- registry
  let found = {};
  try { found = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (e) { found = {}; }
  const defs = SECRETS.slice();
  const list = () => defs.map(d => ({ ...d, found: !!found[d.id] }));
  const sync = () => { try { ctx && ctx.ui && ctx.ui.secrets && ctx.ui.secrets.set(list()); } catch (e) { } };
  function markFound(id) {
    if (found[id]) return false;
    const d = defs.find(x => x.id === id); if (!d) return false;
    found[id] = Date.now();
    try { localStorage.setItem(LS_KEY, JSON.stringify(found)); } catch (e) { }
    if (ctx) {
      ctx.audio.sfx('secret');
      const n = Object.keys(found).filter(k => defs.some(x => x.id === k)).length;
      setTimeout(() => ctx.ui.toast('Segreto trovato: ' + d.name + ' (' + n + '/' + defs.length + ')', 'gold'), 700);
      if (n === defs.length) setTimeout(() => ctx.ui.toast('Tutti i segreti! Nel menu (Esc → Segreti) ci sono i titoli di coda', 'gold'), 3200);
    }
    sync(); return true;
  }

  // ---------------------------------------------------------------- props
  const g = new THREE.Group(); g.name = 'eggs'; scene.add(g);
  const shadowy = m => { m.castShadow = true; m.receiveShadow = true; return m; };
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 1, roughness: 0.3 });
  const glassM = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.04, transparent: true, opacity: 0.28, depthWrite: false, clearcoat: 1 });
  const spritzM = new THREE.MeshStandardMaterial({ color: 0xff5a10, emissive: 0x6a1800, emissiveIntensity: 0.5, roughness: 0.15, transparent: true, opacity: 0.9 });

  // --- bar cart with spritz in the lounge (back wall, between bookshelf and TV) ---
  const CART = V(5.55, 0, 0.34);
  const cart = new THREE.Group(); cart.position.copy(CART); g.add(cart);
  {
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.5 });
    for (const y of [0.3, 0.8]) { const t = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.025, 0.4), wood)); t.position.y = y; cart.add(t); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const l = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.82, 8), brass)); l.position.set(sx * 0.37, 0.46, sz * 0.18); cart.add(l); const w = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 16), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 }))); w.rotation.z = Math.PI / 2; w.position.set(sx * 0.37, 0.035, sz * 0.18); cart.add(w); }
    const handle = shadowy(new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.009, 8, 20, Math.PI), brass)); handle.position.set(0.39, 0.86, 0); handle.rotation.set(0, Math.PI / 2, 0); cart.add(handle);
    // bottles
    const bottle = (col, x, z, h = 0.3) => { const pts = [V(0, 0), V(0.04, 0), V(0.042, 0.02), V(0.042, h * 0.62), V(0.016, h * 0.82), V(0.014, h)].map(p => new THREE.Vector2(p.x, p.y)); const b = shadowy(new THREE.Mesh(new THREE.LatheGeometry(pts, 20), new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.1, transmission: 0, clearcoat: 1 }))); b.position.set(x, 0.81, z); cart.add(b); return b; };
    bottle(0xe8501a, -0.26, -0.06); bottle(0x1f5a2a, -0.16, -0.1, 0.34); bottle(0xe8501a, 0.24, 0.08, 0.26);
    // ice bucket
    const ib = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.14, 24, 1, true), brass)); ib.position.set(-0.22, 0.38, 0.03); cart.add(ib);
    // chalkboard A-frame "SPRITZ 2€"
    const c = cv(256, 320), x = c.getContext('2d');
    x.fillStyle = '#1d2420'; x.fillRect(0, 0, 256, 320); x.strokeStyle = '#6a4a2a'; x.lineWidth = 18; x.strokeRect(0, 0, 256, 320);
    x.fillStyle = 'rgba(240,240,230,.92)'; x.textAlign = 'center'; x.font = 'bold 58px "Comic Sans MS", "Segoe Print", cursive'; x.fillText('SPRITZ', 128, 92);
    x.font = 'bold 96px "Comic Sans MS", "Segoe Print", cursive'; x.fillStyle = '#ffb060'; x.fillText('2€', 128, 200);
    x.font = '24px "Comic Sans MS", cursive'; x.fillStyle = 'rgba(240,240,230,.8)'; x.fillText('vietato ai minori', 128, 252); x.fillText('di 21 ore', 128, 280);
    for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; x.fillRect(Math.random() * 256, Math.random() * 320, 2, 2); }
    const board = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.012), [wood, wood, wood, wood, new THREE.MeshStandardMaterial({ map: canvasTex(c), roughness: 0.95 }), wood]));
    board.position.set(0.12, 0.96, -0.05); board.rotation.x = -0.18; cart.add(board);
  }
  const spritzGlass = () => {
    const grp = new THREE.Group();
    const pts = [V(0, 0), V(0.035, 0), V(0.036, 0.004), V(0.006, 0.01), V(0.005, 0.07), V(0.03, 0.09), V(0.042, 0.13), V(0.043, 0.165)].map(p => new THREE.Vector2(p.x, p.y));
    grp.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 20), glassM));
    const liq = new THREE.Mesh(new THREE.CylinderGeometry(0.039, 0.028, 0.055, 20), spritzM); liq.position.y = 0.112; grp.add(liq);
    const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.004, 16), new THREE.MeshStandardMaterial({ color: 0xff9a20, roughness: 0.6 })); sl.position.set(0.03, 0.15, 0); sl.rotation.z = 1.2; grp.add(sl);
    grp.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return grp;
  };
  const cartGlasses = [];
  for (let i = 0; i < 3; i++) { const s = spritzGlass(); s.position.set(0.0 + i * 0.09, 0.81, 0.1); cart.add(s); cartGlasses.push(s); }
  const handGlass = spritzGlass(); handGlass.visible = false; g.add(handGlass);
  if (level && level.colliders) level.colliders.push({ type: 'box', min: [CART.x - 0.42, 0.0], max: [CART.x + 0.42, CART.z + 0.24] });

  // --- fresh dirt spot in the garden (the dog digs here) ---
  let DIG = V(-1.6, 0, 16.6);
  if (level && level.isWalkable) {
    const cands = [[-1.6, 16.6], [-2.4, 15.2], [0.2, 17.6], [3.6, 16.8], [-0.6, 18.2], [2.8, 18.4], [-2.8, 12.6]];
    for (const [x, z] of cands) { if (level.isWalkable(x, z, 0.7)) { DIG = V(x, 0, z); break; } }
  }
  const dirtM = new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 1 });
  const mound = new THREE.Group(); mound.position.copy(DIG); g.add(mound);
  { const disk = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24), dirtM); disk.rotation.x = -Math.PI / 2; disk.position.y = 0.012; disk.receiveShadow = true; mound.add(disk);
    for (let i = 0; i < 14; i++) { const r = Math.random() * 0.3, a = Math.random() * 6.28; const c2 = shadowy(new THREE.Mesh(new THREE.SphereGeometry(0.03 + Math.random() * 0.04, 8, 6), dirtM)); c2.position.set(Math.cos(a) * r, 0.02, Math.sin(a) * r); c2.scale.y = 0.5; mound.add(c2); }
    const stick = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.35, 6), new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.9 }))); stick.position.set(0.2, 0.14, -0.1); stick.rotation.z = 0.3; mound.add(stick); }
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.28, 24), new THREE.MeshStandardMaterial({ color: 0x1a120a, roughness: 1 })); hole.rotation.x = -Math.PI / 2; hole.position.copy(DIG).add(V(0, 0.016, 0)); hole.visible = false; g.add(hole);
  // the find: "Ghiaccio del Gulag" sack on an ice block
  const prize = new THREE.Group(); prize.visible = false; g.add(prize);
  { const c = cv(512, 256), x = c.getContext('2d');
    x.fillStyle = '#b3161c'; x.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 2500; i++) { x.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; x.fillRect(Math.random() * 512, Math.random() * 256, 3, 1); }
    x.fillStyle = '#fff6ee'; x.textAlign = 'center'; x.font = 'bold 64px Impact, "Arial Black", sans-serif'; x.fillText('GHIACCIO', 256, 112); x.fillText('DEL GULAG', 256, 188);
    const sack = shadowy(new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 18), new THREE.MeshStandardMaterial({ map: canvasTex(c), roughness: 0.9 }))); sack.scale.set(1, 0.85, 0.9); sack.position.y = 0.26; prize.add(sack);
    const cap = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.04, 20), new THREE.MeshStandardMaterial({ color: 0xcfcfcf, metalness: 1, roughness: 0.25 }))); cap.position.y = 0.38; prize.add(cap);
    const ice = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.26), new THREE.MeshPhysicalMaterial({ color: 0xcfeeff, roughness: 0.08, transparent: true, opacity: 0.7, clearcoat: 1 }))); ice.position.y = 0.07; prize.add(ice);
    prize.position.copy(DIG).add(V(0.35, 0, 0.1)); }

  // --- lounge TV: extra channels ---
  let tvMesh = null, tvLive = null;
  scene.traverse(o => { if (!tvMesh && o.isMesh && o.material && o.material.isMeshBasicMaterial && screenTex && o.material.map === screenTex) tvMesh = o; });
  if (tvMesh) tvLive = tvMesh.material.map;
  const tvC = cv(640, 360), tvX = tvC.getContext('2d'); const tvTex = canvasTex(tvC);
  const imgs = {}; loadImg(PROMO).then(i => { imgs.promo = i; }); loadImg(COURT).then(i => { imgs.court = i; });

  // particle bursts
  const dirtB = burst(scene, new THREE.BoxGeometry(0.03, 0.03, 0.03), dirtM, 90, { life: 1.8 });
  const pastaB = burst(scene, new THREE.TorusGeometry(0.028, 0.014, 8, 14), new THREE.MeshStandardMaterial({ color: 0xf0c060, roughness: 0.55 }), 120, { gravity: 6, life: 6, spin: 5 });
  const dropB = burst(scene, new THREE.SphereGeometry(0.018, 6, 4), new THREE.MeshPhysicalMaterial({ color: 0xbfe6ff, roughness: 0.05, transparent: true, opacity: 0.7 }), 80, { life: 1.2 });

  // ---------------------------------------------------------------- state
  const st = { alc: 0, spritz: 0, drink: null, hic: 3, confusedCd: 0, yawn: null, clockLook: 0, bedDone: false, bedCheck: 0, tvCh: 0, tvT: 0, tvOsd: 0, wish: null, dig: null, digs: 0, konami: [], konamiPending: false, t: 0, sway: 0 };

  // ---------------------------------------------------------------- attach (world exists)
  function attach(c) {
    ctx = c; W = c.world;
    const { man, dog, audio, ui } = c;
    const fx = () => (c.getFX ? c.getFX() : null) || { confetti() { }, sparkles() { }, coin(a, b, cb) { cb && cb(); }, hearts() { } };
    const has = (o, k) => o && typeof o[k] === 'function';
    const manPos = () => man.root.position;
    const headPos = () => (man.bones && man.bones.Head ? man.bones.Head.getWorldPosition(V()) : manPos().clone().add(V(0, 1.6, 0)));
    const handPos = s => (man.bones && man.bones[s + 'Hand'] ? man.bones[s + 'Hand'].getWorldPosition(V()) : manPos().clone().add(V(0, 1, 0)));
    const fwd = () => V(Math.sin(W.yaw), 0, Math.cos(W.yaw));
    const side = () => V(Math.cos(W.yaw), 0, -Math.sin(W.yaw)); // character's left
    const gulag = () => c.gulag || (window.__app && window.__app.gulag) || window.__gulag || null;
    const toast = (m, k = '') => ui.toast(m, k);
    api._x = { fx, manPos, headPos };

    // ---- interactables (pushed into explore's list) ----
    const clockObj = room && room.clock;
    const clockPos = () => (clockObj ? clockObj.getWorldPosition(V()) : V(-1.38, 1.95, 0.03));
    const items = [
      { id: 'egg-spritz', label: () => st.spritz ? `Un altro spritz? (${st.spritz} bevuti)` : 'Bevi uno spritz (2€)', anchor: () => V(CART.x, 0, CART.z + 0.72), top: () => CART.clone().add(V(0, 1.08, 0)), range: 0.8, act: drinkSpritz },
      { id: 'egg-clock', label: () => 'Che ore sono?', anchor: () => { const p = clockPos(); return V(p.x + 0.35, 0, 1.25); }, top: () => clockPos().add(V(0, 0.22, 0.05)), range: 0.9, act: askTime },
      tvMesh && { id: 'egg-tv', label: () => 'Cambia canale', alt: () => st.tvCh ? 'Torna al cabinato in diretta' : null, altAct: () => setChannel(0), anchor: () => V(7.3, 0, 1.3), top: () => tvMesh.getWorldPosition(V()).add(V(0, 0.45, 0.05)), range: 1.0, act: () => setChannel((st.tvCh + 1) % 4) },
      level && level.anchors && level.anchors.fountain && { id: 'egg-fountain', label: () => 'Lancia una monetina', anchor: () => { const f = level.anchors.fountain, p = manPos(); const d = V(p.x - f.x, 0, p.z - f.z); if (d.lengthSq() < 1e-4) d.set(0, 0, 1); return f.clone().addScaledVector(d.normalize(), 1.6); }, top: () => level.anchors.fountain.clone().add(V(0, 1.6, 0)), range: 0.75, act: throwCoin },
      { id: 'egg-dig', label: () => st.digs >= 2 ? 'Buca già scavata' : 'Fai scavare il cane', anchor: () => DIG.clone(), top: () => DIG.clone().add(V(0, 0.6, 0)), range: 1.35, act: () => { if (st.digs >= 2) { toast('Qui non c\'è più niente. Forse.'); return; } startDig(); } },
    ].filter(Boolean);
    for (const it of items) W.interactables.push(it);

    // ---- explore hooks ----
    W.onTyped = onTyped;
    W.extPose = (dt, mode) => extPose(dt, mode);
    // ---- konami (keys are read globally; only counts at a cabinet) ----
    const SEQ = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'B', 'A'];
    const map = code => (/^Key[BXKG]$/.test(code) ? 'B' : /^(KeyA|KeyZ|Space|KeyJ|KeyF)$/.test(code) ? 'A' : code);
    const pushKey = (code, gm, cabObj) => {
      const k = map(code); st.konami.push(k); if (st.konami.length > SEQ.length) st.konami.shift();
      if (st.konami.length === SEQ.length && st.konami.every((v, i) => v === SEQ[i])) { st.konami.length = 0; konami(gm, cabObj); }
    };
    // main.js fires 'bigalesso:cabinetkey' on every keydown while seated (both cabinets)
    addEventListener('bigalesso:cabinetkey', e => { const d = e.detail || {}; st.cabEvt = true; pushKey(d.code, d.game, d.cab); });
    addEventListener('keydown', e => { // fallback for builds without the event
      if (e.repeat || st.cabEvt) return;
      const atCab = /cabinet/i.test(W.mode || '');
      if (!atCab) { st.konami.length = 0; return; }
      pushKey(e.code, null, null);
    }, true);

    // ---- credits ----
    ui.secrets && ui.secrets.onCredits(rollCredits);
    sync();

    // ================================================================ eggs
    function onTyped(buf) {
      if (/BIGALESSO$/.test(buf)) markFound('bigalesso');
      if (/GULAG$/.test(buf)) {
        audio.sfx('creak'); const gl = gulag();
        try { if (gl && gl.openPassage) gl.openPassage(); } catch (e) { console.warn(e); }
        toast('Qualcosa si è mosso in salotto…', 'gold'); markFound('gulagword');
      }
      if (/DIRETTORE$/.test(buf)) {
        audio.sfx('punch'); c.S && (c.S.shake = Math.max(c.S.shake || 0, 0.07));
        if (has(man, 'gesture')) man.gesture('facepalm');
        toast('Bacio, fidanzato, destro: il direttore incassa!', 'gold'); markFound('direttore');
      }
      if (/CESCO$/.test(buf)) { audio.sfx('yawn'); toast('«Palese ero andato a letto alle 21» — Cesco'); markFound('cesco'); }
      if (/(TORTELLINO|CAPPELLETTI)$/.test(buf)) { fx().confetti(headPos().add(V(0, 0.4, 0)), 40); toast('Tortellino Man contro Cappelletti Man: il round 4 è in preparazione'); }
      if (/SPRITZ$/.test(buf)) toast('Lo spritz è in salotto: 2€, sul carrello');
    }

    // ---- spritz ----
    function drinkSpritz() {
      if (W.carry) { toast('Con l\'estintore in mano? Posalo prima'); return; }
      W.setMode('spritz'); st.drink = { t: 0 }; handGlass.visible = true; cartGlasses[st.spritz % 3].visible = false;
      audio.sfx('pickup');
    }
    // ---- clock / bedtime ----
    function askTime() {
      const d = new Date(), hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0');
      st.clockLook = 2.0;
      if (d.getHours() === 21 && d.getMinutes() <= 15) bedtime();
      else {
        toast(`Sono le ${hh}:${mm}` + (d.getHours() < 21 ? '. Alle 21 qualcuno sarà già a letto.' : '. Ormai Cesco dorme da un pezzo.'));
        if (Math.random() < 0.35) setTimeout(bedtime, 900);
      }
    }
    function bedtime() {
      st.bedDone = true; st.yawn = { t: 0 }; audio.sfx('yawn');
      toast('Sono le 21: qualcuno è già a letto', 'gold'); markFound('bedtime');
      if (has(dog, 'setMode') && dog.state && dog.state.mode === 'idle') dog.setMode('lie');
    }
    // ---- TV ----
    function setChannel(ch) {
      if (!tvMesh) return;
      st.tvCh = ch; st.tvOsd = 1.6; audio.sfx('tvzap');
      tvMesh.material.map = ch === 0 ? tvLive : tvTex; tvMesh.material.needsUpdate = true;
      if (ch === 1) markFound('tg');
      if (ch === 1) toast('TG IN ONDA · il telegiornale del Corriere delle Due Torri');
      if (ch === 3) toast('IL PROCESSO DEL SECOLO · prossimamente, in diretta ovunque');
    }
    // ---- fountain ----
    function throwCoin() {
      const f = level.anchors.fountain;
      W.setMode('wish'); st.wish = { t: 0, sent: false, f };
      W.yaw = Math.atan2(f.x - manPos().x, f.z - manPos().z);
      if (has(man, 'gesture')) man.gesture('throw');
    }
    // ---- dog digs ----
    function startDig() {
      st.dig = { t: 0, phase: 0 };
      audio.sfx('whistle');
      if (has(dog, 'setMode')) dog.setMode('goto', { goal: DIG.clone().add(V(-0.35, 0, 0)), speedGoal: 2.0, after: 'idle' });
      toast('Cerca, bello! Cerca!');
    }
    // ---- konami ----
    function konami(gm, cabObj) {
      const ac = window.__app && window.__app.activeCabinet ? window.__app.activeCabinet() : null;
      gm = gm || (ac && ac.game) || c.game; cabObj = cabObj || (ac && ac.cab) || c.cab;
      audio.sfx('power'); markFound('konami');
      if (gm && typeof gm.bigalessoMode === 'function') { st.konamiPending = gm; toast('↑↑↓↓←→←→ B A — MODALITÀ BIGALESSO', 'gold'); }
      else if (gm && gm.f && typeof gm.f.hp === 'number') { // Il Direttore Incassa: full health + bonus
        gm.f.hp = 100; if ('hpShow' in gm.f) gm.f.hpShow = 100; if (typeof gm.addScore === 'function') gm.addScore(5000);
        toast('↑↑↓↓←→←→ B A — il direttore ritrova la dignità (salute piena)', 'gold');
      } else toast('↑↑↓↓←→←→ B A — MODALITÀ BIGALESSO (al prossimo via!)', 'gold');
      if (has(man, 'gesture')) man.gesture('cheer');
      const top = cabObj && cabObj.group ? cabObj.group.localToWorld(V(0, 1.95, 0.5)) : headPos().add(V(0, 0.6, 0));
      fx().confetti(top, 120);
    }
    // ---- credits ----
    function rollCredits() {
      const el = document.createElement('div'); el.id = 'eggCredits';
      const L = [
        ['h', 'BIGALESSO GAMES'], ['s', 'presenta'], ['g', ''],
        ['t', 'IL CORRIERE DELLE DUE TORRI'], ['s', 'Edizione n. 313 · «Il direttore osserva»'], ['g', ''],
        ['r', 'Regia', 'il Direttore (che incassa)'], ['r', 'Effetti speciali', 'Tortellino Man e Cappelletti Man'], ['r', 'Il cane', 'se stesso, molto bravo'],
        ['r', 'Imputato', 'Cesco, a letto alle 21'], ['r', 'Bollettino del Gulag', 'il Capo delle Guardie'], ['r', 'Spritz', '2€, vietato ai minori di 21 ore'],
        ['r', 'Corrispondente da Amsterdam', 'Asche, STOP'], ['r', 'Il Cantiere', 'guanti, mascherina, stomaco'], ['r', 'La Resistenza', 'sotto i portici'],
        ['g', ''], ['s', 'Nessun tortellino è stato maltrattato durante le riprese.'], ['s', 'Il boccale di Re Enzo è illeso.'], ['g', ''],
        ['s', 'Pagine di fantasia: fatti e persone sono inventati a scopo goliardico.'], ['g', ''], ['h', 'AVE, BIGALESSO'], ['s', 'Grazie per aver giocato'],
      ];
      el.innerHTML = `<div class="crawl">${L.map(l => l[0] === 'r' ? `<p class="r"><span>${l[1]}</span><b>${l[2]}</b></p>` : `<p class="${l[0]}">${l[1]}</p>`).join('')}</div><div class="cskip">Esc o clic per uscire</div>`;
      document.body.appendChild(el);
      if (c.playMusic && c.TRACKS && c.TRACKS.ending) c.playMusic('ending');
      const close = () => { el.remove(); removeEventListener('keydown', onK, true); c.musicBack && c.musicBack(); };
      const onK = e => { if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); e.stopImmediatePropagation(); close(); } };
      addEventListener('keydown', onK, true); el.addEventListener('click', close);
      setTimeout(() => el.isConnected && close(), 46000);
    }

    // ================================================================ per-frame
    api.extPoseFn = extPose;
    function extPose(dt, mode) {
      const head = headPos(), f = fwd(), sd = side();
      if (mode === 'spritz' && st.drink) {
        const t = st.drink.t;
        // reach to the cart, bring to the mouth, sip, lower
        const pick = CART.clone().add(V(0.02, 0.85, 0.1));
        const mouth = head.clone().addScaledVector(f, 0.1).add(V(0, -0.07, 0)).addScaledVector(sd, -0.02);
        const k1 = smooth(t / 0.5), k2 = smooth((t - 0.55) / 0.5), k3 = smooth((t - 1.9) / 0.5);
        const pos = pick.clone().lerp(mouth, k2).lerp(head.clone().addScaledVector(f, 0.3).add(V(0, -0.45, 0)), k3);
        return { rR: { pos, w: k1 * (1 - k3 * 0.9), palm: t < 0.55 ? 'down' : 'in', grip: 0.9 }, lookW: 1, lookAt: t < 0.55 ? pick : head.clone().addScaledVector(f, 1).add(V(0, 0.25, 0)), leanT: t < 0.55 ? 0.25 : 0 };
      }
      if (mode === 'wish' && st.wish) {
        const t = st.wish.t, f2 = st.wish.f;
        const up = head.clone().addScaledVector(sd, -0.25).add(V(0, 0.1, 0)).addScaledVector(f, -0.1);
        const out = head.clone().addScaledVector(f, 0.55).add(V(0, -0.05, 0)).addScaledVector(sd, -0.15);
        const pos = up.lerp(out, smooth((t - 0.35) / 0.25));
        return { rR: { pos, w: smooth(t / 0.3) * (1 - smooth((t - 1.0) / 0.4)), palm: 'forward', grip: 0.7 }, lookW: 1, lookAt: f2.clone().add(V(0, 0.5, 0)) };
      }
      if (st.yawn) {
        const t = st.yawn.t, w = smooth(t / 0.6) * (1 - smooth((t - 1.8) / 0.6));
        return { rL: { pos: head.clone().addScaledVector(sd, 0.22).add(V(0, 0.38, 0)).addScaledVector(f, -0.04), w, palm: 'forward', grip: 0.5 }, rR: { pos: head.clone().addScaledVector(sd, -0.22).add(V(0, 0.38, 0)).addScaledVector(f, -0.04), w, palm: 'forward', grip: 0.5 }, lookW: 0.6, lookAt: head.clone().addScaledVector(f, 1).add(V(0, 1.2, 0)) };
      }
      if (st.clockLook > 0) return { lookW: 1, lookAt: clockPos() };
      if (st.dig && st.dig.phase >= 1 && mode === 'explore') return { lookW: 1, lookAt: DIG.clone().add(V(0, 0.2, 0)) };
      return null;
    }
  }

  // preUpdate: before world.update (movement wobble while tipsy)
  function preUpdate(dt) {
    if (!ctx || !W) return;
    const k = drunkK();
    if (k > 0 && W.mode === 'explore' && W.vel && W.vel.lengthSq() > 0.04) {
      const s = Math.sin(st.t * 1.9) + 0.6 * Math.sin(st.t * 3.3 + 1);
      W.vel.x += Math.cos(W.yaw) * s * k * 0.09; W.vel.z += -Math.sin(W.yaw) * s * k * 0.09;
    }
  }
  const drunkK = () => clamp((st.alc - 1) / 2.5, 0, 1);

  function update(dt, t) {
    if (!ctx) return;
    if (ctx.ui && ctx.ui.menuOpen) dt = 0;
    st.t += dt;
    const { man, dog, audio, camera, ui } = ctx;
    const X = api._x;
    // particles
    dirtB.update(dt); pastaB.update(dt); dropB.update(dt);
    // drink
    if (st.drink) {
      st.drink.t += dt;
      const hp = man.bones && man.bones.RightHand ? man.bones.RightHand.getWorldPosition(V()) : null;
      if (hp && st.drink.t > 0.45) { handGlass.position.copy(hp).add(V(0, 0.02, 0)); const tilt = smooth((st.drink.t - 1.0) / 0.35) * (1 - smooth((st.drink.t - 1.75) / 0.3)); handGlass.rotation.set(0, W.yaw, 0); handGlass.rotateX(-tilt * 1.1); handGlass.visible = true; }
      else handGlass.visible = false;
      if (st.drink.t > 1.05 && !st.drink.gulp) { st.drink.gulp = 1; audio.sfx('gulp'); if ('smile' in man) man.smile = 1; }
      if (st.drink.t > 2.5 || (W.mode !== 'spritz' && st.drink.t > 0.1)) endDrink2();
    }
    // tipsy
    st.alc = Math.max(0, st.alc - dt / 20);
    const k = drunkK();
    if (k > 0) {
      st.hic -= dt;
      if (st.hic <= 0) { st.hic = 3 + Math.random() * 4; audio.sfx('hiccup'); if (ctx.S) ctx.S.shake = Math.max(ctx.S.shake || 0, 0.015 * (0.5 + k)); }
      st.confusedCd -= dt;
      if (st.confusedCd <= 0 && dog && dog.root.position.distanceTo(man.root.position) < 2.6 && typeof dog.react === 'function') { st.confusedCd = 12; dog.react('confused'); }
    }
    st.sway += ((k > 0 ? 1 : 0) * k - st.sway) * (1 - Math.exp(-dt * 1.5));
    // camera sway (after main's camera.lookAt)
    if (st.sway > 0.002 && camera && (!ui.settings || ui.settings.cameraShake !== false)) {
      const s = st.sway;
      camera.rotateZ(Math.sin(st.t * 0.83) * 0.075 * s);
      camera.rotateX(Math.sin(st.t * 0.61 + 1.3) * 0.025 * s);
      camera.rotateY(Math.sin(st.t * 0.47 + 0.4) * 0.03 * s);
    }
    // yawn / clock look
    if (st.yawn) { st.yawn.t += dt; if ('mouth' in man) man.mouth = smooth(st.yawn.t / 0.5) * (1 - smooth((st.yawn.t - 1.6) / 0.5)); if (st.yawn.t > 2.6) { st.yawn = null; if ('mouth' in man) man.mouth = 0; } }
    st.clockLook = Math.max(0, st.clockLook - dt);
    st.bedCheck -= dt;
    if (st.bedCheck <= 0) { st.bedCheck = 20; const d = new Date(); if (!st.bedDone && d.getHours() === 21 && d.getMinutes() <= 15 && W.mode === 'explore') bedtime2(); }
    // TV
    if (st.tvCh) drawTV(dt);
    // fountain throw
    if (st.wish) {
      st.wish.t += dt;
      if (st.wish.t > 0.5 && !st.wish.sent) {
        st.wish.sent = true; const f = st.wish.f;
        const to = f.clone().add(V((Math.random() - 0.5) * 0.6, 0.42, (Math.random() - 0.5) * 0.6));
        const F = X.fx(); const from = man.bones && man.bones.RightHand ? man.bones.RightHand.getWorldPosition(V()) : X.headPos();
        if (F.coin) F.coin(from, to, () => wishOutcome2(f)); else wishOutcome2(f);
      }
      if (st.wish.t > 1.6) { st.wish = null; if (W.mode === 'wish') W.setMode('explore'); }
    }
    if (st.dogBath) {
      const b = st.dogBath; b.t += dt;
      if (!b.done && (dog.root.position.distanceTo(b.f) < 2.2 || b.t > 6)) { b.done = true; dog.react && dog.react('jump'); audio.sfx('splash'); dropB.spawn(dog.root.position.clone().add(V(0, 0.3, 0)), 24, V(0, 2.5, 0), 1.2); setTimeout(() => { dog.react && dog.react('shake'); dropB.spawn(dog.root.position.clone().add(V(0, 0.3, 0)), 18, V(0, 1.2, 0), 1.5); }, 1100); }
      if (b.t > 8) st.dogBath = null;
    }
    // dog digging
    if (st.dig) {
      const d = st.dig; d.t += dt;
      const dd = dog.root.position.distanceTo(DIG);
      if (d.phase === 0 && (dd < 0.75 || d.t > 10)) { d.phase = 1; d.pt = 0; d.next = 0; dog.react && dog.react('happy'); }
      if (d.phase === 1) {
        d.pt += dt; d.next -= dt;
        if (d.next <= 0) { d.next = 0.28; dirtB.spawn(DIG.clone().add(V(0, 0.05, 0)), 6, V(-1.2, 2.2, 0), 0.8); audio.sfx('dig'); }
        if (d.pt > 2.4) {
          d.phase = 2; st.digs++; mound.visible = false; hole.visible = true;
          if (st.digs === 1) { prize.visible = true; prize.scale.setScalar(0.01); d.pop = 0; ctx.ui.toast('Il cane ha trovato il Ghiaccio del Gulag!', 'gold'); markFound('dig'); X.fx().sparkles && X.fx().sparkles(prize.position.clone().add(V(0, 0.3, 0))); }
          else ctx.ui.toast('Stavolta il cane ha trovato… un vecchio numero del Corriere (il 312)');
          dog.react && dog.react('jump'); audio.sfx('yip');
        }
      }
      if (d.phase === 2) { d.pop = (d.pop || 0) + dt; prize.scale.setScalar(smooth(d.pop / 0.5) * 1); if (d.pop > 1) st.dig = null; }
    }
    if (prize.visible && !st.dig) prize.rotation.y += dt * 0.4;
    // konami → apply once the game has a player
    if (st.konamiPending) { const gm = st.konamiPending; if (gm.players && gm.players[0] && gm.state && !['attract', 'over'].includes(gm.state) && gm.bigalessoMode) { gm.bigalessoMode(true); st.konamiPending = null; } }
    // gulag visit (other agent's module)
    if (!found.gulagin && (st.gcheck = (st.gcheck || 0) - dt) <= 0) { st.gcheck = 0.5; const gl = (ctx.gulag || (window.__app && window.__app.gulag) || window.__gulag); if (gl && gl.inside) markFound('gulagin'); }
  }
  // indirections (defined inside attach)
  const endDrink2 = () => { const f = api._end; f && f(); };
  const bedtime2 = () => { const f = api._bed; f && f(); };
  const wishOutcome2 = f => { const g2 = api._wish; g2 && g2(f); };

  function drawTV(dt) {
    st.tvT += dt; st.tvOsd = Math.max(0, st.tvOsd - dt);
    if ((st.tvFrame = (st.tvFrame || 0) + 1) % 3) return;
    const x = tvX, Wd = 640, H = 360, t = st.tvT, ch = st.tvCh;
    if (ch === 1) { // TG IN ONDA
      const gr = x.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#0b1a3a'); gr.addColorStop(1, '#050b18'); x.fillStyle = gr; x.fillRect(0, 0, Wd, H);
      for (let i = 0; i < 12; i++) { x.fillStyle = `rgba(80,140,255,${0.04 + 0.03 * Math.sin(t + i)})`; x.fillRect(0, i * 30, Wd, 1); }
      // anchor desk
      x.fillStyle = '#132a5a'; x.fillRect(60, 210, 300, 60); x.fillStyle = '#c8102e'; x.fillRect(60, 210, 300, 6);
      const face = ctx.game && ctx.game.img && ctx.game.img.face; if (face) x.drawImage(face, 130, 70, 160, 150);
      // picture box
      const img = imgs.court || imgs.promo; x.fillStyle = '#000'; x.fillRect(388, 54, 220, 150); if (img) { const ar = 216 / 146; let sw = img.width, sh = sw / ar; if (sh > img.height) { sh = img.height; sw = sh * ar; } x.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 390, 56, 216, 146); } else { x.fillStyle = '#c8102e'; x.font = 'bold 30px Impact, sans-serif'; x.textAlign = 'center'; x.fillText('IL GULAG', 498, 140); }
      x.fillStyle = '#c8102e'; x.fillRect(20, 18, 190, 40); x.fillStyle = '#fff'; x.font = 'bold 26px Impact, "Arial Black", sans-serif'; x.textAlign = 'left'; x.fillText('TG IN ONDA', 32, 48);
      if (Math.floor(t * 2) % 2) { x.fillStyle = '#ff3040'; x.beginPath(); x.arc(226, 38, 7, 0, 7); x.fill(); } x.fillStyle = '#fff'; x.font = 'bold 16px Arial'; x.fillText('LIVE', 238, 44);
      // lower third + ticker
      const hi = Math.floor(t / 6) % HEADLINES.length;
      x.fillStyle = 'rgba(255,255,255,.95)'; x.fillRect(0, 280, Wd, 44); x.fillStyle = '#0b1a3a'; x.font = 'bold 19px Arial'; x.textAlign = 'left';
      wrapLine(x, HEADLINES[hi], 16, 308, Wd - 32);
      x.fillStyle = '#c8102e'; x.fillRect(0, 324, Wd, 36); x.fillStyle = '#fff'; x.font = 'bold 17px Arial';
      const tick = HEADLINES.join('   ●   '); const tw = x.measureText(tick).width + 60; const off = (t * 90) % tw;
      x.fillText(tick, Wd - off, 348); x.fillText(tick, Wd - off + tw, 348);
      x.fillStyle = '#0b1a3a'; x.fillRect(0, 324, 150, 36); x.fillStyle = '#ffd83a'; x.fillText('IL CORRIERE', 12, 348);
    } else if (ch === 2) { // static
      const s = 4; for (let y = 0; y < H; y += s) for (let xx = 0; xx < Wd; xx += s) { const v = (Math.random() * 255) | 0; x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(xx, y, s, s); }
      x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(0, (t * 140) % H, Wd, 26);
    } else if (ch === 3) { // promo
      x.fillStyle = '#0a0408'; x.fillRect(0, 0, Wd, H);
      if (imgs.promo) { const s = H / imgs.promo.height; const w = imgs.promo.width * s; x.globalAlpha = 0.9; x.drawImage(imgs.promo, 640 - w - 10 + Math.sin(t * 0.3) * 6, 0, w, H); x.globalAlpha = 1; }
      const gr = x.createLinearGradient(0, 0, 420, 0); gr.addColorStop(0, 'rgba(10,4,8,1)'); gr.addColorStop(1, 'rgba(10,4,8,0)'); x.fillStyle = gr; x.fillRect(0, 0, 440, H);
      x.textAlign = 'left'; x.fillStyle = '#ffd83a'; x.font = 'bold 20px Impact, sans-serif'; x.fillText('ERA A LETTO ALLE 21. O NO?', 30, 70);
      x.fillStyle = '#ff3a2a'; x.font = 'bold 64px Impact, "Arial Black", sans-serif'; x.fillText('IL PROCESSO', 26, 150); x.fillText('DEL SECOLO', 26, 216);
      x.fillStyle = '#fff'; x.font = 'bold 18px Arial'; x.fillText('IN DIRETTA OVUNQUE · PROSSIMAMENTE', 30, 262);
      if (Math.floor(t * 1.5) % 2) { x.fillStyle = '#c8102e'; x.fillRect(30, 290, 120, 34); x.fillStyle = '#fff'; x.font = 'bold 20px Impact, sans-serif'; x.fillText('IN ONDA', 46, 315); }
    }
    if (st.tvOsd > 0) { x.fillStyle = 'rgba(0,0,0,.5)'; x.fillRect(Wd - 120, 16, 100, 40); x.fillStyle = '#8eff6a'; x.font = 'bold 26px monospace'; x.textAlign = 'right'; x.fillText('CH ' + (ch + 1), Wd - 30, 46); }
    tvTex.needsUpdate = true;
  }
  function wrapLine(x, s, px, py, maxW) { let str = s; while (x.measureText(str).width > maxW && str.length > 10) str = str.slice(0, -2); if (str !== s) str = str.slice(0, -1) + '…'; x.fillText(str, px, py); }

  // style for the Segreti page + credits
  const css = document.createElement('style');
  css.textContent = `
#seclist{list-style:none;margin:4px 0 18px;padding:0;display:grid;gap:2px;max-height:56vh;overflow:auto;scrollbar-width:thin}
#seclist li{display:grid;gap:3px;padding:8px 0 8px 14px;border-left:2px solid rgba(255,255,255,.12)}
#seclist li b{font:600 15px/1.25 var(--ui,system-ui);color:#8f84a8;letter-spacing:.03em}
#seclist li small{font-size:12.5px;line-height:1.35;color:#8f84a8}
#seclist li.on{border-left-color:var(--lime,#c8f03c)}#seclist li.on b{color:#fff}#seclist li.on small{color:#cfc6e4}
.secSum{margin:0 0 12px;color:#bfaee0;font-size:14px}
#eggCredits{position:fixed;inset:0;z-index:40;background:radial-gradient(120% 90% at 50% 40%,#170a2e,#05020a 70%);overflow:hidden;cursor:pointer;animation:ecIn .8s ease-out}
@keyframes ecIn{from{opacity:0}}
#eggCredits .crawl{position:absolute;left:50%;top:100%;width:min(680px,90vw);transform:translateX(-50%);text-align:center;color:#eee;font:16px/1.5 var(--ui,system-ui);animation:ecCrawl 42s linear forwards}
@keyframes ecCrawl{to{transform:translate(-50%,calc(-100% - 100vh))}}
#eggCredits p{margin:0 0 14px}
#eggCredits .h{font:400 46px/1 var(--disp,Impact,sans-serif);color:#c8f03c;letter-spacing:.04em;margin:30px 0 10px}
#eggCredits .t{font:700 22px/1.2 Georgia,"Times New Roman",serif;color:#fff;letter-spacing:.02em}
#eggCredits .s{color:#bfaee0}
#eggCredits .g{height:60px}
#eggCredits .r{display:grid;grid-template-columns:1fr 1fr;gap:18px;text-align:left}
#eggCredits .r span{text-align:right;color:#8f84a8;text-transform:uppercase;letter-spacing:.12em;font-size:12px;padding-top:4px}
#eggCredits .r b{font-weight:600;color:#fff}
#eggCredits .cskip{position:fixed;right:28px;top:22px;color:rgba(255,255,255,.6);font-size:13px}
@media (prefers-reduced-motion:reduce){#eggCredits .crawl{animation-duration:90s}}`;
  document.head.appendChild(css);

  const api = {
    attach(c) {
      attach(c);
      // expose the inner functions that update() needs
      api._end = () => { handGlass.visible = false; cartGlasses.forEach(x => { x.visible = true; }); st.spritz++; st.alc += 1; st.drink = null; markFound('spritz');
        if (W.mode === 'spritz') W.setMode('explore');
        if (st.spritz === 2) c.ui.toast('Due spritz. La stanza è un po\' più simpatica.');
        if (st.spritz === 3) c.ui.toast('Tre spritz: «pieno di alcol», direbbe il direttore');
        if (st.spritz >= 5) { c.ui.toast('Cinque spritz: samba!', 'gold'); markFound('sbronza'); st.spritz = 0; setTimeout(() => { if (W.mode === 'explore' && !W.dancing && W.gesture) W.gesture('dance'); }, 500); } };
      api._bed = () => { st.bedDone = true; st.yawn = { t: 0 }; c.audio.sfx('yawn'); c.ui.toast('Sono le 21: qualcuno è già a letto', 'gold'); markFound('bedtime'); if (c.dog && typeof c.dog.setMode === 'function' && c.dog.state && c.dog.state.mode === 'idle') c.dog.setMode('lie'); };
      api._wish = f => {
        c.audio.sfx('splash'); dropB.spawn(f.clone().add(V(0, 0.45, 0)), 16, V(0, 2.2, 0), 0.8);
        setTimeout(() => c.audio.sfx('wish'), 250); markFound('wish');
        const r = Math.random(), k = st.wishN = (st.wishN || 0) + 1;
        if (k === 1 || r < 0.34) { c.ui.toast('Desiderio esaudito: cappelletti per tutti!', 'gold'); const p = c.man.root.position; for (let i = 0; i < 6; i++) setTimeout(() => pastaB.spawn(p.clone().add(V((Math.random() - 0.5) * 3, 3.2, (Math.random() - 0.5) * 3)), 14, V(0, -0.5, 0), 1.6, 1), i * 280); }
        else if (r < 0.67) { c.ui.toast('Il cane ha deciso di fare il bagno'); if (c.dog && typeof c.dog.setMode === 'function') { c.dog.setMode('goto', { goal: f.clone().add(V(0.9, 0, 1.5)), speedGoal: 2.2, after: 'idle' }); st.dogBath = { t: 0, f }; } }
        else { c.ui.toast('Il desiderio è stato messo agli atti dal Gulag. Udienza alle 21.'); const F = api._x.fx(); F.confetti && F.confetti(f.clone().add(V(0, 1.6, 0)), 60); }
      };
      return api;
    },
    preUpdate, update,
    found: markFound, register(d) { if (d && d.id && !defs.some(x => x.id === d.id)) { defs.push(d); sync(); } },
    list, get drunk() { return drunkK(); }, state: st,
    _x: null, _end: null, _bed: null, _wish: null,
  };
  window.__eggs = api;
  return api;
}
