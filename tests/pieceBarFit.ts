// The new Type ▾, Font, Change icon and Colour fit the bar. At 1280 × 800 the bar for a text with a long font name, a
// whole piece, a font card, an icon and a box folds nothing, and with the Pieces picker open it tucks away no control
// it showed before them. On a phone at 390 px the strip for a text and an icon shows what it did, the new controls
// wait in ···, and Type ▾ and Change icon opened from there sit above the strip, inside the window.
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
  on('fbox', 'box', 40, 100, 160, 100, { fill: '#e4e4e7' }),
  // a name past the Font button's 150 px cap
  on('ftext', 'text', 40, 240, 220, 30, { text: 'Hello', size: 18, font: 'Libre Baskerville Display Long' }),
  on('ficon', 'icon', 40, 460, 28, 28, { name: 'star' }),
);
const piece = board.cards.filter(c => 'group' in c && c.group === 'go').map(c => c.id);
const l = await launch({ boards: [board], open: 'wire' });
const { page, app } = l;

// the controls 8c and this change brought, which fold first
const NEW = [
  'Device and size',
  'Size and place',
  'Align on its screen',
  'Font',
  'Size, weight, line height and alignment',
  'Change icon',
  'Colour',
];
// what the bar tucked away with the picker open before this change, measured on the base
const BEFORE: Record<string, string[] | null> = {
  text: ['Add a label'],
  piece: ['Create section · Ctrl+Alt+G', 'Ungroup · Ctrl+Shift+G', 'Stroke'],
  font: null,
  icon: [],
  box: ['Add a label', 'Corners'],
};
const SELECTIONS: Record<string, string[]> = { text: ['ftext'], piece, font: ['font'], icon: ['ficon'], box: ['fbox'] };

const strip = () =>
  page.evaluate(() => {
    const bar = document.getElementById('selbar'),
      name = (b: Element | null) =>
        b?.getAttribute('data-tt') || b?.getAttribute('title') || b?.getAttribute('aria-label') || '';
    const shown = [
      ...(bar?.querySelectorAll(
        ':scope > button, :scope > .sb-popw > button, :scope > .sb-g > button, :scope > .sb-g > .sb-popw > button',
      ) ?? []),
    ]
      .filter(b => b.checkVisibility())
      .map(name);
    return {
      shown,
      tucked: [...(bar?.querySelector('.sb-morebody')?.children ?? [])].map(g => name(g.querySelector('button'))),
      label: !!bar?.querySelector(':scope > .sb-label')?.checkVisibility(),
    };
  });
const select = async (ids: string[]) => {
  await page.evaluate(i => window.__fenmyr.selectOnly(i), ids);
  await settle(page, 300);
};
// where an open box sits against the strip
const above = (sel: string) =>
  page.evaluate(s => {
    const box = document.querySelector(s)?.getBoundingClientRect(),
      bar = document.getElementById('selbar')?.getBoundingClientRect();
    return !!box && !!bar && box.height > 0 && box.bottom <= bar.top && box.left >= 0 && box.right <= innerWidth;
  }, sel);
const failed: string[] = [];
const check = async (name: string, run: () => Promise<void>) => {
  try {
    await run();
  } catch (e) {
    failed.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
  }
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await settle(page, 200);
};

try {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1280, 800));
  await settle(page, 800);
  for (const [what, ids] of Object.entries(SELECTIONS))
    await check(`at 1280, the ${what}`, async () => {
      await select(ids);
      const now = await strip();
      assert.deepStrictEqual([now.tucked, now.label], [[], true], `the bar for the ${what} folds nothing`);
      const before = BEFORE[what];
      if (!before) return;
      await page.click('#selbar [data-pieces]');
      await settle(page, 400);
      const old = (await strip()).tucked.filter(n => !NEW.includes(n));
      assert.deepStrictEqual(old.sort(), [...before].sort(), `with the picker open it tucks away what it did before`);
    });

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(390, 844));
  await settle(page, 800);
  await check('the phone, a text', async () => {
    await select(['ftext']);
    const s = await strip();
    assert.deepStrictEqual(
      s.shown,
      ['Add pieces to this screen', 'Text colour', 'Stroke', 'More', 'Delete'],
      'the strip shows what it did',
    );
    assert.ok(
      ['Font', 'Size, weight, line height and alignment'].every(n => s.tucked.includes(n)),
      `Font and Type ▾ wait in ···: ${s.tucked}`,
    );
    await page.click('#selbar [data-pop="more"]');
    await page.click('#selbar [data-pop="type"]');
    await page.waitForTimeout(250);
    assert.ok(await above('#selbar [data-popw="type"] > .sb-pop'), 'Type ▾ opens above the strip, inside the window');
    await page.getByRole('button', { name: 'Bold' }).click();
    await settle(page, 200);
    const w = await page.evaluate(() => {
      const c = window.__fenmyr.curBoard()?.cards.find(k => k.id === 'ftext');
      return c?.type === 'text' ? c.weight : null;
    });
    assert.strictEqual(w, 700, 'and takes a press: Bold lands');
  });
  await check('the phone, an icon', async () => {
    await select(['ficon']);
    const s = await strip();
    assert.deepStrictEqual(
      s.shown,
      ['Add pieces to this screen', 'Add a label', 'Stroke', 'More', 'Delete'],
      'the strip shows what it did',
    );
    assert.ok(
      ['Change icon', 'Colour'].every(n => s.tucked.includes(n)),
      `Change icon and Colour in ···: ${s.tucked}`,
    );
    await page.click('#selbar [data-pop="more"]');
    await page.click('#selbar [data-chicon]');
    await page.waitForTimeout(300);
    const p = await page.evaluate(() => {
      const r = document.getElementById('piecePick')?.getBoundingClientRect(),
        dock = document.getElementById('dock')?.getBoundingClientRect();
      return !!r && !!dock && r.height > 0 && r.bottom <= dock.top && r.left >= 0 && r.right <= innerWidth;
    });
    assert.ok(p, 'Change icon opens the picker above the dock, inside the window');
  });

  await check('the phone, a screen’s Font row from the keyboard', async () => {
    await select(['signin']);
    await page.click('#selbar [data-pop="more"]');
    await page.click('#selbar [data-pop="place"]');
    await page.locator('#selbar [data-sbfont="screen"]').focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    assert.strictEqual(
      await page.evaluate(() => document.activeElement?.getAttribute('data-pop')),
      'more',
      'Esc gives the keyboard back to ···, where the device dropdown folded',
    );
  });

  for (const f of failed) console.log(`FAILED ${f}`);
  assert.deepStrictEqual(failed, [], 'every check passes');
  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('pieceBarFit: ok');
} finally {
  await l.close();
}
