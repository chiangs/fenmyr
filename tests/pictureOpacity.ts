// A box holding a picture has no Fill, so it gets an Opacity dropdown of its own in the bar, which the Wireframe
// panel's Opacity % used to give it. Boxes at different opacities show Fill's slider as Mixed, and an arrow or Page key
// nudges each box from its own opacity rather than setting every one to the slider's.
import assert from 'node:assert';
import { launch, settle } from './support/launch.ts';

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const box = (id: string, x: number, more = {}) => ({ id, type: 'box', x, y: 0, w: 160, h: 100, r: 0, ...more });
const cards = [
  box('pic', 0, { src: PNG, img: 'Hero' }),
  box('pic2', 200, { src: PNG, img: 'Team', opacity: 0.5 }),
  box('b1', 0, { y: 200, fill: '#e4e4e7', opacity: 0.4 }),
  box('b2', 200, { y: 200, fill: '#e4e4e7', opacity: 0.8 }),
];
const l = await launch({
  boards: [{ id: 'b', name: 'Pictures', cards, links: [], tray: [], view: { x: 300, y: 200, z: 1 } }],
  open: 'b',
});
const { page } = l;

const opacityOf = (id: string) =>
  page.evaluate(i => {
    const c = window.__fenmyr.curBoard()?.cards.find(x => x.id === i);
    return c?.type === 'box' ? (c.opacity ?? 1) : null;
  }, id);
const select = async (ids: string[]) => {
  await page.evaluate(i => window.__fenmyr.selectOnly(i), ids);
  await settle(page, 250);
};
const trigger = () =>
  page.evaluate(() => {
    const t = document.querySelector('#selbar [data-pop="opacity"]');
    return t ? { shows: t.textContent, name: t.getAttribute('aria-label') } : null;
  });
const slider = () =>
  page.evaluate(() => {
    const r = document.querySelector('#selbar .sb-popw.open [data-bop]');
    return r ? { mixed: r.classList.contains('sb-mixed'), read: r.getAttribute('aria-valuetext') } : null;
  });
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
  await check("a picture's bar has its Opacity, and a typed 40 fades it as one undo step", async () => {
    await select(['pic']);
    assert.deepStrictEqual(
      await trigger(),
      { shows: '100%', name: 'Opacity, 100%' },
      'Opacity shows in the bar, reading 100%',
    );
    assert.ok(!(await page.locator('#selbar [data-pop="fill"]').count()), 'a picture still has no Fill');
    await page.click('#selbar [data-pop="opacity"]');
    await page.waitForTimeout(150);
    await page.click('#selbar [data-bopn]');
    await page.keyboard.press('Control+a');
    await page.keyboard.type('40');
    await page.keyboard.press('Enter');
    await settle(page, 200);
    assert.strictEqual(await opacityOf('pic'), 0.4, 'the picture is at 40%');
    assert.deepStrictEqual(await trigger(), { shows: '40%', name: 'Opacity, 40%' }, 'and the trigger says so');
    assert.ok(
      await page.evaluate(() => document.activeElement?.matches('#selbar [data-pop="opacity"]')),
      'Enter gives the keyboard back to Opacity',
    );
    await undo();
    assert.strictEqual(await opacityOf('pic'), 1, 'one undo takes it back');
  });

  await check('two pictures at different opacities read mixed, and the slider moves both', async () => {
    await select(['pic', 'pic2']);
    assert.deepStrictEqual(await trigger(), { shows: 'Opacity', name: 'Opacity, mixed' }, 'the trigger reads mixed');
    await page.click('#selbar [data-pop="opacity"]');
    await page.waitForTimeout(150);
    assert.deepStrictEqual(await slider(), { mixed: true, read: 'Mixed' }, 'the slider reads Mixed');
    await page.focus('#selbar [data-bop]');
    await page.keyboard.press('ArrowLeft');
    await settle(page, 150);
    assert.deepStrictEqual([await opacityOf('pic'), await opacityOf('pic2')], [0.99, 0.49], 'each fades a step');
    await page.keyboard.press('Escape');
    await undo();
  });

  await check(
    "boxes at different opacities show Fill's slider as Mixed, and an arrow nudges each from its own",
    async () => {
      await select(['b1', 'b2']);
      await page.click('#selbar [data-pop="fill"]');
      await page.waitForTimeout(150);
      assert.deepStrictEqual(await slider(), { mixed: true, read: 'Mixed' }, 'the slider reads Mixed, with no thumb');
      assert.strictEqual(await page.inputValue('#selbar [data-bopn]'), '', 'and the number reads blank');
      await page.focus('#selbar [data-bop]');
      await page.keyboard.press('ArrowLeft');
      await settle(page, 150);
      assert.deepStrictEqual(
        [await opacityOf('b1'), await opacityOf('b2')],
        [0.39, 0.79],
        'one ArrowLeft takes each a step down from its own, not both to 99',
      );
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await settle(page, 150);
      assert.deepStrictEqual([await opacityOf('b1'), await opacityOf('b2')], [0.41, 0.81], 'and ArrowRight back up');
      await page.keyboard.press('PageDown');
      await settle(page, 150);
      assert.deepStrictEqual(
        [await opacityOf('b1'), await opacityOf('b2')],
        [0.31, 0.71],
        'PageDown takes each ten down',
      );
      assert.deepStrictEqual(await slider(), { mixed: true, read: 'Mixed' }, 'still Mixed while they differ');
      await page.keyboard.press('Escape');
      await undo();
      assert.deepStrictEqual(
        [await opacityOf('b1'), await opacityOf('b2')],
        [0.4, 0.8],
        'one undo takes the visit back',
      );
    },
  );

  await check('dragging the Mixed slider sets both, and it reads their opacity from then on', async () => {
    await select(['b1', 'b2']);
    await page.click('#selbar [data-pop="fill"]');
    await page.waitForTimeout(150);
    await page.$eval('#selbar [data-bop]', el => {
      if (!(el instanceof HTMLInputElement)) return;
      el.value = '60';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await settle(page, 150);
    assert.deepStrictEqual([await opacityOf('b1'), await opacityOf('b2')], [0.6, 0.6], 'both land at 60%');
    assert.deepStrictEqual(await slider(), { mixed: false, read: null }, 'the slider no longer reads Mixed');
    assert.strictEqual(await page.inputValue('#selbar [data-bopn]'), '60', 'and the number reads 60');
    await page.keyboard.press('Escape');
    await undo();
  });

  for (const f of failed) console.log(`FAILED ${f}`);
  assert.deepStrictEqual(failed, [], 'every check passes');
  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('pictureOpacity: ok');
} finally {
  await l.close();
}
