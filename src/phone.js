// BIGALESSO · in-game phone (T, or P when the online chat uses T). Desktop overlay that slides up bottom-right.
// Apps: Gruppo (the group chat "Teletubbylandia certificata": filtered real quotes as history, live messages from the
// friends reacting to what happens in the game, the player can write and they answer — via window.__ai, offline
// fallback), Contatti (call a friend: the NPC walks to you), Foto (Corriere pages, mural, prints), Mappa (zones,
// friends, you), Claude (AI provider status + personal API key).
// window.__phone = { open(app?), close(), toggle(), isOpen(), push({from, text}), notify(text, from?), event(type, data) }
import { PERSONAS, QUOTES, LORE, persona, personaPrompt, loreBrief, offline, banter, topicOf, describeEvent, emitEvent, unlock } from './ai.js';
import { createBot, isForBot, BOT } from './groupbot.js';

const STORE = 'bigalesso_phone_v1';
const rnd = a => a[(Math.random() * a.length) | 0];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ACTIVITY = { asche: 3, ashish: 2.5, seghino: 2, ciccio: 2, lombu: 2, parme: 2, forla: 1.5, cesco: 1.5, ricky: 1, jacopo: 0.8, mirco: 0.8 };
const FRIENDS = PERSONAS.filter(p => p.id !== 'zuck');
const nameOf = id => id === 'me' ? 'Zuck' : id === 'bot' ? BOT.name : (persona(id) || {}).name || id;
const colorOf = id => id === 'bot' ? BOT.color : (persona(id) || {}).color || '#c8f03c';
const emojiOf = id => id === 'bot' ? BOT.emoji : (persona(id) || {}).emoji || '🙂';
const styleText = (id, t) => { const p = persona(id); return p && p.style && p.style.lowercase ? t.toLowerCase() : t; };
function weightedPick(n, exclude = []) {
  const pool = FRIENDS.filter(p => !exclude.includes(p.id)).map(p => ({ id: p.id, w: ACTIVITY[p.id] || 1 }));
  const out = [];
  while (out.length < n && pool.length) {
    let s = pool.reduce((a, b) => a + b.w, 0) * Math.random(), i = 0;
    for (; i < pool.length; i++) { s -= pool[i].w; if (s <= 0) break; }
    out.push(pool.splice(Math.min(i, pool.length - 1), 1)[0].id);
  }
  return out;
}
const mentionRe = p => new RegExp('(^|[^\\wÀ-ú])@?(' + [p.name, p.nick, ...(p.aka || [])].map(s => s.split(' ')[0].replace(/[^\wÀ-úÉé]/g, '')).filter(s => s.length > 2).join('|') + ')(?![\\wÀ-ú])', 'i');
const THEME = { millennium: 'asche', sushi: 'ashish', discord: 'forla', checkpoint: 'seghino', edicola: 'ciccio', petroni: 'lombu', celtic: 'cesco', teletubby: 'jacopo', gulag: 'ciccio', giardino: 'parme', salotto: 'ricky', 'sala giochi': 'lombu' };

