// @ts-nocheck
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

// ---------- editing a pen shape's points (double-click it, like Figma). Every corner shows a circle:
//   drag a point to move it (Shift: straight across/up/down) · drag a handle to bend the curve, Option-drag to bend just one side
//   Option-drag a sharp point to pull curve handles out of it · double-click a point to switch sharp ↔ smooth (sharp drops its roundness)
//   click a point to pick it (Shift-click for more): Corners in the bar, or the little dot inside the corner, rounds just those
//   click the outline to add a point · Delete removes picked points · Enter, Esc or clicking away finishes. Rectangles, triangles, stars and circles turn into pen shapes when you do this ----------
export let vec = null;
// { id, sel: Set, svg, drag }
export const vecCard = () => vec && byId(vec.id);

function shapeToPath(c) {
  // a built-in shape becomes editable points in its own box
  const W = c.w,
    H = c.h,
    P = (x, y) => ({ x: (x * W) / 100, y: (y * H) / 100 });
  let pts;
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
    ].map(([x, y]) => P(x, y));
  else if (c.shape === 'circle') {
    const k = 0.5523;
    pts = [
      [50, 0, 50 - 50 * k, 0, 50 + 50 * k, 0],
      [100, 50, 100, 50 - 50 * k, 100, 50 + 50 * k],
      [50, 100, 50 + 50 * k, 100, 50 - 50 * k, 100],
      [0, 50, 0, 50 + 50 * k, 0, 50 - 50 * k],
    ].map(([x, y, ix, iy, ox, oy]) => ({
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

function startVec(id) {
  const c = byId(id);
  if (!c) return;
  remember();
  if (c.type === 'shape' && !shapeToPath(c)) return;
  const sx = c.w / c.ow,
    sy = c.h / c.oh;
  if (Math.abs(sx - 1) > 1e-6 || Math.abs(sy - 1) > 1e-6) {
    c.pts = c.pts.map(q => {
      const o = { ...q, x: q.x * sx, y: q.y * sy };
      if (q.ix != null) Object.assign(o, { ix: q.ix * sx, iy: q.iy * sy, ox: q.ox * sx, oy: q.oy * sy });
      return o;
    });
    if (c.radius) c.radius = c.radius;
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
  if (c) {
    refit(c);
    renderCard(c);
    selectOnly([id]);
    save();
  }
}

export function refit(c) {
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
  c.pts = c.pts.map(q => {
    const o = { ...q, x: q.x - x0, y: q.y - y0 };
    if (q.ix != null) Object.assign(o, { ix: q.ix - x0, iy: q.iy - y0, ox: q.ox - x0, oy: q.oy - y0 });
    return o;
  });
  c.x += x0;
  c.y += y0;
  c.w = c.ow = w;
  c.h = c.oh = h;
}

const vecRadiusDot = (c, i) => {
  const n = c.pts.length,
    q = c.pts[i];
  if (q.ix != null || (!c.closed && (i === 0 || i === n - 1))) return null;
  const a = c.pts[(i - 1 + n) % n],
    b = c.pts[(i + 1) % n],
    ua = { x: a.x - q.x, y: a.y - q.y },
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
  const c = vecCard();
  if (!c) return;
  const z = session.view.z,
    T = q => ({ x: c.x + q.x, y: c.y + q.y });
  let h = `<path d="${pathD(
    c.pts.map(q => {
      const o = { ...q, x: q.x + c.x, y: q.y + c.y };
      if (q.ix != null) Object.assign(o, { ix: q.ix + c.x, iy: q.iy + c.y, ox: q.ox + c.x, oy: q.oy + c.y });
      return o;
    }),
    c.closed,
    c.radius || 0,
  )}" class="pl-path" style="stroke-width:${1.5 / z}px"/>`;
  c.pts.forEach((q, i) => {
    const p = T(q),
      on = vec.sel.has(i);
    if (q.ix != null && (on || vec.sel.size === 0)) {
      const A = T({ x: q.ix, y: q.iy }),
        B = T({ x: q.ox, y: q.oy });
      h += `<path d="M${A.x} ${A.y} L${p.x} ${p.y} L${B.x} ${B.y}" class="pl-handle" style="stroke-width:${1 / z}px"/><circle cx="${A.x}" cy="${A.y}" r="${3.5 / z}" class="pl-hdot"/><circle cx="${B.x}" cy="${B.y}" r="${3.5 / z}" class="pl-hdot"/>`;
    }
    if (on) {
      const rd = vecRadiusDot(c, i);
      if (rd)
        h += `<circle cx="${c.x + rd.x}" cy="${c.y + rd.y}" r="${4 / z}" class="pl-rdot" style="stroke-width:${1.5 / z}px"/>`;
    }
    h += `<circle cx="${p.x}" cy="${p.y}" r="${5 / z}" class="pl-pt${on ? ' close' : ''}" style="stroke-width:${1.5 / z}px"/>`;
  });
  vec.svg.innerHTML = h;
}

function vecHit(w) {
  const c = vecCard(),
    z = session.view.z,
    L = { x: w.x - c.x, y: w.y - c.y },
    near = (x, y, r) => Math.hypot(L.x - x, L.y - y) < r / z;
  for (const i of vec.sel) {
    const rd = vecRadiusDot(c, i);
    if (rd && near(rd.x, rd.y, 8)) return { kind: 'radius', i, rd };
  }
  for (let i = 0; i < c.pts.length; i++) {
    const q = c.pts[i];
    if (q.ix != null && (vec.sel.has(i) || !vec.sel.size)) {
      if (near(q.ox, q.oy, 7)) return { kind: 'out', i };
      if (near(q.ix, q.iy, 7)) return { kind: 'in', i };
    }
  }
  for (let i = 0; i < c.pts.length; i++) if (near(c.pts[i].x, c.pts[i].y, 9)) return { kind: 'pt', i };
  // on the outline: sample each segment
  const n = c.pts.length,
    segs = c.closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = c.pts[i],
      b = c.pts[(i + 1) % n];
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

function vecDown(e) {
  const c = vecCard(),
    w = toWorld(e.clientX, e.clientY),
    hit = vecHit(w);
  if (!hit) {
    const inside = w.x > c.x && w.x < c.x + c.w && w.y > c.y && w.y < c.y + c.h;
    if (inside) {
      vec.sel.clear();
      drawVec();
      syncCornerPop();
      return true;
    }
    endVec();
    return false;
  }
  remember();
  if (hit.kind === 'seg') {
    const at = (hit.i + 1) % c.pts.length;
    c.pts.splice(hit.i + 1, 0, { x: hit.x, y: hit.y });
    vec.sel = new Set([hit.i + 1 === c.pts.length ? c.pts.length - 1 : hit.i + 1]);
    vec.drag = { kind: 'pt', i: hit.i + 1 };
    renderCard(c);
    drawVec();
    return true;
  }
  if (hit.kind === 'pt') {
    const now = Date.now();
    if (vec.last && vec.last.i === hit.i && now - vec.last.t < 400) {
      vec.last = null;
      vecToggle(hit.i);
      return true;
    }
    vec.last = { i: hit.i, t: now }; // two quick clicks on a point: sharp ↔ smooth
    if (e.shiftKey) {
      vec.sel.has(hit.i) ? vec.sel.delete(hit.i) : vec.sel.add(hit.i);
    } else if (!vec.sel.has(hit.i)) vec.sel = new Set([hit.i]);
    const q = c.pts[hit.i];
    vec.drag =
      e.altKey && q.ix == null
        ? { kind: 'pull', i: hit.i }
        : { kind: 'pt', i: hit.i, sx: w.x, sy: w.y, start: [...vec.sel].map(j => [j, { ...c.pts[j] }]) };
  } else vec.drag = hit;
  stage.setPointerCapture(e.pointerId);
  drawVec();
  syncCornerPop();
  return true;
}

function vecMove(e) {
  const c = vecCard(),
    d = vec.drag;
  if (!d) return;
  const w = toWorld(e.clientX, e.clientY),
    L = { x: w.x - c.x, y: w.y - c.y };
  if (d.kind === 'pt' && d.start) {
    let dx = w.x - d.sx,
      dy = w.y - d.sy;
    if (e.shiftKey) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    d.start.forEach(([j, o]) => {
      const q = c.pts[j];
      q.x = o.x + dx;
      q.y = o.y + dy;
      if (o.ix != null) Object.assign(q, { ix: o.ix + dx, iy: o.iy + dy, ox: o.ox + dx, oy: o.oy + dy });
    });
  } else if (d.kind === 'pt') {
    const q = c.pts[d.i];
    q.x = L.x;
    q.y = L.y;
  } else if (d.kind === 'pull' || d.kind === 'out' || d.kind === 'in') {
    const q = c.pts[d.i];
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
    const q = c.pts[d.i],
      rd = d.rd,
      proj = (L.x - q.x) * rd.ux + (L.y - q.y) * rd.uy;
    const r = Math.max(0, Math.round((proj - 10 / session.view.z) / 1.2));
    vec.sel.forEach(j => (c.pts[j].r = r));
    syncCornerPop();
  }
  renderCard(c);
  drawVec();
}

function vecUp() {
  if (!vec || !vec.drag) return;
  vec.drag = null;
  const c = vecCard();
  const before = { x: c.x, y: c.y };
  refit(c);
  renderCard(c);
  drawVec();
  renderWires();
  save();
}

function vecToggle(i) {
  const c = vecCard(),
    q = c.pts[i];
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
      a = c.pts[(i - 1 + n) % n],
      b = c.pts[(i + 1) % n],
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
  if (!c || !t) return;
  const rs = [...vec.sel].map(i => c.pts[i].r ?? c.radius ?? 0);
  const v = rs.length ? (rs.every(r => r === rs[0]) ? rs[0] : '–') : c.radius || 0;
  t.textContent = v;
  const num = document.querySelector('[data-corners-num]');
  if (num && v !== '–' && document.activeElement !== num) num.value = v;
}

export function addCard(c, pop = true) {
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
      if (e.target.closest('.tools, .selbar, .dock, .side, .top, .cpop, .myra')) return;
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
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('.card');
      if (!el) return;
      const c = byId(el.dataset.id); // (the board holds the pointer while you press, so look at what's under it)
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
