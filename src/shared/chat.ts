// Myra's chat as a board stores it: each message, and the buttons of the kinds that outlast the window, as data.
import { MAX_FILES } from './askFiles.ts';
import type { ChangeSet } from './changes.ts';

// A button that is saved with its message, so it comes back when the chat or the board opens again. Buttons that only
// make sense once (Install, Link a repo) stay closures and are not stored.
export type ChatAction =
  // sends `text` as the person's question
  | { kind: 'next'; text: string }
  // What a reply changed and its id: Show on board, and Undo while its before-states are still in memory. lines: the
  // summary as worded when the reply landed, which replies from before it was kept don't have.
  | { kind: 'changes'; reply: string; set: StoredChangeSet; lines?: string[] }
  // a card a build came from
  | { kind: 'source'; card: string }
  // A build's buttons, shown only while `board`, the prototype it built, is open. Undo puts the folder back as it was
  // before the build, so only the newest build's Undo shows: an older one would undo the builds after it too. `build`
  // names the build, which boards from before it was kept don't have.
  | { kind: 'buildUndo'; board: string; snapshot: string; build?: string }
  | { kind: 'commit'; board: string; message: string }
  // what she read for this reply: notes from a vault, and pages on the web
  | { kind: 'read'; notes: ReadNote[]; pages: WebPage[] }
  // A plan she showed before changing the board, with its steps as worded then. Its buttons show only while it waits,
  // in memory. ended: how it stopped waiting; one with none that no longer waits was dropped unanswered.
  | { kind: 'plan'; plan: string; steps: string[]; ended?: PlanEnd };

export type PlanEnd = 'done' | 'cancelled' | 'replaced';
const ENDS: readonly PlanEnd[] = ['done', 'cancelled', 'replaced'];

// vault: the vault's id; rel: the note's path in it
export type ReadNote = { vault: string; rel: string; title: string };
export type WebPage = { url: string; title: string };

// Only http and https open in the browser. A page comes from model output and from the board file, so both read it
// here. Control and bidi characters go from the title, since an override can make "gpj.exe" read as "exe.jpg".
const MAX_URL = 2048,
  MAX_TITLE = 300,
  UNSAFE = /[\p{Cc}\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu;
export function webPage(url: string, title: string): WebPage | null {
  if (url.length > MAX_URL) return null;
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== 'http:' && protocol !== 'https:') return null;
    const clean = clip(title.replace(UNSAFE, ' ').replace(/\s+/g, ' ').trim(), MAX_TITLE);
    return { url, title: clean || hostname };
  } catch {
    return null;
  }
}

// at most `n` characters, the last an ellipsis when it was cut
export function clip(s: string, n: number) {
  const chars = Array.from(s);
  if (chars.length <= n) return s;
  const kept = chars.slice(0, n - 1).join('');
  return `${kept.trimEnd()}…`;
}

// A ChangeSet as her line keeps it: a list with nothing in it is left out.
export type StoredChangeSet = {
  added?: string[];
  moved?: string[];
  edited?: string[];
  removed?: string[];
  relaid?: Record<string, string[]>;
  links?: { added?: string[]; removed?: string[] };
  skipped?: string[];
};

// who: 'me' or 'myra'; t: when it was said
export type ChatMsg = { who: string; text: string; t: number; acts?: ChatAction[] };
// an earlier chat, put away by New chat
export type SavedChat = { id: string; title: string; t: number; msgs: ChatMsg[] };

/** A long paste held as a chip until the message goes. */
type PastedText = { id: string; text: string };

/** What the person was writing to Myra on a board and hadn't sent: the words in her input and the long pastes that
 *  became chips. `pasted` is left out when there are none, so a file from before it is read as it is. */
export type ChatDraft = { text: string; pasted?: PastedText[] };

/** The most characters a board file keeps of one draft, typed words and pasted texts together. Every card edit rewrites
 *  the file, so it is not unbounded. */
export const DRAFT_MAX = 100_000;

/** The host refuses a text file with a NUL in it, so a paste loses its NULs before it can become a chip. */
export const withoutNul = (text: string) => text.replaceAll('\0', '');

/** A stored draft, or undefined when it is missing, empty, too long or malformed. A bad pasted entry drops alone. */
export function readDraft(x: unknown): ChatDraft | undefined {
  if (!isRecord(x) || typeof x.text !== 'string') return undefined;
  const ids = new Set<string>(),
    pasted = (Array.isArray(x.pasted) ? x.pasted : [])
      .flatMap((p: unknown) => {
        const text = isRecord(p) && typeof p.text === 'string' ? withoutNul(p.text) : '';
        if (!isRecord(p) || typeof p.id !== 'string' || !text || ids.has(p.id)) return [];
        ids.add(p.id);
        return [{ id: p.id, text }];
      })
      .slice(0, MAX_FILES);
  const size = pasted.reduce((n, p) => n + p.text.length, x.text.length);
  if ((!x.text && !pasted.length) || size > DRAFT_MAX) return undefined;
  return pasted.length ? { text: x.text, pasted } : { text: x.text };
}

type Fields = Record<string, unknown>;
const isRecord = (x: unknown): x is Fields => typeof x === 'object' && x !== null;
const strings = (x: unknown): x is string[] => Array.isArray(x) && x.every(s => typeof s === 'string');

