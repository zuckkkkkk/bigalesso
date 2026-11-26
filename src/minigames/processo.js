// "Processo AI": a mock trial in the Gulag courtroom (prosecutor's table; anchor 'tribunale' overrides).
// Pick a (silly) accusation from the group's lore and a side, argue for 3 rounds (choices or your own words),
// the AI judge gives the verdict and a goliardic sentence. Offline: scripted opponent + score-based verdict.
// Party game (O → Gioca insieme → ⚖️, rules shared/processo.mjs, 2–6 players): roles PM / Avvocato / Imputato / Giurati
// among the friends, case vote, timed turns, jury vote, then the AI judge (asked by the server referee) rules.
import * as THREE from 'three';
import { V, rnd, pick, shuffle, clamp, persona, personas, catchphrase, ask, SAFE, clean, esc, createOverlay, unlock, phone, logEvent, anchor, banterPool } from './shared.js';
import { CHARGES as SHARED_CHARGES, CHOICES as SHARED_CHOICES, ROLE_NAME } from '../../shared/processo.mjs';
import { registerPartyGame } from '../net/party.js';

// light, harmless accusations (running jokes of the group; nothing criminal about real people): shared/processo.mjs
const CHARGES = SHARED_CHARGES;
const CHOICES = { accusa: SHARED_CHOICES.accusa, difesa: SHARED_CHOICES.difesa };
const PENE_BASE = ['offrire le birrette al prossimo Celtic', 'una settimana senza compettine', 'scrivere "discord" correttamente cento volte', 'pagare il sushi a tutti', 'fare da autista il sabato al Millennium', 'leggere ad alta voce tutto il Corriere', 'tre anni di… zombate obbligatorie', 'cambiare foto profilo del gruppo per un mese'];
const PENE = [...PENE_BASE, ...banterPool('processo_pene')];
const VERDETTI = banterPool('processo_verdetti');
const CSS = `
#mg-proc .pr{position:relative;margin:auto;width:min(980px,94vw);height:min(660px,88vh);display:grid;grid-template-rows:auto 1fr auto;background:#120c08;border:1px solid #5a4020;border-radius:14px;overflow:hidden;box-shadow:0 30px 90px rgba(0,0,0,.65);font:15px/1.45 Georgia,"Times New Roman",serif;color:#f1e6d0}
#mg-proc .hd{display:flex;align-items:center;gap:12px;padding:12px 18px;background:linear-gradient(90deg,#3a0a0a,#1a0c08);border-bottom:1px solid #5a4020}
#mg-proc .live{background:#e01818;color:#fff;font:800 12px system-ui;padding:3px 8px;border-radius:4px;letter-spacing:.08em;animation:mgLive 1.2s infinite}
@keyframes mgLive{50%{opacity:.55}}
#mg-proc .hd b{font:700 20px Georgia;color:#e2c271}#mg-proc .hd span.c{margin-left:auto;font:600 13px system-ui;color:#c9b38a}
#mg-proc .tr{overflow:auto;padding:16px 20px;display:flex;flex-direction:column;gap:12px}
#mg-proc .ln{display:flex;gap:10px;animation:mgIn .25s}
#mg-proc .ln .who{flex:none;width:150px;font:700 13px system-ui;text-align:right;padding-top:3px}
#mg-proc .ln .tx{background:rgba(255,240,210,.06);border-left:3px solid #e2c271;padding:7px 12px;border-radius:4px}
#mg-proc .ln.me .tx{border-left-color:#4aa3ff}#mg-proc .ln.judge .tx{border-left-color:#e01818;background:rgba(224,24,24,.08);font-size:17px}
#mg-proc .ft{padding:14px 18px;border-top:1px solid #3a2a14;background:#0c0806;display:flex;flex-direction:column;gap:10px}
#mg-proc .ch{display:grid;grid-template-columns:1fr 1fr;gap:8px}
#mg-proc .ch button,#mg-proc .ft button{font:600 14px system-ui}
#mg-proc .row{display:flex;gap:8px}#mg-proc input{flex:1;font:15px system-ui;padding:10px 12px;border-radius:8px;border:1px solid #5a4020;background:#1a120c;color:#fff;outline:none}
#mg-proc .verdict{font:900 46px/1 Impact,"Arial Black",system-ui;letter-spacing:.04em;text-align:center;margin:4px 0}
#mg-proc .pick{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
#mg-proc .roles{display:flex;flex-wrap:wrap;gap:6px;font:600 12px system-ui}#mg-proc .roles span{padding:3px 8px;border-radius:999px;background:rgba(255,240,210,.08)}#mg-proc .roles span.me{outline:1px solid #4aa3ff}
#mg-proc .wait{color:#c9b38a;font:600 14px system-ui}#mg-proc .ln.sys .tx{border-left-color:#888;font-style:italic;color:#d8cdb6}`;

