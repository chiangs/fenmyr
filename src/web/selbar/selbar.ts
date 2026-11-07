import { labelOf, typesWith } from '../../shared/cardTypes.ts';
import type { Card, Link } from '../../shared/model.ts';
import { canStroke, TILTS } from '../canvas/render.ts';
import { COLL } from '../cards/collection.ts';
import { COLOR_NAMES, COLORS, colorLabel } from '../core/base.ts';
import { $ } from '../core/dom.ts';
import { session } from '../core/state.ts';
import { hasDue } from '../features/due.ts';
import { tagEditor } from '../features/tags.ts';
import { esc } from '../ui/dom.ts';
import { renderDesign, syncDesign } from '../wireframe/designPanel.ts';
import { initActions } from './actions.ts';
import { arrangeHtml, initArrange } from './arrange.ts';
import { initBarKeys, keepFocus } from './barKeys.ts';
import {
  btn,
  caret,
  closeSbPops,
  foldSelbar,
  G,
  ICON,
  initIcons,
  initPops,
  initTips,
  moreHtml,
  pop,
  snapSoon,
} from './barKit.ts';
import { type BarContext, barContext, barPaused, type SelBarContext } from './context.ts';
import { cornersHtml, initCorners, roundable } from './corners.ts';
import { boxFillHtml, fillable, initFills, initShapeFill, shapeFillHtml, textFillHtml } from './fill.ts';
import { barRoom, floatBar, floatModeBar } from './float.ts';
import { initFontPop } from './fontPop.ts';
import { initLineStyle, lineStyleHtml } from './lineStyle.ts';
import { drawOverlays } from './overlays.ts';
import { initStroke, strokeHtml } from './stroke.ts';
import { initTextBar, syncTypingFormats, textBarHtml } from './textBar.ts';
import { SIZED } from './textSize.ts';
import { initTypingFocus } from './typingFocus.ts';
import { initWireBar, wireBarHtml, wireKey } from './wireBar.ts';

const FILLABLE = typesWith('fillable');

const SEP = '<span class="sb-sep"></span>';

// the bar is rebuilt only when one of these changes on a selected card: moving and resizing don't count, but dropping
// into a screen does, since the Wireframe panel then offers to align with it
const KEY_FIELDS = [
  'id',
  'tcase',
  'tc',
  'fill',
  'squig',
  'align',
  'lh',
  'ls',
  'stroke',
  'sw',
  'sdash',
  'dl',
  'dg',
  'radius',
  'color',
  'head',
  'count',
  'tagText',
  'hideName',
  'hideHex',
  'url',
  'fs',
  'font',
  'bold',
  'italic',
  'under',
  'strike',
  'group',
  'onFrame',
];
function cardKey(c: Card) {
  const r: Record<string, unknown> = c,
    fields = KEY_FIELDS.map(k => String(r[k])).join();
  return `${fields}${(c.tags || []).join('|')}${Math.round(c.r || 0)}${!!c.tilted}${!!r.cropEdit}${!!r.src}`;
}

// in dark mode a Snow card is drawn dark, so its chip shows what you will get
const chipBg = (n: string | undefined) =>
  n === 'white' && document.body.classList.contains('dark') ? '#38332d' : COLORS[n ?? ''];

const colorPop = (cur: string, dots: string) => {
  const CARET = caret();
  return pop(
    'color',
    `<i class="sb-cur" style="background:${cur}"></i>${CARET}`,
    `<div class="sb-dots">${dots}</div>`,
    'Colour',
  );
};

const colorDot = (attr: string, n: string, bg: string, on: boolean) => {
  const label = colorLabel(n),
    cls = on ? 'on' : '';
  return `<button data-${attr}="${n}" title="${label}" style="background:${bg}" class="${cls}"></button>`;
};

// the card's own colour: a collection's colours, or the note colours for everything that takes one
function colorsHtml(cs: Card[], one: Card | null) {
  if (one?.type === 'coll') {
    const dots = Object.keys(COLL)
        .map(n => colorDot('cc', n, COLL[n]?.[0] ?? '#fff', one.color === n))
        .join(''),
      head = one.head === false ? 'Show the header' : 'Hide the header',
      noHeader = one.head === false,
      count = noHeader
        ? 'Show the header to count its cards'
        : one.count
          ? 'Hide the count'
          : 'Show a count of the cards';
    return (
      G(2, colorPop(COLL[one.color ?? '']?.[0] || '#fff', dots) + SEP) +
      btn('head', 'head', head, one.head !== false) +
      btn('count', 'count', count, !!one.count && !noHeader, noHeader)
    );
  }
  const fill = cs.filter(c => FILLABLE.includes(c.type)),
    first = fill[0];
  if (!first) return '';
  const cur = fill.every(c => c.color === first.color)
      ? chipBg(first.color) || '#fff'
      : 'conic-gradient(#ffdcd8 0 25%, #ffe3bd 0 50%, #e0edd3 0 75%, #d9e7f3 0)',
    dots = COLOR_NAMES.map(n =>
      colorDot(
        'c',
        n,
        chipBg(n) ?? '',
        fill.every(c => c.color === n),
      ),
    ).join('');
  return G(2, colorPop(cur, dots) + SEP);
}

