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
// A row's buttons show while the mouse is over its head
const plus = async (head: string) => {
  await page.hover(head);
  await page.click(`${head} [data-a="add"]`);
};
// Back on a board with Home shut and nothing holding the keyboard: the name field keeps it from board to board
const onBoard = async (id: string) => {
  await page.evaluate(async b => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    await window.__fenmyr.openBoard(b);
    document.getElementById('homeClose')?.click();
  }, id);
  await still(page);
};

try {
  await seedLibrary(page);

  // + Project used to make an empty project at once, and start its name where the sidebar draws it, which a board does not
  // draw. It opens the New project dialog now (tests/newProjectButtons.ts); these two say what choosing a row leaves behind.
  const choose = async (label: string) => {
    await page.waitForSelector('#npDlg');
    await page.click(`#npDlg .np-row:has-text("${label}")`);
    await page.waitForSelector('#npDlg', { state: 'detached' });
    await still(page);
  };

  await check(
    '+ Project opens the dialog, and its first row makes a project, a Boards folder and a board',
    async () => {
      const fromBoard = await makes(page, 'project', async () => {
        await press(page, '#newProject');
        assert.deepStrictEqual((await stored(page)).projects.length, 4, 'nothing is made until a row is chosen');
        await choose('Blank board');
      });
      assert.strictEqual(fromBoard.name, 'New project');
      const lib = await stored(page);
      assert.deepStrictEqual(
        lib.folders.filter(f => f.project === fromBoard.id).map(f => f.name),
        ['Boards'],
        'its first folder',
      );
      const after = await look(page);
      assert.deepStrictEqual(
        [after.home, after.nameSelected, after.renaming],
        [false, true, []],
        'it opens its blank board with the name selected, and nothing is renamed on a sidebar row',
      );
      const folder = lib.folders.find(f => f.project === fromBoard.id);
      assert.strictEqual(lib.boards.find(b => b.id === after.id)?.folder, folder?.id, 'the board is in that folder');

      await home('all');
      const fromHome = await makes(page, 'project', async () => {
        await press(page, '#newProject');
        await choose('Blank board');
      });
      assert.strictEqual(fromHome.name, 'New project 2', 'the next name nobody has');
      assert.deepStrictEqual([(await look(page)).home, (await look(page)).renaming], [false, []], 'Home closes');
    },
  );

  await check('the New project tile on Home opens the dialog too', async () => {
    await home('all');
    const made = await makes(page, 'project', async () => {
      await press(page, '#homeGrid .tile.add');
      await choose('Blank board');
    });
    assert.strictEqual(made.name, 'New project 3');
    assert.deepStrictEqual([(await look(page)).home, (await look(page)).renaming], [false, []]);
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
      await plus(`${row('Empty')} .node-head`);
      await page.waitForFunction(() => document.querySelector('[contenteditable="true"]'));
    });
    assert.deepStrictEqual([made.name, made.project], ['New folder 8', 'p3']);
    assert.deepStrictEqual((await look(page)).renaming, ['New folder 8']);
    await stopTyping();
    assert.strictEqual((await stored(page)).projects.find(p => p.id === 'p3')?.open, true, 'Empty is open now');
  });

  await check(
    '+ Board makes a board in the folder you are in, or the project’s first, or none, and opens it',
    async () => {
      const opens = async (id: string) => {
        await page.waitForFunction(b => window.__fenmyr.curBoard().id === b, id);
        await still(page);
        return look(page);
      };
      const fromBoard = async (at: string) => {
        await onBoard(at);
        return makes(page, 'board', () => press(page, '#newBoard'));
      };
      const fromHome = async (at: string) => {
        await onBoard('a');
        await home(at);
        return makes(page, 'board', () => press(page, '#newBoard'));
      };
      let made = await fromBoard('a');
      assert.deepStrictEqual([made.name, made.folder], ['Untitled board', 'f1'], 'from a board in Ideas');
      let seen = await opens(made.id);
      assert.deepStrictEqual(
        [seen.board, seen.folder, seen.home, seen.nameSelected],
        ['Untitled board', 'f1', false, true],
        'it opens, with its name ready to type',
      );

      made = await fromHome('project:p2');
      assert.strictEqual(made.folder, 'f2', 'a project’s Home: its first folder');
      seen = await opens(made.id);
      assert.deepStrictEqual([seen.home, seen.nameSelected], [false, true], 'Home closes; the name is ready');

      made = await fromHome('folder:f3');
      assert.strictEqual(made.folder, 'f3', 'a folder’s Home: that folder');
      seen = await opens(made.id);
      assert.deepStrictEqual([seen.home, seen.nameSelected], [false, true]);

      made = await fromHome('project:p4');
      assert.strictEqual(made.folder, null, 'a project with no folder: none');
      seen = await opens(made.id);
      assert.deepStrictEqual([seen.home, seen.nameFocused], [false, false], 'and its name is not selected');

      made = await fromHome('all');
      assert.strictEqual(made.folder, null, 'All projects: none');
      seen = await opens(made.id);
      assert.deepStrictEqual([seen.home, seen.nameFocused], [false, false], 'Home closes; the name is not selected');

      made = await fromBoard('loose');
      assert.strictEqual(made.folder, null, 'from a board in none');
      seen = await opens(made.id);
      assert.deepStrictEqual([seen.home, seen.nameFocused], [false, false]);
    },
  );

  await check('the New board tile and a folder row’s + make a board in that folder, and open it', async () => {
    await onBoard('a');
    await home('folder:f3');
    const tile = await makes(page, 'board', () => press(page, '#homeGrid .tile.add', 'New board'));
    assert.strictEqual(tile.folder, 'f3');
    await page.waitForFunction(b => window.__fenmyr.curBoard().id === b, tile.id);
    await still(page);
    const opened = await look(page);
    assert.deepStrictEqual([opened.board, opened.home, opened.nameSelected], ['Untitled board', false, true]);

    await onBoard('a');
    const row = await makes(page, 'board', async () => {
      await plus('#boards .node.folder:has(.fname:text-is("Ideas")) .node-head');
      await page.waitForFunction(() => document.activeElement?.id === 'boardName');
    });
    assert.strictEqual(row.folder, 'f1');
    await page.waitForFunction(b => window.__fenmyr.curBoard().id === b, row.id);
    assert.deepStrictEqual([(await look(page)).home, (await look(page)).nameSelected], [false, true]);
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
