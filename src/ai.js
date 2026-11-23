// BIGALESSO · AI: one entry point for every "ask Claude" in the game, with a provider chain and an offline fallback.
//   window.__ai.ask({ system, prompt | messages, model: 'fast'|'smart', maxTokens, persona, auto, cache, fallback }) -> Promise<string>
//     ALWAYS resolves (never throws): if no provider answers, it returns `fallback` (string | () => string), else an
//     offline line of `persona`, else '' (empty = "no AI, use your own text").
//   window.__ai.askJSON(opts, fallbackObj) -> Promise<object>   (asks for JSON, parses the first {...} / [...] block)
//   window.__ai.status() -> 'artifact' | 'server' | 'byok' | 'offline'
//   window.__ai.setKey(k) / hasKey() / clearKey()                   (BYOK key: stored only in this browser's localStorage)
//   window.__ai.persona(id), personaPrompt(id), offline(id, topic), pickQuote(id, topic), PERSONAS, QUOTES, LORE
// Provider order: (a) claude.ai artifact `sample` capability → (b) same-origin server POST /api/ai (env ANTHROPIC_API_KEY)
//                 → (c) BYOK direct call to api.anthropic.com → (d) offline (quotes / lore / templates).
// `auto: true` marks calls the player did not trigger (NPC chatter, phone reactions): they never trigger a consent prompt
// (artifact provider only after it already answered once) and they are dropped first when the rate limit is hit.
import PERSONAS from '../assets/chat/personas.json';
import QUOTES from '../assets/chat/quotes.json';
import LORE from '../assets/chat/lore.json';
import BANTER from '../assets/chat/banter.json';

export { PERSONAS, QUOTES, LORE, BANTER };

const MODELS = { fast: 'claude-haiku-5-5', smart: 'claude-sonnet-5-5' };
const TIERS = { fast: 'quick', smart: 'default' };
const KEY_LS = 'bigalesso_ai_key_v1';
const MAX_TOKENS = { fast: 400, smart: 700 };
const TIMEOUT = 20000;

export const GUARDRAIL = [
  'Scrivi testi per BIGALESSO, un videogioco comico ambientato a Bologna (portici, Due Torri, compettine, sushi, Celtic, Millennium, Gulag).',
  'I personaggi sono caricature di un gruppo di amici venticinquenni bolognesi che si prendono per il culo da anni: è una versione da gioco.',
  'Registro: parlano come in una chat di amici veri. Le parolacce sono ammesse e anzi benvenute, usate con naturalezza e spesso',
  '(cazzo, minchia, merda, vaffanculo, stronzo, coglione, testa di cazzo, che palle, sti cazzi, porca troia, ma vaffa, cazzata, rompere i coglioni,',
  'figa come intercalare), con il bolognese (soccia, socmel, burdèl, dai mo, an t\'al dégg). Frasi brevissime, come messaggi WhatsApp.',
  'Prendi per il culo il giocatore (Zuck, detto Zucco) e gli altri amici del gruppo: insulti da amici, mai cattiveria vera.',
  'Limiti fissi, senza eccezioni: niente bestemmie né offese religiose; niente insulti discriminatori (omofobi, razzisti, sessisti, sulla',
  'disabilità o sul corpo); niente contenuti sessuali su persone reali; niente cognomi, indirizzi, numeri o dati personali; niente persone fuori',
  'dal gruppo; niente politica, salute, droghe o soldi; non attribuire reati o fatti gravi veri a nessuno (le condanne del Gulag e del',
  'Corriere delle Due Torri sono giochi palesemente finti).',
  'Rispondi solo con il testo richiesto, senza premesse, senza spiegare le regole e senza dire che sei un\'AI.',
].join(' ');

const byId = Object.fromEntries(PERSONAS.map(p => [p.id, p]));
export const persona = id => byId[id] || null;

