import { TILTS } from '../canvas/render.ts';
import { COLOR_NAMES, COLORS } from '../core/base.ts';
import { remember } from '../core/history.ts';
import { session } from '../core/state.ts';
import { removeSelected } from '../myra/helpers.ts';
import { prototypeThis } from '../repo/start.ts';
import { makeSection, renameSection } from '../wireframe/sections.ts';
import { groupSel } from '../wireframe/stack.ts';
import { openTiltPop, removeSection } from '../wireframe/tilt.ts';
import { btn, G, moreHtml, redraw, SEP } from './barKit.ts';
import { colorDot, colorPop } from './colours.ts';
import { cards, group, many, onBar, one, only } from './group.ts';

// Reset lives in the tilt box
export const tilt = group({
  on: ctx => {
    const c = one(ctx);
    return c && TILTS(c) ? c : null;
  },
  html: one => {
    const seen = one.type === 'stamp' && !one.tilted ? 0 : Math.round(one.r || 0),
      icon = Icon('refresh');
    return G(
      3,
      `${SEP}<button class="sb-tilt" data-sb="tiltpop" title="Tilt">${icon}<span class="sb-deg">${seen}°</span></button>`,
    );
  },
  init: () =>
    onBar('sb', (a, [one], b) => {
      if (a === 'tiltpop') openTiltPop(one, b);
    }),
});

// this and Prototype this tuck into ··· before the text controls do
export const newSection = group({
  on: many,
  html: () =>
    G(
      9,
      `${SEP}<button class="sb-txt sb-glass" data-sb="section" title="Create section · ⌥⌘G">Create section</button>`,
    ),
  init: () =>
    onBar('sb', (a, cs) => {
      if (a === 'section') makeSection(cs);
    }),
});

export const prototype = group({
  on: ctx => {
    const cs = cards(ctx);
    return cs?.some(c => c.type === 'frame') && session.board.kind !== 'prototype' ? cs : null;
  },
  html: () =>
    G(
      9,
      `${SEP}<button class="sb-txt sb-glass" data-sb="prototype" title="Make a clickable prototype from these screens">Prototype this</button>`,
    ),
  init: () =>
    onBar('sb', (a, cs) => {
      if (a === 'prototype') prototypeThis(cs);
    }),
});

export const section = group({
  on: ctx => only(ctx, 'section'),
  html: one => {
    const dots = COLOR_NAMES.map(n => colorDot('sc', n, COLORS[n] ?? '', (one.color || 'white') === n)).join('');
    return (
      `<button class="sb-txt" data-sb="rensection" title="Rename">Rename</button>` +
      `<button class="sb-txt" data-sb="unsection" title="Remove section">Remove section</button>${SEP}` +
      G(2, colorPop(COLORS[one.color ?? ''] || '#fff', dots))
    );
  },
  init: () => {
    onBar('sb', (a, cs) => {
      const [one] = cs;
      if (a === 'unsection') removeSection(cs.filter(c => c.type === 'section'));
      if (a === 'rensection') renameSection(one);
    });
    onBar('sc', (sc, [one]) => {
      if (one.type !== 'section') return;
      remember();
      one.color = sc;
      redraw([one]);
    });
  },
});

export const grouping = group({
  on: many,
  html: cs => {
    const grouped = cs.every(c => c.group && c.group === cs[0].group),
      act = grouped ? 'ungroup' : 'group',
      tip = grouped ? 'Ungroup · ⇧⌘G' : 'Group · ⌘G',
      label = grouped ? 'Ungroup' : 'Group';
    return G(8, `${SEP}<button class="sb-txt" data-sb="${act}" title="${tip}">${label}</button>`);
  },
  init: () =>
    onBar('sb', a => {
      if (a !== 'group' && a !== 'ungroup') return;
      remember();
      groupSel(a === 'group');
    }),
});

export const moreAndDelete = group({
  on: cards,
  html: () => moreHtml() + SEP + btn('del', 'del', 'Delete'),
  init: () =>
    onBar('sb', a => {
      if (a === 'del') removeSelected();
    }),
});
