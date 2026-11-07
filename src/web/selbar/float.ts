import type { Card } from '../../shared/model.ts';
import { mrot, realBox, tiltOf } from '../canvas/handles.ts';
import { wireGeom } from '../canvas/wires.ts';
import { $, stage } from '../core/dom.ts';
import { session } from '../core/state.ts';
import { chatPlace, relayout } from '../myra/chatWindow.ts';
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
        prefer: 'above',
      };
    }
    default: {
      const unknown: never = ctx;
      return unknown;
    }
  }
}

const rectsIn = (id: string) =>
  [...(document.getElementById(id)?.children ?? [])]
    .filter(el => el.checkVisibility())
    .map(el => el.getBoundingClientRect())
    .filter(r => r.width && r.height);

// The part of the board nothing else covers, in stage pixels: right of the left widgets, left of the right ones, under
// the header and its saved line, above the bottom bar and the mode bar on it (unless that is the bar being placed).
// Read from the screen, so moved widgets, a folded tray and a prototype's narrower board all count.
function readFrame(placing?: HTMLElement): Box {
  const s = stage.getBoundingClientRect(),
    head = [document.querySelector('.top'), document.getElementById('saved')]
      .filter(el => el?.checkVisibility())
      .map(el => el?.getBoundingClientRect().bottom ?? 0),
    floor = [document.getElementById('dock'), document.getElementById('modebar')]
      .filter((el): el is HTMLElement => !!el && el !== placing)
      .map(el => el.getBoundingClientRect())
      .filter(r => r.height)
      .map(r => r.top - s.top - GAP);
  return {
    l: Math.max(
      GAP,
      ...rectsIn('side')
        .filter(r => r.right > s.left)
        .map(r => r.right - s.left + GAP),
    ),
    t: Math.max(GAP, ...head.map(b => b - s.top + GAP)),
    r: Math.min(
      s.width - GAP,
      ...rectsIn('sideR')
        .filter(r => r.left < s.right)
        .map(r => r.left - s.left - GAP),
    ),
    b: Math.min(s.height - GAP, ...floor),
  };
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
    chat = ctx.kind === 'tool' ? chatPlace() : null;
  // drawing's and find's bar keeps to the left of a chat joined to the tools
  if (chat?.kind === 'joined') frame.r = Math.min(frame.r, chat.chat.l - stage.getBoundingClientRect().left - GAP);
  const p = place(anchor, frame, { w: bar.offsetWidth, h: bar.offsetHeight }),
    d = devicePixelRatio || 1,
    snap = (v: number) => Math.round(v * d) / d,
    at = `${snap(p.x)}px ${snap(p.y)}px`;
  if (bar.style.translate !== at) bar.style.translate = at;
  writeData(bar, 'side', p.side);
  writeData(bar, 'stuck', p.stuck ?? '');
  bar.classList.remove('paused');
}

/** Holds drawing's and find's bar over the tools, and lifts Myra's bubble, a wide chat and the toolbar's pickers over
 *  it, as they sit at its height. It is pinned to the bottom bar, not the board, so no gesture moves it. */
export function floatModeBar() {
  const bar = $('modebar'),
    ctx = toolContext(),
    shown = ctx && !onPhone() && !stage.classList.contains('doc-open'),
    lift = shown ? `${bar.offsetHeight + GAP}px` : '0px';
  if (document.body.style.getPropertyValue('--mode-h') !== lift) {
    document.body.style.setProperty('--mode-h', lift);
    relayout(); // a wide chat rises over the bar
  }
  floatBar(bar, ctx, false);
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
