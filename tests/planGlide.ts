// When a plan arrives, the view glides once to show its preview, but never while the person is busy: dragging, moving
// the view with the wheel or a pinch, or typing in a card. A glide held back comes on the first frame they stop, while
// the plan still waits, unless they moved the view themselves after it arrived, since they chose where to look. Words
// in Myra's input don't hold it back: a glide moves only the board.
import assert from 'node:assert';
import { replyBoard } from './fixtures/boards.ts';
import { launch, settle } from './support/launch.ts';

const BOARDS = ['words', 'wheel', 'zoom', 'typing', 'drag', 'pan'];
const l = await launch({ boards: BOARDS.map(id => replyBoard(id, id)), open: 'words', claude: true });
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
const view = () => page.evaluate(() => ({ ...window.__fenmyr.view }));
// Each glide puts a transition on the board while it moves, so the board counts the glides it starts.
await page.evaluate(() => {
  const world = document.getElementById('world');
  let gliding = false;
  if (world)
    new MutationObserver(() => {
      const now = world.style.transition.includes('transform');
      if (now && !gliding) world.dataset.glides = String(Number(world.dataset.glides ?? 0) + 1);
      gliding = now;
    }).observe(world, { attributes: true, attributeFilter: ['style'] });
});
const glides = () => page.evaluate(() => Number(document.getElementById('world')?.dataset.glides ?? 0));
const notes = (n: number, more: (i: number) => object) =>
  Array.from({ length: n }, (_, i) => ({ type: 'note', text: `Task ${i + 1}`, ...more(i) }));
// eleven notes far from where the board is shown, so a glide is plain to see
const FAR = {
  say: 'Over there.',
  add: notes(11, i => ({ x: 4000 + (i % 4) * 260, y: 3000 + Math.floor(i / 4) * 180 })),
};
// her plan, as if Claude had just sent it, in the middle of whatever they are doing
const arrive = async () => {
  await page.evaluate(r => window.__fenmyr.answerMyra(r, 'q'), FAR);
  assert(await page.evaluate(() => window.__fenmyr.heldLists() !== null), 'it waits as a plan');
};
// the preview's boxes inside the window
const seen = () =>
  page.evaluate(
    () =>
      [...document.querySelectorAll('#planPreview .pp-box')].filter(b => {
        const r = b.getBoundingClientRect();
        return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
      }).length,
  );
// another board, which ends the last plan, shown where the board starts, with the chat open
async function start(id: string) {
  await page.waitForTimeout(500);
  await page.evaluate(id => window.__fenmyr.openBoard(id), id);
  await settle(page, 300);
  await page.evaluate(() => {
    if (!document.getElementById('myra')?.classList.contains('chat')) document.getElementById('mPill')?.click();
    Object.assign(window.__fenmyr.view, { x: 160, y: 140, z: 1 });
    window.__fenmyr.applyView();
  });
  await settle(page, 500);
}
async function wheel(ms: number, ctrl: boolean) {
  const end = Date.now() + ms;
  await page.mouse.move(600, 450);
  if (ctrl) await page.keyboard.down('Control');
  for (let i = 0; Date.now() < end; i++) {
    await page.mouse.wheel(0, ctrl ? (i % 2 ? 120 : -120) : 40);
    await page.waitForTimeout(60);
  }
  if (ctrl) await page.keyboard.up('Control');
}
const box = async (id: string) => {
  const b = await page.locator(`#cards .card[data-id="${id}"]`).boundingBox();
  assert(b, `${id} is on screen`);
  return b;
};

await check('words in her input don’t hold the glide back', async () => {
  await start('words');
  const g = await glides();
  await page.fill('#mcInput', 'and then');
  await arrive();
  await page.waitForTimeout(900);
  assert.strictEqual((await glides()) - g, 1, 'it glides once');
  assert.strictEqual(await seen(), 11, 'to all eleven boxes');
  assert.strictEqual(await page.inputValue('#mcInput'), 'and then', 'and their words stay');
});

for (const [name, id, ctrl] of [
  ['a wheel pan', 'wheel', false],
  ['a wheel or pinch zoom', 'zoom', true],
] as const)
  await check(`never during ${name}, nor after it, since they moved the view`, async () => {
    await start(id);
    const g = await glides(),
      moving = wheel(2500, ctrl);
    await page.waitForTimeout(500);
    await arrive();
    await moving;
    const ended = await view();
    assert.strictEqual((await glides()) - g, 0, `no glide during ${name}`);
    await page.waitForTimeout(1200);
    assert.strictEqual((await glides()) - g, 0, 'nor after it');
    assert.deepStrictEqual(await view(), ended, 'and the view stays where they left it');
  });

await check('held back while they type in a card, then glides once they stop', async () => {
  await start('typing');
  const g = await glides(),
    n2 = await box('n2');
  await page.mouse.dblclick(n2.x + 40, n2.y + 40);
  await page.keyboard.type('more ');
  await arrive();
  await page.waitForTimeout(900);
  assert.strictEqual((await glides()) - g, 0, 'not while typing');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(900);
  assert.strictEqual((await glides()) - g, 1, 'then it glides once');
  assert.strictEqual(await seen(), 11, 'to all eleven boxes');
});

await check('held back while they drag a card, then glides once they let go', async () => {
  await start('drag');
  const g = await glides(),
    n3 = await box('n3');
  await page.mouse.move(n3.x + 40, n3.y + 40);
  await page.mouse.down();
  await page.mouse.move(n3.x + 70, n3.y + 60, { steps: 4 });
  await arrive();
  await page.waitForTimeout(900);
  assert.strictEqual((await glides()) - g, 0, 'not while dragging');
  await page.mouse.up();
  await page.waitForTimeout(900);
  assert.strictEqual((await glides()) - g, 1, 'then it glides once');
  assert.strictEqual(await seen(), 11, 'to all eleven boxes');
});

await check('never once they pan the board themselves after it arrives', async () => {
  await start('pan');
  const g = await glides();
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.keyboard.down('Space');
  await page.mouse.move(600, 300);
  await page.mouse.down();
  await page.mouse.move(620, 320, { steps: 3 });
  await arrive();
  await page.mouse.move(680, 360, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Space');
  const panned = await view();
  await page.waitForTimeout(1200);
  assert.strictEqual((await glides()) - g, 0, 'it never glides');
  assert.deepStrictEqual(await view(), panned, 'the view stays where they panned it');
});

const errors = [...l.errors];
await l.close();
assert.deepStrictEqual(errors, [], 'no page errors');
if (failed.length) {
  console.log(`\n${failed.length} failed`);
  process.exit(1);
}
console.log('PLAN GLIDE OK');
