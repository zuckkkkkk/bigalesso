// shared/sfida.mjs — "Sfida a punti": head-to-head versions of the small minigames (rules, see shared/README.md).
//  kind 'sushi'   (src/minigames/sushi.js): everyone eats at his own belt for 60 s, points are reported as you grab them
//                 (the referee caps them: ≤ 3 per plate, a plate every ~0.3 s), live scoreboard, highest score wins.
//  kind 'discord' (src/minigames/discord.js): the reflex duel for 2–6 — the referee decides when (and where) the target
//                 shows up, each client measures its own reaction from the moment it sees it (fair whatever the ping),
//                 too early = round lost, fastest of the round +1, 5 rounds.
// Bots play too (seeded). opts: { kind: 'sushi'|'discord' }
// Actions: sushi { pt: 1..3 } · { done: true } — discord { ms: n } (≥ 140) · { early: true }
// view(id): { kind, ph:'ready'|'play'|'wait'|'go'|'res'|'end', left, round, rounds, tgt:[x, y, size] (go), me,
//   sc:[{ id, name, bot, pts, n, ms, done }], res:{ ms:{id:n}, win:[ids] } }
import { rng } from './rng.mjs';

export const meta = { type: 'sfida', name: 'Sfida a punti', minPlayers: 2, maxPlayers: 6, tickHz: 10, viewHz: 5, dropIn: false };
export const KINDS = {
  sushi: { name: 'Sushi all you can eat', icon: '🍣', ready: 7, dur: 60, maxPt: 3, rate: 7, burst: 9 },
  discord: { name: 'Compettina Discord', icon: '🎧', ready: 4, rounds: 5, go: 1.6, res: 2.2, minMs: 140, maxMs: 1600 },
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function create({ players = [], opts = {}, seed = 1 } = {}) {
  const kind = KINDS[opts.kind] ? opts.kind : 'sushi', K = KINDS[kind];
  const R = rng(seed);
  const P = players.slice(0, 6).map(p => ({ id: p.id, name: String(p.name || 'Giocatore').slice(0, 16), bot: !!p.bot, pts: 0, n: 0, ms: null, done: false, gone: false, bucket: K.burst || 0,
    skill: 0.35 + R.next() * 0.3, react: 230 + R.next() * 150, cd: 1 + R.next() * 2 }));
  const by = new Map(P.map(p => [p.id, p]));
  const S = { ph: 'ready', t: 0, round: 0, wait: 0, tgt: null, res: null, over: null, ev: [], ans: new Map() };
  const push = e => { if (S.ev.length < 50) S.ev.push(e); };
  const humans = () => P.filter(p => !p.bot && !p.gone);
  function finish() {
    S.ph = 'end'; S.t = 0;
    const list = P.slice().sort((a, b) => b.pts - a.pts || b.n - a.n), top = list.length ? list[0].pts : 0;
    const winners = list.filter(p => p.pts === top && top > 0).map(p => p.id);
    S.over = { winners, kind, scores: Object.fromEntries(P.map(p => [p.id, p.pts])), table: list.map(p => ({ id: p.id, name: p.name, pts: p.pts, n: p.n, bot: p.bot })),
      summary: winners.length ? `${winners.map(id => by.get(id).name).join(' e ')} ${winners.length > 1 ? 'vincono' : 'vince'} ${K.name.toLowerCase().includes('sushi') ? 'il sushi' : 'la compettina'} con ${top} punti` : 'Nessun vincitore' };
    push({ k: 'end' });
  }
  // ---------------- discord rounds
  function nextRound() {
    if (S.round >= K.rounds) { finish(); return; }
    S.round++;
    S.ph = 'wait'; S.t = 0; S.wait = 1.4 + R.next() * 2.6; S.ans = new Map(); S.res = null;
    S.tgt = [Math.round((0.12 + R.next() * 0.76) * 100) / 100, Math.round((0.18 + R.next() * 0.62) * 100) / 100, Math.max(30, 64 - S.round * 7)];
    for (const p of P) p.ms = null;
    push({ k: 'round', round: S.round });
  }
  function closeRound() {
    for (const p of P) if (p.bot && !S.ans.has(p.id)) S.ans.set(p.id, clamp(p.react + (R.next() - 0.4) * 120 - S.round * 4, 175, 600));
    let best = Infinity; for (const [, ms] of S.ans) if (ms < best) best = ms;
    const win = best < Infinity && best < 9000 ? [...S.ans].filter(([, ms]) => ms === best).map(([id]) => id) : [];
    for (const id of win) by.get(id).pts++;
    for (const p of P) { p.ms = S.ans.has(p.id) ? S.ans.get(p.id) : null; if (p.ms !== null && p.ms < 9000) p.n++; }
    S.res = { ms: Object.fromEntries(S.ans), win }; S.ph = 'res'; S.t = 0;
    push({ k: 'res', round: S.round, win });
  }
  const game = {
    act(id, a) {
      const p = by.get(id); if (!p || p.gone) return { ok: false, error: 'non sei nella sfida' };
      if (!a || typeof a !== 'object') return { ok: false, error: 'azione' };
      if (kind === 'sushi') {
        if (a.done) { p.done = true; return { ok: true }; }
        if (a.pt === undefined) return { ok: false, error: 'azione' };
        if (S.ph !== 'play') return { ok: false, error: 'non è ancora il via' };
        const n = a.pt | 0; if (n < 1 || n > K.maxPt) return { ok: false, error: 'punti non validi' };
        if (p.bucket < n) return { ok: false, error: 'troppo veloce' };
        p.bucket -= n; p.pts += n; p.n++;
        return { ok: true };
      }
      if (a.early) { if (S.ph !== 'wait') return { ok: false, error: 'tardi' }; if (!S.ans.has(id)) { S.ans.set(id, 9999); push({ k: 'early', id }); } return { ok: true }; }
      if (a.ms !== undefined) {
        if (S.ph !== 'go') return { ok: false, error: S.ph === 'wait' ? 'troppo presto' : 'round chiuso' };
        if (S.ans.has(id)) return { ok: false, error: 'hai già sparato' };
        const ms = +a.ms; if (!Number.isFinite(ms)) return { ok: false, error: 'tempo' };
        S.ans.set(id, clamp(Math.round(ms), K.minMs, K.maxMs)); push({ k: 'shot', id });
        return { ok: true };
      }
      return { ok: false, error: 'azione sconosciuta' };
    },
    tick(dt) {
      if (S.over) return;
      S.t += dt;
      if (S.ph === 'ready') { if (S.t >= K.ready) { if (kind === 'sushi') { S.ph = 'play'; S.t = 0; push({ k: 'go' }); } else nextRound(); } return; }
      if (kind === 'sushi') {
        for (const p of P) {
          p.bucket = Math.min(K.burst, p.bucket + K.rate * dt);
          if (p.bot && S.ph === 'play') { p.cd -= dt; if (p.cd <= 0) { p.cd = 1.4 + R.next() * 2; if (R.next() < p.skill) { const pts = R.next() < 0.12 ? 3 : 1; p.pts += pts; p.n++; } } }
        }
        if (S.ph === 'play' && (S.t >= K.dur + 2 || humans().every(p => p.done) && S.t > 3)) finish();
        return;
      }
      if (S.ph === 'wait' && S.t >= S.wait) { S.ph = 'go'; S.t = 0; push({ k: 'go', round: S.round }); }
      else if (S.ph === 'go') { const hs = humans(); if (S.t >= K.go || (hs.length && hs.every(p => S.ans.has(p.id)))) closeRound(); }
      else if (S.ph === 'wait' && humans().length && humans().every(p => S.ans.get(p.id) === 9999)) closeRound();
      else if (S.ph === 'res' && S.t >= K.res) nextRound();
    },
    view(id) {
      const left = S.ph === 'ready' ? K.ready - S.t : S.ph === 'play' ? K.dur - S.t : 0;
      return { kind, ph: S.ph, left: Math.max(0, Math.round(left * 10) / 10), round: S.round, rounds: K.rounds || 0, me: id,
        tgt: S.ph === 'go' ? S.tgt : null, mine: S.ans.has(id) ? S.ans.get(id) : null,
        sc: P.map(p => ({ id: p.id, name: p.name, bot: p.bot, pts: p.pts, n: p.n, ms: p.ms, done: p.done })),
        res: S.res, over: S.over ? { winners: S.over.winners, summary: S.over.summary } : null };
    },
    drain() { const e = S.ev; S.ev = []; return e; },
    leave(id) { const p = by.get(id); if (p) { p.gone = true; p.done = true; } },
    get over() { return S.over; },
    _state: S, _P: P,
  };
  return game;
}
