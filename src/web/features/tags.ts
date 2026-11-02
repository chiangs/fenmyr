import { cardEl, esc } from '../ui/dom.ts';
import { renderCard } from '../canvas/render.ts';
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
import type { Card } from '../../shared/model.ts';
import { child, closestTo } from '../ui/dom.ts';

// a suggestion: one of the board's tags, or a new one to make
type Suggest = string | { create: string };
type Token = { node: Text; start: number; end: number; word: string };
const nameOf = (x: Suggest) => (typeof x === 'string' ? x : x.create);
const suggestRow = (x: Suggest, i: number, at: number, type = '') => {
  const on = i === at ? 'on' : '',
    label = typeof x === 'string' ? `#${esc(x)}` : `New tag <b>#${esc(x.create)}</b>`;
  return `<button${type} data-i="${i}" class="${on}">${label}</button>`;
};
// note text boxes already listening for tags, and for Shift+Tab to the name
const wiredTags = new WeakSet<HTMLElement>(),
  wiredNameHop = new WeakSet<HTMLElement>();

// ---------- tags on notes: kept apart from the words. Each board keeps a list of its tags, which the suggestions come from ----------
export const cleanTag = (t: unknown) =>
  String(t || '')
    .replace(/^#+/, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_\-\/]/gu, '')
    .slice(0, 30);

const realTag = (t: string) => !!t && !/^\d+$/.test(t);
// "#24" is an issue number, not a tag
export const cleanTags = (list: unknown) =>
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
  const used = new Map<string, string>();
  for (const c of session.board.cards)
    if (c.type === 'note') for (const t of c.tags || []) if (!used.has(t.toLowerCase())) used.set(t.toLowerCase(), t);
  const keep = (session.board.tags || []).filter(t => used.has(t.toLowerCase()));
  used.forEach((t, k) => {
    if (!keep.some(x => x.toLowerCase() === k)) keep.push(t);
  });
  if (keep.length) session.board.tags = keep;
  else delete session.board.tags;
}

function tagSuggestions(typed: unknown, exclude: string[] = []): Suggest[] {
  const q = String(typed || '').toLowerCase();
  const n: Record<string, number> = {},
    ex = new Set(exclude.map(x => x.toLowerCase()));
  for (const c of session.board.cards)
    if (c.type === 'note') for (const t of c.tags || []) n[t.toLowerCase()] = (n[t.toLowerCase()] || 0) + 1;
  return (session.board.tags || [])
    .filter(t => !ex.has(t.toLowerCase()) && t.toLowerCase().includes(q))
    .sort(
      (a, b) =>
        Number(b.toLowerCase().startsWith(q)) - Number(a.toLowerCase().startsWith(q)) ||
        (n[b.toLowerCase()] || 0) - (n[a.toLowerCase()] || 0),
    )
    .slice(0, 6);
}

// the Tags editor in the selection bar: chips with ×, a box to add one, and the board's tags as suggestions
const addButton = (x: Suggest) => {
  const t = esc(nameOf(x));
  return `<button data-tagadd="${t}">#${t}</button>`;
};
export function tagEditor(c: Card) {
  const chip = (raw: string) => {
      const t = esc(raw);
      return `<span class="te-chip">#${t}<button data-tagx="${t}" title="Remove">×</button></span>`;
    },
    chips = (c.tags || []).map(chip).join('') || '<span class="te-none">No tags yet</span>',
    sug = tagSuggestions('', c.tags || [])
      .map(addButton)
      .join('');
  return (
    `<div class="te-chips">${chips}</div>` +
    `<input class="te-in" placeholder="Add a tag…" spellcheck="false" maxlength="30"><div class="te-sug">${sug}</div>`
  );
}

// on the note itself, while it is selected: each tag has a small × and a "+ tag" chip adds one (the toolbar's tag editor does the same, so you never have to leave the note)
const addTagBtn = (solo: boolean) => {
  const cls = solo ? ' solo' : '';
  return `<button type="button" class="nt-add${cls}" data-nt="add" aria-label="Add a tag" tabindex="-1">+ tag</button>`;
};

