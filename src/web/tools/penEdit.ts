import type { Card, CardOf, PathPoint } from '../../shared/model.ts';
import { toWorld } from '../canvas/handles.ts';
import { renderCard } from '../canvas/render.ts';
import { byId, selectOnly } from '../canvas/wires.ts';
import { SHAPE_FILL } from '../cards/shapes.ts';
import { stage, world } from '../core/dom.ts';
import { remember, save } from '../core/history.ts';
import { session } from '../core/state.ts';
import { endEdit } from '../edit/editing.ts';
import { say } from '../myra/say.ts';
import { closestTo } from '../ui/dom.ts';
import { pathD, penT } from './pen.ts';
import { vecDown, vecHit, vecMove, vecToggle, vecUp } from './penPointer.ts';

type PathCard = CardOf<'path'>;
export type Point = { x: number; y: number };
// the little dot inside a picked corner that sets its roundness, and the way it slides
type RadiusDot = Point & { ux: number; uy: number };
export type Hit =
  | { kind: 'radius'; i: number; rd: RadiusDot }
  | { kind: 'out' | 'in' | 'pt'; i: number }
  | { kind: 'seg'; i: number; x: number; y: number };
// pull: Option-dragging a sharp point; pt with start: moving the picked points from where they began
type Drag =
  | { kind: 'pull' | 'out' | 'in'; i: number }
  | { kind: 'pt'; i: number; sx?: number; sy?: number; start?: [number, PathPoint][] }
  | { kind: 'radius'; i: number; rd: RadiusDot };
export const scaled = (q: PathPoint, sx: number, sy: number, dx = 0, dy = 0): PathPoint => {
  const o: PathPoint = { ...q, x: q.x * sx + dx, y: q.y * sy + dy };
  if (q.ix != null)
    Object.assign(o, {
      ix: q.ix * sx + dx,
      iy: (q.iy ?? q.y) * sy + dy,
      ox: (q.ox ?? q.x) * sx + dx,
      oy: (q.oy ?? q.y) * sy + dy,
    });
  return o;
};

// ---------- editing a pen shape's points (double-click it, like Figma). Every corner shows a circle:
//   drag a point to move it (Shift: straight across/up/down) · drag a handle to bend the curve, Option-drag to bend just one side
//   Option-drag a sharp point to pull curve handles out of it · double-click a point to switch sharp ↔ smooth (sharp drops its roundness)
//   click a point to pick it (Shift-click for more): Corners in the bar, or the little dot inside the corner, rounds just those
//   click the outline to add a point · Delete removes picked points · Enter, Esc or clicking away finishes. Rectangles, triangles, stars and circles turn into pen shapes when you do this ----------
// the shape being edited point by point, and which of its points are picked
// last: the last click on a point, so two quick ones switch it sharp ↔ smooth
export let vec: {
  id: string;
  sel: Set<number>;
  svg: SVGSVGElement;
  drag: Drag | null;
  last?: { i: number; t: number } | null;
} | null = null;
export const vecCard = (): PathCard | null => {
  const c = vec ? byId(vec.id) : undefined;
  return c?.type === 'path' ? c : null;
};

function shapeToPath(c: CardOf<'shape'>) {
  // a built-in shape becomes editable points in its own box
  const W = c.w,
    H = c.h,
    P = (x: number, y: number): PathPoint => ({ x: (x * W) / 100, y: (y * H) / 100 });
  let pts: PathPoint[];
  if ((c.shape || 'rect') === 'rect') pts = [P(0, 0), P(100, 0), P(100, 100), P(0, 100)];
  else if (c.shape === 'tri') pts = [P(50, 2), P(98, 98), P(2, 98)];
  else if (c.shape === 'star')
    pts = [
      [50, 3],
      [62, 36],
      [97, 37],
      [69, 58],
      [79, 93],
      [50, 72],
      [21, 93],
      [31, 58],
      [3, 37],
      [38, 36],
    ].map(([x = 0, y = 0]) => P(x, y));
  else if (c.shape === 'circle') {
    const k = 0.5523;
    pts = [
      [50, 0, 50 - 50 * k, 0, 50 + 50 * k, 0],
      [100, 50, 100, 50 - 50 * k, 100, 50 + 50 * k],
      [50, 100, 50 + 50 * k, 100, 50 - 50 * k, 100],
      [0, 50, 0, 50 + 50 * k, 0, 50 - 50 * k],
    ].map(([x = 0, y = 0, ix = 0, iy = 0, ox = 0, oy = 0]) => ({
      ...P(x, y),
      ix: (ix * W) / 100,
      iy: (iy * H) / 100,
      ox: (ox * W) / 100,
      oy: (oy * H) / 100,
    }));
  } else return false;
  const fill = c.fill === 'none' ? 'none' : SHAPE_FILL[c.fill || 'gray'] || c.fill,
    rad = c.shape === 'rect' || !c.shape ? (c.radius ?? 10) : c.radius;
  Object.assign(c, {
    type: 'path',
    pts,
    closed: true,
    ow: W,
    oh: H,
    fill,
    radius: rad || undefined,
    stroke: c.stroke,
    sw: c.sw,
  });
  delete c.shape;
  return true;
}

