// Change icon opens the Pieces picker on its icons alone and swaps every selected icon as one undo step, then closes;
// the picker's add mode is unchanged. An icon's colour is in the bar as Colour, with no No fill, and a box's opacity
// is a row in Fill. The keyboard reaches the swap and Esc gives focus back to Change icon.
import assert from 'node:assert';
import { wireframeBoard } from './fixtures/boards.ts';
import { launch, settle } from './support/launch.ts';

const board = wireframeBoard();
const l = await launch({ boards: [board], open: 'wire' });
const { page } = l;

const card = (id: string) =>
  page.evaluate(i => {
    const c = window.__fenmyr.curBoard()?.cards.find(k => k.id === i);
    return c?.type === 'icon' ? { name: c.name, color: c.color } : c?.type === 'box' ? { opacity: c.opacity } : null;
  }, id);
const select = async (ids: string[]) => {
  await page.evaluate(i => window.__fenmyr.selectOnly(i), ids);
  await settle(page, 250);
};
const picker = () =>
  page.evaluate(() => {
    const p = document.getElementById('piecePick');
    return p?.hidden === false
      ? {
          name: p.getAttribute('aria-label'),
          tabs: !!p.querySelector('.pk-tabs')?.checkVisibility(),
          search: p.querySelector('input')?.getAttribute('placeholder'),
        }
      : null;
  });
const undo = async () => {
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
  await page.keyboard.press('Control+z');
  await settle(page, 250);
};
const focusedAttr = (a: string) => page.evaluate(n => document.activeElement?.hasAttribute(n) ?? false, a);
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
    Object.assign(window.__fenmyr.view, { x: 300, y: 120, z: 1 });
    window.__fenmyr.applyView();
  });
  await settle(page, 300);

  await check('Change icon swaps every selected icon as one step, and closes', async () => {
    await select(['nav1', 'nav3']);
    const btn = page.locator('#selbar [data-chicon]');
    assert.deepStrictEqual(
      [await btn.getAttribute('aria-label'), await btn.getAttribute('aria-expanded')],
      ['Change icon, arrow left', 'false'],
      'two icons show Change icon, read with the first one’s glyph',
    );
    await btn.click();
    await settle(page, 200);
    assert.strictEqual(await btn.getAttribute('aria-expanded'), 'true', 'it says its picker is open');
    assert.deepStrictEqual(
      await picker(),
      { name: 'Change icon', tabs: false, search: 'Search icons…' },
      'the picker opens on Icons only, named Change icon',
    );
    await page.keyboard.type('heart');
    await page.click('#piecePick [data-pk-icon="heart"]');
    await settle(page, 250);
    assert.deepStrictEqual(
      [(await card('nav1'))?.name, (await card('nav3'))?.name],
      ['heart', 'heart'],
      '“heart” changes both icons',
    );
    assert.strictEqual(await picker(), null, 'and the picker closes');
    await undo();
    assert.deepStrictEqual(
      [(await card('nav1'))?.name, (await card('nav3'))?.name],
      ['arrow-left', 'more-vertical'],
      'one undo puts both back',
    );
  });

  await check('the picker’s add mode is unchanged', async () => {
    await select(['nav1']);
    await page.click('#selbar [data-chicon]');
    await settle(page, 200);
    await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
    await page.keyboard.press('Escape');
    await settle(page, 150);
    assert.deepStrictEqual(
      [await picker(), await page.evaluate(() => [...window.__fenmyr.sel])],
      [null, ['nav1']],
      'Esc on the board closes the swap first, keeping the icon selected',
    );
    await page.click('#selbar [data-chicon]');
    await settle(page, 200);
    await select(['signin']);
    assert.strictEqual(await picker(), null, 'selecting something else closes the swap');
    await page.click('#selbar [data-pieces]');
    await settle(page, 200);
    assert.deepStrictEqual(
      await picker(),
      { name: 'Pieces', tabs: true, search: 'Search pieces…' },
      'Pieces opens the picker with its tabs, on Pieces',
    );
  });

  await check('the keyboard swaps an icon, and Esc gives focus back to Change icon', async () => {
    await select(['nav1']);
    await page.locator('#selbar [data-chicon]').focus();
    await page.keyboard.press('Enter');
    await settle(page, 200);
    await page.keyboard.press('Escape');
    await settle(page, 200);
    assert.strictEqual(await picker(), null, 'Esc closes the swap');
    assert.ok(await focusedAttr('data-chicon'), 'with the keyboard back on Change icon');
    await page.keyboard.press('Enter');
    await settle(page, 200);
    await page.keyboard.type('heart');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await settle(page, 250);
    assert.strictEqual((await card('nav1'))?.name, 'heart', 'Down and Enter swap it for the first match');
    assert.ok(await focusedAttr('data-chicon'), 'and the keyboard is back on Change icon');
    await undo();
  });

  await check('an icon’s colour', async () => {
    await select(['nav1']);
    const trig = page.locator('#selbar [data-pop="tfill"]');
    assert.strictEqual(await trig.getAttribute('aria-label'), 'Colour', 'an icon’s colour is named Colour');
    await trig.click();
    assert.strictEqual(await page.locator('#selbar [data-tf="none"]').count(), 0, 'No fill is not offered');
    await page.click('#selbar [data-tf="#ff5a6e"]');
    await settle(page, 250);
    assert.strictEqual((await card('nav1'))?.color, '#ff5a6e', 'red sets the icon’s colour');
    await undo();
  });

  await check('two boxes at different opacities show a blank number', async () => {
    await page.evaluate(() => {
      const c = window.__fenmyr.curBoard()?.cards.find(k => k.id === 'go0');
      if (c?.type === 'box') c.opacity = 0.4;
    });
    await select(['go0', 'email1']);
    await page.click('#selbar [data-pop="fill"]');
    assert.strictEqual(await page.inputValue('#selbar [data-bopn]'), '', 'Opacity reads blank, not the first box’s');
  });

  await check('a box’s opacity is a row in Fill', async () => {
    await select(['go0']);
    await page.click('#selbar [data-pop="fill"]');
    const num = page.getByRole('spinbutton', { name: 'Opacity in per cent' });
    assert.strictEqual(await page.getByRole('slider', { name: 'Opacity' }).count(), 1, 'Fill holds an Opacity slider');
    await num.fill('40');
    await settle(page, 250);
    assert.strictEqual((await card('go0'))?.opacity, 0.4, 'Opacity 40 sets 0.4');
    await num.press('Enter');
    await undo();
    assert.strictEqual((await card('go0'))?.opacity, undefined, 'one undo takes it back');
    await select(['signin']);
    await page.click('#selbar [data-pop="fill"]');
    assert.strictEqual(await page.locator('#selbar [data-bop]').count(), 0, 'a screen’s Fill has no Opacity');
  });

  for (const f of failed) console.log(`FAILED ${f}`);
  assert.deepStrictEqual(failed, [], 'every check passes');
  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('pieceIcon: ok');
} finally {
  await l.close();
}
