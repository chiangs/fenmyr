// Every + Project opens the New project dialog: the sidebar button from a board and from each level of Home, and Home's
// New project tile. From a board it used to make a project that nothing showed, and people clicked again. Opening makes
// nothing, cancelling makes nothing, and a double click on the button leaves one dialog.
import assert from 'node:assert';
import { launch } from './support/launch.ts';
import { look, SEEDED, seedLibrary, stored } from './support/library.ts';
import { projectDialog } from './support/projectDialog.ts';
import { still } from './support/settled.ts';

const l = await launch({ boards: SEEDED, open: 'a' });
const { page } = l;
const { onBoard, home, shown, gone, row, field, made, oneStart, openId } = projectDialog(page);

async function check(name: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (e) {
    console.error(`FAIL ${name}`);
    throw e;
  }
}

const counts = async () => {
  const lib = await stored(page);
  return [lib.projects.length, lib.folders.length, lib.boards.length];
};
// A real click, as a person makes it
const pressButton = (selector: string, label = '') => page.locator(selector, label ? { hasText: label } : {}).click();

try {
  await seedLibrary(page);

  await check('from a board, + Project opens the dialog and makes nothing until a row is chosen', async () => {
    await onBoard('a');
    const was = await counts();
    await pressButton('#newProject');
    await page.waitForSelector('#npDlg');
    await still(page);
    assert.deepStrictEqual(await counts(), was, 'nothing is made by opening it');
    assert.strictEqual((await field())?.value, 'New project');
    assert.strictEqual(await openId(), 'a', 'the board stays open under it');
    await page.keyboard.press('Escape');
    await gone();
    assert.deepStrictEqual(await counts(), was, 'cancelling makes nothing');
    assert.deepStrictEqual([(await look(page)).board, (await look(page)).home], ['a', false]);
  });

  await check('at every level of Home the button opens it, and so does the tile on All projects', async () => {
    for (const at of ['all', 'project:p2', 'folder:f3']) {
      await onBoard('a');
      await home(at);
      const was = await counts();
      await pressButton('#newProject');
      await page.waitForSelector('#npDlg');
      assert.ok(await shown(), `Home at ${at}`);
      await page.keyboard.press('Escape');
      await gone();
      assert.deepStrictEqual(await counts(), was, `Home at ${at}: cancelling makes nothing`);
      assert.strictEqual((await look(page)).home, true, `Home at ${at} stays open under a cancelled dialog`);
    }
    await home('all');
    const was = await counts();
    await pressButton('#homeGrid .tile.add', 'New project');
    await page.waitForSelector('#npDlg');
    assert.deepStrictEqual(await counts(), was, 'the tile opens it and makes nothing');
    assert.strictEqual((await field())?.value, 'New project');
    await page.keyboard.press('Escape');
    await gone();
    assert.strictEqual(await page.locator('#homeGrid [contenteditable="true"]').count(), 0, 'no tile is being renamed');
  });

  await check('a choice from the button or the tile makes one project and ends on its board', async () => {
    await onBoard('a');
    await pressButton('#newProject');
    await page.waitForSelector('#npDlg');
    const fromBoard = oneStart(await made(() => row('Blank board').click()));
    assert.strictEqual(fromBoard.project.name, 'New project');
    assert.strictEqual(await openId(), fromBoard.board.id, 'the window is on its board');

    await home('all');
    await pressButton('#homeGrid .tile.add', 'New project');
    await page.waitForSelector('#npDlg');
    const fromTile = oneStart(await made(() => row('Starter').click()));
    assert.strictEqual(fromTile.project.name, 'New project 2');
    const seen = await look(page);
    assert.deepStrictEqual([seen.board, seen.home], ['My first board', false], 'Home has closed on its board');
  });

  await check('a double click on + Project leaves one dialog, and a choice in it makes one project', async () => {
    await onBoard('a');
    const was = await counts();
    await page.dblclick('#newProject');
    await page.waitForSelector('#npDlg');
    await still(page);
    assert.strictEqual(await page.locator('#npDlg').count(), 1, 'one dialog');
    assert.ok(await shown(), 'and the second click did not close it');
    assert.deepStrictEqual(await counts(), was, 'nothing is made');
    oneStart(await made(() => row('Blank board').click()));
  });

  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('newProjectButtons: ok');
} finally {
  await l.close();
}