function startVec(id: string) {
  const first = byId(id);
  if (!first) return;
  remember();
  if (first.type === 'shape' && !shapeToPath(first)) return;
  // a shape is a path now, so look it up again as one
  const c = byId(id);
  if (c?.type !== 'path') return;
  const sx = c.w / c.ow,
    sy = c.h / c.oh;
  if (Math.abs(sx - 1) > 1e-6 || Math.abs(sy - 1) > 1e-6) {
    c.pts = c.pts.map(q => scaled(q, sx, sy));
    c.ow = c.w;
    c.oh = c.h;
  }
  c.r = 0;
  renderCard(c);
  selectOnly([id]);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('pen-live', 'vec-live');
  world.appendChild(svg);
  vec = { id, sel: new Set(), svg, drag: null };
  stage.classList.add('vec-mode');
  drawVec();
  say(
    'Editing points: drag them, double-click one to make it sharp or smooth, click the line to add one. Enter when you’re done.',
    4000,
  );
}

export function endVec() {
  if (!vec) return;
  vec.svg.remove();
  const id = vec.id;
  vec = null;
  stage.classList.remove('vec-mode');
  const c = byId(id);
  if (c?.type === 'path') {
    refit(c);
    renderCard(c);
    selectOnly([id]);
    save();
  }
}

export function refit(c: PathCard) {
  // keep the card's box snug around its points and handles
  const xs = c.pts.flatMap(q => [q.x, q.ix ?? q.x, q.ox ?? q.x]),
    ys = c.pts.flatMap(q => [q.y, q.iy ?? q.y, q.oy ?? q.y]);
  let x0 = Math.min(...xs),
    y0 = Math.min(...ys),
    w = Math.max(...xs) - x0,
    h = Math.max(...ys) - y0;
  if (w < 12) {
    x0 -= (12 - w) / 2;
    w = 12;
  }
  if (h < 12) {
    y0 -= (12 - h) / 2;
    h = 12;
  }
  if (Math.abs(x0) < 1e-6 && Math.abs(y0) < 1e-6 && Math.abs(w - c.ow) < 1e-6 && Math.abs(h - c.oh) < 1e-6) return;
  c.pts = c.pts.map(q => scaled(q, 1, 1, -x0, -y0));
  c.x += x0;
  c.y += y0;
  c.w = c.ow = w;
  c.h = c.oh = h;
}

export const vecRadiusDot = (c: PathCard, i: number): RadiusDot | null => {
  const n = c.pts.length,
    q = c.pts[i],
    a = c.pts[(i - 1 + n) % n],
    b = c.pts[(i + 1) % n];
  if (!q || !a || !b || q.ix != null || (!c.closed && (i === 0 || i === n - 1))) return null;
  const ua = { x: a.x - q.x, y: a.y - q.y },
    ub = { x: b.x - q.x, y: b.y - q.y },
    la = Math.hypot(ua.x, ua.y) || 1,
    lb = Math.hypot(ub.x, ub.y) || 1;
  const bis = { x: ua.x / la + ub.x / lb, y: ua.y / la + ub.y / lb },
    lbis = Math.hypot(bis.x, bis.y);
  if (lbis < 1e-3) return null;
  const r = q.r ?? c.radius ?? 0,
    d = Math.max(18 / session.view.z, r * 1.2 + 10 / session.view.z);
  return { x: q.x + (bis.x / lbis) * d, y: q.y + (bis.y / lbis) * d, ux: bis.x / lbis, uy: bis.y / lbis };
};

