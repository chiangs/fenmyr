import type { CardType } from '../../shared/cardTypes.ts';
import type { CardOf, View } from '../../shared/model.ts';
import { fit, toWorld, ZOOM_STEPS } from '../canvas/handles.ts';
import { selectOnly } from '../canvas/selection.ts';
import { applyView } from '../canvas/view.ts';
import { clamp } from '../core/base.ts';
import { $, stage } from '../core/dom.ts';
import { session } from '../core/state.ts';
import { startEdit } from '../edit/editing.ts';
import { boardMenu } from '../features/export.ts';
import { card } from '../model/boards.ts';
import type { Box } from '../selbar/place.ts';
import { addCard } from '../tools/penEdit.ts';
import { openBelow } from '../ui/popover.ts';

// ---------- zoom from the menu (click the %) or the keyboard: it glides there, centered on the part of the board you're looking at ----------
export function glideView(to: View) {
  const from = { ...session.view },
    t0 = performance.now();
  stage.classList.add('moving');
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / 260),
      e = 1 - (1 - k) ** 3;
    (['x', 'y', 'z'] as const).forEach(n => {
      session.view[n] = from[n] + (to[n] - from[n]) * e;
    });
    applyView();
    if (k < 1) requestAnimationFrame(step);
    else stage.classList.remove('moving');
  };
  requestAnimationFrame(step);
}

export function zoomTo(z: number) {
  const r = stage.getBoundingClientRect(),
    L = document.body.classList.contains('phone') ? 0 : 270,
    cx = L + (r.width - L - 270) / 2,
    cy = r.height / 2;
  const p = { x: (cx - session.view.x) / session.view.z, y: (cy - session.view.y) / session.view.z },
    nz = clamp(z, 0.15, 3);
  glideView({ x: cx - p.x * nz, y: cy - p.y * nz, z: nz });
}

export const zoomStep = (dir: number) =>
  zoomTo(
    dir > 0
      ? ZOOM_STEPS.find(z => z > session.view.z + 0.01) || 3
      : [...ZOOM_STEPS].reverse().find(z => z < session.view.z - 0.01) || 0.25,
  );

export function zoomFit() {
  if (!session.board?.cards.length) return zoomTo(1);
  const from = { ...session.view };
  fit(
    session.board.cards.filter(c => !c.hidden),
    120,
    2,
  );
  const to = { ...session.view };
  Object.assign(session.view, from);
  applyView();
  glideView(to);
}

// half a usual card's width and a margin: in a narrow free strip a new card starts at its left edge, so it shows
const HALF_CARD = 146;

// the middle of the view (or of `v`, a view it is about to move to), in board coordinates
export function centerWorld(v: View = session.view) {
  const r = stage.getBoundingClientRect();
  // a prototype board's widgets cover the left of its narrow column, so new cards go just right of them
  const side = document.body.classList.contains('proto')
    ? document.getElementById('side')?.getBoundingClientRect()
    : null;
  if (side?.width) {
    const left = Math.max(r.left, side.right + 16);
    return toWorld(left + Math.max((r.right - left) / 2, HALF_CARD), r.top + r.height / 2, v);
  }
  return toWorld(r.left + 270 + (r.width - 530) / 2, r.top + r.height / 2, v);
}

type Spot = { x: number; y: number; w: number; h: number };

// along one axis: nothing when lo..hi is inside a0..a1, else what centres it there, or puts its start at a0 if longer
const into = (lo: number, hi: number, a0: number, a1: number) =>
  lo >= a0 && hi <= a1 ? 0 : hi - lo > a1 - a0 ? a0 - lo : (a0 + a1 - lo - hi) / 2;

// Bring something that landed out of sight into view (a screen far from where you are looking). Given `area`, the part
// of the view in stage pixels that something docked leaves, the view moves only when it is not already wholly there.
export function revealCards(cs: readonly Spot[], area?: Box) {
  if (!cs.length) return;
  const r = stage.getBoundingClientRect(),
    x0 = Math.min(...cs.map(c => c.x)),
    y0 = Math.min(...cs.map(c => c.y)),
    x1 = Math.max(...cs.map(c => c.x + c.w)),
    y1 = Math.max(...cs.map(c => c.y + c.h));
  const { x, y, z } = session.view;
  if (area) {
    const dx = into(x0 * z + x, x1 * z + x, area.l, area.r),
      dy = into(y0 * z + y, y1 * z + y, area.t, area.b);
    if (!dx && !dy) return;
    session.view.x += dx;
    session.view.y += dy;
    return applyView();
  }
  const sx = r.left + x + ((x0 + x1) / 2) * z,
    sy = r.top + y + ((y0 + y1) / 2) * z;
  if (sx > r.left + 280 && sx < r.right - 280 && sy > r.top + 80 && sy < r.bottom - 120) return;
  const c = centerWorld();
  session.view.x += (c.x - (x0 + x1) / 2) * z;
  session.view.y += (c.y - (y0 + y1) / 2) * z;
  applyView();
}

export function addAtCenter<T extends CardType>(type: T, extra: Partial<CardOf<T>> = {}) {
  const p = centerWorld(),
    c = card(type, extra);
  c.x = p.x - c.w / 2 + (Math.random() * 60 - 30);
  c.y = p.y - c.h / 2 + (Math.random() * 60 - 30);
  addCard(c);
  selectOnly([c.id]);
  if (['note', 'title', 'todo'].includes(type)) startEdit(c.id);
  return c;
}
export function init14() {
  $('zoom').onclick = e => {
    e.stopPropagation();
    const b = $('zoom').getBoundingClientRect();
    boardMenu({ clientX: b.left, clientY: b.bottom }, [
      { label: 'Zoom in  ⌘+', run: () => zoomStep(1) },
      { label: 'Zoom out  ⌘−', run: () => zoomStep(-1) },
      { label: 'Zoom to 100%  ⌘0', run: () => zoomTo(1) },
      { label: 'Zoom to fit  ⇧1', run: zoomFit },
      '-',
      ...[0.5, 1, 2].map(z => ({
        label: `${z * 100}%${Math.abs(session.view.z - z) < 0.01 ? '  ✓' : ''}`,
        run: () => zoomTo(z),
      })),
    ]);
    const m = $('rowMenu');
    if (m) {
      openBelow(m, $('zoom'));
      m.classList.add('zoom-menu');
    }
  };
}
