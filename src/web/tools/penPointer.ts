import type { PathPoint } from '../../shared/model.ts';
import { toWorld } from '../canvas/handles.ts';
import { renderCard } from '../canvas/render.ts';
import { renderWires } from '../canvas/wires.ts';
import { stage } from '../core/dom.ts';
import { remember, save } from '../core/history.ts';
import { session } from '../core/state.ts';
import {
  drawVec,
  endVec,
  type Hit,
  type Point,
  refit,
  scaled,
  syncCornerPop,
  vec,
  vecCard,
  vecRadiusDot,
} from './penEdit.ts';

export function vecHit(w: Point): Hit | null {
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

export function vecDown(e: PointerEvent) {
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

export function vecMove(e: PointerEvent) {
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

export function vecUp() {
  if (!vec?.drag) return;
  vec.drag = null;
  const c = vecCard();
  if (!c) return;
  refit(c);
  renderCard(c);
  drawVec();
  renderWires();
  save();
}

export function vecToggle(i: number) {
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
