// Her folders.file and folders.move work on what is there and make no project. A folder that is not there is not made by
// file, and is made by move the way /folder makes one, with a line saying so; a project that is not there costs only its
// own entry. A name is looked for in the project the person is in first, so two projects that each have a "Boards"
// folder are not mixed up. For move a project she names is the only one looked in, and the folder is made there when it
// is not, numbered as /folder numbers it.
import assert from 'node:assert';
import type { Folder } from '../src/shared/model.ts';
import { launch } from './support/launch.ts';
import { makes, SEEDED, seedLibrary, stored } from './support/library.ts';
import { projectDialog } from './support/projectDialog.ts';
import { replyChat } from './support/replyChat.ts';
import { templateChat } from './support/templateChat.ts';

const l = await launch({ boards: SEEDED, open: 'a', claude: true });
const { page } = l;
const { openChat } = templateChat(page);
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

// Shop's comes first in the list, so a name found across the library is Shop's whoever asks
const BOARDS: Folder[] = [
  { id: 'fb1', name: 'Boards', project: 'p1', open: true },
  { id: 'fb2', name: 'Boards', project: 'p2', open: true },
];
// The seeded library as it was, with the boards where they began: a in Ideas (Shop), b in Plants (Garden), loose in none
async function startOn(id: string) {
  await seedLibrary(page, BOARDS);
  await page.evaluate(async () => {
    const at: [string, string | null][] = [
      ['a', 'f1'],
      ['b', 'f2'],
      ['loose', null],
    ];
    for (const [board, folder] of at) await window.__fenmyr.moveBoard(board, folder);
  });
  await dlg.onBoard(id);
  await openChat();
}
const lastLine = async () => (await chat()).stored.at(-1);
const projectOf = async (folder: string) => (await stored(page)).folders.find(f => f.id === folder)?.project ?? null;
const folderOf = async (board: string) => (await stored(page)).boards.find(b => b.id === board)?.folder ?? null;
const counts = async () => {
  const s = await stored(page);
  return [s.projects.length, s.folders.length];
};
// her reply, asked for the way a person would
const reply = async (folders: object) => {
  await answer({ say: 'Sure.', folders });
  await ask('sort my library');
};

