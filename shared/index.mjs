// Registry of shared game rule modules (see README.md). One line per mode; imported by server/match.mjs and
// src/net/match.js. Keep the lines sorted; each agent/feature adds only its own line.
export const GAMES = {
  br: () => import('./br.mjs'),
  calcetto: () => import('./calcetto.mjs'),
  corriere: () => import('./corriere.mjs'),
  gulag: () => import('./gulag.mjs'),
  gulag_coop: () => import('./gulag_coop.mjs'),
  race: () => import('./race.mjs'),
  siege: () => import('./siege.mjs'),
  briscola: () => import('./briscola.mjs'),
  figurine: () => import('./figurine.mjs'),
  scambio: () => import('./scambio.mjs'),
  scopa: () => import('./scopa.mjs'),
  sfida: () => import('./sfida.mjs'),
  dadi: () => import('./dadi.mjs'),
  party: () => import('./party.mjs'),
  processo: () => import('./processo.mjs'),
  quiz: () => import('./quiz.mjs'),
};
