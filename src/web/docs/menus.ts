// @ts-nocheck
import { closeOnOutsidePress } from '../ui/popover.ts';
import { esc } from '../ui/dom.ts';
import { clamp } from '../core/base.ts';
import { $ } from '../core/dom.ts';
import {
  BLOCKS,
  DICON,
  DOC_FONT,
  HIGHLIGHTS,
  SUGGESTED_FONTS,
  TEXT_COLORS,
  applyDocPage,
  docDefault,
  ed,
  fontName,
  pagePref,
} from './editor.ts';
import { rewrite } from './rewrite.ts';
import { blockOf, run, setBlock } from './toolbar.ts';
import { downloadPDF, downloadWord } from './word.ts';
import { boardFonts } from '../selbar/selbar.ts';
import { openColor } from '../ui/colorPicker.ts';
import { isLocalFont, useFont } from '../wireframe/tilt.ts';
import { FONTS } from '../wireframe/wireframes.ts';
import { session } from '../core/state.ts';

// ---------- the drop-down menus ----------
let popKind = null;

export function hidePop() {
  $('dvPop').hidden = true;
  popKind = null;
  document.querySelectorAll('.dt-b.open, .dt-myra.open').forEach(b => b.classList.remove('open'));
}

export function showPop(kind, btn) {
  if (popKind === kind && !$('dvPop').hidden) return hidePop();
  hidePop();
  popKind = kind;
  btn.classList.add('open');
  const p = $('dvPop');
  p.className = 'dv-pop pop-' + kind;
  const swatches = (list, cur, attr) =>
    list
      .map(
        h =>
          `<button type="button" class="dp-sw ${cur && cur.toLowerCase() === h.toLowerCase() ? 'on' : ''}" ${attr}="${h}" style="--sw:${h}" title="${h.toUpperCase()}" aria-label="${h.toUpperCase()}"></button>`,
      )
      .join('');
  const boardCols = [
    ...new Set(
      (session.board.palette || [])
        .map(x => x.hex)
        .concat(session.board.cards.filter(c => c.type === 'swatch').map(c => c.hex)),
    ),
  ].slice(0, 14);
  if (kind === 'style') {
    const k = blockOf();
    p.innerHTML = BLOCKS.map(
      ([id, name]) =>
        `<button type="button" class="dp-row dp-st st-${id} ${id === k ? 'on' : ''}" data-block="${id}">${name}</button>`,
    ).join('');
  } else if (kind === 'font') {
    const cur = fontName(ed.getAttributes('textStyle').fontFamily) || docDefault();
    const onBoard = boardFonts();
    const row = f =>
      `<button type="button" class="dp-row dp-font ${f === cur ? 'on' : ''}" data-font="${esc(f)}" style="font-family:'${esc(f)}', ${DOC_FONT}, system-ui">${esc(f)}${isLocalFont(f) ? '' : '<small>Google Fonts</small>'}</button>`;
    p.innerHTML = `<input class="dp-search" id="dpFontQ" placeholder="Search fonts…" autocomplete="off" spellcheck="false">
        <div class="dp-scroll" id="dpFontList">${onBoard.length ? `<div class="dp-h">Used on this board</div>${onBoard.map(row).join('')}` : ''}<div class="dp-h">Suggested</div>${SUGGESTED_FONTS.filter(
          f => !onBoard.includes(f),
        )
          .map(row)
          .join('')}
        <div class="dp-h">On your computer</div>${FONTS.filter(
          f => !SUGGESTED_FONTS.includes(f) && !onBoard.includes(f),
        )
          .slice(0, 400)
          .map(row)
          .join('')}</div>`;
    SUGGESTED_FONTS.concat(onBoard).forEach(useFont);
    const q = $('dpFontQ');
    q.addEventListener('keydown', e => e.stopPropagation());
    q.addEventListener('input', () => {
      const v = q.value.trim().toLowerCase();
      p.querySelectorAll('.dp-font').forEach(b => (b.hidden = !!v && !b.dataset.font.toLowerCase().includes(v)));
      p.querySelectorAll('.dp-h').forEach(h => (h.hidden = !!v));
    });
    setTimeout(() => q.focus(), 30);
  } else if (kind === 'color' || kind === 'hl') {
    const isHl = kind === 'hl',
      cur = isHl ? ed.getAttributes('highlight').color : ed.getAttributes('textStyle').color;
    p.innerHTML = `<button type="button" class="dp-row dp-none" data-${isHl ? 'hl' : 'tc'}="">${isHl ? 'No highlight' : 'Default colour'}</button>
        ${boardCols.length ? `<div class="dp-h">Board colours</div><div class="dp-grid">${swatches(boardCols, cur, isHl ? 'data-hl' : 'data-tc')}</div>` : ''}
        <div class="dp-h">${isHl ? 'Highlighters' : 'Colours'}</div><div class="dp-grid">${swatches(isHl ? HIGHLIGHTS : TEXT_COLORS, cur, isHl ? 'data-hl' : 'data-tc')}</div>
        <button type="button" class="dp-row dp-any" data-any="${kind}">Any colour…</button>`;
  } else if (kind === 'align') {
    p.innerHTML = `<div class="dp-icons">${['left', 'center', 'right', 'justify'].map(a => `<button type="button" class="dp-ic ${ed.isActive({ textAlign: a }) || (a === 'left' && !['center', 'right', 'justify'].some(x => ed.isActive({ textAlign: x }))) ? 'on' : ''}" data-align="${a}" title="${a === 'center' ? 'Centre' : a[0].toUpperCase() + a.slice(1)}">${DICON[a]}</button>`).join('')}</div>`;
  } else if (kind === 'link') {
    const href = ed.getAttributes('link').href || '';
    p.innerHTML = `<form class="dp-link" id="dpLink"><input id="dpLinkIn" placeholder="Paste a link…" value="${esc(href)}" autocomplete="off" spellcheck="false"><button class="dp-go" type="submit">${href ? 'Update' : 'Add link'}</button></form>
        ${href ? `<div class="dp-linkacts"><button type="button" class="dp-row" data-link="open">Open ↗</button><button type="button" class="dp-row" data-link="remove">Remove link</button></div>` : ''}`;
    const inp = $('dpLinkIn');
    inp.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        hidePop();
        ed.commands.focus();
      }
    });
    $('dpLink').onsubmit = e => {
      e.preventDefault();
      let v = inp.value.trim();
      if (!v) {
        ed.chain().focus().extendMarkRange('link').unsetLink().run();
        return hidePop();
      }
      if (!/^(https?:|mailto:|tel:)/i.test(v)) v = 'https://' + v;
      if (ed.state.selection.empty && !ed.isActive('link'))
        ed.chain()
          .focus()
          .insertContent(`<a href="${esc(v)}">${esc(v.replace(/^https?:\/\//, ''))}</a> `)
          .run();
      else ed.chain().focus().extendMarkRange('link').setLink({ href: v }).run();
      hidePop();
    };
    setTimeout(() => inp.focus(), 30);
  } else if (kind === 'more') {
    const lh = ed.getAttributes('paragraph').lineHeight || ed.getAttributes('heading').lineHeight || '';
    const inTable = ed.isActive('table');
    const folded = [...$('dvTools').querySelectorAll('.dt-fold[hidden]')].map(b => b.dataset.c || b.dataset.pop);
    const foldIcons = folded
      .flatMap(k =>
        k === 'align'
          ? ['left', 'center', 'right', 'justify'].map(
              a =>
                `<button type="button" class="dp-ic ${ed.isActive({ textAlign: a }) ? 'on' : ''}" data-align="${a}" title="Align ${a === 'center' ? 'centre' : a}">${DICON[a]}</button>`,
            )
          : k === 'link'
            ? [
                `<button type="button" class="dp-ic ${ed.isActive('link') ? 'on' : ''}" data-flink="1" title="Link">${DICON.link}</button>`,
              ]
            : [
                `<button type="button" class="dp-ic ${{ bullet: 'bulletList', ordered: 'orderedList', task: 'taskList' }[k] && ed.isActive({ bullet: 'bulletList', ordered: 'orderedList', task: 'taskList' }[k]) ? 'on' : ''}" data-c2="${k}" title="${{ bullet: 'Bulleted list', ordered: 'Numbered list', task: 'Checklist', image: 'Add a picture', undo: 'Undo', redo: 'Redo' }[k]}">${DICON[k]}</button>`,
              ],
      )
      .join('');
    p.innerHTML =
      (foldIcons ? `<div class="dp-h">Tools</div><div class="dp-icons dp-fold">${foldIcons}</div>` : '') +
      `<div class="dp-h">Line spacing</div><div class="dp-seg">${[
        ['1', 'Single'],
        ['1.15', '1.15'],
        ['1.5', '1.5'],
        ['2', 'Double'],
      ]
        .map(([v, l]) => `<button type="button" class="${String(lh) === v ? 'on' : ''}" data-lh="${v}">${l}</button>`)
        .join('')}</div>
        <div class="dp-h">Insert</div>
        <button type="button" class="dp-row dp-irow" data-ins="table">${DICON.table}Table</button>
        <button type="button" class="dp-row dp-irow" data-ins="hr">${DICON.hr}Divider</button>
        <button type="button" class="dp-row dp-irow" data-ins="sup"><b class="dp-glyph">x²</b>Superscript</button>
        <button type="button" class="dp-row dp-irow" data-ins="sub"><b class="dp-glyph">x₂</b>Subscript</button>
        ${
          inTable
            ? `<div class="dp-h">Table</div><div class="dp-grid2">${[
                ['rowAfter', '+ Row'],
                ['colAfter', '+ Column'],
                ['delRow', '− Row'],
                ['delCol', '− Column'],
                ['header', 'Header row'],
                ['delTable', 'Delete table'],
              ]
                .map(([a, l]) => `<button type="button" data-tbl="${a}">${l}</button>`)
                .join('')}</div>`
            : ''
        }
        <div class="dp-h"></div><button type="button" class="dp-row dp-irow" data-ins="clear">${DICON.clear}Clear formatting</button>`;
  } else if (kind === 'page') {
    const cur = pagePref();
    p.innerHTML = `<div class="dp-h">Page colour</div>${[
      ['auto', 'Match Fenmyr', 'Light or dark, with the app'],
      ['light', 'Light paper', 'Always white'],
      ['dark', 'Dark', 'Easy on the eyes at night'],
    ]
      .map(
        ([v, l, sub]) =>
          `<button type="button" class="dp-row dp-page ${cur === v ? 'on' : ''}" data-page="${v}"><i class="pg-sw pg-${v}"></i><span>${l}<small>${sub}</small></span></button>`,
      )
      .join('')}
        <p class="dp-tip">Only how it looks while you write. Downloads are always regular light pages.</p>`;
  } else if (kind === 'export') {
    const paper = (() => {
      try {
        return localStorage.getItem('fenmyr:paper') || 'letter';
      } catch (e) {
        return 'letter';
      }
    })();
    p.innerHTML = `<div class="dp-h">Paper</div><div class="dp-seg">${[
      ['letter', 'Letter'],
      ['a4', 'A4'],
    ]
      .map(([v, l]) => `<button type="button" class="${paper === v ? 'on' : ''}" data-paper="${v}">${l}</button>`)
      .join('')}</div>
        <button type="button" class="dp-row dp-pdf" data-pdf="1">${Icon('file-pdf')}<span>Download PDF<small>Real pages, ready to send or print</small></span></button>
        <button type="button" class="dp-row dp-pdf dp-word" data-word="1">${Icon('file-word')}<span>Download Word<small>A .docx you can keep editing in Word or Pages</small></span></button>`;
  } else if (kind === 'myra') {
    const has = !ed.state.selection.empty;
    p.innerHTML = has
      ? `<div class="dp-h">Myra, make this…</div>${[
          ['Shorter', 'Make it shorter and tighter'],
          ['Clearer', 'Make it clearer and easier to read'],
          ['Friendlier', 'Make it warmer and friendlier'],
          ['More confident', 'Make it more confident and direct'],
          ['More professional', 'Make it more polished and professional'],
          ['Fix spelling & grammar', 'Fix spelling, grammar and punctuation only. Change nothing else'],
          ['Into bullet points', 'Turn it into a short bulleted list'],
        ]
          .map(([l, how]) => `<button type="button" class="dp-row" data-how="${esc(how)}">${l}</button>`)
          .join('')}
        <form class="dp-link" id="dpAsk"><input id="dpAskIn" placeholder="Or tell Myra what to do…" autocomplete="off"><button class="dp-go" type="submit">✦</button></form>`
      : `<p class="dp-tip">Select some words, then ask Myra to rewrite them: shorter, friendlier, fixed up, or anything you like ✦</p>`;
    const ask = $('dpAskIn');
    if (ask) {
      ask.addEventListener('keydown', e => e.stopPropagation());
      $('dpAsk').onsubmit = e => {
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

const p_seg = b => b.parentNode.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
export function init55() {
  $('dvPop').addEventListener('mousedown', e => {
    if (!e.target.closest('input')) e.preventDefault();
  });

  $('dvPop').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || b.type === 'submit') return;
    const d = b.dataset,
      c = ed.chain().focus();
    if (d.block) {
      setBlock(d.block);
      return hidePop();
    }
    if (d.font != null) {
      useFont(d.font);
      (d.font === docDefault() ? c.unsetFontFamily() : c.setFontFamily(`"${d.font}"`)).run();
      return hidePop();
    }
    if (d.tc != null) {
      (d.tc ? c.setColor(d.tc) : c.unsetColor()).run();
      return hidePop();
    }
    if (d.hl != null) {
      (d.hl ? c.setHighlight({ color: d.hl }) : c.unsetHighlight()).run();
      return hidePop();
    }
    if (d.any) {
      const isHl = d.any === 'hl',
        r = b.getBoundingClientRect(),
        sel = { from: ed.state.selection.from, to: ed.state.selection.to };
      hidePop();
      openColor({
        tint: true,
        boardColors: true,
        title: isHl ? 'Highlight' : 'Text colour',
        hex:
          (isHl ? ed.getAttributes('highlight').color : ed.getAttributes('textStyle').color) ||
          (isHl ? '#fff1a8' : '#d9771f'),
        presets: isHl ? HIGHLIGHTS : TEXT_COLORS,
        at: { x: r.left, y: r.bottom + 8 },
        apply: hex => {
          const k = ed.chain().setTextSelection(sel);
          (isHl ? k.setHighlight({ color: hex }) : k.setColor(hex)).run();
        },
        reset: () => {
          const k = ed.chain().setTextSelection(sel);
          (isHl ? k.unsetHighlight() : k.unsetColor()).run();
        },
      });
      return;
    }
    if (d.align) {
      c.setTextAlign(d.align).run();
      return hidePop();
    }
    if (d.c2) {
      hidePop();
      return run(d.c2);
    }
    if (d.flink) {
      const more = $('dvTools').querySelector('[data-pop="more"]');
      hidePop();
      return showPop('link', more);
    }
    if (d.link === 'open') {
      Fenmyr.openURL(ed.getAttributes('link').href);
      return hidePop();
    }
    if (d.link === 'remove') {
      c.extendMarkRange('link').unsetLink().run();
      return hidePop();
    }
    if (d.lh) {
      (ed.getAttributes('paragraph').lineHeight === d.lh || ed.getAttributes('heading').lineHeight === d.lh
        ? c.unsetLineHeight()
        : c.setLineHeight(d.lh)
      ).run();
      return hidePop();
    }
    if (d.ins) {
      ({
        table: () => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
        hr: () => c.setHorizontalRule(),
        sup: () => c.toggleSuperscript(),
        sub: () => c.toggleSubscript(),
        clear: () => c.unsetAllMarks().clearNodes(),
      })
        [d.ins]()
        .run();
      return hidePop();
    }
    if (d.tbl) {
      ({
        rowAfter: () => c.addRowAfter(),
        colAfter: () => c.addColumnAfter(),
        delRow: () => c.deleteRow(),
        delCol: () => c.deleteColumn(),
        header: () => c.toggleHeaderRow(),
        delTable: () => c.deleteTable(),
      })
        [d.tbl]()
        .run();
      return hidePop();
    }
    if (d.page) {
      try {
        localStorage.setItem('fenmyr:docPage', d.page);
      } catch (er) {}
      applyDocPage();
      return hidePop();
    }
    if (d.paper) {
      try {
        localStorage.setItem('fenmyr:paper', d.paper);
      } catch (er) {}
      p_seg(b);
      return;
    }
    if (d.pdf) {
      hidePop();
      return downloadPDF();
    }
    if (d.word) {
      hidePop();
      return downloadWord();
    }
    if (d.how) rewrite(d.how);
  });

  closeOnOutsidePress('#dvPop, .dt-drop, .dt-myra, #cpop', () => {
    if (!$('dvPop').hidden) hidePop();
  });

  $('docview').addEventListener(
    'keydown',
    e => {
      if (e.key === 'Escape' && !$('dvPop').hidden) {
        e.stopPropagation();
        hidePop();
        ed?.commands.focus();
      }
    },
    true,
  );
}
