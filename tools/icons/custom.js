// Myra's own icons, drawn on a 24 grid with a 1.5 stroke (Phosphor regular's weight). Each comes in the two weights the app
// offers: r (regular, outline only) and d (duotone, tinted fill). Classes: s = stroke, f = filled, t = the tint, t2 = the leaf tint.
const N = 7, TH0 = -Math.PI / 2;
const f2 = n => Number(n.toFixed(2));

// a scalloped berry: N round beads around a ring, outlined as one shape
function berry(cx, cy, s) {
  const Rc = 4.2 * s, r = 2.6 * s, cosv = Math.cos(Math.PI / N), b = 2 * Rc * cosv, c = Rc * Rc - r * r;
  const rho = (b + Math.sqrt(b * b - 4 * c)) / 2;
  const pts = [...Array(N)].map((_, k) => { const a = TH0 - Math.PI / N + 2 * Math.PI * k / N; return [cx + rho * Math.cos(a), cy + rho * Math.sin(a)]; });
  let d = `M${f2(pts[0][0])} ${f2(pts[0][1])}`;
  for (let k = 1; k <= N; k++) { const p = pts[k % N]; d += `A${f2(r)} ${f2(r)} 0 0 1 ${f2(p[0])} ${f2(p[1])}`; }
  return { d: d + 'Z', top: cy - Rc - r };
}
// one leaf of the crown; side -1 is the left one, 1 the right
function leaf(x, y, s, side) {
  const P = (px, py) => [x + side * px * s, y + py * s], a = P(1.8, .1), b = P(3.6, -.8), c = P(4, -2.8), d = P(1.8, -2.9), e = P(.1, -2);
  return `M${f2(x)} ${f2(y)}C${a.map(f2).join(' ')} ${b.map(f2).join(' ')} ${c.map(f2).join(' ')}C${d.map(f2).join(' ')} ${e.map(f2).join(' ')} ${f2(x)} ${f2(y)}Z`;
}
const dots = (list, r, cls) => list.map(([x, y]) => `<circle class="${cls}" cx="${f2(x)}" cy="${f2(y)}" r="${f2(r)}"/>`).join('');

function mark(cx, cy, s, duo) {
  const { d, top } = berry(cx, cy, s), L = leaf(cx, top + .3 * s, s, -1) + leaf(cx, top + .3 * s, s, 1);
  const beads = dots([[cx - 1.9 * s, cy - .6 * s], [cx + 1.8 * s, cy - 1.1 * s], [cx - .1 * s, cy + 2.3 * s]], .8 * s, 'f');   // big enough to still show at 16 px
  return `<path class="s${duo ? ' t' : ''}" d="${d}"/><path class="s${duo ? ' t2' : ''}" d="${L}"/>` + beads;
}
const STAR = 'M18.6 2.6l.85 2.35 2.35.85-2.35.85-.85 2.35-.85-2.35-2.35-.85 2.35-.85z';
const BUBBLE = 'M6.5 7h11A3.5 3.5 0 0 1 21 10.5v5a3.5 3.5 0 0 1-3.5 3.5H11l-4 3.4V19h-.5A3.5 3.5 0 0 1 3 15.5v-5A3.5 3.5 0 0 1 6.5 7z';

// wraps 24-grid markup so it fits the 256 view box the other icons use
const wrap = inner => `<g transform="scale(10.6667)">${inner}</g>`;
const both = (fn) => ({ r: wrap(fn(false)), d: wrap(fn(true)) });

module.exports = {
  // the cloudberry itself: Myra's mark
  'myra-mark': { ...both(duo => mark(12, 14.2, 1, duo)), kw: 'myra cloudberry berry logo' },
  // ask Myra: a smaller berry with a sparkle
  'myra-tool': { ...both(duo => mark(10.6, 15, .8, duo) + `<path class="s${duo ? ' t' : ''}" d="${STAR}"/>`), kw: 'ask myra ai assistant sparkle' },
  // chat with Myra: a bubble with a leaf crown and three beads
  // a card's label (the small handwritten word above it): a berry over a scribble
  'berry-label': { ...both(duo => { const { d } = berry(12, 8.6, .68); return `<path class="s${duo ? ' t' : ''}" d="${d}"/><path class="s" d="M4 19.6c2-1.7 3.2-1.7 4 0s2 1.7 4 0 3.2-1.7 4 0 2 1.7 4 0"/>`; }), kw: 'label handwritten note word' },
  'myra-chat': { ...both(duo => `<path class="s${duo ? ' t' : ''}" d="${BUBBLE}"/><path class="s${duo ? ' t2' : ''}" d="${leaf(11.3, 6.6, .72, -1) + leaf(12.7, 6.6, .72, 1)}"/>` + dots([[9.2, 11.6], [14.8, 11.6], [12, 14.8]], 1.25, 'f')), kw: 'chat talk message myra' },
};
