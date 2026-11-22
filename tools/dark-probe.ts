// Proves a stylesheet fold changed nothing: the running app computes the same colours for the elements a fold touched, in
// every look (Default and the four themes, light and dark) and in the states the rules apply in (plain, hovered, selected).
// `npm run visual` only takes a few dark states; this reads the elements that a body.dark rule styles, with the real
// mouse over them, so a rival rule that starts to win shows as a changed value. Run it before the change and after.
//   npm run build && node tools/dark-probe.ts snapshot before.json
//   (change the stylesheet) npm run build && node tools/dark-probe.ts snapshot after.json
//   node tools/dark-probe.ts diff before.json after.json   exits 1 and lists what changed, with the largest OKLab distance
// A probe that finds no element would prove nothing, so snapshot exits 1 and names it. Add a step here with each fold.
import fs from 'node:fs';
import type { Page } from 'playwright';
import { apart, hexOf } from '../src/web/ui/color.ts';
import { launch } from '../tests/support/launch.ts';
import { installPaint } from '../tests/support/paint.ts';

type Look = { name: string; settings: Record<string, unknown> };
const LOOKS: Look[] = [
  { name: 'default light', settings: { theme: 'light' } },
  { name: 'default dark', settings: { theme: 'dark' } },
  { name: 'midsummer', settings: { theme: 'light', lightTheme: 'midsummer' } },
  { name: 'clear', settings: { theme: 'light', lightTheme: 'clear' } },
  { name: 'polar night', settings: { theme: 'dark', darkTheme: 'polar-night' } },
  { name: 'lantern', settings: { theme: 'dark', darkTheme: 'lantern' } },
];

// what to read: the first element the selector finds, or its pseudo-element
type Probe = { name: string; selector: string; pseudo?: string; props: string[] };
type Step = { name: string; run: (page: Page) => Promise<void>; probes: Probe[] };

const corner = (page: Page) => page.evaluate(() => ({ x: innerWidth - 1, y: innerHeight - 1 }));
const idle = async (page: Page) => {
  const c = await corner(page);
  await page.mouse.move(c.x, c.y);
};
const hover = (selector: string) => async (page: Page) => {
  await page.locator(selector).first().hover();
};
// two frames after a change, so a style that needs a frame to apply has applied
const frames = (page: Page) =>
  page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));

const BG = ['background-color'];
const PLAIN_ROW = '#layers .ly:not(.on)';
const ON_ROW = '#layers .ly.on';
const STEPS: Step[] = [
  {
    name: 'layers, nothing hovered',
    run: async page => {
      await page.evaluate(() => window.__fenmyr.selectOnly(['a']));
      await idle(page);
    },
    probes: [
      { name: 'row', selector: PLAIN_ROW, props: BG },
      { name: 'selected row', selector: ON_ROW, props: BG },
    ],
  },
  {
    name: 'layers, hovering a plain row',
    run: hover(PLAIN_ROW),
    probes: [{ name: 'row', selector: PLAIN_ROW, props: BG }],
  },
  {
    name: 'layers, hovering the selected row',
    run: hover(ON_ROW),
    probes: [{ name: 'selected row', selector: ON_ROW, props: BG }],
  },
  {
    name: 'selection bar',
    run: idle,
    probes: [
      { name: 'bar', selector: '#selbar', props: [...BG, 'box-shadow'] },
      { name: 'pill', selector: '#selbar .sb-ic', props: BG },
      { name: 'dropdown button', selector: '#selbar .sb-poptrig', props: BG },
      { name: 'style button on', selector: '#selbar .sb-sizes.sb-style button.on', props: [...BG, 'color'] },
    ],
  },
  {
    name: 'selection bar, dropdown open',
    run: async page => {
      await page.locator('#selbar .sb-poptrig').first().click();
    },
    probes: [
      { name: 'dropdown', selector: '#selbar .sb-popw.open > .sb-pop', props: [...BG, 'box-shadow'] },
      { name: 'open button', selector: '#selbar .sb-popw.open > .sb-poptrig', props: BG },
    ],
  },
  {
    name: 'drawing size',
    run: async page => {
      await page.keyboard.press('Escape');
      await idle(page);
      // a field may hold focus at start, and would take the P
      await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
      await page.keyboard.press('p');
    },
    probes: [
      { name: 'bubble', selector: '#dbSize .dbs-bub', props: [...BG, 'box-shadow'] },
      { name: 'track', selector: '#dbSize .dbs-track', pseudo: '::before', props: BG },
    ],
  },
];

const note = (id: string, x: number) => ({ id, type: 'note', x, y: 100, w: 200, h: 100, r: 0, text: id });
const BOARD = { id: 'p', name: 'Probe', cards: [note('a', 100), note('b', 400), note('c', 700)], links: [], tray: [] };

