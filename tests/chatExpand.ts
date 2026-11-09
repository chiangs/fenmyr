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
  chats: [{ id: 'old', title: 'hi', t: 1, msgs: [{ who: 'me', text: 'hi', t: 1 }] }],
  view: { x: 0, y: 0, z: 1 },
}));
const l = await launch({ boards, open: 'one', settings: { chatKeep: 'board' } });
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
const active = () => page.evaluate(() => document.activeElement?.id ?? '');
const curBoard = () => page.evaluate(() => window.__fenmyr.curBoard()?.id ?? '');
const lastSent = () => page.evaluate(() => [...document.querySelectorAll('.mc-msg.me')].pop()?.textContent ?? null);

const failed: string[] = [];
const check = async (name: string, run: () => Promise<void>) => {
  try {
    await run();
  } catch (e) {
    failed.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
  }
  await open();
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
  assert.strictEqual(
    await page.getAttribute('#mcExpand', 'aria-label'),
    'Expand to write',
    'the label does not change',
  );
  assert.strictEqual(await page.getAttribute('#mcExpand', 'title'), 'Shrink (Esc)', 'the tip says what a press does');
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
  assert.strictEqual(await page.getAttribute('#mcExpand', 'aria-label'), 'Expand to write');
  assert.strictEqual(await page.getAttribute('#mcExpand', 'title'), 'Expand to write');
  assert.deepStrictEqual(await caret(), before, 'draft, selection and focus are the same after Shrink');
  assert.ok(await visible('#mcList'), 'the messages are back');
  await page.keyboard.press('Control+z');
  assert.notStrictEqual((await caret())?.value, draft, 'native undo outlived the toggles');
});

await check('a keyboard toggle keeps focus on the button and the caret in the text', async () => {
  await open();
  await page.fill('#mcInput', draft);
  await select(3, 7, 'forward');
  await page.focus('#mcExpand');
  await page.keyboard.press('Enter');
  await frames();
  assert.ok(await writing());
  assert.strictEqual(await active(), 'mcExpand', 'focus stays on the button');
  let c = await caret();
  assert.deepStrictEqual([c?.value, c?.start, c?.end, c?.dir], [draft, 3, 7, 'forward']);
  await page.keyboard.press('Space');
  await frames();
  assert.ok(!(await writing()));
  assert.strictEqual(await active(), 'mcExpand', 'focus stays on the button after Shrink');
  c = await caret();
  assert.deepStrictEqual([c?.value, c?.start, c?.end], [draft, 3, 7]);
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
  assert.strictEqual(await active(), 'mcInput', 'focus is in the text');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  assert.ok(!(await isOpen()), 'the second Esc closes');
  assert.strictEqual(await page.textContent('#mDraft'), 'Draft · 3 lines');
  await open();
  assert.strictEqual((await caret())?.value, draft, 'the draft is still there');
});

await check('Esc from the button shrinks and puts focus in the text', async () => {
  await open();
  await page.fill('#mcInput', draft);
  await select(5, 5, 'none');
  await page.focus('#mcExpand');
  await page.keyboard.press('Enter');
  await frames();
  assert.ok(await writing());
  await page.keyboard.press('Escape');
  await frames();
  assert.ok(!(await writing()), 'Esc shrinks');
  assert.ok(await isOpen(), 'and the chat stays');
  const c = await caret();
  assert.deepStrictEqual([c?.focus, c?.start, c?.end], [true, 5, 5]);
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

await check('New chat shows the fresh chat instead of staying in Expand', async () => {
  await open();
  await page.click('#mcExpand');
  assert.ok(!(await visible('#mcList')), 'the list is hidden in Expand');
  await page.click('#mcNew');
  await frames();
  assert.ok(!(await writing()), 'New chat shrinks');
  assert.ok(await visible('#mcList'), 'so the fresh chat can be seen');
});

await check('Earlier chats shows the list instead of staying in Expand', async () => {
  await open();
  assert.ok(await visible('#mcHist'), 'the board has earlier chats');
  await page.click('#mcExpand');
  await page.click('#mcHist');
  await frames();
  assert.ok(!(await writing()), 'Earlier chats shrinks');
  assert.ok(await visible('#mcList'), 'so the list of chats can be seen');
  assert.ok(await page.evaluate(() => document.getElementById('mcHist')?.classList.contains('on')), 'and it is open');
  await page.click('#mcHist');
});

await check('switching boards ends Expand', async () => {
  await open();
  const here = await curBoard();
  const other = here === 'one' ? 'two' : 'one';
  await page.click('#mcExpand');
  assert.ok(await writing());
  await page.evaluate(id => window.__fenmyr.openBoard(id), other);
  await frames();
  assert.strictEqual(await curBoard(), other, 'the board changed');
  assert.ok(!(await writing()), 'not in Expand on the next board');
});

await check('the Send button ends Expand', async () => {
  await open();
  await page.fill('#mcInput', draft);
  await page.click('#mcExpand');
  await page.click('.mc-send');
  await frames();
  assert.ok(!(await writing()));
  assert.strictEqual(await lastSent(), draft);
});

const errors = [...l.errors];
await l.close();
for (const f of failed) console.log(`FAILED ${f}`);
assert.deepStrictEqual(failed, [], 'every check passes');
assert.deepStrictEqual(errors, []);
console.log('CHAT EXPAND OK');
