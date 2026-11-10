// A plan waiting in the chat shows on the board as a dashed preview: a box where each card it adds, moves or changes
// would land, and a "Removed" box over each card it takes away. Nothing in it is a card: the pointer goes through it to
// the board and the cards under it. Hovering a step of the plan lights that step's boxes, and the view glides to the
// preview when it arrives (planGlide.ts says when it waits). No picture of the window shows it (planPictures.ts).
import assert from 'node:assert';
import type { MyraReply } from '../src/shared/myraReply.ts';
import { replyBoard } from './fixtures/boards.ts';
import { launch, settle } from './support/launch.ts';

const BOARDS = ['layer', 'pointer', 'hover', 'glide'];
const l = await launch({ boards: BOARDS.map(id => replyBoard(id, id)), open: 'layer', claude: true });
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
const chat = () => page.evaluate(() => document.getElementById('mPill')?.click());
const lists = () =>
  page.evaluate(() => {
    const b = window.__fenmyr.curBoard();
    return JSON.stringify({ cards: b.cards, links: b.links, tray: b.tray, trayLinks: b.trayLinks });
  });
// her reply, held as a plan, as if Claude had just sent it
async function planned(reply: MyraReply) {
  await page.evaluate(r => window.__fenmyr.answerMyra(r, 'q'), reply);
  await settle(page, 800);
  assert(await page.evaluate(() => window.__fenmyr.heldLists() !== null), 'it waits as a plan');
}
const boxes = () =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('#planPreview .pp-box')].map(b => ({
      id: b.dataset.pp ?? '',
      kind: ['add', 'move', 'edit', 'remove'].find(k => b.classList.contains(k)),
      label: b.textContent,
      hot: b.classList.contains('hot'),
      x: parseFloat(b.style.left),
      y: parseFloat(b.style.top),
      w: parseFloat(b.style.width),
      h: parseFloat(b.style.height),
    })),
  );
