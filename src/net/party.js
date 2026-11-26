// net/party.js — "Gioca insieme": the Party. A group of friends (from the room / quartiere player list, an invite code or
// a link ?party=<code>) whose leader picks a minigame; everyone in the party joins the same server-refereed match.
// Rules: shared/party.mjs (a never-ending drop-in match on the server, its id is the party code). Games register here
// with registerPartyGame(type, def) (quiz.js, sport/index.js, gulag/index.js, processo.js, sfida in minigames/…):
//   def = { name, icon, desc, min, max, choices?: [{ id, label, opts }], opts?, busy?() -> 'why not now' | null,
//           attach(session, { host, party, choice }) }   attach(): bind the (lobby) session to the game's own UI,
//           teleport to the game's spot if needed; the party overlay shows the lobby until the first view arrives.
//           detach?(session): the lobby was left before the start (undo the teleport / UI). bots?: n for "contro i bot".
// UI: O (or phone → Party) opens the overlay: create / join with a code, invite players of your room or shard, copy the
// invite link, members (👑 leader), the leader's game menu, the lobby (Invio = inizia, Esc = chiudi). Invites and
// launches arrive as a card in the corner (O to answer) and as a phone notification.
// API: window.__party = { open(), close(), create(), join(code), leave(), invite(netId), launch(type, choiceId), accept(),
//   decline(), state(), renderApp(el), games(), link() }
import { createOverlay, esc } from '../minigames/shared.js';

const DEFS = {}; // type -> def (see header)
const LS_LAST = 'bigalesso_party_last';
export function registerPartyGame(type, def) { DEFS[type] = { type, min: 1, max: 4, ...def }; if (P.ov && P.ov.isOpen) render(); }
// "Sfida a punti" (shared/sfida.mjs) hosts several small games: each registers its kind, the first view says which one
const SFIDA = {};
export function registerSfida(kind, def) {
  SFIDA[kind] = def;
  registerPartyGame('sfida', { name: 'Sfida a punti', icon: '🏁', desc: 'testa a testa: ' + Object.values(SFIDA).map(d => d.name).join(' o '), min: 1, max: 6,
    choices: Object.entries(SFIDA).map(([k, d]) => ({ id: k, label: d.icon + ' ' + d.label, opts: { kind: k } })),
    busy: () => { for (const d of Object.values(SFIDA)) { const w = d.busy && d.busy(); if (w) return w; } return null; },
    attach: (s, o) => { let done = false; s.on('view', v => { if (done || !v) return; done = true; const d = SFIDA[v.kind]; if (d) d.attach(s, o); else { toast('Sfida non disponibile in questa versione', 'warn'); s.leave(); } }); } });
}

const P = { lastErr: null, s: null, v: null, id: null, launchSeen: 0, pending: null, invites: [], game: null, ov: null, phoneEl: null, invited: new Map(), followed: false, busy: false, hookT: 0 };
const W = () => window.__app && window.__app.world;
const net = () => window.__net;
const toast = (m, k) => { try { const w = W(); if (w && w.toast) w.toast(m, k); else console.log('[party]', m); } catch (e) { } };
const sfx = n => { try { const a = window.__app && window.__app.audio; a && a.ctx && a.sfx && a.sfx(n); } catch (e) { } };
const phoneNote = t => { try { window.__phone && window.__phone.notify && window.__phone.notify(t, 'sys'); } catch (e) { } };
const me = () => P.v && P.v.me;
const isLeader = () => !!(P.v && P.v.leader === P.v.me);
const pidOfNet = id => 'p' + id;

// ---------------------------------------------------------------- connection
async function socket() {
  const n = net(); if (!n || !n.socket) throw new Error('rete non pronta');
  if (!(await n.socket())) throw new Error('server non raggiungibile: il party funziona solo dal server online');
  for (let i = 0; i < 20 && !(n.games && n.games.length); i++) await new Promise(r => setTimeout(r, 100));
  if (n.games && n.games.length && !n.games.includes('party')) throw new Error('questo server non ha ancora i party: aggiornalo');
  window.__match && window.__match.hook && window.__match.hook();
  return n;
}
function bindParty(s) {
  if (P.s && P.s !== s) try { P.s.leave(); } catch (e) { }
  P.s = s; P.id = s.id; P.v = null; P.launchSeen = 0; P.pending = null; P.followed = false;
  try { localStorage.setItem(LS_LAST, s.id); } catch (e) { }
  s.on('view', onView); s.on('event', onEvent);
  s.on('error', e => { if (!e) return; if (e.fatal) { toast('Party perso: connessione caduta', 'warn'); gone(); } else if (e.error) toast(e.error, 'warn'); });
  reportWhere();
  render();
}
function gone() { P.s = null; P.v = null; P.id = null; P.pending = null; render(); pill(); }
function reportWhere() { const n = net(); if (P.s && n) P.s.act({ where: { room: n.online ? n.code : '', world: !!n.world } }); }

