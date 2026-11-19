import type { Card } from '../../shared/model.ts';
import { mrot, realBox, tiltOf } from '../canvas/handles.ts';
import { wireGeom } from '../canvas/wires.ts';
import { $, stage } from '../core/dom.ts';
import { session } from '../core/state.ts';
import { freeOf } from '../myra/chatRules.ts';
import { chatOverBoard, setModeBar } from '../myra/chatWindow.ts';
import { type BarContext, toolContext } from './context.ts';
import { type Anchor, type Box, GAP, place } from './place.ts';

// the turn dot stands this far above a selection on screen, at any zoom
const TURN_DOT = 42;

const onPhone = () => document.body.classList.contains('phone');

const toStage = (p: { x: number; y: number }) => {
  const { x, y, z } = session.view;
  return { x: p.x * z + x, y: p.y * z + y };
};

// the selected cards' outline on the board, each turned card counted by the box around it
function worldBox(cs: readonly Card[]): Box {
  const box = { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity };
  for (const c of cs) {
    const { w, h } = realBox(c),
      a = (tiltOf(c) * Math.PI) / 180,
      cos = Math.abs(Math.cos(a)),
      sin = Math.abs(Math.sin(a)),
      hw = (w * cos + h * sin) / 2,
      hh = (w * sin + h * cos) / 2,
      cx = c.x + w / 2,
      cy = c.y + h / 2;
    box.l = Math.min(box.l, cx - hw);
    box.t = Math.min(box.t, cy - hh);
    box.r = Math.max(box.r, cx + hw);
    box.b = Math.max(box.b, cy + hh);
  }
  return box;
}

function anchorFor(ctx: BarContext): Anchor | null {
  switch (ctx.kind) {
    case 'selection': {
      const w = worldBox(ctx.cards),
        lt = toStage({ x: w.l, y: w.t }),
        rb = toStage({ x: w.r, y: w.b }),
        dot = mrot.classList.contains('on') ? TURN_DOT : 0; // the bar never covers the dot, so turning still works
      return { box: { l: lt.x, t: lt.y - dot, r: rb.x, b: rb.y }, prefer: 'above' };
    }
    case 'connector': {
      const g = wireGeom(ctx.link, ...ctx.ends),
        p = toStage(g.handle);
      return { box: { l: p.x, t: p.y, r: p.x, b: p.y }, prefer: Math.abs(g.n.y) >= Math.abs(g.n.x) ? 'above' : 'left' };
    }
    case 'tool': {
      const d = document.getElementById('tools')?.getBoundingClientRect(),
        s = stage.getBoundingClientRect();
      if (!d?.height) return null;
      return {
        box: { l: d.left - s.left, t: d.top - s.top, r: d.right - s.left, b: d.bottom - s.top },
        prefer: 'left',
      };
    }
    default: {
      const unknown: never = ctx;
      return unknown;
    }
  }
}

function overBottomBar(): Anchor {
  const d = $('dock').getBoundingClientRect(),
    s = stage.getBoundingClientRect();
  return { box: { l: d.left - s.left, t: d.top - s.top, r: d.right - s.left, b: d.bottom - s.top }, prefer: 'above' };
}

const rectsIn = (id: string) =>
  [...(document.getElementById(id)?.children ?? [])]
    .filter(el => el.checkVisibility())
    .map(el => el.getBoundingClientRect())
    .filter(r => r.width && r.height);

// The open Pieces picker counts as a side column on the side it docked, or as a floor when it is a sheet across the
// bottom, so the selection bar keeps clear of it. The mode bar sits beside the tools, below it, and stays where it is.
function pickerColumn(placing?: HTMLElement): { l: number[]; r: number[]; b: number[] } {
  const p = document.getElementById('piecePick');
  if (!p || p === placing || placing?.id === 'modebar' || p.hidden || onPhone()) return { l: [], r: [], b: [] };
  const r = p.getBoundingClientRect(),
    s = stage.getBoundingClientRect();
  if (p.dataset.dock === 'left') return { l: [r.right - s.left + GAP], r: [], b: [] };
  if (p.dataset.dock === 'right') return { l: [], r: [r.left - s.left - GAP], b: [] };
  return { l: [], r: [], b: [r.top - s.top - GAP] };
}

