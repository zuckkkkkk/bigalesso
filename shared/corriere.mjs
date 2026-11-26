// shared/corriere.mjs — "Corriere del party": one special edition of "Il Corriere delle Due Torri" about the whole party's
// evening (rules, see shared/README.md). Every member sends the facts of his session (minigame results, records: the
// client's logEvent list) and votes the tone; after the collection the referee asks the AI newsroom once
// (aiRequest/aiResult, server/ai.mjs) and everyone gets the same front page (src/minigames/corriere.js draws it).
// No AI: a front page from the redazione's templates with the facts.
// opts: { secs: 8..30 collection time (default 15) }
// Actions: { facts: ['...', ...] } (≤ 8 × 120 chars) · { tone: 'cronaca'|'scandalo'|'sport'|'epico' }
// view(id): { ph:'collect'|'print'|'end', left, me, members:[{ id, name, n, tone, bot }], tone, ed }
import { rng } from './rng.mjs';

export const meta = { type: 'corriere', name: 'Corriere del party', minPlayers: 1, maxPlayers: 8, tickHz: 2, dropIn: false };
export const TONES = ['cronaca', 'scandalo', 'sport', 'epico'];
const KINDS = ['zombata', 'quiz', 'sushi', 'discord', 'processo', 'arcade'];
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const PRINT_T = 25;

export function fallbackEdition(facts, tone, names) {
  const all = facts.flatMap(f => f.list.map(t => ({ who: f.name, t })));
  const kindOf = t => /zombat/i.test(t) ? 'zombata' : /quiz|detto/i.test(t) ? 'quiz' : /sushi|piatt/i.test(t) ? 'sushi' : /discord|compettin/i.test(t) ? 'discord' : /processo|colpevole|innocente/i.test(t) ? 'processo' : 'arcade';
  const top = all[0] || null, kind = top ? kindOf(top.t) : 'arcade';
  const HL = { zombata: 'ZOMBATA DI GRUPPO, SI SOPRAVVIVE', quiz: 'QUIZ DEL GRUPPO, VERDETTO SHOCK', sushi: 'ALL YOU CAN EAT: PIATTI A PERDITA D\'OCCHIO', discord: 'COMPETTINA, IL VERDETTO DEL MOUSE', processo: 'PROCESSO DEL SECOLO: SENTENZA STORICA', arcade: 'SERATA MOVIMENTATA A TELETUBBYLANDIA' };
  const txt = all.length ? 'Il nostro inviato ha seguito la comitiva per tutta la serata: ' + all.slice(0, 6).map(x => x.who + ' ' + x.t).join('; ') + '. Fonti vicine al gruppo parlano di prestazioni «sgravate», la redazione invita alla prudenza.'
    : 'Nessun record, nessuna sentenza, nessuna zombata: la comitiva al completo e nessuna notizia. Un silenzio sospetto che la redazione intende approfondire, possibilmente davanti a un cabinato.';
  return { occhiello: tone === 'scandalo' ? 'Scandalo' : tone === 'sport' ? 'Sport' : tone === 'epico' ? 'Leggenda' : 'Cronaca', titolo: HL[kind], sommario: 'In edicola la serata di ' + names.join(', '), kind,
    didascalia: 'La comitiva, ricostruita dal nostro disegnatore', articoli: [{ titolo: 'Cronaca di una serata di gruppo', testo: txt }, { titolo: 'Il commento del direttore', testo: 'Allora, due precisazioni però. Primo: quello che è successo stasera resta tra noi e i lettori del Corriere. Secondo: chi contesta i risultati può presentare ricorso al Gulag, dove il giudice riceve su appuntamento e a stomaco pieno di sushi.' }],
    breve: 'Il bot del gruppo, interpellato, ha risposto con un messaggio troppo lungo per questa pagina.', ai: false };
}
export function parseEdition(raw, off) {
  try {
    const m = String(raw || '').match(/\{[\s\S]*\}/); const j = m && JSON.parse(m[0]);
    if (!j || !j.titolo || !Array.isArray(j.articoli) || !j.articoli.length) return null;
    const d = { ...off, ...j, ai: true };
    d.articoli = d.articoli.slice(0, 2).map(a => ({ titolo: clean(a && a.titolo, 70), testo: clean(a && a.testo, 700) }));
    while (d.articoli.length < 2) d.articoli.push(off.articoli[d.articoli.length]);
    d.titolo = clean(d.titolo, 80); d.sommario = clean(d.sommario, 180); d.occhiello = clean(d.occhiello || 'Cronaca', 30); d.breve = clean(d.breve || off.breve, 200); d.didascalia = clean(d.didascalia || off.didascalia, 90);
    if (!KINDS.includes(d.kind)) d.kind = off.kind;
    return d;
  } catch (e) { return null; }
}

