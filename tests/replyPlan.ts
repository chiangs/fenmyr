// Myra's big replies wait as plans. One that would add, move or edit more than ten cards, or remove any, shows in the
// chat as numbered steps, and nothing of it is saved until Do it, which lands that same reply with no second request
// to Claude. Cancel leaves the board as it was. Reading notes never makes her wait, and a template that opens a board
// of its own is counted by what it makes there.
import assert from 'node:assert';
import { replyBoard } from './fixtures/boards.ts';
import { launch, settle } from './support/launch.ts';

const BOARDS = ['cancel', 'doit', 'read', 'tpl'];
const l = await launch({ boards: BOARDS.map(id => replyBoard(id, id)), open: 'cancel', claude: true });
const { page } = l;

const LEAD = 'Here’s my plan. Nothing changes until you say so.';
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
const lists = () =>
  page.evaluate(() => {
    const b = window.__fenmyr.curBoard();
    return JSON.stringify({ cards: b.cards, links: b.links, tray: b.tray, trayLinks: b.trayLinks });
  });
// Claude's answer, every time it is asked, counted
const answer = (reply: object) =>
  page.evaluate(r => {
    Reflect.set(window, 'asked', 0);
    window.Fenmyr.ask = async () => {
      Reflect.set(window, 'asked', Number(Reflect.get(window, 'asked')) + 1);
      return JSON.stringify(r);
    };
  }, reply);
const asked = () => page.evaluate(() => Number(Reflect.get(window, 'asked')));
const ask = (q: string) => page.evaluate(q => window.__fenmyr.ask(q), q);
const rows = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('#mcList .mc-msg.myra')].map(d => ({
      text: d.firstChild?.textContent ?? '',
      head: d.querySelector('.m-summary b')?.textContent ?? '',
      lines: [...d.querySelectorAll('.m-summary li')].map(li => li.textContent ?? ''),
      acts: [...d.querySelectorAll('.m-acts button')].map(b => `${b.className}:${b.textContent}`),
    })),
  );
const plan = async () => (await rows()).findLast(r => r.text === LEAD);
const press = async (label: string) => {
  await page
    .locator('#mcList .m-acts button')
    .filter({ hasText: new RegExp(`^${label}$`) })
    .last()
    .click();
  await settle(page, 600);
};
const notes = (n: number, more: object = {}) =>
  Array.from({ length: n }, (_, i) => ({ type: 'note', text: `Idea ${i + 1}`, ...more }));
// every board file written from now on, as its lists
const watchSaves = () =>
  page.evaluate(() => {
    const seen: string[] = [];
    Reflect.set(window, 'saves', seen);
    const real = window.Fenmyr.save;
    window.Fenmyr.save = b => {
      seen.push(JSON.stringify({ cards: b.cards, links: b.links, tray: b.tray, trayLinks: b.trayLinks }));
      return real(b);
    };
  });
const saves = () => page.evaluate(() => [...(Reflect.get(window, 'saves') ?? [])].map(String));

await check(
  'a reply over ten cards waits as a plan, nothing is saved, and Cancel leaves the board as it was',
  async () => {
    await page.click('#mPill');
    const before = await lists(),
      drawn = await page.locator('#cards .card').count();
    await watchSaves();
    await answer({ say: 'Here are eleven ideas.', add: notes(11) });
    await ask('Give me eleven ideas');
    await settle(page, 800);
    assert.deepStrictEqual(
      await plan(),
      { text: LEAD, head: 'If you say yes', lines: ['+ 11 notes'], acts: [':Do it', 'ghost:Cancel'] },
      'her plan, numbered, with Do it and Cancel',
    );
    assert.strictEqual(await lists(), before, 'the board is as it was');
    assert.strictEqual(await page.locator('#cards .card').count(), drawn, 'nothing new is drawn');
    const written = await saves();
    assert(written.length > 0, 'the chat is saved with the board');
    assert(
      written.every(s => s === before),
      'every board file written holds the board as it was',
    );
    await press('Cancel');
    assert.deepStrictEqual(await plan(), {
      text: LEAD,
      head: 'Cancelled · nothing changed',
      lines: ['+ 11 notes'],
      acts: [],
    });
    assert.strictEqual(await lists(), before, 'Cancel leaves the board as it was');
    assert.strictEqual(await asked(), 1, 'and asks nothing more');

    await answer({ say: 'Gone.', remove: ['n4'] });
    await ask('Remove the fourth note');
    assert.deepStrictEqual((await plan())?.lines, ['− 1 note removed'], 'removing any card waits as a plan');
    assert.strictEqual(await lists(), before);
    await press('Cancel');

    await answer({ say: 'Here are ten.', add: notes(10) });
    await ask('Give me ten ideas');
    assert.strictEqual((await rows()).at(-1)?.text, 'Here are ten.', 'ten new cards land at once');
    assert.notStrictEqual(await lists(), before);
  },
);

