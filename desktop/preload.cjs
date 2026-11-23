// Tiny bridge for the menu: "Esci" closes the app, fullscreen toggle. Nothing else is exposed.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('bigalessoDesktop', {
  quit: () => ipcRenderer.send('bigalesso:quit'),
  toggleFullscreen: () => ipcRenderer.send('bigalesso:fullscreen'),
  platform: process.platform,
});
