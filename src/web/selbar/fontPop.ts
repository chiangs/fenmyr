import type { Card } from '../../shared/model.ts';
import { renderCard } from '../canvas/render.ts';
import { selectOnly } from '../canvas/wires.ts';
import { $ } from '../core/dom.ts';
import { remember, save } from '../core/history.ts';
import { DOC_FONT, SUGGESTED_FONTS } from '../docs/docText.ts';
import { settings } from '../settings/settings.ts';
import { applySettings } from '../settings/widgets.ts';
import { closeOnOutsidePress } from '../ui/popover.ts';
import { cardEl, closestTo, esc, htmlIn, oneIn } from '../ui/dom.ts';
import { isLocalFont, useFont } from '../wireframe/tilt.ts';
import { FONTS } from '../wireframe/wireframes.ts';
import { session } from '../core/state.ts';
import { rebuildBar } from './barKit.ts';

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
    ['pointerdown', 'mousedown', 'wheel', 'dblclick'].forEach(t =>
      made.addEventListener(t, e => e.stopPropagation(), { passive: true }),
    );
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
    if (e.key === 'Enter') oneIn(pop, '.dp-font:not([hidden])')?.click();
  });
  q.addEventListener('input', () => {
    const v = q.value.trim().toLowerCase();
    htmlIn(pop, '.dp-font').forEach(b => (b.hidden = !!v && !(b.dataset.bfont || defName).toLowerCase().includes(v)));
    htmlIn(pop, '.dp-h').forEach(h => (h.hidden = !!v));
  });
  setTimeout(() => q.focus(), 30);
  return { pop, q };
}

// the font for the selected notes, titles and other text: hover to preview on the cards, click to keep
export function boardFontPop(btn: Element, list: Card[]) {
  const first = list[0];
  if (!first) return;
  const cur = list.every(c => (c.font || '') === (first.font || '')) ? first.font || '' : null,
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
    `<input class="dp-search" placeholder="Search fonts…" autocomplete="off" spellcheck="false">
      <div class="dp-scroll"><button type="button" class="dp-row dp-font ${defCls}" data-bfont="">Default font<small>Fenmyr’s own</small></button>
      ${used}<div class="dp-h">Suggested</div>${suggested}
      <div class="dp-h">On your computer</div>${local}</div>`,
    btn.getBoundingClientRect(),
    (p, r) => {
      p.style.zIndex = '';
      p.style.left = Math.max(10, Math.min(innerWidth - 270, r.left + r.width / 2 - 130)) + 'px';
      if (r.top > innerHeight / 2) p.style.bottom = innerHeight - r.top + 8 + 'px';
      else p.style.top = r.bottom + 8 + 'px';
    },
    '',
  );
  if (!shell) return;
  SUGGESTED_FONTS.concat(onBoard).forEach(useFont);
  const { pop, q } = shell;
  const preview = (f?: string) =>
    list.forEach(c => {
      const el = cardEl(c.id),
        v = f === undefined ? c.font : f;
      if (!el) return;
      el.classList.toggle('has-font', !!v);
      if (v) {
        useFont(v);
        el.style.setProperty('--cf', `"${v.replace(/"/g, '')}"`);
      } else el.style.removeProperty('--cf');
    });
  q.addEventListener('keydown', e => {
    if (e.key === 'Escape') preview();
  });
  pop.onmouseover = e => {
    const f = closestTo(e.target, '[data-bfont]')?.dataset.bfont;
    if (f !== undefined) preview(f);
  };
  pop.onmouseleave = () => preview();
  pop.onclick = e => {
    const f = closestTo(e.target, '[data-bfont]')?.dataset.bfont;
    if (f === undefined) return;
    remember();
    list.forEach(c => {
      if (f) c.font = f;
      else delete c.font;
      renderCard(c);
    });
    pop.hidden = true;
    rebuildBar();
    selectOnly(list.map(c => c.id));
    save();
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
    `<input class="dp-search" placeholder="Search fonts…" autocomplete="off" spellcheck="false">
      <div class="dp-scroll"><button type="button" class="dp-row dp-font ${defCls}" data-bfont="">${DOC_FONT}<small>Fenmyr’s own</small></button>
      <div class="dp-h">Suggested</div>${suggested}
      <div class="dp-h">On your computer</div>${local}</div>`,
    btn.getBoundingClientRect(),
    (p, r) => {
      p.style.zIndex = '120'; // above the Settings window
      p.style.left = Math.max(10, Math.min(innerWidth - 270, r.right - 260)) + 'px';
      p.style.top = innerHeight - r.bottom > 340 ? r.bottom + 8 + 'px' : Math.max(10, r.top - 8 - 330) + 'px';
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
  closeOnOutsidePress('#fontPop, [data-sbfont]', () => {
    const p = document.getElementById('fontPop');
    if (p) p.hidden = true;
  });

  $('defaultFontBtn').onclick = e => {
    e.stopPropagation();
    if (e.currentTarget instanceof Element) defaultFontPop(e.currentTarget);
  };
}
