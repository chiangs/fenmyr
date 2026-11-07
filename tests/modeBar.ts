// Drawing and find in the real app. First what they did in the bottom bar: the pens, a stroke, a size, Done and
// Escape; Ctrl+F through Myra's box, stepping through matches, closing, and a draft in her box; drawing on a phone.
// Then that each sits 12 px above the bottom bar, which keeps its shape and its tools.
import assert from 'node:assert';
import { type Edges, near, openBar } from './support/bar.ts';
import { settle } from './support/launch.ts';

const { l, page, frames, view, select, shape, check, done } = await openBar();
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

const edges = () =>
  page.evaluate(() => {
    const box = (id: string) => {
      const el = document.getElementById(id);
      if (!el?.checkVisibility()) return null;
      const r = el.getBoundingClientRect();
      return { l: r.left, t: r.top, r: r.right, b: r.bottom };
    };
    return {
      dock: box('dock'),
      tools: !!document.getElementById('tools')?.checkVisibility(),
      inDock: !!document.querySelector('#dock #drawbar, #dock #findBar'),
      draw: box('drawbar'),
      find: box('findBar'),
      bar: box('selbar'),
    };
  });
const middle = (e: Edges | null) => (e ? (e.l + e.r) / 2 : NaN);
const openFind = async (q: string) => {
  await page.keyboard.press('Control+f');
  await page.keyboard.type(q);
  await page.keyboard.press('Enter');
  // it slides in, so it is measured once it is still
  await page.waitForFunction(() => {
    const bar = document.getElementById('findBar');
    return bar?.checkVisibility() && !bar.getAnimations().length;
  });
  await frames();
};
const stopAll = async () => {
  await page.evaluate(() => {
    document.getElementById('fbX')?.click();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  if (await seen('#drawbar')) await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await frames();
};
// the bottom bar as it is with no mode on; each mode must leave it so, and sit 12 px above it, in its middle
const sitsAbove = async (bar: 'draw' | 'find', width: number) => {
  const plain = await edges();
  return async () => {
    const s = await edges();
    assert.deepStrictEqual([s.dock, s.tools], [plain.dock, plain.tools], 'the bottom bar keeps its shape and tools');
    assert.ok(!s.inDock, 'the bar is not in the bottom bar');
    near(s[bar]?.b, (plain.dock?.t ?? NaN) - 12, `at ${width} px, its bottom`);
    near(middle(s[bar]), middle(plain.dock), `at ${width} px, its middle`);
  };
};
const setWidth = async (w: number) => {
  await l.app.evaluate(({ BrowserWindow }, w) => BrowserWindow.getAllWindows()[0]?.setSize(w, 900), w);
  await settle(page, 300);
};
const [width0] = await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getSize() ?? [0]);

await view(-3000, 0);
await check('drawing leaves the bottom bar as it is, and sits just above it', async () => {
  const then = await sitsAbove('draw', width0 ?? 0);
  await page.keyboard.press('p');
  await frames();
  await then();
});
await stopAll();
await check('while drawing the Draw button is lit, and picking another tool stops drawing', async () => {
  await page.keyboard.press('p');
  await frames();
  assert.ok(await seen('#tools [data-add="draw"].on'), 'the Draw button is lit');
  await page.evaluate(() => document.querySelector<HTMLElement>('#tools [data-add="note"]')?.click());
  await frames();
  assert.ok(!(await seen('#drawbar')), 'picking Note stops drawing');
});
await stopAll();
for (const width of [1100, width0 ?? 0]) {
  await setWidth(width);
  await check(`at ${width} px, find leaves the bottom bar as it is, and sits just above it`, async () => {
    const then = await sitsAbove('find', width);
    await openFind('a');
    await then();
  });
  await stopAll();
}
await check('drawing and find on together stack just above the bottom bar', async () => {
  const plain = await edges();
  await openFind('a');
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
  await page.keyboard.press('p');
  await frames();
  const { draw, find, dock } = await edges();
  assert.ok(draw && find, 'both are up');
  assert.deepStrictEqual(dock, plain.dock, 'the bottom bar keeps its shape');
  assert.ok(draw.b <= find.t || find.b <= draw.t, 'one above the other');
  near(Math.max(draw.b, find.b), (dock?.t ?? NaN) - 12, 'the lower one’s bottom');
});
await stopAll();
await check('Myra’s reply and her chat rise over the find bar', async () => {
  await openFind('a');
  const over = (id: string) =>
    page.evaluate(id => {
      const el = document.getElementById(id),
        find = document.getElementById('findBar')?.getBoundingClientRect();
      return el?.checkVisibility({ opacityProperty: true }) && find
        ? el.getBoundingClientRect().bottom - find.top
        : 'not up';
    }, id);
  await page.waitForTimeout(400); // it rises into place
  const reply = await over('mBubble');
  assert.ok(typeof reply === 'number' && reply <= -12, `her reply ends ${reply} px from the find bar’s top`);
  await page.click('#mPill');
  await page.waitForFunction(() => document.getElementById('myra')?.classList.contains('chat'));
  await page.waitForTimeout(400);
  const chat = await over('mChat');
  assert.ok(typeof chat === 'number' && chat <= -12, `her chat ends ${chat} px from the find bar’s top`);
});
await stopAll();
await check('a selection’s bar keeps above the find bar', async () => {
  await openFind('a');
  const { find } = await edges(),
    top = (await shape()).header + 22,
    bottom = (find?.t ?? NaN) - 30,
    z = (bottom - top) / 140;
  // too near the top for its bar above it, and low enough that a bar below it would cover the find bar
  await view(400, top, z);
  await select(['note']);
  const { bar } = await edges();
  assert.ok(bar && find && bar.b <= find.t - 11, `the bar ends at ${bar?.b}, over the find bar at ${find?.t}`);
});
await stopAll();
await select([]);

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
