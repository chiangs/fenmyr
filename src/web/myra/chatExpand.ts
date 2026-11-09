import { $ } from '../core/dom.ts';
import { elementById } from '../ui/dom.ts';
import { replaceMenu } from './slash.ts';

const frame = () => $('mChat');

export const expanded = () => frame().classList.contains('writing');

// CSS does the whole change on the one textarea, so its text, scroll, undo and selection stay. Only focus can lose the
// selection, so it is put back. Focus stays where it was, so a keyboard toggle stays on the button, unless `toBox` asks
// for the textarea (Esc, which shrinks from wherever focus is).
export function setExpanded(on: boolean, toBox = false) {
  if (on === expanded()) return;
  const box = elementById('mcInput', HTMLTextAreaElement),
    btn = $('mcExpand'),
    { selectionStart: start, selectionEnd: end, selectionDirection: dir } = box;
  frame().classList.toggle('writing', on);
  btn.setAttribute('aria-pressed', String(on));
  btn.title = on ? 'Shrink (Esc)' : 'Expand to write';
  if (toBox) box.focus({ preventScroll: true });
  box.setSelectionRange(start, end, dir);
  replaceMenu();
}

export function initExpand() {
  const btn = $('mcExpand');
  // a press must not take the cursor out of the text
  btn.addEventListener('pointerdown', e => e.preventDefault());
  btn.onclick = () => setExpanded(!expanded());
}
