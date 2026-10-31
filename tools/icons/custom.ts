// Myra's own icons, on a 24 grid with a 1.5 stroke (Phosphor regular's weight), in both weights:
// r is outline only, d is duotone. Classes: s stroke, f filled, t the tint, t2 the leaf tint.
type Point = [x: number, y: number];
export type CustomIcon = { r: string; d: string; kw: string };

const BEADS = 7;
const TOP = -Math.PI / 2;
const f2 = (n: number) => Number(n.toFixed(2));
const at = (p: Point) => `${f2(p[0])} ${f2(p[1])}`;

// a scalloped berry: round beads around a ring, outlined as one shape
function berry(cx: number, cy: number, s: number) {
  const ring = 4.2 * s;
  const r = 2.6 * s;
  const b = 2 * ring * Math.cos(Math.PI / BEADS);
  const c = ring * ring - r * r;
  const rho = (b + Math.sqrt(b * b - 4 * c)) / 2;
  const point = (k: number): Point => {
    const a = TOP - Math.PI / BEADS + (2 * Math.PI * k) / BEADS;
    return [cx + rho * Math.cos(a), cy + rho * Math.sin(a)];
  };
  const radius = f2(r);
  const arcs = Array.from({ length: BEADS }, (_, k) => {
    const end = at(point((k + 1) % BEADS));
    return `A${radius} ${radius} 0 0 1 ${end}`;
  }).join('');
  const start = at(point(0));
  return { d: `M${start}${arcs}Z`, top: cy - ring - r };
}

// one leaf of the crown; side -1 is the left one, 1 the right
function leaf(x: number, y: number, s: number, side: -1 | 1) {
  const p = (px: number, py: number): Point => [x + side * px * s, y + py * s];
  const start = at([x, y]);
  return `M${start}C${at(p(1.8, 0.1))} ${at(p(3.6, -0.8))} ${at(p(4, -2.8))}C${at(p(1.8, -2.9))} ${at(p(0.1, -2))} ${start}Z`;
}

function dots(list: Point[], radius: number, cls: string) {
  const r = f2(radius);
  return list
    .map(([x, y]) => {
      const cx = f2(x);
      const cy = f2(y);
      return `<circle class="${cls}" cx="${cx}" cy="${cy}" r="${r}"/>`;
    })
    .join('');
}

function path(cls: string, d: string) {
  return `<path class="${cls}" d="${d}"/>`;
}

const tinted = (duo: boolean, tint: string) => (duo ? `s ${tint}` : 's');

function mark(cx: number, cy: number, s: number, duo: boolean) {
  const { d, top } = berry(cx, cy, s);
  const crown = leaf(cx, top + 0.3 * s, s, -1) + leaf(cx, top + 0.3 * s, s, 1);
  // beads big enough to still show at 16 px
  const beads = dots(
    [
      [cx - 1.9 * s, cy - 0.6 * s],
      [cx + 1.8 * s, cy - 1.1 * s],
      [cx - 0.1 * s, cy + 2.3 * s],
    ],
    0.8 * s,
    'f',
  );
  return path(tinted(duo, 't'), d) + path(tinted(duo, 't2'), crown) + beads;
}

function label(duo: boolean) {
  // no leaf crown, so the berry itself can be bigger
  const s = 1.12;
  const cx = 12;
  const cy = 9.6;
  const beads = dots(
    [
      [cx - 1.9 * s, cy - 0.6 * s],
      [cx + 1.8 * s, cy - 1.1 * s],
      [cx - 0.1 * s, cy + 2.3 * s],
    ],
    0.85,
    'f',
  );
  return (
    path(tinted(duo, 't'), berry(cx, cy, s).d) +
    beads +
    path('s', 'M4 21.6c1.9-1.1 3-1.1 4 0s2.1 1.1 4 0 3-1.1 4 0 2.1 1.1 4 0')
  );
}

function chat(duo: boolean) {
  const crown = leaf(11.3, 6.6, 0.72, -1) + leaf(12.7, 6.6, 0.72, 1);
  const beads = dots(
    [
      [9.2, 11.6],
      [14.8, 11.6],
      [12, 14.8],
    ],
    1.25,
    'f',
  );
  return path(tinted(duo, 't'), BUBBLE) + path(tinted(duo, 't2'), crown) + beads;
}

const STAR = 'M18.6 2.6l.85 2.35 2.35.85-2.35.85-.85 2.35-.85-2.35-2.35-.85 2.35-.85z';
const BUBBLE =
  'M6.5 7h11A3.5 3.5 0 0 1 21 10.5v5a3.5 3.5 0 0 1-3.5 3.5H11l-4 3.4V19h-.5A3.5 3.5 0 0 1 3 15.5v-5A3.5 3.5 0 0 1 6.5 7z';

// scales 24-grid markup up to the 256 view box the pack's icons use
const wrap = (inner: string) => `<g transform="scale(10.6667)">${inner}</g>`;
const both = (draw: (duo: boolean) => string, kw: string): CustomIcon => ({
  r: wrap(draw(false)),
  d: wrap(draw(true)),
  kw,
});

export const custom: Record<string, CustomIcon> = {
  'fenmyr-mark': both(duo => mark(12, 14.2, 1, duo), 'fenmyr cloudberry berry logo'),
  'myra-tool': both(duo => mark(10.6, 15, 0.8, duo) + path(tinted(duo, 't'), STAR), 'ask myra ai assistant sparkle'),
  'berry-label': both(label, 'label handwritten note word'),
  'myra-chat': both(chat, 'chat talk message myra'),
};
