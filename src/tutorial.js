// tutorial.js — BIGALESSO first-run tutorial, the "Cose da fare" guide and the contextual tips.
//   installTutorial({ ui, S, input, level, man, camera, getWorld, audio })   main.js, right after installPhone
//   main.js startWorld(): window.__tutorial.firstRun() -> true when the onboarding started (the welcome toast is skipped)
// 1) Onboarding (first start, after the intro): 6 guided steps that wait for the real action — look around, walk,
//    interact (E), open the phone, open the menu, walk out of the garden gate. A compact card (top-left on desktop,
//    under the top bar on touch) with title, one line, key hints for keyboard / touch / gamepad, progress dots and
//    "Salta tutorial" (button, or Backspace while the mouse is captured). Nothing is paused; the card hides itself
//    whenever something else is on screen (menu, phone, overlays, cabinet, minigames, cutscenes).
// 2) Guide: menu page "guide" (ui.js: Esc → Tutorial e guida, tab Guida) -> renderGuide(el); phone app Guida ->
//    renderApp(el). Every game/feature: what it is, where it is, how to start it, the keys; replay the tutorial there.
// 3) Tips: shown once each (persisted), one at a time, >= 30 s apart, dismissable (✕ or Backspace), only while walking
//    or driving with nothing else open; off with Impostazioni → Suggerimenti a schermo.
// Saved in localStorage 'bigalesso_tutorial_v1' (net/profile.js syncs it like every bigalesso_* key).
// URL: ?notutorial (all off) · ?tutorial=1 (first-run behaviour also on ?auto test URLs, which otherwise skip it)
//      ?tutorial=force (replay it on every start)
// window.__tutorial = { firstRun(), start(), skip(), replay(), state(), tip(id), resetTips(), renderGuide(el), renderApp(el),
//   openGuide(), steps, tips, guide }
import * as THREE from 'three';
import { DN, zombiesOut } from './daynight.js';

const KEY = 'bigalesso_tutorial_v1';
const TIP_GAP = 30;           // s between two tips
const VETERAN_S = 15 * 60;    // players with more play time than this (from before the tutorial existed) skip it
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapA = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

// ---------------------------------------------------------------- text helpers
// [X] -> a key cap · {E} / {R} -> the action / alternative button of the current device (bubble: E/R · ●/◆ · A/Y)
const ACT = { kb: { E: 'E', R: 'R' }, touch: { E: '●', R: '◆' }, pad: { E: 'A', R: 'Y' } };
function fmt(s, dev = 'kb') {
  if (!s) return '';
  return esc(s).replace(/\{([ER])\}/g, (_, k) => `<kbd${k === 'R' ? ' class="alt"' : ''}>${ACT[dev][k]}</kbd>`).replace(/\[([^\]]+)\]/g, (_, k) => `<kbd>${k}</kbd>`);
}

// ---------------------------------------------------------------- the onboarding steps
const STEPS = [
  { id: 'look', title: 'Guardati intorno', meter: true,
    text: { kb: 'Muovi il mouse per girare la visuale. Se non gira, clicca una volta sullo schermo: adesso il mouse è tuo.', touch: 'Trascina il dito sulla metà destra dello schermo per girare la visuale.', pad: 'Gira la visuale con lo stick destro.' },
    keys: { kb: 'mouse: visuale · rotella: zoom · [C] camera', touch: 'trascina a destra: visuale · due dita: zoom', pad: 'stick destro: visuale' } },
  { id: 'walk', title: 'Fatti due passi', meter: true,
    text: { kb: 'Fai un giro per la sala. Il cane ti guarda, ma non giudica.', touch: 'Appoggia il pollice a sinistra: il joystick compare lì. Fai un giro per la sala.', pad: 'Fai un giro per la sala. Il cane ti guarda, ma non giudica.' },
    keys: { kb: '[W] [A] [S] [D] o frecce: cammina · [Shift] corri', touch: 'joystick a sinistra · spingi in fondo per correre', pad: 'stick sinistro: cammina · [LB] o [RB] corri' } },
  { id: 'act', title: 'Tocca tutto',
    text: { kb: 'Avvicinati al cabinato, al cane o alla macchina da scrivere: quando spunta il fumetto, fai qualcosa.', touch: 'Avvicinati al cabinato o al cane: quando spunta il fumetto, tocca il pulsante verde.', pad: 'Avvicinati al cabinato, al cane o alla macchina da scrivere: quando spunta il fumetto, fai qualcosa.' },
    keys: { kb: '{E} interagisci · {R} azione alternativa', touch: '{E} verde: interagisci · {R} lilla: alternativa', pad: '{E} interagisci · {R} alternativa' } },
  { id: 'phone', title: 'Il telefono',
    text: { kb: 'Dentro c\'è il gruppo «Teletubbylandia certificata» (rispondono, purtroppo), la mappa, i giochi, i lavori e la guida.', touch: 'Dentro c\'è il gruppo «Teletubbylandia certificata» (rispondono, purtroppo), la mappa, i giochi, i lavori e la guida.', pad: 'Col pad il telefono non si apre: premi [T] sulla tastiera. Se non ce l\'hai a portata, tra poco vado avanti da solo.' },
    keys: { kb: '[T] apri e chiudi', kbOnline: '[P] apri e chiudi · online la [T] è la chat', touch: 'tocca 📱 in alto a sinistra', pad: 'tastiera: [T]' } },
  { id: 'menu', title: 'Menu e mappa',
    text: { kb: 'Nel menu ci sono la mappa, il Personaggio, gli obiettivi, i comandi e «Tutorial e guida» con tutto quello che c\'è da fare.', touch: 'Nel menu ci sono la mappa, il Personaggio, gli obiettivi, i comandi e «Tutorial e guida» con tutto quello che c\'è da fare.', pad: 'Nel menu ci sono la mappa, il Personaggio, gli obiettivi, i comandi e «Tutorial e guida» con tutto quello che c\'è da fare.' },
    keys: { kb: '[Esc] apri il menu', touch: 'tocca ☰ in alto a destra', pad: '[Start] apri il menu' } },
  { id: 'street', title: 'Fuori di casa',
    text: { kb: 'Esci dal cancello in fondo al giardino: di là c\'è Via Teletubbylandia e comincia il quartiere.', touch: 'Esci dal cancello in fondo al giardino: di là c\'è Via Teletubbylandia e comincia il quartiere.', pad: 'Esci dal cancello in fondo al giardino: di là c\'è Via Teletubbylandia e comincia il quartiere.' },
    keys: { kb: 'segui il segnalino arancione', touch: 'segui il segnalino arancione', pad: 'segui il segnalino arancione' } },
];
const FINAL = { title: 'Patentino preso',
  text: { kb: 'Sei in strada. Celtic, Piazzetta, Via Petroni, Teletubbylandia: la lista completa di cosa fare è in [Esc] → Tutorial e guida, o sul telefono → Guida.',
    touch: 'Sei in strada. Celtic, Piazzetta, Via Petroni, Teletubbylandia: la lista completa di cosa fare è in ☰ → Tutorial e guida, o sul telefono → Guida.',
    pad: 'Sei in strada. Celtic, Piazzetta, Via Petroni, Teletubbylandia: la lista completa di cosa fare è in [Start] → Tutorial e guida.' } };

