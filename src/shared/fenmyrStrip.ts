// What an export leaves out, and when: one table, read by the export, the import and the tests. The format it is cut from
// is in fenmyrZip.ts.
import { isRecord } from './model.ts';

export type ExportOptions = { videos: boolean; chats: boolean; vaultText: boolean };
// what the export dialog starts with
export const DEFAULTS: ExportOptions = { videos: true, chats: false, vaultText: false };
export const KEEP_ALL: ExportOptions = { videos: true, chats: true, vaultText: true };

type StripRule = {
  from: 'board' | 'card' | 'project' | 'folder';
  // the kind of card, for the card rows
  type?: 'image' | 'vnote' | 'video';
  fields: readonly string[];
  // never: always left out. Otherwise it goes unless this option is on.
  keep: 'never' | keyof ExportOptions;
  // the card stays, marked: notIncluded shows that this part is not in the file, unlinked that the vault note has nothing
  // left to be read again from
  mark?: 'notIncluded' | 'unlinked';
  // only for cards this holds for
  only?: (card: Record<string, unknown>) => boolean;
  why: string;
};

// a video in the media folder here, or in this browser: neither means anything on another computer
const MEDIA_URL = /^fenmyrmedia:\/\/media\/([^/?#]+)$/;
export const heldMedia = (card: Record<string, unknown>) =>
  typeof card.src === 'string' && (MEDIA_URL.test(card.src) || card.src.startsWith('idbmedia:'));

// One table, read by the export and by the tests. The last three rows are for projects and folders.
export const STRIP: readonly StripRule[] = [
  { from: 'board', fields: ['chatDraft'], keep: 'never', why: 'Words typed to Myra and not sent.' },
  { from: 'board', fields: ['vaultAccess'], keep: 'never', why: "It names this computer's vaults." },
  { from: 'board', fields: ['kind', 'proto'], keep: 'never', why: "A prototype's code folder is on this computer." },
  { from: 'board', fields: ['chat', 'chats'], keep: 'chats', why: 'Private: what I was asked and what I said.' },
  {
    from: 'card',
    type: 'image',
    fields: ['capture'],
    keep: 'never',
    why: "A capture's commit link points at a repo here.",
  },
  {
    from: 'card',
    type: 'vnote',
    fields: ['vault', 'path'],
    keep: 'never',
    mark: 'unlinked',
    why: "They name this computer's vaults.",
  },
  {
    from: 'card',
    type: 'vnote',
    fields: ['excerpt', 'props'],
    keep: 'vaultText',
    mark: 'notIncluded',
    why: "The note's own words.",
  },
  {
    from: 'card',
    type: 'video',
    fields: ['src', 'poster'],
    keep: 'videos',
    mark: 'notIncluded',
    only: heldMedia,
    why: 'Big.',
  },
  { from: 'project', fields: ['repo'], keep: 'never', why: 'A path on this computer.' },
  { from: 'project', fields: ['vaults'], keep: 'never', why: "They name this computer's vaults." },
  { from: 'folder', fields: ['kind'], keep: 'never', why: 'A prototyping folder goes as an ordinary folder.' },
];

// What stays, listed so a field added to boards later has to be decided here: the test fails on one in neither list.
export const KEPT = {
  board: [
    'id',
    'name',
    'color',
    'cards',
    'links',
    'tray',
    'trayLinks',
    'palette',
    'view',
    'folder',
    'parent',
    'tags',
    'bg',
  ],
} as const;

export const without = (o: Record<string, unknown>, fields: readonly string[]) =>
  Object.fromEntries(Object.entries(o).filter(([k]) => !fields.includes(k)));

// a project or folder without what the table never lets go: its repo, its vault grants, a prototyping folder's kind
export const stripStructure = (from: 'project' | 'folder', o: Record<string, unknown>) =>
  without(
    o,
    STRIP.filter(r => r.from === from).flatMap(r => r.fields),
  );

const has = (o: Record<string, unknown>, fields: readonly string[]) =>
  fields.some(f => o[f] !== undefined && !(Array.isArray(o[f]) && o[f].length === 0));
const goes = (r: StripRule, o: ExportOptions) => r.keep === 'never' || !o[r.keep];

export type Cut = { videos: number; chats: boolean; vaultText: number };
export const noCut = (): Cut => ({ videos: 0, chats: false, vaultText: 0 });

function stripCard(card: unknown, opts: ExportOptions, cut: Cut): unknown {
  if (!isRecord(card)) return card;
  let out = card;
  for (const r of STRIP) {
    if (r.from !== 'card' || r.type !== card.type || !goes(r, opts) || (r.only && !r.only(card))) continue;
    const had = has(out, r.fields);
    out = { ...without(out, r.fields), ...(r.mark && had ? { [r.mark]: true } : {}) };
    if (had && r.keep === 'videos') cut.videos++;
    if (had && r.keep === 'vaultText') cut.vaultText++;
  }
  // a card this build couldn't read is kept as it was, so what it held is cut the same way
  return isRecord(out.original) ? { ...out, original: stripCard(out.original, opts, cut) } : out;
}

// a copy of the board without what the options leave out, and what that cost
export function stripBoard(board: Record<string, unknown>, opts: ExportOptions, cut = noCut()) {
  let out = board;
  for (const r of STRIP) {
    if (r.from !== 'board' || !goes(r, opts)) continue;
    if (r.keep === 'chats' && has(out, r.fields)) cut.chats = true;
    out = without(out, r.fields);
  }
  for (const k of ['cards', 'tray']) {
    const list = out[k];
    if (Array.isArray(list)) out = { ...out, [k]: list.map(c => stripCard(c, opts, cut)) };
  }
  return out;
}

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export const mediaNameIn = (src: unknown) => (typeof src === 'string' ? (MEDIA_URL.exec(src)?.[1] ?? null) : null);

// the files in the media folder that these boards use, once each
export function mediaUsed(boards: readonly Record<string, unknown>[]): string[] {
  const names = new Set<string>();
  for (const b of boards)
    for (const k of ['cards', 'tray'])
      for (const c of list(b[k])) {
        const name = isRecord(c) ? mediaNameIn(c.src) : null;
        if (name) names.add(name);
      }
  return [...names];
}
