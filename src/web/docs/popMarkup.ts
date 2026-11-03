import { DICON } from './editor.ts';
import { HIGHLIGHTS, SUGGESTED_FONTS, TEXT_COLORS } from './docText.ts';
import { FONTS } from '../wireframe/wireframes.ts';
import { esc } from '../ui/dom.ts';

// ---------- what the doc editor's drop-down menus show: values first, then the markup ----------

const on = (yes: unknown) => (yes ? 'on' : '');

// the font list: this board's fonts, then suggestions, then everything on this computer
export function fontListMarkup(onBoard: string[], row: (f: string) => string) {
  const rows = onBoard.map(row).join(''),
    used = onBoard.length ? `<div class="dp-h">Used on this board</div>${rows}` : '',
    suggested = SUGGESTED_FONTS.filter(f => !onBoard.includes(f))
      .map(row)
      .join(''),
    local = FONTS.filter(f => !SUGGESTED_FONTS.includes(f) && !onBoard.includes(f))
      .slice(0, 400)
      .map(row)
      .join('');
  return `<input class="dp-search" id="dpFontQ" placeholder="Search fonts…" autocomplete="off" spellcheck="false">
        <div class="dp-scroll" id="dpFontList">${used}<div class="dp-h">Suggested</div>${suggested}
        <div class="dp-h">On your computer</div>${local}</div>`;
}

// text colour or highlighter: none, the board's colours, then the presets, then any colour
export function colorMarkup(
  kind: string,
  isHl: boolean,
  boardCols: string[],
  cur: unknown,
  swatches: (list: string[], cur: unknown, attr: string) => string,
) {
  const attr = isHl ? 'data-hl' : 'data-tc',
    short = isHl ? 'hl' : 'tc',
    none = isHl ? 'No highlight' : 'Default colour',
    boardDots = swatches(boardCols, cur, attr),
    board = boardCols.length ? `<div class="dp-h">Board colours</div><div class="dp-grid">${boardDots}</div>` : '',
    heading = isHl ? 'Highlighters' : 'Colours',
    presets = swatches(isHl ? HIGHLIGHTS : TEXT_COLORS, cur, attr);
  return `<button type="button" class="dp-row dp-none" data-${short}="">${none}</button>
        ${board}
        <div class="dp-h">${heading}</div><div class="dp-grid">${presets}</div>
        <button type="button" class="dp-row dp-any" data-any="${kind}">Any colour…</button>`;
}

export function linkMarkup(href: string) {
  const value = esc(href),
    go = href ? 'Update' : 'Add link',
    acts = href
      ? `<div class="dp-linkacts"><button type="button" class="dp-row" data-link="open">Open ↗</button><button type="button" class="dp-row" data-link="remove">Remove link</button></div>`
      : '';
  return `<form class="dp-link" id="dpLink"><input id="dpLinkIn" placeholder="Paste a link…" value="${value}" autocomplete="off" spellcheck="false"><button class="dp-go" type="submit">${go}</button></form>
        ${acts}`;
}

const SPACING = [
  ['1', 'Single'],
  ['1.15', '1.15'],
  ['1.5', '1.5'],
  ['2', 'Double'],
];
const TABLE_ACTS = [
  ['rowAfter', '+ Row'],
  ['colAfter', '+ Column'],
  ['delRow', '− Row'],
  ['delCol', '− Column'],
  ['header', 'Header row'],
  ['delTable', 'Delete table'],
];

