// Each level of Home says what to do when it has nothing in it: All projects with no project, a project with no folder,
// a folder with no board, and a prototyping folder with no prototype. The line names the tile below it and the slash
// command that does the same, and it goes once something is added.
import assert from 'node:assert';
import type { Folder, Project } from '../src/shared/model.ts';
import { launch } from './support/launch.ts';
import { SEEDED } from './support/library.ts';
import { still } from './support/settled.ts';

const l = await launch({ boards: SEEDED, open: 'a', settings: { ai: false } });
const { page } = l;

async function check(name: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (e) {
    console.error(`FAIL ${name}`);
    throw e;
  }
}

// Shop has no folder. Garden has Ideas (with a board), Tools (nothing), Shelf (a folder inside it and no board) and
// Prototypes, which holds prototypes and has none.
const PROJECTS: Project[] = [
  { id: 'p1', name: 'Shop', open: true },
  { id: 'p2', name: 'Garden', open: true },
];
const FOLDERS: Folder[] = [
  { id: 'f1', name: 'Ideas', project: 'p2', open: true },
  { id: 'f3', name: 'Tools', project: 'p2', open: true },
  { id: 'f4', name: 'Shelf', project: 'p2', open: true },
  { id: 'f5', name: 'Inner', project: 'p2', parent: 'f4', open: true },
  { id: 'f6', name: 'Prototypes', project: 'p2', kind: 'prototyping', open: true },
];

const keep = (projects: Project[], folders: Folder[]) =>
  page.evaluate(
    async ([p, f]) => {
      await window.Fenmyr.saveFolders({ projects: p, folders: f, order: {} });
      await window.__fenmyr.refreshBoards();
    },
    [projects, folders] as const,
  );
const home = async (at: string) => {
  await page.evaluate(async h => {
    window.__fenmyr.openHome(h);
    await window.__fenmyr.refreshBoards();
  }, at);
  await still(page);
};
const line = () => page.evaluate(() => document.getElementById('homeSub')?.textContent ?? '');
const tiles = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('#homeGrid .tile.add')].map(t => t.textContent?.replace('+', '') ?? ''),
  );

try {
  await check('with no project, All projects says to start one, from the tile or /project', async () => {
    await keep([], []);
    await home('all');
    assert.strictEqual(
      await line(),
      'No projects yet. Choose New project to start one, or type /project in Myra’s chat.',
    );
    assert.deepStrictEqual(await tiles(), ['New project'], 'the tile it names is there');
    const commands = await page.evaluate(() => window.__fenmyr.slashNames());
    assert.ok(commands.includes('project'), 'and /project is a command');
  });

  await check('with a project, All projects goes back to what it said', async () => {
    await keep(PROJECTS, FOLDERS);
    await home('all');
    assert.strictEqual(await line(), 'Every project, with its folders and boards inside.');
  });

  await check('a project with no folder says to add one, and the line goes when one is added', async () => {
    await home('project:p1');
    assert.strictEqual(await line(), 'No folders yet. Choose New folder to add one, or type /folder in Myra’s chat.');
    assert.deepStrictEqual(await tiles(), ['New folder']);
    assert.ok((await page.evaluate(() => window.__fenmyr.slashNames())).includes('folder'));
    await page.locator('#homeGrid .tile.add', { hasText: 'New folder' }).click();
    await page.waitForSelector('#homeGrid .tile.folder');
    await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
    await home('project:p1');
    assert.strictEqual(await line(), '1 folder', 'a folder is there, so it counts');
  });

  await check('a folder with nothing in it says to add a board', async () => {
    await home('folder:f3');
    assert.strictEqual(await line(), 'No boards yet. Choose New board to add one, or type /board in Myra’s chat.');
    assert.deepStrictEqual(await tiles(), ['New board', 'New folder']);
    assert.ok((await page.evaluate(() => window.__fenmyr.slashNames())).includes('board'));
  });

  await check('a folder that holds a folder or a board counts them instead', async () => {
    await home('folder:f4');
    assert.strictEqual(await line(), '1 folder · 0 boards', 'a folder inside it is something');
    await home('folder:f1');
    assert.strictEqual(await line(), '1 board', 'a board is something');
  });

  await check('a prototyping folder with no prototype names its own tile and no command', async () => {
    await home('folder:f6');
    assert.strictEqual(await line(), 'No prototypes yet. Choose New prototype to start one.');
    assert.deepStrictEqual(await tiles(), ['New prototype']);
  });

  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('homeEmpty: ok');
} finally {
  await l.close();
}
