// Myra's chat as a board stores it: each message, and the buttons of the kinds that outlast the window, as data.
import type { ChangeSet } from './changes.ts';

// A button that is saved with its message, so it comes back when the chat or the board opens again. Buttons that only
// make sense once (Install, Link a repo) stay closures and are not stored.
export type ChatAction =
  // sends `text` as the person's question
  | { kind: 'next'; text: string }
  // what a reply changed and its id: Show on board, and Undo while its before-states are still in memory
  | { kind: 'changes'; reply: string; set: ChangeSet }
  // a card a build came from
  | { kind: 'source'; card: string }
  // puts a prototype's folder back as it was before a build; the folder is the board's when clicked
  | { kind: 'buildUndo'; board: string; snapshot: string }
  | { kind: 'commit'; message: string };

// who: 'me' or 'myra'; t: when it was said
export type ChatMsg = { who: string; text: string; t: number; acts?: ChatAction[] };
// an earlier chat, put away by New chat
export type SavedChat = { id: string; title: string; t: number; msgs: ChatMsg[] };

type Fields = Record<string, unknown>;
const isRecord = (x: unknown): x is Fields => typeof x === 'object' && x !== null;
const strings = (x: unknown): string[] | null =>
  Array.isArray(x) && x.every(s => typeof s === 'string') ? [...x] : null;

function readChangeSet(x: unknown): ChangeSet | null {
  if (!isRecord(x) || !isRecord(x.relaid) || !isRecord(x.links)) return null;
  const [added, moved, edited, removed, skipped, linksAdded, linksRemoved] = [
    x.added,
    x.moved,
    x.edited,
    x.removed,
    x.skipped,
    x.links.added,
    x.links.removed,
  ].map(strings);
  const relaid: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(x.relaid)) {
    const ids = strings(v);
    if (!ids) return null;
    relaid[k] = ids;
  }
  if (!added || !moved || !edited || !removed || !skipped || !linksAdded || !linksRemoved) return null;
  return { added, moved, edited, removed, relaid, links: { added: linksAdded, removed: linksRemoved }, skipped };
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
  commit: x => (typeof x.message === 'string' ? { kind: 'commit', message: x.message } : null),
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
