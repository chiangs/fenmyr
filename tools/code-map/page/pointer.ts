import { tick } from '../layout.ts';
import type { VNode } from '../visible.ts';
import { applyCamera, cam, size, zoomAt } from './camera.ts';
import { data, state } from './ctx.ts';
import { byId, h } from './h.ts';
import { nodeAt, paint, place } from './scene.ts';

type Gesture = { id: number; node: VNode | null; sx: number; sy: number; ox: number; oy: number; moved: boolean };
let gesture: Gesture | null = null;
let heat = 0;
let frameId = 0;

// after a circle is dragged the rest settle back into place over a moment
function reheat(alpha: number) {
  heat = Math.max(heat, alpha);
  if (!frameId) frameId = requestAnimationFrame(frame);
}
function frame() {
  frameId = 0;
  if (heat < 0.02) {
    heat = 0;
    return;
  }
  const g = data().graph;
  tick(g, heat);
  heat *= 0.965;
  place(g);
  frameId = requestAnimationFrame(frame);
}

function hideTip() {
  byId('tip', HTMLElement).hidden = true;
}

function showTip(n: VNode, e: PointerEvent) {
  const tip = byId('tip', HTMLElement),
    s = size(),
    file = n.path ? data().files.get(n.path) : undefined,
    area = data().areas.get(n.area);
  const title = n.path ?? n.area,
    words = file?.description ?? area?.description ?? '',
    facts = file
      ? `${file.imports.length} imports · imported by ${file.importedBy.length} · ${file.lines} lines`
      : `${n.files} files · ${n.lines.toLocaleString()} lines · ${n.deg} cross-area imports`;
  tip.replaceChildren(
    h('b', { text: title }),
    h('span', { class: 'td', text: words }),
    h('span', { class: 'ts', text: facts }),
  );
  tip.hidden = false;
  tip.style.left = `${Math.max(8, Math.min(e.clientX - s.left + 14, s.w - tip.offsetWidth - 8))}px`;
  tip.style.top = `${Math.max(8, Math.min(e.clientY - s.top + 16, s.h - tip.offsetHeight - 8))}px`;
}

// pan by dragging the board, move a circle by dragging it, select by clicking, and zoom with the wheel
export function wirePointer(select: (n: VNode | null) => void) {
  const svg = byId('svg', SVGSVGElement);
  svg.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    gesture = {
      id: e.pointerId,
      node: nodeAt(e.target),
      sx: e.clientX,
      sy: e.clientY,
      ox: cam.x,
      oy: cam.y,
      moved: false,
    };
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove', e => {
    const g = gesture;
    if (g && g.id === e.pointerId) {
      const dx = e.clientX - g.sx,
        dy = e.clientY - g.sy;
      if (!g.moved && Math.hypot(dx, dy) > 4) {
        g.moved = true;
        hideTip();
        if (!g.node) svg.classList.add('panning');
      }
      if (!g.moved) return;
      if (g.node) {
        const s = size();
        g.node.x = (e.clientX - s.left - cam.x) / cam.k;
        g.node.y = (e.clientY - s.top - cam.y) / cam.k;
        g.node.fixed = true;
        g.node.vx = g.node.vy = 0;
        reheat(0.25);
        place(data().graph);
      } else {
        cam.x = g.ox + dx;
        cam.y = g.oy + dy;
        applyCamera();
      }
      return;
    }
    const n = nodeAt(e.target);
    if (n !== state.hover) {
      state.hover = n;
      paint(data().graph);
    }
    if (n) showTip(n, e);
    else hideTip();
  });
  const end = (e: PointerEvent) => {
    const g = gesture;
    if (!g || g.id !== e.pointerId) return;
    if (!g.moved) select(g.node === state.sel ? null : g.node);
    if (g.node) g.node.fixed = false;
    svg.classList.remove('panning');
    gesture = null;
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  svg.addEventListener('pointerleave', () => {
    if (gesture) return;
    state.hover = null;
    paint(data().graph);
    hideTip();
  });
  svg.addEventListener(
    'wheel',
    e => {
      e.preventDefault();
      const s = size();
      zoomAt(e.clientX - s.left, e.clientY - s.top, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)));
      place(data().graph);
    },
    { passive: false },
  );
}
