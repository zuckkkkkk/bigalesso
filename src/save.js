// Local save: achievements, stats, records, discovered places. localStorage 'bigalesso_save_v1'.
//
// window.__save = {
//   unlock(id, {title, desc, icon, cat}) -> true if new (unknown ids are created on the fly), isUnlocked(id),
//   define(id, meta) / define([{id,...}]) -> adds a locked achievement (shown as ??? until unlocked),
//   list() -> [{id,title,desc,icon,cat,hidden,unlocked,ts}], progress() -> {n, m, pct},
//   get(k), set(k, v)              free key/value store for other modules
//   stat(k, delta=1) -> value      counters (play time, games, ...)  · stats() -> {...}
//   record(k, value, {lower}) -> true if new best · records() -> {...}
//   visit(place) -> true if first time (map: discovered places) · places() -> {name: ts}
//   on('unlock'|'change', cb), export() -> JSON string (every bigalesso_* key), import(json) -> bool (reload to apply)
// }
// main.js: createSave({ui}) right after createUI(); save.attach({...}) once the world exists; save.gameEvent(cab, ev, data).

const KEY = 'bigalesso_save_v1';

// icon: one emoji (rendered big on the toast and in the Obiettivi grid)
export const ACHIEVEMENTS = [
  // sala giochi
  { id: 'first_coin', cat: 'Sala giochi', icon: '🪙', title: 'Primo gettone', desc: 'Inizia una partita al cabinato BIGALESSO.' },
  { id: 'stage_clear', cat: 'Sala giochi', icon: '🏁', title: 'Stage completato', desc: 'Finisci uno stage senza farti fermare.' },
  { id: 'boss_down', cat: 'Sala giochi', icon: '💥', title: 'Il boss è caduto', desc: 'Abbatti un boss al cabinato.' },
  { id: 'game_ending', cat: 'Sala giochi', icon: '👑', title: 'Ave, Bigalesso', desc: 'Arriva al finale del gioco.', hidden: true },
  { id: 'coop', cat: 'Sala giochi', icon: '🕹️', title: 'In due si spara meglio', desc: 'Fai entrare il giocatore 2.' },
  { id: 'combo4', cat: 'Sala giochi', icon: '🔥', title: 'Combo x4', desc: 'Concatena quattro abbattimenti.' },
  { id: 'score_50k', cat: 'Sala giochi', icon: '📈', title: '50.000 punti', desc: 'Supera 50.000 punti in una partita.' },
  { id: 'director_round', cat: 'Sala giochi', icon: '🥊', title: 'Il direttore incassa', desc: 'Vinci un round al cabinato del direttore.' },
  { id: 'director_kiss', cat: 'Sala giochi', icon: '💋', title: 'Bacio volante', desc: 'Rispondi ai pugni con un bacio.' },
  { id: 'director_ko', cat: 'Sala giochi', icon: '😵', title: 'Al tappeto', desc: 'Finisci K.O. contro il direttore.' },
  // casa
  { id: 'dog_pet', cat: 'Casa', icon: '🐩', title: 'Bravo cane', desc: 'Accarezza il barboncino.' },
  { id: 'dog_best', cat: 'Casa', icon: '❤️', title: 'Migliore amico', desc: 'Porta al massimo l\'affetto del cane.' },
  { id: 'dog_paw', cat: 'Casa', icon: '🐾', title: 'Dammi la zampa', desc: 'Insegna un trucco al cane.' },
  { id: 'dog_ball', cat: 'Casa', icon: '🎾', title: 'Riporto', desc: 'Lancia la palla al cane.' },
  { id: 'typewriter', cat: 'Casa', icon: '⌨️', title: 'Dattilografo', desc: 'Siediti alla macchina da scrivere.' },
  { id: 'shell', cat: 'Casa', icon: '🐚', title: 'Il mare in una conchiglia', desc: 'Ascolta la conchiglia sul tavolino.' },
  { id: 'extinguisher', cat: 'Casa', icon: '🧯', title: 'Pompiere', desc: 'Prendi l\'estintore dal supporto.' },
  { id: 'lights', cat: 'Casa', icon: '💡', title: 'Modalità sala giochi', desc: 'Usa l\'interruttore sul muro.' },
  { id: 'dance', cat: 'Casa', icon: '🕺', title: 'Balla con me', desc: 'Fatti un ballo (tasto 3).' },
  // esplora
  { id: 'zone_lounge', cat: 'Esplora', icon: '🛋️', title: 'Sul divano', desc: 'Entra in salotto.' },
  { id: 'zone_garden', cat: 'Esplora', icon: '🌳', title: 'Aria aperta', desc: 'Esci in giardino.' },
  { id: 'mural', cat: 'Esplora', icon: '🎨', title: 'Cappelletti vs Tortellino', desc: 'Guarda il murales in giardino.' },
  { id: 'newspaper', cat: 'Esplora', icon: '📰', title: 'Lettore del Corriere', desc: 'Leggi il Corriere delle Due Torri.' },
  { id: 'gulag', cat: 'Esplora', icon: '⛓️', title: 'Sotto la casa', desc: 'Scopri cosa c\'è sotto la casa.', hidden: true },
  { id: 'case_closed', cat: 'Esplora', icon: '🔎', title: 'Caso chiuso', desc: 'Risolvi il caso della collana.', hidden: true },
  // segreti
  { id: 'egg_first', cat: 'Segreti', icon: '🥚', title: 'Il primo segreto', desc: 'Trova un easter egg.' },
  { id: 'egg_10', cat: 'Segreti', icon: '🗝️', title: 'Cacciatore di segreti', desc: 'Trova dieci easter egg.' },
  { id: 'egg_all', cat: 'Segreti', icon: '🏆', title: 'Tutto agli atti', desc: 'Trova tutti gli easter egg.' },
  // altro
  { id: 'opening', cat: 'Altro', icon: '🎬', title: 'Prima visione', desc: 'Guarda l\'intro fino in fondo.' },
  { id: 'online', cat: 'Altro', icon: '🌐', title: 'In compagnia', desc: 'Entra in una stanza online.' },
  { id: 'hour', cat: 'Altro', icon: '⏱️', title: 'Habitué', desc: 'Gioca per un\'ora in totale.' },
];