// compact persona sheet for prompts
export function personaPrompt(id, { short = false } = {}) {
  const p = persona(id); if (!p) return '';
  const st = p.style || {};
  const lines = [
    `Personaggio: ${p.name}${p.aka && p.aka.length ? ' (detto ' + p.aka.join(', ') + ')' : ''}.`,
    `Carattere: ${p.tone}.`,
    `Tormentoni: ${p.catchphrases.slice(0, short ? 5 : 9).join(' · ')}.`,
  ];
  if (!short) {
    lines.push(`Passioni: ${p.interests.join(', ')}.`);
    if (p.lore && p.lore.length) lines.push(`Storie del gruppo: ${p.lore.join('; ')}.`);
    lines.push(`Come scrive: ${st.lowercase ? 'tutto minuscolo, ' : ''}risata "${st.laugh || 'ahah'}", emoji ${st.emoji || 'poche'}, messaggi ${st.len || 'brevi'}.`);
    if (p.sample && p.sample.length) lines.push(`Esempi di frasi sue: "${p.sample.slice(0, 4).join('" / "')}".`);
  }
  return lines.join('\n');
}
export function loreBrief() {
  const L = LORE;
  return `Gruppo WhatsApp "${L.group.name}" (fondato da Ciccio). Rituali: ${L.rituals.map(r => r.text).join('; ')}. ` +
    `Battute ricorrenti: ${L.jokes.slice(0, 8).join('; ')}. Slang: ${Object.entries(L.slang).map(([k, v]) => k + '=' + v).join(', ')}.`;
}

// ---------------------------------------------------------------- offline lines
const TOPICS = {
  compe: /compe|discord|discors|wz|warzone|overwatch|\bow\b|cs|partit|bf4|battlefield|game|ranki|gioc/i,
  sushi: /sushi|polleg|pranz|cena|fame|pasta|gelato|mangi/i,
  zombi: /zomb|survival|esplod/i,
  serata: /birr|bellazzi|celtic|millennium|petroni|garden|serat|sabato|stasera|stasi|tavolo|mojito|riviera|colli/i,
  corriere: /corriere|giornal|gulag|processo|reclusion|latitant|collana|tortellino|prima pagina|hit/i,
  saluto: /ciao|bella|daje|vecio|regaz|rega|ragazzi/i,
};
export function topicOf(text) { for (const k in TOPICS) if (TOPICS[k].test(text || '')) return k; return null; }
const rnd = a => a[(Math.random() * a.length) | 0];
const byWho = {}; for (const q of QUOTES) (byWho[q.who] ||= []).push(q.text);
export function pickQuote(id, topic) {
  const all = byWho[id] || [];
  const tp = topic && TOPICS[topic] ? all.filter(t => TOPICS[topic].test(t)) : [];
  return tp.length ? rnd(tp) : all.length ? rnd(all) : null;
}
const GENERIC = [
  'Ragazzi è una hit', 'Qualcuno per una compettina?', 'Palese', 'Daje', 'Ci sta', 'Ma una zombata?', 'Sushi stasera?', 'Arrivo 10 min',
  'Soccia', 'Greve', 'Io ci sarei', 'Tocca la compe', 'Storia da prima pagina', 'Che palle raga', 'Sti cazzi, si gioca', 'Porca troia che fame',
  'Dai mo', 'Burdèl, compettina?', 'Socmel', 'Ma vaffa', 'Che cazzata',
];
// banter pack (assets/chat/banter.json): per-persona greet/idle/win/lose/night/roast + generic place/achievement pools
const BK = { saluto: 'greet', greet: 'greet', idle: 'idle', win: 'win', lose: 'lose', night: 'night', roast: 'roast', place: 'place', achievement: 'achievement' };
export function banter(id, kind, vars = {}) {
  const k = BK[kind] || kind; const P = (BANTER.persona && BANTER.persona[id]) || {}; const G = BANTER.generic || {};
  const pool = [...(P[k] || []), ...(P[k] && P[k].length > 2 ? [] : (G[k] || []))];
  if (!pool.length) return null;
  return rnd(pool).replace(/\{(\w+)\}/g, (m, v) => vars[v] != null ? String(vars[v]) : m);
}
export const banterPool = name => (BANTER[name] || []).slice();
// one plausible line for a persona; topic: compe|sushi|zombi|serata|corriere|saluto|win|lose|night|roast|null
export function offline(id, topic = null) {
  const p = persona(id);
  if (!p) return banter(null, topic || 'idle') || rnd(GENERIC);
  const r = Math.random();
  // reactions and greetings: the banter pack first (swearing register), real quotes as seasoning
  if (topic && BK[topic] && topic !== 'idle') { const b = banter(id, topic); if (b && r < 0.85) return b; }
  const q = pickQuote(id, topic);
  if (q && topic && TOPICS[topic] && r < 0.55) return q;
  if (r < 0.35) { const b = banter(id, Math.random() < 0.2 ? 'roast' : 'idle'); if (b) return b; }
  if (q && r < 0.7) return q;
  if (r < 0.88 && p.catchphrases.length) {
    const c = rnd(p.catchphrases);
    const tail = { compe: ['compe stasera?', 'tocca la compe', 'sono su discord', 'chi non viene è un coglione'], sushi: ['sushi?', 'polleg?', 'ho una fame di merda'], zombi: ['zombata?', 'zombatina, dai cazzo'], serata: ['si esce?', 'birretta?', 'Celtic, burdèl?'], corriere: ['prima pagina!', 'è una hit', 'vi sputtano tutti'] }[topic];
    return tail ? cap(c) + ', ' + rnd(tail) : cap(c);
  }
  return banter(id, 'idle') || (p.sample && p.sample.length ? rnd(p.sample) : rnd(GENERIC));
}
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;

