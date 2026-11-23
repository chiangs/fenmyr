// + Project, + Folder and + Board, the tiles on Home and the + on a sidebar row: each makes what it always made, in the
// place it always put it, and leaves the person looking at what it always left them looking at. These ran before the
// one module made them, and must give the same answers after.
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
const stopTyping = () =>
  page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));

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

  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('createButtons: ok');
} finally {
  await l.close();
}
