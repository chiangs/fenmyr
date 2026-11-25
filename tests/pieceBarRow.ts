// The Pieces picker docked beside a screen narrows the selection bar only where it reaches the bar's row. At 1280 × 800
// with an iPhone screen taller than the picker, docked on its left or, with no room there, on its right, the bar under it
// shows every control with nothing in ···, clear of the picker, and so does the bar above a short screen. Zoomed out, the picker runs past the screen's foot into the bar's row, and the bar still folds to keep clear.
import assert from 'node:assert';
import type { Page } from 'playwright';
import { wireframeBoard } from './fixtures/boards.ts';
import { launch } from './support/launch.ts';
import { rect, still } from './support/settled.ts';

const l = await launch({ boards: [wireframeBoard()], open: 'wire' });
const { page, app } = l;

const bar = (p: Page) =>
  p.evaluate(() => {
    const b = document.getElementById('selbar'),
      name = (el: Element | null) =>
        el?.getAttribute('data-tt') || el?.getAttribute('title') || el?.getAttribute('aria-label') || '';
    return {
      // a group on the bar has no box of its own, so it is there or in ···
      shown: [...(b?.querySelectorAll(':scope > .sb-g') ?? [])].map(g => name(g.querySelector('button'))),
      tucked: [...(b?.querySelector('.sb-morebody')?.children ?? [])].map(g => name(g.querySelector('button'))),
      dock: document.getElementById('piecePick')?.dataset.dock,
    };
  });
const apart = async () => {
  const a = await rect(page, '#selbar'),
    b = await rect(page, '#piecePick');
  return a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
};
const at = async (z: number, id: string, y = 110) => {
  await page.evaluate(
    ([z, y]) => {
      window.__fenmyr.selectOnly([]);
      Object.assign(window.__fenmyr.view, { x: 300, y, z });
      window.__fenmyr.applyView();
    },
    [z, y],
  );
  // the picker docks once the view has stopped moving
  await page.waitForFunction(() => !document.getElementById('stage')?.classList.contains('moving'));
  await page.evaluate(i => window.__fenmyr.selectOnly([i]), id);
  await page.waitForFunction(() => !document.getElementById('piecePick')?.hidden);
  await still(page);
};

try {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1280, 800));
  await page.waitForFunction(() => innerWidth === 1280);
  await still(page);

  const want = ['Device and size', 'Fill', 'Stroke', 'Corners', 'Make a clickable prototype from these screens'],
    // the empty screen has room on its left, Sign in none
    docks: [string, string][] = [
      ['empty', 'left'],
      ['signin', 'right'],
    ];
  for (const [id, side] of docks) {
    await at(0.6, id);
    const tall = await bar(page);
    assert.strictEqual(tall.dock, side, `the picker docks ${side} of the screen`);
    assert.deepStrictEqual(
      [want.filter(n => !tall.shown.includes(n)), tall.tucked],
      [[], []],
      `under a screen taller than the picker on its ${side}, the bar shows every control and folds nothing: ${tall.shown}`,
    );
    assert.ok(await apart(), `and stays clear of the picker on its ${side}`);
  }

  // With room above a short screen the bar sits there, 12 px over the screen's top, and the picker, level with that top,
  // starts a gap under it. The view is off a whole pixel, so the page rounds the picker's top down a hair, as it does at
  // most zooms.
  await at(0.3, 'signin', 200.3);
  const above = await bar(page),
    side = await page.evaluate(() => document.getElementById('selbar')?.dataset.side);
  assert.strictEqual(side, 'above', 'the bar sits above the short screen');
  const [b, p] = [await rect(page, '#selbar'), await rect(page, '#piecePick')];
  assert.ok(
    Math.abs(p.y - (b.y + b.height + 12)) < 1,
    `the picker starts a gap under the bar: ${b.y + b.height}, ${p.y}`,
  );
  assert.deepStrictEqual(
    [want.filter(n => !above.shown.includes(n)), above.tucked],
    [[], []],
    `above a screen with the picker beside it, the bar shows every control and folds nothing: ${above.shown}`,
  );
  assert.ok(await apart(), 'and stays clear of the picker');

  await at(0.3, 'signin');
  const short = await bar(page);
  assert.ok(
    short.dock === 'right' && short.tucked.length > 0,
    `where the picker reaches the bar's row, the bar still folds: ${short.tucked}`,
  );
  assert.ok(await apart(), 'to stay clear of it');

  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('PIECE BAR ROW OK');
} finally {
  await l.close();
}
