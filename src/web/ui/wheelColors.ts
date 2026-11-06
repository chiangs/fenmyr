import { COLORS } from '../core/base.ts';
import { session } from '../core/state.ts';
import { esc } from './dom.ts';

type Named = { hex: string; name: string };
export const palette = () => (session.board.palette ??= []);

// the wheel's quick colors: black + white always, then saved board colors, the color cards on the board (with their
// names), then other colors in use, most used first; none at all → the starter set. Two easy rows, or all of them.
export function boardColorRows(starter: string[], every: boolean) {
  const norm = (v: unknown) =>
      typeof v !== 'string' ? null : /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : COLORS[v] || null,
    seen = new Set(['#000000', '#ffffff']);
  const take = (list: Named[]) => list.filter(x => x.hex && !seen.has(x.hex) && seen.add(x.hex));
  const saved = take(palette().map(p => ({ hex: p.hex.toLowerCase(), name: p.name ?? '' })));
  const cards = take(
    session.board.cards.flatMap(c =>
      c.type === 'swatch' && c.hex ? [{ hex: c.hex.toLowerCase(), name: c.label || c.hex.toUpperCase() }] : [],
    ),
  );
  const count = new Map<string, number>();
  for (const c of session.board.cards) {
    if (c.type === 'swatch') continue;
    for (const v of [c.color, 'fill' in c ? c.fill : undefined, c.stroke]) {
      const h = norm(v);
      if (h) count.set(h, (count.get(h) || 0) + 1);
    }
  }
  const used = take([...count].sort((a, b) => b[1] - a[1]).map(([h]) => ({ hex: h, name: h.toUpperCase() })));
  const dot = (x: Named) => {
      const name = esc(x.name);
      return `<button style="background:${x.hex}" data-hex="${x.hex}" title="${name}"></button>`;
    },
    dots = (xs: Named[]) => {
      const row = xs.map(dot).join('');
      return `<div class="cpq-row">${row}</div>`;
    },
    row = (label: string, xs: Named[]) => {
      const list = dots(xs);
      return xs.length ? `<div class="cpq-l">${label}</div>${list}` : '';
    };
  const bw = [
    { hex: '#000000', name: 'Black' },
    { hex: '#ffffff', name: 'White' },
  ];
  if (!saved.length && !cards.length && !used.length)
    return dots([...bw, ...take(starter.map(h => ({ hex: h.toLowerCase(), name: h.toUpperCase() })))]);
  const all = [...bw, ...saved, ...cards, ...used],
    FEW = 16; // two rows of dots
  if (all.length <= FEW) return dots(all);
  const total = all.length,
    firstFew = dots(all.slice(0, FEW));
  return every
    ? row('Black & white', bw) +
        row('Board colours', saved) +
        row('Colour cards', cards) +
        row('On this board', used) +
        `<button class="cpq-more" data-cpq="few">Fewer</button>`
    : `${firstFew}<button class="cpq-more" data-cpq="all">All board colours (${total})</button>`;
}
