// interact/index.js — "più interactions": emote wheel (hold B / middle mouse), actions with the friends (5 in the
// dialogue: beer, high five, arm wrestling, insult, selfie, follow me, take him to the Celtic), and world props
// (benches, pigeons, the cat, the edicola, a can to kick, doorbells, Seghino's fridge and TV).
// One explore plugin owns the 'ia' mode (W.m.kind = what is going on); main.js calls update() before world.update,
// post() after man.update (finger poses, push-up tilt) and camera() on the final camera pose (selfie, drunk cam).
import * as THREE from 'three';
import { createWheel } from './wheel.js';
import { EMOTE_REACT, ACTION_LINES, rnd, reactPrompt } from './lines.js';
import { persona, personaPrompt, emitEvent, unlock as aiUnlock } from '../ai.js';
import { createVespa } from './vespa.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const PI = Math.PI;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const UP = V(0, 1, 0);

const EMOTES = [
  { id: 'wave', label: 'Saluta', icon: '👋' },
  { id: 'dance', label: 'Balla', icon: '🕺' },
  { id: 'medio', label: 'Dito medio', icon: '🖕' },
  { id: 'facepalm', label: 'Facepalm', icon: '🤦' },
  { id: 'clap', label: 'Applaudi', icon: '👏' },
  { id: 'yawn', label: 'Sbadiglia', icon: '🥱' },
  { id: 'pushup', label: 'Flessioni', icon: '💪' },
  { id: 'selfie', label: 'Selfie', icon: '🤳' },
];
const ACH = {
  emote: ['ia_emote', 'Che faccia', 'Hai usato la ruota delle emote', '😎'],
  medio: ['ia_medio', 'Gesto dell\'ombrello', 'Hai mostrato il dito medio a un amico', '🖕'],
  pushup: ['ia_pushup', 'Rocky di via Teletubbylandia', 'Hai fatto le flessioni in pubblico', '💪'],
  selfie: ['ia_selfie', 'Influencer', 'Hai scattato un selfie', '🤳'],
  beer: ['ia_beer', 'Offro io', 'Hai offerto una birra a un amico', '🍺'],
  five: ['ia_five', 'Batti cinque', 'Hai battuto il cinque', '🖐️'],
  armWin: ['ia_arm', 'Braccio di ferro', 'Hai vinto a braccio di ferro', '💪'],
  insult: ['ia_insult', 'Volano parole', 'Hai insultato un amico (con affetto)', '🤬'],
  follow: ['ia_follow', 'Il codazzo', 'Un amico ti ha seguito in giro', '🚶'],
  celtic: ['ia_celtic', 'Tutti al Celtic', 'Hai portato un amico al Celtic', '🍀'],
  drunk: ['ia_drunk', 'Ciucco', 'Hai bevuto un po\' troppo', '🥴'],
  bench: ['ia_bench', 'Pensionato', 'Ti sei seduto su una panchina', '🪑'],
  pigeons: ['ia_pigeons', 'San Francesco', 'Hai dato da mangiare ai piccioni', '🐦'],
  cat: ['ia_cat', 'Gattaro', 'Hai accarezzato il gatto', '🐈'],
  can: ['ia_can', 'Calcetto', 'Hai calciato la lattina', '🥫'],
  doorbell: ['ia_bell', 'Scampanellata', 'Hai suonato a un amico', '🔔'],
  tv: ['ia_tv', 'Zapping', 'Hai fatto zapping da Seghino', '📺'],
  vespa: ['ia_vespa', 'Vespista', 'Sei salito su una Vespa', '🛵'],
  vespa300: ['ia_vespa300', 'Giro dei portici', 'Hai fatto 300 metri in Vespa', '🛵'],
};
function unlock(key) { const a = ACH[key]; if (!a) return; try { aiUnlock(a[0], { title: a[1], desc: a[2], icon: a[3], group: 'Interazioni' }); } catch (e) { } }
function ev(text) { try { emitEvent('interact', { text }); } catch (e) { } }

