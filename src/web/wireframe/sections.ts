// @ts-nocheck
import { renderCard } from '../canvas/render.ts';
import { parentOf } from '../cards/collection.ts';
import { cardsEl } from '../core/dom.ts';
import { remember, save } from '../core/history.ts';
import { startEdit } from '../features/tags.ts';
import { card } from '../model/boards.ts';
import { selCards } from '../selbar/selbar.ts';
import { session } from '../core/state.ts';

// ---------- glass sections: a frosted bubble around a bunch of things. Anything whose middle sits inside it belongs to it,
// so dragging something in makes it join and dragging it out makes it leave, with nothing to keep in sync ----------
const SEC_PAD = 36;
const SEC_TOP = 58;

export const inSection = s =>
  session.board.cards.filter(
    c =>
      c.id !== s.id &&
      !c.hidden &&
      !parentOf(c.id) &&
      !(c.type === 'section' && c.w * c.h >= s.w * s.h) &&
      c.x + c.w / 2 > s.x &&
      c.x + c.w / 2 < s.x + s.w &&
      c.y + c.h / 2 > s.y &&
      c.y + c.h / 2 < s.y + s.h,
  );

export function makeSection(cs = selCards()) {
  cs = cs.filter(c => !parentOf(c.id));
  if (!cs.length || !session.board) return;
  remember();
  const box = cs,
    x0 = Math.min(...box.map(c => c.x)),
    y0 = Math.min(...box.map(c => c.y)),
    x1 = Math.max(...box.map(c => c.x + c.w)),
    y1 = Math.max(...box.map(c => c.y + c.h));
  const s = card('section', {
    x: Math.round(x0 - SEC_PAD),
    y: Math.round(y0 - SEC_TOP),
    w: Math.round(x1 - x0 + SEC_PAD * 2),
    h: Math.round(y1 - y0 + SEC_TOP + SEC_PAD),
    r: 0,
    text: 'Section',
    color: 'white',
  });
  session.board.cards.unshift(s);
  renderCard(s, true);
  cardsEl.prepend(cardsEl.querySelector(`[data-id="${s.id}"]`));
  save(); // behind everything it holds selectOnly([s.id]); layersSoon();
  setTimeout(() => renameSection(s), 60);
}

// rename: the name tab becomes editable with the old name selected, ready to type over
export function renameSection(sec) {
  startEdit(sec.id);
  const t = cardsEl.querySelector(`[data-id="${sec.id}"] .sec-name .text`);
  if (t) {
    t.focus();
    const r = document.createRange();
    r.selectNodeContents(t);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
  }
}
