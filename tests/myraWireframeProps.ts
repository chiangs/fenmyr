// Myra builds wireframes alongside the person: she holds a hammer while the screen tool is in hand, brings it down as
// a screen lands (and puts it away after, once the tool is put down), and holds a ruler while the Pieces picker is
// open on a screen. In calm mode the hammer stays still as a screen lands.
import assert from 'node:assert';
import { wireframeBoard } from './fixtures/boards.ts';
import { launch } from './support/launch.ts';

const l = await launch({ boards: [wireframeBoard()], open: 'wire' });
const { page } = l;

const failed: string[] = [];
async function check(name: string, run: () => Promise<void>) {
  try {
    await run();
    console.log(`ok    ${name}`);
  } catch (e) {
    failed.push(name);
    console.log(`FAIL  ${name}: ${e instanceof Error ? e.message : e}`);
  }
}
const look = () => page.evaluate(() => window.__fenmyr.busyLook());
const lookIs = async (want: string | null, what: string) => {
  await page.waitForFunction(w => window.__fenmyr.busyLook() === w, want, { timeout: 5000 }).catch(() => {});
  assert.strictEqual(await look(), want, what);
};
const screens = () =>
  page.evaluate(() => window.__fenmyr.curBoard()?.cards.filter(c => c.type === 'frame').length ?? 0);

// The rows her hammer's head covers on a sprite of her own, `ms` after it struck; calm: in calm mode
const hammerRows = (ms: number, calm = false) =>
  page.evaluate(
    ([ms, calm]) => {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 56;
      const goo = window.Goo(c, { headroom: 8, manual: true });
      goo.busy('hammer');
      goo.strike();
      window.myraCalm = calm;
      goo.draw(performance.now() + ms);
      window.myraCalm = false;
      const g = c.getContext('2d');
      if (!g) throw new Error('no 2D canvas');
      const d = g.getImageData(0, 0, c.width, c.height).data,
        rows = new Set<number>();
      for (let i = 0; i < d.length; i += 4)
        if (d[i] === 0x8a && d[i + 1] === 0x92 && d[i + 2] === 0x9c) rows.add(Math.floor(i / 4 / c.width));
      return [...rows].sort((a, b) => a - b);
    },
    [ms, calm] as const,
  );

try {
  await check('the screen tool in hand gives her a hammer, put away with the tool', async () => {
    await page.keyboard.press('w');
    await lookIs('hammer', 'a hammer while the screen tool is in hand');
    await page.keyboard.press('Escape');
    await lookIs(null, 'and none once it is put down');
  });

  await check('a screen landing brings her hammer down, and it goes once the strike is over', async () => {
    const before = await screens();
    await page.keyboard.press('w');
    await lookIs('hammer', 'the hammer is out');
    await page.mouse.click(700, 760);
    await page.waitForFunction(
      n => (window.__fenmyr.curBoard()?.cards.filter(c => c.type === 'frame').length ?? 0) > n,
      before,
    );
    const placing = await page.evaluate(() => document.getElementById('stage')?.classList.contains('placing'));
    assert.strictEqual(await look(), 'hammer', 'still out for the strike as the screen lands');
    // the new screen is selected, so the Pieces picker opens beside it and she swaps the hammer for her ruler
    if (!placing) await lookIs('ruler', 'and put away after it, with the tool put down');
    else {
      await page.keyboard.press('Escape');
      await lookIs('ruler', 'and put away with the tool');
    }
  });

  await check('the strike brings the hammer’s head down and back up, and calm mode keeps it still', async () => {
    const rest = await hammerRows(2000),
      down = await hammerRows(225),
      calmRest = await hammerRows(2000, true),
      calm = await hammerRows(225, true);
    assert.ok(rest.length && down.length, 'the hammer is drawn');
    // the strike brings it down 3 cells, 9 px here, far past the quarter cell her idle bob moves it
    assert.ok(
      (down[0] ?? 0) - (rest[0] ?? 0) >= 6,
      `its head is well down mid-strike: from row ${rest[0]} to ${down[0]}`,
    );
    assert.deepStrictEqual(calm, calmRest, 'in calm mode it doesn’t move');
  });

  await check('the Pieces picker open on a screen gives her a ruler, put away when it closes', async () => {
    // the picker may still be open on the screen that just landed, so this waits for it to move to the one selected
    await page.evaluate(() => window.__fenmyr.selectOnly(['empty']));
    await page.waitForFunction(
      () => document.querySelector('#selbar [data-pieces="empty"]')?.getAttribute('aria-expanded') === 'true',
    );
    await lookIs('ruler', 'a ruler while the picker is open');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.getElementById('piecePick')?.hidden);
    await lookIs(null, 'and none once it closes');
  });
} finally {
  await l.close();
}
assert.deepStrictEqual(failed, [], 'every check passes');
console.log('MYRA WIREFRAME PROPS OK');
