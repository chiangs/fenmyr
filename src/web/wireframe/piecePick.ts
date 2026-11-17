import type { CardOf } from '../../shared/model.ts';
import { boxOf } from '../canvas/emptySpot.ts';
import { type Bounds, toWorld } from '../canvas/handles.ts';
import { renderCard } from '../canvas/render.ts';
import { byId, selectOnly } from '../canvas/wires.ts';
import { queryWords } from '../core/base.ts';
import { $, stage } from '../core/dom.ts';
import { remember, save } from '../core/history.ts';
import { appState, session } from '../core/state.ts';
import { homeAt } from '../library/home.ts';
import { revealCards } from '../panels/zoomMenu.ts';
import { rebuildBar } from '../selbar/barKit.ts';
import { gestureRuns } from '../selbar/context.ts';
import { dockFrame } from '../selbar/float.ts';
import { type Box, dockBeside, GAP } from '../selbar/place.ts';
import { selCards } from '../selbar/selected.ts';
import { placeAt, placing, startPlacing, stopPlacing } from '../tools/place.ts';
import { closestTo, oneIn, textField } from '../ui/dom.ts';
import { closeOnOutsidePress } from '../ui/popover.ts';
import { pickWF } from './designPanel.ts';
import { fillGrid, filterGrid, rove, stepCell, type View, visibleCells } from './pieceGrid.ts';
import { addToScreen } from './placePiece.ts';
import { screenOf } from './screenScope.ts';

/** What a pick does: add to a screen, or give these icons another glyph. */
type PickFor = { kind: 'add'; screen: string } | { kind: 'swap'; ids: readonly string[] };
/** The picker's only state. `from` is what opened it, which Esc gives focus back to. `loose` is what a drop from the
 *  grid left off any screen: while it is the selection, the picker stays with its screen. */
type Picker = { for: PickFor; view: View; from: 'bar' | 'hint'; loose: readonly string[] } | null;
/** What a drag from a grid, the picker's or the Wireframe panel's, carries onto the board. */
export type Drop = { kind: 'piece' | 'icon'; name: string };
type GridDrag = { drop: Drop; x: number; y: number; on: boolean } | null;

let picker: Picker = null;
let gridDrag: GridDrag = null;
let dragged = false;
// the last place the picker was docked, so the tick writes only on a change
let docked = '';

// a drop over any of these is cancelled
const CHROME =
  '.design, .piece-pick, .side, .tray, .tools, .dock, .myra, .selbar, .modebar, .m-chat, .keys, .top, .hub, .sheet, .settings';
// a press inside these leaves the picker open; a press on a card closes it only when it selects one off its screen
const KEEPS = '#piecePick, #selbar, #screenHints, #rh, #mrot, #clrBtn, .card';
const PHONE_GAP = 10;
const MAX_H = 480;

const el = () => $('piecePick');
const grid = () => $('pkGrid');
const search = () => textField('pkSearch');
const onPhone = () => document.body.classList.contains('phone');

/** The screen the open picker adds to, or null while it is closed or swapping icons. */
export const pickerScreen = () => (picker?.for.kind === 'add' ? picker.for.screen : null);
export const pickerFor = () => picker?.for ?? null;

function boundScreen() {
  const s = picker?.for.kind === 'add' ? byId(picker.for.screen) : undefined;
  return s?.type === 'frame' ? s : null;
}

// the icons a swap changes, while every one is still on the board
function swapIcons() {
  if (picker?.for.kind !== 'swap') return null;
  const cs = picker.for.ids.map(byId).filter(c => c?.type === 'icon');
  return cs.length === picker.for.ids.length ? cs : null;
}

// what the picker docks beside: its screen, or the icons it swaps (their screen when they share one)
function anchor(): Bounds | null {
  const icons = swapIcons();
  return icons ? (screenOf(icons) ?? boxOf(icons)) : boundScreen();
}

function showView(view: View) {
  if (!picker) return;
  picker.view = view;
  fillGrid(grid(), view);
  for (const b of el().querySelectorAll('[data-pk-view]'))
    b.setAttribute('aria-pressed', String(b.getAttribute('data-pk-view') === view));
  const q = search(),
    words = view === 'pieces' ? 'Search pieces…' : 'Search icons…';
  q.placeholder = words;
  q.setAttribute('aria-label', words.slice(0, -1));
  filterGrid(grid(), queryWords(q.value));
}

