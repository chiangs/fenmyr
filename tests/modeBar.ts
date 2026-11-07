// Drawing and find in the real app. First what they did in the bottom bar: the pens, a stroke, a size, Done and
// Escape; Ctrl+F through Myra's box, stepping through matches, closing, and a draft in her box; drawing on a phone.
import assert from 'node:assert';
import { openBar } from './support/bar.ts';
import { settle } from './support/launch.ts';

const { l, page, frames, view, done } = await openBar();
const seen = (sel: string) => page.evaluate(sel => !!document.querySelector(sel)?.checkVisibility(), sel);
const text = (sel: string) => page.evaluate(sel => document.querySelector(sel)?.textContent?.trim() ?? '', sel);
const inks = () => page.evaluate(() => window.__fenmyr.curBoard()?.cards.filter(c => c.type === 'ink').length ?? 0);
const pointerOn = () => seen('#tools [data-add="pointer"].on');

await view(-3000, 0);
await page.keyboard.press('p');
await frames();
assert.ok(await seen('#drawbar'), 'P puts up the drawing bar');
assert.ok(await seen('#drawbar [data-pen="pen"].on'), 'with the pen in hand');
assert.ok(!(await pointerOn()), 'and the Select tool goes out');
await page.click('#drawbar [data-pen="marker"]');
assert.ok(await seen('#drawbar [data-pen="marker"].on'), 'a click picks the marker');
const before = await inks();
await page.mouse.move(600, 400);
await page.mouse.down();
await page.mouse.move(760, 460, { steps: 10 });
await page.mouse.up();
assert.strictEqual(await inks(), before + 1, 'a stroke on the board leaves a drawing');
const size = Number(await text('#dbsVal'));
await page.keyboard.press(']');
assert.ok(Number(await text('#dbsVal')) > size, '] makes the pen bigger');
await page.click('#drawbar [data-db="done"]');
await frames();
assert.ok(!(await seen('#drawbar')), 'Done takes the drawing bar down');
assert.ok(await pointerOn(), 'and the Select tool lights again');
await page.keyboard.press('p');
await page.keyboard.press('Escape');
await frames();
assert.ok(!(await seen('#drawbar')), 'Escape stops drawing too');

const findState = () =>
  page.evaluate(() => ({
    shown: !!document.getElementById('findBar')?.checkVisibility(),
    count: document.getElementById('fbCount')?.textContent ?? '',
    focus: document.activeElement?.id,
    selected: [...window.__fenmyr.sel],
  }));
await view(300, 300);
await page.keyboard.press('Control+f');
assert.deepStrictEqual(
  await page.evaluate(() => ({
    chat: !!document.getElementById('myra')?.classList.contains('chat'),
    box: document.querySelector<HTMLTextAreaElement>('#mcInput')?.value,
    focus: document.activeElement?.id,
  })),
  { chat: true, box: '/find ', focus: 'mcInput' },
  'Ctrl+F opens Myra’s chat ready to search',
);
await page.keyboard.type('a');
await page.keyboard.press('Enter');
await page.waitForFunction(() => document.getElementById('findBar')?.checkVisibility());
let f = await findState();
assert.deepStrictEqual([f.count, f.focus], ['1 of 4', 'fbQ'], 'sending it puts up the find bar on the first match');
await page.click('#fbNext');
assert.strictEqual((await findState()).count, '2 of 4', 'Next steps on');
await page.click('#fbPrev');
assert.strictEqual((await findState()).count, '1 of 4', 'Previous steps back');
await page.click('#fbNext');
await page.click('#fbX');
f = await findState();
assert.ok(!f.shown, 'the close button takes the find bar down');
assert.strictEqual(f.selected.length, 1, 'and selects the match it was on');

await page.click('#mPill');
await page.fill('#mcInput', 'a draft');
await page.keyboard.press('Control+f');
await page.waitForTimeout(200);
f = await findState();
assert.ok(f.shown && f.focus === 'fbQ', 'with a draft in Myra’s box, Ctrl+F opens the find bar on its own');
assert.strictEqual(
  await page.evaluate(() => document.querySelector<HTMLTextAreaElement>('#mcInput')?.value),
  'a draft',
  'and the draft stays',
);
await page.keyboard.press('Escape');
assert.ok(!(await findState()).shown, 'Escape closes it');
await page.evaluate(() => {
  const box = document.querySelector<HTMLTextAreaElement>('#mcInput');
  if (box) box.value = '';
});

await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(600, 900));
await settle(page);
await page.evaluate(() => window.__fenmyr.selectOnly([]));
await page.keyboard.press('p');
await frames();
const strip = await page.evaluate(() => {
  const bar = document.getElementById('drawbar')?.getBoundingClientRect();
  return {
    phone: document.body.classList.contains('phone'),
    wide: (bar?.width ?? 0) >= innerWidth - 24,
    bottom: Math.round(innerHeight - (bar?.bottom ?? 0)),
    hub: !!document.getElementById('hub')?.checkVisibility(),
  };
});
assert.deepStrictEqual(
  strip,
  { phone: true, wide: true, bottom: 10, hub: false },
  'on a phone drawing is a strip at the bottom, in place of the hub',
);
await page.keyboard.press('Escape');
await frames();
assert.ok(await seen('#hub'), 'stopping brings the hub back');
await done('MODE BAR OK');
