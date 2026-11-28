import type { Card, Link } from '../../shared/model.ts';
import { type Arrow, arrowOf } from '../../shared/wireArrow.ts';

const round = Math.round;

// A screen's pieces mean little without where they sit, and a picture of the screen can't be taken when it isn't in
// view, so each screen sends its size and each piece its place and size inside it, in px.
function layout(c: Card, screens: ReadonlyMap<string, Card>) {
  if (c.type === 'frame') return { size: { w: round(c.w), h: round(c.h) } };
  const screen = c.onFrame ? screens.get(c.onFrame) : undefined;
  if (!screen) return {};
  return { at: { x: round(c.x - screen.x), y: round(c.y - screen.y), w: round(c.w), h: round(c.h) } };
}

/** The wireframe screens among `cards`, by id, which `brief` measures each piece's place from. */
export const screensOf = (cards: readonly Card[]) => new Map(cards.filter(c => c.type === 'frame').map(c => [c.id, c]));

type Wire = { to: string; arrow: Arrow };

/** The wires between `cards`, each under the card it starts from, which `brief` lists them on. A wire to a card that is
 *  not among them is left out: the builder has nothing to read at its other end. */
export function wiresOf(cards: readonly Card[], links: readonly Link[]) {
  const sent = new Set(cards.map(c => c.id)),
    from = new Map<string, Wire[]>();
  for (const l of links)
    if (sent.has(l.a) && sent.has(l.b)) from.set(l.a, [...(from.get(l.a) ?? []), { to: l.b, arrow: arrowOf(l) }]);
  return from;
}

// what the builder reads from the board: the selected cards, or all of them, without positions or styling, but for a
// wireframe's layout and the wires drawn from the card
export const brief = (c: Card, screens: ReadonlyMap<string, Card>, wires: ReadonlyMap<string, Wire[]>) => ({
  ...Object.fromEntries(
    Object.entries(c).filter(
      ([k, v]) => !['x', 'y', 'w', 'h', 'r', 'rot', 'color'].includes(k) && v !== '' && v != null,
    ),
  ),
  ...layout(c, screens),
  ...(wires.has(c.id) ? { wires: wires.get(c.id) } : {}),
});
