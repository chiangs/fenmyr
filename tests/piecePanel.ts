// Until the Wireframe panel goes, its font, icon, colour and opacity controls keep working beside the bar's: a change
// made in one shows in the other.
import assert from 'node:assert';
import { wireframeBoard } from './fixtures/boards.ts';
import { launch, settle } from './support/launch.ts';

const l = await launch({ boards: [wireframeBoard()], open: 'wire' });
const { page } = l;

const select = async (ids: string[]) => {
  await page.evaluate(i => window.__fenmyr.selectOnly(i), ids);
  await settle(page, 250);
};
// a value set in the panel the way a person's edit sends it
const panelSet = async (sel: string, value: string) => {
  await page.evaluate(
    ({ s, v }) => {
      const el = document.querySelector(`#dzProps ${s}`);
      if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement)) throw new Error(`no ${s} in the panel`);
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    { s: sel, v: value },
  );
  await settle(page, 250);
};
const panelValue = (sel: string) =>
  page.evaluate(s => {
    const el = document.querySelector(`#dzProps ${s}`);
    return el instanceof HTMLInputElement || el instanceof HTMLSelectElement ? el.value : null;
  }, sel);
const attr = (sel: string, name: string) => page.locator(sel).first().getAttribute(name);
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
  await check('a text’s font', async () => {
    await select(['head0']);
    await page.evaluate(() => document.querySelector<HTMLElement>('#selbar [data-sbfont="1"]')?.click());
    await page.click('#fontPop [data-bfont="Shantell Sans"]');
    await settle(page, 250);
    assert.strictEqual(
      await panelValue('select[data-k="font"]'),
      'Shantell Sans',
      'a font picked in the bar shows in the panel',
    );
    await panelSet('select[data-k="font"]', 'Figtree');
    assert.strictEqual(
      await attr('#selbar [data-sbfont="1"]', 'aria-label'),
      'Font, Figtree',
      'and the panel’s in the bar',
    );
  });

  await check('a font card’s font', async () => {
    await select(['font']);
    // a font the panel lists other than the card's own
    const other = await page.evaluate(
      () => [...document.querySelectorAll('#dzProps select[data-k="font"] option')].map(o => o.textContent)[1] ?? '',
    );
    await panelSet('select[data-k="font"]', other);
    assert.strictEqual(await attr('#selbar [data-sbfont="1"]', 'aria-label'), `Font, ${other}`, 'it shows in the bar');
  });

  await check('an icon’s glyph and colour', async () => {
    await select(['nav1']);
    const glyph = () => page.evaluate(() => document.querySelector('#dzProps [data-swap] svg')?.outerHTML ?? '');
    const was = await glyph();
    await page.click('#selbar [data-chicon]');
    await page.click('#piecePick [data-pk-icon="heart"]');
    await settle(page, 250);
    await select(['nav1']);
    const now = await glyph();
    assert.ok(now && now !== was, 'the panel’s Change icon shows the new glyph a swap from the bar gave it');
    await page.click('#dzProps [data-swap]');
    await page.fill('#iconSearch', 'star');
    await page.click('#iconGrid [data-icon="star"]');
    await settle(page, 250);
    assert.strictEqual(
      await page.evaluate(() => {
        const c = window.__fenmyr.curBoard()?.cards.find(k => k.id === 'nav1');
        return c?.type === 'icon' ? c.name : null;
      }),
      'star',
      'the panel’s Change icon still swaps it',
    );
    await select(['nav1']);
    await panelSet('input[data-k="color"]', '#4f9dff');
    assert.strictEqual(
      await page.evaluate(() =>
        document.querySelector<HTMLElement>('#selbar [data-pop="tfill"] .sb-tcur')?.style.getPropertyValue('--c'),
      ),
      '#4f9dff',
      'a colour set in the panel shows in the bar’s Colour',
    );
    await page.click('#selbar [data-pop="tfill"]');
    await page.click('#selbar [data-tf="#ff5a6e"]');
    await page.keyboard.press('Escape');
    await settle(page, 250);
    assert.strictEqual(await panelValue('input[data-k="color"]'), '#ff5a6e', 'and the bar’s shows in the panel');
  });

  await check('a box’s opacity', async () => {
    await select(['go0']);
    await panelSet('input[data-k="opacity"]', '30');
    await page.click('#selbar [data-pop="fill"]');
    assert.strictEqual(await page.inputValue('#selbar [data-bopn]'), '30', 'the panel’s opacity shows in Fill');
    await page.fill('#selbar [data-bopn]', '70');
    await page.keyboard.press('Enter');
    await settle(page, 250);
    assert.strictEqual(await panelValue('input[data-k="opacity"]'), '70', 'and Fill’s shows in the panel');
  });

  await check('the panel’s Group button turns to Ungroup once pressed', async () => {
    await select(['email1', 'pass1']);
    await page.click('#dzProps [data-grp="on"]');
    await settle(page, 250);
    assert.strictEqual(
      await page.locator('#dzProps [data-grp]').getAttribute('data-grp'),
      'off',
      'the panel redraws while its button has focus, and offers Ungroup',
    );
  });

  await check('typing in the panel keeps its field', async () => {
    await select(['go0']);
    const field = page.locator('#dzProps input[data-k="opacity"]');
    await field.click();
    await field.press('Control+a');
    await page.keyboard.type('35', { delay: 120 });
    await page.waitForTimeout(200);
    assert.strictEqual(
      await page.evaluate(() => {
        const c = window.__fenmyr.curBoard()?.cards.find(k => k.id === 'go0');
        return c?.type === 'box' ? c.opacity : null;
      }),
      0.35,
      'typing 35 in the panel’s Opacity % lands, every key kept',
    );
    assert.ok(await field.evaluate(i => i === document.activeElement), 'and the field keeps the keyboard');
  });

  for (const f of failed) console.log(`FAILED ${f}`);
  assert.deepStrictEqual(failed, [], 'every check passes');
  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('piecePanel: ok');
} finally {
  await l.close();
}
