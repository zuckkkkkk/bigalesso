// shared/quiz.mjs — "Chi l'ha detto? Sfida": the group quiz as a battle (rules, see shared/README.md). Everyone gets the
// same questions at the same time (9 × "chi l'ha scritto nel gruppo?" + 1 bonus "quale frase è falsa?"), speed and
// correctness make the points (same formula as the single-player quiz, src/minigames/quiz.js), live scoreboard.
// The referee knows the answers; views show them only after everyone answered / time is up. Bots answer too.
// opts: { n: 6..15 questions (default 10), qt: 8..20 s per question (default 12) }
// Actions: { ans: k, q: i }  answer option k (0..3) of question i (one answer per question, only while it's open)
// view(id): { ph:'intro'|'q'|'res'|'end', i, n, qt, left, q:{ k:'who', text, opts:[persona ids] } | { k:'fake',
//   lines:[{ w, t }] }, mine, done:[ids], res?:{ right, picks:{id:k}, pts:{id:n}, fastest, who }, sc:[{ id, name, s, c, st, bot }] }
import { rng } from './rng.mjs';
import { QUOTES, PERSONA_IDS } from './quiz_data.mjs';

export const meta = { type: 'quiz', name: "Chi l'ha detto? Sfida", minPlayers: 2, maxPlayers: 8, tickHz: 5, dropIn: false };
// offline fake lines (written for the game, in the group's tone; never real messages) — also used by quizcore.js
export const FAKES = [
  ['asche', 'Raga ho prenotato il Millennium per martedì mattina'],
  ['seghino', 'Stasera niente zombata, gioco a Tetris da solo'],
  ['zuck', 'Compettina? No grazie, stasera leggo un libro'],
  ['parme', 'Soccmel che bello andare a correre alle 6'],
  ['ciccio', 'Il Corriere chiude, nessuna precisazione'],
  ['lombu', 'Arrivo in anticipo di mezz\'ora'],
  ['forla', 'Ho comprato un monitor più piccolo'],
  ['ashish', 'Sushi? Mai sentito, cos\'è?'],
  ['cesco', 'Il lunedì al Bellazzi costa il doppio, meglio'],
  ['ricky', 'Ok ciao'],
  ['jacopo', 'Basta viaggi, resto a casa per sempre'],
  ['mirco', 'Tortellino Man non mi interessa più'],
];
const INTRO = 3, RES = 4;
export const points = (left, streak, bonus) => Math.round((100 + Math.max(0, left) * 25) * (1 + Math.min(4, streak - 1) * 0.25) * (bonus ? 2 : 1) / 10) * 10;
export function rankOf(correct, n = 10) {
  const k = correct / n;
  return k >= 1 ? 'Membro certificato' : k >= 0.7 ? 'Teletubby DOC' : k >= 0.4 ? 'Utente medio del gruppo' : k >= 0.2 ? 'Appena entrato' : 'Zona demilitarizzata';
}

// deterministic rounds from the seed: n-1 "who" + 1 "fake"
export function buildRounds(seed, n = 10) {
  const R = rng(seed ^ 0x51a7);
  const byWho = {}; for (const [w, t] of QUOTES) (byWho[w] = byWho[w] || []).push(t);
  const speakers = Object.keys(byWho).sort();
  const pool = R.shuffle(QUOTES.slice());
  const per = {}, used = new Set(), rounds = [];
  for (const [w, t] of pool) {
    if (rounds.length >= n - 1) break;
    if ((per[w] || 0) >= 2 || used.has(t)) continue;
    per[w] = (per[w] || 0) + 1; used.add(t);
    const others = R.shuffle(speakers.filter(s => s !== w)).slice(0, 3);
    while (others.length < 3) { const p = PERSONA_IDS[R.int(PERSONA_IDS.length)]; if (p !== w && !others.includes(p)) others.push(p); }
    const opts = R.shuffle([w, ...others]);
    rounds.push({ k: 'who', text: t, opts, right: opts.indexOf(w), who: w });
  }
  const f = FAKES[R.int(FAKES.length)];
  const reals = R.shuffle(QUOTES.filter(([w, t]) => w !== f[0] && !used.has(t))).slice(0, 3);
  const lines = R.shuffle([...reals.map(([w, t]) => ({ w, t, fake: false })), { w: f[0], t: f[1], fake: true }]);
  rounds.push({ k: 'fake', lines, right: lines.findIndex(l => l.fake), who: f[0] });
  return rounds;
}

