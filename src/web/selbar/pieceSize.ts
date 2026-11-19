import type { Card, CardOf } from '../../shared/model.ts';
import { renderCard } from '../canvas/render.ts';
import { selectOnly } from '../canvas/selection.ts';
import { renderWires } from '../canvas/wires.ts';
import { parentOf } from '../cards/collection.ts';
import { $ } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { byId, session } from '../core/state.ts';
import { keyedButton } from '../input/keyed.ts';
import { closestTo, esc, htmlIn, oneIn } from '../ui/dom.ts';
import { fileIntoFrame, onFrame } from '../wireframe/tilt.ts';
import { DEVICES, type Device, isDevice } from '../wireframe/wireframes.ts';
import { caret, closeSbPops, FOLD_PIECE, G, inVisit, pop } from './barKit.ts';
import { fontLabel, fontTargets } from './fontPop.ts';
import { group, one } from './group.ts';

type Field = 'name' | 'x' | 'y' | 'w' | 'h' | 'rot' | 'isz';
type SizeOf =
  | { kind: 'screen'; c: CardOf<'frame'> }
  | { kind: 'box'; c: CardOf<'box'> }
  | { kind: 'text'; c: CardOf<'text'> }
  | { kind: 'icon'; c: CardOf<'icon'> };

const FIELDS: Record<SizeOf['kind'], readonly Field[]> = {
  screen: ['name', 'x', 'y', 'w', 'h'],
  box: ['x', 'y', 'w', 'h', 'rot'],
  text: ['x', 'y', 'w', 'rot'], // a text's height follows its words
  icon: ['x', 'y', 'isz', 'rot'],
};

// what each field shows beside it, and the name a screen reader reads for it
const LABEL: Record<Field, readonly [shown: string, read: string]> = {
  name: ['Name', 'Screen name'],
  x: ['X', 'X position'],
  y: ['Y', 'Y position'],
  w: ['W', 'Width'],
  h: ['H', 'Height'],
  rot: ['Rotate°', 'Rotation in degrees'],
  isz: ['Size', 'Icon size'],
};
const isField = (k: unknown): k is Field => typeof k === 'string' && Object.hasOwn(LABEL, k);

function sizeOf(c: Card | null | undefined): SizeOf | null {
  switch (c?.type) {
    case 'frame':
      return { kind: 'screen', c };
    case 'box':
      return { kind: 'box', c };
    case 'text':
      return { kind: 'text', c };
    case 'icon':
      return { kind: 'icon', c };
    default:
      return null;
  }
}

const deviceOf = (c: CardOf<'frame'>): Device | 'Custom' => (isDevice(c.device) ? c.device : 'Custom');

function triggerOf(s: SizeOf) {
  switch (s.kind) {
    case 'screen':
      return deviceOf(s.c);
    case 'box':
      return `${Math.round(s.c.w)} × ${Math.round(s.c.h)}`;
    case 'text':
    case 'icon':
      return String(Math.round(s.c.w));
    default: {
      const unknown: never = s;
      return unknown;
    }
  }
}
const tipOf = (s: SizeOf) => (s.kind === 'screen' ? 'Device and size' : 'Size and place');
const readOf = (s: SizeOf) => `${tipOf(s)}, ${triggerOf(s)}`;

function shownOf(c: Card, f: Field): string {
  switch (f) {
    case 'name':
      return c.type === 'frame' ? (c.name ?? '') : '';
    case 'x':
    case 'y':
    case 'w':
    case 'h':
      return String(Math.round(c[f]));
    case 'rot':
      return String(c.rot || 0);
    case 'isz':
      return String(Math.round(c.w));
    default: {
      const unknown: never = f;
      return unknown;
    }
  }
}

function fieldHtml(c: Card, f: Field) {
  const [shown, read] = LABEL[f],
    value = esc(shownOf(c, f)),
    type = f === 'name' ? 'text' : 'number',
    wide = f === 'name' || f === 'rot' ? 'wide' : '',
    off = c.locked ? ' disabled' : '';
  return `<label class="sbz-f ${wide}"><span aria-hidden="true">${shown}</span><input data-size="${f}" type="${type}" value="${value}" aria-label="${read}" spellcheck="false"${off}></label>`;
}

