// Fenmyr for Linux: an Electron window around the canvas in web/. This side handles what a web page can't:
// saving boards as files, fetching link previews, exporting, writing out voice memos, and asking Myra (Claude Code, run locally with `claude -p`).
// It answers the page's messages (web/bridge.js → window.fenmyrHost).
const fs = require('fs'), path = require('path'), { execFile } = require('child_process');
const { app, BrowserWindow, ipcMain, shell, protocol, Menu, session, dialog } = require('electron');
const P = require('./paths'), storage = require('./storage'), vault = require('./vault'), claude = require('./claude'), net = require('./net');
const output = require('./output'), speech = require('./speech'), update = require('./update'), theme = require('./theme');

app.setName('Fenmyr');
if (process.platform === 'linux') app.setDesktopName('fenmyr.desktop');
// one Fenmyr at a time: opening it again brings the open one forward
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
protocol.registerSchemesAsPrivileged([{ scheme: 'fenmyrmedia', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true, bypassCSP: true } }]);

let win = null;

// ---- the window: no title bar (the page fills it, like on the Mac); it draws its own small window buttons and drag strip ----
function bounds() {
  try { const b = JSON.parse(fs.readFileSync(P.windowFile, 'utf8')); if (b.width >= 380 && b.height >= 520) return b; } catch (e) {}
  return { width: 1440, height: 900 };
}
function saveBounds() {
  if (!win || win.isDestroyed()) return;
  try { fs.writeFileSync(P.windowFile, JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() })); } catch (e) {}
}
function createWindow() {
  const b = bounds();
  win = new BrowserWindow({
    ...b, minWidth: 380, minHeight: 520,   // narrow enough to sit beside other apps; below 700 wide it switches to the phone layout
    // Linux: no frame, the page draws its own dots. Mac: the real traffic lights, sitting where those dots would be
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hidden', trafficLightPosition: { x: 14, y: 12 } } : { frame: false }), show: false, title: 'Fenmyr', backgroundColor: '#faf7f2',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, spellcheck: true },
  });
  if (b.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.on('close', saveBounds);
  win.loadFile(path.join(P.web, 'index.html'));
  const wc = win.webContents;
  // links on the board open in the browser, not inside the app
  wc.on('will-navigate', (e, url) => { if (/^https?:/i.test(url)) { e.preventDefault(); shell.openExternal(url); } });
  wc.setWindowOpenHandler(({ url }) => { if (/^(https?|mailto):/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  // keys a Linux app is expected to know (there's no menu bar); everything else goes to the canvas.
  // (No Ctrl+M to minimize: tiling compositors like Hyprland have no minimize, and Chromium then thinks the window is hidden and stops painting it.)
  wc.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return;
    const k = i.key.toLowerCase();
    if (i.control && !i.shift && k === 'q') { e.preventDefault(); app.quit(); }
    else if (k === 'f12' || (i.control && i.shift && k === 'i')) { e.preventDefault(); wc.toggleDevTools(); }
    else if (k === 'f11') { e.preventDefault(); win.setFullScreen(!win.isFullScreen()); }
  });
}

// ---- messages from the page: {id, op, args}; answered with __fenmyrReply(id, ok, value) (preload.js passes it in) ----
const reply = (wc, id, ok, value) => { if (!wc.isDestroyed()) wc.send('fenmyr-reply', id, ok, value === undefined ? null : value); };
const OPS = {
  list: () => storage.list(), load: a => storage.load(a.id), save: a => storage.save(a.board), remove: a => storage.remove(a.id),
  templates: () => storage.templates(), saveTemplate: a => storage.saveTemplate(a.template), removeTemplate: a => storage.removeTemplate(a.id),
  // Obsidian vaults (read-only): connect folders, and read notes only where a grant allows
  vaults: () => vault.vaults(),
  vaultPick: async () => { const r = await dialog.showOpenDialog(win, { title: 'Choose your Obsidian vault', properties: ['openDirectory'] }); return r.canceled ? null : r.filePaths[0]; },
  vaultAdd: a => vault.add(a.path), vaultUpdate: a => vault.update(a.id, a.patch || {}), vaultRemove: a => vault.remove(a.id), vaultScan: a => vault.scan(vault.byId(a.id)),
  vaultSearch: a => vault.search(vault.byId(a.id), a.allow, a.query),
  vaultNotes: a => vault.list(vault.byId(a.id), a.allow, a.query),
  vaultNote: a => { const v = vault.byId(a.id), n = vault.note(v, a.rel, a.allow, !!a.full); n.url = vault.obsidianURL(v, a.rel); return n; },
  folders: () => storage.folders(), saveFolders: a => storage.saveFolders(a.folders),
  caelestia: () => theme.read(),
  // Chromium's (and Node's) licenses ship with Electron as LICENSES.chromium.html, next to the Electron program
  chromiumLicenses: async () => {
    const f = [path.dirname(process.execPath), process.resourcesPath && path.dirname(process.resourcesPath)].filter(Boolean).map(d => path.join(d, 'LICENSES.chromium.html')).find(f => fs.existsSync(f));
    if (!f) throw new Error("Chromium's licence file isn't next to Electron in this copy."); const err = await shell.openPath(f); if (err) throw new Error(err); return true;
  },
  usage: () => claude.usageSummary(), resetUsage: () => claude.resetUsage(), version: () => update.appVersion(),
  linkPreview: a => net.linkPreview(a.url || ''),
  fetchImage: async a => { const d = await net.fetchImage(a.url || ''); if (!d) throw new Error("couldn't load that image"); return d; },
  ask: a => claude.ask(a), rewrite: a => claude.rewrite(a), connections: () => claude.connections(),
  higgsQuote: a => claude.higgsQuote(a), higgsMake: a => claude.higgsMake(a), drawFill: a => claude.drawFill(a),
  export: a => output.exportRect(win, a), saveFile: a => output.saveFile(win, a), docPDF: a => output.docPDF(win, a),
  fonts: () => fonts(),
  speechAuth: () => speech.speechAuth(), transcribe: a => speech.transcribe(a.audio || ''),
  mediaBegin: a => storage.mediaBegin(a.ext), mediaChunk: a => storage.mediaChunk(a.name, a.data), mediaEnd: a => storage.mediaEnd(a.name),
  updateCheck: () => update.check(), updatePrepare: () => update.prepare(), updateNow: () => update.now(),
  reveal: () => { shell.showItemInFolder(P.boardsDir); return true; },
  openURL: a => { const u = String(a.url || ''); if (/^(https?|mailto|obsidian):/i.test(u)) shell.openExternal(u); return true; },
};
ipcMain.on('fenmyr', async (e, m) => {
  if (!m || typeof m.id !== 'number' || typeof m.op !== 'string') return;
  const fn = OPS[m.op];
  if (!fn) return reply(e.sender, m.id, false, `unknown op ${m.op}`);
  try { reply(e.sender, m.id, true, await fn(m.args || {})); }
  catch (err) { reply(e.sender, m.id, false, (err && err.message) || String(err)); }
});
ipcMain.on('win', (e, what) => {
  if (!win) return;
  if (what === 'minimize') win.minimize();
  else if (what === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
  else if (what === 'close') win.close();
});

// the font families installed on this computer, for notes, docs and Myra's type specimens
let fontCache = null;
function fonts() {
  if (fontCache) return fontCache;
  if (process.platform === 'darwin') return fontCache = new Promise(res => execFile('system_profiler', ['SPFontsDataType', '-json', '-detailLevel', 'mini'], { maxBuffer: 256 << 20, timeout: 30000 }, (err, out) => {
    const names = new Set(['DM Sans', 'Caveat']);
    try { (JSON.parse(String(out)).SPFontsDataType || []).forEach(f => (f.typefaces || []).forEach(t => t.family && !t.family.startsWith('.') && names.add(t.family))); } catch (e) {}
    res([...names].sort((a, b) => a.localeCompare(b)));
  }));
  return fontCache = new Promise(res => execFile('fc-list', [':', 'family'], { maxBuffer: 16 << 20 }, (err, out) => {
    const names = new Set(String(out || '').split('\n').map(l => l.split(',')[0].replace(/\\-/g, '-').trim()).filter(n => n && !n.startsWith('.')));
    ['DM Sans', 'Caveat'].forEach(n => names.add(n));   // the app's own fonts are always there
    res([...names].sort((a, b) => a.localeCompare(b)));
  }));
}

app.whenReady().then(() => {
  fs.mkdirSync(P.boardsDir, { recursive: true }); fs.mkdirSync(P.templatesDir, { recursive: true }); fs.mkdirSync(P.mediaDir, { recursive: true });
  setTimeout(() => storage.sweepMedia(), 3000);
  // the Mac needs a menu bar: it's where ⌘Q, ⌘C/⌘V/⌘Z in text and the window keys live. Linux has none
  Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]) : null);
  protocol.handle('fenmyrmedia', req => storage.serveMedia(req));
  // the microphone for voice memos, the camera for video cards, and the clipboard for copy/paste between boards
  const allowed = new Set(['media', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen']);
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(allowed.has(perm)));
  session.defaultSession.setPermissionCheckHandler((wc, perm) => allowed.has(perm));
  createWindow();
  theme.watch(s => win && !win.isDestroyed() && win.webContents.send('fenmyr-event', 'caelestia', s));
  storage.watchBoards(() => win && win.webContents.executeJavaScript('window.__boardsChanged && __boardsChanged()').catch(() => {}));
});
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { saveBounds(); update.onQuit(); });
