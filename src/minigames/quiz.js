// "Chi l'ha detto?" as a desktop overlay (phone / menu entry: window.__minigames.open('chi')) and as a quiz table
// at the Celtic (anchor 'celtic', only when the quartiere provides it). Same rounds as the cabinet (quizcore.js).
// Battle ("Chi l'ha detto? Sfida", rules shared/quiz.mjs): same questions for everyone, speed + correctness, live
// scoreboard. Online through the party (O → Gioca insieme → ❓, the server referees), offline vs bots from the end screen.
import * as THREE from 'three';
import { V, persona, esc, createOverlay, unlock, record, phone, logEvent, anchor, signTex } from './shared.js';
import { buildRounds, aiFake, rankOf } from './quizcore.js';
import { registerPartyGame } from '../net/party.js';

const CSS = `
#mg-quiz .qz{position:relative;margin:auto;width:min(760px,92vw);background:linear-gradient(160deg,#1b0d33,#2c0b2c);border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:26px 30px 22px;box-shadow:0 30px 90px rgba(0,0,0,.6)}
#mg-quiz h2{margin:0;font:900 30px/1 Impact,"Arial Black",system-ui;letter-spacing:.02em;color:#ffd040}#mg-quiz h2 span{color:#ff40a0}
#mg-quiz .meta{display:flex;justify-content:space-between;color:#c9b6e8;font-weight:600;margin:10px 0 14px}
#mg-quiz .bar{height:5px;border-radius:3px;background:rgba(255,255,255,.12);overflow:hidden;margin-bottom:16px}#mg-quiz .bar i{display:block;height:100%;background:#40e0ff;transition:width .1s linear}
#mg-quiz .bubble{position:relative;background:#1f6a4a;border-radius:14px 14px 14px 4px;padding:16px 18px;font:500 19px/1.4 system-ui;color:#fff;margin-bottom:18px;min-height:56px}
#mg-quiz .ask{font:800 15px system-ui;color:#ff80d0;margin:-6px 0 12px}
#mg-quiz .opts{display:grid;grid-template-columns:1fr 1fr;gap:10px}
#mg-quiz .opts.one{grid-template-columns:1fr}
#mg-quiz .opts button{display:flex;gap:10px;align-items:center}
#mg-quiz .em{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;flex:none;font-size:16px}
#mg-quiz .res{margin-top:14px;min-height:22px;font-weight:700}
#mg-quiz .end{text-align:center;padding:8px 0}#mg-quiz .end b{display:block;font:900 44px Impact,system-ui;color:#40e0ff}#mg-quiz .end .rk{font:800 22px system-ui;color:#ff80d0;margin:8px 0 18px}
#mg-quiz .foot{margin-top:16px;color:#9a8ab8;font-size:12px}
#mg-quiz .qz.bt{width:min(980px,95vw)}#mg-quiz .btg{display:grid;grid-template-columns:1fr 250px;gap:18px}@media (max-width:760px){#mg-quiz .btg{grid-template-columns:1fr}#mg-quiz .sb{order:-1}}
#mg-quiz .sb{background:rgba(0,0,0,.25);border-radius:12px;padding:10px 12px;align-self:start}
#mg-quiz .sb h4{margin:0 0 8px;font:800 12px system-ui;letter-spacing:.08em;text-transform:uppercase;color:#c9b6e8}
#mg-quiz .sb .r{display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.07);font-weight:700}
#mg-quiz .sb .r.me{color:#ffd040}#mg-quiz .sb .r span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#mg-quiz .sb .r b{font-variant-numeric:tabular-nums}
#mg-quiz .sb .r i{font-style:normal;width:18px;text-align:center}#mg-quiz .sb .r em{font-style:normal;color:#4f8;font-size:12px}
#mg-quiz .who{display:flex;flex-wrap:wrap;gap:4px;margin-left:auto}#mg-quiz .who small{background:rgba(0,0,0,.35);border-radius:999px;padding:1px 7px;font-size:11px}`;
const QT = 12;