/** Opens the picker on a screen, docked beside it, with the cursor in its search. */
export function openPicker(screen: CardOf<'frame'>, from: 'bar' | 'hint') {
  const fresh = !picker || picker.for.kind === 'swap',
    view = picker?.for.kind === 'add' ? picker.view : 'pieces';
  picker = { for: { kind: 'add', screen: screen.id }, view, from, loose: [] };
  show(fresh);
  showScreen(screen);
  setExpanded(true);
}

/** Change icon in the bar: opens the picker on its icons alone, to give every one of these icons the glyph picked. */
export function toggleSwap(ids: readonly string[]) {
  if (picker?.for.kind === 'swap' && picker.for.ids.join() === ids.join()) return closePicker();
  picker = { for: { kind: 'swap', ids }, view: 'icons', from: 'bar', loose: [] };
  show(true);
}

function show(fresh: boolean) {
  if (!picker) return;
  const swap = picker.for.kind === 'swap',
    p = el();
  if (fresh) search().value = '';
  oneIn(p, '.pk-tabs')?.toggleAttribute('hidden', swap);
  oneIn(p, '.pk-title')?.toggleAttribute('hidden', !swap);
  p.setAttribute('aria-label', swap ? 'Change icon' : 'Pieces');
  showView(picker.view);
  p.hidden = false;
  // a fresh open starts at the top of the grid
  if (fresh) grid().scrollTop = 0;
  docked = '';
  syncPicker();
  // a phone would raise its keyboard over the picker
  if (!onPhone()) search().focus({ preventScroll: true });
}

// The bar is drawn again on the next frame; Pieces says at once whether the picker is open.
function setExpanded(open: boolean) {
  $('selbar').querySelector('[data-pieces]')?.setAttribute('aria-expanded', String(open));
}

/** Closes the picker. `back`: give focus back to what opened it, as Esc does. */
export function closePicker(back = false) {
  if (!picker) return;
  const from = picker.from,
    swap = picker.for.kind === 'swap',
    id = picker.for.kind === 'add' ? picker.for.screen : '';
  picker = null;
  el().hidden = true;
  setExpanded(false);
  endGridDrag();
  rebuildBar();
  if (!back) return;
  // the bar is drawn again on the next frame, so focus waits for its new button
  if (swap) return requestAnimationFrame(() => oneIn($('selbar'), '[data-chicon]')?.focus());
  const pieces = () => oneIn($('selbar'), '[data-pieces]');
  if (from === 'bar') return pieces()?.focus();
  // the hint, hidden while its screen's picker is open, is drawn again on the next frame
  requestAnimationFrame(() => (oneIn($('screenHints'), `[data-hint="${id}"]`) ?? pieces())?.focus());
}

/** Pieces in the bar: opens the picker on its screen, or closes it when it is already open there. */
export function togglePicker(screen: CardOf<'frame'>) {
  if (pickerScreen() === screen.id) closePicker();
  else openPicker(screen, 'bar');
}

// Docks the picker beside what it acts on, or on a phone above the bottom bar, writing only when the place changed.
function dock(s: Bounds) {
  const p = el();
  if (onPhone()) {
    const d = $('dock').getBoundingClientRect(),
      key = `phone ${innerWidth} ${d.top}`;
    if (key === docked) return;
    docked = key;
    Object.assign(p.style, {
      left: `${PHONE_GAP}px`,
      top: '',
      width: `${innerWidth - PHONE_GAP * 2}px`,
      bottom: `${innerHeight - d.top + PHONE_GAP}px`,
      height: `${Math.min(innerHeight / 2, d.top - PHONE_GAP * 2)}px`,
    });
    p.dataset.dock = 'sheet';
    rebuildBar();
    return;
  }
  const { x, y, z } = session.view,
    box = { l: s.x * z + x, t: s.y * z + y, r: (s.x + s.w) * z + x, b: (s.y + s.h) * z + y },
    frame = dockFrame(p),
    key = JSON.stringify([box, frame]);
  if (key === docked) return;
  docked = key;
  p.style.width = p.style.bottom = '';
  const st = stage.getBoundingClientRect(),
    at = dockBeside(
      box,
      frame,
      { w: p.offsetWidth, h: Math.min(MAX_H, frame.b - frame.t) },
      { l: GAP, r: st.width - GAP },
    );
  Object.assign(p.style, {
    left: `${st.left + at.x}px`,
    top: `${st.top + at.y}px`,
    width: `${at.w}px`,
    height: `${at.h}px`,
  });
  // the bar keeps to the screen's side of it, or above a sheet, and folds again for the room it leaves
  p.dataset.dock = at.side === 'edge' ? (at.x + at.w / 2 < (box.l + box.r) / 2 ? 'left' : 'right') : at.side;
  rebuildBar();
}

