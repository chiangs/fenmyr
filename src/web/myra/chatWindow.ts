import { labelOf } from '../../shared/cardTypes.ts';
import { selectOnly } from '../canvas/wires.ts';
import { $ } from '../core/dom.ts';
import { session } from '../core/state.ts';
import { closestTo, esc, textField } from '../ui/dom.ts';
import { renderChat } from './chatLog.ts';
import { askHint, type Geometry, type Placement, placeChat, type Rect } from './chatRules.ts';
import { keepPerch, perchGoo } from './perch.ts';

// Myra's chat window: click her box to open it, click again (or Esc) to close
export const chatOpen = () => $('myra').classList.contains('chat');

const ruler = document.createElement('canvas').getContext('2d');

// with cards selected, the hint says they go along with whatever you send
export function renderHint() {
  const field = textField('mcInput'),
    css = getComputedStyle(field),
    room = field.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight),
    fits = (hint: string) => {
      if (!ruler) return true;
      ruler.font = css.font;
      return ruler.measureText(hint).width <= room;
    };
  field.placeholder = askHint(window.myraName || 'Myra', session.sel.size, session.board?.kind === 'prototype', fits);
}

// her box from layout values, as it wobbles
export function boxRect(): Rect {
  const bar = $('dock').getBoundingClientRect(),
    myra = $('myra'),
    pill = $('mPill'),
    l = bar.left + myra.offsetLeft + pill.offsetLeft,
    t = bar.top + myra.offsetTop + pill.offsetTop;
  return { l, t, r: l + pill.offsetWidth, b: t + pill.offsetHeight };
}

function measure(): Geometry {
  const bar = $('dock').getBoundingClientRect(),
    body = document.body.classList;
  return {
    view: { w: innerWidth, h: innerHeight },
    bar: { l: bar.left, t: bar.top, r: bar.right, b: bar.bottom },
    box: boxRect(),
    modeLift: parseFloat(document.body.style.getPropertyValue('--mode-h')) || 0,
    timer: !$('timerChip').hidden,
    where: body.contains('phone') ? 'phone' : body.contains('proto') ? 'proto' : 'desk',
  };
}

let placed: Placement | null = null;

const setVar = (el: HTMLElement, name: string, px: number) => {
  const v = `${px}px`;
  if (el.style.getPropertyValue(name) !== v) el.style.setProperty(name, v);
};

/** Places the chat from where the bar and her box are now, and seats her on it again. CSS draws the chat and the
 *  timer chip over it from the variables. */
export function relayout() {
  const p = placeChat(measure()),
    myra = $('myra');
  placed = p;
  if (p.kind === 'joined' || p.kind === 'wide') {
    const c = p.chat;
    setVar(myra, '--chat-l', c.l);
    setVar(myra, '--chat-t', c.t);
    setVar(myra, '--chat-w', c.r - c.l);
    setVar(myra, '--chat-h', c.b - c.t);
  }
  if ($('mChat').dataset.place !== p.kind) $('mChat').dataset.place = p.kind;
  renderHint();
  keepPerch();
}

/** Where the open chat sits, or null when it is closed. */
export const chatPlace = (): Placement | null => (chatOpen() ? placed : null);

/** The open chat's rect when it sits over the board (not a phone's sheet or a prototype's docked chat). */
export function chatOverBoard(): Rect | null {
  const p = chatPlace();
  return p?.kind === 'joined' || p?.kind === 'wide' ? p.chat : null;
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
  if (on) relayout();
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
  addEventListener('resize', relayout);
  // tools tucking into ··· or coming back move her box, and the chat with it
  const barWatch = new ResizeObserver(relayout);
  barWatch.observe($('dock'));
  barWatch.observe($('tools'));

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
