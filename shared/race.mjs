// shared/race.mjs — races in the quartiere (rules shared by server and browser, see README.md).
// Tracks are center-line polylines [x, z, width] on the real streets (world units, metres); every point with a gate
// is a checkpoint that must be crossed in order. "sprint" tracks go from A to B (1 lap), "circuit" tracks loop.
// Humans report their car state (act {k:'state'}), the rules check checkpoint order and timing, reject teleports
// (speed between reports above the physical maximum) and rank everybody. Bots (the friends) drive the polyline with
// a speed profile from the corners, a personal skill and rubber banding around the leading human.
import { rng } from './rng.mjs';

export const meta = { type: 'race', name: 'Gara', minPlayers: 1, maxPlayers: 8, tickHz: 15, dropIn: false };

// [x, z, width, gate?] — width = drivable width (bots stay inside it, gates are this wide)
export const TRACKS = {
  portici: {
    name: 'Giro dei Portici', kind: 'sprint', laps: 1, dir: Math.PI / 2,
    desc: 'Dal Checkpoint su per Via Teletubbylandia, dentro il Voltone tra le colonne, Piazza Verdi, Rizzoli e il giro di Piazza Maggiore.',
    pts: [[-31, 26.8, 4.2, 1], [-20, 26.8, 4.2], [-11, 26.6, 3.6, 1], [-7.4, 27.2, 3.6], [-5.24, 28.8, 3.0], [-5.24, 31.8, 2.8, 1],
      [-5.0, 39, 4.2], [-5.0, 47.5, 4.6, 1], [-3.5, 55, 5], [3.5, 61, 5, 1], [5, 70, 5], [0, 76.8, 5, 1], [-6.2, 78.8, 5],
      [-5.8, 84, 5, 1], [-5.8, 95, 5], [-8.5, 100.8, 5, 1], [-19, 100.9, 5], [-27, 99.3, 5, 1], [-28, 90, 5], [-27.5, 83, 5, 1],
      [-24, 77.2, 5], [-15, 76.8, 5, 1]],
    grid: [[-34.5, 25.7], [-34.5, 27.9], [-39.5, 25.7], [-39.5, 27.9]],
  },
  rally: {
    name: 'Teletubbylandia Rally', kind: 'circuit', laps: 4, dir: -Math.PI / 2,
    desc: 'Giri del prato: laghetto, quercia, siepi e il cartello del calcetto. Sterrato, si derapa.',
    pts: [[-55, 28.2, 5, 1], [-67, 26.8, 5], [-77, 25.4, 5, 1], [-84.5, 23.2, 4.5], [-85, 16, 4.5, 1], [-80.5, 10.4, 4.5],
      [-70, 8.6, 4, 1], [-61, 8.9, 4], [-56.4, 10.6, 4], [-54.2, 13.5, 4, 1], [-53.8, 19, 4], [-51.2, 24, 4.5, 1]],
    grid: [[-51.6, 27.2], [-51.6, 29.6], [-48.1, 27.2], [-48.1, 29.6]],
  },
  notturna: {
    name: 'Notturna del Millennium', kind: 'circuit', laps: 3, dir: Math.PI / 2,
    desc: 'Quando chiude il Millennium: giri in notturna da Piazza Verdi a Rizzoli, attorno al Nettuno e sotto San Petronio.',
    pts: [[-4, 58, 5, 1], [4, 58, 5], [5, 66, 5, 1], [5, 71, 5], [0, 76.8, 5, 1], [-6.2, 78.8, 5], [-5.8, 84, 5, 1], [-5.8, 96, 5],
      [-8, 100.9, 5, 1], [-26, 100.9, 5], [-28, 98, 5, 1], [-28, 84, 5], [-26, 77, 5, 1], [-12, 76.6, 5], [-11, 70, 5, 1], [-11.5, 60, 5]],
    grid: [[-7.5, 57.0], [-7.5, 59.4], [-11, 57.0], [-11, 59.4]],
  },
};
export const VMAX_HUMAN = 34;          // m/s: the fastest tuned 500 with nitro (~120 km/h) + margin
const BOT_NAMES = [['forla', 'Forla'], ['asche', 'Asche'], ['seghino', 'Seghino'], ['lombu', 'Lombu'], ['parme', 'Parme'], ['ashish', 'Ashish'], ['cesco', 'Cesco'], ['ricky', 'Ricky Catta']];
export const botNames = (n, seed = 1) => { const r = rng(seed); return r.shuffle(BOT_NAMES.slice()).slice(0, n).map(([id, name]) => ({ id: 'bot_' + id, name, bot: true, persona: id })); };

