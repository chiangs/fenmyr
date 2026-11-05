import { zoneOf } from './areas.ts';

export type Tint = { h: number; s: number };

const FIXED: Record<string, Tint> = {
  host: { h: 32, s: 66 },
  shared: { h: 172, s: 50 },
  static: { h: 210, s: 14 },
  tests: { h: 262, s: 24 },
  'tests/smoke': { h: 262, s: 24 },
  tools: { h: 0, s: 0 },
  other: { h: 0, s: 0 },
};

// one hue for each renderer area, spread round the wheel; the other zones keep one colour each
export function tints(areas: string[]): Map<string, Tint> {
  const out = new Map<string, Tint>();
  const renderer = areas.filter(a => zoneOf(a) === 'renderer').sort();
  renderer.forEach((a, i) => {
    out.set(a, { h: (i * 137.5 + 205) % 360, s: 44 + (i % 3) * 7 });
  });
  for (const a of areas) {
    const fixed = FIXED[a];
    if (fixed) out.set(a, fixed);
  }
  return out;
}

// lightness is left to the caller so that a page and an image can each follow light and dark
export const hsl = (t: Tint | undefined, lightness: string) =>
  `hsl(${Math.round(t?.h ?? 0)} ${t?.s ?? 0}% ${lightness})`;