export function create({ players = [], opts = {}, seed = 1 } = {}) {
  const R = rng(seed), secs = Math.max(8, Math.min(30, +opts.secs || 15));
  const P = players.slice(0, 8).map(p => ({ id: p.id, name: clean(p.name, 16) || 'Giocatore', bot: !!p.bot, list: [], tone: null, sent: !!p.bot }));
  for (const p of P) if (p.bot) { p.list = [R.pick(['ha perso tre compettine di fila su Discord', 'ha mangiato venti piatti al sushi', 'ha sbagliato tutte le domande del quiz', 'è scappato da una zombata alle due di notte'])]; p.tone = TONES[R.int(4)]; }
  const by = new Map(P.map(p => [p.id, p]));
  const S = { ph: 'collect', t: 0, ed: null, over: null, ev: [], asked: false, aiId: 1 };
  const tone = () => { const c = {}; for (const p of P) if (p.tone) c[p.tone] = (c[p.tone] || 0) + 1; return TONES.slice().sort((a, b) => (c[b] || 0) - (c[a] || 0))[0]; };
  const facts = () => P.map(p => ({ name: p.name, list: p.list }));
  function print() { S.ph = 'print'; S.t = 0; S.ev.push({ k: 'print' }); }
  function done(ed) { S.ed = ed; S.ph = 'end'; S.over = { winners: P.filter(p => !p.bot).map(p => p.id), scores: Object.fromEntries(P.map(p => [p.id, p.list.length * 10])), summary: 'In edicola: ' + ed.titolo }; S.ev.push({ k: 'end' }); }
  const game = {
    act(id, a) {
      const p = by.get(id); if (!p) return { ok: false, error: 'non sei in redazione' };
      if (!a || typeof a !== 'object') return { ok: false, error: 'azione' };
      if (S.ph !== 'collect') return { ok: false, error: 'la rotativa gira già' };
      if (a.tone !== undefined) { if (!TONES.includes(a.tone)) return { ok: false, error: 'taglio' }; p.tone = a.tone; return { ok: true }; }
      if (a.facts !== undefined) {
        if (!Array.isArray(a.facts)) return { ok: false, error: 'fatti' };
        p.list = a.facts.slice(0, 8).map(t => clean(t, 120)).filter(t => t.length > 3); p.sent = true;
        S.ev.push({ k: 'facts', id, n: p.list.length });
        return { ok: true };
      }
      return { ok: false, error: 'azione sconosciuta' };
    },
    tick(dt) {
      if (S.over) return;
      S.t += dt;
      if (S.ph === 'collect' && (S.t >= secs || (S.t >= 3 && P.every(p => p.sent && p.tone)))) print();
      else if (S.ph === 'print' && S.t >= PRINT_T) done(fallbackEdition(facts(), tone(), P.map(p => p.name)));
    },
    aiRequest() {
      if (S.ph !== 'print' || S.asked) return null; S.asked = true;
      const list = P.map(p => `${p.name}:\n${p.list.length ? p.list.map(t => '- ' + t).join('\n') : '- (nessun fatto: serata tranquilla)'}`).join('\n');
      return { id: S.aiId, model: 'smart', maxTokens: 700,
        system: `Sei la redazione del "Corriere delle Due Torri", giornale goliardico di un gruppo di amici bolognesi. Scrivi la prima pagina di un'EDIZIONE SPECIALE sulla serata di gioco della comitiva (più amici insieme nella sala giochi BIGALESSO), in italiano, stile giornalistico enfatico e ironico, taglio: ${tone()}. Cita i giocatori per nome. Rispondi SOLO con JSON valido con queste chiavi: {"occhiello": max 4 parole, "titolo": max 9 parole, "sommario": max 22 parole, "didascalia": max 12 parole, "kind": uno tra zombata|quiz|sushi|discord|processo|arcade, "articoli": [{"titolo": max 8 parole, "testo": 70-90 parole}, {"titolo": max 8 parole, "testo": 70-90 parole}], "breve": max 25 parole}. Usa solo i fatti forniti (puoi romanzarli). Tono comico e affettuoso: niente insulti pesanti, niente bestemmie, niente contenuti sessuali o discriminatori, niente fatti gravi veri sulle persone.`,
        prompt: `Fatti della serata, per giocatore:\n${list}` };
    },
    aiResult(id, text) {
      if (id !== S.aiId || S.ph !== 'print') return;
      const off = fallbackEdition(facts(), tone(), P.map(p => p.name));
      done((text && parseEdition(text, off)) || off);
    },
    view(id) {
      return { ph: S.ph, left: Math.max(0, Math.round(S.ph === 'collect' ? secs - S.t : 0)), me: id, tone: tone(),
        members: P.map(p => ({ id: p.id, name: p.name, n: p.list.length, tone: p.tone, bot: p.bot, sent: p.sent })), ed: S.ed };
    },
    drain() { const e = S.ev; S.ev = []; return e; },
    leave(id) { const p = by.get(id); if (p) { p.sent = true; p.tone = p.tone || 'cronaca'; } },
    get over() { return S.over; },
  };
  return game;
}
