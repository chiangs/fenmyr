// @ts-nocheck
import { titleW } from '../canvas/render.ts';
import { byId } from '../canvas/wires.ts';
import { drawKanban } from './kanban.ts';
import { cardsEl } from '../core/dom.ts';
import { session } from '../core/state.ts';

// ---------- collections: a named header over a frame; cards inside stack in columns and the frame grows to fit ----------
export const COLL = {
  pink: ['#f2a59a', '#ffe6e2'],
  butter: ['#f6c47a', '#fff0d9'],
  mint: ['#b5d69e', '#edf5e5'],
  lilac: ['#cdb8e6', '#f3edf9'],
  sky: ['#a9c9e6', '#e8f1f9'],
  peach: ['#dccdb8', '#f6f1ea'],
  white: ['#e4dfd8', '#f6f3ee'],
};

export const CW = 260;
export const CPAD = 14;
export const CGAP = 12;
export const CHEAD = 52;
export const KHEAD = 44;
// KHEAD: the row of column names a kanban carries under its title
export const colls = () => session.board.cards.filter(c => c.type === 'coll');

export const parentOf = id => session.board.cards.find(s => s.type === 'coll' && (s.kids || []).includes(id));

function naturalHeight(c, el) {
  if (c.type === 'image') return Math.round(CW * (c.h / c.w));
  if (!['note', 'todo'].includes(c.type)) return c.h;
  const was = el.style.height;
  el.style.height = 'auto';
  const b = el.querySelector('.body');
  b.style.height = 'auto';
  const h = Math.max(64, b.offsetHeight);
  el.style.height = was;
  b.style.height = '';
  return h;
}

export function layoutColl(s) {
  s.kids = (s.kids || []).filter(id => byId(id) && id !== s.id);
  s.cols = Math.max(1, s.cols || 1);
  s.w = s.cols * CW + (s.cols - 1) * CGAP + CPAD * 2;
  if (s.kanban) {
    s.colNames = Array.from({ length: s.cols }, (_, i) => s.colNames?.[i] ?? 'Column ' + (i + 1));
    s.colLimit = Array.from({ length: s.cols }, (_, i) => s.colLimit?.[i] || 0);
  }
  const top = (s.head === false ? 0 : CHEAD) + (s.kanban ? KHEAD : 0),
    colH = Array(s.cols).fill(0);
  s.kids.forEach(id => {
    const c = byId(id),
      el = cardsEl.querySelector(`[data-id="${id}"]`);
    if (!el) return;
    const h = naturalHeight(c, el);
    if (c.type === 'image') {
      c.h = h;
    }
    // each card remembers its column (where you dropped it); new ones go in the shortest
    let k = s.colOf?.[id];
    if (k == null || k >= s.cols) {
      k = colH.indexOf(Math.min(...colH));
      (s.colOf = s.colOf || {})[id] = k;
    }
    c.x = s.x + CPAD + k * (CW + CGAP);
    c.y = s.y + top + CPAD + colH[k];
    c.w = CW;
    if (['note', 'todo'].includes(c.type)) c.h = h;
    c.r = 0;
    colH[k] += c.h + CGAP;
    Object.assign(el.style, {
      left: c.x + 'px',
      top: c.y + 'px',
      width: titleW(c),
      height: c.type === 'title' ? 'auto' : c.h + 'px',
    });
    el.classList.add('inside');
  });
  s.h = top + CPAD * 2 + Math.max(s.kanban ? 240 : 90, Math.max(...colH) - CGAP);
  const el = cardsEl.querySelector(`[data-id="${s.id}"]`);
  // cards inside always sit on top of their collection (a card made before the collection would otherwise hide under it)
  if (el) {
    let after = el;
    s.kids.forEach(id => {
      const k = cardsEl.querySelector(`[data-id="${id}"]`);
      if (k && k.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) {
        after.after(k);
        after = k;
      }
    });
  }
  if (el) {
    Object.assign(el.style, { left: s.x + 'px', top: s.y + 'px', width: s.w + 'px', height: s.h + 'px' });
    el.querySelector('.coll-empty')?.remove();
    if (s.kanban) drawKanban(s, el);
    else if (!s.kids.length)
      el.querySelector('.body').insertAdjacentHTML('beforeend', '<div class="coll-empty">Drop cards here</div>');
  }
}
