import type { Board } from '../../shared/model.ts';
import { $ } from '../core/dom.ts';
import { playAnim } from '../myra/anim.ts';
import { chatLog } from '../myra/chatLog.ts';
import { myraOpen } from '../myra/chatWindow.ts';
import { heightGrip } from '../settings/panelHeights.ts';
import { applyLayout } from '../settings/widgets.ts';
import { applyBoxes } from '../ui/boxes.ts';
import { watchCaptures } from './capture.ts';
import { initChatPictures } from './chatPictures.ts';
import { renderCode } from './code.ts';
import { renderDockHead } from './dockHead.ts';
import { DEFAULT_LAYOUT, DIVIDER, FOLD_ORDER, type Foldable, fit, type Layout, MIN, type Pane, STRIP } from './fit.ts';
import { renderGitBar } from './gitbar.ts';
import { dragOverFrame, renderPreview } from './preview.ts';
import { startSync } from './sync.ts';

// A prototype board's screen: Myra's chat docked on the left and always open, then the preview, the code and the
// canvas. The canvas is the ordinary board, moved into its column, so everything on it works as on any other board.
const KEY = 'fenmyr:protoLayout';
const PANES: Pane[] = ['preview', 'code', 'canvas'];
const LABEL: Record<Pane, string> = { preview: 'Preview', code: 'Code', canvas: 'Board' };

let layouts: Record<string, Layout> = {};
let boardId = '';
let root: HTMLElement | null = null;

const readLayouts = (): Record<string, Layout> => {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (typeof saved !== 'object' || saved === null) return {};
    return Object.fromEntries(
      Object.entries(saved).map(([id, l]) => {
        const n = (k: 'chat' | 'preview' | 'code') => {
          const v = typeof l === 'object' && l !== null ? Reflect.get(l, k) : undefined;
          return typeof v === 'number' && v >= MIN[k] ? Math.min(v, 1600) : DEFAULT_LAYOUT[k];
        };
        const closed = typeof l === 'object' && l !== null ? Reflect.get(l, 'closed') : [];
        return [
          id,
          {
            chat: n('chat'),
            preview: n('preview'),
            code: n('code'),
            closed: FOLD_ORDER.filter(p => Array.isArray(closed) && closed.includes(p)),
          },
        ];
      }),
    );
  } catch {
    return {};
  }
};
const layout = () => (layouts[boardId] ??= { ...DEFAULT_LAYOUT, closed: [] });
const remember = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(layouts));
  } catch {}
};

// left to right: the board, the preview, the code, then Myra's chat
const ORDER: Pane[] = ['canvas', 'preview', 'code'];
// the way each folding column folds: the board to the window's left edge, the code towards Myra. Its arrow points
// that way while it's open, and back the other way on the strip it folds into.
const FOLD_TO: Partial<Record<Pane, 'left' | 'right'>> = { canvas: 'left', code: 'right' };
const MOVE_MS = 240;
let animate = false;
const moving = () =>
  animate && !document.body.classList.contains('calm') && !matchMedia('(prefers-reduced-motion: reduce)').matches;

function build() {
  const panes = ORDER.map((p, i) => {
    const label = LABEL[p],
      divider = i ? `<div class="pr-div" data-d="${p}"></div>` : '',
      side = FOLD_TO[p],
      shut = side ? Icon(`caret-${side}`, { size: 14 }) : '',
      open = side ? Icon(side === 'left' ? 'caret-right' : 'caret-left', { size: 14 }) : '',
      fold = side ? `<button class="pr-fold" data-fold="${p}" title="Fold">${shut}</button>` : '',
      strip = side
        ? `<button class="pr-strip" data-open="${p}" title="Open">${open}<span>${label}</span></button>`
        : '';
    return `${divider}<section class="pr-pane" data-p="${p}"><header class="pr-head"><b>${label}</b>${fold}</header><div class="pr-body" id="pr-${p}"></div>${strip}</section>`;
  }).join('');
  const el = document.createElement('div');
  el.className = 'pr-root';
  el.id = 'proto';
  el.innerHTML = `<div class="pr-row">${panes}</div><div class="pr-div" data-d="chat"></div><div class="pr-chat" id="prChat"></div>`;
  document.body.appendChild(el);
  // the git bar lives in Myra's chat, between the thread and the input's height grip; off a prototype board it's hidden
  const git = document.createElement('div');
  git.className = 'pr-git';
  git.id = 'prGit';
  $('mcList').after(git);
  el.addEventListener('click', e => {
    const t = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-fold], [data-open]') : null;
    const p = FOLD_ORDER.find(x => x === (t?.dataset.fold ?? t?.dataset.open));
    if (!p || !t) return;
    const l = layout();
    l.closed = t.dataset.fold ? [...l.closed, p] : l.closed.filter(x => x !== p);
    // opening a column the window had folded makes room by folding the other one that folds first
    if (t.dataset.open && fit(l, innerWidth).includes(p)) l.closed.push(p === 'canvas' ? 'code' : 'canvas');
    remember();
    animate = true;
    place();
    animate = false;
  });
  for (const d of el.querySelectorAll<HTMLElement>('.pr-div')) dragDivider(d);
  inputGrip();
  initChatPictures();
  watchCaptures();
  new ResizeObserver(placeStage).observe(el.querySelector('[data-p="canvas"] .pr-body') ?? el);
  addEventListener('resize', place);
  return el;
}

