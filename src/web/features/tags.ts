import type { Card, CardOf } from '../../shared/model.ts';
import { byId } from '../canvas/wires.ts';
import { $ } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { appState, session } from '../core/state.ts';
import { keepEditedText } from '../edit/noteBody.ts';
import { fitText } from '../edit/text.ts';
import { cardEl, closestTo, esc } from '../ui/dom.ts';
import { initTagAdd } from './tagAdd.ts';

// a suggestion: one of the board's tags, or a new one to make
export type Suggest = string | { create: string };
type Token = { node: Text; start: number; end: number; word: string };
export const nameOf = (x: Suggest) => (typeof x === 'string' ? x : x.create);
export const suggestRow = (x: Suggest, i: number, at: number, attrs = '') => {
  const on = i === at ? 'on' : '',
    name = esc(nameOf(x)),
    label = typeof x === 'string' ? `#${name}` : `New tag <b>#${name}</b>`;
  return `<button${attrs} data-i="${i}" class="${on}">${label}</button>`;
};
// note text boxes already listening for tags
const wiredTags = new WeakSet<HTMLElement>();

// ---------- tags on notes: kept apart from the words. Each board keeps a list of its tags, which the suggestions come from ----------
export const cleanTag = (t: unknown) =>
  String(t || '')
    .replace(/^#+/, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_\-/]/gu, '')
    .slice(0, 30);

export const realTag = (t: string) => !!t && !/^\d+$/.test(t);
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

export function tagSuggestions(typed: unknown, exclude: string[] = []): Suggest[] {
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

export function addTag(c: Card, raw: unknown) {
  const t = existingTag(raw);
  if (!realTag(t)) return;
  c.tags = cleanTags([...(c.tags || []), t]);
  syncBoardTags();
  refreshTagChips(c);
  save();
}

export function removeTag(c: Card, t: unknown) {
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

export function wireTagTyping(c: CardOf<'note'>, t: HTMLElement) {
  if (wiredTags.has(t)) return;
  wiredTags.add(t);
  let items: Suggest[] = [],
    at = 0,
    token: Token | null = null,
    skip = -1;
  const pop = () =>
    tagPop ||
    (tagPop = document.body.appendChild(
      Object.assign(document.createElement('div'), {
        className: 'tag-pop',
        id: 'tagPop',
        role: 'listbox',
        ariaLabel: 'Tag suggestions',
      }),
    ));
  const close = () => {
    tagPop?.classList.remove('on');
    t.removeAttribute('aria-controls');
    t.removeAttribute('aria-activedescendant');
    token = null;
  };
  const tokenAtCaret = () => {
    const sl = getSelection();
    const node = sl?.anchorNode;
    if (!sl?.rangeCount || !(node instanceof Text) || !t.contains(node)) return null;
    const off = sl.anchorOffset,
      word = /(^|\s)#([\p{L}\p{N}_\-/]*)$/u.exec(node.data.slice(0, off))?.[2];
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
    p.innerHTML = items
      .map((x, i) => {
        const picked = i === at;
        return suggestRow(x, i, at, ` role="option" id="tagPop-${i}" aria-selected="${picked}"`);
      })
      .join('');
    // focus stays in the note, so the note points at the suggestion Enter would pick
    t.setAttribute('aria-controls', p.id);
    t.setAttribute('aria-activedescendant', `tagPop-${at}`);
    const r = document.createRange();
    r.setStart(token.node, token.start);
    r.setEnd(token.node, token.end);
    const bx = r.getBoundingClientRect();
    p.style.left = `${bx.left}px`;
    p.style.top = `${bx.bottom + 6}px`;
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
    keepEditedText(c, t);
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

export function init15() {
  initTagAdd();

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
