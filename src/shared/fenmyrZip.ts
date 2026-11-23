// The Fenmyr zip: what is in it, what is left out, and how a set of its files is read. Boards, folders and projects share
// this one format, so a zip never needs migrating. The host streams the zip to and from disk (src/host/fenmyrZip.ts);
// the browser and the tests build and open it here, whole, with the same checks.
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { AppBuild } from './buildStamp.ts';
import { heldMedia, KEEP_ALL, mediaNameIn, stripBoard, without } from './fenmyrStrip.ts';
import { isRecord, parseBoard, type StoredBoard } from './model.ts';

// bumped only when the layout changes; a zip with a higher number is refused
export const FORMAT = 1;
const MANIFEST = 'fenmyr.json';
// one board file or the manifest, once unpacked: more than a page can parse, and the bound on a zip bomb
export const JSON_LIMIT = 256 * 2 ** 20;

const ROOT_KINDS = ['board', 'folder', 'project'] as const;
export type RootKind = (typeof ROOT_KINDS)[number];
export type ExportProject = { id: string; name: string; color?: string; cover?: string };
export type ExportFolder = { id: string; name: string; project: string | null; parent: string | null; cover?: string };
// what the zip leaves out, for the line Myra says when it is opened
export type Left = { videos: number; chats: boolean; vaultText: number; missingCanvases: number };
export type Manifest = {
  fenmyr: 'export';
  format: number;
  app: string;
  commit: string | null;
  changes: boolean;
  platform: string;
  exportedAt: string;
  root: { kind: RootKind; id: string };
  projects: ExportProject[];
  folders: ExportFolder[];
  boards: string[];
  media: string[];
  left: Left;
};
// what was read from a zip: the boards after the checks, and what the checks dropped
export type ImportResult = { manifest: Manifest; boards: StoredBoard[]; skipped: number; missing: number };

export type Refusal = 'notZip' | 'newer' | 'unsafe' | 'later' | 'tooBig';
export const REFUSALS: Record<Refusal, string> = {
  notZip: "This isn't a Fenmyr zip.",
  newer: 'This zip is from a newer Fenmyr. Update Fenmyr to open it.',
  unsafe: "This zip has files in places it shouldn't, so I didn't open it.",
  later: "Folder and project zips aren't supported yet.",
  tooBig: 'That zip is over 4 GB, which is more than I can open.',
};
type Verdict<T> = { ok: true; value: T } | { ok: false; refusal: Refusal };
const yes = <T>(value: T): Verdict<T> => ({ ok: true, value });
const no = (refusal: Refusal): Verdict<never> => ({ ok: false, refusal });

// This build opens boards only; folder and project zips are read but not placed yet.
export function importable(kind: RootKind): Refusal | null {
  switch (kind) {
    case 'board':
      return null;
    case 'folder':
    case 'project':
      return 'later';
    default: {
      const never: never = kind;
      throw new Error(`unknown root ${String(never)}`);
    }
  }
}

const BOARD_FILE = /^boards\/([\p{L}\p{N}-]{1,64})\.json$/u;
const PLAIN = /^[\p{L}\p{N}][\p{L}\p{N}._-]{0,127}$/u;
const BOARD_ID = /^[\p{L}\p{N}-]{1,64}$/u;
export const plainName = (name: unknown): name is string => typeof name === 'string' && PLAIN.test(name);

const travels = (name: string) =>
  name.startsWith('/') || /^[A-Za-z]:/.test(name) || /[\\\0]/.test(name) || name.split('/').includes('..');
const place = (name: string): 'manifest' | 'board' | 'media' | 'dir' | null => {
  if (name === MANIFEST) return 'manifest';
  if (BOARD_FILE.test(name)) return 'board';
  if (name.startsWith('media/') && plainName(name.slice(6))) return 'media';
  return name === 'boards/' || name === 'media/' ? 'dir' : null;
};
export const isJson = (name: string) => place(name) === 'manifest' || place(name) === 'board';
export const mediaNameOf = (name: string) => (place(name) === 'media' ? name.slice(6) : null);

// Before anything is read or written. A name that leads out of the folder is refused whatever the zip is; a zip with no
// manifest is only not ours; one that is ours but holds a file outside the three places is refused.
export function nameRefusal(names: readonly string[]): Refusal | null {
  if (new Set(names).size !== names.length || names.some(travels)) return 'unsafe';
  if (!names.includes(MANIFEST)) return 'notZip';
  return names.every(n => place(n)) ? null : 'unsafe';
}

