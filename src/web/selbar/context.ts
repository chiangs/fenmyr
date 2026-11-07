import type { Card, Link } from '../../shared/model.ts';
import type { Drag } from '../canvas/drag.ts';
import { byId, linkById } from '../canvas/wires.ts';
import { cropping } from '../cards/crop.ts';
import { find } from '../core/base.ts';
import { $, stage } from '../core/dom.ts';
import { appState, session } from '../core/state.ts';
import { homeAt } from '../library/home.ts';
import { drawOn } from '../tools/draw.ts';
import { selCards } from './selected.ts';
import { editedNoteBody } from './typingFocus.ts';

/** What a context bar is about. Worked out from the board every frame and never stored, so it can't go stale. */
export type BarContext =
  | { kind: 'selection'; cards: Card[]; crop: boolean; typing: boolean }
  | { kind: 'connector'; link: Link; ends: readonly [Card, Card] }
  | { kind: 'tool' };
/** What the selection bar shows: never a tool, which has a bar of its own. */
export type SelBarContext = Exclude<BarContext, { kind: 'tool' }>;

// a colour wheel opened from Settings and really on screen; one opened from the bar keeps the bar
function settingsWheelUp() {
  const cpop = $('cpop');
  return (
    cpop.classList.contains('on') &&
    cpop.classList.contains('tint') &&
    !cpop.classList.contains('from-bar') &&
    cpop.offsetParent !== null &&
    $('settings').classList.contains('on')
  );
}

/** A selected connector, else the selected cards. Null at Home, with nothing selected, or under Settings' colour wheel. */
export function barContext(): SelBarContext | null {
  if (homeAt) return null;
  const link = session.selWire ? linkById(session.selWire) : undefined,
    a = link && byId(link.a),
    b = link && byId(link.b);
  if (link && a && b) return { kind: 'connector', link, ends: [a, b] };
  const cards = selCards(),
    one = cards.length === 1 ? cards[0] : undefined;
  if (!cards.length || settingsWheelUp()) return null;
  return { kind: 'selection', cards, crop: one?.type === 'image' && cropping?.c === one, typing: !!editedNoteBody() };
}

const TOOL: BarContext = { kind: 'tool' };

/** Drawing or find is on. Both can be at once, and their bar holds both, so it doesn't say which. */
export const toolContext = () => (drawOn || find.on ? TOOL : null);

function dragHides(d: Drag): boolean {
  switch (d.mode) {
    case 'move':
      return d.moved; // a press that hasn't moved yet is a click, and the bar stays for it
    case 'pan':
    case 'resize':
    case 'gresize':
    case 'mrotate':
    case 'rotate':
    case 'wire':
    case 'drawbox':
    case 'bend':
    case 'rewire':
    case 'marquee':
      return true;
    default: {
      const unknown: never = d;
      return unknown;
    }
  }
}

/** The bar steps aside while a gesture moves the board or what is on it, and while the view settles after a wheel,
 *  pinch or zoom step. The phone's strip never covers the board, so it stays. */
export const barPaused = () =>
  !document.body.classList.contains('phone') &&
  ((appState.drag !== null && dragHides(appState.drag)) || stage.classList.contains('moving'));
