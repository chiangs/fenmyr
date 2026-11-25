// On a phone the + sheet loses its Wireframe tab: its tabs are Basics and Colours, and Basics holds the Wireframe
// button. Choosing it closes the sheet and shows the Wireframe row in the dock, so a tap places a screen, and Box and
// Text in the row place each on the bare board, as the panel's tab did. Basics' Icon lands a star on the bare board.
// The strip's Pieces opens the picker, and a pick lands in the screen.
import assert from 'node:assert';
import { launch, settle } from './support/launch.ts';

const far = { id: 'far', type: 'note', x: -4000, y: -4000, w: 220, h: 120, r: 0, color: 'white', text: 'far away' };
const l = await launch({
  boards: [{ id: 'b', name: 'Phone', cards: [far], links: [], tray: [], view: { x: 0, y: 0, z: 0.5 } }],
  open: 'b',
});
const { page } = l;
const frames = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const newest = () =>
  page.evaluate(() => {
    const c = window.__fenmyr.curBoard()?.cards.at(-1);
    return c && { id: c.id, type: c.type, onFrame: c.onFrame ?? null, name: 'name' in c ? c.name : null };
  });
const row = () =>
  page.evaluate(() => {
    const r = document.getElementById('screenbar');
    return {
      inDock: r?.closest('#dock') !== null,
      shown: !!r?.checkVisibility(),
      lit: [...(r?.querySelectorAll('[aria-pressed="true"]') ?? [])].map(
        e => e.getAttribute('data-dev') ?? e.getAttribute('data-wft'),
      ),
    };
  });
const sheetOpen = () => page.evaluate(() => !!document.getElementById('sheet')?.classList.contains('on'));
// the + sheet's Basics tab, then its Wireframe button
const wireframe = async () => {
  await page.click('[data-sheet="add"]');
  await page.click('#shTabs [data-t="0"]');
  await page.click('#shBody [data-add="frame"]');
  await settle(page, 300);
};
const tap = async (fx: number, fy: number) => {
  const s = await page.evaluate(() => document.getElementById('stage')?.getBoundingClientRect().toJSON());
  await page.mouse.click(s.left + s.width * fx, s.top + s.height * fy);
  await settle(page, 300);
};
const failed: string[] = [];
const check = async (name: string, run: () => Promise<void>) => {
  try {
    await run();
  } catch (e) {
    failed.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (await sheetOpen()) await page.click('#sheet .sh-x');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__fenmyr.selectOnly([]));
  await settle(page, 200);
};

try {
  await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(390, 844));
  await settle(page, 600);

  await check("the + sheet's tabs are Basics and Colours, and Basics holds the Wireframe button", async () => {
    await page.click('[data-sheet="add"]');
    await settle(page, 300);
    assert.deepStrictEqual(
      await page.evaluate(() => [...document.querySelectorAll('#shTabs button')].map(b => b.textContent)),
      ['Basics', 'Colours'],
    );
    assert.ok(await page.isVisible('#shBody [data-add="frame"]'), 'Basics shows the Wireframe button');
  });

  await check('the Wireframe button closes the sheet, and a tap places a screen', async () => {
    await wireframe();
    assert.ok(!(await sheetOpen()), 'the sheet closes');
    assert.deepStrictEqual(await row(), { inDock: true, shown: true, lit: ['iPhone'] }, 'the row shows in the dock');
    await tap(0.5, 0.4);
    assert.strictEqual((await newest())?.type, 'frame', 'a tap places a screen');
  });

  await check("the strip's Pieces opens the picker, and a pick lands in the screen", async () => {
    const screen = await page.evaluate(() => window.__fenmyr.curBoard()?.cards.find(c => c.type === 'frame')?.id);
    assert.ok(screen, 'a screen to add to');
    await page.evaluate(id => window.__fenmyr.selectOnly([id]), screen);
    await settle(page, 300);
    await page.evaluate(() => document.querySelector<HTMLElement>('#selbar [data-pieces]')?.click());
    await settle(page, 300);
    assert.ok(await page.evaluate(() => !document.getElementById('piecePick')?.hidden), 'the picker opens');
    await page.evaluate(() => document.querySelector<HTMLElement>('#pkGrid [data-pk-piece="Button"]')?.click());
    await settle(page, 400);
    const c = await newest();
    assert.strictEqual(c?.onFrame, screen, 'the pick lands in the screen');
  });

  // the rest place on empty board, away from that screen
  await page.evaluate(() => {
    Object.assign(window.__fenmyr.view, { x: 3000, y: 0, z: 0.5 });
    window.__fenmyr.applyView();
  });
  await settle(page, 300);

  for (const [tool, type] of [
    ['box', 'box'],
    ['text', 'text'],
  ] as const)
    await check(`the row's ${tool} places a ${type} on the bare board`, async () => {
      await wireframe();
      await page.click(`#screenbar [data-wft="${tool}"]`);
      await frames();
      assert.deepStrictEqual(await row(), { inDock: true, shown: true, lit: [tool] }, `${tool} is lit`);
      await tap(0.5, 0.75);
      const c = await newest();
      assert.deepStrictEqual(c && { type: c.type, onFrame: c.onFrame }, { type, onFrame: null }, `a ${type} lands`);
    });

  await check("Basics' Icon lands a star on the bare board, and a tap in the picker gives it its glyph", async () => {
    await page.click('[data-sheet="add"]');
    await page.click('#shTabs [data-t="0"]');
    await page.click('#shBody [data-add="icon"]');
    // choosing it closes the sheet, so the tap lands on the board
    await page.waitForFunction(() => !document.getElementById('sheet')?.classList.contains('on'));
    await tap(0.5, 0.75);
    const c = await newest();
    assert.deepStrictEqual(c && { type: c.type, name: c.name, onFrame: c.onFrame }, {
      type: 'icon',
      name: 'star',
      onFrame: null,
    });
    assert.ok(await page.evaluate(() => !document.getElementById('piecePick')?.hidden), 'the picker opens');
    await page.evaluate(() => document.querySelector<HTMLElement>('#pkGrid [data-pk-icon="heart"]')?.click());
    await settle(page, 300);
    assert.strictEqual((await newest())?.name, 'heart', 'a tap swaps the glyph');
    assert.ok(await page.evaluate(() => document.getElementById('piecePick')?.hidden), 'and closes the picker');
  });

  for (const f of failed) console.log(`FAILED ${f}`);
  assert.deepStrictEqual(failed, [], 'every check passes');
  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('phoneSheet: ok');
} finally {
  await l.close();
}