// the buttons that belong to one kind of card: open it, flip it, label it, its tags and due date
function cardButtonsHtml(one: Card) {
  let h = '';
  const CARET = caret();
  if (one.type === 'swatch')
    h += G(
      2,
      btn('pick', 'color', 'Change the colour') +
        btn('hidename', 'name', one.hideName ? 'Show the name' : 'Hide the name', !one.hideName) +
        btn('hidehex', 'hex', one.hideHex ? 'Show the hex' : 'Hide the hex', !one.hideHex),
    );
  if (one.type === 'box' && one.img && !one.src)
    h += `<button class="sb-txt" data-fill="1" title="Fill this image spot">Fill image ✦</button>`;
  if (one.type === 'image')
    h += G(
      2,
      btn('crop', 'crop', 'Crop') +
        btn('tag', 'caption', one.tagText ? 'Remove the caption' : 'Add a caption', !!one.tagText),
    );
  else if (!['coll', 'swatch', 'stamp', 'ink'].includes(one.type))
    h += G(6, btn('tag', 'tag', one.tagText ? 'Remove the label' : 'Add a label', !!one.tagText));
  if (one.type === 'note') {
    const n = (one.tags || []).length,
      count = n ? `<b>${n}</b>` : '',
      tags = ICON.tags ?? '',
      editor = tagEditor(one);
    h += G(
      2,
      pop('tags', `${tags}${count}${CARET}`, `<div class="sb-tags" data-for="${one.id}">${editor}</div>`, 'Tags'),
    );
  }
  if (hasDue(one)) {
    const cal = Icon('calendar'),
      set = one.due ? '<b>•</b>' : '',
      day = esc((one.due || '').slice(0, 10)),
      time = esc((one.due || '').slice(11));
    h += G(
      2,
      pop(
        'due',
        `${cal}${set}${CARET}`,
        `<div class="sb-due" data-for="${one.id}"><div class="sd-row"><label><span>Date</span><input type="date" data-due-d value="${day}"></label><label><span>Time</span><input type="time" data-due-t value="${time}"></label></div><div class="sd-chips"><button data-due-q="0">Today</button><button data-due-q="1">Tomorrow</button><button data-due-q="7">Next week</button><button data-due-clear>Clear</button></div></div>`,
        'Due date',
      ),
    );
  }
  if (one.type === 'doc') h += btn('open', 'open', 'Open the doc');
  if (one.type === 'vnote') h += btn('vnflip', 'flip', 'Flip the card') + btn('vnopen', 'open', 'Open in Obsidian');
  if (one.type === 'canvas') h += btn('open', 'open', 'Open this canvas');
  if (one.type === 'link' && one.url)
    h += G(2, btn('visit', 'open', 'Open the link') + btn('relink', 'link', 'Change the link'));
  if (one.type === 'spotify') h += btn('visit', 'open', 'Open in Spotify');
  if (one.type === 'shape' && one.shape === 'line') h += lineStyleHtml(one);
  if (one.type === 'shape') h += shapeFillHtml(one);
  return h;
}

// a group of controls shown when every selected card can take them
const forAll = (cs: Card[], ok: (c: Card) => boolean, html: (list: Card[], first: Card) => string) => {
  const list = cs.filter(ok),
    first = list[0];
  return first && list.length === cs.length ? html(list, first) : '';
};

// sections, grouping and the ··· menu
function endHtml(cs: Card[], one: Card | null) {
  let h = '';
  const sep = `<span class="sb-sep"></span>`;
  if (one && TILTS(one)) {
    const seen = one.type === 'stamp' && !one.tilted ? 0 : Math.round(one.r || 0),
      icon = Icon('refresh');
    h += G(
      3,
      `${sep}<button class="sb-tilt" data-sb="tiltpop" title="Tilt">${icon}<span class="sb-deg">${seen}°</span></button>`,
    ); // Reset lives in the tilt box
  }
  if (cs.length > 1)
    h += G(
      9,
      `${sep}<button class="sb-txt sb-glass" data-sb="section" title="Create section · ⌥⌘G">Create section</button>`,
    ); // these tuck into ··· before the text controls do
  if (cs.some(c => c.type === 'frame') && session.board.kind !== 'prototype')
    h += G(
      9,
      `${sep}<button class="sb-txt sb-glass" data-sb="prototype" title="Make a clickable prototype from these screens">Prototype this</button>`,
    );
  if (one?.type === 'section') {
    const dots = COLOR_NAMES.map(n => colorDot('sc', n, COLORS[n] ?? '', (one.color || 'white') === n)).join('');
    h +=
      `<button class="sb-txt" data-sb="rensection" title="Rename">Rename</button>` +
      `<button class="sb-txt" data-sb="unsection" title="Remove section">Remove section</button>${sep}` +
      G(2, colorPop(COLORS[one.color ?? ''] || '#fff', dots));
  }
  if (cs.length > 1) {
    const grouped = cs.every(c => c.group && c.group === cs[0]?.group),
      act = grouped ? 'ungroup' : 'group',
      tip = grouped ? 'Ungroup · ⇧⌘G' : 'Group · ⌘G',
      label = grouped ? 'Ungroup' : 'Group';
    h += G(8, `${sep}<button class="sb-txt" data-sb="${act}" title="${tip}">${label}</button>`);
  }
  return h + moreHtml() + sep + btn('del', 'del', 'Delete');
}

