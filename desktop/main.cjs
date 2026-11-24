// BIGALESSO GAMES – desktop app (Electron).
// Serves the web build (desktop/app, made by `node prepare.mjs`) through a private app:// protocol:
// same behaviour as https (fetch, WebGL, audio, video) without the file:// limits, and assets come straight from disk.
// Online play / Claude: "server" in config.json (the GitHub build fills it from the BIGALESSO_SERVER variable),
// the BIGALESSO_SERVER env var or settings.json in the user data folder: the websocket goes to wss://…/ws and
// /api/* is forwarded to that server.
// Performance: dedicated GPU (Windows graphics preference + macOS switch), no blocklist, no background throttling,
// bigger JS heap; optional uncapped frame rate (no vsync) from the game's settings, applied on restart.
const { app, BrowserWindow, protocol, net, ipcMain, shell, Menu, screen, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { Readable } = require('node:stream');
const { pathToFileURL } = require('node:url');
const { execFile } = require('node:child_process');

const ROOT = path.join(__dirname, 'app');
const HOST = 'bigalesso';

// ---- settings: config.json (shipped defaults) + settings.json in userData (the player's choices, survive updates) ----
let cfg = {};
for (const f of ['config.json', 'config.build.json']) { // config.build.json: written by prepare.mjs from BIGALESSO_SERVER at build time
  try { Object.assign(cfg, JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'))); } catch (e) { }
}
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');
let user = {};
try { user = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) || {}; } catch (e) { }
const setting = k => (k in user ? user[k] : cfg[k]);
const SERVER = String(process.env.BIGALESSO_SERVER || setting('server') || '').trim().replace(/\/+$/, '');
const UNCAPPED = process.env.BIGALESSO_UNCAPPED === '1' || setting('uncapFps') === true;

// ---- GPU / CPU: these must be set before the app is ready ----
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('force_high_performance_gpu'); // macOS dual-GPU
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion'); // Windows: no throttling when another window covers part of the game
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096'); // room for models + textures without GC pressure
if (UNCAPPED) { app.commandLine.appendSwitch('disable-frame-rate-limit'); app.commandLine.appendSwitch('disable-gpu-vsync'); }

// Windows hybrid laptops (Intel + NVIDIA/AMD): ask Windows to run this exe on the high-performance GPU, like
// Settings → System → Display → Graphics → "High performance". The installer writes the same value; this covers
// the portable exe and moved installs. It takes effect from the next launch.
function preferDiscreteGPU() {
  if (process.platform !== 'win32') return;
  const key = 'HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences', exe = process.execPath;
  execFile('reg', ['query', key, '/v', exe], { windowsHide: true }, (err, out) => {
    if (!err && /GpuPreference=2/.test(String(out))) return;
    execFile('reg', ['add', key, '/v', exe, '/t', 'REG_SZ', '/d', 'GpuPreference=2;', '/f'], { windowsHide: true }, () => { });
  });
}

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } }]);

