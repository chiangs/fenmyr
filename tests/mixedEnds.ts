// Home and End on a slider that reads Mixed: End takes every card to the top of the range and Home to the bottom,
// both alike, for Fill's Opacity and Type ▾'s line height.
import assert from 'node:assert';
import { wireframeBoard } from './fixtures/boards.ts';
import { launch, settle } from './support/launch.ts';

const board = wireframeBoard();
const on = (id: string, type: string, y: number, more = {}) => ({
  id,
  type,
  x: 510,
  y,
  w: 200,
  h: 60,
  r: 0,
  color: 'white',
  onFrame: 'empty',
  ...more,
});
board.cards.push(
  on('tb', 'text', 160, { text: 'Tight', size: 18, lh: 1 }),
  on('tc', 'text', 240, { text: 'Airy', size: 24, lh: 2.2 }),
  on('b1', 'box', 400, { fill: '#e4e4e7', opacity: 0.4 }),
  on('b2', 'box', 520, { fill: '#e4e4e7', opacity: 0.8 }),
);
const l = await launch({ boards: [board], open: 'wire' });
const { page } = l;
const values = (ids: string[]) =>
  page.evaluate(
    is =>
      is.map(i => {
        const c = window.__fenmyr.curBoard()?.cards.find(x => x.id === i);
        if (c?.type === 'box') return c.opacity ?? 1;
        return c?.type === 'text' ? (c.lh ?? null) : null;
      }),
    ids,
  );
// selects the cards, opens the dropdown and presses one key on its slider while it reads Mixed, then undoes it
const press = async (ids: string[], pop: string, slider: string, key: string) => {
  await page.evaluate(i => window.__fenmyr.selectOnly(i), ids);
  await settle(page, 250);
  await page.click(`#selbar [data-pop="${pop}"]`);
  await page.waitForTimeout(150);
  assert.strictEqual(await page.getAttribute(`#selbar ${slider}`, 'aria-valuetext'), 'Mixed', `${pop} reads Mixed`);
  await page.focus(`#selbar ${slider}`);
  await page.keyboard.press(key);
  await settle(page, 250);
  const got = await values(ids);
  await page.keyboard.press('Escape');
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
  await page.keyboard.press('Control+z');
  await settle(page, 250);
  return got;
};

try {
  assert.deepStrictEqual(await press(['b1', 'b2'], 'fill', '[data-bop]', 'End'), [1, 1], 'End takes each box to 100%');
  assert.deepStrictEqual(await press(['b1', 'b2'], 'fill', '[data-bop]', 'Home'), [0, 0], 'Home takes each to 0%');
  assert.deepStrictEqual(
    await press(['tb', 'tc'], 'type', '[data-ty-lh]', 'End'),
    [4, 4],
    'End takes each line height to 4',
  );
  assert.deepStrictEqual(
    await press(['tb', 'tc'], 'type', '[data-ty-lh]', 'Home'),
    [0.5, 0.5],
    'Home takes each to 0.5',
  );
  assert.deepStrictEqual(await values(['b1', 'b2', 'tb', 'tc']), [0.4, 0.8, 1, 2.2], 'each undo puts them back');
  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('mixedEnds: ok');
} finally {
  await l.close();
}
