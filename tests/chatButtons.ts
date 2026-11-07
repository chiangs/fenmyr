// The buttons under Myra's replies: her next-step chips show in the chat and in her bubble, a click sends the chip's
// words as your question and takes the row away, and the stored kinds come back when the chat or the board opens
// again while one-off buttons don't.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { replyBoard } from './fixtures/boards.ts';
import { launch, settle } from './support/launch.ts';

const l = await launch({ boards: [replyBoard('one', 'One'), replyBoard('two', 'Two')], open: 'one', claude: true });
const { page } = l;

const rows = (p: Page) =>
  p.evaluate(() =>
    [...document.querySelectorAll('#mcList .mc-msg:not(.typing)')].map(d => ({
      text: d.firstChild?.textContent ?? '',
      acts: [...d.querySelectorAll('.m-acts button')].map(b => `${b.className}:${b.textContent}`),
    })),
  );
const actsOf = async (p: Page, text: string) => (await rows(p)).find(r => r.text === text)?.acts;
const chat = (open: boolean) =>
  page.evaluate(open => document.getElementById(open ? 'mPill' : 'mcClose')?.click(), open);

async function check(name: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (e) {
    console.error(`FAIL ${name}`);
    throw e;
  }
}

await page.evaluate(() => {
  const sent: string[] = [];
  Reflect.set(window, 'sent', sent);
  window.Fenmyr.ask = async (prompt: string) => {
    sent.push(prompt);
    return JSON.stringify({ say: 'Sure.' });
  };
});
const sent = () => page.evaluate(() => [...(Reflect.get(window, 'sent') ?? [])].map(String));

await check('next steps show as chips in the chat, and a click asks them and takes the row away', async () => {
  await chat(true);
  await page.evaluate(() =>
    window.__fenmyr.applyMyra({ say: 'Here you go.', next: ['Make it a list', 'Add a due date'] }, 'q'),
  );
  assert.deepStrictEqual(await actsOf(page, 'Here you go.'), ['next:Make it a list', 'next:Add a due date']);
  await page.locator('#mcList .m-acts button', { hasText: 'Make it a list' }).click();
  await settle(page, 300);
  assert.deepStrictEqual(await actsOf(page, 'Here you go.'), [], 'the row goes once one is clicked');
  assert.ok(
    (await rows(page)).some(r => r.text === 'Make it a list'),
    'the chip’s words are sent as yours',
  );
  assert.ok(
    (await sent()).some(s => s.startsWith('Make it a list')),
    'and asked',
  );
});

await check('with the chat closed they show in her bubble and are kept in the chat', async () => {
  await chat(false);
  await page.evaluate(() => window.__fenmyr.applyMyra({ say: 'In the bubble.', next: ['Sort them'] }, 'q'));
  assert.deepStrictEqual(
    await page.evaluate(() => [...document.querySelectorAll('#mActs button')].map(b => b.textContent)),
    ['Sort them'],
  );
  await page.locator('#mActs button', { hasText: 'Sort them' }).click();
  await settle(page, 300);
  assert.ok(
    (await sent()).some(s => s.startsWith('Sort them')),
    'a click in the bubble asks too',
  );
});

const reopenChat = async () => {
  await chat(false);
  await chat(true);
  await settle(page, 300);
};
const reopenBoard = async () => {
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__fenmyr.openBoard('two'));
  await settle(page, 300);
  await page.evaluate(() => window.__fenmyr.openBoard('one'));
  await settle(page, 300);
};

await check('a click in her bubble takes the chips away from the chat too', async () => {
  await reopenChat();
  assert.deepStrictEqual(await actsOf(page, 'In the bubble.'), []);
});

await check('closing and opening the chat keeps her next steps, and a used row stays gone', async () => {
  await page.evaluate(() => window.__fenmyr.applyMyra({ say: 'Two ideas.', next: ['Group them', 'Find more'] }, 'q'));
  await reopenChat();
  assert.deepStrictEqual(await actsOf(page, 'Two ideas.'), ['next:Group them', 'next:Find more']);
  await page.locator('#mcList .m-acts button', { hasText: 'Group them' }).click();
  await settle(page, 300);
  await reopenChat();
  assert.deepStrictEqual(await actsOf(page, 'Two ideas.'), [], 'the used row stays gone');
  assert.deepStrictEqual(await actsOf(page, 'Here you go.'), [], 'and so does the first');
});

await check('opening the board again keeps them, and they are saved in its file', async () => {
  await page.evaluate(() => window.__fenmyr.applyMyra({ say: 'Kept.', next: ['Tidy up'] }, 'q'));
  await reopenBoard();
  assert.deepStrictEqual(await actsOf(page, 'Kept.'), ['next:Tidy up']);
  const file = JSON.parse(fs.readFileSync(path.join(l.data, 'fenmyr', 'boards', 'one.json'), 'utf8'));
  assert.deepStrictEqual(
    file.chat.find((m: { text: string }) => m.text === 'Kept.').acts.filter((a: { kind: string }) => a.kind === 'next'),
    [{ kind: 'next', text: 'Tidy up' }],
  );
});

await check('one-off buttons go when the chat opens again, as before', async () => {
  await page.evaluate(() => window.__fenmyr.applyMyra({ say: 'Shall I?', confirm: 'Yes, do it' }, 'q'));
  assert.deepStrictEqual(await actsOf(page, 'Shall I?'), [':Yes, do it ✦', 'ghost:Not now']);
  await reopenChat();
  assert.deepStrictEqual(await actsOf(page, 'Shall I?'), []);
});

assert.deepStrictEqual(l.errors, []);
await l.close();
console.log('CHAT BUTTONS OK');