// ···: tools that didn't fit the toolbar, line spacing, inserting, table actions and clearing formatting
export function moreMarkup(foldIcons: string, lh: string, inTable: boolean) {
  const tools = foldIcons ? `<div class="dp-h">Tools</div><div class="dp-icons dp-fold">${foldIcons}</div>` : '',
    spacing = SPACING.map(([v, l]) => {
      const state = on(lh === v);
      return `<button type="button" class="${state}" data-lh="${v}">${l}</button>`;
    }).join(''),
    tableActs = TABLE_ACTS.map(([a, l]) => `<button type="button" data-tbl="${a}">${l}</button>`).join(''),
    table = inTable ? `<div class="dp-h">Table</div><div class="dp-grid2">${tableActs}</div>` : '',
    tableIcon = DICON.table,
    hrIcon = DICON.hr,
    clearIcon = DICON.clear;
  return (
    tools +
    `<div class="dp-h">Line spacing</div><div class="dp-seg">${spacing}</div>
        <div class="dp-h">Insert</div>
        <button type="button" class="dp-row dp-irow" data-ins="table">${tableIcon}Table</button>
        <button type="button" class="dp-row dp-irow" data-ins="hr">${hrIcon}Divider</button>
        <button type="button" class="dp-row dp-irow" data-ins="sup"><b class="dp-glyph">x²</b>Superscript</button>
        <button type="button" class="dp-row dp-irow" data-ins="sub"><b class="dp-glyph">x₂</b>Subscript</button>
        ${table}
        <div class="dp-h"></div><button type="button" class="dp-row dp-irow" data-ins="clear">${clearIcon}Clear formatting</button>`
  );
}

const PAGES = [
  ['auto', 'Match Fenmyr', 'Light or dark, with the app'],
  ['light', 'Light paper', 'Always white'],
  ['dark', 'Dark', 'Easy on the eyes at night'],
];

export function pageMarkup(cur: string) {
  const rows = PAGES.map(([v, l, sub]) => {
    const state = on(cur === v);
    return `<button type="button" class="dp-row dp-page ${state}" data-page="${v}"><i class="pg-sw pg-${v}"></i><span>${l}<small>${sub}</small></span></button>`;
  }).join('');
  return `<div class="dp-h">Page colour</div>${rows}
        <p class="dp-tip">Only how it looks while you write. Downloads are always regular light pages.</p>`;
}

const PAPERS = [
  ['letter', 'Letter'],
  ['a4', 'A4'],
];

export function exportMarkup(paper: string) {
  const sizes = PAPERS.map(([v, l]) => {
      const state = on(paper === v);
      return `<button type="button" class="${state}" data-paper="${v}">${l}</button>`;
    }).join(''),
    pdf = Icon('file-pdf'),
    word = Icon('file-word');
  return `<div class="dp-h">Paper</div><div class="dp-seg">${sizes}</div>
        <button type="button" class="dp-row dp-pdf" data-pdf="1">${pdf}<span>Download PDF<small>Real pages, ready to send or print</small></span></button>
        <button type="button" class="dp-row dp-pdf dp-word" data-word="1">${word}<span>Download Word<small>A .docx you can keep editing in Word or Pages</small></span></button>`;
}

const REWRITES = [
  ['Shorter', 'Make it shorter and tighter'],
  ['Clearer', 'Make it clearer and easier to read'],
  ['Friendlier', 'Make it warmer and friendlier'],
  ['More confident', 'Make it more confident and direct'],
  ['More professional', 'Make it more polished and professional'],
  ['Fix spelling & grammar', 'Fix spelling, grammar and punctuation only. Change nothing else'],
  ['Into bullet points', 'Turn it into a short bulleted list'],
];

// Myra's rewrites, when there's a selection to rewrite
export function myraMarkup(has: boolean) {
  if (!has)
    return `<p class="dp-tip">Select some words, then ask Myra to rewrite them: shorter, friendlier, fixed up, or anything you like ✦</p>`;
  const rows = REWRITES.map(([l, how]) => {
    const ask = esc(how);
    return `<button type="button" class="dp-row" data-how="${ask}">${l}</button>`;
  }).join('');
  return `<div class="dp-h">Myra, make this…</div>${rows}
        <form class="dp-link" id="dpAsk"><input id="dpAskIn" placeholder="Or tell Myra what to do…" autocomplete="off"><button class="dp-go" type="submit">✦</button></form>`;
}
