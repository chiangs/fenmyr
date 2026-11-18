// Proves a colour conversion changed nothing: for every [property, old value, new value] in a pairs file (written by
// tools/colour-convert.ts --pairs), the running app computes the same colour from both, in light and in dark mode.
// A screenshot only shows the states it takes; this covers every declaration. Exits 1 and lists the differences if any.
//   node tools/colour-compare.ts pairs.json [--tolerance 0.02]
// A pair may carry a fourth value, the old value in dark mode, for a declaration whose body.dark rule swapped it, and a
// fifth, 'light' or 'dark', when it only has to hold in that mode.
// --tolerance accepts colours that differ by less than that OKLab distance (and alpha by less than .01), for a change
// that replaces a colour with a core token that looks the same, as tools/colour-fit.ts --apply does.
import fs from 'node:fs';
import { apart, hexOf, type Rgb } from '../src/web/ui/color.ts';
import { launch } from '../tests/support/launch.ts';
import { installPaint } from '../tests/support/paint.ts';

type Pair = [property: string, before: string, after: string, darkBefore?: string, only?: 'light' | 'dark'];
type Seen = {
  mode: 'light' | 'dark';
  property: string;
  asked: [string, string];
  before: string;
  after: string;
  accepted: [boolean, boolean];
};

function readPairs(file: string): Pair[] {
  const raw: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(raw)) throw new Error(`${file} must hold a list of pairs`);
  return raw.map((p): Pair => {
    const [property, before, after, darkBefore, only] = Array.isArray(p) ? p : [];
    if (typeof property !== 'string' || typeof before !== 'string' || typeof after !== 'string')
      throw new Error('each pair is [property, old value, new value]');
    const dark = typeof darkBefore === 'string' ? darkBefore : undefined;
    return only === 'light' || only === 'dark'
      ? [property, before, after, dark, only]
      : [property, before, after, dark];
  });
}

const COLOUR =
  /rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)|color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/g;
// rgba(137, 110, 83, 0.1) and color(srgb 0.537 0.431 0.325 / 0.1) are one colour written two ways
function colours(v: string) {
  const found: { rgb: Rgb; alpha: number }[] = [];
  const rest = v.replace(COLOUR, (_m, r, g, b, a, sr, sg, sb, sa) => {
    const srgb = sr !== undefined,
      ch = (n: string) => Math.round(Number(n) * (srgb ? 255 : 1));
    found.push({
      rgb: srgb ? [ch(sr), ch(sg), ch(sb)] : [ch(r), ch(g), ch(b)],
      alpha: Number((srgb ? sa : a) ?? 1),
    });
    return '@';
  });
  return { found, rest: rest.replace(/#fff\b/g, '#ffffff') };
}

function differs(before: string, after: string, tolerance: number) {
  const a = colours(before),
    b = colours(after);
  if (a.rest !== b.rest || a.found.length !== b.found.length) return true;
  return a.found.some((c, i) => {
    const d = b.found[i];
    if (!d) return true;
    return (
      Math.abs(c.alpha - d.alpha) > (tolerance ? 0.01 : 0) || apart(hexOf(c.rgb), hexOf(d.rgb), 'typical') > tolerance
    );
  });
}

const args = process.argv.slice(2),
  file = args[0],
  tolerance = args[1] === '--tolerance' ? Number(args[2]) : 0;
if (!file) throw new Error('Name a pairs file: node tools/colour-compare.ts pairs.json [--tolerance 0.02]');
const pairs = readPairs(file),
  // the launcher waits for a card, so the board has one
  note = { id: 'n', type: 'note', x: 0, y: 0, w: 200, h: 100, r: 0, text: 'x' },
  app = await launch({ boards: [{ id: 'b', name: 'B', cards: [note], links: [], tray: [] }], open: 'b' });
await installPaint(app.page);
const seen: Seen[] = await app.page.evaluate(pairs => {
  const el = document.createElement('div');
  document.querySelector('#cards')?.appendChild(el);
  const out: Seen[] = [],
    // getComputedStyle keeps a colour-mix() result as oklch(...); the paint helper turns that into the pixel it would paint
    rgbOf = (v: string) =>
      v.replace(/(?:oklch|oklab|lab|lch|hsla?|hwb)\([^)]*\)/g, c => {
        const [r, g, b, a] = window.__paint(c);
        return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;
      });
  for (const dark of [false, true]) {
    document.body.classList.toggle('dark', dark);
    for (const [property, lightBefore, after, darkBefore, only] of pairs) {
      if (only && only !== (dark ? 'dark' : 'light')) continue;
      const computed = (value: string) => {
        el.style.cssText = '';
        el.style.setProperty(property, value);
        return [
          el.style.getPropertyValue(property) !== '',
          rgbOf(getComputedStyle(el).getPropertyValue(property)),
        ] as const;
      };
      const was = dark && darkBefore !== undefined ? darkBefore : lightBefore,
        [okA, a] = computed(was),
        [okB, b] = computed(after);
      out.push({
        mode: dark ? 'dark' : 'light',
        property,
        asked: [was, after],
        before: a,
        after: b,
        accepted: [okA, okB],
      });
    }
  }
  return out;
}, pairs);
await app.close();
const found = seen.flatMap(s =>
  !s.accepted[1]
    ? [`${s.mode} ${s.property}: the browser rejects ${s.asked[1]}`]
    : !s.accepted[0]
      ? [`${s.mode} ${s.property}: the browser rejects ${s.asked[0]}`]
      : differs(s.before, s.after, tolerance)
        ? [`${s.mode} ${s.property}: ${s.before}  vs  ${s.after}`]
        : [],
);
if (found.length) {
  console.log(found.join('\n'));
  console.log(`DIFFERENT: ${found.length} differences in ${pairs.length} declarations`);
  process.exit(1);
}
console.log(
  `SAME: ${pairs.length} declarations compute ${tolerance ? 'within the tolerance' : 'identically'} in light and dark mode`,
);
