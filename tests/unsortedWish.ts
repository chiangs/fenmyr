// A height dragged for Unsorted is a wish the column trims to fit. Opening the chat or shrinking the window trims it;
// closing the chat or making the window bigger again brings back the height that was dragged.
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
const l = await launch({
  boards: [{ id: 'b', name: 'Ideas', cards: [note], links: [], tray, view: { x: 300, y: 200, z: 1 } }],
  open: 'b',
  settings: { panelH: { tray: 560 } },
});
const { page, app } = l;
const height = () =>
  page.evaluate(() => Math.round(document.getElementById('tray')?.getBoundingClientRect().height ?? 0));
const size = async (width: number, h: number) => {
  await app.evaluate(({ BrowserWindow }, s) => BrowserWindow.getAllWindows()[0]?.setSize(s.width, s.h), { width, h });
  await settle(page, 600);
};

try {
  // narrow enough that her joined chat reaches under the right column
  await size(1100, 900);
  const dragged = await height();
  await page.click('#mPill');
  await settle(page, 800);
  const open = await height();
  assert.ok(open < dragged, `the open chat trims Unsorted: ${open} px, from ${dragged} px`);
  await page.keyboard.press('Escape');
  await settle(page, 600);
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