const LISTS: readonly ('added' | 'moved' | 'edited' | 'removed' | 'skipped')[] = [
  'added',
  'moved',
  'edited',
  'removed',
  'skipped',
];

export function storedSet(set: ChangeSet): StoredChangeSet {
  const out: StoredChangeSet = {},
    links: NonNullable<StoredChangeSet['links']> = {};
  for (const k of LISTS) if (set[k].length) out[k] = set[k];
  if (Object.keys(set.relaid).length) out.relaid = set.relaid;
  if (set.links.added.length) links.added = set.links.added;
  if (set.links.removed.length) links.removed = set.links.removed;
  if (links.added || links.removed) out.links = links;
  return out;
}

// a list that is left out reads as empty
const ids = (x: unknown): string[] | null => (x === undefined ? [] : strings(x) ? x : null);

function readChangeSet(x: unknown): StoredChangeSet | null {
  if (!isRecord(x)) return null;
  const { links = {}, relaid = {} } = x;
  if (!isRecord(links) || !isRecord(relaid)) return null;
  const [added, moved, edited, removed, skipped, linksAdded, linksRemoved] = [
    x.added,
    x.moved,
    x.edited,
    x.removed,
    x.skipped,
    links.added,
    links.removed,
  ].map(ids);
  const laid: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(relaid)) {
    if (!strings(v)) return null;
    laid[k] = v;
  }
  if (!added || !moved || !edited || !removed || !skipped || !linksAdded || !linksRemoved) return null;
  return storedSet({
    added,
    moved,
    edited,
    removed,
    relaid: laid,
    links: { added: linksAdded, removed: linksRemoved },
    skipped,
  });
}

const readNote = (x: unknown): ReadNote | null =>
  isRecord(x) && typeof x.vault === 'string' && typeof x.rel === 'string' && typeof x.title === 'string'
    ? { vault: x.vault, rel: x.rel, title: x.title }
    : null;
const readPage = (x: unknown): WebPage | null =>
  isRecord(x) && typeof x.url === 'string' && typeof x.title === 'string' ? webPage(x.url, x.title) : null;
// a bad entry drops alone; a list that is left out reads as empty
const entries = <T>(x: unknown, read: (x: unknown) => T | null): T[] =>
  (Array.isArray(x) ? x : []).map(read).filter(e => e !== null);

// One reader per kind. The mapped type makes a kind without a reader fail the type check.
const READ: { [K in ChatAction['kind']]: (x: Fields) => Extract<ChatAction, { kind: K }> | null } = {
  next: x => (typeof x.text === 'string' ? { kind: 'next', text: x.text } : null),
  changes: x => {
    const set = readChangeSet(x.set);
    if (typeof x.reply !== 'string' || !set) return null;
    return { kind: 'changes', reply: x.reply, set, ...(strings(x.lines) ? { lines: x.lines } : {}) };
  },
  source: x => (typeof x.card === 'string' ? { kind: 'source', card: x.card } : null),
  buildUndo: x =>
    typeof x.board === 'string' && typeof x.snapshot === 'string'
      ? {
          kind: 'buildUndo',
          board: x.board,
          snapshot: x.snapshot,
          ...(typeof x.build === 'string' ? { build: x.build } : {}),
        }
      : null,
  commit: x =>
    typeof x.board === 'string' && typeof x.message === 'string'
      ? { kind: 'commit', board: x.board, message: x.message }
      : null,
  read: x => {
    const notes = entries(x.notes, readNote),
      pages = entries(x.pages, readPage);
    return notes.length || pages.length ? { kind: 'read', notes, pages } : null;
  },
  plan: x => {
    const ended = ENDS.find(e => e === x.ended);
    if (typeof x.plan !== 'string' || !strings(x.steps)) return null;
    return { kind: 'plan', plan: x.plan, steps: x.steps, ...(ended ? { ended } : {}) };
  },
};

const isKind = (k: unknown): k is ChatAction['kind'] => typeof k === 'string' && Object.hasOwn(READ, k);

// A kind this version doesn't know, from a newer one, is dropped like a bad entry; the message stays either way.
function readAction(x: unknown): ChatAction | null {
  if (!isRecord(x) || !isKind(x.kind)) return null;
  return READ[x.kind](x);
}

export function readMsgs(x: unknown): ChatMsg[] {
  return (Array.isArray(x) ? x : []).filter(isRecord).map(m => {
    const msg: ChatMsg = {
        who: typeof m.who === 'string' ? m.who : 'myra',
        text: typeof m.text === 'string' ? m.text : '',
        t: typeof m.t === 'number' ? m.t : 0,
      },
      acts = Array.isArray(m.acts) ? m.acts.map(readAction).filter(a => a !== null) : [];
    // no key at all when none are left, so a board from before stored buttons saves back as it was
    if (acts.length) msg.acts = acts;
    return msg;
  });
}

export const readChats = (x: unknown): SavedChat[] =>
  (Array.isArray(x) ? x : []).filter(isRecord).map(c => ({
    id: typeof c.id === 'string' ? c.id : '',
    title: typeof c.title === 'string' ? c.title : 'Chat',
    t: typeof c.t === 'number' ? c.t : 0,
    msgs: readMsgs(c.msgs),
  }));
