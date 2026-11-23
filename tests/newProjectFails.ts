// When a save fails while a project is being started from the New project dialog, the person is told in plain words and
// nothing is thrown at the page. What was half made is taken back, whichever save it was: the project, its Boards folder
// or the board. If the board was saved and only opening it failed, the project is whole and stays.
import assert from 'node:assert';
import { launch } from './support/launch.ts';
import { look, SEEDED, seedLibrary, stored } from './support/library.ts';
import { projectDialog } from './support/projectDialog.ts';
import { still } from './support/settled.ts';

const l = await launch({ boards: SEEDED, open: 'a', settings: { ai: false } });
const { page } = l;
const { onBoard, home, open, row, field, made } = projectDialog(page);

async function check(name: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (e) {
    console.error(`FAIL ${name}`);
    throw e;
  }
}

const FULL = 'ENOSPC: no space left on device';
const UNREADABLE = 'EIO: input/output error';
type Break = 'project' | 'folder' | 'board' | 'open';

// Makes one bridge call fail, as it does when the disk is full: the first save of the library, the second, a save of a
// board nobody had yet, or the load that opens one. The boards the test starts with go through as they always do.
const breakOne = (which: Break) =>
  page.evaluate(
    ([w, full, unreadable]) => {
      const kept = ['a', 'b', 'loose'];
      const real = {
        saveFolders: window.Fenmyr.saveFolders,
        save: window.Fenmyr.save,
        load: window.Fenmyr.load,
      };
      Reflect.set(window, '__real', real);
      let folderSaves = 0;
      Reflect.set(window.Fenmyr, 'saveFolders', (...a: unknown[]) => {
        folderSaves++;
        const fails = (w === 'project' && folderSaves === 1) || (w === 'folder' && folderSaves === 2);
        return fails ? Promise.reject(new Error(full)) : Reflect.apply(real.saveFolders, window.Fenmyr, a);
      });
      Reflect.set(window.Fenmyr, 'save', (...a: unknown[]) => {
        const board = a[0],
          id = typeof board === 'object' && board !== null && 'id' in board ? String(board.id) : '';
        return w === 'board' && !kept.includes(id)
          ? Promise.reject(new Error(full))
          : Reflect.apply(real.save, window.Fenmyr, a);
      });
      Reflect.set(window.Fenmyr, 'load', (...a: unknown[]) =>
        w === 'open' && !kept.includes(String(a[0]))
          ? Promise.reject(new Error(unreadable))
          : Reflect.apply(real.load, window.Fenmyr, a),
      );
    },
    [which, FULL, UNREADABLE] as const,
  );
const mend = () =>
  page.evaluate(() => {
    const real = Reflect.get(window, '__real');
    for (const op of ['saveFolders', 'save', 'load']) Reflect.set(window.Fenmyr, op, Reflect.get(real, op));
  });

// Starts a project from the dialog with one call failing, and says what is left and what the person was told
async function attempt(which: Break, choice: string, name: string) {
  await onBoard('a');
  await page.evaluate(() => {
    const said = document.getElementById('mSay');
    if (said) said.textContent = '';
  });
  await breakOne(which);
  await open(name);
  const errors = l.errors.length;
  const left = await made(() => row(choice).click());
  await mend();
  await still(page);
  const said = await page.evaluate(() => document.getElementById('mSay')?.textContent ?? '');
  const bubble = await page.evaluate(() => document.getElementById('mBubble')?.classList.contains('on') ?? false);
  return { left, said, bubble, thrown: l.errors.slice(errors), board: (await look(page)).id };
}

const projectNames = async () => {
  await home('all');
  const names = await page.evaluate(() =>
    [...document.querySelectorAll('#homeGrid .tile.project .tile-meta b')].map(b => b.textContent ?? ''),
  );
  await onBoard('a');
  return names;
};

try {
  await seedLibrary(page);
  const start = await stored(page);

  const nothing = (m: Awaited<ReturnType<typeof attempt>>['left']) => [
    m.projects.length,
    m.folders.length,
    m.boards.length,
  ];

  for (const [which, what] of [
    ['project', 'saving the project'],
    ['folder', 'saving its Boards folder'],
    ['board', 'saving the board'],
  ] as const) {
    await check(`${what} fails: they are told, and nothing half made is kept`, async () => {
      const r = await attempt(which, 'Blank board', 'Orchard');
      assert.deepStrictEqual(nothing(r.left), [0, 0, 0], 'nothing is left in the library');
      assert.strictEqual(
        r.said,
        `Could not make the project “Orchard”: ${FULL}. Nothing was kept, so you can try again.`,
      );
      assert.ok(r.bubble, 'and it is on screen');
      assert.deepStrictEqual(r.thrown, [], 'nothing is thrown at the page');
      assert.strictEqual(r.board, 'a', 'the window stays on the board it was on');
      assert.ok(!(await projectNames()).includes('Orchard'), 'All projects does not list it');
      assert.deepStrictEqual(
        (await stored(page)).projects.map(p => p.id),
        start.projects.map(p => p.id),
        'the library file is as it was',
      );
    });
  }

  await check('a starter that fails to save its board is taken back the same way', async () => {
    const r = await attempt('board', 'Starter', 'Orchard');
    assert.deepStrictEqual(nothing(r.left), [0, 0, 0]);
    assert.match(r.said, /^Could not make the project “Orchard”: ENOSPC/);
  });

  await check('the name of a project that failed is free again', async () => {
    await open('Orchard');
    assert.strictEqual((await field())?.value, 'Orchard', 'not “Orchard 2”: nothing is holding the name');
    const m = await made(() => row('Blank board').click());
    assert.deepStrictEqual([m.projects.map(p => p.name), m.folders.map(f => f.name)], [['Orchard'], ['Boards']]);
  });

  await check('a board that was saved and only failed to open keeps its project, and they are told so', async () => {
    const r = await attempt('open', 'Blank board', 'Kept');
    assert.deepStrictEqual(nothing(r.left), [1, 1, 1], 'the project, its folder and its board are all still there');
    assert.strictEqual(
      r.said,
      `Could not finish the project “Kept”: ${UNREADABLE}. What was made is still in All projects.`,
    );
    assert.deepStrictEqual(r.thrown, []);
    assert.ok((await projectNames()).includes('Kept'), 'and All projects lists it');
  });

  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('newProjectFails: ok');
} finally {
  await l.close();
}
