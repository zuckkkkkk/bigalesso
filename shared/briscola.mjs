// Briscola a 2 o a 4 (in coppie: 0+2 contro 1+3). Regole condivise server/browser (vedi shared/README.md).
// Punti: Asso 11, Tre 10, Re 4, Cavallo 3, Fante 2 (totale 120); vince chi supera 60, 60 a 60 è patta.
// Si gioca a mosse, ma con tickHz 5: i bot pensano qualche decimo di secondo, la presa resta in tavola un attimo,
// e online un giocatore fermo troppo a lungo gioca in automatico (opts.turnTime).
// opts: { diff: 'facile'|'media'|'tosta', turnTime: secondi (0 = nessun limite), fast: bool (bot senza pause, per i test) }
import { rng } from './rng.mjs';
import { suitOf, rankOf, newDeck, nextP, teamOf, isCard, cardName } from './carte.mjs';

export const meta = { type: 'briscola', name: 'Briscola', minPlayers: 2, maxPlayers: 4, tickHz: 5, dropIn: true }; // dropIn: chi arriva prende il posto di un bot
const POINTS = [0, 11, 0, 10, 0, 0, 0, 0, 2, 3, 4];   // per valore (1..10)
const STRENGTH = [0, 10, 1, 9, 2, 3, 4, 5, 6, 7, 8];  // Asso > Tre > Re > Cavallo > Fante > 7 > 6 > 5 > 4 > 2
export const pts = c => POINTS[rankOf(c)];
export const str = c => STRENGTH[rankOf(c)];
// b (giocata dopo) batte a (la migliore finora)?
export const beats = (a, b, trumpSuit) => suitOf(b) === suitOf(a) ? str(b) > str(a) : suitOf(b) === trumpSuit;
export function trickWinner(trick, trumpSuit) { let b = 0; for (let k = 1; k < trick.length; k++) if (beats(trick[b].c, trick[k].c, trumpSuit)) b = k; return b; }
export const trickPoints = trick => trick.reduce((s, t) => s + pts(t.c), 0);

