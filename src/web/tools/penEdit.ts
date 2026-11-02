import { toWorld } from '../canvas/handles.ts';
import { renderCard } from '../canvas/render.ts';
import { byId, renderWires, selectOnly } from '../canvas/wires.ts';
import { SHAPE_FILL } from '../cards/shapes.ts';
import { stage, world } from '../core/dom.ts';
import { remember, save } from '../core/history.ts';
import { endEdit } from '../features/tags.ts';
import { say } from '../settings/licenses.ts';
import { pathD, penT } from './pen.ts';
import { session } from '../core/state.ts';
import type { Card, CardOf, PathPoint } from '../../shared/model.ts';
import { closestTo } from '../ui/dom.ts';

type PathCard = CardOf<'path'>;
type Point = { x: number; y: number };
// the little dot inside a picked corner that sets its roundness, and the way it slides
type RadiusDot = Point & { ux: number; uy: number };
type Hit =
  | { kind: 'radius'; i: number; rd: RadiusDot }
  | { kind: 'out' | 'in' | 'pt'; i: number }
  | { kind: 'seg'; i: number; x: number; y: number };
// pull: Option-dragging a sharp point; pt with start: moving the picked points from where they began
type Drag =
  | { kind: 'pull' | 'out' | 'in'; i: number }
  | { kind: 'pt'; i: number; sx?: number; sy?: number; start?: [number, PathPoint][] }
  | { kind: 'radius'; i: number; rd: RadiusDot };
const scaled = (q: PathPoint, sx: number, sy: number, dx = 0, dy = 0): PathPoint => {
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

const vecRadiusDot = (c: PathCard, i: number): RadiusDot | null => {
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
  let h = `<path d="${d}" class="pl-path" style="stroke-width:${1.5 / z}px"/>`;
  c.pts.forEach((q, i) => {
    const p = T(q),
      on = v.sel.has(i);
    if (q.ix != null && (on || v.sel.size === 0)) {
      const A = T({ x: q.ix, y: q.iy ?? q.y }),
        B = T({ x: q.ox ?? q.x, y: q.oy ?? q.y });
      h += `<path d="M${A.x} ${A.y} L${p.x} ${p.y} L${B.x} ${B.y}" class="pl-handle" style="stroke-width:${1 / z}px"/><circle cx="${A.x}" cy="${A.y}" r="${3.5 / z}" class="pl-hdot"/><circle cx="${B.x}" cy="${B.y}" r="${3.5 / z}" class="pl-hdot"/>`;
    }
    if (on) {
      const rd = vecRadiusDot(c, i);
      if (rd)
        h += `<circle cx="${c.x + rd.x}" cy="${c.y + rd.y}" r="${4 / z}" class="pl-rdot" style="stroke-width:${1.5 / z}px"/>`;
    }
    h += `<circle cx="${p.x}" cy="${p.y}" r="${5 / z}" class="pl-pt${on ? ' close' : ''}" style="stroke-width:${1.5 / z}px"/>`;
  });
  v.svg.innerHTML = h;
}

function vecHit(w: Point): Hit | null {
  const c = vecCard(),
    v = vec;
  if (!c || !v) return null;
  const z = session.view.z,
    L = { x: w.x - c.x, y: w.y - c.y },
    near = (x: number, y: number, r: number) => Math.hypot(L.x - x, L.y - y) < r / z;
  for (const i of v.sel) {
    const rd = vecRadiusDot(c, i);
    if (rd && near(rd.x, rd.y, 8)) return { kind: 'radius', i, rd };
  }
  for (const [i, q] of c.pts.entries()) {
    if (q.ix != null && (v.sel.has(i) || !v.sel.size)) {
      if (near(q.ox ?? q.x, q.oy ?? q.y, 7)) return { kind: 'out', i };
      if (near(q.ix, q.iy ?? q.y, 7)) return { kind: 'in', i };
    }
  }
  for (const [i, q] of c.pts.entries()) if (near(q.x, q.y, 9)) return { kind: 'pt', i };
  // on the outline: sample each segment
  const n = c.pts.length,
    segs = c.closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = c.pts[i],
      b = c.pts[(i + 1) % n];
    if (!a || !b) continue;
    const len =
        Math.hypot(b.x - a.x, b.y - a.y) +
        Math.hypot((a.ox ?? a.x) - a.x, (a.oy ?? a.y) - a.y) +
        Math.hypot((b.ix ?? b.x) - b.x, (b.iy ?? b.y) - b.y),
      dt = Math.min(0.025, 2 / (session.view.z * Math.max(1, len))); // checks close enough together that a click on a long edge never slips between them
    for (let t = 0; t <= 1.0001; t += dt) {
      const u = 1 - t,
        ax = a.ox ?? a.x,
        ay = a.oy ?? a.y,
        bx = b.ix ?? b.x,
        by = b.iy ?? b.y;
      const x = u * u * u * a.x + 3 * u * u * t * ax + 3 * u * t * t * bx + t * t * t * b.x,
        y = u * u * u * a.y + 3 * u * u * t * ay + 3 * u * t * t * by + t * t * t * b.y;
      if (near(x, y, 7)) return { kind: 'seg', i, x, y };
    }
  }
  return null;
}

