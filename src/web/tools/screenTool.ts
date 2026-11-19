import type { Card } from '../../shared/model.ts';
import { selectOnly } from '../canvas/selection.ts';
import { $ } from '../core/dom.ts';
import { remember } from '../core/history.ts';
import { appState, session } from '../core/state.ts';
import { keyedButton } from '../input/keyed.ts';
import { centerWorld } from '../panels/zoomMenu.ts';
import { frameTip } from '../repo/start.ts';
import { selCards } from '../selbar/selected.ts';
import { snapTo } from '../settings/licenses.ts';
import { closestTo, htmlIn, isTyping } from '../ui/dom.ts';
import { screenOf } from '../wireframe/screenScope.ts';
import { DEVICES, type Device, isDevice } from '../wireframe/wireframes.ts';
import { CLICK_BOX, finishDrawn } from './drawn.ts';
import { addCard } from './penEdit.ts';
import { centreOnTap, newCard, placeAt, placing, startPlacing, stopPlacing } from './place.ts';

type Point = { x: number; y: number };
type Rect = Point & { w: number; h: number };
// keys 1 to 5 pick these, in this order
const ORDER = Object.keys(DEVICES).filter(isDevice);
// the smallest screen a drag draws, so a slip of the hand still makes one there is room to work in
const MIN = 120;

/** The wireframe tool in hand, which the Wireframe row lights: a device's screen, R's box, X's text, or an icon whose
 *  glyph is picked once it lands. An icon dragged from the picker already has one, and is not a tool. */
type WfTool = { kind: 'screen'; device: Device } | { kind: 'box' } | { kind: 'text' } | { kind: 'icon' };

function wfTool(): WfTool | null {
  const d = appState.drag;
  if (d?.mode === 'drawbox')
    return d.make.kind === 'screen' ? { kind: 'screen', device: d.make.device } : { kind: 'box' };
  switch (placing?.type) {
    case 'frame':
      return { kind: 'screen', device: placing.extra.device ?? 'iPhone' };
    case 'box':
      return { kind: 'box' };
    case 'text':
      return { kind: 'text' };
    case 'icon':
      return placing.extra.name ? null : { kind: 'icon' };
    default:
      return null;
  }
}

export const wfToolOn = () => wfTool() !== null;

function defaultDevice(): Device {
  const own = screenOf(selCards())?.device,
    last = session.board.cards
      .map(c => (c.type === 'frame' ? c.device : undefined))
      .filter(isDevice)
      .at(-1);
  return isDevice(own) ? own : (last ?? 'iPhone');
}

function hold(d: Device) {
  if (placing?.type === 'frame' && placing.extra.device === d) return; // the lit chip again keeps the tool in hand
  startPlacing('frame', { device: d });
  const a = /^[aeiou]/i.test(d) ? 'an' : 'a';
  $('placeHint').textContent = `Click for ${a} ${d} screen, or drag any size · Esc to cancel`;
}

/** W and the Wireframe button: the screen tool in hand with the device the board suggests, or down again. */
export function startScreen() {
  if (placing?.type === 'frame') return stopPlacing();
  hold(defaultDevice());
}

// a screen sits on no screen, as one moved onto another doesn't
function land(c: Card) {
  remember();
  addCard(c);
  selectOnly([c.id]);
  frameTip();
}

/** A device's screen where the ghost showed it, or centred on the point; on a phone, centred on the tap. */
export function makeScreen(device: Device, w: Point, centred = false) {
  const c = newCard('frame', { device });
  if (!c) return;
  const z = session.view.z;
  c.x = snapTo(centred ? w.x - c.w / 2 : w.x - 14 / z);
  c.y = snapTo(centred ? w.y - c.h / 2 : w.y - 14 / z);
  if (window.__phone?.on) centreOnTap(c, w);
  land(c);
}

/** A Custom screen the size of the drag, square-cornered. */
export function drawScreen(r: Rect) {
  const c = newCard('frame', {});
  if (!c) return;
  Object.assign(c, { x: r.x, y: r.y, w: Math.max(MIN, Math.round(r.w)), h: Math.max(MIN, Math.round(r.h)) });
  land(c);
}

let wfButton: Element | null = null;

const press = (b: Element, on: boolean) => {
  b.classList.toggle('on', on);
  if (b.ariaPressed !== String(on)) b.ariaPressed = String(on);
};

/** Enter with a wireframe tool in hand places what it makes in the middle of the view, as a click there would. */
function placeHeld(t: WfTool) {
  const w = centerWorld();
  stopPlacing();
  switch (t.kind) {
    case 'screen':
      return makeScreen(t.device, w, true);
    case 'box': {
      const at = { x: w.x - CLICK_BOX.w / 2, y: w.y - CLICK_BOX.h / 2 };
      return finishDrawn({ kind: 'box' }, at, at);
    }
    case 'text':
    case 'icon':
      startPlacing(t.kind);
      return placeAt(w);
    default: {
      const unknown: never = t;
      return unknown;
    }
  }
}

/** The Wireframe button pressed from the keyboard: the keyboard goes to the lit device, so Tab reaches the rest. */
export function focusScreenBar() {
  syncScreenBar();
  $('screenbar').querySelector<HTMLElement>('.on')?.focus();
}

/** Runs every frame, so it writes only on a change: the Wireframe row and the bottom bar's button follow the tool. */
export function syncScreenBar() {
  const t = wfTool(),
    bar = $('screenbar');
  if (!t && bar.hidden) return;
  if (bar.hidden === !!t) {
    bar.hidden = !t;
    // what rides the pointer goes under the row while it is up, in the stage below the mode card, and over the bottom
    // bar otherwise, so a screen's ghost never hides the row's tools
    if (t) $('selbar').before($('ghost'));
    else $('stage').before($('ghost'));
  }
  const lit = t?.kind === 'screen' ? t.device : null;
  for (const b of htmlIn(bar, '[data-dev]')) press(b, b.dataset.dev === lit);
  for (const b of htmlIn(bar, '[data-wft]')) press(b, b.dataset.wft === t?.kind);
  if (wfButton) press(wfButton, !!t);
}

const chip = (d: Device, i: number) => {
  const [w, h] = DEVICES[d],
    tip = `${d} · ${w} × ${h} · ${i + 1}`;
  return `<button class="sc-dev" data-dev="${d}" title="${tip}" aria-pressed="false">${d}</button>`;
};

export function initScreenTool() {
  wfButton = $('tools').querySelector('[data-add="frame"]');
  $('scDevs').innerHTML = ORDER.map(chip).join('');
  $('screenbar').addEventListener('pointerdown', e => e.stopPropagation());
  $('screenbar').onclick = e => {
    if (closestTo(e.target, '#scX')) return stopPlacing();
    const d = closestTo(e.target, '[data-dev]')?.dataset.dev,
      tool = closestTo(e.target, '[data-wft]')?.dataset.wft;
    const t = wfTool(),
      b = closestTo(e.target, '[data-dev], [data-wft]');
    // Enter or Space on the lit chip or tool places it, so the keyboard alone can place each one
    if (t && e.detail === 0 && b?.classList.contains('on')) return placeHeld(t);
    if (isDevice(d)) hold(d);
    if (tool === 'box' || tool === 'text' || tool === 'icon') startPlacing(tool);
  };
  addEventListener('keydown', e => {
    const t = wfTool();
    if (!t || appState.drag || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || isTyping(e.target)) return;
    const d = ORDER[Number(e.key) - 1];
    if (d && t.kind === 'screen') return hold(d);
    if (e.key !== 'Enter' || keyedButton(e.target)) return;
    e.preventDefault();
    placeHeld(t);
  });
}
