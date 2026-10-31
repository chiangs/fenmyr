// @ts-nocheck
import { esc, renderCard } from '../canvas/render.ts';
import { byId, selectOnly } from '../canvas/wires.ts';
import { openCanvas, renameChild } from '../cards/canvas.ts';
import { layoutColl } from '../cards/collection.ts';
import { wireLinkInput } from '../cards/links.ts';
import { $, cardsEl } from '../core/dom.ts';
import { remember, save } from '../core/history.ts';
import { openDoc } from '../docs/editor.ts';
import { editField, editTag, fitText } from '../edit/text.ts';
import { openColor } from '../ui/colorPicker.ts';
import { openVNote } from '../vault/notes.ts';
import { appState, session } from '../core/state.ts';

// ---------- tags on notes: kept apart from the words. Each board keeps a list of its tags, which the suggestions come from ----------
export const cleanTag = t =>
  String(t || '')
    .replace(/^#+/, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_\-\/]/gu, '')
    .slice(0, 30);

const realTag = t => !!t && !/^\d+$/.test(t);
// "#24" is an issue number, not a tag
export const cleanTags = list =>
  [
    ...new Map(
      (Array.isArray(list) ? list : [])
        .map(cleanTag)
        .filter(realTag)
        .map(t => [t.toLowerCase(), t]),
    ).values(),
  ].slice(0, 10);

export function syncBoardTags() {
  // the tags in use, in the order they first appeared; one nobody uses any more drops off
  if (!session.board) return;
  const used = new Map();
  session.board.cards.forEach(
    c => c.type === 'note' && (c.tags || []).forEach(t => used.has(t.toLowerCase()) || used.set(t.toLowerCase(), t)),
  );
  const keep = (session.board.tags || []).filter(t => used.has(t.toLowerCase()));
  used.forEach((t, k) => {
    if (!keep.some(x => x.toLowerCase() === k)) keep.push(t);
  });
  if (keep.length) session.board.tags = keep;
  else delete session.board.tags;
}

function tagSuggestions(q, exclude = []) {
  q = String(q || '').toLowerCase();
  const n = {},
    ex = new Set(exclude.map(x => x.toLowerCase()));
  session.board.cards.forEach(
    c => c.type === 'note' && (c.tags || []).forEach(t => (n[t.toLowerCase()] = (n[t.toLowerCase()] || 0) + 1)),
  );
  return (session.board.tags || [])
    .filter(t => !ex.has(t.toLowerCase()) && t.toLowerCase().includes(q))
    .sort(
      (a, b) =>
        b.toLowerCase().startsWith(q) - a.toLowerCase().startsWith(q) ||
        (n[b.toLowerCase()] || 0) - (n[a.toLowerCase()] || 0),
    )
    .slice(0, 6);
}

// the Tags editor in the selection bar: chips with ×, a box to add one, and the board's tags as suggestions
export function tagEditor(c) {
  const sug = tagSuggestions('', c.tags || []);
  return (
    `<div class="te-chips">${(c.tags || []).map(t => `<span class="te-chip">#${esc(t)}<button data-tagx="${esc(t)}" title="Remove">×</button></span>`).join('') || '<span class="te-none">No tags yet</span>'}</div>` +
    `<input class="te-in" placeholder="Add a tag…" spellcheck="false" maxlength="30"><div class="te-sug">${sug.map(t => `<button data-tagadd="${esc(t)}">#${esc(t)}</button>`).join('')}</div>`
  );
}

// on the note itself, while it is selected: each tag has a small × and a "+ tag" chip adds one (the toolbar's tag editor does the same, so you never have to leave the note)
const addTagBtn = solo =>
  `<button type="button" class="nt-add${solo ? ' solo' : ''}" data-nt="add" aria-label="Add a tag" tabindex="-1">+ tag</button>`;

export const soloTagAdd = c => (c.type === 'note' && !(c.tags || []).length ? addTagBtn(true) : '');
// no tags yet: the chip sits on the card's bottom edge, so selecting a note never changes its size
export function tagChips(c) {
  return `<div class="ntags">${c.tags.map(t => `<i>#${esc(t)}<button type="button" class="nt-x" data-tagx="${esc(t)}" aria-label="Remove tag ${esc(t)}" tabindex="-1">×</button></i>`).join('')}${addTagBtn(false)}</div>`;
}

function refreshTagChips(c) {
  const el = cardsEl.querySelector(`[data-id="${c.id}"]`),
    b = el?.querySelector('.body');
  if (!b) return;
  b.querySelector('.ntags')?.remove();
  el.querySelector(':scope > .nt-add')?.remove();
  if ((c.tags || []).length) b.insertAdjacentHTML('beforeend', tagChips(c));
  else if (c.type === 'note') el.insertAdjacentHTML('beforeend', soloTagAdd(c));
  fitText(c);
  const bar = $('selbar');
  if (bar && !bar.querySelector('.sb-popw.open')) bar.dataset.key = ''; // the toolbar's tag count follows
}

// an existing tag keeps its spelling: "UI" typed when the board has "ui" becomes "ui"
export const existingTag = t =>
  (session.board.tags || []).find(x => x.toLowerCase() === cleanTag(t).toLowerCase()) || cleanTag(t);

function addTag(c, t) {
  t = existingTag(t);
  if (!realTag(t)) return;
  c.tags = cleanTags([...(c.tags || []), t]);
  syncBoardTags();
  refreshTagChips(c);
  save();
}

function removeTag(c, t) {
  c.tags = (c.tags || []).filter(x => x.toLowerCase() !== String(t).toLowerCase());
  if (!c.tags.length) delete c.tags;
  syncBoardTags();
  refreshTagChips(c);
  save();
}

// typing "#" in a note: suggestions from the board's tags; picking one (or a space after a new word) turns it into a tag, out of the words
const tagBox = e => {
  const box = e.target.closest('.sb-tags');
  return box && { box, c: byId(box.dataset.for) };
};

const redrawTags = ({ box, c }) => {
  box.innerHTML = tagEditor(c);
  const n = (c.tags || []).length,
    b = $('selbar').querySelector('[data-pop="tags"] b');
  if (b) b.textContent = n || '';
  box.querySelector('.te-in').focus();
};

let tagPop = null;

function wireTagTyping(c, t) {
  if (t._tags) return;
  t._tags = true;
  let items = [],
    at = 0,
    token = null,
    skip = -1;
  const pop = () =>
    tagPop ||
    (tagPop = document.body.appendChild(
      Object.assign(document.createElement('div'), { className: 'tag-pop', id: 'tagPop' }),
    ));
  const close = () => {
    tagPop?.classList.remove('on');
    token = null;
  };
  const tokenAtCaret = () => {
    const sl = getSelection();
    if (!sl.rangeCount || sl.anchorNode?.nodeType !== 3 || !t.contains(sl.anchorNode)) return null;
    const node = sl.anchorNode,
      off = sl.anchorOffset,
      m = /(^|\s)#([\p{L}\p{N}_\-\/]*)$/u.exec(node.data.slice(0, off));
    return m ? { node, start: off - m[2].length - 1, end: off, word: m[2] } : null;
  };
  const show = () => {
    token = tokenAtCaret();
    if (!token || token.start === skip || /^\d+$/.test(token.word)) return close();
    const nw = cleanTag(token.word);
    items = tagSuggestions(token.word, c.tags || []);
    if (realTag(nw) && !(session.board.tags || []).some(x => x.toLowerCase() === nw.toLowerCase()))
      items.push({ create: nw });
    if (!items.length) return close();
    at = Math.min(at, items.length - 1);
    const p = pop();
    p.innerHTML = items
      .map(
        (x, i) =>
          `<button data-i="${i}" class="${i === at ? 'on' : ''}">${x.create ? `New tag <b>#${esc(x.create)}</b>` : `#${esc(x)}`}</button>`,
      )
      .join('');
    const r = document.createRange();
    r.setStart(token.node, token.start);
    r.setEnd(token.node, token.end);
    const bx = r.getBoundingClientRect();
    p.style.left = bx.left + 'px';
    p.style.top = bx.bottom + 6 + 'px';
    p.classList.add('on');
    p.onmousedown = e => {
      e.preventDefault();
      const bt = e.target.closest('[data-i]');
      if (bt) pick(items[+bt.dataset.i]);
    };
  };
  const pick = x => {
    if (!token) return;
    const { node, start, end } = token,
      name = x.create || x;
    node.data = node.data.slice(0, start) + node.data.slice(end).replace(/^ /, '');
    const r = document.createRange();
    r.setStart(node, Math.min(start, node.data.length));
    r.collapse(true);
    const sl = getSelection();
    sl.removeAllRanges();
    sl.addRange(r);
    close();
    c.text = t.innerText.replace(/\n$/, '');
    addTag(c, name);
  };
  t.addEventListener('input', () => {
    at = 0;
    show();
  });
  t.addEventListener(
    'keydown',
    e => {
      if (e.key === ' ') {
        const tk = tokenAtCaret();
        if (tk && tk.start !== skip && realTag(cleanTag(tk.word))) {
          token = tk;
          e.preventDefault();
          e.stopImmediatePropagation();
          return pick({ create: tk.word });
        }
      }
      if (!token || !tagPop?.classList.contains('on')) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopImmediatePropagation();
        at = (at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
        show();
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        e.stopImmediatePropagation();
        pick(items[at]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        skip = token.start;
        close();
      }
    },
    true,
  );
  t.addEventListener('blur', () => setTimeout(close, 120));
}

export function startEdit(id, target) {
  const el = cardsEl.querySelector(`[data-id="${id}"]`),
    c = byId(id);
  if (!el || !c) return;
  if (target && target.closest('.tag')) return editTag(c);
  if (target && target.closest('.nname')) {
    const nm = el.querySelector('.nname');
    editField(el, nm, v => (c.name = v));
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
  const kh = target && target.closest('.kb-h');
  if (c.kanban && kh) {
    const k = +kh.dataset.k;
    return editField(
      el,
      kh.querySelector('.text'),
      v => (c.colNames[k] = v),
      () => {
        c.colNames[k] = c.colNames[k] || 'Column ' + (k + 1);
        layoutColl(c);
        save();
      },
    );
  }
  if (c.type === 'coll') return editField(el, el.querySelector('.coll-head .text'), v => (c.text = v));
  if (c.type === 'frame') return editField(el, el.querySelector('.fr-name'), v => (c.name = v));
  if (c.type === 'section') return editField(el, el.querySelector('.sec-name .text'), v => (c.text = v));
  if (c.type === 'font') return editField(el, el.querySelector('.fs-sample'), v => (c.text = v));
  if ((c.type === 'doc' || c.type === 'canvas') && target && !target.closest('.text'))
    return c.type === 'doc' ? openDoc(c) : openCanvas(c);
  if (c.type === 'doc') return editField(el, el.querySelector('.text'), v => (c.text = v));
  if (c.type === 'vnote') return openVNote(c);
  if (c.type === 'canvas')
    return editField(
      el,
      el.querySelector('.text'),
      v => (c.text = v),
      () => renameChild(c),
    );
  if (c.type === 'link' && !c.url) return wireLinkInput(c);
  if (c.type === 'audio') {
    if (target && target.closest('.au-tx') && c.text)
      return editField(el, el.querySelector('.au-tx'), v => (c.text = v));
    return editField(el, el.querySelector('.au-top .text'), v => (c.title = v));
  }
  const li = target && target.closest('li');
  if (li && c.type === 'todo') {
    const i = +li.dataset.i,
      sp = li.querySelector('span');
    const edit = (j, end) =>
      setTimeout(() => {
        const s2 = cardsEl.querySelector(`[data-id="${c.id}"] li[data-i="${j}"] span`);
        if (!s2) return;
        startEdit(c.id, s2);
        if (end) {
          const r = document.createRange();
          r.selectNodeContents(s2);
          r.collapse(false);
          const sl = getSelection();
          sl.removeAllRanges();
          sl.addRange(r);
        }
      }, 0);
    editField(
      el,
      sp,
      v => (c.items[i].t = v),
      () => {
        if (c.items[i] && !c.items[i].t.trim()) {
          c.items.splice(i, 1);
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
          if (!c.items[i].t.trim()) return sp.blur();
          sp.onblur = null;
          endEdit();
          c.items.splice(i + 1, 0, { t: '', done: false });
          renderCard(c);
          fitText(c);
          save();
          edit(i + 1);
        } else if (ev.key === 'Backspace' && !sp.textContent) {
          ev.preventDefault();
          ev.stopImmediatePropagation();
          sp.onblur = null;
          endEdit();
          c.items.splice(i, 1);
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
    const desc = target && target.closest('.meta span');
    return editField(el, el.querySelector(desc ? '.meta span' : '.meta b'), v => (desc ? (c.desc = v) : (c.title = v)));
  }
  if (c.type === 'image') return editTag(c);
  if (c.type === 'swatch') return openColor(c);
  if (c.type === 'todo') return editField(el, el.querySelector('.head'), v => (c.text = v));
  const t = el.querySelector(c.type === 'todo' ? '.head' : '.text');
  if (!t) return;
  session.editing = id;
  el.classList.add('editing');
  t.contentEditable = 'true';
  t.focus();
  if (c.userH == null && ['note', 'todo'].includes(c.type)) c.userH = c.h;
  const r = document.createRange();
  r.selectNodeContents(t);
  r.collapse(false);
  const s = getSelection();
  s.removeAllRanges();
  s.addRange(r);
  t.oninput = () => {
    c.text = t.innerText.replace(/\n$/, '');
    fitText(c);
    save();
  };
  t.onblur = () => endEdit();
  if (c.type === 'note') {
    wireTagTyping(c, t);
    if (!t._nameHop) {
      t._nameHop = true;
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
  const el = cardsEl.querySelector(`[data-id="${session.editing}"]`);
  if (el) {
    el.classList.remove('editing');
    el.querySelectorAll('[contenteditable]').forEach(n => (n.contentEditable = 'false'));
  }
  session.editing = null;
}
export function init15() {
  // the × and the + tag chip on a note: one set of handlers for every note; the "+" opens a small box with the board's tags as suggestions
  {
    let pop = null,
      anchorEl = null;
    const closeAdd = () => {
      pop?.classList.remove('on');
      anchorEl = null;
    };
    function openTagAdd(c, btn) {
      pop =
        pop ||
        (pop = document.body.appendChild(
          Object.assign(document.createElement('div'), { className: 'tag-pop tag-add', id: 'tagAdd' }),
        ));
      pop.innerHTML =
        '<input class="ta-in" type="text" maxlength="30" placeholder="Add a tag…" spellcheck="false" autocomplete="off" aria-label="Add a tag"><div class="ta-sug"></div>';
      const inp = pop.querySelector('input'),
        sug = pop.querySelector('.ta-sug');
      let items = [],
        at = 0;
      anchorEl = btn;
      const draw = () => {
        const w = cleanTag(inp.value);
        items = tagSuggestions(inp.value, c.tags || []);
        if (realTag(w) && !(session.board.tags || []).some(x => x.toLowerCase() === w.toLowerCase()))
          items.push({ create: w });
        at = Math.min(at, Math.max(0, items.length - 1));
        sug.innerHTML = items
          .map(
            (x, i) =>
              `<button type="button" data-i="${i}" class="${i === at ? 'on' : ''}">${x.create ? `New tag <b>#${esc(x.create)}</b>` : `#${esc(x)}`}</button>`,
          )
          .join('');
      };
      const pick = x => {
        if (!x) return;
        remember();
        addTag(c, x.create || x);
        closeAdd();
      };
      inp.oninput = () => {
        at = 0;
        draw();
      };
      inp.onkeydown = e => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          closeAdd();
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          if (items.length) {
            at = (at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
            draw();
          }
        } else if (e.key === 'Enter' || e.key === ',' || (e.key === ' ' && realTag(cleanTag(inp.value)))) {
          e.preventDefault();
          pick(items[at] || (realTag(cleanTag(inp.value)) ? { create: cleanTag(inp.value) } : null));
        }
      };
      sug.onclick = e => {
        const b = e.target.closest('[data-i]');
        if (b) pick(items[+b.dataset.i]);
      };
      draw();
      const r = btn.getBoundingClientRect();
      pop.classList.add('on');
      pop.style.left = Math.max(8, Math.min(innerWidth - pop.offsetWidth - 8, r.left)) + 'px';
      pop.style.top = Math.min(innerHeight - pop.offsetHeight - 8, r.bottom + 6) + 'px';
      setTimeout(() => inp.focus(), 30);
    }
    // the action runs on pointer-up (remembering what was pressed, not the element: the card may be redrawn between the press and the release, which would cancel a click)
    let down = null;
    const chipOf = t => {
      const b = t.closest && t.closest('.card .nt-x, .card .nt-add');
      return b && { kind: b.matches('.nt-x') ? 'x' : 'add', card: b.closest('.card').dataset.id, tag: b.dataset.tagx };
    };
    addEventListener(
      'pointerdown',
      e => {
        const h = chipOf(e.target);
        if (h) {
          down = h;
          e.stopPropagation();
          e.preventDefault();
        } else {
          down = null;
          if (pop?.classList.contains('on') && !e.target.closest('#tagAdd')) closeAdd();
        }
      },
      true,
    );
    addEventListener(
      'pointerup',
      e => {
        const h = chipOf(e.target),
          d = down;
        down = null;
        if (!d) return;
        e.stopPropagation();
        if (!h || h.kind !== d.kind || h.card !== d.card) return;
        const c = byId(d.card);
        if (!c) return;
        if (d.kind === 'x') {
          remember();
          removeTag(c, d.tag);
        } else openTagAdd(c, cardsEl.querySelector(`[data-id="${c.id}"] .nt-add`) || e.target);
      },
      true,
    );
    addEventListener(
      'click',
      e => {
        if (chipOf(e.target)) {
          e.stopPropagation();
          e.preventDefault();
        }
      },
      true,
    );
  }

  $('selbar').addEventListener(
    'click',
    e => {
      const tb = tagBox(e);
      if (!tb || !tb.c) return;
      const x = e.target.closest('[data-tagx]'),
        a = e.target.closest('[data-tagadd]');
      if (!x && !a) return;
      e.stopImmediatePropagation();
      x ? removeTag(tb.c, x.dataset.tagx) : addTag(tb.c, a.dataset.tagadd);
      redrawTags(tb);
    },
    true,
  );

  $('selbar').addEventListener('keydown', e => {
    if (!e.target.matches?.('.te-in')) return;
    e.stopPropagation();
    const tb = tagBox(e);
    if (!tb?.c) return;
    if ((e.key === 'Enter' || e.key === ',') && e.target.value.trim()) {
      e.preventDefault();
      addTag(tb.c, e.target.value);
      redrawTags(tb);
    } else if (e.key === 'Backspace' && !e.target.value && (tb.c.tags || []).length) {
      removeTag(tb.c, tb.c.tags[tb.c.tags.length - 1]);
      redrawTags(tb);
    }
  });

  $('selbar').addEventListener('input', e => {
    if (!e.target.matches?.('.te-in')) return;
    const tb = tagBox(e);
    if (!tb?.c) return;
    tb.box.querySelector('.te-sug').innerHTML = tagSuggestions(e.target.value, tb.c.tags || [])
      .map(t => `<button data-tagadd="${esc(t)}">#${esc(t)}</button>`)
      .join('');
  });

  appState.lastTap = {};
}
