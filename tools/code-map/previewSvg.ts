import { layout } from './layout.ts';
import { hsl, tints } from './palette.ts';
import type { CodeMap } from './types.ts';

const W = 1200,
  H = 720,
  PAD = 48;
const one = (n: number) => n.toFixed(1);
const esc = (s: string) =>
  s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

const circle = (x: string, y: string, r: string, cls: string) =>
  `<circle cx="${x}" cy="${y}" r="${r}" class="${cls}"/>`;
const label = (x: string, y: string, cls: string, text: string) =>
  `<text x="${x}" y="${y}" class="${cls}">${text}</text>`;

// A still of the page's default view, drawn straight from the same layout, for the README. It follows light and dark by itself.
export function previewSvg(map: CodeMap): string {
  const g = layout(map, { tests: false, tools: false, types: true }, 'files', W / H);
  const linked = g.nodes.filter(n => n.deg > 0);
  const x0 = Math.min(...linked.map(n => n.x - n.r)),
    x1 = Math.max(...linked.map(n => n.x + n.r)),
    y0 = Math.min(...linked.map(n => n.y - n.r)),
    y1 = Math.max(...linked.map(n => n.y + n.r)),
    k = Math.min((W - PAD * 2) / (x1 - x0), (H - PAD * 2 - 30) / (y1 - y0)),
    ox = W / 2 - ((x0 + x1) / 2) * k,
    oy = (H - 30) / 2 - ((y0 + y1) / 2) * k;
  const at = (n: { x: number; y: number }) => ({ x: n.x * k + ox, y: n.y * k + oy });
  const tint = tints(map.areas.map(a => a.id));
  const classes = map.areas.map((a, i) => ({ id: a.id, cls: `a${i}` }));
  const clsOf = new Map(classes.map(c => [c.id, c.cls]));
  const paint = classes.map(c => `.${c.cls}{fill:${hsl(tint.get(c.id), 'var(--l)')}}`).join('');

  const lines = g.edges
    .map(e => {
      const a = at(e.a),
        b = at(e.b);
      return `M${one(a.x)} ${one(a.y)}L${one(b.x)} ${one(b.y)}`;
    })
    .join('');
  const dots = [...g.nodes]
    .sort((a, b) => b.r - a.r)
    .map(n => {
      const p = at(n);
      return circle(one(p.x), one(p.y), one(Math.max(1.6, n.r * k)), clsOf.get(n.area) ?? 'a0');
    })
    .join('');

  const centres = new Map<string, { x: number; top: number; n: number }>();
  for (const n of g.nodes) {
    const p = at(n),
      c = centres.get(n.area) ?? { x: 0, top: Infinity, n: 0 };
    c.x += p.x;
    c.n++;
    c.top = Math.min(c.top, p.y - n.r * k);
    centres.set(n.area, c);
  }
  const areaNames = [...centres]
    .filter(([, c]) => c.n > 1)
    .map(([id, c]) => label(one(c.x / c.n), one(c.top - 7), 'area', esc(id)))
    .join('');
  const hubNames = [...g.nodes]
    .sort((a, b) => b.deg - a.deg)
    .slice(0, 8)
    .map(n => {
      const p = at(n);
      return label(one(p.x), one(p.y + n.r * k + 11), 'hub', esc(n.label));
    })
    .join('');
  const files = g.nodes.length;
  const caption = `${files} source files. A larger circle has more connections. Open the interactive map for what each file does.`;
  const style =
    `:root{--l:46%;--bg:#e8ecf1;--edge:#7b8899;--ink:#18212b;--ink2:#556273}` +
    `@media (prefers-color-scheme:dark){:root{--l:63%;--bg:#0a0e13;--edge:#5b697a;--ink:#e5eaf0;--ink2:#93a0af}}` +
    `.bg{fill:var(--bg)}.e{stroke:var(--edge);stroke-opacity:.22;stroke-width:.6;fill:none}` +
    `text{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-anchor:middle}` +
    `.area{font-size:13px;font-weight:600;fill:var(--ink2);paint-order:stroke;stroke:var(--bg);stroke-width:4px}` +
    `.hub{font-size:11px;fill:var(--ink);paint-order:stroke;stroke:var(--bg);stroke-width:3px}` +
    `.t{font-size:22px;font-weight:600;fill:var(--ink);text-anchor:start}.c{font-size:13px;fill:var(--ink2);text-anchor:start}` +
    `circle{stroke:var(--bg);stroke-width:.8}${paint}`;
  const title = 'Fenmyr code map';
  const open = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}">`;
  const bg = `<rect class="bg" width="${W}" height="${H}" rx="14"/>`;
  const head = label('28', '42', 't', title);
  const foot = label('28', String(H - 20), 'c', esc(caption));
  return `${open}<title>${title}</title><style>${style}</style>${bg}<path class="e" d="${lines}"/>${dots}${areaNames}${hubNames}${head}${foot}</svg>\n`;
}
