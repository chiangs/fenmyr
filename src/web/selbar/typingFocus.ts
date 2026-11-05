import { $ } from '../core/dom.ts';
import { type Away, comeBack, type Return, stepAway } from '../edit/noteAway.ts';
import { closestTo, htmlIn } from '../ui/dom.ts';

const FORMAT_BUTTONS = '[data-ts], [data-fmt]';
// the note that F10 left for the bar's formatting buttons
let held: Away | null = null;

function noteBodyInFocus() {
  const t = document.activeElement;
  return t instanceof HTMLElement && t.isContentEditable && t.matches('.card.note .text') ? t : null;
}

// the note body being typed in, still while F10 has moved focus to the formatting buttons
export const editedNoteBody = () => noteBodyInFocus() ?? held?.t ?? null;

function release(how: Return) {
  const h = held;
  held = null;
  if (h) comeBack(h, how);
}

// A button pressed from the keyboard gives the note its selection back first, so it works as it does under the mouse.
export const backToNote = () => release('refocus');

export function initTypingFocus() {
  const bar = $('selbar');
  addEventListener('keydown', e => {
    if (e.key !== 'F10' || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    const t = noteBodyInFocus(),
      first = htmlIn(bar, FORMAT_BUTTONS).find(b => b.checkVisibility()),
      away = t && first ? stepAway(t) : null;
    if (!away || !first) return;
    held = away;
    e.preventDefault();
    first.focus();
  });
  // Keys on a formatting button stay off the board's shortcuts while the note waits.
  bar.addEventListener('keydown', e => {
    if (!held || !closestTo(e.target, FORMAT_BUTTONS)) return;
    e.stopPropagation();
    if (e.key === 'Escape') release('refocus');
  });
  // A bar drawn again takes the focused button with it, and that counts as leaving too.
  bar.addEventListener('focusout', e => {
    const to = e.relatedTarget instanceof Element ? e.relatedTarget : null;
    if (!held || to?.closest(`#selbar :is(${FORMAT_BUTTONS})`)) return;
    release(to && held.t.contains(to) ? 'back' : 'leave');
  });
}
