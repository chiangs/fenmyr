// Every path that makes a project, folder or board by hand: the three buttons, the tiles on Home, the + on a sidebar row
// and the project picker. Each makes what it always made, in the place it always put it, and leaves the person looking
// at what it always left them looking at. These ran before the one module made them, and must give the same answers.
import assert from 'node:assert';
import { launch } from './support/launch.ts';
import { look, makes, press, SEEDED, seedLibrary, stored } from './support/library.ts';
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

const home = async (at: string) => {
  await page.evaluate(h => window.__fenmyr.openHome(h), at);
  await still(page);
};
// Leaving a name saves it and redraws the lists, so a redraw of our own, asked for after, is only answered once that is done.
const stopTyping = async () => {
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
  await page.evaluate(() => window.__fenmyr.refreshBoards());
  await still(page);
};
// Back on a board with Home shut, as someone who is working on it
const onBoard = async (id: string) => {
  await page.evaluate(async b => {
    await window.__fenmyr.openBoard(b);
    document.getElementById('homeClose')?.click();
  }, id);
  await still(page);
};

try {
  await seedLibrary(page);

  await check('+ Project makes a project with no folder, and starts its name where the sidebar draws it', async () => {
    const fromBoard = await makes(page, 'project', () => press(page, '#newProject'));
    assert.strictEqual(fromBoard.name, 'New project');
    assert.strictEqual((await stored(page)).folders.filter(f => f.project === fromBoard.id).length, 0, 'no folder');
    const after = await look(page);
    assert.deepStrictEqual([after.board, after.home], ['a', false], 'the open board stays');
    // On a board the sidebar draws only this project, so the new one has no row to rename: it goes unrenamed
    assert.deepStrictEqual(after.renaming, [], 'nothing to type into from a board');

    await home('all');
    const fromHome = await makes(page, 'project', () => press(page, '#newProject'));
    assert.strictEqual(fromHome.name, 'New project 2', 'the next name nobody has');
    assert.deepStrictEqual((await look(page)).renaming, ['New project 2'], 'its name is open for typing');
    await stopTyping();
  });

  await check('the New project tile on Home does the same, renaming on the tile', async () => {
    await home('all');
    const made = await makes(page, 'project', () => press(page, '#homeGrid .tile.add'));
    assert.strictEqual(made.name, 'New project 3');
    assert.deepStrictEqual((await look(page)).renaming, ['New project 3'], 'the tile’s name is open for typing');
    await stopTyping();
  });

  await check('+ Folder makes a folder at the top of the project you are in, and opens its name', async () => {
    await onBoard('a');
    const fromBoard = await makes(page, 'folder', () => press(page, '#newFolder'));
    assert.deepStrictEqual([fromBoard.name, fromBoard.project, fromBoard.parent ?? null], ['New folder', 'p1', null]);
    const after = await look(page);
    assert.deepStrictEqual([after.board, after.home, after.renaming], ['a', false, ['New folder']]);
    await stopTyping();

    await home('all');
    const fromAll = await makes(page, 'folder', () => press(page, '#newFolder'));
    assert.deepStrictEqual([fromAll.name, fromAll.project ?? null], ['New folder 2', null], 'All projects: in none');
    assert.deepStrictEqual((await look(page)).renaming, ['New folder 2']);
    await stopTyping();

    await home('project:p2');
    const fromProject = await makes(page, 'folder', () => press(page, '#newFolder'));
    assert.deepStrictEqual([fromProject.name, fromProject.project], ['New folder 3', 'p2'], 'a project’s Home');
    assert.deepStrictEqual((await look(page)).renaming, ['New folder 3']);
    await stopTyping();

    await home('folder:f3');
    const fromFolder = await makes(page, 'folder', () => press(page, '#newFolder'));
    assert.deepStrictEqual(
      [fromFolder.name, fromFolder.project, fromFolder.parent ?? null],
      ['New folder 4', 'p2', null],
      'a folder’s Home: beside it, not inside it',
    );
    assert.deepStrictEqual((await look(page)).renaming, ['New folder 4']);
    await stopTyping();

    await onBoard('loose');
    const fromLoose = await makes(page, 'folder', () => press(page, '#newFolder'));
    assert.deepStrictEqual([fromLoose.name, fromLoose.project ?? null], ['New folder 5', null], 'a board in none');
    assert.deepStrictEqual((await look(page)).renaming, ['New folder 5']);
    await stopTyping();
  });

  await check(
    'the New folder tiles on Home add to the project, or inside the folder, and rename on the tile',
    async () => {
      await home('project:p2');
      const inProject = await makes(page, 'folder', () => press(page, '#homeGrid .tile.add', 'New folder'));
      assert.deepStrictEqual(
        [inProject.name, inProject.project, inProject.parent ?? null],
        ['New folder 6', 'p2', null],
      );
      assert.deepStrictEqual((await look(page)).renaming, ['New folder 6']);
      await stopTyping();

      await home('folder:f3');
      const inside = await makes(page, 'folder', () => press(page, '#homeGrid .tile.add', 'New folder'));
      assert.deepStrictEqual(
        [inside.name, inside.project, inside.parent],
        ['New folder 7', 'p2', 'f3'],
        'inside Tools',
      );
      assert.deepStrictEqual((await look(page)).renaming, ['New folder 7']);
      await stopTyping();
    },
  );

  await check('the + on a project row adds a folder to it, opens the project, and opens the name', async () => {
    await home('all');
    const row = (name: string) => `#boards .node.project:has(.fname:text-is("${name}"))`;
    await page.click(`${row('Empty')} .node-head .chev`);
    await still(page);
    assert.strictEqual((await stored(page)).projects.find(p => p.id === 'p3')?.open, false, 'Empty is shut');
    const made = await makes(page, 'folder', async () => {
      await page.click(`${row('Empty')} .node-head [data-a="add"]`);
      await page.waitForFunction(() => document.querySelector('[contenteditable="true"]'));
    });
    assert.deepStrictEqual([made.name, made.project], ['New folder 8', 'p3']);
    assert.deepStrictEqual((await look(page)).renaming, ['New folder 8']);
    await stopTyping();
    assert.strictEqual((await stored(page)).projects.find(p => p.id === 'p3')?.open, true, 'Empty is open now');
  });

  await check('“A new project” in the project picker makes one, and goes on to link its repo', async () => {
    await page.evaluate(() => window.__fenmyr.openBoard('loose'));
    await page.evaluate(() => document.querySelector<HTMLElement>('#tplPick [data-prototype]')?.click());
    await page.waitForSelector('.tdlg.sp');
    const made = await makes(page, 'project', async () => {
      await page.click('.tdlg.sp [data-project="new"]');
      await page.waitForSelector('.tdlg.rl');
    });
    assert.strictEqual(made.name, 'New project 4');
    assert.match((await page.textContent('.tdlg.rl h3')) ?? '', /Repo for “New project 4”/);
    await page.keyboard.press('Escape');
  });

  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('createPaths: ok');
} finally {
  await l.close();
}
