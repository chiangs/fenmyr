import type { InkPoint } from '../../shared/model.ts';

// ---------- ink: how a drawn line looks. A soft pen that swells where you slowed down, a marker and a highlighter ----------
type Sample = { x: number; y: number; v?: number };
const ORIGIN: Sample = { x: 0, y: 0 };

export const INKS: Record<string, string> = {
  ink: '#3b342d',
  pink: '#dc4b3e',
  coral: '#e07a5f',
  butter: '#f0b04a',
  mint: '#6fae5a',
  sky: '#4f8fc9',
  lilac: '#a98ad6',
  white: '#ffffff',
};

export const PEN_SIZE: Record<string, Record<string, number>> = {
  pen: { s: 5, m: 9, l: 16 },
  marker: { s: 4, m: 8, l: 14 },
  hi: { s: 14, m: 24, l: 38 },
};

export const penW = (tool: string | undefined, size: number | string | undefined) =>
  typeof size === 'number' ? size : (PEN_SIZE[tool ?? 'pen'] || PEN_SIZE.pen)?.[size ?? 'm'] || 9;

// a filled ribbon around the line: wider where you slowed down, thin at the start and end, with a little breathing wobble
function butter(raw: InkPoint[], finished: boolean, BASE: number) {
  const first = raw[0];
  if (!first) return '';
  const pts: Sample[] = [{ x: first[0], y: first[1] }];
  let acc = 0;
  for (let i = 1; i < raw.length; i++) {
    const a = raw[i - 1] ?? first,
      b = raw[i] ?? first,
      seg = Math.hypot(b[0] - a[0], b[1] - a[1]),
      dt = Math.max(1, (b[2] ?? 0) - (a[2] ?? 0));
    let d = acc;
    while (d < seg) {
      const k = d / seg;
      pts.push({ x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, v: seg / dt });
      d += 3;
    }
    acc = d - seg;
  }
  if (pts.length < 2) return '';
  if (finished && pts.length > 6) {
    const a = pts[0] ?? ORIGIN,
      z = pts.at(-1) ?? ORIGIN;
    if (Math.hypot(a.x - z.x, a.y - z.y) < 14) pts.splice(-2, 2);
  }
  const at = (i: number) => pts[i] ?? ORIGIN;
  let s = at(1).v || 0.3;
  const lens = [0];
  for (let i = 1; i < pts.length; i++)
    lens.push((lens[i - 1] ?? 0) + Math.hypot(at(i).x - at(i - 1).x, at(i).y - at(i - 1).y));
  const total = lens.at(-1) ?? 0,
    MIN = Math.max(1, BASE / 9),
    ramp = Math.min(54, BASE * 6);
  const width = (i: number) => {
    s += ((at(i).v ?? s) - s) * 0.08;
    const slow = Math.max(0, Math.min(1, 1 - s / 1.8)),
      w = MIN + (BASE - MIN) * (0.22 + 0.78 * slow * slow),
      len = lens[i] ?? 0,
      inR = Math.min(1, len / ramp),
      outR = finished ? Math.min(1, (total - len) / ramp) : 1;
    return w * inR ** 0.8 * outR ** 0.8 * (1 + 0.12 * Math.sin(len / 11)) + 0.4;
  };
  const L: [number, number][] = [],
    R: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    const p0 = at(Math.max(0, i - 1)),
      p1 = at(Math.min(pts.length - 1, i + 1));
    let nx = -(p1.y - p0.y),
      ny = p1.x - p0.x;
    const n = Math.hypot(nx, ny) || 1;
    nx /= n;
    ny /= n;
    const w = width(i) / 2;
    L.push([at(i).x + nx * w, at(i).y + ny * w]);
    R.push([at(i).x - nx * w, at(i).y - ny * w]);
  }
  const seq = L.concat(R.reverse()),
    start = seq[0] ?? [0, 0];
  let d = `M${start[0].toFixed(1)} ${start[1].toFixed(1)}`;
  for (let i = 1; i < seq.length; i++) {
    const m = seq[i - 1] ?? start,
      c = seq[i] ?? start;
    d += ` Q${m[0].toFixed(1)} ${m[1].toFixed(1)} ${((m[0] + c[0]) / 2).toFixed(1)} ${((m[1] + c[1]) / 2).toFixed(1)}`;
  }
  return `${d} Z`;
}

function centerline(p: InkPoint[]) {
  const first = p[0] ?? [0, 0],
    last = p.at(-1) ?? first,
    at = (i: number) => p[i] ?? first;
  if (p.length < 3) return `M${first[0]} ${first[1]} L${last[0] + 0.1} ${last[1]}`;
  let d = `M${first[0].toFixed(1)} ${first[1].toFixed(1)}`;
  for (let i = 1; i < p.length - 1; i++)
    d += ` Q${at(i)[0].toFixed(1)} ${at(i)[1].toFixed(1)} ${((at(i)[0] + at(i + 1)[0]) / 2).toFixed(1)} ${((at(i)[1] + at(i + 1)[1]) / 2).toFixed(1)}`;
  return `${d} L${last[0].toFixed(1)} ${last[1].toFixed(1)}`;
}

export function inkPath(
  pts: InkPoint[],
  tool: string,
  size: number | string | undefined,
  color: string | undefined,
  finished: boolean,
) {
  const col = color === 'ink' || !color ? 'var(--pen-ink)' : INKS[color] || color,
    w = penW(tool, size);
  if (tool === 'pen') {
    const [x, y] = pts[0] ?? [0, 0];
    // a single tap is a dot: two half circles
    if (pts.length < 2) {
      const left = x - w / 3,
        r = w / 3,
        across = w / 1.5,
        back = -w / 1.5;
      return `<path style="fill:${col}" d="M${left} ${y} a${r} ${r} 0 1 0 ${across} 0 a${r} ${r} 0 1 0 ${back} 0"/>`;
    }
    const d = butter(pts, finished, w);
    return `<path style="fill:${col}" d="${d}"/>`;
  }
  const look = tool === 'hi' ? ' opacity=".38" style="mix-blend-mode:multiply"' : '',
    d = centerline(pts);
  return `<path fill="none" style="stroke:${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${look} d="${d}"/>`;
}
