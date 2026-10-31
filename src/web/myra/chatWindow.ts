// @ts-nocheck
import { esc } from '../ui/dom.ts';
import { labelOf } from '../../shared/cardTypes.ts';
import { selectOnly } from '../canvas/wires.ts';
import { $ } from '../core/dom.ts';
import { perchGoo, renderChat } from './chat.ts';
import { session } from '../core/state.ts';

// ---------- Myra's chat window: click her to open it, click again (or Esc) to close ----------
export const chatOpen = () => $('myra').classList.contains('chat');

// with cards selected, the chat's hint says what "this" will mean: they go along with whatever you send
const askHint = () =>
  session.sel.size === 1
    ? 'Change this… “make it say…”, “turn it mint”'
    : session.sel.size > 1
      ? `Change these ${session.sel.size}… “rename to step 1, 2, 3”`
      : 'Ask Myra… “group these by theme”';

// a little chip above the box says which cards are selected (they go along with what you send); it follows the selection while the chat is open
let selChipKey = null;

function renderSelChip() {
  const el = $('mcSel');
  if (!el || !session.board) return;
  const cs = session.board.cards.filter(c => session.sel.has(c.id)),
    one = cs.length === 1 ? cs[0] : null;
  const words = one
    ? String(one.name || one.text || one.title || one.label || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 34)
    : '';
  const key = cs.map(c => c.id).join(',') + '|' + words;
  if (key === selChipKey) return;
  selChipKey = key;
  $('mcInput').placeholder = askHint();
  if (!cs.length) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  el.innerHTML = `<span class="mcs-t">${one ? `${esc(labelOf(one.type))}${words ? ` · “${esc(words)}”` : ''}` : `${cs.length} cards selected`}</span><button type="button" class="mcs-x" title="Deselect" aria-label="Deselect">×</button>`;
  el.hidden = false;
}

export function myraOpen(on) {
  const was = chatOpen();
  if (!on && $('mChat').contains(document.activeElement))
    document.activeElement.blur(); /* a closed chat is also visibility:hidden, so nothing in it can keep or take the cursor */
  $('myra').classList.toggle('chat', on);
  if (on) {
    $('mBubble').classList.remove('on');
    renderChat();
    selChipKey = null;
    renderSelChip();
    $('mcInput').focus();
  }
  if (on !== was) perchGoo(on);
}
export function init30() {
  $('mcSel').onclick = e => {
    if (e.target.closest('.mcs-x')) {
      selectOnly([]);
      renderSelChip();
    }
  };

  ['pointerup', 'keyup'].forEach(ev =>
    document.addEventListener(
      ev,
      () => {
        if (chatOpen()) setTimeout(renderSelChip, 0);
      },
      true,
    ),
  );
}
