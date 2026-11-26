import type { Card } from '../../shared/model.ts';

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

// what the builder reads from the board: the selected cards, or all of them, without positions or styling, but for a
// wireframe's layout
export const brief = (c: Card, screens: ReadonlyMap<string, Card>) => ({
  ...Object.fromEntries(
    Object.entries(c).filter(
      ([k, v]) => !['x', 'y', 'w', 'h', 'r', 'rot', 'color'].includes(k) && v !== '' && v != null,
    ),
  ),
  ...layout(c, screens),
});
