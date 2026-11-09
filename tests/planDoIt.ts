// Do it on a plan the person worked around while it waited: a collection they dragged still takes the cards she files
// into it, words they just typed into the open doc stay theirs, a card they changed or connected since stays as they
// have it and she says so, and her count and glow cover only what landed.
import assert from 'node:assert';
import { replyBoard } from './fixtures/boards.ts';
import { launch, settle } from './support/launch.ts';

const BOARDS = ['dragged', 'doc', 'count', 'linked'];
const l = await launch({ boards: BOARDS.map(id => replyBoard(id, id)), open: 'dragged', claude: true });
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
async function open(id: string) {
  await page.waitForTimeout(500);
  await page.evaluate(id => window.__fenmyr.openBoard(id), id);
  await settle(page, 300);
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
const DO_IT = '#mcList .m-acts button:text-is("Do it")';
async function doIt() {
  await page.click(DO_IT);
  await settle(page, 800);
  assert.strictEqual(await page.evaluate(() => Number(Reflect.get(window, 'asked'))), 1, 'Do it asks Claude nothing');
}
const said = () =>
  page.evaluate(() => [...document.querySelectorAll('#mcList .mc-msg.myra')].at(-1)?.firstChild?.textContent);
const card = (id: string) =>
  page.evaluate(id => {
    const c = window.__fenmyr.curBoard().cards.find(x => x.id === id);
    return c && { x: c.x, y: c.y, text: 'text' in c ? c.text : undefined, kids: c.type === 'coll' ? c.kids : [] };
  }, id);
const notes = (n: number, more: object = {}) =>
  Array.from({ length: n }, (_, i) => ({ type: 'note', text: `Idea ${i + 1}`, ...more }));

await check(
  'a collection they dragged since the plan takes the cards she files into it, where they put it',
  async () => {
    await chat();
    await planned({ say: 'Filed eleven ideas.', add: notes(11, { in: 'ideas' }) });
    await page.keyboard.press('Escape');
    const box = await page.locator('#cards .card[data-id="ideas"]').boundingBox();
    assert(box, 'Ideas is on screen');
    await page.mouse.move(box.x + 30, box.y + 12);
    await page.mouse.down();
    await page.mouse.move(box.x + 130, box.y + 212, { steps: 8 });
    await page.mouse.up();
    await settle(page, 400);
    const dropped = await card('ideas');
    assert.notDeepStrictEqual([dropped?.x, dropped?.y], [900, 0], 'they moved it');
    await chat();
    await doIt();
    const after = await card('ideas');
    assert.deepStrictEqual([after?.x, after?.y], [dropped?.x, dropped?.y], 'it stays where they put it');
    assert.strictEqual(after?.kids.length, 12, 'and holds her eleven as well as its own');
    assert.strictEqual(await said(), 'Filed eleven ideas.', 'with nothing left out');
  },
);

await check('Do it with the doc they are writing in open keeps the words they just typed', async () => {
  await open('doc');
  await chat();
  await planned({ say: 'Rewrote the plan.', edit: [{ id: 'd1', body: 'Her new draft' }], remove: ['n4'] });
  await page.locator('#cards [data-id="d1"]').dblclick();
  await page.waitForSelector('.dv-prose');
  // typed, then Do it at once, before the editor has written to its card
  await page.evaluate(() => {
    window.__fenmyr.docEditor().chain().insertContent(' and their line').run();
    document.querySelector<HTMLElement>('#mcList .m-acts button:not(.ghost)')?.click();
  });
  await settle(page, 1000);
  const words = await page.evaluate(() => ({
    editor: window.__fenmyr.docEditor().getText(),
    card: window.__fenmyr.curBoard().cards.find(c => c.id === 'd1'),
  }));
  assert.match(words.editor, /and their line/, 'the editor keeps their words');
  assert(words.card?.type === 'doc' && /and their line/.test(words.card.body ?? ''), 'and so does the card');
  assert(words.card?.type === 'doc' && !/Her new draft/.test(words.card.body ?? ''), 'her draft is not put over them');
  assert.strictEqual(await card('n4'), undefined, 'the rest of the plan lands');
  assert.match((await said()) ?? '', /I left “Plan” as you have it, since it changed after my plan\.$/);
});

await check('after Do it her count and glow cover only the cards that landed', async () => {
  await open('count');
  await chat();
  const named = ['n1', 'n2', 'n3', 'n4', 'k1', 'k2', 'i1', 't1', 'd1', 'kb', 'ideas'];
  await planned({
    edit: named.map(id => ({ id, text: `New words for ${id}` })),
    move: [{ id: 's1', x: 1200, y: 900 }],
  });
  await page.locator('#cards .card[data-id="n1"]').dblclick();
  await page.keyboard.press('End');
  await page.keyboard.type(' and theirs');
  await page.keyboard.press('Escape');
  await settle(page, 300);
  await page.click(DO_IT);
  await page.waitForSelector('#cards .card.just-made');
  const glow = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('#cards .card.just-made')].map(e => e.dataset.id ?? '').sort(),
  );
  assert.deepStrictEqual(glow, [...named.filter(id => id !== 'n1'), 's1'].sort(), 'the glow skips the card left');
  await settle(page, 600);
  assert.strictEqual(
    await said(),
    'Done! I touched 11 cards. I left “First note and theirs” as you have it, since it changed after my plan.',
  );
  assert.strictEqual((await card('n1'))?.text, 'First note and theirs', 'their words stay');
});

await check(
  'a card the plan removes but they connected since stays with both connectors, and she says so',
  async () => {
    await open('linked');
    await chat();
    await planned({ say: 'Removed the third note.', remove: ['n3'] });
    await page.evaluate(() => {
      window.__fenmyr.curBoard().links.push({ id: 'L9', a: 'n1', b: 'n3' });
      window.__fenmyr.renderAll();
    });
    await doIt();
    assert.deepStrictEqual(await card('n3'), { x: 520, y: 500, text: 'Third note', kids: [] }, 'the card stays');
    const links = await page.evaluate(() => window.__fenmyr.curBoard().links.map(x => x.id));
    assert.deepStrictEqual(links.filter(id => id === 'L2' || id === 'L9').sort(), ['L2', 'L9'], 'with both connectors');
    assert.strictEqual(
      await said(),
      'Removed the third note. I left “Third note” as you have it, since it changed after my plan.',
    );
  },
);

await l.close();
if (failed.length) {
  console.log(`\n${failed.length} failed`);
  process.exit(1);
}
console.log('PLAN DO IT OK');