export function installPhone({ ui, audio, level, S, getFX, man, npcs }) {
  const bot = createBot();
  const st = load();
  let isOpen = false, app = 'home', typingWho = null, lastReact = 0, chatterT = 160 + Math.random() * 120, lastZone = null, nightWas = false, contactId = null, mapT = 0;
  const seenZones = new Set();

  // ---------------------------------------------------------------- DOM
  injectCSS();
  const root = document.createElement('div'); root.id = 'phone'; root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `
  <div class="ph-frame"><div class="ph-notch"></div>
    <div class="ph-status"><span class="ph-clock">--:--</span><span class="ph-ico">5G ▮▮▮▯ <b class="ph-bat">87%</b></span></div>
    <div class="ph-screen">
      <section data-app="home">
        <div class="ph-hero"><div class="ph-big"></div><div class="ph-date"></div></div>
        <div class="ph-grid">
          <button data-go="chat"><i style="--b:#25d366">💬</i><span>Gruppo</span><em class="ph-badge" hidden></em></button>
          <button data-go="contacts"><i style="--b:#5ab4ff">👥</i><span>Contatti</span></button>
          <button data-go="photos"><i style="--b:#ffb03a">🖼️</i><span>Foto</span></button>
          <button data-go="map"><i style="--b:#4be08a">🗺️</i><span>Mappa</span></button>
          <button data-go="ai"><i style="--b:#d97757">✳️</i><span>Claude</span></button>
          <button data-go="bot"><i style="--b:#9aa7b8">🤖</i><span>Il Bot</span></button>
          <button data-go="games"><i style="--b:#e0457b">🎮</i><span>Giochi</span></button>
          <button data-go="quests"><i style="--b:#2fb8c9">📜</i><span>Missioni</span></button>
          <button data-go="cards"><i style="--b:#c0392b">🃏</i><span>Carte</span></button>
          <button data-go="rpjobs"><i style="--b:#28c2a0">💼</i><span>Lavori</span></button>
          <button data-go="rpdocs"><i style="--b:#5a7fd8">🪪</i><span>Documenti</span></button>
          <button data-go="rpcasa"><i style="--b:#c88a4a">🛋️</i><span>Casa</span></button>
          <button data-go="motor"><i style="--b:#e8452c">🏁</i><span>Motori</span></button>
        </div>
        <div class="ph-dock">T / Esc per chiudere</div>
      </section>
      <section data-app="chat">
        <header><button class="ph-back" data-go="home">‹</button><div class="ph-gav">🌈</div><div class="ph-gt"><b>${esc(LORE.group.name)}</b><small>${FRIENDS.length + 1} partecipanti · Il Bot</small></div></header>
        <div class="ph-msgs"></div>
        <div class="ph-typing" hidden></div>
        <form class="ph-compose"><input type="text" maxlength="200" placeholder="Scrivi nel gruppo… (@nome, @bot, /aiuto)" autocomplete="off"><button type="submit">➤</button></form>
      </section>
      <section data-app="contacts">
        <header><button class="ph-back" data-go="home">‹</button><div class="ph-gt"><b>Contatti</b><small>${esc(LORE.notice || '')}</small></div></header>
        <div class="ph-list"></div>
      </section>
      <section data-app="contact">
        <header><button class="ph-back" data-go="contacts">‹</button><div class="ph-gt"><b>Profilo</b></div></header>
        <div class="ph-profile"></div>
      </section>
      <section data-app="calling"><div class="ph-call"></div></section>
      <section data-app="photos">
        <header><button class="ph-back" data-go="home">‹</button><div class="ph-gt"><b>Foto</b><small>Corriere delle Due Torri e dintorni</small></div></header>
        <div class="ph-photos"></div><div class="ph-light" hidden><img alt=""><small></small></div>
      </section>
      <section data-app="map">
        <header><button class="ph-back" data-go="home">‹</button><div class="ph-gt"><b>Mappa</b><small>tu · amici · posti</small></div></header>
        <canvas class="ph-map" width="360" height="560"></canvas>
      </section>
      <section data-app="games">
        <header><button class="ph-back" data-go="home">‹</button><div class="ph-gt"><b>Giochi</b><small>minigiochi del gruppo</small></div></header>
        <div class="ph-list ph-games">
          <button data-mg="chi"><b>❓ Chi l'ha detto?</b><small>indovina chi l'ha scritto nel gruppo</small></button>
          <button data-mg="discord"><b>🎧 Compettina Discord</b><small>duello di mira al meglio delle 5</small></button>
          <button data-mg="sushi"><b>🍣 Sushi all you can eat</b><small>60 secondi al nastro contro gli amici</small></button>
          <button data-mg="processo"><b>⚖️ Processo AI</b><small>difenditi davanti al giudice</small></button>
          <button data-mg="corriere"><b>📰 Corriere AI</b><small>edizione speciale sulla tua partita</small></button>
          <button data-mg="br"><b>🚌 Ultimo in piedi</b><small>battle royale nel quartiere (anche online)</small></button>
          <button data-mg="gulag"><b>⛓️ Gulag profondo</b><small>roguelike: stanze a caso, il Secondino in fondo</small></button>
          <button data-rts="1"><b>🗺️ Assedio al quartiere</b><small>RTS: comanda gli amici contro le orde · anche online</small></button>
        </div>
      </section>
      <section data-app="cards">
        <header><button class="ph-back" data-go="home">‹</button><div class="ph-gt"><b>Carte</b><small>briscola, scopa, figurine degli amici</small></div></header>
        <div class="ph-list ph-games ph-cards"></div>
      </section>
      <section data-app="quests">
        <header><button class="ph-back" data-go="home">‹</button><div class="ph-gt"><b>Missioni</b><small>favori per gli amici · J</small></div></header>
        <div class="ph-list ph-quests"></div>
      </section>
      <section data-app="rpjobs">
        <header><button class="ph-back" data-go="home">‹</button><div class="ph-gt"><b>Lavori</b><small>turni, paga e mance</small></div></header>
        <div class="rp-app"></div>
      </section>
      <section data-app="rpdocs">
        <header><button class="ph-back" data-go="home">‹</button><div class="ph-gt"><b>Documenti</b><small>carta d'identità · fedina</small></div></header>
        <div class="rp-app"></div>
      </section>
      <section data-app="rpcasa">
        <header><button class="ph-back" data-go="home">‹</button><div class="ph-gt"><b>Casa</b><small>arredamento</small></div></header>
        <div class="rp-app"></div>
      </section>
      <section data-app="motor">
        <header><button class="ph-back" data-go="home">‹</button><div class="ph-gt"><b>Motori</b><small>gare, officina, la tua 500</small></div></header>
        <div class="mt-app"></div>
      </section>
      <section data-app="ai">
        <header><button class="ph-back" data-go="home">‹</button><div class="ph-gt"><b>Claude</b><small>chi scrive le battute</small></div></header>
        <div class="ph-ai"></div>
      </section>
    </div>
    <div class="ph-bar" data-go="home"></div>
  </div>`;
  document.body.appendChild(root);
  const notes = document.createElement('div'); notes.id = 'phNotes'; document.body.appendChild(notes);
  const pill = document.createElement('button'); pill.id = 'phPill'; pill.hidden = true; pill.title = 'Telefono (T)'; document.body.appendChild(pill);
  pill.onclick = () => open('chat');
  const $ = s => root.querySelector(s);
  const msgsEl = $('.ph-msgs'), typingEl = $('.ph-typing'), form = $('.ph-compose'), inp = form.querySelector('input');
  root.addEventListener('click', e => {
    const rt = e.target.closest('[data-rts]'); // Assedio (src/rts): close the phone, open the lobby
    if (rt) { e.preventDefault(); close(); setTimeout(() => { try { window.__rts && window.__rts.open(); } catch (err) { console.warn('rts', err); } }, 80); return; }
    const m = e.target.closest('[data-mg]');
    if (m) { // minigames (src/minigames/index.js): close the phone, then open the game
      e.preventDefault(); const id = m.dataset.mg; close();
      setTimeout(() => { let ok = false; try { ok = window.__minigames && window.__minigames.open(id); } catch (err) { console.warn('minigame', id, err); }
        if (ok === false) notify('Questo gioco si apre nel suo posto: guarda la Mappa.', 'sys'); }, 80);
      return;
    }
    const g = e.target.closest('[data-go]'); if (g) { e.preventDefault(); go(g.dataset.go); }
  });
  for (const el of [inp]) { el.addEventListener('keydown', e => { if (e.key !== 'Escape') e.stopPropagation(); }); el.addEventListener('keyup', e => e.stopPropagation()); }
  form.addEventListener('submit', e => { e.preventDefault(); const v = inp.value.trim(); inp.value = ''; if (v) send(v); });

  // ---------------------------------------------------------------- keys (capture: before the game's input)
  const onlineChatVisible = () => { const c = document.getElementById('chat'); return !!(c && !c.hidden); };
  const W = () => window.__app && window.__app.world;
  const canOpen = () => S && S.phase === 'world' && !(ui && ui.menuOpen) && W() && ['explore', 'goto', 'npcTalk', 'pet'].includes(W().mode) && !document.querySelector('#rdr.on');
  addEventListener('keydown', e => {
    const t = e.target, inPhone = root.contains(t);
    if (!inPhone && t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    if (isOpen && e.code === 'Escape') { e.stopPropagation(); e.preventDefault(); if (app === 'contact') go('contacts'); else if (app === 'photos' && !$('.ph-light').hidden) $('.ph-light').hidden = true; else close(); return; }
    if (e.repeat || (e.code !== 'KeyT' && e.code !== 'KeyP')) return;
    if (inPhone) return; // typing in the phone
    if (!isOpen && e.code === 'KeyT' && onlineChatVisible()) return; // T = online chat while connected (P opens the phone)
    if (!isOpen && !canOpen()) return;
    e.stopPropagation(); e.preventDefault();
    isOpen ? close() : open(st.unread ? 'chat' : 'home');
  }, true);

  // ---------------------------------------------------------------- open / close / navigate
  function open(a = 'home') {
    if (!isOpen) {
      if (!canOpen() && !(S && S.phase === 'world')) return;
      if (npcs && npcs.talking && npcs.talking()) npcs.closeTalk();
      isOpen = true; root.classList.add('on'); root.setAttribute('aria-hidden', 'false');
      document.body.dataset.overlay = 'phone';
      blip(880, 0.05);
    }
    go(a);
  }
  function close() {
    if (!isOpen) return;
    isOpen = false; root.classList.remove('on'); root.setAttribute('aria-hidden', 'true'); inp.blur();
    if (document.body.dataset.overlay === 'phone') delete document.body.dataset.overlay;
    blip(660, 0.04);
  }
  function go(a) {
    if (a === 'bot') { a = 'chat'; setTimeout(() => { inp.value = '@bot '; inp.focus(); }, 30); }
    app = a;
    for (const s of root.querySelectorAll('section')) s.classList.toggle('cur', s.dataset.app === a);
    if (a === 'chat') { st.unread = 0; save(); renderChat(); setTimeout(() => { if (app === 'chat' && isOpen) inp.focus(); }, 60); }
    else inp.blur();
    if (a === 'contacts') renderContacts();
    if (a === 'photos') { renderPhotos(); unlock('phone_roll', { title: 'Rullino', desc: 'Guarda le foto sul telefono.', icon: '🖼️' }); }
    if (a === 'ai') renderAI();
    if (a === 'map') drawMap();
    if (a === 'cards') { try { const el = $('.ph-cards'); if (el && window.__cards) el.innerHTML = window.__cards.phoneHTML(); } catch (e) { console.warn('cards', e); } } // cards/: app Carte
    if (a === 'quests') { try { window.__rpg && window.__rpg.renderQuests($('.ph-quests')); } catch (e) { console.warn('quests', e); } } // rpg/ui.js
    if (a === 'motor') { try { window.__motor && window.__motor.renderApp(root.querySelector('section[data-app="motor"] .mt-app')); } catch (e) { console.warn('motor', e); } } // motor/index.js
    if (a === 'rpjobs' || a === 'rpdocs' || a === 'rpcasa') { try { window.__rp && window.__rp.renderApp(a, root.querySelector(`section[data-app="${a}"] .rp-app`)); } catch (e) { console.warn('rp', e); } } // rp/index.js
    updateBadges();
  }

  // ---------------------------------------------------------------- chat
  function push(m, { silent = false } = {}) {
    const msg = { from: m.from || 'sys', text: String(m.text || '').slice(0, 600), ts: Date.now() };
    if (!msg.text) return;
    st.msgs.push(msg); if (st.msgs.length > 160) st.msgs.splice(0, st.msgs.length - 160);
    const visible = isOpen && app === 'chat';
    if (!visible && msg.from !== 'me') { st.unread++; if (!silent) notify(msg.text, msg.from); }
    save();
    if (visible) appendMsg(msg, true);
    updateBadges();
  }
  let renderedDay = '';
  function dayLabel(ts) {
    const d = new Date(ts), now = new Date(); const dd = Math.round((new Date(now.toDateString()) - new Date(d.toDateString())) / 864e5);
    return dd === 0 ? 'Oggi' : dd === 1 ? 'Ieri' : d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  function msgHTML(m) {
    const time = new Date(m.ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    if (m.from === 'sys') return `<div class="ph-sys">${esc(m.text)}</div>`;
    const me = m.from === 'me';
    return `<div class="ph-m ${me ? 'me' : ''} ${m.from === 'bot' ? 'bot' : ''}">${me ? '' : `<span class="ph-av" style="--c:${colorOf(m.from)}">${emojiOf(m.from)}</span>`}<div class="ph-b">${me ? '' : `<b style="color:${colorOf(m.from)}">${esc(nameOf(m.from))}</b>`}<p>${esc(m.text).replace(/\n/g, '<br>')}</p><time>${time}</time></div></div>`;
  }
  function appendMsg(m, scroll) {
    const dl = dayLabel(m.ts);
    let h = '';
    if (dl !== renderedDay) { renderedDay = dl; h += `<div class="ph-day">${esc(dl)}</div>`; }
    msgsEl.insertAdjacentHTML('beforeend', h + msgHTML(m));
    if (scroll) msgsEl.scrollTop = msgsEl.scrollHeight;
  }
  function renderChat() {
    renderedDay = ''; msgsEl.innerHTML = '';
    for (const m of st.msgs.slice(-90)) appendMsg(m, false);
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }
  function showTyping(id) { typingWho = id; typingEl.hidden = !id; if (id) typingEl.textContent = `${nameOf(id)} sta scrivendo…`; }
  // deliver a list of {from,text,delay?} with typing indicators
  function deliver(list, startDelay = 600) {
    let t = startDelay;
    for (const it of list) {
      const typ = Math.min(2600, 700 + it.text.length * 28) + (it.delay || 0);
      setTimeout(() => showTyping(it.from), t);
      t += typ;
      setTimeout(() => { showTyping(null); push({ from: it.from, text: styleText(it.from, it.text) }); blipIn(); }, t);
      t += 250;
    }
  }
  let busy = false;
  async function send(text) {
    push({ from: 'me', text });
    unlock('phone_first', { title: 'Primo messaggio', desc: 'Scrivi nel gruppo Teletubbylandia (T).', icon: '📱' });
    if (busy) return;
    busy = true;
    try {
      if (isForBot(text)) { showTyping('bot'); const out = await bot.handle(text); showTyping(null); deliver(out, 200); return; }
      const mentioned = FRIENDS.filter(p => mentionRe(p).test(text)).slice(0, 2).map(p => p.id);
      const who = mentioned.length ? mentioned : weightedPick(Math.random() < 0.45 ? 2 : 1);
      showTyping(who[0]);
      const hist = st.msgs.slice(-14).map(m => `${nameOf(m.from)}: ${m.text}`).join('\n');
      const sys = `Simuli il gruppo WhatsApp "${LORE.group.name}". ${loreBrief()}\n\nPersonaggi che rispondono adesso:\n${who.map(id => personaPrompt(id)).join('\n\n')}\n\n` +
        `Zuck (il giocatore) è il padrone di casa e titolare di BIGALESSO GAMES. ${ctxLine()}`;
      const prompt = `Chat recente:\n${hist}\n\nScrivi le risposte di ${who.map(nameOf).join(' e ')} all'ultimo messaggio di Zuck. Messaggi da chat brevissimi (max 18 parole ciascuno), ognuno nel proprio stile; 1 o 2 messaggi a testa. ` +
        `Rispondi solo con un array JSON: [{"who":"id","text":"..."}] con who tra: ${who.join(', ')}.`;
      const r = window.__ai ? await window.__ai.askJSON({ system: sys, prompt, model: 'fast', maxTokens: 320, cache: false }, null) : null;
      let out = Array.isArray(r) ? r.filter(x => x && who.includes(x.who) && typeof x.text === 'string' && x.text.trim()).slice(0, 4).map(x => ({ from: x.who, text: x.text.trim().slice(0, 240) })) : [];
      if (!out.length) out = who.map(id => ({ from: id, text: offline(id, topicOf(text)) }));
      showTyping(null); deliver(out, 300);
    } finally { busy = false; }
  }
  function ctxLine() {
    const mp = man.root.position;
    const zone = (level && level.zoneAt && level.zoneAt(mp.x, mp.z)) || 'casa';
    const night = ((getFX && getFX() && getFX().nightAmount) || 0) > 0.5;
    return `Adesso Zuck è in "${zone}", è ${night ? 'sera' : 'giorno'}.`;
  }

  // ---------------------------------------------------------------- reactions to game events + ambient chatter
  addEventListener('bigalesso:event', e => { try { react(e.detail || {}); } catch (x) { } });
  // minigames (minigames/shared.js logEvent) -> the group comments the result
  addEventListener('bigalesso:minigame', e => {
    const d = e.detail || {}; const t = String(d.text || ''); if (!t || /iniziato/.test(t)) return;
    emitEvent('minigame', { name: d.kind, text: t, win: /vinto|primo|sopravvissuto|innocente/.test(t) ? true : /perso|preso|colpevole/.test(t) ? false : undefined });
  });
  const TPL = {
    achievement: (id, e) => (Math.random() < 0.6 && banter(id, 'achievement', { title: e.title || 'qualcosa' })) || rnd([`«${e.title || 'obiettivo'}» sbloccato?? sgravato`, `🚨 Zuck sblocca «${e.title || 'qualcosa'}». Prima pagina domani`, `${cap(rnd(persona(id).catchphrases))}, «${e.title || ''}» 👀`, 'Ragazzi è una hit', 'Pazzo sgravato']),
    minigame: (id, e) => (Math.random() < 0.6 && banter(id, e.win === false ? 'roast' : 'win')) || (e.win === false ? rnd(['ahahah rip', 'serve allenamento', 'grosso errore', 'rip gettone', 'Dai dai ancora non è finita', 'che figura di merda', 'ahahah coglione', 'ma vaffa, rifai']) : rnd(['GG', 'sgravato', 'ok ma rivincita', 'pazzo sgravato', `${e.name || 'quella'} è roba mia però`, 'godo', 'porca troia che mostro', 'culo, solo culo'])),
    score: (id, e) => rnd([`${e.score} punti? ${rnd(persona(id).catchphrases)}`, 'Se sei bravo ranki', 'ok ma il record è mio', 'tocca batterlo']),
    egg: () => rnd(['Ma come l\'hai trovato', 'Storia da prima pagina', 'Greve', 'ma dove siamo finiti...', 'Ragazzi è una hit']),
    zone: (id, e) => { const z = String(e.zone || '').toLowerCase();
      if (/celtic/.test(z)) return rnd(['Celtic? arrivo', 'un saltino al Celtic lo faccio anch\'io', 'tieni un posto']);
      if (/millennium/.test(z)) return rnd(['Millennium?? sabato sera vibes', 'aspettami all\'ingresso']);
      if (/sushi/.test(z)) return rnd(['sushi senza di me??', 'prendimi due uramaki', 'Ma ci facciamo un sushi sta sera?']);
      if (/gulag/.test(z)) return rnd(['FINO A TRE ANNI DI RECLUSIONE !!!!!', 'Quel latitante', 'il Gulag non perdona']);
      if (/discord/.test(z)) return rnd(['sono su discord', 'discord pt.2?', 'Daje discors']);
      if (/teletubby|colli|checkpoint/.test(z)) return rnd(['zona demilitarizzata, occhio', 'Teletubbylandia certificata', 'propaganda propagandaaaa']);
      if (/giardino/.test(z)) return rnd(['in giardino? bella', 'occhio al cane', 'tempo del gelato']);
      return (Math.random() < 0.5 && banter(id, 'place', { place: e.zone })) || rnd([`sei in ${e.zone}?`, 'dove sei che non ti trovo?', 'arrivo 10 min', 'ndo cazzo sei?']); },
    talk: (id, e) => rnd([`che vi siete detti tu e ${nameOf(e.who)}?`, `${nameOf(e.who)} parla troppo`, 'gossip?']),
    night: (id) => (Math.random() < 0.6 && banter(id, 'night')) || rnd(['zombata?', 'si esce stasera?', 'Qualcuno per una compettina?', 'Bellazzi?', 'chi dorme è un coglione']),
  };
  function reactor(e) {
    if (e.type === 'zone') { const z = String(e.zone || '').toLowerCase(); for (const k in THEME) if (z.includes(k)) return THEME[k]; }
    if (e.type === 'minigame') { const n = String(e.name || '').toLowerCase(); if (/zomb/.test(n)) return 'seghino'; if (/sushi/.test(n)) return rnd(['ashish', 'parme']); if (/discord|compe/.test(n)) return rnd(['forla', 'lombu']); if (/processo|corriere|detto/.test(n)) return rnd(['ciccio', 'mirco']); }
    if (e.type === 'achievement' && Math.random() < 0.4) return 'ciccio';
    if (e.type === 'night') return rnd(['seghino', 'cesco', 'asche']);
    if (e.type === 'talk') return weightedPick(1, [e.who])[0];
    return weightedPick(1)[0];
  }
  function react(e) {
    if (!e || !e.type || !S || S.phase !== 'world' || e.type === 'call' || e.type === 'text') return;
    const chance = { achievement: 0.6, minigame: 0.85, score: 0.6, egg: 0.6, zone: 0.4, talk: 0.12, night: 0.5 }[e.type] ?? 0.3;
    const now = performance.now();
    const important = e.type === 'achievement' || e.type === 'minigame';
    if (now - lastReact < (important ? 20000 : 45000)) return; // no spam when several achievements unlock together
    if (e.type === 'zone') { if (seenZones.has(e.zone)) return; seenZones.add(e.zone); }
    if (Math.random() > chance) return;
    lastReact = now;
    const who = reactor(e); if (!persona(who)) return;
    const fb = () => (TPL[e.type] || (() => offline(who, null)))(who, e);
    const A = window.__ai;
    const go2 = text => setTimeout(() => push({ from: who, text: styleText(who, text) }), 1200 + Math.random() * 2500);
    if (A && A.status() !== 'offline' && Math.random() < 0.6) {
      A.ask({ auto: true, persona: who, model: 'fast', maxTokens: 70, system: personaPrompt(who) + '\n\n' + loreBrief(),
        prompt: `Nel gruppo WhatsApp reagisci con UN solo messaggio brevissimo (max 14 parole), nel tuo stile, a questa cosa appena successa nel gioco: ${describeEvent(e)}. Solo il messaggio.`, fallback: fb }).then(go2);
    } else go2(fb());
    // a second friend sometimes piles on
    if (important && Math.random() < 0.35) { const w2 = weightedPick(1, [who])[0]; setTimeout(() => push({ from: w2, text: styleText(w2, rnd(['AHAHAHAH', 'palese', 'sgravato', 'godo', 'daje', 'GG', 'ma dai', 'che coglione', 'porca troia', 'sti cazzi', 'socmel'])) }), 5000 + Math.random() * 3000); }
  }
  function chatter() {
    const A = window.__ai, n = Math.random() < 0.5 ? 2 : 1;
    const who = weightedPick(n);
    const topic = rnd(['compe', 'sushi', 'serata', 'zombi', 'corriere', null]);
    const fbList = () => who.map((id, i) => ({ from: id, text: i === 0 ? offline(id, topic) : rnd([offline(id, topic), cap(rnd(persona(id).catchphrases))]) }));
    if (A && A.status() !== 'offline' && Math.random() < 0.35) {
      A.askJSON({ auto: true, model: 'fast', maxTokens: 220, system: `Simuli il gruppo WhatsApp "${LORE.group.name}". ${loreBrief()}\n\n${who.map(id => personaPrompt(id, { short: true })).join('\n\n')}`,
        prompt: `Scrivi ${who.length === 2 ? 'uno scambio di 2-3 messaggi tra ' + who.map(nameOf).join(' e ') : 'un messaggio di ' + nameOf(who[0])} che parte da solo nel gruppo${topic ? ', tema: ' + topic : ''}. Brevissimi. Solo JSON: [{"who":"id","text":"..."}] con who tra ${who.join(', ')}.` }, null)
        .then(r => { const out = Array.isArray(r) ? r.filter(x => x && who.includes(x.who) && typeof x.text === 'string').slice(0, 3).map(x => ({ from: x.who, text: x.text.slice(0, 200) })) : []; deliverQuiet(out.length ? out : fbList()); });
    } else deliverQuiet(fbList());
  }
  function deliverQuiet(list) { let t = 0; for (const it of list) { t += 1500 + Math.random() * 3500; setTimeout(() => push({ from: it.from, text: styleText(it.from, it.text) }), t); } }

  // ---------------------------------------------------------------- notifications
  function notify(text, from = 'bot') {
    if (isOpen && app === 'chat') return;
    const n = document.createElement('div'); n.className = 'ph-note';
    n.innerHTML = `<span class="ph-av" style="--c:${colorOf(from)}">${emojiOf(from)}</span><div><b style="color:${colorOf(from)}">${esc(nameOf(from))}</b> <small>· Gruppo</small><p></p></div><kbd>T</kbd>`;
    n.querySelector('p').textContent = text.length > 110 ? text.slice(0, 108) + '…' : text;
    n.onclick = () => open('chat');
    notes.appendChild(n); while (notes.children.length > 2) notes.firstChild.remove();
    requestAnimationFrame(() => n.classList.add('on'));
    setTimeout(() => { n.classList.remove('on'); setTimeout(() => n.remove(), 400); }, 5200);
    blipIn();
  }
  function updateBadges() {
    const b = $('.ph-badge'); b.hidden = !st.unread; b.textContent = st.unread > 99 ? '99+' : st.unread;
    pill.hidden = !st.unread || isOpen || !(S && S.phase === 'world'); pill.textContent = '📱 ' + st.unread;
  }
  function blip(f = 1320, v = 0.045) { try { if (audio && audio.ctx && audio.tone && !audio.muted) audio.tone('sine', f, f, 0.07, v, audio.room); } catch (e) { } }
  function blipIn() { blip(1320, 0.04); setTimeout(() => blip(1760, 0.035), 110); }

  // ---------------------------------------------------------------- contacts / calling
  function renderContacts() {
    const list = $('.ph-list');
    const here = npcs && npcs.active ? npcs.active() : [];
    list.innerHTML = [{ id: 'bot', name: BOT.name, emoji: BOT.emoji, color: BOT.color, tone: 'l\'assistente del gruppo, gentilissimo e un po\' tonto' }, ...FRIENDS].map(p =>
      `<button class="ph-row" data-c="${p.id}"><span class="ph-av" style="--c:${p.color}">${p.emoji || '🙂'}</span><span class="ph-rt"><b>${esc(p.name)}</b><small>${esc(String(p.tone || '').split(',')[0])}</small></span>${here.includes(p.id) ? '<em class="ph-here">qui</em>' : ''}</button>`).join('');
    list.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { if (b.dataset.c === 'bot') { go('bot'); return; } contactId = b.dataset.c; renderProfile(); go('contact'); });
  }
  function renderProfile() {
    const p = persona(contactId); if (!p) return;
    const el = $('.ph-profile');
    el.innerHTML = `<div class="ph-pav" style="--c:${p.color}">${p.emoji || '🙂'}</div><h3>${esc(p.name)}</h3><div class="ph-aka">${p.aka && p.aka.length ? 'detto ' + esc(p.aka.join(', ')) : '&nbsp;'}</div>
      <div class="ph-acts"><button data-a="call">📞<span>Chiama</span></button><button data-a="msg">💬<span>Scrivi</span></button></div>
      <p class="ph-bio">${esc(p.tone)}</p>
      <div class="ph-chips">${p.catchphrases.slice(0, 8).map(c => `<span>${esc(c)}</span>`).join('')}</div>
      <p class="ph-int"><b>Passioni</b> ${esc(p.interests.join(' · '))}</p><p class="ph-note2">${esc(p.label || 'versione da gioco')}</p>`;
    el.querySelector('[data-a="call"]').onclick = () => callFriend(p.id);
    el.querySelector('[data-a="msg"]').onclick = () => { go('chat'); inp.value = '@' + p.name.split(' ')[0] + ' '; inp.focus(); };
  }
  function callFriend(id) {
    const p = persona(id);
    const c = $('.ph-call');
    c.innerHTML = `<div class="ph-pav big" style="--c:${p.color}">${p.emoji}</div><h3>${esc(p.name)}</h3><p class="ph-ring">Chiamata in corso…</p><button class="ph-hang">✕</button>`;
    go('calling');
    let done = false;
    c.querySelector('.ph-hang').onclick = () => { done = true; go('contact'); };
    for (let i = 0; i < 2; i++) setTimeout(() => { if (!done) { blip(440, 0.05); setTimeout(() => blip(480, 0.05), 160); } }, 200 + i * 900);
    setTimeout(() => {
      if (done) return;
      const ok = npcs && npcs.call ? npcs.call(id) : false;
      c.querySelector('.ph-ring').textContent = ok ? styleText(id, rnd(['Arrivo!', 'Arrivo 5 min', 'Sto arrivando 🏃', 'Daje arrivo', 'Ok vengo lì'])) : 'Non risponde…';
      setTimeout(() => { if (!done) { if (ok) close(); else go('contact'); } }, 1400);
    }, 2000);
  }

  // ---------------------------------------------------------------- photos
  const PHOTOS = [
    ['news', 'mural.jpg', 'Murales · Cappelletti Man vs Tortellino Man'],
    ...Array.from({ length: 12 }, (_, i) => ['news', `page-${String(i + 1).padStart(2, '0')}.jpg`, `Corriere delle Due Torri N.313 · pag. ${i + 1}`]),
    ['news', 'print-tortellino.jpg', 'Stampa · Tortellino Man'], ['news', 'print-over80.jpg', 'Stampa · Over 80'], ['news', 'print-ciclostile.jpg', 'Stampa · Ciclostile'], ['news', 'print-fakenews.jpg', 'Stampa · Fake news'],
  ];
  const srcOf = (dir, f) => (window.__ASSETS && window.__ASSETS[dir] && window.__ASSETS[dir][f]) || `${dir}/${f}`;
  let photosDone = false;
  function renderPhotos() {
    if (photosDone) return; photosDone = true;
    const g = $('.ph-photos'); const lb = $('.ph-light');
    g.innerHTML = PHOTOS.map(([d, f, cap_], i) => `<button data-i="${i}"><img loading="lazy" alt="" src="${esc(srcOf(d, f))}" onerror="this.parentNode.remove()"></button>`).join('');
    g.querySelectorAll('button').forEach(b => b.onclick = () => { const [d, f, cap_] = PHOTOS[+b.dataset.i]; lb.querySelector('img').src = srcOf(d, f); lb.querySelector('small').textContent = cap_; lb.hidden = false; });
    lb.onclick = () => { lb.hidden = true; };
  }

  // ---------------------------------------------------------------- map
  const cv = $('.ph-map'), cx = cv.getContext('2d');
  const ZC = { 'Sala giochi': '#6b3fa0', Salotto: '#8a5a3c', Giardino: '#2f7d3f' };
  function drawMap() {
    if (!level || !level.zones) return;
    const zs = level.zones.filter(z => z.rect);
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
    for (const z of zs) { const r = z.rect; x0 = Math.min(x0, r[0]); z0 = Math.min(z0, r[1]); x1 = Math.max(x1, r[2]); z1 = Math.max(z1, r[3]); }
    const Wd = cv.width, Hd = cv.height, pad = 18;
    const sc = Math.min((Wd - pad * 2) / (x1 - x0), (Hd - pad * 2) / (z1 - z0));
    const ox = (Wd - (x1 - x0) * sc) / 2, oz = (Hd - (z1 - z0) * sc) / 2;
    const P = (x, z) => [ox + (x - x0) * sc, oz + (z - z0) * sc];
    cx.fillStyle = '#0d0b14'; cx.fillRect(0, 0, Wd, Hd);
    cx.font = '600 11px system-ui,sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    const labeled = new Set();
    for (const z of zs) {
      const [a, b] = P(z.rect[0], z.rect[1]), [c, d] = P(z.rect[2], z.rect[3]);
      let h = 0; for (const ch of z.name) h = (h * 31 + ch.charCodeAt(0)) % 360;
      cx.fillStyle = ZC[z.name] || `hsl(${h},35%,28%)`; cx.globalAlpha = 0.85; cx.fillRect(a, b, c - a, d - b); cx.globalAlpha = 1;
      cx.strokeStyle = 'rgba(255,255,255,.18)'; cx.strokeRect(a + 0.5, b + 0.5, c - a - 1, d - b - 1);
      if (!labeled.has(z.name) && (c - a) > 40) { labeled.add(z.name); cx.fillStyle = 'rgba(255,255,255,.75)'; cx.fillText(z.name, (a + c) / 2, (b + d) / 2); }
    }
    // friends
    if (npcs && npcs.active) for (const id of npcs.active()) {
      const n = npcs.get(id); if (!n) continue; const [px, pz] = P(n.root.position.x, n.root.position.z);
      cx.fillStyle = colorOf(id); cx.beginPath(); cx.arc(px, pz, 5, 0, 7); cx.fill();
      cx.fillStyle = '#fff'; cx.font = '600 9px system-ui,sans-serif'; cx.fillText(nameOf(id).split(' ')[0], px, pz - 10);
    }
    // you
    const mp = man.root.position, [mx, mz] = P(mp.x, mp.z), yaw = (window.__app && window.__app.world && window.__app.world.yaw) || man.root.rotation.y;
    cx.save(); cx.translate(mx, mz); cx.rotate(-yaw + Math.PI);
    cx.fillStyle = '#c8f03c'; cx.beginPath(); cx.moveTo(0, -9); cx.lineTo(6, 7); cx.lineTo(0, 3); cx.lineTo(-6, 7); cx.closePath(); cx.fill(); cx.restore();
    cx.fillStyle = 'rgba(255,255,255,.5)'; cx.font = '10px system-ui,sans-serif'; cx.textAlign = 'left'; cx.fillText('▲ tu   ● amici', 10, Hd - 10);
  }

  // ---------------------------------------------------------------- Claude (provider + key)
  function renderAI() {
    const A = window.__ai, el = $('.ph-ai');
    const s = A ? A.status() : 'offline', info = A ? A.info() : {};
    const label = { artifact: 'Claude dentro claude.ai (nessuna chiave da inserire)', server: 'Claude tramite il server del gioco', byok: 'Claude con la tua chiave API', offline: 'Offline: battute vere del gruppo e frasi pronte' }[s];
    el.innerHTML = `<div class="ph-st ${s}"><b>${s === 'offline' ? '○' : '●'} ${esc(label)}</b><small>${info.calls || 0} richieste · ${info.fails || 0} errori${info.lastError ? ' · ultimo: ' + esc(info.lastError) : ''}</small></div>
      <label>Chiave API Anthropic personale</label>
      <input type="password" placeholder="${A && A.hasKey() ? '•••••••• salvata' : 'sk-ant-…'}" autocomplete="off">
      <div class="ph-btns"><button data-k="save">Salva</button><button data-k="test">Prova</button><button data-k="del">Rimuovi</button></div>
      <p class="ph-out"></p>
      <p class="ph-small">La chiave resta solo in questo browser (localStorage) e serve solo se il gioco non ha già Claude: dentro claude.ai funziona da solo, sul server Docker basta la variabile <code>ANTHROPIC_API_KEY</code>. Modelli: veloce Haiku, bravo Sonnet.</p>`;
    const kin = el.querySelector('input'), out = el.querySelector('.ph-out');
    kin.addEventListener('keydown', e => { if (e.key !== 'Escape') e.stopPropagation(); if (e.key === 'Enter') el.querySelector('[data-k="save"]').click(); });
    kin.addEventListener('keyup', e => e.stopPropagation());
    el.querySelector('[data-k="save"]').onclick = () => { if (!kin.value.trim()) return; A.setKey(kin.value.trim()); kin.value = ''; renderAI(); $('.ph-out').textContent = 'Chiave salvata in questo browser.'; };
    el.querySelector('[data-k="del"]').onclick = () => { A.clearKey(); renderAI(); $('.ph-out').textContent = 'Chiave rimossa.'; };
    el.querySelector('[data-k="test"]').onclick = async () => {
      out.textContent = '…';
      const t = await A.ask({ prompt: 'Saluta Zuck in bolognese in una frase sola.', model: 'fast', maxTokens: 60, cache: false, fallback: '\u0000' });
      out.textContent = t === '\u0000' ? 'Nessuna risposta: resto offline (controlla la chiave o la connessione).' : '«' + t + '» — ' + A.status();
    };
  }

  // ---------------------------------------------------------------- per frame
  function update(dt) {
    if (!S || S.phase !== 'world') { pill.hidden = true; return; }
    const sec = Math.floor(Date.now() / 1000);
    if (sec !== update._s) { update._s = sec; const d = new Date(); const hm = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }); $('.ph-clock').textContent = hm; $('.ph-big').textContent = hm; $('.ph-date').textContent = d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }); }
    // zone + night changes -> events
    const mp = man.root.position;
    const zone = (level && level.zoneAt && level.zoneAt(mp.x, mp.z)) || null;
    if (zone && zone !== lastZone) { if (lastZone !== null) emitEvent('zone', { zone }); lastZone = zone; }
    const night = ((getFX && getFX() && getFX().nightAmount) || 0) > 0.6;
    if (night !== nightWas) { nightWas = night; if (night) emitEvent('night', { on: true }); }
    // ambient chatter
    chatterT -= dt; if (chatterT <= 0) { chatterT = 170 + Math.random() * 170; chatter(); }
    if (isOpen && app === 'map' && (mapT -= dt) <= 0) { mapT = 0.25; drawMap(); }
    if (isOpen && W() && W().mode === 'cabinet') close();
    updateBadges();
  }

  // ---------------------------------------------------------------- persistence
  function load() {
    let d = null; try { d = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { }
    if (!d || !Array.isArray(d.msgs)) d = { msgs: seedHistory(), unread: 2 };
    d.msgs = d.msgs.filter(m => m && typeof m.text === 'string' && m.from);
    return d;
  }
  let saveT = 0;
  function save() { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(STORE, JSON.stringify({ msgs: st.msgs.slice(-160), unread: st.unread })); } catch (e) { } }, 400); }

  const api = {
    open, close, toggle: () => (isOpen ? close() : open()), isOpen: () => isOpen, update,
    push: m => push({ from: m.from && (persona(m.from) || m.from === 'bot' || m.from === 'sys') ? m.from : 'sys', text: m.text }),
    notify: (text, from = 'sys') => notify(String(text || ''), from),
    event: (type, data = {}) => emitEvent(type, data),
    send,
  };
  window.__phone = api;
  updateBadges();
  return api;
}

