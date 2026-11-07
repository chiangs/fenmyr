// The selection bar in the real app. First what it did before it floated: the typing state and F10, the crop bar, the
// Wireframe panel and the phone strip. Then where it floats, for a selection and a connector, and that it steps aside
// during a drag, resize, pan or zoom.
import assert from 'node:assert';
import { type Edges, near, openBar } from './support/bar.ts';
import { settle } from './support/launch.ts';

const { l, page, frames, still, view, select, selectWire, cardOf, focused, shape, check, done } = await openBar();
const barText = () =>
  page.evaluate(() => [...document.querySelectorAll('#selbar.on > *')].map(e => e.textContent?.trim() ?? ''));

await view(300, 300);
const body = page.locator('#cards [data-id="note"] .text');
await body.click();
await page.waitForTimeout(450);
await body.dblclick();
await page.waitForFunction(() => window.__fenmyr.editing === 'note');
await page.waitForFunction(() => document.querySelector('#selbar.typing [data-fmt="bullets"]')?.checkVisibility());
await page.keyboard.press('F10');
assert.strictEqual(await focused(), 'bar:bold', 'while a note is typed in, F10 moves to the bar, on Bold');
await page.keyboard.press('Escape');
assert.strictEqual(await focused(), 'note', 'and Escape goes back to the note');
assert.strictEqual(await page.evaluate(() => window.__fenmyr.editing), 'note', 'still typed in');
await page.keyboard.press('Escape');
await frames();

await select(['pic']);
const picBefore = await cardOf('pic');
await page.click('#selbar [data-sb="crop"]');
await page.waitForSelector('#selbar [data-crop="done"]');
assert.deepStrictEqual(await barText(), ['Crop', 'Cancel', 'Reset', 'Done'], 'cropping, the bar is the crop bar');
await page.click('#selbar [data-crop="cancel"]');
await page.waitForSelector('#selbar [data-sb="crop"]');
assert.deepStrictEqual(await cardOf('pic'), picBefore, 'Cancel leaves the picture as it was');

await view(-300, 300);
await select(['wf']);
const xField = () => page.evaluate(() => document.querySelector<HTMLInputElement>('#dzProps input[data-k="x"]')?.value);
assert.strictEqual(await xField(), '800', 'a wireframe piece fills the Wireframe panel');
const wf = await page.locator('#cards [data-id="wf"]').boundingBox();
assert.ok(wf, 'the box is on screen');
await page.mouse.move(wf.x + wf.width / 2, wf.y + wf.height / 2);
await page.mouse.down();
await page.mouse.move(wf.x + wf.width / 2 + 60, wf.y + wf.height / 2, { steps: 6 });
await page.mouse.up();
await frames();
const moved = await cardOf('wf');
assert.ok(moved && moved.x !== 800, 'the box moved');
assert.strictEqual(await xField(), String(Math.round(moved.x)), 'the panel follows it');
await page.keyboard.press('Escape');
await frames();
assert.ok(await page.locator('#dzProps .dz-hint').count(), 'with nothing selected the panel shows its hint');

const top = (s: { card: Edges | null; dot: Edges | null }) => Math.min(s.card?.t ?? NaN, s.dot?.t ?? Infinity);
// 12 px over the selection, or over its turn dot when it has one
const above = async (id: string) => {
  const s = await shape(id);
  assert.ok(!s.inDock && s.tools, 'the bar is not in the bottom bar, and the tools stay');
  assert.ok(s.shown, 'the bar is up');
  near(s.bar?.b, top(s) - 12, 'its bottom');
  assert.ok(s.bar && s.card && s.bar.l < s.card.r && s.bar.r > s.card.l, 'it is over the selection');
};
for (const id of ['title', 'note'])
  await check(`a ${id}'s bar floats above it`, async () => {
    await view(500, 400);
    await select([id]);
    await above(id);
  });
await check('near the top of the view the bar flips below', async () => {
  await view(500, (await shape()).header + 30);
  await select(['note']);
  const s = await shape('note');
  near(s.bar?.t, (s.card?.b ?? NaN) + 12, 'its top');
});
await check('a selection taller than the view keeps the bar at the top', async () => {
  await view(-1000, 0);
  await select(['tall']);
  const s = await shape('tall');
  near(s.bar?.t, s.header + 12, 'its top');
});
await check('the bar stays clear of the side widgets', async () => {
  await view(100, 400);
  await select(['note']);
  const s = await shape('note');
  near(s.bar?.l, s.leftWidgets + 12, 'its left');
  near(s.bar?.b, top(s) - 12, 'its bottom');
});

