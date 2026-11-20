import { $, grid } from '../core/dom.ts';
import { settings } from '../settings/settings.ts';
import { applySettings } from '../settings/widgets.ts';
import { closestTo, htmlIn } from '../ui/dom.ts';
import { GRID_SHAPES, type GridShape, gridGlyph, gridLook, gridName, isGridShape } from './gridLook.ts';
import { applyView } from './view.ts';

// ---------- the grid's shape: plain dots, or a tiny repeating shape in the dot color, or none ----------
function paint(el: HTMLElement, shape: GridShape) {
  const { visible, mask } = gridLook(shape);
  el.classList.toggle('off', !visible);
  el.classList.toggle('shaped', mask !== null);
  if (mask) el.style.setProperty('--gm', mask);
  else el.style.removeProperty('--gm');
}

function fillPicker(box: HTMLElement) {
  box.innerHTML = GRID_SHAPES.map(id => {
    const name = gridName(id),
      mask = gridGlyph(id).replace(/"/g, '&quot;');
    return `<button type="button" data-gshape="${id}" title="${name}" aria-label="${name}"><i style="--gm:${mask}"></i></button>`;
  }).join('');
  box.onclick = e => {
    const id = closestTo(e.target, '[data-gshape]')?.dataset.gshape;
    if (!isGridShape(id)) return;
    settings.gridShape = id;
    applySettings();
  };
}

export function applyGridShape() {
  const shape = settings.gridShape;
  paint(grid, shape);
  applyView();
  const box = $('gridShapes');
  if (!box) return;
  if (!box.children.length) fillPicker(box);
  for (const b of htmlIn(box, '[data-gshape]')) b.classList.toggle('on', b.dataset.gshape === shape);
}
