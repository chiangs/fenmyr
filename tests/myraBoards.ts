// Her boards.create: "make a board called Backlog" makes what /board makes, where the person is looking, and opens it;
// she says so after, in the new board's chat. Bad, empty and repeated names cost only themselves, and no more than
// twelve are made from one reply.
import assert from 'node:assert';
import { launch } from './support/launch.ts';
import { look, makes, SEEDED, seedLibrary, stored } from './support/library.ts';
import { projectDialog } from './support/projectDialog.ts';
import { replyChat } from './support/replyChat.ts';
import { still } from './support/settled.ts';
import { templateChat } from './support/templateChat.ts';

const l = await launch({ boards: SEEDED, open: 'a', claude: true });
const { page } = l;
const { openChat, typed } = templateChat(page);
const { answer, ask, chat, diskChat } = replyChat(page);
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
const boardNames = async () => (await stored(page)).boards.map(b => b.name).sort();
const openName = () => page.evaluate(() => window.__fenmyr.curBoard().name);

try {
  await seedLibrary(page);
  await openChat();

  await check('a name makes a board in this folder, opens it, and she says so in ITS chat', async () => {
    await startOn('a');
    await answer({ say: 'Sure.', boards: { create: ['Backlog'] } });
    const made = await makes(page, 'board', () => ask('make a board called Backlog'));
    assert.deepStrictEqual([made.name, made.folder], ['Backlog', 'f1'], 'in the folder of the board it was asked on');
    const said = await chat();
    assert.strictEqual(said.id, made.id, 'the new board is open');
    assert.deepStrictEqual(said.stored, ['myra: Sure. I made the board “Backlog” in “Ideas” ✦'], 'and holds her line');
    const seen = await look(page);
    assert.deepStrictEqual([seen.home, seen.nameFocused], [false, false], 'its name is left alone');
    const was = await diskChat('a');
    assert.strictEqual(was.at(-1), 'me: make a board called Backlog', 'the board it was asked on keeps the question');
    assert.ok(!was.some(m => m.startsWith('myra:') && m.includes('I made the board')), 'and none of her line');
  });

  await check('her line is the one /board says, and she says only that when she has no words of her own', async () => {
    await startOn('a');
    await typed('/board Slashed');
    await page.waitForFunction(() => window.__fenmyr.curBoard().name === 'Slashed');
    const [slashed] = (await chat()).stored;
    await startOn('a');
    await answer({ boards: { create: ['Slashed'] } });
    await ask('make a board called Slashed');
    assert.deepStrictEqual(
      (await chat()).stored,
      [`myra: Done! ${(slashed ?? '').replace('myra: ', '')}`],
      'the same words, after her own',
    );
  });

  await check('several names make several boards, the last stays open, and one line names them', async () => {
    await startOn('a');
    await answer({ say: 'Three boards.', boards: { create: ['One', 'Two', 'Three'] } });
    await ask('make three boards');
    assert.strictEqual(await openName(), 'Three');
    const folders = (await stored(page)).boards.filter(b => ['One', 'Two', 'Three'].includes(b.name));
    assert.deepStrictEqual(
      folders.map(b => b.folder),
      ['f1', 'f1', 'f1'],
      'all in the same folder',
    );
    assert.deepStrictEqual((await chat()).stored, [
      'myra: Three boards. I made the boards “One”, “Two” and “Three” in “Ideas” ✦',
    ]);
    const two = folders.find(b => b.name === 'Two');
    assert.deepStrictEqual(await diskChat(two?.id ?? ''), [], 'and she says nothing in the others');
  });

  await check('with no folder the board is loose, and she does not say where', async () => {
    await startOn('loose');
    await answer({ say: 'Done.', boards: { create: ['Stray'] } });
    const made = await makes(page, 'board', () => ask('a board please'));
    assert.strictEqual(made.folder ?? null, null);
    assert.deepStrictEqual((await chat()).stored, ['myra: Done. I made the board “Stray” ✦']);

    await startOn('a');
    await dlg.home('all');
    await answer({ say: 'Done.', boards: { create: ['From all'] } });
    const fromAll = await makes(page, 'board', () => ask('a board please'));
    assert.strictEqual(fromAll.folder ?? null, null, 'from All projects, where + Board puts it');
    assert.strictEqual((await look(page)).home, false, 'and Home closes');
  });

  await check(
    'from a project’s Home it goes in that project’s first folder, and from a folder’s in the folder',
    async () => {
      await startOn('a');
      await dlg.home('project:p2');
      await answer({ say: 'Done.', boards: { create: ['In Garden'] } });
      const inProject = await makes(page, 'board', () => ask('a board please'));
      assert.strictEqual(inProject.folder, 'f2');
      assert.deepStrictEqual((await chat()).stored, ['myra: Done. I made the board “In Garden” in “Plants” ✦']);
      await startOn('a');
      await dlg.home('folder:f3');
      await answer({ say: 'Done.', boards: { create: ['In Tools'] } });
      const inFolder = await makes(page, 'board', () => ask('a board please'));
      assert.strictEqual(inFolder.folder, 'f3');
    },
  );

  await check('bad, empty and repeated names are left out alone, and a name a board has is made again', async () => {
    await startOn('a');
    const before = await boardNames();
    await answer({
      say: 'Done.',
      boards: { create: ['  Spaced   out ', '', null, 7, {}, ['x'], 'spaced OUT', 'Backlog'] },
    });
    await ask('boards');
    const after = await boardNames();
    assert.deepStrictEqual(
      after.filter(n => !before.includes(n) || n === 'Backlog'),
      ['Backlog', 'Backlog', 'Spaced out'],
      'two good names: a second Backlog, as /board would make, and Spaced out once',
    );
    assert.strictEqual(after.length, before.length + 2);
    assert.deepStrictEqual((await chat()).stored, [
      'myra: Done. I made the boards “Spaced out” and “Backlog” in “Ideas” ✦',
    ]);
  });

  await check('nothing good to make is no board, no line of hers, and the board stays', async () => {
    for (const odd of [{ create: [] }, { create: ['', '   ', null, 5] }, { create: 'Backlog' }, 'Backlog', 7, {}]) {
      await startOn('a');
      const before = await boardNames();
      await answer({ say: 'Nothing to make.', boards: odd });
      await ask('boards');
      assert.deepStrictEqual(await boardNames(), before, `${JSON.stringify(odd)} makes nothing`);
      assert.strictEqual(await openName(), 'a');
      assert.strictEqual((await chat()).stored.at(-1), 'myra: Nothing to make.', 'she says only her own words');
    }
  });

  await check('twelve are made from one reply and she says she left the rest out', async () => {
    await startOn('a');
    const before = await boardNames();
    const names = Array.from({ length: 20 }, (_, i) => `Board ${i + 1}`);
    await answer({ say: 'Lots.', boards: { create: names } });
    await ask('boards');
    const made = (await boardNames()).filter(n => !before.includes(n));
    assert.strictEqual(made.length, 12, 'twelve boards');
    assert.deepStrictEqual(made.sort(), names.slice(0, 12).sort(), 'the first twelve');
    assert.strictEqual(await openName(), 'Board 12');
    const said = (await chat()).stored;
    assert.strictEqual(said.length, 1);
    assert.ok(
      said[0]?.endsWith('in “Ideas” ✦ I make up to 12 at a time, so I did not make the last 8.'),
      String(said[0]),
    );
  });

  await check('cards in the same reply stay on the board she was asked on, and the new board is empty', async () => {
    await startOn('a');
    await answer({ say: 'Both.', add: [{ text: 'On the old board' }], boards: { create: ['Fresh'] } });
    await ask('a note and a board');
    assert.strictEqual(await openName(), 'Fresh');
    assert.strictEqual(await page.evaluate(() => window.__fenmyr.curBoard().cards.length), 0);
    const old = await page.evaluate(async () =>
      ((await window.Fenmyr.load('a'))?.cards ?? []).map(c => ('text' in c ? c.text : '')),
    );
    assert.ok(old.includes('On the old board'), 'the note is on the board it was asked on');
  });

  await check('an answer for a board no longer open makes nothing, and she says she left it', async () => {
    await startOn('a');
    const before = await boardNames();
    await page.evaluate(() => {
      window.Fenmyr.ask = () =>
        new Promise<string>(release => {
          Reflect.set(window, 'release', () => release(JSON.stringify({ say: 'Done.', boards: { create: ['Late'] } })));
        });
    });
    const asked = page.evaluate(() => window.__fenmyr.ask('a board please'));
    await page.waitForFunction(() => typeof Reflect.get(window, 'release') === 'function');
    await page.evaluate(() => window.__fenmyr.openBoard('b'));
    await page.evaluate(() => Reflect.get(window, 'release')());
    await asked;
    await still(page);
    assert.deepStrictEqual(await boardNames(), before, 'no board was made');
    assert.strictEqual(await openName(), 'b');
  });

  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('myraBoards: ok');
} finally {
  await l.close();
}
