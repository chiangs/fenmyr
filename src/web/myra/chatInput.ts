import { $ } from '../core/dom.ts';
import { elementById } from '../ui/dom.ts';
import { chatKey } from './chatKeys.ts';
import { myraOpen } from './chatWindow.ts';
import { boxState, menuKey } from './slash.ts';

const box = () => elementById('mcInput', HTMLTextAreaElement);

// the one way code changes Myra's draft: it sends input as typing does, so the slash menu and the box's size follow
export function setChatText(text: string) {
  const el = box();
  el.value = text;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

export function initChatInput() {
  const el = box(),
    lines = $('mcLines'),
    size = () => showSize(el, lines);
  el.addEventListener('keydown', e => onKey(e, el));
  el.addEventListener('input', size);
  el.addEventListener('scroll', size);
  // a window resize, a grip drag or docking changes how much fits, with no input event
  new ResizeObserver(size).observe(el);
}

function onKey(e: KeyboardEvent, el: HTMLTextAreaElement) {
  const a = chatKey(e, boxState(el.value));
  switch (a.type) {
    case 'pass':
      return;
    case 'ime':
    case 'line':
      e.stopPropagation();
      return;
    case 'send':
      e.preventDefault();
      e.stopPropagation();
      el.form?.requestSubmit();
      return;
    case 'close':
      e.stopPropagation();
      myraOpen(false);
      return;
    case 'menu':
      e.preventDefault();
      e.stopPropagation();
      menuKey(a.key);
      return;
    default: {
      const unhandled: never = a;
      return unhandled;
    }
  }
}

// CSS sets the height and its cap; this only reads whether the text goes past it. Lines are counted as written, so one
// long paragraph scrolls with no count. An empty box never counts: its scroll height measures a wrapped placeholder.
function showSize(el: HTMLTextAreaElement, lines: HTMLElement) {
  const over = !!el.value && el.scrollHeight - el.clientHeight > 1,
    n = el.value.split('\n').length;
  lines.hidden = !over || n < 2;
  lines.textContent = `${n} lines`;
  el.classList.toggle('fade-top', over && el.scrollTop > 0);
}
