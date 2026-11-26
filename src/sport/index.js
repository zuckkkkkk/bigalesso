// sport/index.js — "sportivo" in the open world: the calcetto cage in Teletubbylandia (sport/pitch.js).
//  - a physics ball (gravity, bounces, rolling friction, spin, boards/nets/posts/crossbar) that lives in the cage;
//    walk into it to dribble, E / left click = shot (hold to charge), R = pallonetto (chip), Q = pass to a teammate.
//    A drawn weapon (window.__combat.current()) blocks kicking: holster first.
//  - at the chalkboard: "Sfida gli amici" = 3 contro 3 for 3 minutes with the friends of the group (their NPC bodies
//    from npcs.js, driven by a small AI: goalkeeper, chaser, support, pass/shoot/tackle), score HUD, kick-offs,
//    goals, swearing reactions (bubbles + group chat), XP (window.__rpg.addXP) and achievements (window.__save).
//  - "Rigori" (5 penalties vs a friend in goal) and "Tiri liberi" at the basketball hoop south of the cage.
// Install (main.js): const sport = installSport({...}) after buildQuartiere (colliders before createWorld);
//   plugins.push(sport.plugin); sport.pre(dt) right before world.update; sport.update(dt) right after npcs.update.
// Online ("Calcetto online", party → ⚽ 1 contro 1 / 2 contro 2, rules shared/calcetto.mjs): the server owns the ball (30 Hz
// physics from the kick actions), every client moves its own player and reports it at 15 Hz, the ball is predicted here
// with the same stepBall()/kickVel() between the 15 Hz views; bots = friends' NPC bodies, the other humans = their
// presence avatars (net.js). Walk out of the cage for 6 s to leave (a bot takes your place).
import * as THREE from 'three';
import { PITCH as P } from '../quartiere/layout.js';
import { buildPitch, pitchColliders, ballTex, HOOP, BOARD_SIGN } from './pitch.js';
import { PERSONAS, persona } from '../ai.js';
import { stepBall as netStep, kickVel as netKick } from '../../shared/calcetto.mjs';
import { registerPartyGame } from '../net/party.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const PI = Math.PI, R = 0.13, G = 9.8, FAR = V(1e5, 0, 1e5);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = a => a[(Math.random() * a.length) | 0];
const wrapA = a => { while (a > PI) a -= 2 * PI; while (a < -PI) a += 2 * PI; return a; };
const fwdOf = y => V(Math.sin(y), 0, Math.cos(y));
const MOUTH = P.goalW / 2;
const KICKOFF = V(P.cx, R, P.cz);
const PEN_SPOT = V(P.x0 + 5, R, P.cz); // west goal
const LINES = {
  goalUs: ['GOOOL! Sgravato', 'Ma che gol è, porca troia!', 'Palese, troppo forti', 'Socmel che bomba', 'Godo come un riccio', 'Daje cazzo!'],
  goalThem: ['Tiè! Porta a casa', 'Ma che portiere avete, un lampione?', 'Ciaone', 'Sgravato io, mica voi', 'Che coglioni che siete', 'Troppo facile raga'],
  conceded: ['Ma chi marcava? Dai cazzo', 'Svegliati coglione', 'Rega ma che cazzo facciamo', 'Porca troia, di nuovo', 'Difesa di merda, giuro'],
  own: ['AUTOGOL AHAHAHAH', 'Ma sei scemo? Nella tua porta!', 'Il solito autogol, coglione', 'Ma chi ti ha insegnato, un teletubby?'],
  save: ['Para tutto, sgravato', 'Muro!', 'Neanche Buffon', 'Ma dove tiri coglione'],
  miss: ['Ma dove la tiri?', 'Fuori di tre metri, campione', 'Piedi di legno', 'Socmel che ciabattata'],
  win: ['Abbiamo vinto, sgravati', 'Godo. Stasera paga chi ha perso', 'Ve l\'avevo detto, palese', 'Troppo forti, rega'],
  loss: ['Partita truccata', 'Rivincita mercoledì, porca troia', 'Arbitro venduto (non c\'era l\'arbitro)', 'Abbiamo giocato di merda'],
  draw: ['Pareggio, che noia', 'Rivincita e basta, cazzo', 'Pari e patta, ciao'],
  kickoff: ['Dai che li asfaltiamo', 'Chi perde paga lo spritz', 'Vi distruggo', 'Oggi segno di tacco'],
};
const CSS = `
#spHud{position:fixed;left:50%;top:max(12px,env(safe-area-inset-top));transform:translateX(-50%);z-index:6;display:none;pointer-events:none;
  font:800 17px/1 system-ui,-apple-system,sans-serif;color:#fff;background:rgba(10,14,26,.78);border:1px solid rgba(255,255,255,.18);border-radius:12px;padding:8px 14px;
  box-shadow:0 6px 20px #0006;white-space:nowrap;letter-spacing:.02em}
#spHud b{display:inline-block;min-width:1.4em;text-align:center;font-size:22px;color:#ffe066}
#spHud i{font-style:normal;opacity:.85;font-weight:700;font-size:13px;text-transform:uppercase}
#spHud span.clk{margin-left:12px;padding-left:12px;border-left:1px solid rgba(255,255,255,.25);font-variant-numeric:tabular-nums}
#spBanner{position:fixed;left:50%;top:30%;transform:translate(-50%,-50%) scale(.9);z-index:6;pointer-events:none;opacity:0;transition:opacity .2s,transform .25s;
  font:900 clamp(34px,7vw,78px)/1 Impact,system-ui,sans-serif;color:#ffe066;text-shadow:0 4px 0 #b3401f,0 8px 26px #000a;text-align:center;letter-spacing:.03em}
#spBanner small{display:block;font:700 clamp(14px,2.2vw,22px)/1.3 system-ui,sans-serif;color:#fff;text-shadow:0 2px 8px #000;margin-top:8px;letter-spacing:0}
#spBanner.on{opacity:1;transform:translate(-50%,-50%) scale(1)}
#spBar{position:fixed;left:50%;bottom:max(92px,calc(env(safe-area-inset-bottom) + 86px));transform:translateX(-50%);width:220px;height:12px;border-radius:7px;z-index:6;display:none;pointer-events:none;
  background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.35);overflow:hidden}
#spBar i{position:absolute;left:0;top:0;bottom:0;width:0;background:linear-gradient(90deg,#7ee06a,#ffe066 60%,#ff6a3d)}
#spBar em{position:absolute;top:0;bottom:0;background:rgba(255,255,255,.35);border-left:1px solid #fff;border-right:1px solid #fff}
#spFade{position:fixed;inset:0;background:#000;z-index:7;opacity:0;pointer-events:none;transition:opacity .35s;display:grid;place-items:center;color:#fff;font:700 20px system-ui,sans-serif}
#spFade.on{opacity:1}
#spBtns{position:fixed;right:max(16px,env(safe-area-inset-right));bottom:max(170px,calc(env(safe-area-inset-bottom) + 160px));z-index:5;display:none;flex-direction:column;gap:10px}
body.touchui #spBtns.on{display:flex}
#spBtns button{width:64px;height:64px;border-radius:50%;border:2px solid rgba(255,255,255,.5);background:rgba(30,90,40,.85);color:#fff;font:800 12px/1.1 system-ui,sans-serif;touch-action:none;box-shadow:0 3px 0 #0007}
#spBtns button.on{transform:translateY(2px) scale(.95);filter:brightness(1.3)}
`;

