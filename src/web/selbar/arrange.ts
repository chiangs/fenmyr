import type { Card, CardOf } from '../../shared/model.ts';
import { renderCard } from '../canvas/render.ts';
import { selectOnly } from '../canvas/selection.ts';
import { renderWires } from '../canvas/wires.ts';
import { $ } from '../core/dom.ts';
import { remember, save } from '../core/history.ts';
import { session } from '../core/state.ts';
import { cardEl, closestTo } from '../ui/dom.ts';
import { screenOf } from '../wireframe/screenScope.ts';
import { caret, FOLD_PIECE, G, inVisit, pop } from './barKit.ts';
import { cards, group } from './group.ts';
import { selCards } from './selected.ts';

// each button's setting, its name when lining things up with each other, its icon, and its name against a screen
const ARRANGE: [string, string, string, string][] = [
  ['left', 'Align left edges', 'align-l', 'To the left edge'],
  ['hcenter', 'Align centres', 'align-c', 'To the centre'],
  ['right', 'Align right edges', 'align-r', 'To the right edge'],
  ['top', 'Align tops', 'align-t', 'To the top'],
  ['vcenter', 'Align middles', 'align-m', 'To the middle'],
  ['bottom', 'Align bottoms', 'align-b', 'To the bottom'],
  ['dh', 'Space evenly across', 'distribute-h', ''],
  ['dv', 'Space evenly down', 'distribute-v', ''],
];

/** What the align buttons line things up against: two or more units with each other, or one unit sitting on a screen
 *  with that screen. A unit is a group selected whole, or any other card on its own. */
type Arrange = { ref: 'each other'; units: Card[][] } | { ref: 'screen'; unit: Card[]; screen: CardOf<'frame'> };

function unitsOf(cs: readonly Card[]): Card[][] {
  const ids = new Set(cs.map(c => c.id)),
    units = new Map<string, Card[]>();
  cs.forEach(c => {
    const whole = c.group && session.board.cards.filter(k => k.group === c.group).every(k => ids.has(k.id)),
      key = whole ? `g:${c.group}` : c.id;
    units.set(key, [...(units.get(key) ?? []), c]);
  });
  return [...units.values()];
}

// a lone unit on the bare board has nothing to line up with, so it gets no buttons
function arrangeOf(cs: readonly Card[]): Arrange | null {
  const units = unitsOf(cs),
    unit = units[0],
    screen = unit ? screenOf(unit) : null;
  if (units.length > 1) return { ref: 'each other', units };
  return unit && screen && !unit.includes(screen) ? { ref: 'screen', unit, screen } : null;
}

// the align buttons, and spacing evenly when there are three or more units to space
function buttonsHtml(n: number, onScreen: boolean, locked: boolean) {
  const off = locked ? ' disabled' : '';
  const buttons = ARRANGE.slice(0, n > 2 ? 8 : 6).map(([k, t, icon, s], i) => {
    const gap = i === 3 || i === 6 ? '<i class="sb-gap"></i>' : '',
      tip = onScreen ? s : t,
      svg = Icon(icon);
    return `${gap}<button data-arr="${k}" title="${tip}"${off}>${svg}</button>`;
  });
  const list = buttons.join('');
  return `<div class="sb-sizes sb-style sb-arrange">${list}</div>`;
}

function arrangeHtml(a: Arrange) {
  switch (a.ref) {
    case 'each other':
      return G(0, buttonsHtml(a.units.length, false, false));
    case 'screen': {
      const buttons = buttonsHtml(
          1,
          true,
          a.unit.some(c => c.locked),
        ),
        CARET = caret();
      return G(FOLD_PIECE, pop('align', `<b>Align</b>${CARET}`, buttons, 'Align on its screen'));
    }
    default: {
      const unknown: never = a;
      return unknown;
    }
  }
}

// What to move and the box to line it up in: the unlocked units and the space they fill, or one unit and its screen.
type Target = { units: Card[][]; ref: CardOf<'frame'> | null };
function targetOf(a: Arrange): Target | null {
  switch (a.ref) {
    case 'each other': {
      const units = unitsOf(a.units.flat().filter(c => !c.locked));
      if (units.length < 2) return null;
      return { units, ref: null };
    }
    case 'screen':
      if (a.unit.some(c => c.locked)) return null;
      return { units: [a.unit], ref: a.screen };
    default: {
      const unknown: never = a;
      return unknown;
    }
  }
}

// Lining up with each other is a step of its own; against a screen, a step for the dropdown's visit.
function arrangeAs(how: string, from: Element) {
  const a = arrangeOf(selCards()),
    t = a && targetOf(a);
  if (!t) return;
  if (t.ref) return inVisit(from, () => place(t, how));
  remember();
  place(t, how);
}

// line selected things up with each other or with their screen, or space them evenly (titles use their real drawn height)
function place(t: Target, how: string) {
  const cs = t.units.flat();
  // real sizes right now (a title's saved width catches up a moment after it changes, which made the first click land off-center)
  const W = (c: Card) => (c.type === 'title' ? cardEl(c.id)?.offsetWidth || c.w : c.w),
    H = (c: Card) => (c.type === 'title' ? cardEl(c.id)?.offsetHeight || c.h : c.h);
  cs.forEach(c => {
    if (c.type === 'title') {
      c.w = W(c);
      c.h = H(c);
    }
  });
  // a whole group moves as one block (its pieces keep their layout); pieces picked out of a group line up on their own
  const U = t.units.map(m => {
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
  const r = t.ref,
    x0 = r ? r.x : Math.min(...U.map(u => u.x)),
    x1 = r ? r.x + r.w : Math.max(...U.map(u => u.x + u.w)),
    y0 = r ? r.y : Math.min(...U.map(u => u.y)),
    y1 = r ? r.y + r.h : Math.max(...U.map(u => u.y + u.h));
  const moved = new Map(cs.map(c => [c.id, { ox: c.x, oy: c.y }]));
  if (how === 'left')
    U.forEach(u => {
      u.nx = x0;
    });
  if (how === 'right')
    U.forEach(u => {
      u.nx = x1 - u.w;
    });
  if (how === 'hcenter')
    U.forEach(u => {
      u.nx = (x0 + x1) / 2 - u.w / 2;
    });
  if (how === 'top')
    U.forEach(u => {
      u.ny = y0;
    });
  if (how === 'bottom')
    U.forEach(u => {
      u.ny = y1 - u.h;
    });
  if (how === 'vcenter')
    U.forEach(u => {
      u.ny = (y0 + y1) / 2 - u.h / 2;
    });
  if (how === 'dh' && U.length > 1) {
    const o = [...U].sort((a, b) => a.x - b.x),
      gap = (x1 - x0 - o.reduce((n, u) => n + u.w, 0)) / (o.length - 1);
    let x = x0;
    o.forEach(u => {
      u.nx = x;
      x += u.w + gap;
    });
  }
  if (how === 'dv' && U.length > 1) {
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

function initArrange() {
  $('selbar').addEventListener(
    'click',
    e => {
      const b = closestTo(e.target, '[data-arr]'),
        how = b?.dataset.arr;
      if (!b || !how) return;
      e.stopImmediatePropagation();
      arrangeAs(how, b);
    },
    true,
  );
}

export const arrange = group({
  on: ctx => {
    const cs = cards(ctx);
    return cs && arrangeOf(cs);
  },
  html: arrangeHtml,
  init: initArrange,
});
