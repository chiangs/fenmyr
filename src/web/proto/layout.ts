import type { Board } from '../../shared/model.ts';
import { $ } from '../core/dom.ts';
import { myraOpen } from '../myra/chatWindow.ts';
import { renderCode } from './code.ts';
import { DEFAULT_LAYOUT, DIVIDER, fit, type Layout, MIN, type Pane, STRIP } from './fit.ts';
import { renderGitBar } from './gitbar.ts';
import { renderPreview } from './preview.ts';
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
            closed: PANES.filter(p => Array.isArray(closed) && closed.includes(p)),
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

function build() {
  const panes = PANES.map(p => {
    const label = LABEL[p];
    return `<div class="pr-div" data-d="${p}"></div><section class="pr-pane" data-p="${p}"><header class="pr-head"><b>${label}</b><button class="pr-fold" data-fold="${p}" title="Fold">‹</button></header><div class="pr-body" id="pr-${p}"></div><button class="pr-strip" data-open="${p}" title="Open">${label}</button></section>`;
  }).join('');
  const el = document.createElement('div');
  el.className = 'pr-root';
  el.id = 'proto';
  el.innerHTML = `<div class="pr-chat" id="prChat"></div><div class="pr-main"><div class="pr-git" id="prGit"></div><div class="pr-row">${panes}</div></div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e => {
    const t = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-fold], [data-open]') : null;
    const p = PANES.find(x => x === (t?.dataset.fold ?? t?.dataset.open));
    if (!p || !t) return;
    const l = layout();
    l.closed = t.dataset.fold ? [...l.closed, p] : l.closed.filter(x => x !== p);
    // opening a column the window had folded makes room by folding the other one that folds first
    if (t.dataset.open && fit(l, innerWidth).includes(p)) l.closed.push(p === 'canvas' ? 'code' : 'canvas');
    remember();
    place();
  });
  for (const d of el.querySelectorAll<HTMLElement>('.pr-div')) dragDivider(d);
  new ResizeObserver(placeStage).observe(el.querySelector('[data-p="canvas"] .pr-body') ?? el);
  addEventListener('resize', place);
  return el;
}

// The divider left of a column resizes the column before it: Myra's chat, the preview or the code.
function dragDivider(d: HTMLElement) {
  d.onpointerdown = e => {
    const before = d.dataset.d === 'preview' ? 'chat' : d.dataset.d === 'code' ? 'preview' : 'code';
    const l = layout(),
      start = l[before],
      x0 = e.clientX;
    d.setPointerCapture(e.pointerId);
    d.onpointermove = m => {
      l[before] = Math.max(MIN[before], Math.min(1200, start + m.clientX - x0));
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

function place() {
  if (!root) return;
  const l = layout(),
    folded = fit(l, innerWidth),
    open = PANES.filter(p => !folded.includes(p)),
    last = open.at(-1);
  root.style.setProperty('--chat-w', `${l.chat}px`);
  for (const p of PANES) {
    const pane = root.querySelector<HTMLElement>(`[data-p="${p}"]`);
    if (!pane) continue;
    pane.classList.toggle('folded', folded.includes(p));
    // the last open column takes what's left; the others keep the width they were dragged to
    pane.style.flex = folded.includes(p)
      ? `0 0 ${STRIP}px`
      : p === last
        ? '1 1 0'
        : `0 0 ${p === 'canvas' ? MIN.canvas : l[p]}px`;
    root.querySelector<HTMLElement>(`.pr-div[data-d="${p}"]`)?.style.setProperty('flex', `0 0 ${DIVIDER}px`);
  }
  document.body.classList.toggle('proto-canvas-folded', folded.includes('canvas'));
  placeStage();
}

// Myra's chat moves into the left column on a prototype board, and back under her button everywhere else.
function dockChat(on: boolean) {
  const chat = $('mChat');
  const home = on ? $('prChat') : $('myra');
  if (chat.parentElement !== home) home.prepend(chat);
}

export function showProto(b: Board) {
  const on = b.kind === 'prototype';
  if (!on && !document.body.classList.contains('proto')) return;
  root ??= build();
  if (!Object.keys(layouts).length) layouts = readLayouts();
  boardId = b.id;
  document.body.classList.toggle('proto', on);
  dockChat(on);
  myraOpen(on);
  if (!on) return startSync(b);
  place();
  renderGitBar(b);
  renderCode(b);
  renderPreview(b);
  startSync(b);
}
