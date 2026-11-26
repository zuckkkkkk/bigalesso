// FPS counter for everyone + desktop-app settings (Electron, window.bigalessoDesktop).
// - "Mostra FPS" in Impostazioni (or F3): small counter top-right with frame rate, frame time and the worst frame of
//   the last half second (spikes = stutters). Saved in localStorage.
// - Desktop app only: "FPS illimitati" (no vsync / frame cap, applied on restart), "Schermo intero all'avvio",
//   and the graphics card in use (to check that the dedicated GPU is the one running the game).
// Rows are injected into the settings page, so ui.js stays untouched. Toggles reuse the .tog style with their
// own data-dset attribute (ui.js only handles data-set).
const D = window.bigalessoDesktop || null;
const LS = 'bigalesso.fps';

// ---------------- FPS counter + stutter recorder ----------------
// While the counter is on, every frame slower than 45 ms (and > 2.2× the recent average) is logged with what changed
// in that frame: new shader programs, textures/geometries uploaded, JS heap drop (garbage collection), long tasks,
// zone, mode, light counts, draw calls. F4 copies the report (to paste in chat).
let box = null, on = false, n = 0, t0 = 0, last = 0, worst = 0, ema = 16.7;
const spikes = []; let spikeN = 0, lastSpike = null;
const prevS = { prog: -1, tex: -1, geo: -1, heap: 0 };
let longT = 0, longN = 0;
try { new PerformanceObserver(l => { for (const e of l.getEntries()) { longT += e.duration; longN++; } }).observe({ type: 'longtask', buffered: false }); } catch (e) { }
function sample() {
  const r = window.__renderer, i = r && r.info, m = performance.memory;
  return { prog: i && i.programs ? i.programs.length : -1, tex: i ? i.memory.textures : -1, geo: i ? i.memory.geometries : -1, heap: m ? m.usedJSHeapSize : 0, calls: i ? i.render.calls : 0 };
}
function record(dt, t) {
  const s = sample(), A = window.__app || {}, S = A.S || {}, W = A.world || {};
  const e = { t: +(t / 1000).toFixed(1), ms: Math.round(dt), shader: prevS.prog >= 0 ? s.prog - prevS.prog : 0, tex: prevS.tex >= 0 ? s.tex - prevS.tex : 0,
    geo: prevS.geo >= 0 ? s.geo - prevS.geo : 0, gcMB: prevS.heap && s.heap < prevS.heap - 2e6 ? Math.round((prevS.heap - s.heap) / 1e6) : 0,
    long: Math.round(longT), zone: S.zone || null, mode: W.mode || S.phase || null, calls: s.calls,
    night: !!(document.body.dataset.night || (A.level && A.level.isNight && A.level.isNight())),
    lights: window.__lightpad ? window.__lightpad.counts.PointLight + window.__lightpad.counts.SpotLight : null };
  spikeN++; lastSpike = e; spikes.push(e); if (spikes.length > 60) spikes.shift();
}
function loop(t) {
  if (!on) return;
  requestAnimationFrame(loop);
  if (last) {
    const dt = t - last; if (dt > worst) worst = dt;
    if (dt > 45 && dt > ema * 2.2 && document.visibilityState === 'visible') record(dt, t);
    ema += (Math.min(dt, 100) - ema) * 0.05;
  }
  const s = sample(); prevS.prog = s.prog; prevS.tex = s.tex; prevS.geo = s.geo; prevS.heap = s.heap; longT = 0;
  last = t; n++;
  if (!t0) t0 = t;
  if (t - t0 >= 500) {
    const fps = n * 1000 / (t - t0);
    let why = '';
    if (lastSpike) { const k = lastSpike; why = k.shader > 0 ? `${k.shader} shader` : k.tex > 0 || k.geo > 0 ? 'upload' : k.gcMB ? 'memoria' : k.long ? 'CPU' : '?'; }
    box.textContent = `${Math.round(fps)} FPS · ${(1000 / fps).toFixed(1)} ms · picco ${Math.round(worst)} ms` + (spikeN ? ` · scatti ${spikeN} (ultimo ${lastSpike.ms} ms, ${why}) · F4 copia` : '');
    box.style.color = fps >= 55 ? '#9effa0' : fps >= 30 ? '#ffd166' : '#ff6b6b';
    n = 0; t0 = t; worst = 0;
  }
}
function report() {
  const r = window.__renderer, g = (window.__gfx && window.__gfx.gpu) || {};
  return JSON.stringify({ v: 1, ua: navigator.userAgent.replace(/^.*?(Chrome\/[\d.]+).*?(Electron\/[\d.]+)?.*$/, '$1 $2').trim(), desktop: !!D,
    gpu: g.name, tier: g.tier, level: window.__gfx && window.__gfx.level, pr: r && +r.getPixelRatio().toFixed(2), size: [innerWidth, innerHeight],
    programs: r && r.info.programs ? r.info.programs.length : null, lightpad: window.__lightpad ? window.__lightpad.stats() : null,
    warm: window.__gfx && window.__gfx.stats ? window.__gfx.stats().warm : null, spikes: spikeN, list: spikes });
}
function copyReport() {
  const txt = 'BIGALESSO scatti ' + report();
  const done = ok => { try { window.__app && window.__app.world && window.__app.world.toast ? window.__app.world.toast(ok ? 'Report scatti copiato: incollalo in chat' : 'Non riesco a copiare: apri la console') : 0; } catch (e) { } if (!ok) console.log(txt); };
  try { navigator.clipboard.writeText(txt).then(() => done(true), () => done(false)); } catch (e) { done(false); }
}
function setFps(v) {
  on = !!v;
  try { localStorage.setItem(LS, on ? '1' : '0'); } catch (e) { }
  if (on && !box) {
    box = document.createElement('div');
    box.id = 'fpsBox';
    box.style.cssText = 'position:fixed;top:8px;right:10px;z-index:99999;font:600 12px/1.2 ui-monospace,Consolas,monospace;' +
      'padding:4px 8px;border-radius:6px;background:rgba(0,0,0,.55);color:#9effa0;pointer-events:none;letter-spacing:.02em';
    box.textContent = '… FPS';
    document.body.appendChild(box);
  }
  if (box) box.style.display = on ? '' : 'none';
  if (on) { n = 0; t0 = 0; last = 0; worst = 0; requestAnimationFrame(loop); }
  sync();
}
let saved = false; try { saved = localStorage.getItem(LS) === '1' || /[?&]fps\b/.test(location.search); } catch (e) { }