const MODE_ACH = { pet: 'dog_pet', paw: 'dog_paw', throw: 'dog_ball', type: 'typewriter', shell: 'shell', grab: 'extinguisher', switch: 'lights', mural: 'mural', read: 'newspaper' };
const ZONE_ACH = { 'Salotto': 'zone_lounge', 'Giardino': 'zone_garden', 'Il Gulag': 'gulag' };
const EGG_ACH = { gulagin: 'gulag', casorisolto: 'case_closed' };

const CSS = `
#achToasts{position:fixed;z-index:60;right:28px;top:26px;display:grid;gap:10px;pointer-events:none;width:min(390px,calc(100vw - 40px))}
.achT{display:grid;grid-template-columns:62px 1fr;align-items:center;gap:14px;padding:12px 18px 12px 12px;color:#fff;
  background:linear-gradient(100deg,rgba(14,6,26,.92),rgba(30,10,46,.86));border-left:4px solid #ff8a3c;box-shadow:0 18px 40px rgba(0,0,0,.55);
  transform:translateX(120%);opacity:0;transition:transform .55s cubic-bezier(.2,1.2,.35,1),opacity .4s;font-family:var(--ui,system-ui)}
.achT.in{transform:none;opacity:1}.achT.out{transform:translateX(30px);opacity:0}
.achT .ic{width:62px;height:62px;display:grid;place-items:center;font-size:32px;line-height:1;background:linear-gradient(135deg,#ff3d7f,#ff9a3c 55%,#ffd25a);box-shadow:inset 0 0 0 2px rgba(255,255,255,.25)}
.achT .k{font:700 11px/1 var(--ui,system-ui);letter-spacing:.28em;text-transform:uppercase;color:#ffb36b}
.achT .t{font:400 25px/1.05 var(--gta,Impact,sans-serif);letter-spacing:.02em;margin:5px 0 3px;text-transform:uppercase}
.achT .d{font-size:13px;line-height:1.3;color:#cdbfe6}
body:has(#menu.show[data-layout="hub"]) #achToasts{top:15vh}
@media (prefers-reduced-motion:reduce){.achT{transition:none}}`;

const blank = () => ({ v: 1, ach: {}, defs: {}, stats: {}, rec: {}, kv: {}, places: {} });
const clampStr = (s, n) => String(s == null ? '' : s).slice(0, n);