// where a box shows on screen, by the card it stands for
const onScreen = (id: string) =>
  page.evaluate(id => {
    const r = document.querySelector(`#planPreview [data-pp="${id}"]`)?.getBoundingClientRect();
    return r && { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  }, id);
const card = (id: string) =>
  page.evaluate(id => {
    const c = window.__fenmyr.curBoard().cards.find(x => x.id === id);
    return c && { x: c.x, y: c.y, w: c.w, h: c.h };
  }, id);
const notes = (n: number, more: (i: number) => object = () => ({})) =>
  Array.from({ length: n }, (_, i) => ({ type: 'note', text: `Task ${i + 1}`, ...more(i) }));
// a new kanban of twelve, a note reworded and a note removed
const BIG = {
  say: 'I’ve sorted these into phases.',
  collections: [{ name: 'Phases', kanban: true, columns: ['To do', 'Doing', 'Done'] }],
  add: notes(12, i => ({ in: 'Phases', column: i % 3 })),
  edit: [{ id: 'n1', text: 'First, reworded' }],
  remove: ['n4'],
};
// eleven notes far from where the board is shown
const FAR = {
  say: 'Over there.',
  add: notes(11, i => ({ x: 4000 + (i % 4) * 260, y: 3000 + Math.floor(i / 4) * 180 })),
};

await chat();

await check('a waiting plan shows on the board as dashed boxes, and none of them is a card', async () => {
  const before = await lists(),
    drawn = await page.locator('#cards .card').count(),
    layers = await page.locator('.ly').count();
  await planned(BIG);
  const bs = await boxes(),
    kinds = bs.map(b => b.kind);
  assert.strictEqual(kinds.filter(k => k === 'add').length, 13, 'the kanban and its twelve cards');
  assert.deepStrictEqual(
    bs.filter(b => b.kind !== 'add').map(({ id, kind, label }) => ({ id, kind, label })),
    [
      { id: 'n1', kind: 'edit', label: 'First, reworded' },
      { id: 'n4', kind: 'remove', label: 'Removed' },
    ],
  );
  const n4 = bs.find(b => b.id === 'n4');
  assert.deepStrictEqual(
    n4 && { x: n4.x, y: n4.y, w: n4.w, h: n4.h },
    await card('n4'),
    '“Removed” sits over the card',
  );
  assert.strictEqual(await page.locator('#planPreview .pp-head').textContent(), 'Preview · not on the board yet');
  const layer = await page.evaluate(() => {
    const el = document.getElementById('planPreview'),
      box = el?.querySelector('.pp-box');
    return {
      parent: el?.parentElement?.id,
      inCards: !!el?.closest('#cards'),
      cards: el?.querySelectorAll('.card, [data-id]').length,
      pointer: [el, box].map(e => (e ? getComputedStyle(e).pointerEvents : '')),
    };
  });
  assert.deepStrictEqual(layer, { parent: 'world', inCards: false, cards: 0, pointer: ['none', 'none'] });
  assert.strictEqual(await lists(), before, 'the board is as it was');
  assert.strictEqual(await page.locator('#cards .card').count(), drawn, 'no card is drawn for it');
  assert.strictEqual(await page.locator('.ly').count(), layers, 'the layers panel lists no more');
});

await check('a click and a marquee through the preview reach the card and the board under it', async () => {
  await open('pointer');
  await chat();
  await planned({
    say: 'One here, and the fourth note gone.',
    add: [{ type: 'note', text: 'Here', x: 300, y: 330 }],
    remove: ['n4'],
  });
  await page.keyboard.press('Escape');
  await settle(page, 300);
  const gone = await onScreen('n4'),
    here = (await boxes()).find(b => b.kind === 'add'),
    spot = here && (await onScreen(here.id));
  assert(gone && spot, 'both boxes show');
  const under = await page.evaluate(
    ps =>
      ps.map(([x = 0, y = 0]) => document.elementFromPoint(x, y)?.closest('#planPreview, .card, #stage')?.id || 'card'),
    [
      [gone.cx, gone.cy],
      [spot.cx, spot.cy],
    ],
  );
  assert.deepStrictEqual(under, ['card', 'stage'], 'the pointer finds the card and the board under the boxes');
  await page.mouse.click(gone.cx, gone.cy);
  await settle(page, 200);
  assert.deepStrictEqual(await page.evaluate(() => window.__fenmyr.sel), ['n4'], 'a click selects the card under it');
  await page.keyboard.press('Escape');
  // from inside the new note's box, on the empty board, to the middle of the second note below it
  const n2 = await page.locator('#cards .card[data-id="n2"]').boundingBox();
  assert(n2, 'n2 is on screen');
  await page.mouse.move(spot.cx, spot.cy);
  await page.mouse.down();
  await page.mouse.move(n2.x + n2.width / 2, n2.y + n2.height / 2, { steps: 8 });
  await page.mouse.up();
  await settle(page, 200);
  assert.deepStrictEqual(await page.evaluate(() => window.__fenmyr.sel), ['n2'], 'a marquee from inside a box selects');
});

await check('hovering a step lights its boxes and dims the rest', async () => {
  await open('hover');
  await chat();
  await planned(BIG);
  const step = (i: number) => page.locator('#mcList .m-summary.plan.waiting li').nth(i),
    lit = async () => (await boxes()).filter(b => b.hot).map(b => b.id),
    dimmed = () => page.evaluate(() => document.getElementById('planPreview')?.classList.contains('lit'));
  await step(1).hover();
  await settle(page, 100);
  assert.deepStrictEqual(await lit(), ['n1'], 'step 2 lights the reworded note');
  assert.strictEqual(await dimmed(), true, 'and the others dim');
  await step(0).hover();
  await settle(page, 100);
  assert.strictEqual((await lit()).length, 13, 'step 1 lights the kanban and its cards');
  await step(2).hover();
  await settle(page, 100);
  assert.deepStrictEqual(await lit(), ['n4']);
  await page.mouse.move(1, 1);
  await settle(page, 100);
  assert.deepStrictEqual(await lit(), [], 'leaving the steps lights none');
  assert.strictEqual(await dimmed(), false);
});

await check('the view glides to show the preview beside the open chat', async () => {
  await open('glide');
  await chat();
  await planned(FAR);
  await page.waitForTimeout(700);
  const shown = await page.evaluate(() => {
    const c = document.getElementById('mChat')?.getBoundingClientRect(),
      bs = [...document.querySelectorAll('#planPreview .pp-box')].map(b => b.getBoundingClientRect());
    return {
      inWindow: bs.every(r => r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight),
      clearOfChat: !!c && bs.every(r => r.right <= c.left || r.bottom <= c.top),
    };
  });
  assert.deepStrictEqual(shown, { inWindow: true, clearOfChat: true });
});

const errors = [...l.errors];
await l.close();
assert.deepStrictEqual(errors, [], 'no page errors');
if (failed.length) {
  console.log(`\n${failed.length} failed`);
  process.exit(1);
}
console.log('PLAN PREVIEW OK');
