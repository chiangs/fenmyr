// With the Wireframe panel gone, Unsorted has the right column, and a long Unsorted ran under the open chat. While
// the chat sits over the board below the column, the column ends 12 px above the chat's top, so Unsorted shrinks and
// its list scrolls to the last idea; when the chat closes, Unsorted is full height again.
import assert from 'node:assert';
import { launch, settle } from './support/launch.ts';

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
    return { tray: r(document.getElementById('tray')), chat: r(document.getElementById('mChat')) };
  });

try {
  const closed = await rects();
  await page.click('#mPill');
  await settle(page, 800);
  const open = await rects();
  assert.ok(open.tray && open.chat && closed.tray, 'Unsorted and the chat are on screen');
  assert.ok(
    open.chat.l < open.tray.r && open.chat.r > open.tray.l && open.chat.t < closed.tray.b,
    `the open chat sits under the right column: ${JSON.stringify({ closed, open })}`,
  );
  assert.strictEqual(open.chat.t - open.tray.b, 12, 'Unsorted ends 12 px above the open chat');
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
  await settle(page, 600);
  assert.ok(!(await page.evaluate(() => document.getElementById('myra')?.classList.contains('chat'))), 'chat closed');
  assert.deepStrictEqual(await rects().then(r => r.tray), closed.tray, 'closed, Unsorted is full height again');
  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('chatClear: ok');
} finally {
  await l.close();
}
