import { typesWith } from '../../shared/cardTypes.ts';
import type { Card, CardOf } from '../../shared/model.ts';
import { renderCard } from '../canvas/render.ts';
import { byId, renderWires, selectOnly } from '../canvas/wires.ts';
import { $ } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { session } from '../core/state.ts';
import { cardEl, closestTo, htmlIn, oneIn } from '../ui/dom.ts';
import { caret, closeSbPops, FOLD_PIECE, focusBar, G, inVisit, pct, pop, syncPair } from './barKit.ts';
import { fontButton, fontTargets } from './fontPop.ts';
import { cards, group } from './group.ts';

type Weight = 300 | 400 | 500 | 600 | 700 | 800;
type TextAlign = 'left' | 'center' | 'right';
type Texts = [CardOf<'text'>, ...CardOf<'text'>[]];
/** One change the Type dropdown makes to every text it was drawn for. */
type TypeChange =
  | { k: 'size'; v: number }
  | { k: 'weight'; v: Weight }
  | { k: 'lh'; v: number }
  | { k: 'align'; v: TextAlign };

// the panel's names for the weights
const WEIGHTS: readonly (readonly [Weight, string])[] = [
  [300, 'Light'],
  [400, 'Regular'],
  [500, 'Medium'],
  [600, 'Semi'],
  [700, 'Bold'],
  [800, 'Extra'],
];
const ALIGNS: readonly (readonly [TextAlign, string])[] = [
  ['left', 'Align left'],
  ['center', 'Centre'],
  ['right', 'Align right'],
];
// what a text shows without its own value, as `styleWF` draws it
const DEF = { size: 18, weight: 500, lh: 1.3, align: 'left' } as const;
// at least what the Wireframe panel let a text keep, which had no ends of its own
const SIZE = { min: 1, max: 1000 },
  LH = { min: 0.5, max: 4, step: 0.05 };

const isText = (c: Card): c is CardOf<'text'> => c.type === 'text';
const isWeight = (n: number): n is Weight => WEIGHTS.some(([w]) => w === n);
const isAlign = (s: unknown): s is TextAlign => ALIGNS.some(([a]) => a === s);

const sizeOf = (c: CardOf<'text'>) => c.size || DEF.size;
const weightOf = (c: CardOf<'text'>) => c.weight || DEF.weight;
const lhOf = (c: CardOf<'text'>) => c.lh || DEF.lh;
const alignOf = (c: CardOf<'text'>) => (isAlign(c.align) ? c.align : DEF.align);

/** Every selected card, when each is a wireframe text. */
function textsOf(cs: readonly Card[] | null): Texts | null {
  const ts = (cs ?? []).filter(isText),
    [first, ...rest] = ts;
  return first && ts.length === cs?.length ? [first, ...rest] : null;
}

