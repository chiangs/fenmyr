// A wireframe text's Type ▾ in the bar sets its size, weight, line height and alignment, and one visit undoes as one
// step while a change from elsewhere meanwhile takes its own. The keyboard and a screen reader reach every control in
// it.
import assert from 'node:assert';
import { wireframeBoard } from './fixtures/boards.ts';
import { launch, settle } from './support/launch.ts';

const board = wireframeBoard();
const on = (id: string, type: string, x: number, y: number, w: number, h: number, more = {}) => ({
  id,
  type,
  x: 470 + x,
  y,
  w,
  h,
  r: 0,
  color: 'white',
  onFrame: 'empty',
  ...more,
});
board.cards.push(
  on('ta', 'text', 40, 100, 220, 30, { text: 'First', size: 18 }),
  on('tb', 'text', 40, 200, 220, 30, { text: 'Second', size: 18 }),
  on('nb', 'box', 40, 400, 160, 100, { fill: '#e4e4e7' }),
);
const l = await launch({ boards: [board], open: 'wire' });
const { page } = l;

type Look = { size?: number; weight?: number; lh?: number; align?: string };
const look = (id: string): Promise<Look> =>
  page.evaluate(i => {
    const c = window.__fenmyr.curBoard()?.cards.find(k => k.id === i);
    if (c?.type !== 'text') throw new Error(`no text ${i}`);
    return { size: c.size, weight: c.weight, lh: c.lh, align: c.align };
  }, id);
const select = async (ids: string[]) => {
  await page.evaluate(i => window.__fenmyr.selectOnly(i), ids);
  await settle(page, 250);
};
const trigger = () => page.evaluate(() => document.querySelector('#selbar [data-pop="type"] b')?.textContent ?? null);
const open = async () => {
  await page.click('#selbar [data-pop="type"]');
  await page.waitForTimeout(150);
};
const isOpen = () => page.evaluate(() => !!document.querySelector('#selbar [data-popw="type"].open'));
const box = () => page.locator('#selbar [data-popw="type"]');
const undo = async () => {
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
  await page.keyboard.press('Control+z');
  await settle(page, 250);
};
const failed: string[] = [];
const check = async (name: string, run: () => Promise<void>) => {
  try {
    await run();
  } catch (e) {
    failed.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
  }
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await settle(page, 150);
};

try {
  await settle(page, 800);
  await page.evaluate(() => {
    Object.assign(window.__fenmyr.view, { x: -100, y: 40, z: 1 });
    window.__fenmyr.applyView();
  });
  await settle(page, 300);

  await check('the trigger', async () => {
    await select(['ta']);
    assert.strictEqual(await trigger(), '18', 'a text’s bar shows Type ▾ with its size');
    await select(['nb']);
    assert.strictEqual(await trigger(), null, 'a box shows no Type ▾');
  });

  await check('size, weight, line height and alignment land, as one undo step', async () => {
    await select(['ta']);
    await open();
    // a pause past the board's 350 ms settle between changes, so each would be its own step without the visit
    await box().getByRole('spinbutton', { name: 'Text size in pixels' }).fill('24');
    await page.waitForTimeout(450);
    await box().getByRole('button', { name: 'Smaller' }).click();
    await page.waitForTimeout(450);
    await box().getByRole('button', { name: 'Bold' }).click();
    await page.waitForTimeout(450);
    await box().getByRole('spinbutton', { name: 'Line height' }).fill('1.6');
    await page.waitForTimeout(450);
    await box().getByRole('button', { name: 'Centre' }).click();
    await settle(page, 450);
    assert.deepStrictEqual(
      await look('ta'),
      { size: 23, weight: 700, lh: 1.6, align: 'center' },
      '24, then −, then Bold, 1.6 and Centre land on the text',
    );
    assert.strictEqual(await trigger(), '23', 'the trigger follows the size while the dropdown is open');
    await page.keyboard.press('Escape');
    await undo();
    assert.deepStrictEqual(
      await look('ta'),
      { size: 18, weight: undefined, lh: undefined, align: undefined },
      'one undo takes the whole visit back',
    );
  });

  await check('a change from Myra to the same text during a visit takes its own step', async () => {
    await select(['ta']);
    await open();
    await box().getByRole('button', { name: 'Extra' }).click();
    await page.waitForTimeout(450);
    await page.evaluate(() => window.__fenmyr.applyMyra({ say: 'ok', edit: [{ id: 'ta', text: 'Hers' }] }, 'q'));
    await page.waitForTimeout(450);
    assert.ok(await isOpen(), 'Type ▾ stays open through her change');
    await box().getByRole('button', { name: 'Light' }).click();
    await settle(page, 450);
    await page.keyboard.press('Escape');
    const text = () =>
      page.evaluate(() => {
        const c = window.__fenmyr.curBoard()?.cards.find(k => k.id === 'ta');
        return c?.type === 'text' ? c.text : null;
      });
    await undo();
    assert.deepStrictEqual(
      [(await look('ta')).weight, await text()],
      [800, 'Hers'],
      'the first undo takes back only what the visit did after her change',
    );
    await undo();
    assert.strictEqual(await text(), 'First', 'the next undo takes back her change');
    await undo();
    assert.strictEqual((await look('ta')).weight, undefined, 'and the one after it the visit’s first change');
  });

  await check('two texts take one change together', async () => {
    await select(['ta', 'tb']);
    await open();
    await box().getByRole('button', { name: 'Align right' }).click();
    await settle(page, 300);
    assert.deepStrictEqual(
      [(await look('ta')).align, (await look('tb')).align],
      ['right', 'right'],
      'Align right lands on both texts',
    );
    await page.keyboard.press('Escape');
    await undo();
  });

  await check('the keyboard and a screen reader', async () => {
    await select(['ta']);
    const trig = page.locator('#selbar [data-pop="type"]');
    assert.strictEqual(await trig.getAttribute('aria-label'), 'Type, 18', 'the trigger reads Type, 18');
    await trig.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    assert.ok(await isOpen(), 'Enter on the trigger opens Type ▾');
    for (const name of ['Smaller', 'Bigger', 'Light', 'Regular', 'Medium', 'Semi', 'Bold', 'Extra'])
      assert.strictEqual(
        await box().getByRole('button', { name, exact: true }).count(),
        1,
        `it has a button “${name}”`,
      );
    for (const name of ['Align left', 'Centre', 'Align right'])
      assert.strictEqual(await box().getByRole('button', { name, exact: true }).count(), 1, `and “${name}”`);
    assert.strictEqual(await box().getByRole('slider', { name: 'Line height' }).count(), 1, 'and a Line height slider');
    assert.strictEqual(await box().getByRole('group', { name: 'Weight' }).count(), 1, 'the weights are one group');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Control+a');
    await page.keyboard.type('3');
    await page.waitForTimeout(100);
    assert.strictEqual((await look('ta')).size, 18, 'a 3 on its way to 30 leaves the text at its size, not 6');
    await page.keyboard.type('0');
    await page.keyboard.press('Enter');
    await settle(page, 250);
    assert.strictEqual((await look('ta')).size, 30, 'Tab reaches the size, and a typed 30 lands');
    assert.ok(
      !(await isOpen()) && (await page.evaluate(() => document.activeElement?.getAttribute('data-pop'))) === 'type',
      'Enter closes it, with focus back on the trigger',
    );
    await undo();
  });

  for (const f of failed) console.log(`FAILED ${f}`);
  assert.deepStrictEqual(failed, [], 'every check passes');
  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('pieceType: ok');
} finally {
  await l.close();
}
