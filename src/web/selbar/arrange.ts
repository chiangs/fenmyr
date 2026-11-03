import type { Card } from '../../shared/model.ts';
import { renderCard } from '../canvas/render.ts';
import { renderWires, selectOnly } from '../canvas/wires.ts';
import { $ } from '../core/dom.ts';
import { remember, save } from '../core/history.ts';
import { cardEl, closestTo } from '../ui/dom.ts';
import { session } from '../core/state.ts';
import { G } from './barKit.ts';
import { selCards } from './selected.ts';

const ARRANGE: [string, string, string][] = [
  ['left', 'Align left edges', 'align-l'],
  ['hcenter', 'Align centres', 'align-c'],
  ['right', 'Align right edges', 'align-r'],
  ['top', 'Align tops', 'align-t'],
  ['vcenter', 'Align middles', 'align-m'],
  ['bottom', 'Align bottoms', 'align-b'],
  ['dh', 'Space evenly across', 'distribute-h'],
  ['dv', 'Space evenly down', 'distribute-v'],
];

// the align buttons for two or more things; spacing evenly needs three
export function arrangeHtml(n: number) {
  const buttons = ARRANGE.slice(0, n > 2 ? 8 : 6)
    .map(([k, t, icon], i) => {
      const gap = i === 3 || i === 6 ? '<i class="sb-gap"></i>' : '',
        svg = Icon(icon);
      return `${gap}<button data-arr="${k}" title="${t}">${svg}</button>`;
    })
    .join('');
  return G(0, `<div class="sb-sizes sb-style sb-arrange">${buttons}</div>`);
}

// line selected things up with each other, or space them evenly (titles use their real drawn height)
function arrange(how: string) {
  const cs = selCards().filter(c => !c.locked);
  if (cs.length < 2) return;
  remember();
  // real sizes right now (a title's saved width catches up a moment after it changes, which made the first click land off-center)
  const W = (c: Card) => (c.type === 'title' ? cardEl(c.id)?.offsetWidth || c.w : c.w),
    H = (c: Card) => (c.type === 'title' ? cardEl(c.id)?.offsetHeight || c.h : c.h);
  cs.forEach(c => {
    if (c.type === 'title') {
      c.w = W(c);
      c.h = H(c);
    }
  });
  // units: a whole group you selected moves as one block (its pieces keep their layout); pieces picked out of a group line up on their own
  const ids = new Set(cs.map(c => c.id)),
    units = new Map<string, Card[]>();
  cs.forEach(c => {
    const whole = c.group && session.board.cards.filter(k => k.group === c.group).every(k => ids.has(k.id)),
      key = whole ? 'g:' + c.group : c.id;
    units.set(key, [...(units.get(key) ?? []), c]);
  });
  const U = [...units.values()].map(m => {
    const x = Math.min(...m.map(c => c.x)),
      y = Math.min(...m.map(c => c.y));
    return {
      m,
      x,
      y,
      w: Math.max(...m.map(c => c.x + W(c))) - x,
      h: Math.max(...m.map(c => c.y + H(c))) - y,
      nx: x,
      ny: y,
    };
  });
  if (U.length < 2) return;
  const x0 = Math.min(...U.map(u => u.x)),
    x1 = Math.max(...U.map(u => u.x + u.w)),
    y0 = Math.min(...U.map(u => u.y)),
    y1 = Math.max(...U.map(u => u.y + u.h));
  const moved = new Map(cs.map(c => [c.id, { ox: c.x, oy: c.y }]));
  if (how === 'left') U.forEach(u => (u.nx = x0));
  if (how === 'right') U.forEach(u => (u.nx = x1 - u.w));
  if (how === 'hcenter') U.forEach(u => (u.nx = (x0 + x1) / 2 - u.w / 2));
  if (how === 'top') U.forEach(u => (u.ny = y0));
  if (how === 'bottom') U.forEach(u => (u.ny = y1 - u.h));
  if (how === 'vcenter') U.forEach(u => (u.ny = (y0 + y1) / 2 - u.h / 2));
  if (how === 'dh') {
    const o = [...U].sort((a, b) => a.x - b.x),
      gap = (x1 - x0 - o.reduce((n, u) => n + u.w, 0)) / (o.length - 1);
    let x = x0;
    o.forEach(u => {
      u.nx = x;
      x += u.w + gap;
    });
  }
  if (how === 'dv') {
    const o = [...U].sort((a, b) => a.y - b.y),
      gap = (y1 - y0 - o.reduce((n, u) => n + u.h, 0)) / (o.length - 1);
    let y = y0;
    o.forEach(u => {
      u.ny = y;
      y += u.h + gap;
    });
  }
  U.forEach(u => {
    const dx = u.nx - u.x,
      dy = u.ny - u.y;
    u.m.forEach(c => {
      c.x += dx;
      c.y += dy;
    });
  });
  // a section brings what's inside it along
  cs.filter(c => c.type === 'section').forEach(sec => {
    const { ox, oy } = moved.get(sec.id) ?? { ox: sec.x, oy: sec.y },
      dx = sec.x - ox,
      dy = sec.y - oy;
    if (!dx && !dy) return;
    session.board.cards
      .filter(
        k =>
          !moved.has(k.id) &&
          k.x + k.w / 2 > ox &&
          k.x + k.w / 2 < ox + sec.w &&
          k.y + k.h / 2 > oy &&
          k.y + k.h / 2 < oy + sec.h,
      )
      .forEach(k => {
        k.x += dx;
        k.y += dy;
        renderCard(k);
      });
  });
  cs.forEach(c => {
    c.x = Math.round(c.x);
    c.y = Math.round(c.y);
    renderCard(c);
  });
  selectOnly(cs.map(c => c.id));
  renderWires();
  save();
}

export function initArrange() {
  $('selbar').addEventListener(
    'click',
    e => {
      const how = closestTo(e.target, '[data-arr]')?.dataset.arr;
      if (!how) return;
      e.stopImmediatePropagation();
      arrange(how);
    },
    true,
  );
}