// the value every text has, or null when they differ
function shared<T>(ts: Texts, of: (c: CardOf<'text'>) => T): T | null {
  const v = of(ts[0]);
  return ts.every(c => of(c) === v) ? v : null;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
// what a number typed or slid leaves on a text
const sizeFrom = (n: number) => clamp(Math.round(n), SIZE.min, SIZE.max);
const lhFrom = (n: number) => Math.round(clamp(n, LH.min, LH.max) * 100) / 100;

function setType(c: CardOf<'text'>, ch: TypeChange) {
  switch (ch.k) {
    case 'size':
      c.size = sizeFrom(ch.v);
      return;
    case 'weight':
      c.weight = ch.v;
      return;
    case 'lh':
      c.lh = lhFrom(ch.v);
      return;
    case 'align':
      if (ch.v === 'left') delete c.align;
      else c.align = ch.v;
      return;
    default: {
      const unknown: never = ch;
      return unknown;
    }
  }
}

function weightsHtml(ts: Texts) {
  const cur = shared(ts, weightOf);
  return WEIGHTS.map(([w, name]) => {
    const on = cur === w,
      cls = on ? 'on' : '';
    return `<button data-ty-weight="${w}" class="${cls}" aria-pressed="${on}" style="font-weight:${w}">${name}</button>`;
  }).join('');
}

function alignsHtml(ts: Texts) {
  const cur = shared(ts, alignOf);
  return ALIGNS.map(([a, name]) => {
    const on = cur === a,
      cls = on ? 'on' : '',
      icon = Icon(`text-${a}`);
    return `<button data-ty-align="${a}" class="${cls}" aria-pressed="${on}" title="${name}" aria-label="${name}">${icon}</button>`;
  }).join('');
}

// the size shown on the trigger and in the field: the shared size, or blank when the texts differ
const sizeShown = (ts: Texts) => String(shared(ts, sizeOf) ?? '');
const lhShown = (ts: Texts) => shared(ts, lhOf) ?? DEF.lh;
const lhField = (ts: Texts) => String(lhShown(ts));

function typeHtml(ts: Texts) {
  const size = sizeShown(ts),
    trig = size || 'Type',
    lh = lhShown(ts),
    p = pct(lh, LH.min, LH.max),
    ids = ts.map(c => c.id).join(),
    weights = weightsHtml(ts),
    aligns = alignsHtml(ts),
    read = `Type, ${trig}`,
    CARET = caret();
  const sizeRow = `<div class="sbc-top sb-fsrow"><span>Size</span><button class="sb-fsstep" data-ty-step="-1" title="Smaller (⇧ for 10)" aria-label="Smaller">−</button><input type="number" min="${SIZE.min}" max="${SIZE.max}" step="1" value="${size}" placeholder="–" data-ty-size aria-label="Text size in pixels"><span class="sb-fspx">px</span><button class="sb-fsstep" data-ty-step="1" title="Bigger (⇧ for 10)" aria-label="Bigger">+</button></div>`,
    lhRow = `<div class="sbc-top"><span>Line height</span><input type="range" min="${LH.min}" max="${LH.max}" step="${LH.step}" value="${lh}" style="--p:${p}" data-ty-lh aria-label="Line height"><input type="number" min="${LH.min}" max="${LH.max}" step="${LH.step}" value="${lh}" data-ty-lhn aria-label="Line height"><b class="sb-unit">×</b></div>`;
  return G(
    FOLD_PIECE,
    pop(
      'type',
      `<b>${trig}</b>${CARET}`,
      `<div class="sb-corners sb-spacing sb-type" data-type-for="${ids}">${sizeRow}<div class="sbc-chips sb-weights" role="group" aria-label="Weight">${weights}</div>${lhRow}<div class="sbc-chips sb-talign" role="group" aria-label="Alignment">${aligns}</div></div>`,
      'Size, weight, line height and alignment',
      read,
    ),
  );
}

// the texts a dropdown was drawn for, which may no longer be the ones selected
function ownersOf(el: Element): Texts | null {
  const ids = el.closest<HTMLElement>('[data-type-for]')?.dataset.typeFor?.split(',') ?? [];
  return textsOf(ids.map(byId).filter(c => c !== undefined));
}

function apply(el: Element, ch: TypeChange) {
  const ts = ownersOf(el);
  if (!ts) return;
  inVisit(el, () => {
    ts.forEach(c => {
      setType(c, ch);
      renderCard(c);
      // the height follows the words at once, inside the visit's step, rather than a frame later as a change of its own
      c.h = cardEl(c.id)?.offsetHeight || c.h;
    });
    if (session.sel.size === ts.length && ts.every(c => session.sel.has(c.id))) selectOnly(ts.map(c => c.id));
    renderWires();
    save();
  });
}

/** Keeps the Type dropdown on the texts' own values through an undo, the panel's edits or Myra's, leaving alone the
 *  field being typed in. */
export function syncType(bar: HTMLElement) {
  const box = oneIn(bar, '[data-type-for]'),
    ts = box ? ownersOf(box) : null,
    trig = oneIn(bar, '[data-pop="type"]'),
    b = trig?.querySelector('b');
  if (!box || !ts || !trig || !b) return;
  const size = sizeShown(ts),
    shown = size || 'Type';
  if (b.textContent !== shown) {
    b.textContent = shown;
    trig.ariaLabel = `Type, ${shown}`;
  }
  const lh = String(lhShown(ts)),
    weight = String(shared(ts, weightOf)),
    align = shared(ts, alignOf);
  for (const i of htmlIn(box, 'input')) {
    const v = i.matches('[data-ty-size]') ? size : lh;
    if (i instanceof HTMLInputElement && i !== document.activeElement && i.value !== v) {
      i.value = v;
      if (i.type === 'range') i.style.setProperty('--p', pct(+v, LH.min, LH.max));
    }
  }
  for (const btn of htmlIn(box, '[data-ty-weight], [data-ty-align]')) {
    const on = btn.dataset.tyWeight === weight || btn.dataset.tyAlign === align;
    if (btn.classList.contains('on') !== on) {
      btn.classList.toggle('on', on);
      btn.ariaPressed = String(on);
    }
  }
}

// A typed number lands once, when the field is left or Enter pressed, so 60 never sets 6 first. A blank or broken
// number puts back what the texts have.
function commit(i: HTMLInputElement) {
  const ts = ownersOf(i),
    n = Number(i.value),
    size = i.matches('[data-ty-size]');
  if (!ts) return;
  // the blur after Enter finds nothing left to land
  if (i.value !== '' && Number.isFinite(n)) {
    if (size && ts.some(c => sizeOf(c) !== sizeFrom(n))) apply(i, { k: 'size', v: n });
    if (!size && ts.some(c => lhOf(c) !== lhFrom(n))) apply(i, { k: 'lh', v: n });
  }
  i.value = size ? sizeShown(ts) : lhField(ts);
  if (!size) syncPair(i, 'data-ty-lh', 'data-ty-lhn');
}

function initType() {
  const bar = $('selbar');
  // the slider lands as it moves, and its number follows
  bar.addEventListener('input', e => {
    if (!closestTo(e.target, '[data-ty-lh]')) return;
    const pair = syncPair(e.target, 'data-ty-lh', 'data-ty-lhn');
    if (pair) apply(pair.r, { k: 'lh', v: +pair.r.value });
  });
  bar.addEventListener('change', e => {
    const i = closestTo(e.target, '[data-ty-size], [data-ty-lhn]', HTMLInputElement);
    if (i) commit(i);
  });
  bar.addEventListener('click', e => {
    const step = closestTo(e.target, '[data-ty-step]'),
      weight = closestTo(e.target, '[data-ty-weight]'),
      align = closestTo(e.target, '[data-ty-align]');
    if (step) {
      const field = step.parentElement?.querySelector('[data-ty-size]'),
        ts = ownersOf(step);
      if (!(field instanceof HTMLInputElement) || !ts) return;
      const from = +field.value || sizeOf(ts[0]),
        to = clamp(from + Number(step.dataset.tyStep) * (e.shiftKey ? 10 : 1), SIZE.min, SIZE.max);
      field.value = String(to);
      apply(step, { k: 'size', v: to });
    }
    const w = Number(weight?.dataset.tyWeight);
    if (weight && isWeight(w)) apply(weight, { k: 'weight', v: w });
    const a = align?.dataset.tyAlign;
    if (align && isAlign(a)) apply(align, { k: 'align', v: a });
  });
  // Enter in a field lands its number and closes the dropdown, with the keyboard back on its button, or on ··· when
  // it folded in there
  bar.addEventListener('keydown', e => {
    const i = closestTo(e.target, '[data-ty-size], [data-ty-lhn]', HTMLInputElement);
    if (!i) return;
    e.stopPropagation();
    if (e.key !== 'Enter') return;
    e.preventDefault();
    commit(i);
    closeSbPops();
    focusBar('[data-pop="type"]');
  });
  // Esc leaves what was typed and not yet landed, so the field's blur as the dropdown closes changes nothing.
  // Registered before the bar's own Esc, which closes the dropdown.
  addEventListener(
    'keydown',
    e => {
      const i = closestTo(e.target, '[data-ty-size], [data-ty-lhn]', HTMLInputElement),
        ts = i && ownersOf(i);
      if (e.key !== 'Escape' || !i || !ts) return;
      i.value = i.matches('[data-ty-size]') ? sizeShown(ts) : lhField(ts);
    },
    true,
  );
}

/** A wireframe text's size, weight, line height and alignment, in one dropdown whose trigger shows the size. */
export const type = group({ on: ctx => textsOf(cards(ctx)), html: typeHtml, init: initType });

const SIZED = typesWith('sized');

/** The Font button for wireframe text, font cards and whole pieces, when no note or title is selected: the text
 *  controls carry the Font button then, so there is only ever one. A screen's own fonts are a row in its dropdown. */
export const font = group({
  on: ctx => {
    const cs = cards(ctx);
    if (!cs || cs.some(c => SIZED.includes(c.type) || c.type === 'frame')) return null;
    const ts = fontTargets(cs);
    return ts.length ? ts : null;
  },
  html: ts => G(FOLD_PIECE, fontButton(ts)),
});
