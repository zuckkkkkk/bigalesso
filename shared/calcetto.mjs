// shared/calcetto.mjs — "Calcetto online": 1 contro 1 / 2 contro 2 in the Teletubbylandia cage (rules, shared/README.md).
// The referee owns the BALL: it simulates it at 30 Hz (gravity, bounces, rolling friction, spin, boards, posts, crossbar,
// nets) from the players' kick actions; players move on their own client (prediction) and report their position, which
// the referee checks (speed cap, cage). Possession, steals, goals, kick-offs, clock and bots are decided here.
// The same stepBall()/kickVel() run in the browser to predict the ball between views (src/sport/index.js).
// opts: { mode: '1v1'|'2v2' (default by seats), mins: 1..6 (default 3) }
// Actions: { p: [x, z, yaw] }  my position (≈15 Hz)
//          { k: [dx, dz, power 0..1, kind 0 shot | 1 chip | 2 pass] }  kick the ball (I must be at the ball)
// view(id): { ph:'ko'|'play'|'goal'|'end', cl, sc:[a,b], ko, kid, b:[x,y,z,vx,vy,vz], o (owner index | -1), me,
//   ps:[[x, z, yaw, team, bot, goals]], pl:[[id, name]], hm:[x, z, yaw] (my kick-off spot), mode }
import { rng } from './rng.mjs';

export const meta = { type: 'calcetto', name: 'Calcetto online', minPlayers: 2, maxPlayers: 4, tickHz: 30, viewHz: 15, dropIn: false };
export const PITCH = { x0: -71, z0: 34, x1: -53, z1: 45, cx: -62, cz: 39.5, goalW: 3, goalH: 2, goalD: 1.2, board: 1.0 }; // = quartiere/layout.js PITCH
export const R = 0.13;
const G = 9.8, MOUTH = PITCH.goalW / 2;
export const VMAX = 5.2;          // m/s accepted for a player (run 2.7 × speed perks + slack)
export const REACH = 1.45;        // m from the ball to kick it
const BOT_SPEED = 2.45;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r2 = v => Math.round(v * 100) / 100;
const wrapA = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

