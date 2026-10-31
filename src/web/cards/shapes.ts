// @ts-nocheck
import { skStyle } from '../canvas/render.ts';
import { roundedD } from '../tools/pen.ts';
export let CIC;

export const host = u => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch (e) {
    return u;
  }
};

export const SHAPE_FILL = {
  gray: '#e4dfd8',
  pink: '#f2a59a',
  butter: '#f6c47a',
  mint: '#b5d69e',
  sky: '#a9c9e6',
  lilac: '#cdb8e6',
  peach: '#dccdb8',
  ink: '#3b342d',
};

// a line can be wavy, zigzag or loopy: waves = how tight, round = sharp → soft (or the loop size), wobble = hand-drawn looseness. Drawn in the 0–100 box
function squigPath(c) {
  const n = Math.max(0.5, c.waves ?? 6),
    r = (c.round ?? 60) / 100,
    wob = (c.wobble ?? 0) / 100,
    A = 46,
    st = c.squig;
  let seed = [...String(c.id || 'x')].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const p1 = rnd() * 6.28,
    p2 = rnd() * 6.28,
    p3 = rnd() * 6.28;
  const wobAmp = u => 1 + wob * 0.55 * (Math.sin(6.28 * 0.37 * u + p1) * 0.6 + Math.sin(6.28 * 0.83 * u + p2) * 0.4),
    drift = u => wob * A * 0.22 * Math.sin(6.28 * 0.21 * u + p3);
  const pts = [],
    N = Math.ceil(4 * n) * 14;
  for (let i = 0; i <= N; i++) {
    const t = i / N,
      u = n * t;
    let x, y;
    if (st === 'loopy') {
      const k = 1 + r * 1.8,
        th = 6.28318 * u;
      x = ((th - k * Math.sin(th)) / (6.28318 * n)) * 100;
      y = 50 - A * 0.8 * Math.cos(th) * wobAmp(u) + drift(u);
    } else {
      const sn = Math.sin(6.28318 * u),
        tri = (2 / Math.PI) * Math.asin(sn),
        mix = r;
      x = t * 100;
      y = 50 - A * (tri * (1 - mix) + sn * mix) * wobAmp(u) + drift(u);
    }
    pts.push(x.toFixed(2) + ' ' + y.toFixed(2));
  }
  return 'M' + pts.join(' L');
}

export function shapeSVG(c) {
  const named = SHAPE_FILL[c.fill || 'gray'],
    f = c.fill === 'none' ? 'none' : named ? `var(--sh-${c.fill || 'gray'})` : c.fill,
    sk = c.stroke && c.sw > 0 && c.shape !== 'line';
  const P = sk
    ? {
        stroke: c.stroke,
        'stroke-width': c.sw,
        'vector-effect': 'non-scaling-stroke',
        'stroke-linejoin': 'round',
        ...(skStyle(c) === 'dash'
          ? { 'stroke-dasharray': `${c.dl ?? 8} ${c.dg ?? 6}` }
          : skStyle(c) === 'dot'
            ? { 'stroke-dasharray': `0 ${(c.dg ?? 6) + c.sw}`, 'stroke-linecap': 'round' }
            : {}),
        style: `fill:${f}`,
      }
    : { stroke: 'none', style: `fill:${f}` };
  const attrs = o =>
    Object.entries(o)
      .map(([k, v]) => `${k}="${v}"`)
      .join(' ');
  const body = {
    rect: `<rect x="0" y="0" width="100" height="100" rx="${c.radius != null ? Math.min(50, (c.radius * 100) / Math.max(1, c.w || 160)) : 10}" ry="${c.radius != null ? Math.min(50, (c.radius * 100) / Math.max(1, c.h || 160)) : 10}" ${attrs(P)}/>`,
    circle: `<ellipse cx="50" cy="50" rx="50" ry="50" ${attrs(P)}/>`,
    tri: `<path d="${
      c.radius
        ? roundedD(
            [
              { x: 50, y: 2 },
              { x: 98, y: 98 },
              { x: 2, y: 98 },
            ],
            true,
            (c.radius * 100) / Math.max(1, Math.min(c.w || 160, c.h || 160)),
          )
        : 'M50 2 L98 98 L2 98 Z'
    }" stroke-linejoin="round" ${attrs(P)}/>`,
    star: `<path d="${
      c.radius
        ? roundedD(
            [
              [50, 3],
              [62, 36],
              [97, 37],
              [69, 58],
              [79, 93],
              [50, 72],
              [21, 93],
              [31, 58],
              [3, 37],
              [38, 36],
            ].map(([x, y]) => ({ x, y })),
            true,
            (c.radius * 100) / Math.max(1, Math.min(c.w || 160, c.h || 160)),
          )
        : 'M50 3 L62 36 L97 37 L69 58 L79 93 L50 72 L21 93 L31 58 L3 37 L38 36 Z'
    }" ${attrs(P)}/>`,
    heart: `<path d="M50 92 C20 72 3 55 3 33 C3 15 17 4 31 4 C40 4 47 9 50 16 C53 9 60 4 69 4 C83 4 97 15 97 33 C97 55 80 72 50 92 Z" ${attrs(P)}/>`,
    line:
      (c.squig || 'straight') === 'straight'
        ? `<line x1="0" y1="50" x2="100" y2="50" style="stroke:${(c.fill || 'gray') === 'gray' ? 'var(--pen-ink)' : f}" stroke-width="${c.lw || 4}" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`
        : `<path d="${squigPath(c)}" fill="none" style="stroke:${(c.fill || 'gray') === 'gray' ? 'var(--pen-ink)' : f}" stroke-width="${c.lw || 4}" stroke-linecap="round" stroke-linejoin="${(c.round ?? 60) < 15 && c.squig === 'zigzag' ? 'miter' : 'round'}" vector-effect="non-scaling-stroke"/>`,
  }[c.shape || 'rect'];
  return `<svg class="sh${(c.shape || 'rect') === 'line' ? ' is-line' : ''}" viewBox="0 0 100 100" preserveAspectRatio="none">${body}</svg>`;
}
export function init10() {
  // ---------- round 2 pieces: icons, shapes, link hosts ----------
  CIC = { doc: Icon('doc', { cls: 'cic' }), canvas: Icon('grid', { cls: 'cic' }), link: Icon('link', { cls: 'cic' }) };
}
