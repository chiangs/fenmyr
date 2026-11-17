import { hasAll } from '../core/base.ts';
import { htmlIn } from '../ui/dom.ts';
import { type Cell, PIECE_GROUPS, wordsOf } from './pieceGroups.ts';
import { pieceThumb } from './pieceThumb.ts';

export type View = 'pieces' | 'icons';

const TOOL = {
  box: { name: 'Box', icon: 'rectangle', tip: 'Box (R): drag on the board to draw one' },
  text: { name: 'Text', icon: 'text', tip: 'Text (X): click the board to type' },
} as const;

function cellHtml(c: Cell) {
  switch (c.kind) {
    case 'piece': {
      const name = c.name,
        kw = wordsOf(name),
        tip = `Add ${name.toLowerCase()}`,
        thumb = pieceThumb(name);
      return `<button type="button" class="pk-cell" tabindex="-1" data-pk-piece="${name}" data-kw="${kw}" title="${tip}"><span class="pk-th">${thumb}</span><span class="pk-n">${name}</span></button>`;
    }
    case 'tool': {
      const { name, icon, tip } = TOOL[c.tool],
        kw = wordsOf(name),
        svg = Icon(icon, { size: 22 }),
        key = c.key;
      return `<button type="button" class="pk-cell pk-tool" tabindex="-1" data-pk-tool="${c.tool}" data-kw="${kw}" title="${tip}"><span class="pk-th">${svg}</span><span class="pk-n">${name}<kbd>${key}</kbd></span></button>`;
    }
    default: {
      const unknown: never = c;
      return unknown;
    }
  }
}

let piecesMarkup = '';
let iconsMarkup = '';

// built the first time each view opens, then kept
function piecesHtml() {
  piecesMarkup ||= PIECE_GROUPS.map(g => {
    const cells = g.cells.map(cellHtml).join(''),
      heading = g.heading;
    return `<section class="pk-group" aria-label="${heading}"><h3 class="pk-h">${heading}</h3><div class="pk-cells">${cells}</div></section>`;
  }).join('');
  return piecesMarkup;
}

function iconsHtml() {
  iconsMarkup ||= iconList()
    .map(i => {
      const name = i.name,
        tip = name.replace(/-/g, ' '),
        kw = i.kw,
        svg = Icon(name);
      return `<button type="button" class="pk-icon" tabindex="-1" data-pk-icon="${name}" data-kw="${kw}" title="${tip}" aria-label="${tip}">${svg}</button>`;
    })
    .join('');
  return `<div class="pk-cells pk-icons">${iconsMarkup}</div>`;
}

const NONE: Record<View, string> = { pieces: 'No pieces match that', icons: 'No icons match that' };

/** Fills the grid with a view's cells and its no-match line. */
export function fillGrid(grid: HTMLElement, view: View) {
  const cells = view === 'pieces' ? piecesHtml() : iconsHtml(),
    none = NONE[view],
    more =
      view === 'pieces'
        ? '<button type="button" class="pk-more" data-pk-iconsfor>Search icons for “<span></span>”</button>'
        : '';
  grid.innerHTML = `${cells}<div class="pk-none" hidden><p>${none}</p>${more}</div>`;
  grid.dataset.view = view;
}

/** Shows the cells holding every word, hides a heading with none, and says so when nothing matches. */
export function filterGrid(grid: HTMLElement, words: string[]) {
  let any = false;
  for (const box of htmlIn(grid, '.pk-cells')) {
    let has = false;
    for (const b of htmlIn(box, '[data-kw]')) {
      b.hidden = words.length > 0 && !hasAll(words, b.dataset.kw ?? '');
      if (!b.hidden) has = true;
    }
    const group = box.closest('.pk-group');
    if (group instanceof HTMLElement) group.hidden = !has;
    if (has) any = true;
  }
  const none = grid.querySelector('.pk-none'),
    said = grid.querySelector('.pk-more span');
  if (none instanceof HTMLElement) none.hidden = any;
  if (said) said.textContent = words.join(' ');
  rove(grid, visibleCells(grid)[0]);
}

export const visibleCells = (grid: HTMLElement) => htmlIn(grid, '[data-kw]').filter(b => !b.hidden);

/** The grid is one stop for Tab, at the cell last focused or the first shown; the arrow keys move inside it. */
export function rove(grid: HTMLElement, to: HTMLElement | undefined) {
  grid.querySelector('[data-kw][tabindex="0"]')?.setAttribute('tabindex', '-1');
  to?.setAttribute('tabindex', '0');
}

const mid = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

/** The cell an arrow key moves to from `from`: the next or previous visible cell for left and right, and for up and
 *  down the nearest cell in the next row that way, across headings. Null past the first row going up. */
export function stepCell(grid: HTMLElement, from: HTMLElement, key: string): HTMLElement | null {
  const cells = visibleCells(grid),
    i = cells.indexOf(from);
  if (key === 'ArrowRight') return cells[i + 1] ?? from;
  if (key === 'ArrowLeft') return cells[i - 1] ?? from;
  const dir = key === 'ArrowDown' ? 1 : -1,
    at = mid(from.getBoundingClientRect()),
    rows = cells.map(c => ({ c, p: mid(c.getBoundingClientRect()) })).filter(({ p }) => (p.y - at.y) * dir > 4);
  if (!rows.length) return dir > 0 ? from : null;
  const nearY = Math.min(...rows.map(({ p }) => Math.abs(p.y - at.y)));
  const row = rows.filter(({ p }) => Math.abs(Math.abs(p.y - at.y) - nearY) < 4);
  row.sort((a, b) => Math.abs(a.p.x - at.x) - Math.abs(b.p.x - at.x));
  return row[0]?.c ?? from;
}
