import type { Card } from '../../shared/model.ts';
import { renderCard } from '../canvas/render.ts';
import { selectOnly } from '../canvas/wires.ts';
import { $ } from '../core/dom.ts';
import { remember, save } from '../core/history.ts';
import { drawVec, syncCornerPop, vec, vecCard } from '../tools/penEdit.ts';
import { closestTo, htmlIn } from '../ui/dom.ts';
import { syncDesign } from '../wireframe/designPanel.ts';
import { G, caret, closeSbPops, markOnce, marks, pct, pop, rebuildBar, syncPair } from './barKit.ts';
import { selCards } from './selected.ts';

const CHIPS = [0, 4, 8, 12, 16, 24, 32];

// what can have round corners: screens, boxes, pictures, pen shapes, and rectangles, triangles and stars
export const roundable = (c: Card) =>
  ['frame', 'box', 'image'].includes(c.type) ||
  c.type === 'path' ||
  (c.type === 'shape' && ['rect', 'tri', 'star'].includes(c.shape || 'rect'));

// a picture is a little round unless you say otherwise
const radiusOf = (c: Card) => c.radius ?? (c.type === 'image' ? 12 : 0);

export function cornersHtml(rnd: Card[]) {
  const first = rnd[0];
  if (!first) return '';
  const cr = radiusOf(first),
    same = rnd.every(c => radiusOf(c) === cr),
    label = same ? (cr >= 999 ? 'Pill' : String(cr)) : '–',
    range = Math.min(80, cr),
    p = pct(cr, 0, 80),
    num = cr >= 999 ? 0 : cr,
    chips = CHIPS.map(v => {
      const cls = same && cr === v ? 'on' : '',
        r = Math.min(v, 14);
      return `<button data-corners="${v}" class="${cls}"><i style="border-top-left-radius:${r}px"></i>${v}</button>`;
    }).join(''),
    pill = same && cr >= 999 ? 'on' : '',
    icon = Icon('corners'),
    CARET = caret();
  return G(
    3,
    pop(
      'corners',
      `${icon}<b>${label}</b>${CARET}`,
      `<div class="sb-corners"><div class="sbc-top"><span>Corners</span><input type="range" min="0" max="80" step="1" value="${range}" style="--p:${p}" data-corners-range><input type="number" min="0" max="999" value="${num}" data-corners-num></div>
         <div class="sbc-chips">${chips}<button data-corners="999" class="${pill}"><i style="border-top-left-radius:14px"></i>Pill</button></div></div>`,
      'Corners',
    ),
  );
}

function setCorners(raw: string | number, keepOpen?: boolean) {
  const editing = vec?.sel.size ? vecCard() : null;
  if (vec && editing) {
    const v = Math.max(0, Math.round(+raw || 0));
    vec.sel.forEach(i => {
      const p = editing.pts[i];
      if (p) p.r = v;
    });
    renderCard(editing);
    drawVec();
    syncCornerPop();
    save();
    return;
  } // editing points: round just the picked corners
  const cs = selCards().filter(roundable);
  if (!cs.length) return;
  const v = Math.max(0, Math.min(999, Math.round(+raw || 0)));
  cs.forEach(c => {
    c.radius = v;
    renderCard(c);
  });
  selectOnly(cs.map(c => c.id));
  syncDesign();
  save();
  const p = document.querySelector('.sb-pop-corners');
  if (p) {
    htmlIn(p, '[data-corners]').forEach(b => b.classList.toggle('on', +(b.dataset.corners ?? NaN) === v));
    const t = document.querySelector('[data-pop="corners"] b');
    if (t) t.textContent = v >= 999 ? 'Pill' : String(v);
  }
  if (!keepOpen) {
    rebuildBar();
    closeSbPops();
  }
}

export function initCorners() {
  $('selbar').addEventListener('input', e => {
    const p = syncPair(e.target, 'data-corners-range', 'data-corners-num');
    if (!p) return;
    markOnce('corners');
    setCorners(p.r.value, true);
  });

  $('selbar').addEventListener('change', () => {
    marks.corners = false;
  });

  $('selbar').addEventListener('keydown', e => {
    if (!closestTo(e.target, '[data-corners-num]')) return;
    e.stopPropagation();
    if (e.key === 'Enter') {
      closeSbPops();
      rebuildBar();
    }
  });

  $('selbar').addEventListener(
    'click',
    e => {
      const v = closestTo(e.target, '[data-corners]')?.dataset.corners;
      if (v === undefined) return;
      e.stopImmediatePropagation();
      remember();
      setCorners(v);
    },
    true,
  );
}
