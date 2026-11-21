// Unsorted and then Zoom have the right column, and a long Unsorted ran under the open chat. While the chat sits over
// the board below the column, the column (which ends with Zoom) ends 12 px above the chat's top, so Unsorted shrinks
// and its list scrolls to the last idea; when the chat closes, Unsorted is full height again.
import assert from 'node:assert';
import { launch } from './support/launch.ts';
import { still } from './support/settled.ts';

const note = { id: 'n', type: 'note', x: 0, y: 0, w: 220, h: 120, r: 0, color: 'white', text: 'A note' };
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
const l = await launch({
  boards: [{ id: 'b', name: 'Ideas', cards: [note], links: [], tray, view: { x: 300, y: 200, z: 1 } }],
  open: 'b',
});
const { page } = l;
const rects = () =>
  page.evaluate(() => {
    const r = (el: Element | null | undefined) => {
      const b = el?.getBoundingClientRect();
      return b
        ? { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) }
        : null;
    };
    return {
      tray: r(document.getElementById('tray')),
      zoom: r(document.querySelector('.box[data-box="zoom"]')),
      chat: r(document.getElementById('mChat')),
    };
  });

try {
  // narrow enough that her joined chat reaches under the right column, tall enough for Unsorted above it
  await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1100, 1080));
  await page.waitForFunction(() => innerWidth === 1100 && innerHeight === 1080);
  await still(page);
  const closed = await rects();
  await page.click('#mPill');
  await page.waitForFunction(() => document.getElementById('mChat')?.checkVisibility({ visibilityProperty: true }));
  await still(page);
  // the app focuses the input as the chat opens, but while a transition delay holds the chat hidden that does
  // nothing, and Esc needs the focus
  await page.focus('#mcInput');
  const open = await rects();
  assert.ok(open.tray && open.zoom && open.chat && closed.zoom, 'Unsorted, Zoom and the chat are on screen');
  assert.ok(
    open.chat.l < open.tray.r && open.chat.r > open.tray.l && open.chat.t < closed.zoom.b,
    `the open chat sits under the right column: ${JSON.stringify({ closed, open })}`,
  );
  assert.strictEqual(open.chat.t - open.zoom.b, 12, 'the column, ending in Zoom, ends 12 px above the open chat');
  assert.strictEqual(open.zoom.t - open.tray.b, 10, 'and Unsorted is what shrank, still 10 px above Zoom');
  const last = await page.evaluate(() => {
    const list = document.getElementById('trayList'),
      items = list?.querySelectorAll('.tray-item, [data-id]');
    const lastItem = items?.[items.length - 1];
    if (!list || !lastItem) return null;
    list.scrollTop = list.scrollHeight;
    const a = lastItem.getBoundingClientRect(),
      t = document.getElementById('tray')?.getBoundingClientRect();
    return t ? { bottom: Math.round(a.bottom), trayBottom: Math.round(t.bottom) } : null;
  });
  assert.ok(last && last.bottom <= last.trayBottom, `its last idea scrolls into view: ${JSON.stringify(last)}`);

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('myra')?.classList.contains('chat'));
  await still(page);
  assert.ok(!(await page.evaluate(() => document.getElementById('myra')?.classList.contains('chat'))), 'chat closed');
  assert.deepStrictEqual(await rects().then(r => r.tray), closed.tray, 'closed, Unsorted is full height again');
  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('chatClear: ok');
} finally {
  await l.close();
}
