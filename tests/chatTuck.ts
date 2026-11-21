// On a short window the open chat lifts the right column clear of it. The tools tuck into ··· by rows, so no tool in
// the panel comes or goes as the chat opens and closes; large icons make some tuck. Below about 750 px Unsorted can't
// shrink enough and the chat still meets it; there the chat is on top.
import assert from 'node:assert';
import { launch } from './support/launch.ts';
import { still } from './support/settled.ts';

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
// narrow enough that her joined chat reaches under the right column
const SIZES: [number, number][] = [
  [1100, 700],
  [1000, 640],
];
const board = { id: 'b', name: 'Ideas', cards: [note], links: [], tray, view: { x: 300, y: 200, z: 1 } };
const met: string[] = [];

for (const settings of [{ tbSize: 'l' }, { tbSize: 'l', panelH: { tray: 560 } }]) {
  const l = await launch({ boards: [board], open: 'b', settings });
  const { page, app } = l;
  const chatIs = (open: boolean) =>
    page.waitForFunction(open => {
      const chat = document.getElementById('mChat');
      return (
        document.getElementById('myra')?.classList.contains('chat') === open &&
        !!chat?.checkVisibility({ visibilityProperty: true }) === open
      );
    }, open);
  const tucked = () =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('#tools > [data-add].tb-over')].map(b => b.dataset.add).join(' '),
    );
  try {
    for (const [width, height] of SIZES) {
      const at = `${width} × ${height}${'panelH' in settings ? ', Unsorted dragged' : ''}`;
      await app.evaluate(({ BrowserWindow }, s) => BrowserWindow.getAllWindows()[0]?.setSize(s.width, s.height), {
        width,
        height,
      });
      await page.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [width, height]);
      await still(page);
      const closed = await tucked();
      assert.ok(closed, `${at}: some tools tuck`);
      await page.click('#mPill');
      await chatIs(true);
      await still(page);
      // the app focuses the input as the chat opens, but while a transition delay holds the chat hidden that does
      // nothing, and Esc needs the focus
      await page.focus('#mcInput');
      assert.ok(
        await page.evaluate(() => !!document.getElementById('sideR')?.style.bottom),
        `${at}: the open chat lifts the column`,
      );
      assert.strictEqual(await tucked(), closed, `${at}: the same tools tuck with the chat open`);
      const top = await page.evaluate(() => {
        const c = document.getElementById('mChat')?.getBoundingClientRect(),
          u = document.getElementById('tray')?.getBoundingClientRect();
        if (!c || !u || !(c.left < u.right && c.right > u.left && c.top < u.bottom && c.bottom > u.top)) return null;
        const el = document.elementFromPoint(
          (Math.max(c.left, u.left) + Math.min(c.right, u.right)) / 2,
          (Math.max(c.top, u.top) + Math.min(c.bottom, u.bottom)) / 2,
        );
        return el?.closest('#mChat') ? 'chat' : el?.closest('#tray') ? 'Unsorted' : 'something else';
      });
      if (top) {
        met.push(at);
        assert.strictEqual(top, 'chat', `${at}: where the chat meets Unsorted, the chat is on top`);
      }
      await page.keyboard.press('Escape');
      await chatIs(false);
      await still(page);
      assert.strictEqual(await tucked(), closed, `${at}: and again once it closes`);
    }
    assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  } finally {
    await l.close();
  }
}
assert.ok(met.length, 'on some short window the chat still meets Unsorted, so the check above ran');
console.log('chatTuck: ok');
