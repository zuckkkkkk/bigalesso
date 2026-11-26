// Scopa a 2 o a 4 (in coppie: 0+2 contro 1+3). Regole condivise server/browser (vedi shared/README.md).
// 3 carte a testa, 4 in tavola (se in tavola escono 3 o 4 re si rimischia). Presa obbligatoria: una carta dello stesso
// valore ha la precedenza, altrimenti una combinazione che somma il valore (F=8, C=9, R=10). Svuotare la tavola è
// scopa, tranne con l'ultima carta della smazzata; le carte rimaste vanno a chi ha preso per ultimo.
// Punti di smazzata: carte (più di 20), denari (più di 5), settebello, primiera, scope. Si gioca a 11 o a 21.
// opts: { target: 11|21, diff: 'facile'|'media'|'tosta', turnTime: s (0 = nessun limite), fast: bool (test) }
import { rng } from './rng.mjs';
import { suitOf, rankOf, newDeck, nextP, teamOf, isCard } from './carte.mjs';

export const meta = { type: 'scopa', name: 'Scopa', minPlayers: 2, maxPlayers: 4, tickHz: 5, dropIn: true };
export const PRIMIERA = [0, 16, 12, 13, 14, 15, 18, 21, 10, 10, 10]; // per valore
export const SETTEBELLO = 6; // 7 di denari (seme 0, valore 7)

// tutte le prese possibili con la carta c (array di array di carte del tavolo); [] = si cala
export function captureOptions(table, c) {
  const v = rankOf(c);
  const same = table.filter(t => rankOf(t) === v);
  if (same.length) return same.map(t => [t]);
  const out = [], n = table.length;
  for (let m = 1; m < (1 << n); m++) {
    let s = 0, k = 0; const pick = [];
    for (let i = 0; i < n; i++) if (m & (1 << i)) { s += rankOf(table[i]); pick.push(table[i]); k++; if (s > v) break; }
    if (s === v && k >= 2) out.push(pick);
  }
  return out;
}
const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));

// punteggio di una smazzata: piles = [carte prese squadra 0, squadra 1], scope = [n0, n1]
export function handScore(piles, scope) {
  const cnt = piles.map(p => p.length), den = piles.map(p => p.filter(c => suitOf(c) === 0).length);
  const prim = piles.map(p => { let tot = 0; for (let s = 0; s < 4; s++) { const best = Math.max(0, ...p.filter(c => suitOf(c) === s).map(c => PRIMIERA[rankOf(c)])); if (!best) return -1; tot += best; } return tot; });
  const one = (a, b) => (a > b ? [1, 0] : b > a ? [0, 1] : [0, 0]);
  const carte = one(cnt[0], cnt[1]), denari = one(den[0], den[1]);
  const sette = [piles[0].includes(SETTEBELLO) ? 1 : 0, piles[1].includes(SETTEBELLO) ? 1 : 0];
  const primiera = one(prim[0], prim[1]);
  const tot = [0, 1].map(t => carte[t] + denari[t] + sette[t] + primiera[t] + scope[t]);
  return { cnt, den, prim, carte, denari, settebello: sette, primiera, scope: scope.slice(), tot };
}

