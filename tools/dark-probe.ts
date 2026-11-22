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

// what to read: the first element the selector finds, or its pseudo-element. Two odd cases:
// `as` reads a custom property through a throwaway child that uses it (`box-shadow: var(--m-base)`), for a value only an
// animation consumes; `at` samples the painted pixel that far across the element (0 to 1), for the parts getComputedStyle
// can't reach, like a range input's track.
type Probe = { name: string; selector: string; pseudo?: string; props: string[]; as?: string; at?: number };
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
    name: 'cards',
    run: async page => {
      await page.keyboard.press('Escape');
      await idle(page);
    },
    probes: [
      { name: 'audio play', selector: '#cards [data-id="au"] .au-play', props: [...BG, 'color'] },
      { name: 'audio time', selector: '#cards [data-id="au"] .au-time', props: ['color'] },
      { name: 'link meta', selector: '#cards [data-id="lk"] .meta span', props: ['color'] },
      { name: 'section name', selector: '#cards [data-id="sc"] .sec-name', props: [...BG, 'color'] },
    ],
  },
  {
    name: 'tilt popover',
    run: async page => {
      await page.evaluate(() => window.__fenmyr.selectOnly(['a']));
      await page.locator('#selbar .sb-tilt').first().click();
    },
    probes: [
      { name: 'angle field', selector: '.tp-in input', props: [...BG, 'color'] },
      { name: 'chip', selector: '.tp-chips button', props: [...BG, 'color'] },
    ],
  },
  {
    name: 'tilt popover, hovering a chip',
    run: hover('.tp-chips button'),
    probes: [{ name: 'chip', selector: '.tp-chips button', props: [...BG, 'color'] }],
  },
  {
    name: 'templates',
    run: async page => {
      await page.keyboard.press('Escape');
      await page.keyboard.press('Alt+t');
    },
    probes: [{ name: 'icon', selector: '.tplpick .tp-e', props: BG }],
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
      { name: 'done button', selector: '.db-done', props: [...BG, 'color'] },
    ],
  },
  {
    name: 'selected card and the parts of the page that are always there',
    run: async page => {
      await page.keyboard.press('Escape');
      await page.evaluate(() => window.__fenmyr.selectOnly(['a']));
      await idle(page);
    },
    probes: [
      { name: 'selection ring', selector: '#cards [data-id="a"]', pseudo: '::after', props: ['box-shadow'] },
      { name: 'switch knob', selector: '#settings .tgl:not(:checked)', pseudo: '::after', props: BG },
      { name: 'switch knob on', selector: '#settings .tgl:checked', pseudo: '::after', props: BG },
      { name: 'gear tip', selector: '#gearBtn', pseudo: '::after', props: BG },
      { name: 'update bar', selector: '#upBar', props: [...BG, 'box-shadow'] },
      { name: 'show panels key', selector: '#cleanBack kbd', props: BG },
      { name: 'pieces picker', selector: '#piecePick', props: [...BG, 'box-shadow'] },
      { name: 'Myra button glow base', selector: '#mPill', as: 'box-shadow: var(--m-base)', props: ['box-shadow'] },
      { name: 'birthday month', selector: '#obBdMonth', props: [...BG, 'color'] },
      { name: 'spotify body', selector: '#cards [data-id="sp"] .body', props: BG },
      {
        name: 'section shine',
        selector: '#cards [data-id="sc"] .sec-glass',
        pseudo: '::before',
        props: ['background-image', 'height'],
      },
    ],
  },
  {
    name: 'what is new, one line',
    run: async page => {
      await page.evaluate(() => {
        const list = document.getElementById('newsList');
        if (list) list.innerHTML = '<li><b>A line</b><small>What changed</small></li>';
      });
    },
    probes: [{ name: 'line', selector: '#newsList li', props: BG }],
  },
  {
    name: 'spacing popover',
    run: async page => {
      await page.keyboard.press('Escape');
      await page.evaluate(() => window.__fenmyr.selectOnly(['a']));
      await page.locator('#selbar [data-pop="spacing"]').click();
    },
    probes: [
      {
        name: 'slider track',
        selector: '#selbar [data-sp="lh"]',
        at: 0.85,
        props: ['pixel'],
      },
    ],
  },
];

const note = (id: string, x: number) => ({ id, type: 'note', x, y: 100, w: 200, h: 100, r: 0, text: id });
const at = { x: 0, y: 0, w: 0, h: 0, r: 0 };
const BOARD = {
  id: 'p',
  name: 'Probe',
  cards: [
    note('a', 100),
    note('b', 400),
    note('c', 700),
    { ...at, id: 'au', type: 'audio', x: 100, y: 300, w: 300, h: 170, dur: 12, title: 'Memo', text: 'hello there' },
    {
      ...at,
      id: 'lk',
      type: 'link',
      x: 500,
      y: 300,
      w: 260,
      h: 140,
      url: 'https://example.com',
      title: 'Example',
      desc: 'A page',
    },
    { ...at, id: 'sc', type: 'section', x: 860, y: 300, w: 400, h: 240, name: 'Plan' },
    {
      ...at,
      id: 'sp',
      type: 'spotify',
      x: 100,
      y: 560,
      w: 300,
      h: 200,
      title: 'Song',
      url: 'https://open.spotify.com/track/abc',
      kind: 'track',
      sid: 'abc',
    },
  ],
  links: [],
  tray: [],
};

// the colours as the pixels they paint, so oklab(), color(srgb …) and rgb() compare as the one colour they are
const MISSING = '(no element)';
async function pixel(page: Page, selector: string, at: number) {
  const spot = await page.evaluate(
    ({ selector, at }) => {
      const r = document.querySelector(selector)?.getBoundingClientRect();
      return r ? { x: Math.floor(r.left + r.width * at), y: Math.floor(r.top + r.height / 2) } : null;
    },
    { selector, at },
  );
  if (!spot) return MISSING;
  const png = await page.screenshot({ clip: { ...spot, width: 1, height: 1 } });
  const [r, g, b, a] = await page.evaluate(async bytes => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)]));
    const ctx = new OffscreenCanvas(1, 1).getContext('2d');
    ctx?.drawImage(bitmap, 0, 0);
    return Array.from(ctx?.getImageData(0, 0, 1, 1).data ?? []);
  }, Array.from(png));
  return `rgba(${r}, ${g}, ${b}, ${Math.round(((a ?? 0) / 255) * 1000) / 1000})`;
}

async function read(page: Page, probe: Probe) {
  if (probe.at !== undefined) return [await pixel(page, probe.selector, probe.at)];
  return page.evaluate(({ selector, pseudo, props, as }) => {
    const el = document.querySelector(selector);
    if (!el) return props.map(() => '(no element)');
    const kid = as ? document.createElement('div') : null;
    if (kid) {
      kid.style.cssText = as ?? '';
      el.appendChild(kid);
    }
    const style = getComputedStyle(kid ?? el, pseudo);
    const painted = (v: string) =>
      v.replace(/(?:oklch|oklab|lab|lch|hsla?|hwb|color)\((?:[^()]|\([^()]*\))*\)/g, c => {
        const [r, g, b, a] = window.__paint(c);
        return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;
      });
    const values = props.map(p => painted(style.getPropertyValue(p)));
    kid?.remove();
    return values;
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
