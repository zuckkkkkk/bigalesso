// cards/ — giochi di carte nel mondo aperto: Briscola e Scopa (a 2 o in coppie a 4) e il "Figurine duel" con le figurine
// collezionabili degli amici. Le regole stanno in shared/briscola.mjs, shared/scopa.mjs, shared/figurine.mjs: online le
// fa girare il server (arbitro: mischia, valida le mosse, bot e timer), offline girano qui (window.__match).
//  - Celtic, secondo tavolino: E "Siediti a giocare" → ti siedi, gli amici si siedono di fronte (corpi da npcs.js),
//    carte 3D sul tavolo (table3d.js), la tua mano e i punteggi a schermo. Commentano ogni mano (fumetti).
//  - Ovunque: telefono → app "Carte" (briscola, scopa, duello, album, bustine, scambio) o dialogo con un amico →
//    "7 · Ci facciamo una briscola?" (tavolo a schermo).
//  - Figurine: una per amico + speciali (Tortellino Man, Vigile Urbano Zombie, il cane…), rarità e lucide; si trovano
//    nelle casse del loot, si comprano in bustine all'edicola (5 €), album e mazzo nel telefono, duello contro bot o
//    online, doppioni da scambiare online. Salvataggio 'bigalesso_cards' (collection.js).
// Install (main.js): const cards = installCards({ scene, level, man, input, ui, audio, camera, S, npcs }); plugins.push(cards.plugin);
//   cards.update(dt) ogni frame. API: window.__cards = { open(screen?, opts), challenge(friendId, type?), album(), packs(), state }
import * as THREE from 'three';
import { createOverlay, persona, personas, ask, SAFE, catchphrase, aiOnline, unlock, phone, esc, logEvent } from '../minigames/shared.js';
import { cardCSS, figurinaURL, rarityColor } from './art.js';
import { col } from './collection.js';
import { createTable3D } from './table3d.js';
import { CATALOG, BY_ID, TOKENS, LANES, DECK_MIN, DECK_MAX } from '../../shared/figurine.mjs';
import { captureOptions } from '../../shared/scopa.mjs';
import { trickWinner } from '../../shared/briscola.mjs';
import { suitOf, rankOf, cardName, SUITS } from '../../shared/carte.mjs';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rnd = a => a[(Math.random() * a.length) | 0];
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const PACK_PRICE = 5;
const GAME_NAME = { briscola: 'Briscola', scopa: 'Scopa', figurine: 'Figurine duel' };
const LINES = {
  brag: ['Tiè! Carico preso', 'Socmel che mano', 'Godo come un riccio', 'Palese, troppo forte', 'Sgravato io', 'Ma che giochi, coglione?', 'Grazie del regalo stronzo'],
  moan: ['Ma porca troia', 'Che culo che hai', 'Ma vaffanculo dai', 'Ci sta, ci sta… stronzo', 'Ma chi ti ha insegnato?', 'Che merda di carte'],
  scopa: ['SCOPA! Tutto pulito', 'Scopa, e piangi', 'Pulito come il bancone del Celtic', 'Scopaaa, sgravato'],
  scopaThem: ['Ma vaffanculo, scopa', 'Ma come cazzo hai fatto?', 'Scopa di culo, palese', 'Ma è truccato sto mazzo'],
  win: ['Vinto, paga lo spritz', 'Ve l\'avevo detto, troppo forte', 'GG coglioni', 'Rivincita? Tanto vinco io'],
  lose: ['Partita truccata', 'Rivincita, subito', 'Mazzo di merda', 'Mi avete fregato, stronzi', 'Ok questa la offro io'],
  settebello: ['Il settebello è mio, ciaone', 'Settebello in tasca'],
  gulag: ['Al Gulag! Fino a tre anni', 'Ciaone, al Gulag', 'Dentro, latitante'],
};
const CSS = `
#cards{--g:#c8f03c}
#cards .mg-bg{background:radial-gradient(120% 90% at 50% 40%,rgba(8,20,14,.55),rgba(0,0,0,.86))}
#cards.t3d .mg-bg{background:linear-gradient(180deg,rgba(0,0,0,.35),transparent 22%,transparent 60%,rgba(0,0,0,.55));backdrop-filter:none}
#cards .cd-wrap{position:relative;z-index:2;flex:1;display:flex;flex-direction:column;min-height:0;padding:min(3vh,26px) min(3vw,32px) min(2vh,16px)}
#cards h1{margin:0;font:900 clamp(26px,3.4vw,42px)/1 Impact,"Arial Black",system-ui;letter-spacing:.04em;color:#fff;text-transform:uppercase}
#cards h1 small{display:block;font:600 13px system-ui;letter-spacing:.02em;color:rgba(255,255,255,.6);text-transform:none;margin-top:6px}
#cards .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:10px 0}
#cards .row>span.l{min-width:110px;font:700 11px system-ui;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.55)}
#cards button.mg-b small{display:block;font:500 11px system-ui;opacity:.65;margin-top:4px}
#cards .games{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:18px 0 6px;max-width:760px}
#cards .games button{padding:16px}
#cards .games b{font:900 20px/1.1 Impact,"Arial Black",system-ui;letter-spacing:.03em}
#cards .chip{display:inline-flex;gap:6px;align-items:center;padding:6px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);cursor:pointer;font:600 13px system-ui;color:#fff}
#cards .chip.sel{border-color:var(--c,#c8f03c);background:rgba(255,255,255,.16);box-shadow:inset 0 0 0 1px var(--c,#c8f03c)}
#cards .lobby{max-width:760px;font-size:13px;color:rgba(255,255,255,.75)}
#cards .lobby button{margin:4px 6px 0 0}
#cards .acts{display:flex;gap:10px;margin-top:auto;padding-top:14px;flex-wrap:wrap}
#cards .acts .go{background:var(--g);color:#111;border-color:var(--g);font-weight:900}
#cards .ccard{display:inline-block;width:var(--w,84px);aspect-ratio:128/208;border-radius:9px;box-shadow:0 4px 12px rgba(0,0,0,.55);vertical-align:top;position:relative;transition:transform .14s, box-shadow .14s}
#cards .ccard.back{background:#6a1424}
#cards .hand{display:flex;justify-content:center;gap:12px;align-items:flex-end;min-height:calc(var(--w,96px)*1.62 + 10px);--w:clamp(70px,8.4vw,104px)}
#cards .hand .ccard{cursor:pointer}
#cards .hand .ccard:hover,#cards .hand .ccard.sel{transform:translateY(-14px);box-shadow:0 10px 22px rgba(0,0,0,.7),0 0 0 3px var(--g)}
#cards .hand .ccard.dim{filter:brightness(.6)}
#cards .hand kbd{position:absolute;left:50%;bottom:-22px;transform:translateX(-50%)}
#cards .game{flex:1;display:grid;grid-template-rows:auto 1fr auto auto;gap:8px;min-height:0}
#cards .top{display:flex;justify-content:center;gap:14px;flex-wrap:wrap}
#cards .pl{position:relative;display:flex;gap:8px;align-items:center;padding:6px 12px 6px 8px;border-radius:12px;background:rgba(10,8,18,.72);border:1px solid rgba(255,255,255,.14);font:700 14px system-ui}
#cards .pl.turn{border-color:var(--g);box-shadow:0 0 0 1px var(--g),0 0 18px rgba(200,240,60,.25)}
#cards .pl .em{font-size:20px}
#cards .pl small{font:600 11px system-ui;opacity:.6;display:block}
#cards .pl .bub{position:absolute;top:calc(100% + 8px);left:50%;transform:translateX(-50%);white-space:nowrap;max-width:280px;overflow:hidden;text-overflow:ellipsis;background:#fff;color:#111;padding:6px 10px;border-radius:12px;font:600 13px system-ui;box-shadow:0 6px 18px rgba(0,0,0,.5);animation:cdBub .25s ease-out;z-index:3}
@keyframes cdBub{from{opacity:0;transform:translate(-50%,6px)}}
#cards .felt{position:relative;align-self:center;justify-self:center;width:min(760px,92%);min-height:min(36vh,300px);border-radius:28px;background:radial-gradient(ellipse at 50% 45%,#1f6a3c,#0f3a22 70%,#0a2a18);border:8px solid #4a2a14;box-shadow:inset 0 0 40px rgba(0,0,0,.6),0 14px 40px rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap;padding:20px;--w:clamp(58px,6.6vw,86px)}
#cards.t3d .felt{visibility:hidden}
#cards .felt .ccard.pick{cursor:pointer;box-shadow:0 0 0 3px #ffd040,0 6px 16px rgba(0,0,0,.6)}
#cards .felt .ccard.taken{opacity:.35}
#cards .felt .deckp{position:absolute;left:18px;top:50%;transform:translateY(-50%);text-align:center;font:700 11px system-ui;color:rgba(255,255,255,.75)}
#cards .felt .deckp .ccard{--w:clamp(44px,5vw,64px)}
#cards .felt .deckp .tr{transform:rotate(90deg) translateX(30%);margin-top:-30%;}
#cards .felt .seat{display:flex;flex-direction:column;align-items:center;gap:4px;font:700 11px system-ui;color:rgba(255,255,255,.8)}
#cards .side{position:absolute;right:min(3vw,32px);top:min(10vh,90px);width:min(230px,26vw);background:rgba(10,8,18,.78);border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:10px 12px;font:13px/1.45 system-ui;z-index:3}
#cards .side b{color:#fff}
#cards .side table{width:100%;border-collapse:collapse;font-size:12px}
#cards .side td{padding:2px 4px;border-bottom:1px solid rgba(255,255,255,.08)}
#cards .msg{text-align:center;font:700 15px system-ui;min-height:22px;color:#fff;text-shadow:0 2px 6px #000}
#cards .opts{display:flex;justify-content:center;gap:8px;flex-wrap:wrap;min-height:10px}
#cards .res{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55)}
#cards .res .box{background:#151022;border:1px solid rgba(255,255,255,.2);border-radius:16px;padding:22px 26px;max-width:520px;text-align:center;box-shadow:0 20px 60px #000}
#cards .res .big{font:900 40px/1 Impact,"Arial Black",system-ui;letter-spacing:.04em;margin:6px 0 10px}
#cards .res table{margin:10px auto;border-collapse:collapse;font-size:13px}#cards .res td{padding:3px 10px;border-bottom:1px solid rgba(255,255,255,.1)}
/* duello */
#cards .lanes{flex:1;display:grid;grid-template-columns:repeat(3,1fr);gap:12px;min-height:0;max-width:1000px;width:100%;margin:0 auto}
#cards .lane{display:grid;grid-template-rows:1fr auto 1fr;border-radius:14px;background:rgba(20,16,32,.7);border:1px solid rgba(255,255,255,.14);padding:8px;cursor:pointer;min-height:0}
#cards .lane.can:hover,#cards .lane.can{border-color:var(--g)}
#cards .lane .side2{display:flex;flex-wrap:wrap;gap:5px;justify-content:center;align-content:flex-start;--w:clamp(44px,4.6vw,62px)}
#cards .lane .side2.mine{align-content:flex-end}
#cards .lane .mid{display:flex;justify-content:space-between;align-items:center;padding:6px 6px;margin:4px 0;border-radius:9px;background:rgba(255,255,255,.06);font:800 13px system-ui}
#cards .lane .mid.win{background:rgba(80,220,120,.25)}#cards .lane .mid.lose{background:rgba(230,60,70,.25)}
#cards .fig{width:var(--w,62px);aspect-ratio:240/336;border-radius:7px;background-size:cover;position:relative;box-shadow:0 3px 8px rgba(0,0,0,.6);flex:none}
#cards .fig .pw{position:absolute;right:-5px;top:-5px;min-width:20px;height:20px;border-radius:10px;background:#c0392b;color:#fff;font:900 12px/20px system-ui;text-align:center;border:2px solid #fff}
#cards .fig .pw.up{background:#2a9d4a}#cards .fig .pw.down{background:#7a1d1d}
#cards .fig.pend{opacity:.6;outline:2px dashed var(--g)}
#cards .fig.tok{display:flex;align-items:center;justify-content:center;font-size:24px;background:#222}
#cards .fig.hidden{background:repeating-linear-gradient(45deg,#3a2a5a,#3a2a5a 6px,#2a1d44 6px,#2a1d44 12px)}
#cards .dhand{display:flex;gap:10px;justify-content:center;align-items:flex-end;--w:clamp(70px,7.4vw,98px);min-height:calc(var(--w)*1.4)}
#cards .dhand .fig{cursor:pointer;transition:transform .12s}
#cards .dhand .fig:hover,#cards .dhand .fig.sel{transform:translateY(-12px);box-shadow:0 0 0 3px var(--g),0 10px 20px #000}
#cards .dhand .fig.no{filter:grayscale(.8) brightness(.6)}
#cards .dbar{display:flex;justify-content:center;gap:16px;align-items:center;font:800 15px system-ui;margin:6px 0}
#cards .beer{color:#ffcf4a}
/* album */
#cards .album{flex:1;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:14px;padding:6px 2px;--w:100%}
#cards .album .it{position:relative;cursor:pointer;text-align:center;font:600 12px system-ui;color:rgba(255,255,255,.8)}
#cards .album .it .fig{width:100%}
#cards .album .it.miss .fig{filter:brightness(.15) grayscale(1)}
#cards .album .it .n{position:absolute;left:6px;top:6px;background:rgba(0,0,0,.75);border-radius:8px;padding:1px 7px;font:800 12px system-ui;color:#fff}
#cards .album .it .dk{position:absolute;right:6px;bottom:28px;background:var(--g);color:#111;border-radius:8px;padding:1px 7px;font:900 11px system-ui}
#cards .album .it .sh{position:absolute;left:6px;bottom:28px;background:linear-gradient(90deg,#ff6ad5,#6ae0ff,#fff06a);color:#111;border-radius:8px;padding:1px 7px;font:900 11px system-ui}
#cards .packrow{display:flex;gap:14px;justify-content:center;flex-wrap:wrap;--w:clamp(110px,14vw,170px);margin:20px 0}
#cards .packrow .fig{animation:cdFlip .5s ease-out both}
@keyframes cdFlip{from{transform:rotateY(90deg) scale(.8);opacity:0}}
#cards .packrow .new{position:absolute;left:50%;top:-12px;transform:translateX(-50%);background:var(--g);color:#111;font:900 11px system-ui;padding:2px 8px;border-radius:8px}
#cards .shinyfx{animation:cdShine 2.2s linear infinite}
@keyframes cdShine{0%,100%{filter:saturate(1.2) hue-rotate(0deg)}50%{filter:saturate(1.6) hue-rotate(40deg) brightness(1.15)}}
`;

