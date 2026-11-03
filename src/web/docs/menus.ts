import { clamp } from '../core/base.ts';
import { $ } from '../core/dom.ts';
import { DICON, liveEditor, pagePref } from './editor.ts';
import { BLOCKS, DOC_FONT, SUGGESTED_FONTS, docDefault, fontName } from './docText.ts';
import { rewrite } from './rewrite.ts';
import { blockOf } from './toolbar.ts';
import { boardFonts } from '../selbar/fontPop.ts';
import { isLocalFont, useFont } from '../wireframe/tilt.ts';
import { session } from '../core/state.ts';
import { elementById, esc, htmlIn } from '../ui/dom.ts';
import {
  colorMarkup,
  exportMarkup,
  fontListMarkup,
  linkMarkup,
  moreMarkup,
  myraMarkup,
  pageMarkup,
} from './popMarkup.ts';

const LIST_NODES: Record<string, string> = { bullet: 'bulletList', ordered: 'orderedList', task: 'taskList' };
const FOLD_TITLES: Record<string, string> = {
  bullet: 'Bulleted list',
  ordered: 'Numbered list',
  task: 'Checklist',
  image: 'Add a picture',
  undo: 'Undo',
  redo: 'Redo',
};
const ALIGN_TITLES: Record<string, string> = { left: 'Left', center: 'Centre', right: 'Right', justify: 'Justify' };
const on = (yes: unknown) => (yes ? 'on' : '');
// a typed link, shown without its https://
const linkHTML = (v: string) => {
  const href = esc(v),
    shown = esc(v.replace(/^https?:\/\//, ''));
  return `<a href="${href}">${shown}</a> `;
};

// ---------- the drop-down menus ----------
let popKind: string | null = null;

export function hidePop() {
  $('dvPop').hidden = true;
  popKind = null;
  document.querySelectorAll('.dt-b.open, .dt-myra.open').forEach(b => b.classList.remove('open'));
}

export function showPop(kind: string, btn: Element | null) {
  if (popKind === kind && !$('dvPop').hidden) return hidePop();
  hidePop();
  if (!btn) return;
  const ed = liveEditor();
  popKind = kind;
  btn.classList.add('open');
  const p = $('dvPop');
  p.className = 'dv-pop pop-' + kind;
  const swatches = (list: string[], cur: unknown, attr: string) =>
    list
      .map(h => {
        const state = on(String(cur || '').toLowerCase() === h.toLowerCase()),
          name = h.toUpperCase();
        return `<button type="button" class="dp-sw ${state}" ${attr}="${h}" style="--sw:${h}" title="${name}" aria-label="${name}"></button>`;
      })
      .join('');
  const boardCols = [
    ...new Set(
      (session.board.palette || [])
        .map(x => x.hex)
        .concat(session.board.cards.flatMap(c => (c.type === 'swatch' ? [c.hex] : []))),
    ),
  ].slice(0, 14);
  if (kind === 'style') {
    const k = blockOf();
    p.innerHTML = BLOCKS.map(([id, name]) => {
      const state = on(id === k);
      return `<button type="button" class="dp-row dp-st st-${id} ${state}" data-block="${id}">${name}</button>`;
    }).join('');
  } else if (kind === 'font') {
    const cur = fontName(ed.getAttributes('textStyle').fontFamily) || docDefault();
    const onBoard = boardFonts();
    const row = (f: string) => {
      const state = on(f === cur),
        name = esc(f),
        where = isLocalFont(f) ? '' : '<small>Google Fonts</small>';
      return `<button type="button" class="dp-row dp-font ${state}" data-font="${name}" style="font-family:'${name}', ${DOC_FONT}, system-ui">${name}${where}</button>`;
    };
    p.innerHTML = fontListMarkup(onBoard, row);
    SUGGESTED_FONTS.concat(onBoard).forEach(useFont);
    const q = elementById('dpFontQ', HTMLInputElement);
    q.addEventListener('keydown', e => e.stopPropagation());
    q.addEventListener('input', () => {
      const v = q.value.trim().toLowerCase();
      for (const b of htmlIn(p, '.dp-font')) b.hidden = !!v && !(b.dataset.font ?? '').toLowerCase().includes(v);
      for (const h of htmlIn(p, '.dp-h')) h.hidden = !!v;
    });
    setTimeout(() => q.focus(), 30);
  } else if (kind === 'color' || kind === 'hl') {
    const isHl = kind === 'hl',
      cur = isHl ? ed.getAttributes('highlight').color : ed.getAttributes('textStyle').color;
    p.innerHTML = colorMarkup(kind, isHl, boardCols, cur, swatches);
  } else if (kind === 'align') {
    const set = ['center', 'right', 'justify'].find(x => ed.isActive({ textAlign: x })) ?? 'left',
      icon = (a: string) => {
        const state = on(a === set),
          title = ALIGN_TITLES[a],
          pic = DICON[a];
        return `<button type="button" class="dp-ic ${state}" data-align="${a}" title="${title}">${pic}</button>`;
      },
      icons = ['left', 'center', 'right', 'justify'].map(icon).join('');
    p.innerHTML = `<div class="dp-icons">${icons}</div>`;
  } else if (kind === 'link') {
    const href = String(ed.getAttributes('link').href || '');
    p.innerHTML = linkMarkup(href);
    const inp = elementById('dpLinkIn', HTMLInputElement);
    inp.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        hidePop();
        ed.commands.focus();
      }
    });
    elementById('dpLink', HTMLFormElement).onsubmit = e => {
      e.preventDefault();
      let v = inp.value.trim();
      if (!v) {
        ed.chain().focus().extendMarkRange('link').unsetLink().run();
        return hidePop();
      }
      if (!/^(https?:|mailto:|tel:)/i.test(v)) v = 'https://' + v;
      if (ed.state.selection.empty && !ed.isActive('link')) ed.chain().focus().insertContent(linkHTML(v)).run();
      else ed.chain().focus().extendMarkRange('link').setLink({ href: v }).run();
      hidePop();
    };
    setTimeout(() => inp.focus(), 30);
  } else if (kind === 'more') {
    const lh = ed.getAttributes('paragraph').lineHeight || ed.getAttributes('heading').lineHeight || '';
    const inTable = ed.isActive('table');
    const folded = htmlIn($('dvTools'), '.dt-fold[hidden]').map(b => b.dataset.c || b.dataset.pop || '');
    const alignIcon = (a: string) => {
        const state = on(ed.isActive({ textAlign: a })),
          title = (ALIGN_TITLES[a] ?? a).toLowerCase(),
          pic = DICON[a];
        return `<button type="button" class="dp-ic ${state}" data-align="${a}" title="Align ${title}">${pic}</button>`;
      },
      linkIcon = () => {
        const state = on(ed.isActive('link')),
          pic = DICON.link;
        return `<button type="button" class="dp-ic ${state}" data-flink="1" title="Link">${pic}</button>`;
      },
      toolIcon = (k: string) => {
        const node = LIST_NODES[k],
          state = on(node && ed.isActive(node)),
          title = FOLD_TITLES[k],
          pic = DICON[k];
        return `<button type="button" class="dp-ic ${state}" data-c2="${k}" title="${title}">${pic}</button>`;
      };
    const foldIcons = folded
      .flatMap(k =>
        k === 'align'
          ? ['left', 'center', 'right', 'justify'].map(alignIcon)
          : k === 'link'
            ? [linkIcon()]
            : [toolIcon(k)],
      )
      .join('');
    p.innerHTML = moreMarkup(foldIcons, String(lh), inTable);
  } else if (kind === 'page') {
    const cur = pagePref();
    p.innerHTML = pageMarkup(cur);
  } else if (kind === 'export') {
    const paper = (() => {
      try {
        return localStorage.getItem('fenmyr:paper') || 'letter';
      } catch (e) {
        return 'letter';
      }
    })();
    p.innerHTML = exportMarkup(paper);
  } else if (kind === 'myra') {
    const has = !ed.state.selection.empty;
    p.innerHTML = myraMarkup(has);
    const ask = document.getElementById('dpAskIn'),
      form = document.getElementById('dpAsk');
    if (ask instanceof HTMLInputElement && form) {
      ask.addEventListener('keydown', e => e.stopPropagation());
      form.onsubmit = e => {
        e.preventDefault();
        const v = ask.value.trim();
        if (v) rewrite(v);
      };
    }
  }
  // place it under its button, inside the doc panel
  p.hidden = false;
  const dv = $('docview').getBoundingClientRect(),
    r = btn.getBoundingClientRect();
  const w = p.offsetWidth,
    h = p.offsetHeight;
  let x = r.left - dv.left,
    y = r.bottom - dv.top + 8;
  if (y + h > dv.height - 10) y = Math.max(10, r.top - dv.top - h - 8);
  p.style.left = clamp(x, 10, dv.width - w - 10) + 'px';
  p.style.top = y + 'px';
}
