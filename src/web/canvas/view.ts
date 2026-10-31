// @ts-nocheck
import { rhEl } from './handles.ts';
import { $, grid, stage, world } from '../core/dom.ts';
import { session } from '../core/state.ts';
let _rect;
let zoomShrinks;

// ---------- view ----------
let movingT = 0;

export function applyView() {
  // section names grow as you zoom out, so a zoomed-out board reads like a big wall of labeled areas
  world.style.setProperty('--secz', Math.min(4, Math.max(1, 1 / session.view.z)).toFixed(3));
  // while zooming or panning, a fast scale; once you stop, real zoom, so text and everything else is laid out again at the new size (crisp, even with
  // Spotify players or videos on the board, which otherwise make Safari stretch an old picture of the board)
  if (world.style.zoom && Math.abs(session.view.z - +world.style.zoom) < 1e-6)
    world.style.transform = `translate(${session.view.x / session.view.z}px, ${session.view.y / session.view.z}px)`;
  else {
    world.style.zoom = '';
    world.style.transform = `translate(${session.view.x}px, ${session.view.y}px) scale(${session.view.z})`;
  }
  if (typeof rhEl !== 'undefined') rhEl.style.setProperty('--iz', (1 / session.view.z).toFixed(4)); // the resize corner stays the same size on screen at any zoom (set on it alone: on the whole board, Safari restyled every card each zoom step)
  stage.classList.toggle('far', session.view.z < 0.55);
  stage.classList.add('moving');
  clearTimeout(movingT);
  movingT = setTimeout(() => {
    stage.classList.remove('moving');
    // real zoom only where it's needed: a Spotify player or video on the board makes Safari stretch an old picture of the board, so lay it out fresh there.
    // Boards without them are already crisp with the fast scale, and skipping the re-layout keeps them snappier.
    if (session.view.z > 1.02) {
      // only zoomed in: shrinking a picture never blurs it
      world.style.zoom = session.view.z;
      world.style.transform = `translate(${session.view.x / session.view.z}px, ${session.view.y / session.view.z}px)`;
    }
  }, 450); // a short pause in a pinch isn't the end of it, so wait a little before redrawing everything sharp
  let s = 26 * session.view.z;
  while (s < 20) s *= 2;
  while (s > 40) s /= 2; // dots keep their size; zooming out skips every other dot instead of crowding them
  grid.style.backgroundSize = `${s}px ${s}px`;
  grid.style.backgroundPosition = `${session.view.x}px ${session.view.y}px`;
  if (grid.classList.contains('shaped')) {
    grid.style.webkitMaskSize = grid.style.maskSize = `${s}px ${s}px`;
    grid.style.webkitMaskPosition = grid.style.maskPosition = `${session.view.x}px ${session.view.y}px`;
  }
  $('zoom').textContent = Math.round(session.view.z * 100) + '%';
}
export function init8() {
  // ---------- crisp zoom: once you stop zooming, the board uses real CSS zoom so every word is laid out at the size you see ----------
  // In WebKit, measuring something inside a CSS-zoomed box reports it divided by the zoom; this puts the zoom back,
  // so every place that measures cards (selection, the resize corner, the selection bar, drop targets) keeps working unchanged.
  _rect = Element.prototype.getBoundingClientRect;

  zoomShrinks = (() => {
    const o = document.createElement('div'),
      i = document.createElement('div');
    o.style.cssText = 'position:absolute;left:-9999px;top:0;zoom:2';
    i.style.cssText = 'width:100px;height:10px';
    o.appendChild(i);
    document.body.appendChild(o);
    const w = _rect.call(i).width;
    o.remove();
    return w > 0 && w < 150;
  })();
  // Chrome already reports the zoomed size
  if (zoomShrinks)
    Element.prototype.getBoundingClientRect = function () {
      const r = _rect.call(this),
        z = +world.style.zoom || 1;
      if (z === 1 || this === world || !world.contains(this)) return r;
      return new DOMRect(r.x * z, r.y * z, r.width * z, r.height * z);
    };
}
