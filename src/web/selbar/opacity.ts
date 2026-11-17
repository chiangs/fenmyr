import type { Card, CardOf } from '../../shared/model.ts';
import { renderCard } from '../canvas/render.ts';
import { byId, selectOnly } from '../canvas/wires.ts';
import { $ } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { closestTo } from '../ui/dom.ts';
import { closeSbPops, focusBar, inVisit, pct, syncPair } from './barKit.ts';

const isBox = (c: Card): c is CardOf<'box'> => c.type === 'box';
const percentOf = (c: CardOf<'box'>) => Math.round((c.opacity ?? 1) * 100);
const percentFrom = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

// the opacity every box has, in per cent, or blank when they differ
function shownOf(boxes: readonly CardOf<'box'>[]) {
  const ops = boxes.map(percentOf);
  return ops.every(o => o === ops[0]) ? String(ops[0] ?? 100) : '';
}

// boxes alone also get their opacity, as a slider and a number in per cent
export function opacityHtml(cs: readonly Card[]) {
  const boxes = cs.filter(isBox);
  if (boxes.length !== cs.length) return '';
  const shown = shownOf(boxes),
    v = shown || '100',
    p = pct(+v, 0, 100),
    ids = boxes.map(c => c.id).join();
  return `<div class="sbc-top sb-oprow" data-op-for="${ids}"><span>Opacity</span><input type="range" min="0" max="100" step="1" value="${v}" style="--p:${p}" data-bop aria-label="Opacity"><input type="number" min="0" max="100" step="1" value="${shown}" placeholder="–" data-bopn aria-label="Opacity in per cent"><b class="sb-unit">%</b></div>`;
}

// the boxes Fill was drawn for, which may no longer be the ones selected
function ownersOf(el: Element) {
  const ids = el.closest<HTMLElement>('[data-op-for]')?.dataset.opFor?.split(',') ?? [];
  return ids
    .map(byId)
    .filter(c => c !== undefined)
    .filter(isBox);
}

// every box at this opacity, in per cent; one visit to Fill is one undo step
function setOpacity(el: Element, percent: number) {
  const boxes = ownersOf(el),
    v = percentFrom(percent);
  inVisit(el, () => {
    boxes.forEach(c => {
      if (v === 100) delete c.opacity;
      else c.opacity = v / 100;
      renderCard(c);
    });
    selectOnly(boxes.map(c => c.id));
    save();
  });
}

// A typed number lands once, when the field is left or Enter pressed, so 80 never sets 8 first. A blank or broken
// number leaves the boxes as they were.
function commit(i: HTMLInputElement) {
  const boxes = ownersOf(i),
    n = Number(i.value);
  // the blur after Enter finds nothing left to land
  if (i.value !== '' && Number.isFinite(n) && boxes.some(c => percentOf(c) !== percentFrom(n))) setOpacity(i, n);
  i.value = shownOf(boxes);
  syncPair(i, 'data-bop', 'data-bopn');
}

/** Fill's Opacity row: the slider lands as it moves, and the number once typed. */
export function initOpacity() {
  const bar = $('selbar');
  bar.addEventListener('input', e => {
    if (!closestTo(e.target, '[data-bop]')) return;
    const p = syncPair(e.target, 'data-bop', 'data-bopn');
    if (p) setOpacity(p.r, +p.r.value);
  });
  bar.addEventListener('change', e => {
    const i = closestTo(e.target, '[data-bopn]', HTMLInputElement);
    if (i) commit(i);
  });
  // Enter in the number lands it and closes Fill, with the keyboard back on its button
  bar.addEventListener('keydown', e => {
    const i = closestTo(e.target, '[data-bopn]', HTMLInputElement);
    if (!i) return;
    e.stopPropagation();
    if (e.key !== 'Enter') return;
    e.preventDefault();
    commit(i);
    closeSbPops();
    focusBar('[data-pop="fill"]');
  });
  // Esc leaves what was typed and not yet landed, so the field's blur as Fill closes changes nothing. Registered
  // before the bar's own Esc, which closes Fill.
  addEventListener(
    'keydown',
    e => {
      const i = closestTo(e.target, '[data-bopn]', HTMLInputElement);
      if (e.key === 'Escape' && i) i.value = shownOf(ownersOf(i));
    },
    true,
  );
}