// ---------------------------------------------------------------- providers
const LS = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { } },
};
const st = {
  art: null, artState: 'none', artGranted: false, artBackoff: 0,   // claude.ai artifact `sample`
  server: null, serverProbe: null, serverBackoff: 0,             // null = unknown, true/false after probe
  byokBackoff: 0, lastError: '', calls: 0, fails: 0, provider: 'offline',
};
// (a) artifact capability: window.claude.use('sample') resolves later (or null outside an artifact viewer)
function probeArtifact() {
  try {
    if (window.claude && typeof window.claude.use === 'function') {
      st.artState = 'probing';
      Promise.resolve(window.claude.use('sample')).then(s => { if (s) { st.art = s; st.artState = 'ready'; } else st.artState = 'none'; }, () => { st.artState = 'none'; });
    }
  } catch (e) { st.artState = 'none'; }
}
// (b) same-origin server: GET /api/ai -> {enabled:true} when the server has ANTHROPIC_API_KEY
function probeServer() {
  if (st.serverProbe) return st.serverProbe;
  if (!/^https?:$/.test(location.protocol)) { st.server = false; return (st.serverProbe = Promise.resolve(false)); }
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 3500);
  st.serverProbe = fetch(apiUrl(), { method: 'GET', cache: 'no-store', signal: ctl.signal })
    .then(r => r.ok && /json/.test(r.headers.get('content-type') || '') ? r.json() : null)
    .then(j => (st.server = !!(j && j.enabled)))
    .catch(() => (st.server = false))
    .finally(() => clearTimeout(to));
  return st.serverProbe;
}
const apiUrl = () => new URL('api/ai', document.baseURI).href; // relative to the page folder (root deploy -> /api/ai)

const hasKey = () => !!LS.get(KEY_LS);
function status() {
  const now = Date.now();
  if (st.artState === 'ready' && st.artBackoff < now) return 'artifact';
  if (st.server && st.serverBackoff < now) return 'server';
  if (hasKey() && st.byokBackoff < now) return 'byok';
  return 'offline';
}

// rate limit: token bucket (burst 8, +1 every 4 s); user-triggered calls may wait briefly, auto calls are dropped
const bucket = { n: 8, t: performance.now() };
function takeToken(auto) {
  const now = performance.now(); bucket.n = Math.min(8, bucket.n + (now - bucket.t) / 4000); bucket.t = now;
  if (bucket.n >= 1 && !(auto && bucket.n < 3)) { bucket.n -= 1; return true; }
  return false;
}
let inflight = 0; const waiters = [];
const slot = () => inflight < 2 ? (inflight++, Promise.resolve()) : new Promise(r => waiters.push(r)).then(() => { inflight++; });
const release = () => { inflight--; const w = waiters.shift(); w && w(); };

// LRU cache of identical prompts
const cache = new Map();
const cacheGet = k => { if (!cache.has(k)) return null; const v = cache.get(k); cache.delete(k); cache.set(k, v); return v; };
const cachePut = (k, v) => { cache.set(k, v); if (cache.size > 150) cache.delete(cache.keys().next().value); };

