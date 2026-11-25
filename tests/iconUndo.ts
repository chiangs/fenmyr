// The Icon tool lands a star and opens the picker for its glyph. Placing it and picking the glyph are one undo step:
// one Ctrl+Z takes the icon away, not just its glyph.
import assert from 'node:assert';
import { launch, settle } from './support/launch.ts';

const note = { id: 'n', type: 'note', x: 0, y: 0, w: 220, h: 120, r: 0, color: 'white', text: 'A note' };
const l = await launch({
  boards: [{ id: 'b', name: 'Bare', cards: [note], links: [], tray: [], view: { x: 300, y: 200, z: 1 } }],
  open: 'b',
});
const { page } = l;
const icons = () =>
  page.evaluate(() =>
    (window.__fenmyr.curBoard()?.cards ?? []).flatMap(c => (c.type === 'icon' ? [c.name ?? ''] : [])),
  );

try {
  await page.click('#tools [data-add="icon"]');
  await page.mouse.click(900, 650);
  await settle(page, 500);
  assert.deepStrictEqual(await icons(), ['star'], 'the Icon tool lands a star');
  assert.ok(await page.evaluate(() => !document.getElementById('piecePick')?.hidden), 'and the picker opens');
  await page.keyboard.type('heart');
  await page.keyboard.press('Enter');
  await settle(page, 500);
  assert.deepStrictEqual(await icons(), ['heart'], 'the glyph picked replaces the star');
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
  await page.keyboard.press('Control+z');
  await settle(page, 500);
  assert.deepStrictEqual(await icons(), [], 'one undo takes the icon away');
  assert.deepStrictEqual(
    await page.evaluate(() => window.__fenmyr.curBoard()?.cards.map(c => c.id)),
    ['n'],
    'and leaves the board as it was',
  );
  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('iconUndo: ok');
} finally {
  await l.close();
}
