import { isRecord } from '../../shared/model.ts';
import { $, stage, world } from '../core/dom.ts';
import { settings } from '../settings/settings.ts';
import { applySettings } from '../settings/widgets.ts';
import { placeTray, renderDesign } from '../wireframe/designPanel.ts';

// Which widgets are minimised, by name, remembered between launches. A prototype board keeps its own set, where all
// but the board list and Unsorted start minimised so the board, preview and code get the room; what the person
// changes there is kept for prototype boards.
const KEYS = { plain: 'fenmyr:boxes', proto: 'fenmyr:protoBoxes' } as const;
const PROTO_START: Record<string, boolean> = { layers: true, colors: true, design: true };
type Mode = keyof typeof KEYS;
const mode = (): Mode => (document.body.classList.contains('proto') ? 'proto' : 'plain');
let boxState: Record<string, boolean> = {};
const readBoxes = (m: Mode): Record<string, boolean> => {
  const start = m === 'proto' ? PROTO_START : {};
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEYS[m]) || '{}');
    return {
      ...start,
      ...(isRecord(saved) ? Object.fromEntries(Object.entries(saved).map(([k, v]) => [k, v === true])) : {}),
    };
  } catch {
    return { ...start };
  }
};

// each widget that minimises, with its button: the boxes, and Wireframe
const widgets = (): [string, HTMLElement, HTMLElement][] => {
  const out: [string, HTMLElement, HTMLElement][] = [];
  for (const b of document.querySelectorAll('.box')) {
    const btn = b.querySelector('.mini:not(.home-btn):not(.gear)');
    if (b instanceof HTMLElement && btn instanceof HTMLElement) out.push([b.dataset.box ?? '', b, btn]);
  }
  out.push(['design', $('design'), $('dzMin')]);
  return out;
};

const show = (el: HTMLElement, btn: HTMLElement, min: boolean) => {
  el.classList.toggle('min', min);
  btn.textContent = min ? '+' : '–';
  btn.title = min ? 'Open' : 'Minimise';
};

// on the way into or out of a prototype board: that kind of board's set
export function applyBoxes() {
  boxState = readBoxes(mode());
  for (const [k, el, btn] of widgets()) show(el, btn, !!boxState[k]);
  placeTray();
}

export function init58() {
  // ---------- the floating boxes: minimize to their title ----------
  for (const [k, el, btn] of widgets())
    btn.onclick = () => {
      const min = !el.classList.contains('min');
      show(el, btn, min);
      boxState[k] = min;
      try {
        localStorage.setItem(KEYS[mode()], JSON.stringify(boxState));
      } catch (_e) {}
      placeTray();
    };
  applyBoxes();

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