// The part of the board nothing else covers, in stage pixels: right of the left widgets, left of the right ones and the
// tools, under the header and its saved line, above the bottom bar. A bar the tools would leave too little board for
// beside them goes under them instead, as on a narrow prototype board. The mode bar beside the tools is a ceiling for
// the other bars, and over the bottom bar, where one too wide for that room goes, a floor; it does not count the tools
// for itself. Read from the screen, so moved widgets, a folded tray and a prototype's narrower board all count.
function readFrame(placing?: HTMLElement): Box {
  const s = stage.getBoundingClientRect(),
    picker = pickerColumn(placing),
    head = [document.querySelector('.top'), document.getElementById('saved')]
      .filter(el => el?.checkVisibility())
      .map(el => el?.getBoundingClientRect().bottom ?? 0),
    tools = document.getElementById('tools'),
    panel = tools?.checkVisibility() && placing?.id !== 'modebar' ? [tools.getBoundingClientRect()] : [],
    mode = document.getElementById('modebar'),
    modeBox = mode && mode !== placing && mode.checkVisibility() ? mode.getBoundingClientRect() : null,
    ceiling = modeBox?.height && mode?.dataset.side === 'left' ? [modeBox.bottom] : [],
    floor = [document.getElementById('dock')?.getBoundingClientRect(), ceiling.length ? null : modeBox]
      .filter((r): r is DOMRect => !!r?.height)
      .map(r => r.top - s.top - GAP);
  const l = Math.max(
      GAP,
      ...rectsIn('side')
        .filter(r => r.right > s.left)
        .map(r => r.right - s.left + GAP),
      ...picker.l,
    ),
    rightOf = (rects: DOMRect[]) =>
      Math.min(s.width - GAP, ...rects.filter(r => r.left < s.right).map(r => r.left - s.left - GAP), ...picker.r),
    beside = rightOf([...rectsIn('sideR'), ...panel]),
    clear = rightOf(rectsIn('sideR')),
    under = !!placing && beside < clear && beside - l < placing.offsetWidth;
  return {
    l,
    t: Math.max(GAP, ...[...head, ...ceiling, ...(under ? panel.map(r => r.bottom) : [])].map(b => b - s.top + GAP)),
    r: under ? clear : beside,
    b: Math.min(s.height - GAP, ...floor, ...picker.b),
  };
}

/** The free view less an open chat, in stage pixels, for something docked beside a card on the board. */
export function dockFrame(docking: HTMLElement): Box {
  const s = stage.getBoundingClientRect(),
    chat = chatOverBoard();
  return freeOf(
    readFrame(docking),
    chat && { l: chat.l - s.left, t: chat.t - s.top, r: chat.r - s.left, b: chat.b - s.top },
  );
}

const writeData = (el: HTMLElement, key: 'side' | 'stuck', value: string) => {
  if (el.dataset[key] !== value) el.dataset[key] = value;
};

/** Puts the bar beside what it is for. It writes only what changed, and reads nothing while paused, when it fades out
 *  where it is. On a phone the bar is the strip in the bottom bar, so it is left where the dock puts it. */
export function floatBar(bar: HTMLElement, ctx: BarContext | null, paused: boolean) {
  if (onPhone()) {
    if (bar.style.translate) bar.style.translate = '';
    delete bar.dataset.side;
    delete bar.dataset.stuck;
    bar.classList.remove('paused');
    return;
  }
  if (paused) {
    bar.classList.add('paused');
    return;
  }
  const anchor = ctx && anchorFor(ctx);
  if (!anchor) return;
  const frame = readFrame(bar),
    size = { w: bar.offsetWidth, h: bar.offsetHeight },
    beside = place(anchor, frame, size),
    // a mode bar too wide for the room left of the tools sits over the bottom bar, as it did before they moved
    p = ctx.kind === 'tool' && beside.side !== 'left' ? place(overBottomBar(), frame, size) : beside,
    d = devicePixelRatio || 1,
    snap = (v: number) => Math.round(v * d) / d,
    at = `${snap(p.x)}px ${snap(p.y)}px`;
  if (bar.style.translate !== at) bar.style.translate = at;
  writeData(bar, 'side', p.side);
  writeData(bar, 'stuck', p.stuck ?? '');
  bar.classList.remove('paused');
}

/** Holds the mode bar (drawing's, find's and the screen tool's rows) left of the tools, or over the bottom bar when it
 *  is too wide for that room, pinned to them, not the board, so no gesture moves it. It lifts Myra's bubble and a wide
 *  chat by its height, which is needed only over the bottom bar. */
export function floatModeBar() {
  const bar = $('modebar'),
    ctx = toolContext(),
    shown = ctx && !onPhone() && !stage.classList.contains('doc-open'),
    lift = shown ? bar.offsetHeight + GAP : 0;
  if (document.body.style.getPropertyValue('--mode-h') !== `${lift}px`)
    document.body.style.setProperty('--mode-h', `${lift}px`);
  floatBar(bar, ctx, false);
  // over the bottom bar, her chat joins it only when this bar fits left of her box, from as far left as it can sit;
  // beside the tools it reaches under no joined chat, which keeps below it instead
  const over = shown && bar.dataset.side !== 'left';
  setModeBar(over ? { lift, l: readFrame(bar).l + stage.getBoundingClientRect().left, w: bar.offsetWidth } : null);
}

/** How wide the bar may grow before groups tuck into ···: the free view, or on a phone the strip beside Myra. */
export function barRoom() {
  if (!onPhone()) {
    const f = readFrame();
    return f.r - f.l;
  }
  const s = stage.getBoundingClientRect(),
    m = document.getElementById('mPill')?.getBoundingClientRect();
  return Math.max(260, (m && m.left > s.left ? m.left - 16 : s.right - 16) - (s.left + 16));
}

/** Whether a popup h px tall opens above the bar: on the side away from what the bar is for, unless only the other
 *  side has room on screen. */
export function opensUp(bar: HTMLElement, h: number) {
  const r = bar.getBoundingClientRect(),
    up = r.top - h >= GAP,
    down = r.bottom + h <= innerHeight - GAP;
  return bar.dataset.side !== 'below' && bar.dataset.stuck !== 'top' ? up || !down : up && !down;
}
