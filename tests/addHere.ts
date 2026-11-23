// What + Board and + Folder do, as one function each (src/web/library/addHere.ts) that /board and /folder share: with no
// name they end where the buttons always ended; with one, the board or folder has that name and nothing is left open for
// typing; a prototyping folder asks for a prototype, with the name filled in.
import assert from 'node:assert';
import fs from 'node:fs';
import { launch } from './support/launch.ts';
import { look, makes, press, SEEDED, seedLibrary, stored } from './support/library.ts';
import { freshRepo, openPrototype } from './support/prototype.ts';
import { still } from './support/settled.ts';

const l = await launch({ boards: SEEDED, open: 'a' });
const { page } = l;
const { work, repo } = freshRepo('fenmyr-addhere-');

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
const onBoard = async (id: string) => {
  await page.evaluate(async b => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    await window.__fenmyr.openBoard(b);
    document.getElementById('homeClose')?.click();
  }, id);
  await still(page);
};
const stopTyping = async () => {
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
  await page.evaluate(() => window.__fenmyr.refreshBoards());
  await still(page);
};
const addBoard = (name?: string) =>
  makes(page, 'board', async () => {
    await page.evaluate(n => window.__fenmyr.addBoardHere(n), name);
    await still(page);
  });
const addFolder = (name?: string) =>
  makes(page, 'folder', async () => {
    await page.evaluate(n => window.__fenmyr.addFolderHere(n), name);
    await still(page);
  });

