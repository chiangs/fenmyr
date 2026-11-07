import { $, grid, stage, world } from '../core/dom.ts';
import { session } from '../core/state.ts';
import { rhEl } from './handles.ts';

// ---------- view ----------
let movingT: ReturnType<typeof setTimeout> | undefined;
let shown = '';

// holdMs: how long the view counts as moving after this step; fit() glides for longer than a wheel notch
export function applyView(holdMs = 300) {
  const transform = `translate(${session.view.x}px, ${session.view.y}px) scale(${session.view.z})`;
  // section names grow as you zoom out, so a zoomed-out board reads like a big wall of labeled areas
  world.style.setProperty('--secz', Math.min(4, Math.max(1, 1 / session.view.z)).toFixed(3));
  world.style.transform = transform;
  if (typeof rhEl !== 'undefined') rhEl.style.setProperty('--iz', (1 / session.view.z).toFixed(4)); // the resize corner stays the same size on screen at any zoom (set on it alone: on the whole board, Safari restyled every card each zoom step)
  stage.classList.toggle('far', session.view.z < 0.55);
  // Only a view that really changed is moving: a redraw that keeps it (a layer reorder) mustn't blink the selection bar.
  if (transform !== shown) {
    shown = transform;
    stage.classList.add('moving');
    clearTimeout(movingT);
    // Dropping the moving class is what redraws the board sharp, so a short pause in a pinch or between wheel
    // notches shouldn't trigger it.
    movingT = setTimeout(() => stage.classList.remove('moving'), holdMs);
  }
  let s = 26 * session.view.z;
  while (s < 20) s *= 2;
  while (s > 40) s /= 2; // dots keep their size; zooming out skips every other dot instead of crowding them
  grid.style.backgroundSize = `${s}px ${s}px`;
  grid.style.backgroundPosition = `${session.view.x}px ${session.view.y}px`;
  if (grid.classList.contains('shaped')) {
    grid.style.webkitMaskSize = grid.style.maskSize = `${s}px ${s}px`;
    grid.style.webkitMaskPosition = grid.style.maskPosition = `${session.view.x}px ${session.view.y}px`;
  }
  $('zoom').textContent = `${Math.round(session.view.z * 100)}%`;
}
