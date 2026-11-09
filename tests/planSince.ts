// Do it on a plan the person worked around while it waited, and what she says about it: a card she meant to move that
// they moved since stays where they put it and she names it.
import assert from 'node:assert';
import { replyBoard } from './fixtures/boards.ts';
import { launch, settle } from './support/launch.ts';

const BOARDS = ['moved'];
const l = await launch({ boards: BOARDS.map(id => replyBoard(id, id)), open: 'moved', claude: true });
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
// her reply, held as a plan: asked the real way, with Claude's answer counted
async function planned(reply: object) {
  await page.evaluate(async r => {
    Reflect.set(window, 'asked', 0);
    window.Fenmyr.ask = async () => {
      Reflect.set(window, 'asked', Number(Reflect.get(window, 'asked')) + 1);
      return JSON.stringify(r);
    };
    await window.__fenmyr.ask('q');
  }, reply);
  await settle(page, 400);
  assert.strictEqual(await page.locator('#mcList .m-summary.plan.waiting').count(), 1, 'it waits as a plan');
}
const chat = () => page.evaluate(() => document.getElementById('mPill')?.click());
async function doIt() {
  await page.click('#mcList .m-acts button:text-is("Do it")');
  await settle(page, 800);
  assert.strictEqual(await page.evaluate(() => Number(Reflect.get(window, 'asked'))), 1, 'Do it asks Claude nothing');
}
const said = () =>
  page.evaluate(() => [...document.querySelectorAll('#mcList .mc-msg.myra')].at(-1)?.firstChild?.textContent);
const place = (id: string) =>
  page.evaluate(id => {
    const c = window.__fenmyr.curBoard().cards.find(x => x.id === id);
    return c && [c.x, c.y];
  }, id);
async function drag(id: string, dx: number, dy: number) {
  await page.keyboard.press('Escape');
  const box = await page.locator(`#cards .card[data-id="${id}"]`).boundingBox();
  assert(box, `${id} is on screen`);
  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 40 + dx, box.y + 40 + dy, { steps: 8 });
  await page.mouse.up();
  await settle(page, 400);
}
const notes = (n: number) => Array.from({ length: n }, (_, i) => ({ type: 'note', text: `Idea ${i + 1}` }));

await check('a card she meant to move that they moved since stays where they put it, and she says so', async () => {
  await chat();
  await planned({
    say: 'Ten ideas, and I moved the first note.',
    add: notes(10),
    move: [{ id: 'n1', x: 1500, y: 900 }],
  });
  await drag('n1', 120, 80);
  const theirs = await place('n1');
  assert.notDeepStrictEqual(theirs, [0, 500], 'they moved it');
  await chat();
  await doIt();
  assert.deepStrictEqual(await place('n1'), theirs, 'it stays where they put it');
  assert.strictEqual(
    await said(),
    'Ten ideas, and I moved the first note. I left “First note” as you have it, since it changed after my plan.',
  );
});

await l.close();
if (failed.length) {
  console.log(`\n${failed.length} failed`);
  process.exit(1);
}
console.log('PLAN SINCE OK');
