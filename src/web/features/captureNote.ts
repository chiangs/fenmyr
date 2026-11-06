// Shift+Enter in quick capture: the idea becomes a note on the board to write out first, and goes to Unsorted when the writing is done.
import { placeInView } from '../canvas/handles.ts';
import { byId, renderTray, selectOnly, sendToTray, takeFromTray } from '../canvas/wires.ts';
import { $ } from '../core/dom.ts';
import { remember, save } from '../core/history.ts';
import { session } from '../core/state.ts';
import { onEditEnd, startEdit } from '../edit/editing.ts';
import { card } from '../model/boards.ts';
import { say } from '../myra/say.ts';
import { newNoteColor } from '../settings/licenses.ts';
import { addCard } from '../tools/penEdit.ts';
import { cardEl } from '../ui/dom.ts';

let pending: string | null = null;

export function writeOnBoard(text: string) {
  const c = card('note', { text, name: '', color: newNoteColor() });
  addCard(c);
  placeInView([c]);
  selectOnly([c.id]);
  startEdit(c.id);
  pending = c.id;
}

// Connecting it or putting it in a collection says where it belongs, so it stays.
const placed = (id: string) =>
  session.board.links.some(l => l.a === id || l.b === id) ||
  session.board.cards.some(k => k.type === 'coll' && k.kids.includes(id));

function finish(id: string) {
  // editing hops from the text to the name and back without really ending
  if (session.editing === id) return;
  pending = null;
  const c = byId(id);
  if (c?.type !== 'note' || placed(id)) return;
  if (!c.text?.trim() && !c.name?.trim()) {
    session.board.cards = session.board.cards.filter(x => x.id !== id);
    cardEl(id)?.remove();
    session.sel.delete(id);
    save();
    return;
  }
  const at = { x: c.x, y: c.y };
  // undo brings it back to the board as written, not to before the capture
  remember();
  sendToTray([c]);
  session.sel.delete(id);
  renderTray();
  $('tray').classList.remove('closed');
  save();
  say('Moved to Unsorted ✦', 6000, [
    {
      label: 'Keep on board',
      run: () => {
        if (!session.board.tray.some(x => x.id === id)) return;
        takeFromTray(c, at);
        renderTray();
        save();
      },
    },
  ]);
}

export function initCaptureNote() {
  onEditEnd(id => {
    if (id === pending) setTimeout(() => finish(id));
  });
}
