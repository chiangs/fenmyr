import { typesWith } from '../../shared/cardTypes.ts';
import type { Card } from '../../shared/model.ts';
import { renderCard } from '../canvas/render.ts';
import { selectOnly } from '../canvas/wires.ts';
import { $ } from '../core/dom.ts';
import { remember, save } from '../core/history.ts';
import { session } from '../core/state.ts';
import { DOC_FONT, SUGGESTED_FONTS } from '../docs/docText.ts';
import { settings } from '../settings/settings.ts';
import { applySettings } from '../settings/widgets.ts';
import { cardEl, closestTo, esc, htmlIn, oneIn } from '../ui/dom.ts';
import { closeOnOutsidePress } from '../ui/popover.ts';
import { isLocalFont, loadFont, onFrame, useFont } from '../wireframe/tilt.ts';
import { FONTS } from '../wireframe/wireframes.ts';
import { closeSbPops, focusBar, rebuildBar } from './barKit.ts';
import { showUse, USE_NOTE, USE_ROW, useTyped } from './fontUse.ts';
import { onBar } from './group.ts';
import { selCards } from './selected.ts';

const FONTABLE = typesWith('fontable'),
  SIZED = typesWith('sized');

/** What a font pick changes: every text on a selected screen, and every other selected card that takes a font. */
export function fontTargets(cs: readonly Card[]): Card[] {
  const all = cs.flatMap(c => {
    if (c.type === 'frame') return onFrame(c).filter(k => k.type === 'text');
    return FONTABLE.includes(c.type) ? [c] : [];
  });
  return [...new Set(all)];
}

// the font a card shows: its own, else Figtree for wireframe text and font cards, else the board's default ('')
const fontOf = (c: Card) => c.font || (SIZED.includes(c.type) ? '' : 'Figtree');

/** The font every one of these shows, or null when they differ. */
function sharedFont(cs: readonly Card[]) {
  const first = cs[0] ? fontOf(cs[0]) : '';
  return cs.every(c => fontOf(c) === first) ? first : null;
}

/** What a Font button or row says for these cards, and the style that shows it in that font. */
export function fontLabel(cs: readonly Card[]) {
  const f = sharedFont(cs);
  return {
    name: f === null ? 'Mixed fonts' : esc(f || 'Default font'),
    style: f ? `font-family:'${esc(f)}', var(--font)` : '',
  };
}

/** The bar's Font button: it opens the font picker for `fontTargets` of the selection. */
export function fontButton(cs: readonly Card[]) {
  const { name, style } = fontLabel(cs),
    caret = Icon('caret-down', { cls: 'sb-caret', size: 10 }),
    read = `Font, ${name}`;
  return `<button class="sb-txt sb-font" data-sbfont="1" title="Font" aria-label="${read}" aria-haspopup="dialog"><span style="${style}">${name}</span>${caret}</button>`;
}