// ---------------------------------------------------------------- the guide ("Cose da fare")
const CATS = [
  { id: 'base', name: 'Primi passi', c: '#5ad1ff' },
  { id: 'casa', name: 'Casa e giardino', c: '#ffb35a' },
  { id: 'quartiere', name: 'Il quartiere', c: '#4be08a' },
  { id: 'giochi', name: 'Minigiochi', c: '#ff3d7f' },
  { id: 'motori', name: 'Motori', c: '#ff6a3c' },
  { id: 'soldi', name: 'Lavori e soldi', c: '#28c2a0' },
  { id: 'botte', name: 'Botte e zombi', c: '#c8f03c' },
  { id: 'online', name: 'Online e Party', c: '#9a7cff' },
];
// n name · d what it is · w where · h how to start · k / t / p keys (keyboard / touch / gamepad; pad falls back to k)
const GUIDE = [
  // primi passi
  { cat: 'base', ic: '🚶', n: 'Muoversi e guardarsi intorno', d: 'Casa, giardino e tutto il quartiere a piedi. Il mouse comanda la visuale: se non gira, clicca una volta sullo schermo.',
    k: '[W] [A] [S] [D] o frecce · [Shift] corri · mouse: visuale · rotella: zoom · [C] camera · [V] prima persona', t: 'pollice sinistro: joystick (in fondo corri) · trascina a destra: visuale · due dita: zoom', p: 'stick sinistro · stick destro: visuale · [LB] [RB] corri · [R3] prima persona' },
  { cat: 'base', ic: '💬', n: 'Fumetti e azioni', d: 'Se sopra a qualcosa spunta il fumetto, ci puoi fare qualcosa. Risponde quasi tutto, anche il frigo di Seghino.',
    h: '{E} l\'azione del fumetto · {R} quella alternativa', k: '[1] saluta · [2] esulta · [3] balla · [4] facepalm · [B] ruota delle emote (anche il tasto centrale)', t: '😎 in alto a sinistra: ruota delle emote', p: '' },
  { cat: 'base', ic: '📱', n: 'Il telefono', d: 'Il gruppo «Teletubbylandia certificata» (gli amici rispondono, purtroppo), Contatti per chiamarli, Mappa, Giochi, Missioni, Lavori, Motori, Party e questa guida.',
    k: '[T] apri e chiudi · online la [T] è la chat e il telefono va sulla [P]', t: '📱 in alto a sinistra', p: 'col pad no: serve la [T] della tastiera' },
  { cat: 'base', ic: '☰', n: 'Menu, mappa e obiettivi', d: 'Pausa, mappa dei posti scoperti, Personaggio con livello e talenti, obiettivi, segreti, impostazioni, comandi e questa guida.',
    k: '[Esc] menu · [↑] [↓] scegli · [Q] [E] cambia scheda', t: '☰ in alto a destra', p: '[Start] menu · [LB] [RB] cambia scheda' },
  { cat: 'base', ic: '🙂', n: 'Gli amici', d: 'Quelli del gruppo girano per casa e per il quartiere. Ci parli, li sfotti, li porti al Celtic e ti chiedono favori.',
    w: 'In giro · telefono → Contatti per farli venire da te', h: '{E} vicino a un amico', k: '[1] [2] [3] rispondi · [4] scrivi tu · [5] azioni (birra, cinque, braccio di ferro, selfie, seguimi) · [6] missioni · [7] carte', t: 'tocca la risposta che vuoi', p: '' },
  { cat: 'base', ic: '🌙', n: 'Giorno e notte', d: 'Un giorno dura 24 minuti veri ed è lo stesso per tutti, anche online. Più o meno dalle 20 alle 6 escono gli zombi.',
    w: 'L\'orologio (sole o luna e l\'ora) è in basso a destra' },
  // casa e giardino
  { cat: 'casa', ic: '🕹️', n: 'Cabinato BIGALESSO', d: 'Lo sparatutto di casa: stage, boss, combo e la mega bomba per i momenti disperati. In due si spara meglio.',
    w: 'Sala giochi', h: '{E} siediti · {R} infila un gettone', k: 'frecce o [W] [A] [S] [D] · [Z] o [Spazio] spara · [X] mega bomba · [Invio] start · [2] entra il giocatore 2 · [C] camera · [Esc] o [Q] alzati', t: 'SPARA · BOMBA · START · ESCI', p: '[A] spara · [B] bomba · [Start] start · due pad: due giocatori' },
  { cat: 'casa', ic: '🥊', n: 'Il Direttore Incassa', d: 'Boxe contro il direttore: schiva, para e rispondi ai pugni con un bacio volante. Funziona più spesso di quanto dovrebbe.',
    w: 'Sala giochi, il cabinato accanto', h: '{E} siediti', k: '[←] [→] schiva · [↓] abbassati · [↑] para · [Z] bacio volante · [X] spritz · [Esc] alzati' },
  { cat: 'casa', ic: '🐩', n: 'Il cane', d: 'Il barboncino di casa. Più coccole, più affetto, e con l\'affetto si sbloccano i trucchi. Se balli, balla anche lui.',
    w: 'Di solito in sala giochi', h: '{E} accarezza · {R} vieni con me / resta lì', k: '[G] trucchi e giochi · la palla si raccoglie e si lancia con {E}' },
  { cat: 'casa', ic: '⌨️', n: 'Macchina da scrivere & co.', d: 'Scrivi a macchina (prova a scrivere BIGALESSO), ascolta la conchiglia, spegni la luce, prendi l\'estintore e spruzza tutto. Anche il cane.',
    w: 'Sala giochi', h: '{E} su ognuno', k: 'estintore: [F] o clic spruzza, {E} lo rimetti · macchina da scrivere: [Esc] ti alzi' },
  { cat: 'casa', ic: '📰', n: 'Il Corriere delle Due Torri', d: 'Il giornale del gruppo: sfoglialo, guarda le stampe in casa e il murales in giardino. Alcune notizie diventano vere.',
    w: 'In casa e in giardino', h: '{E} leggi il Corriere' },
  { cat: 'casa', ic: '🔎', n: 'Il caso della collana', d: 'Dal Corriere N.281: una collana sparita, indizi sparsi per casa e un blitz da far partire al momento giusto.',
    w: 'Sala giochi e salotto: parti dagli annunci in bacheca', h: '{E} sugli indizi · quando sei pronto, chiama il 112' },
  { cat: 'casa', ic: '🗝️', n: 'Segreti', d: 'Easter egg ovunque, e sotto casa c\'è un posto che non dovrebbe esserci. Indizio gratis: in salotto si legge parecchio.',
    w: 'Esc → Segreti, per gli indizi' },
  // quartiere
  { cat: 'quartiere', ic: '🏘️', n: 'Via Teletubbylandia', d: 'La strada fuori dal cancello: case degli amici, Celtic, Sushi, Officina e fermata del bus. Da qui parte tutto.',
    w: 'Esci dal cancello in fondo al giardino' },
  { cat: 'quartiere', ic: '🗞️', n: 'Piazzetta', d: 'L\'edicola con le bustine di figurine e la bacheca dei lavori. Panchine e piccioni inclusi.',
    w: 'In fondo a Via Teletubbylandia, verso est' },
  { cat: 'quartiere', ic: '🍻', n: 'Via Petroni', d: 'Portici, locali, il Banco dei pegni e in fondo il Millennium. Di notte è il posto più vivo, nel bene e nel male.',
    w: 'Dalla Piazzetta verso nord' },
  { cat: 'quartiere', ic: '🪩', n: 'Millennium', d: 'Il club in fondo a Via Petroni. Ci entri, ci balli, oppure fai il buttafuori e decidi tu chi entra.',
    w: 'In fondo a Via Petroni' },
  { cat: 'quartiere', ic: '🌈', n: 'Teletubbylandia', d: 'Il prato oltre il Checkpoint (zona demilitarizzata): gabbia del calcetto, canestro e, di notte, zombi dalle colline.',
    w: 'In fondo a Via Teletubbylandia, verso ovest' },
  { cat: 'quartiere', ic: '⛲', n: 'Il centro', d: 'Dal Voltone sbuchi in Via Zamboni, Piazza Verdi, Via Rizzoli e Piazza Maggiore, col Nettuno e San Petronio.',
    w: 'Il Voltone, sotto i portici di Via Teletubbylandia' },
  // minigiochi
  { cat: 'giochi', ic: '❓', n: 'Chi l\'ha detto?', d: 'Il quiz sulle frasi vere del gruppo: indovina chi l\'ha scritta. Figuracce garantite.',
    w: 'Cabinato in sala giochi · tavolo al Celtic · telefono → Giochi · in sfida col Party', k: 'al cabinato: frecce scegli · [Z] conferma · [Invio] start · in sfida: [1]-[4] rispondi' },
  { cat: 'giochi', ic: '⚖️', n: 'Processo AI', d: 'Porti un amico alla sbarra (o ci finisci tu) e decide un giudice AI. Le pene sono fantasiose.',
    w: 'Telefono → Giochi · il tribunale vero è nel Gulag' },
  { cat: 'giochi', ic: '🖨️', n: 'Corriere AI', d: 'Un\'edizione speciale del Corriere sulla tua partita, scritta al momento.',
    w: 'Scrivania della redazione in sala giochi · telefono → Giochi', h: '{E} alla scrivania' },
  { cat: 'giochi', ic: '🍣', n: 'Sushi all you can eat', d: '60 secondi al nastro contro gli amici: i piatti d\'oro valgono 3, la bomba al wasabi brucia.',
    w: 'Al Sushi, in Via Teletubbylandia · telefono → Giochi', k: '{E}, [Spazio] o clic: prendi il piatto' },
  { cat: 'giochi', ic: '🎧', n: 'Compettina Discord', d: 'Duello di mira al meglio delle 5, come ai vecchi tempi ma senza la scusa del lag.',
    w: 'Casa di Ashish · telefono → Giochi' },
  { cat: 'giochi', ic: '🧟', n: 'La Zombata di Seghino', d: 'Il cabinato horror di Seghino: spari, molotov e un boss che non si lava.',
    w: 'Casa di Seghino, in Via Teletubbylandia', h: '{E} siediti', k: 'frecce muoviti · [Z] spara (tieni: mira fissa) · [X] molotov · [Invio] start' },
  { cat: 'giochi', ic: '🌑', n: 'Zombata notturna', d: 'Di notte all\'aperto gli zombi escono dal terreno: resisti 60 secondi o arriva al Checkpoint. L\'estintore li respinge.',
    w: 'Giardino o Teletubbylandia, di notte · online la fate tutti insieme' },
  { cat: 'giochi', ic: '🚌', n: 'Ultimo in piedi', d: 'Battle royale nel quartiere: ti lanci con l\'ombrello, raccatti armi, brodo e felpe, resti nella zona. Vince l\'ultimo.',
    w: 'Fermata del bus appena fuori dal cancello · telefono → Giochi', k: 'clic sulla mappa: dove lanciarti · {E} raccogli · [Tab] mappa · da eliminato {E} o [Spazio] cambi chi guardi' },
  { cat: 'giochi', ic: '⛓️', n: 'Gulag profondo', d: 'Roguelike: stanze a caso, armi e vizi che valgono solo per la run, il Secondino in fondo. I Gettoni del Gulag restano.',
    w: 'Telefono → Giochi (o la porta di ferro, se trovi la cantina) · in co-op con un bot o col Party', k: '{E} alle porte: si aprono a stanza pulita · ripostiglio · Spaccio di Cesco · in co-op tieni premuto {E} su un amico a terra per rianimarlo' },
  { cat: 'giochi', ic: '🗺️', n: 'Assedio al quartiere', d: 'Strategico: comandi gli amici contro le orde. Recluti, metti barricate e torrette, chiami l\'ondata quando sei pronto.',
    w: 'Tavolo del comando in giardino · telefono → Giochi', k: 'trascina: seleziona · clic destro: muovi o attacca · [Z] [X] [C] [V] recluta · [B] barricata · [N] torretta · [G] chiama l\'ondata' },
  { cat: 'giochi', ic: '⚽', n: 'Calcetto', d: '3 contro 3 con gli amici nella gabbia, rigori o tiri liberi al canestro. Online, col Party, 1 contro 1 o 2 contro 2.',
    w: 'Teletubbylandia', k: '{E} o clic: tira (tieni per caricare) · [R] pallonetto · [Q] passa · alla lavagna: {E} partita, {R} rigori' },
  { cat: 'giochi', ic: '🃏', n: 'Carte e figurine', d: 'Briscola e scopa al Celtic, figurine degli amici da collezionare, scambiare e far duellare.',
    w: 'Tavolo del Celtic · edicola in Piazzetta · telefono → Carte · con un amico: [7] nel dialogo', k: '[1] [2] [3] o clic: gioca la carta · figurine: [1]-[7] poi [A] [S] [D] · [Invio] fine turno' },
  // motori
  { cat: 'motori', ic: '🚗', n: 'La tua 500', d: 'Macchina tua, tuning tuo. Le 500 degli amici si prendono in prestito (solo per oggi).',
    w: 'Davanti all\'Officina, in Via Teletubbylandia · telefono → Motori te la porta', h: '{E} sali · {E} o [Q] scendi (da fermo)',
    k: '[W] [S] gas e freno · [A] [D] sterza · [Spazio] freno a mano · [Shift] nitro · [F] clacson · [R] raddrizza · [C] camera', t: 'joystick: guida · NITRO · FRENO A MANO · CLACSON', p: '[RT] gas · [LT] freno · stick: sterza · [A] freno a mano · [X] o [RB] nitro · [LB] clacson · [Y] raddrizza · [B] scendi' },
  { cat: 'motori', ic: '🛵', n: 'Vespa', d: 'Le vespe parcheggiate in strada si guidano. Agili, rumorose, col nitro.',
    w: 'Via Teletubbylandia', h: '{E} sali · {E} o [Q] scendi', k: '[W] [A] [S] [D] guida · [Shift] nitro · [Spazio] o [F] clacson', t: 'il joystick guida: avanti è gas' },
  { cat: 'motori', ic: '🏁', n: 'Gare e Officina', d: 'Tre tracciati: Giro dei Portici, Teletubbylandia Rally e Notturna del Millennium. Contro gli amici, col fantasma o online.',
    w: 'Cartelli delle gare nel quartiere · Officina in Via Teletubbylandia · telefono → Motori', k: '[G] vicino al cartello: gareggia · [G] davanti all\'Officina: tuning · in gara [R] ti rimette in pista' },
  // lavori e soldi
  { cat: 'soldi', ic: '💼', n: 'Lavori', d: 'Rider, barista al Celtic, buttafuori al Millennium, vigile urbano. Paga in Euro, mance e gradi da Stagista a Titolare.',
    w: 'Bacheca in Piazzetta · telefono → Lavori', k: 'barista: tieni [Spazio] per spinare · [A] inclina · [D] raddrizza · [Invio] servi · buttafuori: [E] entra, [R] fuori · vigile: [1] [2] [3] al verbale', t: 'i comandi del turno compaiono come pulsanti sullo schermo' },
  { cat: 'soldi', ic: '🎒', n: 'Zaino, livelli e talenti', d: 'Casse e nemici lasciano roba: armi, gadget, cibo, munizioni, Euro. Con l\'esperienza sali di livello e spendi i punti nei talenti.',
    w: 'Esc → Personaggio · lo zaino è sempre con te', k: '[I] zaino', t: '🎒 in alto a sinistra' },
  { cat: 'soldi', ic: '📜', n: 'Missioni', d: 'Gli amici chiedono favori: consegne, sfide, figuracce. Pagano in Euro ed esperienza.',
    w: 'Parlando con un amico ([6]) · telefono → Missioni', k: '[J] missioni', t: '📜 in alto a sinistra' },
  { cat: 'soldi', ic: '💍', n: 'Banco dei pegni', d: 'Compra e vendi: oro, armi ad acqua e tutto quello che ti avanza nello zaino.',
    w: 'Via Petroni, sotto i portici', h: '{E} al banco' },
  { cat: 'soldi', ic: '🛋️', n: 'Casa e documenti', d: 'Compri i mobili e li sistemi in casa; sul telefono c\'è la carta d\'identità con soprannome, lavoro e fedina (comica).',
    w: 'Telefono → Casa · telefono → Documenti', k: '{E} posa · {R} ruota · [X] annulla' },
  // botte
  { cat: 'botte', ic: '🔫', n: 'Armi comiche', d: 'Pistola, tortellini, nerf, spritz e l\'immancabile ombrello. Si trovano, si migliorano, si perdono.',
    k: '[H] estrai o riponi ([0] riponi) · clic sinistro: spara · destro: mira · [R] ricarica · [Q] ombrellata · [1]-[4] o rotella: cambia · [V] prima persona', t: '🔫 estrai e cambia · SPARA · MIRA · ⟳ ricarica · 👁 visuale', p: '[RT] spara · [LT] mira · croce ↑ ricarica · ← → cambia · ↓ estrai o riponi · [R3] visuale' },
  { cat: 'botte', ic: '🧟', n: 'Nemici e boss', d: 'Di giorno i piccioni mutanti, di notte gli zombi, e in Via Petroni il Vigile Urbano Zombie. Ogni tanto qualcosa esplode: è normale.',
    w: 'Per strada: mai in casa né in giardino (a parte la zombata notturna)' },
  // online
  { cat: 'online', ic: '🌐', n: 'Stanza con gli amici', d: 'Crei una stanza e passi il codice di 4 lettere: siete nello stesso quartiere, con la chat e il cabinato in coppia.',
    w: 'Esc → Online', k: '[T] chat · [P] telefono · in chat: /me /do /dado' },
  { cat: 'online', ic: '🏙️', n: 'Quartiere pubblico', d: 'Entri con chi è online adesso, fino a 24 per zona. Vedi chi ti è vicino e ci giochi insieme.',
    w: 'Esc → Online → Entra nel quartiere' },
  { cat: 'online', ic: '🎉', n: 'Party · Gioca insieme', d: 'Crei un party e passi il codice di 6 caratteri (o il link di «Copia invito»): il capo sceglie il minigioco e tutti entrano nella stessa partita. Gli inviti arrivano come cartolina nell\'angolo e sul telefono. Senza party c\'è «contro i bot».',
    w: 'Tasto O · telefono → Party (anche in Giochi → Gioca insieme) · serve il server online', k: '[O] apri il party e rispondi agli inviti · [Invio] il capo fa partire, gli altri accettano · [Esc] esci dalla lobby', t: 'telefono → Party · tocca la cartolina dell\'invito' },
  { cat: 'online', ic: '🎲', n: 'Giochi da fare in party', d: 'Chi l\'ha detto? Sfida, Calcetto 1 contro 1 o 2 contro 2, Gulag in co-op da 2 a 4, Processo del Secolo da 2 a 6 (PM, avvocato, imputato, giurati e giudice AI), Sfida a punti (Sushi o Compettina) e il Corriere del party.',
    w: 'Party → il capo sceglie', k: 'quiz: [1]-[4] rispondi · Gulag: tieni premuto {E} su un amico a terra per rianimarlo · calcetto: ti porta alla gabbia di Teletubbylandia' },
  { cat: 'online', ic: '🤝', n: 'Mondo condiviso', d: 'Online la notte arriva per tutti alla stessa ora, e nemici, boss, bottino, casse, macchine e vespe parcheggiate e la zombata notturna sono gli stessi per tutti nella stanza o nel quartiere. Il Vigile Zombie si picchia in compagnia.' },
];