// A divider resizes the column to its right: the preview, the code or Myra's chat. The board takes what's left.
function dragDivider(d: HTMLElement) {
  d.onpointerdown = e => {
    const right = d.dataset.d === 'preview' ? 'preview' : d.dataset.d === 'code' ? 'code' : 'chat';
    const l = layout(),
      start = l[right],
      x0 = e.clientX;
    dragOverFrame(d, e);
    d.onpointermove = m => {
      l[right] = Math.max(MIN[right], Math.min(1200, start - (m.clientX - x0)));
      place();
    };
    d.onpointerup = () => {
      d.onpointermove = null;
      remember();
    };
  };
}

// the ordinary canvas, moved to sit exactly over its column
function placeStage() {
  const slot = root?.querySelector<HTMLElement>('[data-p="canvas"] .pr-body');
  if (!slot) return;
  const r = slot.getBoundingClientRect(),
    s = document.body.style;
  s.setProperty('--slot-l', `${r.left}px`);
  s.setProperty('--slot-t', `${r.top}px`);
  s.setProperty('--slot-w', `${r.width}px`);
  s.setProperty('--slot-h', `${r.height}px`);
}

// A column folding or opening slides: every column's width moves together, the folding one's content stays until it's
// a strip, and an opening one shows its content as it grows. Dragging and window resizes stay immediate.
function slide(pane: HTMLElement, p: Pane, isFolded: boolean) {
  const r = root;
  if (!r) return;
  r.classList.add('pr-animating');
  if (p === 'canvas') document.body.classList.add('proto-canvas-moving');
  if (!isFolded) {
    pane.classList.remove('folded');
    if (p === 'canvas') document.body.classList.remove('proto-canvas-folded');
  }
  setTimeout(() => {
    r.classList.remove('pr-animating');
    if (p === 'canvas') document.body.classList.remove('proto-canvas-moving');
    // the window may have changed meanwhile, so what's folded is worked out again
    const now = fit(layout(), innerWidth).some(f => f === p);
    pane.classList.toggle('folded', now);
    if (p === 'canvas') document.body.classList.toggle('proto-canvas-folded', now);
    placeStage();
  }, MOVE_MS);
}

function place() {
  if (!root) return;
  const l = layout(),
    folded = fit(l, innerWidth),
    // the first open column, the board unless it's folded, takes what's left
    flexer = ORDER.find(p => !folded.some(f => f === p));
  root.style.setProperty('--chat-w', `${l.chat}px`);
  const slides = moving();
  for (const p of PANES) {
    const pane = root.querySelector<HTMLElement>(`[data-p="${p}"]`);
    if (!pane) continue;
    const isFolded = folded.some(f => f === p);
    if (slides && pane.classList.contains('folded') !== isFolded) slide(pane, p, isFolded);
    else if (!root.classList.contains('pr-animating')) pane.classList.toggle('folded', isFolded);
    // the last open column takes what's left; the others keep the width they were dragged to
    pane.style.flex = isFolded
      ? `0 0 ${STRIP}px`
      : p === flexer
        ? '1 1 0'
        : `0 0 ${p === 'canvas' ? MIN.canvas : l[p]}px`;
  }
  for (const d of root.querySelectorAll<HTMLElement>('.pr-div')) d.style.flex = `0 0 ${DIVIDER}px`;
  if (!root.classList.contains('pr-animating'))
    document.body.classList.toggle('proto-canvas-folded', folded.includes('canvas'));
  placeStage();
}

// Myra's chat moves into the left column on a prototype board, and back to her box everywhere else.
// Her pixel-art self sits in the chat's header there, on the spot she perches on elsewhere; her box is hidden.
function dockChat(on: boolean) {
  const chat = $('mChat'),
    home = on ? $('prChat') : $('myra');
  if (chat.parentElement !== home) home.prepend(chat);
  const slot = $('gooSlot'),
    spot = on ? $('mcPerch') : $('mPill');
  if (spot && slot.parentElement !== spot) {
    slot.classList.remove('perched');
    slot.style.transform = '';
    spot.prepend(slot);
  }
}

const INPUT_KEY = 'fenmyr:protoInputH',
  INPUT_H = 140;
const inputHeight = (h: number) => {
  const px = Math.round(Math.max(64, Math.min(innerHeight * 0.6, h)));
  $('prChat').style.setProperty('--input-h', `${px}px`);
  return px;
};

// the panels' height grip, above Myra's input: drag it up for more room to write a build request
function inputGrip() {
  const grip = heightGrip('Drag to change the height · double-click for automatic', {
    start: () => {
      const h0 = $('mcInput').offsetHeight;
      return dy => localStorage.setItem(INPUT_KEY, String(inputHeight(h0 - dy)));
    },
    reset: () => {
      localStorage.removeItem(INPUT_KEY);
      inputHeight(INPUT_H);
    },
  });
  grip.classList.add('mc-grip');
  $('mcForm').before(grip);
  inputHeight(Number(localStorage.getItem(INPUT_KEY)) || INPUT_H);
}

// a folded column opened by something other than its strip, such as Myra's Show files
export function openColumn(p: Foldable) {
  const l = layout();
  if (!l.closed.includes(p)) return;
  l.closed = l.closed.filter(x => x !== p);
  remember();
  animate = true;
  place();
  animate = false;
}

export function showProto(b: Board) {
  const on = b.kind === 'prototype';
  if (!on && !document.body.classList.contains('proto')) return;
  root ??= build();
  if (!Object.keys(layouts).length) layouts = readLayouts();
  boardId = b.id;
  document.body.classList.toggle('proto', on);
  applyLayout();
  applyBoxes();
  dockChat(on);
  myraOpen(on);
  if (!on) return startSync(b);
  // an empty chat: she tilts her head, wondering what you'll build
  if (!chatLog().length) playAnim('curious', false);
  place();
  renderDockHead(b);
  renderGitBar(b);
  renderCode(b);
  renderPreview(b);
  startSync(b);
}
