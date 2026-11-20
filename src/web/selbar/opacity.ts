import type { Card, CardOf } from '../../shared/model.ts';
import { renderCard } from '../canvas/render.ts';
import { selectOnly } from '../canvas/selection.ts';
import { $ } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { byId } from '../core/state.ts';
import { closestTo, oneIn } from '../ui/dom.ts';
import { caret, closeSbPops, focusBar, G, inVisit, pct, pop, SLIDER_KEYS, syncPair } from './barKit.ts';
import { every, group } from './group.ts';

type Boxes = readonly CardOf<'box'>[];

const isBox = (c: Card): c is CardOf<'box'> => c.type === 'box';
// a box holding a picture has no Fill, so its Opacity sits in the bar on its own
const isPicture = (c: Card) => isBox(c) && !!c.src;
const percentOf = (c: CardOf<'box'>) => Math.round((c.opacity ?? 1) * 100);
const percentFrom = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

// the opacity every box has, in per cent, or blank when they differ
function shownOf(boxes: Boxes) {
  const ops = boxes.map(percentOf);
  return ops.every(o => o === ops[0]) ? String(ops[0] ?? 100) : '';
}

// boxes alone also get their opacity, as a slider and a number in per cent; with the boxes at different opacities
// the slider reads Mixed and its thumb doesn't show
export function opacityHtml(cs: readonly Card[]) {
  const boxes = cs.filter(isBox);
  if (boxes.length !== cs.length) return '';
  const shown = shownOf(boxes),
    v = shown || '100',
    p = pct(+v, 0, 100),
    mixed = shown ? '' : ' class="sb-mixed" aria-valuetext="Mixed"',
    ids = boxes.map(c => c.id).join();
  return `<div class="sbc-top sb-oprow" data-op-for="${ids}"><span>Opacity</span><input type="range" min="0" max="100" step="1" value="${v}" style="--p:${p}"${mixed} data-bop aria-label="Opacity"><input type="number" min="0" max="100" step="1" value="${shown}" placeholder="–" data-bopn aria-label="Opacity in per cent"><b class="sb-unit">%</b></div>`;
}

// a picture's trigger shows its opacity, or the word when the pictures differ
const triggerOf = (boxes: Boxes) => {
  const shown = shownOf(boxes);
  return shown ? `${shown}%` : 'Opacity';
};
const readOf = (boxes: Boxes) => {
  const shown = shownOf(boxes);
  return shown ? `Opacity, ${shown}%` : 'Opacity, mixed';
};

function pictureHtml(cs: readonly Card[]) {
  const boxes = cs.filter(isBox),
    trig = triggerOf(boxes),
    read = readOf(boxes),
    row = opacityHtml(cs),
    CARET = caret();
  return G(2, pop('opacity', `<b>${trig}</b>${CARET}`, `<div class="sb-corners">${row}</div>`, 'Opacity', read));
}

// the boxes the row was drawn for, which may no longer be the ones selected
function ownersOf(el: Element) {
  const ids = el.closest<HTMLElement>('[data-op-for]')?.dataset.opFor?.split(',') ?? [];
  return ids
    .map(byId)
    .filter(c => c !== undefined)
    .filter(isBox);
}

// The row and a picture's trigger follow the boxes: the slider leaves Mixed once they agree, and the number, unless it
// is being typed in, shows what they have.
function syncRow(el: Element) {
  const row = el.closest('[data-op-for]'),
    boxes = ownersOf(el),
    shown = shownOf(boxes),
    range = row && oneIn(row, '[data-bop]'),
    num = row?.querySelector('[data-bopn]'),
    trig = el.closest('[data-popw="opacity"]')?.querySelector('.sb-poptrig');
  if (range instanceof HTMLInputElement) {
    range.classList.toggle('sb-mixed', !shown);
    if (shown) {
      range.removeAttribute('aria-valuetext');
      range.value = shown;
      range.style.setProperty('--p', pct(+shown, 0, 100));
    } else range.setAttribute('aria-valuetext', 'Mixed');
  }
  if (num instanceof HTMLInputElement && num !== document.activeElement) num.value = shown;
  const b = trig?.querySelector('b');
  if (trig && b) {
    b.textContent = triggerOf(boxes);
    trig.ariaLabel = readOf(boxes);
  }
}

// each box at the opacity worked out from its own, in per cent; one visit to the dropdown is one undo step
function setOpacity(el: Element, to: (now: number) => number) {
  const boxes = ownersOf(el);
  inVisit(el, () => {
    boxes.forEach(c => {
      const v = percentFrom(to(percentOf(c)));
      if (v === 100) delete c.opacity;
      else c.opacity = v / 100;
      renderCard(c);
    });
    selectOnly(boxes.map(c => c.id));
    save();
  });
  syncRow(el);
}

// A typed number lands once, when the field is left or Enter pressed, so 80 never sets 8 first. A blank or broken
// number leaves the boxes as they were.
function commit(i: HTMLInputElement) {
  const boxes = ownersOf(i),
    n = Number(i.value);
  // the blur after Enter finds nothing left to land
  if (i.value !== '' && Number.isFinite(n) && boxes.some(c => percentOf(c) !== percentFrom(n))) setOpacity(i, () => n);
  i.value = shownOf(boxes);
  syncPair(i, 'data-bop', 'data-bopn');
}

/** Wires the Opacity row wherever it shows: in Fill, and on its own for a picture. The slider lands as it moves, and
 *  the number once typed. */
function initOpacity() {
  const bar = $('selbar');
  bar.addEventListener('input', e => {
    if (!closestTo(e.target, '[data-bop]')) return;
    const p = syncPair(e.target, 'data-bop', 'data-bopn');
    if (p) setOpacity(p.r, () => +p.r.value);
  });
  // an arrow or Page key on the slider while the boxes differ moves each from its own, not all to the slider's
  bar.addEventListener('keydown', e => {
    const r = closestTo(e.target, '[data-bop].sb-mixed', HTMLInputElement),
      by = SLIDER_KEYS[e.key];
    if (!r || by === undefined) return;
    e.preventDefault();
    setOpacity(r, now => now + by);
  });
  bar.addEventListener('change', e => {
    const i = closestTo(e.target, '[data-bopn]', HTMLInputElement);
    if (i) commit(i);
  });
  // Enter in the number lands it and closes its dropdown, with the keyboard back on its button
  bar.addEventListener('keydown', e => {
    const i = closestTo(e.target, '[data-bopn]', HTMLInputElement);
    if (!i) return;
    e.stopPropagation();
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const trig = i.closest('.sb-popw')?.querySelector<HTMLElement>('[data-pop]')?.dataset.pop;
    commit(i);
    closeSbPops();
    focusBar(`[data-pop="${trig ?? 'fill'}"]`);
  });
  // Esc leaves what was typed and not yet landed, so the field's blur as the dropdown closes changes nothing.
  // Registered before the bar's own Esc, which closes it.
  addEventListener(
    'keydown',
    e => {
      const i = closestTo(e.target, '[data-bopn]', HTMLInputElement);
      if (e.key === 'Escape' && i) i.value = shownOf(ownersOf(i));
    },
    true,
  );
}

export const opacity = group({ on: every(isPicture), html: pictureHtml, init: initOpacity });
