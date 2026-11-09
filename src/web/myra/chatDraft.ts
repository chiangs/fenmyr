import { type ChatDraft, DRAFT_MAX } from '../../shared/chat.ts';
import { saveNow } from '../core/history.ts';
import { appState, session } from '../core/state.ts';
import { elementById } from '../ui/dom.ts';
import { setChatText } from './chatInput.ts';
import { chatKeep } from './chatLog.ts';
import { clearPastes, forgetNexts, pastedChars, pastesOf, seedAdded, watchAdded } from './seesStrip.ts';

// The words the person has typed to Myra and not sent, and the long pastes that became chips, one set per board. They
// live in memory under every Keep chats setting, so a board switch never loses them; they reach the board file only
// when chats are kept with the board.

const IDLE_MS = 2000,
  CEILING_MS = 5000;

const drafts = new Map<string, ChatDraft>();
// boards whose draft in memory has not reached their file, because a refused message came back while they were closed
const unsaved = new Set<string>();
// every board the library has listed, so a board is known to be deleted only after it was listed and then was not
const seen = new Set<string>();
// how many times Clear all chats has run, which a message that comes back checks against the count it left with
let cleared = 0;
// the board the text in the input belongs to, which is not session.board while a board loads
let owner = '',
  dirty = false,
  restoring = false,
  idleT: ReturnType<typeof setTimeout> | undefined,
  ceilT: ReturnType<typeof setTimeout> | undefined;

const box = () => elementById('mcInput', HTMLTextAreaElement);

function stopTimers() {
  clearTimeout(idleT);
  clearTimeout(ceilT);
  idleT = ceilT = undefined;
}

// Takes the input's text into its board's draft, and into the board's file when chats are kept with the board. The
// open board always owns the input: openBoard swaps the board and calls restoreDraft with no await between.
function writeDraft(): Promise<void> {
  stopTimers();
  if (!dirty || !owner) return Promise.resolve();
  dirty = false;
  const text = box().value,
    pasted = pastesOf(owner).map(({ id, text }) => ({ id, text })),
    draft: ChatDraft | undefined = pasted.length ? { text, pasted } : text ? { text } : undefined;
  if (draft) drafts.set(owner, draft);
  else drafts.delete(owner);
  const board = session.board;
  if (!board || chatKeep() !== 'board' || JSON.stringify(board.chatDraft) === JSON.stringify(draft))
    return Promise.resolve();
  if (draft) board.chatDraft = draft;
  else delete board.chatDraft;
  return saveNow();
}

function arm() {
  clearTimeout(idleT);
  idleT = setTimeout(writeDraft, IDLE_MS);
  ceilT ??= setTimeout(writeDraft, CEILING_MS);
}

function typed() {
  if (restoring) return;
  dirty = true;
  // sending or clearing must reach the file before the app can close, or the sent words come back as a draft
  if (!box().value) {
    void writeDraft();
    return;
  }
  arm();
}

// typing stops at the budget, like any textarea, once the pasted texts have taken their share
const fitBox = () => {
  box().maxLength = DRAFT_MAX - pastedChars(session.board?.id ?? '');
};

export function initDraft() {
  const el = box();
  el.maxLength = DRAFT_MAX;
  el.addEventListener('input', typed);
  watchAdded(() => {
    fitBox();
    typed();
  });
  el.addEventListener('blur', () => void writeDraft());
  addEventListener('pagehide', () => void writeDraft());
}

/** Before the open board is replaced: the words in the input go to its draft, and to its file when chats are kept. */
export const leaveDraft = writeDraft;

/** After a board opens: its draft comes back with the caret at the end, where setting a value puts it. It writes nothing. */
export function restoreDraft() {
  stopTimers();
  const board = session.board,
    listed = new Set(appState.boardList.map(b => b.id)),
    // the list can lag behind a board that was just made, so only a board it listed before can be told gone from it
    gone = [...seen].filter(id => id !== board.id && !listed.has(id));
  for (const id of listed) seen.add(id);
  // a deleted board's draft and pastes would otherwise stay in memory until the app quits
  for (const id of gone) {
    drafts.delete(id);
    unsaved.delete(id);
    seen.delete(id);
  }
  forgetNexts(gone);
  const kept = chatKeep() === 'board' ? board.chatDraft : undefined,
    draft = drafts.get(board.id) ?? kept;
  owner = board.id;
  dirty = false;
  seedAdded(
    board.id,
    (draft?.pasted ?? []).map(p => ({ kind: 'paste', ...p })),
  );
  fitBox();
  setText(draft?.text ?? '');
  // a refused message came back to this board while it was closed, and its file has not heard
  if (unsaved.delete(board.id)) {
    dirty = true;
    arm();
  }
}

/** Whether the board is known to be deleted. */
export const boardGone = (id: string) =>
  id !== session.board?.id && seen.has(id) && !appState.boardList.some(b => b.id === id);

/** How many times Clear all chats has run. */
export const clearedCount = () => cleared;

/** How many characters of typed words the board's draft will hold if `words` come back to it. */
export function wordsAfter(board: string, words: string) {
  const had = board === owner ? box().value : (drafts.get(board)?.text ?? '');
  return (had || words).length;
}

/** Puts the words of a message that never reached Myra back in the board's draft, unless it holds words already. The
 *  open board's input shows them with the caret at the end; a closed board keeps them in memory and writes them to its
 *  file when it opens next. */
export function giveBackWords(board: string, words: string) {
  if (board === owner) {
    if (box().value) return;
    setText(words);
    dirty = true;
    arm();
    return;
  }
  const had = drafts.get(board)?.text,
    pasted = pastesOf(board).map(({ id, text }) => ({ id, text })),
    text = had || words;
  drafts.set(board, pasted.length ? { text, pasted } : { text });
  unsaved.add(board);
}

/** The boards whose unsent words are held in memory. */
export const draftBoards = () => [...drafts.keys()];

/** Clear all chats: no draft is left in memory or in the input. */
export function clearDrafts() {
  cleared++;
  clearPastes();
  drafts.clear();
  unsaved.clear();
  stopTimers();
  dirty = false;
  fitBox();
  setText('');
}

// the input fires `input` so the size, the slash menu and her box's draft line follow, but that is not typing
function setText(text: string) {
  restoring = true;
  setChatText(text);
  restoring = false;
}
