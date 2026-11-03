import type { Card } from '../../shared/model.ts';
import { toWorld } from '../canvas/handles.ts';
import { renderCard } from '../canvas/render.ts';
import { applyView } from '../canvas/view.ts';
import { byId, renderWires, selectOnly } from '../canvas/wires.ts';
import { hasAll, queryWords, uid } from '../core/base.ts';
import { $, stage } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { card } from '../model/boards.ts';
import { centerWorld } from '../panels/zoomMenu.ts';
import { placeAt, placing, startPlacing, stopPlacing } from '../tools/place.ts';
import { closestTo, htmlIn, oneIn, textField } from '../ui/dom.ts';
import { pickWF } from './designPanel.ts';
import { PIECES } from './pieces.ts';
import { fileIntoFrame } from './tilt.ts';
import { session } from '../core/state.ts';

type Point = { x: number; y: number };

// the panel, by what things are: Basics (with the Screen, Box, Text and Icon tools), Buttons & inputs, Building blocks and Layouts
export const GROUPS: [string, string[]][] = [
  ['basics', ['Heading', 'Image', 'Video', 'Map', 'Avatar', 'Divider', 'Space']],
  ['controls', ['Button', 'Input', 'Textarea', 'Search', 'Dropdown', 'Radio', 'Checkbox', 'Toggle']],
  ['blocks', ['Nav bar', 'Tab bar', 'Tabs', 'Card', 'List row', 'Table', 'Accordion', 'Modal']],
  [
    'layouts',
    [
      'Header',
      'Hero',
      'Logos',
      'Features',
      'Gallery',
      'Stats',
      'Testimonials',
      'Pricing',
      'Card grid',
      'CTA',
      'Footer',
    ],
  ],
];

// other words people might type to find an element
const PIECE_KW: Record<string, string> = {
  Heading: 'title headline',
  Image: 'picture photo placeholder',
  Video: 'player movie clip media',
  Map: 'location pin place',
  Avatar: 'profile user person picture',
  Divider: 'line rule separator',
  Space: 'gap spacer margin padding',
  Button: 'cta action',
  Input: 'text field form',
  Textarea: 'multiline message comment form',
  Search: 'find field',
  Dropdown: 'select combobox menu picker',
  Radio: 'option choice select',
  Checkbox: 'tick check',
  Toggle: 'switch on off',
  'Nav bar': 'navigation top bar header',
  'Tab bar': 'bottom navigation tabs',
  Tabs: 'segmented tab switch',
  Card: 'tile panel',
  'List row': 'cell item list',
  Table: 'grid data rows columns spreadsheet',
  Accordion: 'faq collapse expand',
  Modal: 'dialog popup overlay sheet',
  Header: 'site navigation top',
  Hero: 'banner headline landing',
  Logos: 'brands clients partners strip',
  Features: 'benefits grid',
  Gallery: 'photos images',
  Stats: 'numbers metrics figures',
  Testimonials: 'quotes reviews customers',
  Pricing: 'plans tiers cost',
  'Card grid': 'cards grid columns',
  CTA: 'call to action button banner',
  Footer: 'links bottom',
};

const pieceBtn = (n: string) => {
  const kw = `${n.toLowerCase()} ${PIECE_KW[n] || ''}`,
    tip = `Add ${n.toLowerCase()}`,
    icon = Icon(PIECES[n]?.icon ?? 'square');
  return `<button data-piece="${n}" data-kw="${kw}" title="${tip}">${icon}${n}</button>`;
};

// the groups fold (Layouts starts folded), and the choice is remembered
let dzOpen: Record<string, boolean> = { layouts: false };

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

// dragging an element from the panel onto the board puts it exactly where you let go (the preview follows the pointer, above the panels)
let pDrag: { name: string; x: number; y: number; on: boolean } | null = null;
let pDragged = false;

// frame: the screen to add it to; center: put its middle at w instead of its corner
export function placePiece(name: string | undefined, w: Point, opts: { frame?: Card; center?: boolean } = {}) {
  const P = name ? PIECES[name] : undefined;
  if (!P) return [];
  const f =
      opts.frame ||
      [...session.board.cards]
        .reverse()
        .find(f => f.type === 'frame' && w.x > f.x && w.x < f.x + f.w && w.y > f.y && w.y < f.y + f.h),
    M = f && f.w > 700 ? 64 : 24;
  const W = (P.bar || P.web) && f ? f.w : P.web ? 1200 : Math.min(P.w || 360, f ? f.w - M * 2 : Infinity),
    items = P.make(W, { panel: true });
  const bw = Math.max(1, ...items.map(i => i.x + i.w)),
    bh = Math.max(1, ...items.map(i => i.y + i.h));
  let ox = w.x - 14 / session.view.z,
    oy = w.y - 14 / session.view.z;
  if (opts.center) {
    ox = w.x - bw / 2;
    oy = w.y - bh / 2;
  }
  if ((P.bar || P.web) && f) {
    ox = f.x;
    if (P.bar === 'top') oy = Math.max(f.y, oy);
    if (P.bar === 'bottom') oy = Math.min(f.y + f.h - 64, Math.max(f.y, oy));
  }
  const tabKids = f && opts.frame ? session.board.cards.filter(c => c.onFrame === f.id && c.y >= f.y + f.h - 90) : []; // a tab bar waiting at the bottom
  const g = uid(),
    made = items.map(it => {
      const c = card(it.type, { ...it, x: ox + it.x, y: oy + it.y, r: 0, group: g });
      session.board.cards.push(c);
      renderCard(c, true);
      return c;
    });
  // adding into a screen that is full: it grows, and the tab bar slides down with its bottom edge
  if (f && opts.frame && !P.bar) {
    const limit = f.y + f.h - (tabKids.length ? 90 : 12),
      grow = oy + bh - limit + 24;
    if (grow > 24) {
      f.h += grow;
      renderCard(f);
      tabKids.forEach(c => {
        c.y += grow;
        renderCard(c);
      });
    }
  }
  fileIntoFrame(made);
  selectOnly(made.map(c => c.id));
  renderWires();
  save();
  return made;
}

