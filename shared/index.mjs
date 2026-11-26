// Registry of shared game rule modules (see README.md). One line per mode; imported by server/match.mjs and
// src/net/match.js. Keep the lines sorted; each agent/feature adds only its own line.
export const GAMES = {
  br: () => import('./br.mjs'),
  gulag: () => import('./gulag.mjs'),
  race: () => import('./race.mjs'),
  siege: () => import('./siege.mjs'),
  briscola: () => import('./briscola.mjs'),
  figurine: () => import('./figurine.mjs'),
  scambio: () => import('./scambio.mjs'),
  scopa: () => import('./scopa.mjs'),
  dadi: () => import('./dadi.mjs'),
};
