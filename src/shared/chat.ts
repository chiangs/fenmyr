// Myra's chat as a board stores it: each message, and the buttons of the kinds that outlast the window, as data.
import type { ChangeSet } from './changes.ts';

// A button that is saved with its message, so it comes back when the chat or the board opens again. Buttons that only
// make sense once (Install, Link a repo) stay closures and are not stored.
export type ChatAction =
  // sends `text` as the person's question
  | { kind: 'next'; text: string }
  // what a reply changed and its id: Show on board, and Undo while its before-states are still in memory
  | { kind: 'changes'; reply: string; set: StoredChangeSet }
  // a card a build came from
  | { kind: 'source'; card: string }
  // A build's buttons, shown only while `board`, the prototype it built, is open. Undo puts the folder back as it was
  // before the build, so only the newest build's Undo shows: an older one would undo the builds after it too.
  | { kind: 'buildUndo'; board: string; snapshot: string }
  | { kind: 'commit'; board: string; message: string };

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

// One reader per kind. The mapped type makes a kind without a reader fail the type check.
const READ: { [K in ChatAction['kind']]: (x: Fields) => Extract<ChatAction, { kind: K }> | null } = {
  next: x => (typeof x.text === 'string' ? { kind: 'next', text: x.text } : null),
  changes: x => {
    const set = readChangeSet(x.set);
    return typeof x.reply === 'string' && set ? { kind: 'changes', reply: x.reply, set } : null;
  },
  source: x => (typeof x.card === 'string' ? { kind: 'source', card: x.card } : null),
  buildUndo: x =>
    typeof x.board === 'string' && typeof x.snapshot === 'string'
      ? { kind: 'buildUndo', board: x.board, snapshot: x.snapshot }
      : null,
  commit: x =>
    typeof x.board === 'string' && typeof x.message === 'string'
      ? { kind: 'commit', board: x.board, message: x.message }
      : null,
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
