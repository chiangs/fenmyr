import type { Card, CardOf } from '../../shared/model.ts';
import { renderCard } from '../canvas/render.ts';
import { selectOnly } from '../canvas/wires.ts';
import { $ } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { closestTo } from '../ui/dom.ts';
import { closeSbPops, focusBar, inVisit, pct, syncPair } from './barKit.ts';
import { selCards } from './selected.ts';

const isBox = (c: Card): c is CardOf<'box'> => c.type === 'box';

// boxes alone also get their opacity, as a slider and a number in per cent
export function opacityHtml(cs: readonly Card[]) {
  const boxes = cs.filter(isBox);
  if (boxes.length !== cs.length) return '';
  const ops = boxes.map(c => Math.round((c.opacity ?? 1) * 100)),
    same = ops.every(o => o === ops[0]),
    v = same ? (ops[0] ?? 100) : 100,
    shown = same ? String(v) : '',
    p = pct(v, 0, 100);
  return `<div class="sbc-top sb-oprow"><span>Opacity</span><input type="range" min="0" max="100" step="1" value="${v}" style="--p:${p}" data-bop aria-label="Opacity"><input type="number" min="0" max="100" step="1" value="${shown}" placeholder="–" data-bopn aria-label="Opacity in per cent"><b class="sb-unit">%</b></div>`;
}

// every selected box at this opacity, in per cent; one visit to Fill is one undo step
function setOpacity(el: Element, percent: number) {
  const boxes = selCards().filter(isBox),
    v = Math.max(0, Math.min(100, Math.round(percent)));
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

/** Fill's Opacity row: the slider and the number set every selected box's opacity. */
export function initOpacity() {
  $('selbar').addEventListener('input', e => {
    const p = syncPair(e.target, 'data-bop', 'data-bopn'),
      n = Number(p?.r.value);
    if (p && Number.isFinite(n)) setOpacity(p.r, n);
  });
  // Enter in the number closes Fill, with the keyboard back on its button
  $('selbar').addEventListener('keydown', e => {
    if (!closestTo(e.target, '[data-bopn]')) return;
    e.stopPropagation();
    if (e.key !== 'Enter') return;
    e.preventDefault();
    closeSbPops();
    focusBar('[data-pop="fill"]');
  });
}