function devicesHtml(c: CardOf<'frame'>) {
  const cur = deviceOf(c),
    off = c.locked ? ' disabled' : '';
  const rows = ['Custom', ...Object.keys(DEVICES)].map(d => {
    const on = cur === d,
      cls = on ? 'on' : '',
      size = isDevice(d) ? `${DEVICES[d][0]} × ${DEVICES[d][1]}` : '';
    return `<button data-device="${d}" class="${cls}" aria-pressed="${on}"${off}><b>${d}</b> <span>${size}</span></button>`;
  });
  const list = rows.join('');
  return `<div class="sb-sizelist sbz-devices" role="group" aria-label="Device">${list}</div>`;
}

// the fonts of every text on the screen, opening the font picker for all of them; none while it holds no text
function fontRowHtml(c: CardOf<'frame'>) {
  const ts = fontTargets([c]);
  if (!ts.length) return '';
  const { name, style } = fontLabel(ts),
    read = `Font of every text on this screen, ${name}`;
  return `<button class="sbz-fontrow" data-sbfont="screen" aria-label="${read}" aria-haspopup="dialog"><span>Font</span><b style="${style}">${name}</b></button>`;
}

function sizeHtml(s: SizeOf) {
  const [first, ...rest] = FIELDS[s.kind],
    lead = s.kind === 'screen' && first ? fieldHtml(s.c, first) + devicesHtml(s.c) + fontRowHtml(s.c) : '',
    fields = (lead ? rest : FIELDS[s.kind]).map(f => fieldHtml(s.c, f)).join(''),
    trig = esc(triggerOf(s)),
    id = s.c.id,
    CARET = caret();
  return G(
    FOLD_PIECE,
    pop(
      'place',
      `<b>${trig}</b>${CARET}`,
      `<div class="sb-size" data-size-for="${id}">${lead}<div class="sbz-grid">${fields}</div></div>`,
      tipOf(s),
      readOf(s),
    ),
  );
}

// the card a dropdown was drawn for, which may no longer be the one selected
const ownerOf = (el: Element) => sizeOf(byId(el.closest<HTMLElement>('[data-size-for]')?.dataset.sizeFor ?? ''));

// a screen brings what sits on it along, as a drag does; a piece is filed into whatever screen it lands on. A card in a
// collection stays where the collection puts it.
function moveTo(c: Card, axis: 'x' | 'y', n: number) {
  if (parentOf(c.id)) return [];
  const d = n - c[axis],
    moved = c.type === 'frame' ? [c, ...onFrame(c)] : [c];
  moved.forEach(k => {
    k[axis] += d;
  });
  if (c.type !== 'frame') fileIntoFrame([c]);
  return moved;
}

/** Puts a typed value on the card, and returns every card it moved or changed. */
function setField(c: Card, f: Field, raw: string): Card[] {
  if (f === 'name') {
    if (c.type === 'frame') c.name = raw;
    return [c];
  }
  const n = Math.round(Number(raw));
  if (raw.trim() === '' || !Number.isFinite(n)) return [];
  switch (f) {
    case 'x':
    case 'y':
      return moveTo(c, f, n);
    case 'w':
    case 'h':
      c[f] = Math.max(8, n);
      if (c.type === 'frame') c.device = 'Custom';
      return [c];
    case 'rot':
      c.rot = n;
      return [c];
    case 'isz':
      c.w = c.h = Math.max(8, n);
      return [c];
    default: {
      const unknown: never = f;
      return unknown;
    }
  }
}

// a field can commit as a press elsewhere selects another card, so the selection is redrawn only while it's this card
function changed(c: Card, cs: Card[]) {
  cs.forEach(k => {
    renderCard(k);
  });
  if (session.sel.size === 1 && session.sel.has(c.id)) selectOnly([c.id]);
  renderWires();
  save();
}

