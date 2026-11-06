// Where a context bar goes, as plain geometry: it imports nothing, so tests/barPlace.ts runs it in Node.

/** Stage pixels. */
export type Box = { l: number; t: number; r: number; b: number };
export type Size = { w: number; h: number };
export type Side = 'above' | 'below' | 'left' | 'right';
/** What the bar sits beside, and the side it would rather be on. A connector's box is a point: the curve's midpoint. */
export type Anchor = { box: Box; prefer: Side };
/** The bar's top-left, the side it ended on, and the edge of the free view holding it when neither side had room. */
export type Placement = { x: number; y: number; side: Side; stuck: 'top' | 'bottom' | null };

const GAP = 12;

const OPPOSITE: Record<Side, Side> = { above: 'below', below: 'above', left: 'right', right: 'left' };
const upright = (s: Side) => s === 'above' || s === 'below';

// a bar longer than the room starts at its near edge
const slide = (v: number, lo: number, hi: number) => (hi < lo ? lo : Math.min(hi, Math.max(lo, v)));

function spot(side: Side, box: Box, frame: Box, { w, h }: Size) {
  const x = slide((box.l + box.r - w) / 2, frame.l, frame.r - w),
    y = slide((box.t + box.b - h) / 2, frame.t, frame.b - h);
  switch (side) {
    case 'above':
      return { x, y: box.t - GAP - h };
    case 'below':
      return { x, y: box.b + GAP };
    case 'left':
      return { x: box.l - GAP - w, y };
    case 'right':
      return { x: box.r + GAP, y };
    default: {
      const unknown: never = side;
      return unknown;
    }
  }
}

const fits = (side: Side, p: { x: number; y: number }, frame: Box, { w, h }: Size) =>
  upright(side) ? p.y >= frame.t && p.y + h <= frame.b : p.x >= frame.l && p.x + w <= frame.r;

/**
 * Tries the preferred side, then the opposite one; a bar that prefers the left or right then tries above and below.
 * The first that fits the free view along its own axis wins, slid along the other axis to stay inside. When none
 * fits, the bar is held at the top of the view (a tall selection, or one above the view) or at its bottom (one below).
 */
export function place({ box, prefer }: Anchor, frame: Box, size: Size): Placement {
  const tries: Side[] = upright(prefer) ? [prefer, OPPOSITE[prefer]] : [prefer, OPPOSITE[prefer], 'above', 'below'];
  for (const side of tries) {
    const p = spot(side, box, frame, size);
    if (fits(side, p, frame, size)) return { ...p, side, stuck: null };
  }
  const side = upright(prefer) ? prefer : 'above',
    under = box.t - GAP > frame.b;
  return {
    x: spot(side, box, frame, size).x,
    y: under ? Math.max(frame.t, frame.b - size.h) : frame.t,
    side,
    stuck: under ? 'bottom' : 'top',
  };
}
