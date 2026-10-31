// @ts-nocheck
import { applyView } from './view.ts';
import { $, grid } from '../core/dom.ts';
import { settings } from '../settings/settings.ts';
import { applySettings } from '../settings/widgets.ts';

// ---------- the grid's shape: plain dots, or a tiny repeating shape in the dot color ----------
const GRID_SHAPES = {
  dot: ['Dots', '<circle cx="13" cy="13" r="1.6"/>'],
  cross: [
    'Crosses',
    '<rect x="9.6" y="12.25" width="6.8" height="1.5" rx=".75"/><rect x="12.25" y="9.6" width="1.5" height="6.8" rx=".75"/>',
  ],
  square: ['Squares', '<rect x="10.9" y="10.9" width="4.2" height="4.2" rx=".9"/>'],
  cloudberry: [
    'Cloudberries',
    '<path d="M11.48 11.45A1.61 1.61 0 0 1 14.52 11.45A1.61 1.61 0 0 1 16.41 13.82A1.61 1.61 0 0 1 15.73 16.78A1.61 1.61 0 0 1 13 18.1A1.61 1.61 0 0 1 10.27 16.78A1.61 1.61 0 0 1 9.59 13.82A1.61 1.61 0 0 1 11.48 11.45Z"/><path d="M13 10.63C11.88 10.7 10.77 10.14 10.52 8.9C11.88 8.84 12.94 9.39 13 10.63ZM13 10.63C14.12 10.7 15.23 10.14 15.48 8.9C14.12 8.84 13.06 9.39 13 10.63Z"/>',
  ],
  berry: [
    'Berries',
    '<path d="M11.53 9.95A1.56 1.56 0 0 1 14.47 9.95A1.56 1.56 0 0 1 16.3 12.25A1.56 1.56 0 0 1 15.65 15.11A1.56 1.56 0 0 1 13 16.38A1.56 1.56 0 0 1 10.35 15.11A1.56 1.56 0 0 1 9.7 12.25A1.56 1.56 0 0 1 11.53 9.95Z"/>',
  ],
  leaf: [
    'Leaves',
    '<path d="M9.2 15.2C12.8 15.4 16.4 13.6 17.2 9.6C12.8 9.4 9.4 11.2 9.2 15.2Z" transform="rotate(55 13 13)"/>',
  ],
};

const gridMask = k =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26" fill="#000">${(GRID_SHAPES[k] || GRID_SHAPES.dot)[1]}</svg>`)}")`;

export function applyGridShape() {
  const k = GRID_SHAPES[settings.gridShape] ? settings.gridShape : 'dot',
    on = k !== 'dot';
  grid.classList.toggle('shaped', on);
  if (on) grid.style.setProperty('--gm', gridMask(k));
  else grid.style.removeProperty('--gm');
  const box = $('gridShapes');
  if (!box) return;
  if (!box.children.length) {
    box.innerHTML = Object.entries(GRID_SHAPES)
      .map(
        ([id, [name]]) =>
          `<button type="button" data-gshape="${id}" title="${name}" aria-label="${name}"><i style="--gm:${gridMask(id).replace(/"/g, '&quot;')}"></i></button>`,
      )
      .join('');
    box.onclick = e => {
      const b = e.target.closest('[data-gshape]');
      if (!b) return;
      settings.gridShape = b.dataset.gshape;
      if (!settings.grid) settings.grid = true;
      applySettings();
    };
  }
  box.querySelectorAll('[data-gshape]').forEach(b => b.classList.toggle('on', b.dataset.gshape === k));
  applyView();
}