export function installCards({ scene, level, man, input, ui, audio, camera, S: APP, npcs }) {
  const T3 = createTable3D({ scene, level });
  const sfx = n => { try { audio && audio.sfx && audio.sfx(n); } catch (e) { } };
  const toast = (m, k) => { try { ui && ui.toast ? ui.toast(m, k) : console.log(m); } catch (e) { } };
  const friends = () => personas().filter(p => p.id !== 'zuck' && p.id !== 'bot');
  const myName = () => (window.__net && window.__net.name) || 'Zuck';
  const ACH = id => unlock(id, ({
    carte_prima: { title: 'Una mano a carte', desc: 'Hai giocato la prima partita a carte', icon: '🃏' },
    briscola_win: { title: 'Briscolone', desc: 'Hai vinto a briscola', icon: '🂡' },
    briscola_cappotto: { title: 'Cappotto', desc: 'Briscola vinta con più di 100 punti', icon: '🧥' },
    scopa_win: { title: 'Scopa d\'oro', desc: 'Hai vinto a scopa', icon: '🧹' },
    scopa_settebello: { title: 'Settebello', desc: 'Hai preso il settebello', icon: '7️⃣' },
    scopa_3: { title: 'Pulisci tutto', desc: 'Tre scope nella stessa smazzata', icon: '✨' },
    duel_win: { title: 'Duellante', desc: 'Hai vinto un Figurine duel', icon: '⚔️' },
    album_10: { title: 'Mezzo album', desc: '10 figurine diverse', icon: '📒' },
    album_full: { title: 'Album completo', desc: 'Tutte le figurine', icon: '🏆' },
    shiny: { title: 'Luccica', desc: 'Hai trovato una figurina lucida', icon: '💎' },
    legend: { title: 'Leggenda', desc: 'Hai trovato una figurina leggendaria', icon: '🌟' },
    scambio: { title: 'Ce l\'ho, mi manca', desc: 'Hai scambiato una figurina online', icon: '🤝' },
  })[id] || { title: id });
  // ---------------- overlay ----------------
  { const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); }
  const ov = createOverlay('cards', '<div class="cd-wrap"></div>', { input, onKey, onClose: () => onClosed() });
  const wrap = ov.$('.cd-wrap');
  const C = {
    screen: 'menu', type: 'briscola', n: 2, target: 11, diff: 'media', opp: [], online: 'auto',
    sess: null, view: null, sel: -1, opt: -1, hl: [], dsel: -1, html: '', mode3d: false, lastSay: 0, said: {}, result: null, busy: false, lobby: [], pendingPack: null,
  };
  let W = null, H = null;
  // ------- utilities -------
  const seatName = i => C.view && C.view.players ? (C.view.players[i] || {}).name : '';
  const pidPersona = id => { const p = personas().find(q => q.id === id); return p || null; };
  function defaultOpp(k) {
    const act = (window.__npcs && window.__npcs.active && window.__npcs.active()) || [];
    const mp = man.root.position;
    const near = act.filter(id => friends().some(f => f.id === id)).sort((a, b) => { const A = window.__npcs.get(a), B = window.__npcs.get(b); return (A ? A.root.position.distanceTo(mp) : 1e9) - (B ? B.root.position.distanceTo(mp) : 1e9); });
    const rest = friends().map(f => f.id).filter(id => !near.includes(id)).sort(() => Math.random() - 0.5);
    return [...near, ...rest].slice(0, k);
  }
  function needOpp() { return C.type === 'figurine' ? 1 : C.n - 1; }
  function fixOpp() { const k = needOpp(); C.opp = C.opp.filter((v, i, a) => a.indexOf(v) === i).slice(0, k); for (const id of defaultOpp(k + 3)) { if (C.opp.length >= k) break; if (!C.opp.includes(id)) C.opp.push(id); } }

  // ------- open / close -------
  function open(screen = 'menu', o = {}) {
    Object.assign(C, o);
    if (!ov.isOpen) { ov.open(); try { window.__combat && window.__combat.setSpawning && window.__combat.setSpawning(false); } catch (e) { } }
    ov.root.classList.toggle('t3d', !!C.mode3d);
    C.screen = screen; C.html = '';
    if (screen === 'menu') { fixOpp(); refreshLobby(); }
    render();
  }
  function leaveGame() { if (C.sess) { try { C.sess.leave(); } catch (e) { } C.sess = null; } C.view = null; C.result = null; }
  function onClosed() {
    leaveGame();
    try { window.__combat && window.__combat.setSpawning && window.__combat.setSpawning(true); } catch (e) { }
    if (C.mode3d) standUp();
    C.mode3d = false; ov.root.classList.remove('t3d');
  }
  function close() { ov.close(); }

  // ------- lobby online -------
  async function refreshLobby() {
    C.lobby = [];
    try { const m = window.__match; if (m && m.transport) { const t = C.type; const l = await m.lobby(t); if (C.screen === 'menu' && C.type === t) { C.lobby = (l || []).filter(x => !x.started || (x.players || []).length < (x.max || 4)); render(); } } } catch (e) { }
  }

  // ------- start a game -------
  async function start(type, extra = {}) {
    if (C.busy) return; C.busy = true;
    leaveGame();
    C.type = type; C.result = null; C.sel = -1; C.opt = -1; C.dsel = -1; C.said = {};
    const diff = C.diff;
    const netOn = !!(window.__match.transport && window.__net && window.__net.online);
    // figurine online "aspetta un umano": lobby sul server (wait), chi è nella stanza entra, l'host avvia (o parte col bot)
    const waitHuman = type === 'figurine' && C.waitHuman && netOn && C.online !== false && !extra.matchId;
    const players = waitHuman ? [] : (type === 'figurine' ? C.opp.slice(0, 1) : C.opp.slice(0, C.n - 1)).map(id => ({ id, name: persona(id).name, bot: true, diff }));
    // in coppia a 4: il primo amico scelto è il compagno (siede di fronte, indice 2)
    if (type !== 'figurine' && C.n === 4 && players.length === 3) players.splice(0, 3, players[1], players[0], players[2]);
    const opts = type === 'scopa' ? { diff, target: C.target } : type === 'briscola' ? { diff } : { diff };
    try {
      const net = window.__net, mayOnline = !!extra.matchId || (C.online !== false && !!(window.__match.transport && net && net.online));
      // tempo per turno solo online (offline nessuno ti mette fretta)
      const s = await window.__match.start(type, { online: extra.matchId || waitHuman ? true : C.online, matchId: extra.matchId, players, wait: waitHuman, opts: mayOnline ? { ...opts, turnTime: 40 } : opts });
      C.sess = s; C.screen = 'game'; C.html = '';
      let seatedFor = null, deckSent = false;
      s.on('view', v => {
        if (C.sess !== s) return; C.view = v;
        // il mazzo dell'album va mandato quando la partita è davvero partita (online in lobby le mosse sono rifiutate)
        if (type === 'figurine' && !deckSent) { deckSent = true; try { s.act({ k: 'deck', ids: col.deck() }); } catch (e) { } }
        if (C.mode3d && (v.players || v.opp)) { T3.setView(v); if (seatedFor !== s) { seatedFor = s; seatFriends(v); } }
        render();
      });
      s.on('event', e => { if (C.sess === s) onEvent(e); });
      s.on('over', r => { if (C.sess === s) onOver(r); });
      s.on('error', e => { if (C.sess === s && e && e.error) flash(e.fatal ? 'Collegamento perso: la partita continua senza di te' : e.error); });
      s.on('players', list => { if (C.sess === s && s.lobby) render(); if (C.sess === s && s.online && C.view) { const humans = (list || []).filter(p => !p.bot).length; if (humans > (C._humans || 1)) flash('È arrivato un giocatore al tavolo'); C._humans = humans; } });
      ACH('carte_prima');
      logEvent('carte', `si siede a giocare a ${GAME_NAME[type]}`);
    } catch (e) { console.warn('cards start', e); toast('Non riesco ad aprire la partita: ' + (e && e.message || e), 'warn'); }
    C.busy = false;
  }

  // ------- events → commenti, suoni -------
  function say(id, text, force) {
    if (!text) return;
    const now = performance.now();
    if (!force && now - C.lastSay < 2200) return;
    C.lastSay = now; C.said[id] = { text, t: now };
    const n = window.__npcs && window.__npcs.get && window.__npcs.get(id);
    if (n && C.mode3d) n.say(text, 4);
    render();
  }
  // linee: offline subito, a volte la battuta "vera" da Claude
  function comment(id, kind, ctx) {
    if (!pidPersona(id)) return;
    const base = rnd(LINES[kind] || LINES.brag);
    const fb = () => (Math.random() < 0.35 ? cap(catchphrase(id)) + '. ' : '') + base;
    if (aiOnline() && Math.random() < 0.3) {
      ask({ model: 'fast', maxTokens: 40, persona: id, system: `Sei ${persona(id).name}, al tavolo del Celtic con gli amici. Stile: ${persona(id).tone}. Una battuta brevissima (max 10 parole) da giocatore di carte. ${SAFE}`, prompt: ctx }, fb, 4000)
        .then(t => say(id, String(t).replace(/^["«]|["»]$/g, '').slice(0, 90), true));
    } else say(id, fb());
  }
  const isMe = i => C.view && i === C.view.me;
  const pidAt = i => C.view && C.view.players && C.view.players[i] ? C.view.players[i].id : null;
  function onEvent(e) {
    const v = C.view;
    switch (e.k) {
      case 'play': sfx('card'); break;
      case 'deal': sfx('shuffle'); break;
      case 'trick': {
        if (!v) break;
        sfx(e.points >= 10 ? 'coin' : 'card');
        const w = e.winner, wid = pidAt(w);
        if (e.points >= 10) {
          if (!isMe(w) && pidPersona(wid)) comment(wid, 'brag', `Hai appena preso una mano da ${e.points} punti a briscola.`);
          else if (isMe(w)) { const loser = (v.players || []).map((p, i) => i).find(i => !isMe(i) && v.players[i].team !== v.players[w].team && pidPersona(pidAt(i))); if (loser != null) comment(pidAt(loser), 'moan', `L'amico ti ha preso ${e.points} punti a briscola.`); }
        }
        break;
      }
      case 'scopa': {
        sfx('powerup');
        const wid = pidAt(e.p);
        if (!isMe(e.p) && pidPersona(wid)) comment(wid, 'scopa', 'Hai appena fatto scopa.');
        else { const o = (v && v.players || []).map((p, i) => i).find(i => !isMe(i) && pidPersona(pidAt(i)) && v.players[i].team !== v.players[e.p].team); if (o != null) comment(pidAt(o), 'scopaThem', 'L\'amico ti ha fatto scopa.'); }
        flash(isMe(e.p) ? 'SCOPA!' : `Scopa di ${seatName(e.p)}`);
        break;
      }
      case 'handEnd': {
        sfx('clear');
        if (v && v.me >= 0) { const myT = v.players[v.me].team; if (e.settebello[myT]) ACH('scopa_settebello'); if (e.scope[myT] >= 3) ACH('scopa_3'); }
        break;
      }
      case 'reveal': sfx('card'); break;
      case 'gulag': { sfx('hit'); const opp = C.view && C.view.opp; if (opp && pidPersona(opp.id) && e.side !== C.view.me) comment(opp.id, 'gulag', 'Hai mandato al Gulag una figurina dell\'amico.'); break; }
      case 'timeout': if (isMe(e.p)) flash('Tempo scaduto: carta giocata in automatico'); break;
      case 'join': flash('È arrivato un giocatore al tavolo'); break;
      case 'left': flash('Un giocatore ha lasciato: lo sostituisce un bot'); break;
    }
  }
  function outcomeOf(r) {
    const me = C.sess ? C.sess.me : 'me';
    if (!r || r.cancelled) return 'd';
    if (r.draw || !r.winners || !r.winners.length) return 'd';
    return r.winners.includes(me) ? 'w' : 'l';
  }
  function onOver(r) {
    C.result = r;
    const o = outcomeOf(r), t = C.type, g = col.stat(t, o);
    sfx(o === 'w' ? 'clear' : o === 'l' ? 'gameover' : 'coin');
    const R = window.__rpg;
    const xp = { briscola: 40, scopa: 60, figurine: 50 }[t] || 30, euro = { briscola: 8, scopa: 12, figurine: 10 }[t] || 5;
    try { if (R) { R.addXP && R.addXP(o === 'w' ? xp : Math.round(xp / 4), 'carte'); if (o === 'w' && R.money) R.money.add(euro, 'carte'); } } catch (e) { }
    r._reward = o === 'w' ? `+${xp} XP · +${euro} €` : `+${Math.round(xp / 4)} XP`;
    if (o === 'w') ACH(t === 'figurine' ? 'duel_win' : t + '_win');
    if (o === 'w' && t === 'briscola' && r.teamPoints && Math.max(...r.teamPoints) > 100) ACH('briscola_cappotto');
    try { const B = window.__board; if (B && B.submit && o === 'w') B.submit('carte_' + t, g.w, { lower: false }); } catch (e) { } // classifica: partite vinte
    // reazioni degli amici
    const v = C.view; if (v && v.players) for (const p of v.players) if (pidPersona(p.id) && Math.random() < 0.7) { const lost = !(r.winners || []).includes(p.id); comment(p.id, lost ? 'lose' : 'win', lost ? 'Hai perso a carte contro l\'amico.' : 'Hai vinto a carte contro l\'amico.'); break; }
    if (v && v.opp && pidPersona(v.opp.id)) comment(v.opp.id, o === 'w' ? 'lose' : 'win', o === 'w' ? 'Hai perso il duello di figurine.' : 'Hai vinto il duello di figurine.');
    const fr = (v && v.players ? v.players.map(p => p.id) : v && v.opp ? [v.opp.id] : []).find(id => pidPersona(id));
    if (fr && Math.random() < 0.5) phone(fr, o === 'w' ? `Mi hai battuto a ${GAME_NAME[t]}, ma era fortuna. Rivincita` : `Ti ho asfaltato a ${GAME_NAME[t]} 😂`);
    logEvent('carte', `${o === 'w' ? 'ha vinto' : o === 'l' ? 'ha perso' : 'ha pareggiato'} a ${GAME_NAME[t]}: ${r.summary || ''}`);
    try { window.dispatchEvent(new CustomEvent('bigalesso:event', { detail: { type: 'cards', game: t, outcome: o, summary: r.summary } })); } catch (e) { }
    render();
  }
  let flashT = 0;
  function flash(t) { C.flash = t; clearTimeout(flashT); flashT = setTimeout(() => { C.flash = ''; render(); }, 2600); render(); }

  // ------- input -------
  function onKey(e) {
    if (e.type && e.type !== 'keydown') return;
    const k = e.code, num = /^(Digit|Numpad)(\d)$/.exec(k);
    if (C.screen === 'menu') {
      if (k === 'Enter') { e.preventDefault(); start(C.type); }
      else if (num) { const t = ['briscola', 'scopa', 'figurine'][+num[2] - 1]; if (t) { C.type = t; fixOpp(); refreshLobby(); render(); } }
      return;
    }
    if (C.screen === 'game' && !C.view && C.sess && C.sess.lobby) { if (k === 'Enter' && C.sess.host) { e.preventDefault(); C.sess.begin(); } return; }
    if (C.screen === 'game' && C.result) { if (k === 'Enter') { e.preventDefault(); start(C.type); } else if (k === 'Backspace') { leaveGame(); open('menu'); } return; }
    if (C.screen === 'game' && C.view) {
      const v = C.view;
      if (v.type === 'figurine') {
        if (num && +num[2] >= 1 && +num[2] <= 7) { const i = +num[2] - 1; C.dsel = i < v.hand.length && C.dsel !== i ? i : -1; render(); }
        if (C.dsel >= 0 && (k === 'KeyA' || k === 'KeyS' || k === 'KeyD')) placeDuel({ KeyA: 0, KeyS: 1, KeyD: 2 }[k]);
        if (k === 'Enter' || k === 'Space') { e.preventDefault(); C.sess && C.sess.act({ k: 'end' }); }
        if (k === 'Backspace') { const all = v.lanes.flatMap(l => l.pending); const last = all[all.length - 1]; if (last) C.sess.act({ k: 'undo', u: last.u }); }
        return;
      }
      if (num) { const i = +num[2] - 1; if (C.opt >= 0 || C.optList) { if (C.optList && C.optList[i]) commitScopa(C.sel, C.optList[i]); } else if (v.hand[i] !== undefined) playCard(i); }
      if (k === 'ArrowLeft' || k === 'ArrowRight') { const n = v.hand.length; if (n) { C.sel = ((C.sel < 0 ? 0 : C.sel) + (k === 'ArrowLeft' ? n - 1 : 1)) % n; render(); } }
      if ((k === 'Enter' || k === 'Space') && C.sel >= 0) { e.preventDefault(); playCard(C.sel); }
      if (k === 'Backspace' && C.optList) { C.optList = null; C.sel = -1; render(); }
    }
    if (C.screen === 'album' && k === 'Enter' && col.packs() > 0) openPacks();
  }
  function myTurn() { const v = C.view; return v && v.phase === 'play' && v.turn === v.me; }
  function playCard(i) {
    const v = C.view; if (!v || !C.sess) return;
    const c = v.hand[i]; if (c === undefined) return;
    if (!myTurn()) { flash('Aspetta il tuo turno'); return; }
    if (v.type === 'scopa') {
      const o = captureOptions(v.table, c);
      if (o.length > 1) { C.sel = i; C.optList = o; render(); return; }
      commitScopa(i, o[0] || []);
      return;
    }
    C.sel = -1; const r = C.sess.act({ k: 'play', card: c }); if (r && r.ok === false && r.error) flash(r.error);
  }
  function commitScopa(i, take) {
    const v = C.view; const c = v.hand[i]; C.optList = null; C.sel = -1;
    const r = C.sess.act({ k: 'play', card: c, take }); if (r && r.ok === false && r.error) flash(r.error);
  }
  function placeDuel(lane) {
    const v = C.view; if (!v || C.dsel < 0) return; const h = v.hand[C.dsel]; if (!h) return;
    const r = C.sess.act({ k: 'place', u: h.u, lane }); if (r && r.ok === false) flash(r.error); else { C.dsel = -1; sfx('card'); }
  }

  // ------- click handling -------
  wrap.addEventListener('click', e => {
    const b = e.target.closest('[data-a]');
    if (b) {
      const a = b.dataset.a;
      if (a === 'game') { C.type = b.dataset.v; fixOpp(); refreshLobby(); render(); }
      else if (a === 'n') { C.n = +b.dataset.v; fixOpp(); render(); }
      else if (a === 'target') { C.target = +b.dataset.v; render(); }
      else if (a === 'diff') { C.diff = b.dataset.v; render(); }
      else if (a === 'online') { C.online = b.dataset.v === 'off' ? false : 'auto'; render(); }
      else if (a === 'wait') { C.waitHuman = !C.waitHuman; render(); }
      else if (a === 'begin') { if (C.sess && C.sess.begin) C.sess.begin(); }
      else if (a === 'opp') { const id = b.dataset.v, k = needOpp(); if (C.opp.includes(id)) C.opp = C.opp.filter(x => x !== id); else { C.opp.push(id); if (C.opp.length > k) C.opp.shift(); } render(); }
      else if (a === 'play') start(C.type);
      else if (a === 'join') start(b.dataset.t || C.type, { matchId: b.dataset.v });
      else if (a === 'again') start(C.type);
      else if (a === 'menu') { leaveGame(); open('menu'); }
      else if (a === 'leave') { leaveGame(); open('menu'); }
      else if (a === 'album') open('album');
      else if (a === 'packs') openPacks();
      else if (a === 'trade') openTrade();
      else if (a === 'close') close();
      else if (a === 'hand') playCard(+b.dataset.v);
      else if (a === 'opt') commitScopa(C.sel, C.optList[+b.dataset.v]);
      else if (a === 'cancelopt') { C.optList = null; C.sel = -1; render(); }
      else if (a === 'dhand') { C.dsel = C.dsel === +b.dataset.v ? -1 : +b.dataset.v; render(); }
      else if (a === 'lane') { if (C.dsel >= 0) placeDuel(+b.dataset.v); }
      else if (a === 'undo') { C.sess && C.sess.act({ k: 'undo', u: +b.dataset.v }); e.stopPropagation(); }
      else if (a === 'end') C.sess && C.sess.act({ k: 'end' });
      else if (a === 'deck') { const err = col.toggleDeck(b.dataset.v); if (err) flash(err); render(); }
      else if (a === 'offer') tradeOffer(b.dataset.v, b.dataset.s === '1');
      else if (a === 'accept') C.sess && C.sess.act({ k: 'accept' });
      return;
    }
  });

  // ------- render -------
  function render() {
    if (!ov.isOpen) return;
    let h = '';
    if (C.screen === 'menu') h = menuHTML();
    else if (C.screen === 'game') h = C.type === 'figurine' ? duelHTML() : C.type === 'scambio' ? tradeHTML() : tableHTML();
    else if (C.screen === 'album') h = albumHTML();
    else if (C.screen === 'packs') h = packsHTML();
    if (h !== C.html) { C.html = h; wrap.innerHTML = h; }
    // il conto alla rovescia non rifà l'HTML (i click non si perdono a metà)
    const tl = wrap.querySelector('[data-tl]'), left = C.view && C.view.turnLeft;
    if (tl) tl.textContent = left ? (tl.dataset.tl === 'b' ? ` · ${left}s` : `${left}s`) : '';
  }
  const chip = (a, v, label, sel, color) => `<button class="chip ${sel ? 'sel' : ''}" data-a="${a}" data-v="${esc(v)}" ${color ? `style="--c:${color}"` : ''}>${label}</button>`;
  function menuHTML() {
    const t = C.type, k = needOpp(), net = window.__net, online = !!(window.__match && window.__match.transport && net && net.online);
    const fr = friends().map(p => chip('opp', p.id, `${p.emoji || ''} ${esc(p.name)}${C.opp.indexOf(p.id) === 0 && t !== 'figurine' && C.n === 4 ? ' <small>(compagno)</small>' : ''}`, C.opp.includes(p.id), p.color)).join('');
    const lob = C.lobby.length ? `<div class="lobby">Partite aperte online: ${C.lobby.map(m => `<button class="mg-b" data-a="join" data-t="${esc(m.type || t)}" data-v="${esc(m.id)}">Entra · ${esc((m.players || []).map(p => p.name || p).join(', ') || 'tavolo')} (${(m.players || []).length}/${m.max || '?'})</button>`).join('')}</div>` : '';
    return `<h1>Carte al Celtic<small>${col.total()}/${col.size()} figurine · ${col.packs()} bustine da aprire · ${esc(statLine())}</small></h1>
      <div class="games">
        <button class="mg-b ${t === 'briscola' ? 'sel' : ''}" data-a="game" data-v="briscola"><b>🂡 Briscola</b><small>1 · a 2 o in coppie a 4 · 120 punti, vince chi supera 60</small></button>
        <button class="mg-b ${t === 'scopa' ? 'sel' : ''}" data-a="game" data-v="scopa"><b>🧹 Scopa</b><small>2 · carte, denari, settebello, primiera, scope</small></button>
        <button class="mg-b ${t === 'figurine' ? 'sel' : ''}" data-a="game" data-v="figurine"><b>🃏 Figurine duel</b><small>3 · 3 corsie, 6 turni, il tuo mazzo dell'album</small></button>
      </div>
      ${t !== 'figurine' ? `<div class="row"><span class="l">Giocatori</span>${chip('n', 2, 'Testa a testa', C.n === 2)}${chip('n', 4, 'In coppie (4)', C.n === 4)}</div>` : `<div class="row"><span class="l">Mazzo</span><span>${col.deck().length} figurine · <button class="chip" data-a="album">cambia nell'album</button></span></div>`}
      ${t === 'scopa' ? `<div class="row"><span class="l">Si va a</span>${chip('target', 11, '11', C.target === 11)}${chip('target', 21, '21', C.target === 21)}</div>` : ''}
      <div class="row"><span class="l">Difficoltà</span>${chip('diff', 'facile', 'Facile', C.diff === 'facile')}${chip('diff', 'media', 'Media', C.diff === 'media')}${chip('diff', 'tosta', 'Tosta', C.diff === 'tosta')}</div>
      <div class="row"><span class="l">${t === 'figurine' ? 'Contro' : C.n === 4 ? 'Al tavolo (' + k + ')' : 'Contro'}</span>${fr}</div>
      <div class="row"><span class="l">Online</span>${chip('online', 'auto', online ? 'Sì: il server fa da arbitro, chi è nella stanza può sedersi' : 'Quando sei collegato (Esc → Online)', C.online !== false)}${chip('online', 'off', 'Solo bot, offline', C.online === false)}${t === 'figurine' && online && C.online !== false ? chip('wait', 1, '👥 Aspetta un avversario umano', !!C.waitHuman) : ''}</div>
      ${lob}
      <div class="acts"><button class="mg-b go" data-a="play">Gioca <kbd>Invio</kbd></button><button class="mg-b" data-a="album">📒 Album figurine</button>${col.packs() ? `<button class="mg-b" data-a="packs">🎁 Apri ${col.packs()} bustin${col.packs() > 1 ? 'e' : 'a'}</button>` : ''}<button class="mg-b" data-a="trade">🤝 Scambia doppioni</button></div>`;
  }
  function statLine() { const s = ['briscola', 'scopa', 'figurine'].map(g => { const x = col.stats(g); return x.w + x.l + x.d ? `${GAME_NAME[g]} ${x.w}V ${x.l}S` : ''; }).filter(Boolean); return s.join(' · ') || 'nessuna partita ancora'; }
  const cardEl = (c, extra = '', attrs = '') => `<span class="ccard ${extra}" style="${cardCSS(c)}" title="${esc(cardName(c))}" ${attrs}></span>`;
  const backEl = () => `<span class="ccard back" style="${cardCSS(40)}"></span>`;
  function plChips(v) {
    return (v.players || []).map((p, i) => {
      if (i === v.me) return '';
      const pp = pidPersona(p.id), said = C.said[p.id], fresh = said && performance.now() - said.t < 4000;
      const team = v.n === 4 ? (p.team === (v.players[v.me] || {}).team ? 'compagno' : 'avversario') : '';
      return `<div class="pl ${v.turn === i && v.phase === 'play' ? 'turn' : ''}" style="--c:${pp ? pp.color : '#9aa'}"><span class="em">${pp ? pp.emoji : '🙂'}</span><div>${esc(p.name)}<small>${p.cards} carte${team ? ' · ' + team : ''}${p.bot && !pp ? ' · bot' : ''}</small></div>${fresh && !C.mode3d ? `<div class="bub">${esc(said.text)}</div>` : ''}</div>`;
    }).join('');
  }
  function tableHTML() {
    const v = C.view;
    if (!v) return `<div class="msg">Mischio le carte…</div>`;
    const meT = v.me >= 0 && v.players[v.me] ? v.players[v.me].team : 0;
    let felt = '', side = '';
    if (v.type === 'briscola') {
      const tr = v.trick || [];
      const seatPos = i => { const k = (i - v.me + v.n) % v.n; return v.n === 2 ? (k ? 'in alto' : 'tu') : ['tu', 'destra', 'di fronte', 'sinistra'][k]; };
      felt = `<div class="deckp">${v.deck ? `${backEl()}<div>${v.deck} nel mazzo</div>` : '<div>mazzo finito</div>'}${v.trumpOnTable ? `<div style="margin-top:6px">${cardEl(v.trump)}</div>` : ''}<div>briscola: <b>${SUITS[v.trumpSuit]}</b></div></div>`
        + (tr.length ? tr.map(t => `<div class="seat">${cardEl(t.c)}<span>${esc(isMe(t.p) ? 'tu' : seatName(t.p))}</span></div>`).join('') : `<div class="seat" style="opacity:.6">${v.phase === 'play' ? (v.turn === v.me ? 'Tocca a te: gioca una carta' : 'Tocca a ' + esc(seatName(v.turn))) : ''}</div>`);
      side = `<b>Briscola</b> · ${SUITS[v.trumpSuit]}<br>Mano ${v.tricks + 1} · mazzo ${v.deck}<br>I tuoi punti nel mazzetto: <b>${v.myPoints}</b>${v.last ? `<br><small>Ultima presa: ${esc(isMe(v.last.winner) ? 'tu' : seatName(v.last.winner))} (+${v.last.points})</small>` : ''}`;
    } else {
      const hl = new Set(C.optList ? C.optList.flat() : []);
      felt = `<div class="deckp">${v.deck ? `${backEl()}<div>${v.deck} nel mazzo</div>` : '<div>ultima mano</div>'}</div>`
        + (v.table.length ? v.table.map(c => cardEl(c, hl.has(c) ? 'pick' : '')).join('') : '<div style="opacity:.6">tavola pulita</div>');
      const tm = v.teams, my = tm[meT], th = tm[1 - meT];
      side = `<b>Scopa</b> a ${v.target} · smazzata ${v.hand_no}<table><tr><td></td><td>Voi</td><td>Loro</td></tr><tr><td>Punti</td><td><b>${my.score}</b></td><td><b>${th.score}</b></td></tr><tr><td>Carte</td><td>${my.pile}</td><td>${th.pile}</td></tr><tr><td>Denari</td><td>${my.denari}</td><td>${th.denari}</td></tr><tr><td>Settebello</td><td>${my.settebello ? '✔' : ''}</td><td>${th.settebello ? '✔' : ''}</td></tr><tr><td>Scope</td><td>${my.scope}</td><td>${th.scope}</td></tr></table>`
        + (v.handResult && v.phase === 'handEnd' ? `<small>Smazzata: carte ${v.handResult.carte[meT]}-${v.handResult.carte[1 - meT]}, denari ${v.handResult.denari[meT]}-${v.handResult.denari[1 - meT]}, settebello ${v.handResult.settebello[meT]}-${v.handResult.settebello[1 - meT]}, primiera ${v.handResult.primiera[meT]}-${v.handResult.primiera[1 - meT]} (${Math.max(0, v.handResult.prim[meT])} a ${Math.max(0, v.handResult.prim[1 - meT])}), scope ${v.handResult.scope[meT]}-${v.handResult.scope[1 - meT]}. Prossima tra ${v.nextIn || 0}s</small>` : '');
    }
    const turn = v.phase === 'play' && v.turn === v.me;
    const hand = v.hand.map((c, i) => `<span data-a="hand" data-v="${i}" style="position:relative">${cardEl(c, (C.sel === i ? 'sel' : '') + (turn ? '' : ' dim'))}<kbd>${i + 1}</kbd></span>`).join('');
    const opts = C.optList ? C.optList.map((o, i) => `<button class="mg-b" data-a="opt" data-v="${i}"><kbd>${i + 1}</kbd> Prendi ${o.map(c => esc(cardName(c))).join(' + ')}</button>`).join('') + '<button class="mg-b" data-a="cancelopt"><kbd>⌫</kbd> Annulla</button>' : '';
    const taker = v.type === 'briscola' && v.phase === 'show' && v.trick.length === v.n ? v.trick[trickWinner(v.trick, v.trumpSuit)].p : -1;
    const msg = C.flash || (v.phase === 'show' ? (taker >= 0 ? (isMe(taker) ? 'Prendi tu' : `Prende ${esc(seatName(taker))}`) : '') : turn ? (v.type === 'scopa' ? 'Tocca a te: scegli una carta (la presa è obbligatoria)' : 'Tocca a te') + '<span data-tl="b"></span>' : v.phase === 'play' ? `Tocca a ${esc(seatName(v.turn))}…` : '');
    const online = C.sess && C.sess.online ? ' · online, arbitra il server' : '';
    return `<div class="game"><div class="top">${plChips(v)}</div><div class="felt">${felt}</div><div class="opts">${opts}</div><div><div class="msg">${msg}</div><div class="hand">${hand}</div></div></div>
      <div class="side">${side}<br><small>${esc(GAME_NAME[v.type])}${online} · <kbd>1</kbd>-<kbd>3</kbd> gioca · <kbd>Esc</kbd> esci</small></div>${resultHTML()}`;
  }
  function resultHTML() {
    const r = C.result; if (!r) return '';
    const o = outcomeOf(r);
    let det = '';
    const v = C.view;
    if (C.type === 'scopa' && v && v.handResult) { const meT = v.players[v.me].team; det = `<table><tr><td>Punti finali</td><td>${r.teamScore ? r.teamScore[meT] : ''}</td><td>${r.teamScore ? r.teamScore[1 - meT] : ''}</td></tr></table>`; }
    if (C.type === 'briscola' && r.teamPoints && v) { const meT = v.players[v.me].team; det = `<table><tr><td>I tuoi punti</td><td><b>${r.teamPoints[meT]}</b></td></tr><tr><td>Loro</td><td>${r.teamPoints[1 - meT]}</td></tr></table>`; }
    return `<div class="res"><div class="box"><div>${esc(GAME_NAME[C.type] || '')}</div><div class="big" style="color:${o === 'w' ? '#7dff8a' : o === 'l' ? '#ff6a6a' : '#ffd040'}">${o === 'w' ? 'HAI VINTO' : o === 'l' ? 'HAI PERSO' : 'PATTA'}</div><div>${esc(r.summary || '')}</div>${det}<div style="margin:6px 0 14px;opacity:.75">${esc(r._reward || '')}</div><button class="mg-b go" data-a="again">Rivincita <kbd>Invio</kbd></button> <button class="mg-b" data-a="menu">Altro gioco</button> <button class="mg-b" data-a="close">Alzati</button></div></div>`;
  }
  // ---- duello ----
  const figEl = (id, { shiny = false, power = null, base = null, cls = '', attrs = '' } = {}) => {
    if (TOKENS[id]) return `<div class="fig tok ${cls}" ${attrs}>${TOKENS[id].emoji}${power != null ? `<span class="pw">${power}</span>` : ''}</div>`;
    const d = BY_ID[id]; const pc = power == null || base == null ? '' : power > base ? 'up' : power < base ? 'down' : '';
    return `<div class="fig ${cls} ${shiny ? 'shinyfx' : ''}" style="background-image:url(${figurinaURL(id, { personas: personas(), shiny })})" title="${esc(d ? d.name + ' — ' + d.title + ': ' + d.text : id)}" ${attrs}>${power != null ? `<span class="pw ${pc}">${power}</span>` : ''}</div>`;
  };
  function duelHTML() {
    const v = C.view, s = C.sess;
    if (!v && s && s.online && s.lobby) {
      const ps = (s.players ? s.players() : []) || [];
      return `<h1>Figurine duel online<small>${s.host ? 'Aspetti un avversario: chi è nella tua stanza la vede tra le partite aperte' : 'Aspetti che l\'host faccia partire il duello'}</small></h1>
        <div class="msg">Al tavolo: ${ps.length ? ps.map(p => esc(p.name || p.id)).join(', ') : 'solo tu'} (${ps.length}/2)</div>
        <div class="acts">${s.host ? `<button class="mg-b go" data-a="begin">${ps.length >= 2 ? 'Inizia il duello' : 'Inizia contro un bot'} <kbd>Invio</kbd></button>` : ''}<button class="mg-b" data-a="leave">Lascia <kbd>Esc</kbd></button></div>`;
    }
    if (!v) return `<div class="msg">Mescolo le figurine…</div>`;
    const plan = v.phase === 'plan' && !v.ended;
    const selCard = C.dsel >= 0 ? v.hand[C.dsel] : null;
    const lanes = v.lanes.map((l, i) => {
      const can = plan && selCard && l.mine.length + l.pending.length < 4;
      const theirs = l.theirs.map(c => figEl(c.id, { power: c.power, base: c.base })).join('') + '<div class="fig hidden"></div>'.repeat(l.theirPending || 0);
      const mine = l.mine.map(c => figEl(c.id, { power: c.power, base: c.base })).join('') + l.pending.map(p => figEl(p.id, { cls: 'pend', attrs: `data-a="undo" data-v="${p.u}"` })).join('');
      return `<div class="lane ${can ? 'can' : ''}" data-a="lane" data-v="${i}"><div class="side2">${theirs}</div><div class="mid ${l.winner > 0 ? 'win' : l.winner < 0 ? 'lose' : ''}"><span>${l.myPow}</span><span>${esc(l.name)} <kbd>${'ASD'[i]}</kbd></span><span>${l.theirPow}</span></div><div class="side2 mine">${mine}</div></div>`;
    }).join('');
    const hand = v.hand.map((h, i) => figEl(h.id, { cls: (C.dsel === i ? 'sel ' : '') + (plan && BY_ID[h.id].cost <= v.energy ? '' : 'no'), attrs: `data-a="dhand" data-v="${i}"` })).join('');
    const opp = v.opp, pp = pidPersona(opp.id), said = pp && C.said[opp.id], fresh = said && performance.now() - said.t < 4000;
    const msg = C.flash || (v.phase === 'reveal' ? 'Si girano le carte…' : v.ended ? `Aspetti ${esc(opp.name)}…` : selCard ? `Scegli la corsia per ${esc(BY_ID[selCard.id].name)} (clic o A/S/D)` : 'Scegli una figurina (1-7), poi una corsia. Invio = fine turno');
    return `<div class="game" style="grid-template-rows:auto 1fr auto auto">
      <div class="top"><div class="pl" style="--c:${pp ? pp.color : '#9aa'}"><span class="em">${pp ? pp.emoji : '🙂'}</span><div>${esc(opp.name)}<small>${opp.hand} in mano · ${opp.deck} nel mazzo${opp.ended && v.phase === 'plan' ? ' · pronto' : ''}</small></div>${fresh ? `<div class="bub">${esc(said.text)}</div>` : ''}</div></div>
      <div class="lanes">${lanes}</div>
      <div class="dbar"><span>Turno ${v.turn}/${v.maxTurn}</span><span class="beer">🍺 ${v.energy}/${v.energyMax}</span><span>Mazzo ${v.deck}</span><span data-tl="d"></span><button class="mg-b ${plan ? 'go' : ''}" data-a="end" ${plan ? '' : 'disabled'}>Fine turno <kbd>Invio</kbd></button></div>
      <div><div class="msg">${msg}</div><div class="dhand">${hand}</div></div></div>${resultHTML()}`;
  }
  // ---- album ----
  function albumHTML() {
    const items = CATALOG.map(c => {
      const n = col.owned(c.id), s = col.shiny(c.id);
      return `<div class="it ${n ? '' : 'miss'}" ${n ? `data-a="deck" data-v="${c.id}"` : ''} style="color:${rarityColor(c.rarity)}">${figEl(c.id, { shiny: s > 0 })}${n ? `<span class="n">×${n}</span>` : ''}${s ? '<span class="sh">LUCIDA</span>' : ''}${col.inDeck(c.id) && n ? '<span class="dk">MAZZO</span>' : ''}<div>${n ? esc(c.name) : '???'}</div></div>`;
    }).join('');
    return `<h1>Album delle figurine<small>${col.total()}/${col.size()} · mazzo del duello ${col.deck().length} (da ${DECK_MIN} a ${DECK_MAX}: clic su una figurina per metterla o toglierla) · bustine all'edicola della Piazzetta, ${PACK_PRICE} €</small></h1>
      <div class="row">${C.flash ? `<b>${esc(C.flash)}</b>` : ''}</div>
      <div class="album">${items}</div>
      <div class="acts"><button class="mg-b" data-a="menu">‹ Carte</button>${col.packs() ? `<button class="mg-b go" data-a="packs">🎁 Apri ${col.packs()} bustin${col.packs() > 1 ? 'e' : 'a'} <kbd>Invio</kbd></button>` : ''}<button class="mg-b" data-a="trade">🤝 Scambia doppioni (${col.dupes().length})</button></div>`;
  }
  // ---- bustine ----
  function openPacks() {
    const got = col.openPack(); if (!got) { flash('Niente bustine: comprale all\'edicola'); return; }
    C.pendingPack = got; open('packs');
    sfx('powerup');
    if (got.some(g => g.shiny)) ACH('shiny');
    if (got.some(g => BY_ID[g.id].rarity === 'leggendaria')) ACH('legend');
    if (col.total() >= 10) ACH('album_10'); if (col.total() >= col.size()) ACH('album_full');
  }
  function packsHTML() {
    const got = C.pendingPack || [];
    return `<h1>Bustina aperta<small>${col.total()}/${col.size()} nell'album</small></h1>
      <div class="packrow">${got.map((g, i) => `<div style="position:relative;animation-delay:${i * 0.25}s">${figEl(g.id, { shiny: g.shiny, cls: '', attrs: `style="animation-delay:${i * 0.25}s"` })}${g.isNew ? '<span class="new">NUOVA</span>' : ''}<div style="text-align:center;font:700 12px system-ui;margin-top:6px;color:${rarityColor(BY_ID[g.id].rarity)}">${esc(BY_ID[g.id].name)}${g.shiny ? ' ✦' : ''}</div></div>`).join('')}</div>
      <div class="acts">${col.packs() ? `<button class="mg-b go" data-a="packs">Apri un'altra (${col.packs()})</button>` : ''}<button class="mg-b" data-a="album">📒 Album</button><button class="mg-b" data-a="menu">‹ Carte</button></div>`;
  }
  // ---- scambio online ----
  async function openTrade() {
    const m = window.__match, net = window.__net;
    if (!m || !m.transport || !(net && net.online)) { flash('Per scambiare serve essere online: Esc → Online, entra in una stanza'); if (C.screen !== 'album') open('album'); return; }
    if (!col.dupes().length) { flash('Non hai doppioni da scambiare'); }
    leaveGame();
    try {
      const open1 = (await m.lobby('scambio')).find(x => (x.players || []).length < 2);
      const s = await m.start('scambio', { online: true, matchId: open1 ? open1.id : undefined, players: [] });
      C.sess = s; C.type = 'scambio'; C.screen = 'game'; C.result = null;
      s.on('view', v => { if (C.sess === s) { C.view = v; render(); } });
      s.on('over', r => { if (C.sess !== s) return; C.result = r; if (r.swap && r.swap[s.me]) { const sw = r.swap[s.me]; if (col.remove(sw.give.id, sw.give.shiny)) { col.add(sw.get.id, sw.get.shiny); ACH('scambio'); sfx('coin'); } } render(); });
      if (!ov.isOpen) ov.open();
      render();
    } catch (e) { flash('Scambio non disponibile: ' + (e && e.message || e)); }
  }
  function tradeOffer(id, shiny) { if (C.sess && C.type === 'scambio') C.sess.act({ k: 'offer', card: { id, shiny } }); }
  function tradeHTML() {
    const v = C.view || {};
    const dupes = col.dupes();
    const mine = dupes.map(id => `<div class="it" data-a="offer" data-v="${id}" data-s="${col.shiny(id) > 1 ? 1 : 0}" style="width:110px">${figEl(id, { cls: v.mine && v.mine.id === id ? 'sel' : '' })}<div>${esc(BY_ID[id].name)} ×${col.owned(id)}</div></div>`).join('') || '<div>Nessun doppione: apri altre bustine.</div>';
    const r = C.result;
    return `<h1>Scambio figurine<small>${v.other ? 'con ' + esc(v.other) : 'aspetto un altro giocatore della stanza… (anche lui apre Carte → Scambia)'}</small></h1>
      <div class="row" style="align-items:flex-start;gap:30px"><div><div class="row"><span class="l">I tuoi doppioni</span></div><div class="album" style="display:flex;flex-wrap:wrap;gap:10px">${mine}</div></div>
      <div><div class="row"><span class="l">Offre</span></div>${v.theirs ? figEl(v.theirs.id, { shiny: v.theirs.shiny }) + `<div>${esc(BY_ID[v.theirs.id].name)}${v.theirs.shiny ? ' ✦' : ''}</div>` : '<div style="opacity:.6">niente, per ora</div>'}</div></div>
      <div class="acts">${r ? `<b>${esc(r.summary)}</b>` : `<button class="mg-b go" data-a="accept" ${v.mine && v.theirs ? '' : 'disabled'}>Accetto lo scambio ${v.okThem ? '(lui ha già detto sì)' : ''}</button>`}<button class="mg-b" data-a="album">‹ Album</button></div>`;
  }

  // ---------------- tavolo del Celtic: posti, amici seduti, camera ----------------
  let seated = []; // { n, keep }
  function seatFriends(v) {
    unseatFriends();
    const list = v.type === 'figurine' ? [{ id: v.opp.id, i: 1 - Math.max(0, v.me) }] : v.players.map((p, i) => ({ id: p.id, i })).filter(x => x.i !== v.me);
    list.forEach(({ id, i }) => {
      const api = window.__npcs; if (!api || !pidPersona(id)) return;
      const seat = v.type === 'figurine' ? 2 : T3.seatOf(i);
      const sp = T3.seatPos(seat), yaw = T3.seatYaw(seat), dir = T3.dir(seat);
      const was = api.get(id), npc = was || api.spawn(id, { at: T3.standPos(seat) });
      if (!npc) return;
      const keep = { state: npc.state, leaving: npc.leaving, chatCD: npc.chatCD, was: !!was, home: npc.home && npc.home.clone() };
      npc.state = 'cards'; npc.target = null; npc.leaving = false; npc.chatCD = 1e9; npc.greeted = true; npc.yawGoal = yaw; npc.root.rotation.y = yaw;
      const F = dir.clone().negate(); // verso il tavolo
      if (npc.man && 'sit' in npc.man) { // avatar con posa seduta (man.js)
        npc.root.position.copy(sp).addScaledVector(F, 0.3);
        const rt = V(F.z, 0, -F.x);
        npc.man.sit = { src: 'cards', hip: sp.clone().addScaledVector(F, -0.02).setY(0.56), feet: { Left: sp.clone().addScaledVector(F, 0.46).addScaledVector(rt, -0.12).setY(0.09), Right: sp.clone().addScaledVector(F, 0.46).addScaledVector(rt, 0.12).setY(0.09) }, w: 1, tilt: 0.05 };
      } else if (npc.man && npc.man.playClip && npc.man.A && npc.man.A.sit) { // modello Tripo con la clip seduta
        npc.root.position.copy(sp).addScaledVector(F, 0.08); npc.man.playClip('sit', { loop: true });
      } else npc.root.position.copy(T3.standPos(seat));
      seated.push({ n: npc, keep, id });
    });
  }
  function unseatFriends() {
    for (const s of seated) {
      const n = s.n; if (!n || !n.root) continue;
      if (n.man && n.man.sit && n.man.sit.src === 'cards') n.man.sit = null;
      if (n.man && n.man.stopClip) try { n.man.stopClip('sit'); } catch (e) { }
      n.state = 'idle'; n.wait = 3; n.chatCD = 20 + Math.random() * 30; n.leaving = s.keep.leaving || false;
      n.root.position.copy(T3.standPos(2)).add(V((Math.random() - 0.5) * 1.2, 0, 0.6));
      n.say(rnd(['Bella partita, stronzo', 'Rivincita mercoledì', 'Vado al bancone', 'Ciao coglione, alla prossima']), 3);
    }
    seated = [];
  }
  function standUp() {
    T3.exit(); unseatFriends();
    if (man.sit && man.sit.src === 'cards') man.sit = null;
    man.root.position.copy(T3.standPos(0));
    if (W && W.mode === 'cards' && H) H.setMode('explore');
  }
  const tableAvailable = () => !!(level && level.anchors && level.anchors.celtic);
  const plugin = (ctx, w, h) => {
    W = w; H = h;
    const items = [];
    if (tableAvailable()) {
      items.push({ id: 'cards_table', label: () => 'Siediti a giocare a carte (briscola, scopa, figurine)', anchor: () => T3.standPos(0), top: () => T3.center.clone().setY(1.05), range: 1.3,
        act: () => { if (W.carry) { h.toast('Prima posa quello che hai in mano'); return; } try { window.__combat && window.__combat.holster && window.__combat.holster(); } catch (e) { } h.goTo(T3.standPos(0), T3.seatYaw(0), () => h.setMode('cards')); } });
    }
    const ed = level && level.anchors && level.anchors.edicola;
    if (ed) {
      const at = V(45.35, 0, 22.35);
      items.push({ id: 'cards_edicola', label: () => `Bustina di figurine (${PACK_PRICE} €)`, anchor: () => at, top: () => V(45.3, 1.55, 22.95), range: 1.2, act: () => buyPack(h) });
    }
    let sitK = 0;
    // vettori fissi del posto a sedere (calcolati una volta) + scratch: niente allocazioni per frame
    let P0 = null;
    const camOut = { pos: V(), look: V(), fov: 50 };
    const sitOut = { src: 'cards', hip: V(), feet: { Left: V(), Right: V() }, w: 0, tilt: 0.12 };
    const poseOut = { lookW: 1, lookAt: V(), crouchT: 0, rL: { pos: V(), w: 0, palm: 'down', grip: 0.5 }, rR: { pos: V(), w: 0, palm: 'down', grip: 0.5 } };
    const seatPts = () => {
      if (P0) return P0;
      const sp = T3.seatPos(0), F = V(0, 0, 1), rt = V(-1, 0, 0), lap = T3.center.clone().setY(0.82).addScaledVector(F, -0.32);
      P0 = { stand: T3.standPos(0), seat: sp.clone().addScaledVector(F, 0.32), hip: sp.clone().addScaledVector(F, -0.02).setY(0.56),
        fL: sp.clone().addScaledVector(F, 0.46).addScaledVector(rt, 0.12).setY(0.09), fR: sp.clone().addScaledVector(F, 0.46).addScaledVector(rt, -0.12).setY(0.09),
        look: T3.center.clone().setY(0.78), hL: lap.clone().addScaledVector(rt, 0.1), hR: lap.clone().addScaledVector(rt, -0.1) };
      return P0;
    };
    return {
      items,
      owns: m => m === 'cards',
      update(mode, dt) {
        const P = seatPts();
        if (!W.m.opened && W.t > 0.15) { W.m.opened = true; T3.enter(); fixOpp(); open('menu', { mode3d: true }); }
        sitK = Math.min(1, sitK + dt * 2.2);
        const w2 = sitK * sitK * (3 - 2 * sitK);
        man.root.position.copy(P.stand).lerp(P.seat, w2);
        W.yaw = 0;
        sitOut.hip.copy(P.hip); sitOut.feet.Left.copy(P.fL); sitOut.feet.Right.copy(P.fR); sitOut.w = w2;
        man.sit = sitOut;
        if (!ov.isOpen && W.t > 1) { sitK = 0; standUp(); return {}; }
        poseOut.lookW = 1; poseOut.crouchT = 0; poseOut.lookAt.copy(P.look);
        poseOut.rL.pos.copy(P.hL); poseOut.rL.w = w2 * 0.8; poseOut.rR.pos.copy(P.hR); poseOut.rR.w = w2 * 0.8;
        return poseOut;
      },
      camera(pose, dt) {
        if (W.mode !== 'cards') return null;
        const c = T3.camera(); const k = Math.min(1, W.t * 1.6); const s = k * k * (3 - 2 * k);
        const f0 = pose.fov || 50;
        camOut.pos.copy(pose.pos).lerp(c.pos, s); camOut.look.copy(pose.look).lerp(c.look, s); camOut.fov = f0 + (c.fov - f0) * s;
        return camOut;
      },
    };
  };
  function buyPack(h) {
    const R = window.__rpg;
    if (R && R.money && !R.money.spend(PACK_PRICE)) { (h ? h.toast : toast)(`Ti servono ${PACK_PRICE} € per una bustina`); sfx('err'); return; }
    col.addPacks(1); sfx('coin');
    (h ? h.toast : toast)('L\'edicolante: «Tieni, e non fare il furbo coi doppioni»');
    openPacks(); if (!ov.isOpen) open('packs');
  }
  // figurine nel loot: casse (6%), boss (sempre), kill (0.6%)
  addEventListener('bigalesso:rpg', e => {
    const d = e.detail || {};
    if (d.type === 'crate' && Math.random() < 0.06) giftPack('Nella cassa c\'era una bustina di figurine!');
  });
  let killHooked = false; // combat/ si installa dopo: aggancio al primo frame utile
  function hookKills() { if (killHooked) return; const CB = window.__combat; if (!CB || !CB.on) return; killHooked = true; try { CB.on('kill', k => { if (k && (k.type === 'boss' || k.type === 'vigile' || k.boss)) giftPack('Il Vigile aveva una bustina di figurine in tasca!'); else if (Math.random() < 0.006) giftPack('Hai trovato una bustina di figurine!'); }); } catch (e) { } }
  function giftPack(msg) { col.addPacks(1); toast('🎁 ' + msg + ' (telefono → Carte)', 'gold'); sfx('powerup'); }

  // ---------------- telefono: app "Carte" ----------------
  function phoneHTML() {
    return `<div style="font:700 12px system-ui;opacity:.65;padding:0 4px">${col.total()}/${col.size()} figurine · ${col.packs()} bustine da aprire</div>
        <button data-cards="briscola"><b>🂡 Briscola</b><small>contro gli amici, a 2 o in coppie</small></button>
        <button data-cards="scopa"><b>🧹 Scopa</b><small>a 11 o a 21, settebello e primiera</small></button>
        <button data-cards="figurine"><b>🃏 Figurine duel</b><small>il tuo mazzo, 3 corsie, 6 turni</small></button>
        <button data-cards="album"><b>📒 Album</b><small>collezione e mazzo del duello</small></button>
        ${col.packs() ? `<button data-cards="packs"><b>🎁 Apri bustine (${col.packs()})</b><small>5 figurine a bustina</small></button>` : ''}
        <button data-cards="trade"><b>🤝 Scambia doppioni</b><small>online, con chi è nella stanza</small></button>`;
  }
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('#phone [data-cards]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const a = b.dataset.cards; try { window.__phone && window.__phone.close && window.__phone.close(); } catch (er) { }
    setTimeout(() => {
      if (a === 'album') open('album'); else if (a === 'packs') { if (col.packs()) openPacks(); else open('album'); } else if (a === 'trade') { open('album'); openTrade(); }
      else { C.type = a; open('menu', { mode3d: false }); }
    }, 80);
  }, true);

  // ---------------- API ----------------
  const api = {
    open: (screen = 'menu', o = {}) => open(screen, { mode3d: false, ...o }),
    challenge(friendId, type = 'briscola') { C.type = type; C.n = 2; C.opp = [friendId]; open('menu', { mode3d: false }); },
    album: () => open('album', { mode3d: false }),
    packs: () => openPacks(),
    addPack: msg => giftPack(msg || 'Bustina di figurine!'),
    phoneHTML,
    get state() { return { screen: C.screen, type: C.type, view: C.view, result: C.result, online: !!(C.sess && C.sess.online), mode3d: C.mode3d, open: ov.isOpen }; },
    act: a => C.sess && C.sess.act(a), // test
    collection: col,
    table: T3,
  };
  window.__cards = api;
  return {
    plugin, api,
    update(dt) { T3.update(dt); if (!killHooked) hookKills(); if (ov.isOpen && C.screen === 'game') { const now = performance.now(); if (now - (C._rt || 0) > 500) { C._rt = now; render(); } } },
  };
}