const steps = { steps: 8 };
const gestures: [string, (x: number, y: number) => Promise<void>, () => Promise<void>][] = [
  [
    'drag',
    async (x, y) => {
      await page.mouse.move(x + 60, y + 50);
      await page.mouse.down();
      await page.mouse.move(x + 140, y + 110, steps);
    },
    () => page.mouse.up(),
  ],
  [
    'resize',
    async () => {
      const rh = await page.locator('#rh').boundingBox();
      assert.ok(rh, 'the resize corner is up');
      await page.mouse.move(rh.x + rh.width / 2, rh.y + rh.height / 2);
      await page.mouse.down();
      await page.mouse.move(rh.x + 60, rh.y + 40, steps);
    },
    () => page.mouse.up(),
  ],
  [
    'pan',
    async () => {
      await page.keyboard.down('Space');
      await page.mouse.move(800, 700);
      await page.mouse.down();
      await page.mouse.move(740, 660, steps);
    },
    async () => {
      await page.mouse.up();
      await page.keyboard.up('Space');
    },
  ],
  [
    'zoom',
    async () => {
      await page.mouse.move(800, 700);
      await page.keyboard.down('Control');
      await page.mouse.wheel(0, -120);
      await frames();
    },
    () => page.keyboard.up('Control'),
  ],
];
for (const [name, start, end] of gestures)
  await check(`the bar steps aside for a ${name} and comes back over the note`, async () => {
    await view(500, 400);
    await select(['note']);
    await start(500, 400);
    assert.ok(!(await shape()).shown, `no bar during the ${name}`);
    await end();
    await still();
    await above('note');
  });

const middle = (id: string) =>
  page.evaluate(id => {
    const r = document.querySelector(`.w-hit[data-wire="${id}"]`)?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  }, id);
await check('a level connector has its bar above its middle', async () => {
  await view(400, -300);
  await selectWire('h');
  const s = await shape(),
    m = await middle('h');
  near(s.bar?.b, (m?.y ?? NaN) - 12, 'its bottom');
  near(((s.bar?.l ?? 0) + (s.bar?.r ?? 0)) / 2, m?.x ?? NaN, 'its middle');
});
await check('an upright connector has its bar beside its middle', async () => {
  await view(-100, -300);
  await selectWire('v');
  const s = await shape(),
    m = await middle('v');
  near(s.bar?.r, (m?.x ?? NaN) - 12, 'its right');
  near(((s.bar?.t ?? 0) + (s.bar?.b ?? 0)) / 2, m?.y ?? NaN, 'its middle');
});
await check('an upright connector by the left widgets has its bar on its other side', async () => {
  await view(-560, -300);
  await selectWire('v');
  const s = await shape(),
    m = await middle('v');
  near(s.bar?.l, (m?.x ?? NaN) + 12, 'its left');
});
await page.keyboard.press('Escape');

await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(600, 900));
await settle(l.page);
await view(100, 300);
await select(['note']);
const strip = await page.evaluate(() => {
  const bar = document.getElementById('selbar')?.getBoundingClientRect(),
    hub = document.getElementById('hub');
  return {
    phone: document.body.classList.contains('phone'),
    centred: Math.abs((bar?.left ?? 0) - (innerWidth - (bar?.right ?? 0))) <= 1,
    bottom: Math.round(innerHeight - (bar?.bottom ?? 0)),
    hub: !!hub?.checkVisibility(),
  };
});
assert.deepStrictEqual(
  strip,
  { phone: true, centred: true, bottom: 10, hub: false },
  'on a phone the bar is a strip at the bottom, in place of the hub',
);
await check('on a phone the strip stays through a drag', async () => {
  const note = await page.locator('#cards [data-id="note"]').boundingBox(),
    x0 = (await cardOf('note'))?.x;
  assert.ok(note, 'the note is on screen');
  await page.mouse.move(note.x + 30, note.y + 30);
  await page.mouse.down();
  await page.mouse.move(note.x + 80, note.y + 60, steps);
  assert.notStrictEqual((await cardOf('note'))?.x, x0, 'the note is moving');
  assert.ok((await shape()).shown, 'the strip is still up');
});
await select([]);
assert.ok(
  await page.evaluate(() => document.getElementById('hub')?.checkVisibility()),
  'deselecting brings the hub back',
);
await done('CONTEXT BAR OK');
