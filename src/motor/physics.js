// motor/physics.js — arcade car dynamics for the 500 (no allocations per step).
// State in world space: x, z, yaw (facing, 0 = +z, explore.js convention), velocity vx/vz, yaw rate, steer, nitro.
// Throttle / brake / reverse, speed-sensitive steering lock, lateral grip (handbrake → drift), nitro, collisions
// against the level (level.isWalkable) + dynamic circles (NPCs, players, vespe, the dog) in sub-steps, curb bumps.
import { CAR } from './rig.js';

export const BASE = { vmax: 19, accel: 5.6, brake: 12, grip: 11, steer: 0.58, nitroBoost: 0.55, nitroTank: 3.2, rev: 5 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function stats(perf = {}) {
  const m = perf.motore | 0, g = perf.gomme | 0, f = perf.freni | 0, n = perf.nitro | 0;
  return {
    vmax: BASE.vmax * (1 + 0.11 * m), accel: BASE.accel * (1 + 0.16 * m), brake: BASE.brake * (1 + 0.16 * f), grip: BASE.grip * (1 + 0.14 * g),
    steer: BASE.steer * (1 + 0.05 * g), nitroBoost: n ? BASE.nitroBoost * (1 + 0.25 * (n - 1)) : 0, nitroTank: n ? BASE.nitroTank * (1 + 0.35 * (n - 1)) : 0, rev: BASE.rev,
  };
}

export function newState(x, z, yaw) {
  return { x, z, yaw, vx: 0, vz: 0, yawRate: 0, steer: 0, fwd: 0, lat: 0, acc: 0, nitro: 1, nitroOn: false, drift: 0, slip: 0, bump: 0, hit: 0, onCurb: false, rpm: 0, gear: 1 };
}

// input: { thr 0..1, brk 0..1, steer -1..1, hand bool, nitro bool }
// env: { blocked(x, z, r) -> bool, curb(x, z) -> bool }
export function step(S, inp, st, dt, env) {
  const fx = Math.sin(S.yaw), fz = Math.cos(S.yaw), rx = Math.cos(S.yaw), rz = -Math.sin(S.yaw);
  let vF = S.vx * fx + S.vz * fz, vL = S.vx * rx + S.vz * rz;
  const sp = Math.abs(vF);
  // ---- nitro
  S.nitroOn = !!(inp.nitro && st.nitroTank > 0 && S.nitro > 0.02 && inp.thr > 0.1);
  if (S.nitroOn) S.nitro = Math.max(0, S.nitro - dt / st.nitroTank); else S.nitro = Math.min(1, S.nitro + dt * 0.06);
  const vmax = st.vmax * (S.nitroOn ? 1 + st.nitroBoost * 0.45 : 1);
  // ---- longitudinal
  let a = 0;
  if (inp.thr > 0.02) {
    if (vF < -0.3) a = st.brake * inp.thr; // pressing gas while rolling back = brake
    else a = st.accel * inp.thr * (1 - Math.pow(clamp(vF / vmax, 0, 1), 2)) * (S.nitroOn ? 1 + st.nitroBoost : 1);
  }
  if (inp.brk > 0.02) {
    if (vF > 0.4) a -= st.brake * inp.brk;
    else a -= st.accel * 0.7 * inp.brk * (1 - clamp(-vF / st.rev, 0, 1)); // reverse
  }
  if (inp.thr <= 0.02 && inp.brk <= 0.02) a -= Math.sign(vF) * Math.min(Math.abs(vF) / Math.max(dt, 1e-3), 1.1 + sp * 0.05); // engine braking / rolling
  if (inp.hand) a -= Math.sign(vF) * Math.min(Math.abs(vF) / Math.max(dt, 1e-3), 3.2);
  vF += a * dt;
  vF = clamp(vF, -st.rev, vmax * 1.02);
  S.acc = a;
  // ---- steering (less lock at speed) + yaw
  const want = clamp(inp.steer, -1, 1);
  S.steer += (want - S.steer) * (1 - Math.exp(-dt * (Math.abs(want) > Math.abs(S.steer) ? 7 : 10)));
  const lock = st.steer * (1 - 0.62 * clamp(sp / st.vmax, 0, 1));
  const delta = S.steer * lock, wb = 2.0;
  let yr = (vF / wb) * Math.tan(delta);
  // handbrake: the rear lets go — more rotation, less grip
  const grip = inp.hand && sp > 3 ? st.grip * 0.16 : st.grip * (S.drift > 0.3 ? 0.55 : 1);
  if (inp.hand && sp > 3) yr *= 1.45;
  S.yawRate += (yr - S.yawRate) * (1 - Math.exp(-dt * (inp.hand ? 5 : 9)));
  S.yaw += S.yawRate * dt;
  // ---- lateral: the velocity follows the heading according to grip (drift when low)
  vL *= Math.exp(-grip * dt);
  S.slip = Math.abs(vL);
  S.drift = S.slip > 1.6 ? Math.min(1, S.drift + dt * 3) : Math.max(0, S.drift - dt * 2);
  // back to world velocity on the NEW heading (the car turns, the momentum mostly follows)
  const nfx = Math.sin(S.yaw), nfz = Math.cos(S.yaw), nrx = Math.cos(S.yaw), nrz = -Math.sin(S.yaw);
  S.vx = nfx * vF + nrx * vL; S.vz = nfz * vF + nrz * vL;
  S.fwd = vF; S.lat = vL;
  // ---- move with collisions (sub-steps of ≤ 0.15 m)
  const dist = Math.hypot(S.vx, S.vz) * dt, n = Math.max(1, Math.ceil(dist / 0.15));
  S.hit = 0;
  for (let i = 0; i < n; i++) {
    const nx = S.x + S.vx * dt / n, nz = S.z + S.vz * dt / n;
    if (!carBlocked(nx, nz, S.yaw, env)) { S.x = nx; S.z = nz; continue; }
    // slide along whichever axis is free
    const hitV = Math.hypot(S.vx, S.vz);
    if (!carBlocked(nx, S.z, S.yaw, env)) { S.x = nx; S.vz *= -0.15; S.vx *= 0.88; }
    else if (!carBlocked(S.x, nz, S.yaw, env)) { S.z = nz; S.vx *= -0.15; S.vz *= 0.88; }
    else { S.vx *= -0.25; S.vz *= -0.25; }
    S.hit = Math.max(S.hit, hitV); S.yawRate *= 0.4;
    break;
  }
  // ---- curbs: a little bump when the wheels cross a curb line
  const curb = env.curb ? env.curb(S.x, S.z) : false;
  S.bump = 0; if (curb !== S.onCurb && sp > 2) { S.bump = Math.min(0.9, 0.25 + sp * 0.04) * (curb ? 1 : -0.6); const k = 1 - Math.min(0.06, sp * 0.004); S.vx *= k; S.vz *= k; }
  S.onCurb = curb;
  // ---- fake gearbox for the engine sound
  const g = Math.max(1, Math.min(5, 1 + Math.floor(Math.max(0, Math.abs(S.fwd)) / (st.vmax / 4.6))));
  const span = st.vmax / 4.6, inG = (Math.abs(S.fwd) - (g - 1) * span) / span;
  S.gear = S.fwd < -0.3 ? -1 : g; S.rpm = clamp(0.18 + 0.78 * clamp(inG, 0, 1) * (g === 1 ? 1.1 : 1) + (inp.thr > 0.1 && sp < 1 ? 0.25 * inp.thr : 0), 0.15, 1.05);
  return S;
}

// 5 probes: the 4 corners (a bit inside) + the front middle; when reversing the rear middle instead
export function carBlocked(x, z, yaw, env) {
  const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const hw = CAR.halfW - 0.18, hl = CAR.halfL - 0.25, r = 0.28;
  for (let i = 0; i < 6; i++) {
    const sl = i === 4 ? 0 : i === 5 ? 0 : (i & 1 ? hw : -hw), sf = i === 4 ? hl : i === 5 ? -hl : (i & 2 ? hl : -hl);
    const px = x + fx * sf + rx * sl, pz = z + fz * sf + rz * sl;
    if (env.blocked(px, pz, r)) return true;
  }
  return false;
}