export function createSave(opts = {}) {
  let ui = opts.ui || null, audio = null;
  let D = blank();
  try { const r = JSON.parse(localStorage.getItem(KEY) || 'null'); if (r && typeof r === 'object') D = { ...blank(), ...r }; } catch (e) { }
  for (const k of ['ach', 'defs', 'stats', 'rec', 'kv', 'places']) if (!D[k] || typeof D[k] !== 'object') D[k] = {};
  const defs = new Map(ACHIEVEMENTS.map(a => [a.id, { ...a }]));
  for (const id in D.defs) if (!defs.has(id)) defs.set(id, { id, ...D.defs[id] });
  const cbs = { unlock: [], change: [] };
  const emit = (n, ...a) => { for (const f of cbs[n]) try { f(...a); } catch (e) { console.error(e); } };

  let wt = 0;
  const persist = (now) => {
    clearTimeout(wt);
    const w = () => { try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) { } };
    if (now) w(); else wt = setTimeout(w, 600);
  };
  addEventListener('pagehide', () => persist(true));
  addEventListener('beforeunload', () => persist(true));

  // ---------------- toast ----------------
  let box = null; const queue = []; let showing = false;
  function ensureDom() {
    if (box) return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    box = document.createElement('div'); box.id = 'achToasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box);
  }
  function chime() {
    const a = audio; if (!a || !a.ctx || a.muted) return;
    try { [784, 988, 1319].forEach((f, i) => a.tone('triangle', f, 0, 0.32, 0.07, a.room, i * 0.09)); a.tone('sine', 1568, 0, 0.6, 0.03, a.room, 0.27); } catch (e) { }
  }
  function next() {
    if (showing || !queue.length) return;
    ensureDom(); showing = true;
    const d = queue.shift();
    const el = document.createElement('div'); el.className = 'achT';
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    el.innerHTML = `<div class="ic">${esc(d.icon || '★')}</div><div><div class="k">${esc(d.kicker || 'Obiettivo sbloccato')}</div><div class="t">${esc(d.title)}</div><div class="d">${esc(d.desc || '')}</div></div>`;
    box.appendChild(el); chime();
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
    setTimeout(() => { el.classList.remove('in'); el.classList.add('out'); setTimeout(() => { el.remove(); showing = false; next(); }, 450); }, 3900);
  }
  const notify = d => { queue.push(d); next(); };

  // ---------------- api ----------------
  function define(id, meta) {
    if (Array.isArray(id)) { for (const x of id) x && define(x.id, x); return; }
    if (!id) return;
    id = clampStr(id, 48);
    const cur = defs.get(id);
    const m = { id, title: clampStr(meta && meta.title || cur && cur.title || id, 60), desc: clampStr(meta && meta.desc || cur && cur.desc || '', 140),
      icon: clampStr(meta && meta.icon || cur && cur.icon || '★', 8), cat: clampStr(meta && (meta.cat || meta.group) || cur && cur.cat || 'Extra', 24),
      hidden: meta && 'hidden' in meta ? !!meta.hidden : !!(cur && cur.hidden) };
    defs.set(id, m);
    if (!ACHIEVEMENTS.some(a => a.id === id)) { D.defs[id] = { title: m.title, desc: m.desc, icon: m.icon, cat: m.cat, hidden: m.hidden }; persist(); }
  }
  function unlock(id, meta) {
    if (!id) return false;
    id = clampStr(id, 48);
    if (!defs.has(id) || meta) define(id, meta || {});
    if (D.ach[id]) return false;
    D.ach[id] = Date.now(); persist();
    const d = defs.get(id);
    notify(d); emit('unlock', id, d); emit('change');
    return true;
  }
  const isUnlocked = id => !!D.ach[id];
  const list = () => [...defs.values()].map(d => ({ ...d, unlocked: !!D.ach[d.id], ts: D.ach[d.id] || 0 }));
  function progress() { const l = list(); const n = l.filter(x => x.unlocked).length; return { n, m: l.length, pct: l.length ? Math.round(n / l.length * 100) : 0 }; }
  const get = k => D.kv[k];
  const set = (k, v) => { D.kv[clampStr(k, 64)] = v; persist(); emit('change'); };
  function stat(k, delta = 1) { const v = (+D.stats[k] || 0) + (+delta || 0); D.stats[k] = v; persist(); return v; }
  function record(k, value, o = {}) {
    value = +value; if (!isFinite(value)) return false;
    const cur = D.rec[k];
    if (cur !== undefined && (o.lower ? value >= cur : value <= cur)) return false;
    D.rec[k] = value; persist(); emit('change'); return true;
  }
  function visit(place) { if (!place || D.places[place]) return false; D.places[place] = Date.now(); persist(); emit('change'); return true; }
  function exportAll() {
    persist(true);
    const data = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && /^(bigalesso|direttore)/.test(k)) data[k] = localStorage.getItem(k); }
    return JSON.stringify({ app: 'bigalesso', v: 1, at: new Date().toISOString(), data }, null, 1);
  }
  function importAll(json) {
    let o; try { o = typeof json === 'string' ? JSON.parse(json) : json; } catch (e) { return false; }
    if (!o || o.app !== 'bigalesso' || !o.data || typeof o.data !== 'object') return false;
    try {
      for (const k in o.data) if (/^(bigalesso|direttore)/.test(k) && typeof o.data[k] === 'string' && o.data[k].length < 2e6) localStorage.setItem(k, o.data[k]);
      const r = JSON.parse(o.data[KEY] || 'null'); if (r && typeof r === 'object') { D = { ...blank(), ...r }; for (const id in D.defs) if (!defs.has(id)) defs.set(id, { id, ...D.defs[id] }); }
    } catch (e) { return false; }
    clearTimeout(wt); emit('change'); return true;
  }

  // ---------------- game hooks ----------------
  let app = null, eggN = -1;
  function gameEvent(cab, ev, data) {
    try {
      if (cab === 'bigalesso') {
        if (ev === 'start') { unlock('first_coin'); stat('games'); }
        else if (ev === 'clear') unlock('stage_clear');
        else if (ev === 'bossdie') { unlock('boss_down'); stat('bosses'); }
        else if (ev === 'ending') unlock('game_ending');
        else if (ev === 'join2') unlock('coop');
        else if (ev === 'combo' && data >= 4) unlock('combo4');
        else if (ev === 'gameover' && app && app.game) { const s = app.game.score || 0; record('bigalesso_score', s); if (s >= 50000) unlock('score_50k'); }
      } else if (cab === 'direttore') {
        if (ev === 'start') stat('dirGames');
        else if (ev === 'roundwin') { unlock('director_round'); stat('dirRounds'); }
        else if (ev === 'kiss' || ev === 'counter') unlock('director_kiss');
        else if (ev === 'ko') unlock('director_ko');
      }
    } catch (e) { }
  }
  function poll(dt) {
    if (!app) return;
    const { S, world, dog, eggs, game } = app;
    try {
      const inWorld = S && S.phase === 'world';
      if (inWorld && !(ui && ui.menuOpen)) {
        D.stats.playTime = (+D.stats.playTime || 0) + dt;
        if (D.stats.playTime >= 3600) unlock('hour');
        const m = world && world.mode;
        if (m && MODE_ACH[m]) unlock(MODE_ACH[m]);
        if (world && world.carry) unlock('extinguisher');
        if (world && world.dancing) unlock('dance');
        if (dog && typeof dog.affection === 'number' && dog.affection >= 0.95) unlock('dog_best');
        if (S.zone) { visit(S.zone); if (ZONE_ACH[S.zone]) unlock(ZONE_ACH[S.zone]); }
        if (app.gulag && app.gulag.inside) { visit('Il Gulag'); unlock('gulag'); }
        if (game && (game.score || 0) >= 50000) unlock('score_50k');
      }
      if (S && S.online) unlock('online');
      if (eggs && eggs.list) {
        const l = eggs.list(), f = l.filter(x => x.found);
        if (f.length !== eggN) {
          eggN = f.length; D.stats.eggs = f.length;
          if (f.length >= 1) unlock('egg_first');
          if (f.length >= 10) unlock('egg_10');
          if (l.length && f.length === l.length) unlock('egg_all');
          for (const x of f) if (EGG_ACH[x.id]) unlock(EGG_ACH[x.id]);
        }
      }
    } catch (e) { }
  }
  let pt = 0, last = performance.now();
  function attach(a) {
    app = a; if (a.audio) audio = a.audio; if (a.ui) ui = a.ui;
    stat('sessions');
    clearInterval(pt);
    pt = setInterval(() => { const now = performance.now(), dt = Math.min(2, (now - last) / 1000); last = now; poll(dt); }, 500);
    // per-second play-time writes are batched: persist every 10 s
    setInterval(() => persist(), 10000);
  }

  const api = {
    unlock, isUnlocked, define, list, progress, get, set, stat, stats: () => ({ ...D.stats }), record, records: () => ({ ...D.rec }),
    visit, places: () => ({ ...D.places }), on(n, cb) { if (cbs[n]) cbs[n].push(cb); }, export: exportAll, import: importAll,
    notify, attach, gameEvent, setUI(u) { ui = u; }, setAudio(a) { audio = a; },
    reset() { D = blank(); persist(true); emit('change'); },
  };
  window.__save = api;
  return api;
}