const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
// first launch: a plausible backlog made of the real (filtered) quotes
function seedHistory() {
  const pick = QUOTES.filter(q => q.who !== 'zuck').sort(() => Math.random() - 0.5).slice(0, 26);
  const now = Date.now(), out = [];
  const day = 864e5;
  out.push({ from: 'sys', text: `${(persona('seghino') || {}).name || 'Seghino'} ha cambiato il nome del gruppo in "${LORE.group.name}"`, ts: now - 3 * day - 3600e3 });
  pick.forEach((q, i) => {
    const dayOff = i < 9 ? 2 : i < 18 ? 1 : 0;
    const base = now - dayOff * day - (dayOff ? 0 : 2 * 3600e3);
    out.push({ from: q.who, text: q.text, ts: base - (9 - (i % 9)) * 7 * 60e3 });
  });
  out.push({ from: 'parme', text: '@bot domani si va al sushi vero?', ts: now - day + 20 * 60e3 });
  out.push({ from: 'bot', text: 'Domani si va al sushi! 🍣👍 Spero che tu sia emozionato! Quale tipo di sushi ti piace di più? Sashimi, maki o uramaki?', ts: now - day + 21 * 60e3 });
  out.push({ from: 'cesco', text: 'hai rotto con questo bot', ts: now - day + 22 * 60e3 });
  out.sort((a, b) => a.ts - b.ts);
  out.push({ from: 'asche', text: 'Discordino perché è il momento di una compe', ts: now - 40 * 60e3 });
  out.push({ from: 'ashish', text: 'Compettinaaa?', ts: now - 38 * 60e3 });
  return out;
}