async function create() {
  if (P.s) return true;
  if (P.busy) return false; P.busy = true; render();
  try { const n = await socket(); bindParty(await window.__match.start('party', { online: true, link: true, fill: false, room: true })); toast('Party creato: invita gli amici (codice ' + P.id + ')', 'online'); void n; return true; }
  catch (e) { P.lastErr = String(e.message || e); toast('Party non disponibile: ' + P.lastErr, 'warn'); return false; }
  finally { P.busy = false; render(); }
}
async function join(code) {
  code = String(code || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (code.length < 4) { toast('Il codice del party ha 6 caratteri', 'warn'); return false; }
  if (P.s && P.id === code) return true;
  if (P.busy) return false; P.busy = true; render();
  try { await socket(); const s = await window.__match.join(code); if (s.type && s.type !== 'party') { s.leave(); throw new Error('quel codice non è un party'); } bindParty(s); P.invites = P.invites.filter(i => i.id !== code); toast('Sei nel party ' + code, 'online'); sfx('join2'); return true; }
  catch (e) { toast('Non riesco a entrare nel party: ' + (e.message || e), 'warn'); return false; }
  finally { P.busy = false; render(); }
}
function leave() { if (!P.s) return; leaveGameLobby(); try { P.s.leave(); } catch (e) { } toast('Sei uscito dal party'); gone(); }
function invite(netId) {
  if (!P.s) return false;
  const ok = window.__match.invite(P.id, +netId);
  if (ok) { P.invited.set(+netId, performance.now()); toast('Invito mandato', 'online'); render(); }
  return ok;
}
function link() {
  if (!P.id) return null; const n = net();
  return location.origin + location.pathname + '?party=' + P.id + (n && n.online && !n.world && n.code ? '&room=' + n.code : '');
}

// ---------------------------------------------------------------- views / events
function onView(v) {
  const first = !P.v; P.v = v;
  if (v.kicked) { toast('Il capo party ti ha tolto dal party', 'warn'); try { P.s.leave(); } catch (e) { } gone(); return; }
  if (first) followLeader();
  const L = v.launch;
  if (L && L.seq !== P.launchSeen) {
    P.launchSeen = L.seq;
    if (L.by !== v.me && !(P.game && P.game.s && P.game.s.id === L.match)) {
      P.pending = L;
      const by = (v.members.find(m => m.id === L.by) || {}).name || 'Il capo';
      card(`<b>${esc(by)}</b> lancia <b>${esc(L.icon + ' ' + L.name)}</b>`, 'O per entrare');
      phoneNote(`🎉 ${by} vi chiama a giocare: ${L.name}. Premi O per entrare`);
      sfx('join2');
    }
  } else if (!L) { P.pending = null; if (P.game && !P.game.started && !P.game.host) leaveGameLobby(); } // the leader called it off
  render(); pill();
}
function onEvent(e) {
  if (!e || !P.v) return;
  const mine = e.id === P.v.me;
  if (e.k === 'join' && !mine) { toast(`🎉 ${e.name} è entrato nel party`, 'online'); sfx('join2'); }
  else if (e.k === 'leave' && !mine) toast(`${e.name} è uscito dal party`);
  else if (e.k === 'leader') toast(mine ? '👑 Ora sei tu il capo party' : `👑 ${e.name} è il nuovo capo party`, 'online');
  else if (e.k === 'call' && e.by !== P.v.me) { card(`<b>${esc(e.name)}</b> vi chiama!`, 'O per aprire il party'); phoneNote(`📣 ${e.name} vi chiama nel party`); sfx('join2'); }
  else if (e.k === 'answer' && !mine && isLeader()) { const m = P.v.members.find(x => x.id === e.id); if (m) toast(e.yes ? `${m.name} arriva` : `${m.name} passa questo giro`); }
}
// joining someone's party: follow the leader into their private room so we see each other (presence)
function followLeader() {
  if (P.followed || !P.v) return; P.followed = true;
  const n = net(), L = P.v.members.find(m => m.id === P.v.leader);
  if (!n || !L || L.id === P.v.me || !L.room || L.world) return;
  if (n.online && n.code === L.room) return;
  if (/^[A-Z]{4}$/.test(L.room)) { toast('Entro nella stanza ' + L.room + ' del capo party', 'online'); try { n.join(L.room, n.name); } catch (e) { } }
}
function onInvite(inv) {
  if (!inv || !inv.id) return;
  if (P.id === inv.id) return;
  P.invites = P.invites.filter(i => i.id !== inv.id); P.invites.unshift({ ...inv, at: Date.now() }); P.invites.length = Math.min(P.invites.length, 5);
  card(`<b>${esc(inv.from || 'Un amico')}</b> ti invita ${inv.type === 'party' ? 'nel suo party' : 'a ' + esc(inv.name || inv.type)}`, 'O per rispondere');
  phoneNote(`🎉 ${inv.from || 'Un amico'} ti invita a giocare insieme. Premi O`);
  sfx('join2'); render();
}

// ---------------------------------------------------------------- launching a game
async function launch(type, choiceId) {
  const def = DEFS[type];
  if (!P.s || !P.v) { toast('Prima crea un party'); return false; }
  if (!isLeader()) { toast('Solo il capo party sceglie il gioco'); return false; }
  if (!def) { toast('Gioco non disponibile'); return false; }
  const why = def.busy && def.busy(); if (why) { toast(why, 'warn'); return false; }
  if (P.game) leaveGameLobby();
  const choice = (def.choices || []).find(c => c.id === choiceId) || (def.choices || [])[0] || null;
  P.busy = true; render();
  try {
    const opts = { ...(def.opts || {}), ...((choice && choice.opts) || {}) };
    const s = await window.__match.start(type, { online: true, wait: true, party: P.id, opts, fill: def.fill !== false });
    trackGame(type, s, true, choice);
    def.attach(s, { host: true, party: P.id, choice });
    P.s.act({ launch: { type, match: s.id, choice: choice ? choice.id : undefined } });
    return true;
  } catch (e) { toast('Non riesco a lanciare ' + def.name + ': ' + (e.message || e), 'warn'); return false; }
  finally { P.busy = false; render(); }
}
// the same rules run in the browser with bots (window.__match local session): no server needed
const BOT_FRIENDS = [['seghino', 'Seghino'], ['asche', 'Asche'], ['forla', 'Forla'], ['lombu', 'Lombu'], ['cesco', 'Cesco']];
async function vsBots(type, choiceId) {
  const def = DEFS[type]; if (!def) return false;
  const why = def.busy && def.busy(); if (why) { toast(why, 'warn'); return false; }
  const choice = (def.choices || []).find(c => c.id === choiceId) || (def.choices || [])[0] || null;
  const opts = { ...(def.opts || {}), ...((choice && choice.opts) || {}) };
  const n = Math.max(1, Math.min(def.bots || (opts.seats ? opts.seats - 1 : 3), 5));
  const players = BOT_FRIENDS.slice(0, n).map(([id, name]) => ({ id: 'bot_' + id, name, bot: true }));
  try { const s = await window.__match.start(type, { online: false, players, opts }); close(); def.attach(s, { host: true, offline: true, choice }); return true; }
  catch (e) { toast('Non riesco ad avviare ' + def.name + ': ' + (e.message || e), 'warn'); return false; }
}
async function accept() {
  const L = P.pending; if (!L) return false;
  const def = DEFS[L.type]; if (!def) { toast('Questo gioco non è in questa versione: aggiorna la pagina', 'warn'); return false; }
  const why = def.busy && def.busy(); if (why) { toast(why, 'warn'); return false; }
  P.pending = null; P.busy = true; render();
  try {
    if (P.game) leaveGameLobby();
    const s = await window.__match.join(L.match);
    trackGame(L.type, s, false, (def.choices || []).find(c => c.id === L.choice) || null);
    def.attach(s, { host: false, party: P.id, choice: L.choice });
    P.s && P.s.act({ answer: { seq: L.seq, yes: true } });
    hideCard();
    return true;
  } catch (e) { toast('Non riesco a entrare: ' + (e.message || e), 'warn'); return false; }
  finally { P.busy = false; render(); }
}
function decline() { const L = P.pending; if (!L) return; P.pending = null; P.s && P.s.act({ answer: { seq: L.seq, yes: false } }); hideCard(); render(); }
function trackGame(type, s, host, choice) {
  const G = { type, s, host, choice, players: [], started: false };
  P.game = G;
  s.on('players', l => { G.players = l || []; if (P.game === G) { render(); pill(); } });
  s.on('view', () => { if (!G.started) { G.started = true; if (P.game === G) { if (P.ov && P.ov.isOpen) P.ov.close(); render(); pill(); } } });
  s.on('over', () => { setTimeout(() => { if (P.game === G) { P.game = null; if (host && P.s && isLeader()) P.s.act({ done: true }); render(); pill(); } }, 1500); });
  s.on('error', e => { if (e && e.fatal && P.game === G) { P.game = null; render(); pill(); } });
  pill();
}
function leaveGameLobby() {
  const G = P.game; if (!G) return; P.game = null;
  if (G.s && G.s.lobby) { const d = DEFS[G.type]; try { d && d.detach && d.detach(G.s); } catch (e) { console.warn(e); } try { G.s.leave(); } catch (e) { } if (G.host && P.s && isLeader()) P.s.act({ done: true }); }
  render(); pill();
}

// ---------------------------------------------------------------- overlay
const CSS = `
#mg-party .pt{position:relative;margin:auto;width:min(860px,94vw);max-height:88vh;overflow:auto;background:linear-gradient(160deg,#160c26,#20102e);border:1px solid rgba(200,240,60,.25);border-radius:18px;padding:22px 26px;box-shadow:0 30px 90px rgba(0,0,0,.6)}
#mg-party h2{margin:0 0 4px;font:900 28px/1 Impact,"Arial Black",system-ui;color:#c8f03c;letter-spacing:.02em}#mg-party h2 span{color:#ff5ab0}
#mg-party h3{margin:16px 0 8px;font:800 13px system-ui;text-transform:uppercase;letter-spacing:.08em;color:#cbbfe6}
#mg-party .sub{color:#b9acd6;margin:0 0 10px}
#mg-party .row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
#mg-party .code{font:800 22px ui-monospace,Consolas,monospace;letter-spacing:.14em;color:#ffd83a;background:#0f0818;border:1px dashed #5a3a86;border-radius:10px;padding:6px 12px}
#mg-party input{min-height:40px;padding:0 12px;border-radius:9px;border:1px solid #5a3a86;background:#0f0818;color:#fff;font:16px system-ui;width:150px;text-transform:lowercase}
#mg-party .mem{display:flex;flex-wrap:wrap;gap:8px}
#mg-party .chip{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);font:600 13px system-ui}
#mg-party .chip.in{border-color:#4be08a}#mg-party .chip.no{opacity:.55}#mg-party .chip.call{border-color:#ffd83a}
#mg-party .chip button{all:unset;cursor:pointer;color:#ff8aa0;font-size:12px;margin-left:4px}
#mg-party .games{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
#mg-party .game{padding:12px 14px;border-radius:12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12)}
#mg-party .game b{display:block;font:800 16px system-ui}#mg-party .game small{display:block;color:#b9acd6;margin:3px 0 8px}
#mg-party .game .row button{padding:7px 10px}
#mg-party .lobby{padding:14px;border-radius:12px;background:#0f0818;border:1px solid #c8f03c55}
#mg-party .lobby b{color:#c8f03c}
#mg-party .inv{padding:10px 12px;border-radius:10px;background:rgba(255,216,58,.1);border:1px solid #ffd83a66;margin-bottom:8px}
#mg-party .muted{color:#9a8ab8;font-size:13px}
#ptCard{position:fixed;right:max(16px,env(safe-area-inset-right));top:84px;z-index:35;max-width:320px;padding:12px 14px;border-radius:14px;background:rgba(22,12,38,.94);border:2px solid #c8f03c;color:#efe8ff;font:14px/1.35 system-ui,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.5);transform:translateX(120%);transition:transform .3s;pointer-events:auto}
#ptCard.on{transform:none}#ptCard small{display:block;margin-top:6px;color:#c8f03c;font-weight:700}#ptCard small kbd{border:1px solid #c8f03c;border-radius:4px;padding:0 5px}
#ptPill{position:fixed;left:max(12px,env(safe-area-inset-left));top:50%;transform:translateY(-50%);z-index:20;display:none;padding:7px 11px;border-radius:12px;background:rgba(22,12,38,.85);border:1px solid #c8f03c88;color:#c8f03c;font:700 13px system-ui;cursor:pointer;writing-mode:horizontal-tb}
#ptPill.on{display:block}
.pt-phone{padding:10px 12px;font:14px/1.4 system-ui,sans-serif;color:#efe8ff}.pt-phone .chip{display:inline-block;margin:2px 4px 2px 0;padding:3px 8px;border-radius:999px;background:rgba(255,255,255,.08);font-size:12px}
.pt-phone button{min-height:38px;margin:4px 6px 4px 0;padding:0 12px;border-radius:9px;border:0;background:#c8f03c;color:#14081f;font:700 13px system-ui;cursor:pointer}.pt-phone button.alt{background:#2b1846;color:#efe8ff;border:1px solid #5a3a86}
.pt-phone input{min-height:36px;width:110px;padding:0 8px;border-radius:8px;border:1px solid #5a3a86;background:#0f0818;color:#fff}.pt-phone h4{margin:10px 0 4px;font:800 12px system-ui;text-transform:uppercase;color:#cbbfe6}`;
let cssDone = false;
function ensureCSS() { if (cssDone) return; cssDone = true; const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); }
function ensureOv() {
  if (P.ov) return P.ov; ensureCSS();
  P.ov = createOverlay('mg-party', '<div class="pt"></div>', {
    input: window.__app && window.__app.input,
    onKey: e => {
      if (e.code === 'KeyO') { e.preventDefault(); P.keepLobby = true; P.ov.close(); return; } // O: just hide (the lobby stays, pill on the left)
      if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        if (P.pending) accept();
        else if (P.game && P.game.host && P.game.s.lobby) P.game.s.begin();
        else if (!P.s) { const inv = P.invites[0]; if (inv) answerInvite(inv.id, true); else create(); }
      }
    },
    onClose: () => { const keep = P.keepLobby; P.keepLobby = false; if (!keep && P.game && !P.game.started && P.game.s && P.game.s.lobby) leaveGameLobby(); }, // Esc leaves the lobby
  });
  const box = P.ov.$('.pt');
  box.addEventListener('click', onClick);
  box.addEventListener('keydown', e => { if (e.target.tagName === 'INPUT' && e.key === 'Enter') { e.preventDefault(); join(e.target.value); } });
  return P.ov;
}
function open() {
  const w = W(); if (!w) return false;
  ensureOv(); P.ov.open(); hideCard(); render();
  if (!P.s && !P.invites.length) setTimeout(() => { const i = P.ov && P.ov.$('input'); if (i && P.ov.isOpen) i.focus(); }, 60);
  return true;
}
function close() { P.ov && P.ov.close(); }
function answerInvite(id, yes) {
  const inv = P.invites.find(i => i.id === id); P.invites = P.invites.filter(i => i.id !== id);
  if (yes && inv) { if (inv.type === 'party') join(inv.id); else window.__match.join(inv.id).then(s => { const d = DEFS[inv.type]; if (d) { trackGame(inv.type, s, false, null); d.attach(s, { host: false }); } else s.leave(); }).catch(e => toast(e.message || String(e), 'warn')); }
  render();
}
function onClick(e) {
  const b = e.target.closest('[data-a]'); if (!b) return;
  e.preventDefault(); const a = b.dataset.a, v = b.dataset.v;
  if (a === 'create') create();
  else if (a === 'join') { const i = b.closest('.row').querySelector('input'); join(i ? i.value : ''); }
  else if (a === 'inv-yes') answerInvite(v, true);
  else if (a === 'inv-no') answerInvite(v, false);
  else if (a === 'leave') leave();
  else if (a === 'copy') { const l = link(); (navigator.clipboard ? navigator.clipboard.writeText(l) : Promise.reject()).then(() => toast('Invito copiato: ' + l, 'online'), () => toast('Codice party: ' + P.id)); }
  else if (a === 'invite') invite(v);
  else if (a === 'kick') P.s && P.s.act({ kick: v });
  else if (a === 'lead') P.s && P.s.act({ lead: v });
  else if (a === 'call') P.s && P.s.act({ call: true });
  else if (a === 'launch') launch(v, b.dataset.c);
  else if (a === 'bots') vsBots(v, b.dataset.c);
  else if (a === 'accept') accept();
  else if (a === 'decline') decline();
  else if (a === 'begin') { if (P.game && P.game.s) P.game.s.begin(); }
  else if (a === 'cancel') leaveGameLobby();
  else if (a === 'close') { P.keepLobby = true; close(); }
  else if (a === 'phone-open') { try { window.__phone && window.__phone.close(); } catch (x) { } setTimeout(open, 60); }
}
// players of my room / shard that are not in the party yet
function candidates() {
  const n = net(); if (!n || !n.online) return [];
  const inParty = new Set((P.v ? P.v.members : []).map(m => m.id));
  return [...n.players.values()].filter(p => p.id !== n.id && !inParty.has(pidOfNet(p.id))).slice(0, 24);
}
function html(compact = false) {
  const n = net(), v = P.v, offline = P.lastErr;
  const invs = P.invites.map(i => `<div class="inv"><b>${esc(i.from || 'Un amico')}</b> ti invita ${i.type === 'party' ? 'nel suo party' : 'a ' + esc(i.name || i.type)} <div class="row"><button class="mg-b ok" data-a="inv-yes" data-v="${esc(i.id)}">Entra <kbd>Invio</kbd></button><button class="mg-b" data-a="inv-no" data-v="${esc(i.id)}">No grazie</button></div></div>`).join('');
  if (!P.s) {
    return `${compact ? '' : '<h2>GIOCA <span>INSIEME</span></h2>'}<p class="sub">Fai un party con gli amici: il capo sceglie il minigioco e tutti entrano nella stessa partita (arbitra il server, niente trucchi).</p>
      ${invs}
      <div class="row"><button class="mg-b ok" data-a="create" ${P.busy ? 'disabled' : ''}>🎉 Crea un party${P.invites.length ? '' : ' <kbd>Invio</kbd>'}</button></div>
      <h3>Hai un codice?</h3><div class="row"><input maxlength="12" placeholder="codice party" aria-label="Codice party" autocomplete="off"><button class="mg-b" data-a="join">Entra</button></div>
      ${offline ? `<p class="muted">${esc(offline)} — il party funziona dal server online (docker compose up, poi apri il gioco da lì).</p>` : ''}
      <h3>Intanto, contro i bot (offline, stesse regole)</h3><div class="games">${Object.values(DEFS).map(d => `<div class="game"><b>${esc(d.icon + ' ' + d.name)}</b><small>${esc(d.desc || '')}</small><div class="row">${(d.choices && d.choices.length ? d.choices : [{ id: '', label: 'Prova' }]).map(c => `<button class="mg-b" data-a="bots" data-v="${esc(d.type)}" data-c="${esc(c.id)}">${esc(c.label)}</button>`).join('')}</div></div>`).join('')}</div>`;
  }
  if (!v) return `${compact ? '' : '<h2>GIOCA <span>INSIEME</span></h2>'}<p class="sub">Entro nel party…</p>`;
  const lead = isLeader();
  const mem = v.members.map(m => {
    const L = m.id === v.leader, you = m.id === v.me, st = v.launch ? m.st : '';
    const where = m.room ? (m.world ? 'quartiere ' + m.room : 'stanza ' + m.room) : 'senza stanza';
    return `<span class="chip ${st}">${L ? '👑' : '🙂'} ${esc(m.name)}${you ? ' <em>(tu)</em>' : ''} <span class="muted">${esc(where)}${st === 'in' ? ' · ✔' : st === 'no' ? ' · no' : st === 'call' ? ' · …' : ''}</span>${lead && !you && !compact ? `<button data-a="lead" data-v="${esc(m.id)}" title="Passa la corona">👑</button><button data-a="kick" data-v="${esc(m.id)}" title="Togli dal party">✕</button>` : ''}</span>`;
  }).join('');
  const cand = candidates().map(p => { const t = P.invited.get(p.id); const sent = t && performance.now() - t < 15000; return `<span class="chip">${esc(p.name)} <button data-a="invite" data-v="${p.id}" ${sent ? 'disabled' : ''}>${sent ? 'invitato' : '+ invita'}</button></span>`; }).join('');
  const G = P.game;
  let lobby = '';
  if (G && G.s && (G.s.lobby || !G.started)) {
    const def = DEFS[G.type] || { name: G.type, icon: '🎮' }, ps = G.players.length ? G.players : (G.s.players ? G.s.players() : []);
    lobby = `<div class="lobby"><b>${esc(def.icon + ' ' + def.name)}${G.choice ? ' · ' + esc(G.choice.label) : ''}</b> — in attesa: ${ps.map(p => esc(p.name || p.id) + (p.bot ? ' 🤖' : '')).join(', ') || '…'} (${ps.filter(p => !p.bot).length}/${def.max})
      <div class="row" style="margin-top:8px">${G.host ? `<button class="mg-b ok" data-a="begin">Inizia <kbd>Invio</kbd></button>` : '<span class="muted">Aspetta che il capo inizi…</span>'}<button class="mg-b" data-a="cancel">${G.host ? 'Annulla' : 'Esci dalla lobby'}</button></div>
      <p class="muted">${G.host ? 'Chi non arriva viene sostituito da un bot (se il gioco li prevede).' : ''}</p></div>`;
  } else if (P.pending) {
    const L = P.pending, by = (v.members.find(m => m.id === L.by) || {}).name || 'Il capo';
    lobby = `<div class="lobby"><b>${esc(by)}</b> ha lanciato <b>${esc(L.icon + ' ' + L.name)}</b>. Entri?<div class="row" style="margin-top:8px"><button class="mg-b ok" data-a="accept">Entra <kbd>Invio</kbd></button><button class="mg-b" data-a="decline">Questa volta no</button></div></div>`;
  } else if (v.launch && G && G.started) lobby = `<div class="lobby">In partita: <b>${esc(v.launch.icon + ' ' + v.launch.name)}</b></div>`;
  else if (v.launch && !lead) lobby = `<div class="lobby">Il party gioca a <b>${esc(v.launch.icon + ' ' + v.launch.name)}</b>${P.launchSeen === v.launch.seq ? ` <button class="mg-b" data-a="accept" ${P.pending ? '' : 'hidden'}>Entra</button>` : ''}</div>`;
  const games = Object.values(DEFS).map(d => {
    const ch = d.choices && d.choices.length ? d.choices : [{ id: '', label: 'Lancia' }];
    return `<div class="game"><b>${esc(d.icon + ' ' + d.name)}</b><small>${esc(d.desc || '')} · ${d.min === d.max ? d.min : d.min + '–' + d.max} giocatori</small><div class="row">${ch.map(c => `<button class="mg-b" data-a="launch" data-v="${esc(d.type)}" data-c="${esc(c.id)}" ${!lead || P.busy ? 'disabled' : ''}>${esc(c.label)}</button>`).join('')}</div></div>`;
  }).join('');
  return `${compact ? '' : '<h2>GIOCA <span>INSIEME</span></h2>'}
    <div class="row"><span class="code" title="Codice del party">${esc(P.id)}</span><button class="mg-b" data-a="copy">Copia invito</button>${lead ? '<button class="mg-b" data-a="call">📣 Chiama tutti</button>' : ''}<button class="mg-b no" data-a="leave">Esci dal party</button></div>
    ${invs}
    <h3>Nel party (${v.members.length})</h3><div class="mem">${mem}</div>
    ${lobby ? '<h3>Partita</h3>' + lobby : ''}
    ${compact ? '' : `<h3>Invita ${n && n.online ? (n.world ? 'dal quartiere' : 'dalla stanza ' + esc(n.code)) : ''}</h3><div class="mem">${cand || `<span class="muted">${n && n.online ? 'Nessun altro qui: manda il codice o il link agli amici.' : 'Non sei in una stanza: manda il codice o il link (Copia invito).'}</span>`}</div>`}
    <h3>${lead ? 'Scegli il gioco' : 'Giochi (sceglie il capo 👑)'}</h3><div class="games">${games}</div>`;
}
function render() {
  gameGone();
  if (P.ov && P.ov.isOpen) { const b = P.ov.$('.pt'), f = document.activeElement; const keep = f && f.tagName === 'INPUT' && b.contains(f) ? f.value : null; b.innerHTML = html(false) + `<p class="muted" style="margin-top:14px">${P.game && !P.game.started ? '<kbd>Esc</kbd> esci dalla lobby · <kbd>O</kbd> nascondi (resti in lobby)' : '<kbd>O</kbd> o <kbd>Esc</kbd> chiudi'}</p>`; if (keep !== null) { const i = b.querySelector('input'); if (i) { i.value = keep; i.focus(); } } }
  if (P.phoneEl && P.phoneEl.isConnected) renderApp(P.phoneEl);
}
// phone → Party (compact; the full overlay has the invite list)
function renderApp(el) {
  if (!el) return; ensureCSS(); P.phoneEl = el;
  el.classList.add('pt-phone');
  const body = html(true).replace(/class="mg-b ok"/g, 'class=""').replace(/class="mg-b no"/g, 'class="alt"').replace(/class="mg-b"/g, 'class="alt"');
  el.innerHTML = body + '<button data-a="phone-open">Apri il party (O)</button>';
  if (!el._pt) { el._pt = true; el.addEventListener('click', onClick); el.addEventListener('keydown', e => { e.stopPropagation(); if (e.target.tagName === 'INPUT' && e.key === 'Enter') { e.preventDefault(); join(e.target.value); } }); }
}

