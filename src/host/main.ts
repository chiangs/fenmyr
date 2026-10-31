// Fenmyr's main process: the window around web/, and the things a page can't do (files, programs, the network, Claude Code).
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, session, shell, type WebContents } from 'electron';
import type { HostEvents, Ops } from '../shared/ops.ts';
import * as claude from './claude.ts';
import * as net from './net.ts';
import * as output from './output.ts';
import P from './paths.ts';
import * as speech from './speech.ts';
import * as storage from './storage.ts';
import * as theme from './theme.ts';
import * as update from './update.ts';
import { isRecord, readJSON, strings, text, type Untrusted } from './util.ts';
import * as vault from './vault.ts';

type Handlers = {
  [K in keyof Ops]: (args: Untrusted<Ops[K]['args']>) => Ops[K]['result'] | Promise<Ops[K]['result']>;
};

app.setName('Fenmyr');
if (process.platform === 'linux') app.setDesktopName('fenmyr.desktop');
// one Fenmyr at a time: opening it again brings the open one forward
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'fenmyrmedia',
    privileges: {
      standard: true,
      secure: true,
      stream: true,
      supportFetchAPI: true,
      corsEnabled: true,
      bypassCSP: true,
    },
  },
]);

let win: BrowserWindow | null = null;
function theWindow() {
  if (!win) throw new Error('The window is not open');
  return win;
}

