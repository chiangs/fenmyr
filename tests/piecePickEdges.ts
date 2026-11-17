// The Pieces picker's edges, from review: a finger scrolling its grid leaves nothing in hand, Esc during a drag out
// puts the piece down and keeps the picker, a pick that moves the view leaves the next click on the picker, and the
// mode bar stays over the tools. Esc on the board leaves focus where it was and Pieces says it closed at once. The
// empty-screen hint ignores a double-click, names its screen, and stays out of an export.
import assert from 'node:assert';
import { wireframeBoard } from './fixtures/boards.ts';
import { launch, settle } from './support/launch.ts';

const l = await launch({ boards: [wireframeBoard()], open: 'wire' });
const { page, app } = l;

const count = () => page.evaluate(() => window.__fenmyr.curBoard()?.cards.length ?? 0);
const open = () => page.evaluate(() => !document.getElementById('piecePick')?.hidden);
const inHand = () =>
  page.evaluate(() => ({
    ghost: document.getElementById('ghost')?.className,
    dragging: document.body.classList.contains('dz-dragging'),
  }));
const setView = async (x: number, y: number, z: number) => {
  await page.evaluate(
    v => {
      Object.assign(window.__fenmyr.view, v);
      window.__fenmyr.applyView();
    },
    { x, y, z },
  );
  await settle(page, 400);
};
const openOn = async (id: string) => {
  await page.evaluate(i => window.__fenmyr.selectOnly([i]), id);
  await settle(page, 250);
  if (!(await open())) await page.click('#selbar [data-pieces]');
  await settle(page, 250);
};
const centre = async (sel: string) => {
  const b = await page.locator(sel).boundingBox();
  if (!b) throw new Error(`no ${sel}`);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
const blur = () =>
  page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));

try {
  await settle(page, 800);

  await openOn('signin');
  const video = await centre('#pkGrid [data-pk-piece="Video"]');
  let n = await count();
  await page.mouse.move(video.x, video.y);
  await page.mouse.down();
  await page.mouse.move(video.x - 300, video.y + 80, { steps: 10 });
  await page.keyboard.press('Escape');
  const mid = { ...(await inHand()), open: await open() };
  await page.mouse.up();
  await settle(page, 300);
  assert.deepStrictEqual(
    [mid, (await count()) - n],
    [{ ghost: 'ghost', dragging: false, open: true }, 0],
    'Esc during a drag out puts the piece down and keeps the picker, and letting go adds nothing',
  );

  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await setView(300, 60, 1);
  await openOn('signin');
  assert.ok(await open(), 'the picker opens at 100%');
  await page.locator('#pkGrid [data-pk-piece="Card"]').scrollIntoViewIfNeeded();
  let moved = false,
    second = -1;
  for (let i = 0; i < 12 && !moved; i++) {
    const cell = await centre('#pkGrid [data-pk-piece="Card"]'),
      before = await page.evaluate(() => ({ ...window.__fenmyr.view }));
    await page.mouse.click(cell.x, cell.y);
    await page.waitForTimeout(60);
    const after = await page.evaluate(() => ({ ...window.__fenmyr.view }));
    moved = after.x !== before.x || after.y !== before.y;
    if (!moved) {
      await settle(page, 400);
      continue;
    }
    n = await count();
    await page.mouse.click(cell.x, cell.y);
    await settle(page, 400);
    second = (await count()) - n;
  }
  assert.ok(moved, 'a pick brought its piece into view');
  assert.ok(
    second > 0 && (await open()),
    `a click straight after a pick that moved the view still lands on the picker: ${second}`,
  );

  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await setView(300, 110, 0.3);
  await blur();
  await page.keyboard.press('w');
  await settle(page, 250);
  const alone = await page.locator('#modebar').boundingBox();
  await page.keyboard.press('Escape');
  await openOn('signin');
  await blur();
  await page.keyboard.press('w');
  await settle(page, 250);
  const beside = await page.locator('#modebar').boundingBox();
  assert.ok(
    (await open()) && alone && beside && Math.abs(alone.x - beside.x) < 1,
    `the mode bar stays over the tools with the picker open: ${JSON.stringify({ alone, beside })}`,
  );
  await page.keyboard.press('Escape');

  await openOn('signin');
  const head = await page.evaluate(() => {
    const c = window.__fenmyr.curBoard()?.cards.find(c => c.id === 'head0'),
      v = window.__fenmyr.view,
      s = document.getElementById('stage')?.getBoundingClientRect();
    return c && s ? { x: s.left + v.x + (c.x + c.w / 2) * v.z, y: s.top + v.y + (c.y + c.h / 2) * v.z } : null;
  });
  if (!head) throw new Error('no head0');
  await page.mouse.click(head.x, head.y);
  await settle(page, 250);
  await page.keyboard.press('Escape');
  assert.deepStrictEqual(
    await page.evaluate(() => [
      !document.getElementById('piecePick')?.hidden,
      document.activeElement === document.body,
      document.querySelector('#selbar [data-pieces]')?.getAttribute('aria-expanded'),
    ]),
    [false, true, 'false'],
    'Esc on the board closes the picker, leaves focus on the board, and Pieces says at once it is collapsed',
  );
  await page.keyboard.press('Escape');

  await setView(200, 60, 0.5);
  const hint = await centre('#screenHints [data-hint="empty"]');
  assert.strictEqual(
    await page.getAttribute('#screenHints [data-hint="empty"]', 'aria-label'),
    'Add pieces to Screen',
    'the hint names its screen to a screen reader',
  );
  n = await count();
  await page.mouse.dblclick(hint.x, hint.y);
  await settle(page, 400);
  assert.deepStrictEqual(
    [(await count()) - n, await open()],
    [0, true],
    'a double-click on Add pieces makes no note, and the picker stays open',
  );
  assert.deepStrictEqual(
    await page.evaluate(() => {
      document.body.classList.add('exporting');
      const seen = ['#screenHints .screen-hint', '#piecePick'].map(
        s => document.querySelector(s)?.checkVisibility({ visibilityProperty: true }) ?? null,
      );
      document.body.classList.remove('exporting');
      return seen;
    }),
    [false, false],
    'an export shows neither the hint nor the picker',
  );

  await page.keyboard.press('Escape');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(390, 844));
  await settle(page, 600);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await setView(20, 80, 0.4);
  await page.evaluate(() => window.__fenmyr.selectOnly(['signin']));
  await settle(page, 300);
  await page.click('#dock #selbar [data-pieces]');
  await settle(page, 300);
  assert.notStrictEqual(
    await page.evaluate(() => document.activeElement?.id),
    'pkSearch',
    'on a phone the picker opens without raising the keyboard',
  );
  const cell = await centre('#pkGrid [data-pk-piece="Avatar"]');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [cell] });
  for (let i = 1; i <= 15; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cell.x, y: cell.y - i * 8 }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await settle(page, 300);
  assert.deepStrictEqual(
    await inHand(),
    { ghost: 'ghost', dragging: false },
    'a finger scrolling the grid leaves nothing in hand',
  );
  assert.deepStrictEqual(l.errors, []);
  console.log('PIECE PICK EDGES OK');
} finally {
  await l.close();
}
