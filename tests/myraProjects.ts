// Her projects.create opens the New project dialog with the first name in it and makes nothing until the person
// chooses how the first board begins. More than one name, and she says the rest were not made; a name a project has
// starts as Name 2, in /project's words; bad names open nothing. projects.rename is as it was.
import assert from 'node:assert';
import { launch } from './support/launch.ts';
import { SEEDED, seedLibrary, stored } from './support/library.ts';
import { projectDialog } from './support/projectDialog.ts';
import { replyChat } from './support/replyChat.ts';
import { still } from './support/settled.ts';
import { templateChat } from './support/templateChat.ts';

const l = await launch({ boards: SEEDED, open: 'a', claude: true });
const { page } = l;
const { openChat, typed, heard, lines } = templateChat(page);
const { answer, ask } = replyChat(page);
const dlg = projectDialog(page);

async function check(name: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (e) {
    console.error(`FAIL ${name}`);
    throw e;
  }
}
const counts = async () => {
  const s = await stored(page);
  return [s.projects.length, s.folders.length, s.boards.length];
};
const heardAfter = async (mark: number) =>
  (await lines())
    .slice(mark)
    .filter(m => m.who === 'myra')
    .map(m => m.text);
// the dialog her reply opened, once it is there
const appears = async () => {
  await page.waitForSelector('#npDlg');
  await still(page);
};
const cancel = async () => {
  await page.keyboard.press('Escape');
  await dlg.gone();
};

try {
  await seedLibrary(page);
  await openChat();
  await dlg.onBoard('a');

  await check('a name opens the dialog with it selected, and nothing is made until a row is chosen', async () => {
    const before = await counts();
    await answer({ say: 'Over to you.', projects: { create: ['Orchard'] } });
    const mark = (await lines()).length;
    await ask('start a project called Orchard');
    await appears();
    assert.deepStrictEqual(await dlg.field(), { value: 'Orchard', selected: true, focused: true });
    assert.deepStrictEqual(await counts(), before, 'nothing is made yet');
    assert.deepStrictEqual(
      await heardAfter(mark),
      ['Over to you.'],
      'she has nothing to add: the dialog is the answer',
    );
    await cancel();
    assert.deepStrictEqual(await counts(), before, 'cancelling makes nothing');
  });

  await check('choosing a row makes the project the dialog was opened with, and goes to its board', async () => {
    await answer({ say: 'Over to you.', projects: { create: ['Orchard'] } });
    await ask('start a project called Orchard');
    await appears();
    const made = await dlg.made(async () => {
      await dlg.row('Blank board').click();
    });
    const { project, folder, board } = dlg.oneStart(made);
    assert.strictEqual(project.name, 'Orchard');
    assert.strictEqual(folder.name, 'Boards');
    assert.strictEqual(await dlg.openId(), board.id, 'the window is on the new board');
  });

  await check('a name a project has opens as Name 2, in the words /project uses', async () => {
    await dlg.onBoard('a');
    await openChat();
    let mark = await typed('/project shop');
    await appears();
    const [slashed] = await heard(mark, 'already a project');
    await cancel();
    await answer({ say: 'Over to you.', projects: { create: ['shop'] } });
    mark = (await lines()).length;
    await ask('start a project called shop');
    await appears();
    assert.strictEqual((await dlg.field())?.value, 'shop 2');
    assert.deepStrictEqual(await heardAfter(mark), [`Over to you. ${slashed?.text}`]);
    await cancel();
  });

  await check('more than one name opens the dialog for the first, and she says the rest were not made', async () => {
    const before = await counts();
    await answer({ say: 'Over to you.', projects: { create: ['Meadow', 'Fen', 'Moor'] } });
    const mark = (await lines()).length;
    await ask('three projects');
    await appears();
    assert.strictEqual((await dlg.field())?.value, 'Meadow');
    assert.deepStrictEqual(await heardAfter(mark), [
      'Over to you. The dialog starts projects one at a time, so I did not make the other 2.',
    ]);
    await cancel();
    assert.deepStrictEqual(await counts(), before, 'none of the three is made');
    await answer({ say: 'Over to you.', projects: { create: ['Meadow', 'Fen'] } });
    const again = (await lines()).length;
    await ask('two projects');
    await appears();
    assert.deepStrictEqual(await heardAfter(again), [
      'Over to you. The dialog starts projects one at a time, so I did not make the other one.',
    ]);
    await cancel();
  });

  await check('a name twice, or with odd entries, is one name', async () => {
    await answer({ say: 'Over to you.', projects: { create: [' Heath ', null, 'heath', '', 4] } });
    const mark = (await lines()).length;
    await ask('a project');
    await appears();
    assert.strictEqual((await dlg.field())?.value, 'Heath');
    assert.deepStrictEqual(await heardAfter(mark), ['Over to you.'], 'nothing was left out');
    await cancel();
  });

  await check('nothing good to start opens no dialog', async () => {
    const before = await counts();
    for (const odd of [{ create: [] }, { create: ['', '   ', null, 5] }, { create: 'Orchard' }, 'Orchard', 7, {}]) {
      await answer({ say: 'Nothing.', projects: odd });
      await ask('a project');
      assert.ok(!(await dlg.shown()), `${JSON.stringify(odd)} opens nothing`);
    }
    assert.deepStrictEqual(await counts(), before);
  });

  await check('a rename still renames, with no dialog, and one beside a name does both', async () => {
    await answer({ say: 'Renamed.', projects: { rename: [{ from: 'Empty', to: 'Vacant' }] } });
    await ask('rename');
    assert.ok(!(await dlg.shown()));
    assert.ok((await stored(page)).projects.some(p => p.name === 'Vacant'));
    await answer({ say: 'Both.', projects: { create: ['Glen'], rename: [{ from: 'Vacant', to: 'Empty' }] } });
    await ask('both');
    await appears();
    assert.ok((await stored(page)).projects.some(p => p.name === 'Empty'));
    await cancel();
  });

  await check('a folder for the project she is starting waits: the project is not there yet', async () => {
    const before = await counts();
    await answer({
      say: 'Over to you.',
      projects: { create: ['Dell'] },
      folders: { create: [{ name: 'Rows', project: 'Dell' }] },
    });
    const mark = (await lines()).length;
    await ask('a project with a folder');
    await appears();
    assert.deepStrictEqual(await counts(), before, 'neither is made');
    assert.deepStrictEqual(await heardAfter(mark), [
      'Over to you. There is no project called “Dell” yet, so I did not make the folder “Rows”.',
    ]);
    await cancel();
  });

  await check('with boards in the same reply they are made first, and the dialog is left open at the end', async () => {
    await dlg.onBoard('a');
    await openChat();
    await answer({ say: 'Both.', projects: { create: ['Wold'] }, boards: { create: ['Backlog'] } });
    await ask('a project and a board');
    await appears();
    await still(page);
    assert.ok((await stored(page)).boards.some(b => b.name === 'Backlog'));
    await cancel();
  });

  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('myraProjects: ok');
} finally {
  await l.close();
}
