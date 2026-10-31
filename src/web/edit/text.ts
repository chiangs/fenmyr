// @ts-nocheck
import { renderCard } from '../canvas/render.ts';
import { byId, renderWires, selectOnly } from '../canvas/wires.ts';
import { parentOf } from '../cards/collection.ts';
import { cardsEl } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { endEdit } from '../features/tags.ts';
import { session } from '../core/state.ts';

// ---------- editing text ----------
// notes and checklists fit their words, like auto-height in Figma: taller as you type, back down as you delete,
// but never shorter than the height you gave the card yourself (c.userH, remembered the first time you edit or resize it)
export function fitText(c) {
  if (!c || !['note', 'todo'].includes(c.type) || parentOf(c.id)) return;
  const el = cardsEl.querySelector(`[data-id="${c.id}"]`),
    b = el?.querySelector('.body');
  if (!b) return;
  if (c.userH == null) c.userH = c.h;
  const was = el.style.height;
  el.style.height = 'auto';
  b.style.height = 'auto';
  const need = Math.ceil(b.offsetHeight) + 2;
  b.style.height = '';
  el.style.height = was;
  const h = Math.max(c.userH, need);
  if (Math.abs(h - c.h) > 1) {
    c.h = h;
    el.style.height = h + 'px';
    if (typeof renderWires === 'function') renderWires();
  }
}

// any words on a card can be edited: double-click the bit you want (text, list heading, a list item, the little label, a link's title or note)
export function editField(el, t, set, done) {
  session.editing = el.dataset.id;
  el.classList.add('editing');
  t.contentEditable = 'true';
  t.focus();
  const r = document.createRange();
  r.selectNodeContents(t);
  const s = getSelection();
  s.removeAllRanges();
  s.addRange(r);
  const oneLine = !t.matches('.body > .text'); // notes and titles can wrap; labels, headings and list items are one line
  const fc = byId(el.dataset.id);
  if (fc && fc.userH == null && ['note', 'todo'].includes(fc.type)) fc.userH = fc.h;
  t.oninput = () => {
    set(oneLine ? t.innerText.replace(/\n/g, ' ').trim() : t.innerText.replace(/\n$/, ''));
    fitText(fc);
    save();
  };
  t.onkeydown = ev => {
    if (ev.key === 'Enter' && oneLine) {
      ev.preventDefault();
      t.blur();
    }
  };
  t.onblur = () => {
    endEdit();
    done && done();
  };
}

export function editTag(c) {
  const el = cardsEl.querySelector(`[data-id="${c.id}"]`);
  if (!el) return;
  if (!c.tagText) {
    c.tagText = 'label';
    renderCard(c);
    selectOnly([c.id]);
  }
  const e2 = cardsEl.querySelector(`[data-id="${c.id}"]`);
  editField(
    e2,
    e2.querySelector('.tag'),
    v => (c.tagText = v.trim()),
    () => {
      if (!c.tagText) {
        delete c.tagText;
        renderCard(c);
        selectOnly([c.id]);
        save();
      }
    },
  );
}
