// UI overlay: loading, menus (main/pause/settings/controls/online), HUD, prompt bubble, toasts,
// hint bar, chat, touch controls, settings persistence. Pure DOM; the 3D app calls the API below.
//
// createUI() -> {
//   loading: { set(p 0..1, text), ready() }, menu: { show(page), hide(), open, root }, onMenu(cb(action)),
//   toast(msg, kind ''|'gold'|'warn'|'online'), prompt(items|null, worldPos, camera), setMode(name),
//   setHint(items|null), setCamLabel(text), setMuted(bool), showTop(bool), showSkip(bool), setP2Hint(bool),
//   hud: { setLocation(text), setAffection(0..1|null), setOnline({status,room,players}|null), setObjective(text|null) },
//   lobby: { open(), close(), onCreate(cb), onJoin(cb(code)), onLeave(cb), setPlayers(list), setStatus(text), setRoom(code) },
//   chat: { add(name,text), onSend(cb), show(bool), focus() },
//   typing: { show(bool), setLines(lines) }, bindTouch({stick(dx,dy,active), down(k), up(k)}),
//   settings, onSetting(cb(key,value,all)), setSetting(key,value), update(dt), err(text),
//   + legacy element refs: typeHint, kbd, tAlt, p2, err
// }

import { openingSrc } from './opening.js';
import PERSONAS from '../assets/chat/personas.json';

const ICON = {
  menu: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  cam: '<svg viewBox="0 0 24 24"><path d="M3 8.5h3.5L8.5 5h7l2 3.5H21V19H3z"/><circle cx="12" cy="13" r="3.4"/></svg>',
  sound: '<svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
  help: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.6"/><path d="M12 16.8v.2"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  skip: '<svg viewBox="0 0 24 24"><path d="M5 5l9 7-9 7zM17 5v14"/></svg>',
  walk: '<svg viewBox="0 0 24 24"><circle cx="13" cy="4.5" r="2"/><path d="M11 21l2-6 3 3v3M9 12l2-4 4 1 2 3M11 8l-3 2-1 3"/></svg>',
  joy: '<svg viewBox="0 0 24 24"><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M9 14V9"/><circle cx="9" cy="7" r="2.5"/><circle cx="16" cy="17" r="1"/></svg>',
  globe: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg>',
  keys: '<svg viewBox="0 0 24 24"><rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 5l12 7-12 7z"/></svg>',
  home: '<svg viewBox="0 0 24 24"><path d="M4 11l8-7 8 7M6 9.5V20h12V9.5"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/></svg>',
};

const DEFAULTS = { quality: 'auto', master: 0.85, music: 0.7, sfx: 0.9, sens: 1, invertY: false, showHints: true, playerName: '', cameraShake: true, opening: true };
const SKEY = 'bigalesso_settings_v1';
const TIPS = [
  '<b>E</b> interagisce con tutto: cabinato, cane, macchina da scrivere, conchiglia…',
  'Accarezza il cane: più coccole, più ti vuole bene.',
  'Al cabinato premi <b>2</b>: entra il secondo giocatore.',
  'Scrivi <b>BIGALESSO</b> sulla macchina da scrivere.',
  "L'interruttore sul muro spegne le luci: modalità sala giochi.",
  '<b>3</b> per ballare. Il cane balla con te.',
  'La <b>mega bomba</b> pulisce lo schermo. Usala al momento giusto.',
];

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(SKEY) || '{}') || {}; } catch (e) { s = {}; }
  return { ...DEFAULTS, ...s };
}
function saveSettings(s) { try { localStorage.setItem(SKEY, JSON.stringify(s)); } catch (e) { } }

