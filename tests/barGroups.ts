// Which groups and buttons the selection bar shows for every kind of card, the common mixed selections, a connector
// and the crop bar, held against tests/fixtures/barGroups.json. `node tests/barGroups.ts --write` records them anew;
// the diff of that file is then the change to review.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { everyOfflineCard } from './fixtures/boards.ts';
import { launch, ROOT, settle } from './support/launch.ts';

const at = (id: string, type: string, x: number, y: number, w: number, h: number, more = {}) => ({
  id,
  type,
  x,
  y,
  w,
  h,
  r: 0,
  color: 'white',
  ...more,
});
const board = everyOfflineCard();
board.cards.push(
  at('video', 'video', 0, 1100, 360, 246, {}),
  at('spotify', 'spotify', 400, 1100, 300, 152, { title: 'A song' }),
  at('weblink', 'link', 760, 1100, 260, 210, { url: 'https://example.com', title: 'Example' }),
  at('rect', 'shape', 1060, 1100, 160, 160, { shape: 'rect', text: 'Rect' }),
  at('line', 'shape', 1260, 1100, 200, 40, { shape: 'line' }),
  at('pictured', 'box', 1500, 1100, 160, 100, { src: 'stamps/myra-happy.png' }),
  at('plainbox', 'box', 1700, 1100, 160, 100, {}),
  at('openpath', 'path', 1900, 1100, 200, 120, {
    pts: [
      { x: 0, y: 0 },
      { x: 200, y: 40 },
      { x: 80, y: 120 },
    ],
    ow: 200,
    oh: 120,
  }),
  at('dated', 'note', 0, 1400, 220, 140, { name: '', text: 'Due soon', due: '2030-01-02T09:30' }),
  at('ga', 'note', 300, 1400, 220, 140, { name: '', text: 'Grouped a', group: 'g1' }),
  at('gb', 'note', 560, 1400, 220, 140, { name: '', text: 'Grouped b', group: 'g1' }),
  at('stroked', 'title', 820, 1400, 320, 50, { text: 'Outlined', stroke: '#27272a', sw: 2 }),
);

const SINGLES = board.cards.map(c => c.id).filter(id => id !== 'ga' && id !== 'gb');
const MIXED: Record<string, string[]> = {
  'note+todo': ['note', 'todo'],
  'note+title': ['note', 'title'],
  'note+todo+swatch': ['note', 'todo', 'swatch'],
  'note+image': ['note', 'image'],
  'note+coll': ['note', 'coll'],
  'note+section': ['note', 'section'],
  'three notes': ['note', 'myranote', 'dated'],
  'title+text': ['title', 'text'],
  'box+frame': ['plainbox', 'frame'],
  'box+pictured box': ['plainbox', 'pictured'],
  'frame+image': ['frame', 'image'],
  'rect+line': ['rect', 'line'],
  'rect+circle': ['rect', 'shape'],
  'path+open path': ['path', 'openpath'],
  'title+icon': ['title', 'icon'],
  'title+shape': ['title', 'shape'],
  'link+vnote': ['link', 'vnote'],
  grouped: ['ga', 'gb'],
  everything: board.cards.map(c => c.id),
};

const l = await launch({ boards: [board], open: 'every' });
const { page } = l;
// wide enough that no group tucks into ···, so what shows doesn't hang on how wide each word is
await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(2600, 900));
await settle(page);
const frames = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

