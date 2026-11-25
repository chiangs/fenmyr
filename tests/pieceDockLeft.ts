// The Pieces picker docks on the left of its screen first, as screens are built left to right and the next one goes on
// the right. At 1280 × 800 a screen with room on both sides gets it 12 px left, level with its top; a screen near the
// left edge, with no room there, gets it 12 px right.
import assert from 'node:assert';
import { wireframeBoard } from './fixtures/boards.ts';
import { calm } from './support/calm.ts';
import { launch } from './support/launch.ts';
import { rect } from './support/settled.ts';

const l = await launch({ boards: [wireframeBoard()], open: 'wire' });
const { page, app } = l;

// the screen's box on the page, and the picker's
const where = async (id: string) => {
  await page.evaluate(i => window.__fenmyr.selectOnly([i]), id);
  await page.waitForFunction(() => !document.getElementById('piecePick')?.hidden);
  await calm(page);
  const p = await rect(page, '#piecePick'),
    s = await page.evaluate(i => {
      const c = window.__fenmyr.curBoard()?.cards.find(c => c.id === i),
        v = window.__fenmyr.view,
        st = document.getElementById('stage')?.getBoundingClientRect();
      if (!c || !st) throw new Error(`no ${i}`);
      return { l: st.left + v.x + c.x * v.z, r: st.left + v.x + (c.x + c.w) * v.z, t: st.top + v.y + c.y * v.z };
    }, id);
  return { p: { l: p.x, r: p.x + p.width, t: p.y }, s };
};
const near = (a: number, b: number) => Math.abs(a - b) < 1.5;

try {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1280, 800));
  await page.waitForFunction(() => innerWidth === 1280);
  // at 30%, the empty screen has a picker's width of board on both sides, and Sign in has none on its left
  await page.evaluate(() => {
    Object.assign(window.__fenmyr.view, { x: 430, y: 110, z: 0.3 });
    window.__fenmyr.applyView();
  });
  await calm(page);

  const both = await where('empty');
  assert.ok(
    near(both.p.r, both.s.l - 12) && near(both.p.t, both.s.t),
    `with room on both sides, the picker docks 12 px left of its screen, level with its top: ${JSON.stringify(both)}`,
  );
  const edge = await where('signin');
  assert.ok(
    near(edge.p.l, edge.s.r + 12) && near(edge.p.t, edge.s.t),
    `with no room on its left, 12 px right of it: ${JSON.stringify(edge)}`,
  );

  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('PIECE DOCK LEFT OK');
} finally {
  await l.close();
}
