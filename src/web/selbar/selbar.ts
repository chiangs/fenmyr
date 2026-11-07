import { labelOf } from '../../shared/cardTypes.ts';
import type { Card } from '../../shared/model.ts';
import { $ } from '../core/dom.ts';
import { renderDesign, syncDesign } from '../wireframe/designPanel.ts';
import { arrange } from './arrange.ts';
import { initBarKeys, keepFocus } from './barKeys.ts';
import { closeSbPops, foldSelbar, initIcons, initPops, initTips, snapSoon } from './barKit.ts';
import { collColours, noteColours } from './colours.ts';
import { type BarContext, barContext, barPaused, type SelBarContext } from './context.ts';
import { corners } from './corners.ts';
import { grouping, moreAndDelete, newSection, prototype, section, tilt } from './end.ts';
import { fill, shapeFill, textColour } from './fill.ts';
import { barRoom, floatBar, floatModeBar } from './float.ts';
import { initFontPop } from './fontPop.ts';
import { group } from './group.ts';
import { lineStyle } from './lineStyle.ts';
import { drawOverlays } from './overlays.ts';
import { canvas, crop, doc, due, imageSpot, link, picture, spotify, swatch, tag, tags, vnote } from './own.ts';
import { stroke } from './stroke.ts';
import { syncTypingFormats, text } from './textBar.ts';
import { initTypingFocus } from './typingFocus.ts';
import { wire, wireKey } from './wireBar.ts';

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

const nameOf = (cs: Card[]) => {
  const one = cs.length === 1 ? cs[0] : undefined;
  if (!one) return `${cs.length} selected`;
  // a kanban is a collection drawn as columns, and named for how it looks
  return one.type === 'coll' && one.kanban ? 'Kanban' : labelOf(one.type);
};

const label = group({
  on: ctx => (ctx.kind === 'connector' ? 'Connector' : ctx.crop ? 'Crop' : nameOf(ctx.cards)),
  html: words => `<span class="sb-label">${words}</span>`,
});

// Every group the bar can show, in the order it shows them. Each one says for itself whether it shows.
const GROUPS = [
  label,
  arrange,
  collColours,
  noteColours,
  swatch,
  imageSpot,
  picture,
  tag,
  tags,
  due,
  doc,
  vnote,
  canvas,
  link,
  spotify,
  lineStyle,
  shapeFill,
  text,
  fill,
  textColour,
  stroke,
  corners,
  tilt,
  newSection,
  prototype,
  section,
  grouping,
  moreAndDelete,
  wire,
  crop,
];

const barHtml = (ctx: SelBarContext) => GROUPS.map(g => g.html(ctx)).join('');

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
    bar.innerHTML = barHtml(ctx);
    foldSelbar(bar, barRoom());
  });
  snapSoon();
}

function drawWire(bar: HTMLElement, ctx: Extract<BarContext, { kind: 'connector' }>) {
  const key = wireKey(ctx.link) + Math.round(innerWidth / 30);
  if (bar.dataset.key === key) return;
  bar.dataset.key = key;
  keepFocus(bar, () => {
    bar.innerHTML = barHtml(ctx);
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
      return drawWire(bar, ctx);
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
  // each group's handlers answer only its own buttons, so the order they are wired in doesn't matter
  for (const g of GROUPS) g.init(placeSelbar);
  initTips();
  initPops();
  initTypingFocus();
  initBarKeys();
}
