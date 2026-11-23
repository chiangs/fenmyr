// Boards, cards and zips for the tests of the Fenmyr zip, in memory.
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