function cardBarHtml(cs: Card[]) {
  const one = cs.length === 1 ? (cs[0] ?? null) : null,
    // a kanban is a collection drawn as columns, and named for how it looks
    label = !one ? `${cs.length} selected` : one.type === 'coll' && one.kanban ? 'Kanban' : labelOf(one.type);
  let h = `<span class="sb-label">${label}</span>`;
  if (cs.length > 1) h += arrangeHtml(cs.length);
  h += colorsHtml(cs, one);
  if (one) h += cardButtonsHtml(one);
  h += textBarHtml(cs.filter(c => SIZED.includes(c.type)));
  h += forAll(cs, fillable, (_, f) => boxFillHtml(f));
  h += forAll(
    cs,
    c => c.type === 'title' || c.type === 'text',
    (_, f) => textFillHtml(f),
  );
  h += forAll(cs, canStroke, strokeHtml);
  h += forAll(cs, roundable, cornersHtml);
  return h + endHtml(cs, one);
}

const CROP_BAR = `<span class="sb-label">Crop</span><button class="sb-txt" data-crop="cancel">Cancel</button><button class="sb-txt" data-crop="reset">Reset</button><button class="sb-txt on" data-crop="done">Done</button>`;

function drawCards(bar: HTMLElement, ctx: Extract<BarContext, { kind: 'selection' }>) {
  const cs = ctx.cards;
  if (bar.classList.contains('typing') !== ctx.typing) {
    bar.classList.toggle('typing', ctx.typing);
    syncTypingFormats();
  }
  const key =
    (document.body.classList.contains('dark') ? 'd' : 'l') + Math.round(innerWidth / 30) + cs.map(cardKey).join();
  // never rebuild under an open dropdown for the SAME things (it would yank the slider out from under you); a new selection always gets a fresh bar
  const ids = cs.map(c => c.id).join();
  if (bar.dataset.ids !== ids) {
    closeSbPops();
    bar.dataset.ids = ids;
  }
  if (bar.dataset.key === key || bar.querySelector('.sb-popw.open')) {
    syncDesign();
    return;
  }
  bar.dataset.key = key;
  renderDesign();
  keepFocus(bar, () => {
    bar.innerHTML = ctx.crop ? CROP_BAR : cardBarHtml(cs);
    foldSelbar(bar, barRoom());
  });
  snapSoon();
}

function drawWire(bar: HTMLElement, link: Link) {
  const key = wireKey(link) + Math.round(innerWidth / 30);
  if (bar.dataset.key === key) return;
  bar.dataset.key = key;
  keepFocus(bar, () => {
    bar.innerHTML = wireBarHtml(link);
    foldSelbar(bar, barRoom());
  });
}

// this runs every frame, so it only writes when something changed
function clearBar(bar: HTMLElement) {
  closeSbPops();
  if (bar.dataset.ids) bar.dataset.ids = '';
  if (bar.dataset.key !== '') {
    bar.dataset.key = '';
    renderDesign();
  }
}

function drawBar(bar: HTMLElement, ctx: SelBarContext | null) {
  const show = (on: boolean) => {
    $('dock').classList.toggle('ctx', on); // on a phone the strip takes the hub's place
    bar.classList.toggle('on', on);
  };
  if (!ctx) {
    show(false);
    return clearBar(bar);
  }
  switch (ctx.kind) {
    case 'selection':
      show(true);
      return drawCards(bar, ctx);
    case 'connector':
      show(true);
      return drawWire(bar, ctx.link);
    default: {
      const unknown: never = ctx;
      return unknown;
    }
  }
}

// The content stays current during a gesture though no one sees it: Ctrl+B presses the bar's own Bold, and the bar
// is back the moment the gesture ends. The mode bar goes first, as the selection bar keeps above it.
export function placeSelbar() {
  const bar = $('selbar'),
    ctx = barContext();
  floatModeBar();
  drawBar(bar, ctx);
  floatBar(bar, ctx, barPaused());
}

export function init56() {
  initIcons();
  initFontPop();

  (function tick() {
    placeSelbar();
    drawOverlays();
    requestAnimationFrame(tick);
  })();

  $('selbar').addEventListener('pointerdown', e => e.stopPropagation());
  initShapeFill();
  initWireBar(placeSelbar);
  initTips();
  initPops();
  initLineStyle(placeSelbar);
  initFills();
  initStroke(placeSelbar);
  initCorners();
  initTextBar(placeSelbar);
  initTypingFocus();
  initBarKeys();
  initArrange();
  initActions();
}
