// Under a reply that changed the board: what it changed, Show on board, and Undo while the board stays open.
import { countLines, undoLine } from '../../shared/changeSummary.ts';
import type { ChatAction, StoredChangeSet } from '../../shared/chat.ts';
import { planUndo, undoable } from '../../shared/replyUndo.ts';
import { fit } from '../canvas/handles.ts';
import { renderAll } from '../canvas/render.ts';
import { selectOnly } from '../canvas/wires.ts';
import { remember, save } from '../core/history.ts';
import { session } from '../core/state.ts';
import { docCard } from '../docs/editor.ts';
import { endEdit } from '../edit/editing.ts';
import type { Piece } from './acts.ts';
import { replyRecord } from './replyMemory.ts';
import { reply } from './say.ts';

const GONE = 'Those cards aren’t on the board any more.';
const UNDO_TIP = 'Undo everything this reply changed';

function showReply(set: StoredChangeSet) {
  const ids = new Set([...(set.added ?? []), ...(set.moved ?? []), ...(set.edited ?? [])]),
    cards = session.board.cards.filter(c => ids.has(c.id));
  if (!cards.length) return reply(GONE, 6000);
  selectOnly(cards.map(c => c.id));
  fit(cards);
}

// Not async on purpose, like a reply landing: one Ctrl+Z step, which the undo timer can't split.
function undoReply(id: string) {
  const record = replyRecord(id),
    typing = session.editing;
  if (typing) endEdit();
  // the open doc's editor writes to its card, so that card stays as it is, like the one being typed in
  const keep = new Set([typing, docCard?.id].filter(id => id != null)),
    plan = record && planUndo(record, session.board, keep);
  if (plan?.undone) {
    remember();
    Object.assign(session.board, plan.lists);
    if (!plan.lists.trayLinks) delete session.board.trayLinks;
    session.sel.clear();
    session.selWire = null;
    renderAll();
    save();
    remember();
  }
  reply(undoLine(plan ?? { undone: 0, skipped: [] }), 6000);
}

// Undo shows while the reply's before-states are in memory and something it changed is still as it left it, so it
// goes once used and comes back if Ctrl+Z brings the reply back.
export function changesPieces({ reply: id, set, lines }: Extract<ChatAction, { kind: 'changes' }>): Piece[] {
  const record = replyRecord(id),
    found = [set.added, set.moved, set.edited].some(l => l?.length),
    pieces: Piece[] = [{ slot: 'summary', lines: lines ?? countLines(set) }];
  if (found)
    pieces.push({ slot: 'reply', button: { label: 'Show on board', after: 'stay', run: () => showReply(set) } });
  if (record && undoable(record, session.board))
    pieces.push({
      slot: 'reply',
      button: { label: 'Undo', ghost: true, title: UNDO_TIP, after: 'stay', run: () => undoReply(id) },
    });
  return pieces;
}
