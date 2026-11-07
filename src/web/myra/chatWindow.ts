import { labelOf } from '../../shared/cardTypes.ts';
import { selectOnly } from '../canvas/wires.ts';
import { $ } from '../core/dom.ts';
import { session } from '../core/state.ts';
import { closestTo, esc, textField } from '../ui/dom.ts';
import { renderChat } from './chatLog.ts';
import { askHint } from './chatRules.ts';
import { perchGoo } from './perch.ts';

// Myra's chat window: click her box to open it, click again (or Esc) to close
export const chatOpen = () => $('myra').classList.contains('chat');

// with cards selected, the hint says they go along with whatever you send
export function renderHint() {
  textField('mcInput').placeholder = askHint(
    window.myraName || 'Myra',
    session.sel.size,
    session.board?.kind === 'prototype',
  );
}

// a little chip above the box says which cards are selected (they go along with what you send); it follows the selection while the chat is open
let selChipKey: string | null = null;

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
  const key = `${cs.map(c => c.id).join(',')}|${words}`;
  if (key === selChipKey) return;
  selChipKey = key;
  renderHint();
  if (!cs.length) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  const kind = one ? esc(labelOf(one.type)) : '',
    quote = esc(words),
    said = words ? ` · “${quote}”` : '',
    count = cs.length,
    what = one ? kind + said : `${count} cards selected`;
  el.innerHTML = `<span class="mcs-t">${what}</span><button type="button" class="mcs-x" title="Deselect" aria-label="Deselect">×</button>`;
  el.hidden = false;
}

export function myraOpen(on: boolean) {
  // a prototype board keeps her chat docked open
  if (!on && document.body.classList.contains('proto')) return;
  const was = chatOpen(),
    active = document.activeElement;
  if (!on && active instanceof HTMLElement && $('mChat').contains(active))
    active.blur(); /* a closed chat is also visibility:hidden, so nothing in it can keep or take the cursor */
  $('myra').classList.toggle('chat', on);
  $('mPill').setAttribute('aria-expanded', String(on));
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
    if (closestTo(e.target, '.mcs-x')) {
      selectOnly([]);
      renderSelChip();
    }
  };

  ['pointerup', 'keyup'].forEach(ev => {
    document.addEventListener(
      ev,
      () => {
        if (chatOpen()) setTimeout(renderSelChip, 0);
      },
      true,
    );
  });
}
