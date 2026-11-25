// Holding one tool and choosing an icon swaps what is in hand. With the screen tool held and the Pieces picker still
// open, a heart dragged out of the grid rides the pointer as the heart, not the screen, and lands as one.
import assert from 'node:assert';
import { wireframeBoard } from './fixtures/boards.ts';
import { launch } from './support/launch.ts';
import { still } from './support/settled.ts';

const l = await launch({ boards: [wireframeBoard()], open: 'wire' });
const { page } = l;
const kinds = () =>
  page.evaluate(() =>
    (window.__fenmyr.curBoard()?.cards ?? []).map(c => `${c.type}${c.type === 'icon' ? ` ${c.name ?? ''}` : ''}`),
  );

try {
  await page.evaluate(() => window.__fenmyr.selectOnly(['signin']));
  await still(page);
  await page.locator('#piecePick').waitFor();
  await page.click('#piecePick [data-pk-view="icons"]');
  await page.fill('#pkSearch', 'heart');
  await page.locator('#pkGrid [data-pk-icon="heart"]').waitFor();
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
  await page.mouse.move(900, 300);
  await page.keyboard.press('w');
  await still(page);
  const held = await page.evaluate(() => ({
    ghost: document.getElementById('ghost')?.className,
    picker: !document.getElementById('piecePick')?.hidden,
  }));
  assert.deepStrictEqual(
    held,
    { ghost: 'ghost on frame', picker: true },
    'the screen tool is in hand, the picker open',
  );
  const before = await kinds();
  const bare = await page.evaluate(() => {
    for (let y = 700; y > 100; y -= 30)
      for (let x = 280; x < 1150; x += 30)
        if (['grid', 'stage', 'world', 'cards'].includes(document.elementFromPoint(x, y)?.id ?? '')) return { x, y };
    throw new Error('no bare board in view');
  });
  const cell = await page.locator('#pkGrid [data-pk-icon="heart"]').boundingBox();
  assert.ok(cell, 'the heart is in the grid');
  await page.mouse.move(cell.x + cell.width / 2, cell.y + cell.height / 2);
  await page.mouse.down();
  await page.mouse.move(bare.x, bare.y, { steps: 12 });
  assert.strictEqual(
    await page.evaluate(() => document.getElementById('ghost')?.className),
    'ghost on icon',
    'the heart rides the pointer in place of the screen',
  );
  await page.mouse.up();
  await page.waitForFunction(n => (window.__fenmyr.curBoard()?.cards.length ?? 0) > n, before.length);
  await still(page);
  const now = await kinds();
  assert.deepStrictEqual(now.slice(before.length), ['icon heart'], 'and lands as a heart, with no screen');
  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('heldSwap: ok');
} finally {
  await l.close();
}
