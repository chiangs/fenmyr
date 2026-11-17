// On a short window the open chat lifts the right column clear of it. What tucks into ··· keeps to the column as the
// closed chat leaves it, so no tool in the bottom bar comes or goes as the chat opens and closes.
import assert from 'node:assert';
import { launch, settle } from './support/launch.ts';

const tray = Array.from({ length: 12 }, (_, i) => ({
  id: `t${i}`,
  type: 'note',
  x: 0,
  y: 0,
  w: 220,
  h: 140,
  r: 0,
  color: 'white',
  text: `idea ${i}`,
}));
const note = { id: 'n', type: 'note', x: 0, y: 0, w: 220, h: 120, r: 0, color: 'white', text: 'A note' };
const SIZES: [number, number][] = [
  [1440, 700],
  [1000, 640],
];
const board = { id: 'b', name: 'Ideas', cards: [note], links: [], tray, view: { x: 300, y: 200, z: 1 } };

for (const settings of [{}, { panelH: { tray: 560 } }]) {
  const l = await launch({ boards: [board], open: 'b', settings });
  const { page, app } = l;
  const tucked = () =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('#tools > [data-add].tb-over')].map(b => b.dataset.add).join(' '),
    );
  try {
    for (const [width, height] of SIZES) {
      const at = `${width} × ${height}${settings.panelH ? ', Unsorted dragged' : ''}`;
      await app.evaluate(({ BrowserWindow }, s) => BrowserWindow.getAllWindows()[0]?.setSize(s.width, s.height), {
        width,
        height,
      });
      await settle(page, 700);
      const closed = await tucked();
      assert.ok(closed, `${at}: some tools tuck`);
      await page.click('#mPill');
      await settle(page, 700);
      assert.ok(
        await page.evaluate(() => !!document.getElementById('sideR')?.style.bottom),
        `${at}: the open chat lifts the column`,
      );
      assert.strictEqual(await tucked(), closed, `${at}: the same tools tuck with the chat open`);
      await page.keyboard.press('Escape');
      await settle(page, 600);
      assert.strictEqual(await tucked(), closed, `${at}: and again once it closes`);
    }
    assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  } finally {
    await l.close();
  }
}
console.log('chatTuck: ok');
