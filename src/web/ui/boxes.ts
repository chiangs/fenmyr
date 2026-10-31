// @ts-nocheck
import { $, stage, world } from '../core/dom.ts';
import { settings } from '../settings/settings.ts';
import { applySettings } from '../settings/widgets.ts';
import { placeTray, renderDesign } from '../wireframe/pieces.ts';
let boxState;
export function init58() {
  // ---------- the floating boxes: minimize to their title, remembered between launches ----------
  boxState = (() => {
    try {
      return JSON.parse(localStorage.getItem('fenmyr:boxes') || '{}');
    } catch (e) {
      return {};
    }
  })();

  document.querySelectorAll('.box').forEach(b => {
    const k = b.dataset.box,
      btn = b.querySelector('.mini:not(.home-btn):not(.gear)');
    const set = min => {
      b.classList.toggle('min', min);
      btn.textContent = min ? '+' : '–';
      btn.title = min ? 'Open' : 'Minimise';
      boxState[k] = min;
      try {
        localStorage.setItem('fenmyr:boxes', JSON.stringify(boxState));
      } catch (e) {}
    };
    set(!!boxState[k]);
    btn.onclick = () => set(!b.classList.contains('min'));
  });

  $('keysX').onclick = () => {
    settings.keys = false;
    applySettings();
  };

  // the board area never scrolls (it pans instead); if focusing something nudges it, snap it straight back
  [stage, document.scrollingElement].forEach(
    el =>
      el &&
      el.addEventListener('scroll', () => {
        if (el.scrollTop || el.scrollLeft) {
          el.scrollTop = 0;
          el.scrollLeft = 0;
        }
      }),
  );

  addEventListener('scroll', () => {
    if (scrollX || scrollY) scrollTo(0, 0);
  });

  world.appendChild($('guides'));
  setTimeout(placeTray, 0);
  renderDesign();
}