function normMessages(o) {
  let msgs = Array.isArray(o.messages) && o.messages.length ? o.messages : [{ role: 'user', content: String(o.prompt || '') }];
  msgs = msgs.filter(m => m && (m.role === 'user' || m.role === 'assistant') && m.content).map(m => ({ role: m.role, content: String(m.content).slice(0, 4000) }));
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  // merge consecutive same-role turns (API requires alternation)
  const out = []; for (const m of msgs) { const l = out[out.length - 1]; if (l && l.role === m.role) l.content += '\n' + m.content; else out.push({ ...m }); }
  while (out.length && out[out.length - 1].role !== 'user') out.pop();
  // keep the conversation short (cost + latency)
  return out.slice(-12);
}

function withTimeout(p, ms, ctl) { let to; return Promise.race([p, new Promise((_, rej) => { to = setTimeout(() => { try { ctl && ctl.abort(); } catch (e) { } rej(Object.assign(new Error('timeout'), { code: 'timeout' })); }, ms); })]).finally(() => clearTimeout(to)); }

async function callArtifact(system, msgs, model, o) {
  // memoryless: instructions go into the first user turn
  const input = msgs.map((m, i) => i === 0 ? { role: 'user', content: system + '\n\n---\n\n' + m.content } : m);
  const ctl = new AbortController();
  const r = await withTimeout(st.art(input.length === 1 ? input[0].content : input, { modelTier: TIERS[model] || 'quick', cache: o.cache !== false, signal: ctl.signal }), TIMEOUT, ctl);
  st.artGranted = true;
  return r && r.text ? r.text : '';
}
async function callServer(system, msgs, model, maxTokens) {
  const ctl = new AbortController();
  const r = await withTimeout(fetch(apiUrl(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, system, messages: msgs, max_tokens: maxTokens }), signal: ctl.signal }), TIMEOUT, ctl);
  if (r.status === 503) { st.server = false; throw Object.assign(new Error('no_key'), { code: 'no_key' }); }
  if (r.status === 429) throw Object.assign(new Error('rate_limited'), { code: 'rate_limited' });
  if (!r.ok) throw Object.assign(new Error('http ' + r.status), { code: 'http' });
  const j = await r.json(); return j && j.text ? j.text : '';
}
async function callByok(system, msgs, model, maxTokens) {
  const ctl = new AbortController();
  const r = await withTimeout(fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal: ctl.signal,
    headers: { 'content-type': 'application/json', 'x-api-key': LS.get(KEY_LS), 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model: MODELS[model] || MODELS.fast, max_tokens: maxTokens, system, messages: msgs }),
  }), TIMEOUT, ctl);
  if (r.status === 401 || r.status === 403) throw Object.assign(new Error('bad_key'), { code: 'bad_key' });
  if (r.status === 429 || r.status === 529) throw Object.assign(new Error('rate_limited'), { code: 'rate_limited' });
  if (!r.ok) throw Object.assign(new Error('http ' + r.status), { code: 'http' });
  const j = await r.json();
  return (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
}