export function createInteractions(ctx) {
  const { scene, man, ui, audio, getFX, level, input, S, npcs, renderer, news } = ctx;
  let W = null, H = null;
  const sfx = (n, v) => { try { audio && audio.sfx(n, v); } catch (e) { } };
  const fx = () => (getFX && getFX()) || {};
  const toast = (m, k) => { try { ui.toast(m, k); } catch (e) { } };
  const st = { beers: 0, drunk: 0, follow: null, wheelHeld: false, capPrev: null, can: null, tv: null };
  const t1 = V(), t2 = V(), t3 = V(), tq = new THREE.Quaternion();

  // ---------------------------------------------------------------- helpers
  const mp = () => man.root.position;
  const fwd = (out = V()) => out.set(Math.sin(W ? W.yaw : 0), 0, Math.cos(W ? W.yaw : 0));
  const side = (out = V()) => out.set(-Math.cos(W ? W.yaw : 0), 0, Math.sin(W ? W.yaw : 0)); // the man's right
  const head = (out = V()) => (man.bones && man.bones.Head ? man.bones.Head.getWorldPosition(out) : out.copy(mp()).add(V(0, 1.6, 0)));
  const free = () => S && S.phase === 'world' && W && W.mode === 'explore' && !(ui && ui.menuOpen) && !document.body.dataset.overlay;
  function startAct(kind, data = {}) { if (!W || !H) return false; W.dancing && W.stopDance && W.stopDance(); H.setMode('ia'); Object.assign(W.m, { kind, ...data }); return true; }
  function endAct() { if (W && W.mode === 'ia') H.setMode('explore'); }
  function nearFriends(r = 7, max = 2) {
    if (!npcs) return [];
    const out = [];
    for (const id of npcs.active()) { const n = npcs.get(id); if (!n || n.leaving || !n.root.visible) continue; const d = n.root.position.distanceTo(mp()); if (d < r) out.push([d, n]); }
    return out.sort((a, b) => a[0] - b[0]).slice(0, max).map(a => a[1]);
  }
  const face = (n, p = mp()) => { n.yawGoal = Math.atan2(p.x - n.root.position.x, p.z - n.root.position.z); };
  // a friend says something: offline line now, the AI's version (in persona) when it is online
  function speak(n, line, what) {
    if (!n || !n.root.parent) return;
    const ai = window.__ai;
    if (what && ai && ai.status && ai.status() !== 'offline' && Math.random() < 0.6) {
      ai.ask({ system: personaPrompt(n.id, { short: true }), prompt: reactPrompt(what), model: 'fast', maxTokens: 60, persona: n.id, auto: true, fallback: line })
        .then(t => { t = String(t || line).trim().replace(/^["«“]+|["»”]+$/g, '').slice(0, 110); if (n.root.parent) n.say(t || line, 4); })
        .catch(() => n.say(line, 4));
    } else n.say(line, 4);
  }
  function react(kind, what) {
    nearFriends(7, 2).forEach((n, i) => setTimeout(() => {
      if (!n.root.parent || n.talking) return;
      face(n);
      const m = n.man;
      if (kind === 'medio' || kind === 'insult') { m.playGesture && m.playGesture('headShake'); if (Math.random() < 0.5) m.gesture && m.gesture('signal'); }
      else if (kind === 'dance' && m.playClip) { m.playClip('Dance', { loop: false }); }
      else if (kind === 'clap' || kind === 'pushup') m.gesture && m.gesture(rnd(['clap', 'cheer']));
      else if (kind === 'selfie') m.gesture && m.gesture('cheer');
      else m.playGesture ? m.playGesture(rnd(['agree', 'headShake'])) : (m.gesture && m.gesture('shrug'));
      speak(n, rnd(EMOTE_REACT[kind] || EMOTE_REACT.wave), what);
    }, 450 + i * 1100));
  }

  // rideable vespe (vespa.js)
  const VS = createVespa({ scene, man, audio, input, level, toast, ev, unlock,
    say: (line, what) => { const n = nearFriends(9, 1)[0]; if (n && !n.talking) { face(n); speak(n, line, what); } } });

  // props: phone + beer bottles (built once, parented to hands while used)
  const phoneMesh = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.15, 0.009), new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.35, metalness: 0.4 }));
  phoneMesh.visible = false; phoneMesh.name = 'iaPhone';
  const bottleGeo = new THREE.CylinderGeometry(0.03, 0.033, 0.2, 12); bottleGeo.translate(0, 0.08, 0);
  const bottleMat = new THREE.MeshStandardMaterial({ color: 0x2f6b2a, roughness: 0.18, metalness: 0.1, transparent: true, opacity: 0.92 });
  const mkBottle = () => { const b = new THREE.Mesh(bottleGeo, bottleMat); b.visible = false; b.name = 'iaBeer'; return b; };
  const myBottle = mkBottle();
  const findBone = (root, re) => { let b = null; root.traverse(o => { if (!b && o.isBone && re.test(o.name)) b = o; }); return b; };
  const RH = () => (man.bones && (man.bones.RightHand || null));
  function holdIn(bone, obj, pos, rot) { if (!bone) return; if (obj.parent !== bone) bone.add(obj); const s = 1 / (bone.getWorldScale(t3).x || 1); obj.scale.setScalar(s); obj.position.set(pos[0], pos[1], pos[2]).multiplyScalar(s); obj.rotation.set(rot[0], rot[1], rot[2]); obj.visible = true; }

  // ---------------------------------------------------------------- emote wheel
  const wheel = createWheel(EMOTES.map(e => ({ ...e, hint: 'rilascia per farlo' })));
  wheel.onPick = i => { wheel.hide(); st.wheelHeld = false; doEmote(EMOTES[i].id); };
  function openWheel() { if (!free() || wheel.open) return; wheel.show(); st.wheelHeld = true; }
  function closeWheel(run) { if (!wheel.open) return; const i = wheel.selected; wheel.hide(); st.wheelHeld = false; if (run && i >= 0) doEmote(EMOTES[i].id); }
  addEventListener('keydown', e => {
    if (e.code === 'KeyB' && !e.repeat) { const t = e.target; if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName)) return; if (free()) { e.preventDefault(); openWheel(); } }
    else if (wheel.open && /^Digit[1-8]$/.test(e.code)) { e.preventDefault(); e.stopImmediatePropagation(); const i = +e.code.slice(5) - 1; wheel.hide(); st.wheelHeld = false; doEmote(EMOTES[i].id); }
    else if (wheel.open && e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeWheel(false); }
  }, true);
  addEventListener('keyup', e => { if (e.code === 'KeyB') closeWheel(true); }, true);
  addEventListener('mousedown', e => { if (e.button === 1 && free()) { e.preventDefault(); openWheel(); } }, true);
  addEventListener('mouseup', e => { if (e.button === 1) closeWheel(true); }, true);
  addEventListener('blur', () => closeWheel(false));

  function doEmote(id) {
    if (!W || W.mode !== 'explore') return;
    unlock('emote');
    switch (id) {
      case 'wave': W.gesture('wave'); react('wave', 'un saluto con la mano'); break;
      case 'dance': W.gesture('dance'); react('dance', 'un balletto imbarazzante in mezzo alla strada'); break;
      case 'facepalm': W.gesture('facepalm'); react('facepalm', 'un facepalm'); break;
      case 'clap': W.gesture('clap'); sfx('lap'); react('clap', 'un applauso'); break;
      case 'medio': startAct('medio', { dur: 2.3 }); if (nearFriends(7, 1).length) unlock('medio'); react('medio', 'il dito medio'); ev('ha fatto il dito medio a tutti'); break;
      case 'yawn': startAct('yawn', { dur: 2.8 }); sfx('yawn'); react('yawn', 'un mega sbadiglio'); break;
      case 'pushup': startAct('pushup', { reps: 5 }); react('pushup', 'le flessioni per strada per fare il fenomeno'); ev('si è messo a fare flessioni per strada'); break;
      case 'selfie': startSelfie(null); break;
    }
  }

  // ---------------------------------------------------------------- selfie (photo saved in the Galleria)
  const SELF_KEY = 'bigalesso_selfies_v1';
  const loadSelfies = () => { try { return JSON.parse(localStorage.getItem(SELF_KEY) || '[]'); } catch (e) { return []; } };
  window.__selfies = { list: () => loadSelfies() };
  function saveSelfie(url, who) {
    const L = loadSelfies(); L.unshift({ url, who: who || null, t: Date.now() }); while (L.length > 8) L.pop();
    for (let k = 0; k < 3; k++) { try { localStorage.setItem(SELF_KEY, JSON.stringify(L)); break; } catch (e) { L.pop(); } }
  }
  const flashEl = document.createElement('div'); flashEl.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:45;transition:opacity .45s';
  const polEl = document.createElement('div'); polEl.style.cssText = 'position:fixed;right:3vw;bottom:12vh;z-index:44;padding:10px 10px 34px;background:#fafafa;box-shadow:0 12px 40px #000a;transform:rotate(3deg) translateY(30px);opacity:0;transition:all .35s;pointer-events:none;font:600 13px var(--ui,system-ui);color:#222;text-align:center';
  polEl.innerHTML = '<img style="display:block;width:min(260px,30vw);height:auto"><div style="margin-top:8px">Salvata nella Galleria</div>';
  document.body.append(flashEl, polEl);
  function capture(who) {
    requestAnimationFrame(() => { // runs right after the main tick has rendered this frame: the drawing buffer is still valid
      try {
        const c = renderer.domElement, w = 520, h = Math.round(w * c.height / c.width);
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const x = cv.getContext('2d');
        x.drawImage(c, 0, 0, w, h);
        x.fillStyle = 'rgba(0,0,0,.45)'; x.fillRect(0, h - 26, w, 26); x.fillStyle = '#ffd25a'; x.font = '700 14px system-ui'; x.fillText('BIGALESSO · ' + new Date().toLocaleDateString('it-IT') + (who ? ' · con ' + who : ''), 10, h - 9);
        const url = cv.toDataURL('image/jpeg', 0.82); saveSelfie(url, who);
        polEl.querySelector('img').src = url; polEl.style.opacity = '1'; polEl.style.transform = 'rotate(3deg)';
        setTimeout(() => { polEl.style.opacity = '0'; polEl.style.transform = 'rotate(3deg) translateY(30px)'; }, 3200);
      } catch (e) { console.warn('selfie', e); }
    });
  }
  function startSelfie(n) {
    if (!startAct('selfie', { dur: 2.7, n, shot: false })) return;
    sfx('pickup');
    if (n) { // the friend steps next to you
      const p = mp(), s = side(t1); const at = V(p.x + s.x * -0.62, 0, p.z + s.z * -0.62);
      n.root.position.lerp(at, 0.85); n.state = 'idle'; n.wait = 8; n.yawGoal = W.yaw; n.root.rotation.y = W.yaw;
    }
    react('selfie', 'un selfie e ti ha messo nella foto');
  }

  // ---------------------------------------------------------------- friend actions (key 5 in the dialogue)
  const ACTIONS = [
    { id: 'beer', label: 'Offri una birra', icon: '🍺' },
    { id: 'five', label: 'Dai il cinque', icon: '🖐️' },
    { id: 'arm', label: 'Sfida a braccio di ferro', icon: '💪' },
    { id: 'insult', label: 'Insultalo', icon: '🤬' },
    { id: 'selfie', label: 'Fai un selfie insieme', icon: '🤳' },
    { id: 'follow', label: n => st.follow === n.id ? 'Fermati qui' : 'Seguimi', icon: '🚶' },
    { id: 'celtic', label: 'Portalo al Celtic', icon: '🍀' },
  ];
  const menuEl = document.createElement('div');
  menuEl.style.cssText = 'position:fixed;left:50%;bottom:8vh;transform:translateX(-50%);z-index:42;min-width:min(520px,80vw);padding:16px 18px;background:rgba(12,10,22,.92);border:1px solid #ffffff22;border-radius:14px;box-shadow:0 18px 60px #000a;color:#eee;font:500 15px var(--ui,system-ui);display:none';
  document.body.appendChild(menuEl);
  let menuN = null;
  function openActions(n, endTalk) {
    endTalk && endTalk(); menuN = n;
    menuEl.innerHTML = `<div style="font:400 26px var(--gta,Impact,sans-serif);text-transform:uppercase;margin-bottom:8px;color:${n.p.color || '#ffd25a'}">${(n.p.emoji || '') + ' '}Con ${n.p.name}</div>` +
      ACTIONS.map((a, i) => `<div data-i="${i}" style="display:flex;gap:10px;align-items:center;padding:7px 8px;border-radius:8px;cursor:pointer"><kbd style="min-width:22px;text-align:center;border:1px solid #666;border-radius:5px;font-size:12px;padding:1px 4px">${i + 1}</kbd><span>${a.icon}</span><span>${typeof a.label === 'function' ? a.label(n) : a.label}</span></div>`).join('') +
      '<div style="margin-top:8px;font-size:12px;color:#999">1-7 scegli · Esc annulla</div>';
    menuEl.querySelectorAll('[data-i]').forEach(d => { d.onmouseenter = () => d.style.background = '#ffffff14'; d.onmouseleave = () => d.style.background = ''; d.onclick = () => pickAction(+d.dataset.i); });
    menuEl.style.display = 'block';
    face(n); n.state = 'idle'; n.target = null; n.wait = 12;
    st.capPrev = input.capture;
    input.capture = e => {
      if (e.code === 'Escape') { closeActions(); return true; }
      const m = /^(?:Digit|Numpad)([1-7])$/.exec(e.code); if (m) { pickAction(+m[1] - 1); return true; }
      return /^(Digit|Numpad)/.test(e.code); // swallow other number keys (gestures)
    };
    if (document.pointerLockElement) try { document.exitPointerLock(); } catch (e) { }
  }
  function closeActions() { menuEl.style.display = 'none'; input.capture = st.capPrev || null; st.capPrev = null; }
  window.__npcActions = (n, endTalk) => openActions(n, endTalk);
  function pickAction(i) {
    const a = ACTIONS[i], n = menuN; if (!a || !n) return;
    closeActions();
    if (!n.root.parent) return;
    switch (a.id) {
      case 'beer': friendBeer(n); break;
      case 'five': approach(n, 0.75, () => startAct('five', { n, dur: 1.4, miss: Math.random() < 0.18 })); break;
      case 'arm': approach(n, 0.95, () => startArm(n)); break;
      case 'insult': insult(n); break;
      case 'selfie': startSelfie(n); break;
      case 'follow': toggleFollow(n); break;
      case 'celtic': toCeltic(n); break;
    }
  }
  function approach(n, dist, then) {
    const p = n.root.position, m = mp(); const d = V(m.x - p.x, 0, m.z - p.z); if (d.lengthSq() < 1e-4) d.set(0, 0, 1); d.normalize();
    const stand = V(p.x + d.x * dist, 0, p.z + d.z * dist); const yaw = Math.atan2(p.x - stand.x, p.z - stand.z);
    n.state = 'idle'; n.target = null; n.wait = 15; face(n, stand);
    H.goTo(stand, yaw, () => { face(n); then && then(); }, { ignore: ['npc_' + n.id] });
  }
  function friendBeer(n) {
    approach(n, 0.9, () => {
      speak(n, rnd(ACTION_LINES.beerOffer), 'gli offri una birra');
      startAct('drink', { n, dur: 3.4, bottleN: null });
      unlock('beer'); ev(`ha offerto una birra a ${n.p.name}`);
    });
  }
  function insult(n) {
    face(n); W.gesture && W.gesture('signal');
    const zuck = rnd(['Sei proprio un coglione', 'Ma vaffanculo va', 'Hai la faccia come il culo', 'Stronzo, mi devi ancora 10 euro', 'Che cazzo guardi?']);
    toast('Tu: «' + zuck + '»');
    setTimeout(() => { if (!n.root.parent) return; n.man.playGesture && n.man.playGesture('headShake'); speak(n, rnd(ACTION_LINES.insultBack), `ti ha detto "${zuck}"`); }, 700);
    unlock('insult'); ev(`ha insultato ${n.p.name} (con affetto)`);
  }
  function toggleFollow(n) {
    if (st.follow === n.id) { st.follow = null; n.state = 'idle'; n.wait = 10; n.home = n.root.position.clone(); speak(n, rnd(ACTION_LINES.stop)); return; }
    if (st.follow) { const o = npcs.get(st.follow); if (o) { o.state = 'idle'; o.wait = 6; o.home = o.root.position.clone(); } }
    st.follow = n.id; n.summoned = false; speak(n, rnd(ACTION_LINES.follow), 'gli chiedi di seguirti in giro');
    toast(`${n.p.name} ti segue · parlagli e scegli "Fermati qui" per lasciarlo`); unlock('follow'); ev(`si è fatto seguire da ${n.p.name}`);
  }
  // fade to black, both of you appear at the Celtic door
  const fadeEl = document.createElement('div');
  fadeEl.style.cssText = 'position:fixed;inset:0;z-index:43;background:#000;opacity:0;pointer-events:none;transition:opacity .5s;display:grid;place-items:center;color:#fff;font:400 42px var(--gta,Impact,sans-serif);text-transform:uppercase;letter-spacing:.04em';
  document.body.appendChild(fadeEl);
  function toCeltic(n) {
    const A = level && level.anchors && (level.anchors.celtic || level.anchors.celtic_door);
    if (!A) { toast('Il Celtic è chiuso, oggi'); return; }
    if (window.__app && window.__app.gulag && window.__app.gulag.inside) { toast('Prima esci dal Gulag'); return; }
    speak(n, rnd(ACTION_LINES.celtic), 'gli proponi di andare al Celtic');
    fadeEl.textContent = 'Mezz\'ora dopo, al Celtic…'; fadeEl.style.opacity = '1'; sfx('whoosh');
    setTimeout(() => {
      const yaw = A.yaw ?? 0; const s = V(Math.cos(yaw), 0, -Math.sin(yaw));
      man.root.position.set(A.x, 0, A.z); W.yaw = yaw; W.camYaw = yaw + PI; W.vel && W.vel.set(0, 0, 0); man.root.rotation.y = yaw;
      if (n.root.parent) { n.root.position.set(A.x + s.x * 0.9 + Math.sin(yaw) * 0.6, 0, A.z + s.z * 0.9 + Math.cos(yaw) * 0.6); n.state = 'idle'; n.target = null; n.wait = 25; n.home = n.root.position.clone(); face(n); }
      if (W.mode !== 'explore') H.setMode('explore');
      try { window.__quartiere && window.__quartiere.build && window.__quartiere.build('celtic'); } catch (e) { }
    }, 650);
    setTimeout(() => { fadeEl.style.opacity = '0'; if (n.root.parent) n.say(rnd(['Pinta?', 'Il primo giro lo paghi tu', 'Che bello il Celtic, cazzo']), 4); }, 1700);
    unlock('celtic'); ev(`ha portato ${n.p.name} al Celtic`);
  }

  // arm wrestling: mash E / Space against the friend's strength
  const armEl = document.createElement('div');
  armEl.style.cssText = 'position:fixed;left:50%;top:16vh;transform:translateX(-50%);z-index:42;width:min(520px,80vw);padding:14px 18px;background:rgba(12,10,22,.9);border-radius:12px;color:#fff;font:600 14px var(--ui,system-ui);text-align:center;display:none';
  armEl.innerHTML = '<div class="t" style="font:400 28px var(--gta,Impact,sans-serif);text-transform:uppercase">Braccio di ferro</div><div style="margin:10px 0;height:18px;border-radius:9px;background:#ff3d7f;overflow:hidden"><i style="display:block;height:100%;width:50%;background:#4be08a;transition:width .08s"></i></div><div class="h">Premi E / Spazio più veloce che puoi!</div>';
  document.body.appendChild(armEl);
  function startArm(n) {
    const h = [...n.id].reduce((a, c) => a + c.charCodeAt(0), 0);
    startAct('arm', { n, v: 0.5, str: 2.6 + (h % 7) * 0.32, done: false });
    armEl.style.display = 'block'; armEl.querySelector('.h').textContent = 'Premi E / Spazio più veloce che puoi!';
    speak(n, rnd(ACTION_LINES.armIntro), 'ti sfida a braccio di ferro');
    st.capPrev = input.capture;
    input.capture = e => { if (W.mode !== 'ia' || W.m.kind !== 'arm') return false; if (e.code === 'KeyE' || e.code === 'Space') { if (!e.repeat && !W.m.done) { W.m.v += 0.045; sfx('stick'); } return true; } if (e.code === 'Escape') { W.m.v = 0; return true; } return false; };
  }
  function endArm() { armEl.style.display = 'none'; input.capture = st.capPrev || null; st.capPrev = null; }

  // ---------------------------------------------------------------- the 'ia' mode
  function update(mode, dt, I, keys) {
    const m = W.m, t = W.t; const f = fwd(t1), s = side(t2), hp = head(t3).clone(); const out = {};
    switch (m.kind) {
      case 'medio': {
        const e = smooth(t / 0.35) * (1 - smooth((t - m.dur + 0.4) / 0.4));
        const p = hp.clone().addScaledVector(f, 0.42).addScaledVector(s, 0.12).add(V(0, -0.04 + Math.sin(t * 13) * 0.012, 0));
        out.rR = { pos: p, w: e, palm: 'forward', grip: 1 }; out.lookW = 0.6; out.lookAt = hp.clone().addScaledVector(f, 2);
        m.finger = e;
        if (t > m.dur) endAct();
        break;
      }
      case 'yawn': {
        const e = smooth(t / 0.6) * (1 - smooth((t - m.dur + 0.6) / 0.6));
        out.rL = { pos: hp.clone().add(V(0, 0.34, 0)).addScaledVector(s, -0.17).addScaledVector(f, 0.04), w: e, palm: 'up', grip: 0.25 };
        out.rR = { pos: hp.clone().add(V(0, 0.34, 0)).addScaledVector(s, 0.17).addScaledVector(f, 0.04), w: e, palm: 'up', grip: 0.25 };
        out.lookW = e; out.lookAt = hp.clone().addScaledVector(f, 1).add(V(0, 1.6, 0));
        if (t > m.dur) endAct();
        break;
      }
      case 'pushup': {
        const R = m.reps, down = 0.7, rep = 1.05, upT = down + R * rep;
        let th;
        if (t < down) th = 1.18 * smooth(t / down);
        else if (t < upT) { const u = ((t - down) % rep) / rep; th = 1.18 + 0.16 * (0.5 - 0.5 * Math.cos(u * 2 * PI)); const k = Math.floor((t - down) / rep); if (k !== m.k) { m.k = k; if (k > 0) { sfx('thud', 0.4); if (k === 3) toast(rnd(['Tre! Quattro!', 'Spingi, cazzo!', 'Ancora due'])); } } }
        else th = 1.18 * (1 - smooth((t - upT) / 0.7));
        m.th = th;
        // hands under the shoulders on the floor
        const B = man.bones;
        for (const [k, bn] of [['rL', 'LeftArm'], ['rR', 'RightArm']]) {
          const sp = B && B[bn] ? B[bn].getWorldPosition(V()) : mp().clone().addScaledVector(s, k === 'rL' ? -0.2 : 0.2);
          out[k] = { pos: V(sp.x, 0.04, sp.z).addScaledVector(f, 0.04), w: smooth(th / 0.9), palm: 'down', grip: 0.1 };
        }
        out.lookW = 0.3; out.lookAt = mp().clone().addScaledVector(f, 3);
        if (t > upT + 0.75) { m.th = 0; man.model.rotation.x = 0; unlock('pushup'); endAct(); }
        break;
      }
      case 'selfie': {
        const e = smooth(t / 0.45) * (1 - smooth((t - m.dur + 0.4) / 0.4));
        const p = hp.clone().addScaledVector(f, 0.56).addScaledVector(s, 0.2).add(V(0, 0.1, 0));
        out.rR = { pos: p, w: e, palm: 'forward', grip: 0.65 }; out.lookW = 1; out.lookAt = p;
        holdIn(RH(), phoneMesh, [0.0, 0.09, 0.03], [0.2, 0, 0]); phoneMesh.visible = e > 0.2;
        m.cam = smooth((t - 0.7) / 0.35) * (1 - smooth((t - m.dur + 0.35) / 0.3));
        if (!m.shot && t > 1.3) {
          m.shot = true; flashEl.style.transition = 'none'; flashEl.style.opacity = '0.85'; requestAnimationFrame(() => { flashEl.style.transition = 'opacity .45s'; flashEl.style.opacity = '0'; });
          sfx('click'); capture(m.n ? m.n.p.name : null); unlock('selfie'); ev(m.n ? `si è fatto un selfie con ${m.n.p.name}` : 'si è fatto un selfie');
          if (m.n && m.n.root.parent) setTimeout(() => speak(m.n, rnd(ACTION_LINES.selfie)), 700);
        }
        if (t > m.dur) { phoneMesh.visible = false; endAct(); }
        break;
      }
      case 'drink': {
        const n = m.n, e = smooth(t / 0.4) * (1 - smooth((t - m.dur + 0.4) / 0.4));
        holdIn(RH(), myBottle, [0.0, 0.07, 0.04], [0, 0, 0]);
        if (n && n.root.parent && !m.bottleN) { const b = findBone(n.root, /^(RightHand|hand_r)$/i); if (b) { m.bottleN = mkBottle(); holdIn(b, m.bottleN, [0, 0.07, 0.04], [0, 0, 0]); } }
        const toNpc = n ? n.head(V()).add(V(0, -0.35, 0)) : hp.clone().addScaledVector(f, 0.6);
        const cheers = hp.clone().lerp(toNpc, 0.5).add(V(0, 0.05, 0));
        const mouth = hp.clone().addScaledVector(f, 0.1).add(V(0, -0.08, 0));
        const p = t < 1.2 ? hp.clone().addScaledVector(f, 0.35).add(V(0, -0.3, 0)).lerp(cheers, smooth((t - 0.3) / 0.5)) : cheers.clone().lerp(mouth, smooth((t - 1.3) / 0.5));
        out.rR = { pos: p, w: e, palm: 'forward', grip: 0.8 }; out.lookW = 1; out.lookAt = n ? n.head(V()) : p;
        if (!m.clink && t > 0.85) { m.clink = true; sfx('ding'); if (n) { n.man.gesture && n.man.gesture('cheer'); speak(n, rnd(ACTION_LINES.beerCheers)); } fx().sparkles && fx().sparkles(cheers, 18); }
        if (!m.gulp && t > 1.8) { m.gulp = true; sfx('gulp'); drink(); }
        if (t > m.dur) { myBottle.visible = false; if (m.bottleN) { m.bottleN.parent && m.bottleN.parent.remove(m.bottleN); m.bottleN = null; } endAct(); }
        break;
      }
      case 'five': {
        const n = m.n; const np = n && n.root.parent ? n.root.position : mp().clone().addScaledVector(f, 0.8);
        const meet = mp().clone().lerp(np, 0.5).add(V(0, 1.72, 0));
        const e = smooth(t / 0.35) * (1 - smooth((t - m.dur + 0.3) / 0.3));
        out.rR = { pos: meet.clone().addScaledVector(s, m.miss && t > 0.5 ? 0.3 : 0.05), w: e, palm: 'forward', grip: 0 }; out.lookW = 1; out.lookAt = meet;
        if (t > 0.05 && !m.raised) { m.raised = true; n && n.man.gesture && n.man.gesture('wave'); }
        if (t > 0.55 && !m.hit) {
          m.hit = true;
          if (m.miss) { sfx('whoosh'); n && speak(n, rnd(ACTION_LINES.fiveMiss)); }
          else { sfx('lap'); sfx('punch', 0.35); fx().sparkles && fx().sparkles(meet, 24); n && speak(n, rnd(ACTION_LINES.fiveOk)); unlock('five'); ev(`ha battuto il cinque a ${n ? n.p.name : 'qualcuno'}`); }
        }
        if (t > m.dur) endAct();
        break;
      }
      case 'arm': {
        const n = m.n;
        if (!m.done) {
          m.v -= dt * (m.str / 22) * (0.75 + 0.5 * Math.sin(t * 2.3)) * (t < 0.8 ? 0 : 1);
          m.v = clamp(m.v, 0, 1);
          armEl.querySelector('i').style.width = (m.v * 100).toFixed(1) + '%';
          if (m.v >= 1 || m.v <= 0 || t > 12) {
            m.done = true; m.win = m.v >= 0.5; m.endT = t;
            armEl.querySelector('.h').textContent = m.win ? 'Hai vinto!' : 'Hai perso…';
            sfx(m.win ? 'clear' : 'boo');
            if (n && n.root.parent) { n.man.playGesture && n.man.playGesture(m.win ? 'headShake' : 'agree'); speak(n, rnd(m.win ? ACTION_LINES.armWin : ACTION_LINES.armLose), m.win ? 'ha perso a braccio di ferro contro di te' : 'ti ha battuto a braccio di ferro'); }
            if (m.win) { unlock('armWin'); fx().confetti && fx().confetti(hp.clone().add(V(0, 0.4, 0)), 60); }
            ev(m.win ? `ha vinto a braccio di ferro contro ${n ? n.p.name : '?'}` : `ha perso a braccio di ferro contro ${n ? n.p.name : '?'}`);
          }
        }
        const np = n && n.root.parent ? n.root.position : mp().clone().addScaledVector(f, 0.9);
        const mid = mp().clone().lerp(np, 0.5).add(V(0, 1.12, 0)).addScaledVector(s, (m.v - 0.5) * 0.25);
        out.rR = { pos: mid, w: smooth(t / 0.4), palm: 'forward', grip: 0.9 }; out.crouchT = 0.35; out.leanT = 0.35; out.lookW = 1; out.lookAt = n ? n.head(V()) : mid;
        if (m.done && t - m.endT > 1.6) { endArm(); endAct(); }
        break;
      }
      case 'sit': {
        const B = m.bench; if (!B) { endAct(); break; }
        const F = B.F, R = V(-Math.cos(B.y), 0, Math.sin(B.y)); // facing F; R = his right
        if (m.up === undefined && t > 0.6 && (keys.backP || keys.actP)) m.up = t;
        const w = m.up !== undefined ? 1 - smooth((t - m.up) / 0.5) : smooth(t / 0.55);
        const seat = B.b.clone().addScaledVector(F, 0.3);
        mp().copy(m.up !== undefined ? B.p.clone().lerp(seat, w) : (m.from || B.p).clone().lerp(seat, w)); W.yaw = B.y;
        const hip = B.b.clone().addScaledVector(F, -0.1); hip.y = B.seatY + 0.09;
        man.sit = { src: 'bench', hip, feet: { Left: B.b.clone().addScaledVector(F, 0.44).addScaledVector(R, -0.13).setY(0.09), Right: B.b.clone().addScaledVector(F, 0.44).addScaledVector(R, 0.13).setY(0.09) }, w, tilt: -0.04 };
        const lap = hip.clone().addScaledVector(F, 0.3).add(V(0, 0.1, 0));
        out.rL = { pos: lap.clone().addScaledVector(R, -0.15), w: w * 0.9, palm: 'down', grip: 0.3 };
        out.rR = { pos: lap.clone().addScaledVector(R, 0.15), w: w * 0.9, palm: 'down', grip: 0.3 };
        out.lookW = 0.5; out.lookAt = hip.clone().addScaledVector(F, 4).add(V(0, 1.0, 0));
        if (m.up !== undefined && t - m.up > 0.5) { man.sit = null; mp().copy(B.p); endAct(); }
        if (t > 4 && !m.told) { m.told = 1; unlock('bench'); }
        break;
      }
      case 'feed': {
        out.crouchT = 0.8; out.leanT = 0.3;
        const ph = (t * 1.6) % 1;
        out.rR = { pos: mp().clone().addScaledVector(f, 0.45 + ph * 0.25).addScaledVector(s, 0.12).add(V(0, 0.55 - ph * 0.2, 0)), w: smooth(t / 0.4) * (1 - smooth((t - 5.6) / 0.4)), palm: 'up', grip: 0.5 };
        if ((m.tossT = (m.tossT || 0) - dt) <= 0) { m.tossT = 0.62; fx().sparkles && fx().sparkles(mp().clone().addScaledVector(f, 1.0).add(V(0, 0.05, 0)), 10); }
        out.lookW = 1; out.lookAt = mp().clone().addScaledVector(f, 1.2);
        if (t > 6 || (t > 0.8 && keys.backP)) endAct();
        break;
      }
      case 'petcat': {
        const c = m.cat; const cp = c ? c.o.position : mp().clone().addScaledVector(f, 0.5);
        out.crouchT = 1; out.leanT = 0.4;
        out.rR = { pos: cp.clone().add(V(Math.sin(t * 5) * 0.06, 0.3, 0)), w: smooth(t / 0.4) * (1 - smooth((t - 3.2) / 0.4)), palm: 'down', grip: 0.2 };
        if (c) c.pause = Math.max(c.pause, 0.5);
        if ((m.ht = (m.ht || 0) - dt) <= 0) { m.ht = 0.8; fx().hearts && fx().hearts(cp.clone().add(V(0, 0.4, 0)), 3); }
        if (t > 0.6 && !m.meow) { m.meow = 1; sfx('meow'); sfx('pet'); }
        out.lookW = 1; out.lookAt = cp;
        if (t > 3.6) { unlock('cat'); endAct(); }
        break;
      }
      case 'kick': {
        out.lookW = 1; out.lookAt = st.can ? st.can.mesh.position : null;
        if (t > 0.5) endAct();
        break;
      }
      default: endAct();
    }
    return out;
  }
  function drink() {
    st.beers++;
    if (st.beers >= 2) { st.drunk = Math.min(40, st.drunk + 20); toast(st.beers >= 3 ? 'Sei ciucco. Il mondo gira.' : 'Inizi a sentirla…'); if (st.beers >= 3) { unlock('drunk'); sfx('hiccup'); } }
  }
  // selfie POV
  const camOut = { pos: V(), look: V(), fov: 50 };
  function modeCamera(pose, dt) {
    if (W.mode !== 'ia' || W.m.kind !== 'selfie' || !(W.m.cam > 0)) return null;
    const k = W.m.cam, hp = head(t3);
    const ph = phoneMesh.visible ? phoneMesh.getWorldPosition(V()) : hp.clone().addScaledVector(fwd(t1), 0.6);
    const pos = ph.clone().addScaledVector(fwd(t1), 0.05).add(V(0, 0.02, 0));
    const look = hp.clone().addScaledVector(side(t2), W.m.n ? -0.22 : 0).add(V(0, -0.04, 0));
    camOut.pos.copy(pose.pos).lerp(pos, k); camOut.look.copy(pose.look).lerp(look, k); camOut.fov = (pose.fov || 50) + (62 - (pose.fov || 50)) * k;
    return camOut;
  }

  // ---------------------------------------------------------------- world interactables
  const items = [];
  function plugin(c, w, h) {
    W = w; H = h;
    const Q = () => window.__quartiere;
    // benches in the piazzetta (street.js hooks.benchSpots)
    const benches = () => (Q() && Q().street && Q().street.benchSpots) || [];
    // the seat faces ry + PI: the procedural bench has its backrest at local +Z, park_bench.glb (placed at ry + PI) at its -Z
    for (let i = 0; i < 3; i++) {
      const spot = () => {
        const b = benches()[i]; if (!b) return null; const y = (b.ry || 0) + PI, F = V(Math.sin(y), 0, Math.cos(y));
        const SH = Q() && Q().street; const tripo = !!(SH && SH.benchIms && SH.benchIms[0] && SH.benchIms[0].visible === false);
        return { b: V(b.x, 0, b.z), F, y, p: V(b.x + F.x * 0.86, 0, b.z + F.z * 0.86), seatY: tripo ? 0.53 : 0.485, top: V(b.x, 1.0, b.z) };
      };
      items.push({ id: 'ia_bench' + i, label: () => 'Siediti sulla panchina', range: 1.2,
        anchor: () => { const s = spot(); return s ? s.p : FAR; }, top: () => { const s = spot(); return s ? s.top : FAR; },
        act: () => { const s = spot(); if (!s) return; H.goTo(s.p, s.y, () => { startAct('sit', { bench: s, from: mp().clone() }); toast('Seduto · E o Esc per alzarti'); }); } });
    }
    // pigeons: piazzetta + Via Petroni
    for (const [x, z] of [[44.8, 25.0], [44.0, 53.5]]) {
      const a = V(x, 0, z);
      items.push({ id: 'ia_pigeons_' + x, label: () => 'Dai da mangiare ai piccioni', anchor: () => a, top: () => V(x, 1.2, z + 1), range: 2.2,
        act: () => { const life = Q() && Q().life; if (life && life.state) life.state.feed = { pos: mp().clone().addScaledVector(fwd(t1), 1.1), t: 12 }; startAct('feed', {}); sfx('unwrap'); unlock('pigeons'); ev('ha dato da mangiare ai piccioni'); } });
    }
    // the cat (nearest cat walker)
    const nearestCat = () => { const life = Q() && Q().life; if (!life || !life.state || !life.state.walkers) return null; let best = null, bd = 9; for (const wk of life.state.walkers) { if (wk.kind !== 'cat' || !wk.on || !wk.o.visible) continue; const d = wk.o.position.distanceTo(mp()); if (d < bd) { bd = d; best = wk; } } return best; };
    items.push({ id: 'ia_cat', label: () => 'Accarezza il gatto', range: 1.4,
      anchor: () => { const c = nearestCat(); return c ? c.o.position : FAR; }, top: () => { const c = nearestCat(); return c ? c.o.position.clone().add(V(0, 0.6, 0)) : FAR; },
      act: () => { const c = nearestCat(); if (!c) return; c.pause = 5; const cp = c.o.position; const d = V(mp().x - cp.x, 0, mp().z - cp.z).normalize(); const stand = cp.clone().addScaledVector(d, 0.55);
        H.goTo(stand, Math.atan2(cp.x - stand.x, cp.z - stand.z), () => startAct('petcat', { cat: c })); } });
    // a can to kick in the street (gate) — physics-lite
    items.push({ id: 'ia_can', label: () => 'Calcia la lattina', range: 1.0,
      anchor: () => (st.can ? st.can.mesh.position : FAR), top: () => (st.can ? st.can.mesh.position.clone().add(V(0, 0.4, 0)) : FAR),
      act: () => kickCan() });
    // Seghino's fridge: a beer from the fridge
    items.push({ id: 'ia_fridge', label: () => 'Prendi una birra dal frigo', anchor: () => FRIDGE, top: () => V(-15.2, 1.6, 18.2), range: 1.0,
      act: () => H.goTo(FRIDGE, -PI / 2, () => { sfx('door'); startAct('drink', { n: null, dur: 3.0 }); toast(rnd(['Seghino non se ne accorgerà', 'Birra del frigo di Seghino: rubata', 'Fresca, cazzo'])); ev('ha rubato una birra dal frigo di Seghino'); }) });
    items.push(...VS.items(W, H, () => H.setMode('vespa')));
    return {
      items, owns: m => m === 'ia' || m === 'vespa',
      update: (mode, dt, I, keys) => (mode === 'vespa' ? VS.update(W, H, dt, I, keys) : update(mode, dt, I, keys)),
      camera: (pose, dt) => (W.mode === 'vespa' ? VS.camera(W, pose, dt) : modeCamera(pose, dt)),
    };
  }
  const FAR = V(1e5, 0, 1e5);
  const FRIDGE = V(-14.45, 0, 18.2);

  // can
  function makeCan() {
    const g = new THREE.CylinderGeometry(0.033, 0.033, 0.12, 14); g.rotateZ(PI / 2);
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xc8202a, roughness: 0.35, metalness: 0.7 }));
    mesh.castShadow = true; mesh.position.set(14.6, 0.033, 22.4); mesh.name = 'iaCan'; scene.add(mesh);
    st.can = { mesh, vel: V(), home: mesh.position.clone(), spin: 0 };
  }
  function kickCan() {
    const c = st.can; if (!c) return;
    const dir = V(c.mesh.position.x - mp().x, 0, c.mesh.position.z - mp().z); if (dir.lengthSq() < 1e-4) fwd(dir); dir.normalize();
    W.gesture && W.gesture('signal');
    c.vel.copy(dir).multiplyScalar(5 + Math.random() * 2.5); c.vel.y = 1.6 + Math.random(); c.spin = 18;
    sfx('kick'); setTimeout(() => sfx('clank', 0.5), 300);
    if (W.mode === 'explore') startAct('kick', {});
    c.kicks = (c.kicks || 0) + 1; if (c.kicks >= 1) unlock('can');
    const n = nearFriends(9, 1)[0]; if (n && Math.random() < 0.6) setTimeout(() => speak(n, rnd(['Gol!', 'Ma che cazzo calci', 'Palo!', 'Mettila nel bidone, maiale']), 'calci una lattina per strada'), 600);
  }
  function stepCan(dt) {
    const c = st.can; if (!c) return; const m = c.mesh;
    if (c.vel.lengthSq() < 1e-5 && m.position.y <= 0.034) return;
    m.position.addScaledVector(c.vel, dt); c.vel.y -= 9.8 * dt;
    if (m.position.y < 0.033) { m.position.y = 0.033; if (c.vel.y < -0.8) { sfx('clank', Math.min(0.6, -c.vel.y * 0.15)); c.vel.y *= -0.35; } else c.vel.y = 0; c.vel.x *= 0.96; c.vel.z *= 0.96; }
    if (level && level.isWalkable && !level.isWalkable(m.position.x, m.position.z)) { m.position.addScaledVector(c.vel, -dt); c.vel.x *= -0.5; c.vel.z *= -0.5; }
    c.vel.x *= Math.exp(-dt * 0.8); c.vel.z *= Math.exp(-dt * 0.8);
    c.spin *= Math.exp(-dt * 1.5); m.rotation.y += c.spin * dt * 0.3; m.rotation.x += c.spin * dt;
    if (m.position.distanceTo(c.home) > 60) { m.position.copy(c.home); c.vel.set(0, 0, 0); }
  }

  // doorbells: called by quartiere.js knock items (a friend shouts from the window)
  const bubbles = [];
  function bubble(pos, text) {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; const x = cv.getContext('2d');
    x.fillStyle = 'rgba(255,255,255,.94)'; x.beginPath(); x.roundRect ? x.roundRect(4, 4, 504, 96, 26) : x.rect(4, 4, 504, 96); x.fill();
    x.beginPath(); x.moveTo(230, 98); x.lineTo(256, 124); x.lineTo(282, 98); x.fill();
    x.fillStyle = '#111'; x.font = '600 30px system-ui,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    let t = text; while (x.measureText(t).width > 470 && t.length > 4) t = t.slice(0, -2); if (t !== text) t = t.slice(0, -1) + '…'; x.fillText(t, 256, 52);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })); sp.scale.set(2.4, 0.6, 1); sp.position.copy(pos); scene.add(sp);
    bubbles.push({ sp, t: 4.5 });
  }
  const DOOR_LINES = ['Chi cazzo è a quest\'ora?', 'Arrivo! …no, non arrivo', 'Se sei il condominio non ci sono', 'Zuck? Sali che c\'è da bere', 'Ma suona più piano, porca troia', 'Sto giocando, passa dopo', 'Hai portato le birre? No? Allora ciao'];
  window.__iaDoorbell = (ho, door) => {
    const p = door.clone().add(V(0, 1.7, 0));
    setTimeout(() => { bubble(p, (ho.name ? ho.name + ': ' : '') + rnd(DOOR_LINES)); sfx('creak', 0.4); }, 900);
    unlock('doorbell'); ev(`ha suonato il campanello di ${ho.name || 'un amico'}`);
  };

  // Seghino's TV: zapping on a canvas (called by quartiere.js' TV item)
  function tvOn() {
    const Qp = window.__quartiere && window.__quartiere.places && window.__quartiere.places.seghino; const mesh = Qp && Qp.tv; if (!mesh) return false;
    if (!st.tv) {
      const cv = document.createElement('canvas'); cv.width = 320; cv.height = 180; const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      st.tv = { cv, x: cv.getContext('2d'), tex, mesh, old: mesh.material.map, ch: 0, t: 0, acc: 0, on: false };
    }
    const T = st.tv; T.on = true; T.ch = (T.ch + 1) % CHANNELS.length; T.t = 0; T.static = 0.35;
    T.mesh.material.map = T.tex; T.mesh.material.needsUpdate = true; sfx('tvzap');
    toast('Canale ' + (T.ch + 1) + ': ' + CHANNELS[T.ch].name);
    unlock('tv'); return true;
  }
  window.__iaTV = tvOn;
  const CHANNELS = [
    { name: 'TG Bigalesso', draw: (x, t) => { x.fillStyle = '#0b2a5a'; x.fillRect(0, 0, 320, 180); x.fillStyle = '#fff'; x.font = '900 22px Impact'; x.fillText('TG BIGALESSO', 14, 30); x.fillStyle = '#c00'; x.fillRect(0, 140, 320, 40); x.fillStyle = '#fff'; x.font = '700 15px system-ui'; const s = 'ULTIM\'ORA: avvistato Tortellino Man in via Petroni · Il Gulag assume · Sushi: finiti i nigiri · '; x.fillText(s + s, 320 - (t * 70) % 760, 166); } },
    { name: 'Zombata 24h', draw: (x, t) => { x.fillStyle = '#060a06'; x.fillRect(0, 0, 320, 180); x.fillStyle = '#7aff4a'; x.font = '900 46px Impact'; x.textAlign = 'center'; x.fillText('ZOMBATA', 160, 92 + Math.sin(t * 3) * 4); x.font = '700 14px system-ui'; x.fillText('PREMI START', 160, 130); x.textAlign = 'left'; } },
    { name: 'Meteo Bologna', draw: (x, t) => { x.fillStyle = '#1d6fb8'; x.fillRect(0, 0, 320, 180); x.fillStyle = '#fff'; x.font = '900 22px Impact'; x.fillText('METEO', 14, 30); x.font = '700 16px system-ui'; x.fillText('Nebbia. Come sempre.', 14, 70); x.fillText('Portici: asciutti', 14, 96); x.fillText('Umore: ' + (['basso', 'bassissimo', 'da Celtic'][((t / 3) | 0) % 3]), 14, 122); } },
    { name: 'Televendite', draw: (x, t) => { x.fillStyle = '#ffe14d'; x.fillRect(0, 0, 320, 180); x.fillStyle = '#c00'; x.font = '900 30px Impact'; x.fillText('SOLO OGGI!', 14, 44); x.fillStyle = '#111'; x.font = '700 17px system-ui'; x.fillText('Cabinato BIGALESSO', 14, 84); x.fillText('a sole 3 rate da 999 €', 14, 108); x.fillStyle = '#c00'; x.font = '900 24px Impact'; if (((t * 3) | 0) % 2) x.fillText('CHIAMA ORA', 14, 150); } },
    { name: 'Spento', draw: (x) => { x.fillStyle = '#050505'; x.fillRect(0, 0, 320, 180); } },
  ];
  function stepTV(dt) {
    const T = st.tv; if (!T || !T.on) return;
    if (T.mesh.position && mp().distanceTo(T.mesh.getWorldPosition(t3)) > 12) return;
    T.t += dt; T.acc += dt; if (T.acc < 1 / 10) return; T.acc = 0;
    const x = T.x; CHANNELS[T.ch].draw(x, T.t);
    if (T.static > 0) { T.static -= 0.1; for (let i = 0; i < 260; i++) { x.fillStyle = Math.random() < 0.5 ? '#fff' : '#000'; x.fillRect(Math.random() * 320, Math.random() * 180, 3, 2); } }
    T.tex.needsUpdate = true;
    if (T.ch === CHANNELS.length - 1) { T.on = false; T.mesh.material.map = T.old; T.mesh.material.needsUpdate = true; }
  }

  // the edicola (quartiere.js item fires 'bigalesso:edicola'): you get the Corriere and read it on the spot
  let readCap = null, reading = false;
  addEventListener('bigalesso:edicola', () => {
    const R = news && news.reader; if (!R || R.isOpen) return;
    setTimeout(() => {
      if (R.isOpen || !(S && S.phase === 'world')) return;
      readCap = input.capture; reading = true; input.capture = e => R.key(e) || true;
      if (document.pointerLockElement) try { document.exitPointerLock(); } catch (e) { }
      try { R.open(1, '313'); } catch (e) { input.capture = readCap; readCap = null; reading = false; }
    }, 700);
  });
  if (news && news.reader && news.reader.onClose) news.reader.onClose(() => { if (reading) { reading = false; input.capture = readCap || null; readCap = null; } });

  // ---------------------------------------------------------------- per frame (main.js)
  function preUpdate(dt) {
    if (!W) return;
    if (!st.can && S && S.phase === 'world') makeCan();
    // wheel: the mouse picks a sector instead of turning the camera
    if (wheel.open) {
      if (!free() && !(W && W.mode === 'explore')) wheel.hide();
      wheel.move(input.drag.dx, input.drag.dy); input.drag.dx = 0; input.drag.dy = 0;
    }
    VS.pre(W);
    if (man.sit && man.sit.src === 'bench' && !(W.mode === 'ia' && W.m.kind === 'sit')) man.sit = null;
    if (W.mode !== 'ia' && man.model.rotation.x !== 0) man.model.rotation.x = 0;
    if (W.mode !== 'ia' && phoneMesh.visible) phoneMesh.visible = false;
    if (W.mode !== 'ia' && myBottle.visible) myBottle.visible = false;
    if (W.mode !== 'ia' && armEl.style.display === 'block') endArm();
    // push-up tilt (before man.update so the hands' IK solves on the tilted body)
    if (W.mode === 'ia' && W.m.kind === 'pushup') man.model.rotation.x = W.m.th || 0;
    stepCan(dt); stepTV(dt);
    for (let i = bubbles.length - 1; i >= 0; i--) { const b = bubbles[i]; b.t -= dt; b.sp.material.opacity = Math.min(1, b.t); if (b.t <= 0) { scene.remove(b.sp); b.sp.material.map.dispose(); b.sp.material.dispose(); bubbles.splice(i, 1); } }
    // follower
    if (st.follow && npcs) {
      const n = npcs.get(st.follow);
      if (!n || n.leaving) st.follow = null;
      else if (!(npcs.talking && npcs.talking())) {
        const p = n.root.position, m = mp(); const d = Math.hypot(m.x - p.x, m.z - p.z);
        if (d > 25) { const b = fwd(t1); p.set(m.x - b.x * 1.6, 0, m.z - b.z * 1.6); }
        if (d > 1.9) { n.state = 'walk'; n.summoned = false; n.target = (n.target || V()).set(m.x - fwd(t1).x * 1.2, 0, m.z - fwd(t1).z * 1.2); n.wait = 5; n.home = n.target.clone(); }
        else if (n.state === 'walk' || n.state === 'idle') { n.state = 'follow'; n.target = null; face(n); }
        else if (n.state === 'follow') face(n);
      }
    }
    if (st.drunk > 0) st.drunk = Math.max(0, st.drunk - dt);
  }
  // after man.update: the middle finger
  const fingerBones = [];
  function post() {
    if (!W || W.mode !== 'ia' || W.m.kind !== 'medio' || !(W.m.finger > 0.3)) return;
    if (!fingerBones.length && man.bones) for (const k of ['RightHandMiddle1', 'RightHandMiddle2', 'RightHandMiddle3']) if (man.bones[k]) fingerBones.push(man.bones[k]);
    for (const b of fingerBones) if (b.userData.q0) b.quaternion.slerp(b.userData.q0, W.m.finger);
  }
  // final camera: drunk wobble
  const dOut = { pos: V(), look: V(), fov: 50 };
  function camera(pose, dt) {
    if (!pose || !(st.drunk > 0)) return pose;
    const k = Math.min(1, st.drunk / 6), t = performance.now() / 1000;
    dOut.pos.copy(pose.pos).add(t3.set(Math.sin(t * 0.9) * 0.12, Math.sin(t * 1.3) * 0.06, Math.cos(t * 0.7) * 0.1).multiplyScalar(k));
    dOut.look.copy(pose.look).add(t3.set(Math.sin(t * 0.6 + 1) * 0.35, Math.sin(t * 1.1) * 0.12, Math.cos(t * 0.8) * 0.3).multiplyScalar(k));
    dOut.fov = (pose.fov || 50) + Math.sin(t * 0.5) * 4 * k;
    return dOut;
  }
  scene.add(phoneMesh); // parked until a hand takes it

  return { plugin, update: preUpdate, post, camera, wheel, state: st, vespa: VS };
}
