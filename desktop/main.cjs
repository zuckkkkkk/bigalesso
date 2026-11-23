// BIGALESSO GAMES – desktop app (Electron).
// Serves the web build (desktop/app, made by `npm run desktop:prepare`) through a private app:// protocol:
// same behaviour as https (fetch, modules, WebGL, audio) without the file:// CORS limits.
// Online play / Claude: set BIGALESSO_SERVER=https://your-server (or "server" in desktop/config.json):
// the websocket goes to wss://…/ws and /api/* is forwarded to that server.
const { app, BrowserWindow, protocol, net, ipcMain, shell, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

// ---- GPU: always use the discrete/high-performance GPU and never fall back to the blocklist ----
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

const ROOT = path.join(__dirname, 'app');
const HOST = 'bigalesso';
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')); } catch (e) { }
const SERVER = String(process.env.BIGALESSO_SERVER || cfg.server || '').replace(/\/+$/, '');

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } }]);

function serve(req) {
  const u = new URL(req.url);
  if (SERVER && u.pathname.startsWith('/api/')) return net.fetch(SERVER + u.pathname + u.search, { method: req.method, headers: req.headers, body: req.body, duplex: 'half' });
  let p = decodeURIComponent(u.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) return new Response('forbidden', { status: 403 });
  return net.fetch(pathToFileURL(file).toString());
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 1024, minHeight: 600,
    backgroundColor: '#07030d', title: 'BIGALESSO GAMES', autoHideMenuBar: true, show: false,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false, spellcheck: false },
  });
  Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => { win.show(); if (cfg.fullscreen !== false) win.setFullScreen(true); });
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return;
    if (i.key === 'F11' || (i.key === 'Enter' && i.alt)) { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if (i.key === 'F12' && process.env.BIGALESSO_DEVTOOLS) win.webContents.toggleDevTools();
  });
  // links to the outside world open in the system browser
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://' + HOST)) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  const q = SERVER ? '?server=' + encodeURIComponent(SERVER.replace(/^http/, 'ws') + '/ws') : '';
  win.loadURL(`app://${HOST}/index.html${q}`);
  return win;
}

const single = app.requestSingleInstanceLock();
if (!single) app.quit();
else {
  app.on('second-instance', () => { const w = BrowserWindow.getAllWindows()[0]; if (w) { if (w.isMinimized()) w.restore(); w.focus(); } });
  app.whenReady().then(() => {
    protocol.handle('app', serve);
    ipcMain.on('bigalesso:quit', () => app.quit());
    ipcMain.on('bigalesso:fullscreen', e => { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.setFullScreen(!w.isFullScreen()); });
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  app.on('window-all-closed', () => app.quit());
}
