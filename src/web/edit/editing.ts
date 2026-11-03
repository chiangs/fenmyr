import { cardEl } from '../ui/dom.ts';
import { renderCard } from '../canvas/render.ts';
import { byId, selectOnly } from '../canvas/wires.ts';
import { openCanvas, renameChild } from '../cards/canvas.ts';
import { layoutColl } from '../cards/collection.ts';
import { wireLinkInput } from '../cards/links.ts';
import { cardsEl } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { openDoc } from '../docs/editor.ts';
import { editField, editTag, fitText } from '../edit/text.ts';
import { openColor } from '../ui/colorPicker.ts';
import { openVNote } from '../vault/notes.ts';
import { session } from '../core/state.ts';
import { closestTo } from '../ui/dom.ts';

import { wireTagTyping } from '../features/tags.ts';

// note text boxes already listening for Shift+Tab to the name
const wiredNameHop = new WeakSet<HTMLElement>();

export function startEdit(id: string, target?: Element | null) {
  const el = cardEl(id),
    c = byId(id);
  if (!el || !c) return;
  const field = (selector: string) => {
    const f = el.querySelector(selector);
    return f instanceof HTMLElement ? f : null;
  };
  // edit the words in one part of the card
  const editIn = (selector: string, set: (v: string) => void, done?: () => void) => {
    const f = field(selector);
    if (f) editField(el, f, set, done);
  };
  if (target?.closest('.tag')) return editTag(c);
  const nm = target?.closest('.nname') ? field('.nname') : null;
  if (nm) {
    editField(el, nm, v => {
      c.name = v;
    });
    nm.addEventListener(
      'keydown',
      ev => {
        if ((ev.key === 'Enter' || ev.key === 'Tab') && !ev.shiftKey && c.type === 'note') {
          ev.preventDefault();
          ev.stopImmediatePropagation();
          nm.onblur = null;
          endEdit();
          save();
          startEdit(c.id);
        }
      },
      { capture: true, once: false },
    );
    return;
  }
  const kh = closestTo(target ?? null, '.kb-h');
  if (c.type === 'coll' && c.kanban && kh) {
    const k = Number(kh.dataset.k),
      names = (c.colNames ??= []),
      text = kh.querySelector('.text');
    if (text instanceof HTMLElement)
      editField(
        el,
        text,
        v => {
          names[k] = v;
        },
        () => {
          names[k] = names[k] || 'Column ' + (k + 1);
          layoutColl(c);
          save();
        },
      );
    return;
  }
  const setText = (v: string) => {
    c.text = v;
  };
  if (c.type === 'coll') return editIn('.coll-head .text', setText);
  if (c.type === 'frame')
    return editIn('.fr-name', v => {
      c.name = v;
    });
  if (c.type === 'section') return editIn('.sec-name .text', setText);
  if (c.type === 'font') return editIn('.fs-sample', setText);
  if (c.type === 'doc' && target && !target.closest('.text')) {
    openDoc(c);
    return;
  }
  if (c.type === 'canvas' && target && !target.closest('.text')) {
    openCanvas(c);
    return;
  }
  if (c.type === 'doc') return editIn('.text', setText);
  if (c.type === 'vnote') return openVNote(c);
  if (c.type === 'canvas') return editIn('.text', setText, () => renameChild(c));
  if (c.type === 'link' && !c.url) return wireLinkInput(c);
  if (c.type === 'audio') {
    if (target?.closest('.au-tx') && c.text) return editIn('.au-tx', setText);
    return editIn('.au-top .text', v => {
      c.title = v;
    });
  }
  const li = closestTo(target ?? null, 'li', HTMLElement),
    sp = li?.querySelector('span');
  if (li && sp instanceof HTMLElement && c.type === 'todo') {
    const i = Number(li.dataset.i),
      items = (c.items ??= []);
    const edit = (j: number, end?: boolean) =>
      setTimeout(() => {
        const s2 = cardsEl.querySelector(`[data-id="${c.id}"] li[data-i="${j}"] span`);
        if (!s2) return;
        startEdit(c.id, s2);
        if (end) {
          const r = document.createRange();
          r.selectNodeContents(s2);
          r.collapse(false);
          const sl = getSelection();
          sl?.removeAllRanges();
          sl?.addRange(r);
        }
      }, 0);
    editField(
      el,
      sp,
      v => {
        const item = items[i];
        if (item) item.t = v;
      },
      () => {
        const item = items[i];
        if (item && !item.t.trim()) {
          items.splice(i, 1);
          renderCard(c);
          fitText(c);
          save();
        }
      },
    );
    sp.addEventListener(
      'keydown',
      ev => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          ev.stopImmediatePropagation();
          if (!items[i]?.t.trim()) return sp.blur();
          sp.onblur = null;
          endEdit();
          items.splice(i + 1, 0, { t: '', done: false });
          renderCard(c);
          fitText(c);
          save();
          edit(i + 1);
        } else if (ev.key === 'Backspace' && !sp.textContent) {
          ev.preventDefault();
          ev.stopImmediatePropagation();
          sp.onblur = null;
          endEdit();
          items.splice(i, 1);
          renderCard(c);
          fitText(c);
          save();
          if (i > 0) edit(i - 1, true);
          else selectOnly([c.id]);
        }
      },
      true,
    );
    return;
  }
  if (c.type === 'link') {
    const desc = target?.closest('.meta span');
    return editIn(desc ? '.meta span' : '.meta b', v => {
      if (desc) c.desc = v;
      else c.title = v;
    });
  }
  if (c.type === 'image') return editTag(c);
  if (c.type === 'swatch') return openColor(c);
  if (c.type === 'todo') return editIn('.head', setText);
  const t = field('.text');
  if (!t) return;
  session.editing = id;
  el.classList.add('editing');
  t.contentEditable = 'true';
  t.focus();
  if (c.userH == null && c.type === 'note') c.userH = c.h;
  const r = document.createRange();
  r.selectNodeContents(t);
  r.collapse(false);
  const s = getSelection();
  s?.removeAllRanges();
  s?.addRange(r);
  t.oninput = () => {
    c.text = t.innerText.replace(/\n$/, '');
    fitText(c);
    save();
  };
  t.onblur = () => endEdit();
  if (c.type === 'note') {
    wireTagTyping(c, t);
    if (!wiredNameHop.has(t)) {
      wiredNameHop.add(t);
      t.addEventListener(
        'keydown',
        ev => {
          if (ev.key === 'Tab' && ev.shiftKey && !c.myra) {
            ev.preventDefault();
            ev.stopImmediatePropagation();
            t.onblur = null;
            endEdit();
            save();
            startEdit(c.id, cardsEl.querySelector(`[data-id="${c.id}"] .nname`));
          }
        },
        true,
      );
    }
  }
}

export function endEdit() {
  if (!session.editing) return;
  const el = cardEl(session.editing);
  if (el) {
    el.classList.remove('editing');
    for (const n of el.querySelectorAll('[contenteditable]')) if (n instanceof HTMLElement) n.contentEditable = 'false';
  }
  session.editing = null;
}
