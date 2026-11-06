// Every selection's bar from the keyboard: F10 reaches it, Tab moves through it, Space and Enter press its buttons,
// Escape leaves it with the selection kept, and an icon button keeps its name after a hover shows its tip.
import assert from 'node:assert';
import { openBar } from './support/bar.ts';

const { l, page, frames, view, select, selectWire, cardOf, focused, check, done } = await openBar();
const cdp = await l.app.context().newCDPSession(page);
await cdp.send('Accessibility.enable');
const selected = () => page.evaluate(() => window.__fenmyr.sel);
const press = async (...keys: string[]) => {
  for (const k of keys) {
    await page.keyboard.press(k);
    await frames();
  }
};
const tabTo = async (name: string) => {
  for (let i = 0; i < 30 && (await focused()) !== name; i++) await press('Tab');
  assert.strictEqual(await focused(), name, `Tab reaches ${name}`);
};

await check('F10 reaches a note’s bar; Space opens a dropdown and Escape steps back out', async () => {
  await view(500, 400);
  await select(['note']);
  await press('F10');
  assert.strictEqual(await focused(), 'bar:color', 'F10 lands on the first control, the colour');
  await press(' ');
  assert.ok(await page.evaluate(() => !!document.querySelector('#selbar .sb-popw.open')), 'Space opens the colours');
  await press('Escape');
  assert.ok(await page.evaluate(() => !document.querySelector('#selbar .sb-popw.open')), 'Escape closes them');
  assert.strictEqual(await focused(), 'bar:color', 'and focus is back on the button that opened them');
  await press('Escape');
  assert.ok(!(await focused())?.startsWith('bar:'), 'the next Escape leaves the bar');
  assert.deepStrictEqual(await selected(), ['note'], 'with the note still selected');
  await press('Escape');
  assert.deepStrictEqual(await selected(), [], 'and the one after clears the selection');
});

await check('F10 reaches a connector’s bar', async () => {
  await view(400, -300);
  await selectWire('h');
  await press('F10');
  assert.ok((await focused())?.startsWith('bar:'), 'focus is in the bar');
  await press('Escape', 'Escape');
});

await check('Space presses Bold on a note, and focus stays on Bold', async () => {
  await view(500, 400);
  await select(['note']);
  await press('F10');
  await tabTo('bar:bold');
  await press(' ');
  assert.strictEqual((await cardOf('note'))?.bold, true, 'the note is bold');
  assert.strictEqual(await focused(), 'bar:bold', 'focus is still on Bold');
  await press('Escape', 'Escape');
});

await check('an icon button keeps its name after a hover shows its tip', async () => {
  await view(500, 400);
  await select(['note']);
  await page.hover('#selbar [data-sb="del"]');
  await page.waitForTimeout(350);
  const { root } = await cdp.send('DOM.getDocument', { depth: 0 }),
    { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#selbar [data-sb="del"]' }),
    { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
  assert.strictEqual(nodes[0]?.name?.value, 'Delete');
  await page.mouse.move(700, 750);
});

await check('Enter on the crop bar’s Cancel cancels the crop', async () => {
  await view(-100, 300);
  await select(['pic']);
  const before = await cardOf('pic');
  await page.click('#selbar [data-sb="crop"]');
  await page.waitForSelector('#selbar [data-crop="cancel"]');
  await press('F10');
  assert.strictEqual(await focused(), 'bar:cancel', 'F10 lands on Cancel');
  await press('Enter');
  assert.deepStrictEqual(await cardOf('pic'), before, 'the picture is as it was');
});

await check('after a click on the bar, Space still pans the board', async () => {
  await view(500, 400);
  await select(['note']);
  await page.click('#selbar [data-pop="color"]');
  await page.click('#selbar [data-pop="color"]');
  await page.keyboard.down('Space');
  await page.mouse.move(800, 700);
  await page.mouse.down();
  await page.mouse.move(740, 660, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Space');
  const v = await page.evaluate(() => window.__fenmyr.view);
  assert.deepStrictEqual([v.x, v.y], [440, 360], 'the board moved with the pointer');
});
await done('BAR KEYBOARD OK');