export const soloTagAdd = (c: Card) => (c.type === 'note' && !(c.tags || []).length ? addTagBtn(true) : '');
// no tags yet: the chip sits on the card's bottom edge, so selecting a note never changes its size
export function tagChips(c: Card) {
  const chip = (raw: string) => {
      const t = esc(raw);
      return `<i>#${t}<button type="button" class="nt-x" data-tagx="${t}" aria-label="Remove tag ${t}" tabindex="-1">×</button></i>`;
    },
    chips = (c.tags || []).map(chip).join(''),
    add = addTagBtn(false);
  return `<div class="ntags">${chips}${add}</div>`;
}

function refreshTagChips(c: Card) {
  const el = cardEl(c.id),
    b = el?.querySelector('.body');
  if (!el || !b) return;
  b.querySelector('.ntags')?.remove();
  el.querySelector(':scope > .nt-add')?.remove();
  if ((c.tags || []).length) b.insertAdjacentHTML('beforeend', tagChips(c));
  else if (c.type === 'note') el.insertAdjacentHTML('beforeend', soloTagAdd(c));
  fitText(c);
  const bar = $('selbar');
  if (bar && !bar.querySelector('.sb-popw.open')) bar.dataset.key = ''; // the toolbar's tag count follows
}

// an existing tag keeps its spelling: "UI" typed when the board has "ui" becomes "ui"
export const existingTag = (t: unknown) =>
  (session.board.tags || []).find(x => x.toLowerCase() === cleanTag(t).toLowerCase()) || cleanTag(t);

function addTag(c: Card, raw: unknown) {
  const t = existingTag(raw);
  if (!realTag(t)) return;
  c.tags = cleanTags([...(c.tags || []), t]);
  syncBoardTags();
  refreshTagChips(c);
  save();
}

function removeTag(c: Card, t: unknown) {
  c.tags = (c.tags || []).filter(x => x.toLowerCase() !== String(t).toLowerCase());
  if (!c.tags.length) delete c.tags;
  syncBoardTags();
  refreshTagChips(c);
  save();
}

// typing "#" in a note: suggestions from the board's tags; picking one (or a space after a new word) turns it into a tag, out of the words
const tagBox = (e: Event) => {
  const box = closestTo(e.target, '.sb-tags', HTMLElement);
  return box && { box, c: byId(box.dataset.for ?? '') };
};

const redrawTags = ({ box, c }: { box: HTMLElement; c: Card }) => {
  box.innerHTML = tagEditor(c);
  const n = (c.tags || []).length,
    b = $('selbar').querySelector('[data-pop="tags"] b');
  if (b) b.textContent = n ? String(n) : '';
  const input = box.querySelector('.te-in');
  if (input instanceof HTMLElement) input.focus();
};

let tagPop: HTMLElement | null = null;

