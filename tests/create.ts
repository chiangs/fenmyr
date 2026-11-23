// The one module that makes projects, folders and boards (src/web/library/create.ts): names that nobody else has, the
// place it was given and not the place the open board is in, a board that opens only when asked, and the answer to
// where the open board is.
import assert from 'node:assert';
import { launch } from './support/launch.ts';
import { look, makes, SEEDED, seedLibrary, stored } from './support/library.ts';
import { still } from './support/settled.ts';

const l = await launch({ boards: SEEDED, open: 'a' });
const { page } = l;

async function check(name: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (e) {
    console.error(`FAIL ${name}`);
    throw e;
  }
}

const NONE = { project: null, folder: null };
const placeOf = (project: string | null, folder: string | null) => ({ project, folder });
const project = (name?: string) => page.evaluate(n => window.__fenmyr.createProject(n), name);
const folder = (at: { project: string | null; folder: string | null }, name?: string) =>
  page.evaluate(([p, n]) => window.__fenmyr.createFolder(p, n), [at, name] as const);

try {
  await seedLibrary(page);

  await check('where the open board is: its folder and project, or what Home is showing', async () => {
    const here = () => page.evaluate(() => window.__fenmyr.currentPlace());
    await page.evaluate(() => window.__fenmyr.openBoard('a'));
    assert.deepStrictEqual(await here(), placeOf('p1', 'f1'), 'a board in a folder');
    await page.evaluate(() => window.__fenmyr.openBoard('loose'));
    assert.deepStrictEqual(await here(), NONE, 'a board in none');
    await page.evaluate(() => window.__fenmyr.openBoard('a'));
    for (const [home, want] of [
      ['all', NONE],
      ['project:p2', placeOf('p2', null)],
      ['folder:f3', placeOf('p2', 'f3')],
      ['project:p3', placeOf('p3', null)],
    ] as const) {
      await page.evaluate(h => window.__fenmyr.openHome(h), home);
      assert.deepStrictEqual(await here(), want, `Home at ${home}, over a board in Ideas`);
    }
  });

  await check('a project takes a name nobody has, whatever the case and spacing', async () => {
    assert.strictEqual((await project()).name, 'New project');
    assert.strictEqual((await project()).name, 'New project 2');
    assert.strictEqual((await project('Shop')).name, 'Shop 2');
    assert.strictEqual((await project('  shop ')).name, 'shop 3');
    assert.strictEqual((await project('   ')).name, 'New project 3', 'a name of spaces is the default one');
    assert.strictEqual((await project('Brand new')).name, 'Brand new', 'a free name is kept as it is');
    const names = (await stored(page)).projects.map(p => p.name);
    assert.strictEqual(new Set(names.map(n => n.toLowerCase())).size, names.length, `no two alike in ${names}`);
  });

  await check('a folder takes a name no folder has, in any project', async () => {
    assert.strictEqual((await folder(placeOf('p1', null))).name, 'New folder');
    assert.strictEqual((await folder(placeOf('p1', null))).name, 'New folder 2');
    assert.strictEqual(
      (await folder(placeOf('p1', null), 'Plants')).name,
      'Plants 2',
      'Plants is Garden’s, not Shop’s',
    );
    assert.strictEqual((await folder(NONE, 'TOOLS')).name, 'TOOLS 2');
  });

  await check('a board keeps its name: two Untitled boards have always been allowed', async () => {
    const [one, two] = await page.evaluate(async () => [
      await window.__fenmyr.createBoard({ project: 'p1', folder: 'f1' }),
      await window.__fenmyr.createBoard({ project: 'p1', folder: 'f1' }),
    ]);
    assert.deepStrictEqual([one?.name, two?.name], ['Untitled board', 'Untitled board']);
    assert.notStrictEqual(one?.id, two?.id);
  });

  await check('a folder goes where it is told, not where the open board is', async () => {
    assert.strictEqual(
      await page.evaluate(() => window.__fenmyr.curBoard().folder),
      'f1',
      'the open board is in Ideas',
    );
    const top = await makes(page, 'folder', () => folder(placeOf('p2', null), 'Top'));
    assert.deepStrictEqual([top.project, top.parent ?? null], ['p2', null], 'at the top of Garden');
    const inside = await makes(page, 'folder', () => folder(placeOf('p2', 'f3'), 'Inside'));
    assert.deepStrictEqual([inside.project, inside.parent], ['p2', 'f3'], 'inside Tools, which is in Garden');
    const loose = await makes(page, 'folder', () => folder(NONE, 'Loose'));
    assert.deepStrictEqual([loose.project ?? null, loose.parent ?? null], [null, null], 'in no project');
  });

  await check('a board goes in the folder it is told, or its project’s first, or none', async () => {
    const make = (at: { project: string | null; folder: string | null }) =>
      makes(page, 'board', () => page.evaluate(p => window.__fenmyr.createBoard(p), at));
    assert.strictEqual((await make(placeOf('p2', 'f3'))).folder, 'f3', 'a folder');
    assert.strictEqual((await make(placeOf('p2', null))).folder, 'f2', 'a project: its first folder');
    assert.strictEqual((await make(placeOf(null, 'f3'))).folder, 'f3', 'the folder wins');
    assert.strictEqual((await make(placeOf('p3', null))).folder, null, 'a project with no folder: loose');
    assert.strictEqual((await make(NONE)).folder, null, 'neither: loose, though the open board is in Ideas');
    assert.strictEqual(await page.evaluate(() => window.__fenmyr.curBoard().id), 'a', 'and none of it opened');
  });

  await check('a board opens only when asked, and in the way it was asked', async () => {
    // Home is open over a board in Ideas each time, so what it does to Home shows
    const make = (id: string, open?: 'name' | 'board' | 'cards') =>
      page.evaluate(
        async ([name, how]) => {
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
          await window.__fenmyr.openBoard('a');
          window.__fenmyr.openHome('folder:f1');
          const board = { id: name, name, cards: [], links: [], tray: [], view: { x: 160, y: 140, z: 1 } };
          await window.__fenmyr.createBoard({ project: 'p1', folder: 'f1' }, how ? { board, open: how } : { board });
        },
        [id, open] as const,
      );
    await make('quiet');
    const quiet = await look(page);
    assert.deepStrictEqual([quiet.board, quiet.home], ['a', true], 'not asked: the open board and Home stay');
    assert.ok(
      (await stored(page)).boards.some(b => b.id === 'quiet'),
      'but it is saved',
    );
    assert.ok(
      await page.evaluate(() => document.getElementById('homeGrid')?.textContent?.includes('quiet')),
      'and Home shows it',
    );

    await make('named', 'name');
    await still(page);
    const named = await look(page);
    assert.deepStrictEqual(
      [named.board, named.home, named.nameSelected],
      ['named', false, true],
      'name: opens, closes Home, selects the name',
    );

    await make('plain', 'board');
    await still(page);
    const plain = await look(page);
    assert.deepStrictEqual([plain.board, plain.home, plain.nameFocused], ['plain', false, false], 'board: no name');

    await make('cards', 'cards');
    await still(page);
    const cards = await look(page);
    assert.deepStrictEqual([cards.board, cards.home, cards.nameFocused], ['cards', true, false], 'cards: Home stays');
  });

  await check('the board it is given is the one saved, and fitted when it has cards', async () => {
    await page.evaluate(() => window.__fenmyr.openBoard('a'));
    const made = await page.evaluate(async () => {
      const { id, name, folder } = await window.__fenmyr.createBoard(
        { project: 'p2', folder: 'f2' },
        {
          board: {
            id: 'mine',
            name: 'Mine',
            cards: [{ id: 'far', type: 'note', x: 4000, y: 3000, w: 220, h: 120, r: 0, color: 'white', text: 'Far' }],
            links: [],
            tray: [],
            view: { x: 160, y: 140, z: 1 },
          },
          open: 'cards',
        },
      );
      return { id, name, folder };
    });
    assert.deepStrictEqual(made, { id: 'mine', name: 'Mine', folder: 'f2' });
    await page.waitForFunction(() => window.__fenmyr.curBoard().id === 'mine' && window.__fenmyr.view.x !== 160);
    assert.strictEqual((await stored(page)).boards.find(b => b.id === 'mine')?.folder, 'f2');
  });

  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('create: ok');
} finally {
  await l.close();
}
