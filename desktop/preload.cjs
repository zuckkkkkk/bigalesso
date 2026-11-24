// Small bridge for the game menu: quit, fullscreen, desktop-only settings (uncapped FPS, fullscreen at start),
// restart, GPU info. Nothing else is exposed.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('bigalessoDesktop', {
  quit: () => ipcRenderer.send('bigalesso:quit'),
  toggleFullscreen: () => ipcRenderer.send('bigalesso:fullscreen'),
  getSettings: () => ipcRenderer.invoke('bigalesso:settings'),
  setSetting: (k, v) => ipcRenderer.invoke('bigalesso:set', k, v),
  gpuInfo: () => ipcRenderer.invoke('bigalesso:gpu'),
  relaunch: () => ipcRenderer.send('bigalesso:relaunch'),
  platform: process.platform,
});
