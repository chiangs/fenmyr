// The buttons under Myra's replies: her next-step chips show in the chat and in her bubble, and a click sends the
// chip's words as your question and takes the row away.
import assert from 'node:assert';
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

assert.deepStrictEqual(l.errors, []);
await l.close();
console.log('CHAT BUTTONS OK');
