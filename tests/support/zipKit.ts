// Boards, cards and zips for the tests of the Fenmyr zip, in memory.
import type { ElectronApplication, Page } from 'playwright';
import type { AppBuild } from '../../src/shared/buildStamp.ts';
import { jsonBytes, type Manifest, makeManifest, packZip } from '../../src/shared/fenmyrZip.ts';

export const build: AppBuild = {
  version: '1.1.0-beta.1',
  commit: 'a'.repeat(40),
  changes: true,
  builtAt: null,
  install: 'checkout',
  platform: 'linux',
  arch: 'x64',
  electron: null,
  chrome: null,
  prerelease: true,
  short: 'aaaaaaa',
};
export const rec = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? { ...v } : {});
export const card = (id: string, type: string, more: Record<string, unknown> = {}) => ({
  id,
  type,
  x: 0,
  y: 0,
  w: 100,
  h: 80,
  ...more,
});
export const manifestFor = (boards: string[], media: string[] = [], root = boards[0] ?? 'b1'): Manifest =>
  makeManifest(
    { kind: 'board', id: root },
    { boards, media, left: { videos: 0, chats: false, vaultText: 0, missingCanvases: 0 } },
    build,
  );
export const zipOf = (manifest: unknown, boards: Record<string, unknown>) =>
  packZip({
    'fenmyr.json': jsonBytes(manifest),
    ...Object.fromEntries(Object.entries(boards).map(([id, b]) => [`boards/${id}.json`, jsonBytes(b)])),
  });
export const board = (id: string, more: Record<string, unknown> = {}) => ({
  id,
  name: id,
  cards: [],
  links: [],
  tray: [],
  ...more,
});
export const text = (s: string) => new TextEncoder().encode(s);
export const byId = (b: Record<string, unknown>, id: string) =>
  (Array.isArray(b.cards) ? b.cards : []).map(rec).find(c => c.id === id) ?? {};

// a host operation as the page posts it, with the reply or the refusal it gave
export async function hostOp(page: Page, name: string, args: Record<string, unknown>) {
  return page.evaluate(
    ([name, args]) =>
      new Promise<{ ok: boolean; value: unknown }>(res => {
        const id = 1_000_000 + Math.floor(Math.random() * 1_000_000),
          before = window.__fenmyrReply;
        window.__fenmyrReply = (i, ok, value) => {
          if (i !== id) return before?.(i, ok, value);
          window.__fenmyrReply = before;
          res({ ok, value });
        };
        window.fenmyrHost?.post({ id, op: name, args });
      }),
    [name, args] as const,
  );
}

// the dialogs answer for the person: save to this file, and open this one (or neither, as if they changed their mind)
export const dialogsAnswer = (app: ElectronApplication, saveAs: string | null, open: string | null) =>
  app.evaluate(
    ({ dialog }, [saveAs, open]) => {
      dialog.showSaveDialog = async (...a: unknown[]) => {
        const first = a.find(x => !!x && typeof x === 'object' && 'defaultPath' in x);
        Reflect.set(
          globalThis,
          'asked',
          first && typeof first === 'object' && 'defaultPath' in first ? first.defaultPath : '',
        );
        return saveAs ? { canceled: false, filePath: saveAs } : { canceled: true, filePath: '' };
      };
      dialog.showOpenDialog = async () =>
        open ? { canceled: false, filePaths: [open] } : { canceled: true, filePaths: [] };
    },
    [saveAs, open] as const,
  );
// where the save dialog was last asked to start
export const dialogAsked = (app: ElectronApplication) => app.evaluate(() => String(Reflect.get(globalThis, 'asked')));
