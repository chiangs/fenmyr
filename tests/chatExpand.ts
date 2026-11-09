// Expand in Myra's chat in the real app: Expand turns the one input into a writing area in the same frame and Shrink
// puts it back, both keeping the draft, the caret and native undo; Esc shrinks before it closes, with the slash menu
// taking the first Esc; Ctrl+Enter sends from either size; a send, a close and a board switch end Expand.
import assert from 'node:assert';
import { launch } from './support/launch.ts';

const card = (id: string) => ({ id, type: 'note', x: 0, y: 0, w: 220, h: 140, r: 0, color: 'butter', text: id });
const boards = ['one', 'two'].map(id => ({
  id,
  name: id,
  cards: [card(id)],
  links: [],
  tray: [],
  view: { x: 0, y: 0, z: 1 },
}));
const l = await launch({ boards, open: 'one' });
const { page } = l;
const frames = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const isOpen = () => page.evaluate(() => !!document.getElementById('myra')?.classList.contains('chat'));
const open = async () => {
  if (!(await isOpen())) await page.click('#mPill');
  await page.waitForTimeout(400);
};
const writing = () => page.evaluate(() => !!document.getElementById('mChat')?.classList.contains('writing'));
const caret = () =>
  page.evaluate(() => {
    const box = document.getElementById('mcInput');
    if (!(box instanceof HTMLTextAreaElement)) return null;
    return {
      value: box.value,
      start: box.selectionStart,
      end: box.selectionEnd,
      dir: box.selectionDirection,
      focus: document.activeElement === box,
    };
  });
const sizes = () =>
  page.evaluate(() => {
    const h = (id: string) => document.getElementById(id)?.getBoundingClientRect().height ?? 0;
    return { input: h('mcInput'), chat: h('mChat') };
  });
const visible = (sel: string) => page.evaluate(sel => !!document.querySelector(sel)?.checkVisibility(), sel);
const select = (start: number, end: number, dir: 'forward' | 'backward' | 'none') =>
  page.evaluate(
    a => {
      const box = document.getElementById('mcInput');
      if (box instanceof HTMLTextAreaElement) box.setSelectionRange(a.start, a.end, a.dir);
    },
    { start, end, dir },
  );
const lastSent = () => page.evaluate(() => [...document.querySelectorAll('.mc-msg.me')].pop()?.textContent ?? null);

const failed: string[] = [];
const check = async (name: string, run: () => Promise<void>) => {
  try {
    await run();
  } catch (e) {
    failed.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (await writing()) await page.click('#mcExpand').catch(() => undefined);
  await page.fill('#mcInput', '');
};

const draft = 'first line\nsecond line\nthird line';

await check('Expand and Shrink keep the draft and caret', async () => {
  await open();
  await page.focus('#mcInput');
  await page.keyboard.type('first line');
  await page.keyboard.press('Enter');
  await page.keyboard.type('second line');
  await page.keyboard.press('Enter');
  await page.keyboard.type('third line');
  await select(6, 10, 'backward');
  const before = await caret();
  const small = await sizes();
  await page.click('#mcExpand');
  await frames();
  assert.ok(await writing(), 'the chat is in Expand');
  assert.strictEqual(await page.getAttribute('#mcExpand', 'aria-pressed'), 'true');
  assert.deepStrictEqual(await caret(), before, 'draft, selection and focus are the same in Expand');
  const big = await sizes();
  assert.ok(big.input > small.input * 2, `the input grew from ${small.input} to ${big.input}`);
  assert.strictEqual(big.chat, small.chat, 'the frame does not grow');
  assert.ok(!(await visible('#mcList')), 'the messages step aside');
  assert.ok(await visible('.mc-head'), 'the header stays');
  assert.ok(await visible('#mcSees'), 'the Myra sees strip stays');
  await page.click('#mcExpand');
  await frames();
  assert.ok(!(await writing()), 'Shrink returns');
  assert.strictEqual(await page.getAttribute('#mcExpand', 'aria-pressed'), 'false');
  assert.deepStrictEqual(await caret(), before, 'draft, selection and focus are the same after Shrink');
  assert.ok(await visible('#mcList'), 'the messages are back');
  await page.keyboard.press('Control+z');
  assert.notStrictEqual((await caret())?.value, draft, 'native undo outlived the toggles');
});

await check('a keyboard toggle keeps the caret too', async () => {
  await open();
  await page.fill('#mcInput', draft);
  await select(3, 3, 'none');
  await page.focus('#mcExpand');
  await page.keyboard.press('Enter');
  await frames();
  assert.ok(await writing());
  const c = await caret();
  assert.deepStrictEqual([c?.value, c?.start, c?.end, c?.focus], [draft, 3, 3, true]);
});

await check('Esc shrinks first, then closes, and keeps the draft', async () => {
  await open();
  await page.fill('#mcInput', draft);
  await page.click('#mcExpand');
  await page.keyboard.press('Escape');
  await frames();
  assert.ok(!(await writing()), 'the first Esc shrinks');
  assert.ok(await isOpen(), 'the chat is still open');
  assert.strictEqual((await caret())?.value, draft);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  assert.ok(!(await isOpen()), 'the second Esc closes');
  assert.strictEqual(await page.textContent('#mDraft'), 'Draft · 3 lines');
  await open();
  assert.strictEqual((await caret())?.value, draft, 'the draft is still there');
});

await check('the slash menu takes the first Esc', async () => {
  await open();
  await page.fill('#mcInput', '');
  await page.click('#mcExpand');
  await page.keyboard.type('/');
  await frames();
  assert.ok(await visible('.slash-menu'), 'the menu opens in Expand');
  await page.keyboard.press('Escape');
  await frames();
  assert.ok(!(await visible('.slash-menu')), 'the first Esc closes the menu');
  assert.ok(await writing(), 'and Expand stays');
  assert.ok(await isOpen(), 'and the chat stays');
});

for (const mode of ['small', 'expanded'] as const)
  await check(`Ctrl+Enter sends from the ${mode} input, and Expand ends`, async () => {
    await open();
    await page.fill('#mcInput', draft);
    if (mode === 'expanded') await page.click('#mcExpand');
    await page.focus('#mcInput');
    await page.keyboard.press('Control+Enter');
    await frames();
    assert.strictEqual((await caret())?.value, '', 'the input is empty');
    assert.strictEqual(await lastSent(), draft, 'the message is the draft');
    assert.ok(!(await writing()), 'the chat is no longer in Expand');
    assert.ok(await visible('#mcList'), 'the sent line can be seen');
  });

await check('closing the chat ends Expand', async () => {
  await open();
  await page.fill('#mcInput', draft);
  await page.click('#mcExpand');
  await page.click('#mcClose');
  await page.waitForTimeout(400);
  assert.ok(!(await isOpen()));
  assert.ok(!(await writing()), 'not in Expand');
  await open();
  assert.ok(!(await writing()), 'reopened in the usual size');
  assert.strictEqual((await caret())?.value, draft, 'with the draft');
});

await check('switching boards ends Expand', async () => {
  await open();
  await page.click('#mcExpand');
  await page.evaluate(() => window.__fenmyr.openBoard('two'));
  await frames();
  assert.ok(!(await writing()), 'not in Expand on the next board');
});

const errors = [...l.errors];
await l.close();
for (const f of failed) console.log(`FAILED ${f}`);
assert.deepStrictEqual(failed, [], 'every check passes');
assert.deepStrictEqual(errors, []);
console.log('CHAT EXPAND OK');
