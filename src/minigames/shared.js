// Shared helpers for the minigames: chat-derived data (filtered personas/quotes/lore), AI with offline fallback,
// achievements/records (window.__save when present, localStorage otherwise), phone messages, anchors, DOM overlays.
import * as THREE from 'three';
import quotesData from '../../assets/chat/quotes.json';
import personasData from '../../assets/chat/personas.json';
import loreData from '../../assets/chat/lore.json';
import banterData from '../../assets/chat/banter.json';

export const rnd = (a, b) => a + Math.random() * (b - a);
export const pick = a => a[Math.floor(Math.random() * a.length)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------------------------------------------------------- data (runtime overrides from the PERSONAGGI module)
const asArr = x => Array.isArray(x) ? x : (x && typeof x === 'object' ? Object.values(x) : []);
export function personas() {
  const p = asArr(window.__personas && (window.__personas.list || window.__personas));
  const list = p.length && p[0] && p[0].id ? p : asArr(personasData);
  return list.filter(x => x && x.id);
}
export function persona(id) { return personas().find(p => p.id === id) || { id, name: id, nick: id, color: '#9aa', emoji: '🙂', catchphrases: [] }; }
export function quotes() {
  const q = asArr(window.__quotes || (window.__personas && window.__personas.quotes));
  const list = q.length && q[0] && q[0].text ? q : asArr(quotesData);
  const ids = new Set(personas().map(p => p.id));
  return list.filter(x => x && x.who && x.text && ids.has(x.who) && x.text.length >= 6 && x.text.length <= 110);
}
export const lore = () => (window.__lore && window.__lore.group ? window.__lore : loreData);
export const nameOf = id => persona(id).name || id;
export const catchphrase = id => { const c = persona(id).catchphrases || []; return c.length ? pick(c) : 'daje'; };

// ---------------------------------------------------------------- AI (window.__ai from ai.js; always resolves)
export async function ask(opts, fallback, timeout = 12000) {
  const fb = () => (typeof fallback === 'function' ? fallback() : fallback);
  const ai = window.__ai;
  if (!ai || typeof ai.ask !== 'function') return fb();
  try {
    const r = await Promise.race([ai.ask({ model: 'fast', maxTokens: 220, ...opts }), new Promise(res => setTimeout(() => res(null), timeout))]);
    const s = typeof r === 'string' ? r : (r && (r.text || r.content)) || '';
    const t = String(s).trim();
    if (!t || t.length < 2 || /^(error|errore)\b/i.test(t)) return fb();
    return t;
  } catch (e) { return fb(); }
}
export const aiOnline = () => { try { const a = window.__ai; if (!a || typeof a.status !== 'function') return false; const s = a.status(); return typeof s === 'string' ? s !== 'offline' : !!(s && (s.online || s.ok)); } catch (e) { return false; } };
export const SAFE = 'Registro da chat tra amici venticinquenni bolognesi: parolacce benvenute (cazzo, merda, coglione, stronzo, vaffanculo, che palle, sti cazzi, porca troia, socmel, burdèl) e prese per il culo tra amici, frasi brevissime. Limiti fissi: niente bestemmie, niente insulti discriminatori (omofobi, razzisti, sessisti, sulla disabilità o sul corpo), niente sesso su persone reali, niente politica, religione, salute, droghe, soldi o dati personali; non inventare fatti gravi veri sulle persone. Rispondi in italiano.';
// offline banter (assets/chat/banter.json): banter(id, kind) per persona (greet|idle|win|lose|night|roast), banterPool(name) for discord|sushi|processo_verdetti|processo_pene|corriere|zombata|bot
export const banterPool = name => (banterData[name] || []).slice();
export function banter(id, kind) { const P = (banterData.persona && banterData.persona[id]) || {}; const pool = [...(P[kind] || []), ...((banterData.generic && banterData.generic[kind]) || [])]; return pool.length ? pick(pool) : null; }
// strips quotes/markdown the model may add, cuts to n chars
export function clean(s, n = 160) { s = String(s || '').replace(/^["“«\s]+|["”»\s]+$/g, '').replace(/\*\*|__|#+ /g, '').trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; }

// ---------------------------------------------------------------- achievements / records
const LS = 'bigalesso_minigames_v1';
let store = {}; try { store = JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (e) { store = {}; }
const persist = () => { try { localStorage.setItem(LS, JSON.stringify(store)); } catch (e) { } };
let toastFn = null;
export function setToast(f) { toastFn = f; }
export function unlock(id, meta = {}) {
  store.ach = store.ach || {};
  const first = !store.ach[id];
  store.ach[id] = store.ach[id] || Date.now(); persist();
  const S = window.__save;
  if (S && typeof S.unlock === 'function') { try { S.unlock(id, meta); } catch (e) { } }
  else if (first && toastFn) toastFn('🏆 ' + (meta.title || id) + (meta.desc ? ' — ' + meta.desc : ''), 'gold');
  return first;
}
export function getRec(key, def = 0) {
  const S = window.__save; let v;
  if (S && typeof S.get === 'function') { try { v = S.get('mg.' + key); } catch (e) { } }
  if (v === undefined || v === null) v = store.rec && store.rec[key];
  return v === undefined || v === null ? def : v;
}
export function setRec(key, v) {
  store.rec = store.rec || {}; store.rec[key] = v; persist();
  const S = window.__save; if (S && typeof S.set === 'function') { try { S.set('mg.' + key, v); } catch (e) { } }
}
// record if better; returns true when it is a new record
export function record(key, v, lowerIsBetter = false) {
  const old = getRec(key, null);
  if (old === null || (lowerIsBetter ? v < old : v > old)) { setRec(key, v); return true; }
  return false;
}
export const myAchievements = () => Object.keys(store.ach || {});
// session log (for the "Corriere AI" special edition)
const session = { t0: Date.now(), events: [] };
export function logEvent(kind, text) { session.events.push({ kind, text, t: Date.now() }); if (session.events.length > 40) session.events.shift(); try { window.dispatchEvent(new CustomEvent('bigalesso:minigame', { detail: { kind, text } })); } catch (e) { } }
export const sessionLog = () => session;

// ---------------------------------------------------------------- shader warm-up after late content (gfx.js), debounced
let warmT = null;
export function requestWarmup() { clearTimeout(warmT); warmT = setTimeout(() => { try { window.__gfx && window.__gfx.warmup && window.__gfx.warmup(); } catch (e) { } }, 1500); }

// ---------------------------------------------------------------- phone (window.__phone from phone.js)
export function phone(from, text) { try { const P = window.__phone; if (P && typeof P.push === 'function') P.push({ from, text: String(text) }); } catch (e) { } }

// ---------------------------------------------------------------- anchors (QUARTIERE) with fallbacks
// accepts Vector3, {pos|position, yaw}, {x,z}, [x,z] / [x,y,z]; returns { pos: Vector3, yaw }
export function anchor(level, name, fallback) {
  const A = (level && level.anchors) || {};
  const a = A[name] || (window.__quartiere && window.__quartiere.anchors && window.__quartiere.anchors[name]);
  const norm = x => {
    if (!x) return null;
    if (x.isVector3) return { pos: x.clone(), yaw: typeof x.yaw === 'number' ? x.yaw : (x.userData && typeof x.userData.yaw === 'number' ? x.userData.yaw : null), real: true };
    if (Array.isArray(x)) return { pos: V(x[0], 0, x[1]), yaw: typeof x[2] === 'number' ? x[2] : null, real: true }; // quartiere layout: [x, z, yaw]
    const p = x.pos || x.position || x;
    if (typeof p.x !== 'number') return null;
    return { pos: V(p.x, p.y || 0, p.z ?? 0), yaw: typeof x.yaw === 'number' ? x.yaw : (typeof x.ry === 'number' ? x.ry : null), real: true };
  };
  return norm(a) || { pos: fallback.pos.clone(), yaw: fallback.yaw ?? 0, real: false };
}

// ---------------------------------------------------------------- DOM overlays (desktop UI, Esc closes)
let cssDone = false;
export function overlayCSS(css) {
  if (!cssDone) {
    cssDone = true;
    const s = document.createElement('style'); s.id = 'mg-css';
    s.textContent = `
.mg-ov{position:fixed;inset:0;z-index:40;display:none;font:14px/1.4 Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#eef;user-select:none}
.mg-ov.on{display:flex;animation:mgIn .28s ease-out}
@keyframes mgIn{from{opacity:0;transform:scale(.985)}to{opacity:1;transform:none}}
.mg-ov .mg-bg{position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 40%,rgba(10,10,18,.55),rgba(0,0,0,.82));backdrop-filter:blur(3px)}
.mg-ov kbd{display:inline-block;min-width:1.4em;padding:1px 6px;border:1px solid rgba(255,255,255,.35);border-bottom-width:2px;border-radius:5px;font:600 11px/1.5 ui-monospace,Consolas,monospace;color:#fff;background:rgba(255,255,255,.08);text-align:center}
.mg-ov .mg-x{position:absolute;top:18px;right:22px;z-index:3;background:none;border:0;color:rgba(255,255,255,.75);font:600 12px system-ui;cursor:pointer}
.mg-ov button.mg-b{font:600 14px/1 system-ui;padding:11px 16px;border-radius:9px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.07);color:#fff;cursor:pointer;text-align:left;transition:background .15s,transform .1s,border-color .15s}
.mg-ov button.mg-b:hover,.mg-ov button.mg-b.sel{background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.5)}
.mg-ov button.mg-b:active{transform:scale(.98)}
.mg-ov button.mg-b.ok{background:rgba(40,200,110,.35);border-color:#3c9}
.mg-ov button.mg-b.no{background:rgba(230,50,60,.35);border-color:#e45}
.mg-ov .mg-dots span{animation:mgDot 1.2s infinite;opacity:.2}.mg-ov .mg-dots span:nth-child(2){animation-delay:.2s}.mg-ov .mg-dots span:nth-child(3){animation-delay:.4s}
@keyframes mgDot{40%{opacity:1}}
#mg-zhud{position:fixed;left:50%;top:5.5vh;transform:translateX(-50%);z-index:9;pointer-events:none;text-align:center;font:800 15px/1.2 Impact,"Arial Black",system-ui,sans-serif;letter-spacing:.08em;color:#d8ff6a;text-shadow:0 0 12px rgba(120,255,60,.6),0 2px 3px #000;opacity:0;transition:opacity .5s}
#mg-zhud.on{opacity:1}#mg-zhud small{display:block;font:600 12px system-ui;letter-spacing:.02em;color:#e9f;text-shadow:0 1px 3px #000;margin-top:4px}
#mg-zflash{position:fixed;inset:0;z-index:8;pointer-events:none;background:radial-gradient(circle,transparent 40%,rgba(160,0,0,.75));opacity:0;transition:opacity .25s}
`;
    document.head.appendChild(s);
  }
  if (css) { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); }
}
// creates an overlay root; open()/close() set body.dataset.overlay (main.js releases the pointer lock) and capture keys
export function createOverlay(id, html, { input, onKey, onClose } = {}) {
  overlayCSS();
  const root = document.createElement('div'); root.className = 'mg-ov'; root.id = id;
  root.innerHTML = `<div class="mg-bg"></div><button class="mg-x" aria-label="Chiudi"><kbd>Esc</kbd> esci</button>${html}`;
  document.body.appendChild(root);
  let isOpen = false, prevCap = null;
  const api = {
    root, $: s => root.querySelector(s), $$: s => [...root.querySelectorAll(s)],
    get isOpen() { return isOpen; },
    open() {
      if (isOpen) return; isOpen = true; root.classList.add('on'); document.body.dataset.overlay = id;
      try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { }
      if (input) { prevCap = input.capture; input.capture = e => {
        const tag = (e.target && e.target.tagName) || '';
        if (e.code === 'Escape') { e.preventDefault(); api.close(); return true; }
        if (/INPUT|TEXTAREA/.test(tag)) return true; // typing in a text box
        if (onKey) onKey(e);
        return true;
      }; input.keys.clear(); }
    },
    close() {
      if (!isOpen) return; isOpen = false; root.classList.remove('on');
      if (document.body.dataset.overlay === id) delete document.body.dataset.overlay;
      if (input) { input.capture = prevCap || null; input.keys.clear(); input.edges.clear(); }
      onClose && onClose();
    },
  };
  root.querySelector('.mg-x').addEventListener('click', () => api.close());
  return api;
}

// small helpers for canvas textures / signs
export function canvasTex(c, nearest = false) {
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  if (nearest) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; } else t.anisotropy = 8;
  return t;
}
export function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
export function signTex(text, { w = 512, h = 128, bg = '#111', fg = '#fff', font = '900 72px Impact, "Arial Black", sans-serif', glow = null } = {}) {
  const c = cv(w, h), x = c.getContext('2d');
  if (bg) { x.fillStyle = bg; x.fillRect(0, 0, w, h); }
  x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle';
  if (glow) { x.shadowColor = glow; x.shadowBlur = 18; }
  x.fillStyle = fg; x.fillText(text, w / 2, h / 2 + 4);
  return canvasTex(c);
}
