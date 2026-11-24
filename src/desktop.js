// FPS counter for everyone + desktop-app settings (Electron, window.bigalessoDesktop).
// - "Mostra FPS" in Impostazioni (or F3): small counter top-right with frame rate, frame time and the worst frame of
//   the last half second (spikes = stutters). Saved in localStorage.
// - Desktop app only: "FPS illimitati" (no vsync / frame cap, applied on restart), "Schermo intero all'avvio",
//   and the graphics card in use (to check that the dedicated GPU is the one running the game).
// Rows are injected into the settings page, so ui.js stays untouched. Toggles reuse the .tog style with their
// own data-dset attribute (ui.js only handles data-set).
const D = window.bigalessoDesktop || null;
const LS = 'bigalesso.fps';

// ---------------- FPS counter ----------------
let box = null, on = false, n = 0, t0 = 0, last = 0, worst = 0;
function loop(t) {
  if (!on) return;
  requestAnimationFrame(loop);
  if (last) { const dt = t - last; if (dt > worst) worst = dt; }
  last = t; n++;
  if (!t0) t0 = t;
  if (t - t0 >= 500) {
    const fps = n * 1000 / (t - t0);
    box.textContent = `${Math.round(fps)} FPS · ${(1000 / fps).toFixed(1)} ms · picco ${Math.round(worst)} ms`;
    box.style.color = fps >= 55 ? '#9effa0' : fps >= 30 ? '#ffd166' : '#ff6b6b';
    n = 0; t0 = t; worst = 0;
  }
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
  if (e.key !== 'F3' || e.repeat) return;
  const a = document.activeElement; if (a && /^(INPUT|TEXTAREA)$/.test(a.tagName)) return;
  e.preventDefault(); setFps(!on);
});

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
  let html = tog('fps', 'Mostra FPS', 'Contatore in alto a destra (anche con F3). "Picco" alto = scatti');
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
    // the WebGL renderer string names the GPU actually drawing the game (ANGLE (NVIDIA, …) on Windows)
    setTimeout(() => { const g = window.__gfx && window.__gfx.gpu; if (g && g.name) { gpuName = g.name.replace(/^ANGLE \((.*)\)$/, '$1').replace(/\s*\(0x[0-9a-f]+\)/ig, '').replace(/,?\s*(Direct3D|OpenGL|Vulkan|Metal).*$/i, '').replace(/^[^,()]+,\s*/, ''); sync(); } }, 3000);
  }
  let tries = 0;
  const tick = () => { if (!addRows() && ++tries < 60) setTimeout(tick, 500); };
  tick();
}
if (document.readyState === 'loading') addEventListener('DOMContentLoaded', init); else init();
