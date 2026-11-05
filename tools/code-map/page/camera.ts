import type { VGraph } from '../visible.ts';
import { byId } from './h.ts';

export const cam = { k: 1, x: 0, y: 0 };
const svgEl = () => byId('svg', SVGSVGElement);

export function size() {
  const r = svgEl().getBoundingClientRect();
  return { w: r.width, h: r.height, left: r.left, top: r.top };
}

export function applyCamera() {
  byId('world', SVGGElement).setAttribute(
    'transform',
    `translate(${cam.x.toFixed(1)} ${cam.y.toFixed(1)}) scale(${cam.k.toFixed(4)})`,
  );
  svgEl().style.setProperty('--inv', (1 / cam.k).toFixed(4));
}

// Frame the circles that have connections; a file nothing imports can sit off to the side.
export function fit(g: VGraph) {
  const linked = g.nodes.filter(n => n.deg > 0);
  const shown = linked.length ? linked : g.nodes;
  if (!shown.length) return;
  const s = size();
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const n of shown) {
    x0 = Math.min(x0, n.x - n.r);
    y0 = Math.min(y0, n.y - n.r);
    x1 = Math.max(x1, n.x + n.r);
    y1 = Math.max(y1, n.y + n.r);
  }
  const pad = 56;
  cam.k = Math.min((s.w - pad * 2) / (x1 - x0 || 1), (s.h - pad * 2) / (y1 - y0 || 1), 2.5);
  cam.x = s.w / 2 - ((x0 + x1) / 2) * cam.k;
  cam.y = s.h / 2 - ((y0 + y1) / 2) * cam.k + 14;
  applyCamera();
}

export function centreOn(x: number, y: number) {
  const s = size();
  cam.k = Math.max(cam.k, 1.3);
  cam.x = s.w / 2 - x * cam.k;
  cam.y = s.h / 2 - y * cam.k;
  applyCamera();
}

export function zoomAt(px: number, py: number, factor: number) {
  const k = Math.min(8, Math.max(0.12, cam.k * factor));
  cam.x = px - (px - cam.x) * (k / cam.k);
  cam.y = py - (py - cam.y) * (k / cam.k);
  cam.k = k;
  applyCamera();
}