const text = (v: unknown, otherwise = '') => (typeof v === 'string' ? v : otherwise);
const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function readProject(x: unknown): ExportProject[] {
  if (!isRecord(x) || typeof x.id !== 'string' || typeof x.name !== 'string') return [];
  return [
    {
      id: x.id,
      name: x.name,
      ...(typeof x.color === 'string' ? { color: x.color } : {}),
      ...(typeof x.cover === 'string' ? { cover: x.cover } : {}),
    },
  ];
}
function readFolder(x: unknown): ExportFolder[] {
  if (!isRecord(x) || typeof x.id !== 'string' || typeof x.name !== 'string') return [];
  const ref = (v: unknown) => (typeof v === 'string' ? v : null);
  return [
    {
      id: x.id,
      name: x.name,
      project: ref(x.project),
      parent: ref(x.parent),
      ...(typeof x.cover === 'string' ? { cover: x.cover } : {}),
    },
  ];
}

// the root named in the manifest has to be one of the things it lists
function rootListed(
  kind: RootKind,
  id: string,
  boards: readonly string[],
  projects: ExportProject[],
  folders: ExportFolder[],
) {
  switch (kind) {
    case 'board':
      return boards.includes(id);
    case 'folder':
      return folders.some(f => f.id === id);
    case 'project':
      return projects.some(p => p.id === id);
    default: {
      const never: never = kind;
      throw new Error(`unknown root ${String(never)}`);
    }
  }
}

export function readManifest(raw: unknown): Verdict<Manifest> {
  if (!isRecord(raw) || raw.fenmyr !== 'export') return no('notZip');
  const format = raw.format;
  if (typeof format !== 'number' || !Number.isInteger(format) || format < 1) return no('notZip');
  if (format > FORMAT) return no('newer');
  const root = raw.root,
    kind = isRecord(root) ? ROOT_KINDS.find(k => k === root.kind) : undefined,
    boards = list(raw.boards),
    media = list(raw.media);
  if (!isRecord(root) || !kind || typeof root.id !== 'string') return no('notZip');
  // every name is checked here, so nothing built from the manifest can leave the three places
  if (!boards.every(id => typeof id === 'string' && BOARD_ID.test(id)) || !media.every(plainName)) return no('notZip');
  const ids = boards.filter(id => typeof id === 'string'),
    projects = list(raw.projects).flatMap(readProject),
    folders = list(raw.folders).flatMap(readFolder);
  if (!rootListed(kind, root.id, ids, projects, folders)) return no('notZip');
  const left = isRecord(raw.left) ? raw.left : {};
  return yes({
    fenmyr: 'export',
    format,
    app: text(raw.app),
    commit: typeof raw.commit === 'string' ? raw.commit : null,
    changes: raw.changes === true,
    platform: text(raw.platform),
    exportedAt: text(raw.exportedAt),
    root: { kind, id: root.id },
    projects,
    folders,
    boards: ids,
    media: media.filter(plainName),
    left: {
      videos: count(left.videos),
      chats: left.chats === true,
      vaultText: count(left.vaultText),
      missingCanvases: count(left.missingCanvases),
    },
  });
}

export function makeManifest(
  root: Manifest['root'],
  made: { boards: string[]; media: string[]; left: Left; projects?: ExportProject[]; folders?: ExportFolder[] },
  build: AppBuild,
  at = new Date(),
): Manifest {
  return {
    fenmyr: 'export',
    format: FORMAT,
    app: build.version,
    commit: build.commit,
    changes: build.changes,
    platform: build.platform,
    exportedAt: at.toISOString(),
    root,
    projects: made.projects ?? [],
    folders: made.folders ?? [],
    boards: made.boards,
    media: made.media,
    left: made.left,
  };
}

