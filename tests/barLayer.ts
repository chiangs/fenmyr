// What opens over the bottom bar: with Myra's chat open, the toolbar's pickers, a colour card's wheel and quick
// capture open over it.
import assert from 'node:assert';
import { launch, settle } from './support/launch.ts';

const at = (id: string, type: string, x: number, y: number, w: number, h: number, more = {}) => ({
  id,
  type,
  x,
  y,
  w,
  h,
  r: 0,
  color: 'white',
  ...more,
});
const board = {
  id: 'layer',
  name: 'Layer',
  cards: [
    at('note', 'note', 200, 500, 220, 140, { name: '', text: 'Plan' }),
    at('sw', 'swatch', 560, 250, 120, 120, { hex: '#e88a24', label: 'Orange' }),
    at('doc', 'doc', 200, 100, 200, 260, { text: 'Plan' }),
  ],
  links: [],
  tray: Array.from({ length: 40 }, (_, i) => ({
    id: `t${i}`,
    type: 'note',
    w: 220,
    h: 140,
    text: `Item ${i}`,
    name: '',
  })),
  view: { x: 0, y: 0, z: 1 },
};
const l = await launch({ boards: [board], open: 'layer' });
const { page } = l;
const size = async (w: number, h: number) => {
  await l.app.evaluate(({ BrowserWindow }, s) => BrowserWindow.getAllWindows()[0]?.setSize(s.w, s.h), { w, h });
  await settle(page, 400);
};
const still = () => page.waitForTimeout(450);
const view = async () => {
  await page.evaluate(() => {
    Object.assign(window.__fenmyr.view, { x: 0, y: 0, z: 1 });
    window.__fenmyr.applyView();
  });
  await still();
};
const chatOpen = () => page.evaluate(() => !!document.getElementById('myra')?.classList.contains('chat'));
const setChat = async (open: boolean) => {
  if ((await chatOpen()) !== open) await page.click('#mPill');
  await still();
};
const closeAll = async () => {
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await still();
};
// the id of the element that shows where `top` and `under` meet: `top` when it is on top
const onTopWhereMeets = (top: string, under: string) =>
  page.evaluate(
    ({ top, under }) => {
      const a = document.querySelector(top),
        b = document.querySelector(under);
      if (!a?.checkVisibility({ opacityProperty: true })) return `${top} is not up`;
      if (!b?.checkVisibility({ opacityProperty: true })) return `${under} is not up`;
      const p = a.getBoundingClientRect(),
        q = b.getBoundingClientRect();
      if (!(p.left < q.right && p.right > q.left && p.top < q.bottom && p.bottom > q.top)) return 'they do not meet';
      const el = document.elementFromPoint(
        (Math.max(p.left, q.left) + Math.min(p.right, q.right)) / 2,
        (Math.max(p.top, q.top) + Math.min(p.bottom, q.bottom)) / 2,
      );
      return el?.closest(top) ? top : el?.closest(under) ? under : `${el?.id || el?.className || 'nothing'}`;
    },
    { top, under },
  );

const failed: string[] = [];
// each check reports on its own, so a run against an older build lists every check it fails
const check = async (name: string, run: () => Promise<void>) => {
  try {
    await run();
  } catch (e) {
    failed.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
  }
  await page.mouse.up();
};

await size(1440, 900);
await view();
for (const [tool, picker] of [
  ['tpl', '#tplPick'],
  ['shape', '#shapePick'],
  ['stamp', '#stampWheel'],
  ['stamp', '#stampPick'],
] as const) {
  await check(`with Myra’s chat open, ${picker} opens over it`, async () => {
    await setChat(true);
    await page.click(`#tools [data-add="${tool}"]`);
    if (picker === '#stampPick') await page.click('#wsMid');
    await still();
    const top = await onTopWhereMeets(picker, '#mChat');
    await closeAll();
    assert.strictEqual(top, picker);
  });
}
await check('with Myra’s chat open, a colour card’s wheel opens over it', async () => {
  await setChat(true);
  await page.locator('.card[data-id="sw"]').dblclick();
  await still();
  const top = await onTopWhereMeets('#cpop', '#mChat');
  await closeAll();
  assert.strictEqual(top, '#cpop');
});
await check('on a short window, quick capture opens over Myra’s open chat', async () => {
  await size(1440, 640);
  await setChat(true);
  await page.keyboard.press('Control+k');
  await still();
  const top = await onTopWhereMeets('#capture', '#mChat');
  await closeAll();
  await size(1440, 900);
  assert.strictEqual(top, '#capture');
});
await setChat(false);

const errors = [...l.errors];
await l.close();
for (const f of failed) console.log(`FAILED ${f}`);
assert.deepStrictEqual(failed, [], 'every check passes');
assert.deepStrictEqual(errors, []);
console.log('BAR LAYER OK');
