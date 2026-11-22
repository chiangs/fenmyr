// A height dragged for Unsorted is a wish the column trims to fit. Opening the chat or shrinking the window trims it;
// closing the chat or making the window bigger again brings back the height that was dragged.
import assert from 'node:assert';
import { launch } from './support/launch.ts';
import { rect, still } from './support/settled.ts';

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
const l = await launch({
  boards: [{ id: 'b', name: 'Ideas', cards: [note], links: [], tray, view: { x: 300, y: 200, z: 1 } }],
  open: 'b',
  settings: { panelH: { tray: 560 } },
});
const { page, app } = l;
// The lag knob also delays style changes that have no transition. The column fits Unsorted by measuring what
// overflows, and a delayed size of its list shows it a stale one each time, so the fit never settles; and the chat is
// shown at once, since the app focuses its input as it opens.
const CHANGES_AT_ONCE = '#myra.chat #mChat, #myra.chat #mChat *, #trayList';
if (process.env.FENMYR_MOTION_DELAY)
  await page.addStyleTag({ content: `${CHANGES_AT_ONCE} { transition-delay: 0s !important; }` });
const height = async () => Math.round((await rect(page, '#tray')).height);
const size = async (width: number, h: number) => {
  await app.evaluate(({ BrowserWindow }, s) => BrowserWindow.getAllWindows()[0]?.setSize(s.width, s.h), { width, h });
  await page.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [width, h]);
  await still(page);
};

try {
  // narrow enough that her joined chat reaches under the right column
  await size(1100, 900);
  const dragged = await height();
  await page.click('#mPill');
  await page.waitForFunction(() => document.getElementById('mChat')?.checkVisibility({ visibilityProperty: true }));
  await still(page);
  const open = await height();
  assert.ok(open < dragged, `the open chat trims Unsorted: ${open} px, from ${dragged} px`);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('myra')?.classList.contains('chat'));
  assert.strictEqual(await height(), dragged, 'closing the chat brings back the dragged height');

  await size(1440, 640);
  const short = await height();
  assert.ok(short < dragged, `a short window trims Unsorted: ${short} px, from ${dragged} px`);
  await size(1440, 900);
  assert.strictEqual(await height(), dragged, 'a taller window brings back the dragged height');
  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('unsortedWish: ok');
} finally {
  await l.close();
}
