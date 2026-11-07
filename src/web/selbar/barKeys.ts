import { $ } from '../core/dom.ts';
import { keyedButton } from '../input/keyed.ts';
import { htmlIn, isTyping, oneIn } from '../ui/dom.ts';
import { editedNoteBody, enterFromNote } from './typingFocus.ts';

const CONTROLS = 'button, input, select';
// where F10 came from, so Escape goes back there
let cameFrom: HTMLElement | null = null;

function enterBar(bar: HTMLElement) {
  const from = document.activeElement;
  if (!bar.classList.contains('on') || !bar.checkVisibility({ opacityProperty: true }) || isTyping(from)) return false;
  const first = htmlIn(bar, CONTROLS).find(c => c.checkVisibility() && !c.matches(':disabled'));
  if (!first) return false;
  cameFrom = from instanceof HTMLElement && from !== document.body ? from : null;
  first.focus();
  return true;
}

function leaveBar() {
  const back = cameFrom;
  cameFrom = null;
  if (back?.isConnected) back.focus();
  else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}

/** Redraws the bar, and gives focus back to the control the keyboard was on, found by the data attribute that names
 *  it. A clicked control lets focus go, so Escape and Enter go back to the board. */
export function keepFocus(bar: HTMLElement, redraw: () => void) {
  const had = document.activeElement,
    name =
      had instanceof HTMLElement && bar.contains(had) && keyedButton(had)
        ? [...had.attributes].find(a => a.name.startsWith('data-') && a.name !== 'data-tt')
        : undefined;
  redraw();
  if (name) oneIn(bar, `[${name.name}="${CSS.escape(name.value)}"]`)?.focus({ preventScroll: true });
}

export function initBarKeys() {
  const bar = $('selbar');
  addEventListener('keydown', e => {
    if (e.key !== 'F10' || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    if (enterFromNote() || enterBar(bar)) e.preventDefault();
  });
  // Escape leaves the bar and keeps the selection, so a second Escape is the one that clears it. After a click on the
  // bar, Escape is the board's. A note waiting on its formatting buttons has its own way back (typingFocus).
  bar.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !keyedButton(e.target) || editedNoteBody()) return;
    e.stopPropagation();
    leaveBar();
  });
}