function bounds() {
  const b = readJSON(P.windowFile);
  if (isRecord(b) && Number(b.width) >= 380 && Number(b.height) >= 520) {
    const place = typeof b.x === 'number' && typeof b.y === 'number' ? { x: b.x, y: b.y } : {};
    return { ...place, width: Number(b.width), height: Number(b.height), maximized: b.maximized === true };
  }
  return { width: 1440, height: 900, maximized: false };
}
function saveBounds() {
  if (!win || win.isDestroyed()) return;
  try {
    fs.writeFileSync(P.windowFile, JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }));
  } catch {}
}
function createWindow() {
  const { maximized, ...b } = bounds();
  const root = app.getAppPath();
  const w = new BrowserWindow({
    ...b,
    // narrow enough to sit beside other apps; below 700 wide it switches to the phone layout
    minWidth: 380,
    minHeight: 520,
    frame: false,
    show: false,
    title: 'Fenmyr',
    backgroundColor: '#faf7f2',
    icon: path.join(root, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(root, 'dist', 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      spellcheck: true,
    },
  });
  win = w;
  if (maximized) w.maximize();
  w.once('ready-to-show', () => w.show());
  w.on('close', saveBounds);
  w.loadFile(path.join(root, 'web', 'index.html'));
  const wc = w.webContents;
  // links on the board open in the browser, not inside the app
  wc.on('will-navigate', (e, url) => {
    if (/^https?:/i.test(url)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
  wc.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // No Ctrl+M to minimize: tiling compositors like Hyprland have no minimize, and Chromium then thinks the window is hidden and stops painting it.
  wc.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return;
    const k = i.key.toLowerCase();
    if (i.control && !i.shift && k === 'q') {
      e.preventDefault();
      app.quit();
    } else if (k === 'f12' || (i.control && i.shift && k === 'i')) {
      e.preventDefault();
      wc.toggleDevTools();
    } else if (k === 'f11') {
      e.preventDefault();
      w.setFullScreen(!w.isFullScreen());
    }
  });
}

function reply(wc: WebContents, id: number, ok: boolean, value: unknown) {
  if (!wc.isDestroyed()) wc.send('fenmyr-reply', id, ok, value === undefined ? null : value);
}
function send<K extends keyof HostEvents>(name: K, data: HostEvents[K]) {
  if (win && !win.isDestroyed()) win.webContents.send('fenmyr-event', name, data);
}

// the font families installed on this computer, for notes, docs and Myra's type specimens
let fontCache: Promise<string[]> | null = null;
function fonts() {
  fontCache ??= new Promise(res => {
    execFile('fc-list', [':', 'family'], { maxBuffer: 16 << 20 }, (_err, out) => {
      const names = new Set(
        String(out || '')
          .split('\n')
          .map(l => (l.split(',')[0] ?? '').replace(/\\-/g, '-').trim())
          .filter(n => n && !n.startsWith('.')),
      );
      // the app's own fonts are always there
      names.add('DM Sans');
      names.add('Caveat');
      res([...names].sort((a, b) => a.localeCompare(b)));
    });
  });
  return fontCache;
}

const OPS = {
  list: () => storage.list(),
  load: a => storage.load(text(a.id)),
  save: a => storage.save(a.board),
  remove: a => storage.remove(text(a.id)),
  templates: () => storage.templates(),
  saveTemplate: a => storage.saveTemplate(a.template),
  removeTemplate: a => storage.removeTemplate(text(a.id)),
  vaults: () => vault.vaults(),
  vaultPick: async () => {
    const r = await dialog.showOpenDialog(theWindow(), {
      title: 'Choose your Obsidian vault',
      properties: ['openDirectory'],
    });
    return r.canceled ? null : (r.filePaths[0] ?? null);
  },
  vaultAdd: a => vault.add(text(a.path)),
  vaultUpdate: a => vault.update(text(a.id), isRecord(a.patch) ? a.patch : {}),
  vaultRemove: a => vault.remove(text(a.id)),
  vaultScan: a => vault.scan(vault.byId(text(a.id))),
  vaultSearch: a => vault.search(vault.byId(text(a.id)), strings(a.allow), text(a.query)),
  vaultNotes: a => vault.list(vault.byId(text(a.id)), strings(a.allow), text(a.query)),
  vaultNote: a => {
    const v = vault.byId(text(a.id));
    const rel = text(a.rel);
    return { ...vault.note(v, rel, strings(a.allow), !!a.full), url: vault.obsidianURL(v, rel) };
  },
  folders: () => storage.folders(),
  saveFolders: a => storage.saveFolders(a.folders),
  caelestia: () => theme.read(),
  // Chromium's (and Node's) licenses ship with Electron as LICENSES.chromium.html, next to the Electron program
  chromiumLicenses: async () => {
    const dirs = [
      path.dirname(process.execPath),
      ...(process.resourcesPath ? [path.dirname(process.resourcesPath)] : []),
    ];
    const f = dirs.map(d => path.join(d, 'LICENSES.chromium.html')).find(file => fs.existsSync(file));
    if (!f) throw new Error("Chromium's licence file isn't next to Electron in this copy.");
    const err = await shell.openPath(f);
    if (err) throw new Error(err);
    return true as const;
  },
  usage: () => claude.usageSummary(),
  resetUsage: () => claude.resetUsage(),
  version: () => update.appVersion(),
  linkPreview: a => net.linkPreview(text(a.url)),
  fetchImage: async a => {
    const d = await net.fetchImage(text(a.url));
    if (!d) throw new Error("couldn't load that image");
    return d;
  },
  ask: a => claude.ask(a),
  rewrite: a => claude.rewrite(a),
  connections: () => claude.connections(),
  higgsQuote: a => claude.higgsQuote(a),
  higgsMake: a => claude.higgsMake(a),
  drawFill: a => claude.drawFill(a),
  export: a => output.exportRect(theWindow(), a),
  saveFile: a => output.saveFile(theWindow(), a),
  docPDF: a => output.docPDF(theWindow(), a),
  fonts: () => fonts(),
  speechAuth: () => speech.speechAuth(),
  transcribe: a => speech.transcribe(text(a.audio)),
  mediaBegin: a => storage.mediaBegin(text(a.ext)),
  mediaChunk: a => storage.mediaChunk(text(a.name), text(a.data)),
  mediaEnd: a => storage.mediaEnd(text(a.name)),
  updateCheck: () => update.check(),
  updatePrepare: () => update.prepare(),
  updateNow: () => update.now(),
  reveal: () => {
    shell.showItemInFolder(P.boardsDir);
    return true;
  },
  openURL: a => {
    const u = text(a.url);
    if (/^(https?|mailto|obsidian):/i.test(u)) shell.openExternal(u);
    return true;
  },
} satisfies Handlers;

const isOp = (op: string): op is keyof Ops => Object.hasOwn(OPS, op);
// every handler narrows its own arguments, so here they all take the same untrusted object
const dispatch = (op: keyof Ops, args: Record<string, unknown>): unknown => {
  const handler: (a: Record<string, unknown>) => unknown = OPS[op];
  return handler(args);
};

ipcMain.on('fenmyr', async (e, m: unknown) => {
  if (!isRecord(m) || typeof m.id !== 'number' || typeof m.op !== 'string') return;
  if (!isOp(m.op)) {
    reply(e.sender, m.id, false, `unknown op ${m.op}`);
    return;
  }
  try {
    reply(e.sender, m.id, true, await dispatch(m.op, isRecord(m.args) ? m.args : {}));
  } catch (err) {
    reply(e.sender, m.id, false, err instanceof Error && err.message ? err.message : String(err));
  }
});
ipcMain.on('win', (_e, what: unknown) => {
  if (!win) return;
  if (what === 'minimize') win.minimize();
  else if (what === 'maximize') {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  } else if (what === 'close') win.close();
});

app.whenReady().then(() => {
  fs.mkdirSync(P.boardsDir, { recursive: true });
  fs.mkdirSync(P.templatesDir, { recursive: true });
  fs.mkdirSync(P.mediaDir, { recursive: true });
  setTimeout(() => storage.sweepMedia(), 3000);
  Menu.setApplicationMenu(null);
  protocol.handle('fenmyrmedia', req => storage.serveMedia(req));
  // the microphone for voice memos, the camera for video cards, and the clipboard for copy/paste between boards
  const allowed = new Set(['media', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'notifications']);
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(allowed.has(perm)));
  session.defaultSession.setPermissionCheckHandler((_wc, perm) => allowed.has(perm));
  createWindow();
  theme.watch(s => send('caelestia', s));
  storage.watchBoards(() => send('boardsChanged', null));
});
app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  saveBounds();
  update.onQuit();
});