function clean(text, personaId) {
  let t = String(text || '').replace(/\r/g, '').trim();
  const p = persona(personaId);
  if (p) t = t.replace(new RegExp('^\\s*(' + [p.name, p.nick, ...(p.aka || [])].map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\s*:\\s*', 'i'), '');
  if (/^["«“].*["»”]$/s.test(t) && !/["«“»”]/.test(t.slice(1, -1))) t = t.slice(1, -1).trim();
  return t.slice(0, 1200);
}

async function ask(o = {}) {
  const model = o.model === 'smart' ? 'smart' : 'fast';
  // no provider: the caller's fallback, else an offline line of the persona, else '' (callers without persona/fallback
  // — e.g. minigames/shared.js — treat an empty answer as "use your own fallback")
  const fb = () => { const f = o.fallback; const v = typeof f === 'function' ? f() : f; return v != null ? String(v) : o.persona ? offline(o.persona, topicOf(o.prompt || (o.messages && o.messages.length ? o.messages[o.messages.length - 1].content : ''))) : ''; };
  try {
    const system = GUARDRAIL + (o.system ? '\n\n' + o.system : '');
    const msgs = normMessages(o);
    if (!msgs.length) return fb();
    const maxTokens = Math.max(32, Math.min(o.maxTokens || MAX_TOKENS[model], 1024));
    const key = model + '\u0001' + system + '\u0001' + JSON.stringify(msgs);
    if (o.cache !== false) { const c = cacheGet(key); if (c) return c; }
    if (st.server === null && !o.noServer) await Promise.race([probeServer(), new Promise(r => setTimeout(r, o.auto ? 50 : 1500))]);
    const now = Date.now();
    const chain = [];
    if (st.artState === 'ready' && st.artBackoff < now && (!o.auto || st.artGranted)) chain.push('artifact');
    if (st.server && st.serverBackoff < now) chain.push('server');
    if (hasKey() && st.byokBackoff < now) chain.push('byok');
    if (!chain.length) { st.provider = 'offline'; return fb(); }
    if (!takeToken(o.auto)) return fb();
    await slot();
    try {
      for (const prov of chain) {
        try {
          st.calls++;
          const raw = prov === 'artifact' ? await callArtifact(system, msgs, model, o) : prov === 'server' ? await callServer(system, msgs, model, maxTokens) : await callByok(system, msgs, model, maxTokens);
          const t = clean(raw, o.persona);
          if (t) { st.provider = prov; if (o.cache !== false) cachePut(key, t); return t; }
        } catch (e) {
          st.fails++; st.lastError = (e && (e.code || e.message)) || 'errore';
          const code = e && e.code;
          if (prov === 'artifact') { if (code === 'not_granted') st.artState = 'denied'; else st.artBackoff = Date.now() + (code === 'rate_limited' ? 60000 : 20000); }
          if (prov === 'server') st.serverBackoff = Date.now() + (code === 'rate_limited' ? 30000 : 15000);
          if (prov === 'byok') st.byokBackoff = Date.now() + (code === 'bad_key' ? 3600000 : code === 'rate_limited' ? 30000 : 15000);
        }
      }
    } finally { release(); }
    return fb();
  } catch (e) { return fb(); }
}

// JSON helper: parses the first {...} or [...] block of the answer; any failure -> fallback object
async function askJSON(o = {}, fallbackObj = null) {
  const t = await ask({ ...o, fallback: '\u0000' });
  if (t === '\u0000') return typeof fallbackObj === 'function' ? fallbackObj() : fallbackObj;
  const m = t.match(/[\[{][\s\S]*[\]}]/);
  if (m) { try { return JSON.parse(m[0]); } catch (e) { } }
  return typeof fallbackObj === 'function' ? fallbackObj() : fallbackObj;
}

// ---------------------------------------------------------------- game events bus (phone reactions, NPC context)
// Anyone can report: window.dispatchEvent(new CustomEvent('bigalesso:event', { detail: { type, ... } })) or window.__phone.event(type, data)
// types used: zone {zone} · achievement {id,title} · minigame {name,score,win} · score {cabinet,score} · egg {name} · talk {who} · call {who} · text {text}
const EVENTS = [];
export function emitEvent(type, data = {}) {
  try { window.dispatchEvent(new CustomEvent('bigalesso:event', { detail: { type, ...data } })); } catch (e) { EVENTS.push({ type, ...data, t: Date.now() }); }
}
if (typeof window !== 'undefined') window.addEventListener('bigalesso:event', e => {
  const d = e && e.detail; if (!d || !d.type) return;
  EVENTS.push({ ...d, t: Date.now() }); if (EVENTS.length > 40) EVENTS.shift();
});
export function describeEvent(e) {
  const nm = id => (persona(id) || {}).name || id;
  switch (e.type) {
    case 'talk': return `Zuck ha chiacchierato con ${nm(e.who)}`;
    case 'call': return `Zuck ha chiamato ${nm(e.who)} col telefono`;
    case 'zone': return `Zuck è entrato in "${e.zone}"`;
    case 'achievement': return `Zuck ha sbloccato l'obiettivo «${e.title || e.id}»`;
    case 'minigame': if (e.text) return 'Zuck ' + e.text; return `Zuck ha giocato a ${e.name || 'un minigioco'}${e.score != null ? ' (punteggio ' + e.score + ')' : ''}${e.win === true ? ' e ha vinto' : e.win === false ? ' e ha perso' : ''}`;
    case 'score': return `Zuck ha fatto ${e.score} punti al cabinato ${e.cabinet || ''}`.trim();
    case 'egg': return `Zuck ha trovato un easter egg${e.name ? ': ' + e.name : ''}`;
    case 'night': return e.on ? 'è calata la notte' : 'è tornato giorno';
    default: return e.text || '';
  }
}
export function recentEvents(n = 4, maxAgeMs = 15 * 60000) {
  const now = Date.now();
  return EVENTS.filter(e => now - e.t < maxAgeMs && e.type !== 'talk').slice(-n).map(describeEvent).filter(Boolean);
}
export const eventLog = () => EVENTS.slice();

// achievements: window.__save.unlock (INTRO+MENU) when present; queued until it exists
const pendingUnlocks = []; let unlockTimer = 0;
const unlockedHere = new Set();
export function unlock(id, meta = {}) {
  if (unlockedHere.has(id)) return; unlockedHere.add(id);
  pendingUnlocks.push([id, meta]); flushUnlocks();
}
function flushUnlocks() {
  const s = window.__save;
  if (s && typeof s.unlock === 'function') {
    while (pendingUnlocks.length) { const [id, meta] = pendingUnlocks.shift(); try { s.unlock(id, meta); } catch (e) { } }
    return;
  }
  if (!unlockTimer) unlockTimer = setTimeout(() => { unlockTimer = 0; if (pendingUnlocks.length) flushUnlocks(); }, 3000);
}

export const FRIEND_ACHIEVEMENTS = [
  { id: 'npc_first', cat: 'Amici', icon: '💬', title: 'Due chiacchiere', desc: 'Parla con un amico del gruppo (E).' },
  { id: 'npc_all', cat: 'Amici', icon: '🤝', title: 'Giro di saluti', desc: 'Parla con tutti gli amici del gruppo.' },
  { id: 'phone_first', cat: 'Amici', icon: '📱', title: 'Primo messaggio', desc: 'Scrivi nel gruppo Teletubbylandia (T).' },
  { id: 'call_friend', cat: 'Amici', icon: '📞', title: 'Vieni qui', desc: 'Chiama un amico dal telefono.' },
  { id: 'bot_first', cat: 'Amici', icon: '🤖', title: 'Chiedilo al bot', desc: 'Fai una domanda al bot del gruppo.' },
  { id: 'bot_kachin', cat: 'Amici', icon: '🗺️', title: 'Kachin', desc: 'Il bot del gruppo si inceppa di nuovo.', hidden: true },
  { id: 'phone_roll', cat: 'Amici', icon: '🖼️', title: 'Rullino', desc: 'Guarda le foto sul telefono.' },
];
// run cb once window.__save exists (it may be created after us)
function whenSave(cb, tries = 120) {
  const s = window.__save;
  if (s && typeof s.unlock === 'function') { try { cb(s); } catch (e) { } return; }
  if (tries > 0) setTimeout(() => whenSave(cb, tries - 1), 1000);
}

export function installAI() {
  if (window.__ai) return window.__ai;
  whenSave(s => {
    if (s.define) s.define(FRIEND_ACHIEVEMENTS);
    if (s.on) s.on('unlock', (id, d) => emitEvent('achievement', { id, title: d && d.title }));
    flushUnlocks();
  });
  probeArtifact();
  setTimeout(() => probeServer(), 1500);
  const api = {
    ask, askJSON, status,
    setKey(k) { k = String(k || '').trim(); LS.set(KEY_LS, k || null); st.byokBackoff = 0; return hasKey(); },
    clearKey() { LS.set(KEY_LS, null); },
    hasKey,
    info: () => ({ provider: status(), last: st.provider, artifact: st.artState, artifactGranted: st.artGranted, server: st.server, byok: hasKey(), calls: st.calls, fails: st.fails, lastError: st.lastError }),
    persona, personaPrompt, loreBrief, offline, banter, banterPool, pickQuote, topicOf, PERSONAS, QUOTES, LORE, BANTER, MODELS,
    reprobe() { st.serverProbe = null; st.server = null; st.serverBackoff = 0; st.artBackoff = 0; probeServer(); if (st.artState === 'none') probeArtifact(); },
  };
  window.__ai = api;
  window.__personas = PERSONAS;
  return api;
}

// installed on import (main.js imports npcs/phone): window.__ai is ready before any other module's init
if (typeof window !== 'undefined') installAI();