// ------------------------------------------------------------------ geometry helpers
export function trackGeom(id) {
  const T = TRACKS[id]; if (!T) return null;
  const pts = T.pts.map(p => ({ x: p[0], z: p[1], w: p[2], gate: !!p[3] }));
  const loop = T.kind === 'circuit';
  const segs = []; let L = 0;
  const n = pts.length, ns = loop ? n : n - 1;
  for (let i = 0; i < ns; i++) {
    const a = pts[i], b = pts[(i + 1) % n], dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    segs.push({ a, b, i, len, s0: L, ux: dx / len, uz: dz / len }); L += len;
  }
  // corner speed limit at each point (turn angle between the two segments)
  for (let i = 0; i < n; i++) {
    const sin = loop || (i > 0 && i < n - 1) ? segs[(i - 1 + segs.length) % segs.length] : null, sout = segs[i] || null;
    let ang = 0; if (sin && sout) ang = Math.acos(Math.max(-1, Math.min(1, sin.ux * sout.ux + sin.uz * sout.uz)));
    pts[i].ang = ang; pts[i].vlim = Math.max(6.5, 26 * (1 - ang / Math.PI * 1.7)) * Math.min(1, 0.55 + pts[i].w / 9);
    pts[i].s = i < segs.length ? segs[i].s0 : L;
  }
  // gates: checkpoint index -> point index; the start/finish line is gate 0 (circuits) or the first/last point (sprints)
  const gates = []; pts.forEach((p, i) => { if (p.gate) gates.push(i); });
  if (!loop) { if (gates[0] !== 0) gates.unshift(0); if (gates[gates.length - 1] !== n - 1) gates.push(n - 1); }
  else if (gates[0] !== 0) gates.unshift(0);
  // gate segments (perpendicular to the track direction at that point)
  const gateSeg = gates.map(pi => {
    const p = pts[pi], s = segs[Math.min(pi, segs.length - 1)], prev = segs[(pi - 1 + segs.length) % segs.length];
    let dx = s.ux, dz = s.uz; if (pi === n - 1 && !loop) { dx = prev.ux; dz = prev.uz; } else if (loop || pi > 0) { dx = (s.ux + prev.ux); dz = (s.uz + prev.uz); const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; }
    const hw = p.w / 2 + 1.2; // a little forgiving
    return { pi, x: p.x, z: p.z, dx, dz, ax: p.x - dz * hw, az: p.z + dx * hw, bx: p.x + dz * hw, bz: p.z - dx * hw, yaw: Math.atan2(dx, dz), w: p.w };
  });
  return { id, T, pts, segs, L, loop, gates, gateSeg };
}

// point at distance s along the track (+ lateral offset), with heading
export function pointAt(G, s, lat = 0, out = {}) {
  const L = G.L; if (G.loop) s = ((s % L) + L) % L; else s = Math.max(0, Math.min(L, s));
  let lo = 0, hi = G.segs.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (G.segs[m].s0 <= s) lo = m; else hi = m - 1; }
  const g = G.segs[lo], k = Math.min(1, (s - g.s0) / g.len);
  // smooth the heading across the corner (blend into the next segment over the last 30%)
  const nx = G.segs[(lo + 1) % G.segs.length], last = !G.loop && lo === G.segs.length - 1;
  const bl = last ? 0 : Math.max(0, (k - 0.7) / 0.3) * 0.5;
  const ux = g.ux * (1 - bl) + nx.ux * bl, uz = g.uz * (1 - bl) + nx.uz * bl, ul = Math.hypot(ux, uz) || 1;
  out.x = g.a.x + (g.b.x - g.a.x) * k + (uz / ul) * lat; out.z = g.a.z + (g.b.z - g.a.z) * k - (ux / ul) * lat;
  out.yaw = Math.atan2(ux, uz); out.seg = lo; out.w = g.a.w + (g.b.w - g.a.w) * k;
  return out;
}

