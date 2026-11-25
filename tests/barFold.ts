// At 1280 × 800 the bar for a screen, a box, a text, an image spot, an icon and a whole piece, each on a screen, folds
// nothing into ···. With the Pieces picker open the bar has less room: it tucks away the same controls as before the
// size and align dropdowns came, and those two as well when they don't fit.
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
  on('ftext', 'text', 40, 240, 220, 30, { text: 'Hello', size: 18 }),
  on('fspot', 'box', 40, 300, 200, 120, { img: 'Image', fill: '#e4e4e7' }),
  on('ficon', 'icon', 40, 460, 28, 28, { name: 'star' }),
);
const piece = board.cards.filter(c => 'group' in c && c.group === 'go').map(c => c.id);
// selecting a screen would open the picker by itself, and the bar is measured first without it
const l = await launch({ boards: [board], open: 'wire', settings: { autoPieces: false } });
const { page, app } = l;

// and those 8d brought, which fold first too
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
const BEFORE: Record<string, string[]> = {
  screen: ['Make a clickable prototype from these screens', 'Corners', 'Fill', 'Stroke'],
  box: ['Corners'],
  text: [],
  spot: ['Corners', 'Fill', 'Stroke'],
  icon: [],
};
const SELECTIONS: Record<string, string[]> = {
  screen: ['signin'],
  box: ['fbox'],
  text: ['ftext'],
  spot: ['fspot'],
  icon: ['ficon'],
  piece,
};

const folded = () =>
  page.evaluate(() => {
    const bar = document.getElementById('selbar'),
      name = (g: Element) => {
        const b = g.querySelector('button');
        return b?.getAttribute('data-tt') || b?.getAttribute('title') || b?.textContent?.trim() || '';
      };
    return {
      tucked: [...(bar?.querySelector('.sb-morebody')?.children ?? [])].map(name),
      label: !!bar?.querySelector(':scope > .sb-label')?.checkVisibility(),
    };
  });

try {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1280, 800));
  await settle(page, 800);
  for (const [what, ids] of Object.entries(SELECTIONS)) {
    await page.evaluate(i => window.__fenmyr.selectOnly(i), ids);
    await settle(page, 300);
    assert.deepStrictEqual(
      await folded(),
      { tucked: [], label: true },
      `at 1280 the bar for the ${what} folds nothing`,
    );
    const before = BEFORE[what];
    if (!before) continue;
    await page.click('#selbar [data-pieces]');
    await settle(page, 400);
    const { tucked } = await folded(),
      old = tucked.filter(n => !NEW.includes(n));
    assert.deepStrictEqual(
      [...old].sort(),
      [...before].sort(),
      `with the picker open the ${what}’s bar tucks away what it did before: ${tucked}`,
    );
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await settle(page, 200);
  }
  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('barFold: ok');
} finally {
  await l.close();
}
