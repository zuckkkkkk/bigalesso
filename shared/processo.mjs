// shared/processo.mjs — "Il Processo del Secolo" as a party game (rules, see shared/README.md). The players get the roles:
// Pubblico Ministero (accusa), Avvocato (difesa), Imputato (plays the accused friend of the group, defends himself) and
// Giurati. They vote the case, argue for 3 rounds (one of the offered lines or their own words, timed turns), the jury
// votes, then the AI JUDGE rules (the referee asks it: game.aiRequest()/aiResult(), server/ai.mjs; offline / no key:
// the jury's majority, then the arguments' strength). Bots fill missing roles and speak with the offered lines.
// opts: { rounds: 2..3 (default 3), turn: 20..60 s (default 45) }
// Actions: { case: i } vote the case · { say: 'text' } or { choice: i } my argument (my turn only) ·
//          { vote: 'colpevole'|'innocente' } (jurors, jury phase)
// view(id): { ph:'case'|'arg'|'jury'|'verdict'|'end', left, me, role, roles:[{ id, name, role, bot }], cases, case,
//   round, rounds, turn:{ id, role }, choices (my turn), log:[{ id, role, text }], jury:{ n, voted, mine }, verdict }
import { rng } from './rng.mjs';

export const meta = { type: 'processo', name: 'Il Processo del Secolo', minPlayers: 2, maxPlayers: 6, tickHz: 2, dropIn: false };
// light, harmless accusations (running jokes of the group; nothing criminal about real people) — also src/minigames/processo.js
export const CHARGES = {
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
export const NAMES = { cesco: 'Cesco', asche: 'Asche', seghino: 'Seghino', lombu: 'Lombu', zuck: 'Zuck', parme: 'Parme', ashish: 'Ashish', forla: 'Forla', ciccio: 'Ciccio', ricky: 'Ricky Catta', jacopo: 'Jacopo', mirco: 'Mirco' };
export const CHOICES = {
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
  imputato: [
    { t: 'Vostro onore, sono innocente: chiedete in chat', s: 2 }, { t: 'Ho un alibi: ero al Celtic, c\'è lo scontrino', s: 3 },
    { t: 'È tutta una montatura del Corriere', s: 2 }, { t: 'Non ricordo, ero in compettina', s: 1 },
    { t: 'Lo rifarei, e offro le birrette a tutti', s: 1 }, { t: 'Chiedo scusa al gruppo, ma solo un po\'', s: 2 },
  ],
};
export const PENE = ['offrire le birrette al prossimo Celtic', 'una settimana senza compettine', 'scrivere "discord" correttamente cento volte', 'pagare il sushi a tutti', 'fare da autista il sabato al Millennium', 'leggere ad alta voce tutto il Corriere', 'tre anni di… zombate obbligatorie', 'cambiare foto profilo del gruppo per un mese'];
export const ROLE_NAME = { pm: 'Pubblico Ministero', difesa: 'Avvocato difensore', imputato: 'Imputato', giurato: 'Giurato' };
const ROLE_ORDER = ['pm', 'difesa', 'imputato', 'giurato', 'giurato', 'giurato'];
const SIDE = { pm: 'accusa', difesa: 'difesa', imputato: 'imputato' };
const CASE_T = 20, JURY_T = 25, AI_T = 25, END_T = 0;
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
export const strength = t => Math.max(1, Math.min(3, t.length / 45)) + (/prov|scree|testimon|chat|corriere|log|alibi|scontrin/i.test(t) ? 0.6 : 0);
// "COLPEVOLE|INNOCENTE \n motivazione \n Pena: …" → { guilty, mot, pena } | null
export function parseVerdict(raw) {
  const lines = String(raw || '').split('\n').map(s => s.trim()).filter(Boolean);
  const head = (lines[0] || '').replace(/[*_#]/g, '');
  if (!/colpevole|innocente/i.test(head)) return null;
  const guilty = /colpevole/i.test(head) && !/non colpevole|innocente/i.test(head);
  const mot = clean(lines.slice(1).filter(l => !/^pena/i.test(l)).join(' ').replace(/[*_#]/g, ''), 300) || 'La corte ha deciso.';
  const pl = lines.find(l => /^pena/i.test(l));
  const pena = pl ? clean(pl.replace(/^pena\s*:?\s*/i, ''), 120) : '';
  return { guilty, mot, pena };
}

export function create({ players = [], opts = {}, seed = 1 } = {}) {
  const R = rng(seed);
  const rounds = Math.max(2, Math.min(3, (opts.rounds | 0) || 3)), turnT = Math.max(20, Math.min(60, +opts.turn || 45));
  const humans = R.shuffle(players.filter(p => !p.bot).slice()), bots = players.filter(p => p.bot);
  const order = [...humans, ...bots].slice(0, 6);
  const P = order.map((p, i) => ({ id: p.id, name: clean(p.name, 16) || 'Giocatore', bot: !!p.bot, role: ROLE_ORDER[i], gone: false, vote: null, caseVote: -1 }));
  const byId = new Map(P.map(p => [p.id, p]));
  const speakers = ROLE_ORDER.slice(0, 3).filter(r => P.some(p => p.role === r));
  const ids = Object.keys(CHARGES);
  const cases = R.shuffle(ids.slice()).slice(0, 3).map(w => ({ who: w, charge: CHARGES[w][R.int(CHARGES[w].length)] }));
  const S = { ph: 'case', t: 0, round: 1, turnI: 0, log: [], kase: null, verdict: null, over: null, ev: [], aiId: 0, aiAsked: false, aiDone: false, used: {} };
  const push = e => { if (S.ev.length < 40) S.ev.push(e); };
  const speakerRole = () => speakers[S.turnI];
  const speaker = () => P.find(p => p.role === speakerRole());
  const jurors = () => P.filter(p => p.role === 'giurato' && !p.gone);
  function choicesFor(role) {
    const side = SIDE[role]; const all = CHOICES[side] || [];
    const used = S.used[role] || [];
    const fresh = all.map((c, i) => ({ ...c, i })).filter(c => !used.includes(c.i));
    // deterministic 3 options per turn
    const rr = rng((seed ^ (S.round * 977) ^ (S.turnI * 131)) >>> 0);
    return rr.shuffle(fresh.length >= 3 ? fresh : all.map((c, i) => ({ ...c, i }))).slice(0, 3);
  }
  let curChoices = null;
  function startCase() {
    let best = 0; const counts = cases.map((_, i) => P.filter(p => p.caseVote === i).length);
    const top = Math.max(...counts), tied = counts.map((c, i) => c === top ? i : -1).filter(i => i >= 0); best = tied[R.int(tied.length)];
    S.kase = cases[best]; S.ph = 'arg'; S.t = 0; S.round = 1; S.turnI = 0; curChoices = choicesFor(speakerRole());
    push({ k: 'case', who: S.kase.who, charge: S.kase.charge });
  }
  function speak(p, text, s) {
    S.log.push({ id: p.id, role: p.role, text, s });
    push({ k: 'say', id: p.id, role: p.role });
    nextTurn();
  }
  function nextTurn() {
    S.t = 0; S.turnI++;
    if (S.turnI >= speakers.length) { S.turnI = 0; S.round++; }
    if (S.round > rounds) { S.ph = 'jury'; S.t = 0; curChoices = null; push({ k: 'jury' }); return; }
    curChoices = choicesFor(speakerRole());
  }
  function autoSpeak() { // bot or timeout: one of the offered lines (seeded)
    const p = speaker(); const c = curChoices[R.int(curChoices.length)];
    (S.used[p.role] = S.used[p.role] || []).push(c.i);
    speak(p, p.bot ? c.t : c.t + ' (fuori tempo)', p.bot ? c.s + R.next() - 0.5 : Math.max(0.5, c.s - 1));
  }
  const sideScore = side => S.log.filter(l => (side === 'accusa' ? l.role === 'pm' : l.role !== 'pm')).reduce((a, l) => a + l.s, 0) / (side === 'accusa' ? 1 : Math.max(1, speakers.length - 1));
  function juryCount() {
    const js = jurors(), c = { colpevole: 0, innocente: 0, bots: 0 };
    for (const j of js) if (j.vote) c[j.vote]++;
    if (!js.length) { // popular jury: three bots, swayed by the arguments
      const acc = sideScore('accusa'), dif = sideScore('difesa');
      for (let i = 0; i < 3; i++) { c[(acc + (R.next() - 0.5) * 2.4 > dif) ? 'colpevole' : 'innocente']++; c.bots++; }
    }
    return c;
  }
  function closeJury() {
    for (const j of jurors()) if (!j.vote) { if (j.bot) { const acc = sideScore('accusa'), dif = sideScore('difesa'); j.vote = acc + (R.next() - 0.5) * 2 > dif ? 'colpevole' : 'innocente'; } }
    S.jury = juryCount();
    S.ph = 'verdict'; S.t = 0; S.aiId++; S.aiAsked = false; S.aiDone = false;
    push({ k: 'verdict', jury: S.jury });
  }
  function fallbackVerdict() {
    const j = S.jury, acc = sideScore('accusa'), dif = sideScore('difesa');
    const guilty = j.colpevole !== j.innocente ? j.colpevole > j.innocente : acc >= dif;
    const pena = PENE[R.int(PENE.length)];
    const mot = guilty ? `La giuria ha parlato (${j.colpevole} a ${j.innocente}) e l'accusa è stata più convincente: il Corriere ne darà notizia in prima pagina.`
      : `La giuria ha parlato (${j.innocente} a ${j.colpevole}) e la difesa ha smontato tutto: l'imputato esce a testa alta.`;
    return { guilty, mot, pena: guilty ? pena : '', ai: false };
  }
  function decide(v) {
    S.verdict = { ...v, jury: S.jury };
    const winSide = v.guilty ? ['pm'] : ['difesa', 'imputato'];
    const scores = {}, winners = [];
    for (const p of P) {
      let sc = 30;
      if (winSide.includes(p.role)) { sc = 100; winners.push(p.id); }
      if (p.role === 'giurato' && p.vote) { if ((p.vote === 'colpevole') === v.guilty) { sc = 60; winners.push(p.id); } }
      scores[p.id] = sc;
    }
    S.ph = 'end'; S.t = 0;
    S.over = { winners, scores, guilty: v.guilty, summary: (v.guilty ? 'COLPEVOLE' : 'INNOCENTE') + ': ' + NAMES[S.kase.who] + (v.guilty && v.pena ? ' — pena: ' + v.pena : ''), verdict: S.verdict };
    push({ k: 'end', guilty: v.guilty });
  }
  const game = {
    act(id, a) {
      const p = byId.get(id); if (!p || p.gone) return { ok: false, error: 'non sei in aula' };
      if (!a || typeof a !== 'object') return { ok: false, error: 'azione' };
      if (a.case !== undefined) {
        if (S.ph !== 'case') return { ok: false, error: 'il caso è già scelto' };
        const i = a.case | 0; if (i < 0 || i >= cases.length) return { ok: false, error: 'caso' };
        p.caseVote = i; push({ k: 'cvote', id });
        if (P.filter(x => !x.bot && !x.gone).every(x => x.caseVote >= 0)) startCase();
        return { ok: true };
      }
      if (a.say !== undefined || a.choice !== undefined) {
        if (S.ph !== 'arg') return { ok: false, error: 'non è il momento delle arringhe' };
        if (speaker() !== p) return { ok: false, error: 'non tocca a te' };
        if (a.choice !== undefined) {
          const c = curChoices[a.choice | 0]; if (!c) return { ok: false, error: 'scelta' };
          (S.used[p.role] = S.used[p.role] || []).push(c.i);
          speak(p, c.t, c.s + (R.next() - 0.5) * 1.2);
        } else {
          const t = clean(a.say, 220); if (t.length < 3) return { ok: false, error: 'scrivi almeno qualche parola' };
          speak(p, t, strength(t) + (R.next() - 0.5) * 0.8);
        }
        return { ok: true };
      }
      if (a.vote !== undefined) {
        if (S.ph !== 'jury') return { ok: false, error: 'la giuria non vota adesso' };
        if (p.role !== 'giurato') return { ok: false, error: 'solo i giurati votano' };
        if (a.vote !== 'colpevole' && a.vote !== 'innocente') return { ok: false, error: 'voto' };
        if (p.vote) return { ok: false, error: 'hai già votato' };
        p.vote = a.vote; push({ k: 'jvote', id });
        if (jurors().filter(j => !j.bot).every(j => j.vote)) closeJury();
        return { ok: true };
      }
      return { ok: false, error: 'azione sconosciuta' };
    },
    tick(dt) {
      if (S.over) return;
      S.t += dt;
      if (S.ph === 'case') { if (S.t >= CASE_T || !P.some(p => !p.bot && !p.gone)) startCase(); return; }
      if (S.ph === 'arg') { const sp = speaker(); if (sp.bot || sp.gone ? S.t >= 2.5 : S.t >= turnT) autoSpeak(); return; }
      if (S.ph === 'jury') { const hj = jurors().filter(j => !j.bot); if (S.t >= JURY_T || !hj.length || hj.every(j => j.vote)) closeJury(); return; }
      if (S.ph === 'verdict' && !S.aiDone && S.t >= AI_T) { S.aiDone = true; decide(fallbackVerdict()); }
    },
    // the referee asks the AI judge once per trial (server/match.mjs or src/net/match.js)
    aiRequest() {
      if (S.ph !== 'verdict' || S.aiAsked || S.aiDone) return null;
      S.aiAsked = true;
      const nm = id => { const p = byId.get(id); return p ? p.name : '?'; };
      const hist = S.log.map(l => `${ROLE_NAME[l.role].toUpperCase()} (${nm(l.id)}): ${l.text}`).join('\n');
      const j = S.jury;
      return { id: S.aiId, model: 'smart', maxTokens: 180,
        system: 'Sei il Giudice del "Processo del Secolo", tribunale goliardico del Gulag sotto la casa, in un gruppo di amici. Valuta con ironia gli argomenti di accusa, difesa e imputato e tieni conto del voto della giuria, poi decidi. Formato ESATTO su tre righe:\nCOLPEVOLE oppure INNOCENTE\nmotivazione (max 35 parole, divertente, cita un argomento)\nPena: una pena goliardica innocua (max 12 parole)\nTono comico e affettuoso: niente insulti pesanti, niente bestemmie, niente contenuti sessuali o discriminatori, niente fatti gravi veri sulle persone. Rispondi in italiano.',
        prompt: `Imputato: ${NAMES[S.kase.who]}. Capo d'accusa: ${S.kase.charge}.\n${hist}\nGiuria: ${j.colpevole} per colpevole, ${j.innocente} per innocente.` };
    },
    aiResult(id, text) {
      if (id !== S.aiId || S.aiDone || S.ph !== 'verdict') return;
      S.aiDone = true;
      const v = text ? parseVerdict(text) : null;
      decide(v ? { ...v, pena: v.guilty ? (v.pena || PENE[R.int(PENE.length)]) : '', ai: true } : fallbackVerdict());
    },
    view(id) {
      const p = byId.get(id), sp = S.ph === 'arg' ? speaker() : null;
      const left = S.ph === 'case' ? CASE_T - S.t : S.ph === 'arg' ? (sp && sp.bot ? 0 : turnT - S.t) : S.ph === 'jury' ? JURY_T - S.t : S.ph === 'verdict' ? AI_T - S.t : END_T;
      return {
        ph: S.ph, left: Math.max(0, Math.round(left)), me: id, role: p ? p.role : null,
        roles: P.map(x => ({ id: x.id, name: x.name, role: x.role, bot: x.bot, gone: x.gone })),
        cases: S.ph === 'case' ? cases.map((c, i) => ({ ...c, name: NAMES[c.who], votes: P.filter(x => x.caseVote === i).length })) : null,
        mycase: p ? p.caseVote : -1,
        case: S.kase ? { ...S.kase, name: NAMES[S.kase.who] } : null,
        round: Math.min(S.round, rounds), rounds,
        turn: sp ? { id: sp.id, role: sp.role } : null,
        choices: sp && sp === p && curChoices ? curChoices.map(c => c.t) : null,
        log: S.log.map(l => ({ id: l.id, role: l.role, text: l.text })),
        jury: S.ph === 'jury' || S.ph === 'verdict' || S.ph === 'end' ? { n: jurors().length, voted: jurors().filter(j => j.vote).length, mine: p && p.role === 'giurato' ? p.vote : null, count: S.ph !== 'jury' ? S.jury : null } : null,
        verdict: S.verdict,
      };
    },
    drain() { const e = S.ev; S.ev = []; return e; },
    leave(id) { const p = byId.get(id); if (p) { p.gone = true; p.bot = true; } }, // a bot speaks with the offered lines instead
    get over() { return S.over; },
    _state: S, _P: P,
  };
  return game;
}
