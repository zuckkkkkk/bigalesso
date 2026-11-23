// "Postazione Discord": a gaming desk (anchor 'discord', fallback: lounge right wall). Sit down → a Discord-style
// desktop UI with the "Compettina" voice channel full of personas and a quick aim duel (best of 5) against one of them,
// with trash talk from the AI (or the persona's catchphrases offline).
import * as THREE from 'three';
import { V, rnd, pick, clamp, shuffle, persona, personas, catchphrase, ask, SAFE, clean, esc, createOverlay, unlock, record, getRec, phone, logEvent, anchor, cv, canvasTex, banter, banterPool } from './shared.js';

const COMPE = ['zuck', 'ashish', 'lombu', 'cesco', 'asche', 'forla', 'seghino'];
const FALLBACK_TALK = {
  win: ['gg ez', 'troppo lento bratan', 'torna su osu', 'skill issue palese', 'easy compe', 'ti ho fatto il culo', 'mira di merda, fra', 'godo, coglione', 'torna al tutorial, testa di cazzo', 'socmel che lento'],
  lose: ['lag', 'avevo il mouse scarico', 'rematch subito', 'ok questa la ammetto', 'era hackerato', 'ma vaffanculo', 'porca troia, laggo', 'che merda di mouse', 'rivincita subito, stronzo', 'che palle'],
  start: ['compettina? daje', 'tocca la compe', 'vediamo chi ha i riflessi', 'pronto a perdere?', 'preparati a prenderlo in culo', 'dai mo, coglione', 'chi perde paga le birrette', 'burdèl, si gioca'],
};
const CSS = `
#mg-discord .dc{position:relative;margin:auto;width:min(1180px,94vw);height:min(700px,88vh);display:grid;grid-template-columns:72px 230px 1fr 250px;background:#313338;border-radius:10px;overflow:hidden;box-shadow:0 30px 90px rgba(0,0,0,.6);font:14px/1.35 "gg sans","Noto Sans",system-ui,sans-serif;color:#dbdee1}
#mg-discord .sv{background:#1e1f22;display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px 0}
#mg-discord .sv i{width:48px;height:48px;border-radius:50%;background:#313338;display:grid;place-items:center;font:700 18px system-ui;color:#fff;font-style:normal}
#mg-discord .sv i.on{border-radius:16px;background:#5865f2}
#mg-discord .ch{background:#2b2d31;padding:14px 8px;overflow:hidden}
#mg-discord .ch h3{font:700 15px system-ui;color:#f2f3f5;margin:0 6px 14px;padding-bottom:10px;border-bottom:1px solid #1f2023}
#mg-discord .ch .c{padding:5px 8px;border-radius:5px;color:#949ba4;font-weight:500}
#mg-discord .ch .c.on{background:#404249;color:#f2f3f5}
#mg-discord .vm{display:flex;align-items:center;gap:8px;padding:4px 8px 4px 26px;color:#b5bac1}
#mg-discord .av{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-size:14px;flex:none;box-shadow:0 0 0 2px transparent;transition:box-shadow .15s}
#mg-discord .av.talk{box-shadow:0 0 0 2px #23a55a}
#mg-discord .main{display:flex;flex-direction:column;min-width:0}
#mg-discord .top{height:48px;display:flex;align-items:center;gap:10px;padding:0 16px;border-bottom:1px solid #1f2023;color:#f2f3f5;font-weight:600}
#mg-discord .top small{color:#949ba4;font-weight:400}
#mg-discord .arena{position:relative;flex:1;margin:14px;border-radius:8px;overflow:hidden;background:radial-gradient(circle at 50% 60%,#3a4a3a,#151a14);cursor:crosshair}
#mg-discord .arena .bgx{position:absolute;inset:0;background:repeating-linear-gradient(90deg,rgba(255,255,255,.03) 0 2px,transparent 2px 60px),linear-gradient(transparent 62%,rgba(0,0,0,.45));}
#mg-discord .tg{position:absolute;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;background:radial-gradient(circle,#fff 0 18%,#e33 19% 38%,#fff 39% 58%,#e33 59%);box-shadow:0 0 22px rgba(255,60,60,.7);display:none;animation:tgIn .12s ease-out}
@keyframes tgIn{from{transform:scale(.2)}to{transform:none}}
#mg-discord .big{position:absolute;left:0;right:0;top:38%;text-align:center;font:800 34px/1.1 system-ui;color:#fff;text-shadow:0 3px 12px #000;pointer-events:none}
#mg-discord .big small{display:block;font:600 15px system-ui;color:#c9cdfb;margin-top:8px}
#mg-discord .score{position:absolute;left:14px;top:12px;font:700 15px system-ui;color:#fff;text-shadow:0 1px 4px #000}
#mg-discord .btns{position:absolute;left:0;right:0;bottom:22px;display:flex;justify-content:center;gap:10px}
#mg-discord .btns button{font:600 14px system-ui;padding:10px 18px;border-radius:6px;border:0;background:#5865f2;color:#fff;cursor:pointer}
#mg-discord .btns button.alt{background:#4e5058}
#mg-discord .side{background:#2b2d31;display:flex;flex-direction:column;min-width:0}
#mg-discord .side h4{font:700 12px system-ui;letter-spacing:.04em;color:#949ba4;margin:14px 14px 6px;text-transform:uppercase}
@media (max-width:1100px){#mg-discord .dc{grid-template-columns:56px 170px 1fr 200px}#mg-discord .big{font-size:26px}}
#mg-discord .msgs{flex:1;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;padding:6px 12px 12px;gap:8px}
#mg-discord .m{display:flex;gap:8px;animation:mgIn .2s}
#mg-discord .m b{font-weight:600}
#mg-discord .m p{margin:1px 0 0;color:#dbdee1;word-break:break-word}
`;

