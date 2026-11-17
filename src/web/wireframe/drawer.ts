import { hasAll, queryWords } from '../core/base.ts';
import { $ } from '../core/dom.ts';
import { centerWorld, revealCards } from '../panels/zoomMenu.ts';
import { selCards } from '../selbar/selected.ts';
import { stopPlacing } from '../tools/place.ts';
import { closestTo, htmlIn, oneIn, textField } from '../ui/dom.ts';
import { pickWF } from './designPanel.ts';
import { PIECE_GROUPS, wordsOf } from './pieceGroups.ts';
import { justDragged, startGridDrag } from './piecePick.ts';
import { PIECES } from './pieces.ts';
import { addToScreen, placePiece } from './placePiece.ts';
import { screenOf } from './screenScope.ts';

const pieceBtn = (n: string) => {
  const kw = wordsOf(n),
    tip = `Add ${n.toLowerCase()}`,
    icon = Icon(PIECES[n]?.icon ?? 'square');
  return `<button data-piece="${n}" data-kw="${kw}" title="${tip}">${icon}${n}</button>`;
};

// the groups fold (Layouts starts folded), and the choice is remembered
const dzOpen: Record<string, boolean> = { layouts: false };

const dzWords = () => queryWords(textField('dzSearch').value);

function dzApply() {
  const q = dzWords().length > 0;
  htmlIn($('design'), '.dz-group').forEach(g => {
    const open = dzOpen[g.dataset.g ?? ''] !== false || q;
    g.classList.toggle('closed', !open);
    g.querySelector('.dz-gh')?.setAttribute('aria-expanded', String(open));
  });
}

// typing narrows every group to what matches (a search opens the groups it finds things in)
function dzFilter() {
  const words = dzWords();
  let any = false;
  htmlIn($('design'), '.dz-group').forEach(g => {
    let has = false;
    htmlIn(g, '.dz-tools button, .dz-piece-grid button').forEach(b => {
      const ok = !words.length || hasAll(words, b.dataset.kw ?? '');
      b.hidden = !ok;
      if (ok) has = true;
    });
    g.hidden = words.length > 0 && !has;
    if (has) any = true;
  });
  $('dzNone').hidden = !words.length || any;
  dzApply();
}

// a click on an element in the panel adds it straight away: into the screen in scope, or in the middle of the view (drag it from the panel to put it exactly somewhere)
function addPiece(name: string) {
  const fr = screenOf(selCards());
  if (fr) addToScreen(fr, { kind: 'piece', name });
  else revealCards(placePiece(name, centerWorld(), { center: true }));
}

// the folds remembered from last time; anything that isn't a yes or no is ignored
function readOpen(raw: string | null) {
  try {
    const v: unknown = JSON.parse(raw || '{}');
    if (v && typeof v === 'object')
      for (const [k, on] of Object.entries(v)) if (typeof on === 'boolean') dzOpen[k] = on;
  } catch {}
}

export function init48() {
  PIECE_GROUPS.forEach(({ key, cells }) => {
    const grid = oneIn($('design'), `.dz-piece-grid[data-g="${key}"]`);
    if (grid) grid.innerHTML = cells.flatMap(c => (c.kind === 'piece' ? [pieceBtn(c.name)] : [])).join('');
  });
  readOpen(localStorage.getItem('fenmyr:dzOpen'));

  const search = textField('dzSearch');
  search.oninput = dzFilter;

  search.onkeydown = e => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      search.value = '';
      dzFilter();
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      oneIn($('design'), '.dz-group:not([hidden]) :is(.dz-tools, .dz-piece-grid) button:not([hidden])')?.click();
    }
  };

  $('design').addEventListener('click', e => {
    const h = closestTo(e.target, '.dz-gh');
    if (h) {
      const g = h.parentElement?.dataset.g ?? '';
      dzOpen[g] = dzOpen[g] === false;
      try {
        localStorage.setItem('fenmyr:dzOpen', JSON.stringify(dzOpen));
      } catch {}
      dzApply();
      return;
    }
    const piece = closestTo(e.target, '[data-piece]')?.dataset.piece;
    if (!piece || justDragged()) return;
    pickWF(null);
    stopPlacing();
    addPiece(piece);
  });

  $('design').addEventListener('pointerdown', e => {
    const name = closestTo(e.target, '[data-piece]')?.dataset.piece;
    if (name) startGridDrag(e, { kind: 'piece', name });
  });

  dzApply();
}
