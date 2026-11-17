// A size or align dropdown's visit undoes as one step, and nothing else joins it. Delete or Ctrl+D pressed while the
// dropdown is open takes its own step after the visit's, so one Ctrl+Z undoes the shortcut and a second the typed
// value. Opening Align ▾ straight from an open Size ends the Size visit, so each undoes on its own.
import assert from 'node:assert';
import { wireframeBoard } from './fixtures/boards.ts';
import { launch, settle } from './support/launch.ts';

const board = wireframeBoard();
board.cards.push({
  id: 'fbox',
  type: 'box',
  x: 510,
  y: 100,
  w: 160,
  h: 100,
  r: 0,
  color: 'white',
  onFrame: 'empty',
  fill: '#e4e4e7',
});
const l = await launch({ boards: [board], open: 'wire' });
const { page } = l;

const box = () =>
  page.evaluate(() => {
    const c = window.__fenmyr.curBoard()?.cards.find(k => k.id === 'fbox');
    return c ? { x: c.x, y: c.y, w: c.w } : null;
  });
const count = () => page.evaluate(() => window.__fenmyr.curBoard()?.cards.length ?? 0);
const open = async (pop: string) => {
  await page.click(`#selbar [data-pop="${pop}"]`);
  await page.waitForTimeout(150);
};
// types a value and clicks the dropdown's own padding: the value commits, the dropdown stays open and the keyboard
// goes back to the board, so the board's shortcuts work
const typeThenPad = async (field: string, value: string) => {
  await page.fill(`#selbar [data-size="${field}"]`, value);
  const pad = await page.locator('#selbar [data-popw="place"].open .sb-size').boundingBox();
  if (!pad) throw new Error('no size dropdown open');
  await page.mouse.click(pad.x + 3, pad.y + pad.height - 3);
  await page.waitForTimeout(500);
};
const undo = async () => {
  await page.keyboard.press('Control+z');
  await settle(page, 250);
};
const start = async () => {
  await page.evaluate(() => window.__fenmyr.selectOnly(['fbox']));
  await settle(page, 250);
};

try {
  await settle(page, 800);
  await start();
  await open('place');
  await typeThenPad('x', '600');
  assert.deepStrictEqual(
    [(await box())?.x, await page.evaluate(() => !!document.querySelector('.sb-popw.open'))],
    [600, true],
    'X commits and the dropdown stays open',
  );
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(500);
  assert.strictEqual(await box(), null, 'Backspace deletes the box while the dropdown is open');
  await undo();
  assert.deepStrictEqual(await box(), { x: 600, y: 100, w: 160 }, 'one undo brings the box back with the typed X');
  await undo();
  assert.deepStrictEqual(await box(), { x: 510, y: 100, w: 160 }, 'and a second undo takes back the X');

  await start();
  const n = await count();
  await open('place');
  await typeThenPad('w', '300');
  await page.keyboard.press('Control+d');
  await page.waitForTimeout(500);
  assert.strictEqual(await count(), n + 1, 'Ctrl+D copies the box while the dropdown is open');
  await undo();
  assert.deepStrictEqual([await count(), (await box())?.w], [n, 300], 'one undo takes back the copy, not the W');
  await undo();
  assert.strictEqual((await box())?.w, 160, 'and a second undo takes back the W');

  await start();
  await open('place');
  await page.fill('#selbar [data-size="x"]', '600');
  await page.keyboard.press('Tab');
  await open('align');
  await page.click('#selbar [data-arr="top"]');
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await settle(page, 250);
  assert.deepStrictEqual(await box(), { x: 600, y: 0, w: 160 }, 'Size then Align ▾ moves the box across and up');
  await undo();
  assert.deepStrictEqual(await box(), { x: 600, y: 100, w: 160 }, 'one undo takes back only the Align ▾ visit');
  await undo();
  assert.deepStrictEqual(await box(), { x: 510, y: 100, w: 160 }, 'and a second undo the Size visit');

  assert.deepStrictEqual(l.errors, [], 'no page errors');
  console.log('BAR VISIT UNDO OK');
} finally {
  await l.close();
}
