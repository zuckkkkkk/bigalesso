// Figurine degli amici: catalogo delle carte collezionabili + "Figurine duel" (regole condivise server/browser).
// Duello: 2 giocatori, 3 corsie (Piazzetta, Celtic, Via Petroni), 6 turni. Ogni turno si pesca una carta e si hanno
// tante birre (energia) quanto il numero del turno. Le carte si piazzano coperte (max 4 per lato di corsia), poi
// quando entrambi hanno finito si girano: prima chi sta vincendo più corsie. A fine partita vince chi ha più
// potenza in 2 corsie su 3 (pari corsie: potenza totale). Le abilità sono battute del gruppo.
// opts: { decks: { [playerId]: [idCarta…] }, diff, turnTime, fast }
import { rng } from './rng.mjs';

export const meta = { type: 'figurine', name: 'Figurine duel', minPlayers: 2, maxPlayers: 2, tickHz: 5, dropIn: false };
export const RARITY = ['comune', 'rara', 'epica', 'leggendaria'];
export const LANES = ['Piazzetta', 'Celtic', 'Via Petroni'];
export const MAX_TURN = 6, LANE_MAX = 4, HAND_MAX = 7;
// ab: abilità (vedi reveal()/power()); who: persona dei personaggi (src/ai.js) per colore/emoji
export const CATALOG = [
  { id: 'asche', who: 'asche', name: 'Asche', cost: 2, power: 2, rarity: 'comune', ab: 'spam', title: 'Fa laggare WhatsApp', text: 'Aggiunge 2 Messaggi (1) in corsie a caso dalla tua parte.' },
  { id: 'ashish', who: 'ashish', name: 'Ashish', cost: 3, power: 4, rarity: 'rara', ab: 'immune', title: "Sotto la mappa", text: "È nell'altra dimensione: niente può indebolirlo o mandarlo al Gulag." },
  { id: 'forla', who: 'forla', name: 'Forla', cost: 2, power: 3, rarity: 'comune', ab: 'draw', title: 'Discord pt.2', text: 'Peschi una carta.' },
  { id: 'seghino', who: 'seghino', name: 'Seghino', cost: 4, power: 3, rarity: 'epica', ab: 'zombata', title: 'Zombata?', text: 'Mette uno Zombie (2) nelle altre due corsie dalla tua parte.' },
  { id: 'ciccio', who: 'ciccio', name: 'Ciccio', cost: 4, power: 3, rarity: 'epica', ab: 'arresto', title: 'Fino a tre anni di reclusione!', text: 'Manda al Gulag la carta nemica più forte di questa corsia con potenza 5 o meno.' },
  { id: 'zuck', who: 'zuck', name: 'Zuck', cost: 3, power: 3, rarity: 'rara', ab: 'compettina', title: 'Qualcuno per una compettina?', text: '+1 alle tue altre carte qui e +1 birra il prossimo turno.' },
  { id: 'parme', who: 'parme', name: 'Parme', cost: 3, power: 3, rarity: 'rara', ab: 'greve', title: 'Greve', text: '-2 a tutte le carte nemiche di questa corsia.' },
  { id: 'lombu', who: 'lombu', name: 'Lombu', cost: 2, power: 3, rarity: 'comune', ab: 'pari', title: 'Chiude prima', text: 'Continuo: se questa corsia finisce pari, la vinci tu.' },
  { id: 'cesco', who: 'cesco', name: 'Cesco', cost: 3, power: 2, rarity: 'comune', ab: 'bellazzi', title: 'Bellazzi del lunedì', text: '+4 se qui hai già almeno 2 altre carte.' },
  { id: 'ricky', who: 'ricky', name: 'Ricky Catta', cost: 4, power: 3, rarity: 'rara', ab: 'draw2', title: '7 ore di lore', text: 'Peschi 2 carte.' },
  { id: 'jacopo', who: 'jacopo', name: 'Jacopo', cost: 4, power: 2, rarity: 'comune', ab: 'sottoscrivo', title: 'Sottoscrivo', text: 'Continuo: +1 per ogni altra tua carta in questa corsia.' },
  { id: 'mirco', who: 'mirco', name: 'Mirco', cost: 2, power: 1, rarity: 'rara', ab: 'poteri', title: 'Che poteri ha?', text: 'Quando si gira la sua potenza diventa a caso da 1 a 9.' },
  { id: 'tortellino', who: null, name: 'Tortellino Man', cost: 6, power: 8, rarity: 'leggendaria', ab: 'eroe', title: 'Il supereroe di Bologna', text: 'Continuo: +1 a tutte le tue altre carte, in tutte le corsie.', emoji: '🥟', color: '#ffcc33' },
  { id: 'vigile', who: null, name: 'Vigile Urbano Zombie', cost: 5, power: 6, rarity: 'epica', ab: 'multa', title: 'Multa a tappeto', text: '-1 a tutte le carte nemiche, in tutte le corsie.', emoji: '👮', color: '#7ad0a0' },
  { id: 'cane', who: null, name: 'Il cane', cost: 2, power: 2, rarity: 'comune', ab: 'cane', title: 'Chi è un bravo cane?', text: 'Continuo: +3 se Zuck è nella stessa corsia, dalla tua parte.', emoji: '🐕', color: '#d9a066' },
  { id: 'bellazzi', who: null, name: 'Birra Bellazzi', cost: 1, power: 1, rarity: 'comune', ab: 'birra', title: 'Il lunedì è in sconto', text: '+1 birra il prossimo turno.', emoji: '🍺', color: '#f2b233' },
  { id: 'corriere', who: null, name: 'Corriere delle Due Torri', cost: 3, power: 2, rarity: 'rara', ab: 'edizione', title: 'Edizione straordinaria', text: '+1 alle tue altre carte in questa corsia.', emoji: '📰', color: '#e8e2d0' },
  { id: 'gulag', who: null, name: 'Il Gulag', cost: 5, power: 2, rarity: 'leggendaria', ab: 'gulag', title: 'Zona demilitarizzata', text: 'In ogni corsia manda al Gulag la carta nemica più debole.', emoji: '⛓️', color: '#9a8cff' },
];
export const BY_ID = Object.fromEntries(CATALOG.map(c => [c.id, c]));
export const TOKENS = { msg: { id: 'msg', name: 'Messaggio', power: 1, emoji: '💬', token: true }, zombie: { id: 'zombie', name: 'Zombie', power: 2, emoji: '🧟', token: true } };
export const STARTER = ['asche', 'forla', 'lombu', 'cesco', 'jacopo', 'cane', 'bellazzi', 'zuck', 'parme', 'mirco'];
export const DECK_MIN = 8, DECK_MAX = 12;
const RW = { comune: 60, rara: 28, epica: 9, leggendaria: 3 };
// bustina: 5 figurine (pesate per rarità), 4% di uscire lucida
export function packRoll(r, n = 5) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const tot = CATALOG.reduce((s, c) => s + RW[c.rarity], 0); let x = r.next() * tot, pick = CATALOG[0];
    for (const c of CATALOG) { x -= RW[c.rarity]; if (x <= 0) { pick = c; break; } }
    out.push({ id: pick.id, shiny: r.next() < 0.04 });
  }
  return out;
}
export function validDeck(d) {
  if (!Array.isArray(d)) return null;
  const ok = d.filter(id => BY_ID[id]).slice(0, DECK_MAX);
  return ok.length >= DECK_MIN ? ok : null;
}
function botDeck(r, diff) {
  const pool = CATALOG.filter(c => diff === 'tosta' || c.rarity !== 'leggendaria').map(c => c.id);
  const d = new Set(diff === 'facile' ? STARTER.slice(0, 6) : []);
  while (d.size < 10) d.add(r.pick(pool));
  return [...d];
}

