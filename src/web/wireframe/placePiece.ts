import type { Card, CardOf } from '../../shared/model.ts';
import { renderCard } from '../canvas/render.ts';
import { renderWires, selectOnly } from '../canvas/wires.ts';
import { uid } from '../core/base.ts';
import { remember, save } from '../core/history.ts';
import { session } from '../core/state.ts';
import { card } from '../model/boards.ts';
import { revealCards } from '../panels/zoomMenu.ts';
import type { Box } from '../selbar/place.ts';
import { addCard } from '../tools/penEdit.ts';
import { newCard } from '../tools/place.ts';
import { PIECES } from './pieces.ts';
import { fileIntoFrame } from './tilt.ts';

type Point = { x: number; y: number };
type Screen = CardOf<'frame'>;

// a tab bar keeps the bottom of a screen
const TAB_ROOM = 90;
const margin = (f: Card) => (f.w > 700 ? 64 : 24);
const tabBarOf = (f: Card) => session.board.cards.filter(c => c.onFrame === f.id && c.y >= f.y + f.h - TAB_ROOM);

// Adding into a screen that is full: it grows, and the tab bar slides down with its bottom edge.
function makeRoom(f: Card, bottom: number, tabKids: Card[]) {
  const grow = bottom - (f.y + f.h - (tabKids.length ? TAB_ROOM : 12)) + 24;
  if (grow <= 24) return;
  f.h += grow;
  renderCard(f);
  tabKids.forEach(c => {
    c.y += grow;
    renderCard(c);
  });
}

// frame: the screen to add it to; center: put its middle at w instead of its corner
export function placePiece(name: string | undefined, w: Point, opts: { frame?: Screen; center?: boolean } = {}) {
  const P = name ? PIECES[name] : undefined;
  if (!P) return [];
  const f =
      opts.frame ||
      [...session.board.cards]
        .reverse()
        .find(f => f.type === 'frame' && w.x > f.x && w.x < f.x + f.w && w.y > f.y && w.y < f.y + f.h),
    M = f ? margin(f) : 24;
  const W = (P.bar || P.web) && f ? f.w : P.web ? 1200 : Math.min(P.w || 360, f ? f.w - M * 2 : Infinity),
    items = P.make(W, { byHand: true });
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
  const tabKids = f && opts.frame ? tabBarOf(f) : [];
  const g = uid(),
    made = items.map(it => {
      const c = card(it.type, { ...it, x: ox + it.x, y: oy + it.y, r: 0, group: g });
      session.board.cards.push(c);
      renderCard(c, true);
      return c;
    });
  if (f && opts.frame && !P.bar) makeRoom(f, oy + bh, tabKids);
  fileIntoFrame(made);
  selectOnly(made.map(c => c.id));
  renderWires();
  save();
  return made;
}

// The top of the next free spot in a screen's body: under its lowest piece, leaving the bottom for a tab bar. An empty
// phone screen starts under its status bar. A web section sits flush against the one above.
function nextSlot(f: Screen, web: boolean) {
  const body = session.board.cards.filter(c => c.onFrame === f.id && c.y < f.y + f.h - TAB_ROOM);
  if (body.length) return Math.max(...body.map(c => c.y + c.h)) + (web ? 0 : 16);
  return f.y + (f.w <= 500 ? 44 : 0) + (web ? 0 : 20);
}

/** A pick from the Pieces picker: the piece or icon goes into the screen at its next free spot,
 *  as its own undo step, and is selected and brought into view, into `area` when the picker leaves only part of it.
 *  Bars go to the screen's top or bottom edge. */
export function addToScreen(f: Screen, what: { kind: 'piece' | 'icon'; name: string }, area?: Box): Card[] {
  remember();
  const z = session.view.z,
    x = f.x + margin(f);
  let made: Card[] = [];
  switch (what.kind) {
    case 'piece': {
      const P = PIECES[what.name];
      if (!P) return [];
      const y = nextSlot(f, !!P.web);
      made = placePiece(
        what.name,
        { x: x + 14 / z, y: P.bar === 'bottom' ? f.y + f.h : P.bar === 'top' ? f.y : y + 14 / z },
        { frame: f },
      );
      break;
    }
    case 'icon': {
      const c = newCard('icon', { name: what.name });
      if (!c) return [];
      c.x = x;
      c.y = nextSlot(f, false);
      makeRoom(f, c.y + c.h, tabBarOf(f));
      addCard(c);
      fileIntoFrame([c]);
      selectOnly([c.id]);
      made = [c];
      break;
    }
    default: {
      const unknown: never = what.kind;
      return unknown;
    }
  }
  revealCards(made, area);
  return made;
}