/** The part of the free view the open picker leaves, in stage pixels: beside it, or above it when it is a sheet. */
function freeArea(): Box | null {
  const p = el();
  if (!picker || p.hidden) return null;
  const f = dockFrame(p),
    r = p.getBoundingClientRect(),
    st = stage.getBoundingClientRect();
  if (p.dataset.dock === 'left') f.l = r.right - st.left + GAP;
  else if (p.dataset.dock === 'right') f.r = r.left - st.left - GAP;
  else f.b = Math.min(f.b, r.top - st.top - GAP);
  return f;
}

const meets = (a: Box, b: Box) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

// When the picker covers all of its screen that is in view, the view moves to show the screen's top beside or above it.
function showScreen(s: CardOf<'frame'>) {
  const a = freeArea();
  if (!a) return;
  const { x, y, z } = session.view,
    st = stage.getBoundingClientRect(),
    r = el().getBoundingClientRect(),
    box = { l: s.x * z + x, t: s.y * z + y, r: (s.x + s.w) * z + x, b: (s.y + s.h) * z + y },
    under = { l: r.left - st.left, t: r.top - st.top, r: r.right - st.left, b: r.bottom - st.top };
  if (meets(box, a) || !meets(box, under)) return;
  revealCards([{ x: s.x, y: s.y, w: s.w, h: Math.min(s.h, (a.b - a.t) / 2 / z) }], a);
}

/** Each frame: closes the picker when its screen is gone, or the selection is about something off it, and otherwise
 *  keeps it docked. It fades while a gesture moves the board, as the bar does. While the view settles after a zoom,
 *  or after a pick brought its piece into view, it stays where it is and takes clicks, and docks once settled. */
export function syncPicker() {
  if (!picker) return;
  const s = anchor(),
    sel = selCards(),
    keep = picker.for.kind === 'swap' ? picker.for.ids : picker.loose,
    same = sel.length === keep.length && sel.every(c => keep.includes(c.id)),
    off = picker.for.kind === 'swap' ? !same : sel.length > 0 && !same && screenOf(sel)?.id !== boundScreen()?.id;
  if (homeAt || !s || off) return closePicker();
  const paused = !onPhone() && gestureRuns();
  el().classList.toggle('paused', paused);
  if (!paused && !stage.classList.contains('moving')) dock(s);
}

// Every icon being swapped takes the glyph picked, as one undo step, and the picker closes.
function swapTo(name: string, keyed: boolean) {
  const icons = swapIcons();
  if (!icons) return;
  remember();
  icons.forEach(c => {
    c.name = name;
    renderCard(c);
  });
  selectOnly(icons.map(c => c.id));
  save();
  closePicker(keyed);
}

// A click on a cell: a piece or icon goes into the screen, and the Box and Text cells put R's and X's tools in hand.
// Nothing happens while a drag runs, or for the click that ends a drag from the grid.
function pick(cell: HTMLElement, keyed: boolean) {
  if (picker?.for.kind === 'swap' && cell.dataset.pkIcon) return swapTo(cell.dataset.pkIcon, keyed);
  const s = boundScreen();
  if (!s || appState.drag || dragged) return;
  const { pkPiece, pkIcon, pkTool } = cell.dataset;
  if (pkTool === 'box' || pkTool === 'text') return pickWF(pkTool);
  stopPlacing();
  pickWF(null);
  const area = freeArea() ?? undefined;
  if (pkPiece) addToScreen(s, { kind: 'piece', name: pkPiece }, area);
  if (pkIcon) addToScreen(s, { kind: 'icon', name: pkIcon }, area);
}

/** A press on a piece or icon in a grid: after 6 px it rides the cursor, and lands where it is let go. */
export function startGridDrag(e: PointerEvent, drop: Drop) {
  if (!e.button) gridDrag = { drop, x: e.clientX, y: e.clientY, on: false };
}

/** Whether a drag from a grid has just ended, so the click it makes is not a pick. */
export const justDragged = () => dragged;

