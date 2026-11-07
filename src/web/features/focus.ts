import type { Card } from '../../shared/model.ts';
import { fit } from '../canvas/handles.ts';
import { renderTray } from '../canvas/wires.ts';
import { linkCard } from '../cards/spotify.ts';
import { find } from '../core/base.ts';
import { $ } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { session } from '../core/state.ts';
import { card } from '../model/boards.ts';
import { say } from '../myra/say.ts';
import { cardEl, elementById } from '../ui/dom.ts';
import { closeOnOutsidePress } from '../ui/popover.ts';
import { initCaptureNote, writeOnBoard } from './captureNote.ts';

const captureField = () => elementById('capInput', HTMLInputElement);

// ---------- quick capture (Ctrl+K) ----------
export const capture = (on: boolean) => {
  $('capture').classList.toggle('on', on);
  if (on) {
    captureField().value = '';
    captureField().focus();
  } else captureField().blur();
};

// ---------- focus mode ----------
// a card fades when Focus mode or Find leaves it out
export const isDim = (c: Card) =>
  !!(session.focusSet && !session.focusSet.has(c.id)) || !!(find.set && !find.set.has(c.id));

export function applyDim() {
  session.board.cards.forEach(c => {
    const el = cardEl(c.id);
    el?.classList.toggle('dim', isDim(c));
    el?.classList.toggle('find-cur', find.cur === c.id);
  });
}

export function setFocus(on: boolean) {
  const focus = on && session.sel.size ? new Set(session.sel) : null;
  session.focusSet = focus;
  if (focus)
    session.board.links.forEach(l => {
      if (focus.has(l.a)) focus.add(l.b);
      if (focus.has(l.b)) focus.add(l.a);
    });
  applyDim();
  if (focus) {
    fit(
      session.board.cards.filter(c => focus.has(c.id)),
      160,
    );
    say('Focus mode: just these. Press Esc when you want everything back.');
  }
}
export function init18() {
  // clicking anywhere outside the box closes it (what you typed isn't saved unless you pressed Enter)
  closeOnOutsidePress(
    '.capture',
    () => $('capture').classList.contains('on'),
    () => capture(false),
  );

  // Enter saves the idea to Unsorted; Shift+Enter puts it on the board to write out first (a link has nothing to write, so it goes straight in)
  const keep = (onBoard: boolean) => {
    const v = captureField().value.trim();
    capture(false);
    if (!v) return;
    if (/^https?:\/\//.test(v)) linkCard(v, null, true);
    else if (onBoard) return writeOnBoard(v);
    else {
      session.board.tray.unshift(card('note', { text: v }));
      renderTray();
      save();
    }
    $('tray').classList.remove('closed');
  };
  $('capForm').onsubmit = e => {
    e.preventDefault();
    keep(false);
  };
  captureField().addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !e.shiftKey || e.isComposing) return;
    e.preventDefault();
    keep(true);
  });
  initCaptureNote();
}
