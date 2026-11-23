// Just the board (Ctrl+\) keeps the selection bar: with every panel tucked away, a selected card can still be changed
// from its bar, for one card or several of any kind, and the bar goes as usual when nothing is selected.
import assert from 'node:assert';
import { openBar } from './support/bar.ts';
import { still } from './support/settled.ts';

const { page, view, select, barUp, cardOf, shape, check, done } = await openBar();

const clean = () => page.evaluate(() => document.body.classList.contains('clean'));
const toggle = async (on: boolean) => {
  await page.keyboard.press('Control+Backslash');
  await page.waitForFunction(on => document.body.classList.contains('clean') === on, on);
  // the panels fade out around the class change, so read them once nothing is moving
  await still(page);
};
const panelsHidden = () =>
  page.evaluate(() =>
    ['side', 'tools', 'tray', 'keys'].every(id => {
      const el = document.getElementById(id);
      return !el?.checkVisibility({ opacityProperty: true, visibilityProperty: true });
    }),
  );

await view(500, 350);

await check('a selected note keeps its bar with every panel hidden', async () => {
  await select(['note']);
  await barUp();
  await toggle(true);
  assert.ok(await clean(), 'just the board is on');
  assert.ok(await panelsHidden(), 'the panels are tucked away');
  await barUp();
  const s = await shape('note');
  assert.ok(s.shown, 'the bar shows');
  assert.ok(s.bar && s.bar.t >= 0 && s.bar.l >= 0, 'on screen');
});

await check('the bar can be used there', async () => {
  const hit = await page.evaluate(() => {
    const b = document.querySelector('#selbar [data-ts="bold"]')?.getBoundingClientRect();
    if (!b) return 'no Bold button';
    return document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)?.closest('#selbar')
      ? 'bar'
      : 'covered';
  });
  assert.equal(hit, 'bar', 'nothing covers it and it takes clicks');
  await page.click('#selbar [data-ts="bold"]');
  assert.equal((await cardOf('note'))?.bold, true, 'Bold changes the note');
  assert.ok(await clean(), 'and the panels stay away');
});

await check('any selection keeps its bar', async () => {
  await select(['pic']);
  await barUp();
  assert.ok((await shape('pic')).shown, 'a picture');
  await select(['ha', 'hb']);
  await barUp();
  assert.ok((await shape('ha')).shown, 'two notes');
});

await check('no selection, no bar', async () => {
  await select([]);
  await still(page);
  assert.ok(!(await shape()).shown, 'the bar goes');
  assert.ok(await clean(), 'and just the board stays on');
});

await check('the bar is still there after the panels come back', async () => {
  await select(['note']);
  await barUp();
  await toggle(false);
  await barUp();
  assert.ok((await shape('note')).shown, 'the bar shows');
  assert.ok(!(await panelsHidden()), 'with the panels back');
});

await done('ok: just the board keeps the selection bar');