export function processoPlugin(M) {
  return (ctx, W, H) => {
    const { goTo, setMode, toast } = H;
    const { audio, input } = ctx;
    // prosecutor's table in the Gulag courtroom (gulag.js: table(36.9, 8.0)); 'tribunale' anchor wins
    const A = anchor(ctx.level, 'tribunale', { pos: V(35.85, 0, 8.0), yaw: Math.PI / 2 });
    const yaw = A.yaw ?? Math.PI / 2;
    const stand = A.pos.clone(); stand.y = 0;
    const f = V(Math.sin(yaw), 0, Math.cos(yaw));
    const topP = stand.clone().addScaledVector(f, 1.05).add(V(0, 1.05, 0));
    let ov = null, P = null;
    const sfx = n => { try { audio.ctx && audio.sfx(n); } catch (e) { } };
    function ensure() {
      if (ov) return ov;
      ov = createOverlay('mg-proc', `<div class="pr"><div class="hd"><span class="live">IN ONDA</span><b>Il Processo del Secolo</b><span class="c"></span></div><div class="tr"></div><div class="ft"></div></div>`, { input, onKey: e => { if (!PS) return; const k = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code]; if (k !== undefined) { e.preventDefault(); partyKey(k); } }, onClose: () => { P = null; if (PS) partyClosed(); if (W.mode === 'mg_processo') setMode('standup'); } });
      const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s);
      return ov;
    }
    const nm = id => id === 'me' ? 'Tu' : id === 'judge' ? '⚖️ Il Giudice' : (persona(id).emoji || '') + ' ' + persona(id).name;
    function line(who, text, cls = '') {
      const el = document.createElement('div'); el.className = 'ln ' + cls;
      const color = who === 'me' ? '#4aa3ff' : who === 'judge' ? '#ff6050' : (persona(who).color || '#e2c271');
      el.innerHTML = `<div class="who" style="color:${esc(color)}">${esc(who === 'sys' ? '📢 Cancelleria' : nm(who))}</div><div class="tx">${esc(text)}</div>`;
      const tr = ov.$('.tr'); tr.appendChild(el); tr.scrollTop = tr.scrollHeight; return el;
    }
    function thinking(who) { const el = line(who, '…'); el.querySelector('.tx').innerHTML = '<span class="mg-dots"><span>●</span><span>●</span><span>●</span></span>'; return el; }
    function setFoot(html) { ov.$('.ft').innerHTML = html; }
    // ---- step 1: pick the case
    function menu() {
      const have = new Set(personas().map(p => p.id));
      const cases = shuffle(Object.entries(CHARGES).filter(([id]) => have.has(id))).slice(0, 4).map(([id, list]) => ({ id, charge: pick(list) }));
      ov.$('.tr').innerHTML = ''; ov.$('.c').textContent = 'Scegli il caso';
      line('judge', 'Silenzio in aula! Oggi la corte giudica uno di questi casi. Scegli l\'imputato.', 'judge');
      setFoot(`<div class="pick">${cases.map((c, i) => `<button class="mg-b" data-i="${i}">${esc((persona(c.id).emoji || '') + ' ' + persona(c.id).name)} — ${esc(c.charge)}</button>`).join('')}</div>`);
      ov.$$('.pick button').forEach(b => b.onclick = () => side(cases[+b.dataset.i]));
    }
    // ---- step 2: side
    function side(c) {
      P = { ...c, round: 0, args: [], score: 0, opp: null };
      line('judge', `Si apre il processo contro ${persona(c.id).name}. Capo d'accusa: «${c.charge}». Da che parte stai?`, 'judge');
      setFoot(`<div class="pick"><button class="mg-b acc">🧑‍⚖️ Accusa: è colpevole</button><button class="mg-b dif">🛡️ Difesa: è innocente</button></div>`);
      ov.$('.acc').onclick = () => go('accusa'); ov.$('.dif').onclick = () => go('difesa');
    }
    function go(role) {
      P.role = role;
      // the other side: the defendant defends himself; if you defend, the Corriere's director accuses
      P.opp = role === 'accusa' ? P.id : (P.id === 'ciccio' ? 'parme' : 'ciccio');
      sfx('dBell'); round();
    }
    // ---- step 3: three rounds
    async function oppSpeak() {
      const p = persona(P.opp), t = thinking(P.opp);
      const myRole = P.role === 'accusa' ? 'difesa' : 'accusa';
      const hist = P.args.map(a => `${a.who === 'me' ? (P.role === 'accusa' ? 'Accusa' : 'Difesa') : (myRole === 'accusa' ? 'Accusa' : 'Difesa')}: ${a.text}`).join('\n');
      const off = () => P.opp === P.id
        ? pick([`Vostro onore, ${catchphrase(P.id)}. Sono innocente.`, `Ma quale ${P.charge.toLowerCase().slice(0, 30)}… è tutta propaganda.`, `Ho dei testimoni: chiedete in chat. ${catchphrase(P.id)}.`])
        : pick([`Vostro onore, il Corriere ha le prove: ${P.charge.toLowerCase()}.`, `Allora due precisazioni però: l'imputato è recidivo.`, `La difesa si arrampica sugli specchi. ${catchphrase(P.opp)}.`]);
      const txt = await ask({ model: 'fast', maxTokens: 90, persona: P.opp,
        system: `Sei ${p.name} in un processo goliardico tra amici ("Il Processo del Secolo" del Corriere delle Due Torri). Ruolo: ${myRole === 'accusa' ? 'pubblico ministero' : (P.opp === P.id ? 'imputato che si difende da solo' : 'avvocato difensore')}. Stile: ${p.tone}. Intercalari: ${(p.catchphrases || []).join(', ')}. Rispondi con UNA arringa breve (max 30 parole), ironica, in tema col capo d'accusa. ${SAFE}`,
        prompt: `Capo d'accusa contro ${persona(P.id).name}: ${P.charge}.\nScambi finora:\n${hist || '(apertura)'}\nTocca a te.` }, off, 9000);
      const s = clean(txt, 260); t.querySelector('.tx').textContent = s; P.args.push({ who: P.opp, text: s });
    }
    async function round() {
      P.round++; ov.$('.c').textContent = `Round ${P.round} di 3 · ${P.role === 'accusa' ? 'sei l\'accusa' : 'sei la difesa'}`;
      setFoot('<div style="color:#998">La parola alla controparte…</div>');
      await oppSpeak(); if (!P) return;
      const opts = shuffle(CHOICES[P.role]).slice(0, 3);
      setFoot(`<div class="ch">${opts.map((o, i) => `<button class="mg-b" data-i="${i}"><kbd>${i + 1}</kbd> ${esc(o.t)}</button>`).join('')}</div><div class="row"><input maxlength="220" placeholder="…oppure scrivi la tua arringa e premi Invio"><button class="mg-b send">Invia</button></div>`);
      const say = (text, s) => { if (!P || P.waiting === false) return; P.waiting = false; line('me', text, 'me'); P.args.push({ who: 'me', text }); P.score += s; sfx('paper'); setTimeout(() => (P && (P.round < 3 ? round() : verdict())), 600); };
      P.waiting = true;
      ov.$$('.ch button').forEach(b => b.onclick = () => { const o = opts[+b.dataset.i]; say(o.t, o.s + rnd(-0.6, 0.6)); });
      const inp = ov.$('input'); setTimeout(() => inp && inp.focus(), 50);
      const send = () => { const v = inp.value.trim(); if (v.length < 3) return; say(v, clamp(v.length / 45, 1, 3) + (/prov|scree|testimon|chat|corriere|log|alibi/i.test(v) ? 0.6 : 0) + rnd(-0.4, 0.4)); };
      inp.addEventListener('keydown', e => { if (e.code === 'Enter') { e.preventDefault(); send(); } else if (/^Digit[123]$/.test(e.code) && !inp.value) { e.preventDefault(); ov.$$('.ch button')[+e.code.slice(5) - 1].click(); } });
      ov.$('.send').onclick = send;
    }
    // ---- step 4: verdict
    async function verdict() {
      setFoot('<div style="color:#998">La corte si ritira…</div>'); ov.$('.c').textContent = 'Camera di consiglio';
      sfx('dBell');
      const t = thinking('judge'); t.classList.add('judge');
      const hist = P.args.map(a => `${a.who === 'me' ? (P.role === 'accusa' ? 'ACCUSA' : 'DIFESA') : (P.role === 'accusa' ? 'DIFESA' : 'ACCUSA')}: ${a.text}`).join('\n');
      const offWin = P.score + rnd(-1, 1) >= 6;
      const off = () => `${(P.role === 'accusa') === offWin ? 'COLPEVOLE' : 'INNOCENTE'}\n${VERDETTI.length && Math.random() < 0.6 ? pick(VERDETTI) : (offWin ? 'La corte trova più convincenti i tuoi argomenti, coglione fortunato' : 'La controparte è stata più convincente, che figura di merda')}, e il Corriere ne darà notizia in prima pagina.\nPena: ${pick(PENE)}`;
      const raw = await ask({ model: 'smart', maxTokens: 160,
        system: `Sei il Giudice del "Processo del Secolo", tribunale goliardico del Gulag sotto la casa, in un gruppo di amici. Valuta gli argomenti di accusa e difesa con ironia e decidi. Formato ESATTO su tre righe:\nCOLPEVOLE oppure INNOCENTE\nmotivazione (max 35 parole, divertente)\nPena: una pena goliardica innocua (max 12 parole)\n${SAFE}`,
        prompt: `Imputato: ${persona(P.id).name}. Capo d'accusa: ${P.charge}.\n${hist}` }, off, 12000);
      const lines = String(raw).split('\n').map(s => s.trim()).filter(Boolean);
      let guilty = /colpevole/i.test(lines[0] || '') && !/non colpevole|innocente/i.test(lines[0] || '');
      if (!/colpevole|innocente/i.test(lines[0] || '')) { const L2 = off().split('\n'); lines.splice(0, lines.length, ...L2); guilty = /COLPEVOLE/.test(L2[0]); }
      const mot = clean(lines.slice(1).filter(l => !/^pena/i.test(l)).join(' '), 300) || 'La corte ha deciso.';
      const pena = (lines.find(l => /^pena/i.test(l)) || ('Pena: ' + pick(PENE))).replace(/^pena\s*:?\s*/i, '');
      t.querySelector('.tx').innerHTML = `<div class="verdict" style="color:${guilty ? '#ff4030' : '#40d080'}">${guilty ? 'COLPEVOLE' : 'INNOCENTE'}</div>${esc(mot)}${guilty ? `<div style="margin-top:6px;color:#e2c271">Pena: ${esc(clean(pena, 90))}</div>` : ''}`;
      const won = (P.role === 'accusa') === guilty;
      sfx(won ? 'clear' : 'gameover'); if (guilty) sfx('dKO');
      unlock('processo_play', { title: 'Il Processo del Secolo', desc: 'Hai partecipato a un processo AI', icon: '⚖️' });
      if (won) unlock('processo_win', { title: 'Principe del foro', desc: 'Hai vinto un processo nel Gulag', icon: '🏛️' });
      logEvent('processo', `nel Processo del Secolo (${P.role}) contro ${persona(P.id).name}: ${guilty ? 'colpevole' : 'innocente'}${guilty ? ', pena: ' + clean(pena, 60) : ''}`);
      phone(P.id, guilty ? 'ricorro in appello. ' + catchphrase(P.id) : 'giustizia è fatta ' + catchphrase(P.id));
      setFoot(`<div class="row"><button class="mg-b again">Nuovo processo</button><button class="mg-b bye">Esci dall'aula (Esc)</button></div>`);
      ov.$('.again').onclick = () => menu(); ov.$('.bye').onclick = () => ov.close();
    }
    function open() { ensure(); if (PS) partyClosed(); ov.open(); menu(); return true; }
    // ---------------------------------------------------------------- party (shared/processo.mjs via window.__match)
    let PS = null;
    const RICON = { pm: '🧑‍⚖️', difesa: '🛡️', imputato: '🙋', giurato: '🗳️' };
    const rname = (v, id) => { const r = v.roles.find(x => x.id === id); return r ? r.name : '?'; };
    const rlabel = (v, id, role) => `${RICON[role] || ''} ${ROLE_NAME[role] || role} · ${rname(v, id)}${id === v.me ? ' (tu)' : ''}`;
    function partyOpen(s) {
      ensure(); P = null;
      if (PS && PS.s !== s) { try { PS.s.leave(); } catch (e) { } }
      PS = { s, v: null, logN: 0, fkey: '', intro: false, verdictShown: false, rewarded: false };
      s.on('view', v => { if (!PS || PS.s !== s) return; if (!ov.isOpen) { ov.open(); } if (!PS.v) { ov.$('.tr').innerHTML = ''; } PS.v = v; renderParty(); });
      s.on('event', e => { if (!PS || PS.s !== s || !e) return; if (e.k === 'case' || e.k === 'verdict') sfx('dBell'); else if (e.k === 'say') sfx('paper'); });
      s.on('over', r => { if (PS && PS.s === s) partyOver(r); });
      s.on('error', e => { if (!PS || PS.s !== s || !e) return; if (e.fatal) { line('judge', 'Collegamento perso con l\'aula: processo sospeso.', 'judge'); setFoot('<div class="row"><button class="mg-b bye">Esci dall\'aula (Esc)</button></div>'); ov.$('.bye').onclick = () => ov.close(); } else if (e.error) { const w = ov.$('.ft .wait'); if (w) w.textContent = e.error; } });
      return true;
    }
    function partyKey(k) {
      const v = PS && PS.v; if (!v) return;
      if (v.ph === 'case' && v.cases && v.cases[k]) PS.s.act({ case: k });
      else if (v.ph === 'arg' && v.choices && v.choices[k] !== undefined) PS.s.act({ choice: k });
      else if (v.ph === 'jury' && v.role === 'giurato' && !v.jury.mine && k < 2) PS.s.act({ vote: k === 0 ? 'colpevole' : 'innocente' });
    }
    function renderParty() {
      const v = PS.v;
      // header: phase + timer
      const sp = v.turn ? rlabel(v, v.turn.id, v.turn.role) : '';
      ov.$('.c').textContent = v.ph === 'case' ? `Scegli il caso · ${v.left} s` : v.ph === 'arg' ? `Round ${v.round} di ${v.rounds} · parla ${sp}${v.left ? ' · ' + v.left + ' s' : ''}` : v.ph === 'jury' ? `La giuria vota · ${v.left} s` : v.ph === 'verdict' ? 'Camera di consiglio' : 'Sentenza';
      // transcript (incremental)
      if (!PS.intro && v.case) {
        PS.intro = true;
        line('judge', `Silenzio in aula! Si apre il processo contro ${v.case.name}. Capo d'accusa: «${v.case.charge}».`, 'judge');
        line('sys', v.roles.map(r => `${RICON[r.role]} ${ROLE_NAME[r.role]}: ${r.name}${r.bot ? ' 🤖' : ''}${r.role === 'imputato' ? ' (nei panni di ' + v.case.name + ')' : ''}`).join(' · '), 'sys');
        const mine = v.roles.find(r => r.id === v.me); if (mine) line('sys', `Tu sei ${ROLE_NAME[mine.role]}${mine.role === 'imputato' ? ': difendi ' + v.case.name : mine.role === 'giurato' ? ': alla fine voti colpevole o innocente' : mine.role === 'pm' ? ': fallo condannare' : ': fallo assolvere'}.`, 'sys');
      }
      for (; PS.logN < v.log.length; PS.logN++) { const l = v.log[PS.logN]; const el = line(l.id, l.text, l.id === v.me ? 'me' : ''); el.querySelector('.who').textContent = rlabel(v, l.id, l.role); }
      if (v.ph === 'jury' && !PS.juryShown) { PS.juryShown = true; line('judge', 'Le arringhe sono finite. La giuria si esprima!', 'judge'); }
      if (v.ph === 'verdict' && !PS.thinking) { PS.thinking = thinking('judge'); PS.thinking.classList.add('judge'); const c = v.jury && v.jury.count; if (c) line('sys', `Voto della giuria${c.bots ? ' popolare' : ''}: ${c.colpevole} colpevole, ${c.innocente} innocente.`, 'sys'); }
      if (v.verdict && !PS.verdictShown) {
        PS.verdictShown = true; const vd = v.verdict, t = PS.thinking || (() => { const x = thinking('judge'); x.classList.add('judge'); return x; })();
        t.querySelector('.tx').innerHTML = `<div class="verdict" style="color:${vd.guilty ? '#ff4030' : '#40d080'}">${vd.guilty ? 'COLPEVOLE' : 'INNOCENTE'}</div>${esc(vd.mot)}${vd.guilty && vd.pena ? `<div style="margin-top:6px;color:#e2c271">Pena: ${esc(vd.pena)}</div>` : ''}<div style="margin-top:6px;font:12px system-ui;color:#998">${vd.ai ? 'Sentenza del giudice AI' : 'Il giudice AI non risponde: decide la giuria'}</div>`;
        sfx(vd.guilty ? 'dKO' : 'clear');
      }
      // footer (rebuilt only when it changes: keeps what you are typing)
      const myTurn = v.ph === 'arg' && v.turn && v.turn.id === v.me;
      const fkey = [v.ph, v.turn && v.turn.id, v.round, myTurn, v.mycase, v.cases && v.cases.map(c => c.votes).join(','), v.jury && v.jury.mine, v.jury && v.jury.voted, !!v.verdict].join('|');
      if (fkey === PS.fkey) { const w = ov.$('.ft .left'); if (w) w.textContent = v.left ? v.left + ' s' : '…'; return; }
      PS.fkey = fkey;
      if (v.ph === 'case') setFoot(`<div class="pick">${v.cases.map((c, i) => `<button class="mg-b ${v.mycase === i ? 'sel' : ''}" data-i="${i}"><kbd>${i + 1}</kbd> ${esc((persona(c.who).emoji || '') + ' ' + c.name)} — ${esc(c.charge)} <small>(${c.votes} ${c.votes === 1 ? 'voto' : 'voti'})</small></button>`).join('')}</div><div class="wait">Votate il caso: vince il più votato (pari: sorteggio).</div>`);
      else if (myTurn) {
        setFoot(`<div class="ch">${v.choices.map((t, i) => `<button class="mg-b" data-i="${i}"><kbd>${i + 1}</kbd> ${esc(t)}</button>`).join('')}</div><div class="row"><input maxlength="220" placeholder="…oppure scrivi la tua arringa e premi Invio"><button class="mg-b send">Invia</button></div><div class="wait">Tocca a te · <span class="left">${v.left} s</span></div>`);
        const inp = ov.$('input'); setTimeout(() => inp && inp.focus(), 50);
        const send = () => { const t = inp.value.trim(); if (t.length < 3) return; PS.s.act({ say: t }); inp.value = ''; };
        inp.addEventListener('keydown', e => { if (e.code === 'Enter') { e.preventDefault(); send(); } else if (/^Digit[123]$/.test(e.code) && !inp.value) { e.preventDefault(); partyKey(+e.code.slice(5) - 1); } });
        ov.$('.send').onclick = send;
      } else if (v.ph === 'arg') setFoot(`<div class="wait">Ascolta: parla ${esc(rlabel(v, v.turn.id, v.turn.role))} · <span class="left">${v.left ? v.left + ' s' : '…'}</span></div>`);
      else if (v.ph === 'jury') setFoot(v.role === 'giurato' && !v.jury.mine ? `<div class="pick"><button class="mg-b" data-i="0"><kbd>1</kbd> ⚖️ Colpevole</button><button class="mg-b" data-i="1"><kbd>2</kbd> 🕊️ Innocente</button></div><div class="wait">Sei in giuria: vota · <span class="left">${v.left} s</span></div>` : `<div class="wait">${v.jury.mine ? 'Hai votato ' + esc(v.jury.mine) + '. ' : ''}La giuria vota… (${v.jury.voted}/${v.jury.n || 0})</div>`);
      else if (v.ph === 'verdict') setFoot('<div class="wait">La corte si ritira…</div>');
      else setFoot(`<div class="wait">${esc(PS.reward || '')}</div><div class="row"><button class="mg-b bye">Esci dall'aula (Esc)</button></div>`);
      ov.$$('.ft [data-i]').forEach(b => b.onclick = () => partyKey(+b.dataset.i));
      const bye = ov.$('.bye'); if (bye) bye.onclick = () => ov.close();
    }
    function partyOver(r) {
      if (!PS || PS.rewarded) return; PS.rewarded = true;
      const v = PS.v, me = PS.s.me, won = !!(r && r.winners && r.winners.includes(me)), humans = v ? v.roles.filter(x => !x.bot).length : 1;
      const xp = won ? 60 : 25, euro = won && humans > 1 ? 10 : 0;
      try { const R = window.__rpg; if (R) { R.addXP && R.addXP(xp, 'Processo del Secolo'); euro && R.money && R.money.add && R.money.add(euro); } } catch (e) { }
      PS.reward = `${won ? 'Hai vinto la causa' : 'Causa persa'} · +${xp} XP${euro ? ' · +€ ' + euro : ''}`; PS.fkey = '';
      unlock('processo_play', { title: 'Il Processo del Secolo', desc: 'Hai partecipato a un processo AI', icon: '⚖️' });
      if (won && humans > 1) unlock('processo_party_win', { title: 'Foro di Teletubbylandia', desc: 'Hai vinto un processo contro gli amici', icon: '🏛️' });
      logEvent('processo', `nel Processo del Secolo con gli amici: ${r && r.summary ? r.summary : ''}`);
      renderParty();
    }
    function partyClosed() { const X = PS; PS = null; if (!X) return; try { X.s.leave(); } catch (e) { } }
    registerPartyGame('processo', { name: 'Processo del Secolo', icon: '⚖️', desc: 'PM, avvocato, imputato e giuria tra voi: decide il giudice AI', min: 2, max: 6, attach: s => partyOpen(s) });
    W.mgOpen = W.mgOpen || {}; W.mgOpen.processo = () => open();
    return {
      items: [{ id: 'mg-processo', label: () => 'Processo AI: porta un amico alla sbarra', anchor: () => stand, top: () => topP, range: 1.0,
        act: () => { if (W.carry) { toast('Prima posa l\'estintore'); return; } goTo(stand.clone(), yaw, () => setMode('mg_processo')); } }],
      owns: m => m === 'mg_processo',
      update() { if (W.t > 0.3 && !W.m.opened) { W.m.opened = true; open(); } return { lookW: 1, lookAt: topP }; },
    };
  };
}
