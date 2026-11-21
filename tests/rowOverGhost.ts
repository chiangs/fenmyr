// With the screen tool in hand, the screen riding the pointer passes under the Wireframe row, so Box, Text, Icon and
// × stay in view as the pointer comes down to them. Other tools' ghosts still ride over the bottom bar.
import assert from 'node:assert';
import { launch } from './support/launch.ts';
import { still } from './support/settled.ts';

const note = { id: 'n', type: 'note', x: 0, y: 0, w: 220, h: 120, r: 0, color: 'white', text: 'A note' };
const l = await launch({
  boards: [{ id: 'b', name: 'Bare', cards: [note], links: [], tray: [], view: { x: 300, y: 200, z: 1 } }],
  open: 'b',
  settings: { theme: 'dark' },
});
const { page } = l;
// what shows on top at each point, with the ghost taking part as if it caught the pointer
const onTop = (points: { x: number; y: number }[]) =>
  page.evaluate(ps => {
    const g = document.getElementById('ghost');
    if (g) g.style.pointerEvents = 'auto';
    const tops = ps.map(p => {
      const el = document.elementFromPoint(p.x, p.y);
      return el?.closest('#ghost')
        ? 'ghost'
        : el?.closest('#screenbar')
          ? 'row'
          : el?.closest('#dock')
            ? 'bar'
            : 'other';
    });
    if (g) g.style.pointerEvents = '';
    return tops;
  }, points);

try {
  await page.mouse.move(700, 120);
  await page.keyboard.press('w');
  await still(page);
  const tools = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('#screenbar [data-wft], #scX')].map(b => {
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }),
  );
  assert.strictEqual(tools.length, 4, 'the row has Box, Text, Icon and ×');
  const first = tools[0] ?? { x: 0, y: 0 };
  await page.mouse.move(first.x - 40, first.y - 60);
  await still(page);
  assert.ok(
    await page.evaluate(() => getComputedStyle(document.getElementById('ghost') ?? document.body).display !== 'none'),
    'the screen rides the pointer just above the row',
  );
  assert.deepStrictEqual(await onTop(tools), ['row', 'row', 'row', 'row'], 'and the row’s tools show over it');
  await page.keyboard.press('Escape');
  await still(page);

  const noteTool = await page.evaluate(() => {
    const r = document.querySelector('#tools [data-add="note"]')?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: 0, y: 0 };
  });
  await page.mouse.click(noteTool.x, noteTool.y);
  await page.mouse.move(noteTool.x + 1, noteTool.y);
  await still(page);
  assert.deepStrictEqual(
    await onTop([{ x: noteTool.x + 30, y: noteTool.y + 4 }]),
    ['ghost'],
    'a note in hand rides over the bottom bar',
  );
  await page.keyboard.press('Escape');
  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('rowOverGhost: ok');
} finally {
  await l.close();
}