// names: every entry in the zip. json: the manifest and the board files, by name. Anything the checks drop is counted.
export function parseExport(
  names: readonly string[],
  json: Readonly<Record<string, Uint8Array>>,
): Verdict<ImportResult> {
  const refused = nameRefusal(names);
  if (refused) return no(refused);
  const file = json[MANIFEST];
  let raw: unknown;
  try {
    raw = file ? JSON.parse(strFromU8(file)) : undefined;
  } catch {
    return no('notZip');
  }
  const m = readManifest(raw);
  if (!m.ok) return m;
  const manifest = m.value;
  const boards: StoredBoard[] = [];
  let skipped = 0;
  for (const id of manifest.boards) {
    const bytes = json[`boards/${id}.json`];
    let one: unknown;
    try {
      one = bytes ? JSON.parse(strFromU8(bytes)) : undefined;
    } catch {
      continue;
    }
    const board = parseBoard(one);
    if (!board || !isRecord(one)) continue;
    // a card with no id can't be kept; the ones this build can't read are kept as placeholders (model.ts)
    skipped += list(one.cards).length + list(one.tray).length - (board.cards?.length ?? 0) - (board.tray?.length ?? 0);
    // whatever the zip holds, what is always left out is left out again: it can't grant a board a vault
    const clean = parseBoard(stripBoard({ ...board, id }, KEEP_ALL));
    if (clean) boards.push(clean);
  }
  // the root board is the one thing a board zip can't do without; a folder or project may be empty
  if (manifest.root.kind === 'board' && !boards.some(b => b.id === manifest.root.id)) return no('notZip');
  return yes({ manifest, boards, skipped, missing: 0 });
}

// The reply from the host is `unknown` until it has been through the same reading.
export function readImport(reply: unknown): ImportResult | null {
  if (!isRecord(reply)) return null;
  const m = readManifest(reply.manifest);
  if (!m.ok) return null;
  const boards = list(reply.boards).flatMap(b => parseBoard(b) ?? []);
  return { manifest: m.value, boards, skipped: count(reply.skipped), missing: count(reply.missing) };
}

// Points each video at the copy made on this computer. A video with no copy keeps its card, marked as not included.
export function relinkMedia(boards: StoredBoard[], copies: ReadonlyMap<string, string>) {
  let missing = 0;
  const card = (c: unknown) => {
    if (!isRecord(c) || !heldMedia(c)) return c;
    const url = copies.get(mediaNameIn(c.src) ?? '');
    if (url) return { ...c, src: url };
    missing++;
    return { ...without(c, ['src', 'poster']), notIncluded: true };
  };
  const out = boards.flatMap(b => parseBoard({ ...b, cards: b.cards?.map(card), tray: b.tray?.map(card) }) ?? []);
  return { boards: out, missing };
}

// The whole zip in memory, for the browser and the tests.
// stored: the names kept uncompressed, as videos are
export const packZip = (files: Readonly<Record<string, Uint8Array>>, stored: readonly string[] = []) =>
  zipSync(
    Object.fromEntries(
      Object.entries(files).map(([name, data]) => [name, stored.includes(name) ? [data, { level: 0 }] : data]),
    ),
  );
export const jsonBytes = (v: unknown) => strToU8(JSON.stringify(v));

type Opened = { names: string[]; json: Record<string, Uint8Array>; media: Record<string, Uint8Array> };
// Everything the checks need, and the videos when asked for. Throws on a file that isn't a zip.
export function openZip(zip: Uint8Array, withMedia = false): Opened {
  const names: string[] = [],
    json: Record<string, Uint8Array> = {},
    media: Record<string, Uint8Array> = {};
  // a name that leaves the folder is listed, so the checks can refuse the zip, but is never unpacked
  const all = unzipSync(zip, {
    filter: f => {
      names.push(f.name);
      return (
        !travels(f.name) && ((isJson(f.name) && f.originalSize <= JSON_LIMIT) || (withMedia && !!mediaNameOf(f.name)))
      );
    },
  });
  for (const [name, bytes] of Object.entries(all)) {
    const m = mediaNameOf(name);
    if (m) media[m] = bytes;
    else json[name] = bytes;
  }
  return { names, json, media };
}

export function readZip(zip: Uint8Array): Verdict<ImportResult> {
  try {
    const { names, json } = openZip(zip);
    return parseExport(names, json);
  } catch {
    return no('notZip');
  }
}

// the zip itself, for a browser that keeps no videos on disk
export function buildZip(manifest: Manifest, boards: readonly Record<string, unknown>[]) {
  const files: Record<string, Uint8Array> = { [MANIFEST]: jsonBytes(manifest) };
  for (const b of boards) if (typeof b.id === 'string') files[`boards/${b.id}.json`] = jsonBytes(b);
  return packZip(files);
}
