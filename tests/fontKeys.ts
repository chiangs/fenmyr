// The font picker from the keyboard: Esc anywhere in it closes it with the keyboard back on its button and the
// selection kept, in the bar and in Settings. ↓ and ↑ walk the rows, and ↑ from the search reaches the Use row, while
// Enter in the search picks the first match. Google Fonts is stubbed, so the test never reaches it.
import assert from 'node:assert';
import { wireframeBoard } from './fixtures/boards.ts';
import { launch, settle } from './support/launch.ts';

const l = await launch({ boards: [wireframeBoard()], open: 'wire' });
const { page, app } = l;
await app
  .context()
  .route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));

const select = async (ids: string[]) => {
  await page.evaluate(i => window.__fenmyr.selectOnly(i), ids);
  await settle(page, 250);
};
const fontOf = (id: string) =>
  page.evaluate(i => window.__fenmyr.curBoard()?.cards.find(k => k.id === i)?.font ?? null, id);
const pickerOpen = () => page.evaluate(() => document.getElementById('fontPop')?.hidden === false);
// the picker puts the keyboard in its search a moment after it opens
const openFonts = async (button = '#selbar [data-sbfont="1"]') => {
  await page.locator(button).evaluate(b => (b instanceof HTMLElement ? b.click() : null));
  await page.waitForFunction(() => document.activeElement?.matches('#fontPop .dp-search'));
};
const focused = () =>
  page.evaluate(() => {
    const a = document.activeElement;
    return a instanceof HTMLButtonElement && a.closest('#fontPop')
      ? `row ${a.textContent}`
      : a?.id || a?.getAttribute('aria-label') || a?.tagName;
  });
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
    Object.assign(window.__fenmyr.view, { x: 300, y: 60, z: 0.8 });
    window.__fenmyr.applyView();
  });
  await settle(page, 300);

  await check('Esc on a row reached with Tab closes the picker, keeping the selection', async () => {
    await select(['head0']);
    await openFonts();
    await page.keyboard.press('Tab');
    assert.match(String(await focused()), /^row /, 'Tab reaches a row');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    assert.ok(!(await pickerOpen()), 'Esc closes the picker');
    assert.strictEqual(await focused(), 'Font, Figtree', 'with the keyboard back on the Font button');
    assert.deepStrictEqual(await page.evaluate(() => window.__fenmyr.sel), ['head0'], 'and the text still selected');
  });

  await check('the arrow keys walk the rows, and ↑ from the search reaches the Use row', async () => {
    await select(['head0']);
    await openFonts();
    await page.keyboard.type('Nunito');
    await page.keyboard.press('ArrowDown');
    assert.strictEqual(await focused(), 'row Nunito SansGoogle Fonts', '↓ reaches the listed match');
    await page.keyboard.press('ArrowDown');
    assert.strictEqual(await focused(), 'row Use “Nunito”Google Fonts', 'the next ↓ the Use row after it');
    await page.keyboard.press('ArrowDown');
    assert.strictEqual(await focused(), 'Search fonts', 'and the next goes round to the search');
    await page.keyboard.press('ArrowUp');
    assert.strictEqual(await focused(), 'row Use “Nunito”Google Fonts', '↑ from the search reaches the Use row');
    await page.keyboard.press('Enter');
    await settle(page, 300);
    assert.strictEqual(await fontOf('head0'), 'Nunito', 'where Enter uses Nunito itself');
    await page.keyboard.press('Control+z');
    await settle(page, 250);
    await select(['head0']);
    await openFonts();
    await page.keyboard.type('Nunito');
    await page.keyboard.press('Enter');
    await settle(page, 300);
    assert.strictEqual(await fontOf('head0'), 'Nunito Sans', 'Enter in the search still picks the first match');
    await page.keyboard.press('Control+z');
  });

  await check('Esc on a row in Settings → Default font gives the keyboard back to its button', async () => {
    await page.click('#gearBtn');
    await page.click('#setTabs [data-tab="board"]');
    await openFonts('#defaultFontBtn');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    assert.ok(!(await pickerOpen()), 'Esc closes the picker');
    assert.strictEqual(await focused(), 'defaultFontBtn', 'with the keyboard back on Default font');
    assert.ok(await page.isVisible('#setClose'), 'and Settings still open');
    await page.click('#setClose');
  });

  for (const f of failed) console.log(`FAILED ${f}`);
  assert.deepStrictEqual(failed, [], 'every check passes');
  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('fontKeys: ok');
} finally {
  await l.close();
}
