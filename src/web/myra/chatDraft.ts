import { type ChatDraft, DRAFT_MAX } from '../../shared/chat.ts';
import { saveNow } from '../core/history.ts';
import { session } from '../core/state.ts';
import { elementById } from '../ui/dom.ts';
import { setChatText } from './chatInput.ts';
import { chatKeep } from './chatLog.ts';
import { say } from './say.ts';

// The words the person has typed to Myra and not sent, one set per board. They live in memory under every Keep chats
// setting, so a board switch never loses them; they reach the board file only when chats are kept with the board.

const IDLE_MS = 2000,
  CEILING_MS = 5000;

const drafts = new Map<string, ChatDraft>();
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

// Takes the input's text into its board's draft. It reaches the file only for the open board, which owns the text.
function writeDraft(): Promise<void> {
  stopTimers();
  if (!dirty || !owner) return Promise.resolve();
  dirty = false;
  const text = box().value;
  if (text) drafts.set(owner, { text });
  else drafts.delete(owner);
  const board = session.board;
  if (!board || owner !== board.id || chatKeep() !== 'board' || (board.chatDraft?.text ?? '') === text)
    return Promise.resolve();
  if (text) board.chatDraft = { text };
  else delete board.chatDraft;
  return saveNow();
}

// words typed since the last write go into the map at once, so nothing waits on a timer or the disk
function stash() {
  if (!dirty || !owner) return;
  const text = box().value;
  if (text) drafts.set(owner, { text });
  else drafts.delete(owner);
}

function typed() {
  if (restoring) return;
  dirty = true;
  // sending or clearing must reach the file before the app can close, or the sent words come back as a draft
  if (!box().value) {
    void writeDraft();
    return;
  }
  clearTimeout(idleT);
  idleT = setTimeout(writeDraft, IDLE_MS);
  ceilT ??= setTimeout(writeDraft, CEILING_MS);
}

// A paste past the limit would be cut short without a word, so it is refused whole.
function pasted(e: ClipboardEvent) {
  const el = box(),
    text = e.clipboardData?.getData('text/plain') ?? '';
  if (!text || el.value.length - (el.selectionEnd - el.selectionStart) + text.length <= DRAFT_MAX) return;
  e.preventDefault();
  say(`That’s too long to paste. A message can hold up to ${DRAFT_MAX.toLocaleString('en-GB')} characters.`, 5000);
}

export function initDraft() {
  const el = box();
  el.maxLength = DRAFT_MAX;
  el.addEventListener('input', typed);
  el.addEventListener('paste', pasted);
  el.addEventListener('blur', () => void writeDraft());
  addEventListener('pagehide', () => void writeDraft());
}

/** Before the open board is replaced: the words in the input go to its draft, and to its file when chats are kept. */
export const leaveDraft = writeDraft;

/** After a board opens: its draft comes back, with the caret at the end. It writes nothing. */
export function restoreDraft() {
  stash();
  stopTimers();
  const board = session.board,
    kept = chatKeep() === 'board' ? board.chatDraft : undefined,
    draft = drafts.get(board.id) ?? kept;
  owner = board.id;
  dirty = false;
  setText(draft?.text ?? '');
  box().setSelectionRange(box().value.length, box().value.length);
}

/** Clear all chats: no draft is left in memory or in the input. */
export function clearDrafts() {
  drafts.clear();
  stopTimers();
  dirty = false;
  setText('');
}

// the input fires `input` so the size, the slash menu and her box's draft line follow, but that is not typing
function setText(text: string) {
  restoring = true;
  setChatText(text);
  restoring = false;
}