function wireTagTyping(c: Card, t: HTMLElement) {
  if (wiredTags.has(t)) return;
  wiredTags.add(t);
  let items: Suggest[] = [],
    at = 0,
    token: Token | null = null,
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
    const node = sl?.anchorNode;
    if (!sl?.rangeCount || !(node instanceof Text) || !t.contains(node)) return null;
    const off = sl.anchorOffset,
      word = /(^|\s)#([\p{L}\p{N}_\-\/]*)$/u.exec(node.data.slice(0, off))?.[2];
    return word !== undefined ? { node, start: off - word.length - 1, end: off, word } : null;
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
    p.innerHTML = items.map((x, i) => suggestRow(x, i, at)).join('');
    const r = document.createRange();
    r.setStart(token.node, token.start);
    r.setEnd(token.node, token.end);
    const bx = r.getBoundingClientRect();
    p.style.left = bx.left + 'px';
    p.style.top = bx.bottom + 6 + 'px';
    p.classList.add('on');
    p.onmousedown = e => {
      e.preventDefault();
      const bt = closestTo(e.target, '[data-i]');
      if (bt) pick(items[Number(bt.dataset.i)]);
    };
  };
  const pick = (x: Suggest | undefined) => {
    if (!token || !x) return;
    const { node, start, end } = token,
      name = nameOf(x);
    node.data = node.data.slice(0, start) + node.data.slice(end).replace(/^ /, '');
    const r = document.createRange();
    r.setStart(node, Math.min(start, node.data.length));
    r.collapse(true);
    const sl = getSelection();
    sl?.removeAllRanges();
    sl?.addRange(r);
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
export function init15() {
  // the × and the + tag chip on a note: one set of handlers for every note; the "+" opens a small box with the board's tags as suggestions
  {
    let pop: HTMLElement | null = null;
    const closeAdd = () => {
      pop?.classList.remove('on');
    };
    function openTagAdd(c: Card, btn: Element) {
      const box = (pop ??= document.body.appendChild(
        Object.assign(document.createElement('div'), { className: 'tag-pop tag-add', id: 'tagAdd' }),
      ));
      box.innerHTML =
        '<input class="ta-in" type="text" maxlength="30" placeholder="Add a tag…" spellcheck="false" autocomplete="off" aria-label="Add a tag"><div class="ta-sug"></div>';
      const inp = child(box, 'input', HTMLInputElement),
        sug = child(box, '.ta-sug');
      let items: Suggest[] = [],
        at = 0;
      const draw = () => {
        const w = cleanTag(inp.value);
        items = tagSuggestions(inp.value, c.tags || []);
        if (realTag(w) && !(session.board.tags || []).some(x => x.toLowerCase() === w.toLowerCase()))
          items.push({ create: w });
        at = Math.min(at, Math.max(0, items.length - 1));
        sug.innerHTML = items.map((x, i) => suggestRow(x, i, at, ' type="button"')).join('');
      };
      const pick = (x: Suggest | null | undefined) => {
        if (!x) return;
        remember();
        addTag(c, nameOf(x));
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
        const b = closestTo(e.target, '[data-i]');
        if (b) pick(items[Number(b.dataset.i)]);
      };
      draw();
      const r = btn.getBoundingClientRect();
      box.classList.add('on');
      box.style.left = Math.max(8, Math.min(innerWidth - box.offsetWidth - 8, r.left)) + 'px';
      box.style.top = Math.min(innerHeight - box.offsetHeight - 8, r.bottom + 6) + 'px';
      setTimeout(() => inp.focus(), 30);
    }
    // the action runs on pointer-up (remembering what was pressed, not the element: the card may be redrawn between the press and the release, which would cancel a click)
    type Chip = { kind: 'x' | 'add'; card: string; tag: string };
    let down: Chip | null = null;
    const chipOf = (t: EventTarget | null): Chip | null => {
      const b = closestTo(t, '.card .nt-x, .card .nt-add'),
        card = closestTo(b, '.card');
      return b && card
        ? { kind: b.matches('.nt-x') ? 'x' : 'add', card: card.dataset.id ?? '', tag: b.dataset.tagx ?? '' }
        : null;
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
          if (pop?.classList.contains('on') && !closestTo(e.target, '#tagAdd')) closeAdd();
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
        } else {
          const at =
            cardsEl.querySelector(`[data-id="${c.id}"] .nt-add`) ?? (e.target instanceof Element ? e.target : null);
          if (at) openTagAdd(c, at);
        }
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
      const tb = tagBox(e),
        c = tb?.c;
      if (!tb || !c) return;
      const x = closestTo(e.target, '[data-tagx]'),
        a = closestTo(e.target, '[data-tagadd]');
      if (!x && !a) return;
      e.stopImmediatePropagation();
      if (x) removeTag(c, x.dataset.tagx);
      else addTag(c, a?.dataset.tagadd);
      redrawTags({ box: tb.box, c });
    },
    true,
  );

  $('selbar').addEventListener('keydown', e => {
    const input = e.target;
    if (!(input instanceof HTMLInputElement) || !input.matches('.te-in')) return;
    e.stopPropagation();
    const tb = tagBox(e),
      c = tb?.c;
    if (!tb || !c) return;
    const last = c.tags?.at(-1);
    if ((e.key === 'Enter' || e.key === ',') && input.value.trim()) {
      e.preventDefault();
      addTag(c, input.value);
      redrawTags({ box: tb.box, c });
    } else if (e.key === 'Backspace' && !input.value && last) {
      removeTag(c, last);
      redrawTags({ box: tb.box, c });
    }
  });

  $('selbar').addEventListener('input', e => {
    const input = e.target;
    if (!(input instanceof HTMLInputElement) || !input.matches('.te-in')) return;
    const tb = tagBox(e),
      list = tb?.box.querySelector('.te-sug');
    if (!tb?.c || !list) return;
    list.innerHTML = tagSuggestions(input.value, tb.c.tags || [])
      .map(addButton)
      .join('');
  });

  appState.lastTap = {};
}