// every font this board uses: picked for notes and titles, wireframe text, font cards, and fonts set inside docs (most used first)
export function boardFonts() {
  const n = new Map<string, number>(),
    add = (raw: string) => {
      const f = raw.replace(/^["']|["']$/g, '').trim();
      if (f && !/^(system-ui|sans-serif|serif|monospace|inherit|-apple-system)$/i.test(f))
        n.set(f, (n.get(f) || 0) + 1);
    };
  session.board.cards.forEach(c => {
    if (c.font) add(c.font);
    if (c.type === 'doc' && c.doc)
      for (const m of JSON.stringify(c.doc).matchAll(/"fontFamily":"([^"]+)"/g)) add((m[1] ?? '').split(',')[0] ?? '');
  });
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f);
}

// Every font on this computer is in the list, but no more than 400 show at once, as each row shown loads its font.
// Past the first 400, a search finds them.
const LOCAL_SHOWN = 400;

// local: a font on this computer, the i-th of them
const fontRow =
  (cur: string | null, local = false) =>
  (f: string, i = 0) => {
    const on = f === cur ? 'on' : '',
      cls = local ? `${on} dp-local` : on,
      hide = local && i >= LOCAL_SHOWN ? ' hidden' : '',
      name = esc(f),
      where = isLocalFont(f) ? '' : '<small>Google Fonts</small>';
    return `<button type="button" class="dp-row dp-font ${cls}"${hide} data-bfont="${name}" style="font-family:'${name}', ${DOC_FONT}, system-ui">${name}${where}</button>`;
  };

// The one font list both pickers use, and what a pick does in it. A row picked lands at once; the Use row's name
// lands once Google Fonts sends it. Clicking the same button again closes it. Returns null when it closed.
type Shell = {
  key: string;
  html: string;
  at: DOMRect;
  place: (p: HTMLElement, r: DOMRect) => void;
  // what the Default row is called when searching ('' when it never matches)
  defName: string;
  // keyed: picked with the keyboard (a click with no pointer)
  pick: (f: string, keyed: boolean) => void;
  // after Esc closed it: the keyboard goes back to the button that opened it
  back: () => void;
};
function fontShell({ key, html, at, place, defName, pick, back }: Shell) {
  let p = document.getElementById('fontPop');
  if (p && !p.hidden && p.dataset.for === key) {
    p.hidden = true;
    return null;
  }
  if (!p) {
    const made = document.createElement('div');
    made.id = 'fontPop';
    made.className = 'dv-pop pop-font board-font';
    document.body.appendChild(made);
    ['pointerdown', 'mousedown', 'wheel', 'dblclick'].forEach(t => {
      made.addEventListener(t, e => e.stopPropagation(), { passive: true });
    });
    p = made;
  }
  const pop = p;
  pop.dataset.for = key;
  pop.innerHTML = html;
  pop.hidden = false;
  pop.style.position = 'fixed';
  pop.style.width = '260px';
  pop.style.top = pop.style.bottom = '';
  place(pop, at);
  const q = pop.querySelector('.dp-search');
  if (!(q instanceof HTMLInputElement)) return null;
  // a key pressed anywhere in it stays in it, as Esc would otherwise clear the selection too
  pop.onkeydown = e => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      pop.hidden = true;
      back();
    }
    if (e.key === 'Enter' && e.target === q) oneIn(pop, '.dp-font:not([hidden]), .dp-use:not([hidden])')?.click();
    // ↓ and ↑ walk the rows shown and round to the search, so ↑ from the search reaches the last row: the Use row,
    // when the name typed is no listed font's
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const stops = [q, ...htmlIn(pop, '.dp-font, .dp-use').filter(b => !b.hidden)],
        at = stops.findIndex(b => b === document.activeElement),
        by = e.key === 'ArrowDown' ? 1 : -1;
      stops[(at + by + stops.length) % stops.length]?.focus();
    }
  };
  q.addEventListener('input', () => {
    const typed = q.value.trim(),
      v = typed.toLowerCase(),
      rows = htmlIn(pop, '.dp-font');
    let local = 0;
    rows.forEach(b => {
      const hit = !v || (b.dataset.bfont || defName).toLowerCase().includes(v);
      b.hidden = !hit || (b.classList.contains('dp-local') && ++local > LOCAL_SHOWN);
    });
    htmlIn(pop, '.dp-h').forEach(h => {
      h.hidden = !!v;
    });
    showUse(
      pop,
      typed,
      rows.some(b => (b.dataset.bfont || defName).toLowerCase() === v),
    );
  });
  pop.onclick = e => {
    const row = closestTo(e.target, '[data-bfont]'),
      f = row?.dataset.bfont,
      keyed = e.detail === 0;
    if (!row || f === undefined) return;
    const done = (name: string) => {
      pop.hidden = true;
      pick(name, keyed);
    };
    if (row.classList.contains('dp-use')) useTyped(pop, f, done);
    else done(f);
  };
  setTimeout(() => q.focus(), 30);
  return pop;
}

