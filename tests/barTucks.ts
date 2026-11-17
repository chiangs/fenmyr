// The Wireframe button joins the bottom bar after Canvas without hiding anything 8d showed: every tool shows at
// 1440 × 900, and at 1366 and 1280 px the same tools tuck into ··· as before it came.
import assert from 'node:assert';
import { launch, settle } from './support/launch.ts';

const note = { id: 'n', type: 'note', x: 0, y: 0, w: 220, h: 120, r: 0, color: 'white', text: 'A note' };
const l = await launch({
  boards: [{ id: 'b', name: 'Bare', cards: [note], links: [], tray: [], view: { x: 300, y: 200, z: 1 } }],
  open: 'b',
});
const { page, app } = l;
const EXPECT: [number, number, string][] = [
  [1440, 900, ''],
  [1366, 768, 'tpl pen draw'],
  [1280, 800, 'shape stamp tpl pen draw'],
];

try {
  for (const [width, height, tucked] of EXPECT) {
    await app.evaluate(({ BrowserWindow }, s) => BrowserWindow.getAllWindows()[0]?.setSize(s.width, s.height), {
      width,
      height,
    });
    await settle(page, 600);
    const bar = await page.evaluate(() => ({
      tucked: [...document.querySelectorAll<HTMLElement>('#tools > [data-add].tb-over')]
        .map(b => b.dataset.add)
        .join(' '),
      wireframe: !document.querySelector('#tools > [data-add="frame"]')?.classList.contains('tb-over'),
    }));
    assert.strictEqual(bar.tucked, tucked, `at ${width} × ${height} these tuck into ···`);
    assert.ok(bar.wireframe, `at ${width} × ${height} the Wireframe button shows`);
  }
  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('barTucks: ok');
} finally {
  await l.close();
}