function injectCSS() {
  const css = `
#phone{--h:min(80vh,760px);--w:calc(var(--h)*0.47);position:fixed;right:3.2vw;bottom:0;width:var(--w);height:var(--h);z-index:45;transform:translateY(105%);transition:transform .38s cubic-bezier(.2,.8,.2,1);
 font:calc(var(--h)/52) / 1.35 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#eee;pointer-events:none}
#phone.on{transform:translateY(-3.5vh);pointer-events:auto}
#phone .ph-frame{position:absolute;inset:0;border-radius:calc(var(--h)*0.07);background:#07060a;padding:calc(var(--h)*0.016);box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 0 2px #2a2733 inset,0 0 0 1px #000;overflow:hidden}
#phone .ph-notch{position:absolute;top:calc(var(--h)*0.022);left:50%;transform:translateX(-50%);width:28%;height:calc(var(--h)*0.03);background:#000;border-radius:99px;z-index:5}
#phone .ph-status{position:absolute;top:calc(var(--h)*0.02);left:9%;right:9%;display:flex;justify-content:space-between;font-weight:700;font-size:.9em;z-index:6;color:#fff;text-shadow:0 1px 2px #0008}
#phone .ph-screen{position:absolute;inset:calc(var(--h)*0.016);border-radius:calc(var(--h)*0.055);overflow:hidden;background:#111}
#phone section{position:absolute;inset:0;display:none;flex-direction:column;padding-top:calc(var(--h)*0.06);background:#0f0e14}
#phone section.cur{display:flex;animation:phIn .18s ease-out}
@keyframes phIn{from{opacity:0;transform:translateX(8px)}to{opacity:1;transform:none}}
#phone section[data-app=home]{background:radial-gradient(120% 70% at 20% 0%,#7b3fe4 0%,#2a1450 45%,#0b0714 100%);}
#phone .ph-hero{text-align:center;margin:8% 0 6%}
#phone .ph-big{font:200 calc(var(--h)/10)/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;letter-spacing:-.02em}
#phone .ph-date{opacity:.8;text-transform:capitalize}
#phone .ph-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7% 4%;padding:0 8%}
#phone .ph-grid button{position:relative;background:none;border:0;color:#fff;display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer;font:inherit;font-size:.92em}
#phone .ph-grid i{font-style:normal;width:calc(var(--w)*0.19);height:calc(var(--w)*0.19);border-radius:24%;display:grid;place-items:center;font-size:1.9em;background:linear-gradient(160deg,color-mix(in srgb,var(--b) 85%,#fff),var(--b));box-shadow:0 6px 14px #0006}
#phone .ph-grid button:hover i{filter:brightness(1.15)}
#phone .ph-badge{position:absolute;top:-4px;right:12%;min-width:1.5em;padding:0 .35em;border-radius:99px;background:#ff3b30;font:700 .85em/1.5em system-ui;font-style:normal}
#phone .ph-dock{margin-top:auto;margin-bottom:9%;text-align:center;opacity:.45;font-size:.85em}
#phone header{display:flex;align-items:center;gap:.6em;padding:.5em .8em;background:#1a1822;border-bottom:1px solid #ffffff12;flex:none}
#phone .ph-back{background:none;border:0;color:#7ec8ff;font:400 2em/1 system-ui;cursor:pointer;padding:0 .2em}
#phone .ph-gav{width:2.3em;height:2.3em;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#ff7ad9,#7cff6b,#5ab4ff)}
#phone .ph-gt{display:flex;flex-direction:column;min-width:0}
#phone .ph-gt b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:.98em}
#phone .ph-gt small{opacity:.55;font-size:.78em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#phone section[data-app=chat]{background:#0b141a url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Ccircle cx='4' cy='4' r='1' fill='%23ffffff0d'/%3E%3C/svg%3E")}
#phone .ph-msgs{flex:1;overflow-y:auto;padding:.6em .6em 0;scrollbar-width:thin}
#phone .ph-day{margin:.7em auto;width:max-content;padding:.15em .8em;border-radius:7px;background:#1d2a32;color:#b8c4cb;font-size:.78em;text-transform:capitalize}
#phone .ph-sys{margin:.5em auto;max-width:85%;text-align:center;padding:.3em .7em;border-radius:7px;background:#1d2a32cc;color:#c8d1d6;font-size:.78em}
#phone .ph-m{display:flex;gap:.35em;margin:.22em 0;align-items:flex-end}
#phone .ph-m.me{justify-content:flex-end}
#phone .ph-av{flex:none;width:1.9em;height:1.9em;border-radius:50%;display:grid;place-items:center;background:color-mix(in srgb,var(--c) 70%,#111);font-size:.95em}
#phone .ph-b{max-width:78%;background:#1f2c34;border-radius:9px;border-top-left-radius:3px;padding:.32em .6em .25em;box-shadow:0 1px 1px #0005}
#phone .ph-m.me .ph-b{background:#1d5d45;border-radius:9px;border-top-right-radius:3px}
#phone .ph-m.bot .ph-b{background:#262a33;border:1px solid #ffffff14}
#phone .ph-b b{display:block;font-size:.8em;margin-bottom:.05em}
#phone .ph-b p{margin:0;word-wrap:break-word;font-size:.95em}
#phone .ph-b time{display:block;text-align:right;font-size:.66em;opacity:.5;margin-top:.05em}
#phone .ph-typing{padding:.25em .9em;font-size:.8em;color:#7ee0a5;font-style:italic}
#phone .ph-compose{display:flex;gap:.4em;padding:.5em;background:#1a1822;flex:none}
#phone .ph-compose input{flex:1;min-width:0;border:0;border-radius:99px;padding:.65em 1em;background:#2a2733;color:#fff;font:inherit;outline:none}
#phone .ph-compose button{border:0;border-radius:50%;width:2.6em;height:2.6em;background:#25d366;color:#082;font-size:1em;cursor:pointer;color:#fff}
#phone .ph-list{overflow-y:auto;flex:1}
#phone .ph-games{display:flex;flex-direction:column;gap:8px;padding:10px}
#phone .ph-games button{display:flex;flex-direction:column;align-items:flex-start;gap:3px;padding:12px 14px;border:0;border-radius:14px;background:#ffffff12;color:#fff;font:inherit;text-align:left;cursor:pointer}
#phone .ph-games button:hover{background:#ffffff22}
#phone .ph-games small{opacity:.65;font-size:.82em}
#phone .ph-row{display:flex;width:100%;gap:.7em;align-items:center;padding:.55em .9em;border:0;border-bottom:1px solid #ffffff0d;background:none;color:inherit;text-align:left;cursor:pointer;font:inherit}
#phone .ph-row:hover{background:#ffffff0a}
#phone .ph-row .ph-av{width:2.4em;height:2.4em;font-size:1.15em}
#phone .ph-rt{display:flex;flex-direction:column;min-width:0;flex:1}
#phone .ph-rt small{opacity:.55;font-size:.8em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#phone .ph-here{font-style:normal;font-size:.72em;padding:.1em .5em;border-radius:99px;background:#25d36633;color:#7ee0a5}
#phone .ph-profile{overflow-y:auto;padding:1em 1.1em;text-align:center}
#phone .ph-pav{width:5em;height:5em;margin:.4em auto;border-radius:50%;display:grid;place-items:center;font-size:2.2em;background:radial-gradient(circle at 30% 25%,color-mix(in srgb,var(--c) 70%,#fff),var(--c));box-shadow:0 8px 24px color-mix(in srgb,var(--c) 40%,transparent)}
#phone .ph-pav.big{width:6.5em;height:6.5em;font-size:2.8em;margin-top:30%}
#phone .ph-profile h3,#phone .ph-call h3{margin:.3em 0 0;font-size:1.4em}
#phone .ph-aka{opacity:.55;font-size:.85em}
#phone .ph-acts{display:flex;justify-content:center;gap:1.2em;margin:1em 0}
#phone .ph-acts button{display:flex;flex-direction:column;align-items:center;gap:.2em;border:0;border-radius:14px;padding:.6em 1.1em;background:#ffffff12;color:#fff;font:inherit;font-size:1.1em;cursor:pointer}
#phone .ph-acts button span{font-size:.7em;opacity:.8}
#phone .ph-acts button:hover{background:#ffffff22}
#phone .ph-bio{font-size:.92em;opacity:.85;text-align:left}
#phone .ph-chips{display:flex;flex-wrap:wrap;gap:.35em;justify-content:center;margin:.6em 0}
#phone .ph-chips span{padding:.2em .6em;border-radius:99px;background:#ffffff12;font-size:.8em}
#phone .ph-int{text-align:left;font-size:.85em;opacity:.8}
#phone .ph-note2{opacity:.4;font-size:.72em;margin-top:1em}
#phone section[data-app=calling]{background:linear-gradient(#1c2a3a,#0b0f16)}
#phone .ph-call{text-align:center;display:flex;flex-direction:column;align-items:center;height:100%}
#phone .ph-ring{opacity:.8;animation:phPulse 1.2s infinite}
@keyframes phPulse{50%{opacity:.35}}
#phone .ph-hang{margin-top:auto;margin-bottom:18%;width:3.6em;height:3.6em;border-radius:50%;border:0;background:#ff3b30;color:#fff;font-size:1.3em;cursor:pointer}
#phone .ph-photos{flex:1;overflow-y:auto;display:grid;grid-template-columns:repeat(3,1fr);gap:2px;align-content:start}
#phone .ph-photos button{border:0;padding:0;aspect-ratio:1;background:#222;cursor:pointer;overflow:hidden}
#phone .ph-photos img{width:100%;height:100%;object-fit:cover;display:block}
#phone .ph-light{position:absolute;inset:0;background:#000e;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.6em;cursor:zoom-out;z-index:3}
#phone .ph-light[hidden],#phone [hidden]{display:none!important}
#phone .ph-light img{max-width:100%;max-height:85%;object-fit:contain}
#phone .ph-light small{opacity:.7;padding:0 1em;text-align:center}
#phone .ph-map{flex:1;width:100%;height:100%;object-fit:contain;background:#0d0b14}
#phone .ph-ai{padding:1em;overflow-y:auto;display:flex;flex-direction:column;gap:.55em}
#phone .ph-st{padding:.7em .8em;border-radius:10px;background:#ffffff0c;display:flex;flex-direction:column;gap:.2em}
#phone .ph-st.offline b{color:#ffb03a} #phone .ph-st:not(.offline) b{color:#7ee0a5}
#phone .ph-st small{opacity:.55;font-size:.78em}
#phone .ph-ai label{font-size:.85em;opacity:.7;margin-top:.4em}
#phone .ph-ai input{border:1px solid #ffffff22;border-radius:8px;padding:.6em .7em;background:#1a1822;color:#fff;font:inherit;outline:none}
#phone .ph-btns{display:flex;gap:.4em}
#phone .ph-btns button{flex:1;border:0;border-radius:8px;padding:.55em;background:#d97757;color:#fff;font:inherit;font-weight:600;cursor:pointer}
#phone .ph-btns button+button{background:#ffffff18}
#phone .ph-out{min-height:1.4em;font-size:.88em;color:#cfe}
#phone .ph-small{opacity:.5;font-size:.76em}
#phone .ph-bar{position:absolute;bottom:calc(var(--h)*0.012);left:50%;transform:translateX(-50%);width:34%;height:5px;border-radius:9px;background:#fff9;cursor:pointer;z-index:6}
#phNotes{position:fixed;right:3.2vw;bottom:4vh;z-index:44;display:flex;flex-direction:column;gap:8px;align-items:flex-end;pointer-events:none}
.ph-note{display:flex;gap:10px;align-items:center;width:min(340px,26vw);padding:10px 12px;border-radius:14px;background:rgba(22,20,30,.9);backdrop-filter:blur(10px);border:1px solid #ffffff1a;color:#eee;
 font:13px/1.3 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 10px 30px #0007;transform:translateX(30px);opacity:0;transition:all .3s;pointer-events:auto;cursor:pointer}
.ph-note.on{transform:none;opacity:1}
.ph-note .ph-av{flex:none;width:32px;height:32px;border-radius:50%;display:grid;place-items:center;background:color-mix(in srgb,var(--c) 70%,#111)}
.ph-note div{flex:1;min-width:0}.ph-note p{margin:2px 0 0;opacity:.9;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.ph-note small{opacity:.5}.ph-note kbd{font:700 11px ui-monospace,monospace;padding:2px 6px;border-radius:5px;background:#ffffff1f}
#phPill{position:fixed;right:3.2vw;bottom:2vh;z-index:43;border:0;border-radius:99px;padding:6px 12px;background:rgba(22,20,30,.82);color:#7ee0a5;font:700 13px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;cursor:pointer;box-shadow:0 6px 16px #0006}
body.coarse #phone,body.coarse #phPill{display:none}`;
  const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
}