function dragMove(e: PointerEvent) {
  if (!gridDrag || gridDrag.on || Math.hypot(e.clientX - gridDrag.x, e.clientY - gridDrag.y) < 6) return;
  gridDrag.on = true;
  pickWF(null);
  const { kind, name } = gridDrag.drop;
  startPlacing(kind, kind === 'piece' ? { piece: name } : { name }, true);
  document.body.classList.add('dz-dragging');
}

// A drag from a grid stops without landing: Esc, a scroll that took the pointer, or the picker closing.
function endGridDrag() {
  if (!gridDrag?.on) {
    gridDrag = null;
    return;
  }
  gridDrag = null;
  document.body.classList.remove('dz-dragging');
  stopPlacing();
}

function dragEnd(e: PointerEvent) {
  const d = gridDrag;
  gridDrag = null;
  if (!d?.on) return;
  document.body.classList.remove('dz-dragging');
  dragged = true;
  setTimeout(() => {
    dragged = false;
  }, 0);
  const over = document.elementFromPoint(e.clientX, e.clientY);
  if (placing?.type !== d.drop.kind || over?.closest(CHROME)) return stopPlacing();
  remember();
  placeAt(toWorld(e.clientX, e.clientY));
  keepAfterDrop();
}

// A drop keeps the picker open: one on another screen moves it to that screen, and one on the bare board leaves it
// with its own while what was dropped stays selected.
function keepAfterDrop() {
  if (!picker) return;
  const sel = selCards(),
    on = screenOf(sel);
  if (on && picker.for.kind === 'add') picker.for = { kind: 'add', screen: on.id };
  else picker.loose = sel.map(c => c.id);
}

function onKey(e: KeyboardEvent) {
  const q = search(),
    cell = closestTo(e.target, '[data-kw]', HTMLElement);
  if (e.target === q) {
    e.stopPropagation();
    if (e.key === 'Escape' && q.value) {
      q.value = '';
      filterGrid(grid(), []);
    } else if (e.key === 'Escape') closePicker(true);
    else if (e.key === 'Enter') {
      e.preventDefault();
      visibleCells(grid())[0]?.click();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      visibleCells(grid())[0]?.focus();
    }
    return;
  }
  if (e.key === 'Escape') {
    e.stopPropagation();
    // Esc puts down what is in hand first, a piece being dragged out or R's and X's tool, as it does on the board
    if (placing) {
      endGridDrag();
      stopPlacing();
    } else closePicker(true);
    return;
  }
  if (!cell || !e.key.startsWith('Arrow')) return;
  e.preventDefault();
  e.stopPropagation();
  (stepCell(grid(), cell, e.key) ?? q).focus();
}

export function initPiecePick() {
  const p = el();
  ['mousedown', 'wheel', 'dblclick'].forEach(t => {
    p.addEventListener(t, e => e.stopPropagation(), { passive: true });
  });
  p.addEventListener('keydown', onKey);
  p.addEventListener('focusin', e => {
    const cell = closestTo(e.target, '[data-kw]', HTMLElement);
    if (cell) rove(grid(), cell);
  });
  search().addEventListener('input', () => filterGrid(grid(), queryWords(search().value)));
  p.addEventListener('click', e => {
    const view = closestTo(e.target, '[data-pk-view]')?.dataset.pkView;
    if (view === 'pieces' || view === 'icons') {
      showView(view);
      search().focus();
      return;
    }
    if (closestTo(e.target, '[data-pk-close]')) return closePicker(true);
    if (closestTo(e.target, '[data-pk-iconsfor]')) {
      showView('icons');
      search().focus();
      return;
    }
    const cell = closestTo(e.target, '[data-kw]', HTMLElement);
    // a click with no pointer is Enter or Space
    if (cell) pick(cell, e.detail === 0);
  });
  p.addEventListener('pointerdown', e => {
    if (picker?.for.kind === 'swap') return;
    const cell = closestTo(e.target, '[data-pk-piece], [data-pk-icon]'),
      piece = cell?.dataset.pkPiece,
      icon = cell?.dataset.pkIcon;
    if (piece) startGridDrag(e, { kind: 'piece', name: piece });
    if (icon) startGridDrag(e, { kind: 'icon', name: icon });
  });
  addEventListener('pointermove', dragMove, true);
  addEventListener('pointerup', dragEnd, true);
  // a finger that scrolls the grid hands the pointer to the scroll
  addEventListener('pointercancel', endGridDrag, true);
  closeOnOutsidePress(KEEPS, () => picker !== null, closePicker);
}
