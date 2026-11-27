import { sizeOf } from '../../shared/cardTypes.ts';
import type { Card } from '../../shared/model.ts';
import { type Bounds, MIN_ZOOM } from '../canvas/handles.ts';
import { applyView } from '../canvas/view.ts';
import { clamp } from '../core/base.ts';
import { $, stage } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { session } from '../core/state.ts';
import { card } from '../model/boards.ts';
import { fitPanel } from '../ui/toolbarConfig.ts';
import { crowdedOut, foldColumn } from './layout.ts';

// A new prototype board's first cards: three notes from Myra on how to start, and her, bouncing on the first one.
// Ordinary cards, so people move, edit or delete them like any other.
// one column, since a prototype board's canvas column is narrow; each note's height fits its words at this width
const W = 400,
  HEIGHTS = [220, 330, 260],
  GAP = 40,
  // where the notes' column starts on the board
  LEFT = 300,
  // Myra stands above the first note
  STAMP_TOP = -62,
  // clear of the widgets, the board's edges and the cards' tilt
  MARGIN = 24,
  // below this a note's words are too small to read
  READABLE = 0.5;

const WHAT_WE_BUILD = `This is where ideas become things you can click. I write the code in a folder of your project’s repo, so nothing is locked inside Fenmyr.

I’m best at components, single screens and short flows you can click through. A whole app? Just because we could doesn’t mean we should 😅`;

const WHAT_I_NEED = `Put these on the board and select the ones that matter before you ask. I read what’s selected every time I build.

What it is, and who it’s for
What should be true when it works
Wireframes or sketches
Real words and numbers, not lorem ipsum

A description and one wireframe is plenty to start. Rules and a style guide for this prototype go in the two docs below.`;

const HOW_WE_WORK = `Ask for one thing at a time, like “build the sign-in screen from my wireframe”. Then tell me what’s wrong with the preview. I’ll take it well, mostly.

Want to fiddle with a colour, a size or some text yourself? Ask, and I’ll give it a control in the preview.

I only write inside this prototype’s folder. Nothing is committed or pushed until you press the button ✦`;

const topOf = (i: number) => HEIGHTS.slice(0, i).reduce((y, h) => y + h + GAP, 0);

// The prototype's own rules and design, as two doc cards with nothing in them yet, one under the other. They start below
// the welcome notes, and the offer to add them to a board made before they existed puts them wherever there is room.
const DOC_H = sizeOf('doc')[1];
export const guideCards = (x: number, y: number): Card[] => [
  card('doc', {
    x,
    y,
    w: W,
    r: -0.5,
    text: 'This prototype’s rules',
    role: 'rules',
  }),
  card('doc', {
    x,
    y: y + DOC_H + GAP,
    w: W,
    r: 0.5,
    text: 'This prototype’s design',
    role: 'design',
  }),
];

export function prototypeWelcome(): Card[] {
  const note = (i: number, name: string, text: string, color: string, r: number, tagText = '') =>
    card('note', {
      x: LEFT,
      y: topOf(i),
      w: W,
      h: HEIGHTS[i] ?? 400,
      r,
      name,
      text,
      color,
      ...(tagText ? { tagText } : {}),
    });
  return [
    note(0, 'A new prototype? Exciting!', WHAT_WE_BUILD, 'butter', -1, 'Welcome!'),
    note(1, 'The more I know, the less I guess', WHAT_I_NEED, 'sky', 0.5),
    note(2, 'Start small, then steer', HOW_WE_WORK, 'mint', 1),
    card('stamp', {
      x: LEFT - 34,
      y: STAMP_TOP,
      w: 56,
      h: 56,
      src: 'stamps/myra-bounce.gif',
      r: -4,
    }),
    ...guideCards(LEFT, topOf(HEIGHTS.length)),
  ];
}

// cards brought to a new prototype, moved as one beside Myra's notes
export function besideWelcome(cards: Card[]) {
  if (!cards.length) return [];
  const dx = LEFT + W + GAP * 2 - Math.min(...cards.map(c => c.x)),
    dy = -Math.min(...cards.map(c => c.y));
  return cards.map(c => ({ ...c, x: c.x + dx, y: c.y + dy }));
}

// A new prototype opens with every card in view: the zoom and place that fit them all, brought ones included, into the
// part of the board column the panels over it leave free, with a margin all round. When that zoom is too small to read,
// the code column folds first to give the board its room: a new prototype has no code to show yet.
export function showWelcome(cards: readonly Bounds[]) {
  let at = fitted(cards);
  if (at.z < READABLE && !crowdedOut('code')) {
    foldColumn('code');
    fitPanel();
    at = fitted(cards);
  }
  session.view = at;
  applyView();
  save();
}

type Rect = { l: number; t: number; r: number; b: number };

// The rooms left on the board once each panel over it is taken out: a panel in the way splits a room into what's left
// of it, right of it, above it and below it.
function rooms(room: Rect, panels: readonly Rect[]): Rect[] {
  const [p, ...rest] = panels;
  if (!p) return [room];
  if (p.r <= room.l || p.l >= room.r || p.b <= room.t || p.t >= room.b) return rooms(room, rest);
  return [
    { ...room, r: Math.min(room.r, p.l - MARGIN) },
    { ...room, l: Math.max(room.l, p.r + MARGIN) },
    { ...room, b: Math.min(room.b, p.t - MARGIN) },
    { ...room, t: Math.max(room.t, p.b + MARGIN) },
  ]
    .filter(q => q.r > q.l && q.b > q.t)
    .flatMap(q => rooms(q, rest));
}

// the widgets, the tools, the mode card and the board's name, as they show over the board
const panels = (): Rect[] =>
  [$('side'), $('tools'), $('modeCard'), stage.querySelector('header.top')]
    .flatMap(el => (el?.checkVisibility() ? [el.getBoundingClientRect()] : []))
    .filter(r => r.width && r.height)
    .map(r => ({ l: r.left, t: r.top, r: r.right, b: r.bottom }));

// the view that shows the cards largest in the room the panels leave, centred in it
function fitted(cards: readonly Bounds[]) {
  const s = stage.getBoundingClientRect(),
    x0 = Math.min(...cards.map(c => c.x)),
    y0 = Math.min(...cards.map(c => c.y)),
    w = Math.max(...cards.map(c => c.x + c.w)) - x0,
    h = Math.max(...cards.map(c => c.y + c.h)) - y0,
    zoomIn = (q: Rect) => clamp(Math.min((q.r - q.l) / w, (q.b - q.t) / h), MIN_ZOOM, 1),
    whole = { l: s.left + MARGIN, t: s.top + MARGIN, r: s.right - MARGIN, b: s.bottom - MARGIN },
    room = rooms(whole, panels()).reduce((a, q) => (zoomIn(q) > zoomIn(a) ? q : a)),
    z = zoomIn(room);
  return {
    x: room.l - s.left + Math.max(0, (room.r - room.l - w * z) / 2) - x0 * z,
    y: room.t - s.top + Math.max(0, (room.b - room.t - h * z) / 2) - y0 * z,
    z,
  };
}