// ---------------------------------------------------------------- contextual tips (once each)
// when(c): c = { mode, focus (id of the thing under the bubble), zone, night (zombies out), outdoor, online, armed, job }
const TIPS = [
  { id: 'guide_news', ic: '🧭', title: 'Novità: la guida', when: c => c.veteran,
    k: 'In [Esc] → Tutorial e guida (o telefono → Guida) c\'è tutto quello che si può fare, e da lì si rifà il tutorial.', t: 'In ☰ → Tutorial e guida (o telefono → Guida) c\'è tutto quello che si può fare, e da lì si rifà il tutorial.', p: 'In [Start] → Tutorial e guida c\'è tutto quello che si può fare, e da lì si rifà il tutorial.' },
  { id: 'car', ic: '🚗', title: 'Macchina!', when: c => /^mt_car_/.test(c.focus) || c.mode === 'car',
    k: '{E} per salire · [W] [S] gas e freno · [Spazio] derapata · [Shift] nitro · [G] vicino al cartello di una gara', t: '{E} per salire · joystick per guidare · a destra NITRO, FRENO A MANO e CLACSON', p: '{E} per salire · [RT] gas · [LT] freno · [A] derapata · [X] nitro' },
  { id: 'vespa', ic: '🛵', title: 'Vespa', when: c => /^ia_vespa/.test(c.focus) || c.mode === 'vespa',
    k: '{E} per salire · [W] [A] [S] [D] guida · [Shift] nitro · [Spazio] clacson · {E} o [Q] per scendere', t: '{E} per salire · il joystick guida, avanti è gas', p: '{E} per salire · stick per guidare · [RB] nitro' },
  { id: 'weapon', ic: '🔫', title: 'Arma in mano', when: c => c.armed,
    k: 'clic sinistro spara · destro mira · [R] ricarica · [1]-[4] cambia arma · [Q] ombrellata · [H] la rimetti via · [V] prima persona', t: 'SPARA · MIRA · ⟳ ricarica · 🔫 cambia o riponi · 👁 visuale', p: '[RT] spara · [LT] mira · croce ↑ ricarica · ← → cambia · ↓ riponi' },
  { id: 'friend', ic: '🙂', title: 'Un amico', when: c => /^npc_/.test(c.focus),
    k: '{E} per parlarci · [5] azioni (birra, cinque, selfie…) · [6] missioni · [7] carte. Dal telefono → Contatti lo chiami e arriva.', t: '{E} per parlarci, poi tocca la risposta. Dal telefono → Contatti lo chiami e arriva.', p: '{E} per parlarci. Dal telefono → Contatti lo chiami e arriva.' },
  { id: 'cabinet', ic: '🕹️', title: 'Cabinato', when: c => /^cab\d*$/.test(c.focus),
    k: '{E} siediti · frecce per muoverti · [Z] e [X] le azioni · [Invio] start · [Esc] per alzarti · {R} infila un gettone', t: '{E} siediti · SPARA, BOMBA e START · ESCI per alzarti', p: '{E} siediti · [A] spara · [Start] start' },
  { id: 'minigame', ic: '🎮', title: 'Minigioco', when: c => /^(mg-|br-stop$|rts_table$|cards_table$|gulag-iron$|mt_race_)/.test(c.focus),
    k: '{E} per iniziare, [Esc] per uscire. Sono tutti anche nel telefono → Giochi, e col Party ([O]) ci giocate in gruppo.', t: '{E} per iniziare, ✕ per uscire. Sono tutti anche nel telefono → Giochi, e col Party ci giocate in gruppo.', p: '{E} per iniziare. Sono tutti anche nel telefono → Giochi.' },
  { id: 'board', ic: '📋', title: 'Bacheca dei lavori', when: c => c.focus === 'rp_board' && !c.job,
    k: '{E} per scegliere un turno: rider, barista, buttafuori o vigile. Gli stessi lavori sono nel telefono → Lavori.' },
  { id: 'job', ic: '💼', title: 'Primo turno', when: c => !!c.job,
    k: 'Segui il segnalino colorato fino al posto giusto. Più sei svelto, più mance. Per smettere: telefono → Lavori → Finisci il turno.' },
  { id: 'petroni_night', ic: '🍻', title: 'Petroni di notte', when: c => c.zone === 'Via Petroni' && c.night,
    k: 'Locali pieni e zombi pure. Se arriva il Vigile Urbano Zombie è il boss: online lo vedono tutti e lo picchiate insieme. [H] per l\'arma.', t: 'Locali pieni e zombi pure. Se arriva il Vigile Urbano Zombie è il boss: online lo vedono tutti e lo picchiate insieme. 🔫 per l\'arma.', p: 'Locali pieni e zombi pure. Se arriva il Vigile Urbano Zombie è il boss: online lo vedono tutti e lo picchiate insieme. Croce ↓ per l\'arma.' },
  { id: 'night', ic: '🌙', title: 'È notte', when: c => c.night && c.outdoor,
    k: 'Fino all\'alba gli zombi girano per strada e in giardino può partire la zombata notturna. [H] per l\'arma, oppure in casa sei al sicuro.', t: 'Fino all\'alba gli zombi girano per strada e in giardino può partire la zombata notturna. 🔫 per l\'arma, oppure in casa sei al sicuro.', p: 'Fino all\'alba gli zombi girano per strada e in giardino può partire la zombata notturna. Croce ↓ per l\'arma, oppure in casa sei al sicuro.' },
  { id: 'teletubby', ic: '🌈', title: 'Teletubbylandia', when: c => c.zone === 'Teletubbylandia',
    k: 'Alla lavagna della gabbia {E} per il 3 contro 3, {R} per i rigori. Il canestro fa i tiri liberi. Di notte, occhio alle colline.' },
  { id: 'celtic', ic: '🍀', title: 'Celtic', when: c => c.zone === 'Celtic',
    k: 'Carte al tavolo, quiz «Chi l\'ha detto?» e, se ti va, un turno dietro al bancone. Il primo giro non lo offre nessuno.' },
  { id: 'online', ic: '🌐', title: 'Sei online', when: c => c.online,
    k: '[T] chat · [P] telefono. Nemici, boss e casse sono gli stessi per tutti. Per un minigioco insieme: Party, tasto [O].', t: 'Nemici, boss e casse sono gli stessi per tutti. Per un minigioco insieme: telefono → Party.', p: 'Nemici, boss e casse sono gli stessi per tutti. Per un minigioco insieme: Party dal telefono.' },
];

