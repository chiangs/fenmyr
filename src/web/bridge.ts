import type { Board, StoredBoard } from '../shared/model.ts';
import { storedBoard } from '../shared/model.ts';
import type { Ops } from '../shared/ops.ts';

declare global {
  interface Window {
    fenmyrHost?: { post(msg: unknown): void };
    __fenmyrReply?: (id: number, ok: boolean, value: unknown) => void;
  }
}

type Waiting = { res: (value: never) => void; rej: (err: Error) => void };
type Progress = (share: number) => void;
type IndexRow = { id: string };
type PretendBoard = { cards: { type: string; id: string; x: number; y: number }[] };

// The bridge between the canvas and wherever it's running.
// Inside the desktop app, calls go to its host (src/host/main.ts: saving board files, link previews, asking Myra through Claude Code).
// In a plain browser (for building and demos) it falls back to localStorage and a pretend Myra.
(() => {
  const native = !!window.fenmyrHost;
  const platform = native ? 'linux' : 'web';
  const waiting = new Map<number, Waiting>();
  let seq = 0;
  // the host answers with window.__fenmyrReply(id, ok, value)
  window.__fenmyrReply = (id, ok, value) => {
    const w = waiting.get(id);
    if (!w) return;
    waiting.delete(id);
    if (ok) (w.res as (v: unknown) => void)(value);
    else w.rej(new Error(String(value)));
  };
  const call = <K extends keyof Ops>(op: K, args?: Ops[K]['args']) =>
    new Promise<Ops[K]['result']>((res, rej) => {
      const id = ++seq;
      waiting.set(id, { res, rej });
      window.fenmyrHost?.post({ id, op, args: args ?? {} });
    });

  const LS = 'fenmyr:';
  const VIDEO_EXT: Record<string, string> = {
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
    'video/x-m4v': 'm4v',
  };
  const extOf = (blob: Blob) =>
    VIDEO_EXT[(blob.type || '').split(';')[0] ?? ''] ||
    (blob instanceof File ? blob.name : '').split('.').pop() ||
    'mp4';
  const b64 = (slice: Blob) =>
    new Promise<string>((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result).split(',')[1] || '');
      fr.onerror = rej;
      fr.readAsDataURL(slice);
    });
  async function saveMediaNative(blob: Blob, onProgress?: Progress) {
    const name = await call('mediaBegin', { ext: extOf(blob) }),
      STEP = 3 * 1024 * 1024;
    for (let i = 0; i < blob.size; i += STEP) {
      await call('mediaChunk', { name, data: await b64(blob.slice(i, i + STEP)) });
      onProgress && onProgress(Math.min(1, (i + STEP) / blob.size));
    }
    return call('mediaEnd', { name });
  }
  // in a browser: IndexedDB keeps the video; the card stores "idbmedia:<id>" and gets a blob URL when it's shown
  const idb = () =>
    new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('fenmyr-media', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('media');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  const blobURLs = new Map<string, string>();
  async function saveMediaBrowser(blob: Blob) {
    const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
      db = await idb();
    await new Promise<void>((res, rej) => {
      const t = db.transaction('media', 'readwrite');
      t.objectStore('media').put(blob, id);
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
    blobURLs.set('idbmedia:' + id, URL.createObjectURL(blob));
    return 'idbmedia:' + id;
  }
  async function mediaURL(src: string) {
    if (!src || !String(src).startsWith('idbmedia:')) return src;
    if (blobURLs.has(src)) return blobURLs.get(src);
    const db = await idb(),
      blob = await new Promise<Blob | null>(res => {
        const r = db.transaction('media').objectStore('media').get(src.slice(9));
        r.onsuccess = () => res(r.result);
        r.onerror = () => res(null);
      });
    if (!blob) return '';
    const u = URL.createObjectURL(blob);
    blobURLs.set(src, u);
    return u;
  }
  // the web demo: a real website (or ?web) can't reach Claude Code, Mobbin or Higgsfield on the visitor's computer
  const web =
    !native && (!/^(localhost|127\.0\.0\.1|\[::1\]|)$/.test(location.hostname) || /[?&]web\b/.test(location.search));
  const browser = {
    async list() {
      return JSON.parse(localStorage.getItem(LS + 'index') || '[]');
    },
    async load(id: string): Promise<StoredBoard | null> {
      const s = localStorage.getItem(LS + 'board:' + id);
      return s ? JSON.parse(s) : null;
    },
    async save(unsaved: StoredBoard) {
      const board = storedBoard(unsaved);
      localStorage.setItem(LS + 'board:' + board.id, JSON.stringify(board));
      const idx = JSON.parse(localStorage.getItem(LS + 'index') || '[]').filter((b: IndexRow) => b.id !== board.id);
      idx.unshift({
        id: board.id,
        name: board.name,
        color: board.color,
        folder: board.folder || null,
        parent: board.parent || null,
        updated: Date.now(),
      });
      localStorage.setItem(LS + 'index', JSON.stringify(idx));
      return true;
    },
    async templates() {
      return JSON.parse(localStorage.getItem(LS + 'templates') || '[]');
    },
    async saveTemplate(t: IndexRow) {
      const all = JSON.parse(localStorage.getItem(LS + 'templates') || '[]').filter((x: IndexRow) => x.id !== t.id);
      all.push(t);
      localStorage.setItem(LS + 'templates', JSON.stringify(all));
      return true;
    },
    async removeTemplate(id: string) {
      localStorage.setItem(
        LS + 'templates',
        JSON.stringify(JSON.parse(localStorage.getItem(LS + 'templates') || '[]').filter((x: IndexRow) => x.id !== id)),
      );
      return true;
    },
    // vaults are folders on a computer; a browser can't read them
    async vaults() {
      return [];
    },
    async vaultPick() {
      return null;
    },
    async vaultAdd() {
      throw new Error('Connecting a vault works in the desktop app');
    },
    async vaultUpdate() {
      return null;
    },
    async vaultRemove() {
      return true;
    },
    async vaultScan() {
      return { folders: [], notes: 0 };
    },
    async vaultSearch() {
      return [];
    },
    async vaultNotes() {
      return [];
    },
    async vaultNote() {
      throw new Error('Vault notes work in the desktop app');
    },
    async folders() {
      return JSON.parse(localStorage.getItem(LS + 'folders') || '[]');
    },
    async saveFolders(folders: unknown) {
      localStorage.setItem(LS + 'folders', JSON.stringify(folders));
      return true;
    },
    async remove(id: string) {
      localStorage.removeItem(LS + 'board:' + id);
      localStorage.setItem(
        LS + 'index',
        JSON.stringify(JSON.parse(localStorage.getItem(LS + 'index') || '[]').filter((b: IndexRow) => b.id !== id)),
      );
      return true;
    },
    web,
    getURL: 'https://github.com/chiangs/fenmyr/releases/latest',
    async connections() {
      return { claude: false, mobbin: false, higgsfield: false, browser: true, web };
    },
    async caelestia() {
      return null;
    },
    async usage() {
      return null;
    },
    async resetUsage() {
      return true;
    },
    async version() {
      return null;
    },
    async fetchImage(url: string) {
      return url;
    },
    saveMedia: (blob: Blob, _onProgress?: Progress) => saveMediaBrowser(blob),
    mediaURL,
    async openURL(url: string) {
      window.open(url, '_blank');
    },
    async speechAuth() {
      return 'ok';
    },
    async higgsQuote() {
      throw new Error('Higgsfield works in the desktop app');
    },
    async higgsMake() {
      throw new Error('Higgsfield works in the desktop app');
    },
    async drawFill() {
      throw new Error('Drawing illustrations works in the desktop app');
    },
    async fonts() {
      return [
        'DM Sans',
        'Caveat',
        'Inter',
        'Helvetica Neue',
        'Arial',
        'Georgia',
        'Times New Roman',
        'Courier New',
        'SF Pro Display',
        'Avenir Next',
        'Futura',
        'Menlo',
      ];
    },
    async exportRect() {
      throw new Error('Exporting works in the desktop app');
    },
    async transcribe() {
      throw new Error('Writing out voice memos works in the desktop app');
    },
    async rewrite() {
      throw new Error('Myra rewrites text with Claude in the desktop app');
    },
    // in a browser: an ordinary download
    async saveFile(data: string, name: string, ext: string) {
      const bin = atob(data),
        u8 = Uint8Array.from(bin, c => c.charCodeAt(0));
      const a = document.createElement('a');
      a.href = URL.createObjectURL(
        new Blob([u8], {
          type:
            ext === 'docx'
              ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
              : 'application/octet-stream',
        }),
      );
      a.download = `${name}.${ext}`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(a.href);
        a.remove();
      }, 4000);
      return `${name}.${ext}`;
    },
    // in a browser: print the doc in a hidden frame, and the browser's own "Save as PDF" does the rest
    async docPDF(html: string) {
      const f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0';
      document.body.appendChild(f);
      f.srcdoc = html.replace(/__WEB__\//g, location.href.replace(/[^/]*$/, ''));
      await new Promise(r => {
        f.onload = r;
      });
      await f.contentDocument?.fonts?.ready;
      f.contentWindow?.focus();
      f.contentWindow?.print();
      setTimeout(() => f.remove(), 60000);
      return '';
    },
    async reveal() {
      alert('Your boards live in this browser while you try Fenmyr here. In the desktop app this opens their folder.');
    },
    async linkPreview(url: string) {
      let host = url;
      try {
        host = new URL(url).hostname.replace(/^www\./, '');
      } catch (e) {}
      return { title: host, desc: url, image: '' };
    },
    // a pretend Myra for the browser: she still tidies things up so the canvas can be tried without the app
    async ask(prompt: string, board: PretendBoard) {
      await new Promise(r => setTimeout(r, 900));
      const notes = board.cards.filter(c => c.type === 'note');
      if (/group|sort|organi[sz]e|tidy/i.test(prompt) && notes.length) {
        const cx = Math.min(...board.cards.map(c => c.x)),
          cy = Math.min(...board.cards.map(c => c.y));
        return JSON.stringify({
          say: `I lined up your ${notes.length} notes into one tidy column. (In the desktop app I'd really sort them by theme with Claude.)`,
          titles: [{ text: 'Sorted', x: cx, y: cy - 90 }],
          move: notes.map((n, i) => ({ id: n.id, x: cx + (i % 3) * 250, y: cy + Math.floor(i / 3) * 170 })),
        });
      }
      return JSON.stringify({
        say: "Here's a little starter set! (This is pretend Myra in the browser. In the desktop app I think with Claude Code.)",
        add: [
          { type: 'note', text: 'What is this for?', color: 'butter' },
          { type: 'note', text: 'Who will see it?', color: 'mint' },
          { type: 'note', text: 'What does done look like?', color: 'lilac' },
        ],
      });
    },
  };
  const api = native
    ? {
        native: true,
        platform,
        list: () => call('list'),
        load: (id: string) => call('load', { id }),
        save: (board: Board | StoredBoard) => call('save', { board: storedBoard(board) }),
        remove: (id: string) => call('remove', { id }),
        templates: () => call('templates'),
        saveTemplate: (template: Ops['saveTemplate']['args']['template']) => call('saveTemplate', { template }),
        removeTemplate: (id: string) => call('removeTemplate', { id }),
        vaults: () => call('vaults'),
        vaultPick: () => call('vaultPick'),
        vaultAdd: (path: string) => call('vaultAdd', { path }),
        vaultUpdate: (id: string, patch: Ops['vaultUpdate']['args']['patch']) => call('vaultUpdate', { id, patch }),
        vaultRemove: (id: string) => call('vaultRemove', { id }),
        vaultScan: (id: string) => call('vaultScan', { id }),
        vaultSearch: (id: string, allow: string[], query: string) => call('vaultSearch', { id, allow, query }),
        vaultNotes: (id: string, allow: string[], query: string) => call('vaultNotes', { id, allow, query }),
        vaultNote: (id: string, rel: string, allow: string[], full?: boolean) =>
          call('vaultNote', { id, rel, allow, ...(full === undefined ? {} : { full }) }),
        folders: () => call('folders'),
        saveFolders: (folders: unknown) => call('saveFolders', { folders }),
        caelestia: () => call('caelestia'),
        chromiumLicenses: () => call('chromiumLicenses'),
        usage: () => call('usage'),
        resetUsage: () => call('resetUsage'),
        version: () => call('version'),
        linkPreview: (url: string) => call('linkPreview', { url }),
        rewrite: (text: string, how: string, title: string, around: string) =>
          call('rewrite', { text, how, title, around }),
        docPDF: (html: string, name: string, paper: 'a4' | 'letter') => call('docPDF', { html, name, paper }),
        saveFile: (data: string, name: string, ext: string) => call('saveFile', { data, name, ext }),
        ask: (
          prompt: string,
          board: Ops['ask']['args']['board'],
          confirmed = false,
          opts: Partial<Ops['ask']['args']> = {},
        ) => call('ask', { prompt, board, confirmed, ...opts }),
        saveMedia: (blob: Blob, onProgress?: Progress) => saveMediaNative(blob, onProgress),
        mediaURL: async (src: string) => src,
        connections: () => call('connections'),
        fetchImage: (url: string) => call('fetchImage', { url }),
        openURL: (url: string) => call('openURL', { url }),
        reveal: () => call('reveal'),
        transcribe: (audio: string) => call('transcribe', { audio }),
        speechAuth: () => call('speechAuth'),
        exportRect: (o: Ops['export']['args']) => call('export', o),
        fonts: () => call('fonts'),
        higgsQuote: (o?: Ops['higgsQuote']['args']) => call('higgsQuote', o ?? {}),
        updateCheck: () => call('updateCheck'),
        updateNow: () => call('updateNow'),
        updatePrepare: () => call('updatePrepare'),
        higgsMake: (o: Ops['higgsMake']['args']) => call('higgsMake', o),
        drawFill: (o: Ops['drawFill']['args']) => call('drawFill', o),
      }
    : Object.assign({ native: false, platform }, browser);
  window.Fenmyr = api;
})();
