// Proves a colour conversion changed nothing: for every [property, old value, new value] in a pairs file (written by
// tools/colour-convert.ts --pairs), the running app computes the same colour from both, in light and in dark mode.
// A screenshot only shows the states it takes; this covers every declaration. Exits 1 and lists the differences if any.
//   node tools/colour-compare.ts pairs.json
import fs from 'node:fs';
import { launch } from '../tests/support/launch.ts';

type Pair = [property: string, before: string, after: string];

function readPairs(file: string): Pair[] {
  const raw: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(raw)) throw new Error(`${file} must hold a list of pairs`);
  return raw.map(p => {
    const [property, before, after] = Array.isArray(p) ? p : [];
    if (typeof property !== 'string' || typeof before !== 'string' || typeof after !== 'string')
      throw new Error('each pair is [property, old value, new value]');
    return [property, before, after];
  });
}

const file = process.argv[2];
if (!file) throw new Error('Name a pairs file: node tools/colour-compare.ts pairs.json');
const pairs = readPairs(file),
  // the launcher waits for a card, so the board has one
  note = { id: 'n', type: 'note', x: 0, y: 0, w: 200, h: 100, r: 0, text: 'x' },
  app = await launch({ boards: [{ id: 'b', name: 'B', cards: [note], links: [], tray: [] }], open: 'b' });
const differences = await app.page.evaluate(pairs => {
  const el = document.createElement('div');
  document.querySelector('#cards')?.appendChild(el);
  // rgba(137, 110, 83, 0.1) and color(srgb 0.537 0.431 0.325 / 0.1) are one colour written two ways
  const same = (v: string) =>
    v
      .replace(
        /rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)/g,
        (_m, r, g, b, a) => `${[r, g, b].map(n => Math.round(Number(n))).join(',')}/${a ?? '1'}`,
      )
      .replace(
        /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/g,
        (_m, r, g, b, a) => `${[r, g, b].map(n => Math.round(Number(n) * 255)).join(',')}/${a ?? '1'}`,
      )
      .replace(/#fff\b/g, '#ffffff');
  const found: string[] = [];
  for (const dark of [false, true]) {
    document.body.classList.toggle('dark', dark);
    const mode = dark ? 'dark' : 'light';
    for (const [property, before, after] of pairs) {
      const computed = (value: string) => {
        el.style.cssText = '';
        el.style.setProperty(property, value);
        return {
          accepted: el.style.getPropertyValue(property) !== '',
          colour: getComputedStyle(el).getPropertyValue(property),
        };
      };
      const a = computed(before),
        b = computed(after);
      if (!b.accepted) found.push(`${mode} ${property}: the browser rejects ${after}`);
      else if (!a.accepted) found.push(`${mode} ${property}: the browser rejects ${before}`);
      else if (same(a.colour) !== same(b.colour)) found.push(`${mode} ${property}: ${a.colour}  vs  ${b.colour}`);
    }
  }
  return found;
}, pairs);
await app.close();
if (differences.length) {
  console.log(differences.join('\n'));
  console.log(`DIFFERENT: ${differences.length} differences in ${pairs.length} declarations`);
  process.exit(1);
}
console.log(`SAME: ${pairs.length} declarations compute identically in light and dark mode`);