export function createQuizOverlay(M) {
  let ov = null, R = null, used = new Set(), fake = null, timer = null;
  const pre = () => { aiFake().then(f => { fake = f; }).catch(() => { }); };
  pre();
  const sfx = n => { try { M.audio.ctx && M.audio.sfx(n); } catch (e) { } };
  function ensure() {
    if (ov) return ov;
    ov = createOverlay('mg-quiz', `<div class="qz"><h2>CHI L'HA <span>DETTO?</span></h2><div class="body"></div><div class="foot"><kbd>1</kbd>–<kbd>4</kbd> o clic per rispondere · <kbd>Esc</kbd> esci</div></div>`, {
      input: M.getInput && M.getInput(),
      onKey: e => {
        if (B) return battleKey(e);
        if (!R) return;
        if (R.phase === 'end') { if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); begin(); } return; }
        const k = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 }[e.code];
        if (k !== undefined) answer(k); else if ((e.code === 'Enter' || e.code === 'Space') && R.phase === 'res') next();
      },
      onClose: () => { clearInterval(timer); R = null; if (B) battleClosed(); ov.onDone && ov.onDone(); },
    });
    const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s);
    return ov;
  }
  function begin() {
    R = { rounds: buildRounds(10, used, fake), i: 0, score: 0, correct: 0, streak: 0, best: 0, phase: 'q', qt: QT };
    if (used.size > 120) used.clear(); pre(); show();
  }
  function show() {
    const q = R.rounds[R.i], b = ov.$('.body'); R.phase = 'q'; R.qt = QT; R.t0 = performance.now();
    const meta = `<div class="meta"><span>Domanda ${R.i + 1}/${R.rounds.length}</span><span>${R.streak > 1 ? '🔥 serie x' + R.streak + ' · ' : ''}${R.score} punti</span></div><div class="bar"><i style="width:100%"></i></div>`;
    if (q.kind === 'who') {
      b.innerHTML = meta + `<div class="bubble">${esc(q.q.text)}</div><div class="ask">Chi l'ha scritto nel gruppo?</div><div class="opts">${q.options.map((id, k) => { const p = persona(id); return `<button class="mg-b" data-k="${k}"><span class="em" style="background:${esc(p.color || '#555')}">${esc(p.emoji || '🙂')}</span><span><kbd>${k + 1}</kbd> ${esc(p.name || id)}</span></button>`; }).join('')}</div><div class="res"></div>`;
    } else {
      b.innerHTML = meta + `<div class="ask">BONUS ×2 — una di queste frasi è falsa. Quale?</div><div class="opts one">${q.lines.map((l, k) => { const p = persona(l.who); return `<button class="mg-b" data-k="${k}"><span class="em" style="background:${esc(p.color || '#555')}">${esc(p.emoji || '🙂')}</span><span><kbd>${k + 1}</kbd> <b>${esc(p.name)}</b>: ${esc(l.text)}</span></button>`; }).join('')}</div><div class="res"></div>`;
    }
    b.querySelectorAll('.opts button').forEach(bt => bt.onclick = () => answer(+bt.dataset.k));
    clearInterval(timer);
    timer = setInterval(() => { if (!R || R.phase !== 'q') return; R.qt = QT - (performance.now() - R.t0) / 1000; const i = ov.$('.bar i'); if (i) { i.style.width = Math.max(0, R.qt / QT * 100) + '%'; i.style.background = R.qt < 4 ? '#ff4060' : '#40e0ff'; } if (R.qt <= 0) answer(-1); }, 100);
  }
  function answer(k) {
    if (!R || R.phase !== 'q') return;
    const q = R.rounds[R.i]; R.phase = 'res';
    const ok = q.kind === 'fake' ? k === q.answer : (k >= 0 && q.options[k] === q.answer);
    let pts = 0;
    if (ok) { R.correct++; R.streak++; R.best = Math.max(R.best, R.streak); pts = Math.round((100 + Math.max(0, R.qt) * 25) * (1 + Math.min(4, R.streak - 1) * 0.25) * (q.kind === 'fake' ? 2 : 1) / 10) * 10; R.score += pts; sfx('power'); }
    else { R.streak = 0; sfx('hit'); }
    ov.$$('.opts button').forEach((bt, i) => {
      const right = q.kind === 'fake' ? i === q.answer : q.options[i] === q.answer;
      if (right) bt.classList.add('ok'); else if (i === k) bt.classList.add('no');
    });
    const ans = q.kind === 'fake' ? 'La frase falsa era quella di ' + persona(q.lines[q.answer].who).name + (q.lines[q.answer].ai ? ' (inventata dall\'AI)' : '') : persona(q.answer).name + ' l\'ha scritto davvero';
    ov.$('.res').innerHTML = (ok ? `<span style="color:#4f8">Esatto! +${pts}</span>` : `<span style="color:#f68">${k < 0 ? 'Tempo scaduto' : 'Sbagliato'}</span>`) + ` — ${esc(ans)} · <kbd>Invio</kbd>`;
    setTimeout(() => { if (R && R.phase === 'res' && R.rounds[R.i] === q) next(); }, 2600);
  }
  function next() {
    if (!R) return; R.i++;
    if (R.i < R.rounds.length) return show();
    R.phase = 'end'; clearInterval(timer);
    const n = R.rounds.length, rk = rankOf(R.correct, n), rec = record('chi_hi', R.score);
    ov.$('.body').innerHTML = `<div class="end"><div>${R.correct} / ${n} risposte giuste · serie migliore ${R.best}</div><b>${R.score}</b><div class="rk">${esc(rk)}</div>${rec ? '<div style="color:#ffd040;font-weight:800;margin-bottom:12px">Nuovo record!</div>' : ''}<button class="mg-b again">Rigioca (Invio)</button> <button class="mg-b bots">🤖 Sfida i bot</button> <button class="mg-b party">🎉 Sfida gli amici (party)</button></div>`;
    ov.$('.again').onclick = () => begin();
    ov.$('.bots').onclick = () => battleBots();
    ov.$('.party').onclick = () => { ov.close(); setTimeout(() => window.__party && window.__party.open(), 60); };
    unlock('chi_play', { title: "Chi l'ha detto?", desc: 'Hai finito il quiz del gruppo', icon: '💬' });
    if (R.correct === n) unlock('chi_perfect', { title: 'Membro certificato', desc: '10 su 10 al quiz del gruppo', icon: '🏅' });
    logEvent('quiz', `al quiz "Chi l'ha detto?": ${R.correct}/${n} risposte giuste`);
    if (R.correct >= 8) phone('ciccio', `🚨 ${R.correct}/${n} al quiz del gruppo. Notizia da prima pagina`);
    sfx(R.correct >= n * 0.7 ? 'clear' : 'gameover');
  }
  // ---------------------------------------------------------------- battle (shared/quiz.mjs through window.__match)
  let B = null; // { s, v, key, t0, left, rewarded, timer }
  const KEYS = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 };
  function battle(s) {
    ensure();
    if (R) { clearInterval(timer); R = null; }
    if (B && B.s !== s) { try { B.s.leave(); } catch (e) { } }
    B = { s, v: null, key: '', left: 0, at: 0, rewarded: false, timer: null };
    s.on('view', v => { if (!B || B.s !== s) return; if (!ov.isOpen) { ov.onDone = null; ov.open(); } B.v = v; B.left = v.left; B.at = performance.now(); renderBattle(); });
    s.on('event', e => { if (!B || B.s !== s || !e) return; if (e.k === 'res') { const mine = B.v && B.v.mine; sfx(mine === e.right ? 'power' : 'hit'); } if (e.k === 'q') sfx('stick'); });
    s.on('error', e => { if (!B || B.s !== s || !e) return; if (e.fatal) { ov.$('.foot').textContent = 'Connessione persa: la sfida è finita.'; } });
    s.on('over', r => { if (B && B.s === s) battleOver(r); });
    clearInterval(B.timer);
    B.timer = setInterval(() => { if (!B || !B.v || !ov.isOpen) return; const i = ov.$('.bar i'); if (!i) return; const left = Math.max(0, B.left - (performance.now() - B.at) / 1000), tot = B.v.ph === 'q' ? B.v.qt : B.v.ph === 'res' ? 4 : 3; i.style.width = Math.max(0, left / tot * 100) + '%'; i.style.background = B.v.ph === 'q' && left < 4 ? '#ff4060' : B.v.ph === 'q' ? '#40e0ff' : '#ffd040'; }, 100);
    return true;
  }
  async function battleBots() {
    const names = ['seghino', 'asche', 'forla'].map(id => ({ id: 'bot_' + id, name: (persona(id).name || id), bot: true }));
    try { const s = await window.__match.start('quiz', { online: false, players: names, opts: { n: 10 } }); battle(s); }
    catch (e) { console.warn('quiz battle', e); }
  }
  function battleKey(e) {
    const v = B && B.v; if (!v) return;
    const k = KEYS[e.code];
    if (k !== undefined && v.ph === 'q') { e.preventDefault(); battleAnswer(k); return; }
    if ((e.code === 'Enter' || e.code === 'Space') && v.ph === 'end') { e.preventDefault(); ov.close(); }
  }
  function battleAnswer(k) {
    const v = B && B.v; if (!v || v.ph !== 'q' || v.mine >= 0) return;
    B.v = { ...v, mine: k, done: v.done.concat(v.me) }; // optimistic, the next view confirms
    const r = B.s.act({ ans: k, q: v.i }); if (r && r.ok === false) B.v = v;
    renderBattle(); sfx('stick');
  }
  const nameOfP = (v, id) => { const p = v.sc.find(x => x.id === id); return p ? p.name : id; };
  function renderBattle() {
    const v = B.v; if (!v) return;
    const q = ov.$('.qz'); q.classList.add('bt');
    const key = [v.ph, v.i, v.mine, v.done.length, v.res ? 1 : 0, v.sc.map(x => x.s).join(',')].join('|');
    if (key === B.key) return; B.key = key;
    const sb = `<div class="sb"><h4>Classifica</h4>${v.sc.map((p, i) => `<div class="r ${p.id === v.me ? 'me' : ''}"><i>${i + 1}</i><span>${p.bot ? '🤖 ' : ''}${esc(p.name)}</span>${v.ph === 'q' && v.done.includes(p.id) ? '<em>✔</em>' : ''}${p.st > 1 ? '<em>🔥' + p.st + '</em>' : ''}<b>${p.s}</b></div>`).join('')}</div>`;
    let main = '';
    if (v.ph === 'intro') main = `<div class="meta"><span>Sfida a ${v.sc.length} · ${v.n} domande</span><span>si parte…</span></div><div class="bar"><i style="width:100%"></i></div><div class="bubble">Stesse domande per tutti: chi risponde giusto e più veloce prende più punti. Il più veloce a ogni domanda +50.</div>`;
    else if (v.ph === 'end') {
      const pos = v.sc.findIndex(x => x.id === v.me) + 1, mine = v.sc.find(x => x.id === v.me) || { s: 0, c: 0 };
      main = `<div class="end"><div>${pos}° posto · ${mine.c} / ${v.n} giuste</div><b>${mine.s}</b><div class="rk">${esc(v.over ? v.over.summary : '')}</div><div style="color:#c9b6e8;margin-bottom:12px">${esc(B.reward || '')}</div><button class="mg-b bye">Esci (Invio)</button></div>`;
    } else {
      const res = v.res, qq = v.q;
      const meta = `<div class="meta"><span>Domanda ${v.i + 1}/${v.n}</span><span>${v.ph === 'res' ? 'risultato' : v.mine >= 0 ? 'risposta data, aspetta gli altri…' : 'rispondi!'}</span></div><div class="bar"><i style="width:100%"></i></div>`;
      const who = k => res ? Object.entries(res.picks).filter(([, x]) => x === k).map(([id]) => `<small>${esc(nameOfP(v, id))}</small>`).join('') : '';
      const cls = k => res ? (k === res.right ? 'ok' : k === v.mine ? 'no' : '') : (k === v.mine ? 'sel' : '');
      if (qq.k === 'who') main = meta + `<div class="bubble">${esc(qq.text)}</div><div class="ask">Chi l'ha scritto nel gruppo?</div><div class="opts">${qq.opts.map((id, k) => { const p = persona(id); return `<button class="mg-b ${cls(k)}" data-k="${k}"><span class="em" style="background:${esc(p.color || '#555')}">${esc(p.emoji || '🙂')}</span><span><kbd>${k + 1}</kbd> ${esc(p.name || id)}</span><span class="who">${who(k)}</span></button>`; }).join('')}</div>`;
      else main = meta + `<div class="ask">BONUS ×2 — una di queste frasi è falsa. Quale?</div><div class="opts one">${qq.lines.map((l, k) => { const p = persona(l.w); return `<button class="mg-b ${cls(k)}" data-k="${k}"><span class="em" style="background:${esc(p.color || '#555')}">${esc(p.emoji || '🙂')}</span><span><kbd>${k + 1}</kbd> <b>${esc(p.name || l.w)}</b>: ${esc(l.t)}</span><span class="who">${who(k)}</span></button>`; }).join('')}</div>`;
      if (res) { const my = res.pts[v.me] || 0, fast = res.fastest ? nameOfP(v, res.fastest) : null; main += `<div class="res">${my ? `<span style="color:#4f8">+${my}</span>` : `<span style="color:#f68">${v.mine < 0 ? 'Niente risposta' : 'Sbagliato'}</span>`} — ${qq.k === 'who' ? esc((persona(res.who).name || res.who) + " l'ha scritto davvero") : esc('La falsa era quella di ' + (persona(res.who).name || res.who))}${fast ? ' · ⚡ ' + esc(fast) + ' il più veloce' : ''}</div>`; }
      else main += '<div class="res"></div>';
    }
    ov.$('.body').innerHTML = `<div class="btg"><div>${main}</div>${sb}</div>`;
    ov.$('.foot').innerHTML = `<kbd>1</kbd>–<kbd>4</kbd> o clic per rispondere · <kbd>Esc</kbd> lascia la sfida${B.s.online ? ' · online, arbitra il server' : ' · contro i bot'}`;
    ov.$$('.opts button').forEach(bt => bt.onclick = () => battleAnswer(+bt.dataset.k));
    const bye = ov.$('.bye'); if (bye) bye.onclick = () => ov.close();
  }
  function battleOver(r) {
    if (!B || B.rewarded) return; B.rewarded = true;
    const v = B.v, me = v ? v.me : B.s.me, won = !!(r && r.winners && r.winners.includes(me)), row = v && v.sc.find(x => x.id === me), c = row ? row.c : 0;
    const humans = v ? v.sc.filter(x => !x.bot).length : 1;
    const xp = 20 + c * 8 + (won ? (humans > 1 ? 80 : 40) : 0), euro = won && humans > 1 ? 15 : 0;
    try { const RP = window.__rpg; if (RP) { RP.addXP && RP.addXP(xp, "Chi l'ha detto? Sfida"); euro && RP.money && RP.money.add && RP.money.add(euro); } } catch (e) { }
    B.reward = `+${xp} XP${euro ? ' · +€ ' + euro : ''}`; B.key = '';
    unlock('chi_play', { title: "Chi l'ha detto?", desc: 'Hai finito il quiz del gruppo', icon: '💬' });
    if (won && humans > 1) unlock('chi_battle_win', { title: 'Re del gruppo', desc: "Hai vinto una sfida di Chi l'ha detto? contro gli amici", icon: '👑' });
    logEvent('quiz', `alla sfida di "Chi l'ha detto?": ${r && r.summary ? r.summary : c + ' risposte giuste'}`);
    sfx(won ? 'clear' : 'gameover');
    renderBattle();
  }
  function battleClosed() {
    const b = B; B = null; if (!b) return;
    clearInterval(b.timer); ov.$('.qz').classList.remove('bt');
    if (!(b.v && b.v.ph === 'end')) { try { window.__app && window.__app.world && window.__app.world.toast && window.__app.world.toast('Hai lasciato la sfida'); } catch (e) { } }
    try { b.s.leave(); } catch (e) { }
  }
  registerPartyGame('quiz', { name: "Chi l'ha detto? Sfida", icon: '❓', desc: 'stesse domande per tutti, vince chi è giusto e veloce', min: 1, max: 8, opts: { n: 10 },
    attach: s => battle(s) });

  return {
    open(onDone) { ensure(); if (B) battleClosed(); ov.$('.qz').classList.remove('bt'); ov.onDone = onDone || null; ov.open(); begin(); return true; },
    close() { ov && ov.close(); },
    battle, battleBots,
    get isOpen() { return !!(ov && ov.isOpen); },
  };
}

