// Her folders.create: "make a folder called Shelves" makes what /folder makes, at the top of the project the person is
// in, or of the project she names, and she says so in the words /folder uses. A project that is not there is not made
// for it, and bad, empty and repeated names, or more than twelve, cost only themselves.
import assert from 'node:assert';
import { launch } from './support/launch.ts';
import { look, makes, SEEDED, seedLibrary, stored } from './support/library.ts';
import { projectDialog } from './support/projectDialog.ts';
import { replyChat } from './support/replyChat.ts';
import { templateChat } from './support/templateChat.ts';

const l = await launch({ boards: SEEDED, open: 'a', claude: true });
const { page } = l;
const { openChat, typed, heard } = templateChat(page);
const { answer, ask, chat } = replyChat(page);
const dlg = projectDialog(page);

async function check(name: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (e) {
    console.error(`FAIL ${name}`);
    throw e;
  }
}
const startOn = async (id: string) => {
  await dlg.onBoard(id);
  await openChat();
};
const folderNames = async () => (await stored(page)).folders.map(f => f.name).sort();
const lastLine = async () => (await chat()).stored.at(-1);

try {
  await seedLibrary(page);
  await openChat();

  await check('a name makes a folder at the top of this project, and she says it as /folder does', async () => {
    await startOn('a');
    const mark = await typed('/folder Slashed');
    const [slashed] = (await heard(mark, 'I made the folder')).map(m => m.text);
    await answer({ say: 'Sure.', folders: { create: ['Shelves'] } });
    const made = await makes(page, 'folder', () => ask('make a folder called Shelves'));
    assert.deepStrictEqual([made.project, made.parent ?? null], ['p1', null], 'at the top of Shop');
    assert.strictEqual(await lastLine(), `myra: Sure. ${slashed?.replace('Slashed', 'Shelves')}`, 'the same words');
    const seen = await look(page);
    assert.deepStrictEqual(
      [seen.id, seen.home, seen.renaming],
      ['a', false, []],
      'the board stays and nothing is renamed',
    );
  });

  await check('a folder with the name of one is made with the next free name, and she says it was taken', async () => {
    await startOn('a');
    await answer({ say: 'Sure.', folders: { create: ['Ideas'] } });
    await ask('a folder');
    assert.strictEqual(await lastLine(), 'myra: Sure. I made the folder “Ideas 2” in “Shop”, as “Ideas” was taken ✦');
  });

  await check('a project she names, in any case, is where it goes, and she says so', async () => {
    await startOn('a');
    await answer({
      say: 'Sure.',
      folders: {
        create: [
          { name: 'Seeds', project: 'garden' },
          { name: 'Tills', project: 'Shop' },
        ],
      },
    });
    await ask('two folders');
    const lib = await stored(page);
    assert.strictEqual(
      lib.folders.find(f => f.name === 'Seeds')?.project,
      'p2',
      'in Garden, though the board is in Shop',
    );
    assert.strictEqual(lib.folders.find(f => f.name === 'Tills')?.project, 'p1');
    assert.strictEqual(
      await lastLine(),
      'myra: Sure. I made the folder “Seeds” in “Garden” ✦ I made the folder “Tills” in “Shop” ✦',
    );
  });

  await check('a project that is not there is not made, the folder is left out, and the rest are made', async () => {
    await startOn('a');
    const projects = (await stored(page)).projects.length;
    await answer({
      say: 'Sure.',
      folders: { create: [{ name: 'Lost', project: 'Nowhere' }, 'Found'] },
    });
    await ask('folders');
    const lib = await stored(page);
    assert.strictEqual(lib.projects.length, projects, 'no project is made for it');
    assert.ok(!lib.folders.some(f => f.name === 'Lost'));
    assert.strictEqual(
      await lastLine(),
      'myra: Sure. There is no project called “Nowhere” yet, so I did not make the folder “Lost”. I made the folder “Found” in “Shop” ✦',
    );
  });

  await check(
    'with no project it is loose, as /folder makes it, and from a folder’s Home it goes beside it',
    async () => {
      await startOn('loose');
      await answer({ say: 'Sure.', folders: { create: ['Offcuts'] } });
      const loose = await makes(page, 'folder', () => ask('a folder'));
      assert.strictEqual(loose.project ?? null, null);
      assert.strictEqual(await lastLine(), 'myra: Sure. I made the folder “Offcuts” ✦');

      await startOn('a');
      await dlg.home('folder:f3');
      await answer({ say: 'Sure.', folders: { create: ['Benches'] } });
      const beside = await makes(page, 'folder', () => ask('a folder'));
      assert.deepStrictEqual(
        [beside.project, beside.parent ?? null],
        ['p2', null],
        'at the top of Garden, not inside Tools',
      );
    },
  );

  await check('bad, empty and repeated entries are left out alone', async () => {
    await startOn('a');
    const before = await folderNames();
    await answer({
      say: 'Sure.',
      folders: {
        create: ['Alpha', '', null, 7, {}, { name: '' }, { project: 'Shop' }, 'alpha', { name: 'Beta', project: null }],
      },
    });
    await ask('folders');
    assert.deepStrictEqual(
      (await folderNames()).filter(n => !before.includes(n)),
      ['Alpha', 'Beta'],
    );
    for (const odd of [{ create: [] }, { create: ['', '  '] }, { create: 'Alpha' }, 'Alpha', 7]) {
      const was = await folderNames();
      await answer({ say: 'Nothing.', folders: odd });
      await ask('folders');
      assert.deepStrictEqual(await folderNames(), was, `${JSON.stringify(odd)} makes nothing`);
    }
  });

  await check('twelve are made from one reply and she says she left the rest out', async () => {
    await startOn('a');
    const before = await folderNames();
    const names = Array.from({ length: 20 }, (_, i) => `Drawer ${i + 1}`);
    await answer({ say: 'Lots.', folders: { create: names } });
    await ask('folders');
    assert.deepStrictEqual((await folderNames()).filter(n => !before.includes(n)).sort(), names.slice(0, 12).sort());
    assert.ok((await lastLine())?.endsWith('I make up to 12 at a time, so I did not make the last 8.'));
  });

  await check('sorting in the same reply still works on the folders she has just made', async () => {
    await startOn('a');
    await answer({
      say: 'Sorted.',
      folders: {
        create: ['Plans'],
        rename: [{ from: 'Plans', to: 'Designs' }],
        move: [{ board: 'b', folder: 'Designs' }],
      },
    });
    await ask('sort');
    const lib = await stored(page);
    const designs = lib.folders.find(f => f.name === 'Designs');
    assert.ok(designs && !lib.folders.some(f => f.name === 'Plans 2'), 'made once and renamed');
    assert.strictEqual(lib.boards.find(b => b.id === 'b')?.folder, designs?.id, 'and the board was moved into it');
  });

  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('myraFolders: ok');
} finally {
  await l.close();
}
