// Deterministic RNG for shared game rules (same results on server and browser for the same seed).
export function rng(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  const next = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return {
    next,
    int: (n) => Math.floor(next() * n),
    range: (a0, b0) => a0 + next() * (b0 - a0),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; },
    chance: (p) => next() < p,
  };
}
export const newSeed = () => (Math.random() * 4294967296) >>> 0; // only for creating a match, never inside rules