// ---------------------------------------------------------------- state
function load() {
  let d = null; try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { }
  if (!d || typeof d !== 'object') d = {};
  return { v: 1, done: !!d.done, skipped: !!d.skipped, started: !!d.started, veteran: !!d.veteran, step: clamp(d.step | 0, 0, STEPS.length - 1), tips: (d.tips && typeof d.tips === 'object') ? d.tips : {}, at: d.at || 0 };
}

export function installTutorial({ ui, S, input, level, man, camera, getWorld, audio }) {
  const q = new URLSearchParams(location.search);
  const tq = q.get('tutorial');
  const ALLOW = !q.has('notutorial') && (!q.has('auto') || q.has('tutorial')); // automated test URLs (?auto) skip it unless asked
  const FORCE = tq === 'force';
  const st = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { } };
  const run = { active: false, step: 0, acc: 0, acted: false, flash: 0, padT: 0, final: 0, cardKey: '', lastPos: null, lastYaw: null, lastPitch: 0, prevMode: '' };
  const tipS = { cur: null, t: 0, gap: 8, check: 0, key: '' };
  let lastDev = 'kb', guideCat = 'all', guideDev = null, guideNote = '';
  try { window.__save && window.__save.define && window.__save.define('tutorial_done', { title: 'Patentino del quartiere', desc: 'Finisci il tutorial iniziale.', icon: '🎓', cat: 'Esplora' }); } catch (e) { }

  injectCSS();
  const mk = (id, cls) => { const d = document.createElement('div'); d.id = id; if (cls) d.className = cls; document.body.appendChild(d); return d; };
  const card = mk('tuCard'); card.setAttribute('role', 'status'); card.setAttribute('aria-live', 'polite');
  const tipEl = mk('tuTip'); tipEl.setAttribute('role', 'status');
  const wp = mk('tuWp'); wp.innerHTML = '<i></i><b></b><small></small>';

  // ---------------------------------------------------------------- devices + raw input (the game's edges are consumed by main.js)
  const device = () => (lastDev === 'pad' ? 'pad' : ui.coarse ? 'touch' : 'kb');
  const W = () => getWorld && getWorld();
  const inText = t => t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
  const noteAct = () => { const w = W(); if (run.active && STEPS[run.step].id === 'act' && w && w.mode === 'explore' && w.focus && !input.owned()) run.acted = true; };
  addEventListener('keydown', e => {
    if (e.repeat) return;
    if (!ui.coarse) lastDev = 'kb';
    if (inText(e.target)) return;
    if (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'NumpadEnter') noteAct();
    if (e.code === 'Backspace' && S.phase === 'world' && !input.owned()) {
      if (tipS.cur) { e.preventDefault(); hideTip(true); }
      else if (run.final) { e.preventDefault(); run.final = 0; showCard(false); }
      else if (run.active && card.classList.contains('on')) { e.preventDefault(); skip(); }
    }
  }, true);
  addEventListener('mousedown', () => { if (!ui.coarse) lastDev = 'kb'; }, true);
  addEventListener('wheel', () => { if (!ui.coarse) lastDev = 'kb'; }, { capture: true, passive: true });
  addEventListener('touchstart', () => { if (lastDev === 'pad') lastDev = 'touch'; }, { capture: true, passive: true });
  const tAct = document.getElementById('tAct');
  if (tAct) tAct.addEventListener('pointerdown', () => noteAct(), true);
  const padPrev = [];
  function pollPads() {
    const ps = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
    const p = ps[0]; if (!p) return;
    const b = i => !!(p.buttons[i] && p.buttons[i].pressed);
    let any = false; for (let i = 0; i < p.buttons.length; i++) if (b(i)) { any = true; break; }
    if (!any) for (const a of p.axes) if (Math.abs(a) > 0.5) { any = true; break; }
    if (any) lastDev = 'pad';
    if ((b(0) && !padPrev[0]) || (b(2) && !padPrev[2])) noteAct();
    padPrev[0] = b(0); padPrev[2] = b(2);
  }

  // ---------------------------------------------------------------- context
  const HOUSE = new Set(['Sala giochi', 'Salotto', 'Giardino', 'Il Gulag']);
  const zoneNow = () => { try { const p = man.root.position; return (level && level.zoneAt && level.zoneAt(p.x, p.z)) || null; } catch (e) { return null; } };
  function busy() {
    try {
      if (window.__br && window.__br.state && window.__br.state().on) return true;
      if (window.__gulagRun && window.__gulagRun.state && window.__gulagRun.state().on) return true;
      if (window.__rts && window.__rts.active) return true;
      if (window.__sport && window.__sport.match) return true;
    } catch (e) { }
    return false;
  }
  function freeFor(modes) {
    const w = W();
    return !!(S.phase === 'world' && w && modes.includes(w.mode) && !ui.menuOpen && !input.owned() && !document.body.dataset.opening && !busy());
  }
  const online = () => !!(window.__net && window.__net.online);

  // ---------------------------------------------------------------- onboarding
  function start(fromStep = 0) {
    run.active = true; run.step = clamp(fromStep, 0, STEPS.length - 1); run.final = 0; resetStep();
    st.started = true; st.done = false; st.skipped = false; st.step = run.step; st.at = Date.now(); save();
    hideTip(false); run.cardKey = '';
    return true;
  }
  function resetStep() { run.acc = 0; run.acted = false; run.flash = 0; run.padT = 0; run.lastPos = null; run.lastYaw = null; run.cardKey = ''; }
  function finishStep() {
    if (run.flash) return;
    run.flash = 0.9; run.cardKey = ''; blip(true);
  }
  function advance() {
    if (run.step + 1 >= STEPS.length) { complete(); return; }
    run.step++; st.step = run.step; save(); resetStep();
  }
  function complete() {
    run.active = false; st.done = true; st.skipped = false; st.step = 0; save();
    run.final = 9; run.cardKey = '';
    try { window.__save && window.__save.unlock && window.__save.unlock('tutorial_done', { title: 'Patentino del quartiere', desc: 'Finisci il tutorial iniziale.', icon: '🎓', cat: 'Esplora' }); } catch (e) { }
    setTimeout(() => { try { window.__phone && window.__phone.push && window.__phone.push({ from: 'cesco', text: 'sei uscito di casa? miracolo. celtic?' }); } catch (e) { } }, 6000);
    tipS.gap = 25;
  }
  function skip() {
    if (!run.active) return;
    run.active = false; st.done = true; st.skipped = true; st.step = 0; save();
    showCard(false); wpShow(false); tipS.gap = 20;
    try { ui.toast(device() === 'kb' ? 'Tutorial saltato. Se cambi idea: Esc → Tutorial e guida' : 'Tutorial saltato. Lo ritrovi nel menu → Tutorial e guida'); } catch (e) { }
  }
  function firstRun() {
    if (!ALLOW) return false;
    if (FORCE) return start(0);
    if (run.active) return true;
    if (st.done) return false;
    if (!st.started) {
      let pt = 0; try { pt = (window.__save && window.__save.stats && +window.__save.stats().playTime) || 0; } catch (e) { }
      if (pt > VETERAN_S) { st.done = true; st.veteran = true; save(); tipS.gap = 10; return false; }
    }
    return start(st.started ? st.step : 0);
  }
  // detection of the current step (per frame, while the world runs)
  function stepFrame(dt, w, free) {
    const s = STEPS[run.step];
    if (run.flash) { if (free) { run.flash -= dt; if (run.flash <= 0) { run.flash = 0; advance(); } } return; }
    const mode = w.mode;
    if (s.id === 'look') {
      if (run.lastYaw !== null && mode === 'explore') {
        const P = input.pads && input.pads[0];
        const manual = performance.now() - ((input.drag && input.drag.last) || 0) < 300 || (P && (Math.abs(P.axes[2] || 0) + Math.abs(P.axes[3] || 0)) > 0.25);
        if (manual) run.acc += Math.min(0.5, Math.abs(wrapA(w.camYaw - run.lastYaw)) + Math.abs(w.camPitch - run.lastPitch));
      }
      run.lastYaw = w.camYaw; run.lastPitch = w.camPitch;
      if (run.acc >= 1.6) finishStep();
    } else if (s.id === 'walk') {
      const p = man.root.position;
      if (run.lastPos && mode === 'explore') { const d = Math.hypot(p.x - run.lastPos.x, p.z - run.lastPos.z); if (d < 0.5) run.acc += d; }
      run.lastPos = { x: p.x, z: p.z };
      if (run.acc >= 5) finishStep();
    } else if (s.id === 'act') {
      const pm = run.prevMode;
      if (pm && (pm === 'explore' || pm === 'goto') && mode !== pm && !['explore', 'goto', 'ko', 'leaving', 'standup'].includes(mode)) run.acted = true;
      if (run.acted) finishStep();
    } else if (s.id === 'phone') {
      if (window.__phone && window.__phone.isOpen && window.__phone.isOpen()) finishStep();
      else if (device() === 'pad' && free) { run.padT += dt; if (run.padT > 12) finishStep(); }
    } else if (s.id === 'menu') {
      if (ui.menuOpen || document.querySelector('#phone.on section[data-app="map"].cur')) finishStep();
    } else if (s.id === 'street') {
      const z = zoneNow(); const p = man.root.position;
      if ((z && !HOUSE.has(z)) || (!z && p.z > 20.3)) finishStep();
    }
  }

  // ---------------------------------------------------------------- card
  function stepKeys(s, dev) { if (s.id === 'phone' && dev === 'kb' && online()) return s.keys.kbOnline; return s.keys[dev] || s.keys.kb; }
  function renderCard() {
    const dev = device();
    if (run.final) {
      const key = 'final|' + dev; if (key === run.cardKey) return; run.cardKey = key;
      card.classList.remove('ok'); card.classList.add('final');
      card.innerHTML = `<div class="tu-top"><span>Tutorial · fatto</span><span class="tu-dots">${STEPS.map(() => '<i class="ok"></i>').join('')}</span></div>
        <h3>🎓 ${esc(FINAL.title)}</h3><p>${fmt(FINAL.text[dev] || FINAL.text.kb, dev)}</p>
        <div class="tu-foot"><button type="button" class="tu-btn" data-tu="guide">Apri la guida</button><button type="button" class="tu-skip" data-tu="close">Chiudi${dev === 'kb' ? ' <kbd>⌫</kbd>' : ''}</button></div>`;
      return;
    }
    const s = STEPS[run.step], key = run.step + '|' + dev + '|' + (run.flash ? 'ok' : '') + '|' + (s.id === 'phone' ? online() : '');
    if (key === run.cardKey) return; run.cardKey = key;
    card.classList.remove('final'); card.classList.toggle('ok', !!run.flash);
    const dots = STEPS.map((_, i) => `<i class="${i < run.step || (i === run.step && run.flash) ? 'ok' : i === run.step ? 'cur' : ''}"></i>`).join('');
    card.innerHTML = `<div class="tu-top"><span>Tutorial · ${run.step + 1}/${STEPS.length}</span><span class="tu-dots" aria-label="passo ${run.step + 1} di ${STEPS.length}">${dots}</span></div>
      <h3>${run.flash ? '<span class="tu-tick">✓</span> ' : ''}${esc(s.title)}</h3>
      <p>${fmt(s.text[dev] || s.text.kb, dev)}</p>
      <div class="tu-keys">${fmt(stepKeys(s, dev), dev)}</div>
      ${s.meter ? '<div class="tu-meter"><i></i></div>' : ''}
      <div class="tu-foot"><button type="button" class="tu-skip" data-tu="skip">Salta tutorial${dev === 'kb' ? ' <kbd>⌫</kbd>' : ''}</button></div>`;
  }
  card.addEventListener('click', e => {
    const b = e.target.closest('[data-tu]'); if (!b) return;
    e.preventDefault(); e.stopPropagation(); b.blur();
    const a = b.dataset.tu;
    if (a === 'skip') skip();
    else if (a === 'close') { run.final = 0; showCard(false); }
    else if (a === 'guide') { run.final = 0; showCard(false); openGuide(); }
  });
  function showCard(v) {
    if (card.classList.contains('on') === !!v) return;
    card.classList.toggle('on', !!v);
    if (!v && card.contains(document.activeElement)) document.activeElement.blur();
  }

  // ---------------------------------------------------------------- waypoint (step "street")
  const _v = new THREE.Vector3();
  const ROUTE = { 'Sala giochi': ['doorway', 4.27, 3.6, 'Porta'], 'Salotto': ['gardenDoor', 7.7, 7.07, 'Giardino'] };
  function wpShow(v) { wp.classList.toggle('on', !!v); }
  function wpFrame(on) {
    if (!on || !camera) { wpShow(false); return; }
    const z = zoneNow(), r = ROUTE[z], an = level && level.anchors;
    let x = 13.1, zz = 19.5, label = 'Cancello';
    if (r) { const a = an && an[r[0]]; x = a ? a.x : r[1]; zz = a ? a.z : r[2]; label = r[3]; }
    const p = man.root.position, dist = Math.hypot(x - p.x, zz - p.z);
    _v.set(x, 1.3, zz).project(camera);
    const Wd = innerWidth, Hd = innerHeight;
    let sx = (_v.x * 0.5 + 0.5) * Wd, sy = (-_v.y * 0.5 + 0.5) * Hd;
    const behind = _v.z > 1;
    if (behind) { sx = Wd - sx; sy = Hd - 40; }
    const m = 46, edge = behind || sx < m || sx > Wd - m || sy < m || sy > Hd - m;
    sx = clamp(sx, m, Wd - m); sy = clamp(sy, m + 30, Hd - m);
    wp.style.transform = `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px) translate(-50%,-50%)`;
    wp.classList.toggle('edge', edge);
    const b = wp.children[1], sm = wp.children[2];
    if (b.textContent !== label) b.textContent = label;
    const t = Math.round(dist) + ' m'; if (sm.textContent !== t) sm.textContent = t;
    wpShow(true);
  }

  // ---------------------------------------------------------------- tips
  function tipCtx() {
    const w = W(); let armed = false, job = null;
    try { armed = document.body.classList.contains('cbArmed') || !!(window.__combat && window.__combat.current && window.__combat.current()); } catch (e) { }
    try { job = window.__rp && window.__rp.job; } catch (e) { }
    const zone = zoneNow();
    return { mode: w ? w.mode : '', focus: (w && w.focus && w.focus.id) || '', zone, night: zombiesOut(DN.night), outdoor: !!(level && level.outdoor > 0.5) || (!!zone && !HOUSE.has(zone) && !/Celtic|Sushi|Casa|Millennium/.test(zone)),
      online: online(), armed, job, veteran: st.veteran };
  }
  const tipsOn = () => ALLOW && ui.settings.showHints !== false;
  function showTip(tp, force) {
    const dev = device();
    const txt = tp[dev === 'touch' ? 't' : dev === 'pad' ? 'p' : 'k'] || tp.k;
    tipS.cur = tp; tipS.t = 0; tipS.dur = 9 + Math.min(5, txt.length / 40);
    if (!force) { st.tips[tp.id] = Date.now(); save(); }
    tipEl.style.setProperty('--d', tipS.dur + 's');
    tipEl.innerHTML = `<div class="tu-top"><span>${tp.ic} Consiglio</span><button type="button" class="tu-x" data-tu="x" aria-label="Chiudi il consiglio">✕</button></div><h3>${esc(tp.title)}</h3><p>${fmt(txt, dev)}</p>${dev === 'kb' ? '<div class="tu-foot"><span><kbd>⌫</kbd> chiudi</span></div>' : ''}<div class="tu-time"><i></i></div>`;
    tipEl.classList.remove('on'); void tipEl.offsetWidth; tipEl.classList.add('on');
  }
  function hideTip(dismissed) {
    if (!tipS.cur) return;
    if (!dismissed && tipS.t < 2.5 && !tipS.forced) { delete st.tips[tipS.cur.id]; save(); } // barely seen (a menu/overlay opened): show it again later
    tipS.cur = null; tipS.forced = false; tipS.gap = TIP_GAP;
    tipEl.classList.remove('on'); if (tipEl.contains(document.activeElement)) document.activeElement.blur();
  }
  tipEl.addEventListener('click', e => { const b = e.target.closest('[data-tu="x"]'); if (!b) return; e.preventDefault(); e.stopPropagation(); b.blur(); hideTip(true); });
  function tipsFrame(dt) {
    const free = freeFor(['explore', 'goto', 'car', 'vespa']) && !run.active && !run.final;
    if (tipS.cur) {
      if (!free) { hideTip(false); return; }
      tipS.t += dt; if (tipS.t > tipS.dur) hideTip(true);
      return;
    }
    if (!tipsOn() || !free) return;
    tipS.gap -= dt; if (tipS.gap > 0) return;
    tipS.check -= dt; if (tipS.check > 0) return; tipS.check = 0.3;
    const c = tipCtx();
    for (const tp of TIPS) { if (st.tips[tp.id]) continue; let ok = false; try { ok = !!tp.when(c); } catch (e) { } if (ok) { showTip(tp); break; } }
  }

  // ---------------------------------------------------------------- per frame
  let lastT = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, Math.max(0, (now - lastT) / 1000)); lastT = now;
    try { tick(dt); } catch (e) { frame.err = (frame.err || 0) + 1; if (frame.err < 4) console.warn('tutorial', e); }
  }
  function tick(dt) {
    pollPads();
    const w = W();
    const inWorld = S.phase === 'world' && !!w;
    const free = freeFor(['explore', 'goto']);
    if (run.active && inWorld) stepFrame(dt, w, free);
    if (run.final && free) { run.final -= dt; if (run.final <= 0) run.final = 0; }
    const showing = (run.active || run.final > 0) && free;
    if (showing) {
      renderCard();
      const s = STEPS[run.step], m = run.active && s.meter && card.querySelector('.tu-meter i');
      if (m) m.style.width = Math.round(clamp(run.acc / (s.id === 'look' ? 1.6 : 5), 0, 1) * 100) + '%';
    }
    showCard(showing);
    wpFrame(showing && run.active && !run.flash && STEPS[run.step].id === 'street');
    tipsFrame(dt);
    run.prevMode = w ? w.mode : '';
  }
  requestAnimationFrame(frame);

  // ---------------------------------------------------------------- guide (menu page + phone app)
  function openGuide() {
    try { window.__phone && window.__phone.isOpen && window.__phone.isOpen() && window.__phone.close(); } catch (e) { }
    setTimeout(() => { try { ui.menu.show('guide'); } catch (e) { } }, 60);
  }
  function replay() {
    st.done = false; st.skipped = false; st.started = true; st.step = 0; save();
    if (S.phase === 'world' && W()) {
      if (ui.menuOpen) { const r = document.querySelector('#menu [data-act="resume"]'); if (r) r.click(); else ui.menu.hide(); }
      start(0); return true;
    }
    guideNote = 'Fatto: parte appena entri in gioco.'; return false;
  }
  function entryHTML(g, dev) {
    const c = (CATS.find(x => x.id === g.cat) || CATS[0]).c;
    const keys = dev === 'touch' ? g.t : dev === 'pad' ? (g.p === '' ? '' : (g.p || g.k)) : g.k;
    const row = (lab, v) => v ? `<span class="r"><em>${lab}</em>${fmt(v, dev)}</span>` : '';
    return `<button type="button" class="gu-c" style="--c:${c}"><span class="h"><i>${g.ic}</i><span><small>${esc((CATS.find(x => x.id === g.cat) || {}).name || '')}</small><b>${esc(g.n)}</b></span></span>
      <span class="d">${fmt(g.d, dev)}</span>${row('Dove', g.w)}${row('Come', g.h)}${row('Tasti', keys)}</button>`;
  }
  function guideHTML() {
    const dev = guideDev || device();
    const seen = TIPS.filter(t => st.tips[t.id]).length;
    const status = run.active ? `Tutorial in corso: passo ${run.step + 1} di ${STEPS.length}.` : st.done ? (st.skipped ? 'Tutorial saltato.' : st.veteran ? 'Tutorial: lo puoi fare quando vuoi.' : 'Tutorial completato.') : 'Tutorial da fare.';
    const list = GUIDE.filter(g => guideCat === 'all' || g.cat === guideCat);
    return `<div class="gu-head"><div><h3 class="gu-title">Cose da fare</h3><p class="gu-sub">Tutto quello che c'è in giro: dove sta, come si comincia, che tasti premere. Il resto lo scopri facendo danni.</p></div>
      <div class="gu-acts"><button type="button" class="pbtn" data-gu="replay">${run.active ? 'Ricomincia il tutorial' : st.done ? 'Rifai il tutorial' : 'Fai il tutorial'}</button>${run.active ? '<button type="button" class="pbtn ghost" data-gu="skip">Salta il tutorial</button>' : ''}<button type="button" class="pbtn ghost" data-gu="tips" title="I consigli che compaiono la prima volta che incontri le cose">Rimetti i consigli (${seen} visti)</button>
      <span class="gu-note" aria-live="polite">${esc(guideNote || status)}</span></div></div>
      <div class="gu-bar"><div class="gu-cats" role="tablist" aria-label="Categorie"><button type="button" data-gu="cat" data-v="all" class="${guideCat === 'all' ? 'on' : ''}">Tutto</button>${CATS.map(c => `<button type="button" data-gu="cat" data-v="${c.id}" class="${guideCat === c.id ? 'on' : ''}" style="--c:${c.c}">${esc(c.name)}</button>`).join('')}</div>
      <span class="seg gu-dev" aria-label="Tasti per">${[['kb', 'Tastiera'], ['pad', 'Pad'], ['touch', 'Touch']].map(([v, l]) => `<button type="button" data-gu="dev" data-v="${v}" class="${dev === v ? 'on' : ''}">${l}</button>`).join('')}</span></div>
      <div class="gu-grid">${list.map(g => entryHTML(g, dev)).join('')}</div>`;
  }
  function renderGuide(el) {
    if (!el) return;
    if (!el._tu) {
      el._tu = true;
      el.addEventListener('click', e => {
        const b = e.target.closest('[data-gu]'); if (!b) return;
        const a = b.dataset.gu, v = b.dataset.v;
        if (a === 'cat') guideCat = v;
        else if (a === 'dev') guideDev = v;
        else if (a === 'replay') { if (replay()) return; }
        else if (a === 'skip') { skip(); guideNote = 'Tutorial saltato.'; }
        else if (a === 'tips') { st.tips = {}; st.veteran = false; save(); tipS.gap = 6; guideNote = 'I consigli ricompaiono la prima volta che incontri le cose.'; }
        el.innerHTML = guideHTML(); guideNote = '';
        const f = el.querySelector(`[data-gu="${a}"]${v ? `[data-v="${v}"]` : ''}`) || el.querySelector('[data-gu]'); f && f.focus({ preventScroll: true });
      });
    }
    el.innerHTML = guideHTML(); guideNote = '';
  }
  function renderApp(el) {
    if (!el) return;
    const dev = device();
    el.innerHTML = `<div class="tu-btns"><button type="button" data-tu="replay">▶ ${run.active ? 'Ricomincia' : st.done ? 'Rifai' : 'Fai'} il tutorial</button><button type="button" class="alt" data-tu="full">📖 Guida completa</button></div>
      <p class="tu-st">${run.active ? `Tutorial in corso: passo ${run.step + 1} di ${STEPS.length}` : 'Cosa fare, dove andare e come si comincia.'}</p>
      ${CATS.map((c, i) => { const it = GUIDE.filter(g => g.cat === c.id); return `<details${i === 0 ? ' open' : ''} style="--c:${c.c}"><summary>${esc(c.name)} <small>${it.length}</small></summary>${it.map(g => `<div class="tu-it"><b>${g.ic} ${esc(g.n)}</b><span>${fmt(g.d, dev)}</span>${g.w ? `<small>📍 ${fmt(g.w, dev)}</small>` : ''}${g.h ? `<small>▶ ${fmt(g.h, dev)}</small>` : ''}</div>`).join('')}</details>`; }).join('')}`;
    if (!el._tu) {
      el._tu = true;
      el.addEventListener('click', e => {
        const b = e.target.closest('[data-tu]'); if (!b) return; e.preventDefault();
        if (b.dataset.tu === 'replay') { try { window.__phone && window.__phone.close(); } catch (x) { } replay(); }
        else if (b.dataset.tu === 'full') openGuide();
      });
    }
  }

  // ---------------------------------------------------------------- sound
  function blip(ok) {
    try { if (audio && audio.ctx && audio.tone && !audio.muted) { audio.tone('sine', ok ? 880 : 660, ok ? 1320 : 660, 0.09, 0.05, audio.room); if (ok) setTimeout(() => { try { audio.tone('sine', 1320, 1760, 0.08, 0.04, audio.room); } catch (e) { } }, 90); } } catch (e) { }
  }

  const api = {
    firstRun, start: () => start(0), skip, replay, openGuide, renderGuide, renderApp,
    state: () => ({ active: run.active, step: run.step, stepId: run.active ? STEPS[run.step].id : null, flash: run.flash > 0, final: run.final > 0, done: st.done, skipped: st.skipped, veteran: st.veteran, started: st.started,
      allowed: ALLOW, tip: tipS.cur ? tipS.cur.id : null, tipsSeen: Object.keys(st.tips), device: device(), cardVisible: card.classList.contains('on') }),
    tip: id => { const tp = TIPS.find(t => t.id === id); if (!tp) return false; if (tipS.cur) hideTip(true); tipS.forced = true; showTip(tp, true); return true; },
    resetTips: () => { st.tips = {}; save(); tipS.gap = 0; },
    steps: STEPS.map(s => s.id), tips: TIPS.map(t => t.id), guide: GUIDE.length,
  };
  window.__tutorial = api;
  return api;
}

