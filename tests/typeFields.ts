// The number fields in Type ▾ and in Fill's Opacity: a typed number lands once, whole, when the field is left or Enter
// pressed, so 60 never sets 6 first. A size past either end lands at that end, and a cleared field leaves the cards
// as they were. Type ▾ takes every size and line height the Wireframe panel kept. Texts whose line heights differ show
// them blank, as differing sizes do, and an arrow on the slider moves each from its own.
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
  on('tb', 'text', 40, 160, 220, 30, { text: 'Tight', size: 18, lh: 1 }),
  on('tc', 'text', 40, 220, 220, 60, { text: 'Airy', size: 24, lh: 2.2 }),
  on('b1', 'box', 40, 400, 160, 100, { fill: '#e4e4e7' }),
  on('b2', 'box', 40, 520, 160, 100, { fill: '#e4e4e7', opacity: 0.4 }),
);
const l = await launch({ boards: [board], open: 'wire' });
const { page } = l;

const prop = (id: string, k: 'size' | 'lh' | 'opacity') =>
  page.evaluate(
    ({ i, key }) => {
      const c = window.__fenmyr.curBoard()?.cards.find(x => x.id === i);
      if (c?.type === 'text' && key !== 'opacity') return c[key] ?? null;
      if (c?.type === 'box' && key === 'opacity') return c.opacity ?? null;
      return null;
    },
    { i: id, key: k },
  );