export function createUI() {
  const coarse = matchMedia('(pointer: coarse)').matches;
  document.body.classList.toggle('desk', !coarse);
  const $ = s => document.querySelector(s);
  const settings = loadSettings();
  const setCbs = [], menuCbs = [];
  const L = { create: [], join: [], leave: [] }, chatCbs = [];

  // ---------------- DOM ----------------
  const root = document.createElement('div'); root.id = 'ui';
  root.innerHTML = `
<div id="hudl">
  <div id="loc" class="glass" hidden><i></i><span></span></div>
  <div id="online" class="glass" hidden data-s="offline"><span class="dot"></span><span class="t"></span></div>
  <div id="aff" class="glass" hidden title="Affetto del cane">${ICON.heart}<span class="m"><b></b></span></div>
  <div id="obj" class="glass" hidden></div>
</div>
<div id="topbar">
  <button class="tbtn glass" id="menuBtn" aria-label="Menu (Esc)" title="Menu (Esc)">${ICON.menu}</button>
  <button class="tbtn glass" id="cam" aria-label="Cambia camera (C)" title="Cambia camera (C)">${ICON.cam}<span>Spalla</span></button>
  <button class="tbtn glass" id="mute" aria-label="Audio (M)" title="Audio (M)" aria-pressed="false">${ICON.sound}</button>
  <button class="tbtn glass" id="helpBtn" aria-label="Comandi (H)" title="Comandi (H)">${ICON.help}</button>
</div>
<button id="skip" class="glass" hidden>Salta intro ${ICON.skip}</button>
<div id="esc"><kbd>Esc</kbd> menu e impostazioni</div>
<div id="bubble"><div class="in"></div></div>
<div id="toasts" aria-live="polite"></div>
<div id="hint" class="glass off"></div>
<div id="p2" class="glass" hidden>P2: premi <kbd>2</kbd> per entrare</div>
<div id="typeHint" hidden><h4>Macchina da scrivere</h4><pre></pre><p>Scrivi con la tastiera · Invio a capo · Esc per alzarti</p></div>
<input id="kbd" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Tastiera macchina da scrivere">
<div id="chat" class="glass" hidden><div class="log" aria-live="polite"></div><input type="text" maxlength="140" placeholder="Scrivi… (T per chattare, Invio invia)" aria-label="Chat"></div>
<div id="touch" hidden>
  <div id="tzone"></div>
  <div id="stick"><i></i></div>
  <button class="tb cb" id="tFire" data-btn="fire"><span>SPARA</span></button>
  <button class="tb cb" id="tBomb" data-btn="bomb"><span>BOMBA</span></button>
  <button class="tb cb" id="tStart" data-btn="start"><span>START</span></button>
  <button class="tb ex" id="tAct" data-btn="act"><span>AZIONE</span></button>
  <button class="tb ex" id="tAlt" data-btn="alt" data-off="1"><span>ALTRO</span></button>
  <button class="tb" id="tSpray" data-btn="spray"><span>SPRUZZA</span></button>
  <button class="tb bk" id="tBack" data-btn="back"><span>ESCI</span></button>
</div>
<div id="menu" class="solid" aria-hidden="true" data-layout="root">
  <div class="bg"></div>
  <div class="mart" aria-hidden="true"><div class="ma"></div><div class="ma"></div><div class="mshade"></div></div>
  <nav class="mtabs" role="tablist" aria-label="Sezioni">
    <button data-go="hero">Personaggio</button><button data-go="map">Mappa</button><button data-go="achievements">Obiettivi</button><button data-go="characters">Personaggi</button><button data-go="gallery">Galleria</button><button data-go="secrets">Segreti</button><button data-go="online">Online</button><button data-go="settings">Impostazioni</button><button data-go="controls">Comandi</button><button data-go="credits">Crediti</button>
  </nav>
  <aside class="mside" aria-hidden="true"></aside>
  <div class="mkeys"><span><kbd>↑</kbd><kbd>↓</kbd> Seleziona</span><span><kbd>Invio</kbd> Conferma</span><span class="kq"><kbd>Q</kbd><kbd>E</kbd> Schede</span><button class="kesc" data-back><kbd>Esc</kbd> Indietro</button></div>
  <div class="panel" role="dialog" aria-modal="true" aria-label="Menu">
    <section class="page" data-page="main">
      <div class="mlogo"><h1 class="logo">BIGALESSO<span>GAMES</span></h1></div>
      <div class="mlist big">
        <button class="mbtn primary" data-act="explore" data-desc="Intro cinematica, poi giri libero per casa, giardino e dintorni"><span class="ic">${ICON.walk}</span><span><b class="playLbl">Gioca</b><small>Intro cinematica, poi giri libero</small></span></button>
        <button class="mbtn" data-act="arcade" data-desc="Dritto al cabinato BIGALESSO, gettone già inserito"><span class="ic">${ICON.joy}</span><span><b>Sala giochi</b><small>Dritto al cabinato BIGALESSO</small></span></button>
        <button class="mbtn" data-go="online" data-desc="Crea una stanza o entra con il codice degli amici"><span class="ic">${ICON.globe}</span><span><b>Online</b><small>Stanza con gli amici</small></span></button>
      </div>
      <div class="mlist mid">
        <button class="mbtn" data-go="map" data-desc="La casa, il giardino e i posti che hai scoperto"><span><b>Mappa</b></span></button>
        <button class="mbtn" data-go="achievements" data-desc="Obiettivi, statistiche e record salvati su questo computer"><span><b>Obiettivi</b><small class="achCount"></small></span></button>
        <button class="mbtn" data-go="characters" data-desc="Il gruppo: soprannomi, frasi tipiche e fissazioni"><span><b>Personaggi</b></span></button>
        <button class="mbtn" data-go="gallery" data-desc="Le tavole dell'intro e le pagine del Corriere delle Due Torri"><span><b>Galleria</b></span></button>
        <button class="mbtn" data-go="secrets" data-desc="Gli easter egg nascosti in giro"><span><b>Segreti</b><small class="secCount"></small></span></button>
      </div>
      <div class="mlist small">
        <button class="mbtn" data-go="settings" data-desc="Grafica, audio, camera, salvataggi"><span><b>Impostazioni</b></span></button>
        <button class="mbtn" data-act="intro" data-desc="Rivedi l'apertura BIGALESSO GAMES"><span><b>Rivedi intro</b></span></button>
        <button class="mbtn" data-go="credits" data-desc="Chi ha fatto cosa"><span><b>Crediti</b></span></button>
        <button class="mbtn" data-act="quit" data-desc="Chiudi il gioco"><span><b>Esci</b></span></button>
      </div>
      <p class="mdesc"></p>
    </section>
    <section class="page" data-page="pause">
      <div class="ph"><h2>PAUSA</h2></div>
      <div class="mlist big">
        <button class="mbtn primary" data-act="resume" data-desc="Torna dove eri"><span class="ic">${ICON.play}</span><span><b>Riprendi</b><small>Torna nella sala</small></span></button>
      </div>
      <div class="mlist mid">
        <button class="mbtn" data-act="games" data-desc="Chi l'ha detto?, Processo AI, Corriere AI, compettina, sushi"><span class="ic">${ICON.joy}</span><span><b>Minigiochi</b><small>dal telefono</small></span></button>
        <button class="mbtn" data-act="inv" data-desc="Armi, accessori, cibo e munizioni: equipaggia, smonta, butta (I)"><span class="ic">🎒</span><span><b>Zaino</b><small>tasto I</small></span></button>
        <button class="mbtn" data-go="hero" data-desc="Livello, punti abilità e talenti (Teppista, Cuoco, Festaiolo)"><span class="ic">⭐</span><span><b>Personaggio</b><small>livello e talenti</small></span></button>
        <button class="mbtn" data-go="map" data-desc="Dove sei e i posti che hai scoperto"><span class="ic">${ICON.home}</span><span><b>Mappa</b></span></button>
        <button class="mbtn" data-go="achievements" data-desc="Obiettivi, statistiche e record"><span><b>Obiettivi</b><small class="achCount"></small></span></button>
        <button class="mbtn" data-go="characters" data-desc="Il gruppo: soprannomi, frasi tipiche e fissazioni"><span><b>Personaggi</b></span></button>
        <button class="mbtn" data-go="gallery" data-desc="Tavole dell'intro e pagine del Corriere"><span><b>Galleria</b></span></button>
        <button class="mbtn" data-go="secrets" data-desc="Gli easter egg nascosti in giro"><span class="ic"><svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/></svg></span><span><b>Segreti</b><small class="secCount"></small></span></button>
      </div>
      <div class="mlist small">
        <button class="mbtn" data-go="settings" data-desc="Grafica, audio, camera, salvataggi"><span class="ic">${ICON.gear}</span><span><b>Impostazioni</b></span></button>
        <button class="mbtn" data-go="controls" data-desc="Tastiera, mouse e gamepad"><span class="ic">${ICON.keys}</span><span><b>Comandi</b></span></button>
        <button class="mbtn" data-go="online" data-desc="Stanza con gli amici"><span class="ic">${ICON.globe}</span><span><b>Online</b></span></button>
        <button class="mbtn" data-act="tomenu" data-desc="Torna al menu principale (la partita resta dov'è)"><span class="ic">${ICON.home}</span><span><b>Menu principale</b></span></button>
        <button class="mbtn" data-act="quit" data-desc="Chiudi il gioco"><span><b>Esci</b></span></button>
      </div>
      <p class="mdesc"></p>
    </section>
    <section class="page" data-page="settings">
      <div class="ph"><button class="back" data-back aria-label="Indietro">${ICON.back}</button><h2>IMPOSTAZIONI</h2></div>
      <div class="set">
        <div class="srow"><span class="lab">Grafica<small>Auto si adatta al dispositivo</small></span><span class="seg" data-set="quality"><button data-v="auto">Auto</button><button data-v="low">Bassa</button><button data-v="medium">Media</button><button data-v="high">Alta</button><button data-v="ultra">Ultra</button></span></div>
        <div class="srow"><label for="s_master">Volume generale</label><input id="s_master" type="range" min="0" max="1" step="0.05" data-set="master"></div>
        <div class="srow"><label for="s_music">Musica</label><input id="s_music" type="range" min="0" max="1" step="0.05" data-set="music"></div>
        <div class="srow"><label for="s_sfx">Effetti</label><input id="s_sfx" type="range" min="0" max="1" step="0.05" data-set="sfx"></div>
        <div class="srow"><label for="s_sens">Sensibilità camera</label><input id="s_sens" type="range" min="0.3" max="2.5" step="0.1" data-set="sens"></div>
        <div class="srow"><span class="lab">Inverti asse verticale</span><button class="tog" role="switch" data-set="invertY" aria-label="Inverti asse verticale"></button></div>
        <div class="srow"><span class="lab">Scossoni della camera</span><button class="tog" role="switch" data-set="cameraShake" aria-label="Scossoni della camera"></button></div>
        <div class="srow"><span class="lab">Suggerimenti a schermo</span><button class="tog" role="switch" data-set="showHints" aria-label="Suggerimenti a schermo"></button></div>
        <div class="srow"><label for="s_name">Nome giocatore<small>Usato online</small></label><input id="s_name" class="txt" type="text" maxlength="16" data-set="playerName" placeholder="Bigalesso"></div>
        <div class="srow"><span class="lab">Intro all'avvio<small>L'apertura BIGALESSO GAMES quando apri il gioco</small></span><button class="tog" role="switch" data-set="opening" aria-label="Intro all'avvio"></button></div>
        <div class="srow"><span class="lab">Rivedi l'intro</span><button class="pbtn ghost" data-act="intro">Guarda</button></div>
        <h3 class="sh">Salvataggio</h3>
        <div class="srow"><span class="lab">Obiettivi e progressi<small>Salvati in questo browser. Esporta un file per spostarli su un altro computer.</small></span><span class="orow"><button class="pbtn ghost" id="svExp">Esporta</button><button class="pbtn ghost" id="svImp">Importa</button></span></div>
        <div class="srow"><span class="lab">Azzera i progressi<small>Obiettivi, statistiche e segreti. Le impostazioni restano.</small></span><button class="pbtn ghost" id="svReset">Azzera</button></div>
        <input type="file" id="svFile" accept="application/json,.json" hidden>
        <p id="svMsg" class="smsg" aria-live="polite"></p>
      </div>
    </section>
    <section class="page" data-page="controls">
      <div class="ph"><button class="back" data-back aria-label="Indietro">${ICON.back}</button><h2>COMANDI</h2></div>
      <div class="tabs" role="tablist"><button data-tab="kb" class="on">Tastiera</button><button data-tab="pad">Gamepad</button><button data-tab="touch">Touch</button></div>
      <div class="ctab on" data-ctab="kb">
        <h3>Nella sala</h3><table>
        <tr><td><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / frecce</td><td>cammina · <kbd>Shift</kbd> corri</td></tr>
        <tr><td>Mouse · rotella</td><td>muovi il mouse per guardarti intorno (clic per catturarlo, <kbd>Esc</kbd> per liberarlo) · rotella per avvicinare</td></tr>
        <tr><td><kbd>E</kbd></td><td>interagisci con ciò che indica il fumetto</td></tr>
        <tr><td><kbd>R</kbd></td><td>azione alternativa (gettone, fischio al cane…)</td></tr>
        <tr><td><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd></td><td>saluta · esulta · balla · facepalm</td></tr>
        <tr><td><kbd>F</kbd> / clic</td><td>spruzza con l'estintore</td></tr></table>
        <h3>Combattimento</h3><table>
        <tr><td><kbd>H</kbd> · <kbd>0</kbd></td><td>estrai / riponi l'arma (anche clic sinistro per estrarla)</td></tr>
        <tr><td><kbd>V</kbd></td><td>prima / terza persona</td></tr>
        <tr><td>Clic sinistro · destro</td><td>spara · mira (zoom, più preciso)</td></tr>
        <tr><td><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd> / rotella</td><td>cambia arma (con l'arma in mano)</td></tr>
        <tr><td><kbd>R</kbd> · <kbd>Q</kbd></td><td>ricarica · ombrellata</td></tr></table>
        <h3>Al calcetto (Teletubbylandia)</h3><table>
        <tr><td><kbd>E</kbd> / clic</td><td>tira (tieni premuto per caricare) · <kbd>R</kbd> pallonetto · <kbd>Q</kbd> passa · corri sulla palla per portarla</td></tr>
        <tr><td>Lavagna</td><td><kbd>E</kbd> sfida gli amici 3 contro 3 · <kbd>R</kbd> rigori · al canestro: tiri liberi</td></tr></table>
        <h3>Al cabinato</h3><table>
        <tr><td>Frecce / <kbd>WASD</kbd></td><td>muovi Bigalesso</td></tr>
        <tr><td><kbd>Z</kbd> <kbd>Spazio</kbd></td><td>spara</td></tr>
        <tr><td><kbd>X</kbd></td><td>mega bomba</td></tr>
        <tr><td><kbd>Invio</kbd></td><td>start</td></tr>
        <tr><td><kbd>2</kbd></td><td>entra il giocatore 2 (P1 <kbd>WASD</kbd> <kbd>F</kbd> <kbd>G</kbd> · P2 frecce <kbd>L</kbd> <kbd>K</kbd>)</td></tr>
        <tr><td><kbd>C</kbd></td><td>camera: dentro lo schermo · spalla · cinema</td></tr>
        <tr><td><kbd>Esc</kbd> / <kbd>Q</kbd></td><td>alzati</td></tr></table>
        <h3>Sempre</h3><table>
        <tr><td><kbd>Esc</kbd></td><td>menu / pausa</td></tr><tr><td><kbd>C</kbd></td><td>cambia camera</td></tr><tr><td><kbd>M</kbd></td><td>audio</td></tr><tr><td><kbd>H</kbd></td><td>comandi (in giro: arma)</td></tr><tr><td><kbd>T</kbd></td><td>telefono (online: chat, telefono su <kbd>P</kbd>)</td></tr><tr><td><kbd>B</kbd></td><td>ruota emote (anche tasto centrale)</td></tr><tr><td><kbd>G</kbd></td><td>trucchi del cane</td></tr></table>
      </div>
      <div class="ctab" data-ctab="pad"><table>
        <tr><td>Stick sinistro</td><td>cammina / muovi</td></tr><tr><td>Stick destro</td><td>camera</td></tr>
        <tr><td>A / ✕</td><td>interagisci · spara</td></tr><tr><td>Y / △</td><td>azione alternativa</td></tr>
        <tr><td>B / ◯</td><td>indietro · bomba</td></tr><tr><td>Grilletti</td><td>spruzza · spara</td></tr>
        <tr><td>RT · LT</td><td>arma: spara · mira (croce: ↑ ricarica, ←→ cambia, ↓ estrai/riponi, R3 visuale)</td></tr><tr><td>Start</td><td>start / menu</td></tr><tr><td>Due gamepad</td><td>due giocatori al cabinato</td></tr></table></div>
      <div class="ctab" data-ctab="touch"><table>
        <tr><td>Pollice sinistro</td><td>joystick dove appoggi il dito</td></tr><tr><td>Trascina a destra</td><td>gira la camera</td></tr>
        <tr><td>Pulsante verde</td><td>azione mostrata nel fumetto</td></tr><tr><td>Pulsante lilla</td><td>azione alternativa</td></tr>
        <tr><td>Al cabinato</td><td>SPARA · BOMBA · START</td></tr><tr><td>Nel quartiere</td><td>🔫 estrai/cambia arma · SPARA · MIRA · ⟳ ricarica · 👁 visuale</td></tr><tr><td>ESCI</td><td>torna a camminare</td></tr></table></div>
    </section>
    <section class="page" data-page="online">
      <div class="ph"><button class="back" data-back aria-label="Indietro">${ICON.back}</button><h2>ONLINE</h2></div>
      <div class="obox">
        <div class="ocard"><h3>Il tuo nome</h3><div class="orow"><input id="oname" class="txt" type="text" maxlength="16" placeholder="Bigalesso"></div></div>
        <div class="ocard"><h3>Crea una stanza</h3><p>Ricevi un codice da passare agli amici.</p><button class="pbtn" id="ocreate">Crea stanza</button></div>
        <div class="ocard"><h3>Entra con un codice</h3><div class="orow"><input id="ocode" class="txt code" type="text" maxlength="6" placeholder="CODICE" autocapitalize="characters"><button class="pbtn" id="ojoin">Entra</button></div></div>
        <div id="ostatus" aria-live="polite"></div>
        <ul id="oplayers"></ul>
        <div class="orow"><button class="pbtn ghost" id="oleave" hidden>Esci dalla stanza</button></div>
      </div>
    </section>
    <section class="page" data-page="hero">
      <div class="ph"><button class="back" data-back aria-label="Indietro">${ICON.back}</button><h2>PERSONAGGIO</h2></div>
      <div id="heroBody" style="overflow:auto;max-height:72vh"></div>
    </section>
    <section class="page" data-page="map">
      <div class="ph"><button class="back" data-back aria-label="Indietro">${ICON.back}</button><h2>MAPPA</h2></div>
      <div class="mapwrap"><canvas id="mapCv" aria-label="Mappa"></canvas><div class="maplegend"><h3>Luoghi</h3><ul id="mapPlaces"></ul><p class="mhint">Rotella zoom · trascina per spostare · <kbd>R</kbd> centra</p></div></div>
    </section>
    <section class="page" data-page="achievements">
      <div class="ph"><button class="back" data-back aria-label="Indietro">${ICON.back}</button><h2>OBIETTIVI</h2></div>
      <div class="achHead"><div class="achPct"><b id="achPct">0%</b><span id="achN"></span></div><div class="achBar"><i id="achBarI"></i></div></div>
      <div class="achCats" id="achCats"></div>
      <div class="achBody"><ul id="achList"></ul><div class="achStats"><h3>Statistiche</h3><dl id="achStats"></dl></div></div>
    </section>
    <section class="page" data-page="characters">
      <div class="ph"><button class="back" data-back aria-label="Indietro">${ICON.back}</button><h2>PERSONAGGI</h2></div>
      <p class="chNote">Versioni da gioco, ispirate alla chat del gruppo.</p>
      <div id="chGrid"></div>
    </section>
    <section class="page" data-page="gallery">
      <div class="ph"><button class="back" data-back aria-label="Indietro">${ICON.back}</button><h2>GALLERIA</h2></div>
      <div id="galBody"></div>
    </section>
    <section class="page" data-page="credits">
      <div class="ph"><button class="back" data-back aria-label="Indietro">${ICON.back}</button><h2>CREDITI</h2></div>
      <div class="cred">
        <div class="crow"><span>Un gioco di</span><b>Bigalesso Games</b></div>
        <div class="crow"><span>Ispirato a</span><b>Il Corriere delle Due Torri e alla chat «Teletubbylandia certificata»</b></div>
        <div class="crow"><span>Motore</span><b>three.js r170 (MIT)</b></div>
        <div class="crow"><span>Personaggio</span><b>Avatar Ready Player Me e animazioni Mixamo dagli esempi di three.js, retargetizzate</b></div>
        <div class="crow"><span>Cabinato</span><b>Grafiche ricavate dalla foto originale BIGALESSO GAMES</b></div>
        <div class="crow"><span>Musica ed effetti</span><b>Sintetizzati in tempo reale (WebAudio), nessun file audio</b></div>
        <div class="crow"><span>Caratteri</span><b>Anton (SIL Open Font License) · helvetiker (esempi three.js)</b></div>
        <div class="crow"><span>Illustrazioni</span><b>Tavole dell'intro e stampe dalle pagine del Corriere</b></div>
        <div class="crow"><span>Ringraziamenti</span><b>Il cane, il cabinato e tutti quelli che hanno detto «compettina?»</b></div>
      </div>
      <div class="orow"><button class="pbtn" data-act="intro">Rivedi intro</button></div>
    </section>
    <section class="page" data-page="secrets">
      <div class="ph"><button class="back" data-back aria-label="Indietro">${ICON.back}</button><h2>SEGRETI</h2></div>
      <p class="secSum"></p>
      <ul id="seclist"></ul>
      <div class="orow"><button class="pbtn" id="secCred" hidden>Titoli di coda</button></div>
    </section>
  </div>
</div>
<div id="err" hidden></div>
<div id="mlight" hidden><img alt=""><div class="lcap"></div><button class="lx" aria-label="Chiudi">×</button><button class="lp" aria-label="Precedente">‹</button><button class="ln" aria-label="Successiva">›</button></div>`;
  document.body.appendChild(root);

  const el = {
    loader: $('#loader'), lbar: $('#lbar'), lpct: $('#lpct'), ltext: $('#ltext'), ltip: $('#ltip'),
    top: $('#topbar'), esc: $('#esc'), menuBtn: $('#menuBtn'), cam: $('#cam'), mute: $('#mute'), helpBtn: $('#helpBtn'), skip: $('#skip'),
    loc: $('#loc'), locT: $('#loc span'), online: $('#online'), onlineT: $('#online .t'), aff: $('#aff'), affB: $('#aff .m b'), obj: $('#obj'),
    bubble: $('#bubble'), bubbleIn: $('#bubble .in'), toasts: $('#toasts'), hint: $('#hint'), p2: $('#p2'),
    typeHint: $('#typeHint'), typePre: $('#typeHint pre'), kbd: $('#kbd'), chat: $('#chat'), chatLog: $('#chat .log'), chatIn: $('#chat input'),
    touch: $('#touch'), tzone: $('#tzone'), stick: $('#stick'), knob: $('#stick i'), tAct: $('#tAct'), tAlt: $('#tAlt'),
    menu: $('#menu'), panel: $('#menu .panel'), err: $('#err'),
  };

  // ---------------- loading ----------------
  let tipI = 0;
  const tipTimer = setInterval(() => {
    if (!el.ltip) return; tipI = (tipI + 1) % TIPS.length; el.ltip.style.opacity = 0;
    setTimeout(() => { el.ltip.innerHTML = TIPS[tipI]; el.ltip.style.opacity = 1; }, 350);
  }, 3200);
  const loading = {
    set(p, text) { const v = Math.round(clamp(p, 0, 1) * 100); if (el.lbar) el.lbar.style.width = v + '%'; if (el.lpct) el.lpct.textContent = v + '%'; if (text && el.ltext) el.ltext.textContent = text; },
    ready() {
      loading.set(1, 'Pronto.');
      clearInterval(tipTimer);
      setTimeout(() => { menu.show('main'); if (el.loader) { el.loader.classList.add('gone'); setTimeout(() => el.loader && (el.loader.hidden = true), 800); } }, 250);
    },
  };

  // ---------------- menu ----------------
  let page = null, rootPage = 'main', started = false;
  const pages = [...root.querySelectorAll('.page')];
  const ROOTS = ['main', 'pause'];
  const TABS = [...root.querySelectorAll('.mtabs [data-go]')].map(b => b.dataset.go);
  const navItems = () => [...el.panel.querySelectorAll('.page.on button:not([hidden]), .page.on input:not([hidden])')].filter(b => b.offsetParent !== null);
  function showPage(p) {
    const prev = page; page = p;
    for (const s of pages) s.classList.toggle('on', s.dataset.page === p);
    el.menu.dataset.layout = ROOTS.includes(p) ? 'root' : 'hub';
    el.menu.dataset.page = p;
    for (const b of root.querySelectorAll('.mtabs [data-go]')) { const on = b.dataset.go === p; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); }
    el.panel.scrollTop = 0;
    if (p === 'settings') syncSettingsUI();
    if (p === 'online') { const n = $('#oname'); if (n) n.value = settings.playerName || ''; }
    if (p === 'main') { const l = root.querySelector('.playLbl'); if (l) l.textContent = started ? 'Continua' : 'Gioca'; }
    hub.enter(p, prev);
    requestAnimationFrame(() => { const f = el.panel.querySelector('.page.on .mbtn, .page.on button:not(.back), .page.on input, .page.on button'); f && f.focus({ preventScroll: true }); hub.desc(f); });
  }
  const menu = {
    get open() { return el.menu.classList.contains('show'); },
    get root() { return rootPage; },
    get page() { return page; },
    show(p = 'main') {
      if (p === 'main' || p === 'pause') rootPage = p;
      else if (!menu.open) rootPage = started ? 'pause' : 'main';
      el.menu.classList.toggle('solid', !started);
      el.menu.classList.add('show'); el.menu.setAttribute('aria-hidden', 'false');
      showPage(p);
    },
    hide() { el.menu.classList.remove('show'); el.menu.setAttribute('aria-hidden', 'true'); hub.enter(null, page); document.activeElement && document.activeElement.blur && document.activeElement.blur(); },
    back() {
      if (page !== rootPage) showPage(rootPage);
      else if (rootPage === 'pause') { menu.hide(); emitMenu('resume'); }
    },
  };
  const emitMenu = a => { for (const cb of menuCbs) try { cb(a); } catch (e) { console.error(e); } };
  el.panel.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    sfx('ok');
    if (b.dataset.go) { showPage(b.dataset.go); return; }
    if (b.hasAttribute('data-back')) { menu.back(); return; }
    if (b.dataset.act) {
      const a = b.dataset.act;
      if (a === 'intro') { hub.replayIntro(); return; }
      if (a === 'quit') { hub.quit(); return; }
      if (a === 'games') { started = true; menu.hide(); emitMenu('resume'); setTimeout(() => { try { window.__phone && window.__phone.open('games'); } catch (e) { } }, 150); return; }
      if (a === 'explore' || a === 'arcade' || a === 'resume') { started = true; menu.hide(); }
      if (a === 'tomenu') { started = true; showPage('main'); rootPage = 'main'; el.menu.classList.remove('solid'); }
      emitMenu(a);
      return;
    }
    if (b.dataset.tab) {
      for (const t of el.panel.querySelectorAll('[data-tab]')) t.classList.toggle('on', t === b);
      for (const t of el.panel.querySelectorAll('[data-ctab]')) t.classList.toggle('on', t.dataset.ctab === b.dataset.tab);
    }
  });
  el.menu.addEventListener('click', e => {
    const b = e.target.closest('.mtabs [data-go], .mkeys [data-back]'); if (!b) return;
    sfx('ok');
    if (b.dataset.go) showPage(b.dataset.go); else menu.back();
  });
  // keyboard nav inside the menu (capture phase: the game never sees these keys)
  addEventListener('keydown', e => {
    if (!menu.open || document.body.dataset.opening) return;
    const t = e.target;
    if (hub.key(e)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    const inText = t && t.tagName === 'INPUT' && t.type === 'text';
    if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); menu.back(); return; }
    if (inText) { e.stopImmediatePropagation(); if (e.code === 'Enter') { if (t.id === 'ocode') $('#ojoin').click(); t.blur(); } return; }
    const items = navItems(); const i = items.indexOf(document.activeElement);
    if (e.code === 'ArrowDown' || e.code === 'ArrowUp' || e.code === 'Tab') {
      e.preventDefault(); const d = (e.code === 'ArrowUp' || (e.code === 'Tab' && e.shiftKey)) ? -1 : 1;
      const n = items[(i + d + items.length) % items.length]; if (n) { n.focus(); sfx('move'); hub.desc(n); }
    } else if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight') && t && t.type === 'range') {
      return; // native slider
    } else if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight') && t && t.closest && t.closest('.seg,.tabs')) {
      e.preventDefault(); const sib = e.code === 'ArrowLeft' ? t.previousElementSibling : t.nextElementSibling; if (sib) { sib.focus(); sib.click(); }
    } else if (e.code === 'Enter' || e.code === 'Space') {
      if (t && t.tagName === 'BUTTON') { e.preventDefault(); t.click(); }
    }
    e.stopImmediatePropagation();
  }, true);
  // gamepad nav
  const padPrev = [];
  function padNav() {
    if (!menu.open || !navigator.getGamepads) return;
    const p = Array.from(navigator.getGamepads()).find(Boolean); if (!p) return;
    const b = i => !!(p.buttons[i] && p.buttons[i].pressed);
    const now = { up: b(12) || p.axes[1] < -0.6, down: b(13) || p.axes[1] > 0.6, left: b(14) || p.axes[0] < -0.6, right: b(15) || p.axes[0] > 0.6, a: b(0), back: b(1), lb: b(4), rb: b(5) };
    const edge = k => now[k] && !padPrev[k];
    const items = navItems(); const i = items.indexOf(document.activeElement);
    if (edge('down') || edge('up')) { const n = items[(i + (now.down ? 1 : -1) + items.length) % items.length]; n && n.focus(); }
    const t = document.activeElement;
    if ((edge('left') || edge('right')) && t) {
      if (t.type === 'range') { const st = +t.step || 0.1; t.value = clamp(+t.value + (now.right ? st : -st), +t.min, +t.max); t.dispatchEvent(new Event('input', { bubbles: true })); }
      else if (t.closest && t.closest('.seg,.tabs')) { const sib = now.left ? t.previousElementSibling : t.nextElementSibling; if (sib) { sib.focus(); sib.click(); } }
    }
    if (edge('a') && t && t.tagName === 'BUTTON') t.click();
    if (edge('back')) { if (!lb.hidden) lbClose(); else menu.back(); }
    if ((edge('lb') || edge('rb')) && el.menu.dataset.layout === 'hub') { const i = TABS.indexOf(page); showPage(TABS[((i < 0 ? 0 : i) + (now.rb ? 1 : -1) + TABS.length) % TABS.length]); sfx('tab'); }
    Object.assign(padPrev, now);
  }

  // ---------------- settings ----------------
  function setSetting(k, v, silent) {
    settings[k] = v; saveSettings(settings);
    if (!silent) for (const cb of setCbs) try { cb(k, v, settings); } catch (e) { console.error(e); }
    syncSettingsUI();
  }
  function syncSettingsUI() {
    for (const n of el.panel.querySelectorAll('[data-set]')) {
      const k = n.dataset.set, v = settings[k];
      if (n.classList.contains('seg')) for (const b of n.children) b.classList.toggle('on', b.dataset.v === v);
      else if (n.classList.contains('tog')) n.setAttribute('aria-checked', v ? 'true' : 'false');
      else if (n.type === 'range') { if (document.activeElement !== n) n.value = v; n.style.setProperty('--p', ((n.value - n.min) / (n.max - n.min) * 100) + '%'); }
      else if (n.type === 'text' && document.activeElement !== n) n.value = v || '';
    }
  }
  el.panel.addEventListener('click', e => {
    const s = e.target.closest('.seg[data-set] button'); if (s) { setSetting(s.parentElement.dataset.set, s.dataset.v); return; }
    const t = e.target.closest('.tog[data-set]'); if (t) setSetting(t.dataset.set, !settings[t.dataset.set]);
  });
  el.panel.addEventListener('input', e => {
    const n = e.target; if (!n.dataset || !n.dataset.set) return;
    if (n.type === 'range') setSetting(n.dataset.set, +n.value);
    else if (n.type === 'text') setSetting(n.dataset.set, n.value.trim().slice(0, 16));
  });

  // ---------------- online lobby (UI only) ----------------
  const oname = $('#oname'), ocode = $('#ocode');
  oname.addEventListener('input', () => setSetting('playerName', oname.value.trim().slice(0, 16)));
  ocode.addEventListener('input', () => { ocode.value = ocode.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); });
  const fire = (arr, ...a) => { for (const cb of arr) try { cb(...a); } catch (e) { console.error(e); } };
  $('#ocreate').addEventListener('click', () => { lobby.setStatus('Creo la stanza…'); fire(L.create, settings.playerName || 'Bigalesso'); });
  $('#ojoin').addEventListener('click', () => { const c = ocode.value.trim(); if (c.length < 3) { lobby.setStatus('Inserisci il codice della stanza'); ocode.focus(); return; } lobby.setStatus('Entro nella stanza ' + c + '…'); fire(L.join, c, settings.playerName || 'Bigalesso'); });
  $('#oleave').addEventListener('click', () => fire(L.leave));
  const lobby = {
    open() { menu.show('online'); }, close() { if (page === 'online') menu.hide(); },
    onCreate(cb) { L.create.push(cb); }, onJoin(cb) { L.join.push(cb); }, onLeave(cb) { L.leave.push(cb); },
    setStatus(t) { $('#ostatus').textContent = t || ''; },
    setRoom(code) { $('#oleave').hidden = !code; if (code) lobby.setStatus('Sei nella stanza ' + code + ' · passa il codice agli amici'); },
    setPlayers(list) {
      $('#oplayers').innerHTML = (list || []).map(p => `<li><i style="background:${esc(p.color || '#c8f03c')}"></i>${esc(p.name || 'Giocatore')}${p.you ? ' <small>(tu)</small>' : ''}${p.host ? ' <small>· host</small>' : ''}</li>`).join('');
    },
  };

  // ---------------- chat ----------------
  const chat = {
    add(name, text) {
      const d = document.createElement('div'); d.innerHTML = `<b>${esc(name)}:</b> ${esc(text)}`; el.chatLog.appendChild(d);
      while (el.chatLog.children.length > 40) el.chatLog.firstChild.remove();
      el.chatLog.scrollTop = el.chatLog.scrollHeight;
    },
    onSend(cb) { chatCbs.push(cb); }, show(v) { el.chat.hidden = !v; }, focus() { if (!el.chat.hidden) el.chatIn.focus(); },
    get focused() { return document.activeElement === el.chatIn; },
  };
  el.chatIn.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') { const v = el.chatIn.value.trim(); el.chatIn.value = ''; if (v) fire(chatCbs, v); el.chatIn.blur(); }
    if (e.key === 'Escape') el.chatIn.blur();
  });
  el.chatIn.addEventListener('keyup', e => e.stopPropagation());

  // ---------------- toasts ----------------
  function toast(msg, kind = '') {
    const d = document.createElement('div'); d.className = 'toast glass ' + (kind || ''); d.textContent = msg; el.toasts.appendChild(d);
    while (el.toasts.children.length > 3) el.toasts.firstChild.remove();
    requestAnimationFrame(() => d.classList.add('in'));
    setTimeout(() => { d.classList.remove('in'); d.classList.add('out'); setTimeout(() => d.remove(), 450); }, 2600);
  }

  // ---------------- prompt bubble ----------------
  let bubKey = null;
  const short = s => (s.length > 11 ? s.split(' ')[0] : s);
  function prompt(items, pos, camera) {
    if (!items || !items.length || !pos || !camera) {
      if (bubKey !== null) { el.bubble.classList.remove('show'); bubKey = null; }
      el.tAct.querySelector('span').textContent = 'AZIONE'; el.tAlt.dataset.off = '1';
      return;
    }
    const key = items.map(i => i.label).join('|');
    if (bubKey !== key) {
      bubKey = key;
      el.bubbleIn.innerHTML = items.map((it, i) => `<div class="row${i ? ' alt' : ''}"><kbd${i ? ' class="alt"' : ''}>${coarse ? (i ? '◆' : '●') : esc(it.key || (i ? 'R' : 'E'))}</kbd>${esc(it.label)}</div>`).join('');
      el.bubble.classList.remove('show'); void el.bubble.offsetWidth; el.bubble.classList.add('show');
      el.tAct.querySelector('span').textContent = short(items[0].label).toUpperCase();
      if (items[1]) { el.tAlt.dataset.off = '0'; el.tAlt.querySelector('span').textContent = short(items[1].label).toUpperCase(); } else el.tAlt.dataset.off = '1';
    }
    const p = pos.clone().project(camera);
    const x = (p.x * 0.5 + 0.5) * innerWidth, y = (-p.y * 0.5 + 0.5) * innerHeight;
    const vis = p.z < 1 && x > -60 && x < innerWidth + 60;
    el.bubble.style.transform = `translate(${clamp(x, 110, innerWidth - 110)}px, ${clamp(y, 90, innerHeight - 50)}px) translate(-50%, -100%)`;
    el.bubble.style.visibility = vis ? 'visible' : 'hidden';
  }

  // ---------------- hint bar ----------------
  let hintKey = '', hintT = 0, hintShown = false;
  function setHint(items) {
    // items: [[keysHtml, text], ...]  (keys as plain strings joined by '+')
    const html = items ? items.map(([k, t]) => `<span class="k">${String(k).split(' ').map(x => `<kbd>${esc(x)}</kbd>`).join('')}${esc(t)}</span>`).join('') : '';
    if (html === hintKey) return;
    hintKey = html; el.hint.innerHTML = html; hintT = 0; hintShown = !!html;
    el.hint.classList.toggle('off', !html || !settings.showHints || coarse);
  }

  // ---------------- HUD ----------------
  let affV = null, locTimer = 0, affTimer = 0;
  const hud = {
    setLocation(t) {
      if (!coarse) { // desktop: a short cinematic caption only when the place/action changes
        if (!t || el.locT.textContent === t) return;
        el.locT.textContent = t; el.loc.hidden = false; el.loc.classList.remove('cap'); void el.loc.offsetWidth; el.loc.classList.add('cap');
        clearTimeout(locTimer); locTimer = setTimeout(() => el.loc.classList.remove('cap'), 2600); return;
      }
      if (!t) { el.loc.hidden = true; return; } el.loc.hidden = false; if (el.locT.textContent !== t) { el.locT.textContent = t; el.loc.classList.remove('pop'); void el.loc.offsetWidth; el.loc.classList.add('pop'); } },
    setAffection(v) {
      if (v === null || v === undefined) { el.aff.hidden = true; affV = null; return; }
      v = clamp(v, 0, 1);
      if (!coarse) { // desktop: only while petting or right after it changes
        const changed = affV === null || Math.abs(v - affV) > 0.002;
        if (changed || document.body.dataset.mode === 'pet') { el.aff.hidden = false; el.aff.classList.add('vis'); clearTimeout(affTimer); affTimer = setTimeout(() => el.aff.classList.remove('vis'), 2500); }
      } else el.aff.hidden = false;
      if (affV !== null && v > affV + 0.01) { el.aff.classList.remove('beat'); void el.aff.offsetWidth; el.aff.classList.add('beat'); }
      affV = v; el.affB.style.width = (v * 100).toFixed(1) + '%';
    },
    setOnline(o) {
      if (!o) { el.online.hidden = true; chat.show(false); return; }
      el.online.hidden = false; el.online.dataset.s = o.status || 'connected';
      const st = { connected: 'Online', connecting: 'Connessione…', offline: 'Offline', error: 'Errore rete' }[o.status || 'connected'] || o.status;
      el.onlineT.textContent = st + (o.room ? ' · ' + o.room : '') + (o.players ? ' · ' + o.players + (o.players === 1 ? ' giocatore' : ' giocatori') : '');
      chat.show((o.status || 'connected') === 'connected');
    },
    setObjective(t) { if (!t) { el.obj.hidden = true; return; } el.obj.hidden = false; el.obj.innerHTML = t; },
  };

  // ---------------- top bar ----------------
  el.menuBtn.addEventListener('click', e => { e.currentTarget.blur(); menu.show(started ? 'pause' : 'main'); emitMenu('pause'); });
  el.helpBtn.addEventListener('click', e => { e.currentTarget.blur(); menu.show('controls'); emitMenu('pause'); });
  el.skip.innerHTML = `Salta intro ${ICON.skip}`;

  // ---------------- touch ----------------
  let touchH = null;
  function bindTouch(h) {
    touchH = h;
    if (!coarse) return;
    el.touch.hidden = false;
    let sid = null, cx = 0, cy = 0;
    const R = 52;
    const rest = () => { const r = el.tzone.getBoundingClientRect(); el.stick.style.left = (r.left + 96) + 'px'; el.stick.style.top = (r.bottom - 110) + 'px'; el.knob.style.transform = ''; };
    rest(); addEventListener('resize', rest);
    el.tzone.addEventListener('pointerdown', e => {
      if (sid !== null) return; e.preventDefault(); sid = e.pointerId; el.tzone.setPointerCapture(sid);
      cx = e.clientX; cy = e.clientY; el.stick.style.left = cx + 'px'; el.stick.style.top = cy + 'px'; el.stick.classList.add('act');
      touchH && touchH.stick(0, 0, true);
    });
    el.tzone.addEventListener('pointermove', e => {
      if (e.pointerId !== sid) return;
      let dx = (e.clientX - cx) / R, dy = (e.clientY - cy) / R; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
      el.knob.style.transform = `translate(${dx * 36}px,${dy * 36}px)`;
      touchH && touchH.stick(dx, dy, true);
    });
    const end = e => { if (e.pointerId !== sid) return; sid = null; el.stick.classList.remove('act'); rest(); touchH && touchH.stick(0, 0, false); };
    el.tzone.addEventListener('pointerup', end); el.tzone.addEventListener('pointercancel', end);
    for (const b of el.touch.querySelectorAll('[data-btn]')) {
      const k = b.dataset.btn;
      b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch (x) { } touchH && touchH.down(k); if (navigator.vibrate) try { navigator.vibrate(8); } catch (x) { } });
      const up = () => { b.classList.remove('on'); touchH && touchH.up(k); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
    }
  }

  // ---------------- misc ----------------
  const typing = {
    show(v) { el.typeHint.hidden = !v; },
    setLines(lines) { const ls = (lines || []).slice(-4); el.typePre.textContent = ls.join('\n'); },
  };
  // the cabinet's own stick zone: on phones the floating stick also drives Bigalesso
  el.tzone.classList.add('cab');

  // ---------------- secrets (eggs.js fills it) ----------------
  const credCbs = [];
  $('#secCred').addEventListener('click', () => { menu.hide(); for (const cb of credCbs) cb(); });
  const secrets = {
    set(list) {
      const n = list.filter(x => x.found).length, m = list.length;
      for (const e of root.querySelectorAll('.secCount')) e.textContent = n + ' su ' + m + ' trovati';
      const sum = root.querySelector('.secSum'); if (sum) sum.textContent = n === m ? 'Li hai trovati tutti. Ave, Bigalesso.' : 'Trovati ' + n + ' su ' + m + '. Gli indizi diventano più chiari man mano.';
      $('#seclist').innerHTML = list.map(x => x.found
        ? `<li class="on"><b>${esc(x.name)}</b><small>${esc(x.desc || '')}</small></li>`
        : `<li><b>???</b><small>${esc(x.hint || '')}</small></li>`).join('');
      $('#secCred').hidden = n < m;
    },
    onCredits(cb) { credCbs.push(cb); },
  };
  // =============== GTA-style menu hub: art background, side card, map, achievements, characters, gallery ===============
  let app = null, uctx = null, lastHover = null;
  function sfx(kind) {
    if (coarse) return;
    try {
      const A = app && app.audio; if (A && A.muted) return;
      let ctx = A && A.ctx, dest = A && A.room;
      if (!ctx) {
        if (!uctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C || !(navigator.userActivation && navigator.userActivation.hasBeenActive)) return; uctx = new C(); }
        ctx = uctx; dest = uctx.destination; if (ctx.state === 'suspended') ctx.resume();
      }
      const v = A ? 1 : (settings.master ?? 0.85) * (settings.sfx ?? 0.9);
      const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = kind === 'ok' ? 'triangle' : 'sine';
      o.frequency.setValueAtTime(kind === 'ok' ? 640 : kind === 'tab' ? 480 : 1180, t);
      if (kind === 'ok') o.frequency.exponentialRampToValueAtTime(960, t + 0.08);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime((kind === 'move' ? 0.03 : 0.055) * v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'ok' ? 0.16 : 0.07));
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.2);
    } catch (e) { }
  }
  el.menu.addEventListener('mouseover', e => {
    const b = e.target.closest('.mbtn, .mtabs button, .pbtn, .achCats button, .gcell'); if (!b || b === lastHover) return;
    lastHover = b; sfx('move'); if (b.classList.contains('mbtn')) hub.desc(b);
  });
  el.menu.addEventListener('mouseleave', () => { lastHover = null; });

  const fmtTime = s => { s = Math.round(+s || 0); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? h + ' h ' + String(m).padStart(2, '0') + ' min' : m + ' min'; };
  const fmtNum = n => Math.round(+n || 0).toLocaleString('it-IT');
  const humanize = k => String(k).replace(/_/g, ' ').replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/^./, c => c.toUpperCase());

  // ---- art slideshow behind the main menu (the intro panels, Ken Burns) ----
  const ART = ['cabinato', 'portici', 'battaglia', 'gulag', 'stampa', 'over80', 'processo'];
  const artL = [...root.querySelectorAll('.mart .ma')];
  let artI = 0, artT = 0, artOn = false;
  function artTick() {
    const a = artL[artI % 2], b = artL[(artI + 1) % 2];
    a.style.backgroundImage = `url("${openingSrc(ART[artI % ART.length])}")`;
    a.classList.remove('on'); void a.offsetWidth; a.classList.add('on'); b.classList.remove('on'); artI++;
  }
  function artRun(on) { if (on === artOn) return; artOn = on; clearInterval(artT); el.menu.classList.toggle('art', on); if (on) { artTick(); artT = setInterval(artTick, 7000); } }

  // ---- side card on the root pages ----
  const side = root.querySelector('.mside');
  function renderSide(p) {
    const S = window.__save; if (!S) { side.innerHTML = ''; return; }
    const pr = S.progress(), st = S.stats(), rec = S.records();
    let eggs = null; try { const l = window.__eggs && window.__eggs.list(); if (l) eggs = [l.filter(x => x.found).length, l.length]; } catch (e) { }
    const zone = p === 'pause' && app && app.S && app.S.zone ? app.S.zone : null;
    side.innerHTML = (zone ? `<div class="sc where"><small>Sei qui</small><b>${esc(zone)}</b></div>` : '') +
      `<div class="sc"><small>Obiettivi</small><b>${pr.n}<i>/${pr.m}</i></b><span class="bar"><i style="width:${pr.pct}%"></i></span></div>` +
      (eggs ? `<div class="sc"><small>Segreti</small><b>${eggs[0]}<i>/${eggs[1]}</i></b></div>` : '') +
      `<div class="sc"><small>Tempo di gioco</small><b>${fmtTime(st.playTime)}</b></div>` +
      (rec.bigalesso_score ? `<div class="sc"><small>Record al cabinato</small><b>${fmtNum(rec.bigalesso_score)}</b></div>` : '');
    for (const e of root.querySelectorAll('.achCount')) e.textContent = pr.n + ' su ' + pr.m;
  }

  // ---- achievements ----
  let achCat = 'Tutti';
  function renderAch() {
    const S = window.__save; if (!S) return;
    const l = S.list(), pr = S.progress();
    $('#achPct').textContent = pr.pct + '%'; $('#achN').textContent = pr.n + ' su ' + pr.m + ' sbloccati'; $('#achBarI').style.width = pr.pct + '%';
    const cats = ['Tutti', ...new Set(l.map(a => a.cat || 'Extra'))];
    if (!cats.includes(achCat)) achCat = 'Tutti';
    $('#achCats').innerHTML = cats.map(c => `<button data-cat="${esc(c)}" class="${c === achCat ? 'on' : ''}">${esc(c)}</button>`).join('');
    const vis = l.filter(a => achCat === 'Tutti' || (a.cat || 'Extra') === achCat);
    $('#achList').innerHTML = vis.map(a => {
      const sec = a.hidden && !a.unlocked;
      const d = a.unlocked ? new Date(a.ts).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) : '';
      return `<li class="${a.unlocked ? 'on' : ''}"><span class="ai">${a.unlocked ? esc(a.icon || '★') : '🔒'}</span><span class="at"><b>${sec ? '???' : esc(a.title)}</b><small>${sec ? 'Obiettivo segreto' : esc(a.desc || '')}</small></span>${d ? `<time>${esc(d)}</time>` : ''}</li>`;
    }).join('');
    const st = S.stats(), rec = S.records(), pl = Object.keys(S.places());
    let eggs = st.eggs || 0; try { const L = window.__eggs && window.__eggs.list(); if (L) eggs = L.filter(x => x.found).length + ' su ' + L.length; } catch (e) { }
    const rows = [['Tempo di gioco', fmtTime(st.playTime)], ['Sessioni', fmtNum(st.sessions)], ['Partite al cabinato', fmtNum(st.games)], ['Boss abbattuti', fmtNum(st.bosses)],
      ['Round vinti col direttore', fmtNum(st.dirRounds)], ['Segreti trovati', eggs], ['Luoghi scoperti', pl.length]];
    if (rec.bigalesso_score) rows.push(['Record BIGALESSO', fmtNum(rec.bigalesso_score)]);
    for (const k in rec) if (k !== 'bigalesso_score') rows.push([humanize(k), fmtNum(rec[k])]);
    for (const k in st) if (!['playTime', 'sessions', 'games', 'bosses', 'dirRounds', 'eggs', 'dirGames'].includes(k)) rows.push([humanize(k), fmtNum(st[k])]);
    $('#achStats').innerHTML = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
  }
  $('#achCats').addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (b) { achCat = b.dataset.cat; sfx('tab'); renderAch(); } });

  // ---- characters (assets/chat/personas.json: game versions, nicknames only) ----
  let chDone = false;
  function renderChars() {
    if (chDone) return; chDone = true;
    const list = Array.isArray(PERSONAS) ? PERSONAS : [];
    $('#chGrid').innerHTML = list.map(p => {
      const nameWords = String(p.name || p.nick || '').split(/\s+/);
      const title = nameWords[0] || p.nick || '';
      const bad = new Set(nameWords.slice(1).map(w => w.toLowerCase()));
      const aka = (p.aka || []).filter(a => !bad.has(String(a).toLowerCase()) && String(a).toLowerCase() !== title.toLowerCase()).slice(0, 3);
      const cp = (p.catchphrases || []).slice(0, 4), it = (p.interests || []).filter(x => !/\bvia\b/i.test(x)).slice(0, 4);
      const col = /^#[0-9a-f]{3,8}$/i.test(p.color || '') ? p.color : '#c8f03c';
      return `<article class="chc" style="--c:${col}"><div class="chh"><span class="che">${esc(p.emoji || '🙂')}</span><span><b>${esc(title)}</b>${aka.length ? `<small>detto ${aka.map(esc).join(', ')}</small>` : ''}</span></div>
        <p>${esc(String(p.tone || '').replace(/;.*$/, ''))}</p>
        <div class="chq">${cp.map(c => `<q>${esc(c)}</q>`).join('')}</div>
        ${it.length ? `<div class="chi">${it.map(c => `<span>${esc(c)}</span>`).join('')}</div>` : ''}</article>`;
    }).join('') || '<p class="chNote">Nessun personaggio.</p>';
  }

  // ---- gallery ----
  const NEWS = (i) => { const f = 'page-' + String(i).padStart(2, '0') + '.jpg'; const E = window.__ASSETS && window.__ASSETS.news; return (E && E[f]) || './news/' + f; };
  const NEWSF = f => { const E = window.__ASSETS && window.__ASSETS.news; return (E && E[f]) || './news/' + f; };
  let galItems = [], lbI = -1;
  function renderGallery() {
    const S = window.__save, un = id => !!(S && S.isUnlocked(id));
    const sections = [
      { t: 'Tavole dell\'intro', lock: 'Guarda l\'intro fino in fondo', ok: un('opening'), items: ART.map(n => ({ src: openingSrc(n), cap: humanize(n) })) },
      { t: 'Il Corriere delle Due Torri · N. 313', lock: 'Leggi il Corriere in casa', ok: un('newspaper'), items: Array.from({ length: 12 }, (_, i) => ({ src: NEWS(i + 1), cap: 'Pagina ' + (i + 1), page: 1 })) },
      { t: 'Stampe e murales', lock: 'Guarda il murales in giardino', ok: un('mural'), items: [['mural.jpg', 'Cappelletti Man vs Tortellino Man'], ['print-tortellino.jpg', 'Tortellino Man'], ['print-over80.jpg', 'Over 80'], ['print-ciclostile.jpg', 'Il ciclostile'], ['print-fakenews.jpg', 'Fake news']].map(([f, c]) => ({ src: NEWSF(f), cap: c })) },
    ];
    { const sf = window.__selfies ? window.__selfies.list() : []; if (sf.length) sections.unshift({ t: 'I tuoi selfie', ok: true, items: sf.map(x => ({ src: x.url, cap: 'Selfie' + (x.who ? ' con ' + x.who : '') + ' · ' + new Date(x.t).toLocaleString('it-IT') })) }); } // interact/: emote wheel (B) → Selfie
    galItems = [];
    $('#galBody').innerHTML = sections.map(sec => `<h3 class="gh">${esc(sec.t)}${sec.ok ? '' : ` <small>· ${esc(sec.lock)}</small>`}</h3><div class="ggrid${sec.items[0] && sec.items[0].page ? ' pages' : ''}">` +
      sec.items.map(it => { if (!sec.ok) return `<div class="gcell lock"><span>🔒</span></div>`; const i = galItems.push(it) - 1; return `<button class="gcell" data-gi="${i}" aria-label="${esc(it.cap)}"><img loading="lazy" decoding="async" alt="" src="${esc(it.src)}"><span>${esc(it.cap)}</span></button>`; }).join('') + '</div>').join('');
  }
  const lb = $('#mlight'), lbImg = lb.querySelector('img'), lbCap = lb.querySelector('.lcap');
  function lbShow(i) { if (!galItems.length) return; lbI = (i + galItems.length) % galItems.length; const it = galItems[lbI]; lbImg.src = it.src; lbCap.textContent = it.cap + '  ·  ' + (lbI + 1) + '/' + galItems.length; lb.hidden = false; }
  function lbClose() { lb.hidden = true; lbI = -1; }
  $('#galBody').addEventListener('click', e => { const b = e.target.closest('[data-gi]'); if (b) { sfx('ok'); lbShow(+b.dataset.gi); } });
  lb.addEventListener('click', e => { if (e.target.closest('.lp')) lbShow(lbI - 1); else if (e.target.closest('.ln')) lbShow(lbI + 1); else lbClose(); });

  // ---- map (top-down, from level zones / colliders / anchors; discovered places from the save) ----
  const cv = $('#mapCv'), mctx = cv.getContext('2d');
  const MV = { cx: 5, cz: 9, sc: 26, raf: 0, drag: null, fit: false };
  const POI = { spawnArcade: ['Cabinato', '🕹️'], dogBed: ['Cuccia', '🐩'], dogBowl: ['Ciotola', '🥣'], fountain: ['Fontana', '⛲'], patio: ['Patio', '☀️'], gardenCenter: null, loungeCenter: null, ballSpawn: ['Palla', '🎾'], doorway: null, gardenDoor: ['Porta del giardino', '🚪'] };
  const zoneCol = n => { let h = 0; for (const c of String(n)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return `hsl(${h % 360} 45% 28%)`; };
  function mapWorld() {
    const L = app && app.level; if (!L) return null;
    const zs = (L.zones || []).filter(z => z && z.rect && z.rect.length === 4);
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
    for (const z of zs) { x0 = Math.min(x0, z.rect[0]); z0 = Math.min(z0, z.rect[1]); x1 = Math.max(x1, z.rect[2]); z1 = Math.max(z1, z.rect[3]); }
    if (L.bounds) { x0 = Math.min(x0, L.bounds.x0); z0 = Math.min(z0, L.bounds.z0); x1 = Math.max(x1, L.bounds.x1); z1 = Math.max(z1, L.bounds.z1); }
    return { L, zs, x0, z0, x1, z1 };
  }
  function mapFit(center) {
    const w = mapWorld(); if (!w) return;
    const W = cv.clientWidth || 800, H = cv.clientHeight || 500;
    const fit = Math.min(W / (w.x1 - w.x0 + 4), H / (w.z1 - w.z0 + 4));
    const m = app && app.man && app.man.root;
    // the whole map fits: show it all; a big neighbourhood: start zoomed in around the player
    if (!center && fit >= 8) { MV.sc = fit; MV.cx = (w.x0 + w.x1) / 2; MV.cz = (w.z0 + w.z1) / 2; }
    else { MV.sc = Math.max(fit, center ? 22 : 14); if (m) { MV.cx = m.position.x; MV.cz = m.position.z; } else { MV.cx = (w.x0 + w.x1) / 2; MV.cz = (w.z0 + w.z1) / 2; } }
  }
  function mapDraw() {
    MV.raf = requestAnimationFrame(mapDraw);
    const dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    if (!MV.fit) { MV.fit = true; mapFit(false); }
    const c = mctx; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    const w = mapWorld();
    const bg = c.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#0d1b2a'); bg.addColorStop(1, '#1b0f2e'); c.fillStyle = bg; c.fillRect(0, 0, W, H);
    const X = x => W / 2 + (x - MV.cx) * MV.sc, Y = z => H / 2 + (z - MV.cz) * MV.sc;
    // grid (1 m, every 5 m stronger)
    c.lineWidth = 1;
    const gx0 = Math.floor(MV.cx - W / 2 / MV.sc), gx1 = Math.ceil(MV.cx + W / 2 / MV.sc), gz0 = Math.floor(MV.cz - H / 2 / MV.sc), gz1 = Math.ceil(MV.cz + H / 2 / MV.sc);
    if (MV.sc > 9) for (let x = gx0; x <= gx1; x++) { c.strokeStyle = x % 5 ? 'rgba(255,255,255,.035)' : 'rgba(255,255,255,.08)'; c.beginPath(); c.moveTo(X(x), 0); c.lineTo(X(x), H); c.stroke(); }
    if (MV.sc > 9) for (let z = gz0; z <= gz1; z++) { c.strokeStyle = z % 5 ? 'rgba(255,255,255,.035)' : 'rgba(255,255,255,.08)'; c.beginPath(); c.moveTo(0, Y(z)); c.lineTo(W, Y(z)); c.stroke(); }
    if (!w) { c.fillStyle = '#aaa'; c.font = '600 14px system-ui'; c.fillText('La mappa si apre quando entri in gioco.', 24, 34); return; }
    const places = (window.__save && window.__save.places()) || {};
    const known = n => !!places[n] || (app && app.S && app.S.zone === n);
    // zones
    const labels = new Map();
    for (const z of w.zs) {
      const [a, b, d, e] = z.rect, k = known(z.name);
      c.fillStyle = k ? zoneCol(z.name) : 'rgba(255,255,255,.04)'; c.fillRect(X(a), Y(b), (d - a) * MV.sc, (e - b) * MV.sc);
      c.strokeStyle = k ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.1)'; c.lineWidth = 1.5; c.strokeRect(X(a), Y(b), (d - a) * MV.sc, (e - b) * MV.sc);
      const area = (d - a) * (e - b), cur = labels.get(z.name); if (!cur || cur.area < area) labels.set(z.name, { area, x: (a + d) / 2, z: (b + e) / 2, k });
    }
    // furniture / walls
    c.fillStyle = 'rgba(255,255,255,.13)'; c.strokeStyle = 'rgba(255,255,255,.2)'; c.lineWidth = 1;
    for (const o of (w.L.colliders || [])) {
      if (o.type === 'box' && o.min && o.max) c.fillRect(X(o.min[0]), Y(o.min[1]), (o.max[0] - o.min[0]) * MV.sc, (o.max[1] - o.min[1]) * MV.sc);
      else if (o.c && o.r) { c.beginPath(); c.arc(X(o.c[0]), Y(o.c[1]), Math.max(1.5, o.r * MV.sc), 0, 7); c.fill(); }
    }
    // labels
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const [n, l] of labels) {
      c.font = `400 ${Math.max(13, Math.min(30, MV.sc * 0.9))}px ${getComputedStyle(document.documentElement).getPropertyValue('--gta') || 'Impact'}`;
      c.fillStyle = l.k ? 'rgba(255,255,255,.88)' : 'rgba(255,255,255,.3)'; c.fillText(l.k ? n.toUpperCase() : '???', X(l.x), Y(l.z));
    }
    // points of interest
    const an = w.L.anchors || {};
    c.font = '600 11px system-ui,sans-serif';
    for (const k in an) {
      const p = an[k]; if (!p || typeof p.x !== 'number') continue;
      const hm = /^house_(\w+)$/.exec(k);
      const meta = k in POI ? POI[k] : hm ? ['Casa ' + humanize(hm[1]), '🏠'] : k.includes('_') ? null : [humanize(k), '◆']; if (!meta) continue;
      const zn = w.L.zoneAt ? w.L.zoneAt(p.x, p.z) : null; if (zn && !known(zn)) continue;
      const x = X(p.x), y = Y(p.z);
      c.fillStyle = 'rgba(0,0,0,.55)'; c.beginPath(); c.arc(x, y, 10, 0, 7); c.fill();
      c.font = '13px system-ui,"Apple Color Emoji","Segoe UI Emoji",sans-serif'; c.fillStyle = '#fff'; c.fillText(meta[1], x, y + 1);
      if (MV.sc > 18) { c.font = '600 11px system-ui,sans-serif'; c.fillStyle = 'rgba(255,255,255,.75)'; c.fillText(meta[0], x, y + 19); }
    }
    // player
    const m = app && app.man && app.man.root;
    if (m) {
      const x = X(m.position.x), y = Y(m.position.z), yaw = m.rotation.y, t = performance.now() / 1000;
      c.fillStyle = 'rgba(255,90,140,.22)'; c.beginPath(); c.arc(x, y, 14 + Math.sin(t * 3) * 3, 0, 7); c.fill();
      c.save(); c.translate(x, y); c.rotate(-yaw + Math.PI);
      c.fillStyle = '#ff4f86'; c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -11); c.lineTo(8, 8); c.lineTo(0, 4); c.lineTo(-8, 8); c.closePath(); c.fill(); c.stroke(); c.restore();
    }
    // compass
    c.font = '700 12px system-ui'; c.fillStyle = 'rgba(255,255,255,.6)'; c.textAlign = 'right'; c.fillText(Math.round(MV.sc * 10) / 10 + ' px/m', W - 14, H - 14);
  }
  function renderPlaces() {
    const w = mapWorld(); const places = (window.__save && window.__save.places()) || {};
    const names = w ? [...new Set(w.zs.map(z => z.name))] : [];
    for (const n of Object.keys(places)) if (!names.includes(n)) names.push(n);
    $('#mapPlaces').innerHTML = names.map(n => { const k = !!places[n] || (app && app.S && app.S.zone === n); return `<li class="${k ? 'on' : ''}">${k ? esc(n) : '???'}${app && app.S && app.S.zone === n ? ' <small>· sei qui</small>' : ''}</li>`; }).join('') || '<li>Entra in gioco per esplorare.</li>';
  }
  cv.addEventListener('wheel', e => { e.preventDefault(); MV.sc = Math.max(4, Math.min(120, MV.sc * Math.pow(1.0015, -e.deltaY))); }, { passive: false });
  cv.addEventListener('pointerdown', e => { MV.drag = { x: e.clientX, y: e.clientY, cx: MV.cx, cz: MV.cz }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => { const d = MV.drag; if (!d) return; MV.cx = d.cx - (e.clientX - d.x) / MV.sc; MV.cz = d.cz - (e.clientY - d.y) / MV.sc; });
  const dragEnd = () => { MV.drag = null; }; cv.addEventListener('pointerup', dragEnd); cv.addEventListener('pointercancel', dragEnd);

  // ---- save import / export ----
  const svMsg = $('#svMsg');
  $('#svExp').addEventListener('click', () => {
    const S = window.__save; if (!S) return;
    const blob = new Blob([S.export()], { type: 'application/json' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'bigalesso-salvataggio-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    svMsg.textContent = 'File esportato.';
  });
  $('#svImp').addEventListener('click', () => $('#svFile').click());
  $('#svFile').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return;
    const r = new FileReader();
    r.onload = () => { const ok = window.__save && window.__save.import(String(r.result || '')); svMsg.textContent = ok ? 'Salvataggio importato. Ricarico…' : 'File non valido.'; if (ok) setTimeout(() => location.reload(), 900); };
    r.readAsText(f);
  });
  let resetArm = 0;
  $('#svReset').addEventListener('click', e => {
    const b = e.currentTarget;
    if (Date.now() - resetArm > 3500) { resetArm = Date.now(); b.textContent = 'Sicuro? Clicca ancora'; setTimeout(() => { b.textContent = 'Azzera'; }, 3500); return; }
    resetArm = 0; b.textContent = 'Azzera';
    try { window.__save && window.__save.reset(); localStorage.removeItem('bigalesso_secrets_v1'); } catch (x) { }
    svMsg.textContent = 'Progressi azzerati. Ricarico…'; setTimeout(() => location.reload(), 900);
  });

  const hub = {
    enter(p, prev) {
      if (prev === 'map' && p !== 'map') { cancelAnimationFrame(MV.raf); MV.raf = 0; }
      if (p !== 'gallery') lbClose();
      artRun(!!p && menu.open && (p === 'main' || !started));
      if (!p) return;
      if (p === 'main' || p === 'pause') renderSide(p);
      if (p === 'achievements') renderAch();
      if (p === 'characters') renderChars();
      if (p === 'hero') { try { window.__rpg && window.__rpg.renderHero($('#heroBody')); } catch (e) { console.warn('hero', e); } } // rpg/ui.js
      if (p === 'gallery') renderGallery();
      if (p === 'map') { MV.fit = false; renderPlaces(); if (!MV.raf) MV.raf = requestAnimationFrame(mapDraw); }
    },
    desc(b) {
      const d = root.querySelector('.page.on .mdesc'); if (!d || !b || !b.dataset) return;
      if (b.dataset.desc) d.textContent = b.dataset.desc;
    },
    key(e) {
      const c = e.code;
      if (!lb.hidden) {
        if (c === 'Escape' || c === 'Enter' || c === 'Space') lbClose(); else if (c === 'ArrowLeft' || c === 'KeyA') lbShow(lbI - 1); else if (c === 'ArrowRight' || c === 'KeyD') lbShow(lbI + 1);
        return true;
      }
      const t = e.target; if (t && t.tagName === 'INPUT' && t.type === 'text') return false;
      if (el.menu.dataset.layout === 'hub' && (c === 'KeyQ' || c === 'KeyE' || c === 'PageUp' || c === 'PageDown')) {
        const i = TABS.indexOf(page), d = (c === 'KeyQ' || c === 'PageUp') ? -1 : 1;
        showPage(TABS[((i < 0 ? 0 : i) + d + TABS.length) % TABS.length]); sfx('tab'); return true;
      }
      if (page === 'map') {
        const st = 40 / MV.sc;
        if (c === 'ArrowLeft' || c === 'KeyA') MV.cx -= st; else if (c === 'ArrowRight' || c === 'KeyD') MV.cx += st;
        else if (c === 'ArrowUp' || c === 'KeyW') MV.cz -= st; else if (c === 'ArrowDown' || c === 'KeyS') MV.cz += st;
        else if (c === 'Equal' || c === 'NumpadAdd') MV.sc = Math.min(120, MV.sc * 1.2); else if (c === 'Minus' || c === 'NumpadSubtract') MV.sc = Math.max(4, MV.sc / 1.2);
        else if (c === 'KeyR') mapFit(true);
        else return false;
        return true;
      }
      return false;
    },
    replayIntro() {
      const o = app && app.opening; if (!o || !o.replay) return;
      o.replay();
    },
    quit() {
      try { if (window.bigalessoDesktop && window.bigalessoDesktop.quit) { window.bigalessoDesktop.quit(); return; } } catch (e) { }
      try { window.close(); } catch (e) { }
      setTimeout(() => { const d = root.querySelector('.page.on .mdesc'); if (d) d.textContent = 'Nel browser basta chiudere la scheda. La versione desktop si chiude da qui.'; }, 200);
    },
  };
  window.__save && window.__save.on('change', () => { if (menu.open && (page === 'main' || page === 'pause')) renderSide(page); if (menu.open && page === 'achievements') renderAch(); });

  let escShown = false;
  const api = {
    coarse, settings, loading, menu, lobby, chat, hud, typing, toast, prompt, setHint, bindTouch, secrets,
    get menuOpen() { return menu.open; },
    onMenu(cb) { menuCbs.push(cb); },
    onSetting(cb) { setCbs.push(cb); },
    setSetting,
    attachApp(a) { app = a || null; if (menu.open) hub.enter(page, page); },
    setMode(m) { document.body.dataset.mode = m || ''; },
    setCarry(v) { document.body.dataset.carry = v ? '1' : ''; },
    setCamLabel(t) { const s = el.cam.querySelector('span'); if (s) s.textContent = t; el.cam.title = 'Camera: ' + t + ' (C)'; },
    setMuted(m) { el.mute.innerHTML = m ? ICON.mute : ICON.sound; el.mute.setAttribute('aria-pressed', m ? 'true' : 'false'); },
    showTop(v) {
      if (!coarse) { if (v && !escShown) { escShown = true; el.esc.classList.add('vis'); setTimeout(() => el.esc.classList.remove('vis'), 6000); } return; }
      el.top.classList.toggle('show', !!v); },
    showSkip(v) { el.skip.hidden = !v; },
    setP2Hint(v) { el.p2.hidden = !v; },
    onSkip(cb) { el.skip.addEventListener('click', e => { e.currentTarget.blur(); cb(); }); },
    onCam(cb) { el.cam.addEventListener('click', e => { e.currentTarget.blur(); cb(); }); },
    onMute(cb) { el.mute.addEventListener('click', e => { e.currentTarget.blur(); cb(); }); },
    error(t) { el.err.textContent = t; el.err.hidden = false; },
    markStarted() { started = true; el.menu.classList.remove('solid'); },
    update(dt) {
      padNav();
      if (hintShown && settings.showHints && !coarse) { hintT += dt; el.hint.classList.toggle('off', hintT > 7); }
    },
    wakeHint() { hintT = 0; if (hintShown && settings.showHints && !coarse) el.hint.classList.remove('off'); },
    // legacy element refs used by explore.js / main.js
    typeHint: el.typeHint, kbd: el.kbd, tAlt: el.tAlt, p2: el.p2, err: el.err, toasts: el.toasts,
  };
  syncSettingsUI();
  return api;
}