function injectCSS() {
  const css = `
/* ---- tutorial card + tip (touch / default: under the top bar on the right; desktop: GTA help box top-left).
   z-index 4: above the 3D view and the touch layer, under the interaction bubble (5), toasts, achievements and phone notes */
#tuCard,#tuTip{position:fixed;z-index:4;right:max(12px,env(safe-area-inset-right));top:max(66px,calc(env(safe-area-inset-top) + 64px));width:min(310px,44vw);
 padding:10px 12px 10px;border-radius:16px;background:var(--glass,rgba(20,8,46,.82));border:2px solid var(--yel,#ffd83a);box-shadow:0 12px 32px rgba(0,0,0,.45);
 color:var(--ink,#f6f0ff);font:600 13px/1.38 var(--ui,system-ui,sans-serif);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);
 opacity:0;visibility:hidden;transform:translateY(-8px);transition:opacity .3s,transform .35s cubic-bezier(.2,.9,.3,1),visibility 0s .35s;pointer-events:none}
#tuCard.on,#tuTip.on{opacity:1;visibility:visible;transform:none;transition:opacity .3s,transform .35s cubic-bezier(.2,.9,.3,1);pointer-events:auto}
#tuTip{border-color:#5ad1ff}
#tuCard .tu-top,#tuTip .tu-top{display:flex;align-items:center;gap:8px;font:800 10px/1 var(--ui,system-ui);letter-spacing:.2em;text-transform:uppercase;color:var(--mut,#bfaee0)}
#tuCard .tu-dots{display:flex;gap:5px;margin-left:auto}
#tuCard .tu-dots i{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.2);transition:background .3s}
#tuCard .tu-dots i.ok{background:var(--lime,#c8f03c)}#tuCard .tu-dots i.cur{background:var(--yel,#ffd83a);box-shadow:0 0 8px var(--yel,#ffd83a)}
#tuCard h3,#tuTip h3{margin:6px 0 3px;font:400 21px/1.05 var(--disp,Impact,sans-serif);letter-spacing:.02em;color:var(--lime,#c8f03c)}
#tuTip h3{color:#7fe0ff}
#tuCard p,#tuTip p{margin:0 0 6px;font-weight:600}
#tuCard .tu-keys{display:flex;flex-wrap:wrap;gap:4px;align-items:center;font-size:12px;color:#e2d4ff}
#tuCard kbd,#tuTip kbd{margin:0 1px;height:21px;min-width:22px;font-size:11px;padding:0 5px}
#tuCard .tu-meter{height:5px;margin-top:8px;border-radius:3px;background:rgba(255,255,255,.14);overflow:hidden}
#tuCard .tu-meter i{display:block;height:100%;width:0;background:var(--lime,#c8f03c);transition:width .2s}
#tuCard .tu-foot,#tuTip .tu-foot{display:flex;justify-content:flex-end;align-items:center;gap:10px;margin-top:8px;font-size:11.5px;color:rgba(255,255,255,.6)}
#tuCard .tu-skip{min-height:34px;padding:0 10px;border-radius:10px;border:1px solid rgba(255,255,255,.25);font:700 12px/1 var(--ui,system-ui);color:#fff;display:inline-flex;align-items:center;gap:6px}
#tuCard .tu-btn{min-height:34px;padding:0 12px;border-radius:10px;background:var(--yel,#ffd83a);color:var(--deep,#14082e);font:800 12px/1 var(--ui,system-ui)}
#tuCard.ok{border-color:var(--lime,#c8f03c)}#tuCard .tu-tick{display:inline-block;animation:tuTick .5s cubic-bezier(.2,1.6,.4,1)}
@keyframes tuTick{0%{transform:scale(.2);opacity:0}100%{transform:none;opacity:1}}
#tuTip .tu-x{margin-left:auto;width:32px;height:32px;margin:-6px -6px -6px auto;border-radius:50%;font:700 15px/1 system-ui;color:#fff;display:grid;place-items:center}
#tuTip .tu-time{height:3px;margin-top:8px;background:rgba(255,255,255,.12);overflow:hidden;border-radius:2px}
#tuTip .tu-time i{display:block;height:100%;width:100%;background:#5ad1ff;transform-origin:left}
#tuTip.on .tu-time i{animation:tuTime var(--d,10s) linear forwards}
@keyframes tuTime{to{transform:scaleX(0)}}
@media (max-height:430px){#tuCard,#tuTip{padding:8px 10px;font-size:12px}#tuCard h3,#tuTip h3{font-size:18px;margin:4px 0 2px}#tuCard .tu-foot{margin-top:5px}#tuCard .tu-skip,#tuCard .tu-btn{min-height:30px}}
@media (max-width:520px){#tuCard,#tuTip{width:min(310px,calc(100vw - 24px))}}
body.desk #tuCard,body.desk #tuTip{left:max(26px,env(safe-area-inset-left));right:auto;top:max(24px,env(safe-area-inset-top));width:min(390px,calc(100vw - 52px));padding:14px 18px 12px;border:0;border-left:3px solid #ff7a3c;border-radius:0;
 background:linear-gradient(100deg,rgba(8,3,16,.9),rgba(14,6,28,.74));-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);box-shadow:0 14px 40px rgba(0,0,0,.4);font:500 14px/1.45 var(--ui,system-ui);color:#fff;text-shadow:0 1px 2px #000;transform:translateX(-14px)}
body.desk #tuCard.on,body.desk #tuTip.on{transform:none}
body.desk #tuTip{border-left-color:#5ad1ff}
body.desk #tuCard .tu-top,body.desk #tuTip .tu-top{font:700 10.5px/1 var(--ui,system-ui);letter-spacing:.26em;color:rgba(255,255,255,.55)}
body.desk #tuCard h3,body.desk #tuTip h3{margin:9px 0 4px;font:400 27px/1 var(--gta,Impact,sans-serif);letter-spacing:.02em;text-transform:uppercase;background:linear-gradient(100deg,#ff5d8f,#ffb35a 60%,#ffe08a);-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:none}
body.desk #tuTip h3{background:linear-gradient(100deg,#7fe0ff,#c8f0ff);-webkit-background-clip:text;background-clip:text}
body.desk #tuCard p,body.desk #tuTip p{font-weight:500;color:rgba(255,255,255,.88)}
body.desk #tuCard .tu-keys{font-size:12.5px;color:rgba(255,255,255,.75);gap:5px}
body.desk #tuCard .tu-dots i{width:7px;height:7px}
body.desk #tuCard .tu-dots i.ok{background:#ffb35a}body.desk #tuCard .tu-dots i.cur{background:#ff3d7f;box-shadow:0 0 8px #ff3d7f}
body.desk #tuCard .tu-meter{height:3px;border-radius:0;background:rgba(255,255,255,.12)}body.desk #tuCard .tu-meter i{background:linear-gradient(90deg,#ff3d7f,#ffb35a)}
body.desk #tuCard .tu-skip{min-height:0;padding:2px 0;border:0;border-radius:0;font:600 11.5px/1 var(--ui,system-ui);letter-spacing:.06em;color:rgba(255,255,255,.6);text-transform:uppercase}
body.desk #tuCard .tu-skip:hover{color:#ffb35a}
body.desk #tuCard .tu-btn{min-height:28px;border-radius:0;background:linear-gradient(100deg,#ff3d7f,#ff8a3c);color:#fff;font:700 11px/1 var(--ui,system-ui);letter-spacing:.14em;text-transform:uppercase}
body.desk #tuCard.ok{border-left-color:#c8f03c}
body.desk #tuTip .tu-time i{background:linear-gradient(90deg,#5ad1ff,#c8f0ff)}
/* waypoint (tutorial: towards the garden gate) */
#tuWp{position:fixed;left:0;top:0;z-index:6;display:none;pointer-events:none;text-align:center;color:#ffb35a;font:700 11px/1.2 var(--ui,system-ui);letter-spacing:.08em;text-shadow:0 1px 3px #000;text-transform:uppercase}
#tuWp.on{display:block}
#tuWp i{display:block;width:16px;height:16px;margin:0 auto 4px;background:#ff7a3c;transform:rotate(45deg);box-shadow:0 0 14px #ff7a3c,0 0 0 2px rgba(0,0,0,.4);animation:tuBob 1.2s ease-in-out infinite}
#tuWp small{display:block;font-weight:600;color:rgba(255,255,255,.8)}
#tuWp.edge i{opacity:.75}
@keyframes tuBob{50%{transform:rotate(45deg) translate(-3px,-3px)}}
/* ---- the guide (menu page "guide") ---- */
#guideBody{padding-bottom:6px}
.gu-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:10px 24px;margin:0 0 12px}
.gu-title{margin:0;font:400 34px/1 var(--disp,Impact,sans-serif);color:var(--lime,#c8f03c)}
.gu-sub{margin:4px 0 0;max-width:560px;font-size:13.5px;line-height:1.4;color:var(--mut,#bfaee0)}
.gu-acts{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.gu-note{flex-basis:100%;min-height:18px;font-size:12.5px;color:var(--lime,#c8f03c)}
.gu-bar{display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center;justify-content:space-between;margin:0 0 14px}
.gu-cats{display:flex;flex-wrap:wrap;gap:6px}
.gu-cats button{min-height:36px;padding:0 12px;border-radius:999px;border:1px solid rgba(255,255,255,.16);font:800 12px/1 var(--ui,system-ui);color:var(--mut,#bfaee0)}
.gu-cats button.on{color:var(--deep,#14082e);background:var(--c,var(--yel,#ffd83a));border-color:transparent}
.gu-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}
.gu-c{display:flex;flex-direction:column;align-items:stretch;gap:6px;width:100%;padding:12px 14px;border-radius:14px;text-align:left;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-top:3px solid var(--c);cursor:default;font:inherit;color:inherit}
.gu-c:focus-visible,.gu-c:hover{background:rgba(255,255,255,.09);outline:none;border-color:rgba(255,255,255,.22);border-top-color:var(--c)}
.gu-c .h{display:flex;align-items:center;gap:10px}
.gu-c .h i{flex:none;width:40px;height:40px;display:grid;place-items:center;font-style:normal;font-size:22px;border-radius:10px;background:rgba(0,0,0,.3)}
.gu-c .h small{display:block;font:800 9.5px/1 var(--ui,system-ui);letter-spacing:.18em;text-transform:uppercase;color:var(--c)}
.gu-c .h b{display:block;margin-top:3px;font-size:16px;line-height:1.15;color:#fff}
.gu-c .d{font-size:13px;line-height:1.4;color:rgba(255,255,255,.82)}
.gu-c .r{font-size:12.5px;line-height:1.5;color:rgba(255,255,255,.75)}
.gu-c .r em{font-style:normal;margin-right:6px;font:800 9.5px/1 var(--ui,system-ui);letter-spacing:.16em;text-transform:uppercase;color:var(--yel,#ffd83a)}
.gu-c kbd{margin:1px 1px;height:20px;min-width:20px;font-size:11px;padding:0 5px}
body:not(.desk) #menu[data-page="guide"] .panel{width:min(820px,100%)}
@media (max-height:500px){body:not(.desk) .gu-title,body:not(.desk) .gu-sub{display:none}body:not(.desk) .gu-acts .pbtn{min-height:38px;padding:0 12px;font-size:13px}body:not(.desk) .gu-cats button{min-height:32px}body:not(.desk) .gu-head{margin-bottom:8px}}
body.desk #menu[data-layout="hub"] .mtabs button{padding-left:10px;padding-right:10px;letter-spacing:.1em} /* 11 tabs since "Guida": still one row at 1280 px */
body.desk .gu-head{margin-bottom:16px}
body.desk .gu-title{font:400 clamp(40px,4.4vw,62px)/.9 var(--gta,Impact,sans-serif);text-transform:uppercase;background:linear-gradient(100deg,#ff3d7f,#ff7a3c 50%,#ffd25a);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 4px 0 #2a0640)}
body.desk .gu-sub{margin-top:10px;font-size:14px;color:rgba(255,255,255,.62)}
body.desk .gu-note{color:#ffb35a}
body.desk .gu-cats button{min-height:0;padding:7px 12px;border-radius:0;border:1px solid rgba(255,255,255,.14);font:700 11px/1 var(--ui,system-ui);letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.6)}
body.desk .gu-cats button.on{color:#fff;background:rgba(255,122,60,.14);border-color:var(--c,#ff7a3c)}
body.desk .gu-grid{grid-template-columns:repeat(auto-fill,minmax(330px,1fr))}
body.desk .gu-c{border-radius:0;border:0;border-left:3px solid var(--c);background:linear-gradient(160deg,rgba(255,255,255,.055),rgba(255,255,255,.015));transition:background .2s,transform .2s}
body.desk .gu-c:hover,body.desk .gu-c:focus-visible{background:linear-gradient(160deg,rgba(255,255,255,.09),rgba(255,255,255,.03));transform:translateX(3px);border-left-color:var(--c)}
body.desk .gu-c .h i{border-radius:0;background:rgba(0,0,0,.35)}
body.desk .gu-c .h b{font:400 21px/1.05 var(--gta,Impact,sans-serif);letter-spacing:.02em;text-transform:uppercase}
body.desk .gu-c .r em{color:#ffb35a}
/* ---- phone app "Guida" ---- */
#phone .tu-app{flex:1;overflow-y:auto;padding:.7em .8em 1.2em;display:flex;flex-direction:column;gap:.5em;scrollbar-width:thin}
#phone .tu-btns{display:flex;gap:.4em}
#phone .tu-btns button{flex:1;border:0;border-radius:10px;padding:.65em .4em;background:#ffb35a;color:#1a0d05;font:inherit;font-weight:700;cursor:pointer}
#phone .tu-btns button.alt{background:#ffffff18;color:#fff}
#phone .tu-st{margin:0;font-size:.82em;opacity:.65}
#phone .tu-app details{background:#ffffff0c;border-radius:10px;padding:0 .7em;border-left:3px solid var(--c)}
#phone .tu-app summary{cursor:pointer;padding:.55em 0;font-weight:700;list-style:none;display:flex;justify-content:space-between}
#phone .tu-app summary::-webkit-details-marker{display:none}
#phone .tu-app summary small{opacity:.5;font-weight:600}
#phone .tu-it{padding:.45em 0;border-top:1px solid #ffffff12;font-size:.88em;display:flex;flex-direction:column;gap:.15em}
#phone .tu-it span{opacity:.85}
#phone .tu-it small{opacity:.6;font-size:.88em}
#phone .tu-it kbd{font:700 .8em/1.4 ui-monospace,monospace;padding:0 .35em;min-width:0;height:auto;border-radius:4px;background:#ffffff22;color:#fff;border:0;box-shadow:none}`;
  const s = document.createElement('style'); s.id = 'tutorialCss'; s.textContent = css; document.head.appendChild(s);
}