function vecDown(e: PointerEvent) {
  const c = vecCard(),
    v = vec;
  if (!c || !v) return false;
  const w = toWorld(e.clientX, e.clientY),
    hit = vecHit(w);
  if (!hit) {
    const inside = w.x > c.x && w.x < c.x + c.w && w.y > c.y && w.y < c.y + c.h;
    if (inside) {
      v.sel.clear();
      drawVec();
      syncCornerPop();
      return true;
    }
    endVec();
    return false;
  }
  remember();
  if (hit.kind === 'seg') {
    c.pts.splice(hit.i + 1, 0, { x: hit.x, y: hit.y });
    v.sel = new Set([hit.i + 1 === c.pts.length ? c.pts.length - 1 : hit.i + 1]);
    v.drag = { kind: 'pt', i: hit.i + 1 };
    renderCard(c);
    drawVec();
    return true;
  }
  if (hit.kind === 'pt') {
    const now = Date.now();
    if (v.last && v.last.i === hit.i && now - v.last.t < 400) {
      v.last = null;
      vecToggle(hit.i);
      return true;
    }
    v.last = { i: hit.i, t: now }; // two quick clicks on a point: sharp ↔ smooth
    if (e.shiftKey) {
      if (v.sel.has(hit.i)) v.sel.delete(hit.i);
      else v.sel.add(hit.i);
    } else if (!v.sel.has(hit.i)) v.sel = new Set([hit.i]);
    const q = c.pts[hit.i];
    const start = [...v.sel].flatMap((j): [number, PathPoint][] => {
      const p = c.pts[j];
      return p ? [[j, { ...p }]] : [];
    });
    v.drag = e.altKey && q?.ix == null ? { kind: 'pull', i: hit.i } : { kind: 'pt', i: hit.i, sx: w.x, sy: w.y, start };
  } else v.drag = hit;
  stage.setPointerCapture(e.pointerId);
  drawVec();
  syncCornerPop();
  return true;
}

function vecMove(e: PointerEvent) {
  const c = vecCard(),
    v = vec,
    d = v?.drag;
  if (!c || !v || !d) return;
  const w = toWorld(e.clientX, e.clientY),
    L = { x: w.x - c.x, y: w.y - c.y };
  if (d.kind === 'pt' && d.start) {
    let dx = w.x - (d.sx ?? w.x),
      dy = w.y - (d.sy ?? w.y);
    if (e.shiftKey) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    d.start.forEach(([j, o]) => {
      if (c.pts[j]) c.pts[j] = scaled(o, 1, 1, dx, dy);
    });
  } else if (d.kind === 'pt') {
    const q = c.pts[d.i];
    if (q) {
      q.x = L.x;
      q.y = L.y;
    }
  } else if (d.kind === 'pull' || d.kind === 'out' || d.kind === 'in') {
    const q = c.pts[d.i];
    if (!q) return;
    const out = d.kind !== 'in';
    if (d.kind === 'pull') {
      delete q.r;
    }
    const hx = L.x,
      hy = L.y;
    if (out) {
      q.ox = hx;
      q.oy = hy;
    } else {
      q.ix = hx;
      q.iy = hy;
    }
    if (!e.altKey || d.kind === 'pull') {
      if (out) {
        q.ix = 2 * q.x - hx;
        q.iy = 2 * q.y - hy;
      } else {
        q.ox = 2 * q.x - hx;
        q.oy = 2 * q.y - hy;
      }
    } // Option: only this side bends
    if (q.ix == null) {
      q.ix = q.x;
      q.iy = q.y;
    }
    if (q.ox == null) {
      q.ox = q.x;
      q.oy = q.y;
    }
  } else if (d.kind === 'radius') {
    const q = c.pts[d.i];
    if (!q) return;
    const rd = d.rd,
      proj = (L.x - q.x) * rd.ux + (L.y - q.y) * rd.uy,
      r = Math.max(0, Math.round((proj - 10 / session.view.z) / 1.2));
    for (const j of v.sel) {
      const p = c.pts[j];
      if (p) p.r = r;
    }
    syncCornerPop();
  }
  renderCard(c);
  drawVec();
}

function vecUp() {
  if (!vec || !vec.drag) return;
  vec.drag = null;
  const c = vecCard();
  if (!c) return;
  refit(c);
  renderCard(c);
  drawVec();
  renderWires();
  save();
}

function vecToggle(i: number) {
  const c = vecCard(),
    q = c?.pts[i];
  if (!c || !q) return;
  remember();
  if (q.ix != null) {
    delete q.ix;
    delete q.iy;
    delete q.ox;
    delete q.oy;
    delete q.r;
  } // smooth → sharp (and no roundness)
  else {
    const n = c.pts.length,
      a = c.pts[(i - 1 + n) % n] ?? q,
      b = c.pts[(i + 1) % n] ?? q,
      dx = (b.x - a.x) / 4,
      dy = (b.y - a.y) / 4;
    Object.assign(q, { ix: q.x - dx, iy: q.y - dy, ox: q.x + dx, oy: q.y + dy });
    delete q.r;
  } // sharp → smooth
  refit(c);
  renderCard(c);
  drawVec();
  save();
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
      if (vec && vec.drag) {
        e.stopImmediatePropagation();
        vecMove(e);
      }
    },
    true,
  );

  stage.addEventListener(
    'pointerup',
    e => {
      if (vec && vec.drag) {
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