export function create({ players, opts = {}, seed = 1 }) {
  const r = rng(seed);
  const list = players.slice(0, 4);
  while (list.length < 2 || list.length === 3) list.push({ id: 'bot' + list.length, name: ['Il Bot', 'Seghino', 'Parme'][list.length % 3], bot: true });
  const n = list.length;
  const diff = ['facile', 'media', 'tosta'].includes(opts.diff) ? opts.diff : 'media';
  const P = list.map((p, i) => ({ id: String(p.id), name: String(p.name || p.id).slice(0, 24), bot: !!p.bot, team: teamOf(i, n), diff: p.diff || diff, hand: [], pile: [] }));
  const deck = newDeck(r);
  const trump = deck[deck.length - 1]; // sotto il mazzo, scoperta: è l'ultima pescata
  const S = { trick: [], leader: 0, turn: 0, phase: 'play', wait: 0, botT: 0, turnT: 0, last: null, seen: [], tricks: 0, result: null };
  let ev = [];
  const first = r.int(n);
  for (let k = 0; k < 3; k++) for (let i = 0; i < n; i++) P[(first + i) % n].hand.push(deck.shift());
  S.leader = S.turn = first;
  ev.push({ k: 'deal', first, trump });
  const trumpSuit = suitOf(trump);
  const idx = pid => P.findIndex(p => p.id === String(pid));
  const teamPts = t => P.reduce((s, p) => p.team === t ? s + p.pile.reduce((a, c) => a + pts(c), 0) : s, 0);
  function timers() {
    S.botT = opts.fast ? 0 : 0.55 + r.next() * 0.75;
    S.turnT = opts.turnTime > 0 ? opts.turnTime : 0;
  }
  timers();

  function play(i, c) {
    const h = P[i].hand; h.splice(h.indexOf(c), 1);
    S.trick.push({ p: i, c }); S.seen.push(c);
    ev.push({ k: 'play', p: i, c });
    if (S.trick.length === n) { S.phase = 'show'; S.wait = opts.fast ? 0 : n === 4 ? 1.5 : 1.25; }
    else { S.turn = nextP(S.turn, n); timers(); }
  }
  function resolve() {
    const wk = trickWinner(S.trick, trumpSuit), w = S.trick[wk].p, points = trickPoints(S.trick);
    for (const t of S.trick) P[w].pile.push(t.c);
    S.last = { cards: S.trick.slice(), winner: w, points };
    ev.push({ k: 'trick', winner: w, team: P[w].team, points, cards: S.trick.map(t => t.c), best: S.trick[wk].c });
    S.trick = []; S.tricks++;
    if (deck.length) {
      for (let k = 0; k < n; k++) { const p = (w + k) % n; if (deck.length) P[p].hand.push(deck.shift()); }
      ev.push({ k: 'draw', left: deck.length });
      if (!deck.length) ev.push({ k: 'lastdraw', trump });
    }
    S.leader = S.turn = w; S.phase = 'play'; timers();
    if (P.every(p => !p.hand.length)) finish();
  }
  function finish() {
    const tp = [teamPts(0), teamPts(1)];
    const draw = tp[0] === tp[1];
    const win = draw ? -1 : tp[0] > tp[1] ? 0 : 1;
    const names = t => P.filter(p => p.team === t).map(p => p.name).join(' & ');
    S.phase = 'over';
    S.result = {
      winners: draw ? [] : P.filter(p => p.team === win).map(p => p.id),
      scores: Object.fromEntries(P.map(p => [p.id, tp[p.team]])),
      teamPoints: tp, draw,
      summary: draw ? `Patta, 60 a 60` : `${names(win)} ${tp[win]} – ${tp[1 - win]} ${names(1 - win)}`,
    };
    ev.push({ k: 'over', ...S.result });
  }

  // ---------------- bot ----------------
  function botMove(i, dOver) {
    const d = dOver || P[i].diff, hand = P[i].hand;
    if (hand.length === 1) return hand[0];
    if (d === 'facile') return r.pick(hand);
    if (d === 'tosta' && n === 2 && !deck.length) return endgame(i);
    const noise = () => (d === 'media' ? r.next() * 0.6 : r.next() * 0.1);
    const isT = c => suitOf(c) === trumpSuit;
    const trumpCost = c => isT(c) ? 3 + str(c) * 0.55 + pts(c) * 0.4 : 0;
    let best = hand[0], bv = -1e9;
    if (!S.trick.length) {
      // apre: liscio, niente carichi, niente briscole se possibile
      for (const c of hand) { const v = -(pts(c) * 1.1 + (isT(c) ? 6 + str(c) * 0.8 : 0) + str(c) * 0.15) + noise(); if (v > bv) { bv = v; best = c; } }
      return best;
    }
    const bk = trickWinner(S.trick, trumpSuit), bc = S.trick[bk].c, bp = S.trick[bk].p;
    const P0 = trickPoints(S.trick), last = S.trick.length === n - 1;
    const partner = n === 4 && P[bp].team === P[i].team;
    // tosta: la carta del compagno è imbattibile? (briscola più alta tra quelle non ancora uscite)
    let safe = last;
    if (!safe && partner && d === 'tosta') {
      const out = new Set([...S.seen, ...hand]);
      safe = true;
      for (let c = 0; c < 40; c++) if (!out.has(c) && beats(bc, c, trumpSuit)) { safe = false; break; }
    }
    for (const c of hand) {
      const wins = beats(bc, c, trumpSuit);
      let v;
      if (partner) v = safe ? pts(c) * 1.2 - trumpCost(c) * (wins ? 1 : 0.4) : -pts(c) * 0.8 - trumpCost(c) - str(c) * 0.05;
      else if (wins) v = (P0 + pts(c)) * (last ? 1 : 0.75) - trumpCost(c) + (last ? 0.2 : 0);
      else v = -(P0 + pts(c)) * (last ? 1 : 0.6) - str(c) * 0.03;
      v += noise();
      if (v > bv) { bv = v; best = c; }
    }
    return best;
  }
  // a mazzo finito, in due, si conoscono tutte le carte: ricerca completa
  function endgame(me) {
    const opp = 1 - me;
    const h = [P[0].hand.slice(), P[1].hand.slice()];
    function mm(hands, leader, lead) {
      if (lead == null) {
        const p = leader; if (!hands[p].length) return 0;
        let best = p === me ? -1e9 : 1e9;
        for (const c of hands[p]) { const nh = [hands[0], hands[1]]; nh[p] = hands[p].filter(x => x !== c); const v = mm(nh, leader, c); best = p === me ? Math.max(best, v) : Math.min(best, v); }
        return best;
      }
      const p = 1 - leader; let best = p === me ? -1e9 : 1e9;
      for (const c of hands[p]) {
        const nh = [hands[0], hands[1]]; nh[p] = hands[p].filter(x => x !== c);
        const w = beats(lead, c, trumpSuit) ? p : leader, g = pts(lead) + pts(c);
        const v = (w === me ? g : -g) + mm(nh, w, null);
        best = p === me ? Math.max(best, v) : Math.min(best, v);
      }
      return best;
    }
    let best = h[me][0], bv = -1e9;
    for (const c of h[me]) {
      const nh = [h[0], h[1]]; nh[me] = h[me].filter(x => x !== c);
      let v;
      if (!S.trick.length) v = mm(nh, me, c);
      else { const lead = S.trick[0].c, w = beats(lead, c, trumpSuit) ? me : opp, g = pts(lead) + pts(c); v = (w === me ? g : -g) + mm(nh, w, null); }
      if (v > bv) { bv = v; best = c; }
    }
    return best;
  }

  const game = {
    act(pid, a) {
      const i = idx(pid);
      if (i < 0) return { ok: false, error: 'non sei al tavolo' };
      if (S.result) return { ok: false, error: 'partita finita' };
      if (!a || a.k !== 'play') return { ok: false, error: 'mossa sconosciuta' };
      if (S.phase !== 'play') return { ok: false, error: 'aspetta che si chiuda la mano' };
      if (S.turn !== i) return { ok: false, error: 'non è il tuo turno' };
      const c = a.card;
      if (!isCard(c) || !P[i].hand.includes(c)) return { ok: false, error: 'carta non in mano' };
      play(i, c);
      return { ok: true };
    },
    tick(dt) {
      if (S.result) return;
      if (S.phase === 'show') { S.wait -= dt; if (S.wait <= 0) resolve(); return; }
      const cur = P[S.turn];
      if (cur.bot) { S.botT -= dt; if (S.botT <= 0) play(S.turn, botMove(S.turn)); }
      else if (S.turnT > 0) { S.turnT -= dt; if (S.turnT <= 0) { ev.push({ k: 'timeout', p: S.turn }); play(S.turn, botMove(S.turn, 'media')); } }
    },
    view(pid) {
      const i = idx(pid);
      return {
        type: 'briscola', n, me: i, phase: S.phase, turn: S.turn, leader: S.leader,
        trick: S.trick.map(t => ({ p: t.p, c: t.c })), trump, trumpSuit, trumpOnTable: deck.length > 0, deck: deck.length,
        hand: i >= 0 ? P[i].hand.slice() : [],
        players: P.map(p => ({ id: p.id, name: p.name, bot: p.bot, team: p.team, cards: p.hand.length, pile: p.pile.length })),
        last: S.last, myPoints: i >= 0 ? teamPts(P[i].team) : null, tricks: S.tricks,
        turnLeft: !P[S.turn].bot && S.turnT > 0 ? Math.ceil(S.turnT) : null,
        result: S.result,
      };
    },
    drain() { const e = ev; ev = []; return e; },
    leave(pid) { const i = idx(pid); if (i >= 0 && !P[i].bot) { P[i].bot = true; P[i].diff = 'media'; ev.push({ k: 'left', p: i }); if (S.turn === i) timers(); } },
    join(p) { const i = P.findIndex(q => q.bot); if (i < 0 || S.result) return false; P[i].id = String(p.id); P[i].name = String(p.name || p.id).slice(0, 24); P[i].bot = false; ev.push({ k: 'join', p: i }); return true; },
    get over() { return S.result; },
    // per i test
    _state: () => ({ P, deck, S, trump }),
    _bot: (i, d) => botMove(i, d),
  };
  return game;
}
export { cardName };
