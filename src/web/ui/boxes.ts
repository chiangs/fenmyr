import { isRecord } from '../../shared/model.ts';
import { $, stage, world } from '../core/dom.ts';
import { settings } from '../settings/settings.ts';
import { applySettings } from '../settings/widgets.ts';
import { placeTray, renderDesign } from '../wireframe/designPanel.ts';

// which boxes are minimised, by name
let boxState: Record<string, boolean> = {};
const readBoxes = (): Record<string, boolean> => {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem('fenmyr:boxes') || '{}');
    return isRecord(saved) ? Object.fromEntries(Object.entries(saved).map(([k, v]) => [k, v === true])) : {};
  } catch {
    return {};
  }
};
export function init58() {
  // ---------- the floating boxes: minimize to their title, remembered between launches ----------
  boxState = readBoxes();

  for (const b of document.querySelectorAll('.box')) {
    const btn = b.querySelector('.mini:not(.home-btn):not(.gear)');
    if (!(b instanceof HTMLElement) || !(btn instanceof HTMLElement)) continue;
    const k = b.dataset.box ?? '';
    const set = (min: boolean) => {
      b.classList.toggle('min', min);
      btn.textContent = min ? '+' : '–';
      btn.title = min ? 'Open' : 'Minimise';
      boxState[k] = min;
      try {
        localStorage.setItem('fenmyr:boxes', JSON.stringify(boxState));
      } catch (_e) {}
    };
    set(!!boxState[k]);
    btn.onclick = () => set(!b.classList.contains('min'));
  }

  $('keysX').onclick = () => {
    settings.keys = false;
    applySettings();
  };

  // the board area never scrolls (it pans instead); if focusing something nudges it, snap it straight back
  [stage, document.scrollingElement].forEach(el => {
    el?.addEventListener('scroll', () => {
      if (el.scrollTop || el.scrollLeft) {
        el.scrollTop = 0;
        el.scrollLeft = 0;
      }
    });
  });

  addEventListener('scroll', () => {
    if (scrollX || scrollY) scrollTo(0, 0);
  });

  world.appendChild($('guides'));
  setTimeout(placeTray, 0);
  renderDesign();
}