export function newBall() { return { x: PITCH.cx, y: R, z: PITCH.cz, vx: 0, vy: 0, vz: 0, spin: 0, net: 0 }; }
// one physics substep of a free ball b = { x, y, z, vx, vy, vz, spin, net }; returns '' | 'goal0' | 'goal1' (team that
// scored: 0 attacks +x) | 'post' | 'bounce' | 'reset'. Same maths as the local ball in src/sport/index.js.
export function stepBall(b, h, P = PITCH) {
  let ev = '';
  b.vy -= G * h;
  if (Math.abs(b.spin) > 0.01) { const sx = -b.vz * b.spin * h, sz = b.vx * b.spin * h; b.vx += sx; b.vz += sz; b.spin *= Math.exp(-h * 1.3); }
  const air = Math.exp(-h * 0.05); b.vx *= air; b.vy *= air; b.vz *= air;
  b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h;
  if (b.y < R) { b.y = R; if (b.vy < -0.9) { if (b.vy < -2.5) ev = 'bounce'; b.vy = -b.vy * 0.55; b.vx *= 0.9; b.vz *= 0.9; } else b.vy = 0; }
  if (b.y <= R + 1e-3) { const k = Math.exp(-h * 0.75); b.vx *= k; b.vz *= k; if (Math.hypot(b.vx, b.vz) < 0.05) { b.vx = 0; b.vz = 0; } }
  const soft = b.y > P.board ? 0.28 : 0.62;
  if (b.z < P.z0 + R) { b.z = P.z0 + R; if (b.vz < 0) b.vz = -b.vz * soft; }
  if (b.z > P.z1 - R) { b.z = P.z1 - R; if (b.vz > 0) b.vz = -b.vz * soft; }
  for (const s of [-1, 1]) {
    const gx = s < 0 ? P.x0 : P.x1, out = s < 0 ? b.x < gx + R : b.x > gx - R;
    const inMouth = Math.abs(b.z - P.cz) < MOUTH - R * 0.5 && b.y < P.goalH - R * 0.5;
    if (out && !inMouth && !b.net) {
      if (Math.abs(Math.abs(b.z - P.cz) - MOUTH) < R + 0.05 && b.y < P.goalH + R) { // posts (round)
        const pz = P.cz + Math.sign(b.z - P.cz) * MOUTH; let tx = b.x - gx, tz = b.z - pz; const L = Math.hypot(tx, tz) || 1;
        if (L < R + 0.05) { tx /= L; tz /= L; b.x = gx + tx * (R + 0.05); b.z = pz + tz * (R + 0.05); const vn = b.vx * tx + b.vz * tz; if (vn < 0) { b.vx -= 1.7 * vn * tx; b.vz -= 1.7 * vn * tz; ev = 'post'; } continue; }
      }
      if (Math.abs(b.z - P.cz) < MOUTH && b.y >= P.goalH - R * 0.5 && b.y < P.goalH + R + 0.05) { // crossbar
        const dy = b.y - P.goalH; if (dy < 0 && b.vy > 0) b.vy = -b.vy * 0.6; else b.vy = Math.abs(b.vy) * 0.6;
        b.vx = -b.vx * 0.55; b.x = gx - s * (R + 0.01); ev = 'post'; continue;
      }
      b.x = gx - s * R; if (b.vx * s > 0) b.vx = -b.vx * soft;
    } else if (out || b.net) {
      const inside = s < 0 ? b.x < gx - R * 0.9 : b.x > gx + R * 0.9;
      if (inside && !b.net && Math.abs(b.z - P.cz) < MOUTH) { b.net = s; ev = s < 0 ? 'goal1' : 'goal0'; }
      if (b.net === s) {
        const bx = gx + s * (P.goalD - R);
        if (s < 0 ? b.x < bx : b.x > bx) { b.x = bx; b.vx *= -0.12; b.vy *= 0.5; b.vz *= 0.6; }
        if (Math.abs(b.z - P.cz) > MOUTH - R) { b.z = P.cz + Math.sign(b.z - P.cz) * (MOUTH - R); b.vz *= -0.2; }
        if (b.y > P.goalH - R) { b.y = P.goalH - R; b.vy = Math.min(0, b.vy); }
        const k = Math.exp(-h * 3); b.vx *= k; b.vy *= k; b.vz *= k;
      }
    }
  }
  if (!Number.isFinite(b.x + b.y + b.z) || b.x < P.x0 - 3 || b.x > P.x1 + 3 || b.z < P.z0 - 1 || b.z > P.z1 + 1 || b.y > 20) { Object.assign(b, newBall()); ev = 'reset'; }
  return ev;
}
// velocity of a kick (with the same aim assist as the local game): kind 0 shot, 1 chip (pallonetto), 2 pass
export function kickVel(b, team, dx, dz, power, kind, spinRnd = 0, P = PITCH) {
  let L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
  const p = clamp(+power || 0, 0.12, 1);
  if (kind !== 2) {
    const gx = team === 0 ? P.x1 : P.x0, ax = Math.max(0.2, Math.abs(dx));
    let tx = gx - b.x, tz = clamp(b.z + dz / ax * Math.abs(gx - b.x), P.cz - MOUTH * 0.8, P.cz + MOUTH * 0.8) - b.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    if (dx * tx + dz * tz > Math.cos(0.7)) { dx += (tx - dx) * 0.45; dz += (tz - dz) * 0.45; L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L; }
  }
  if (kind === 1) { const s = 5.5 + p * 5; return { vx: dx * s, vy: 4.2 + p * 2.6, vz: dz * s, spin: 0 }; }
  if (kind === 2) { const s = 5 + p * 8; return { vx: dx * s, vy: 0.3, vz: dz * s, spin: 0 }; }
  const s = 7 + p * 15; return { vx: dx * s, vy: 0.6 + p * p * 3.2, vz: dz * s, spin: spinRnd * 0.25 };
}
// kick-off spots: team 0 defends x0 (attacks +x); slot 0 = forward, slot 1 = back; the kicking team stands at the ball
export function homeOf(team, slot, kickTeam, P = PITCH) {
  const own = team === 0 ? P.x0 : P.x1, sx = team === 0 ? 1 : -1;
  let f = slot === 0 ? [6.4, 0] : [2.2, 0];
  if (kickTeam === team && slot === 0) f = [8.35, 0];
  else if (slot === 0) f = [6.2, team === 0 ? -1.6 : 1.6];
  return [own + sx * f[0], P.cz + f[1], sx > 0 ? Math.PI / 2 : -Math.PI / 2];
}

