// MINIGIOCHI (round 6): extra cabinets (Zombata di Seghino, Chi l'ha detto?), night zombie event,
// Discord "compettina" desk, sushi all-you-can-eat, "Chi l'ha detto?" overlay, Processo AI, Corriere AI special edition.
// main.js calls createMinigames() right after the director cabinet, pushes MG.plugins into the explore plugins,
// and calls MG.cabInput()/MG.update() in the loop. Everything else lives here.
import * as THREE from 'three';
import { TRACKS } from '../audio.js';
import { powerCable } from '../room.js';
import { tex } from '../util.js';
import { ZombataGame } from './zombata.js';
import { ChiGame } from './chigame.js';
import { buildZombataCabinet, buildChiCabinet } from './cabart.js';
import { anchor, unlock, record, phone, catchphrase, setToast, logEvent, V } from './shared.js';
import { createNightZombies } from './nightz.js';
import { discordPlugin } from './discord.js';
import { sushiPlugin } from './sushi.js';
import { createQuizOverlay, quizTablePlugin } from './quiz.js';
import { processoPlugin } from './processo.js';
import { corrierePlugin } from './corriere.js';

const N = s => s.split(' ').map(x => x === '.' ? null : +x);
// music for the new cabinets (the main sequencer plays TRACKS[name])
TRACKS.zombata = {
  bpm: 104, len: 32, ch: [
    { type: 'sawtooth', vol: 0.03, len: 0.6, notes: N('57 . . 60 . 57 . 56 . . 57 . 53 . . . 57 . . 60 . 62 . 63 . 62 . 60 . 57 . .') },
    { type: 'triangle', vol: 0.22, len: 0.5, notes: N('33 . 33 . 45 . 33 . 33 . 33 . 44 . 32 . 33 . 33 . 45 . 33 . 31 . 31 . 43 . 32 .') },
    { type: 'noise', vol: 0.06, notes: N('30 . . 70 50 . . 70 30 . 30 70 50 . 70 .') },
  ]
};
TRACKS.chiquiz = {
  bpm: 128, len: 32, ch: [
    { type: 'square', vol: 0.04, len: 0.5, notes: N('72 . 76 79 . 76 72 . 74 . 77 81 . 77 74 . 72 . 76 79 84 . 79 76 74 77 81 . 79 . . .') },
    { type: 'triangle', vol: 0.2, len: 0.5, notes: N('48 . 55 . 48 . 55 . 50 . 57 . 50 . 57 . 48 . 55 . 48 . 55 . 43 . 50 . 43 . 47 .') },
    { type: 'noise', vol: 0.06, notes: N('30 . 70 . 50 . 70 . 30 . 70 30 50 . 70 70') },
  ]
};