// the value goes on the card the dropdown was drawn for, which may no longer be the one selected
function commit(i: HTMLInputElement) {
  const f = i.dataset.size,
    s = ownerOf(i);
  if (!isField(f) || !s || s.c.locked || shownOf(s.c, f) === i.value) return;
  inVisit(i, () => {
    const cs = setField(s.c, f, i.value);
    if (cs.length) changed(s.c, cs);
  });
  i.value = shownOf(s.c, f); // what the card took, so the blur after Enter finds nothing left to commit
}

// closes the dropdown, with the keyboard back on the button that opened it, or on ··· when it had folded in there
function closeTo(el: Element) {
  const bar = $('selbar'),
    folded = !!el.closest('.sb-morebody');
  closeSbPops();
  if (keyedButton(el) || el instanceof HTMLInputElement)
    oneIn(bar, folded ? '[data-pop="more"]' : '[data-pop="place"]')?.focus();
}

function setDevice(d: string, el: HTMLElement) {
  const s = ownerOf(el);
  if (s?.kind !== 'screen' || s.c.locked || !(isDevice(d) || d === 'Custom')) return;
  inVisit(el, () => {
    if (isDevice(d)) [s.c.w, s.c.h, s.c.radius] = DEVICES[d];
    s.c.device = d;
    changed(s.c, [s.c]);
  });
  closeTo(el);
}

/** Keeps the trigger and the fields on the card's own values through a drag, a resize, an undo or Myra's change,
 *  leaving alone the field being typed in. */
export function syncSize(bar: HTMLElement, cs: Card[]) {
  const trig = oneIn(bar, '[data-pop="place"]'),
    s = sizeOf(cs.length === 1 ? cs[0] : null),
    b = trig?.querySelector('b');
  if (!trig || !s || !b) return;
  const t = triggerOf(s),
    locked = !!s.c.locked;
  if (b.textContent !== t) {
    b.textContent = t;
    trig.ariaLabel = readOf(s);
  }
  for (const i of htmlIn(bar, '[data-size], [data-device]')) {
    if (i.matches(':disabled') !== locked) i.toggleAttribute('disabled', locked);
    const f = i.dataset.size,
      d = i.dataset.device;
    if (i instanceof HTMLInputElement && isField(f) && i !== document.activeElement && i.value !== shownOf(s.c, f))
      i.value = shownOf(s.c, f);
    if (d && s.kind === 'screen' && i.classList.contains('on') !== (deviceOf(s.c) === d)) {
      i.classList.toggle('on', deviceOf(s.c) === d);
      i.ariaPressed = String(deviceOf(s.c) === d);
    }
  }
}

function initSize() {
  const bar = $('selbar');
  bar.addEventListener('change', e => {
    const i = closestTo(e.target, '[data-size]', HTMLInputElement);
    if (i) commit(i);
  });
  bar.addEventListener('keydown', e => {
    const i = closestTo(e.target, '[data-size]', HTMLInputElement);
    if (!i) return;
    e.stopPropagation();
    if (e.key !== 'Enter') return;
    e.preventDefault(); // or the key's press lands on the trigger it moves to, and opens the dropdown again
    commit(i);
    closeTo(i);
  });
  // Esc leaves what was typed and not yet committed, so the field's blur as the dropdown closes changes nothing.
  // Registered before the bar's own Esc, which closes the dropdown.
  addEventListener(
    'keydown',
    e => {
      if (e.key !== 'Escape') return;
      const i = closestTo(e.target, '[data-size]', HTMLInputElement),
        f = i?.dataset.size,
        s = i && ownerOf(i);
      if (i && isField(f) && s) i.value = shownOf(s.c, f);
    },
    true,
  );
  bar.addEventListener('click', e => {
    const el = closestTo(e.target, '[data-device]', HTMLElement),
      d = el?.dataset.device;
    if (el && d) setDevice(d, el);
  });
}

/** One screen's device dropdown, or one box's, text's or icon's size: its trigger shows the device or the size, and
 *  it holds the card's fields. */
export const size = group({ on: ctx => sizeOf(one(ctx)), html: sizeHtml, init: initSize });
