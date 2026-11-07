import { labelOf } from '../../shared/cardTypes.ts';
import { selectOnly } from '../canvas/wires.ts';
import { $ } from '../core/dom.ts';
import { session } from '../core/state.ts';
import { heightGrip } from '../settings/panelHeights.ts';
import { closestTo, esc, textField } from '../ui/dom.ts';
import { menuOpen, watchPresses } from '../ui/popover.ts';
import { toolInHand } from '../ui/toolbar.ts';
import { renderChat } from './chatLog.ts';
import { askHint, closes, draftLabel, type Geometry, type Placement, placeChat, type Rect } from './chatRules.ts';
import { keepPerch, perchGoo } from './perch.ts';

// Myra's chat window: her box, M or focus opens it; Esc inside it, the fold button or a click on empty board closes it
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

const whereNow = (): Geometry['where'] => {
  const body = document.body.classList;
  return body.contains('phone') ? 'phone' : body.contains('proto') ? 'proto' : 'desk';
};

const HEIGHT_KEY = 'fenmyr:chatH';
// what the top-edge grip set; placeChat fits it to the window
let height: number | null = null;

function measure(): Geometry {
  const bar = $('dock').getBoundingClientRect();
  return {
    view: { w: innerWidth, h: innerHeight },
    bar: { l: bar.left, t: bar.top, r: bar.right, b: bar.bottom },
    box: boxRect(),
    modeLift: parseFloat(document.body.style.getPropertyValue('--mode-h')) || 0,
    timer: !$('timerChip').hidden,
    height,
    where: whereNow(),
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

/** Opens or closes the chat. `toBox`: a close from inside it hands the cursor to her box. */
export function myraOpen(on: boolean, toBox = false) {
  // a prototype board keeps her chat docked open
  if (!on && document.body.classList.contains('proto')) return;
  const was = chatOpen(),
    active = document.activeElement,
    inChat = active instanceof HTMLElement && $('mChat').contains(active);
  if (on) relayout();
  $('myra').classList.toggle('chat', on);
  $('mPill').setAttribute('aria-expanded', String(on));
  // a closed chat is also visibility:hidden, so nothing in it can keep the cursor. Her box can take it only once the
  // joined chat stops covering it, and it comes from the chat, so it doesn't reopen it.
  if (!on && inChat) {
    if (toBox) $('mPill').focus();
    if ($('mChat').contains(document.activeElement)) active.blur();
  }
  renderDraft();
  if (on) {
    $('mBubble').classList.remove('on');
    renderChat();
    selChipKey = null;
    renderSelChip();
    $('mcInput').focus();
  }
  if (on !== was) perchGoo(on);
}

// a closed chat that holds text says so in her box, in place of "Ask Myra…"
function renderDraft() {
  const label = chatOpen() ? null : draftLabel(textField('mcInput').value),
    draft = $('mDraft');
  draft.hidden = !label;
  draft.textContent = label ?? '';
  $('mPill').querySelector('.m-ask')?.toggleAttribute('hidden', !!label);
}

// the top edge's grip: drag for a taller or shorter chat, remembered; double-click for the usual height
function topGrip() {
  const grip = heightGrip('Drag to change the height · double-click for the usual height', {
    start: () => {
      const h0 = $('mChat').offsetHeight;
      return dy => {
        height = h0 - dy;
        relayout();
        const c = chatOverBoard();
        if (c) height = c.b - c.t;
      };
    },
    end: () => {
      if (height !== null) localStorage.setItem(HEIGHT_KEY, String(Math.round(height)));
    },
    reset: () => {
      height = null;
      localStorage.removeItem(HEIGHT_KEY);
      relayout();
    },
  });
  grip.classList.add('mc-top-grip');
  $('mChat').prepend(grip);
}

// a click on empty board closes the chat; a click on a card, a drag, a pan, or a click that a tool or a menu takes
// leaves it open
const emptyBoard = (t: EventTarget | null) => t instanceof Element && t.matches('#stage, #world, #cards');

function closeRules() {
  height = Number(localStorage.getItem(HEIGHT_KEY)) || null;
  topGrip();
  $('mcClose').onclick = () => {
    if (closes({ type: 'fold' }, whereNow())) myraOpen(false, true);
  };
  $('mChat').addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    // the board's Esc would deselect, and a prototype board's docked chat stays open
    e.stopPropagation();
    if (closes({ type: 'esc', inChat: true, menu: false, composing: e.isComposing }, whereNow())) myraOpen(false, true);
  });
  watchPresses(e => {
    if (!chatOpen()) return null;
    const press = { empty: emptyBoard(e.target), busy: toolInHand() || menuOpen(), button: e.button };
    return travel => {
      if (chatOpen() && closes({ type: 'press', ...press, travel }, whereNow())) myraOpen(false);
    };
  });
  $('mcInput').addEventListener('input', renderDraft);
}

export function init30() {
  closeRules();
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
