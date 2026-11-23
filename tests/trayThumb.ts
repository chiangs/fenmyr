// A picture in the Unsorted list is a thumbnail: a tall one is cut off at a set height instead of filling the list, and
// a short one keeps the height it has.
import assert from 'node:assert';
import { launch } from './support/launch.ts';
import { still } from './support/settled.ts';

const svg = (w: number, h: number) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#c33"/></svg>`)}`;
const item = (id: string, src: string) => ({
  id,
  type: 'image',
  x: 0,
  y: 0,
  w: 200,
  h: 100,
  r: 0,
  color: 'white',
  src,
});
const l = await launch({
  boards: [
    {
      id: 'b',
      name: 'b',
      cards: [{ id: 'n', type: 'note', x: 0, y: 0, w: 220, h: 120, r: 0, color: 'white', text: 'A note' }],
      links: [],
      tray: [item('tall', svg(100, 800)), item('wide', svg(800, 80))],
      view: { x: 300, y: 200, z: 1 },
    },
  ],
  open: 'b',
});
const { page } = l;
await page.waitForFunction(() =>
  [...document.querySelectorAll('.tray-item img')].every(
    i => i instanceof HTMLImageElement && i.complete && i.naturalHeight > 0,
  ),
);
await still(page);

const sizes = await page.evaluate(() =>
  [...document.querySelectorAll('.tray-item img')].map(i => {
    const r = i.getBoundingClientRect(),
      row = i.closest('.tray-item')?.getBoundingClientRect();
    return { w: r.width, h: r.height, row: row?.width ?? 0 };
  }),
);
await l.close();

const [tall, wide] = sizes;
assert.ok(tall && wide, 'both pictures are in the list');
assert.ok(tall.h <= 140, `a tall picture is cut off at 140 px, not ${tall.h.toFixed(0)}`);
assert.ok(tall.h >= 100, `and it still shows a good part of the picture, ${tall.h.toFixed(0)} px`);
assert.ok(wide.h < 60, `a short picture keeps its own height, ${wide.h.toFixed(0)} px`);
assert.ok(Math.abs(tall.w - wide.w) < 1, 'both are as wide as the list');
console.log('TRAY THUMB OK');