export function discordPlugin(M) {
  return (ctx, W, H) => {
    const { goTo, setMode, toast } = H;
    const { audio, input } = ctx;
    const level = ctx.level;
    // ---- placement
    const A = anchor(level, 'discord', { pos: V(5.35, 0, 6.6), yaw: 0 });
    const yaw = A.yaw ?? 0, f = V(Math.sin(yaw), 0, Math.cos(yaw)), r = V(Math.cos(yaw), 0, -Math.sin(yaw));
    // real anchor (quartiere: Casa di Ashish) = the chair spot facing the desk, the desk (gaming_desk.glb) is QUARTIERE's: our desk
    // frame sits 0.78 m ahead and stays hidden; fallback: our own desk in the lounge corner
    const g = new THREE.Group(); g.position.copy(A.real ? A.pos.clone().addScaledVector(f, 0.78) : A.pos); g.position.y = 0; g.rotation.y = yaw; ctx.scene.add(g);
    // desk (local: +z = toward the player? no: the player looks along +z of the group, desk is at the origin)
    const wood = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.6 });
    const black = new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.45, metalness: 0.2 });
    const add = (geo, m, x, y, z, parent = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; parent.add(o); return o; };
    add(new THREE.BoxGeometry(1.5, 0.04, 0.7), wood, 0, 0.74, 0);
    for (const sx of [-0.7, 0.7]) add(new THREE.BoxGeometry(0.05, 0.72, 0.62), black, sx, 0.36, 0);
    // monitors (main: discord, side: the game) — the screen faces the player (-z local)
    const scr = cv(640, 360), sx = scr.getContext('2d');
    const scrTex = canvasTex(scr);
    const monitor = (x, ry, w) => {
      const m = new THREE.Group(); m.position.set(x, 0.76, 0.16); m.rotation.y = ry; g.add(m);
      add(new THREE.BoxGeometry(w + 0.03, w * 0.6, 0.03), black, 0, 0.28 + w * 0.3, 0, m);
      add(new THREE.BoxGeometry(0.05, 0.28, 0.05), black, 0, 0.14, 0.04, m); add(new THREE.BoxGeometry(0.24, 0.015, 0.18), black, 0, 0.008, 0.04, m);
      return m;
    };
    const m1 = monitor(-0.05, 0, 0.62), m2 = monitor(0.58, 0.45, 0.42);
    const sMat = new THREE.MeshBasicMaterial({ map: scrTex, toneMapped: false });
    const s1 = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.355), sMat); s1.position.set(0, 0.28 + 0.62 * 0.3, -0.017); s1.rotation.y = Math.PI; m1.add(s1);
    const s2c = cv(320, 200), s2x = s2c.getContext('2d'); s2x.fillStyle = '#152015'; s2x.fillRect(0, 0, 320, 200); s2x.fillStyle = '#9cff3a'; s2x.font = '900 30px Impact, sans-serif'; s2x.textAlign = 'center'; s2x.fillText('WARZONE', 160, 90); s2x.font = '600 16px system-ui'; s2x.fillStyle = '#fff'; s2x.fillText('in attesa della squadra…', 160, 130);
    const s2 = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.25), new THREE.MeshBasicMaterial({ map: canvasTex(s2c), toneMapped: false })); s2.position.set(0, 0.28 + 0.42 * 0.3, -0.017); s2.rotation.y = Math.PI; m2.add(s2);
    // RGB keyboard, mouse, headset, chair
    const rgbC = cv(64, 4), rx = rgbC.getContext('2d'); const rgbTex = canvasTex(rgbC);
    const kb = add(new THREE.BoxGeometry(0.44, 0.02, 0.14), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffffff, emissiveMap: rgbTex, emissiveIntensity: 1.2, roughness: 0.5 }), -0.05, 0.77, -0.18);
    add(new THREE.BoxGeometry(0.06, 0.025, 0.1), black, 0.3, 0.775, -0.18);
    add(new THREE.TorusGeometry(0.08, 0.018, 8, 20, Math.PI), new THREE.MeshStandardMaterial({ color: 0xd02040, roughness: 0.4 }), -0.55, 0.85, 0.05).rotation.y = 0.5;
    const chair = new THREE.Group(); chair.position.set(0, 0, -0.75); g.add(chair);
    const red = new THREE.MeshStandardMaterial({ color: 0x8a1020, roughness: 0.55 });
    add(new THREE.BoxGeometry(0.5, 0.08, 0.5), red, 0, 0.48, 0, chair); add(new THREE.BoxGeometry(0.5, 0.75, 0.08), red, 0, 0.9, -0.24, chair); add(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 8), black, 0, 0.24, 0, chair); add(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 5), black, 0, 0.03, 0, chair);
    // collider (axis-aligned box around the rotated desk) + camera blocker free
    const corners = [[-0.78, -0.36], [0.78, -0.36], [-0.78, 0.36], [0.78, 0.36]].map(([x, z]) => g.localToWorld(V(x, 0, z)));
    g.updateMatrixWorld(true);
    const cw = [[-0.78, -0.36], [0.78, -0.36], [-0.78, 0.36], [0.78, 0.36]].map(([x, z]) => g.localToWorld(V(x, 0, z)));
    const box = { id: 'mg-discord', min: V(Math.min(...cw.map(p => p.x)), 0, Math.min(...cw.map(p => p.z))), max: V(Math.max(...cw.map(p => p.x)), 0, Math.max(...cw.map(p => p.z))) };
    if (A.real) g.visible = false; else if (W.boxes) W.boxes.push(box);
    void corners;
    const stand = g.localToWorld(V(0, 0, -0.78)); stand.y = 0;
    function drawScreen(state) {
      const x = sx; x.fillStyle = '#313338'; x.fillRect(0, 0, 640, 360);
      x.fillStyle = '#1e1f22'; x.fillRect(0, 0, 54, 360); x.fillStyle = '#2b2d31'; x.fillRect(54, 0, 150, 360);
      for (let i = 0; i < 5; i++) { x.fillStyle = i ? '#313338' : '#5865f2'; x.beginPath(); x.arc(27, 30 + i * 48, 18, 0, 7); x.fill(); }
      x.fillStyle = '#f2f3f5'; x.font = '700 14px system-ui'; x.fillText('Teletubbylandia', 64, 26);
      x.fillStyle = '#949ba4'; x.font = '500 12px system-ui'; ['# generale', '# compettine', '# meme'].forEach((s, i) => x.fillText(s, 66, 60 + i * 20));
      x.fillStyle = '#f2f3f5'; x.fillText('🔊 Compettina', 66, 130);
      COMPE.slice(0, 5).forEach((id, i) => { const p = persona(id); x.fillStyle = p.color || '#888'; x.beginPath(); x.arc(84, 152 + i * 22, 8, 0, 7); x.fill(); if ((Math.floor(performance.now() / 400) + i) % 4 === 0) { x.strokeStyle = '#23a55a'; x.lineWidth = 2; x.stroke(); } x.fillStyle = '#b5bac1'; x.fillText(p.name || id, 98, 156 + i * 22); });
      x.fillStyle = '#dbdee1'; x.font = '700 22px system-ui'; x.fillText(state === 'play' ? 'COMPETTINA IN CORSO' : 'qualcuno per una compettina?', 230, 170);
      scrTex.needsUpdate = true;
      rx.clearRect(0, 0, 64, 4); const t = performance.now() / 600; for (let i = 0; i < 64; i++) { rx.fillStyle = `hsl(${(i * 6 + t * 90) % 360},90%,55%)`; rx.fillRect(i, 0, 1, 4); } rgbTex.needsUpdate = true;
    }
    drawScreen();

    // ---- overlay
    let ov = null, G = null;
    function ensureOverlay() {
      if (ov) return ov;
      ov = createOverlay('mg-discord', `<div class="dc">
  <div class="sv"><i class="on">TT</i><i>🎮</i><i>🍣</i><i>🧟</i><i>+</i></div>
  <div class="ch"><h3>Teletubbylandia certificata</h3><div class="c"># generale</div><div class="c on"># compettine</div><div class="c"># meme</div><div class="c" style="margin-top:12px;color:#f2f3f5">🔊 Compettina</div><div class="vc"></div></div>
  <div class="main"><div class="top"># compettine <small>duello di mira, al meglio di 5</small></div>
    <div class="arena"><div class="bgx"></div><div class="score"></div><div class="tg"></div><div class="big"></div><div class="btns"></div></div></div>
  <div class="side"><h4>Chat vocale</h4><div class="msgs"></div></div></div>`, { input, onKey: e => { if ((e.code === 'Space' || e.code === 'Enter') && G) { e.preventDefault(); if (G.phase === 'menu' || G.phase === 'end') begin(); else shoot(null); } }, onClose: () => { leave(); } });
      { const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); }
      ov.$('.arena').addEventListener('mousedown', e => { if (!G) return; const tg = ov.$('.tg'); const onT = e.target === tg; if (G.phase === 'wait' || G.phase === 'live') shoot(onT ? e : 'miss'); });
      return ov;
    }
    const talkers = new Set();
    function voice() {
      ov.$('.vc').innerHTML = G.members.map(id => { const p = persona(id); return `<div class="vm"><span class="av${talkers.has(id) ? ' talk' : ''}" style="background:${esc(p.color || '#555')}">${esc(p.emoji || '🙂')}</span>${esc(p.name || id)}${id === G.opp ? ' ⚔️' : ''}</div>`; }).join('') + `<div class="vm"><span class="av" style="background:#5865f2">🕹️</span>Tu</div>`;
    }
    function say(id, text) {
      if (!ov) return; const p = persona(id);
      const el = document.createElement('div'); el.className = 'm';
      el.innerHTML = `<span class="av" style="background:${esc(p.color || '#555')}">${esc(p.emoji || '🙂')}</span><div><b style="color:${esc(p.color || '#fff')}">${esc(p.name || id)}</b><p>${esc(text)}</p></div>`;
      const box = ov.$('.msgs'); box.appendChild(el); while (box.children.length > 9) box.firstChild.remove();
      talkers.add(id); voice(); setTimeout(() => { talkers.delete(id); if (G) voice(); }, 1600);
      try { audio.ctx && audio.tone('sine', 880, 0, 0.06, 0.03, audio.room); } catch (e) { }
    }
    async function trash(id, situation, kind) {
      const p = persona(id);
      const txt = await ask({ model: 'fast', maxTokens: 50, persona: id,
        system: `Sei ${p.name}, un amico in una chiamata Discord durante una "compettina" (sfida di riflessi). Stile: ${p.tone}. Intercalari: ${(p.catchphrases || []).join(', ')}. Rispondi con UNA battuta breve (max 12 parole), trash talk amichevole. ${SAFE}`,
        prompt: situation }, () => { const r = Math.random(); if (r < 0.3) { const b = banter(id, kind === 'win' ? 'win' : kind === 'lose' ? 'lose' : 'roast'); if (b) return b; } if (r < 0.55) return pick(banterPool('discord')); return (Math.random() < 0.5 ? catchphrase(id) + ' ' : '') + pick(FALLBACK_TALK[kind] || FALLBACK_TALK.start); }, 6000);
      say(id, clean(txt, 110));
    }
    function begin() {
      G.round = 0; G.me = 0; G.op = 0; G.times = []; G.phase = 'pre';
      ov.$('.btns').innerHTML = '';
      big('Round 1', 'Clicca il bersaglio appena appare');
      setTimeout(nextRound, 1200);
    }
    function big(a, b = '') { ov.$('.big').innerHTML = esc(a) + (b ? `<small>${esc(b)}</small>` : ''); }
    function hud() { ov.$('.score').textContent = `Tu ${G.me} – ${G.op} ${persona(G.opp).name}`; }
    function nextRound() {
      if (!G || !ov.isOpen) return;
      G.round++; G.phase = 'wait'; hud(); big('Aspetta…');
      const tg = ov.$('.tg'); tg.style.display = 'none';
      const size = Math.max(30, 64 - G.round * 7); tg.style.width = tg.style.height = size + 'px'; tg.style.margin = `-${size / 2}px 0 0 -${size / 2}px`;
      G.timer = setTimeout(() => {
        if (!G || G.phase !== 'wait') return;
        G.phase = 'live'; G.t0 = performance.now(); big('');
        tg.style.left = rnd(12, 88) + '%'; tg.style.top = rnd(18, 80) + '%'; tg.style.display = 'block';
        try { audio.ctx && audio.tone('square', 1320, 0, 0.05, 0.04, audio.room); } catch (e) { }
        // the opponent's reaction (persona skill + noise)
        const base = { zuck: 255, lombu: 265, ashish: 285, cesco: 275, asche: 300, forla: 290, seghino: 280 }[G.opp] || 290;
        G.oppT = clamp(base + rnd(-45, 85) + G.round * -4, 175, 520);
        G.oppTimer = setTimeout(() => { if (G && G.phase === 'live') result(null, G.oppT); }, G.oppT + 260); // 260: the time the shot takes to land in the UI
      }, rnd(1000, 2600));
    }
    function shoot(e) {
      if (!G) return;
      if (G.phase === 'wait') { clearTimeout(G.timer); G.phase = 'res'; G.op++; hud(); big('Troppo presto!', persona(G.opp).name + ' vince il round'); trash(G.opp, 'L\'avversario ha sparato troppo presto e ha perso il round.', 'win'); return after(); }
      if (G.phase !== 'live') return;
      if (e === 'miss') { G.misses = (G.misses || 0) + 1; try { audio.ctx && audio.noise(0.05, 0.05, 3000, 900, audio.room); } catch (x) { } return; }
      const ms = performance.now() - G.t0 + (e === null ? 60 : 0); // keyboard = no aiming: small penalty
      result(ms, G.oppT);
    }
    function result(ms, opp) {
      clearTimeout(G.oppTimer); G.phase = 'res'; ov.$('.tg').style.display = 'none';
      const win = ms !== null && ms <= opp;
      if (win) { G.me++; G.times.push(ms); big(`${Math.round(ms)} ms`, `${persona(G.opp).name}: ${Math.round(opp)} ms — round tuo!`); audio.sfx && audio.sfx('dPerfect'); }
      else { G.op++; big(ms === null ? 'Troppo lento!' : `${Math.round(ms)} ms`, `${persona(G.opp).name}: ${Math.round(opp)} ms`); }
      hud();
      if (Math.random() < 0.7) trash(G.opp, win ? `Hai perso il round: l'avversario ha reagito in ${Math.round(ms)} ms, tu in ${Math.round(opp)} ms.` : `Hai vinto il round con ${Math.round(opp)} ms.`, win ? 'lose' : 'win');
      else { const o = pick(G.members.filter(m => m !== G.opp)); trash(o, `Stai guardando una sfida di riflessi su Discord tra ${persona(G.opp).name} e un amico. ${win ? 'L\'amico ha appena vinto un round' : persona(G.opp).name + ' ha appena vinto un round'}. Commenta.`, win ? 'lose' : 'win'); }
      after();
    }
    function after() {
      if (G.me >= 3 || G.op >= 3) return setTimeout(finish, 1400);
      setTimeout(nextRound, 1700);
    }
    function finish() {
      if (!G || !ov.isOpen) return;
      G.phase = 'end'; const win = G.me > G.op, best = G.times.length ? Math.min(...G.times) : null;
      big(win ? 'Hai vinto la compettina!' : persona(G.opp).name + ' vince la compettina', best ? `Miglior tempo: ${Math.round(best)} ms` : '');
      ov.$('.btns').innerHTML = '<button class="again">Rivincita (Invio)</button><button class="alt bye">Esci (Esc)</button>';
      ov.$('.again').onclick = () => begin(); ov.$('.bye').onclick = () => ov.close();
      unlock('discord_play', { title: 'Sono su discord', desc: 'Prima compettina alla postazione', icon: '🎧' });
      if (win) { unlock('discord_win', { title: 'Compettina vinta', desc: 'Battuto ' + persona(G.opp).name + ' al duello di mira', icon: '🎯' }); audio.sfx && audio.sfx('clear'); }
      if (best) { if (record('discord_best_ms', Math.round(best), true)) say('zuck', `nuovo record della postazione: ${Math.round(best)} ms`); if (best < 220) unlock('discord_220', { title: 'Riflessi sgravati', desc: 'Sotto i 220 ms', icon: '⚡' }); }
      trash(G.opp, win ? 'Hai appena perso la compettina 3 a ' + G.op + '. Chiedi la rivincita.' : 'Hai appena vinto la compettina. Prendi in giro bonariamente lo sconfitto.', win ? 'lose' : 'win');
      logEvent('discord', win ? `ha vinto la compettina su Discord contro ${persona(G.opp).name}` : `ha perso la compettina su Discord contro ${persona(G.opp).name}`);
      phone(G.opp, win ? 'rivincita stasi. ' + catchphrase(G.opp) : 'gg ' + catchphrase(G.opp));
    }
    function open() {
      ensureOverlay();
      const have = new Set(personas().map(p => p.id));
      const members = shuffle(COMPE.filter(id => have.has(id))).slice(0, 4);
      G = { members, opp: members[0], phase: 'menu', me: 0, op: 0, round: 0, times: [] };
      ov.$('.msgs').innerHTML = ''; ov.$('.btns').innerHTML = '<button class="go">Accetta la sfida (Invio)</button>';
      ov.$('.go').onclick = () => begin();
      voice(); hud(); big('Compettina con ' + persona(G.opp).name, 'Al meglio di 5 · clicca il bersaglio appena compare');
      ov.open();
      setTimeout(() => say(members[1] || G.opp, catchphrase(members[1] || G.opp)), 500);
      trash(G.opp, 'Sfida l\'amico appena entrato nel canale vocale a una compettina di riflessi.', 'start');
      return true;
    }
    function leave() { if (G) { clearTimeout(G.timer); clearTimeout(G.oppTimer); } G = null; if (W.mode === 'mg_discord') setMode('standup'); }
    W.mgOpen = W.mgOpen || {}; W.mgOpen.discord = () => { if (W.mode === 'explore' && H.manPos().distanceTo(stand) < 3) { start(); return true; } return open(); }; // from the phone: Discord opens right away
    function start() { goTo(stand.clone(), yaw, () => { setMode('mg_discord'); }); }
    const items = [{
      id: 'mg-discord', label: () => 'Entra su Discord: compettina', anchor: () => stand, top: () => g.localToWorld(V(0, 1.25, 0.1)), range: 1.1,
      act: () => { if (W.carry) { toast('Prima posa l\'estintore'); return; } start(); },
    }];
    let tAcc = 0;
    return {
      items,
      owns: m => m === 'mg_discord',
      update(mode, dt) {
        if (W.t > 0.7 && (!ov || !ov.isOpen) && !W.m.opened) { W.m.opened = true; open(); }
        const sp = g.localToWorld(V(0, 0.98, 0.16));
        return { crouchT: 0.55, leanT: 0.2, lookW: 1, lookAt: sp, rR: { pos: g.localToWorld(V(0.3, 0.8, -0.18)), w: 0.8, palm: 'down', grip: 0.4 }, rL: { pos: g.localToWorld(V(-0.2, 0.8, -0.2)), w: 0.8, palm: 'down', grip: 0.3 } };
      },
      camera(pose, dt) {
        if (W.mode !== 'mg_discord') return null;
        return A.real ? { pos: g.localToWorld(V(0.3, 1.68, -1.5)), look: g.localToWorld(V(0, 1.0, 0.2)), fov: 48 } : { pos: g.localToWorld(V(0.05, 1.32, -1.05)), look: g.localToWorld(V(0, 1.0, 0.16)), fov: 46 };
      },
      tick(dt, camPos) {
        tAcc += dt; if (!g.visible || !camPos || camPos.distanceTo(g.position) > 9 || tAcc < 0.5) return;
        tAcc = 0; drawScreen(G && G.phase !== 'menu' ? 'play' : '');
      },
      group: g,
    };
  };
}
