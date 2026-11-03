import { $ } from '../core/dom.ts';
import { closestTo } from '../ui/dom.ts';
import { startPlacing } from './place.ts';
export function init52() {
  // ---------- shapes: pick one from the little row, then place it ----------
  $('shapePick').onclick = e => {
    const b = closestTo(e.target, '[data-shape]');
    if (!b) return;
    startPlacing('shape', { shape: b.dataset.shape ?? 'rect' });
    $('tools').querySelector('[data-add="shape"]')?.classList.add('on');
  };
}