export function create({ players = [], opts = {}, seed = 1 } = {}) {
  const P = PITCH, Rn = rng(seed);
  const n = Math.max(2, Math.min(4, players.length));
  const mode = opts.mode === '1v1' ? '1v1' : opts.mode === '2v2' ? '2v2' : n > 2 ? '2v2' : '1v1';
  const mins = clamp(+opts.mins || 3, 1, 6);
  // humans first, alternating teams (bots last fill the gaps)
  const order = [...players.filter(p => !p.bot), ...players.filter(p => p.bot)].slice(0, mode === '1v1' ? 2 : 4);
  const pl = order.map((p, i) => ({ id: p.id, name: String(p.name || 'Giocatore').slice(0, 16), bot: !!p.bot, team: i % 2, slot: (i / 2) | 0, x: 0, z: 0, yaw: 0, vx: 0, vz: 0, cool: 0, rt: 0, koT: 0, goals: 0, chase: false, think: Rn.next() * 0.3, tx: 0, tz: 0 }));
  const idx = new Map(pl.map((p, i) => [p.id, i]));
  const S = { ph: 'ko', t: 0, pt: 0, clock: mins * 60, sc: [0, 0], ko: 0, kickTeam: 0, b: newBall(), owner: -1, last: -1, kid: 0, ev: [], over: null, log: [] };
  const push = e => { if (S.ev.length < 60) S.ev.push(e); };
  function kickoff(team) {
    S.kickTeam = team; S.ph = 'ko'; S.pt = 0; S.ko++; S.b = newBall(); S.owner = -1;
    for (const p of pl) { const h = homeOf(p.team, mode === '1v1' ? 0 : p.slot, team); p.x = h[0]; p.z = h[1]; p.yaw = h[2]; p.vx = p.vz = 0; p.cool = 0; p.koT = S.t; p.rt = S.t; }
    push({ k: 'ko', team, ko: S.ko });
  }
  kickoff(0);
  function goal(team) {
    S.sc[team]++; S.ph = 'goal'; S.pt = 0; S.owner = -1;
    const by = S.last >= 0 ? pl[S.last] : null, own = !!by && by.team !== team;
    if (by && !own) by.goals++;
    S.log.push({ team, by: by ? by.id : null, own });
    push({ k: 'goal', team, by: by ? S.last : -1, own, sc: S.sc.slice() });
  }
  function finish() {
    S.ph = 'end'; S.pt = 0;
    const [a, b] = S.sc, win = a > b ? 0 : b > a ? 1 : -1;
    const winners = win < 0 ? [] : pl.filter(p => p.team === win).map(p => p.id);
    S.over = { winners, scores: Object.fromEntries(pl.map(p => [p.id, p.goals * 100 + (win === p.team ? 300 : win < 0 ? 100 : 0)])), sc: [a, b], mode,
      summary: win < 0 ? `Pareggio ${a}–${b}` : `${win === 0 ? 'Squadra blu' : 'Squadra rossa'} vince ${Math.max(a, b)}–${Math.min(a, b)}` };
    push({ k: 'end', sc: [a, b] });
  }
  const ballSpeed = () => Math.hypot(S.b.vx, S.b.vz);
  function take(i) { S.owner = i; S.last = i; const b = S.b; b.vx = b.vy = b.vz = 0; b.spin = 0; }
  function doKick(i, dx, dz, power, kind) {
    const p = pl[i], b = S.b;
    const v = kickVel(b, p.team, dx, dz, power, kind, Rn.next() - 0.5);
    S.owner = -1; S.last = i; S.kid++; b.net = 0;
    b.vx = v.vx; b.vy = v.vy; b.vz = v.vz; b.spin = v.spin; if (b.y < R + 0.02) b.y = R + 0.02;
    p.cool = 0.32;
    push({ k: 'kick', i, kind, kid: S.kid, sp: r2(Math.hypot(v.vx, v.vz)) });
  }
  // ---------------- bots
  const goalX = t => t === 0 ? P.x1 : P.x0, ownX = t => t === 0 ? P.x0 : P.x1, sxOf = t => t === 0 ? 1 : -1;
  function botThink(p, i, dt) {
    const b = S.b, sx = sxOf(p.team);
    let tx = p.x, tz = p.z, sp = BOT_SPEED;
    if (S.ph !== 'play') { const h = homeOf(p.team, mode === '1v1' ? 0 : p.slot, S.kickTeam); if (S.ph === 'ko') { tx = h[0]; tz = h[1]; } }
    else if (S.owner === i) {
      tx = goalX(p.team) - sx * 1.5; tz = P.cz;
      let pd = 9; for (const o of pl) if (o.team !== p.team) pd = Math.min(pd, Math.hypot(o.x - p.x, o.z - p.z));
      p.think -= dt;
      if (p.think <= 0) {
        p.think = 0.25 + Rn.next() * 0.2;
        const dg = Math.hypot(goalX(p.team) - p.x, P.cz - p.z);
        const mate = pl.find((o, j) => j !== i && o.team === p.team);
        if (dg < 4.5 || (dg < 8.5 && Rn.next() < 0.18)) { const tzG = P.cz + (Rn.next() < 0.5 ? -1 : 1) * (0.35 + Rn.next() * 0.95) * MOUTH; doKick(i, goalX(p.team) - b.x, tzG - b.z, 0.55 + Rn.next() * 0.4, Rn.next() < 0.07 ? 1 : 0); }
        else if (pd < 1.5 && mate && Rn.next() < 0.55) { const d = Math.hypot(mate.x - b.x, mate.z - b.z); doKick(i, mate.x - b.x, mate.z - b.z, clamp((d * 1.45 + 2.8 - 5) / 8, 0, 1), 2); }
      }
      sp = 2.1;
    } else if (p.chase && (S.owner < 0 || pl[S.owner].team !== p.team)) { const lead = S.owner >= 0 ? 0.15 : clamp(Math.hypot(b.x - p.x, b.z - p.z) / 4, 0, 0.6); tx = b.x + b.vx * lead; tz = b.z + b.vz * lead; sp = 2.55; }
    else if (S.owner >= 0 && pl[S.owner].team === p.team) { tx = clamp(b.x + sx * 3.4, P.x0 + 1.2, P.x1 - 1.2); tz = P.cz + (b.z < P.cz ? 2.6 : -2.6); sp = 2.1; }
    else { tx = (b.x + ownX(p.team)) / 2 + sx * 0.5; tz = P.cz + (b.z - P.cz) * 0.5; sp = 2.2; }
    // move
    let dx = tx - p.x, dz = tz - p.z; const L = Math.hypot(dx, dz);
    const s = L < 0.15 ? 0 : Math.min(sp, L * 2.2);
    const wx = L > 1e-4 ? dx / L * s : 0, wz = L > 1e-4 ? dz / L * s : 0, k = 1 - Math.exp(-dt * 6);
    p.vx += (wx - p.vx) * k; p.vz += (wz - p.vz) * k;
    p.x = clamp(p.x + p.vx * dt, P.x0 + 0.3, P.x1 - 0.3); p.z = clamp(p.z + p.vz * dt, P.z0 + 0.3, P.z1 - 0.3);
    if (Math.hypot(p.vx, p.vz) > 0.25) p.yaw = Math.atan2(p.vx, p.vz); else if (S.ph === 'play') p.yaw = Math.atan2(b.x - p.x, b.z - p.z);
    if (S.owner === i) { const want = Math.atan2(tx - p.x, tz - p.z); p.yaw += wrapA(want - p.yaw) * Math.min(1, dt * 6); }
  }
  // ---------------- contacts: possession, steals, body blocks
  function contacts(dt) {
    const b = S.b;
    for (let i = 0; i < pl.length; i++) {
      const p = pl[i]; p.cool -= dt;
      if (i === S.owner || p.cool > 0 || b.net) continue;
      if (!inCage(p)) continue;
      const d = Math.hypot(p.x - b.x, p.z - b.z);
      if (d > 0.62 || b.y > 0.75) {
        if (d < 0.36 + R && b.y < 1.6 && S.owner < 0) { // body block
          const nx = (b.x - p.x) / (d || 1), nz = (b.z - p.z) / (d || 1), vn = b.vx * nx + b.vz * nz;
          if (vn < 0) { b.vx -= 1.4 * vn * nx; b.vz -= 1.4 * vn * nz; if (ballSpeed() < 6) S.last = i; }
          b.x = p.x + nx * (0.36 + R); b.z = p.z + nz * (0.36 + R);
        }
        continue;
      }
      if (S.owner < 0) {
        if (ballSpeed() < 8.5) { take(i); continue; }
        const nx = (b.x - p.x) / (d || 1), nz = (b.z - p.z) / (d || 1), vn = b.vx * nx + b.vz * nz;
        if (vn < 0) { b.vx -= 1.5 * vn * nx; b.vz -= 1.5 * vn * nz; b.vx *= 0.6; b.vz *= 0.6; }
      } else if (pl[S.owner].team !== p.team) {
        const o = pl[S.owner], rate = !p.bot ? 2.4 : !o.bot ? 1.0 : 1.7;
        if (Rn.next() < rate * dt) { const from = S.owner; take(i); o.cool = 0.7; push({ k: 'steal', i, from }); }
      }
    }
  }
  const inCage = p => p.x > P.x0 - 0.2 && p.x < P.x1 + 0.2 && p.z > P.z0 - 0.2 && p.z < P.z1 + 0.2;
  function dribble(h) {
    const o = pl[S.owner], b = S.b, fx = Math.sin(o.yaw), fz = Math.cos(o.yaw);
    const tx = o.x + fx * 0.46 + o.vx * 0.06, tz = o.z + fz * 0.46 + o.vz * 0.06;
    b.vx = (tx - b.x) * 14; b.vz = (tz - b.z) * 14; b.vy = 0; b.x += b.vx * h; b.z += b.vz * h; b.y = R;
    b.x = clamp(b.x, P.x0 + R, P.x1 - R); b.z = clamp(b.z, P.z0 + R, P.z1 - R);
    if (Math.hypot(o.x - b.x, o.z - b.z) > 1.2 || !inCage(o)) S.owner = -1;
  }
  const game = {
    act(id, a) {
      const i = idx.get(id); if (i === undefined) return { ok: false, error: 'non sei in campo' };
      const p = pl[i]; if (p.bot) return { ok: false, error: 'sei uscito' };
      if (!a || typeof a !== 'object') return { ok: false, error: 'azione' };
      if (a.p) {
        const [x, z, yaw] = a.p;
        if (![x, z, yaw].every(Number.isFinite)) return { ok: false, error: 'posizione' };
        if (S.ph === 'ko' || S.ph === 'end' || S.t - p.koT < 0.45) return { ok: true }; // the referee holds the kick-off spots
        const dt = Math.max(0.02, S.t - p.rt), max = VMAX * dt + 0.6;
        let dx = x - p.x, dz = z - p.z; const d = Math.hypot(dx, dz);
        if (d > max) { dx *= max / d; dz *= max / d; } // too fast: only as far as a legal run
        const nx = p.x + dx, nz = p.z + dz;
        p.vx = dx / dt; p.vz = dz / dt; p.x = nx; p.z = nz; p.yaw = wrapA(+yaw); p.rt = S.t;
        return { ok: true };
      }
      if (a.k) {
        if (S.ph !== 'play') return { ok: false, error: 'aspetta il fischio' };
        const [dx, dz, power, kind] = a.k;
        if (![dx, dz, power].every(Number.isFinite) || !(kind === 0 || kind === 1 || kind === 2)) return { ok: false, error: 'tiro non valido' };
        if (p.cool > 0) return { ok: false, error: 'troppo presto' };
        const b = S.b, d = Math.hypot(p.x - b.x, p.z - b.z);
        if (d > REACH || b.y > 1.2 || b.net) return { ok: false, error: 'non sei sulla palla' };
        doKick(i, dx, dz, power, kind);
        return { ok: true, kid: S.kid };
      }
      return { ok: false, error: 'azione sconosciuta' };
    },
    tick(dt) {
      if (S.over) return;
      S.t += dt; S.pt += dt;
      if (S.ph === 'ko' && S.pt > 1.6) { S.ph = 'play'; S.pt = 0; push({ k: 'whistle' }); }
      else if (S.ph === 'goal' && S.pt > 2.6) { if (S.clock <= 0) { finish(); return; } const last = S.log[S.log.length - 1]; kickoff(last ? 1 - last.team : 0); }
      // who chases (per team, with hysteresis), bots
      for (const t of [0, 1]) {
        let best = -1, bd = 1e9;
        pl.forEach((p, i) => { if (p.team !== t) return; const d = Math.hypot(p.x - S.b.x, p.z - S.b.z) - (p.chase ? 0.8 : 0) - (!p.bot ? (Math.hypot(p.vx, p.vz) > 0.5 ? 0.5 : -1.2) : 0); if (d < bd) { bd = d; best = i; } });
        pl.forEach((p, i) => { if (p.team === t) p.chase = i === best; });
      }
      pl.forEach((p, i) => { if (p.bot) botThink(p, i, dt); });
      const n = 4, h = dt / n;
      for (let k = 0; k < n; k++) {
        if (S.owner >= 0) { dribble(h); continue; }
        const e = stepBall(S.b, h);
        if ((e === 'goal0' || e === 'goal1') && S.ph === 'play') goal(e === 'goal0' ? 0 : 1);
        else if (e === 'post') push({ k: 'post' });
        else if (e === 'reset' && S.ph === 'play') kickoff(S.kickTeam);
      }
      if (S.ph === 'play') {
        contacts(dt);
        S.clock -= dt;
        if (S.clock <= 0) { S.clock = 0; finish(); }
      }
    },
    view(id) {
      const i = idx.has(id) ? idx.get(id) : -1, b = S.b, me = i >= 0 ? pl[i] : null;
      return {
        ph: S.ph, cl: Math.max(0, Math.round(S.clock * 10) / 10), sc: S.sc, ko: S.ko, kid: S.kid, mode, mins,
        b: [r2(b.x), r2(b.y), r2(b.z), r2(b.vx), r2(b.vy), r2(b.vz)], o: S.owner, me: i,
        ps: pl.map(p => [r2(p.x), r2(p.z), r2(p.yaw), p.team, p.bot ? 1 : 0, p.goals]),
        pl: pl.map(p => [p.id, p.name]),
        hm: me ? homeOf(me.team, mode === '1v1' ? 0 : me.slot, S.kickTeam).map(r2) : null,
      };
    },
    drain() { const e = S.ev; S.ev = []; return e; },
    leave(id) { const i = idx.get(id); if (i === undefined) return; const p = pl[i]; if (!p.bot) { p.bot = true; p.name = (p.name + ' 🤖').slice(0, 18); push({ k: 'left', i }); } },
    get over() { return S.over; },
    _state: S, _pl: pl,
  };
  return game;
}