export function drawVec() {
  const c = vecCard(),
    v = vec;
  if (!c || !v) return;
  const z = session.view.z,
    T = (q: Point) => ({ x: c.x + q.x, y: c.y + q.y }),
    d = pathD(
      c.pts.map(q => scaled(q, 1, 1, c.x, c.y)),
      c.closed,
      c.radius || 0,
    );
  // line widths and dot sizes stay the same on screen whatever the zoom
  const thin = 1.5 / z,
    hair = 1 / z,
    hdot = 3.5 / z,
    rdot = 4 / z,
    pt = 5 / z;
  let h = `<path d="${d}" class="pl-path" style="stroke-width:${thin}px"/>`;
  c.pts.forEach((q, i) => {
    const p = T(q),
      on = v.sel.has(i);
    if (q.ix != null && (on || v.sel.size === 0)) {
      const A = T({ x: q.ix, y: q.iy ?? q.y }),
        B = T({ x: q.ox ?? q.x, y: q.oy ?? q.y });
      h += `<path d="M${A.x} ${A.y} L${p.x} ${p.y} L${B.x} ${B.y}" class="pl-handle" style="stroke-width:${hair}px"/><circle cx="${A.x}" cy="${A.y}" r="${hdot}" class="pl-hdot"/><circle cx="${B.x}" cy="${B.y}" r="${hdot}" class="pl-hdot"/>`;
    }
    if (on) {
      const rd = vecRadiusDot(c, i);
      if (rd) {
        const at = T(rd);
        h += `<circle cx="${at.x}" cy="${at.y}" r="${rdot}" class="pl-rdot" style="stroke-width:${thin}px"/>`;
      }
    }
    const cls = on ? ' close' : '';
    h += `<circle cx="${p.x}" cy="${p.y}" r="${pt}" class="pl-pt${cls}" style="stroke-width:${thin}px"/>`;
  });
  v.svg.innerHTML = h;
}

export function syncCornerPop() {
  const c = vecCard(),
    t = document.querySelector('[data-pop="corners"] b');
  if (!c || !t || !vec) return;
  const rs = [...vec.sel].map(i => c.pts[i]?.r ?? c.radius ?? 0);
  const v = rs.length ? (rs.every(r => r === rs[0]) ? String(rs[0]) : '–') : String(c.radius || 0);
  t.textContent = v;
  const num = document.querySelector('[data-corners-num]');
  if (num instanceof HTMLInputElement && v !== '–' && document.activeElement !== num) num.value = v;
}

export function addCard<T extends Card>(c: T, pop = true) {
  session.board.cards.push(c);
  renderCard(c, pop);
  save();
  return c;
}
export function init12() {
  stage.addEventListener(
    'pointerdown',
    e => {
      if (!vec || e.button !== 0 || session.space) return;
      if (closestTo(e.target, '.tools, .selbar, .dock, .side, .top, .cpop, .myra')) return;
      if (vecDown(e)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true,
  );

  stage.addEventListener(
    'pointermove',
    e => {
      if (vec?.drag) {
        e.stopImmediatePropagation();
        vecMove(e);
      }
    },
    true,
  );

  stage.addEventListener(
    'pointerup',
    e => {
      if (vec?.drag) {
        e.stopImmediatePropagation();
        vecUp();
      }
    },
    true,
  );

  stage.addEventListener(
    'dblclick',
    e => {
      if (vec) {
        const hit = vecHit(toWorld(e.clientX, e.clientY));
        e.preventDefault();
        e.stopImmediatePropagation();
        if (hit && hit.kind === 'pt') vecToggle(hit.i);
        return;
      }
      if (penT) return;
      const el = closestTo(document.elementFromPoint(e.clientX, e.clientY), '.card');
      if (!el) return;
      const c = byId(el.dataset.id ?? ''); // (the board holds the pointer while you press, so look at what's under it)
      if (
        c &&
        !c.locked &&
        (c.type === 'path' || (c.type === 'shape' && ['rect', 'tri', 'star', 'circle'].includes(c.shape || 'rect')))
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        endEdit();
        startVec(c.id);
      }
    },
    true,
  );
}
