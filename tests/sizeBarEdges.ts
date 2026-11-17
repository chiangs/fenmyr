// The ways a size or align dropdown can end besides Enter and Esc. A value typed and left uncommitted lands on the card
// the dropdown was for, even when the press that closes it selects another card or the bare board. A dropdown closed by
// its own trigger, or a value the card rounds or clamps, ends the visit's undo step there, so later changes undo one at
// a time. And Enter in a size field folded into ··· leaves focus on ···.
import assert from 'node:assert';
import { wireframeBoard } from './fixtures/boards.ts';
import { launch, settle } from './support/launch.ts';

const board = wireframeBoard();
const box = (id: string, x: number, y: number) => ({
  id,
  type: 'box',
  x: 470 + x,
  y,
  w: 160,
  h: 100,
  r: 0,
  color: 'white',
  onFrame: 'empty',
  fill: '#e4e4e7',
});
board.cards.push(box('fbox', 40, 100), box('gbox', 40, 400));
const l = await launch({ boards: [board], open: 'wire' });
const { page, app } = l;

const card = (id: string) =>
  page.evaluate(i => {
    const c = window.__fenmyr.curBoard()?.cards.find(k => k.id === i);
    if (!c) throw new Error(`no card ${i}`);
    return { x: c.x, w: c.w };
  }, id);
const selected = () =>
  page.evaluate(() => [...document.querySelectorAll('#cards .card.sel')].map(c => c.getAttribute('data-id')));
const select = async (ids: string[]) => {
  await page.evaluate(i => window.__fenmyr.selectOnly(i), ids);
  await settle(page, 250);
};
const open = async (pop: string) => {
  await page.click(`#selbar [data-pop="${pop}"]`);
  await page.waitForTimeout(150);
};
// a change from the Wireframe panel, which leaves its undo step to the board's 350 ms settle
const panelX = async (x: number) => {
  await page.evaluate(v => {
    const i = document.querySelector('#dzProps input[data-k="x"]');
    if (!(i instanceof HTMLInputElement)) throw new Error('no X in the panel');
    i.value = String(v);
    i.dispatchEvent(new Event('input', { bubbles: true }));
  }, x);
  await page.waitForTimeout(500);
};
const undo = async () => {
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
  await page.keyboard.press('Control+z');
  await settle(page, 250);
};

try {
  await settle(page, 800);
  await select(['fbox']);
  await open('place');
  await page.fill('#selbar [data-size="w"]', '300');
  await page.locator('#cards [data-id="gbox"]').click();
  await settle(page, 250);
  assert.deepStrictEqual(
    [(await card('fbox')).w, (await card('gbox')).w, await selected()],
    [300, 160, ['gbox']],
    'a W left typed lands on its own box when a press selects another, and the other stays selected',
  );

  await select(['fbox']);
  await open('place');
  await page.fill('#selbar [data-size="w"]', '250');
  await page.mouse.click(760, 700);
  await settle(page, 250);
  assert.deepStrictEqual(
    [(await card('fbox')).w, await selected()],
    [250, []],
    'and when a press on the bare board selects nothing',
  );

  await select(['fbox']);
  await open('place');
  await page.fill('#selbar [data-size="w"]', '200');
  await page.keyboard.press('Tab');
  await page.click('#selbar [data-pop="place"]');
  await page.waitForTimeout(150);
  await panelX(600);
  await panelX(640);
  await undo();
  assert.deepStrictEqual(
    await card('fbox'),
    { x: 600, w: 200 },
    'after a Size dropdown closed by its trigger, one undo takes back only the last change',
  );

  await select(['fbox']);
  await open('align');
  await page.click('#selbar .sb-pop-align [data-arr="left"]');
  await page.waitForTimeout(150);
  await page.click('#selbar [data-pop="align"]');
  await page.waitForTimeout(150);
  await panelX(560);
  await panelX(580);
  await undo();
  assert.strictEqual((await card('fbox')).x, 560, 'and so after Align ▾ closed by its trigger');

  await select(['fbox']);
  await open('place');
  await page.fill('#selbar [data-size="w"]', '3');
  await page.keyboard.press('Enter');
  await settle(page, 150);
  assert.strictEqual((await card('fbox')).w, 8, 'W 3 makes the box 8 wide');
  assert.strictEqual(
    await page.evaluate(() => {
      const i = document.querySelector('#selbar [data-size="w"]');
      return i instanceof HTMLInputElement ? i.value : null;
    }),
    '8',
    'and the field shows the 8 it took',
  );
  await panelX(520);
  await panelX(540);
  await undo();
  assert.deepStrictEqual(await card('fbox'), { x: 520, w: 8 }, 'and later changes still undo one at a time');

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(390, 844));
  await settle(page, 700);
  await select(['fbox']);
  await open('more');
  await open('place');
  await page.click('#selbar [data-size="w"]');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('120');
  await page.keyboard.press('Enter');
  await settle(page, 150);
  assert.strictEqual((await card('fbox')).w, 120, 'on a phone W 120 from inside ··· sizes the box');
  assert.strictEqual(
    await page.evaluate(() => document.activeElement?.getAttribute('data-pop')),
    'more',
    'and Enter leaves focus on ···, which held the size',
  );
  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('sizeBarEdges: ok');
} finally {
  await l.close();
}