// projection of a world point on the track near the segment hint: { s, d (distance from the center line), seg }
export function project(G, x, z, hint = 0, span = 3) {
  let best = null; const n = G.segs.length;
  for (let j = -span; j <= span; j++) {
    let i = hint + j; if (G.loop) i = ((i % n) + n) % n; else if (i < 0 || i >= n) continue;
    const g = G.segs[i], px = x - g.a.x, pz = z - g.a.z; const t = Math.max(0, Math.min(g.len, px * g.ux + pz * g.uz));
    const cx = g.a.x + g.ux * t, cz = g.a.z + g.uz * t, d = Math.hypot(x - cx, z - cz);
    if (!best || d < best.d) best = { s: g.s0 + t, d, seg: i };
  }
  return best;
}

// segment (p0->p1) crosses gate segment?
function crosses(gs, x0, z0, x1, z1) {
  const d = (ax, az, bx, bz, cx, cz) => (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
  const d1 = d(gs.ax, gs.az, gs.bx, gs.bz, x0, z0), d2 = d(gs.ax, gs.az, gs.bx, gs.bz, x1, z1);
  const d3 = d(x0, z0, x1, z1, gs.ax, gs.az), d4 = d(x0, z0, x1, z1, gs.bx, gs.bz);
  if (!((d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0))) return false;
  // only forwards: moving along the gate direction
  return (x1 - x0) * gs.dx + (z1 - z0) * gs.dz > 0;
}

// ------------------------------------------------------------------ the rules
export function create({ players, opts = {}, seed = 1 }) {
  const R = rng(seed);
  const trackId = TRACKS[opts.track] ? opts.track : 'portici';
  const G = trackGeom(trackId), T = G.T;
  const laps = T.kind === 'circuit' ? Math.max(1, Math.min(5, opts.laps | 0 || T.laps)) : 1;
  const mode = opts.mode || 'race'; // 'time' (alone + ghost), 'race' (vs bots), 'online'
  const total = G.L * laps;
  const st = { phase: 'grid', t: 0, cd: 3, goT: 0, events: [], finishedN: 0, firstFinishT: null, over: null, readyT: 0 };
  const P = new Map();
  const addPlayer = (p, slot) => {
    const g = T.grid[slot % T.grid.length], back = Math.floor(slot / T.grid.length) * 4.5;
    const gx = g[0] - Math.sin(T.dir) * back, gz = g[1] - Math.cos(T.dir) * back;
    P.set(p.id, {
      id: p.id, name: p.name || 'Pilota', bot: !!p.bot, persona: p.persona || null, slot, x: gx, z: gz, yaw: T.dir, v: 0,
      lap: 0, gate: G.loop ? 1 : 1, seg: 0, s: 0, prog: 0, done: false, time: null, rank: slot + 1, lastT: 0, warn: 0, ready: !!p.bot, bud: 4,
      // bot driving
      skill: 0.86 + R.next() * 0.12, lat: (R.next() - 0.5) * 1.2, latT: 0, bs: 0, bv: 0, mood: R.next(),
      best: null, lapStart: 0, laps: [],
    });
  };
  let slot = 0;
  for (const p of players) addPlayer(p, slot++);
  if ((mode === 'race' || (mode === 'online' && opts.bots > 0)) && !players.some(p => p.bot)) { // online: bots only if the host asked
    const want = Math.max(0, Math.min(3, opts.bots ?? 3));
    for (const b of botNames(want, seed)) addPlayer(b, slot++);
  }
  // bots start at their grid slot: their s along the track is the projection of the slot (negative before the line)
  for (const p of P.values()) {
    const pr = project(G, p.x, p.z, 0, 2); const ahead = (p.x - G.pts[0].x) * Math.sin(T.dir) + (p.z - G.pts[0].z) * Math.cos(T.dir);
    p.bs = ahead < 0 ? ahead : pr.s; p.s = p.bs; p.lat = p.bot ? Math.max(-1, Math.min(1, (p.x - G.pts[0].x) * Math.cos(T.dir) - (p.z - G.pts[0].z) * Math.sin(T.dir))) : 0;
  }
  const humans = () => [...P.values()].filter(p => !p.bot);
  const ev = e => st.events.push(e);

  function progressOf(p) {
    if (p.done) return total + 1000 - (p.time || 0) * 0.001;
    if (p.bot) return p.bs;
    // humans: completed gates + projection between the last gate and the next one
    const lastPi = G.gates[(p.gate - 1 + G.gates.length) % G.gates.length];
    const base = G.pts[lastPi].s + p.lap * G.L;
    const pr = project(G, p.x, p.z, p.seg, 2); if (pr) p.seg = pr.seg;
    const s = pr ? pr.s : G.pts[lastPi].s; let ds = s - G.pts[lastPi].s;
    if (G.loop) { if (ds > G.L / 2) ds -= G.L; else if (ds < -G.L / 2) ds += G.L; } // on the grid, behind the line: negative
    return base + ds;
  }

  function passGate(p, gi, now) {
    ev({ k: 'cp', id: p.id, cp: gi, lap: p.lap });
    const last = G.loop ? gi === 0 : gi === G.gates.length - 1;
    if (G.loop && gi === 0) {
      const lt = now - p.lapStart; p.lapStart = now; p.laps.push(+lt.toFixed(3)); if (!p.best || lt < p.best) p.best = +lt.toFixed(3);
      p.lap++; ev({ k: 'lap', id: p.id, lap: p.lap, time: +lt.toFixed(3) });
      if (p.lap >= laps) return finish(p, now);
      p.gate = 1;
    } else if (last) return finish(p, now);
    else p.gate = gi + 1;
  }
  function finish(p, now) {
    p.done = true; p.time = +now.toFixed(3); st.finishedN++; p.rank = st.finishedN;
    if (st.firstFinishT === null) st.firstFinishT = st.t;
    ev({ k: 'finish', id: p.id, rank: p.rank, time: p.time, bot: p.bot });
  }

  function botTick(p, dt, leaderS, humanS) {
    if (p.done) return;
    const look = 9 + p.bv * 0.6; // brake for the next corner in time
    const here = pointAt(G, p.bs + look, 0, {});
    const pi = Math.min(G.pts.length - 1, here.seg + 1), lim = G.pts[pi].vlim;
    let want = Math.min(24 * p.skill, lim * (0.92 + p.skill * 0.12));
    // rubber band around the best human (keeps races close; strong in 'race' mode, none online)
    if (humanS !== null && mode !== 'online') { const gap = p.bs - humanS; if (gap > 35) want *= 0.8; else if (gap > 15) want *= 0.92; else if (gap < -40) want *= 1.18; else if (gap < -15) want *= 1.08; }
    const acc = want > p.bv ? 5.2 : -10;
    p.bv = Math.max(0, Math.min(want, p.bv + acc * dt));
    if (p.bv > want) p.bv = want;
    const prevS = p.bs; p.bs += p.bv * dt;
    // weave a little, stay inside the road
    p.latT -= dt; if (p.latT <= 0) { p.latT = 2 + R.next() * 3; p.latGoal = (R.next() - 0.5) * Math.max(0.2, (here.w || 3) - 2.2); }
    p.lat += ((p.latGoal || 0) - p.lat) * Math.min(1, dt * 0.8);
    const q = pointAt(G, Math.max(0, p.bs), p.lat, {});
    if (p.bs < 0) { // still behind the line on the grid: slide along the grid direction
      const s0 = G.pts[0]; q.x = s0.x + Math.sin(T.dir) * p.bs + Math.cos(T.dir) * p.lat; q.z = s0.z + Math.cos(T.dir) * p.bs - Math.sin(T.dir) * p.lat; q.yaw = T.dir;
    }
    p.x = q.x; p.z = q.z; p.yaw = q.yaw; p.v = p.bv;
    // gates for bots: by distance along the track
    const lapS = G.loop ? Math.floor(p.bs / G.L) : 0, sIn = G.loop ? p.bs - lapS * G.L : p.bs, pIn = G.loop ? prevS - Math.floor(prevS / G.L) * G.L : prevS;
    if (G.loop && lapS > p.lap && p.bs > 0) { passGate(p, 0, st.t - st.goT); return; }
    const gi = p.gate, pi2 = G.gates[gi];
    if (gi !== undefined && pi2 !== undefined && !(G.loop && gi === 0) && sIn >= G.pts[pi2].s && pIn < G.pts[pi2].s + 0.01 && p.bs > 0) passGate(p, gi, st.t - st.goT);
    if (!G.loop && p.bs >= G.L && !p.done) finish(p, st.t - st.goT);
  }

  function rankAll() {
    const arr = [...P.values()]; for (const p of arr) p.prog = progressOf(p);
    arr.sort((a, b) => (a.done && b.done) ? a.time - b.time : b.prog - a.prog);
    arr.forEach((p, i) => { const was = p.rank; p.rank = i + 1; if (st.phase === 'race' && !p.done && was > p.rank && p.rank === 1) ev({ k: 'lead', id: p.id }); });
  }

  const game = {
    act(id, a) {
      const p = P.get(id); if (!p || !a) return { ok: false, error: 'chi sei?' };
      if (a.k === 'ready') { p.ready = true; return { ok: true }; }
      if (a.k === 'quit') { p.done = true; p.time = null; p.quit = true; ev({ k: 'quit', id }); return { ok: true }; }
      if (a.k !== 'state') return { ok: false, error: 'azione sconosciuta' };
      const x = +a.x, z = +a.z; if (!isFinite(x) || !isFinite(z)) return { ok: false, error: 'posizione' };
      if (st.phase === 'grid' || st.phase === 'countdown') { // frozen on the grid: keep the slot position
        p.yaw = +a.yaw || p.yaw; return { ok: true };
      }
      if (p.done) { p.x = x; p.z = z; p.yaw = +a.yaw || 0; p.v = +a.v || 0; return { ok: true }; }
      // anti-teleport: a distance budget refilled by the referee's clock (VMAX_HUMAN · 1.35 per second, capped at 0.4 s
      // of travel + 3 m) and spent by each report. Bunched packets are fine, a jump or a sustained speed hack is not.
      const dist = Math.hypot(x - p.x, z - p.z);
      if (dist > p.bud + 2.5) { // no gate gets credited for this jump; the position is accepted (no desync)
        p.warn++; ev({ k: 'warn', id, d: +dist.toFixed(1) });
        p.x = x; p.z = z; p.yaw = +a.yaw || 0; p.v = 0; p.lastT = st.t; p.bud = 0; return { ok: false, error: 'troppo veloce' };
      }
      p.bud -= dist; // may go down to -2.5 (one-off slack, not per report)
      const now = st.t - st.goT, gi = p.gate, gs = G.gateSeg[gi];
      if (gs && crosses(gs, p.x, p.z, x, z)) passGate(p, gi, now);
      // circuits: after the last gate the next one is the line (gate 0)
      if (G.loop && !p.done && p.gate >= G.gates.length) p.gate = 0;
      p.x = x; p.z = z; p.yaw = +a.yaw || 0; p.v = Math.max(0, Math.min(VMAX_HUMAN, +a.v || 0)); p.lastT = st.t;
      return { ok: true };
    },
    tick(dt) {
      st.t += dt;
      if (st.phase === 'grid') {
        st.readyT += dt;
        const hs = humans();
        if ((hs.length && hs.every(p => p.ready)) || st.readyT > (mode === 'online' ? 20 : 2)) { st.phase = 'countdown'; st.cd = 3; ev({ k: 'countdown' }); }
        return;
      }
      if (st.phase === 'countdown') {
        const before = Math.ceil(st.cd); st.cd -= dt; const after = Math.ceil(st.cd);
        if (after !== before && after > 0) ev({ k: 'beep', n: after });
        if (st.cd <= 0) { st.phase = 'race'; st.goT = st.t; for (const p of P.values()) { p.lastT = st.t; p.lapStart = 0; p.bud = 4; } ev({ k: 'go' }); }
        return;
      }
      if (st.phase !== 'race') return;
      for (const p of P.values()) if (!p.bot) p.bud = Math.min(VMAX_HUMAN * 1.35 * 0.4 + 3, p.bud + VMAX_HUMAN * 1.35 * dt);
      let humanS = null; for (const h of humans()) { const s = progressOf(h); if (humanS === null || s > humanS) humanS = s; }
      for (const p of P.values()) if (p.bot) botTick(p, dt, 0, humanS);
      // circuits: humans whose next gate index wrapped
      for (const p of P.values()) if (!p.bot && G.loop && p.gate >= G.gates.length) p.gate = 0;
      rankAll();
      const allHumansDone = humans().length > 0 && humans().every(p => p.done);
      if (allHumansDone && st.allDoneT === undefined) st.allDoneT = st.t;
      const botsDone = [...P.values()].every(p => p.done);
      const timeout = st.firstFinishT !== null && st.t - st.firstFinishT > (mode === 'online' ? 45 : 25);
      if ((allHumansDone && (botsDone || st.t - st.allDoneT > 6)) || timeout || st.t - st.goT > 600) {
        // whoever is still running gets ranked by progress
        rankAll(); st.phase = 'done';
        const list = [...P.values()].sort((a, b) => a.rank - b.rank);
        const scores = {}; for (const p of list) scores[p.id] = p.time ?? null;
        const w = list.find(p => p.done && !p.quit);
        st.over = { winners: w ? [w.id] : [], scores, ranks: list.map(p => ({ id: p.id, name: p.name, bot: p.bot, rank: p.rank, time: p.time, best: p.best })),
          summary: w ? `${w.name} vince ${T.name}` + (w.time ? ` in ${w.time.toFixed(2)} s` : '') : 'Gara finita' };
        ev({ k: 'over' });
      }
    },
    view(id) {
      const me = P.get(id);
      return {
        track: trackId, laps, mode, phase: st.phase, t: +st.t.toFixed(2), cd: Math.max(0, +st.cd.toFixed(2)), race: st.phase === 'race' || st.phase === 'done' ? +(st.t - st.goT).toFixed(2) : 0,
        gates: G.gates.length,
        me: me ? { id: me.id, lap: me.lap, gate: me.gate, rank: me.rank, done: me.done, time: me.time, best: me.best, laps: me.laps.slice(-5), warn: me.warn, slot: me.slot } : null,
        players: [...P.values()].map(p => ({ id: p.id, name: p.name, bot: p.bot, persona: p.persona, x: +p.x.toFixed(2), z: +p.z.toFixed(2), yaw: +p.yaw.toFixed(3), v: +p.v.toFixed(2), lap: p.lap, gate: p.gate, rank: p.rank, done: p.done, time: p.time, slot: p.slot })),
        n: P.size, over: st.over,
      };
    },
    drain() { const e = st.events; st.events = []; return e; },
    join(p) { if (st.phase !== 'grid' || P.has(p.id) || P.size >= meta.maxPlayers) return false; addPlayer(p, slot++); const q = P.get(p.id); const pr = project(G, q.x, q.z, 0, 2); q.bs = pr ? pr.s : 0; return true; },
    leave(id) { const p = P.get(id); if (!p) return; if (st.phase === 'grid') P.delete(id); else { p.done = true; p.quit = true; } },
    get over() { return st.over; },
    _debug: { G, P, st },
  };
  return game;
}
