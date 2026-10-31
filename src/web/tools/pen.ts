// @ts-nocheck
import { toWorld } from '../canvas/handles.ts';
import { selectOnly } from '../canvas/wires.ts';
import { $, stage, world } from '../core/dom.ts';
import { remember } from '../core/history.ts';
import { card } from '../model/boards.ts';
import { drawOn, exitDraw } from './draw.ts';
import { addCard } from './penEdit.ts';
import { stopPlacing } from './place.ts';
import { session } from '../core/state.ts';

// ---------- adding things ----------
// ---------- the Pen: click to drop points (straight lines), click-and-drag for a smooth curve, click the first point to close a shape;
// Enter, Esc or a double-click finishes an open line. The result is a 'path' card you can move, resize, tilt, stroke and fill ----------
// round the sharp corners of a polyline: each corner is cut back by up to r along both sides and joined with a soft curve
export function roundedD(pts, closed, r) {
  const n = pts.length,
    f = v => +v.toFixed(2);
  if (!r || (n < 3 && !closed)) return null;
  const corner = (prev, p, next) => {
    const a = Math.hypot(p.x - prev.x, p.y - prev.y),
      b = Math.hypot(next.x - p.x, next.y - p.y),
      k = Math.min(r, a / 2, b / 2);
    return {
      s: { x: p.x + ((prev.x - p.x) * k) / (a || 1), y: p.y + ((prev.y - p.y) * k) / (a || 1) },
      e: { x: p.x + ((next.x - p.x) * k) / (b || 1), y: p.y + ((next.y - p.y) * k) / (b || 1) },
      p,
    };
  };
  let d = '';
  const idx = closed ? [...Array(n).keys()] : [...Array(n).keys()].slice(1, -1);
  if (!closed) d = `M${f(pts[0].x)} ${f(pts[0].y)}`;
  idx.forEach((i, j) => {
    const c = corner(pts[(i - 1 + n) % n], pts[i], pts[(i + 1) % n]);
    d +=
      (j === 0 && closed ? `M${f(c.s.x)} ${f(c.s.y)}` : ` L${f(c.s.x)} ${f(c.s.y)}`) +
      ` Q${f(c.p.x)} ${f(c.p.y)} ${f(c.e.x)} ${f(c.e.y)}`;
  });
  return d + (closed ? ' Z' : ` L${f(pts[n - 1].x)} ${f(pts[n - 1].y)}`);
}

// a pen path with curves AND rounded corners: a sharp point (no handles, straight on both sides) is rounded by its own radius (q.r) or the shape's
export function pathD(pts, closed, R = 0, k = 1) {
  const n = pts.length,
    f = v => +v.toFixed(2);
  if (!n) return '';
  const P = i => pts[(i + n) % n];
  const node = i => {
    const q = P(i),
      r = (q.r ?? R) * k,
      hasPrev = closed || i > 0,
      hasNext = closed || i < n - 1;
    if (!(r > 0) || !hasPrev || !hasNext || q.ix != null || q.ox != null || P(i - 1).ox != null || P(i + 1).ix != null)
      return { p: q, s: q, e: q };
    const a = P(i - 1),
      b = P(i + 1),
      la = Math.hypot(q.x - a.x, q.y - a.y) || 1,
      lb = Math.hypot(b.x - q.x, b.y - q.y) || 1,
      kk = Math.min(r, la / 2, lb / 2);
    return {
      p: q,
      round: true,
      s: { x: q.x + ((a.x - q.x) * kk) / la, y: q.y + ((a.y - q.y) * kk) / la },
      e: { x: q.x + ((b.x - q.x) * kk) / lb, y: q.y + ((b.y - q.y) * kk) / lb },
    };
  };
  const N = pts.map((_, i) => node(i));
  const seg = (A, B) =>
    A.p.ox == null && B.p.ix == null
      ? ` L${f(B.s.x)} ${f(B.s.y)}`
      : ` C${f(A.p.ox ?? A.p.x)} ${f(A.p.oy ?? A.p.y)} ${f(B.p.ix ?? B.p.x)} ${f(B.p.iy ?? B.p.y)} ${f(B.p.x)} ${f(B.p.y)}`;
  const corner = B => (B.round ? ` Q${f(B.p.x)} ${f(B.p.y)} ${f(B.e.x)} ${f(B.e.y)}` : '');
  let d = `M${f(N[0].e.x)} ${f(N[0].e.y)}`;
  for (let i = 1; i < n; i++) d += seg(N[i - 1], N[i]) + corner(N[i]);
  if (closed && n > 2) d += seg(N[n - 1], N[0]) + corner(N[0]) + ' Z';
  return d;
}

const penD = (pts, closed) => {
  if (!pts?.length) return '';
  const f = n => +n.toFixed(2);
  const seg = (a, b) =>
    a.ox == null && b.ix == null
      ? ` L${f(b.x)} ${f(b.y)}`
      : ` C${f(a.ox ?? a.x)} ${f(a.oy ?? a.y)} ${f(b.ix ?? b.x)} ${f(b.iy ?? b.y)} ${f(b.x)} ${f(b.y)}`;
  let d = `M${f(pts[0].x)} ${f(pts[0].y)}`;
  for (let i = 1; i < pts.length; i++) d += seg(pts[i - 1], pts[i]);
  if (closed && pts.length > 2) d += seg(pts[pts.length - 1], pts[0]) + ' Z';
  return d;
};