export function create({ players, opts = {}, seed = 1 }) {
  const r = rng(seed);
  const list = players.slice(0, 2);
  while (list.length < 2) list.push({ id: 'bot' + list.length, name: 'Il Bot', bot: true });
  const diff = ['facile', 'media', 'tosta'].includes(opts.diff) ? opts.diff : 'media';
  let uid = 1;
  const P = list.map((p, i) => {
    const d = (opts.decks && validDeck(opts.decks[p.id])) || (p.bot ? botDeck(r, p.diff || diff) : STARTER.slice());
    return { id: String(p.id), name: String(p.name || p.id).slice(0, 24), bot: !!p.bot, diff: p.diff || diff, deck: r.shuffle(d.slice()), hand: [], pending: [], ended: false, energy: 0, bonus: 0, planned: false };
  });
  // L[lane][side] = [{ u, id, base, mod, immune }]
  const L = [0, 1, 2].map(() => [[], []]);
  const S = { turn: 0, phase: 'plan', wait: 0, queue: [], botT: 0, turnT: 0, result: null, first: 0 };
  let ev = [];
  const idx = pid => P.findIndex(p => p.id === String(pid));
  const draw = (i, k = 1) => { for (let j = 0; j < k; j++) { const p = P[i]; if (!p.deck.length || p.hand.length >= HAND_MAX) return; p.hand.push({ u: uid++, id: p.deck.shift() }); } };
  const pendCost = i => P[i].pending.reduce((s, x) => s + BY_ID[x.id].cost, 0);
  const sideCount = (lane, side, i) => L[lane][side].length + (i === side ? P[i].pending.filter(x => x.lane === lane).length : 0);

  // ---- potenza (con gli effetti continui) ----
  const onBoard = (side, ab) => { let k = 0; for (const ln of L) for (const c of ln[side]) if (BY_ID[c.id] && BY_ID[c.id].ab === ab) k++; return k; };
  function power(c, lane, side) {
    let v = c.base + c.mod;
    const d = BY_ID[c.id];
    if (d && d.ab === 'sottoscrivo') v += L[lane][side].length - 1;
    if (d && d.ab === 'cane' && L[lane][side].some(x => x.id === 'zuck')) v += 3;
    const eroi = onBoard(side, 'eroe') - (d && d.ab === 'eroe' ? 1 : 0);
    v += eroi;
    return Math.max(0, v);
  }
  const lanePow = (lane, side) => L[lane][side].reduce((s, c) => s + power(c, lane, side), 0);
  function laneWinner(lane) {
    const a = lanePow(lane, 0), b = lanePow(lane, 1);
    if (a !== b) return a > b ? 0 : 1;
    const ta = L[lane][0].some(c => c.id === 'lombu'), tb = L[lane][1].some(c => c.id === 'lombu');
    return ta && !tb ? 0 : tb && !ta ? 1 : -1;
  }
  const lanesWon = side => [0, 1, 2].filter(l => laneWinner(l) === side).length;
  const totalPow = side => [0, 1, 2].reduce((s, l) => s + lanePow(l, side), 0);

  function startTurn() {
    S.turn++;
    for (let i = 0; i < 2; i++) { const p = P[i]; draw(i, S.turn === 1 ? 4 : 1); p.energy = S.turn + p.bonus; p.bonus = 0; p.ended = false; p.pending = []; p.planned = false; }
    S.phase = 'plan'; S.botT = opts.fast ? 0 : 0.8 + r.next() * 1.2; S.turnT = opts.turnTime > 0 ? opts.turnTime : 0;
    ev.push({ k: 'turn', turn: S.turn });
  }
  function beginReveal() {
    const w0 = lanesWon(0), w1 = lanesWon(1);
    S.first = w0 !== w1 ? (w0 > w1 ? 0 : 1) : totalPow(0) !== totalPow(1) ? (totalPow(0) > totalPow(1) ? 0 : 1) : r.int(2);
    S.queue = [...P[S.first].pending.map(x => ({ ...x, side: S.first })), ...P[1 - S.first].pending.map(x => ({ ...x, side: 1 - S.first }))];
    for (const p of P) p.pending = [];
    S.phase = 'reveal'; S.wait = opts.fast ? 0 : 0.4;
    ev.push({ k: 'reveal_start', first: S.first });
  }
  function addToken(lane, side, t) { if (L[lane][side].length >= LANE_MAX) return false; L[lane][side].push({ u: uid++, id: t, base: TOKENS[t].power, mod: 0, token: true }); ev.push({ k: 'token', lane, side, id: t }); return true; }
  function destroy(lane, side, c, why) { const a = L[lane][side]; a.splice(a.indexOf(c), 1); ev.push({ k: 'gulag', lane, side, id: c.id, why }); }
  const immune = c => BY_ID[c.id] && BY_ID[c.id].ab === 'immune';
  function revealOne(x) {
    const d = BY_ID[x.id], side = x.side, lane = x.lane, en = 1 - side;
    if (L[lane][side].length >= LANE_MAX) { ev.push({ k: 'fizzle', side, lane, id: x.id }); return; }
    const c = { u: x.u, id: x.id, base: d.power, mod: 0 };
    L[lane][side].push(c);
    ev.push({ k: 'reveal', side, lane, id: x.id, u: x.u });
    switch (d.ab) {
      case 'spam': for (let k = 0; k < 2; k++) { const free = [0, 1, 2].filter(l => L[l][side].length < LANE_MAX); if (free.length) addToken(r.pick(free), side, 'msg'); } break;
      case 'draw': draw(side, 1); break;
      case 'draw2': draw(side, 2); break;
      case 'zombata': for (const l of [0, 1, 2]) if (l !== lane) addToken(l, side, 'zombie'); break;
      case 'arresto': { const t = L[lane][en].filter(e => !immune(e) && power(e, lane, en) <= 5).sort((a, b) => power(b, lane, en) - power(a, lane, en))[0]; if (t) destroy(lane, en, t, 'arresto'); break; }
      case 'compettina': for (const o of L[lane][side]) if (o !== c) o.mod += 1; P[side].bonus += 1; break;
      case 'greve': for (const o of L[lane][en]) if (!immune(o)) o.mod -= 2; break;
      case 'bellazzi': if (L[lane][side].length - 1 >= 2) c.mod += 4; break;
      case 'poteri': c.base = 1 + r.int(9); break;
      case 'multa': for (const l of [0, 1, 2]) for (const o of L[l][en]) if (!immune(o)) o.mod -= 1; break;
      case 'birra': P[side].bonus += 1; break;
      case 'edizione': for (const o of L[lane][side]) if (o !== c) o.mod += 1; break;
      case 'gulag': for (const l of [0, 1, 2]) { const t = L[l][en].filter(e => !immune(e)).sort((a, b) => power(a, l, en) - power(b, l, en))[0]; if (t) destroy(l, en, t, 'gulag'); } break;
    }
  }
  function finish() {
    const w0 = lanesWon(0), w1 = lanesWon(1);
    let win = w0 !== w1 ? (w0 > w1 ? 0 : 1) : totalPow(0) !== totalPow(1) ? (totalPow(0) > totalPow(1) ? 0 : 1) : -1;
    S.phase = 'over';
    S.result = { winners: win < 0 ? [] : [P[win].id], draw: win < 0, scores: { [P[0].id]: w0, [P[1].id]: w1 }, lanes: [w0, w1], power: [totalPow(0), totalPow(1)],
      summary: win < 0 ? `Patta (${w0} corsie a ${w1})` : `${P[win].name} vince ${Math.max(w0, w1)} corsie a ${Math.min(w0, w1)}` };
    ev.push({ k: 'over', ...S.result });
  }

  // ---- bot ----
  function botPlan(i) {
    const p = P[i], d = p.diff, en = 1 - i;
    let energy = p.energy - pendCost(i); // chi subentra a un giocatore uscito tiene le carte già piazzate
    const hand = p.hand.slice().sort((a, b) => {
      const A = BY_ID[a.id], B = BY_ID[b.id];
      return (B.power + B.cost * 0.6) - (A.power + A.cost * 0.6) + (d === 'facile' ? (r.next() - 0.5) * 6 : 0);
    });
    for (const h of hand) {
      const c = BY_ID[h.id]; if (c.cost > energy) continue;
      const free = [0, 1, 2].filter(l => sideCount(l, i, i) < LANE_MAX); if (!free.length) break;
      let lane = r.pick(free);
      if (d !== 'facile') {
        const score = l => {
          const my = lanePow(l, i) + p.pending.filter(x => x.lane === l).reduce((s, x) => s + BY_ID[x.id].power, 0), th = lanePow(l, en);
          let v = -Math.abs(th - my + 1) * 0.6 + (my <= th ? 2 : 0) - (my - th > 8 ? 6 : 0);
          if (c.ab === 'arresto') v += L[l][en].some(e => !immune(e) && power(e, l, en) <= 5) ? 8 : -4;
          if (c.ab === 'greve') v += L[l][en].length * 2;
          if (c.ab === 'bellazzi' || c.ab === 'sottoscrivo' || c.ab === 'edizione' || c.ab === 'compettina') v += L[l][i].length * 2;
          if (c.ab === 'cane') v += L[l][i].some(x => x.id === 'zuck') ? 6 : 0;
          if (d === 'tosta') v += r.next() * 0.5; else v += r.next() * 2;
          return v;
        };
        lane = free.sort((a, b) => score(b) - score(a))[0];
      }
      p.hand.splice(p.hand.indexOf(h), 1); p.pending.push({ u: h.u, id: h.id, lane }); energy -= c.cost;
    }
    p.planned = true; p.ended = true;
  }

  const game = {
    act(pid, a) {
      const i = idx(pid);
      if (i < 0) return { ok: false, error: 'non sei nel duello' };
      if (S.result) return { ok: false, error: 'duello finito' };
      if (!a) return { ok: false, error: 'mossa sconosciuta' };
      const p = P[i];
      if (S.phase !== 'plan') return { ok: false, error: 'aspetta che si girino le carte' };
      if (p.ended && a.k !== 'unend') return { ok: false, error: 'hai già finito il turno' };
      if (a.k === 'place') {
        const h = p.hand.find(x => x.u === a.u); const lane = a.lane | 0;
        if (!h) return { ok: false, error: 'carta non in mano' };
        if (lane < 0 || lane > 2) return { ok: false, error: 'corsia sbagliata' };
        if (sideCount(lane, i, i) >= LANE_MAX) return { ok: false, error: 'corsia piena' };
        if (BY_ID[h.id].cost > p.energy - pendCost(i)) return { ok: false, error: 'non hai abbastanza birre' };
        p.hand.splice(p.hand.indexOf(h), 1); p.pending.push({ u: h.u, id: h.id, lane });
        return { ok: true };
      }
      if (a.k === 'deck') { // il proprio mazzo (dalla collezione), solo all'inizio: turno 1, niente ancora piazzato
        const d = validDeck(a.ids);
        if (!d) return { ok: false, error: `il mazzo deve avere da ${DECK_MIN} a ${DECK_MAX} figurine` };
        if (S.turn !== 1 || p.pending.length || p.ended) return { ok: false, error: 'il mazzo si sceglie prima di iniziare' };
        p.deck = r.shuffle(d.slice()); p.hand = []; draw(i, 4);
        return { ok: true };
      }
      if (a.k === 'undo') { const x = p.pending.find(y => y.u === a.u); if (!x) return { ok: false, error: 'niente da riprendere' }; p.pending.splice(p.pending.indexOf(x), 1); p.hand.push({ u: x.u, id: x.id }); return { ok: true }; }
      if (a.k === 'end') { p.ended = true; ev.push({ k: 'ended', side: i }); if (P.every(q => q.ended)) beginReveal(); return { ok: true }; }
      return { ok: false, error: 'mossa sconosciuta' };
    },
    tick(dt) {
      if (S.result) return;
      if (S.phase === 'plan') {
        for (let i = 0; i < 2; i++) if (P[i].bot && !P[i].planned) { S.botT -= dt; if (S.botT <= 0) { botPlan(i); ev.push({ k: 'ended', side: i }); } }
        if (S.turnT > 0) { S.turnT -= dt; if (S.turnT <= 0) for (let i = 0; i < 2; i++) if (!P[i].ended) { P[i].ended = true; ev.push({ k: 'timeout', side: i }); } }
        if (P.every(q => q.ended)) beginReveal();
        return;
      }
      if (S.phase === 'reveal') {
        S.wait -= dt; if (S.wait > 0) return;
        if (S.queue.length) { revealOne(S.queue.shift()); S.wait = opts.fast ? 0 : 0.75; return; }
        if (S.turn >= MAX_TURN) finish(); else startTurn();
      }
    },
    view(pid) {
      const i = Math.max(0, idx(pid)), en = 1 - i, me = P[i], th = P[en];
      const lane = l => ({
        name: LANES[l],
        mine: L[l][i].map(c => ({ u: c.u, id: c.id, power: power(c, l, i), base: c.base, mod: c.mod, token: !!c.token })),
        theirs: L[l][en].map(c => ({ u: c.u, id: c.id, power: power(c, l, en), base: c.base, mod: c.mod, token: !!c.token })),
        myPow: lanePow(l, i), theirPow: lanePow(l, en), winner: laneWinner(l) === -1 ? 0 : laneWinner(l) === i ? 1 : -1,
        pending: me.pending.filter(x => x.lane === l).map(x => ({ u: x.u, id: x.id })),
        theirPending: S.phase === 'plan' ? th.pending.filter(x => x.lane === l).length : 0,
      });
      return {
        type: 'figurine', me: idx(pid), turn: S.turn, maxTurn: MAX_TURN, phase: S.phase,
        energy: me.energy - pendCost(i), energyMax: me.energy, ended: me.ended,
        hand: me.hand.slice(), deck: me.deck.length,
        opp: { id: th.id, name: th.name, bot: th.bot, hand: th.hand.length, deck: th.deck.length, ended: th.ended },
        lanes: [0, 1, 2].map(lane), first: S.first === i,
        turnLeft: S.phase === 'plan' && S.turnT > 0 ? Math.ceil(S.turnT) : null,
        result: S.result,
      };
    },
    drain() { const e = ev; ev = []; return e; },
    leave(pid) { const i = idx(pid); if (i >= 0 && !P[i].bot) { P[i].bot = true; P[i].planned = P[i].ended; ev.push({ k: 'left', side: i }); } },
    get over() { return S.result; },
    _state: () => ({ P, L, S }),
  };
  startTurn();
  return game;
}

