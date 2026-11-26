// "Dadi al Celtic" — tiny reference game for the shared-rules contract (see README.md).
// Each turn you roll two dice as many times as you like: the sum adds to your turn pot, a 1 on either die loses
// the pot and passes the turn; "Basta" banks the pot. First to the target wins. Every player has a secret lucky
// number (2–6): a die showing it counts double. Only you see yours (hidden info, checked by the tests).
import { rng } from './rng.mjs';

export const meta = { type: 'dadi', name: 'Dadi al Celtic', minPlayers: 2, maxPlayers: 6, tickHz: 0, dropIn: false, board: { id: 'dadi', lower: false } };

export function create({ players, opts = {}, seed }) {
  const R = rng(seed);
  const target = Math.max(20, Math.min(200, +opts.target || 50));
  const P = players.map(p => ({ id: String(p.id), name: String(p.name || 'Giocatore'), bot: !!p.bot, score: 0, lucky: 2 + R.int(5), gone: false }));
  if (P.length < 1) throw new Error('nessun giocatore');
  let turn = 0, pot = 0, dice = null, over = null, rolls = 0;
  const events = [], log = [];
  const say = (e, line) => { events.push(e); if (line) { log.push(line); if (log.length > 6) log.shift(); } };
  const cur = () => P[turn];
  const byId = id => P.find(p => p.id === id);

  function next() { pot = 0; rolls = 0; turn = (turn + 1) % P.length; say({ k: 'turn', p: cur().id }, 'Tocca a ' + cur().name); }
  function roll(p) {
    const d = [1 + R.int(6), 1 + R.int(6)]; dice = d; rolls++;
    if (d[0] === 1 || d[1] === 1) { say({ k: 'roll', p: p.id, dice: d, bust: true, lost: pot }, p.name + ' tira ' + d.join('+') + ': sballato, perde ' + pot); next(); return; }
    const gain = d.reduce((s, v) => s + (v === p.lucky ? v * 2 : v), 0);
    pot += gain; say({ k: 'roll', p: p.id, dice: d, gain }, p.name + ' tira ' + d.join('+') + ' (+' + gain + ')');
    if (p.score + pot >= target) bank(p);
  }
  function bank(p) {
    p.score += pot; say({ k: 'bank', p: p.id, pts: pot }, p.name + ' si ferma: ' + p.score);
    if (p.score >= target) { over = { winners: [p.id], scores: Object.fromEntries(P.map(q => [q.id, q.score])), summary: p.name + ' vince a ' + p.score }; say({ k: 'win', p: p.id }, over.summary); return; }
    next();
  }
  function bots() { // bots (and players who left) play their turns right away
    for (let guard = 0; !over && (cur().bot || cur().gone) && guard < 500; guard++) {
      const p = cur();
      if (pot >= 15 || p.score + pot >= target || rolls >= 6) bank(p); else roll(p);
    }
  }
  bots();

  return {
    act(pid, a) {
      if (over) return { ok: false, error: 'partita finita' };
      const p = byId(String(pid)); if (!p) return { ok: false, error: 'non sei al tavolo' };
      if (p !== cur()) return { ok: false, error: 'non è il tuo turno' };
      const k = a && a.k;
      if (k === 'roll') roll(p);
      else if (k === 'stop') { if (!rolls) return { ok: false, error: 'tira almeno una volta' }; bank(p); }
      else return { ok: false, error: 'mossa sconosciuta' };
      bots();
      return { ok: true };
    },
    view(pid) {
      const me = byId(String(pid));
      return {
        target, turn: cur().id, pot, dice, rolls, log: log.slice(),
        players: P.map(p => ({ id: p.id, name: p.name, bot: p.bot, score: p.score, ...(over ? { lucky: p.lucky } : {}) })),
        myLucky: me ? me.lucky : null, over: over ? over.summary : null,
      };
    },
    drain() { return events.splice(0); },
    leave(pid) { const p = byId(String(pid)); if (p) { p.gone = true; bots(); } },
    get over() { return over; },
  };
}
