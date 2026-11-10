// A waiting plan's steps say exactly what pressing Do it would do. A card the person only clicked into, with nothing
// typed, takes her change, since pressing Do it ends the edit first, so no step says she will leave it. Once they type
// into a card she would change, the step says so in place: in the open chat, which neither scrolls nor plays any
// message's entrance again, and in her bubble while the chat is closed.
import assert from 'node:assert';
import type { MyraReply } from '../src/shared/myraReply.ts';
import { replyBoard } from './fixtures/boards.ts';
import { launch, settle } from './support/launch.ts';

const BOARDS = ['clicked', 'scrolled', 'bubble'];
const l = await launch({ boards: BOARDS.map(id => replyBoard(id, id)), open: 'clicked', claude: true });
const { page } = l;

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
async function open(id: string, chat: boolean) {
  await page.waitForTimeout(500);
  await page.evaluate(id => window.__fenmyr.openBoard(id), id);
  await settle(page, 300);
  if ((await page.locator('#mcInput').isVisible()) !== chat)
    await page.evaluate(chat => document.getElementById(chat ? 'mPill' : 'mcClose')?.click(), chat);
  await settle(page, 400);
}
async function planned(reply: MyraReply) {
  await page.evaluate(r => window.__fenmyr.answerMyra(r, 'q'), reply);
  await settle(page, 800);
  assert(await page.evaluate(() => window.__fenmyr.heldLists() !== null), 'it waits as a plan');
}
const steps = (host: string) => page.locator(`${host} .m-summary.plan.waiting li`).allTextContents();
const text = (id: string) =>
  page.evaluate(id => {
    const c = window.__fenmyr.curBoard().cards.find(x => x.id === id);
    return c?.type === 'note' ? c.text : null;
  }, id);
async function into(id: string) {
  const b = await page.locator(`#cards .card[data-id="${id}"]`).boundingBox();
  assert(b, `${id} is on screen`);
  await page.mouse.dblclick(b.x + 40, b.y + 40);
  assert.strictEqual(await page.evaluate(() => window.__fenmyr.editing), id, `they are in ${id}`);
}
const PLAN = {
  say: 'Ten ideas, and sharper words for the second note.',
  add: Array.from({ length: 10 }, (_, i) => ({ type: 'note', text: `Idea ${i + 1}` })),
  edit: [{ id: 'n2', text: 'Her second' }],
};
const STEPS = ['+ 10 notes', '✎ 1 note reworded'];
const LEFT = ['+ 10 notes', '✎ 1 note reworded · changed since, so I’ll leave it'];

await check('a card they only clicked into still takes her change, and no step says otherwise', async () => {
  await open('clicked', true);
  await planned(PLAN);
  await into('n2');
  await settle(page, 300);
  assert.deepStrictEqual(await steps('#mcList'), STEPS, 'the steps are as she planned');
  assert.strictEqual(await page.locator('#planPreview [data-pp="n2"]').count(), 1, 'n2 keeps its box');
  const doIt = await page
    .locator('#mcList .m-acts button')
    .filter({ hasText: /^Do it$/ })
    .last()
    .boundingBox();
  assert(doIt, 'Do it shows');
  await page.mouse.click(doIt.x + doIt.width / 2, doIt.y + doIt.height / 2);
  await settle(page, 1200);
  assert.strictEqual(await text('n2'), 'Her second', 'pressing Do it puts her words into it');
});

await check('typing into a card rewords the step in place, and the chat neither scrolls nor replays', async () => {
  await open('scrolled', true);
  for (let i = 0; i < 6; i++)
    await page.evaluate(
      i => window.__fenmyr.answerMyra({ say: `A longer answer, number ${i}, so the chat fills up and scrolls.` }, 'q'),
      i,
    );
  await planned(PLAN);
  const scrolled = await page.evaluate(() => {
    const list = document.getElementById('mcList');
    if (!list) return null;
    list.scrollTop = 0;
    for (const m of list.querySelectorAll('.mc-msg')) Reflect.set(m, 'kept', true);
    return { room: list.scrollHeight > list.clientHeight + 100, top: list.scrollTop };
  });
  assert.deepStrictEqual(scrolled, { room: true, top: 0 }, 'the chat is scrolled to its top');
  await into('n2');
  await page.keyboard.type(' and mine');
  await settle(page, 300);
  assert.deepStrictEqual(await steps('#mcList'), LEFT, 'the step says she will leave it');
  const after = await page.evaluate(() => {
    const list = document.getElementById('mcList'),
      msgs = [...(list?.querySelectorAll('.mc-msg') ?? [])];
    return {
      top: list?.scrollTop,
      redrawn: msgs.filter(m => !Reflect.get(m, 'kept')).length,
      playing: msgs.filter(m => m.getAnimations().some(a => a.playState === 'running')).length,
    };
  });
  assert.deepStrictEqual(after, { top: 0, redrawn: 0, playing: 0 }, 'nothing scrolls, is drawn again or replays');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
});

await check('with the chat closed, her bubble’s step says it too', async () => {
  await open('bubble', false);
  await planned(PLAN);
  assert.deepStrictEqual(await steps('#mActs'), STEPS, 'her bubble shows the plan');
  await into('n2');
  await page.keyboard.type(' and mine');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await settle(page, 300);
  assert.deepStrictEqual(await steps('#mActs'), LEFT);
});

const errors = [...l.errors];
await l.close();
assert.deepStrictEqual(errors, [], 'no page errors');
if (failed.length) {
  console.log(`\n${failed.length} failed`);
  process.exit(1);
}
console.log('PLAN STEPS OK');