try {
  await seedLibrary(page);

  await check('a board with no name is what + Board makes, and its name is ready to type', async () => {
    await onBoard('a');
    const viaButton = await makes(page, 'board', () => press(page, '#newBoard'));
    const buttonLook = await look(page);
    await onBoard('a');
    const viaFunction = await addBoard();
    const functionLook = await look(page);
    assert.deepStrictEqual(
      [viaFunction.name, viaFunction.folder, functionLook.board, functionLook.home, functionLook.nameSelected],
      [viaButton.name, viaButton.folder, buttonLook.board, buttonLook.home, buttonLook.nameSelected],
    );
    assert.deepStrictEqual(
      [viaFunction.name, viaFunction.folder, functionLook.nameSelected],
      ['Untitled board', 'f1', true],
    );
  });

  await check(
    'a board with a name has it, goes where + Board goes, opens, and leaves nothing to type over',
    async () => {
      await onBoard('a');
      let made = await addBoard('Backlog');
      assert.deepStrictEqual([made.name, made.folder], ['Backlog', 'f1'], 'from a board in Ideas');
      let seen = await look(page);
      assert.deepStrictEqual(
        [seen.id === made.id, seen.board, seen.home, seen.nameFocused, seen.nameSelected],
        [true, 'Backlog', false, false, false],
        'it opens by the name it was given, which is not selected',
      );

      await home('project:p2');
      made = await addBoard('Roadmap');
      assert.deepStrictEqual([made.name, made.folder], ['Roadmap', 'f2'], 'a project’s Home: its first folder');
      seen = await look(page);
      assert.deepStrictEqual([seen.id === made.id, seen.home, seen.nameFocused], [true, false, false]);

      await onBoard('a');
      await home('folder:f3');
      made = await addBoard('Spades');
      assert.deepStrictEqual([made.name, made.folder], ['Spades', 'f3'], 'a folder’s Home: that folder');

      await onBoard('a');
      await home('project:p4');
      made = await addBoard('Bare one');
      assert.strictEqual(made.folder, null, 'a project with no folder: none');
      seen = await look(page);
      assert.deepStrictEqual([seen.id === made.id, seen.home, seen.nameFocused], [true, false, false]);

      await onBoard('a');
      await home('project:p4');
      made = await addBoard();
      seen = await look(page);
      assert.deepStrictEqual(
        [made.name, made.folder, seen.id === made.id, seen.nameFocused],
        ['Untitled board', null, true, false],
        'with no name and no folder, + Board leaves the name alone too',
      );

      await onBoard('a');
      await home('all');
      made = await addBoard('Anywhere');
      assert.strictEqual(made.folder, null, 'All projects: none');

      await onBoard('loose');
      made = await addBoard('Stray');
      assert.strictEqual(made.folder, null, 'from a board in none');
    },
  );

  await check('a board’s name is trimmed, blank means Untitled board, and two alike are allowed', async () => {
    await onBoard('a');
    assert.strictEqual((await addBoard('   Padded  ')).name, 'Padded');
    await onBoard('a');
    assert.strictEqual((await addBoard('   ')).name, 'Untitled board');
    await onBoard('a');
    assert.strictEqual((await addBoard('Twin')).name, 'Twin');
    await onBoard('a');
    assert.strictEqual((await addBoard('Twin')).name, 'Twin', 'board names are not made unique');
  });

  await check('a folder with no name is what + Folder makes, and its name is open for typing', async () => {
    await onBoard('a');
    const viaButton = await makes(page, 'folder', () => press(page, '#newFolder'));
    await stopTyping();
    const viaFunction = await addFolder();
    assert.deepStrictEqual(
      [viaFunction.name, viaFunction.project, viaFunction.parent ?? null],
      ['New folder 2', viaButton.project, viaButton.parent ?? null],
      'the same place, and the next name nobody has',
    );
    assert.deepStrictEqual((await look(page)).renaming, ['New folder 2'], 'its name is open for typing');
    await stopTyping();
  });

  await check('a folder with a name has it, goes where + Folder goes, and opens nothing for typing', async () => {
    await onBoard('a');
    let made = await addFolder('Shelves');
    assert.deepStrictEqual([made.name, made.project, made.parent ?? null], ['Shelves', 'p1', null]);
    assert.deepStrictEqual((await look(page)).renaming, [], 'nothing is being renamed');
    assert.deepStrictEqual((await look(page)).board, 'a', 'and the board stays open');

    made = await addFolder('Shelves');
    assert.strictEqual(made.name, 'Shelves 2', 'a name a folder has is made unique');

    await home('folder:f3');
    made = await addFolder('Beside Tools');
    assert.deepStrictEqual(
      [made.project, made.parent ?? null],
      ['p2', null],
      'a folder’s Home: beside the folder, not inside it',
    );
    await home('all');
    made = await addFolder('Free');
    assert.strictEqual(made.project ?? null, null, 'All projects: in none');
    await onBoard('loose');
    made = await addFolder('Loose too');
    assert.strictEqual(made.project ?? null, null, 'from a board in none');
    assert.deepStrictEqual((await stored(page)).folders.filter(f => f.name === 'Shelves').length, 1);
  });

  await check('in a prototyping folder it asks for a prototype, with the name filled in', async () => {
    await openPrototype(page, repo);
    await still(page);
    const before = (await stored(page)).boards.length;
    const asked = await page.evaluate(async () => {
      const r = await window.__fenmyr.addBoardHere('Checkout');
      return r.kind === 'prototype' ? [r.kind, r.into.name, r.asked] : [r.kind];
    });
    assert.deepStrictEqual(asked, ['prototype', 'Prototypes', true]);
    await page.waitForSelector('.tdlg #npName');
    assert.match((await page.textContent('.tdlg h3')) ?? '', /New prototype in “Prototypes”/);
    assert.strictEqual(await page.inputValue('#npName'), 'Checkout', 'the name it was given');
    await page.keyboard.press('Escape');
    assert.strictEqual((await stored(page)).boards.length, before, 'nothing is made until Create');

    await press(page, '#newBoard');
    await page.waitForSelector('.tdlg #npName');
    assert.strictEqual(await page.inputValue('#npName'), '', 'the button gives no name');
    await page.keyboard.press('Escape');
  });

  await check('in a prototyping folder with no repo it sends the person to link one', async () => {
    await page.evaluate(async () => {
      await window.Fenmyr.saveFolders({
        projects: [{ id: 'p9', name: 'Nobody', open: true }],
        folders: [{ id: 'pf9', name: 'Prototypes', project: 'p9', kind: 'prototyping', open: true }],
        order: {},
      });
      await window.__fenmyr.refreshBoards();
      await window.__fenmyr.openHome('folder:pf9');
    });
    const asked = await page.evaluate(async () => {
      const r = await window.__fenmyr.addBoardHere('Checkout');
      return r.kind === 'prototype' ? r.asked : null;
    });
    assert.strictEqual(asked, false, 'it did not ask for a name');
    await page.waitForSelector('.tdlg.rl');
    await page.keyboard.press('Escape');
  });

  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('addHere: ok');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
}
