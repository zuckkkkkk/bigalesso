// "Processo AI": a mock trial in the Gulag courtroom (prosecutor's table; anchor 'tribunale' overrides).
// Pick a (silly) accusation from the group's lore and a side, argue for 3 rounds (choices or your own words),
// the AI judge gives the verdict and a goliardic sentence. Offline: scripted opponent + score-based verdict.
import * as THREE from 'three';
import { V, rnd, pick, shuffle, clamp, persona, personas, catchphrase, ask, SAFE, clean, esc, createOverlay, unlock, phone, logEvent, anchor } from './shared.js';

// light, harmless accusations (running jokes of the group; nothing criminal about real people)
const CHARGES = {
  cesco: ['Latitanza in chat: da una settimana è "Ma chi è?"', 'Organizzazione abusiva di Bellazzi del lunedì'],
  asche: ['Aver fatto laggare WhatsApp con 400 messaggi in un\'ora', 'Uso reiterato di "discors" invece di "discord"'],
  seghino: ['Rinomina del gruppo senza autorizzazione', 'Zombata convocata alle 2 di notte'],
  lombu: ['"10 min" durati un\'ora e mezza', 'Aver chiuso per primo in tutti i game'],
  zuck: ['Compettina proposta alle 23:59 di un martedì', 'Approvazione di tutto senza leggere'],
  parme: ['Abuso della parola "greve"', 'Pigrizia aggravata nel rispondere ai piani'],
  ashish: ['"Giuro che arrivo": mai arrivato', 'Urla in maiuscolo durante la compe'],
  forla: ['"No puedo" seriale', 'Aver comprato il terzo monitor dell\'anno'],
  ciccio: ['Precisazioni non richieste sul Corriere', 'Commento live a orari improbabili'],
  ricky: ['Messaggi troppo lunghi e troppo ordinati', 'Domande sui piani prima che esistano i piani'],
  jacopo: ['Sempre in viaggio, mai al Celtic', 'Saluto ✌🏼 come unica risposta'],
  mirco: ['Troppe domande su Tortellino Man', 'Aver chiesto l\'edizione 312 che non esiste'],
};
const CHOICES = {
  accusa: [
    { t: 'Mostro lo screenshot della chat come prova', s: 3 }, { t: 'Chiamo un testimone a sorpresa: il bot del gruppo', s: 2 },
    { t: 'Faccio leva sui precedenti dell\'imputato', s: 2 }, { t: 'Grido "OBIEZIONE!" senza motivo', s: 1 },
    { t: 'Cito il Corriere delle Due Torri come fonte', s: 2 }, { t: 'Chiedo alla giuria: "ma vi pare normale?"', s: 1 },
  ],
  difesa: [
    { t: 'Lo screenshot è decontestualizzato', s: 3 }, { t: 'Il mio assistito era su Discord, ho i log', s: 2 },
    { t: 'Invoco il diritto alla compettina', s: 2 }, { t: 'Piango davanti alla giuria', s: 1 },
    { t: 'Tutti nel gruppo l\'hanno fatto almeno una volta', s: 2 }, { t: 'Propongo un patteggiamento in birrette', s: 1 },
  ],
};
const PENE = ['offrire le birrette al prossimo Celtic', 'una settimana senza compettine', 'scrivere "discord" correttamente cento volte', 'pagare il sushi a tutti', 'fare da autista il sabato al Millennium', 'leggere ad alta voce tutto il Corriere', 'tre anni di… zombate obbligatorie', 'cambiare foto profilo del gruppo per un mese'];
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
#mg-proc .pick{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}`;

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
      ov = createOverlay('mg-proc', `<div class="pr"><div class="hd"><span class="live">IN ONDA</span><b>Il Processo del Secolo</b><span class="c"></span></div><div class="tr"></div><div class="ft"></div></div>`, { input, onClose: () => { P = null; if (W.mode === 'mg_processo') setMode('standup'); } });
      const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s);
      return ov;
    }
    const nm = id => id === 'me' ? 'Tu' : id === 'judge' ? '⚖️ Il Giudice' : (persona(id).emoji || '') + ' ' + persona(id).name;
    function line(who, text, cls = '') {
      const el = document.createElement('div'); el.className = 'ln ' + cls;
      const color = who === 'me' ? '#4aa3ff' : who === 'judge' ? '#ff6050' : (persona(who).color || '#e2c271');
      el.innerHTML = `<div class="who" style="color:${esc(color)}">${esc(nm(who))}</div><div class="tx">${esc(text)}</div>`;
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
      const off = () => `${(P.role === 'accusa') === offWin ? 'COLPEVOLE' : 'INNOCENTE'}\n${offWin ? 'La corte trova più convincenti i tuoi argomenti' : 'La controparte è stata più convincente'}, e il Corriere ne darà notizia in prima pagina.\nPena: ${pick(PENE)}`;
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
    function open() { ensure(); ov.open(); menu(); return true; }
    W.mgOpen = W.mgOpen || {}; W.mgOpen.processo = () => open();
    return {
      items: [{ id: 'mg-processo', label: () => 'Processo AI: porta un amico alla sbarra', anchor: () => stand, top: () => topP, range: 1.0,
        act: () => { if (W.carry) { toast('Prima posa l\'estintore'); return; } goTo(stand.clone(), yaw, () => setMode('mg_processo')); } }],
      owns: m => m === 'mg_processo',
      update() { if (W.t > 0.3 && !W.m.opened) { W.m.opened = true; open(); } return { lookW: 1, lookAt: topP }; },
    };
  };
}
