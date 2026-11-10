// A waiting plan's steps say exactly what pressing Do it would do. A card the person only clicked into, with nothing
// typed, takes her change, since pressing Do it ends the edit first, so no step says she will leave it.
import assert from 'node:assert';
import type { MyraReply } from '../src/shared/myraReply.ts';
import { replyBoard } from './fixtures/boards.ts';
import { launch, settle } from './support/launch.ts';

const BOARDS = ['clicked'];
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

const errors = [...l.errors];
await l.close();
assert.deepStrictEqual(errors, [], 'no page errors');
if (failed.length) {
  console.log(`\n${failed.length} failed`);
  process.exit(1);
}
console.log('PLAN STEPS OK');