const select = async (ids: string[]) => {
  await page.evaluate(i => window.__fenmyr.selectOnly(i), ids);
  await settle(page, 250);
};
const openTo = async (pop: string, field: string) => {
  await page.click(`#selbar [data-pop="${pop}"]`);
  await page.waitForTimeout(150);
  await page.click(`#selbar ${field}`);
  await page.keyboard.press('Control+a');
};
// types one key at a time, and reads what the card holds after each
const typeEach = async (keys: string, read: () => Promise<unknown>) => {
  const seen: unknown[] = [];
  for (const k of keys) {
    await page.keyboard.type(k);
    seen.push(await read());
  }
  return seen;
};
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

  await check('a typed size lands once, whole, on Enter', async () => {
    await select(['ta']);
    await openTo('type', '[data-ty-size]');
    assert.deepStrictEqual(await typeEach('60', () => prop('ta', 'size')), [18, 18], 'typing 60 sets neither 6 nor 60');
    await page.keyboard.press('Enter');
    await settle(page, 250);
    assert.strictEqual(await prop('ta', 'size'), 60, 'Enter lands 60');
    await undo();
    assert.strictEqual(await prop('ta', 'size'), 18, 'and one undo takes it back');
  });

  await check('a typed size lands when the field is left', async () => {
    await select(['ta']);
    await openTo('type', '[data-ty-size]');
    await page.keyboard.type('72');
    await page.keyboard.press('Tab');
    await settle(page, 250);
    assert.strictEqual(await prop('ta', 'size'), 72, 'Tab away lands 72');
    await page.keyboard.press('Escape');
    await undo();
  });

  await check('a size past either end lands at that end', async () => {
    await select(['ta']);
    await openTo('type', '[data-ty-size]');
    await page.keyboard.type('0');
    await page.keyboard.press('Enter');
    await settle(page, 250);
    const least = await prop('ta', 'size');
    assert.ok(typeof least === 'number' && least > 0 && least < 18, `0 lands at the least size: ${least}`);
    assert.strictEqual(
      await page.textContent('#selbar [data-pop="type"] b'),
      String(least),
      'and the trigger reads it',
    );
    await openTo('type', '[data-ty-size]');
    await page.keyboard.type('99999');
    await page.keyboard.press('Enter');
    await settle(page, 250);
    const most = await prop('ta', 'size');
    assert.ok(typeof most === 'number' && most > 18 && most < 99999, `99999 lands at the most: ${most}`);
    await undo();
    await undo();
  });

  await check('a cleared size leaves the text as it was', async () => {
    await select(['ta']);
    await openTo('type', '[data-ty-size]');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Enter');
    await settle(page, 250);
    assert.strictEqual(await prop('ta', 'size'), 18, 'the text keeps 18');
  });

  await check('a typed opacity lands once, whole, and a cleared one leaves the boxes', async () => {
    await select(['b1', 'b2']);
    await openTo('fill', '[data-bopn]');
    const both = async () => [await prop('b1', 'opacity'), await prop('b2', 'opacity')];
    assert.deepStrictEqual(
      await typeEach('80', both),
      [
        [null, 0.4],
        [null, 0.4],
      ],
      'typing 80 sets neither 8% nor 80%',
    );
    await page.keyboard.press('Enter');
    await settle(page, 250);
    assert.deepStrictEqual(await both(), [0.8, 0.8], 'Enter lands 80%');
    await openTo('fill', '[data-bopn]');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Tab');
    await settle(page, 250);
    assert.deepStrictEqual(await both(), [0.8, 0.8], 'a cleared field leaves them at 80%');
    assert.strictEqual(await page.inputValue('#selbar [data-bopn]'), '80', 'and reads 80 again');
    await page.click('#selbar [data-bopn]');
    await page.keyboard.press('Control+a');
    await page.keyboard.type('150');
    await page.keyboard.press('Tab');
    await settle(page, 250);
    assert.deepStrictEqual(await both(), [null, null], '150 lands as 100%, which keeps no opacity');
    assert.strictEqual(await page.inputValue('#selbar [data-bopn]'), '100', 'and the field reads 100');
    await page.keyboard.press('Escape');
    await undo();
  });

  await check('Type ▾ takes the sizes and line heights the panel kept', async () => {
    await select(['ta']);
    await openTo('type', '[data-ty-size]');
    await page.keyboard.type('500');
    await page.keyboard.press('Enter');
    await settle(page, 250);
    assert.strictEqual(await prop('ta', 'size'), 500, 'a size of 500 lands');
    await openTo('type', '[data-ty-lhn]');
    await page.keyboard.type('0.5');
    await page.keyboard.press('Enter');
    await settle(page, 250);
    assert.strictEqual(await prop('ta', 'lh'), 0.5, 'and a line height of 0.5');
    await page.click('#selbar [data-pop="type"]');
    assert.ok(+((await page.getAttribute('#selbar [data-ty-lh]', 'min')) ?? 1) <= 0.5, 'the slider reaches 0.5 too');
    await page.keyboard.press('Escape');
    await undo();
    await undo();
  });

  await check('mixed line heights read blank, and an arrow moves each from its own', async () => {
    await select(['tb', 'tc']);
    const trig = page.locator('#selbar [data-pop="type"]');
    assert.strictEqual(
      await trig.getAttribute('aria-label'),
      'Type, mixed sizes',
      'the trigger reads Type, mixed sizes',
    );
    await trig.click();
    await page.waitForTimeout(150);
    const box = page.locator('#selbar [data-popw="type"]'),
      num = box.getByRole('spinbutton', { name: 'Line height as a multiple of the size', exact: true }),
      slider = box.getByRole('slider', { name: 'Line height', exact: true });
    assert.strictEqual(await num.count(), 1, 'the number has a name of its own');
    assert.strictEqual(await num.inputValue(), '', 'and reads blank');
    assert.strictEqual(await slider.getAttribute('aria-valuetext'), 'Mixed', 'the slider reads Mixed');
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await settle(page, 250);
    assert.deepStrictEqual(
      [await prop('tb', 'lh'), await prop('tc', 'lh')],
      [1.05, 2.25],
      'one ArrowRight moves each a step from its own',
    );
    assert.strictEqual(await num.inputValue(), '', 'and the number still reads blank');
    await page.keyboard.press('Escape');
    await undo();
  });

  for (const f of failed) console.log(`FAILED ${f}`);
  assert.deepStrictEqual(failed, [], 'every check passes');
  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('typeFields: ok');
} finally {
  await l.close();
}