// quiz table at the Celtic: anchor 'celtic_quiz' (own little table there) or, with the quartiere's Celtic, a quiz card on
// its table by the window (celtic anchor + (3.0, 4.3), top at 0.765 m). No Celtic → no table (cabinet + phone/menu remain).
export function quizTablePlugin(M, quiz) {
  return (ctx, W, H) => {
    const own = anchor(ctx.level, 'celtic_quiz', { pos: V(0, 0, 0) });
    const cel = anchor(ctx.level, 'celtic', { pos: V(0, 0, 0) });
    if (!own.real && !cel.real) return { items: [] };
    const { goTo, setMode, toast } = H;
    const g = new THREE.Group(); ctx.scene.add(g);
    let topY = 0.765, yaw;
    if (own.real) {
      g.position.copy(own.pos).setY(0); g.rotation.y = own.yaw || 0; yaw = own.yaw || 0;
      const wood = new THREE.MeshStandardMaterial({ color: 0x3a2414, roughness: 0.55 });
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 24), wood); top.position.y = 0.74; top.castShadow = top.receiveShadow = true; g.add(top);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.72, 10), wood); leg.position.y = 0.36; g.add(leg);
      if (W.boxes) W.boxes.push({ id: 'mg-quiztable', min: V(own.pos.x - 0.42, 0, own.pos.z - 0.42), max: V(own.pos.x + 0.42, 0, own.pos.z + 0.42) });
    } else { g.position.copy(cel.pos).add(V(3.0, 0, 4.3)).setY(0); yaw = Math.PI / 2; }
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.16), new THREE.MeshBasicMaterial({ map: signTex("CHI L'HA DETTO?", { w: 512, h: 256, bg: '#2a0b2a', fg: '#ffd040', font: '900 64px Impact, sans-serif' }), side: THREE.DoubleSide, toneMapped: false }));
    card.position.set(0, topY + 0.1, 0); g.add(card);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.06), new THREE.MeshStandardMaterial({ color: 0x111111 })); foot.position.set(0, topY + 0.01, 0); g.add(foot);
    const f = V(Math.sin(yaw), 0, Math.cos(yaw));
    const stand = g.position.clone().addScaledVector(f, -0.85).setY(0);
    let t = 0;
    return {
      items: [{ id: 'mg-quiztable', label: () => "Quiz al tavolo: Chi l'ha detto?", anchor: () => stand, top: () => g.localToWorld(V(0, 1.05, 0)), range: 1.1,
        act: () => { if (W.carry) { toast('Prima posa l\'estintore'); return; } goTo(stand.clone(), yaw, () => { setMode('mg_quiz'); }); } }],
      owns: m => m === 'mg_quiz',
      update() {
        if (W.t > 0.3 && !W.m.opened) { W.m.opened = true; quiz.open(() => { if (W.mode === 'mg_quiz') setMode('standup'); }); }
        return { crouchT: 0.4, lookW: 1, lookAt: g.localToWorld(V(0, 0.8, 0)) };
      },
      tick(dt) { t += dt; card.rotation.y = Math.sin(t * 0.8) * 0.4; },
    };
  };
}
