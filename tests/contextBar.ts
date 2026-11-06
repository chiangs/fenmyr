// The selection bar in the real app. First what it already did before it floated: the typing state and F10, the crop
// bar, the Wireframe panel and the phone strip.
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
  id: 'bar',
  name: 'Bar',
  cards: [
    at('title', 'title', 0, -200, 320, 50, { text: 'A title' }),
    at('note', 'note', 0, 0, 220, 140, { name: '', text: 'Plan the week', rich: true, color: 'butter' }),
    at('pic', 'image', 400, 0, 260, 220, { src: 'stamps/myra-happy.png' }),
    at('wf', 'box', 800, 0, 160, 100),
    at('tall', 'note', 1200, -1000, 220, 2400, { name: '', text: 'Tall' }),
    at('ha', 'note', 0, 600, 120, 80, { name: '', text: 'a' }),
    at('hb', 'note', 500, 600, 120, 80, { name: '', text: 'b' }),
    at('va', 'note', 900, 500, 120, 80, { name: '', text: 'c' }),
    at('vb', 'note', 900, 1000, 120, 80, { name: '', text: 'd' }),
  ],
  links: [
    { id: 'h', a: 'ha', b: 'hb', bend: 0 },
    { id: 'v', a: 'va', b: 'vb', bend: 0 },
  ],
  tray: [],
  view: { x: 0, y: 0, z: 1 },
};

const l = await launch({ boards: [board], open: 'bar' });
const { page } = l;
const frames = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const still = () => page.waitForFunction(() => !document.getElementById('stage')?.classList.contains('moving'));
const view = async (x: number, y: number, z = 1) => {
  await page.evaluate(
    v => {
      Object.assign(window.__fenmyr.view, v);
      window.__fenmyr.applyView();
    },
    { x, y, z },
  );
  await still();
  await frames();
};
const select = async (ids: string[]) => {
  await page.evaluate(ids => window.__fenmyr.selectOnly(ids), ids);
  await frames();
};
const cardOf = (id: string) =>
  page.evaluate(id => {
    const c = window.__fenmyr.board.cards.find(c => c.id === id);
    return c ? { x: c.x, h: c.h, cropEdit: 'cropEdit' in c } : null;
  }, id);
const focused = () =>
  page.evaluate(() => {
    const a = document.activeElement;
    if (!(a instanceof HTMLElement)) return null;
    if (a.closest('#selbar'))
      return `bar:${a.dataset.ts ?? a.dataset.pop ?? a.dataset.sb ?? a.dataset.crop ?? a.tagName}`;
    return a.closest('.card')?.getAttribute('data-id') ?? a.tagName;
  });
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

await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(600, 900));
await settle(l.page);
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
await select([]);
assert.ok(
  await page.evaluate(() => document.getElementById('hub')?.checkVisibility()),
  'deselecting brings the hub back',
);

assert.deepStrictEqual(l.errors, []);
await l.close();
console.log('CONTEXT BAR OK');