export function create({ players = [], opts = {}, seed = 1 } = {}) {
  const n = Math.max(6, Math.min(15, (opts.n | 0) || 10)), qt = Math.max(8, Math.min(20, +opts.qt || 12));
  const R = rng(seed);
  const rounds = buildRounds(seed, n);
  const P = new Map();
  for (const p of players) P.set(p.id, { id: p.id, name: String(p.name || 'Giocatore').slice(0, 16), bot: !!p.bot, s: 0, c: 0, st: 0, best: 0, gone: false,
    acc: 0.42 + R.next() * 0.3, react: 2.2 + R.next() * 5 });
  const S = { ph: 'intro', i: 0, t: 0, ans: new Map(), res: null, over: null, ev: [] };
  const push = e => S.ev.push(e);
  const cur = () => rounds[S.i];
  const humans = () => [...P.values()].filter(p => !p.bot && !p.gone);
  function openQ() {
    S.ph = 'q'; S.t = 0; S.ans = new Map(); S.res = null;
    // bots decide now (seeded): when, and right or wrong
    for (const p of P.values()) if (p.bot) { const right = R.next() < p.acc; const q = cur(); const wrong = [0, 1, 2, 3].filter(k => k !== q.right); p.plan = { at: Math.min(qt - 0.5, p.react * (0.6 + R.next() * 0.8)), k: right ? q.right : wrong[R.int(wrong.length)] }; }
    push({ k: 'q', i: S.i });
  }
  function answer(p, k) {
    if (S.ans.has(p.id)) return false;
    S.ans.set(p.id, { k, t: S.t }); return true;
  }
  function closeQ() {
    const q = cur(), picks = {}, pts = {};
    let fastest = null, ft = 1e9;
    for (const p of P.values()) {
      const a = S.ans.get(p.id);
      if (a) picks[p.id] = a.k;
      if (a && a.k === q.right) { p.c++; p.st++; p.best = Math.max(p.best, p.st); const x = points(qt - a.t, p.st, q.k === 'fake'); p.s += x; pts[p.id] = x; if (a.t < ft) { ft = a.t; fastest = p.id; } }
      else { p.st = 0; pts[p.id] = 0; }
    }
    if (fastest && Object.keys(pts).length > 1) { P.get(fastest).s += 50; pts[fastest] += 50; }
    S.res = { right: q.right, picks, pts, fastest, who: q.who };
    S.ph = 'res'; S.t = 0;
    push({ k: 'res', i: S.i, right: q.right, fastest });
  }
  function finish() {
    S.ph = 'end'; S.t = 0;
    const list = table(), top = list.length ? list[0].s : 0;
    const winners = list.filter(x => x.s === top && top > 0).map(x => x.id);
    const wn = winners.map(id => P.get(id).name);
    S.over = { winners, scores: Object.fromEntries(list.map(x => [x.id, x.s])), table: list, n,
      summary: winners.length ? `${wn.join(' e ')} ${winners.length > 1 ? 'vincono' : 'vince'} con ${top} punti` : 'Nessuno ci ha preso: il gruppo non si conosce' };
    push({ k: 'end' });
  }
  const table = () => [...P.values()].filter(p => !p.gone || p.s > 0).map(p => ({ id: p.id, name: p.name, s: p.s, c: p.c, st: p.st, best: p.best, bot: p.bot })).sort((a, b) => b.s - a.s || b.c - a.c);
  const game = {
    act(id, a) {
      const p = P.get(id); if (!p || p.gone) return { ok: false, error: 'non sei in questa sfida' };
      if (!a || typeof a !== 'object' || a.ans === undefined) return { ok: false, error: 'azione' };
      if (S.ph !== 'q') return { ok: false, error: 'domanda chiusa' };
      if (a.q !== undefined && (a.q | 0) !== S.i) return { ok: false, error: 'domanda chiusa' };
      const k = a.ans | 0, q = cur(), max = q.k === 'fake' ? q.lines.length : q.opts.length;
      if (k < 0 || k >= max) return { ok: false, error: 'risposta non valida' };
      if (!answer(p, k)) return { ok: false, error: 'hai già risposto' };
      push({ k: 'ans', id });
      return { ok: true };
    },
    tick(dt) {
      if (S.over) return;
      S.t += dt;
      if (S.ph === 'intro') { if (S.t >= INTRO) openQ(); return; }
      if (S.ph === 'q') {
        for (const p of P.values()) if (p.bot && p.plan && !S.ans.has(p.id) && S.t >= p.plan.at) { answer(p, p.plan.k); push({ k: 'ans', id: p.id }); }
        const hs = humans(), allHumans = hs.length > 0 && hs.every(p => S.ans.has(p.id));
        if (allHumans) for (const p of P.values()) if (p.bot && !S.ans.has(p.id) && p.plan) { answer(p, p.plan.k); } // humans done: bots answer now
        const all = [...P.values()].filter(p => !p.gone).every(p => S.ans.has(p.id));
        if (S.t >= qt || all || !hs.length) closeQ();
        return;
      }
      if (S.ph === 'res' && S.t >= RES) { if (S.i + 1 < rounds.length) { S.i++; openQ(); } else finish(); }
    },
    view(id) {
      const q = cur(), left = S.ph === 'q' ? qt - S.t : S.ph === 'res' ? RES - S.t : S.ph === 'intro' ? INTRO - S.t : 0;
      const mine = S.ans.get(id);
      return {
        ph: S.ph, i: S.i, n: rounds.length, qt, left: Math.max(0, Math.round(left * 10) / 10), me: id,
        q: S.ph === 'intro' ? null : q.k === 'who' ? { k: 'who', text: q.text, opts: q.opts } : { k: 'fake', lines: q.lines.map(l => ({ w: l.w, t: l.t })) },
        mine: mine ? mine.k : -1, done: [...S.ans.keys()],
        res: S.ph === 'res' || S.ph === 'end' ? S.res : null,
        sc: table().map(({ id: i, name, s, c, st, bot }) => ({ id: i, name, s, c, st, bot })),
        over: S.over ? { winners: S.over.winners, summary: S.over.summary } : null,
      };
    },
    drain() { const e = S.ev; S.ev = []; return e; },
    leave(id) { const p = P.get(id); if (p) p.gone = true; },
    get over() { return S.over; },
    _rounds: rounds, _state: S,
  };
  return game;
}
