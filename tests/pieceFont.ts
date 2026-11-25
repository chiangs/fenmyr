// Fonts from the bar: one Font button for a wireframe text, a whole piece, a font card, or a title and a text together;
// a Font row in a screen's device dropdown for every text on it; and a "Use …" row for any Google font the list lacks.
// A hover previews a font and leaving puts the card back exactly, with no undo step. The keyboard reaches all of it.
import assert from 'node:assert';
import { wireframeBoard } from './fixtures/boards.ts';
import { launch, settle } from './support/launch.ts';

const board = wireframeBoard();
board.cards.push({ id: 'ttl', type: 'title', x: 0, y: 1300, w: 320, h: 50, r: 0, color: 'white', text: 'A title' });
// the picker that selecting a screen opens would fold its device dropdown into ···, and this reaches the Font row in it
const l = await launch({ boards: [board], open: 'wire', settings: { autoPieces: false } });
const { page } = l;
// Google Fonts answers every name here; tests/fontUse.ts covers the names it turns away
await l.app
  .context()
  .route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));

const fontOf = (id: string) =>
  page.evaluate(i => window.__fenmyr.curBoard()?.cards.find(k => k.id === i)?.font ?? null, id);
const fonts = (ids: string[]) => Promise.all(ids.map(fontOf));
const select = async (ids: string[]) => {
  await page.evaluate(i => window.__fenmyr.selectOnly(i), ids);
  await settle(page, 250);
};
const pickerOpen = () => page.evaluate(() => document.getElementById('fontPop')?.hidden === false);
const pick = async (name: string) => {
  await page.click(`#fontPop [data-bfont="${name}"]`);
  await settle(page, 250);
};
const fontButtons = () => page.locator('#selbar [data-sbfont="1"]');
// the picker puts the keyboard in its search a moment after it opens
const openFonts = async () => {
  await fontButtons().evaluate(b => (b instanceof HTMLElement ? b.click() : null));
  await page.waitForTimeout(120);
};
const undo = async () => {
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
  await page.keyboard.press('Control+z');
  await settle(page, 250);
};
// the Sign in screen's texts, one from each of its pieces
const SIGNIN_TEXTS = ['nav2', 'head0', 'email0', 'email2', 'pass0', 'pass2', 'go1'];
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

  await check('a wireframe text takes a font from the bar', async () => {
    await select(['head0']);
    assert.strictEqual(
      await fontButtons().getAttribute('aria-label'),
      'Font, Figtree',
      'its Font button reads Figtree',
    );
    await openFonts();
    await pick('Shantell Sans');
    assert.strictEqual(await fontOf('head0'), 'Shantell Sans', 'Shantell Sans lands on the text');
    await undo();
  });

  await check('a whole piece takes a font on its texts', async () => {
    await select(['go0', 'go1']);
    assert.strictEqual(await fontButtons().count(), 1, 'a whole piece shows one Font button');
    await openFonts();
    await pick('Shantell Sans');
    assert.deepStrictEqual(await fonts(['go1', 'go0']), ['Shantell Sans', null], 'its text takes it, its box not');
    await undo();
  });

  await check('a title and a wireframe text share one Font button', async () => {
    await select(['ttl', 'head0']);
    assert.strictEqual(await fontButtons().count(), 1, 'one Font button');
    assert.strictEqual(await fontButtons().getAttribute('aria-label'), 'Font, Mixed fonts', 'reading Mixed fonts');
    await openFonts();
    await pick('Shantell Sans');
    assert.deepStrictEqual(await fonts(['ttl', 'head0']), ['Shantell Sans', 'Shantell Sans'], 'a pick changes both');
    await undo();
  });

  await check('a screen’s Font row changes every text on it, as one undo step', async () => {
    await select(['head0']);
    await openFonts();
    await pick('Shantell Sans');
    const own = await fonts(SIGNIN_TEXTS);
    await select(['signin']);
    await page.click('#selbar [data-pop="place"]');
    const row = page.locator('#selbar [data-sbfont="screen"]');
    assert.strictEqual(
      await row.getAttribute('aria-label'),
      'Font of every text on this screen, Mixed fonts',
      'the device dropdown’s Font row reads Mixed fonts',
    );
    await row.click();
    assert.ok(await pickerOpen(), 'the row opens the font picker');
    assert.ok(
      await page.evaluate(() => !document.querySelector('#selbar .sb-popw.open')),
      'and the device dropdown closes under it',
    );
    await pick('Lato');
    assert.deepStrictEqual(await fonts(SIGNIN_TEXTS), Array(SIGNIN_TEXTS.length).fill('Lato'), 'every text takes Lato');
    assert.deepStrictEqual(
      await page.evaluate(() => [...window.__fenmyr.sel]),
      ['signin'],
      'and the screen stays selected',
    );
    await undo();
    assert.deepStrictEqual(await fonts(SIGNIN_TEXTS), own, 'one undo puts back every text’s own font');
    await undo();
  });

  await check('a font card takes a listed font and any Google font', async () => {
    await select(['font']);
    assert.strictEqual(await fontButtons().getAttribute('aria-label'), 'Font, Shantell Sans', 'its button reads it');
    await openFonts();
    await pick('Lato');
    assert.strictEqual(await fontOf('font'), 'Lato', 'Lato lands on the font card');
    await openFonts();
    await page.keyboard.type('Zilla Slab');
    const use = page.locator('#fontPop .dp-use');
    assert.ok(await use.isVisible(), 'a name no listed font has offers the Use row');
    assert.strictEqual(
      await use.evaluate(b => b.querySelector('span')?.textContent),
      'Use “Zilla Slab”',
      'it reads Use “Zilla Slab”',
    );
    await page.keyboard.press('Enter');
    await settle(page, 250);
    assert.strictEqual(await fontOf('font'), 'Zilla Slab', 'Enter applies it');
    await openFonts();
    await page.keyboard.type('lato');
    assert.ok(!(await use.isVisible()), 'a listed name offers no Use row, in any case');
  });

  await check('a hover previews a font, and leaving puts the card back exactly, with no undo step', async () => {
    await select(['font']);
    const look = () =>
      page.evaluate(() => {
        const el = document.querySelector('#cards [data-id="font"]');
        return { cls: el?.className, cf: el instanceof HTMLElement ? el.style.getPropertyValue('--cf') : '' };
      });
    const before = await look();
    await openFonts();
    await page.hover('#fontPop [data-bfont="Shantell Sans"]');
    assert.ok((await look()).cls?.includes('has-font'), 'hovering Shantell Sans previews it on the card');
    await page.mouse.move(5, 450);
    await page.waitForTimeout(100);
    const after = await look();
    // drawing never gives a font card has-font, so its having one is the preview left behind
    assert.ok(!after.cls?.includes('has-font'), `leaving the picker leaves the card without has-font: ${after.cls}`);
    assert.deepStrictEqual(after, before, 'and exactly as it was');
    await page.keyboard.press('Escape');
    await undo();
    assert.strictEqual(await fontOf('font'), 'Lato', 'the next undo takes back the last pick, not a hover');
    await undo();
  });

  await check('the keyboard reaches the Font button, the Font row and the Use row', async () => {
    await select(['head0']);
    await fontButtons().focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    assert.strictEqual(
      await page.evaluate(() => document.activeElement?.getAttribute('aria-label')),
      'Search fonts',
      'Enter on Font opens the picker with the keyboard in a search named Search fonts',
    );
    await page.keyboard.type('Zilla Slab');
    await page.keyboard.press('Enter');
    await settle(page, 250);
    assert.strictEqual(await fontOf('head0'), 'Zilla Slab', 'typing a name and Enter applies it through the Use row');
    assert.strictEqual(
      await page.evaluate(() => document.activeElement?.hasAttribute('data-sbfont')),
      true,
      'and the keyboard is back on the Font button',
    );
    await undo();
    await select(['signin']);
    await page.locator('#selbar [data-pop="place"]').focus();
    await page.keyboard.press('Enter');
    await page.locator('#selbar [data-sbfont="screen"]').focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('shantell');
    await page.keyboard.press('Enter');
    await settle(page, 250);
    assert.strictEqual(await fontOf('go1'), 'Shantell Sans', 'the Font row works from the keyboard');
    assert.strictEqual(
      await page.evaluate(() => document.activeElement?.getAttribute('data-pop')),
      'place',
      'and the keyboard goes back to the device button',
    );
    await undo();
  });

  await check('the font card’s sample line says it can be typed in', async () => {
    assert.strictEqual(
      await page.locator('#cards [data-id="font"] .fs-sample').getAttribute('title'),
      'Double-click to try your own words',
      'its title carries the panel’s hint',
    );
  });

  for (const f of failed) console.log(`FAILED ${f}`);
  assert.deepStrictEqual(failed, [], 'every check passes');
  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('pieceFont: ok');
} finally {
  await l.close();
}