// the colours as the pixels they paint, so oklab(), color(srgb …) and rgb() compare as the one colour they are
const MISSING = '(no element)';
async function read(page: Page, probe: Probe) {
  return page.evaluate(({ selector, pseudo, props }) => {
    const el = document.querySelector(selector);
    if (!el) return props.map(() => '(no element)');
    const style = getComputedStyle(el, pseudo);
    const painted = (v: string) =>
      v.replace(/(?:oklch|oklab|lab|lch|hsla?|hwb|color)\((?:[^()]|\([^()]*\))*\)/g, c => {
        const [r, g, b, a] = window.__paint(c);
        return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;
      });
    return props.map(p => painted(style.getPropertyValue(p)));
  }, probe);
}

async function snapshot(out: string) {
  const values: Record<string, string> = {};
  const blind: string[] = [];
  for (const look of LOOKS) {
    const app = await launch({ boards: [BOARD], open: 'p', settings: look.settings });
    await installPaint(app.page);
    await app.page.addStyleTag({
      content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
    });
    for (const step of STEPS) {
      await step.run(app.page);
      await frames(app.page);
      for (const probe of step.probes) {
        const read1 = await read(app.page, probe);
        probe.props.forEach((prop, i) => {
          const value = read1[i] ?? MISSING;
          values[`${look.name} | ${step.name} | ${probe.name} | ${prop}`] = value;
          if (value === MISSING) blind.push(`${look.name} | ${step.name} | ${probe.name}`);
        });
      }
    }
    await app.close();
  }
  fs.writeFileSync(out, `${JSON.stringify(values, null, 1)}\n`);
  const found = new Set(blind);
  if (found.size) {
    console.log(`BLIND: no element for\n  ${[...found].join('\n  ')}`);
    process.exit(1);
  }
  console.log(`SNAPSHOT: ${Object.keys(values).length} values in ${LOOKS.length} looks, written to ${out}`);
}

function readSnapshot(file: string): Record<string, string> {
  const raw: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (typeof raw !== 'object' || raw === null) throw new Error(`${file} must hold an object`);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) if (typeof v === 'string') out[k] = v;
  return out;
}

const RGBA = /rgba\((\d+), (\d+), (\d+), ([\d.]+)\)/g;
// how far apart two values look: the largest OKLab distance between their colours, and the text between them must match
function distance(before: string, after: string) {
  const a = [...before.matchAll(RGBA)];
  const b = [...after.matchAll(RGBA)];
  if (a.length !== b.length || before.replace(RGBA, '@') !== after.replace(RGBA, '@')) return Infinity;
  return Math.max(
    0,
    ...a.map((m, i) => {
      const n = b[i];
      if (!n) return Infinity;
      const rgb = (x: RegExpMatchArray): [number, number, number] => [Number(x[1]), Number(x[2]), Number(x[3])];
      const alpha = Math.abs(Number(m[4]) - Number(n[4]));
      return alpha > 0
        ? Math.max(alpha, 0.001) + apart(hexOf(rgb(m)), hexOf(rgb(n)), 'typical')
        : apart(hexOf(rgb(m)), hexOf(rgb(n)), 'typical');
    }),
  );
}

function diff(beforeFile: string, afterFile: string) {
  const before = readSnapshot(beforeFile);
  const after = readSnapshot(afterFile);
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const changed = keys.flatMap(k => {
    const [x, y] = [before[k], after[k]];
    if (x === y) return [];
    return [
      {
        key: k,
        before: x ?? '(absent)',
        after: y ?? '(absent)',
        by: x === undefined || y === undefined ? Infinity : distance(x, y),
      },
    ];
  });
  for (const c of changed)
    console.log(
      `${c.key}\n    ${c.before}\n    ${c.after}${Number.isFinite(c.by) ? `   (OKLab ${c.by.toFixed(4)})` : ''}`,
    );
  if (changed.length) {
    const largest = Math.max(...changed.map(c => c.by));
    console.log(
      `DIFFERENT: ${changed.length} of ${keys.length} values changed, largest OKLab change ${Number.isFinite(largest) ? largest.toFixed(4) : 'not a colour change'}`,
    );
    process.exit(1);
  }
  console.log(`SAME: ${keys.length} values compute identically in ${LOOKS.length} looks`);
}

const [command, a, b] = process.argv.slice(2);
if (command === 'snapshot' && a) await snapshot(a);
else if (command === 'diff' && a && b) diff(a, b);
else
  throw new Error(
    'node tools/dark-probe.ts snapshot out.json  |  node tools/dark-probe.ts diff before.json after.json',
  );
