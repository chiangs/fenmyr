import { type ChatDraft, DRAFT_MAX } from '../../shared/chat.ts';
import { saveNow } from '../core/history.ts';
import { session } from '../core/state.ts';
import { elementById } from '../ui/dom.ts';
import { setChatText } from './chatInput.ts';
import { chatKeep } from './chatLog.ts';
import { clearPastes, pastedChars, pastesOf, seedAdded, watchAdded } from './seesStrip.ts';

// The words the person has typed to Myra and not sent, and the long pastes that became chips, one set per board. They
// live in memory under every Keep chats setting, so a board switch never loses them; they reach the board file only
// when chats are kept with the board.

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
  const text = box().value,
    pasted = pastesOf(owner).map(({ id, text }) => ({ id, text })),
    draft: ChatDraft | undefined = pasted.length ? { text, pasted } : text ? { text } : undefined;
  if (draft) drafts.set(owner, draft);
  else drafts.delete(owner);
  const board = session.board;
  if (
    !board ||
    owner !== board.id ||
    chatKeep() !== 'board' ||
    JSON.stringify(board.chatDraft) === JSON.stringify(draft)
  )
    return Promise.resolve();
  if (draft) board.chatDraft = draft;
  else delete board.chatDraft;
  return saveNow();
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
    kept = chatKeep() === 'board' ? board.chatDraft : undefined,
    draft = drafts.get(board.id) ?? kept;
  owner = board.id;
  dirty = false;
  seedAdded(
    board.id,
    (draft?.pasted ?? []).map(p => ({ kind: 'paste', ...p })),
  );
  fitBox();
  setText(draft?.text ?? '');
}

/** Clear all chats: no draft is left in memory or in the input. */
export function clearDrafts() {
  clearPastes();
  drafts.clear();
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