// the font for the selected notes, titles, wireframe text and font cards: hover to preview on the cards, click to keep.
// `back` names the bar control the keyboard returns to once a pick or Esc closes it.
function boardFontPop(btn: Element, list: Card[], back: string) {
  if (!list.length) return;
  const cur = sharedFont(list),
    onBoard = boardFonts(),
    row = fontRow(cur),
    defCls = cur === '' ? 'on' : '',
    boardRows = onBoard.map(row).join(''),
    used = onBoard.length ? `<div class="dp-h">Used on this board</div>${boardRows}` : '',
    suggested = SUGGESTED_FONTS.filter(f => !onBoard.includes(f))
      .map(row)
      .join(''),
    local = FONTS.filter(f => !SUGGESTED_FONTS.includes(f) && !onBoard.includes(f))
      .map(fontRow(cur, true))
      .join('');
  let previewed = false;
  // a font shows on every card by the class that forces it; Default shows Figtree on a card that has no board default
  const preview = (f: string) => {
    previewed = true;
    list.forEach(c => {
      const el = cardEl(c.id),
        v = f || (SIZED.includes(c.type) ? '' : 'Figtree');
      if (!el) return;
      el.classList.toggle('has-font', !!v);
      if (v) {
        useFont(v);
        el.style.setProperty('--cf', `"${v.replace(/"/g, '')}"`);
      } else el.style.removeProperty('--cf');
    });
  };
  // drawing each card again puts back exactly what it had, whatever its kind
  const restore = () => {
    if (!previewed) return;
    previewed = false;
    list.forEach(c => {
      renderCard(c);
    });
    selectOnly(selCards().map(c => c.id));
  };
  const goBack = () => requestAnimationFrame(() => focusBar(back));
  const pop = fontShell({
    key: list.map(c => c.id).join(),
    html: `<input class="dp-search" placeholder="Search fonts…" aria-label="Search fonts" autocomplete="off" spellcheck="false">${USE_NOTE}
      <div class="dp-scroll"><button type="button" class="dp-row dp-font ${defCls}" data-bfont="">Default font<small>Fenmyr’s own</small></button>
      ${used}<div class="dp-h">Suggested</div>${suggested}
      <div class="dp-h">On your computer</div>${local}${USE_ROW}</div>`,
    at: btn.getBoundingClientRect(),
    place: (p, r) => {
      p.style.zIndex = '';
      p.style.left = `${Math.max(10, Math.min(innerWidth - 270, r.left + r.width / 2 - 130))}px`;
      if (r.top > innerHeight / 2) p.style.bottom = `${innerHeight - r.top + 8}px`;
      else p.style.top = `${r.bottom + 8}px`;
    },
    defName: '',
    pick: (f, keyed) => {
      previewed = false;
      remember();
      // a font that failed earlier, offline say, is asked for again
      loadFont(f, true);
      list.forEach(c => {
        if (f) c.font = f;
        else delete c.font;
        renderCard(c);
      });
      rebuildBar();
      selectOnly(selCards().map(c => c.id));
      save();
      if (keyed) goBack();
    },
    back: () => {
      restore();
      goBack();
    },
  });
  if (!pop) return;
  SUGGESTED_FONTS.concat(onBoard).forEach(useFont);
  pop.onmouseover = e => {
    const f = closestTo(e.target, '[data-bfont]')?.dataset.bfont;
    if (f !== undefined) preview(f);
  };
  pop.onmouseleave = restore;
}

// Settings → Board → Default font: the same list as the font picker, applied to every board
function defaultFontPop(btn: Element) {
  const cur = (settings.defaultFont || '').trim(),
    row = fontRow(cur),
    defCls = cur === '' ? 'on' : '',
    suggested = SUGGESTED_FONTS.filter(f => f !== DOC_FONT)
      .map(row)
      .join(''),
    local = FONTS.filter(f => !SUGGESTED_FONTS.includes(f))
      .map(fontRow(cur, true))
      .join('');
  const pop = fontShell({
    key: 'default',
    html: `<input class="dp-search" placeholder="Search fonts…" aria-label="Search fonts" autocomplete="off" spellcheck="false">${USE_NOTE}
      <div class="dp-scroll"><button type="button" class="dp-row dp-font ${defCls}" data-bfont="">${DOC_FONT}<small>Fenmyr’s own</small></button>
      <div class="dp-h">Suggested</div>${suggested}
      <div class="dp-h">On your computer</div>${local}${USE_ROW}</div>`,
    at: btn.getBoundingClientRect(),
    place: (p, r) => {
      p.style.zIndex = '120'; // above the Settings window
      p.style.left = `${Math.max(10, Math.min(innerWidth - 270, r.right - 260))}px`;
      p.style.top = innerHeight - r.bottom > 340 ? `${r.bottom + 8}px` : `${Math.max(10, r.top - 8 - 330)}px`;
    },
    defName: DOC_FONT,
    pick: f => {
      settings.defaultFont = f;
      applySettings();
    },
    back: () => {
      if (btn instanceof HTMLElement) btn.focus();
    },
  });
  if (!pop) return;
  SUGGESTED_FONTS.forEach(useFont);
  pop.onmouseover = null;
  pop.onmouseleave = null;
}

export function initFontPop() {
  const pop = () => document.getElementById('fontPop');
  closeOnOutsidePress(
    '#fontPop, [data-sbfont]',
    () => pop()?.hidden === false,
    () => {
      const p = pop();
      if (p) p.hidden = true;
    },
  );

  // a Font row inside a dropdown opens the picker from that dropdown's button, and the dropdown closes
  onBar('sbfont', (_, cs, el) => {
    const trig = el.closest('.sb-popw')?.querySelector<HTMLElement>(':scope > [data-pop]'),
      back = trig ? `[data-pop="${trig.dataset.pop}"]` : '[data-sbfont]';
    boardFontPop(trig ?? el, fontTargets(cs), back);
    if (trig) closeSbPops();
  });

  $('defaultFontBtn').onclick = e => {
    e.stopPropagation();
    if (e.currentTarget instanceof Element) defaultFontPop(e.currentTarget);
  };
}
