import type { Card, CardOf } from '../../shared/model.ts';
import { titleW } from '../canvas/render.ts';
import { session } from '../core/state.ts';
import { cardEl } from '../ui/dom.ts';
import { drawKanban } from './kanban.ts';

// ---------- collections: a named header over a frame; cards inside stack in columns and the frame grows to fit ----------
export const COLL: Record<string, string[]> = {
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

export const parentOf = (id: string) =>
  session.board.cards.find((s): s is CardOf<'coll'> => s.type === 'coll' && s.kids.includes(id));

function naturalHeight(c: Card, el: HTMLElement) {
  if (c.type === 'image') return Math.round(CW * (c.h / c.w));
  if (!['note', 'todo'].includes(c.type)) return c.h;
  const was = el.style.height;
  el.style.height = 'auto';
  const b = el.querySelector('.body');
  if (!(b instanceof HTMLElement)) {
    el.style.height = was;
    return c.h;
  }
  b.style.height = 'auto';
  const h = Math.max(64, b.offsetHeight);
  el.style.height = was;
  b.style.height = '';
  return h;
}

// The little number on a collection's header and on each kanban column: the cards inside, or "inside / allowed" for a column with a limit.
export function countBadge(n: number, limit = 0) {
  const tip = limit ? `${n} of ${limit} allowed` : `${n} card${n === 1 ? '' : 's'}`,
    shown = limit ? `${n} / ${limit}` : String(n);
  return `<b class="kb-n" title="${tip}">${shown}</b>`;
}

// the header's count follows the cards, and goes when the header or the count is switched off. Only the badge is touched, so a name being typed isn't disturbed.
function paintCount(s: CardOf<'coll'>, el: HTMLElement) {
  const head = el.querySelector('.coll-head'),
    old = head?.querySelector('.kb-n');
  if (!head) return;
  if (!s.count || s.head === false) return void old?.remove();
  const badge = countBadge(s.kids.length);
  if (old) old.outerHTML = badge;
  else head.insertAdjacentHTML('beforeend', badge);
}

// Where each card in a collection goes, and the collection's own size. With `measure`, heights come from the screen,
// a card it can't measure (not drawn yet) keeps its place, and a new card's column is kept. Without it, heights are
// the stored ones, so a new card's column is only a guess, left for the measured layout to make. Returns the cards it
// placed.
export function arrange(s: CardOf<'coll'>, cards: readonly Card[], measure?: (c: Card) => number | null) {
  const find = (id: string) => cards.find(c => c.id === id),
    height = measure ?? (c => (c.type === 'image' ? Math.round(CW * (c.h / c.w)) : c.h));
  s.kids = s.kids.filter(id => find(id) && id !== s.id);
  const cols = Math.max(1, s.cols || 1);
  s.cols = cols;
  s.w = s.cols * CW + (s.cols - 1) * CGAP + CPAD * 2;
  if (s.kanban) {
    s.colNames = Array.from({ length: s.cols }, (_, i) => s.colNames?.[i] ?? `Column ${i + 1}`);
    s.colLimit = Array.from({ length: s.cols }, (_, i) => s.colLimit?.[i] || 0);
  }
  const top = (s.head === false ? 0 : CHEAD) + (s.kanban ? KHEAD : 0),
    colH: number[] = Array(s.cols).fill(0),
    placed: Card[] = [];
  s.kids.forEach(id => {
    const c = find(id),
      h = c && height(c);
    if (!c || h == null) return;
    placed.push(c);
    if (c.type === 'image') {
      c.h = h;
    }
    // each card remembers its column (where you dropped it); new ones go in the shortest
    let k = s.colOf?.[id];
    if (k == null || k >= cols) {
      k = colH.indexOf(Math.min(...colH));
      if (measure) (s.colOf = s.colOf || {})[id] = k;
    }
    c.x = s.x + CPAD + k * (CW + CGAP);
    c.y = s.y + top + CPAD + (colH[k] ?? 0);
    c.w = CW;
    if (['note', 'todo'].includes(c.type)) c.h = h;
    c.r = 0;
    colH[k] = (colH[k] ?? 0) + c.h + CGAP;
  });
  s.h = top + CPAD * 2 + Math.max(s.kanban ? 240 : 90, Math.max(...colH) - CGAP);
  return placed;
}

export function layoutColl(s: CardOf<'coll'>) {
  const placed = arrange(s, session.board.cards, c => {
    const el = cardEl(c.id);
    return el ? naturalHeight(c, el) : null;
  });
  placed.forEach(c => {
    const el = cardEl(c.id);
    if (!el) return;
    Object.assign(el.style, {
      left: `${c.x}px`,
      top: `${c.y}px`,
      width: titleW(c),
      height: c.type === 'title' ? 'auto' : `${c.h}px`,
    });
    el.classList.add('inside');
  });
  const el = cardEl(s.id);
  // cards inside always sit on top of their collection (a card made before the collection would otherwise hide under it)
  if (el) {
    let after = el;
    s.kids.forEach(id => {
      const k = cardEl(id);
      if (k && k.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) {
        after.after(k);
        after = k;
      }
    });
  }
  if (el) {
    Object.assign(el.style, { left: `${s.x}px`, top: `${s.y}px`, width: `${s.w}px`, height: `${s.h}px` });
    el.querySelector('.coll-empty')?.remove();
    paintCount(s, el);
    if (s.kanban) drawKanban(s, el);
    else if (!s.kids.length)
      el.querySelector('.body')?.insertAdjacentHTML('beforeend', '<div class="coll-empty">Drop cards here</div>');
  }
}
