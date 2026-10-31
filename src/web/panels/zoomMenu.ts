// @ts-nocheck
import { ZOOM_STEPS, fit, toWorld } from '../canvas/handles.ts';
import { applyView } from '../canvas/view.ts';
import { selectOnly } from '../canvas/wires.ts';
import { clamp } from '../core/base.ts';
import { $, stage } from '../core/dom.ts';
import { boardMenu } from '../features/export.ts';
import { startEdit } from '../features/tags.ts';
import { card } from '../model/boards.ts';
import { addCard } from '../tools/penEdit.ts';
import { session } from '../core/state.ts';

// ---------- zoom from the menu (click the %) or the keyboard: it glides there, centered on the part of the board you're looking at ----------
export function glideView(to) {
  const from = { ...session.view },
    t0 = performance.now();
  stage.classList.add('moving');
  const step = t => {
    const k = Math.min(1, (t - t0) / 260),
      e = 1 - Math.pow(1 - k, 3);
    ['x', 'y', 'z'].forEach(n => (session.view[n] = from[n] + (to[n] - from[n]) * e));
    applyView();
    if (k < 1) requestAnimationFrame(step);
    else stage.classList.remove('moving');
  };
  requestAnimationFrame(step);
}

export function zoomTo(z) {
  const r = stage.getBoundingClientRect(),
    L = document.body.classList.contains('phone') ? 0 : 270,
    cx = L + (r.width - L - 270) / 2,
    cy = r.height / 2;
  const p = { x: (cx - session.view.x) / session.view.z, y: (cy - session.view.y) / session.view.z },
    nz = clamp(z, 0.15, 3);
  glideView({ x: cx - p.x * nz, y: cy - p.y * nz, z: nz });
}

export const zoomStep = dir =>
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

export function centerWorld() {
  const r = stage.getBoundingClientRect();
  return toWorld(r.left + 270 + (r.width - 530) / 2, r.top + r.height / 2);
}

export function addAtCenter(type, extra = {}) {
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
    boardMenu({ clientX: b.left, clientY: b.top - 8 }, [
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
      const mr = m.getBoundingClientRect();
      m.style.top = b.top - mr.height - 8 + 'px';
      m.classList.add('zoom-menu');
    }
  };
}
