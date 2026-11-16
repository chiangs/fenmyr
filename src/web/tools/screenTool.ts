import type { Card } from '../../shared/model.ts';
import { selectOnly } from '../canvas/wires.ts';
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
import { addCard } from './penEdit.ts';
import { centreOnTap, newCard, placing, startPlacing, stopPlacing } from './place.ts';

type Point = { x: number; y: number };
type Rect = Point & { w: number; h: number };
// keys 1 to 5 pick these, in this order
const ORDER = Object.keys(DEVICES).filter(isDevice);
// the smallest screen a drag draws, so a slip of the hand still makes one there is room to work in
const MIN = 120;

/** The lit device: the one in hand, or the one a screen drag would make. Null when the screen tool is down. */
function litDevice(): Device | null {
  if (placing?.type === 'frame') return placing.extra.device ?? 'iPhone';
  const d = appState.drag;
  return d?.mode === 'drawbox' && d.make.kind === 'screen' ? d.make.device : null;
}

export const screenToolOn = () => litDevice() !== null;

// the selected screen's device, else that of the last screen in the board's list with one, else iPhone
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

/** W and the panel's Screen button: the screen tool in hand with the device the board suggests, or down again. */
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

let screenButton: Element | null = null;

/** Runs every frame, so it writes only on a change: the device row and the panel's Screen button follow the tool. */
export function syncScreenBar() {
  const lit = litDevice(),
    bar = $('screenbar');
  if (bar.hidden !== !lit) bar.hidden = !lit;
  for (const b of htmlIn(bar, '[data-dev]')) b.classList.toggle('on', b.dataset.dev === lit);
  screenButton?.classList.toggle('on', !!lit);
}

const chip = (d: Device, i: number) => {
  const [w, h] = DEVICES[d],
    tip = `${d} · ${w} × ${h} · ${i + 1}`;
  return `<button class="sc-dev" data-dev="${d}" title="${tip}">${d}</button>`;
};

export function initScreenTool() {
  screenButton = document.querySelector('[data-wf="frame"]');
  $('scDevs').innerHTML = ORDER.map(chip).join('');
  $('screenbar').addEventListener('pointerdown', e => e.stopPropagation());
  $('screenbar').onclick = e => {
    if (closestTo(e.target, '#scX')) return stopPlacing();
    const d = closestTo(e.target, '[data-dev]')?.dataset.dev;
    if (isDevice(d)) hold(d);
  };
  addEventListener('keydown', e => {
    if (placing?.type !== 'frame' || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || isTyping(e.target)) return;
    const d = ORDER[Number(e.key) - 1];
    if (d) return hold(d);
    if (e.key !== 'Enter' || keyedButton(e.target)) return;
    e.preventDefault();
    const lit = placing.extra.device ?? 'iPhone';
    stopPlacing();
    makeScreen(lit, centerWorld(), true);
  });
}
