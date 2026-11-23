import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import './gltfsetup.js'; // meshopt decoder for every GLTFLoader (optimised Tripo models in assets/models)
import { createRenderer, createComposer, setupLights, applyQuality, autoQualityLevel, lowerQuality } from './scene.js';
import { installGfx, gfxGate } from './gfx.js'; // warm-up, detail materials, blobs (round 6 GRAFICA)
import { createUI } from './ui.js';
import { buildRoom, powerCable } from './room.js';
import { buildLevel } from './world.js';
import { buildCabinet } from './cabinet.js';
import { buildDog } from './dog.js';
import { Man } from './man.js';
import { Game } from './game.js';
import { DirectorGame } from './director.js';
import { buildDirectorCabinet } from './directorcab.js';
import { Audio, TRACKS } from './audio.js';
import { createFX } from './fx3d.js';
import { createInput, createWorld } from './explore.js';
import { installNet } from './net.js';
import { createEggs } from './eggs.js';
import { rigTypewriter, rigExtinguisher, rigShell, buildLightSwitch, fallbackFX } from './props.js';
import { buildNewspapers, newspaperPlugin, buildPrints } from './newspaper.js';
import { buildMural, muralPlugin } from './mural.js';
import { buildCaso, casoPlugin } from './caso.js';
import { buildGulag } from './gulag.js';
import { buildCronache } from './cronache.js';
import { createMinigames } from './minigames/index.js';
import { loadImage, tex, clamp, lerp, smooth, ease } from './util.js';
import { installPerf } from './perf.js';
import { buildQuartiere } from './quartiere.js';
import { createSave } from './save.js';
import { playOpening } from './opening.js';
import './ai.js'; // window.__ai (Claude provider chain + offline fallback), window.__personas — installed on import
import { installNPCs } from './npcs.js'; // the friends of the group as NPCs (E to talk)
import { createInteractions } from './interact/index.js'; // emote wheel (B), friend actions, world props (interact/)
import { installPhone } from './phone.js'; // in-game phone (T): group chat, contacts, photos, map, Claude settings

// ======================= CONFIG (all tunables) =======================
export const CONFIG = {
  files: { man: (window.__MAN_FILE || './man.glb'), anims: './anims.json', side: './side.jpg', baseSide: './base_side.jpg', baseFront: './base_front.jpg', marquee: './marquee.jpg', title: './title.png', titleClean: './title_clean.png', face: './face.png' },
  cabinetPos: [0.35, 0, 0.02],
  cabinet2Pos: [2.5, 0, 0.02],   // second cabinet: IL DIRETTORE INCASSA
  man: {
    play: [0.19, 0, 1.06], yaw: Math.PI, fwd: [0, 0, -1], lean: 0.12,
    leftOff: [0, 0.056, 0.02],   // wrist target relative to joystick ball (world)
    rightOff: [0.005, 0.09, 0.115],   // wrist target relative to P1 button cluster centre (world)
    startOff: [0.0, 0.085, 0.11],   // wrist target relative to P1 start button when pressing START
    walkSpeed: 1.3,
    // the intro walk ends a step back from the cabinet: from there the player explores
    path: [[4.75, 0, 3.05], [3.75, 0, 2.4], [2.8, 0, 1.8], [2.0, 0, 1.62], [1.25, 0, 1.58], [0.72, 0, 1.52], [0.38, 0, 1.42], [0.22, 0, 1.36]],
    walkStart: 7.0,
  },
  dog: { pos: [-0.45, 0, 1.25], yaw: 2.44 },
  lightSwitch: [-0.5, 1.18, 0.0],
  screenLight: { intensity: 7 },
  cams: {
    // [position, lookAt, fov]
    introA: [[-1.25, 0.42, 2.35], [0.1, 0.75, 0.45], 40],
    photo: [[1.25, 1.55, 3.3], [0.15, 0.85, 0.5], 38],
    track: [[-0.65, 1.3, 2.85], null, 40],
    spalla: [[0.62, 2.12, 2.05], [0.33, 1.18, 0.6], 31],
    schermo: { dist: 0.5, fov: 32, pad: 1.035, dolly: 1.35 },  // 'inside the cabinet': the CRT fills the view (distance computed from fov/aspect); the man is hidden
    cinema: { center: [0.1, 0.9, 0.9], radius: 2.3, height: 1.05, look: [0.05, 0.85, 0.75], fov: 42 },
  },
  intro: { length: 16.0 },
};
// =====================================================================

const q = new URLSearchParams(location.search);
const $ = s => document.querySelector(s);
const coarse = matchMedia('(pointer: coarse)').matches;
const low = coarse || Math.min(innerWidth, innerHeight) < 500;
const V3 = a => new THREE.Vector3(...a);

const ui = createUI();
const save = createSave({ ui }); // window.__save: achievements, stats, records (save.js)
const opening = playOpening({ ui, skip: q.has('auto') || q.has('skip') || q.has('noopening') || !!window.__ASSETS_NO_OPENING }); // GTA-style opening over the loading (opening.js)

function showError(e) { console.error(e); ui.error('Errore: ' + (e && e.message || e)); }