await check('Do it lands the held reply with no second request, and the board is what the plan held', async () => {
  await open('doit');
  const before = await lists();
  await answer({
    say: 'I’ve gathered them into a sprint.',
    collections: [{ name: 'Sprint', x: 1400, y: 0 }],
    add: notes(11, { in: 'Sprint' }),
    remove: ['n4'],
  });
  await ask('Gather a sprint');
  assert.deepStrictEqual((await plan())?.lines, ['+ 1 collection, Sprint, with 11 cards', '− 1 note removed']);
  const shape = (json: string | null) => {
    const b: { cards: { id: string; x: number; y: number; text?: string; kids?: string[] }[] } = JSON.parse(json ?? '');
    const inside = new Set(b.cards.flatMap(c => c.kids ?? []));
    return b.cards
      .map(c => (inside.has(c.id) ? { id: c.id, text: c.text } : { id: c.id, x: c.x, y: c.y, kids: c.kids }))
      .sort((a, b) => a.id.localeCompare(b.id));
  };
  const held = await page.evaluate(() => JSON.stringify(window.__fenmyr.heldLists()));
  await press('Do it');
  assert.strictEqual(await asked(), 1, 'Do it asks Claude nothing');
  assert.deepStrictEqual(shape(await lists()), shape(held), 'the same cards, ids and spots the plan held');
  assert.strictEqual((await plan())?.head, 'Done');
  const said = (await rows()).at(-1);
  assert.deepStrictEqual(
    said && [said.text, said.head, said.acts.filter(a => !a.startsWith('next:'))],
    ['I’ve gathered them into a sprint.', 'Changed on the board', [':Show on board', 'ghost:Undo']],
    'her own line comes with what changed, Show on board and Undo',
  );
  await press('Undo');
  assert.strictEqual(await lists(), before, 'Undo puts the board back as it was');
});

await check('reading notes never waits as a plan, however many she put on the board', async () => {
  await open('read');
  const note = (i: number) => ({
    vault: 'Notes',
    vaultId: 'v1',
    rel: `N${i}.md`,
    title: `Note ${i}`,
    tags: [],
    props: undefined,
    excerpt: `Note ${i}`,
    text: `Note ${i}`,
  });
  const ctx = { asked: true, used: Array.from({ length: 12 }, (_, i) => note(i)), web: true },
    read = {
      say: 'Here’s what your notes say.',
      vaultNotes: ctx.used.map(n => ({ vault: n.vault, path: n.rel })),
      pages: [{ url: 'https://example.com/a', title: 'A page' }],
    };
  await page.evaluate(([r, ctx]) => window.__fenmyr.answerMyra(r, 'What do my notes say?', ctx), [read, ctx] as const);
  await settle(page, 600);
  const vnotes = () => page.evaluate(() => window.__fenmyr.curBoard().cards.filter(c => c.type === 'vnote').length);
  assert.strictEqual(await vnotes(), 12, 'all twelve land at once');
  assert.strictEqual(await plan(), undefined, 'with no plan');
  await page.evaluate(r => window.__fenmyr.answerMyra(r, 'Twelve ideas'), { say: 'Twelve.', add: notes(12) });
  assert.deepStrictEqual((await plan())?.lines, ['+ 12 notes'], 'twelve plain notes wait');
});

await check('a template that opens its own board waits as a plan when it makes more than ten cards', async () => {
  await open('tpl');
  const eleven = ['kb', 'k1', 'k2', 'i1', 'n1', 'n2', 'n3', 'n4', 't1', 's1', 'p1'];
  await page.evaluate(ids => window.__fenmyr.saveAsTemplate('Big', ids, { mode: 'new' }), eleven);
  await answer({ say: 'A board of its own.', useTemplate: { name: 'Big', mode: 'new' } });
  await ask('Start a board from Big');
  const waiting = await plan();
  assert.strictEqual(waiting?.head, 'If you say yes', 'it waits');
  assert.strictEqual(waiting?.lines[0], '+ 1 board from the template “Big”');
  assert.strictEqual(await page.evaluate(() => window.__fenmyr.curBoard().id), 'tpl', 'no board opens yet');
  await press('Do it');
  await settle(page, 600);
  const opened = await page.evaluate(() => {
    const b = window.__fenmyr.curBoard();
    return { name: b.name, cards: b.cards.length };
  });
  assert.deepStrictEqual(opened, { name: 'Big', cards: 11 }, 'Do it opens it');
  assert.strictEqual(await asked(), 1, 'with no second request');
});

await l.close();
if (failed.length) {
  console.log(`\n${failed.length} failed`);
  process.exit(1);
}
console.log('REPLY PLAN OK');
