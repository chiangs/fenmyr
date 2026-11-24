// Myra's model and effort each either Default or chosen, in the real app, through a stand-in Claude Code that records its
// arguments. A part left at Default sends no flag for itself, so Claude Code keeps its own setting for it; the Default
// rows set each part back, key 0 picks the Default model, and Default for both leaves no setting and no flags.
import assert from 'node:assert';
import { replyBoard } from './fixtures/boards.ts';
import { launch } from './support/launch.ts';
import { check, FOLLOWS, modelKit, NO_FLAGS } from './support/modelKit.ts';
import { still } from './support/settled.ts';

const l = await launch({
  boards: [replyBoard('default', 'Default')],
  open: 'default',
  claude: true,
  settings: { chatKeep: 'board' },
});
const { page } = l;
const { pillText, attr, count, saved, ask, openMenu, pickModel, pickEffort, press } = modelKit(l);

const ticked = () => page.locator('#mcModelMenu [aria-checked="true"] .mm-name').allTextContents();
const tip = () => attr('#mcModel', 'title');

await page.click('#mPill');
await page.waitForFunction(() => !!document.getElementById('myra')?.classList.contains('chat'));
await still(page);

await check('an effort alone sends --effort and no --model, and the pill says Default for the model', async () => {
  await pickEffort('High');
  assert.strictEqual(await pillText(), 'Default High');
  assert.strictEqual(await tip(), `Default High\n${FOLLOWS}`);
  assert.deepStrictEqual(await saved(), { provider: 'claude-code', effort: 'high' }, 'saved with no model in it');
  assert.deepStrictEqual(await ask('one'), { model: undefined, effort: 'high' });
  await openMenu();
  assert.deepStrictEqual(await ticked(), ['Default'], 'the Default model is the one ticked');
  assert.strictEqual(await page.locator('#mcModelMenu .mm-val').textContent(), 'High');
  await press('Escape');
});

await check('a model then leaves the effort as it is, and both are sent', async () => {
  await pickModel('Sonnet 5.5');
  assert.strictEqual(await pillText(), 'Sonnet 5.5 High');
  assert.strictEqual(await tip(), 'Sonnet 5.5 High', 'with neither part Default, the tip is the pill’s words');
  assert.deepStrictEqual(await ask('two'), { model: 'claude-sonnet-5-5', effort: 'high' });
});

await check('the Default model row sets the model back and keeps the effort', async () => {
  await pickModel('Default');
  assert.strictEqual(await pillText(), 'Default High');
  assert.deepStrictEqual(await saved(), { provider: 'claude-code', effort: 'high' });
  assert.deepStrictEqual(await ask('three'), { model: undefined, effort: 'high' });
});

await check('the Default effort row sets the effort back and keeps the model', async () => {
  await pickModel('Fable 5.2');
  await pickEffort('Default');
  assert.strictEqual(await pillText(), 'Fable 5.2');
  assert.strictEqual(await tip(), `Fable 5.2\n${FOLLOWS}`);
  assert.deepStrictEqual(
    await saved(),
    { provider: 'claude-code', id: 'claude-fable-5-2' },
    'saved with no effort in it',
  );
  assert.deepStrictEqual(await ask('four'), { model: 'claude-fable-5-2', effort: undefined });
});

await check('key 0 picks the Default model, and Default for both leaves no setting and no flags', async () => {
  await openMenu();
  assert.deepStrictEqual(await ticked(), ['Fable 5.2']);
  await press('0');
  assert.strictEqual(await count('#mcModelMenu'), 0, 'the key closes the menu');
  assert.strictEqual(await pillText(), 'Default');
  assert.strictEqual(await tip(), `Default\n${FOLLOWS}`);
  assert.strictEqual(await saved(), null, 'no setting is kept');
  assert.deepStrictEqual(await ask('five'), NO_FLAGS, 'neither --model nor --effort');
  await openMenu();
  assert.deepStrictEqual(await ticked(), ['Default']);
  assert.strictEqual(await page.locator('#mcModelMenu .mm-val').textContent(), 'Default');
  await press('Escape');
});

await check('both rows set to Default, one after the other, remove the setting', async () => {
  await pickEffort('Max');
  await pickModel('Haiku 5.5');
  assert.strictEqual(await pillText(), 'Haiku 5.5 Max');
  await pickModel('Default');
  assert.strictEqual(await pillText(), 'Default Max');
  await pickEffort('Default');
  assert.strictEqual(await pillText(), 'Default');
  assert.strictEqual(await saved(), null);
  assert.deepStrictEqual(await ask('six'), NO_FLAGS);
});

await check('an effort alone is saved, and read back after a reload', async () => {
  await pickEffort('Low');
  const settings = await page.evaluate(() => localStorage.getItem('fenmyr:settings'));
  assert(settings, 'the settings were saved');
  // the launch's own script resets the settings at every load, so a later one puts the saved ones back
  await l.app.context().addInitScript(s => {
    try {
      localStorage.setItem('fenmyr:settings', s);
    } catch {}
  }, settings);
  await page.reload();
  await page.waitForFunction(() => window.__fenmyr?.curBoard() && document.querySelector('#cards .card'));
  await page.evaluate(() => window.Fenmyr.models());
  await page.click('#mPill');
  await page.waitForFunction(() => !!document.getElementById('myra')?.classList.contains('chat'));
  await still(page);
  assert.strictEqual(await pillText(), 'Default Low');
  assert.deepStrictEqual(await ask('seven'), { model: undefined, effort: 'low' });
});

assert.deepStrictEqual(l.errors, [], 'no page errors');
await l.close();
console.log('MODEL DEFAULT OK');
