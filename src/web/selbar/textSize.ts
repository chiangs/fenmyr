import { typesWith } from '../../shared/cardTypes.ts';
import type { Card } from '../../shared/model.ts';
import { renderCard } from '../canvas/render.ts';
import { renderWires } from '../canvas/wires.ts';
import { parentOf } from '../cards/collection.ts';
import { save } from '../core/history.ts';
import { fitText } from '../edit/text.ts';
import { cardEl, htmlIn, oneIn } from '../ui/dom.ts';
import { selCards } from './selected.ts';

export const FS: Record<string, number> = { s: 0.8, m: 1, l: 1.4, xl: 2 };
export const SIZED = typesWith('sized');

// each card's normal text size in px, so a size can be shown and typed as real pixels
export const FS_BASE: Record<string, number> = { note: 15, title: 44, todo: 22, shape: 15, coll: 15 };

export const fsMul = (c: Card) => (typeof c.fs === 'number' ? c.fs : FS[c.fs ?? 'm'] || 1);
export const fsPx = (c: Card) => Math.round((FS_BASE[c.type] || 15) * fsMul(c));
export const sizedCards = () => selCards().filter(c => SIZED.includes(c.type));

// a note outside a collection grows or shrinks to fit its words at the new size
export function fitNote(c: Card) {
  if (c.type !== 'note' || parentOf(c.id)) return;
  renderCard(c);
  const el = cardEl(c.id),
    b2 = el ? oneIn(el, '.body') : null;
  if (!b2) return;
  b2.style.height = 'auto';
  c.h = Math.max(80, b2.offsetHeight);
  b2.style.height = '';
  renderCard(c);
}

export function setFsPx(raw: string | number) {
  const px = Math.max(6, Math.min(400, Math.round(+raw || 0)));
  if (!px) return;
  sizedCards().forEach(c => {
    const m = px / (FS_BASE[c.type] || 15),
      hit = Object.keys(FS).find(k => Math.abs((FS[k] ?? 0) - m) < 0.001);
    if (hit === 'm') delete c.fs;
    else c.fs = hit || +m.toFixed(6);
    renderCard(c);
    fitNote(c);
  });
  const t = document.querySelector('#selbar [data-pop="size"] b');
  if (t) t.textContent = String(px); // the bar stays put while the dropdown is open, so update its label by hand
  const now = sizedCards();
  htmlIn(document, '#selbar [data-fs]').forEach(b => {
    b.classList.toggle(
      'on',
      now.every(c => (c.fs || 'm') === b.dataset.fs),
    );
  });
  renderWires();
  save();
}

// line height (a multiple of the text size) and letter spacing (% of the text size); each kind of card has its own normal
const LH0: Record<string, number> = { note: 1.45, title: 1, todo: 1.35, shape: 1.3, coll: 1.2 };
const LS0: Record<string, number> = { title: -4 };

export const lhOf = (c: Card) => c.lh ?? LH0[c.type] ?? 1.4;
export const lsOf = (c: Card) => c.ls ?? LS0[c.type] ?? 0;

export function setSpacing(kind: 'lh' | 'ls', v: string) {
  sizedCards().forEach(c => {
    const def = kind === 'lh' ? (LH0[c.type] ?? 1.4) : (LS0[c.type] ?? 0),
      n = v === 'normal' ? def : +v;
    if (!Number.isFinite(n)) return;
    if (Math.abs(n - def) < 1e-6) delete c[kind];
    else c[kind] = kind === 'lh' ? Math.round(n * 100) / 100 : Math.round(n * 10) / 10;
    renderCard(c);
    fitText(c);
    if (c.type === 'title') {
      const el = cardEl(c.id);
      if (el) c.h = el.offsetHeight;
    }
  });
  renderWires();
  save();
}
