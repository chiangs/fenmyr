// A plan's preview shows exactly what Do it lands: after Do it each card sits where its box was, cards filed into a
// collection or a kanban included, laid out as the board lays them. While the plan waits the preview follows the board:
// a card the person changes loses its box, and the plan's step says she will leave it. The preview goes whenever the
// plan stops waiting.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { MyraReply } from '../src/shared/myraReply.ts';
import { replyBoard } from './fixtures/boards.ts';
import { type Launched, launch, settle } from './support/launch.ts';

const BOARDS = ['laid', 'follow', 'relaid', 'gone', 'other'];
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-preview-'));
let l: Launched = await launch({ boards: BOARDS.map(id => replyBoard(id, id)), open: 'laid', claude: true, data });
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
async function open(id: string) {
  await page.waitForTimeout(500);
  await page.evaluate(id => window.__fenmyr.openBoard(id), id);
  await settle(page, 300);
}
const chat = () => page.evaluate(() => document.getElementById('mPill')?.click());
async function planned(reply: MyraReply) {
  await page.evaluate(r => window.__fenmyr.answerMyra(r, 'q'), reply);
  await settle(page, 800);
  assert(await page.evaluate(() => window.__fenmyr.heldLists() !== null), 'it waits as a plan');
}
type Rect = { x: number; y: number; w: number; h: number };
const boxes = () =>
  page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll<HTMLElement>('#planPreview .pp-box:not(.remove)')].map(b => [
        b.dataset.pp ?? '',
        {
          x: parseFloat(b.style.left),
          y: parseFloat(b.style.top),
          w: parseFloat(b.style.width),
          h: parseFloat(b.style.height),
        },
      ]),
    ),
  );
const rects = (): Promise<Record<string, Rect>> =>
  page.evaluate(() =>
    Object.fromEntries(window.__fenmyr.curBoard().cards.map(c => [c.id, { x: c.x, y: c.y, w: c.w, h: c.h }])),
  );
const shown = () => page.locator('#planPreview > *').count();
const steps = () => page.locator('#mcList .m-summary.plan.waiting li').allTextContents();
const dimmed = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('#mcList .m-summary.plan.waiting li')].map(li => li.classList.contains('dim')),
  );
async function press(label: string) {
  if (!(await page.locator('#mcInput').isVisible())) await chat();
  await page
    .locator('#mcList .m-acts button')
    .filter({ hasText: new RegExp(`^${label}$`) })
    .last()
    .click();
  await settle(page, 1200);
}
// within a pixel, every box against the card Do it put there
function sameRects(want: Record<string, Rect>, got: Record<string, Rect>) {
  const off = Object.entries(want).flatMap(([id, b]) => {
    const c = got[id];
    return c && [c.x - b.x, c.y - b.y, c.w - b.w, c.h - b.h].every(d => Math.abs(d) <= 1)
      ? []
      : [`${id}: box ${JSON.stringify(b)}, card ${JSON.stringify(c)}`];
  });
  assert.deepStrictEqual(off, [], 'every card sits where its box was');
}
// typed into the card as a person would, double-clicking a part of it no panel covers
async function retype(id: string, words: string) {
  await page.keyboard.press('Escape');
  const box = await page.locator(`#cards .card[data-id="${id}"]`).boundingBox();
  assert(box, `${id} is on screen`);
  await page.mouse.dblclick((Math.max(box.x, 260) + Math.min(box.x + box.width, 1160)) / 2, box.y + 40);
  await page.keyboard.press('Control+A');
  await page.keyboard.type(words);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await settle(page, 400);
}
// dragged by the pointer, which changes the board without anyone typing
async function drag(id: string, dx: number, dy: number) {
  await page.keyboard.press('Escape');
  const box = await page.locator(`#cards .card[data-id="${id}"]`).boundingBox();
  assert(box, `${id} is on screen`);
  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 40 + dx, box.y + 40 + dy, { steps: 6 });
  await page.mouse.up();
  await settle(page, 400);
}
const LONG = 'A longer task whose words wrap over several lines, so its card is taller than one that was planned';
const notes = (n: number, more: (i: number) => object = () => ({})) =>
  Array.from({ length: n }, (_, i) => ({ type: 'note', text: `Task ${i + 1}`, ...more(i) }));

await chat();

await check('after Do it each card sits where its box was, collections and kanbans laid out', async () => {
  const before = Object.keys(await rects());
  await planned({
    say: 'Filed.',
    add: [
      ...notes(5, i => ({ text: i % 2 ? LONG : `Task ${i + 1}`, in: 'kb', column: i % 3 })),
      ...notes(4, i => ({ text: i % 2 ? `Idea ${i}` : LONG, in: 'ideas' })),
      ...notes(2, i => ({ x: 1300, y: 500 + i * 200 })),
    ],
    edit: [
      { id: 'n1', in: 'ideas' },
      { id: 'k1', text: `${LONG}, reworded` },
    ],
    move: [{ id: 'n2', x: 1300, y: 900 }],
    remove: ['n3'],
  });
  const want = await boxes();
  await press('Do it');
  const got = await rects(),
    made = Object.keys(got).filter(id => !before.includes(id));
  assert.strictEqual(made.length, 11, 'eleven cards landed');
  assert.deepStrictEqual(
    [...made, 'n1', 'n2', 'k1'].filter(id => !want[id]),
    [],
    'each had a box',
  );
  sameRects(want, got);
  assert.strictEqual(await shown(), 0, 'and the preview is gone');
});

