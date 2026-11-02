type Point = { x: number; y: number };
type Box = Point & { w: number; h: number };

const GAP = 60;

const nearestFirst = (values: number[], wanted: number) =>
  [...new Set(values)].sort((a, b) => Math.abs(a - wanted) - Math.abs(b - wanted));

// The closest free position always has each axis either where it was asked for or just clear of some other card's
// edge, so those are the only places worth trying. Nearest first lets most of them be skipped on a big board.
export function nearestEmptySpot(size: { w: number; h: number }, centre: Point, others: Box[]): Point {
  const wanted = { x: centre.x - size.w / 2, y: centre.y - size.h / 2 };
  const xs = nearestFirst([wanted.x, ...others.flatMap(o => [o.x - size.w - GAP, o.x + o.w + GAP])], wanted.x);
  const ys = nearestFirst([wanted.y, ...others.flatMap(o => [o.y - size.h - GAP, o.y + o.h + GAP])], wanted.y);
  const isFree = (x: number, y: number) =>
    !others.some(o => o.x < x + size.w + GAP && x < o.x + o.w + GAP && o.y < y + size.h + GAP && y < o.y + o.h + GAP);
  let best = wanted;
  let bestDistance = Infinity;
  for (const x of xs) {
    const dx = (x - wanted.x) ** 2;
    if (dx >= bestDistance) break;
    for (const y of ys) {
      const distance = dx + (y - wanted.y) ** 2;
      if (distance >= bestDistance) break;
      if (isFree(x, y)) {
        best = { x, y };
        bestDistance = distance;
        break;
      }
    }
  }
  return best;
}
