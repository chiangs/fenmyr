import { $ } from '../core/dom.ts';
import { session } from '../core/state.ts';
import { heightGrip } from '../settings/panelHeights.ts';
import { settings } from '../settings/settings.ts';
import { textField } from '../ui/dom.ts';
import { menuOpen, watchPresses } from '../ui/popover.ts';
import { toolInHand } from '../ui/toolbar.ts';
import { renderChat } from './chatLog.ts';
import {
  askHint,
  closes,
  closeWait,
  draftLabel,
  type Geometry,
  type ModeBar,
  type Placement,
  placeChat,
  type Rect,
} from './chatRules.ts';
import { keepPerch, perchGoo } from './perch.ts';
import { initSees, renderSees, seenSelection } from './seesStrip.ts';

// Myra's chat window: her box or M opens it; Esc inside it, the fold button or a click on empty board closes it
export const chatOpen = () => $('myra').classList.contains('chat');

const ruler = document.createElement('canvas').getContext('2d');

// with cards going along, the hint says so
export function renderHint() {
  const field = textField('mcInput'),
    css = getComputedStyle(field),
    room = field.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight),
    fits = (hint: string) => {
      if (!ruler) return true;
      ruler.font = css.font;
      return ruler.measureText(hint).width <= room;
    };
  field.placeholder = askHint(window.myraName || 'Myra', seenSelection(), session.board?.kind === 'prototype', fits);
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

let mode: ModeBar | null = null;

/** Drawing's or find's bar came up, went, or changed: the chat places itself around it again. */
export function setModeBar(m: ModeBar | null) {
  if (m?.lift === mode?.lift && m?.l === mode?.l && m?.w === mode?.w) return;
  mode = m;
  relayout();
}

function measure(): Geometry {
  const bar = $('dock').getBoundingClientRect();
  return {
    view: { w: innerWidth, h: innerHeight },
    bar: { l: bar.left, t: bar.top, r: bar.right, b: bar.bottom },
    box: boxRect(),
    mode,
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

/** Opens or closes the chat. `toBox`: a close from inside it hands the cursor to her box. */
export function myraOpen(on: boolean, toBox = false) {
  // a prototype board keeps her chat docked open
  if (!on && document.body.classList.contains('proto')) return;
  const was = chatOpen(),
    active = document.activeElement,
    inChat = active instanceof HTMLElement && $('mChat').contains(active);
  if (on) {
    relayout();
    cancelClose();
  }
  $('myra').classList.toggle('chat', on);
  $('mPill').setAttribute('aria-expanded', String(on));
  // a closed chat is inert, so nothing in it can keep the cursor. Her box can take it only once the joined chat stops
  // covering it.
  if (!on && inChat) {
    if (toBox) $('mPill').focus();
    if ($('mChat').contains(document.activeElement)) active.blur();
  }
  renderDraft();
  if (on) {
    $('mBubble').classList.remove('on');
    renderChat();
    renderSees();
    $('mcInput').focus();
  }
  if (on !== was) perchGoo(on);
}

// a closed chat that holds text says so in her box, in place of "Ask Myra…"
function renderDraft() {
  const label = chatOpen() ? null : draftLabel(textField('mcInput').value, window.myraName || 'Myra'),
    draft = $('mDraft'),
    pill = $('mPill');
  draft.hidden = !label;
  draft.textContent = label?.shown ?? '';
  pill.querySelector('.m-ask')?.toggleAttribute('hidden', !!label);
  if (label) pill.setAttribute('aria-label', label.spoken);
  else pill.removeAttribute('aria-label');
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

let closing = 0;
function cancelClose() {
  clearTimeout(closing);
  closing = 0;
}

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
    if (closes({ type: 'esc', composing: e.isComposing }, whereNow())) myraOpen(false, true);
  });
  watchPresses(e => {
    if (!chatOpen()) return null;
    const press = {
      empty: emptyBoard(e.target),
      busy: toolInHand() || menuOpen(),
      second: !!closing,
      button: e.button,
    };
    cancelClose();
    return travel => {
      if (!chatOpen() || !closes({ type: 'press', ...press, travel }, whereNow())) return;
      const wait = closeWait(settings.dblNote !== false) - (performance.now() - e.timeStamp);
      closing = window.setTimeout(() => {
        closing = 0;
        myraOpen(false);
      }, wait);
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

  initSees();
  ['pointerup', 'keyup'].forEach(ev => {
    document.addEventListener(
      ev,
      () => {
        if (chatOpen()) setTimeout(renderSees, 0);
      },
      true,
    );
  });
}