const VIDEO = { '.mp4': 'video/mp4', '.webm': 'video/webm' };
async function serveVideo(file, req, type) {
  let st; try { st = await fs.promises.stat(file); } catch (e) { return new Response('404', { status: 404 }); }
  const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes' };
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.get('range') || ''));
  if (m) { // byte ranges: the video element seeks and starts early with these
    const a = m[1] === '' ? Math.max(0, st.size - +m[2]) : +m[1];
    const b = m[1] !== '' && m[2] !== '' ? Math.min(+m[2], st.size - 1) : st.size - 1;
    if (a > b || a >= st.size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${st.size}` } });
    headers['Content-Range'] = `bytes ${a}-${b}/${st.size}`; headers['Content-Length'] = String(b - a + 1);
    return new Response(Readable.toWeb(fs.createReadStream(file, { start: a, end: b })), { status: 206, headers });
  }
  headers['Content-Length'] = String(st.size);
  return new Response(Readable.toWeb(fs.createReadStream(file)), { status: 200, headers });
}

function serve(req) {
  const u = new URL(req.url);
  if (u.pathname.startsWith('/api/')) {
    if (!SERVER) return new Response('{"enabled":false}', { status: 404, headers: { 'Content-Type': 'application/json' } });
    const h = new Headers(req.headers); h.delete('origin'); h.delete('referer');
    return net.fetch(SERVER + u.pathname + u.search, { method: req.method, headers: h, body: req.body, duplex: 'half' });
  }
  let p = decodeURIComponent(u.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT + path.sep)) return new Response('forbidden', { status: 403 });
  const vt = VIDEO[path.extname(file).toLowerCase()];
  if (vt) return serveVideo(file, req, vt);
  return net.fetch(pathToFileURL(file).toString()).catch(() => new Response('404', { status: 404 }));
}

function createWindow() {
  // never bigger than the screen (laptops at 125-150% scaling are ~1280-1536 px wide): a window wider than the work
  // area hangs off the edges and cuts the menu
  let wa = { width: 1600, height: 900 }; try { wa = screen.getPrimaryDisplay().workAreaSize; } catch (e) { }
  const W0 = Math.min(1600, wa.width), H0 = Math.min(900, wa.height);
  const win = new BrowserWindow({
    width: W0, height: H0, minWidth: Math.min(1024, W0), minHeight: Math.min(600, H0), center: true,
    backgroundColor: '#07030d', title: 'BIGALESSO GAMES', autoHideMenuBar: true, show: false,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true,
      backgroundThrottling: false, spellcheck: false, v8CacheOptions: 'bypassHeatCheck',
    },
  });
  Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => { win.show(); if (setting('fullscreen') !== false) win.setFullScreen(true); else win.maximize(); });
  win.on('leave-full-screen', () => { if (!win.isMaximized()) win.maximize(); }); // F11 out of fullscreen: a maximized window, not one hanging off the screen
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return;
    if (i.key === 'F11' || (i.key === 'Enter' && i.alt)) { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if (i.key === 'F12' && process.env.BIGALESSO_DEVTOOLS) win.webContents.toggleDevTools();
  });
  // links to the outside world open in the system browser
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://' + HOST)) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  let crashes = 0; // the page died (driver reset, out of memory): reload it a couple of times instead of leaving a white window
  win.webContents.on('render-process-gone', (e, d) => { if (d.reason !== 'clean-exit' && ++crashes <= 2) win.webContents.reload(); });
  const q = SERVER ? '?server=' + encodeURIComponent(SERVER.replace(/^http/, 'ws') + '/ws') : '';
  win.loadURL(`app://${HOST}/index.html${q}`);
  return win;
}

function saveUser(k, v) {
  user[k] = v;
  try { fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true }); fs.writeFileSync(SETTINGS_FILE, JSON.stringify(user, null, 2)); } catch (e) { }
}

const single = app.requestSingleInstanceLock();
if (!single) app.quit();
else {
  app.on('second-instance', () => { const w = BrowserWindow.getAllWindows()[0]; if (w) { if (w.isMinimized()) w.restore(); w.focus(); } });
  app.whenReady().then(() => {
    protocol.handle('app', serve);
    // the online server only accepts its own origin (older deploys don't know app://bigalesso yet): the websocket and
    // the /api calls to it go out with the server's own origin
    if (SERVER) try {
      const u = new URL(SERVER), wsBase = (u.protocol === 'https:' ? 'wss://' : 'ws://') + u.host;
      session.defaultSession.webRequest.onBeforeSendHeaders({ urls: [wsBase + '/*', u.origin + '/*'] }, (d, cb) => {
        const h = d.requestHeaders; for (const k of Object.keys(h)) if (k.toLowerCase() === 'origin') delete h[k];
        h.Origin = u.origin; cb({ requestHeaders: h });
      });
    } catch (e) { }
    ipcMain.on('bigalesso:quit', () => app.quit());
    ipcMain.on('bigalesso:fullscreen', e => { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.setFullScreen(!w.isFullScreen()); });
    ipcMain.handle('bigalesso:settings', () => ({ uncapFps: UNCAPPED, uncapFpsSaved: setting('uncapFps') === true, fullscreen: setting('fullscreen') !== false, server: SERVER, version: app.getVersion() }));
    ipcMain.handle('bigalesso:set', (e, k, v) => { if (k === 'uncapFps' || k === 'fullscreen') saveUser(k, !!v); return true; });
    ipcMain.handle('bigalesso:gpu', () => app.getGPUInfo('basic').catch(() => null));
    ipcMain.on('bigalesso:relaunch', () => { app.relaunch(); app.exit(0); });
    createWindow();
    preferDiscreteGPU();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  app.on('window-all-closed', () => app.quit());
}
