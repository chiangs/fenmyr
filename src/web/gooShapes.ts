import { rgbOf } from './ui/color.ts';

// her shape: X is berry, the leaves sit on top; the beads are textured in below
export const SIL = [
  '................',
  '................',
  '................',
  '................',
  '.....XX..XX.....',
  '...XXXXXXXXXX...',
  '..XXXXXXXXXXXX..',
  '.XXXXXXXXXXXXXX.',
  '.XXXXXXXXXXXXXX.',
  'XXXXXXXXXXXXXXXX',
  'XXXXXXXXXXXXXXXX',
  '.XXXXXXXXXXXXXX.',
  '.XXXXXXXXXXXXXX.',
  '..XXXXXXXXXXXX..',
  '...XX.XXXX.XX...',
];
export const mix = (a: string, b: string, k: number) => {
  const p = rgbOf,
    A = p(a),
    B = p(b);
  return (
    '#' +
    A.map((v, i) =>
      Math.round(v + ((B[i] ?? v) - v) * k)
        .toString(16)
        .padStart(2, '0'),
    ).join('')
  );
};