// ---------------------------------------------------------------- corner card + pill
let cardEl = null, cardT = 0, pillEl = null;
function card(text, hint) {
  ensureCSS();
  if (!cardEl) { cardEl = document.createElement('div'); cardEl.id = 'ptCard'; cardEl.setAttribute('role', 'status'); document.body.appendChild(cardEl); cardEl.addEventListener('click', () => open()); }
  cardEl.innerHTML = `🎉 ${text}<small><kbd>O</kbd> ${esc(hint.replace(/^O\s*/, ''))}</small>`;
  cardEl.classList.add('on'); clearTimeout(cardT); cardT = setTimeout(hideCard, 15000);
}
function hideCard() { if (cardEl) cardEl.classList.remove('on'); }
// the game session was left from the game's own UI (Esc, out of the cage…): back to the menu
function gameGone() {
  const G = P.game; if (!G || !G.s || !G.s.online) return false;
  const m = window.__match; if (!m || !m.sessions || m.sessions().includes(G.s)) return false;
  P.game = null; if (G.host && P.s && isLeader() && P.v && P.v.launch) P.s.act({ done: true });
  return true;
}
function pill() {
  ensureCSS(); gameGone();
  if (!pillEl) { pillEl = document.createElement('button'); pillEl.id = 'ptPill'; pillEl.type = 'button'; document.body.appendChild(pillEl); pillEl.addEventListener('click', () => { pillEl.blur(); open(); }); }
  const G = P.game, inLobby = G && G.s && G.s.lobby;
  pillEl.classList.toggle('on', !!P.s && !(G && G.started));
  pillEl.textContent = P.s ? `🎉 Party ${P.v ? P.v.members.length : ''}${inLobby ? ' · lobby ' + ((DEFS[G.type] || {}).icon || '') : P.pending ? ' · ti chiamano!' : ''} · O` : '';
}