export function installSport({ scene, level, man, input, ui, audio, camera, getFX, low = false, S: APP }) {
  // ---------------- data (colliders before createWorld) + meshes (now: preload/warm-up covers them) ----------------
  for (const c of pitchColliders()) level.colliders.push(c);
  const q = level.quartiere;
  const root = q && q.root ? q.root : scene;
  const { group } = buildPitch(root, { low });
  const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(R, 22, 16), new THREE.MeshStandardMaterial({ map: ballTex(), roughness: 0.45 }));
  ballMesh.castShadow = true; ballMesh.name = 'calcettoBall'; scene.add(ballMesh); // not under quartiere.root: the small-prop culler would drop its shadow
  const bball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 18, 12), new THREE.MeshStandardMaterial({ color: 0xd8641e, roughness: 0.7 }));
  bball.castShadow = true; bball.name = 'basketBall'; bball.position.set(HOOP.x + 0.5, 0.12, HOOP.spot[1] + 0.6); scene.add(bball);
  { const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); }
  const $ = (tag, id, html = '') => { const e = document.createElement(tag); e.id = id; e.innerHTML = html; document.body.appendChild(e); return e; };
  const hud = $('div', 'spHud'), banner = $('div', 'spBanner'), bar = $('div', 'spBar', '<em></em><i></i>'), fade = $('div', 'spFade'), btns = $('div', 'spBtns', '<button data-b="shot">TIRA</button><button data-b="chip">PALLO-<br>NETTO</button><button data-b="pass">PASSA</button>');
  const barFill = bar.querySelector('i'), barSweet = bar.querySelector('em');
  const touch = { shot: false, chip: false, pass: false, edge: new Set() };
  btns.querySelectorAll('button').forEach(b => {
    const k = b.dataset.b;
    b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); b.classList.add('on'); touch[k] = true; touch.edge.add(k); try { b.setPointerCapture(e.pointerId); } catch (x) { } });
    const up = () => { b.classList.remove('on'); touch[k] = false; }; b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
  });

  // ---------------- state ----------------
  const ST = { W: null, H: null, charge: null, kickAnim: 0, cheerNext: false, msgT: 0, hintShown: false, goalT: 0, mode: null, prevMouse: false, visible: true };
  const B = { p: KICKOFF.clone(), v: V(), spin: 0, owner: null, last: null, kind: '', kickId: 0, net: 0, scored: false, rest: 0 };
  B.p.x += 2.2; // at rest beside the centre spot (the chalkboard challenge is by the gate)
  const player = { id: 'zuck', name: 'Zuck', team: 0, role: 'f', isPlayer: true, pos: man.root.position, vel: V(), yaw: 0, cool: 0, goals: 0 };
  let M = null; // the match (or penalties) in progress
  const toast = (m, k) => { try { (ST.H && ST.H.toast) ? ST.H.toast(m, k) : ui.toast(m, k); } catch (e) { } };
  const save = (id, title, desc, icon) => { try { window.__save && window.__save.unlock && window.__save.unlock(id, { title, desc, icon, group: 'Sport', cat: 'Sport' }); } catch (e) { } };
  const xp = (n, why) => { try { window.__rpg && window.__rpg.addXP && window.__rpg.addXP(n, why); } catch (e) { } };
  const weaponOut = () => { try { return !!(window.__combat && window.__combat.current && window.__combat.current()); } catch (e) { return false; } };
  const inCage = (p, m = 0) => p.x > P.x0 + m && p.x < P.x1 - m && p.z > P.z0 + m && p.z < P.z1 - m;
  const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const W = () => ST.W;
  const sfx = (n, v) => { try { audio && audio.sfx(n, v); } catch (e) { } };

  // ---------------- ball physics ----------------
  const tmp = V(), tmp2 = V(), qRoll = new THREE.Quaternion(), axis = V();
  function resetBall(at = KICKOFF) { B.p.copy(at); B.p.y = R; B.v.set(0, 0, 0); B.spin = 0; B.owner = null; B.net = 0; B.scored = false; B.kind = ''; }
  function kick(by, dir, speed, vy, kind = 'shot', spin = 0) {
    B.owner = null; B.last = by; B.kind = kind; B.kickId++; B.net = 0;
    B.v.set(dir.x * speed, vy, dir.z * speed); B.spin = spin;
    if (B.p.y < R + 0.02) B.p.y = R + 0.02;
    if (by) { by.cool = 0.32; by.kickT = 0.32; if (by.npc) by.npc.root.rotation.x = -0.12; }
    sfx('ballBounce', 0.6 + speed / 18); if (speed > 12) sfx('kick');
  }
  function onGoal(team) { // team that scored
    if (B.scored) return; B.scored = true;
    const by = B.last, own = by && by.team !== team;
    if (M && M.kind === 'match') matchGoal(team, by, own);
    else if (M && M.kind === 'pen') penResult(true);
    else { // free play
      sfx('whistle'); toast(by && by.isPlayer ? (B.kind === 'chip' ? 'Gol di cucchiaio a porta vuota!' : 'Gol a porta vuota. Facile così') : 'Gol!', 'gold');
      if (by && by.isPlayer && B.kind === 'chip') save('cucchiaio', 'Cucchiaio', 'Un gol di pallonetto al calcetto', '🥄');
      ST.goalT = 2.2;
    }
  }
  function stepBall(h) {
    const p = B.p, v = B.v;
    if (B.owner) {
      const o = B.owner, f = fwdOf(o.yaw);
      tmp.set(o.pos.x + f.x * 0.46 + o.vel.x * 0.06, R, o.pos.z + f.z * 0.46 + o.vel.z * 0.06);
      v.set((tmp.x - p.x) * 14, 0, (tmp.z - p.z) * 14); p.addScaledVector(v, h); p.y = R;
      if (d2(o.pos, p) > 1.2) B.owner = null;
    } else {
      v.y -= G * h;
      if (Math.abs(B.spin) > 0.01) { tmp.set(-v.z, 0, v.x).multiplyScalar(B.spin * h); v.add(tmp); B.spin *= Math.exp(-h * 1.3); }
      v.multiplyScalar(Math.exp(-h * 0.05));
      p.addScaledVector(v, h);
      if (p.y < R) {
        p.y = R;
        if (v.y < -0.9) { if (v.y < -2.5) sfx('ballBounce', Math.min(1, -v.y / 8)); v.y = -v.y * 0.55; v.x *= 0.9; v.z *= 0.9; }
        else v.y = 0;
      }
      if (p.y <= R + 1e-3) { const k = Math.exp(-h * 0.75); v.x *= k; v.z *= k; const s = Math.hypot(v.x, v.z); if (s < 0.05) { v.x = 0; v.z = 0; } }
    }
    // the cage: side boards (nets above them: softer), end boards beside the goals, goal mouths -> nets
    const soft = p.y > P.board ? 0.28 : 0.62;
    if (p.z < P.z0 + R) { p.z = P.z0 + R; if (v.z < 0) { v.z = -v.z * soft; bang(v); } }
    if (p.z > P.z1 - R) { p.z = P.z1 - R; if (v.z > 0) { v.z = -v.z * soft; bang(v); } }
    for (const s of [-1, 1]) {
      const gx = s < 0 ? P.x0 : P.x1, out = s < 0 ? p.x < gx + R : p.x > gx - R;
      const inMouth = Math.abs(p.z - P.cz) < MOUTH - R * 0.5 && p.y < P.goalH - R * 0.5;
      if (out && !inMouth && !B.net) {
        // posts and crossbar (round): bounce off them, else the end board
        if (Math.abs(Math.abs(p.z - P.cz) - MOUTH) < R + 0.05 && p.y < P.goalH + R) { const pz = P.cz + Math.sign(p.z - P.cz) * MOUTH; tmp.set(p.x - gx, 0, p.z - pz); const L = tmp.length() || 1; if (L < R + 0.05) { tmp.multiplyScalar(1 / L); p.x = gx + tmp.x * (R + 0.05); p.z = pz + tmp.z * (R + 0.05); const vn = v.x * tmp.x + v.z * tmp.z; if (vn < 0) { v.x -= 1.7 * vn * tmp.x; v.z -= 1.7 * vn * tmp.z; sfx('hit'); post(); } continue; } }
        if (Math.abs(p.z - P.cz) < MOUTH && p.y >= P.goalH - R * 0.5 && p.y < P.goalH + R + 0.05) { const dy = p.y - P.goalH; if (dy < 0 && v.y > 0) { v.y = -v.y * 0.6; } else { v.y = Math.abs(v.y) * 0.6; } v.x = -v.x * 0.55; p.x = gx - s * (R + 0.01); sfx('hit'); post(); continue; }
        p.x = gx - s * R; if (v.x * s > 0) { v.x = -v.x * soft; bang(v); }
      } else if (out || B.net) {
        // inside the goal: the net catches it
        const inside = s < 0 ? p.x < gx - R * 0.9 : p.x > gx + R * 0.9;
        if (inside && !B.net && Math.abs(p.z - P.cz) < MOUTH) { B.net = s; onGoal(s < 0 ? 1 : 0); }
        if (B.net === s) {
          const bx = gx + s * (P.goalD - R);
          if (s < 0 ? p.x < bx : p.x > bx) { p.x = bx; v.x *= -0.12; v.y *= 0.5; v.z *= 0.6; }
          if (Math.abs(p.z - P.cz) > MOUTH - R) { p.z = P.cz + Math.sign(p.z - P.cz) * (MOUTH - R); v.z *= -0.2; }
          if (p.y > P.goalH - R) { p.y = P.goalH - R; v.y = Math.min(0, v.y); }
          v.multiplyScalar(Math.exp(-h * 3));
        }
      }
    }
    // free-play safety: nothing can get it out of the cage, but a NaN or a glitch puts it back
    if (!isFinite(p.x + p.y + p.z) || p.x < P.x0 - 3 || p.x > P.x1 + 3 || p.z < P.z0 - 1 || p.z > P.z1 + 1 || p.y > 20) resetBall();
  }
  let bangT = 0; function bang(v) { const s = Math.hypot(v.x, v.z); if (s > 2.5 && bangT <= 0) { sfx('ballBounce', Math.min(1, s / 10)); bangT = 0.12; } }
  function post() { if (M && M.kind === 'match' && B.last) { const n = B.last.npc ? B.last : null; if (n && Math.random() < 0.6) n.npc.say(rnd(['Palo, porca troia!', 'Traversa! Ma dai cazzo', 'Legno, sfiga']), 2.5); else if (B.last.isPlayer) toast('Palo!'); } }
  function updateBall(dt) {
    bangT -= dt;
    const n = Math.min(8, Math.ceil(dt / 0.008));
    for (let i = 0; i < n; i++) stepBall(dt / n);
    // roll
    const sp = Math.hypot(B.v.x, B.v.z);
    if (sp > 0.02) { axis.set(B.v.z, 0, -B.v.x).normalize(); qRoll.setFromAxisAngle(axis, sp * dt / R); ballMesh.quaternion.premultiply(qRoll); }
    ballMesh.position.copy(B.p);
    if (ST.goalT > 0 && !M) { ST.goalT -= dt; if (ST.goalT <= 0) { resetBall(V(P.cx + 2.2, R, P.cz)); } }
  }

  // ---------------- possession / contacts (player + match entities) ----------------
  function contacts(ents, dt) {
    for (const e of ents) {
      e.cool -= dt;
      if (e === B.owner || e.cool > 0 || B.net) continue;
      if (e.isPlayer && (weaponOut() || ST.mode === 'bb')) continue;
      if (e.frozen) continue;
      if (e.role === 'gk' && !B.owner && e.savedKick === B.kickId && B.last && B.last !== e && B.v.length() > 3) continue; // the save roll for this shot already failed
      const d = d2(e.pos, B.p);
      if (d > 0.62 || B.p.y > 0.75) {
        if (d < 0.36 + R && B.p.y < 1.6 && !B.owner) { // body block
          tmp.set(B.p.x - e.pos.x, 0, B.p.z - e.pos.z).normalize(); const vn = B.v.x * tmp.x + B.v.z * tmp.z;
          if (vn < 0) { B.v.x -= 1.4 * vn * tmp.x; B.v.z -= 1.4 * vn * tmp.z; if (B.v.length() < 6) B.last = e; } // a deflected shot stays the shooter's
          B.p.x = e.pos.x + tmp.x * (0.36 + R); B.p.z = e.pos.z + tmp.z * (0.36 + R);
        }
        continue;
      }
      const sp = B.v.length();
      if (!B.owner) {
        if (sp < (e.role === 'gk' ? 13 : 8.5) || (M && M.kind === 'pen' && e.role === 'gk')) { take(e); continue; }
        // too fast to control: deflects off the legs
        tmp.set(B.p.x - e.pos.x, 0, B.p.z - e.pos.z).normalize(); const vn = B.v.x * tmp.x + B.v.z * tmp.z; if (vn < 0) { B.v.x -= 1.5 * vn * tmp.x; B.v.z -= 1.5 * vn * tmp.z; B.v.multiplyScalar(0.6); }
      } else if (B.owner.team !== e.team) {
        const o = B.owner, rate = e.isPlayer ? 2.4 : o.isPlayer ? (M ? M.steal : 1.0) : 1.7;
        if (Math.random() < rate * dt) { take(e); o.cool = 0.7; if (o.npc && Math.random() < 0.35) o.npc.say(rnd(['Fallo!', 'Ma che cazzo fai', 'Ladro!', 'Oh, piano coglione']), 2); }
      }
    }
  }
  function take(e) { B.owner = e; B.last = e; B.kind = ''; B.v.set(0, 0, 0); B.spin = 0; if (e.role === 'gk' && M) e.holdT = 0; }

  // ---------------- player input: shot / chip / pass ----------------
  function ballNear(m = 1.25) { return d2(player.pos, B.p) < m && B.p.y < 1.2 && !B.net; }
  function canKick() { return !weaponOut() && ST.mode !== 'bb' && APP && APP.phase === 'world' && W() && W().mode === 'explore' && !(M && (M.phase === 'goal' || M.phase === 'end' || M.phase === 'intro')) && !(M && M.kind === 'pen' && M.phase !== 'aim') && !(NM && !(NM.v && NM.v.ph === 'play' && NM.v.me >= 0)); }
  function startCharge(kind, src) { if (!canKick() || !ballNear()) return; ST.charge = { kind, src, t: 0 }; }
  function chargeHeld() {
    const c = ST.charge, I = input;
    if (c.src === 'mouse') return !!I.mouseHeld;
    if (c.src === 'touch') return c.kind === 'chip' ? touch.chip : touch.shot;
    return I.k('KeyE') || I.k('Enter') || I.k('KeyR') || I.tHeld('act') || I.tHeld('alt') || I.padHeld(0, 0) || I.padHeld(0, 2) || I.padHeld(0, 3);
  }
  function playerShot(kind, power) {
    if (!ballNear(1.35)) return;
    if (NM) return netShot(kind === 'chip' ? 1 : 0, power);
    const w = W(); let yaw = w ? w.yaw : 0;
    if (M && M.kind === 'pen' && w) yaw = clamp(wrapA(w.camYaw + PI), -PI / 2 - 0.42, -PI / 2 + 0.42); // penalties: aim with the camera
    const dir = fwdOf(yaw);
    // aim assist toward the goal you attack when roughly facing it
    const gx = M && M.kind === 'pen' ? P.x0 : (M ? (player.team === 0 ? P.x1 : P.x0) : (dir.x < 0 ? P.x0 : P.x1));
    if (!(M && M.kind === 'pen')) { tmp.set(gx - B.p.x, 0, clamp(B.p.z + dir.z / Math.max(0.2, Math.abs(dir.x)) * Math.abs(gx - B.p.x), P.cz - MOUTH * 0.8, P.cz + MOUTH * 0.8) - B.p.z).normalize(); if (dir.dot(tmp) > Math.cos(0.7)) dir.lerp(tmp, 0.45).normalize(); }
    if (kind === 'chip') kick(player, dir, 5.5 + power * 5, 4.2 + power * 2.6, 'chip', 0);
    else kick(player, dir, 7 + power * 15, 0.6 + power * power * 3.2, 'shot', (Math.random() - 0.5) * 0.25);
    ST.kickAnim = 0.34; player.cool = 0.35;
    if (M && M.kind === 'pen') penKicked();
  }
  function playerPass() {
    if (NM) return netPass();
    if (!M || M.kind !== 'match' || !ballNear(1.0)) return false;
    const w = W(), f = fwdOf(w ? w.yaw : 0);
    let best = null, bs = 1e9;
    for (const e of M.ents) { if (e === player || e.team !== player.team) continue; tmp.set(e.pos.x - player.pos.x, 0, e.pos.z - player.pos.z); const d = tmp.length(); const fa = tmp.normalize().dot(f); const s = d * (1.6 - fa) + (e.role === 'gk' ? 6 : 0); if (s < bs) { bs = s; best = e; } }
    if (!best) return false;
    passTo(player, best); ST.kickAnim = 0.28; return true;
  }
  function passTo(from, to) {
    const tgt = tmp2.copy(to.pos).addScaledVector(to.vel, 0.45); const d = d2(B.p, tgt);
    const dir = V(tgt.x - B.p.x, 0, tgt.z - B.p.z).normalize();
    kick(from, dir, clamp(d * 1.45 + 2.8, 5, 13), 0.3 + d * 0.03, 'pass');
    to.expect = 1.2;
  }
  // before world.update: LMB / Q / touch, and the queued cheer gesture
  function pre(dt) {
    if (!APP || APP.phase !== 'world') return;
    const I = input, w = W(); if (!w) return;
    if (ST.cheerNext) { ST.cheerNext = false; if (w.mode === 'explore') I.edges.add('Digit2'); }
    const locked = I.look && (I.look.locked || (I.lookFree && I.lookFree()));
    const mouseEdge = I.mouseHeld && !ST.prevMouse; ST.prevMouse = !!I.mouseHeld;
    if (w.mode !== 'explore' || (I.owned && I.owned())) { ST.charge = null; return; } // I.owned: an overlay/menu has the keys (FIX-2)
    if (ST.charge) return;
    if (mouseEdge && locked && ballNear() && canKick()) { startCharge('shot', 'mouse'); I.drag.click = false; }
    if (touch.edge.has('shot')) startCharge('shot', 'touch');
    if (touch.edge.has('chip')) startCharge('chip', 'touch');
    if ((I.pressed('KeyQ') || touch.edge.has('pass')) && ((M && M.kind === 'match') || NM) && canKick() && ballNear(1.0)) { if (playerPass()) I.edges.delete('KeyQ'); }
    touch.edge.clear();
  }
  function updateCharge(dt) {
    const c = ST.charge; if (!c) { bar.style.display = ST.mode === 'bb' && BB && BB.phase === 'aim' ? 'block' : 'none'; return; }
    if (!ballNear(1.6) || !canKick()) { ST.charge = null; bar.style.display = 'none'; return; }
    if (chargeHeld() && c.t < 1.15) { c.t += dt; bar.style.display = 'block'; barSweet.style.display = 'none'; barFill.style.width = Math.min(100, c.t / 0.9 * 100) + '%'; return; }
    const power = clamp(c.t / 0.9, 0.12, 1); ST.charge = null; bar.style.display = 'none';
    playerShot(c.kind, power);
  }
  // procedural kick: the right leg swings back then through (world-space rotation of the thigh + knee)
  const qa = new THREE.Quaternion(), qp = new THREE.Quaternion(), ax = V();
  function rotWorld(bone, axisW, ang) { if (!bone || !bone.parent) return; bone.parent.getWorldQuaternion(qp); ax.copy(axisW).applyQuaternion(qp.clone().invert()); qa.setFromAxisAngle(ax, ang); bone.quaternion.premultiply(qa); }
  function kickPose(dt) {
    if (ST.kickAnim <= 0 || !man.bones) return;
    ST.kickAnim -= dt; const k = 1 - Math.max(0, ST.kickAnim) / 0.34; // 0..1
    const swing = k < 0.35 ? -0.7 * (k / 0.35) : -0.7 + 2.0 * Math.sin(Math.min(1, (k - 0.35) / 0.65) * PI * 0.5) * (1 - Math.max(0, (k - 0.8) / 0.2));
    const knee = k < 0.35 ? 0.9 * (k / 0.35) : 0.9 * (1 - (k - 0.35) / 0.65);
    const f = fwdOf(W() ? W().yaw : 0); const side = V().crossVectors(f, V(0, 1, 0)).normalize(); // f × up: positive angle swings the foot forward
    man.root.updateMatrixWorld(true);
    rotWorld(man.bones.RightUpLeg, side, swing);
    rotWorld(man.bones.RightLeg, side, -knee);
  }

  // ---------------- the match ----------------
  const teamName = t => t === 0 ? 'ZUCK & CO' : 'GLI ALTRI';
  function pickFriends(n) {
    const cast = PERSONAS.filter(p => p.id !== 'zuck' && p.id !== 'bot');
    const act = (window.__npcs && window.__npcs.active && window.__npcs.active()) || [];
    const mp = man.root.position;
    const near = act.filter(id => cast.some(c => c.id === id)).sort((a, b) => { const A = window.__npcs.get(a), Bb = window.__npcs.get(b); return (A ? A.root.position.distanceTo(mp) : 1e9) - (Bb ? Bb.root.position.distanceTo(mp) : 1e9); });
    const rest = cast.map(c => c.id).filter(id => !near.includes(id)).sort(() => Math.random() - 0.5);
    return near.concat(rest).slice(0, n);
  }
  function grabNPC(id, at) {
    const api = window.__npcs; if (!api) return null;
    const was = api.get(id);
    const n = was || api.spawn(id, { at });
    if (!n) return null;
    const keep = { state: n.state, home: n.home && n.home.clone(), was: !!was, chatCD: n.chatCD, leaving: n.leaving };
    n.root.position.copy(at); n.state = 'match'; n.target = null; n.yawGoal = null; n.leaving = true; n.chatCD = 1e9; n.greeted = true;
    return { n, keep };
  }
  const FORM = { // positions (attacking +x for team 0; mirrored for team 1): [x offset from own goal line, z offset]
    gk: [0.7, 0], a: [6.5, -2.4], b: [6.5, 2.4], kick: [8.0, 0], kick2: [7.4, 2.2],
  };
  function homeOf(e, kickoffTeam) {
    const own = e.team === 0 ? P.x0 : P.x1, sx = e.team === 0 ? 1 : -1;
    let f = e.role === 'gk' ? FORM.gk : e.slot === 0 ? FORM.a : FORM.b;
    if (e.role !== 'gk' && kickoffTeam === e.team) f = e.isPlayer || (e.slot === 0 && !((M && M.ents) || [player]).some(o => o.isPlayer && o.team === e.team)) ? FORM.kick : e.slot === 0 ? FORM.kick2 : FORM.kick2.map((v, i) => i ? -v : v);
    if (kickoffTeam !== e.team && e.role !== 'gk') f = [Math.min(f[0], 6.2), f[1] * 1.2];
    return V(own + sx * f[0], 0, P.cz + f[1] * (e.team === 0 ? 1 : -1));
  }
  function startMatch() {
    if (M || NM) return;
    const ids = pickFriends(5);
    if (ids.length < 3) { toast('Non c\'è nessuno per il calcetto… chiama qualcuno col telefono'); return; }
    fade.textContent = 'Arrivano gli amici…'; fade.classList.add('on');
    sfx('whistle');
    setTimeout(() => {
      const ents = [player];
      player.team = 0; player.role = 'f'; player.slot = 1; player.goals = 0; player.cool = 0;
      const roles = [[0, 'gk', 0], [0, 'f', 0], [1, 'gk', 0], [1, 'f', 0], [1, 'f', 1]].slice(0, ids.length === 3 ? 3 : 5);
      if (ids.length < 5) roles.splice(0, roles.length, [0, 'gk', 0], [1, 'gk', 0], [1, 'f', 0]);
      const grabbed = [];
      ids.forEach((id, i) => {
        const r = roles[i]; if (!r) return; const e = { id, name: (persona(id) || {}).name || id, team: r[0], role: r[1], slot: r[2], pos: null, vel: V(), yaw: 0, cool: 0, goals: 0, kickT: 0, dive: 0, diveDir: 0, think: Math.random() * 0.3, expect: 0 };
        const g = grabNPC(id, homeOf(e, 0)); if (!g) return; e.npc = g.n; e.keep = g.keep; e.pos = g.n.root.position; ents.push(e); grabbed.push(e);
      });
      M = { kind: 'match', ents, phase: 'intro', t: 0, clock: 180, score: [0, 0], kickTeam: 0, steal: 1.0, outT: 0, goalsBy: {}, log: [] };
      kickoff(0, true);
      const w = W(); if (w) { M.camDist = w.camDist; w.camDist = Math.max(w.camDist, 3.3); w.vel.set(0, 0, 0); }
      fade.classList.remove('on');
      hud.style.display = 'block'; renderHud();
      const cap = ents.find(e => e.team === 0 && !e.isPlayer && e.role === 'gk');
      toast('Calcetto 3 contro 3, 3 minuti. E o clic = tira (tieni premuto), R = pallonetto, Q = passa', '');
      for (const e of ents) if (e.npc && Math.random() < 0.6) e.npc.say(rnd(LINES.kickoff), 3);
      if (cap) cap.npc.say('Io sto in porta, voi correte', 3);
      xp(5, 'Calcetto');
    }, 420);
  }
  function kickoff(team, first = false) {
    M.kickTeam = team; M.phase = first ? 'intro' : 'kickoff'; M.t = 0; resetBall();
    for (const e of M.ents) {
      const h = homeOf(e, team); e.vel.set(0, 0, 0); e.dive = 0; e.expect = 0; e.holdT = 0; e.cool = 0;
      if (e.isPlayer) { if (first || !inCage(player.pos, 0.2)) { man.root.position.set(h.x, man.root.position.y, h.z); const w = W(); if (w) { w.yaw = e.team === 0 ? PI / 2 : -PI / 2; w.camYaw = w.yaw + PI; } } }
      else { e.pos.set(h.x, 0, h.z); e.yaw = e.team === 0 ? PI / 2 : -PI / 2; }
    }
  }
  function matchGoal(team, by, own) {
    M.score[team]++; M.phase = 'goal'; M.t = 0; sfx('whistle'); sfx('clear');
    const scorer = own ? null : by;
    if (scorer) { scorer.goals = (scorer.goals || 0) + 1; }
    const nm = by ? (by.isPlayer ? 'Zuck' : by.name) : '';
    banner.innerHTML = (own ? 'AUTOGOL' : 'GOOOOL!') + `<small>${nm ? (own ? nm + ' nella propria porta' : nm) : ''} · ${teamName(0)} ${M.score[0]} – ${M.score[1]} ${teamName(1)}</small>`;
    banner.classList.add('on');
    for (const e of M.ents) {
      if (!e.npc) continue;
      const happy = e.team === team;
      try { e.npc.man.gesture(happy ? 'cheer' : 'facepalm'); } catch (x) { }
      if (e === by && !own) e.npc.say(rnd(e.team === 0 ? LINES.goalUs : LINES.goalThem), 3);
      else if (own && e.team !== by.team && Math.random() < 0.6) e.npc.say(rnd(LINES.own), 3);
      else if (!happy && Math.random() < 0.5) e.npc.say(rnd(LINES.conceded), 3);
      else if (happy && Math.random() < 0.35) e.npc.say(rnd(e.team === 0 ? LINES.goalUs : LINES.goalThem), 3);
    }
    if (by && by.isPlayer && !own) {
      ST.cheerNext = true; xp(25, 'Gol al calcetto');
      save('bomber_petroni', 'Bomber di Petroni', 'Il tuo primo gol al calcetto di Teletubbylandia', '⚽');
      if (B.kind === 'chip') save('cucchiaio', 'Cucchiaio', 'Un gol di pallonetto al calcetto', '🥄');
      if (player.goals === 3) { save('hat_trick', 'Hat-trick', 'Tre gol nella stessa partita di calcetto', '🎩'); toast('HAT-TRICK!', 'gold'); }
      if (B.kind === 'chip') toast('Gol di cucchiaio!', 'gold');
    }
    if (by && by.isPlayer && own) toast('Autogol… la chat non te lo farà dimenticare', 'warn');
    M.log.push({ team, by: by ? by.id : null, own });
    renderHud();
  }
  function endMatch(reason = '') {
    if (!M || M.phase === 'end') return;
    M.phase = 'end'; M.t = 0; sfx('whistle'); setTimeout(() => sfx('whistle'), 380);
    const [a, b] = M.score, res = reason ? 'forfeit' : a > b ? 'win' : a < b ? 'loss' : 'draw';
    banner.innerHTML = (res === 'win' ? 'VITTORIA!' : res === 'loss' ? 'SCONFITTA' : res === 'draw' ? 'PAREGGIO' : 'PARTITA ABBANDONATA') + `<small>${teamName(0)} ${a} – ${b} ${teamName(1)}${player.goals ? ` · ${player.goals} gol tuoi` : ''}</small>`;
    banner.classList.add('on');
    const L = res === 'win' ? LINES.win : res === 'loss' ? LINES.loss : LINES.draw;
    for (const e of M.ents) if (e.npc) {
      const mine = e.team === 0, good = (res === 'win' && mine) || (res === 'loss' && !mine);
      try { e.npc.man.gesture(good ? 'cheer' : res === 'draw' ? 'shrug' : 'facepalm'); } catch (x) { }
      if (Math.random() < 0.7) e.npc.say(rnd(res === 'forfeit' ? ['Ma dove vai? Codardo', 'Scappa scappa', 'Vabbè, a tavolino 3-0'] : good ? LINES.win : res === 'draw' ? LINES.draw : LINES.loss), 4);
    }
    if (res !== 'forfeit') {
      xp(res === 'win' ? 120 : res === 'draw' ? 70 : 40, 'Partita di calcetto');
      if (res === 'win') save('calcetto_win', 'Campioni di Teletubbylandia', 'Hai vinto una partita di calcetto con gli amici', '🏆');
      save('calcetto_first', 'Calcetto del mercoledì', 'Hai giocato una partita di calcetto', '👟');
      // the group chat comments
      try {
        const ph = window.__phone; if (ph && ph.push) {
          const mates = M.ents.filter(e => e.npc); const w1 = rnd(mates), w2 = rnd(mates.filter(x => x !== w1)) || w1;
          const t1 = res === 'win' ? `Calcetto: ${a}-${b} per noi. ${player.goals > 1 ? 'Zuck ne ha fatti ' + player.goals + ', chi ci crede' : 'Godo'}` : res === 'loss' ? `${b}-${a} per noi, Zuck e i suoi asfaltati 😂` : `${a}-${b} al calcetto, rivincita?`;
          setTimeout(() => ph.push({ from: (res === 'loss' ? mates.find(e => e.team === 1) || w1 : w1).id, text: t1 }), 2500);
          setTimeout(() => ph.push({ from: w2.id, text: rnd(res === 'win' ? ['Culo, solo culo', 'Partita truccata porca troia', 'Rivincita mercoledì, coglioni'] : res === 'loss' ? ['Ma come si fa a perdere così, dai cazzo', 'Zuck in porta la prossima volta, per favore', 'Che pippe'] : ['Pareggio di merda', 'Rivincita, palese']) }), 6500);
        }
      } catch (e) { }
    } else toast('Partita abbandonata');
  }
  function releaseMatch() {
    if (!M) return;
    const w = W(); if (w && M.camDist != null) w.camDist = M.camDist;
    const gate = V((P.gate[0] + P.gate[1]) / 2, 0, P.z0);
    const extra = [];
    for (const e of M.ents) {
      if (!e.npc) continue; const n = e.npc; n.root.rotation.x = 0; n.root.rotation.z = 0;
      extra.push({ n, keep: e.keep, path: [V(gate.x, 0, gate.z + 0.9), V(gate.x, 0, gate.z - 1.4), V(gate.x - 3 + Math.random() * 6, 0, gate.z - 3 - Math.random() * 3)], t: 0 });
    }
    ST.exits = extra;
    hud.style.display = 'none'; banner.classList.remove('on');
    M = null; resetBall(V(P.cx + 2.2, R, P.cz));
  }
  function updateExits(dt) {
    if (!ST.exits) return;
    let left = 0;
    for (const x of ST.exits) {
      if (x.done) continue; left++; x.t += dt; const n = x.n, p = n.root.position;
      if (!n.root.parent) { x.done = true; continue; }
      const tgt = x.path[0];
      if (!tgt || x.t > 25) { // done: back to npcs.js
        n.state = 'idle'; n.wait = 2 + Math.random() * 4; n.leaving = false; n.chatCD = 10 + Math.random() * 20; n.target = null;
        n.home = p.clone(); // they hang around the meadow for a while (npcs.js rotates them out later)
        if (x.keep && !x.keep.was) x.despawnT = 30;
        x.done = true; continue;
      }
      tmp.set(tgt.x - p.x, 0, tgt.z - p.z); const L = tmp.length();
      if (L < 0.25) { x.path.shift(); continue; }
      tmp.multiplyScalar(1 / L); p.x += tmp.x * 1.4 * dt; p.z += tmp.z * 1.4 * dt; n.root.rotation.y = Math.atan2(tmp.x, tmp.z); n.speed = 1.6; n.yawGoal = null; n.state = 'match'; n.leaving = true;
    }
    // friends we called just for the match leave when you are far (keeps the NPC count low)
    for (const x of ST.exits) if (x.done && x.despawnT != null) { x.despawnT -= dt; if (x.despawnT <= 0 && x.n.root.position.distanceTo(man.root.position) > 22) { try { window.__npcs.despawn(x.n.id); } catch (e) { } x.despawnT = null; } }
    if (!left && ST.exits.every(x => x.despawnT == null)) ST.exits = null;
  }
  // AI ------------------------------------------------------------------------------------------------
  const goalX = t => t === 0 ? P.x1 : P.x0, ownX = t => t === 0 ? P.x0 : P.x1, sxOf = t => t === 0 ? 1 : -1;
  function steer(e, tx, tz, speed, dt) {
    tmp.set(tx - e.pos.x, 0, tz - e.pos.z); const L = tmp.length();
    const s = L < 0.15 ? 0 : Math.min(speed, L * 2.2);
    if (L > 1e-4) tmp.multiplyScalar(s / L);
    e.vel.lerp(tmp, 1 - Math.exp(-dt * 6));
  }
  function aiShoot(e) {
    const gx = goalX(e.team), side = Math.random() < 0.5 ? -1 : 1;
    const tz = P.cz + side * (0.35 + Math.random() * 0.95) * MOUTH;
    const dir = V(gx - B.p.x, 0, tz - B.p.z).normalize(); const err = (Math.random() - 0.5) * 0.16; dir.applyAxisAngle(V(0, 1, 0), err);
    const pw = 0.55 + Math.random() * 0.4;
    if (Math.random() < 0.08 && d2(e.pos, V(gx, 0, P.cz)) < 7) kick(e, dir, 6.5 + pw * 3, 4.6, 'chip');
    else kick(e, dir, 8 + pw * 11, 0.5 + pw * 2.2, 'shot', (Math.random() - 0.5) * 0.4);
  }
  function openness(e) { let m = 9; for (const o of M.ents) if (o.team !== e.team) m = Math.min(m, d2(o.pos, e.pos)); return m; }
  function updateAI(dt) {
    const ents = M.ents, frozen = M.phase !== 'play';
    // who chases (field players closest to the ball, per team, hysteresis via e.chase)
    for (const t of [0, 1]) {
      let best = null, bd = 1e9;
      for (const e of ents) if (e.team === t && e.role !== 'gk') { const d = d2(e.pos, B.p) - (e.chase ? 0.8 : 0) - (e.isPlayer ? (Math.hypot(e.vel.x, e.vel.z) > 0.5 ? 0.5 : -1.2) : 0); /* an idle human doesn't count as the chaser: the AI mate goes */ if (d < bd) { bd = d; best = e; } }
      for (const e of ents) if (e.team === t) e.chase = e === best;
    }
    const own = B.owner;
    for (const e of ents) {
      if (e.isPlayer) { const w = W(); e.yaw = w ? w.yaw : 0; if (w) e.vel.copy(w.vel); continue; }
      const n = e.npc; e.think -= dt; e.kickT -= dt; e.expect -= dt;
      const sx = sxOf(e.team), gx = goalX(e.team), ox = ownX(e.team);
      let tx = e.pos.x, tz = e.pos.z, spd = 2.3;
      if (frozen) { const h = homeOf(e, M.kickTeam); tx = h.x; tz = h.z; spd = 2.2; if (M.phase === 'goal' || M.phase === 'end') { tx = e.pos.x; tz = e.pos.z; } }
      else if (e.role === 'gk') {
        // stay between the ball and the middle of the goal; rush a slow ball that's close; dive at shots
        const bx = B.p.x, toward = (B.v.x * -sx) > 2.5 && !own;
        let zt = P.cz + clamp((B.p.z - P.cz) * 0.55, -MOUTH + 0.25, MOUTH - 0.25), xt = ox + sx * 0.65;
        if (toward) { const tl = (ox - B.p.x) / (B.v.x || 1e-3); if (tl > 0 && tl < 1.4) { const za = B.p.z + B.v.z * tl; if (Math.abs(za - P.cz) < MOUTH + 0.4) { zt = clamp(za, P.cz - MOUTH, P.cz + MOUTH); if (!e.dive && tl < 0.55) { e.dive = 0.7; e.diveDir = Math.sign(za - e.pos.z) || 1; } } } }
        const near = d2(V(ox + sx * 2, 0, P.cz), B.p) < 3.2 && !own && B.v.length() < 5;
        if (near || (own === e)) { xt = B.p.x; zt = B.p.z; }
        if (own === e) { e.holdT = (e.holdT || 0) + dt; xt = ox + sx * 1.0; zt = P.cz; if (e.holdT > 0.9) { const mates = ents.filter(m => m.team === e.team && m !== e); const m = mates.sort((a, b) => openness(b) - openness(a))[0]; if (m && Math.random() < 0.8) passTo(e, m); else kick(e, V(sx, 0, (Math.random() - 0.5) * 0.6).normalize(), 13, 3.5, 'shot'); e.holdT = 0; } }
        tx = clamp(xt, Math.min(ox, ox + sx * 3.2), Math.max(ox, ox + sx * 3.2)); tz = clamp(zt, P.cz - MOUTH - 0.6, P.cz + MOUTH + 0.6);
        spd = e.dive > 0 ? 4.2 : 2.4;
        if (toward && e.savedKick !== B.kickId && d2(e.pos, B.p) < 0.95 && B.p.y < P.goalH + 0.1) trySave(e);
      } else if (own === e) {
        // dribble to goal; shoot when close; pass under pressure
        let ptx = gx - sx * 1.5, ptz = P.cz;
        let press = null, pd = 9; for (const o of ents) if (o.team !== e.team) { const d = d2(o.pos, e.pos); const ahead = (o.pos.x - e.pos.x) * sx > -0.2; if (ahead && d < pd) { pd = d; press = o; } }
        if (press && pd < 2.2) ptz += (e.pos.z > press.pos.z ? 1 : -1) * 2.2;
        tx = ptx; tz = clamp(ptz, P.z0 + 0.8, P.z1 - 0.8); spd = 2.05;
        const dg = d2(e.pos, V(gx, 0, P.cz));
        if (e.think <= 0) {
          e.think = 0.25 + Math.random() * 0.2;
          const mates = ents.filter(m => m.team === e.team && m !== e && m.role !== 'gk');
          const toPlayer = e.team === player.team && mates.includes(player) && inCage(player.pos, 0.3);
          if (dg < 4.5 || (dg < 8.5 && Math.random() < 0.18)) aiShoot(e);
          else if (pd < 1.5 && mates.length && Math.random() < 0.55) { const m = toPlayer && Math.random() < 0.7 ? player : mates.sort((a, b) => openness(b) - openness(a))[0]; passTo(e, m); }
          else if (toPlayer && Math.random() < 0.12 && (player.pos.x - e.pos.x) * sx > 1) passTo(e, player);
        }
      } else if (e.chase && (!own || own.team !== e.team) && e.expect <= 0) {
        // chase the loose ball / press the carrier
        const lead = own ? 0.15 : clamp(d2(e.pos, B.p) / 4, 0, 0.6);
        tx = B.p.x + B.v.x * lead; tz = B.p.z + B.v.z * lead; spd = 2.5;
      } else if (e.expect > 0 && !own) { tx = B.p.x + B.v.x * 0.2; tz = B.p.z + B.v.z * 0.2; spd = 2.5; }
      else if (own && own.team === e.team) { // support: ahead of the ball, on the other side of the lane
        tx = clamp(B.p.x + sx * 3.4, P.x0 + 1.2, P.x1 - 1.2); tz = P.cz + (B.p.z < P.cz ? 2.6 : -2.6); spd = 2.1;
      } else { // defend: between the ball and the own goal
        tx = (B.p.x + ox) / 2 + sx * 0.5; tz = P.cz + (B.p.z - P.cz) * 0.5; spd = 2.2;
      }
      if (e.dive > 0) { e.dive -= dt; }
      steer(e, tx, tz, spd, dt);
      e.pos.addScaledVector(e.vel, dt);
      // stay in the cage and out of the goals; keep off the player
      e.pos.x = clamp(e.pos.x, P.x0 + 0.3, P.x1 - 0.3); e.pos.z = clamp(e.pos.z, P.z0 + 0.3, P.z1 - 0.3);
      const pd = d2(e.pos, player.pos); if (pd < 0.58 && pd > 1e-4) { e.pos.x += (e.pos.x - player.pos.x) / pd * (0.58 - pd); e.pos.z += (e.pos.z - player.pos.z) / pd * (0.58 - pd); }
      const sp = Math.hypot(e.vel.x, e.vel.z);
      if (sp > 0.25) e.yaw = Math.atan2(e.vel.x, e.vel.z); else if (!frozen) e.yaw = Math.atan2(B.p.x - e.pos.x, B.p.z - e.pos.z);
      if (own === e) { const want = Math.atan2(tx - e.pos.x, tz - e.pos.z); e.yaw += wrapA(want - e.yaw) * Math.min(1, dt * 6); }
      // drive the NPC body (npcs.js leaves state 'match' alone; it eases n.speed toward 0 every frame, so a bit more)
      n.root.rotation.y += wrapA(e.yaw - n.root.rotation.y) * Math.min(1, dt * 10);
      n.speed = sp * 1.18; n.state = 'match'; n.yawGoal = null; n.target = null; n.leaving = true; n.chatCD = 1e9;
      n.root.rotation.z = e.dive > 0 ? e.diveDir * -0.9 * Math.sin(Math.min(1, (0.7 - e.dive) / 0.25) * PI * 0.5) * Math.min(1, e.dive / 0.2) : n.root.rotation.z * (1 - Math.min(1, dt * 8));
      n.root.rotation.x *= 1 - Math.min(1, dt * 6);
      n.root.position.y = 0;
    }
  }
  function trySave(g) {
    g.savedKick = B.kickId;
    const sp = B.v.length(), tl = (ownX(g.team) - B.p.x) / (B.v.x || 1e-3), za = B.p.z + B.v.z * Math.max(0, tl);
    let ch = clamp(1.05 - sp * 0.022 - Math.abs(za - g.pos.z) * 0.32, 0.1, 0.88);
    if (M && M.kind === 'pen') ch = clamp(ch - 0.12, 0.05, 0.8);
    if (M && M.kind === 'match' && B.last && B.last.isPlayer) ch *= 0.92;
    if (Math.random() < ch) {
      if (sp < 10) take(g); else { B.v.x *= -0.35; B.v.z += (Math.random() - 0.5) * 4; B.v.y = 1.6 + Math.random(); B.last = g; }
      sfx('hit'); if (g.npc) g.npc.say(rnd(LINES.save), 2.2);
      if (M && M.kind === 'pen') penResult(false, true);
    }
  }
  function renderHud() {
    if (!M) return;
    if (M.kind === 'pen') { hud.innerHTML = `<i>Rigori vs ${M.gk ? M.gk.name : ''}</i> <b>${M.goals}</b><i>/ ${M.n}</i> <span class="clk">${'●'.repeat(M.goals)}${'○'.repeat(M.n - M.goals)}</span>`; return; }
    const c = Math.max(0, M.clock), m = Math.floor(c / 60), s = Math.floor(c % 60);
    hud.innerHTML = `<i>${teamName(0)}</i> <b>${M.score[0]}</b> – <b>${M.score[1]}</b> <i>${teamName(1)}</i><span class="clk">${m}:${String(s).padStart(2, '0')}</span>`;
  }
  function updateMatch(dt) {
    M.t += dt;
    if (M.phase === 'intro' || M.phase === 'kickoff') { if (M.t > (M.phase === 'intro' ? 1.4 : 1.0)) { M.phase = 'play'; M.t = 0; sfx('whistle'); } }
    else if (M.phase === 'play') {
      M.clock -= dt; if ((M.clock | 0) !== (M.lastSec | 0)) { M.lastSec = M.clock; renderHud(); }
      if (M.clock <= 0) endMatch();
      // the player walked out of the cage
      if (!inCage(player.pos, -0.2)) { M.outT += dt; if (M.outT > 0.5 && !M.warned) { M.warned = true; toast('Torna in campo entro 5 secondi o la partita è persa a tavolino', 'warn'); } if (M.outT > 5.5) endMatch('forfeit'); } else { M.outT = 0; M.warned = false; }
    } else if (M.phase === 'goal') {
      if (M.t > 2.6) { banner.classList.remove('on'); const last = M.log[M.log.length - 1]; kickoff(last ? 1 - last.team : 0); if (M.clock <= 0) endMatch(); }
    } else if (M.phase === 'end') { if (M.t > 4.5) releaseMatch(); return; }
    updateAI(dt);
    if (M.phase === 'play') contacts(M.ents, dt);
  }

  // ---------------- penalties (5 kicks vs a friend in the west goal) ----------------
  function startPens() {
    if (M || NM) return;
    const id = pickFriends(1)[0]; if (!id) { toast('Non c\'è nessuno in porta…'); return; }
    fade.textContent = 'Rigori'; fade.classList.add('on');
    setTimeout(() => {
      const g = { id, name: (persona(id) || {}).name || id, team: 1, role: 'gk', pos: null, vel: V(), yaw: PI / 2, cool: 0, goals: 0, kickT: 0, dive: 0, diveDir: 0, think: 0, expect: 0 };
      const gr = grabNPC(id, V(P.x0 + 0.65, 0, P.cz)); if (!gr) { fade.classList.remove('on'); return; }
      g.npc = gr.n; g.keep = gr.keep; g.pos = gr.n.root.position;
      player.team = 0;
      M = { kind: 'pen', ents: [player, g], gk: g, n: 5, k: 0, goals: 0, phase: 'aim', t: 0, outcome: null };
      setupPen();
      const w = W(); if (w) { M.camDist = w.camDist; w.camDist = 2.6; }
      fade.classList.remove('on'); hud.style.display = 'block'; renderHud();
      g.npc.say(rnd(['Tira, se hai coraggio', 'Te li paro tutti, coglione', 'Prova a segnarmi, dai']), 3);
      toast('Rigori: mira con la visuale (mouse), E o clic per tirare (tieni premuto = più forte), R = cucchiaio');
    }, 380);
  }
  function setupPen() {
    resetBall(PEN_SPOT); M.phase = 'aim'; M.t = 0; M.outcome = null;
    man.root.position.set(PEN_SPOT.x + 0.95, man.root.position.y, PEN_SPOT.z); const w = W(); if (w) { w.yaw = -PI / 2; w.camYaw = PI / 2; w.camPitch = 0.18; w.vel.set(0, 0, 0); }
    const g = M.gk; g.pos.set(P.x0 + 0.6, 0, P.cz); g.vel.set(0, 0, 0); g.dive = 0; g.guess = null;
  }
  function penKicked() { M.phase = 'flight'; M.t = 0; const r = Math.random(); M.gk.guess = r < 0.4 ? -1 : r < 0.8 ? 1 : 0; }
  function penResult(goal, saved = false) {
    if (!M || M.kind !== 'pen' || M.outcome) return;
    M.outcome = goal ? 'goal' : saved ? 'save' : 'miss'; M.t = 0; M.phase = 'result'; M.k++;
    if (goal) { M.goals++; sfx('clear'); banner.innerHTML = B.kind === 'chip' ? 'CUCCHIAIO!' : 'GOL!'; ST.cheerNext = true; xp(15, 'Rigore'); if (B.kind === 'chip') save('cucchiaio', 'Cucchiaio', 'Un gol di pallonetto al calcetto', '🥄'); M.gk.npc.say(rnd(['Porca troia', 'Culo', 'Ma vaffanculo', 'Non vale, mi sono scivolato']), 2.5); }
    else { banner.innerHTML = saved ? 'PARATO!' : 'FUORI!'; if (!saved) M.gk.npc.say(rnd(LINES.miss), 2.5); }
    banner.classList.add('on'); renderHud();
  }
  function updatePens(dt) {
    M.t += dt; const g = M.gk;
    if (M.phase === 'flight') {
      // the keeper guesses a side (reaction 0.12 s), the ball either goes in (onGoal) or stops / goes wide
      if (M.t > 0.12 && g.guess != null) { const tz = P.cz + g.guess * (MOUTH - 0.45); steer(g, P.x0 + 0.6, tz, 4.6, dt); if (g.guess && !g.dive) { g.dive = 0.7; g.diveDir = g.guess; } }
      if (M.t > 2.4 || (B.v.length() < 0.6 && M.t > 0.8) || (B.p.x > PEN_SPOT.x + 2)) penResult(false);
    } else if (M.phase === 'result') {
      steer(g, P.x0 + 0.6, P.cz, 1.6, dt);
      if (M.t > 1.8) { banner.classList.remove('on'); if (M.k >= M.n) return endPens(); setupPen(); }
    } else if (M.phase === 'end') { if (M.t > 3.2) { banner.classList.remove('on'); releaseMatch(); } return; }
    else steer(g, P.x0 + 0.6, P.cz + Math.sin(M.t * 2.1) * 0.5, 1.6, dt); // the keeper bounces on the line
    g.pos.addScaledVector(g.vel, dt); g.pos.x = clamp(g.pos.x, P.x0 + 0.3, P.x0 + 2); g.pos.z = clamp(g.pos.z, P.cz - MOUTH - 0.3, P.cz + MOUTH + 0.3);
    if (g.dive > 0) g.dive -= dt;
    if (M.phase === 'flight' && g.savedKick !== B.kickId && d2(g.pos, B.p) < 0.95 && B.p.y < P.goalH + 0.1 && B.p.x < P.x0 + 1.6) trySave(g);
    const n = g.npc; n.root.rotation.y = PI / 2; n.speed = Math.hypot(g.vel.x, g.vel.z) * 1.15; n.state = 'match'; n.leaving = true; n.chatCD = 1e9; n.yawGoal = null;
    n.root.rotation.z = g.dive > 0 ? g.diveDir * -1.0 * Math.min(1, (0.7 - g.dive) / 0.2) : n.root.rotation.z * (1 - Math.min(1, dt * 6));
    if (!inCage(player.pos, -0.3) && M.phase !== 'end') endPens(true);
  }
  function endPens(quit = false) {
    M.phase = 'end'; M.t = 0;
    banner.innerHTML = quit ? 'RIGORI ABBANDONATI' : `RIGORI: ${M.goals}/${M.n}<small>${M.goals >= 4 ? 'Rigorista vero' : M.goals >= 2 ? 'Si può fare di meglio' : 'Ciabattate'}</small>`; banner.classList.add('on');
    if (!quit) { xp(10, 'Rigori'); if (M.goals === M.n) save('rigorista', 'Dagli undici metri', 'Cinque rigori su cinque', '🎯'); M.gk.npc.say(M.goals >= 4 ? 'Vabbè, oggi non ero in giornata' : 'Te l\'avevo detto, paro tutto', 3.5); }
  }

  // ---------------- free throws at the hoop ----------------
  let BB = null;
  const bbBest = () => { try { return +localStorage.getItem('bigalesso_bb_best') || 0; } catch (e) { return 0; } };
  function startBB() {
    if (M || NM) return;
    BB = { n: 10, k: 0, made: 0, streak: 0, phase: 'aim', t: 0, p: V(), v: V(), charge: 0, holding: false, src: null, res: null };
    ST.mode = 'bb';
    man.root.position.set(HOOP.spot[0], man.root.position.y, HOOP.spot[1]); const w = W(); if (w) { w.yaw = PI; w.camYaw = 0; w.camPitch = 0.12; w.vel.set(0, 0, 0); BB.cam = w.camDist; w.camDist = 2.4; }
    hud.style.display = 'block'; bbHud();
    toast('Tiri liberi: tieni premuto E (o clic) e rilascia nella zona chiara. 10 tiri');
  }
  function bbHud() { hud.innerHTML = `<i>Tiri liberi</i> <b>${BB.made}</b><i>/ ${BB.k} · tiro ${Math.min(BB.k + 1, BB.n)} di ${BB.n} · record ${bbBest()}</i>`; }
  const SWEET = [0.62, 0.74];
  function updateBB(dt) {
    const I = input, w = W(); BB.t += dt;
    const hand = V(man.root.position.x, 1.95, man.root.position.z - 0.25);
    if (d2(man.root.position, V(HOOP.spot[0], 0, HOOP.spot[1])) > 2.5 || !w || w.mode !== 'explore') return endBB(true);
    if (BB.phase === 'aim') {
      bball.position.copy(hand).add(V(0, Math.sin(BB.t * 3) * 0.03, 0));
      const held = I.k('KeyE') || I.k('Enter') || I.mouseHeld || I.tHeld('act') || touch.shot || I.padHeld(0, 0);
      if (held && !BB.holding && BB.t > 0.35) { BB.holding = true; BB.charge = 0; }
      if (BB.holding) {
        BB.charge += dt * 0.85; bar.style.display = 'block'; barSweet.style.display = 'block'; barSweet.style.left = SWEET[0] * 100 + '%'; barSweet.style.width = (SWEET[1] - SWEET[0]) * 100 + '%'; barFill.style.width = Math.min(100, BB.charge * 100) + '%';
        if (!held || BB.charge >= 1.05) { BB.holding = false; bar.style.display = 'none'; bbShoot(clamp(BB.charge, 0, 1.05), hand); }
      }
      I.edges.delete('KeyE');
    } else if (BB.phase === 'flight') {
      const n = 6; for (let i = 0; i < n; i++) bbStep(dt / n);
      bball.position.copy(BB.p);
      if (BB.t > 2.6) bbDone();
    } else if (BB.phase === 'result') { if (BB.t > 1.0) { banner.classList.remove('on'); if (BB.k >= BB.n) return endBB(); BB.phase = 'aim'; BB.t = 0; bbHud(); } }
  }
  function bbShoot(c, hand) {
    BB.phase = 'flight'; BB.t = 0; BB.p.copy(hand); BB.res = null; BB.scored = false;
    // exact launch to the rim centre at 55°, then the charge error scales it
    const rim = V(HOOP.x, HOOP.rimH, HOOP.rimZ), dx = Math.hypot(rim.x - hand.x, rim.z - hand.z), dy = rim.y - hand.y, a = 55 * PI / 180;
    const v0 = Math.sqrt(G * dx * dx / (2 * Math.cos(a) ** 2 * (dx * Math.tan(a) - dy)));
    const mid = (SWEET[0] + SWEET[1]) / 2, err = (c - mid) * 0.55; // ±0.06 sweet zone -> ±3%
    const k = 1 + err + (Math.random() - 0.5) * 0.012;
    const h = V(rim.x - hand.x, 0, rim.z - hand.z).normalize();
    BB.v.set(h.x * v0 * Math.cos(a) * k, v0 * Math.sin(a) * k, h.z * v0 * Math.cos(a) * k);
    BB.v.x += (Math.random() - 0.5) * 0.08;
    ST.cheer = false; sfx('throw');
  }
  function bbStep(h) {
    const p = BB.p, v = BB.v, r = 0.12;
    const prevY = p.y;
    v.y -= G * h; p.addScaledVector(v, h);
    const rc = V(HOOP.x, HOOP.rimH, HOOP.rimZ);
    // through the rim (downward crossing inside the ring)
    if (!BB.scored && prevY >= HOOP.rimH && p.y < HOOP.rimH && Math.hypot(p.x - rc.x, p.z - rc.z) < HOOP.rimR - r * 0.55) { BB.scored = true; v.multiplyScalar(0.35); sfx('pickup'); }
    // the rim itself (torus): bounce off the nearest point of the ring
    tmp.set(p.x - rc.x, 0, p.z - rc.z); const L = tmp.length() || 1; tmp.multiplyScalar(HOOP.rimR / L); tmp2.set(rc.x + tmp.x, rc.y, rc.z + tmp.z);
    const dv = V().subVectors(p, tmp2), dl = dv.length();
    if (dl < r + 0.016) { dv.multiplyScalar(1 / (dl || 1)); p.copy(tmp2).addScaledVector(dv, r + 0.017); const vn = v.dot(dv); if (vn < 0) { v.addScaledVector(dv, -1.55 * vn); v.multiplyScalar(0.8); sfx('hit'); } }
    // backboard
    if (p.z < HOOP.board + 0.025 + r && p.y > HOOP.rimH - 0.15 && p.y < HOOP.rimH + 0.9 && Math.abs(p.x - HOOP.x) < 0.85) { p.z = HOOP.board + 0.025 + r; if (v.z < 0) { v.z = -v.z * 0.55; sfx('ballBounce', 0.6); } }
    // ground
    if (p.y < r) { p.y = r; if (v.y < -1) { v.y = -v.y * 0.6; sfx('ballBounce', 0.4); } else v.y = 0; v.x *= 0.98; v.z *= 0.98; }
    if (BB.scored && p.y < 1.2 && !BB.res) bbDone();
    if (!BB.scored && !BB.res && p.y < 1.4 && v.y < 0 && p.z > HOOP.rimZ + 0.6) bbDone();
  }
  function bbDone() {
    if (BB.res) return; BB.res = BB.scored ? 'in' : 'out'; BB.k++; BB.phase = 'result'; BB.t = 0;
    if (BB.scored) { BB.made++; BB.streak++; banner.innerHTML = BB.streak >= 3 ? `ON FIRE ×${BB.streak}` : 'CANESTRO!'; xp(4, 'Tiri liberi'); if (BB.streak === 5) save('mano_calda', 'Mano calda', 'Cinque tiri liberi di fila', '🏀'); }
    else { BB.streak = 0; banner.innerHTML = rnd(['FERRO!', 'AIRBALL', 'FUORI']); }
    banner.classList.add('on'); bbHud();
  }
  function endBB(quit = false) {
    if (!BB) return;
    const w = W(); if (w && BB.cam != null) w.camDist = BB.cam;
    if (!quit || BB.k) { const best = bbBest(); if (BB.made > best) try { localStorage.setItem('bigalesso_bb_best', String(BB.made)); } catch (e) { }
      toast(`Tiri liberi: ${BB.made}/${BB.k}${BB.made > best ? ' · nuovo record!' : ''}`, BB.made >= 7 ? 'gold' : ''); if (BB.made >= 8) save('splash', 'Splash', 'Almeno 8 tiri liberi su 10', '💦'); }
    BB = null; ST.mode = null; hud.style.display = 'none'; bar.style.display = 'none'; banner.classList.remove('on');
    bball.position.set(HOOP.x + 0.5, 0.12, HOOP.spot[1] + 0.6);
  }

  // ---------------- online match (shared/calcetto.mjs through window.__match) ----------------
  let NM = null;
  const TEAM_NAME = ['BLU', 'ROSSI'];
  function netAttach(s) {
    if (NM && NM.s !== s) netEnd(true);
    if (M) { if (M.kind === 'match') endMatch('forfeit'); releaseMatch(); }
    if (BB) endBB(true);
    NM = { s, v: null, base: null, baseAt: 0, kid: -1, ko: -1, off: V(), bodies: new Map(), sendT: 0, outT: 0, kickAt: -9, kickKid: -1, rewarded: false, endT: 0 };
    const w = W();
    if (!inCage(player.pos, 0.3)) { // teleport into the cage (the party may call us from anywhere)
      fade.textContent = 'Al campetto di Teletubbylandia…'; fade.classList.add('on');
      setTimeout(() => { if (!NM || NM.s !== s) return; if (!inCage(player.pos, 0.3)) { man.root.position.set(P.cx + 2.5, man.root.position.y, P.cz - 3.2); const ww = W(); if (ww) { ww.vel && ww.vel.set(0, 0, 0); ww.yaw = PI; ww.camYaw = 0; } } fade.classList.remove('on'); }, 380);
    }
    if (w) { NM.camDist = w.camDist; w.camDist = Math.max(w.camDist, 3.3); }
    hud.style.display = 'block'; hud.innerHTML = '<i>Calcetto online</i> <i>· in attesa del fischio…</i>';
    s.on('view', netView); s.on('event', netEvent); s.on('over', netOver);
    s.on('error', e => { if (!NM || NM.s !== s || !e) return; if (e.fatal) { toast('Calcetto online: connessione persa', 'warn'); netEnd(false); } });
    resetBall(KICKOFF);
    return true;
  }
  const ballOf = a => ({ x: a[0], y: a[1], z: a[2], vx: a[3], vy: a[4], vz: a[5], spin: 0, net: 0 });
  const predicted = (base, t) => { const b = { ...base }; const n = Math.min(40, Math.ceil(t / (1 / 120))); for (let i = 0; i < n; i++) netStep(b, Math.min(1 / 120, t / n || 0)); return b; };
  function netView(v) {
    if (!NM) return;
    const first = !NM.v; NM.v = v;
    const now = performance.now();
    // the ball: adopt the server state unless my own kick is still in flight to the server
    const mine = NM.kickKid === v.kid && now - NM.kickAt < 300;
    if (mine) NM.v = { ...v, o: -1 };
    if (!mine) {
      const prev = NM.base ? predicted(NM.base, (now - NM.baseAt) / 1000) : null;
      NM.base = ballOf(v.b); NM.baseAt = now; NM.kid = v.kid;
      if (prev && v.o < 0) { NM.off.x += prev.x - NM.base.x; NM.off.y += prev.y - NM.base.y; NM.off.z += prev.z - NM.base.z; if (NM.off.length() > 3) NM.off.set(0, 0, 0); }
    }
    if (v.ko !== NM.ko) { // kick-off: everyone to the spots the referee gives
      NM.ko = v.ko; NM.off.set(0, 0, 0);
      if (v.hm) { man.root.position.set(v.hm[0], man.root.position.y, v.hm[1]); const w = W(); if (w) { w.vel && w.vel.set(0, 0, 0); w.yaw = v.hm[2]; w.camYaw = v.hm[2] + PI; } }
      banner.classList.remove('on');
    }
    if (first) {
      const meT = v.me >= 0 ? v.ps[v.me][3] : 0;
      toast(`Calcetto online ${v.mode === '2v2' ? '2 contro 2' : '1 contro 1'}: sei nei ${TEAM_NAME[meT]}. E o clic = tira (tieni premuto), R = pallonetto${v.mode === '2v2' ? ', Q = passa' : ''}. Esci dal campo 6 s per lasciare`);
      sfx('whistle');
    }
    netBodies(v);
    netHud();
  }
  // bots and humans not in my room (no presence avatar): a friend's NPC body driven by the view
  function netBodies(v) {
    const net = window.__net, used = new Set([...NM.bodies.values()].map(b => b.id));
    v.ps.forEach((p, i) => {
      if (i === v.me) return;
      const id = v.pl[i][0], human = !p[4], present = human && net && net.players && net.players.has(+String(id).slice(1));
      let B0 = NM.bodies.get(i);
      if (present) { if (B0) { netDrop(B0); NM.bodies.delete(i); } return; }
      if (!B0) {
        const fid = pickFriends(8).find(f => !used.has(f)); if (!fid) return; used.add(fid);
        const g = grabNPC(fid, V(p[0], 0, p[1])); if (!g) return;
        B0 = { id: fid, n: g.n, keep: g.keep, x: p[0], z: p[1], yaw: p[2], name: v.pl[i][1] };
        NM.bodies.set(i, B0);
        if (human) g.n.say(v.pl[i][1] + ' (online)', 3); else if (Math.random() < 0.6) g.n.say(rnd(LINES.kickoff), 3);
      }
      B0.tx = p[0]; B0.tz = p[1]; B0.tyaw = p[2];
    });
  }
  function netDrop(b) { const n = b.n; n.root.rotation.x = 0; n.root.rotation.z = 0; n.state = 'idle'; n.wait = 2; n.leaving = false; n.chatCD = 10; n.target = null; n.home = n.root.position.clone(); if (b.keep && !b.keep.was) { try { window.__npcs.despawn(n.id); } catch (e) { } } }
  function netHud() {
    const v = NM.v; if (!v) return;
    const c = Math.max(0, v.cl), m = Math.floor(c / 60), s2 = Math.floor(c % 60), meT = v.me >= 0 ? v.ps[v.me][3] : -1;
    const names = t => v.ps.map((p, i) => p[3] === t ? (i === v.me ? 'tu' : v.pl[i][1]) : null).filter(Boolean).join(', ');
    hud.innerHTML = `<i title="${esc(names(0))}">${meT === 0 ? '▶ ' : ''}${TEAM_NAME[0]}</i> <b>${v.sc[0]}</b> – <b>${v.sc[1]}</b> <i title="${esc(names(1))}">${TEAM_NAME[1]}${meT === 1 ? ' ◀' : ''}</i><span class="clk">${v.ph === 'ko' ? 'calcio d\'inizio' : m + ':' + String(s2).padStart(2, '0')}</span>`;
  }
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function netEvent(e) {
    if (!NM || !e) return; const v = NM.v;
    if (e.k === 'whistle') sfx('whistle');
    else if (e.k === 'kick') { if (!(v && e.i === v.me)) { sfx('ballBounce', 0.6 + (e.sp || 8) / 18); if ((e.sp || 0) > 12) sfx('kick'); const b = NM.bodies.get(e.i); if (b) b.n.root.rotation.x = -0.12; } }
    else if (e.k === 'post') { sfx('hit'); toast('Palo!'); }
    else if (e.k === 'steal' && v && e.from === v.me) toast('Ti hanno rubato palla');
    else if (e.k === 'goal' && v) {
      sfx('whistle'); sfx('clear');
      const meT = v.me >= 0 ? v.ps[v.me][3] : -1, by = e.by >= 0 ? (e.by === v.me ? 'Tu' : v.pl[e.by][1]) : '';
      banner.innerHTML = (e.own ? 'AUTOGOL' : 'GOOOOL!') + `<small>${esc(by)}${by ? ' · ' : ''}${TEAM_NAME[0]} ${e.sc[0]} – ${e.sc[1]} ${TEAM_NAME[1]}</small>`; banner.classList.add('on');
      if (e.by === v.me && !e.own) { ST.cheerNext = true; xp(25, 'Gol al calcetto online'); save('bomber_online', 'Bomber online', 'Un gol al calcetto online con gli amici', '⚽'); }
      for (const [i, b] of NM.bodies) { try { b.n.man.gesture(v.ps[i][3] === e.team ? 'cheer' : 'facepalm'); } catch (x) { } if (i === e.by && !e.own && Math.random() < 0.8) b.n.say(rnd(LINES.goalUs), 3); }
      if (meT >= 0 && meT !== e.team && Math.random() < 0.5) { const b = [...NM.bodies.values()][0]; if (b) b.n.say(rnd(LINES.goalThem), 3); }
    }
  }
  function netOver(r) {
    if (!NM || NM.rewarded) return; NM.rewarded = true;
    const v = NM.v, me = NM.s.me, meT = v && v.me >= 0 ? v.ps[v.me][3] : -1;
    const won = !!(r && r.winners && r.winners.includes(me)), draw = !!(r && r.winners && !r.winners.length), sc = (r && r.sc) || (v ? v.sc : [0, 0]);
    sfx('whistle'); setTimeout(() => sfx('whistle'), 380);
    banner.innerHTML = (meT < 0 ? 'FINE' : won ? 'VITTORIA!' : draw ? 'PAREGGIO' : 'SCONFITTA') + `<small>${TEAM_NAME[0]} ${sc[0]} – ${sc[1]} ${TEAM_NAME[1]}</small>`; banner.classList.add('on');
    if (meT >= 0) {
      const humans = v ? v.ps.filter(p => !p[4]).length : 1, eur = won && humans > 1 ? 20 : 0;
      xp(won ? 120 : draw ? 70 : 40, 'Calcetto online');
      try { eur && window.__rpg && window.__rpg.money && window.__rpg.money.add && window.__rpg.money.add(eur); } catch (e) { }
      save('calcetto_online', 'Calcetto del mercoledì (online)', 'Hai giocato una partita di calcetto online', '👟');
      if (won && humans > 1) save('calcetto_online_win', 'Campioni online', 'Hai vinto una partita di calcetto contro gli amici veri', '🏆');
      toast(`Calcetto online: ${won ? 'vittoria' : draw ? 'pareggio' : 'sconfitta'} ${sc[0]}–${sc[1]} · +${won ? 120 : draw ? 70 : 40} XP${eur ? ' · +€ ' + eur : ''}`, won ? 'gold' : '');
    }
    for (const b of NM.bodies.values()) { try { b.n.man.gesture('shrug'); } catch (x) { } }
    NM.endT = 4.5;
  }
  function netEnd(leave) {
    if (!NM) return; const X = NM; NM = null;
    if (leave) { try { X.s.leave(); } catch (e) { } } else { try { X.s.leave(); } catch (e) { } }
    const w = W(); if (w && X.camDist != null) w.camDist = X.camDist;
    const gate = V((P.gate[0] + P.gate[1]) / 2, 0, P.z0), ex = [];
    for (const b of X.bodies.values()) { const n = b.n; n.root.rotation.x = 0; n.root.rotation.z = 0; ex.push({ n, keep: b.keep, path: [V(gate.x, 0, gate.z + 0.9), V(gate.x, 0, gate.z - 1.4), V(gate.x - 3 + Math.random() * 6, 0, gate.z - 3 - Math.random() * 3)], t: 0 }); }
    if (ex.length) ST.exits = (ST.exits || []).concat(ex);
    hud.style.display = 'none'; banner.classList.remove('on');
    resetBall(V(P.cx + 2.2, R, P.cz));
  }
  function netUpdate(dt) {
    const v = NM.v, w = W(), now = performance.now();
    if (NM.endT > 0) { NM.endT -= dt; if (NM.endT <= 0) { netEnd(true); return; } }
    if (!v) return;
    // hold the kick-off spot until the whistle
    if (v.ph === 'ko' && v.hm && w && w.mode === 'explore') { man.root.position.x = v.hm[0]; man.root.position.z = v.hm[1]; w.vel && w.vel.set(0, 0, 0); }
    // my position to the referee (15 Hz)
    if (v.me >= 0 && now - NM.sendT > 66 && v.ph !== 'end') { NM.sendT = now; const r = man.root.position; NM.s.act({ p: [Math.round(r.x * 100) / 100, Math.round(r.z * 100) / 100, Math.round((w ? w.yaw : 0) * 1000) / 1000] }); }
    // walked out of the cage: leave after 6 s (a bot takes the seat)
    if (v.me >= 0 && v.ph !== 'end') {
      if (!inCage(player.pos, -0.3)) { NM.outT += dt; if (NM.outT > 0.6 && !NM.warned) { NM.warned = true; toast('Torna in campo entro 6 secondi o lasci la partita a un bot', 'warn'); } if (NM.outT > 6.5) { toast('Hai lasciato il calcetto online'); netEnd(true); return; } }
      else { NM.outT = 0; NM.warned = false; }
    }
    // bodies
    for (const [i, b] of NM.bodies) {
      const n = b.n; if (!n.root.parent) continue;
      const p = n.root.position, k = 1 - Math.exp(-dt * 10), ox = p.x, oz = p.z;
      p.x += ((b.tx ?? p.x) - p.x) * k; p.z += ((b.tz ?? p.z) - p.z) * k; p.y = 0;
      const sp = Math.hypot(p.x - ox, p.z - oz) / Math.max(dt, 1e-3);
      n.root.rotation.y += wrapA((b.tyaw ?? n.root.rotation.y) - n.root.rotation.y) * Math.min(1, dt * 10);
      n.speed = sp * 1.15; n.state = 'match'; n.yawGoal = null; n.target = null; n.leaving = true; n.chatCD = 1e9;
      n.root.rotation.x *= 1 - Math.min(1, dt * 6);
      void i;
    }
  }
  function netBall(dt) {
    const v = NM && NM.v; bangT -= dt;
    if (!v || !NM.base) { ballMesh.position.copy(B.p); return; }
    const k = Math.exp(-dt * 9); NM.off.multiplyScalar(k);
    if (v.o >= 0 && v.o === v.me && v.ph === 'play') { // I have the ball: at my feet, now
      const f = fwdOf(W() ? W().yaw : 0); tmp.set(player.pos.x + f.x * 0.46 + player.vel.x * 0.06, R, player.pos.z + f.z * 0.46 + player.vel.z * 0.06);
      B.p.lerp(tmp, 1 - Math.exp(-dt * 25)); B.v.set(0, 0, 0); B.owner = player;
    } else {
      B.owner = null;
      const b = v.o >= 0 ? NM.base : predicted(NM.base, Math.min(0.4, (performance.now() - NM.baseAt) / 1000));
      B.p.set(b.x + NM.off.x, Math.max(R, b.y + NM.off.y), b.z + NM.off.z); B.v.set(b.vx, b.vy, b.vz);
    }
    const sp = Math.hypot(B.v.x, B.v.z);
    if (sp > 0.02) { axis.set(B.v.z, 0, -B.v.x).normalize(); qRoll.setFromAxisAngle(axis, sp * dt / R); ballMesh.quaternion.premultiply(qRoll); }
    ballMesh.position.copy(B.p);
  }
  function netKickLocal(kind, dx, dz, power) {
    const v = NM.v; if (!v || v.me < 0) return;
    const team = v.ps[v.me][3], b = { x: B.p.x, y: Math.max(R + 0.02, B.p.y), z: B.p.z, vx: 0, vy: 0, vz: 0, spin: 0, net: 0 };
    const kv = netKick(b, team, dx, dz, power, kind, 0);
    NM.s.act({ k: [Math.round(dx * 1000) / 1000, Math.round(dz * 1000) / 1000, Math.round(power * 100) / 100, kind] });
    Object.assign(b, kv); NM.base = b; NM.baseAt = performance.now(); NM.off.set(0, 0, 0);
    NM.kickAt = performance.now(); NM.kickKid = v.kid; // the next views without my kick don't overwrite the prediction
    NM.v = { ...v, o: -1 };
    ST.kickAnim = 0.34; player.cool = 0.35;
    sfx('ballBounce', 0.6 + Math.hypot(kv.vx, kv.vz) / 18); if (Math.hypot(kv.vx, kv.vz) > 12) sfx('kick');
  }
  function netShot(kind, power) { const w = W(); const f = fwdOf(w ? w.yaw : 0); netKickLocal(kind, f.x, f.z, power); }
  function netPass() {
    const v = NM.v; if (!v || v.me < 0 || v.mode !== '2v2' || !ballNear(1.0)) return false;
    const team = v.ps[v.me][3], w = W(), f = fwdOf(w ? w.yaw : 0);
    let best = null, bs = 1e9;
    v.ps.forEach((p, i) => { if (i === v.me || p[3] !== team) return; const dx = p[0] - player.pos.x, dz = p[1] - player.pos.z, d = Math.hypot(dx, dz); const fa = (dx * f.x + dz * f.z) / (d || 1); const sc = d * (1.6 - fa); if (sc < bs) { bs = sc; best = { dx, dz, d }; } });
    if (!best) return false;
    netKickLocal(2, best.dx, best.dz, clamp((best.d * 1.45 + 2.8 - 5) / 8, 0, 1)); ST.kickAnim = 0.28;
    return true;
  }
  registerPartyGame('calcetto', {
    name: 'Calcetto online', icon: '⚽', desc: 'al campetto di Teletubbylandia, la palla la arbitra il server', min: 1, max: 4,
    choices: [{ id: '1v1', label: '1 contro 1', opts: { mode: '1v1', seats: 2, mins: 3 } }, { id: '2v2', label: '2 contro 2', opts: { mode: '2v2', seats: 4, mins: 3 } }],
    busy: () => (M || BB ? 'Finisci prima quello che stai facendo al campetto' : W() && W().mode !== 'explore' && W().mode !== 'goto' ? 'Torna a piedi prima di andare al calcetto' : (window.__gulagRun && window.__gulagRun.state && window.__gulagRun.state().on) ? 'Sei nel Gulag: esci prima' : null),
    attach: s => netAttach(s),
    detach: s => { if (NM && NM.s === s) netEnd(false); },
  });

  // ---------------- explore plugin: the ball, the chalkboard, the hoop ----------------
  const plugin = (ctx, w, h) => {
    ST.W = w; ST.H = h;
    const signA = V(BOARD_SIGN.x, 0, BOARD_SIGN.z - 1.35); signA.yaw = 0;
    const items = [
      { id: 'sport_ball', range: 1.3,
        label: () => weaponOut() ? 'Metti via l\'arma per calciare' : (M && M.kind === 'pen') ? 'Tira il rigore (tieni premuto)' : 'Tira (tieni premuto per caricare)',
        alt: () => weaponOut() ? null : 'Pallonetto',
        extra: () => (((M && M.kind === 'match') || (NM && NM.v && NM.v.mode === '2v2')) && !weaponOut()) ? [{ key: 'Q', label: 'Passa' }] : [],
        anchor: () => (ST.mode === 'bb' || !inCage(player.pos, -0.4) || B.net || (M && (M.phase === 'end' || M.phase === 'goal')) || (NM && !(NM.v && NM.v.ph === 'play'))) ? FAR : (B.owner === player || (NM && NM.v && NM.v.o === NM.v.me) ? player.pos : B.p),
        top: () => tmp2.copy(B.p).add(V(0, 0.55, 0)),
        act: () => { if (weaponOut()) { toast('Prima metti via l\'arma'); return; } startCharge('shot', 'key'); },
        altAct: () => startCharge('chip', 'key') },
      { id: 'sport_challenge', range: 1.7,
        label: () => 'Sfida gli amici a calcetto (3 contro 3)', alt: () => 'Rigori contro un amico',
        anchor: () => (M || ST.mode || NM) ? FAR : signA, top: () => V(BOARD_SIGN.x, 1.6, BOARD_SIGN.z - 0.6),
        act: () => startMatch(), altAct: () => startPens() },
      { id: 'sport_centre', range: 1.6,
        label: () => 'Sfida gli amici a calcetto (3 contro 3)', alt: () => 'Rigori contro un amico',
        anchor: () => (M || ST.mode || NM || d2(B.p, KICKOFF) < 1.2) ? FAR : KICKOFF, top: () => V(P.cx, 1.0, P.cz),
        act: () => startMatch(), altAct: () => startPens() },
      { id: 'sport_hoop', range: 1.6,
        label: () => 'Tiri liberi al canestro (10 tiri)', anchor: () => (M || ST.mode) ? FAR : V(HOOP.spot[0], 0, HOOP.spot[1]), top: () => V(HOOP.x, 2.2, HOOP.spot[1] - 0.5),
        act: () => startBB() },
    ];
    return { items };
  };

  // ---------------- per frame (after npcs.update) ----------------
  function update(dt) {
    if (!APP || APP.phase !== 'world' || dt <= 0) { return; }
    // visible with Teletubbylandia (quartiere areas): hidden from the house/garden/street east side
    const tele = q && q.areas && q.areas.tele, vis = tele && tele.group ? tele.group.visible : true;
    group.visible = vis; ballMesh.visible = vis; bball.visible = vis;
    if (!vis && !M && !BB && !NM) { touch.edge.clear(); btns.classList.remove('on'); return; }
    const w = W();
    if (w) { player.yaw = w.yaw; player.vel.copy(w.vel); }
    if (NM) netUpdate(dt);
    else if (M) { if (M.kind === 'match') updateMatch(dt); else updatePens(dt); }
    else if (inCage(player.pos, -0.5)) contacts([player], dt);
    else if (B.owner === player) B.owner = null;
    if (BB) updateBB(dt);
    updateCharge(dt);
    if (NM) netBall(dt); else updateBall(dt);
    kickPose(dt);
    updateExits(dt);
    // first time in the cage: how it works
    if (!ST.hintShown && inCage(player.pos, 0.2)) { ST.hintShown = true; toast('Calcetto: corri sulla palla per portarla, E o clic per tirare (tieni premuto), R pallonetto. Alla lavagna: sfida gli amici'); save('calcetto_cage', 'Campetto', 'Hai trovato il calcetto di Teletubbylandia', '🥅'); }
    btns.classList.toggle('on', !!(window.__mobile && (ballNear(1.6) && inCage(player.pos, -0.4) && !weaponOut())));
    touch.edge.clear();
  }

  const api = { pre, update, plugin, get match() { return M; }, ball: B, startMatch, startPens, startBB, endMatch: () => M && (M.kind === 'match' ? endMatch('forfeit') : endPens(true)), group, ballMesh, PITCH: P,
    netAttach: s => netAttach(s), netState: () => (NM ? { ph: NM.v && NM.v.ph, sc: NM.v && NM.v.sc, me: NM.v && NM.v.me, cl: NM.v && NM.v.cl, ball: [B.p.x, B.p.y, B.p.z], online: NM.s.online, id: NM.s.id } : null), netLeave: () => netEnd(true) };
  window.__sport = api;
  return api;
}
