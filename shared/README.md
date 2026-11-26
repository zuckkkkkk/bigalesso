# shared/ — regole dei giochi, uguali su server e browser

Ogni modalità con regole (carte, gare, battle royale, assedio RTS, Gulag…) ha **un solo** modulo qui, in JS puro
(niente DOM, niente three.js, niente `window`), importato:

- dal **server** (`server/match.mjs`) per le partite online: il server è l'arbitro (mischia, valida le mosse, fa
  girare zona/bot/timer) e manda a ogni giocatore solo quello che può vedere;
- dal **browser** (`src/net/match.js`) per giocare offline o da soli: stesso codice, gira in locale.

## Contratto di un modulo `shared/<tipo>.mjs`

```js
export const meta = {
  type: 'briscola',        // id univoco, uguale al nome del file
  name: 'Briscola',        // nome mostrato
  minPlayers: 2, maxPlayers: 4,
  tickHz: 0,               // 0 = solo a mosse (carte); 10-20 = simulazione continua (gare, BR, assedio)
  dropIn: false,           // true se si può entrare a partita iniziata (BR lobby, assedio co-op, mondo)
};

// players: [{ id, name, bot: bool }]; opts: libere per modalità; seed: intero → usare rng(seed) di shared/rng.mjs
export function create({ players, opts, seed }) {
  return {
    act(playerId, action) { return { ok: true } /* o { ok:false, error:'...' } */ },
    tick(dt) { },                         // solo se tickHz > 0 (anche i bot si muovono qui)
    view(playerId) { return {} },          // snapshot JSON per quel giocatore (nasconde le carte altrui ecc.)
    drain() { return [] },                 // eventi accaduti dall'ultima chiamata (suoni/animazioni): [{k:'gol', ...}]
    join(player) { }, leave(playerId) { }, // opzionali (dropIn)
    get over() { return null },            // null oppure { winners:[ids], scores:{id:n}, summary:'testo' }
  };
}
```

Regole d'oro: deterministico dato il seed (solo `rng`, mai `Math.random`/`Date.now`), stato serializzabile in JSON,
nessuna allocazione pesante per tick, `act` valida tutto (online il client può barare: il server no).
I bot (amici controllati dal computer) stanno dentro il modulo, così offline e online si comportano uguale.

Registra il modulo con **una riga** in `shared/index.mjs`.