export function create({ players, opts = {}, seed = 1 }) {
  const r = rng(seed);
  const list = players.slice(0, 4);
  while (list.length < 2 || list.length === 3) list.push({ id: 'bot' + list.length, name: ['Il Bot', 'Seghino', 'Parme'][list.length % 3], bot: true });
  const n = list.length;
  const diff = ['facile', 'media', 'tosta'].includes(opts.diff) ? opts.diff : 'media';
  const target = opts.target === 21 ? 21 : 11;
  const P = list.map((p, i) => ({ id: String(p.id), name: String(p.name || p.id).slice(0, 24), bot: !!p.bot, team: teamOf(i, n), diff: p.diff || diff, hand: [] }));
  const T = [{ pile: [], scope: 0, score: 0 }, { pile: [], scope: 0, score: 0 }];
  const S = { table: [], deck: [], dealer: r.int(n), turn: 0, phase: 'play', wait: 0, botT: 0, turnT: 0, lastCap: -1, lastMove: null, handNo: 0, handResult: null, seen: [], result: null };
  let ev = [];
  const idx = pid => P.findIndex(p => p.id === String(pid));
  const tm = i => P[i].team;

  function timers() { S.botT = opts.fast ? 0 : 0.7 + r.next() * 0.8; S.turnT = opts.turnTime > 0 ? opts.turnTime : 0; }
  function dealRound() { for (let k = 0; k < 3; k++) for (let j = 1; j <= n; j++) { const p = (S.dealer + j) % n; if (S.deck.length) P[p].hand.push(S.deck.shift()); } }
  function startHand() {
    let deck;
    do { deck = newDeck(r); } while (deck.slice(0, 4).filter(c => rankOf(c) === 10).length >= 3);
    S.table = deck.splice(0, 4); S.deck = deck; S.seen = S.table.slice();
    for (const t of T) { t.pile = []; t.scope = 0; }
    for (const p of P) p.hand = [];
    dealRound();
    S.turn = (S.dealer + 1) % n; S.lastCap = -1; S.lastMove = null; S.handNo++; S.phase = 'play'; S.handResult = null;
    ev.push({ k: 'deal', hand: S.handNo, table: S.table.slice(), dealer: S.dealer });
    timers();
  }
  const handsEmpty = () => P.every(p => !p.hand.length);

  function play(i, c, take) {
    const h = P[i].hand; h.splice(h.indexOf(c), 1); S.seen.push(c);
    let scopa = false;
    if (take.length) {
      S.table = S.table.filter(t => !take.includes(t));
      T[tm(i)].pile.push(c, ...take); S.lastCap = i;
      const lastPlay = !S.deck.length && handsEmpty();
      if (!S.table.length && !lastPlay) { scopa = true; T[tm(i)].scope++; }
    } else S.table.push(c);
    S.lastMove = { p: i, c, taken: take.slice(), scopa };
    ev.push({ k: 'play', p: i, c, taken: take.slice(), scopa });
    if (scopa) ev.push({ k: 'scopa', p: i, team: tm(i) });
    if (handsEmpty()) {
      if (S.deck.length) { dealRound(); ev.push({ k: 'deal', more: true, left: S.deck.length }); S.turn = nextP(S.turn, n); timers(); }
      else endHand();
    } else { S.turn = nextP(S.turn, n); timers(); }
  }
  function endHand() {
    if (S.table.length && S.lastCap >= 0) { T[tm(S.lastCap)].pile.push(...S.table); ev.push({ k: 'rest', p: S.lastCap, cards: S.table.slice() }); S.table = []; }
    const res = handScore([T[0].pile, T[1].pile], [T[0].scope, T[1].scope]);
    T[0].score += res.tot[0]; T[1].score += res.tot[1];
    S.handResult = { ...res, score: [T[0].score, T[1].score], hand: S.handNo };
    ev.push({ k: 'handEnd', ...S.handResult });
    const [a, b] = [T[0].score, T[1].score];
    if ((a >= target || b >= target) && a !== b) {
      const win = a > b ? 0 : 1;
      const names = t => P.filter(p => p.team === t).map(p => p.name).join(' & ');
      S.phase = 'over';
      S.result = { winners: P.filter(p => p.team === win).map(p => p.id), scores: Object.fromEntries(P.map(p => [p.id, T[p.team].score])), teamScore: [a, b], summary: `${names(win)} ${T[win].score} – ${T[1 - win].score} ${names(1 - win)}` };
      ev.push({ k: 'over', ...S.result });
    } else { S.phase = 'handEnd'; S.wait = opts.fast ? 0 : 6; }
  }

  // ---------------- bot ----------------
  const cardVal = c => (c === SETTEBELLO ? 22 : 0) + (rankOf(c) === 7 ? 6 : rankOf(c) === 6 ? 2.5 : rankOf(c) === 1 ? 2 : 0) + (suitOf(c) === 0 ? 2.5 : 0) + 1;
  function moves(i) {
    const out = [];
    for (const c of P[i].hand) { const o = captureOptions(S.table, c); if (!o.length) out.push({ c, take: [] }); else for (const t of o) out.push({ c, take: t }); }
    return out;
  }
  function riskOf(sum, i, d) {
    if (sum > 10 || sum <= 0) return 0;
    if (d !== 'tosta') return 0.45;
    // carte non viste di quel valore, mani degli avversari: probabilità che almeno una sia lì
    const seen = new Set([...S.seen, ...P[i].hand, ...T[0].pile, ...T[1].pile]);
    let unseen = 0, good = 0; for (let c = 0; c < 40; c++) if (!seen.has(c)) { unseen++; if (rankOf(c) === sum) good++; }
    const opp = P.filter((p, j) => p.team !== P[i].team).reduce((s, p) => s + p.hand.length, 0);
    if (!good || !unseen) return 0;
    let none = 1; for (let k = 0; k < opp; k++) none *= Math.max(0, (unseen - good - k) / (unseen - k));
    return 1 - none;
  }
  function evalMove(i, m, d) {
    const lastPlay = !S.deck.length && P.every((p, j) => j === i ? p.hand.length === 1 : !p.hand.length);
    let v = 0;
    let table;
    if (m.take.length) {
      v += cardVal(m.c) + m.take.reduce((s, c) => s + cardVal(c), 0);
      table = S.table.filter(t => !m.take.includes(t));
      if (!table.length && !lastPlay) v += 28;
    } else {
      v -= (m.c === SETTEBELLO ? 18 : 0) + (rankOf(m.c) === 7 ? 6 : 0) + (suitOf(m.c) === 0 ? 2 : 0) + (rankOf(m.c) === 6 ? 1.5 : 0);
      table = S.table.concat([m.c]);
    }
    if (table.length && !lastPlay) {
      const sum = table.reduce((s, c) => s + rankOf(c), 0);
      v -= riskOf(sum, i, d) * 28;
      v -= table.reduce((s, c) => s + cardVal(c), 0) * 0.12; // roba lasciata in tavola agli altri
    }
    return v;
  }
  function botMove(i, dOver) {
    const d = dOver || P[i].diff, ms = moves(i);
    if (ms.length === 1) return ms[0];
    if (d === 'facile') return r.pick(ms);
    let best = ms[0], bv = -1e9;
    for (const m of ms) { const v = evalMove(i, m, d) + (d === 'media' ? r.next() * 2.5 : r.next() * 0.2); if (v > bv) { bv = v; best = m; } }
    return best;
  }
  const bestTake = (i, c, opts2) => { let best = opts2[0], bv = -1e9; for (const t of opts2) { const v = evalMove(i, { c, take: t }, 'tosta'); if (v > bv) { bv = v; best = t; } } return best; };

  startHand();
  const game = {
    act(pid, a) {
      const i = idx(pid);
      if (i < 0) return { ok: false, error: 'non sei al tavolo' };
      if (S.result) return { ok: false, error: 'partita finita' };
      if (!a || a.k !== 'play') return { ok: false, error: 'mossa sconosciuta' };
      if (S.phase !== 'play') return { ok: false, error: 'aspetta la prossima smazzata' };
      if (S.turn !== i) return { ok: false, error: 'non è il tuo turno' };
      const c = a.card;
      if (!isCard(c) || !P[i].hand.includes(c)) return { ok: false, error: 'carta non in mano' };
      const o = captureOptions(S.table, c);
      let take = Array.isArray(a.take) ? a.take.filter(isCard) : null;
      if (!o.length) { if (take && take.length) return { ok: false, error: 'con questa carta non prendi niente' }; take = []; }
      else if (!take || !take.length) take = o.length === 1 ? o[0] : bestTake(i, c, o); // presa obbligatoria
      else if (!o.some(x => sameSet(x, take))) return { ok: false, error: 'presa non valida' };
      play(i, c, take);
      return { ok: true };
    },
    tick(dt) {
      if (S.result) return;
      if (S.phase === 'handEnd') { S.wait -= dt; if (S.wait <= 0) { S.dealer = nextP(S.dealer, n); startHand(); } return; }
      const cur = P[S.turn];
      if (cur.bot) { S.botT -= dt; if (S.botT <= 0) { const m = botMove(S.turn); play(S.turn, m.c, m.take); } }
      else if (S.turnT > 0) { S.turnT -= dt; if (S.turnT <= 0) { ev.push({ k: 'timeout', p: S.turn }); const m = botMove(S.turn, 'media'); play(S.turn, m.c, m.take); } }
    },
    view(pid) {
      const i = idx(pid);
      return {
        type: 'scopa', n, me: i, phase: S.phase, turn: S.turn, dealer: S.dealer, target,
        table: S.table.slice(), hand: i >= 0 ? P[i].hand.slice() : [], deck: S.deck.length,
        players: P.map(p => ({ id: p.id, name: p.name, bot: p.bot, team: p.team, cards: p.hand.length })),
        teams: T.map(t => ({ pile: t.pile.length, scope: t.scope, score: t.score, denari: t.pile.filter(c => suitOf(c) === 0).length, settebello: t.pile.includes(SETTEBELLO) })),
        lastMove: S.lastMove, handResult: S.handResult, hand_no: S.handNo,
        turnLeft: S.phase === 'play' && !P[S.turn].bot && S.turnT > 0 ? Math.ceil(S.turnT) : null,
        nextIn: S.phase === 'handEnd' ? Math.ceil(S.wait) : null,
        result: S.result,
      };
    },
    drain() { const e = ev; ev = []; return e; },
    leave(pid) { const i = idx(pid); if (i >= 0 && !P[i].bot) { P[i].bot = true; P[i].diff = 'media'; ev.push({ k: 'left', p: i }); if (S.turn === i) timers(); } },
    join(p) { const i = P.findIndex(q => q.bot); if (i < 0 || S.result) return false; P[i].id = String(p.id); P[i].name = String(p.name || p.id).slice(0, 24); P[i].bot = false; ev.push({ k: 'join', p: i }); return true; },
    get over() { return S.result; },
    _state: () => ({ P, T, S }),
    _bot: (i, d) => botMove(i, d),
  };
  return game;
}