// ---------------------------------------------------------------- keys, invites, ?party= links
addEventListener('keydown', e => {
  if (e.code !== 'KeyO' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
  const app = window.__app, w = app && app.world;
  if (!app || !w || app.S.phase !== 'world') return;
  if (P.ov && P.ov.isOpen) return; // the overlay's own capture closes it
  if (document.body.dataset.overlay || !['explore', 'goto', 'pet'].includes(w.mode)) return;
  e.preventDefault(); e.stopPropagation(); open();
}, true);
function hookNet() {
  const n = net(), m = window.__match;
  if (!n || !m || !m.onInvite) { P.hookT = setTimeout(hookNet, 500); return; }
  m.onInvite(onInvite);
  n.on('status', () => { if (P.s) setTimeout(reportWhere, 300); render(); });
  n.on('players', () => render());
  const q = new URLSearchParams(location.search), code = (q.get('party') || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (code.length >= 4) {
    const go = () => { const app = window.__app; if (!app || app.S.phase !== 'world') return setTimeout(go, 800); setTimeout(() => join(code), q.get('room') ? 1800 : 300); };
    go();
  }
}
setTimeout(hookNet, 0);
setInterval(() => { if (P.s && P.game) pill(); }, 2000);

const api = { open, close, create, join, leave, invite, launch, accept, decline, link, renderApp, vsBots, register: registerPartyGame, registerSfida,
  state: () => ({ id: P.id, view: P.v, leader: isLeader(), pending: P.pending, invites: P.invites.slice(), game: P.game ? { type: P.game.type, id: P.game.s.id, lobby: P.game.s.lobby, started: P.game.started, host: P.game.host } : null }),
  games: () => Object.keys(DEFS), get session() { return P.s; },
  begin: () => { if (P.game && P.game.host && P.game.s.lobby) { P.game.s.begin(); return true; } return false; },
  _attach: (type, s, o) => (DEFS[type] ? (DEFS[type].attach(s, o || {}), true) : false) }; // tests / dev: bind a (local) session to a game
window.__party = api;
export default api;
