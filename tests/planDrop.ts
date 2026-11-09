// A waiting plan lives only while its board is open and its chat is there: opening another board, New chat, Clear all
// chats and a restart drop it. Nothing of it lands, and its message, where it is kept, reads Not done with no buttons.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { replyBoard } from './fixtures/boards.ts';
import { type Launched, launch, settle } from './support/launch.ts';

const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-drop-'));
let l: Launched = await launch({
  boards: [replyBoard('one', 'One'), replyBoard('two', 'Two')],
  open: 'one',
  claude: true,
  data,
});
let page = l.page;

const failed: string[] = [];
async function check(name: string, run: () => Promise<void>) {
  try {
    await run();
    console.log(`ok    ${name}`);
  } catch (e) {
    failed.push(name);
    console.log(`FAIL  ${name}: ${e instanceof Error ? e.message : e}`);
  }
}
const LEAD = 'Here’s my plan. Nothing changes until you say so.';
const chat = () => page.evaluate(() => document.getElementById('mPill')?.click());
const lists = () =>
  page.evaluate(() => {
    const b = window.__fenmyr.curBoard();
    return JSON.stringify({ cards: b.cards, links: b.links, tray: b.tray, trayLinks: b.trayLinks });
  });
const plan = () =>
  page.evaluate(lead => {
    const m = [...document.querySelectorAll('#mcList .mc-msg.myra')].findLast(d => d.firstChild?.textContent === lead);
    return (
      m && {
        head: m.querySelector('.m-summary b')?.textContent,
        acts: [...m.querySelectorAll('.m-acts button')].map(b => b.textContent),
      }
    );
  }, LEAD);
const waits = () => page.evaluate(() => window.__fenmyr.heldLists() !== null);
const eleven = async () => {
  await page.evaluate(() =>
    window.__fenmyr.answerMyra({
      say: 'Eleven.',
      add: Array.from({ length: 11 }, (_, i) => ({ type: 'note', text: `Idea ${i + 1}` })),
    }),
  );
  await settle(page, 600);
  assert.strictEqual((await plan())?.head, 'If you say yes', 'a plan waits');
};
async function open(id: string) {
  await page.evaluate(id => window.__fenmyr.openBoard(id), id);
  await settle(page, 600);
}

await chat();

await check(
  'opening another board drops the plan: back on its board it reads Not done, and nothing landed',
  async () => {
    const before = await lists();
    await eleven();
    await open('two');
    assert.strictEqual(await waits(), false, 'no plan waits');
    await open('one');
    await chat();
    assert.deepStrictEqual(await plan(), { head: 'Not done', acts: [] });
    assert.strictEqual(await lists(), before, 'the board is as it was');
    await page.evaluate(() => {
      Reflect.set(window, 'asked', 0);
      window.Fenmyr.ask = async () => {
        Reflect.set(window, 'asked', 1);
        return JSON.stringify({ say: 'Yes to what?' });
      };
    });
    await page.evaluate(() => window.__fenmyr.ask('yes'));
    assert.strictEqual(await page.evaluate(() => Reflect.get(window, 'asked')), 1, 'a yes now goes to her');
    assert.strictEqual(await lists(), before);
  },
);

await check('New chat drops the plan', async () => {
  await eleven();
  await page.click('#mcNew');
  assert.strictEqual(await waits(), false);
  assert.notStrictEqual(
    await page.evaluate(() => document.querySelector<HTMLTextAreaElement>('#mcInput')?.placeholder),
    'Tell Myra what to change…',
    'and her input reads as usual',
  );
});

await check('Clear all chats drops the plan', async () => {
  await eleven();
  await page.evaluate(() => document.getElementById('clearChats')?.click());
  await settle(page, 300);
  assert.strictEqual(await waits(), false);
});

await check('after a restart the plan reads Not done, with nothing landed', async () => {
  await eleven();
  const before = await lists();
  await page.waitForTimeout(800);
  await l.close();
  l = await launch({ open: 'one', claude: true, data });
  page = l.page;
  await chat();
  await settle(page, 300);
  assert.deepStrictEqual(await plan(), { head: 'Not done', acts: [] });
  assert.strictEqual(await lists(), before, 'the board is as it was');
});

await l.close();
fs.rmSync(data, { recursive: true, force: true });
if (failed.length) {
  console.log(`\n${failed.length} failed`);
  process.exit(1);
}
console.log('PLAN DROP OK');