// Each top child of the bar as one line: the label, a group with its fold order, or a loose control. A control is its
// data attributes, its tooltip, its words and its state; a dropdown also lists what it holds.
const record = () =>
  page.evaluate(() => {
    const bar = document.getElementById('selbar');
    if (!bar?.classList.contains('on')) return ['(no bar)'];
    const IGNORE = new Set(['tt', 'for', 'popw']);
    const control = (e: Element): string => {
      const data = Object.entries(e instanceof HTMLElement ? e.dataset : {})
          .filter(([k]) => !IGNORE.has(k))
          .map(([k, v]) => (v ? `${k}=${v}` : k)),
        tip = e.getAttribute('title') ?? (e instanceof HTMLElement ? e.dataset.tt : undefined),
        name = e.getAttribute('aria-label'),
        words = e.textContent?.replace(/\s+/g, ' ').trim(),
        flags = [
          e.classList.contains('on') && 'on',
          e.hasAttribute('disabled') && 'disabled',
          e.hasAttribute('hidden') && 'hidden',
          e.getAttribute('aria-pressed') === 'true' && 'pressed',
        ].filter(Boolean);
      return [
        e.tagName.toLowerCase(),
        ...data,
        tip && `"${tip}"`,
        name && name !== tip && `name="${name}"`,
        words && `'${words}'`,
        flags.length && `[${flags.join(' ')}]`,
      ]
        .filter(Boolean)
        .join(' ');
    };
    const CONTROLS = 'button, input, .sb-tilt, label.sf-any';
    const part = (e: Element): string => {
      if (e.matches('.sb-sep')) return e.hasAttribute('hidden') ? '| hidden' : '|';
      if (e.matches('.sb-popw')) {
        const trig = e.querySelector(':scope > [data-pop]'),
          inside = [...e.querySelectorAll(`:scope > .sb-pop :is(${CONTROLS})`)].map(control);
        return `${trig ? control(trig) : '?'}${e.hasAttribute('hidden') ? ' [hidden]' : ''} { ${inside.join(' ; ')} }`;
      }
      if (e.matches(CONTROLS)) return control(e);
      const inner = [...e.children].map(part).filter(Boolean);
      return inner.length ? inner.join(' ') : e.textContent?.trim() ? `'${e.textContent.trim()}'` : '';
    };
    const lines = [...bar.children].map(e => {
      if (e.matches('.sb-label')) return `label '${e.textContent?.trim()}'`;
      if (e.matches('.sb-g')) {
        const fold = e instanceof HTMLElement ? e.dataset.fold : '?',
          kind = e.classList.contains('sb-typing') ? ' typing' : '';
        return `G${fold}${kind}: ${[...e.children].map(part).join(' ')}`;
      }
      return part(e);
    });
    const folded = bar.querySelectorAll('.sb-morebody > *').length;
    return folded ? [...lines, `(${folded} folded into ···)`] : lines;
  });

const select = async (ids: string[]) => {
  await page.evaluate(() => window.__fenmyr.selectOnly([]));
  await frames();
  await page.evaluate(ids => window.__fenmyr.selectOnly(ids), ids);
  await frames();
  await page.waitForTimeout(100);
};

const seen: Record<string, string[]> = {};
for (const id of SINGLES) {
  await select([id]);
  seen[id] = await record();
}
for (const [what, ids] of Object.entries(MIXED)) {
  await select(ids);
  seen[what] = await record();
}

await page.evaluate(() => window.__fenmyr.selectOnly([]));
await page.evaluate(() => window.__fenmyr.selectWire('l1'));
await frames();
seen.connector = await record();

await select(['image']);
await page.click('#selbar [data-sb="crop"]');
await page.waitForSelector('#selbar [data-crop="done"]');
seen.cropping = await record();
await page.click('#selbar [data-crop="cancel"]');
await frames();

const errors = [...l.errors];
await l.close();

const FILE = path.join(ROOT, 'tests/fixtures/barGroups.json');
if (process.argv.includes('--write')) {
  fs.writeFileSync(FILE, `${JSON.stringify(seen, null, 2)}\n`);
  console.log(`wrote ${FILE}`);
}
const want: unknown = JSON.parse(fs.readFileSync(FILE, 'utf8'));
assert.deepStrictEqual(errors, []);
assert.deepStrictEqual(seen, want, 'the bar shows the groups and buttons it always has');
console.log('BAR GROUPS OK');
