// Cloud save on our server + leaderboards + daily seed.
//   window.__profile = { enabled, status, code(), adopt(code) -> Promise<{ok,error}>, push(), pull() }
//     The save = every localStorage key starting with 'bigalesso'/'direttore' (minus device settings, selfies and
//     anything that looks like a secret, e.g. the player's own AI key). Kept under a random token = the
//     "codice di recupero" (Impostazioni → Salvataggio), which moves the progress to another PC/phone/the desktop app.
//     On start: if the server has a newer save (played elsewhere) it replaces this one and the page reloads once
//     ("Progressi recuperati"); changes are pushed a few seconds after they happen and when the page closes.
//   window.__board = { submit(id, score, { lower, ...meta }) -> Promise<{ best, rank, improved } | null>,
//                      top(id, n = 20) -> Promise<{ board, lower, top:[{ name, score, verified, at, meta }] } | null> }
//     lower: true for times (lower is better); set it on the first submission of a board.
//     Server-refereed matches with meta.board post verified scores by themselves.
//   window.__daily(mode = 'gulag') -> Promise<{ mode, date, seed }> same seed for everyone today (offline: from the date)
// Everything is a silent no-op without our server (static hosting, file://, claude.ai link).
const TOKEN_KEY = 'bgl_token', META_KEY = 'bgl_sync';
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1
const SYNC_RE = /^(bigalesso|direttore)/, SECRET_RE = /key|token|secret|pass/i;
const SKIP = new Set(['bigalesso_settings_v1', 'bigalesso_selfies_v1', 'bigalesso_net_autoworld']);
const MAX = 500 * 1024;
const LS = (() => { try { return window.localStorage; } catch { return null; } })();
const proto = location.protocol;
const canServer = !!LS && (/^https?:$/.test(proto) || proto === 'app:');

const synced = k => !!k && SYNC_RE.test(k) && !SKIP.has(k) && !SECRET_RE.test(k.replace(SYNC_RE, ''));
const rawSet = LS ? Storage.prototype.setItem : null, rawRemove = LS ? Storage.prototype.removeItem : null;
const newToken = () => { const a = new Uint8Array(20); crypto.getRandomValues(a); return Array.from(a, b => ALPHA[b & 31]).join(''); };
const fmt = t => (t || '').match(/.{1,5}/g)?.join('-') || '';
const norm = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const TOKEN_RE = /^[A-HJ-NP-Z2-9]{16,32}$/;

let token = null, meta = { v: 0, dirty: false }, pushT = null, busy = null;
let frozen = false; // after applying a save from the server, until the reload: the old in-memory state must not be written back (save.js/rpg persist on pagehide)
const P = { enabled: false, status: canServer ? 'checking' : 'off' };
function loadMeta() { try { meta = { v: 0, dirty: false, ...JSON.parse(LS.getItem(META_KEY) || '{}') }; } catch { } }
function saveMeta() { try { rawSet.call(LS, META_KEY, JSON.stringify(meta)); } catch { } }
function snapshot() {
  const data = {}; let size = 0;
  for (let i = 0; i < LS.length; i++) {
    const k = LS.key(i); if (!synced(k)) continue;
    const v = LS.getItem(k); if (typeof v !== 'string') continue;
    if (size + k.length + v.length > MAX) continue; // too big: skip the key rather than the whole save
    data[k] = v; size += k.length + v.length;
  }
  return data;
}
function apply(data) {
  for (let i = LS.length - 1; i >= 0; i--) { const k = LS.key(i); if (synced(k) && !(k in data)) rawRemove.call(LS, k); }
  for (const k in data) if (synced(k) && typeof data[k] === 'string') rawSet.call(LS, k, data[k]);
}
async function call(method, path, { body, tok = token, timeout = 6000, keepalive = false } = {}) {
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(path, { method, signal: ctl.signal, keepalive, headers: { 'X-Token': tok || '', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    if (!/json/i.test(r.headers.get('content-type') || '')) return { status: r.status, body: null, server: false };
    return { status: r.status, body: await r.json().catch(() => null), server: true };
  } catch (e) { return null; } finally { clearTimeout(to); }
}

async function push(opts = {}) {
  if (!P.enabled || busy) return busy;
  busy = (async () => {
    const data = snapshot();
    let r = await call('PUT', 'api/profile', { body: { data, base: meta.v }, keepalive: !!opts.keepalive && JSON.stringify(data).length < 60000 });
    if (r && (r.status === 409 || (r.body && r.body.conflict))) r = await call('PUT', 'api/profile', { body: { data, base: meta.v, force: true } }); // last write wins
    if (r && r.status === 200 && r.body) { meta.v = r.body.version; meta.dirty = false; saveMeta(); P.status = 'synced'; }
    else P.status = 'error';
  })().finally(() => { busy = null; });
  return busy;
}
const schedule = () => { meta.dirty = true; saveMeta(); if (!P.enabled) return; clearTimeout(pushT); pushT = setTimeout(push, 4000); };

function toastNow(msg) {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = 'position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:99999;padding:10px 18px;background:rgba(14,8,24,.92);color:#fff;font:600 14px/1.3 system-ui,sans-serif;border-left:3px solid #ff8a3c;pointer-events:none;transition:opacity .5s';
  const show = () => { document.body.appendChild(el); setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 600); }, 4200); };
  if (document.body) show(); else addEventListener('DOMContentLoaded', show);
}