export let penT = null;
// { pts, down, hover, svg } while the Pen is in your hand
export function startPen() {
  stopPlacing();
  if (drawOn) exitDraw();
  selectOnly([]);
  session.selWire = null;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('pen-live');
  world.appendChild(svg);
  penT = { pts: [], down: null, hover: null, svg };
  stage.classList.add('pen-mode');
  $('tools').querySelector('[data-add="pen"]')?.classList.add('on');
  drawPen();
}

export function endPen(keep = true, closed = false) {
  if (!penT) return;
  const p = penT;
  penT = null;
  p.svg.remove();
  stage.classList.remove('pen-mode');
  $('tools').querySelector('[data-add="pen"]')?.classList.remove('on');
  const pts = p.pts;
  if (!keep || pts.length < 2) return;
  const xs = pts.flatMap(q => [q.x, q.ix ?? q.x, q.ox ?? q.x]),
    ys = pts.flatMap(q => [q.y, q.iy ?? q.y, q.oy ?? q.y]);
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
  const sh = q => {
    const o = { x: q.x - x0, y: q.y - y0 };
    if (q.ix != null) Object.assign(o, { ix: q.ix - x0, iy: q.iy - y0, ox: q.ox - x0, oy: q.oy - y0 });
    return o;
  };
  remember();
  const c = card('path', {
    x: x0,
    y: y0,
    w,
    h,
    ow: w,
    oh: h,
    r: 0,
    pts: pts.map(sh),
    closed: closed || undefined,
    stroke: '#27272a',
    sw: 2.5,
    ...(closed ? { fill: '#ffdcd8' } : {}),
  });
  addCard(c);
  selectOnly([c.id]);
}

export function drawPen() {
  if (!penT) return;
  const z = session.view.z,
    P = penT.pts,
    last = P[P.length - 1],
    hv = penT.hover;
  const nearFirst = hv && P.length > 2 && Math.hypot(hv.x - P[0].x, hv.y - P[0].y) < 10 / z;
  let h = `<path d="${penD(P)}" class="pl-path" style="stroke-width:${2 / z}px"/>`;
  if (last && hv && penT.down == null)
    h += `<path d="${penD([last, nearFirst ? P[0] : hv])}" class="pl-band" style="stroke-width:${1.5 / z}px;stroke-dasharray:${4 / z} ${4 / z}"/>`;
  const dn = penT.down != null && P[penT.down];
  if (dn && dn.ox != null)
    h += `<path d="M${dn.ix} ${dn.iy} L${dn.ox} ${dn.oy}" class="pl-handle" style="stroke-width:${1 / z}px"/><circle cx="${dn.ix}" cy="${dn.iy}" r="${3 / z}" class="pl-hdot"/><circle cx="${dn.ox}" cy="${dn.oy}" r="${3 / z}" class="pl-hdot"/>`;
  P.forEach(
    (q, i) =>
      (h += `<circle cx="${q.x}" cy="${q.y}" r="${(i === 0 && nearFirst ? 6 : 4) / z}" class="pl-pt${i === 0 && nearFirst ? ' close' : ''}" style="stroke-width:${1.5 / z}px"/>`),
  );
  penT.svg.innerHTML = h;
}

const snap45 = (from, w) => {
  const dx = w.x - from.x,
    dy = w.y - from.y,
    a = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI) / 4,
    l = Math.hypot(dx, dy);
  return { x: from.x + Math.cos(a) * l, y: from.y + Math.sin(a) * l };
};

export function penDown(e) {
  let w = toWorld(e.clientX, e.clientY);
  const P = penT.pts;
  if (e.shiftKey && P.length) w = snap45(P[P.length - 1], w); // Shift: straight across, up or at 45°
  if (P.length > 2 && Math.hypot(w.x - P[0].x, w.y - P[0].y) < 10 / session.view.z) return endPen(true, true); // back to the start: a closed shape
  P.push({ x: w.x, y: w.y });
  penT.down = P.length - 1;
  stage.setPointerCapture(e.pointerId);
  drawPen();
}

export function penMove(e) {
  const w = toWorld(e.clientX, e.clientY);
  penT.hover = w;
  if (penT.down != null) {
    const q = penT.pts[penT.down];
    if (Math.hypot(w.x - q.x, w.y - q.y) > 3 / session.view.z) {
      if (e.altKey) Object.assign(q, { ox: w.x, oy: w.y, ix: q.ix ?? q.x, iy: q.iy ?? q.y });
      else Object.assign(q, { ox: w.x, oy: w.y, ix: 2 * q.x - w.x, iy: 2 * q.y - w.y });
    }
  } // dragging pulls out smooth curve handles; Option bends only the way out
  else if (e.shiftKey && penT.pts.length) penT.hover = snap45(penT.pts[penT.pts.length - 1], w);
  drawPen();
}
