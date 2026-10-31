// @ts-nocheck
import { closeOnOutsidePress } from '../ui/popover.ts';
import { cardEl } from '../ui/dom.ts';
import { fit } from '../canvas/handles.ts';
import { renderTray } from '../canvas/wires.ts';
import { linkCard } from '../cards/spotify.ts';
import { find } from '../core/base.ts';
import { $ } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { card } from '../model/boards.ts';
import { say } from '../settings/licenses.ts';
import { session } from '../core/state.ts';

// ---------- quick capture (Ctrl+K) ----------
export const capture = on => {
  $('capture').classList.toggle('on', on);
  if (on) {
    $('capInput').value = '';
    $('capInput').focus();
  } else $('capInput').blur();
};

// ---------- focus mode ----------
// a card fades when Focus mode or Find leaves it out
export const isDim = c => !!(session.focusSet && !session.focusSet.has(c.id)) || !!(find.set && !find.set.has(c.id));

export function applyDim() {
  session.board.cards.forEach(c => {
    const el = cardEl(c.id);
    el?.classList.toggle('dim', isDim(c));
    el?.classList.toggle('find-cur', find.cur === c.id);
  });
}

export function setFocus(on) {
  session.focusSet = on && session.sel.size ? new Set(session.sel) : null;
  if (session.focusSet)
    session.board.links.forEach(l => {
      if (session.focusSet.has(l.a)) session.focusSet.add(l.b);
      if (session.focusSet.has(l.b)) session.focusSet.add(l.a);
    });
  applyDim();
  if (session.focusSet) {
    fit(
      session.board.cards.filter(c => session.focusSet.has(c.id)),
      160,
    );
    say('Focus mode: just these. Press Esc when you want everything back.');
  }
}
export function init18() {
  // clicking anywhere outside the box closes it (what you typed isn't saved unless you pressed Enter)
  closeOnOutsidePress('.capture', () => {
    if ($('capture').classList.contains('on')) capture(false);
  });

  $('capForm').onsubmit = e => {
    e.preventDefault();
    const v = $('capInput').value.trim();
    if (v) {
      if (/^https?:\/\//.test(v)) linkCard(v, null, true);
      else {
        session.board.tray.unshift(card('note', { text: v }));
        renderTray();
        save();
      }
      $('tray').classList.remove('closed');
    }
    capture(false);
  };
}