export function createMinigames(M) {
  const { scene, level, audio, getFX, ui, mkCab, cabinets } = M;
  setToast((m, c) => { try { ui.toast(m, c); } catch (e) { } });
  const fx = () => (getFX ? getFX() : null);
  const sfx = (n, v) => { try { audio.sfx(n, v); } catch (e) { } };
  const A = () => audio.ctx ? audio : null;

  // ---------------------------------------------------------------- extra cabinets (face +z like the others)
  const extra = [];
  const glowGeo = new THREE.PlaneGeometry(1.5, 1.1); glowGeo.rotateX(-Math.PI / 2);
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); const g = x.createRadialGradient(64, 40, 4, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); return t; })();
  function addCab(id, name, game, build, pos, hints, music, onEv) {
    const tx = tex(game.canvas, { nearest: true }); game.draw(); tx.needsUpdate = true;
    const cab = build(tx); cab.group.position.copy(pos); scene.add(cab.group);
    scene.add(powerCable([[pos.x + 0.25, 0.06, pos.z + 0.02], [pos.x + 0.4, 0.01, pos.z + 0.1], [pos.x + 0.6, 0.004, pos.z + 0.14], [pos.x + 0.82, 0.004, pos.z + 0.03]]));
    cab.group.updateMatrixWorld(true);
    // no extra real lights (each RectAreaLight/PointLight costs on every lit pixel of the house): a tinted floor glow instead
    const dummy = () => ({ color: new THREE.Color(), intensity: 0, position: V(), visible: false });
    const C = mkCab(id, name, cab, game, tx, dummy(), dummy());
    const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ map: glowTex, color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    glow.position.set(pos.x, 0.006, pos.z + 0.95); glow.renderOrder = 2; scene.add(glow);
    C.hints = hints; C.music = music; C.glow = glow; C.extra = true;
    cabinets.push(C); extra.push({ C, game, tx, onEv, idx: cabinets.length - 1, prevState: game.state });
    return C;
  }
  const zPos = anchor(level, 'zombata', { pos: V(-2.75, 0, 0.02) }).pos; zPos.y = 0;
  const cPos = anchor(level, 'chi_cabinet', { pos: V(3.55, 0, 0.02) }).pos; cPos.y = 0;
  const zgame = new ZombataGame((ev, d) => onZombata(ev, d));
  const cgame = new ChiGame((ev, d) => onChi(ev, d));
  const ZC = addCab('zombata', 'La Zombata di Seghino', zgame, buildZombataCabinet, zPos,
    [['Frecce', 'muoviti'], ['Z', 'spara (tieni: mira fissa)'], ['X', 'molotov'], ['Invio', 'start'], ['Esc', 'alzati']], 'zombata');
  const QC = addCab('chi', "Chi l'ha detto?", cgame, buildChiCabinet, cPos,
    [['Frecce', 'scegli'], ['Z', 'conferma'], ['Invio', 'start'], ['Esc', 'alzati']], 'chiquiz');
  const cabCenter = C => C.cab.group.localToWorld(V(0, 1.95, 0.5));

  function onZombata(ev, d) {
    const a = A(); if (!a) return;
    switch (ev) {
      case 'start': sfx('coin'); setTimeout(() => sfx('start'), 120); M.S.startPress = 0.45; logEvent('zombata', 'ha iniziato una zombata al cabinato'); break;
      case 'shoot': d === 'fucile' ? a.noise(0.18, 0.18, 2600, 120) : a.tone('square', d === 'mitra' ? 1100 : 900, 220, 0.05, 0.035); break;
      case 'hit': a.noise(0.04, 0.06, 1400, 300); break;
      case 'zdie': a.tone('sawtooth', 220, 60, 0.22, 0.05); a.noise(0.18, 0.08, 900, 120); break;
      case 'hurt': sfx('die'); M.S.shake = Math.max(M.S.shake, 0.012); break;
      case 'pickup': sfx('power'); break;
      case 'wave': sfx('start'); break;
      case 'clear': sfx('clear'); M.dog && M.dog.state && (M.dog.state.wag = 1); break;
      case 'combo': sfx('combo', 3); break;
      case 'boss': sfx('warning'); break;
      case 'roar': a.tone('sawtooth', 110, 50, 0.9, 0.08); a.noise(0.8, 0.1, 500, 80); break;
      case 'bomb': sfx('bomb'); M.S.shake = Math.max(M.S.shake, 0.04); fx() && fx().pulse && fx().pulse(0xff8030, 0.8); break;
      case 'bossdie': sfx('bossdie'); fx() && fx().confetti && fx().confetti(cabCenter(ZC), 160); unlock('zombata_boss', { title: 'Zombone abbattuto', desc: 'Hai battuto il boss della Zombata', icon: '🧟' }); break;
      case 'gameover': {
        sfx('gameover'); setTimeout(() => M.man && M.man.playGesture && M.man.playGesture('headShake'), 300);
        const { score, wave, kills } = d || {};
        const rec = record('zombata_hi', score || 0);
        unlock('zombata_play', { title: 'Stasi si zomba', desc: 'Prima partita alla Zombata di Seghino', icon: '🧟' });
        if ((wave || 0) >= 5) unlock('zombata_w5', { title: 'Sopravvissuto', desc: 'Ondata 5 alla Zombata', icon: '🔦' });
        logEvent('zombata', `alla Zombata: ${score} punti, ondata ${wave}, ${kills} zombi`);
        if (rec && score > 3000) phone('seghino', `nuovo record alla zombata: ${score}. ${catchphrase('seghino')}`);
        break;
      }
    }
  }
  function onChi(ev, d) {
    const a = A(); if (!a) return;
    switch (ev) {
      case 'start': sfx('coin'); setTimeout(() => sfx('start'), 120); M.S.startPress = 0.45; break;
      case 'move': sfx('stick'); a.tone('square', 660, 0, 0.03, 0.03); break;
      case 'right': [0, 0.08, 0.16].forEach((w, i) => a.tone('square', [784, 988, 1319][i], 0, 0.12, 0.06, a.cab, w)); if (d >= 3) sfx('combo', Math.min(4, d)); break;
      case 'wrong': a.tone('sawtooth', 220, 110, 0.4, 0.07); break;
      case 'bonus': sfx('power'); break;
      case 'gameover': {
        const { score, correct, n } = d || {};
        sfx(correct >= n * 0.7 ? 'clear' : 'gameover');
        if (correct >= n * 0.7) fx() && fx().confetti && fx().confetti(cabCenter(QC), 140);
        record('chi_hi', score || 0);
        unlock('chi_play', { title: "Chi l'ha detto?", desc: 'Hai finito il quiz del gruppo', icon: '💬' });
        if (correct === n) unlock('chi_perfect', { title: 'Membro certificato', desc: '10 su 10 al quiz del gruppo', icon: '🏅' });
        logEvent('quiz', `al quiz "Chi l'ha detto?": ${correct}/${n} risposte giuste`);
        if (correct >= 8) phone('ciccio', `🚨 ${correct}/${n} al quiz del gruppo. Notizia da prima pagina`);
        break;
      }
    }
  }

  // ---------------------------------------------------------------- other minigames (explore plugins)
  const quizOv = createQuizOverlay(M);
  const night = createNightZombies(M);
  const plugins = [discordPlugin(M), sushiPlugin(M), quizTablePlugin(M, quizOv), processoPlugin(M), corrierePlugin(M)].filter(Boolean);
  // public entry points (phone / menu)
  const open = (name) => {
    const w = M.getWorld && M.getWorld();
    if (name === 'chi' || name === 'quiz') return quizOv.open();
    if (w && w.mgOpen && w.mgOpen[name]) return w.mgOpen[name]();
    return false;
  };
  window.__minigames = { open, list: () => ['chi', 'processo', 'corriere', 'discord', 'sushi', 'zombata'], night };

  // ---------------------------------------------------------------- per frame
  const ZERO = { up: 0, down: 0, left: 0, right: 0, fire: 0, bomb: 0, start: 0, pause: 0 };
  let lastCi = -1;
  function cabInput(ci, inp) { for (const e of extra) Object.assign(e.game.input, ci === e.idx ? inp : ZERO); }
  function update(dt, o) {
    const { ci, menuOpen, perf, t } = o;
    for (const e of extra) {
      e.game.update(menuOpen ? 0 : dt);
      if (!perf || perf.screenDue(e.idx)) { e.game.draw(); e.tx.needsUpdate = true; }
      // floor glow from the screen colour (main.js samples C.sCol / C.sLum)
      const S = M.S, C = e.C, k = S.screenOn * (0.25 + (C.sLum || 0) * 1.4) * (1 + (1 - S.lightK) * 1.2);
      C.glow.material.color.copy(C.sCol || new THREE.Color(0)).multiplyScalar(Math.min(1.6, k * 0.55));
    }
    // music for the cabinet you sit at
    if (ci >= 0 && cabinets[ci] && cabinets[ci].extra) {
      const C = cabinets[ci], g = C.game;
      const want = (g.state === 'attract' || g.state === 'over') && C.id === 'zombata' ? null : C.music;
      if (audio.ctx) M.playMusic(want);
    } else if (lastCi >= 0 && cabinets[lastCi] && cabinets[lastCi].extra) M.playMusic(null);
    lastCi = ci;
    night.update(dt, t);
    const w = M.getWorld && M.getWorld();
    if (w && w.plugins) for (const pl of w.plugins) if (pl.tick) { try { pl.tick(dt, M.camera.position, t); } catch (e) { if (!pl._err) { pl._err = 1; console.error(e); } } }
  }
  return { plugins, update, cabInput, screens: extra.map(e => ({ tex: e.tx })), hints: Object.fromEntries(extra.map(e => [e.C.id, e.C.hints])), night, open };
}
