// Do it on a plan the person worked around while it waited, and what she says about it: a card she meant to move that
// they moved since stays where they put it and she names it, a card they only clicked into and left takes her change,
// a doc they only opened, whether closed again or still open, takes her rewrite, and a card they are in, though nothing
// is typed yet, stays as it is.
import assert from 'node:assert';
import { replyBoard } from './fixtures/boards.ts';
import { launch, settle } from './support/launch.ts';

const BOARDS = ['moved', 'clicked', 'docClosed', 'docOpen', 'editing'];
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
// Do it pressed without taking the caret or the open doc's focus away
const doItInPlace = () =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('#mcList .m-acts button')].find(b => b.textContent === 'Do it')?.click(),
  );
const said = () =>
  page.evaluate(() => [...document.querySelectorAll('#mcList .mc-msg.myra')].at(-1)?.firstChild?.textContent);
async function open(id: string) {
  await page.waitForTimeout(500);
  await page.evaluate(id => window.__fenmyr.openBoard(id), id);
  await settle(page, 300);
}
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

await check('a card they only clicked into and left, with nothing typed, takes her change', async () => {
  await open('clicked');
  await chat();
  await planned({
    say: 'Ten ideas, and a sharper third note.',
    add: notes(10),
    edit: [{ id: 'n3', text: 'Her third' }],
  });
  await page.keyboard.press('Escape');
  await page.locator('#cards .card[data-id="n3"]').dblclick();
  await page.keyboard.press('Escape');
  await settle(page, 300);
  assert.strictEqual(await page.evaluate(() => window.__fenmyr.editing), null, 'they left it');
  await chat();
  await doIt();
  const n3 = await page.evaluate(() => window.__fenmyr.curBoard().cards.find(c => c.id === 'n3'));
  assert(n3?.type === 'note' && n3.text === 'Her third', 'her words land');
  assert.strictEqual(await said(), 'Ten ideas, and a sharper third note.', 'with nothing left out');
});

// a doc she writes in markdown, and her plan to rewrite it, with ten new notes so it waits
async function herDoc(title: string) {
  await page.evaluate(async t => {
    const body = `# ${t}\n\n- Who it is for\n- **Why** it matters`;
    await window.__fenmyr.applyMyra({ say: 'A brief.', add: [{ type: 'doc', text: t, body, x: 300, y: 950 }] }, 'q');
  }, title);
  await settle(page, 400);
  const id = await page.evaluate(
    t => window.__fenmyr.curBoard().cards.find(c => c.type === 'doc' && c.text === t)?.id ?? '',
    title,
  );
  await planned({ say: 'Rewrote the brief.', add: notes(10), edit: [{ id, body: 'Her new brief' }] });
  return id;
}
const body = (id: string) =>
  page.evaluate(id => {
    const c = window.__fenmyr.curBoard().cards.find(x => x.id === id);
    return c?.type === 'doc' ? c.body : undefined;
  }, id);
async function readDoc(id: string) {
  await page.keyboard.press('Escape');
  // away from its title, which a double-click would edit instead
  await page.locator(`#cards [data-id="${id}"]`).dblclick({ position: { x: 8, y: 8 } });
  await page.waitForSelector('.dv-prose');
  await page.waitForTimeout(800);
}

await check('a doc she wrote that they only opened and closed again takes her rewrite', async () => {
  await open('docClosed');
  await chat();
  const id = await herDoc('Launch brief');
  await readDoc(id);
  await page.keyboard.press('Escape');
  await settle(page, 300);
  await chat();
  await doIt();
  assert.strictEqual(await body(id), 'Her new brief', 'her rewrite lands');
  assert.strictEqual(await said(), 'Rewrote the brief.', 'with nothing left out');
});

await check(
  'a doc she wrote that is open, with nothing typed, takes her rewrite, and the editor shows it',
  async () => {
    await open('docOpen');
    await chat();
    const id = await herDoc('Party brief');
    await readDoc(id);
    await doItInPlace();
    await settle(page, 800);
    assert.strictEqual(await body(id), 'Her new brief', 'her rewrite lands');
    assert.strictEqual(await page.evaluate(() => window.__fenmyr.docEditor().getText()), 'Her new brief', 'and shows');
    assert.strictEqual(await said(), 'Rewrote the brief.', 'with nothing left out');
  },
);

await check('a card they are in when Do it is pressed stays as it is, though nothing is typed yet', async () => {
  await open('editing');
  await chat();
  await planned({
    say: 'Ten ideas, and a sharper second note.',
    add: notes(10),
    edit: [{ id: 'n2', text: 'Her second' }],
  });
  await page.keyboard.press('Escape');
  await page.locator('#cards .card[data-id="n2"]').dblclick();
  assert.strictEqual(await page.evaluate(() => window.__fenmyr.editing), 'n2', 'they are in it');
  await doItInPlace();
  await settle(page, 800);
  const n2 = await page.evaluate(() => window.__fenmyr.curBoard().cards.find(c => c.id === 'n2'));
  assert(n2?.type === 'note' && n2.text === 'Second note', 'her words are not put into it');
  assert.strictEqual(
    await said(),
    'Ten ideas, and a sharper second note. I left “Second note” as you have it, since it changed after my plan.',
  );
});

await l.close();
if (failed.length) {
  console.log(`\n${failed.length} failed`);
  process.exit(1);
}
console.log('PLAN SINCE OK');
