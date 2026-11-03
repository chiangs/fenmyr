import type { Card } from '../../shared/model.ts';
import { byId } from '../canvas/wires.ts';
import { cardsEl } from '../core/dom.ts';
import { remember } from '../core/history.ts';
import { session } from '../core/state.ts';
import { child, closestTo } from '../ui/dom.ts';

import { addTag, cleanTag, nameOf, realTag, removeTag, type Suggest, suggestRow, tagSuggestions } from './tags.ts';

// the × and the + tag chip on a note: one set of handlers for every note; the "+" opens a small box with the board's tags as suggestions
export function initTagAdd() {
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
    box.style.left = `${Math.max(8, Math.min(innerWidth - box.offsetWidth - 8, r.left))}px`;
    box.style.top = `${Math.min(innerHeight - box.offsetHeight - 8, r.bottom + 6)}px`;
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
