import type { Pixel } from './goo.ts';
import { SIL } from './gooShapes.ts';

const LEAVES: Record<string, Pixel> = {
  '6,0': 'l',
  '9,0': 'l',
  '3,1': 'l',
  '4,1': 'L',
  '5,1': 'L',
  '6,1': 'l',
  '9,1': 'l',
  '10,1': 'L',
  '11,1': 'L',
  '12,1': 'l',
  '4,2': 'l',
  '5,2': 'L',
  '6,2': 'L',
  '7,2': 'l',
  '8,2': 'l',
  '9,2': 'L',
  '10,2': 'L',
  '11,2': 'l',
  '6,3': 'l',
  '7,3': 'l',
  '8,3': 'l',
  '9,3': 'l',
};
// B body, S bead shine, s soft shine, D seam between beads, d shade along her bottom edge; L/l leaves
export const grid = SIL.map((row, y) =>
  [...row].map((c, x): Pixel | null => {
    const leaf = LEAVES[`${x},${y}`];
    if (leaf) return leaf;
    if (c !== 'X') return null;
    if (y === 14 || SIL[y + 1]?.[x] !== 'X') return 'd';
    const off = (Math.floor(y / 3) % 2) * 2;
    if (y % 3 === 1 && (x + off) % 4 === 1) return 'S';
    if (y % 3 === 1 && (x + off) % 4 === 2) return 's';
    if (y % 3 === 0 && (x + off) % 4 === 3) return 'D';
    return 'B';
  }),
);
