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
import { isLocalFont, onFrame, useFont } from '../wireframe/tilt.ts';
import { FONTS } from '../wireframe/wireframes.ts';
import { closeSbPops, focusBar, rebuildBar } from './barKit.ts';
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

const fontRow = (cur: string | null) => (f: string) => {
  const cls = f === cur ? 'on' : '',
    name = esc(f),
    where = isLocalFont(f) ? '' : '<small>Google Fonts</small>';
  return `<button type="button" class="dp-row dp-font ${cls}" data-bfont="${name}" style="font-family:'${name}', ${DOC_FONT}, system-ui">${name}${where}</button>`;
};

// any name the list doesn't have, offered as a Google font after the matches
const USE_ROW = '<button type="button" class="dp-row dp-use" hidden><span></span><small>Google Fonts</small></button>';

function showUse(pop: HTMLElement, typed: string, listed: boolean) {
  const use = oneIn(pop, '.dp-use'),
    said = use?.querySelector('span');
  if (!use || !said) return;
  use.hidden = !typed || listed;
  // one run of text, as the row spreads its parts apart
  said.textContent = `Use “${typed}”`;
  if (use.hidden) delete use.dataset.bfont;
  else use.dataset.bfont = typed;
}

// The one font list both pickers use. Clicking the same button again closes it. Returns null when it closed.
// defName: what the Default row is called when searching ('' when it never matches)
function fontShell(
  key: string,
  html: string,
  at: DOMRect,
  place: (p: HTMLElement, r: DOMRect) => void,
  defName: string,
) {
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
  q.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Escape') pop.hidden = true;
    if (e.key === 'Enter') oneIn(pop, '.dp-font:not([hidden]), .dp-use:not([hidden])')?.click();
  });
  q.addEventListener('input', () => {
    const typed = q.value.trim(),
      v = typed.toLowerCase(),
      rows = htmlIn(pop, '.dp-font');
    rows.forEach(b => {
      b.hidden = !!v && !(b.dataset.bfont || defName).toLowerCase().includes(v);
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
  setTimeout(() => q.focus(), 30);
  return { pop, q };
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
      .slice(0, 400)
      .map(row)
      .join('');
  const shell = fontShell(
    list.map(c => c.id).join(),
    `<input class="dp-search" placeholder="Search fonts…" aria-label="Search fonts" autocomplete="off" spellcheck="false">
      <div class="dp-scroll"><button type="button" class="dp-row dp-font ${defCls}" data-bfont="">Default font<small>Fenmyr’s own</small></button>
      ${used}<div class="dp-h">Suggested</div>${suggested}
      <div class="dp-h">On your computer</div>${local}${USE_ROW}</div>`,
    btn.getBoundingClientRect(),
    (p, r) => {
      p.style.zIndex = '';
      p.style.left = `${Math.max(10, Math.min(innerWidth - 270, r.left + r.width / 2 - 130))}px`;
      if (r.top > innerHeight / 2) p.style.bottom = `${innerHeight - r.top + 8}px`;
      else p.style.top = `${r.bottom + 8}px`;
    },
    '',
  );
  if (!shell) return;
  SUGGESTED_FONTS.concat(onBoard).forEach(useFont);
  const { pop, q } = shell;
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
  q.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    restore();
    goBack();
  });
  pop.onmouseover = e => {
    const f = closestTo(e.target, '[data-bfont]')?.dataset.bfont;
    if (f !== undefined) preview(f);
  };
  pop.onmouseleave = restore;
  pop.onclick = e => {
    const f = closestTo(e.target, '[data-bfont]')?.dataset.bfont;
    if (f === undefined) return;
    previewed = false;
    remember();
    list.forEach(c => {
      if (f) c.font = f;
      else delete c.font;
      useFont(f);
      renderCard(c);
    });
    pop.hidden = true;
    rebuildBar();
    selectOnly(selCards().map(c => c.id));
    save();
    // a pick made with Enter (a click with no pointer) gives the keyboard back to the bar
    if (e.detail === 0) goBack();
  };
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
      .slice(0, 400)
      .map(row)
      .join('');
  const shell = fontShell(
    'default',
    `<input class="dp-search" placeholder="Search fonts…" aria-label="Search fonts" autocomplete="off" spellcheck="false">
      <div class="dp-scroll"><button type="button" class="dp-row dp-font ${defCls}" data-bfont="">${DOC_FONT}<small>Fenmyr’s own</small></button>
      <div class="dp-h">Suggested</div>${suggested}
      <div class="dp-h">On your computer</div>${local}${USE_ROW}</div>`,
    btn.getBoundingClientRect(),
    (p, r) => {
      p.style.zIndex = '120'; // above the Settings window
      p.style.left = `${Math.max(10, Math.min(innerWidth - 270, r.right - 260))}px`;
      p.style.top = innerHeight - r.bottom > 340 ? `${r.bottom + 8}px` : `${Math.max(10, r.top - 8 - 330)}px`;
    },
    DOC_FONT,
  );
  if (!shell) return;
  SUGGESTED_FONTS.forEach(useFont);
  const { pop } = shell;
  pop.onmouseover = null;
  pop.onmouseleave = null;
  pop.onclick = e => {
    const f = closestTo(e.target, '[data-bfont]')?.dataset.bfont;
    if (f === undefined) return;
    settings.defaultFont = f;
    applySettings();
    pop.hidden = true;
  };
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