await check('a card changed since loses its box, and her step says she will leave it', async () => {
  await open('follow');
  await chat();
  await planned({
    say: 'Ten more, the fourth note moved, and the first three reworded.',
    add: notes(10),
    move: [{ id: 'n4', x: 1300, y: 900 }],
    edit: ['n1', 'n2', 'n3'].map(id => ({ id, text: `Hers for ${id}` })),
  });
  assert.deepStrictEqual(await steps(), ['+ 10 notes', '→ 1 note moved', '✎ 3 notes reworded']);
  assert((await boxes()).n4, 'n4 has a box where she would move it');
  await drag('n4', 60, 40);
  assert.strictEqual((await boxes()).n4, undefined, 'n4, which they moved, has none');
  assert.deepStrictEqual(await steps(), [
    '+ 10 notes',
    '→ 1 note moved · changed since, so I’ll leave it',
    '✎ 3 notes reworded',
  ]);
  await retype('n1', 'Mine now');
  assert.strictEqual((await boxes()).n1, undefined, 'n1 has no box');
  assert.deepStrictEqual(await steps(), [
    '+ 10 notes',
    '→ 1 note moved · changed since, so I’ll leave it',
    '✎ 3 notes reworded · 1 changed since, so I’ll leave it',
  ]);
  assert.deepStrictEqual(await dimmed(), [false, true, false]);
  await retype('n2', 'Mine too');
  await retype('n3', 'And mine');
  const left = await boxes();
  assert.deepStrictEqual(
    ['n1', 'n2', 'n3'].filter(id => left[id]),
    [],
    'none of the three has a box',
  );
  assert.deepStrictEqual(await steps(), [
    '+ 10 notes',
    '→ 1 note moved · changed since, so I’ll leave it',
    '✎ 3 notes reworded · changed since, so I’ll leave them',
  ]);
  assert.deepStrictEqual(await dimmed(), [false, true, true], 'a step she would leave whole dims');
  const ten = await boxes();
  await press('Do it');
  sameRects(ten, await rects());
});

await check('the boxes follow the board: a card that grows in a collection pushes the planned ones down', async () => {
  await open('relaid');
  await chat();
  await planned({ say: 'Ideas.', add: notes(11, i => ({ text: `Idea ${i + 1}`, in: 'ideas' })) });
  const first = await boxes();
  await retype('i1', `${LONG}. ${LONG}.`);
  const after = await boxes(),
    moved = Object.keys(first).filter(id => id !== 'ideas' && after[id]?.y !== first[id]?.y);
  assert.strictEqual(moved.length, 11, 'every planned card in Ideas moved down');
  await press('Do it');
  sameRects(after, await rects());
});

await check('the preview goes whenever the plan stops waiting', async () => {
  await open('gone');
  await chat();
  const eleven = { say: 'Eleven.', add: notes(11) },
    ends: [string, () => Promise<unknown>][] = [
      ['Cancel', () => press('Cancel')],
      ['Do it', () => press('Do it')],
      ['Just do it', () => press('Just do it')],
      [
        'a typed no',
        async () => {
          await page.fill('#mcInput', 'no');
          await page.click('.mc-send');
        },
      ],
      [
        'her yes to it',
        () => page.evaluate(() => window.__fenmyr.answerMyra({ say: 'Doing it.', doPlan: true }, 'go on then')),
      ],
      ['New chat', () => page.click('#mcNew')],
      ['Clear all chats', () => page.evaluate(() => document.getElementById('clearChats')?.click())],
      ['another board', () => open('other')],
    ];
  for (const [how, end] of ends) {
    await open('gone');
    await chat();
    await planned(eleven);
    assert(await shown(), `the preview shows before ${how}`);
    await end();
    await settle(page, 600);
    assert.strictEqual(await shown(), 0, `${how} takes the preview away`);
    // Just do it turns on Skip plans, so the next plan would land at once
    if (how === 'Just do it')
      await page.evaluate(() => document.querySelector<HTMLInputElement>('input[data-set="skipPlans"]')?.click());
  }
  await open('gone');
  await chat();
  await planned(eleven);
  await page.waitForTimeout(800);
  await l.close();
  l = await launch({ open: 'gone', claude: true, data });
  page = l.page;
  await settle(page, 600);
  assert.strictEqual(await shown(), 0, 'a restart takes it away');
});

const errors = [...l.errors];
await l.close();
fs.rmSync(data, { recursive: true, force: true });
assert.deepStrictEqual(errors, [], 'no page errors');
if (failed.length) {
  console.log(`\n${failed.length} failed`);
  process.exit(1);
}
console.log('PLAN PREVIEW LAND OK');
