// A template can make its board at a place the caller names: a starter, the example board, a framework and one of Yours,
// whichever way it opens. With a place the board goes there and is shown, whatever the open board and Home are looking
// at; with none, each does what the picker has always done (guarded by createTemplates and slashTemplate).
import assert from 'node:assert';
import { launch } from './support/launch.ts';
import { boardIn, look, makes, SEEDED, seedLibrary, stored } from './support/library.ts';
import { still } from './support/settled.ts';

const l = await launch({ boards: [...SEEDED, boardIn('p3board', 'f3')], open: 'a' });
const { page } = l;

async function check(name: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (e) {
    console.error(`FAIL ${name}`);
    throw e;
  }
}

type At = { project: string | null; folder: string | null };
const TOOLS: At = { project: 'p2', folder: 'f3' };

// Back on a board, Home shut, nothing holding the keyboard
const onBoard = async (id: string) => {
  await page.evaluate(async b => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    await window.__fenmyr.openBoard(b);
    document.getElementById('homeClose')?.click();
  }, id);
  await still(page);
};
const home = async (at: string) => {
  await page.evaluate(h => window.__fenmyr.openHome(h), at);
  await still(page);
};
const run = (kind: string, key: string, at?: At) =>
  page.evaluate(
    ([k, name, place]) => {
      const entry = window.__fenmyr.templateEntries().find(e => e.kind === k && e.key === name);
      if (!entry) throw new Error(`no ${k} called ${name} in the picker`);
      return window.__fenmyr.runTemplate(entry, place);
    },
    [kind, key, at] as const,
  );
const cardsOf = (id: string) =>
  page.evaluate(async b => {
    const board = await Fenmyr.load(b);
    return board?.cards?.length ?? 0;
  }, id);
const openCards = () => page.evaluate(() => window.__fenmyr.curBoard().cards.length);
// A board that arrives with cards is fitted to the window, which moves it off the view a new board starts with
const fitted = () => page.waitForFunction(() => window.__fenmyr.view.z !== 1 || window.__fenmyr.view.x !== 160);

try {
  await seedLibrary(page);

  await check('a starter goes where it is told, not where Home or the open board is, and shows it', async () => {
    await onBoard('a');
    await home('project:p4');
    const made = await makes(page, 'board', () => run('starter', 'Moodboard', TOOLS));
    await still(page);
    assert.deepStrictEqual([made.name, made.folder], ['Moodboard', 'f3'], 'in Tools, not Bare’s Home or Ideas');
    const seen = await look(page);
    assert.deepStrictEqual([seen.board, seen.home, seen.nameFocused], ['Moodboard', false, false], 'shown, Home shut');
    assert.ok((await openCards()) > 0, 'with its cards');
    await fitted();

    await home('project:p4');
    const quiet = await makes(page, 'board', () => run('starter', 'Moodboard'));
    await still(page);
    assert.deepStrictEqual(
      [quiet.folder ?? null, (await look(page)).home],
      [null, true],
      'no place: as the picker was',
    );
  });

  await check(
    'the example board goes where it is told, to a project’s first folder when only that is named',
    async () => {
      await onBoard('a');
      const made = await makes(page, 'board', () =>
        page.evaluate(() => window.__fenmyr.createExample({ project: 'p2', folder: null })),
      );
      await still(page);
      assert.deepStrictEqual([made.name, made.folder], ['My first board', 'f2'], 'Garden’s first folder');
      assert.deepStrictEqual([(await look(page)).board, (await look(page)).home], ['My first board', false]);
      assert.ok((await openCards()) > 0, 'with its cards');
      await fitted();
    },
  );

  await check('a framework with a place is a new board named after it, with the framework on it', async () => {
    await onBoard('a');
    const before = await cardsOf('a');
    await home('all');
    const made = await makes(page, 'board', () => run('framework', 'empathy', TOOLS));
    await still(page);
    assert.deepStrictEqual([made.name, made.folder], ['Empathy map', 'f3'], 'a board named after it, in Tools');
    const seen = await look(page);
    assert.deepStrictEqual([seen.board, seen.home, seen.nameFocused], ['Empathy map', false, false]);
    assert.ok((await openCards()) > 1, 'the framework’s cards are on it');
    assert.strictEqual(await cardsOf('a'), before, 'and none were added to the board that was open');
    await page.waitForFunction(() => window.__fenmyr.curBoard().cards.length > 1);
    assert.strictEqual((await stored(page)).boards.filter(b => b.name === 'Empathy map').length, 1, 'one board, saved');
  });

  await check('a framework with no place still adds to the board that is open', async () => {
    await onBoard('a');
    const before = await openCards();
    const boards = (await stored(page)).boards.length;
    await run('framework', 'empathy');
    await still(page);
    assert.ok((await openCards()) > before, 'its cards land on this board');
    assert.strictEqual((await look(page)).board, 'a');
    assert.strictEqual((await stored(page)).boards.length, boards, 'and no board was made');
  });

  await check('one of Yours makes a board at the place, whether it adds or opens a new board', async () => {
    await onBoard('a');
    const keep = (name: string, mode: 'add' | 'new') =>
      page.evaluate(([n, m]) => window.__fenmyr.saveAsTemplate(n, null, { desc: '', mode: m }), [name, mode] as const);
    const adds = await keep('Weekly notes', 'add');
    const opens = await keep('Client kickoff', 'new');
    const want = await openCards();
    for (const t of [adds, opens]) {
      assert.ok(t, 'saved');
      await onBoard('a');
      await home('project:p4');
      const made = await makes(page, 'board', () => run('mine', t?.id ?? '', { project: 'p1', folder: 'f1' }));
      await still(page);
      assert.deepStrictEqual([made.name, made.folder], [t?.name, 'f1'], `${t?.name}: in Ideas`);
      assert.deepStrictEqual([(await look(page)).board, (await look(page)).home], [t?.name, false]);
      assert.strictEqual(await openCards(), want, `${t?.name}: the cards it saved`);
    }
    assert.strictEqual(await cardsOf('a'), want, 'and the board that was open has only its own');
  });

  await check('useTemplate takes the place too, and makes a board of one that adds when told to', async () => {
    await onBoard('a');
    const made = await makes(page, 'board', () =>
      page.evaluate(
        async at => {
          const t = await window.__fenmyr.saveAsTemplate('Retro bits', null, { mode: 'add' });
          if (!t) throw new Error('nothing was saved');
          await window.__fenmyr.useTemplate(t, 'new', at);
        },
        { project: 'p2', folder: null },
      ),
    );
    await still(page);
    assert.deepStrictEqual([made.name, made.folder], ['Retro bits', 'f2'], 'Garden’s first folder');
    assert.deepStrictEqual([(await look(page)).board, (await look(page)).home], ['Retro bits', false]);
  });

  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('templateAt: ok');
} finally {
  await l.close();
}