try {
  await check('file puts a folder into the project she names, in any case, and null takes it out', async () => {
    await startOn('a');
    await reply({ file: [{ folder: 'tools', project: 'shop' }] });
    assert.strictEqual(await projectOf('f3'), 'p1', 'Tools moved from Garden to Shop');
    assert.strictEqual(await lastLine(), 'myra: Sure.', 'nothing to tell');
    await reply({ file: [{ folder: 'Tools', project: null }] });
    assert.strictEqual(await projectOf('f3'), null, 'and out of its project');
  });

  await check('file leaves out a folder that is not there with a line, and makes nothing', async () => {
    await startOn('a');
    const before = await counts();
    await reply({
      file: [
        { folder: 'Ghost', project: 'Shop' },
        { folder: 'Plants', project: 'Shop' },
      ],
    });
    assert.deepStrictEqual(await counts(), before, 'no folder is made for it');
    assert.strictEqual(await projectOf('f2'), 'p1', 'the other entry still applies');
    assert.strictEqual(await lastLine(), 'myra: Sure. I could not find a folder called “Ghost”, so I did not move it.');
  });

  await check('file makes no project: that entry is left out with the line folders.create uses', async () => {
    await startOn('a');
    const before = await counts();
    await reply({
      file: [
        { folder: 'Tools', project: 'Nowhere' },
        { folder: 'Plants', project: 'Shop' },
      ],
    });
    assert.deepStrictEqual(await counts(), before, 'no project is made');
    assert.strictEqual(await projectOf('f3'), 'p2', 'Tools stays in Garden');
    assert.strictEqual(await projectOf('f2'), 'p1', 'the other entry still applies');
    assert.strictEqual(
      await lastLine(),
      'myra: Sure. There is no project called “Nowhere” yet, so I did not make the folder “Tools”.',
    );
  });

  await check(
    'file takes the Boards folder of the project the person is in, not the first in the library',
    async () => {
      await startOn('b');
      await reply({ file: [{ folder: 'Boards', project: 'Empty' }] });
      assert.deepStrictEqual([await projectOf('fb2'), await projectOf('fb1')], ['p3', 'p1'], 'Garden’s, not Shop’s');
    },
  );

  await check('file does not look in the project it is filing into', async () => {
    await startOn('a');
    await reply({ file: [{ folder: 'Boards', project: 'Garden' }] });
    assert.deepStrictEqual(
      [await projectOf('fb1'), await projectOf('fb2')],
      ['p2', 'p2'],
      'Shop’s moved, though Garden already has one',
    );
  });

  await check('move goes into the Boards folder of the project the person is in', async () => {
    await startOn('b');
    await reply({ move: [{ board: 'loose', folder: 'Boards' }] });
    assert.strictEqual(await folderOf('loose'), 'fb2', 'Garden’s, though Shop’s comes first');
    await startOn('a');
    await reply({ move: [{ board: 'loose', folder: 'Boards' }] });
    assert.strictEqual(await folderOf('loose'), 'fb1', 'and Shop’s when they are in Shop');
  });

  await check('the project move names is the one looked in, not the one the person is in', async () => {
    await startOn('a');
    const before = await counts();
    await reply({ move: [{ board: 'loose', folder: 'Boards', project: 'garden' }] });
    assert.strictEqual(await folderOf('loose'), 'fb2');
    assert.deepStrictEqual(await counts(), before, 'nothing is made');
    assert.strictEqual(await lastLine(), 'myra: Sure.');
  });

  await check(
    'with a project named, a folder only another project has is made in it, numbered, and told as made',
    async () => {
      await startOn('a');
      const made = await makes(page, 'folder', () =>
        reply({
          move: [
            { board: 'loose', folder: 'Tools', project: 'Shop' },
            { board: 'a', folder: 'tools', project: 'Shop' },
          ],
        }),
      );
      assert.deepStrictEqual([made.name, made.project], ['Tools 2', 'p1'], 'in Shop, not Garden’s Tools');
      assert.deepStrictEqual([await folderOf('loose'), await folderOf('a')], [made.id, made.id], 'one folder for both');
      assert.strictEqual(await projectOf('f3'), 'p2', 'Garden’s Tools stays where it was');
      assert.strictEqual(await lastLine(), 'myra: Sure. I made the folder “Tools 2” in “Shop”, as “Tools” was taken ✦');
    },
  );

  await check('with a project named, the folder is not taken from the project the person is in', async () => {
    await startOn('a');
    const made = await makes(page, 'folder', () =>
      reply({ move: [{ board: 'loose', folder: 'Ideas', project: 'Garden' }] }),
    );
    assert.deepStrictEqual([made.name, made.project], ['Ideas 2', 'p2'], 'in Garden, though Shop has an Ideas');
    assert.strictEqual(await folderOf('loose'), made.id);
    assert.strictEqual(await lastLine(), 'myra: Sure. I made the folder “Ideas 2” in “Garden”, as “Ideas” was taken ✦');
  });

  await check('a folder only one project has is found from anywhere, and nothing is made', async () => {
    await startOn('a');
    const before = await counts();
    await reply({ move: [{ board: 'loose', folder: 'Tools' }] });
    assert.strictEqual(await folderOf('loose'), 'f3');
    assert.deepStrictEqual(await counts(), before);
  });

  await check(
    'a folder that is not there is made as /folder makes it, in the project she is in, and told',
    async () => {
      await startOn('b');
      const made = await makes(page, 'folder', () => reply({ move: [{ board: 'loose', folder: 'Cupboard' }] }));
      assert.deepStrictEqual([made.name, made.project, made.parent ?? null], ['Cupboard', 'p2', null]);
      assert.strictEqual(await folderOf('loose'), made.id, 'and the board is in it');
      assert.strictEqual(await lastLine(), 'myra: Sure. I made the folder “Cupboard” in “Garden” ✦');
    },
  );

  await check(
    'with a project named it is made there, once for two boards, and left loose with no project',
    async () => {
      await startOn('b');
      const made = await makes(page, 'folder', () =>
        reply({
          move: [
            { board: 'loose', folder: 'Cupboard', project: 'Shop' },
            { board: 'a', folder: 'cupboard', project: 'Shop' },
          ],
        }),
      );
      assert.strictEqual(made.project, 'p1', 'in Shop, though she is in Garden');
      assert.deepStrictEqual([await folderOf('loose'), await folderOf('a')], [made.id, made.id], 'one folder for both');
      assert.strictEqual(await lastLine(), 'myra: Sure. I made the folder “Cupboard” in “Shop” ✦');

      await startOn('loose');
      const loose = await makes(page, 'folder', () => reply({ move: [{ board: 'a', folder: 'Shelf' }] }));
      assert.strictEqual(loose.project ?? null, null, 'loose, as /folder makes it for someone in no project');
      assert.strictEqual(await lastLine(), 'myra: Sure. I made the folder “Shelf” ✦');
    },
  );

  await check('move makes no project: that entry is left out with the line, and the rest still apply', async () => {
    await startOn('b');
    const before = await counts();
    await reply({
      move: [
        { board: 'loose', folder: 'Boards', project: 'Nowhere' },
        { board: 'a', folder: 'Plants' },
      ],
    });
    assert.deepStrictEqual(await counts(), before, 'no project and no folder is made');
    assert.strictEqual(await folderOf('loose'), null, 'the board stays where it was');
    assert.strictEqual(await folderOf('a'), 'f2', 'the other entry still applies');
    assert.strictEqual(
      await lastLine(),
      'myra: Sure. There is no project called “Nowhere” yet, so I did not make the folder “Boards”.',
    );
  });

  await check('null takes a board out of its folder, as it did', async () => {
    await startOn('b');
    await reply({ move: [{ board: 'a', folder: null }] });
    assert.strictEqual(await folderOf('a'), null);
  });

  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('myraFileMove: ok');
} finally {
  await l.close();
}