async function boot() {
  if (!canServer) return;
  loadMeta();
  token = LS.getItem(TOKEN_KEY);
  if (!TOKEN_RE.test(token || '')) { token = newToken(); rawSet.call(LS, TOKEN_KEY, token); meta = { v: 0, dirty: true }; saveMeta(); }
  // hook writes of the synced keys (save.js, rpg, minigames… all go through localStorage)
  Storage.prototype.setItem = function (k, v) { if (frozen && this === LS && synced(k)) return; rawSet.call(this, k, v); if (this === LS && synced(k)) schedule(); };
  Storage.prototype.removeItem = function (k) { if (frozen && this === LS && synced(k)) return; rawRemove.call(this, k); if (this === LS && synced(k)) schedule(); };
  try { if (sessionStorage.getItem('bgl_toast')) { sessionStorage.removeItem('bgl_toast'); toastNow('Progressi recuperati dal server'); } } catch { }
  const r = await call('GET', 'api/profile', { timeout: 3000 });
  if (!r || !r.server || (r.status !== 200 && r.status !== 404)) { P.status = r ? 'off' : 'offline'; return; }
  P.enabled = true; P.status = 'synced';
  if (r.status === 200 && r.body && r.body.version > meta.v) {
    let applied = null; try { applied = sessionStorage.getItem('bgl_applied'); } catch { }
    apply(r.body.data || {}); meta = { v: r.body.version, dirty: false }; saveMeta();
    if (applied !== String(r.body.version)) { // the game already read the old save: reload once to use the new one
      frozen = true;
      try { sessionStorage.setItem('bgl_applied', String(r.body.version)); sessionStorage.setItem('bgl_toast', '1'); } catch { }
      location.reload(); return;
    }
  } else if (r.status === 404 || (r.body && r.body.empty) || meta.dirty) push();
  addEventListener('pagehide', () => { if (meta.dirty) push({ keepalive: true }); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && meta.dirty) push({ keepalive: true }); });
  injectSettings();
}

