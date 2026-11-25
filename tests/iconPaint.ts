// An icon's Stroke and Fill, by the pixels they paint: a stroke draws an outline in its colour around the glyph, a
// closed icon (a star) takes a fill inside it from the selection bar, an open one (an arrow) is offered none, and an
// icon changed to an open glyph paints no fill left over from the closed one.
import assert from 'node:assert';
import { launch } from './support/launch.ts';
import { still } from './support/settled.ts';

const RED = '#ff0000',
  BLUE = '#4f9dff';
const icon = (id: string, x: number, name: string, more = {}) => ({
  id,
  type: 'icon',
  x,
  y: 0,
  w: 120,
  h: 120,
  name,
  color: '#27272a',
  ...more,
});
const board = {
  id: 'ip',
  name: 'Icons',
  cards: [
    icon('plain', 0, 'star'),
    icon('sk', 200, 'star', { stroke: RED, sw: 4 }),
    icon('fl', 400, 'star', { fill: BLUE }),
    icon('ar', 600, 'arrow-right'),
  ],
  links: [],
  tray: [],
  view: { x: 120, y: 200, z: 1 },
};
const l = await launch({ boards: [board], open: 'ip' });
const { page } = l;

const select = async (ids: string[]) => {
  await page.evaluate(i => window.__fenmyr.selectOnly(i), ids);
  await still(page);
};
const card = (id: string) =>
  page.evaluate(i => {
    const c = window.__fenmyr.curBoard()?.cards.find(k => k.id === i);
    return c?.type === 'icon' ? { name: c.name, fill: Reflect.get(c, 'fill'), stroke: c.stroke ?? null } : null;
  }, id);
// [r, g, b] in 0 to 255, and how close counts as the same colour
type Rgb = readonly [number, number, number];
const hexRgb = (h: string): Rgb => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];
// the pixels the card paints on screen, with a margin for an outline that reaches past its box: how many are near
// `colour`, and the colour at its centre
async function painted(id: string, colour: string) {
  await select([]);
  const box = await page.locator(`.card[data-id="${id}"]`).boundingBox();
  assert.ok(box, `card ${id} is on the board`);
  const m = 12,
    clip = { x: box.x - m, y: box.y - m, width: box.width + 2 * m, height: box.height + 2 * m },
    png = (await page.screenshot({ clip })).toString('base64');
  return page.evaluate(
    async ({ png, want }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${png}`;
      await img.decode();
      const cv = document.createElement('canvas');
      cv.width = img.width;
      cv.height = img.height;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      if (!ctx) return { near: 0, centre: [0, 0, 0] };
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
      let near = 0;
      for (let i = 0; i < d.length; i += 4) {
        const dist =
          Math.abs((d[i] ?? 0) - want[0]) + Math.abs((d[i + 1] ?? 0) - want[1]) + Math.abs((d[i + 2] ?? 0) - want[2]);
        if (dist < 60) near++;
      }
      const c = (Math.floor(cv.height / 2) * cv.width + Math.floor(cv.width / 2)) * 4;
      return { near, centre: [d[c] ?? 0, d[c + 1] ?? 0, d[c + 2] ?? 0] };
    },
    { png, want: hexRgb(colour) },
  );
}
const close = (a: readonly number[], b: Rgb) => a.every((v, i) => Math.abs(v - (b[i] ?? 0)) < 30);

const failed: string[] = [];
const check = async (name: string, run: () => Promise<void>) => {
  try {
    await run();
  } catch (e) {
    failed.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
  }
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await select([]);
};

try {
  await still(page);

  await check('a stroke draws an outline in its colour around the glyph', async () => {
    assert.strictEqual((await painted('plain', RED)).near, 0, 'a star with no stroke paints no red');
    const { near } = await painted('sk', RED);
    assert.ok(near > 400, `a star with a red 4 px stroke paints a red outline (${near} red pixels)`);
  });

  await check('a closed icon paints its fill inside the glyph', async () => {
    const { centre } = await painted('fl', BLUE);
    assert.ok(close(centre, hexRgb(BLUE)), `the star's middle is the fill colour (${centre.join(', ')})`);
    assert.ok(!close((await painted('plain', BLUE)).centre, hexRgb(BLUE)), 'a star with no fill is empty inside');
  });

  await check('the selection bar fills a closed icon, and No fill empties it without adding a stroke', async () => {
    await select(['plain']);
    assert.strictEqual(await page.locator('#selbar [data-pop="fill"]').count(), 1, 'a star is offered Fill');
    await page.click('#selbar [data-pop="fill"]');
    await page.click('#selbar [data-bfill="#f6b45e"]');
    await still(page);
    assert.strictEqual((await card('plain'))?.fill, '#f6b45e', 'orange is saved as its fill');
    const { centre } = await painted('plain', '#f6b45e');
    assert.ok(close(centre, hexRgb('#f6b45e')), `the star's middle turns orange (${centre.join(', ')})`);
    await select(['plain']);
    await page.click('#selbar [data-pop="fill"]');
    await page.click('#selbar [data-bfill="none"]');
    await still(page);
    assert.deepStrictEqual(await card('plain'), { name: 'star', fill: 'none', stroke: null }, 'No fill adds no stroke');
    assert.ok(!close((await painted('plain', '#f6b45e')).centre, hexRgb('#f6b45e')), 'the star is empty again');
  });

  await check('an open icon is offered no fill', async () => {
    await select(['ar']);
    assert.strictEqual(await page.locator('#selbar [data-chicon]').count(), 1, 'the bar is drawn for the arrow');
    assert.strictEqual(await page.locator('#selbar [data-pop="fill"]').count(), 0, 'an arrow has no Fill');
    await select(['fl', 'ar']);
    assert.strictEqual(await page.locator('#selbar [data-pop="fill"]').count(), 0, 'nor has a star with an arrow');
  });

  await check('changing a filled icon to an open one leaves no fill showing', async () => {
    await select(['fl']);
    await page.click('#selbar [data-chicon]');
    await page.waitForFunction(() => !document.getElementById('piecePick')?.hidden);
    await page.keyboard.type('arrow right');
    await page.click('#piecePick [data-pk-icon="arrow-right"]');
    await still(page);
    assert.strictEqual((await card('fl'))?.name, 'arrow-right', 'the star became an arrow');
    const { near } = await painted('fl', BLUE);
    assert.strictEqual(near, 0, 'the arrow paints no blue');
  });

  for (const f of failed) console.log(`FAILED ${f}`);
  assert.deepStrictEqual(failed, [], 'every check passes');
  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('iconPaint: ok');
} finally {
  await l.close();
}