addEventListener('keydown', e => {
  if ((e.key !== 'F3' && e.key !== 'F4') || e.repeat) return;
  const a = document.activeElement; if (a && /^(INPUT|TEXTAREA)$/.test(a.tagName)) return;
  e.preventDefault();
  if (e.key === 'F3') setFps(!on); else copyReport();
});
window.__stutter = { report: () => JSON.parse(report()), copy: copyReport, spikes };

// ---------------- version (build-time constants from scripts/build.mjs; desktop also shows the app shell) ----------------
const GAME_VERSION = typeof __BIGALESSO_VERSION__ !== 'undefined' ? __BIGALESSO_VERSION__ : 'dev';
const GAME_BUILD = typeof __BIGALESSO_BUILD__ !== 'undefined' ? __BIGALESSO_BUILD__ : 0;
let appVersion = '';
function verText() {
  const d = GAME_BUILD ? new Date(GAME_BUILD) : null;
  const when = d ? ` · ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';
  return `Gioco ${GAME_VERSION}${when}` + (appVersion ? ` · app ${appVersion}` : '');
}
window.__version = { game: GAME_VERSION, build: GAME_BUILD };
// ---------------- settings rows ----------------
const ds = { uncapFps: false, uncapFpsSaved: false, fullscreen: true };
let rowsAdded = false, gpuName = '';
function tog(key, label, hint) {
  return `<div class="srow" data-drow="${key}"><span class="lab">${label}${hint ? `<small>${hint}</small>` : ''}</span>` +
    `<button class="tog" role="switch" data-dset="${key}" aria-label="${label}"></button></div>`;
}
function addRows() {
  if (rowsAdded) return true;
  const q = document.querySelector('[data-page="settings"] .seg[data-set="quality"]');
  const row = q && q.closest('.srow'); if (!row) return false;
  let html = tog('fps', 'Mostra FPS', 'Contatore in alto a destra (anche con F3). "Picco" alto = scatti; F4 copia il report degli scatti');
  html += `<div class="srow" data-drow="version"><span class="lab">Versione<small id="dVer">${verText()}</small></span></div>`;
  if (D) {
    html += tog('uncapFps', 'FPS illimitati', 'Toglie il limite al refresh dello schermo. Si applica al riavvio') +
      `<div class="srow" data-drow="restart" hidden><span class="lab">Riavvio necessario<small>Per applicare gli FPS illimitati</small></span><button class="pbtn ghost" data-dact="restart">Riavvia ora</button></div>` +
      tog('fullscreen', "Schermo intero all'avvio", 'F11 o Alt+Invio per cambiare al volo') +
      `<div class="srow" data-drow="gpu"><span class="lab">Scheda video<small id="dGpu">…</small></span></div>`;
  }
  row.insertAdjacentHTML('afterend', html);
  rowsAdded = true;
  const page = row.closest('[data-page="settings"]');
  page.addEventListener('click', e => {
    const t = e.target.closest('.tog[data-dset]');
    if (t) {
      const k = t.dataset.dset;
      if (k === 'fps') { setFps(!on); return; }
      if (D && (k === 'uncapFps' || k === 'fullscreen')) {
        const v = k === 'uncapFps' ? !ds.uncapFpsSaved : !ds.fullscreen;
        if (k === 'uncapFps') ds.uncapFpsSaved = v; else ds.fullscreen = v;
        Promise.resolve(D.setSetting(k, v)).catch(() => { });
        sync();
      }
      return;
    }
    if (e.target.closest('[data-dact="restart"]') && D) D.relaunch();
  });
  sync();
  return true;
}
function sync() {
  if (!rowsAdded) return;
  const set = (k, v) => { const b = document.querySelector(`.tog[data-dset="${k}"]`); if (b) b.setAttribute('aria-checked', v ? 'true' : 'false'); };
  set('fps', on); set('uncapFps', ds.uncapFpsSaved); set('fullscreen', ds.fullscreen);
  const r = document.querySelector('[data-drow="restart"]'); if (r) r.hidden = ds.uncapFpsSaved === ds.uncapFps;
  const g = document.getElementById('dGpu');
  if (g) g.textContent = gpuName || ((window.__gfx && window.__gfx.gpu && window.__gfx.gpu.name) || '?');
}

function init() {
  if (saved) setFps(true);
  if (D) {
    Promise.resolve(D.getSettings()).then(s => { if (s) Object.assign(ds, s); sync(); }).catch(() => { });
    if (D.versions) Promise.resolve(D.versions()).then(v => { if (v && v.app) { appVersion = v.app; const e = document.getElementById('dVer'); if (e) e.textContent = verText(); } }).catch(() => { });
    // the WebGL renderer string names the GPU actually drawing the game (ANGLE (NVIDIA, …) on Windows)
    setTimeout(() => { const g = window.__gfx && window.__gfx.gpu; if (g && g.name) { gpuName = g.name.replace(/^ANGLE \((.*)\)$/, '$1').replace(/\s*\(0x[0-9a-f]+\)/ig, '').replace(/,?\s*(Direct3D|OpenGL|Vulkan|Metal).*$/i, '').replace(/^[^,()]+,\s*/, ''); sync(); } }, 3000);
  }
  let tries = 0;
  const tick = () => { if (!addRows() && ++tries < 60) setTimeout(tick, 500); };
  tick();
}
if (document.readyState === 'loading') addEventListener('DOMContentLoaded', init); else init();