// ---------------- scambio di figurine online (2 giocatori): ognuno offre una carta, entrambi accettano ----------------
// La collezione è nel salvataggio di ognuno: il server fa da notaio (chi dà cosa), i client applicano lo scambio.
export const tradeMeta = { type: 'scambio', name: 'Scambio figurine', minPlayers: 2, maxPlayers: 2, tickHz: 0, dropIn: true };
export function createTrade({ players }) {
  const P = players.slice(0, 2).map(p => ({ id: String(p.id), name: String(p.name || p.id).slice(0, 24), bot: !!p.bot, offer: null, ok: false }));
  let ev = [], result = null;
  const idx = pid => P.findIndex(p => p.id === String(pid));
  return {
    act(pid, a) {
      const i = idx(pid); if (i < 0) return { ok: false, error: 'non sei nello scambio' };
      if (result) return { ok: false, error: 'scambio chiuso' };
      if (a.k === 'offer') { if (a.card && !BY_ID[a.card.id]) return { ok: false, error: 'figurina sconosciuta' }; P[i].offer = a.card ? { id: a.card.id, shiny: !!a.card.shiny } : null; for (const p of P) p.ok = false; ev.push({ k: 'offer', side: i, card: P[i].offer }); return { ok: true }; }
      if (a.k === 'accept') {
        if (P.length < 2 || !P[0].offer || !P[1].offer) return { ok: false, error: 'servono due offerte' };
        P[i].ok = true; ev.push({ k: 'accept', side: i });
        if (P[0].ok && P[1].ok) { result = { winners: [], scores: {}, swap: { [P[0].id]: { give: P[0].offer, get: P[1].offer }, [P[1].id]: { give: P[1].offer, get: P[0].offer } }, summary: 'Scambio fatto' }; ev.push({ k: 'over', ...result }); }
        return { ok: true };
      }
      if (a.k === 'cancel') { result = { winners: [], scores: {}, cancelled: true, summary: 'Scambio annullato' }; ev.push({ k: 'over', ...result }); return { ok: true }; }
      return { ok: false, error: 'mossa sconosciuta' };
    },
    view(pid) { const i = Math.max(0, idx(pid)); return { type: 'scambio', me: idx(pid), mine: P[i] && P[i].offer, theirs: P[1 - i] ? P[1 - i].offer : null, other: P[1 - i] ? P[1 - i].name : null, okMe: !!(P[i] && P[i].ok), okThem: !!(P[1 - i] && P[1 - i].ok), result }; },
    drain() { const e = ev; ev = []; return e; },
    join(p) { if (P.length >= 2) return false; P.push({ id: String(p.id), name: String(p.name || p.id).slice(0, 24), bot: false, offer: null, ok: false }); ev.push({ k: 'join' }); return true; },
    leave(pid) { const i = idx(pid); if (i >= 0 && !result) { result = { winners: [], scores: {}, cancelled: true, summary: 'Scambio annullato' }; ev.push({ k: 'over', ...result }); } },
    get over() { return result; },
  };
}
