// The desktop app (docs/offline.md): Electron shows the built game (dist/, shipped beside the app as resources/dist)
// from app://alaas/, a secure origin of its own: module workers, WebGPU and localStorage work as on the web.
import { app, BrowserWindow, Menu, net, protocol, shell } from 'electron';
import { join, normalize, sep } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = app.isPackaged ? join(process.resourcesPath, 'dist') : fileURLToPath(new URL('../dist', import.meta.url));
const ORIGIN = 'app://alaas';

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } }]);
if (process.platform === 'linux') { // Chromium keeps WebGPU off on Linux; without it the game falls back to WebGL2
  app.commandLine.appendSwitch('enable-unsafe-webgpu');
  app.commandLine.appendSwitch('enable-features', 'Vulkan');
}

const HIDDEN = !!process.env.ALAAS_HIDDEN; // headless checks: no window, no dock icon; ALAAS_QUERY = the page's flags
if (HIDDEN) app.dock?.hide();

function open() {
  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 640, minHeight: 400, backgroundColor: '#21160f', show: !HIDDEN,
    webPreferences: { backgroundThrottling: false },
  });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^(https?|mailto):/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(ORIGIN + '/')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  win.webContents.on('before-input-event', (e, k) => { // Windows and Linux have no menu here
    if (k.type === 'keyDown' && (k.key === 'F11' || (k.key === 'Enter' && k.alt))) { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
  win.loadURL(ORIGIN + '/' + (process.env.ALAAS_QUERY || ''));
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { const w = BrowserWindow.getAllWindows()[0]; if (w) { if (w.isMinimized()) w.restore(); w.focus(); } });
  app.on('window-all-closed', () => app.quit());
  app.whenReady().then(() => {
    protocol.handle('app', (req) => {
      const path = normalize(join(ROOT, decodeURIComponent(new URL(req.url).pathname)));
      if (path !== ROOT && !path.startsWith(ROOT + sep)) return new Response(null, { status: 403 });
      return net.fetch(pathToFileURL(path === ROOT || path.endsWith(sep) ? join(path, 'index.html') : path).href);
    });
    if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
    open();
  });
}