async function main() {
  const el = $('#app');
  const renderer = createRenderer(el, low);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, el.clientWidth / el.clientHeight, 0.03, 40);
  const lights = setupLights(scene, renderer, low);
  const { composer, bloom, final } = createComposer(renderer, scene, camera, low);

  // ---------- loading ----------
  const prog = { glb: 0, rest: 0 };
  const setProg = () => { const p = prog.glb * 0.75 + prog.rest * 0.25; ui.loading.set(p, p < 0.75 ? 'Carico il giocatore…' : 'Accendo il cabinato…'); };
  const tl = new THREE.TextureLoader();
  const F = CONFIG.files;
  const EMB = window.__ASSETS || null; // single-file offline build: everything embedded
  if (EMB) for (const k in EMB) F[k] = EMB[k];
  let restDone = 0; const restN = 8;
  const bump = x => { restDone++; prog.rest = restDone / restN; setProg(); return x; };
  const ld = u => tl.loadAsync(u).then(t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return bump(t); });
  const fromB64 = b64 => { prog.glb = 1; setProg(); const bin = Uint8Array.from(atob(b64.trim()), c => c.charCodeAt(0)); return new GLTFLoader().parseAsync(bin.buffer, './'); };
  const glbP = EMB ? fromB64(EMB.man)
    : /\.txt$/.test(F.man) ? fetch(F.man).then(r => r.text()).then(fromB64)
    : new GLTFLoader().loadAsync(F.man, e => { if (e.total) { prog.glb = e.loaded / e.total; setProg(); } });
  const [gltf, anims, side, baseSide, baseFront, marquee, title, titleClean, face] = await Promise.all([
    glbP.then(g => { prog.glb = 1; setProg(); return g; }),
    (EMB ? Promise.resolve(JSON.parse(EMB.anims)) : fetch(F.anims).then(r => r.json())).then(bump),
    ld(F.side), ld(F.baseSide), ld(F.baseFront), ld(F.marquee),
    loadImage(F.title).then(bump), loadImage(F.titleClean).then(bump), loadImage(F.face).then(bump),
  ]);

  // ---------- game + audio ----------
  const audio = new Audio();
  let music = null;
  const playMusic = name => { if (music === name) return; music = name; if (name && TRACKS[name]) audio.play(TRACKS[name]); else audio.stop(); };
  const game = new Game({ title, titleClean, face }, (ev, data) => onGameEvent(ev, data));
  const screenTex = tex(game.canvas, { nearest: true });
  game.draw(); screenTex.needsUpdate = true;
  // second cabinet game: IL DIRETTORE INCASSA (director.js)
  const dgame = new DirectorGame({}, (ev, data) => onDirEvent(ev, data));
  const dTex = tex(dgame.canvas, { nearest: true });
  dgame.draw(); dTex.needsUpdate = true;

  // ---------- world ----------
  const room = buildRoom(scene, { reflections: !low, reflQuality: 0.5, level: true });
  // level around the arcade: lounge + garden (world.js); colliders/zones are used by explore.js
  const level = buildLevel(scene, { low, lights, camera, renderer, screenTex, room, getFX: () => (typeof getFX === 'function' ? getFX() : null),
    onZone: zn => { S.zone = zn; try { if (typeof refreshHint === 'function') refreshHint(); else ui?.hud?.setLocation?.(zn); } catch (e) { } window.dispatchEvent(new CustomEvent('bigalesso:zone', { detail: zn })); } });
  const cab = buildCabinet({ side, baseSide, baseFront, marquee, screen: screenTex });
  cab.group.position.set(...CONFIG.cabinetPos); scene.add(cab.group);
  const cp = CONFIG.cabinetPos;
  scene.add(powerCable([[cp[0] + 0.25, 0.06, cp[2] + 0.02], [cp[0] + 0.38, 0.01, cp[2] + 0.08], [cp[0] + 0.6, 0.004, cp[2] + 0.22], [cp[0] + 0.85, 0.004, cp[2] + 0.3]]));
  const brick = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.035, 0.055), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 }));
  brick.position.set(cp[0] + 0.9, 0.0175, cp[2] + 0.31); brick.rotation.y = 0.4; brick.castShadow = true; scene.add(brick);
  scene.add(powerCable([[cp[0] + 0.94, 0.004, cp[2] + 0.33], [cp[0] + 1.1, 0.004, cp[2] + 0.36], [cp[0] + 1.2, 0.004, cp[2] + 0.2], [cp[0] + 1.25, 0.004, cp[2] + 0.02]]));
  cab.group.updateMatrixWorld(true);
  const cab2 = buildDirectorCabinet(dTex);
  cab2.group.position.set(...CONFIG.cabinet2Pos); scene.add(cab2.group);
  { const c2 = CONFIG.cabinet2Pos; scene.add(powerCable([[c2[0] + 0.25, 0.06, c2[2] + 0.02], [c2[0] + 0.4, 0.01, c2[2] + 0.1], [c2[0] + 0.62, 0.004, c2[2] + 0.12], [c2[0] + 0.86, 0.004, c2[2] + 0.03]])); }
  cab2.group.updateMatrixWorld(true);
  scene.updateMatrixWorld(true);

  const dog = buildDog();
  dog.onSound = n => audio.sfx(n === 'woof' ? 'woof' : n);
  dog.root.position.set(...CONFIG.dog.pos); dog.root.rotation.y = CONFIG.dog.yaw; scene.add(dog.root);

  const man = new Man(gltf, anims);
  scene.add(man.root);
  man.fwd.set(...CONFIG.man.fwd).normalize();

  // interactive props
  const props = {
    table: room.table,
    typewriter: rigTypewriter(room.table, room),
    extinguisher: rigExtinguisher(room),
    shell: rigShell(room.table, room),
    lightSwitch: buildLightSwitch(scene, V3(CONFIG.lightSwitch)),
  };

  // 3D effects (fx3d.js) with a tiny fallback
  let fx = null;
  try { fx = createFX(scene, camera, { lights, cab, renderer, low }); if (!low && fx.dust) fx.dust(true); } catch (e) { console.warn('fx3d unavailable', e); fx = null; }
  const fxFallback = fallbackFX(scene);
  const getFX = () => fx || fxFallback;

  // screen geometry (world)
  const screenCenter = new THREE.Vector3(); cab.bz.getWorldPosition(screenCenter);
  const screenNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(cab.bz.getWorldQuaternion(new THREE.Quaternion()));
  const sLight = new THREE.RectAreaLight(0x8040ff, 0, 0.53, 0.4);
  sLight.position.copy(screenCenter).addScaledVector(screenNormal, 0.03);
  sLight.lookAt(sLight.position.clone().add(screenNormal));
  scene.add(sLight);
  const mqLight = new THREE.PointLight(0xc070ff, 0, 1.6, 2);
  mqLight.position.set(cp[0], 2.08, cp[2] + 0.55); scene.add(mqLight);
  const sampler = document.createElement('canvas'); sampler.width = 4; sampler.height = 3;
  const sctx = sampler.getContext('2d', { willReadFrequently: true });
  const sCol = new THREE.Color(); let sLum = 0;
  // ---------- cabinets: cabinet mode works per cabinet (world.cabIndex) ----------
  const mkCab = (id, name, c, g, tx, sl, mq) => {
    const off = c.group.position.clone().sub(V3(CONFIG.cabinetPos));
    const sc = new THREE.Vector3(); c.bz.getWorldPosition(sc);
    const sn = new THREE.Vector3(0, 0, 1).applyQuaternion(c.bz.getWorldQuaternion(new THREE.Quaternion()));
    return { id, name, cab: c, game: g, tex: tx, off, pos: c.group.position.clone(), screenCenter: sc, screenNormal: sn,
      schermoPos: sc.clone().addScaledVector(sn, CONFIG.cams.schermo.dist), sLight: sl, mqLight: mq, glassMats: c.glassMat ? [c.glassMat] : [],
      sCol: new THREE.Color(), sLum: 0, p1caps: ['p1a', 'p1b', 'p1c', 'p1d', 'p1e', 'p1f'].map(n => c.buttons[n].cap),
      play: { pos: V3(CONFIG.man.play).add(off), yaw: CONFIG.man.yaw } };
  };
  const cabinets = [mkCab('bigalesso', 'Bigalesso Games', cab, game, screenTex, sLight, mqLight)];
  {
    const C2 = mkCab('direttore', 'Il Direttore Incassa', cab2, dgame, dTex, null, null);
    const sl2 = new THREE.RectAreaLight(0xff4020, 0, 0.53, 0.4);
    sl2.position.copy(C2.screenCenter).addScaledVector(C2.screenNormal, 0.03); sl2.lookAt(sl2.position.clone().add(C2.screenNormal)); scene.add(sl2);
    const mq2 = new THREE.PointLight(0xff5030, 0, 1.6, 2); mq2.position.set(CONFIG.cabinet2Pos[0], 2.08, CONFIG.cabinet2Pos[2] + 0.55); scene.add(mq2);
    C2.sLight = sl2; C2.mqLight = mq2; cabinets.push(C2);
  }

  // walk path
  const path = new THREE.CatmullRomCurve3(CONFIG.man.path.map(V3), false, 'centripetal');
  const pathLen = path.getLength();
  const walkProfile = []; { let d = 0, v = 0; const vmax = CONFIG.man.walkSpeed, acc = 1.6, dec = 1.1; for (let t = 0; t < 12; t += 1 / 120) { const vb = Math.sqrt(Math.max(0, 2 * dec * (pathLen - d))); v = Math.min(vmax, v + acc / 120, vb); d = Math.min(pathLen, d + v / 120); walkProfile.push([d, v]); if (d >= pathLen - 1e-4) break; } }
  const walkDur = walkProfile.length / 120;
  const walkAt = t => { if (t <= 0) return [0, 0]; const i = Math.min(walkProfile.length - 1, Math.floor(t * 120)); return t >= walkDur ? [pathLen, 0] : walkProfile[i]; };

  // controls world positions
  const W = o => o.getWorldPosition(new THREE.Vector3());
  const glassMats = cab.glassMat ? [cab.glassMat] : []; if (!glassMats.length) cab.group.traverse(o => { if (o.isMesh && o.material && o.material.blending === THREE.AdditiveBlending) glassMats.push(o.material); });
  const p1caps = ['p1a', 'p1b', 'p1c', 'p1d', 'p1e', 'p1f'].map(n => cab.buttons[n].cap);

  // ---------- state ----------
  const S = {
    phase: 'loading', introT: 0, freeze: q.has('freeze'), camMode: 0, camModes: ['Schermo', 'Spalla', 'Cinema'],
    shake: 0, ik: 0, lean: 0, look: 0, press: 0, startPress: 0, manYaw: 0, prevPhase: 0, prevGameState: 'attract',
    curPos: new THREE.Vector3(...CONFIG.cams.introA[0]), curLook: new THREE.Vector3(...CONFIG.cams.introA[1]), curFov: 40,
    marquee: 0, screenOn: 0, lightK: 0.03, orbit: 0, coinFlash: 0, twoP: false, help: false,
  };
  camera.position.copy(S.curPos); camera.lookAt(S.curLook);

  // ---------- input ----------
  const input = createInput(el);
  // ---------- mouse look (pointer lock) ----------
  const LOOK_MODES = ['explore', 'goto'];
  const overlayOpen = () => !!(document.querySelector('#rdr.on') || document.body.dataset.overlay);
  input.canLock = () => !ui.coarse && S.phase === 'world' && !!world && LOOK_MODES.includes(world.mode) && !ui.menuOpen && !overlayOpen();
  // Esc releases the lock in the browser: open the pause menu (unless something else took the mouse on purpose)
  input.onLockLost = () => setTimeout(() => { if (S.phase === 'world' && world && LOOK_MODES.includes(world.mode) && !ui.menuOpen && !overlayOpen()) ui.menu.show('pause'); }, 120);
  const lookHint = document.createElement('div');
  lookHint.textContent = 'Clic per controllare la visuale';
  lookHint.style.cssText = 'position:fixed;left:50%;bottom:4.5vh;transform:translateX(-50%);z-index:6;font:500 13px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;letter-spacing:.02em;color:rgba(255,255,255,.82);text-shadow:0 1px 3px #000;opacity:0;transition:opacity .6s;pointer-events:none';
  document.body.appendChild(lookHint);
  const touchIn = { up: 0, down: 0, left: 0, right: 0, fire: 0, bomb: 0, start: 0 };
  ui.bindTouch({
    stick(dx, dy, active) {
      input.touch.active = active; input.touch.x = dx; input.touch.y = dy;
      touchIn.left = dx < -0.35 ? 1 : 0; touchIn.right = dx > 0.35 ? 1 : 0; touchIn.up = dy < -0.35 ? 1 : 0; touchIn.down = dy > 0.35 ? 1 : 0;
    },
    down(k) { if (S.phase === 'intro') { skipIntro(); return; } touchIn[k] = 1; input.touch.btn[k] = 1; input.touch.edge.add(k); touchIn['_t' + k] = performance.now(); },
    // a quick tap still lasts ~3 frames: the cabinet games poll touchIn once per frame and would miss a 40 ms tap
    up(k) { const rel = () => { touchIn[k] = 0; input.touch.btn[k] = 0; }, held = performance.now() - (touchIn['_t' + k] || 0); held >= 110 ? rel() : setTimeout(rel, 110 - held); },
  });
  // phone keyboard for the typewriter
  if (ui.kbd) {
    ui.kbd.addEventListener('input', () => { const v = ui.kbd.value; ui.kbd.value = ''; for (const ch of v) world && world.mode === 'type' && world.typeKey(ch); });
    ui.kbd.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); world && world.typeKey('\n'); } });
  }

  // ---------- UI ----------
  const camName = () => (S.phase === 'world' && world && world.mode !== 'cabinet') ? world.camMode : S.camModes[S.camMode];
  function cycleCam() {
    if (S.phase === 'world' && world && world.mode !== 'cabinet') world.camMode = world.camMode === 'Segui' ? 'Cinema' : 'Segui';
    else S.camMode = (S.camMode + 1) % 3;
    ui.setCamLabel(camName());
  }
  function toggleMute() { audio.setMuted(!audio.muted); ui.setMuted(audio.muted); }
  function toggleHelp(v) { const open = v === undefined ? !(ui.menuOpen && ui.menu.page === 'controls') : v; if (open) ui.menu.show('controls'); else ui.menu.hide(); }
  ui.onCam(cycleCam); ui.onMute(toggleMute); ui.onSkip(() => skipIntro());
  if (q.has('cam')) { S.camMode = (+q.get('cam')) % 3; ui.setCamLabel(S.camModes[S.camMode]); }
  // settings -> engine
  const qctx = () => ({ renderer, composer, bloom, final, lights, room, fx, scene, resize });
  let qLevel = null;
  function applySettings(all) {
    const want = all.quality === 'auto' ? (S.autoQ || autoQualityLevel()) : all.quality;
    if (want !== qLevel) { qLevel = want; applyQuality(want, qctx()); }
    audio.setVolumes && audio.setVolumes({ master: all.master, music: all.music, sfx: all.sfx });
    input.sens = all.sens; input.invertY = !!all.invertY;
  }
  ui.onSetting((k, v, all) => applySettings(all));
  applySettings(ui.settings); // gfx: preset applied while loading (no recompile/realloc when Play is pressed)
  S.phase = 'ready';
  const begin = (mode = 'explore') => {
    if (S.phase !== 'ready') return;
    try { audio.init(); } catch (e) { }
    applySettings(ui.settings);
    ui.markStarted(); ui.showTop(true); ui.showSkip(true); ui.setHint(null);
    S.phase = 'intro'; S.introT = q.has('t') ? +q.get('t') : 0;
    if (q.has('skip') || mode !== 'explore') skipIntro();
    if (mode === 'arcade') setTimeout(() => world.enterCabinet && world.enterCabinet(), 150);
  };
  ui.onMenu(a => {
    if (a === 'explore' || a === 'arcade') {
      if (S.phase === 'ready') begin(a);
      else if (a === 'arcade' && S.phase === 'world' && world.mode === 'explore') world.enterCabinet();
    }
    if (a === 'resume' || a === 'explore') { try { audio.init(); } catch (e) { } }
    if (a === 'resume' && !ui.coarse && S.phase === 'world' && world && LOOK_MODES.includes(world.mode)) input.requestLock();
  });
  // joining/creating an online room from the main menu drops you straight into the room
  ui.lobby.onCreate(() => { if (S.phase === 'ready') begin('online'); });
  ui.lobby.onJoin(() => { if (S.phase === 'ready') begin('online'); });
  // audio unlock: any click/key (menus included) creates or resumes the AudioContext, so the intro starts with sound
  // even when it was launched without a gesture or the browser suspended the context
  const unlockAudio = () => { if (S.phase !== 'loading' && !audio.running) { try { audio.init(); } catch (e) { } } };
  for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, unlockAudio, { capture: true, passive: true });
  // gfx: the menu appears once the shader warm-up is done (max 12 s); test URLs (?auto/?skip) don't wait
  if (q.has('auto') || q.has('skip')) ui.loading.ready(); else gfxGate(() => { ui.loading.ready(); if (S.phase !== 'ready') setTimeout(() => ui.menu.hide(), 320); });
  if (q.has('auto')) setTimeout(() => { ui.menu.hide(); ui.markStarted(); begin('explore'); }, 300);

  const MODE_NAMES = { paw: 'Dammi la zampa', pickball: 'La palla', throw: 'Lancio della palla', explore: '', goto: '', cabinet: 'Al cabinato', type: 'Macchina da scrivere', pet: 'Coccole al cane', shell: 'La conchiglia', grab: 'Estintore', ungrab: 'Estintore', switch: 'Interruttore', coin: 'Gettone', leaving: '', standup: '' };
  const HINTS = {
    explore: [['W A S D', 'muoviti'], ['Shift', 'corri'], ['E', 'interagisci'], ['R', 'alternativa'], ['1 2 3', 'gesti'], ['Esc', 'menu']],
    cabinet: [['← →', 'muovi'], ['Z', 'spara'], ['X', 'bomba'], ['Invio', 'start'], ['2', 'entra P2'], ['Esc', 'alzati']],
    cabinet2: [['W A S D', 'P1'], ['F G', 'spara/bomba P1'], ['↑ ↓', 'P2'], ['L K', 'spara/bomba P2'], ['Esc', 'alzati']],
    carry: [['W A S D', 'muoviti'], ['F', 'spruzza'], ['E', 'rimetti sul supporto']],
    type: [['Tasti', 'scrivi'], ['Invio', 'a capo'], ['Esc', 'alzati']],
    shell: [['E', 'posa la conchiglia'], ['Esc', 'posa']],
    director: [['← →', 'schiva'], ['↓', 'abbassati'], ['↑', 'para'], ['Z', 'bacio volante'], ['X', 'spritz'], ['Esc', 'alzati']],
  };
  function refreshHint() {
    if (!world || S.phase !== 'world') return;
    const m = world.mode;
    const h = m === 'cabinet' ? (world.cabIndex > 0 ? (cabinets[world.cabIndex] && cabinets[world.cabIndex].hints) || HINTS.director : S.twoP ? HINTS.cabinet2 : HINTS.cabinet) : m === 'type' ? HINTS.type : m === 'shell' ? HINTS.shell : (m === 'pet' || m === 'paw' || m === 'throw' || m === 'pickball') ? null : world.carry ? HINTS.carry : HINTS.explore;
    ui.setHint(h);
    ui.hud.setLocation((world.carry && m === 'explore') ? 'Con l\'estintore' : (world.dancing ? 'Si balla!' : MODE_NAMES[m] || S.zone || 'Sala giochi'));
    ui.showSkip(false);
    ui.setCarry(world.carry);
    document.body.dataset.twop = S.twoP ? '1' : '';
    ui.setCamLabel(camName());
  }

  let world = null;
  function startWorld() {
    S.phase = 'world'; ui.showSkip(false);
    S.marquee = 1; S.screenOn = 1;
    world.yaw = man.root.rotation.y; world.camYaw = world.yaw + Math.PI + 0.35;
    world.setMode('explore'); document.body.dataset.mode = 'explore';
    audio.setHum && audio.setHum(1);
    refreshHint();
    if (!S.welcomed) { S.welcomed = true; setTimeout(() => world.toast(ui.coarse ? 'Pollice sinistro per camminare · tasto verde per interagire' : 'WASD per muoverti · E per interagire · Esc per il menu'), 400); }
  }
  function skipIntro() {
    if (S.phase !== 'intro') return;
    S.introT = CONFIG.intro.length; man.root.position.copy(V3(CONFIG.man.path[CONFIG.man.path.length - 1])); man.root.rotation.y = CONFIG.man.yaw;
    S.lightK = 1; final.uniforms.bars.value = 0; final.uniforms.fade.value = 1;
    const fp = world.followPose(man.root.position, CONFIG.man.yaw + Math.PI + 0.35); S.curPos.copy(fp.pos); S.curLook.copy(fp.look); S.curFov = fp.fov;
    startWorld();
  }

  // ---------- game events ----------
  function onGameEvent(ev, data) {
    save.gameEvent('bigalesso', ev, data);
    switch (ev) {
      case 'start': audio.sfx('coin'); setTimeout(() => audio.sfx('start'), 120); playMusic('game'); S.startPress = 0.45; break;
      case 'stage': playMusic('game'); break;
      case 'boss': playMusic('boss'); break;
      case 'warning': playMusic(null); audio.sfx('warning'); break;
      case 'bomb': audio.sfx('bomb'); S.shake = Math.max(S.shake, 0.06); dog.state.alert = 1; getFX().pulse && getFX().pulse(0xffa040, 1); break;
      case 'die': audio.sfx('die'); S.shake = Math.max(S.shake, 0.03); break;
      case 'explode': audio.sfx('explode', data || 1); if ((data || 1) > 1.8) S.shake = Math.max(S.shake, 0.012); if (fx && fx.pulse && (data || 1) > 1.2) fx.pulse(sCol.getHex(), Math.min(1, (data || 1) / 3)); break;
      case 'bossdie': audio.sfx('bossdie'); dog.react && dog.react('jump'); getFX().confetti(cab.group.localToWorld(new THREE.Vector3(0, 1.95, 0.5)), 180); break;
      case 'clear': playMusic(null); audio.sfx('clear'); dog.state.wag = 1; setTimeout(() => man.playGesture('agree'), 400); getFX().confetti(cab.group.localToWorld(new THREE.Vector3(0, 1.95, 0.5)), 200); break;
      case 'gameover': playMusic(null); audio.sfx('gameover'); setTimeout(() => man.playGesture('headShake'), 300); setTimeout(() => audio.sfx('woof'), 1400); break;
      case 'ending': playMusic(TRACKS.ending ? 'ending' : 'title'); dog.state.wag = 1; getFX().confetti(screenCenter.clone().add(new THREE.Vector3(0, 0.3, 0.4)), 220); break;
      case 'join2': S.twoP = true; audio.sfx('join2'); world && world.toast('Giocatore 2 in partita! P1: WASD · F · G — P2: Frecce · L · K', 'gold'); ui.setP2Hint(false); refreshHint(); break;
      case 'combo': audio.sfx('combo', data); if (data >= 3 && world) world.toast('COMBO x' + data + '!', 'gold'); if (data >= 4) getFX().sparkles && getFX().sparkles(screenCenter.clone().addScaledVector(screenNormal, 0.15)); break;
      default: audio.sfx(ev, data);
    }
  }

  // ---------- director cabinet events ----------
  function onDirEvent(ev, data) {
    save.gameEvent('direttore', ev, data);
    const C = cabinets[1]; if (!C) return;
    switch (ev) {
      case 'start': audio.sfx('coin'); setTimeout(() => audio.sfx('start'), 120); S.startPress = 0.45; break;
      case 'bell': audio.sfx('dBell'); break;
      case 'tell': audio.sfx('dTell', data === 'hay' ? 3 : data === 'jab' ? 1 : 2); break;
      case 'swing': audio.sfx('dSwing'); break;
      case 'dodge': audio.sfx('dDodge'); break;
      case 'miss': audio.sfx('dWhoosh'); break;
      case 'hit': audio.sfx('dPunch', data); S.shake = Math.max(S.shake, 0.008 + (data || 10) * 0.0008); dog.state.alert = 1; break;
      case 'perfect': audio.sfx('dPerfect'); break;
      case 'block': audio.sfx('dBlock'); break;
      case 'kiss': case 'counter': audio.sfx('dKiss'); getFX().hearts && getFX().hearts(C.screenCenter.clone().addScaledVector(C.screenNormal, 0.25), ev === 'kiss' ? 8 : 4); break;
      case 'drink': audio.sfx('gulp'); break;
      case 'ex': audio.sfx('dEx'); break;
      case 'tired': audio.sfx('dTired'); break;
      case 'fake': audio.sfx('dFake'); break;
      case 'combo': audio.sfx('combo', Math.min(4, (data || 3) / 3)); break;
      case 'roundwin': audio.sfx('dCrowd'); setTimeout(() => man.playGesture('agree'), 300); getFX().confetti && getFX().confetti(C.cab.group.localToWorld(new THREE.Vector3(0, 1.95, 0.5)), 160); dog.state.wag = 1; break;
      case 'ko': audio.sfx('dKO'); S.shake = Math.max(S.shake, 0.04); break;
      case 'gameover': setTimeout(() => man.playGesture('headShake'), 300); break;
    }
  }

  // ---------- resize ----------
  function resize() {
    const w = el.clientWidth, h = el.clientHeight;
    renderer.setSize(w, h); composer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);

  // ---------- per-frame helpers ----------
  const fovFor = f => { const a = camera.aspect; return a < 1.25 ? THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(f) / 2) * 1.25 / a)) : f; };
  function camShot(name) { const c = CONFIG.cams[name]; return { pos: V3(c[0]), look: c[1] ? V3(c[1]) : null, fov: c[2] }; }
  const shots = { introA: camShot('introA'), photo: camShot('photo'), track: camShot('track'), spalla: camShot('spalla'),
    schermo: { pos: screenCenter.clone().addScaledVector(screenNormal, CONFIG.cams.schermo.dist), look: screenCenter.clone(), fov: CONFIG.cams.schermo.fov } };

  function setLights(k) {
    const b = lights.base;
    lights.hemi.intensity = b.hemi * k; lights.key.intensity = b.key * k; lights.fill.intensity = b.fill * k; scene.environmentIntensity = b.env * Math.max(0.05, k);
  }

  // newspaper (Corriere delle Due Torri) + garden mural + lounge prints (newspaper.js / mural.js)
  // built before createWorld: the mural pushes its colliders into level.colliders
  const news = buildNewspapers(scene, { room, low, audio });
  buildPrints(scene, { low });
  const mural = buildMural(scene, { level, low, getFX });
  const caso = buildCaso(scene, { level, low, getFX }); // "Il caso della collana" (Corriere N.281 quest): colliders before createWorld
  const plugins = [newspaperPlugin(news), muralPlugin(mural), casoPlugin(caso)]; // explore.js plugins (items + modes + camera)
  const cron = buildCronache(scene, { level, low, getFX }); plugins.push(cron.plugin); // Corriere n. 281 side news easter eggs (cronache.js)
  // the neighbourhood beyond the garden gate (quartiere.js): colliders/zones/bounds/anchors before createWorld and buildGulag
  const quartiere = buildQuartiere({ scene, level, low, getFX, ui, audio, renderer }); plugins.push(quartiere.plugin);
  // minigames (src/minigames): extra cabinets (pushed into `cabinets`, after the quartiere so its anchors exist), night zombies, plugins
  const MG = createMinigames({ scene, level, audio, getFX, get S() { return S; }, CONFIG, ui, low, mkCab, cabinets, man, dog, camera, renderer, playMusic: n => playMusic(n), getWorld: () => world, getInput: () => input });
  plugins.push(...MG.plugins); // minigames: Discord desk, sushi, quiz table, Processo AI, Corriere AI
  const npcs = installNPCs({ scene, gltf, anims, Man, man, level, ui, audio, camera, input, getFX, low, S }); plugins.push(npcs.plugin); // friends of the group chat (npcs.js): clones the man's bind pose, so before his first update
  const IA = createInteractions({ scene, man, ui, audio, getFX, level, input, S, npcs, renderer, news }); plugins.push(IA.plugin); // interact/: emotes, friend actions, props

  // ---------- explore world ----------
  // easter eggs: props + colliders must exist before createWorld (explore merges level colliders at init)
  const eggs = createEggs({ scene, level, room, screenTex, low });
  const gulag = buildGulag({ scene, level, lights, low, audio, ui, man, dog, camera, getFX }); // secret basement (gulag.js): colliders before createWorld
  world = createWorld({
    scene, camera, man, dog, cab, game, audio, ui, CONFIG, S, props, input, TRACKS, getFX, level, cabinets, plugins,
    playMusic: n => playMusic(n),
    musicBack: () => playMusic(game.state === 'attract' ? 'title' : (game.boss ? 'boss' : 'game')),
    onMode: m => { refreshHint(); ui.wakeHint(); ui.setP2Hint(m === 'cabinet' && !(world && world.cabIndex > 0) && ('input2' in game) && !S.twoP); },
  });
  // online multiplayer (net.js): must be installed before the man's first update (clones his bind pose)
  const net = installNet({ scene, gltf, anims, Man, man, dog, cab, game, world, S, CONFIG, audio, ui });
  const phone = installPhone({ ui, audio, level, S, getFX, man, npcs }); // in-game phone (phone.js): T / P
  gulag.attach(world);
  eggs.attach({ world, man, dog, cab, game, audio, ui, getFX, input, S, camera, CONFIG, TRACKS, playMusic, musicBack: () => playMusic(game.state === 'attract' ? 'title' : (game.boss ? 'boss' : 'game')) });

  // footsteps from the real foot bones: works for walk, run, turning and every clip; surface from the zone
  const _fv = new THREE.Vector3(), _lastRoot = new THREE.Vector3(); let _rootSpd = 0, _rootInit = false;
  const feet = { Left: { min: 0.2, up: true, t: 0 }, Right: { min: 0.2, up: true, t: 0 } };
  function footsteps(dt) {
    if (!man.bones || !man.bones.LeftFoot || !(S.phase === 'intro' || S.phase === 'world') || dt <= 0) return;
    const rp = man.root.position;
    if (!_rootInit) { _lastRoot.copy(rp); _rootInit = true; }
    const d = Math.hypot(rp.x - _lastRoot.x, rp.z - _lastRoot.z); _lastRoot.copy(rp);
    if (d < 0.5) _rootSpd += (d / dt - _rootSpd) * Math.min(1, dt * 10); // teleports don't count
    const moving = _rootSpd > 0.35 || (man.speed || 0) > 0.35;
    const now = performance.now() / 1000;
    for (const side of ['Left', 'Right']) {
      const f = feet[side];
      const fy = man.bones[side + 'Foot'].getWorldPosition(_fv).y - rp.y;
      f.min = Math.min(fy, f.min + dt * 0.03);
      if (fy > f.min + 0.045) f.up = true;
      else if (f.up && fy < f.min + 0.02) {
        f.up = false;
        if (moving && now - f.t > 0.16) {
          f.t = now;
          let surf = 'tile';
          if (gulag && gulag.inside) surf = 'stone';
          else { const z = level && level.zoneAt ? level.zoneAt(rp.x, rp.z) : null; surf = z === 'Giardino' ? 'grass' : z === 'Salotto' ? 'wood' : z === 'Il Gulag' ? 'stone' : 'tile'; }
          const v = clamp(0.55 + _rootSpd * 0.22, 0.5, 1.2) * (S.phase === 'intro' ? 1.1 : 1);
          audio.sfx('step_' + surf, v);
        }
      }
    }
  }

  function introUpdate(T, dt) {
    if (T < 1.2) S.marquee = 0;
    else if (T < 2.3) { const on = Math.sin(T * 47) + Math.sin(T * 13.1) > 0.3; S.marquee = on ? 1 : 0.05; }
    else S.marquee = 1;
    S.screenOn = clamp((T - 2.4) / 0.9, 0, 1);
    S.lightK = 0.035 + 0.965 * smooth((T - 3.3) / 2.2);
    const wt = T - CONFIG.man.walkStart;
    const [d, v] = walkAt(wt);
    const u = clamp(d / pathLen, 0, 1);
    if (wt < 0) { man.root.position.set(...CONFIG.man.path[0]); man.setSpeed(0); }
    else {
      const p = path.getPointAt(u); man.root.position.copy(p);
      man.setSpeed(v);
      const tg = path.getTangentAt(Math.min(u, 0.999));
      const yawPath = Math.atan2(tg.x, tg.z);
      const arrive = smooth((wt - walkDur + 0.15) / 0.8);
      let dy = CONFIG.man.yaw - yawPath; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
      S.manYaw = yawPath + dy * arrive; man.root.rotation.y = S.manYaw;
    }
    const arriveT = CONFIG.man.walkStart + walkDur;
    S.ik = 0; S.lean = 0; S.look = smooth((T - arriveT + 0.4) / 1.0);
    man.reach = { left: null, right: null };
    // the man looks at the cabinet, then turns toward the camera to wave at it (head + part of the body), then back
    const wv = smooth((T - arriveT - 0.3) / 0.7) * (1 - smooth((T - arriveT - 3.0) / 0.8));
    if (wt >= walkDur && wv > 0.001) {
      const mp = man.root.position; let d = Math.atan2(S.curPos.x - mp.x, S.curPos.z - mp.z) - CONFIG.man.yaw;
      while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      const y = CONFIG.man.yaw + d * 0.55 * wv, rate = Math.abs(y - (S.turnPrev ?? y)) / Math.max(dt, 1e-3);
      S.turnPrev = y; S.manYaw = y; man.root.rotation.y = y;
      man.setSpeed(Math.min(0.5, rate * 0.25)); // the feet step around while he turns
      S.introLook = (S.introLook || new THREE.Vector3()).copy(S.curPos); S.introLookW = wv;
    } else { S.introLookW = 0; S.turnPrev = undefined; }
    if (T > arriveT + 0.6 && !S.introWave) { S.introWave = 1; world.yaw = CONFIG.man.yaw; }
    // footsteps: handled for every phase by the foot-bone detector after man.update (main loop)
    // intro sound cues: fired once each on the first frame past their time (a lag spike can't skip them)
    // sound cues wait while the AudioContext isn't running yet (no gesture so far) and are dropped if they'd come >2.5 s late
    const cue = (id, at, f, snd = true) => { if (T < at || S.cues[id]) return; if (snd && !audio.running) { if (T - at > 2.5) S.cues[id] = 1; return; } S.cues[id] = 1; if (!snd || T - at < 2.5) f(); };
    if (!S.cues) S.cues = {};
    cue('mqClick', 1.15, () => { audio.sfx('switch'); audio.sfx('click'); });
    // he comes home: keys, the door closing in the lounge, the dog's tags as it gets up
    cue('keys', CONFIG.man.walkStart - 2.1, () => audio.sfx('keys', 0.8));
    cue('door', CONFIG.man.walkStart - 1.2, () => audio.sfx('door', 0.9));
    cue('tags', CONFIG.man.walkStart + 0.1, () => { audio.sfx('tags', 0.9); setTimeout(() => audio.sfx('tags', 0.7), 420); });
    if (T > 1.2 && T < 2.3) { if (S.marquee > 0.5 && !(S.prevMq > 0.5) && T - (S.lastBuzz || 0) > 0.09) { audio.sfx('buzz'); S.lastBuzz = T; } }
    S.prevMq = S.marquee;
    cue('mqOn', 2.3, () => audio.sfx('buzz'));
    cue('crt', 2.4, () => audio.sfx('crt'));
    cue('title', 3.1, () => playMusic('title'), false); // the loop starts whenever the context does
    cue('lights', 3.3, () => { audio.sfx('switch'); setTimeout(() => audio.sfx('click'), 60); });
    cue('dogReact', CONFIG.man.walkStart + 0.4, () => { dog.react && dog.react('happy'); }, false);
    cue('dogHears', CONFIG.man.walkStart + 0.4, () => { audio.sfx('woof'); setTimeout(() => audio.sfx('woof'), 260); });
    cue('dogHappy', arriveT + 0.2, () => audio.sfx('dogHappy'));
    cue('wave', arriveT + 0.7, () => { if (man.gesture) man.gesture('wave'); }, false);
    // camera
    let pos, look, fov;
    const P = shots.photo, A = shots.introA;
    if (T < 8.5) { const k = ease((T - 1.6) / 6.4); pos = A.pos.clone().lerp(P.pos, k); look = A.look.clone().lerp(P.look, k); fov = lerp(A.fov, P.fov, k); pos.y += Math.sin(k * Math.PI) * 0.35; }
    else {
      const manHead = man.root.position.clone().add(new THREE.Vector3(0, 1.25, 0));
      const k1 = ease((T - 8.5) / 2.5);
      pos = P.pos.clone().lerp(shots.track.pos, k1);
      look = P.look.clone().lerp(manHead, k1);
      fov = lerp(P.fov, shots.track.fov, k1);
      const k2 = ease((T - (arriveT - 0.8)) / 3.2);
      if (k2 > 0) { const fp = world.followPose(V3(CONFIG.man.path[CONFIG.man.path.length - 1]), CONFIG.man.yaw + Math.PI + 0.35); pos.lerp(fp.pos, k2); look.lerp(fp.look, k2); fov = lerp(fov, fp.fov, k2); }
    }
    pos.x += Math.sin(T * 0.7) * 0.012 * (1 - smooth((T - 13) / 2)); pos.y += Math.sin(T * 0.9 + 1) * 0.008 * (1 - smooth((T - 13) / 2));
    S.curPos.copy(pos); S.curLook.copy(look); S.curFov = fov;
    final.uniforms.fade.value = smooth(T / 1.4);
    final.uniforms.bars.value = 1 - smooth((T - (CONFIG.intro.length - 1.0)) / 1.0);
    const walking = wt > -0.5 && wt < walkDur + 1.5;
    dog.update(dt, walking ? man.root.position.clone().add(new THREE.Vector3(0, 1.5, 0)) : screenCenter, walking ? 0.9 : 0);
    man.lookTarget.copy(screenCenter);
    if (T > CONFIG.intro.length) { world.yaw = man.root.rotation.y; startWorld(); }
  }

  // 'inside the cabinet': camera on the screen normal at the distance where the CRT (plus a hair of bezel)
  // exactly fits the viewport: fit to height on landscape, to width on portrait.
  const _hv = new THREE.Vector3(), _hv2 = new THREE.Vector3(), _cv = new THREE.Vector3();
  function insidePose(AC) {
    const cs = CONFIG.cams.schermo, fv = THREE.MathUtils.degToRad(fovFor(cs.fov)), tv = Math.tan(fv / 2);
    const Wt = 0.53 * cs.pad, Ht = 0.3975 * cs.pad;
    const d = Math.max((Ht / 2) / tv, (Wt / 2) / (tv * camera.aspect)) + 0.003;
    return { pos: AC.screenCenter.clone().addScaledVector(AC.screenNormal, d), look: AC.screenCenter.clone(), fov: cs.fov };
  }
  function spallaPose(AC, t) {
    const pos = shots.spalla.pos.clone().add(AC.off), look = shots.spalla.look.clone().add(AC.off); let fov = shots.spalla.fov;
    if (S.twoP && AC.id === 'bigalesso') { pos.set(0.35, 3.0, 2.0); look.set(0.35, 1.2, 0.5); fov = 36; }
    pos.x += Math.sin(t * 0.5) * 0.01; pos.y += Math.sin(t * 0.7) * 0.006;
    return { pos, look, fov };
  }
  function playCamera(t) {
    const m = S.camModes[S.camMode];
    let pos, look, fov;
    const AC = cabinets[S.lastCab || 0];
    if (m === 'Schermo') { // dolly from over the shoulder into the screen
      const a = spallaPose(AC, t), b = insidePose(AC), k = smooth(((S.cabT || 0) - 0.2) / CONFIG.cams.schermo.dolly);
      return { pos: a.pos.lerp(b.pos, k), look: a.look.lerp(b.look, k), fov: lerp(a.fov, b.fov, k) };
    }
    if (m === 'Spalla') { pos = shots.spalla.pos.clone().add(AC.off); look = shots.spalla.look.clone().add(AC.off); fov = shots.spalla.fov;
      if (S.twoP && AC.id === 'bigalesso') { pos.set(0.35, 3.0, 2.0); look.set(0.35, 1.2, 0.5); fov = 36; } pos.x += Math.sin(t * 0.5) * 0.01; pos.y += Math.sin(t * 0.7) * 0.006; }
    else if (m === 'Schermo') { pos = AC.schermoPos.clone(); look = AC.screenCenter.clone(); fov = shots.schermo.fov; }
    else {
      const c = CONFIG.cams.cinema; S.orbit += 1 / 60;
      const a = -0.35 + Math.sin(S.orbit * 0.09) * 0.95;
      pos = new THREE.Vector3(c.center[0] + Math.sin(a) * c.radius, c.height + Math.sin(S.orbit * 0.13) * 0.25, c.center[2] + Math.cos(a) * c.radius).add(AC.off);
      look = V3(c.look).add(AC.off); fov = c.fov;
    }
    return { pos, look, fov };
  }

  // ---------- game input (P1 / P2) ----------
  function gameInputs() {
    const k = input.k, P0 = input.pads[0], P1 = input.pads[1];
    const pd = (P, ax, sign, btn) => (sign < 0 ? P.axes[ax] < -0.4 : P.axes[ax] > 0.4) || !!P.cur[btn];
    const padIn = P => ({ up: pd(P, 1, -1, 12), down: pd(P, 1, 1, 13), left: pd(P, 0, -1, 14), right: pd(P, 0, 1, 15), fire: !!(P.cur[0] || P.cur[2] || P.cur[7]), bomb: !!(P.cur[1] || P.cur[3] || P.cur[6]), start: !!P.cur[9], pause: !!P.cur[8] });
    const a = padIn(P0), b = padIn(P1);
    let i1, i2;
    if (!S.twoP || (world.mode === 'cabinet' && world.cabIndex > 0)) {
      i1 = {
        up: k('KeyW') || k('ArrowUp'), down: k('KeyS') || k('ArrowDown'), left: k('KeyA') || k('ArrowLeft'), right: k('KeyD') || k('ArrowRight'),
        fire: k('KeyZ') || k('KeyJ') || k('Space') || k('KeyF'), bomb: k('KeyX') || k('KeyK') || k('KeyG'), start: k('Enter') || k('NumpadEnter') || k('Digit1'), pause: k('KeyP'),
      };
      i2 = { up: 0, down: 0, left: 0, right: 0, fire: 0, bomb: 0, start: k('Digit2') || k('Numpad2') || b.start, pause: 0 };
    } else {
      i1 = { up: k('KeyW'), down: k('KeyS'), left: k('KeyA'), right: k('KeyD'), fire: k('KeyF') || k('Space') || k('KeyZ'), bomb: k('KeyG') || k('KeyX'), start: k('Digit1') || k('Enter'), pause: k('KeyP') };
      i2 = { up: k('ArrowUp'), down: k('ArrowDown'), left: k('ArrowLeft'), right: k('ArrowRight'), fire: k('KeyL') || k('Numpad0') || k('Period'), bomb: k('KeyK') || k('Numpad1') || k('Comma'), start: k('Digit2') || k('Numpad2'), pause: 0 };
      for (const kk in b) i2[kk] = i2[kk] || b[kk];
    }
    for (const kk in a) i1[kk] = i1[kk] || a[kk] || touchIn[kk];
    for (const o of [i1, i2]) for (const kk in o) o[kk] = o[kk] ? 1 : 0;
    return [i1, i2];
  }

  // ---------- loop ----------
  const clock = new THREE.Clock();
  let frame = 0, t = 0;
  const botOn = q.has('bot');
  const ZERO = { up: 0, down: 0, left: 0, right: 0, fire: 0, bomb: 0, start: 0, pause: 0 };
  // the loop survives an exception in any module (logged, frame skipped) instead of freezing the game
  function tick() {
    requestAnimationFrame(tick);
    try { tickBody(); } catch (e) { tick.errs = (tick.errs || 0) + 1; if (tick.errs < 6) console.error(e); try { input.endFrame(); } catch (_) { } }
  }
  function tickBody() {
    const dt = Math.min(clock.getDelta(), 0.05); t += dt; frame++;
    // the opening / pre-game menu cover the whole screen: draw only 1 frame in 8 behind them (uploads and warm-up keep going, the GPU rests)
    if ((S.phase === 'ready' || S.phase === 'loading') && (document.body.dataset.opening || ui.menuOpen) && frame % 8) { ui.update(dt); input.endFrame(); return; }
    input.readPads();
    // global keys
    if (S.phase === 'intro' && (input.edges.size || (input.pads[0].cur[9] && !input.pads[0].prev[9]))) skipIntro();
    const typing = world.mode === 'type' || (ui.chat && ui.chat.focused);
    ui.update(dt);
    if (!typing && !ui.menuOpen) {
      if (input.pressed('KeyC')) cycleCam();
      if (input.pressed('KeyM')) toggleMute();
      if (input.pressed('KeyH')) toggleHelp(true);
      if (input.pressed('KeyT') && ui.chat) ui.chat.focus();
      // Esc / gamepad Start open the pause menu while walking around (in sub-modes Esc means "back")
      const padStart = input.pads[0].cur[9] && !input.pads[0].prev[9];
      if (S.phase === 'world' && world.mode === 'explore' && (input.pressed('Escape') || padStart)) { ui.menu.show('pause'); input.edges.delete('Escape'); }
    }
    // auto quality: drop a level if the frame rate stays low
    if (S.phase === 'world' && ui.settings.quality === 'auto' && !ui.menuOpen) {
      S.fpsT = (S.fpsT || 0) + dt; S.fpsN = (S.fpsN || 0) + 1;
      if (S.fpsT > 4) { const fps = S.fpsN / S.fpsT; S.fpsT = 0; S.fpsN = 0;
        if (fps < 38 && qLevel !== 'low') { S.autoQ = lowerQuality(qLevel); applySettings(ui.settings); world.toast('Grafica adattata per restare fluida'); } }
    }
    if (ui.menuOpen) { input.edges.clear(); input.keys.clear(); }
    const inCab = S.phase === 'world' && world.mode === 'cabinet';
    const ci = inCab ? (world.cabIndex || 0) : -1; if (ci >= 0) S.lastCab = ci;
    S.cabT = inCab ? (S.cabT || 0) + dt : 0;
    // mouse look housekeeping: give the cursor back in menus/overlays/close-up modes; petting strokes with plain mouse moves
    if (input.look.locked && !input.canLock()) input.releaseLock();
    input.freeMove = !ui.coarse && S.phase === 'world' && world.mode === 'pet';
    // cursor: hidden in edge-turn mode, and at the cabinet once the mouse rests (the CRT fills the view)
    const cur = ((input.look.failed && input.canLock()) || (inCab && performance.now() - (input.mouseT || 0) > 1500)) ? 'none' : '';
    if (el.style.cursor !== cur) el.style.cursor = cur;
    // "click to control the view": whenever mouse look is available but the pointer isn't captured (first time, after Esc…)
    const hintOp = (!ui.coarse && !input.look.locked && !input.look.failed && input.canLock()) ? '1' : '0';
    if (lookHint.style.opacity !== hintOp) lookHint.style.opacity = hintOp;
    const AC = cabinets[S.lastCab || 0]; // active (or last used) cabinet
    let [inp, inp2] = inCab && !ui.menuOpen ? gameInputs() : [ZERO, ZERO];
    if (ci > 0) inp2 = ZERO; // the director cabinet is single-player
    if (botOn && inCab) { inp = { ...inp, fire: 1, up: Math.sin(t * 1.3) > 0.3 ? 1 : 0, down: Math.sin(t * 1.3) < -0.3 ? 1 : 0, right: Math.sin(t * 0.4) > 0.6 ? 1 : 0, start: AC.game.state === 'attract' ? (frame % 4 < 2 ? 1 : 0) : 0, bomb: frame % 200 === 100 ? 1 : 0 }; }
    Object.assign(game.input, ci === 0 ? inp : ZERO);
    if ('input2' in game && game.input2) Object.assign(game.input2, ci === 0 ? inp2 : ZERO);
    Object.assign(dgame.input, ci === 1 ? inp : ZERO);
    MG.cabInput(ci, inp); // minigame cabinets (index >= 2)
    if (inCab) {
      const dirNow = inp.up | inp.down << 1 | inp.left << 2 | inp.right << 3;
      if (dirNow && dirNow !== S.prevDir) audio.sfx('stick'); S.prevDir = dirNow;
      if (inp.fire && !S.prevFire) audio.sfx('button'); S.prevFire = inp.fire;
      if (inp.bomb && !S.prevBomb) audio.sfx('button'); S.prevBomb = inp.bomb;
      if (inp.start && !S.prevStart) { audio.sfx('button'); S.startPress = Math.max(S.startPress, 0.35); } S.prevStart = inp.start;
    }
    // game
    if (!net.gameHook(dt)) game.update(ui.menuOpen && !S.online ? 0 : dt); if (perf.screenDue(0)) { game.draw(); screenTex.needsUpdate = true; } // perf: off-screen screens redraw at ~10 Hz
    dgame.update(ui.menuOpen ? 0 : dt); if (perf.screenDue(1)) { dgame.draw(); dTex.needsUpdate = true; }
    MG.update(dt, { ci, menuOpen: ui.menuOpen, perf, t });
    if (ci === 1) { const want = ['ko', 'over'].includes(dgame.state) ? null : 'director'; if (music !== want && audio.ctx) playMusic(want); }
    else if (music === 'director') playMusic(null);
    if (game.state !== S.prevGameState) { S.prevGameState = game.state; if (game.state === 'attract') { S.twoP = false; refreshHint(); } }
    if (ci < 1 && S.phase === 'world' && game.state === 'attract' && !world.dancing && music !== 'title' && audio.ctx) playMusic('title');
    if (game.players && game.players.length > 1 && !S.twoP) { S.twoP = true; refreshHint(); }
    // intro / world
    let dogLook = null, dogEx = 0;
    if (S.phase === 'intro') { if (!S.freeze) S.introT += dt; introUpdate(S.introT, dt); }
    else if (S.phase === 'world') {
      eggs.preUpdate(ui.menuOpen ? 0 : dt);
      IA.update(ui.menuOpen ? 0 : dt); // interact/: wheel input, follower, can, TV (before world.update)
      const pose = world.update(ui.menuOpen ? 0 : dt);
      const c = IA.camera(pose, dt) || playCamera(t);
      const looking = pose && performance.now() - input.drag.last < 300;
      const k = 1 - Math.exp(-dt * (pose ? (looking ? 16 : 6.5) : (inCab ? 7 : 3)));
      S.curPos.lerp(c.pos, k); S.curLook.lerp(c.look, k); S.curFov = lerp(S.curFov, c.fov, k);
      S.lightK += ((world.lightTarget ?? 1) - S.lightK) * (1 - Math.exp(-dt * 3));
      final.uniforms.bars.value = Math.max(world.mode === 'type' || world.mode === 'shell' ? 0.45 : 0, final.uniforms.bars.value + ((world.mode === 'type' || world.mode === 'shell' ? 0.45 : 0) - final.uniforms.bars.value) * Math.min(1, dt * 3));
      final.uniforms.fade.value = 1;
      const dl = world.dogLook();
      if (dl) { dogLook = dl.look; dogEx = dl.excite; }
      else { dogLook = game.state === 'attract' ? man.root.position.clone().add(new THREE.Vector3(0, 1.4, 0)) : AC.screenCenter; dogEx = dog.state.wag > 0.5 ? 0.8 : 0; }
      dog.update(dt, dogLook, dogEx);
      if (frame % 6 === 0) refreshHint();
    } else { dog.update(dt, screenCenter, 0); }
    // first-person: hide the man in "Schermo"
    const inside = insidePose(AC);
    const headW = man.bones && man.bones.Head ? man.bones.Head.getWorldPosition(_hv) : man.root.position;
    const camAx = _cv.copy(S.curPos).sub(AC.screenCenter).dot(AC.screenNormal), headAx = _hv2.copy(headW).sub(AC.screenCenter).dot(AC.screenNormal);
    const fp = (inCab && S.camModes[S.camMode] === 'Schermo' && (S.curPos.distanceTo(inside.pos) < 0.9 || camAx < headAx + 0.12)) || S.curPos.distanceTo(headW) < 0.34;
    man.model.visible = !fp;
    { const crisp = inCab && S.camModes[S.camMode] === 'Schermo' ? 1 - smooth((S.curPos.distanceTo(inside.pos) - 0.15) / 0.8) : 0;
      for (const C of cabinets) { const u = C.cab.screenMat && C.cab.screenMat.uniforms; if (u && u.crisp) u.crisp.value = C === AC ? crisp : 0; } }
    for (const g of (AC.glassMats.length ? AC.glassMats : glassMats)) { g.envMapIntensity = fp ? 0.08 : 1.4; g.clearcoat = fp ? 0 : 1; g.specularIntensity = fp ? 0.1 : 1; }
    // cabinet joysticks / buttons (each cabinet gets input only while you sit at it)
    S.startPress = Math.max(0, S.startPress - dt);
    for (let i = 0; i < cabinets.length; i++) {
      const C = cabinets[i].cab, a = i === ci ? inp : ZERO, a2 = i === 0 && ci === 0 ? inp2 : ZERO;
      const tx = (a.right - a.left), ty = (a.down - a.up), piv = C.stick1.piv;
      piv.rotation.z += (-tx * 0.3 - piv.rotation.z) * Math.min(1, dt * 22);
      piv.rotation.x += (ty * 0.3 - piv.rotation.x) * Math.min(1, dt * 22);
      const tx2 = (a2.right - a2.left), ty2 = (a2.down - a2.up), piv2 = C.stick2.piv;
      piv2.rotation.z += (-tx2 * 0.3 - piv2.rotation.z) * Math.min(1, dt * 22);
      piv2.rotation.x += (ty2 * 0.3 - piv2.rotation.x) * Math.min(1, dt * 22);
      const pressCap = (name, on) => { const b = C.buttons[name]; const y = b.base - (on ? 0.0045 : 0); b.cap.position.y += (y - b.cap.position.y) * Math.min(1, dt * 30); };
      pressCap('p1a', a.fire); pressCap('p1b', a.bomb); pressCap('start1', i === (S.lastCab || 0) && S.startPress > 0.12);
      pressCap('p2a', a2.fire); pressCap('p2b', a2.bomb); pressCap('start2', a2.start);
    }
    // man
    man.ik = S.ik; man.lean = S.lean; man.look = S.look;
    if (S.phase === 'world' && world.lookAtOut && !inCab) man.lookTarget.copy(world.lookAtOut);
    else man.lookTarget.copy(AC.screenCenter).add(new THREE.Vector3(0, -0.02, 0));
    if (S.phase === 'intro' && S.introLookW > 0) man.lookTarget.lerp(S.introLook, S.introLookW); // intro: looks at the camera while waving
    S.press +=((inCab && (inp.fire || inp.bomb) ? 1 : 0) - S.press) * Math.min(1, dt * 18); man.press = S.press;
    if (S.ik > 0.001) {
      const AK = AC.cab; AK.group.updateMatrixWorld(true);
      const ball = W(AK.stick1.ball);
      man.leftTarget.copy(ball).add(V3(CONFIG.man.leftOff));
      const btn = new THREE.Vector3(); for (const c of AC.p1caps) btn.add(W(c)); btn.multiplyScalar(1 / AC.p1caps.length);
      const rt = btn.add(V3(CONFIG.man.rightOff)); rt.y -= S.press * 0.012;
      if (S.startPress > 0) { const st = W(AK.buttons.start1.cap).add(V3(CONFIG.man.startOff)); rt.lerp(st, smooth(S.startPress / 0.2)); }
      man.rightTarget.copy(rt);
    }
    man.update(dt);
    IA.post(dt); // interact/: finger pose after the man's update
    footsteps(dt);
    net.update(dt);
    npcs.update(dt); phone.update(dt); // after net.update: NPC colliders are appended to world.extraCircles
    // props / fx
    if (props.typewriter) props.typewriter.update(dt);
    mural.update(dt);
    caso.update(dt);
    cron.update(dt, t);
    // lights / emissives (fx.update runs after these: night mode scales them)
    setLights(S.lightK);
    S.coinFlash = Math.max(0, S.coinFlash - dt * 1.5);
    cab.marqueeMat.emissiveIntensity = S.marquee * 1.0; mqLight.intensity = S.marquee * (0.35 + (1 - S.lightK) * 0.6);
    cab.coinLight.emissiveIntensity = (S.marquee > 0.5 ? 1.6 : 0.05) + (!S.coinCab ? S.coinFlash * 5 * (Math.sin(t * 30) > 0 ? 1 : 0.3) : 0);
    cab.screenMat.uniforms.power.value = S.screenOn; cab.screenMat.uniforms.time.value = t;
    if (frame % 3 === 0) {
      sctx.drawImage(game.canvas, 0, 0, 4, 3); const d = sctx.getImageData(0, 0, 4, 3).data;
      let r = 0, g = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      r /= 12 * 255; g /= 12 * 255; b /= 12 * 255; sLum = 0.3 * r + 0.59 * g + 0.11 * b;
      sCol.setRGB(r, g, b, THREE.SRGBColorSpace);
    }
    sLight.color.copy(sCol); sLight.intensity = CONFIG.screenLight.intensity * S.screenOn * (0.4 + sLum * 1.6) * (1 + (1 - S.lightK) * 0.8);
    for (let i = 1; i < cabinets.length; i++) { // the other cabinets: marquee, coin lights, CRT, screen light
      const C = cabinets[i], K = C.cab;
      K.marqueeMat.emissiveIntensity = S.marquee * 1.0; C.mqLight.intensity = S.marquee * (0.3 + (1 - S.lightK) * 0.6);
      K.coinLight.emissiveIntensity = (S.marquee > 0.5 ? 1.6 : 0.05) + (S.coinCab === i ? S.coinFlash * 5 * (Math.sin(t * 30) > 0 ? 1 : 0.3) : 0);
      K.screenMat.uniforms.power.value = S.screenOn; K.screenMat.uniforms.time.value = t;
      if (frame % 3 === 1) {
        sctx.drawImage(C.game.canvas, 0, 0, 4, 3); const d = sctx.getImageData(0, 0, 4, 3).data;
        let r = 0, g = 0, b = 0; for (let j = 0; j < d.length; j += 4) { r += d[j]; g += d[j + 1]; b += d[j + 2]; }
        r /= 12 * 255; g /= 12 * 255; b /= 12 * 255; C.sLum = 0.3 * r + 0.59 * g + 0.11 * b; C.sCol.setRGB(r, g, b, THREE.SRGBColorSpace);
      }
      C.sLight.color.copy(C.sCol); C.sLight.intensity = CONFIG.screenLight.intensity * S.screenOn * (0.4 + C.sLum * 1.6) * (1 + (1 - S.lightK) * 0.8);
    }
    if (audio.setHum) audio.setHum(S.screenOn);
    level.update(dt, t, S.phase === 'world' ? man.root.position : null, camera);
    quartiere.update(dt, t, S.phase === 'world' ? man.root.position : null, camera);
    if (audio.setAmbience) { const fn = getFX(); audio.setAmbience(S.phase === 'world' ? (level.outdoor || 0) : 0, (fn && fn.nightAmount) || 0, gulag && gulag.inside ? 1 : 0); }
    if (fx) fx.update(dt);
    fxFallback.update(dt);
    gulag.update(dt, t); // after fx.update: dims the house lights while in the basement
    // camera
    S.shake = Math.max(0, S.shake - dt * 0.12);
    if (window.__camOverride) { const o = window.__camOverride; S.curPos.set(o[0], o[1], o[2]); S.curLook.set(o[3], o[4], o[5]); } // test hook
    camera.position.copy(S.curPos);
    if (S.shake > 0 && ui.settings.cameraShake) camera.position.add(new THREE.Vector3((Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake * 0.5));
    camera.lookAt(S.curLook);
    eggs.update(dt, t); // easter eggs (after lookAt: tipsy camera sway)
    const f = fovFor(S.curFov); if (Math.abs(camera.fov - f) > 0.01) { camera.fov = f; camera.updateProjectionMatrix(); }
    final.uniforms.time.value = t;
    if (S.phase === 'ready' || S.phase === 'loading') { final.uniforms.fade.value = 0.0; }
    perf.update(dt); // shadow-map throttle, dynamic resolution
    composer.render(dt);
    input.endFrame();
  }
  // initial state: dark room, screen off
  setLights(0.035); S.marquee = 0; S.screenOn = 0; man.root.position.set(...CONFIG.man.path[0]);
  final.uniforms.bars.value = 1; final.uniforms.fade.value = 0;
  const perf = installPerf({ renderer, scene, camera, composer, lights, resize, getQuality: () => ui.settings.quality, protect: [man.root, dog.root], screens: [{ tex: screenTex }, { tex: dTex }, ...MG.screens] });
  try { installGfx({ renderer, scene, camera, composer, bloom, lights, room, level, man, dog, fx }); } catch (e) { console.warn('gfx', e); }
  requestAnimationFrame(tick);
  window.__app = { S, game, man, cab, camera, CONFIG, skipIntro, world, input, props, dog, fx: getFX, net, level, eggs, news, mural, caso, gulag, cron, audio,
    dgame, cabinets: cabinets.map(c => ({ id: c.id, name: c.name, cab: c.cab, game: c.game })),
    activeCabinet: () => (world.mode === 'cabinet' ? cabinets[world.cabIndex || 0] : null) };
  save.attach({ S, world, dog, game, dgame, level, eggs, gulag, net, audio, ui }); ui.attachApp && ui.attachApp({ S, world, level, man, save, opening });
  // hook for easter eggs: every key typed while sitting at a cabinet
  addEventListener('keydown', e => {
    if (S.phase !== 'world' || world.mode !== 'cabinet') return;
    const i = world.cabIndex || 0, c = cabinets[i];
    window.dispatchEvent(new CustomEvent('bigalesso:cabinetkey', { detail: { code: e.code, key: e.key, index: i, id: c.id, game: c.game, cab: c.cab } }));
  });
}

main().catch(showError);