// a click on an element in the panel adds it straight away: into the selected screen, below what is already there, or in the middle of the view (drag it from the panel to put it exactly somewhere)
function addPiece(name: string) {
  const P = PIECES[name],
    z = session.view.z,
    sc = [...session.sel].map(byId).filter(c => c !== undefined),
    first = sc[0];
  if (!P) return;
  const fr =
    sc.length === 1 && first?.type === 'frame'
      ? first
      : first?.onFrame && sc.every(c => c.onFrame === first.onFrame)
        ? byId(first.onFrame)
        : undefined;
  let made: Card[];
  if (!fr) made = placePiece(name, centerWorld(), { center: true });
  else {
    const M = fr.w > 700 ? 64 : 24,
      body = session.board.cards.filter(c => c.onFrame === fr.id && c.y < fr.y + fr.h - 90),
      phone = fr.w <= 500;
    const y = body.length
      ? Math.max(...body.map(c => c.y + c.h)) + (P.web ? 0 : 16)
      : fr.y + (phone ? 44 : 0) + (P.web ? 0 : 20);
    made = placePiece(
      name,
      { x: fr.x + M + 14 / z, y: P.bar === 'bottom' ? fr.y + fr.h : P.bar === 'top' ? fr.y : y + 14 / z },
      { frame: fr },
    );
  }
  revealCards(made);
}

// bring something that landed out of sight into view (a screen far from where you are looking)
export function revealCards(cs: Card[]) {
  if (!cs.length) return;
  const r = stage.getBoundingClientRect(),
    x0 = Math.min(...cs.map(c => c.x)),
    y0 = Math.min(...cs.map(c => c.y)),
    x1 = Math.max(...cs.map(c => c.x + c.w)),
    y1 = Math.max(...cs.map(c => c.y + c.h));
  const sx = r.left + session.view.x + ((x0 + x1) / 2) * session.view.z,
    sy = r.top + session.view.y + ((y0 + y1) / 2) * session.view.z;
  if (sx > r.left + 280 && sx < r.right - 280 && sy > r.top + 80 && sy < r.bottom - 120) return;
  const c = centerWorld();
  session.view.x += (c.x - (x0 + x1) / 2) * session.view.z;
  session.view.y += (c.y - (y0 + y1) / 2) * session.view.z;
  applyView();
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
  GROUPS.forEach(([g, names]) => {
    const grid = oneIn($('design'), `.dz-piece-grid[data-g="${g}"]`);
    if (grid) grid.innerHTML = names.map(pieceBtn).join('');
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
    if (!piece || pDragged) return;
    pickWF(null);
    stopPlacing();
    addPiece(piece);
  });

  $('design').addEventListener('pointerdown', e => {
    const name = closestTo(e.target, '[data-piece]')?.dataset.piece;
    if (name && !e.button) pDrag = { name, x: e.clientX, y: e.clientY, on: false };
  });

  addEventListener(
    'pointermove',
    e => {
      if (!pDrag || pDrag.on || Math.hypot(e.clientX - pDrag.x, e.clientY - pDrag.y) < 6) return;
      pDrag.on = true;
      pickWF(null);
      startPlacing('piece', { piece: pDrag.name }, true);
      document.body.classList.add('dz-dragging');
    },
    true,
  );

  addEventListener(
    'pointerup',
    e => {
      if (!pDrag) return;
      const d = pDrag;
      pDrag = null;
      if (!d.on) return;
      document.body.classList.remove('dz-dragging');
      pDragged = true;
      setTimeout(() => {
        pDragged = false;
      }, 0);
      const over = document.elementFromPoint(e.clientX, e.clientY);
      if (
        placing &&
        placing.type === 'piece' &&
        !over?.closest(
          '.design, .side, .tray, .tools, .dock, .myra, .selbar, .m-chat, .keys, .top, .hub, .sheet, .settings',
        )
      )
        placeAt(toWorld(e.clientX, e.clientY));
      else stopPlacing();
    },
    true,
  );

  dzApply();
}
