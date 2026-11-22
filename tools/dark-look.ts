// What tools/dark-probe.ts and tools/dark-sweep.ts share: the six looks, the board they open, the page set-up, and the diff
// of two snapshots.
import fs from 'node:fs';
import type { Page } from 'playwright';
import { apart, hexOf } from '../src/web/ui/color.ts';
import { installPaint } from '../tests/support/paint.ts';

export type Look = { name: string; settings: Record<string, unknown> };
export const LOOKS: Look[] = [
  { name: 'default light', settings: { theme: 'light' } },
  { name: 'default dark', settings: { theme: 'dark' } },
  { name: 'midsummer', settings: { theme: 'light', lightTheme: 'midsummer' } },
  { name: 'clear', settings: { theme: 'light', lightTheme: 'clear' } },
  { name: 'polar night', settings: { theme: 'dark', darkTheme: 'polar-night' } },
  { name: 'lantern', settings: { theme: 'dark', darkTheme: 'lantern' } },
];

// two frames after a change, so a style that needs a frame to apply has applied
export const frames = (page: Page) =>
  page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));

// the colours are read as the pixels they paint, so oklab(), color(srgb …) and rgb() compare as the one colour they are,
// and nothing moves between two reads
export async function prepare(page: Page) {
  await installPaint(page);
  await page.addStyleTag({
    content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
  });
}

export const MISSING = '(no element)';

const note = (id: string, x: number) => ({ id, type: 'note', x, y: 100, w: 200, h: 100, r: 0, text: id });
const at = { x: 0, y: 0, w: 0, h: 0, r: 0 };
export const BOARD = {
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

export function diff(beforeFile: string, afterFile: string) {
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