async function adopt(code) {
  const t = norm(code);
  if (!TOKEN_RE.test(t)) return { ok: false, error: 'Codice non valido' };
  if (t === token) return { ok: false, error: 'È già il codice di questo dispositivo' };
  const r = await call('GET', 'api/profile', { tok: t });
  if (!r || !r.server) return { ok: false, error: 'Server non raggiungibile' };
  if (r.status === 404 || (r.body && r.body.empty)) return { ok: false, error: 'Nessun salvataggio con questo codice' };
  if (r.status !== 200 || !r.body) return { ok: false, error: 'Errore del server' };
  rawSet.call(LS, TOKEN_KEY, t); token = t;
  apply(r.body.data || {}); meta = { v: r.body.version, dirty: false }; saveMeta(); frozen = true;
  try { sessionStorage.setItem('bgl_applied', String(r.body.version)); sessionStorage.setItem('bgl_toast', '1'); } catch { }
  setTimeout(() => location.reload(), 300);
  return { ok: true };
}

// Impostazioni → Salvataggio: recovery code + "use a code" (injected, ui.js stays untouched)
function injectSettings() {
  let tries = 0;
  const go = () => {
    const anchor = document.getElementById('svReset'); const row = anchor && anchor.closest('.srow');
    if (!row) { if (++tries < 60) setTimeout(go, 500); return; }
    if (document.getElementById('pfCode')) return;
    row.insertAdjacentHTML('afterend',
      '<div class="srow"><span class="lab">Codice di recupero<small>Salvataggio sul server: su un altro PC, telefono o nell\'app, "Usa un codice" e continui da qui. Tienilo per te.</small></span>' +
      '<span class="orow"><code id="pfCode" style="font:600 13px ui-monospace,Consolas,monospace;letter-spacing:.08em;user-select:all"></code><button class="pbtn ghost" id="pfCopy">Copia</button></span></div>' +
      '<div class="srow"><span class="lab">Usa un codice<small>Carica i progressi di un altro dispositivo (sostituiscono quelli di qui)</small></span>' +
      '<span class="orow"><input id="pfIn" class="txt" type="text" maxlength="29" placeholder="XXXXX-XXXXX-XXXXX-XXXXX" autocapitalize="characters" style="width:15em"><button class="pbtn ghost" id="pfUse">Carica</button></span></div>');
    const msg = document.getElementById('svMsg');
    const say = t => { if (msg) msg.textContent = t; };
    document.getElementById('pfCode').textContent = fmt(token);
    document.getElementById('pfCopy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(fmt(token)); say('Codice copiato'); } catch { say('Codice: ' + fmt(token)); } });
    const inp = document.getElementById('pfIn');
    for (const t of ['keydown', 'keyup']) inp.addEventListener(t, e => e.stopPropagation());
    document.getElementById('pfUse').addEventListener('click', async () => { say('Carico…'); const r = await adopt(inp.value); say(r.ok ? 'Progressi caricati, riavvio…' : r.error); });
  };
  go();
}

const name = () => { try { const s = JSON.parse(LS.getItem('bigalesso_settings_v1') || '{}'); return s.playerName || LS.getItem('bigalesso_name') || 'Giocatore'; } catch { return 'Giocatore'; } };
window.__board = {
  async submit(id, score, m = {}) {
    if (!P.enabled) return null;
    const { lower, ...rest } = m || {};
    const r = await call('POST', 'api/board/' + encodeURIComponent(id), { body: { score, name: name(), meta: rest, lower: !!lower } });
    return r && r.status === 200 ? r.body : null;
  },
  async top(id, n = 20) {
    if (!canServer) return null;
    const r = await call('GET', 'api/board/' + encodeURIComponent(id) + '?n=' + (n | 0));
    return r && r.status === 200 ? r.body : null;
  },
};
window.__daily = async (mode = 'gulag') => {
  if (canServer) { const r = await call('GET', 'api/daily?mode=' + encodeURIComponent(mode), { timeout: 3000 }); if (r && r.status === 200 && r.body) return r.body; }
  const date = new Date().toISOString().slice(0, 10); let h = 2166136261;
  for (const ch of date + ':' + mode) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return { mode, date, seed: h >>> 0, offline: true };
};
Object.assign(P, { code: () => fmt(token), adopt, push: () => push(), pull: boot, get token() { return token; } });
window.__profile = P;
boot();
export default P;
