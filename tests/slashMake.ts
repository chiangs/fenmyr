// /project, /folder and /board in Myra's chat: they are in the slash menu under Make something and in /help; /project
// opens the New project dialog with the name and makes nothing; /folder and /board do what the buttons do, with the
// name given, and she says so after it is done, in the new board's chat for /board; all of it with thinking off.
import assert from 'node:assert';
import { launch } from './support/launch.ts';
import { look, makes, press, SEEDED, seedLibrary, stored } from './support/library.ts';
import { projectDialog } from './support/projectDialog.ts';
import { still } from './support/settled.ts';
import { templateChat } from './support/templateChat.ts';

const l = await launch({ boards: SEEDED, open: 'a', settings: { ai: false } });
const { page } = l;
const { menuRows, menuGroups, openChat, typed, heard, lines } = templateChat(page);
const dlg = projectDialog(page);

async function check(name: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (e) {
    console.error(`FAIL ${name}`);
    throw e;
  }
}

// back on a board with Home shut, and the chat open on it
const startOn = async (id: string) => {
  await dlg.onBoard(id);
  await openChat();
};
const stopTyping = async () => {
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
  await page.evaluate(() => window.__fenmyr.refreshBoards());
  await still(page);
};
const focused = () => page.evaluate(() => document.activeElement?.id ?? '');
// The open board's chat as stored and as drawn, once the drawing has caught up with the board that just opened
async function chat() {
  const read = () =>
    page.evaluate(() => {
      const b = window.__fenmyr.curBoard(),
        drawn = [...document.querySelectorAll('#mcList .mc-msg:not(.typing)')].map(
          d => d.firstChild?.textContent ?? '',
        );
      return { id: b.id, stored: (b.chat ?? []).map(m => `${m.who}: ${m.text}`), drawn };
    });
  await page.waitForFunction(() => {
    const b = window.__fenmyr.curBoard(),
      drawn = [...document.querySelectorAll('#mcList .mc-msg:not(.typing)')].map(d => d.firstChild?.textContent ?? '');
    return JSON.stringify(drawn) === JSON.stringify((b.chat ?? []).map(m => m.text));
  });
  await still(page);
  return read();
}
const diskChat = (id: string) =>
  page.evaluate(async b => ((await window.Fenmyr.load(b))?.chat ?? []).map(m => `${m.who}: ${m.text}`), id);

try {
  await seedLibrary(page);
  await openChat();
  await page.evaluate(() => {
    window.Fenmyr.ask = async (prompt: string) => {
      Reflect.set(window, 'asked', [...(Reflect.get(window, 'asked') ?? []), prompt]);
      return JSON.stringify({ say: 'Sure.' });
    };
  });

  await check('the menu lists the three under Make something, and each filters by what is typed', async () => {
    await page.fill('#mcInput', '/');
    assert.deepStrictEqual(await menuGroups(), ['On this board', 'Make something', 'In this chat']);
    const rows = await menuRows();
    const order = await page.evaluate(() =>
      [...document.querySelectorAll('.slash-menu > *')].map(el =>
        el instanceof HTMLElement && el.dataset.key ? el.dataset.key : `#${el.textContent}`,
      ),
    );
    assert.deepStrictEqual(
      order.slice(order.indexOf('#Make something'), order.indexOf('#In this chat')),
      ['#Make something', 'project', 'folder', 'board'],
      'under their own heading, between the board’s commands and the chat’s',
    );
    assert.strictEqual(order[order.indexOf('#Make something') - 1], 'template');
    assert.deepStrictEqual(
      rows.filter(r => ['project', 'folder', 'board'].includes(r.key)).map(r => [r.name, r.tag, r.line]),
      [
        ['/project', '[name]', 'Start a project and choose how its first board begins'],
        ['/folder', '[name]', 'Add a folder to this project'],
        ['/board', '[name]', 'Add a board to this folder and open it'],
      ],
    );
    for (const [typedText, key] of [
      ['/pro', 'project'],
      ['/fol', 'folder'],
      ['/boa', 'board'],
    ] as const) {
      await page.fill('#mcInput', typedText);
      assert.deepStrictEqual(
        (await menuRows()).map(r => r.key),
        [key],
        typedText,
      );
    }
    await page.fill('#mcInput', '');
  });

  await check('/help lists them with their words', async () => {
    const mark = await typed('/help');
    const said = await heard(mark, '/project [name]');
    const text = said[0]?.text ?? '';
    for (const line of [
      '/project [name]  Start a project and choose how its first board begins',
      '/folder [name]  Add a folder to this project',
      '/board [name]  Add a board to this folder and open it',
    ])
      assert.ok(text.split('\n').includes(line), `/help says ${line}`);
  });

  await check('/project opens the dialog with the name given, and makes nothing', async () => {
    await startOn('a');
    const before = await stored(page);
    const mark = await typed('/project Orchard');
    await page.waitForSelector('#npDlg');
    await still(page);
    const now = await stored(page);
    assert.deepStrictEqual(
      [now.projects.length, now.folders.length, now.boards.length],
      [before.projects.length, before.folders.length, before.boards.length],
      'nothing is made until a row is chosen',
    );
    assert.deepStrictEqual(await dlg.field(), { value: 'Orchard', selected: true, focused: true });
    assert.deepStrictEqual(
      (await lines()).slice(mark).map(m => m.who),
      ['me'],
      'she has nothing to add: the dialog is the answer',
    );
    await page.keyboard.press('Escape');
    await dlg.gone();
    assert.strictEqual((await stored(page)).projects.length, before.projects.length, 'cancelling makes nothing');

    await typed('/project');
    await page.waitForSelector('#npDlg');
    assert.strictEqual((await dlg.field())?.value, 'New project', 'with no name, the usual default');
    await page.keyboard.press('Escape');
    await dlg.gone();

    await typed('/project   Two   words ');
    await page.waitForSelector('#npDlg');
    assert.strictEqual((await dlg.field())?.value, 'Two words', 'spaces at the ends and inside are tidied');
    await page.keyboard.press('Escape');
    await dlg.gone();
  });

  await check('a name a project has opens as Name 2, and she says so', async () => {
    const mark = await typed('/project shop');
    await page.waitForSelector('#npDlg');
    assert.strictEqual((await dlg.field())?.value, 'shop 2');
    const said = await heard(mark, 'already a project');
    assert.deepStrictEqual(
      said.map(m => m.text),
      ['There is already a project called “shop”, so I started the name at “shop 2”.'],
    );
    await page.keyboard.press('Escape');
    await dlg.gone();
  });

  await check('choosing a row makes the project the dialog was opened with, and goes to its board', async () => {
    await typed('/project Orchard');
    await page.waitForSelector('#npDlg');
    const made = await dlg.made(async () => {
      await dlg.row('Blank board').click();
    });
    const { project, folder, board } = dlg.oneStart(made);
    assert.strictEqual(project.name, 'Orchard');
    assert.strictEqual(folder.name, 'Boards');
    assert.strictEqual(await dlg.openId(), board.id, 'the window is on the new board');
  });

  await check('/folder makes a folder at the top of this project, with the name, and she says so', async () => {
    await startOn('a');
    const mark = await typed('/folder Shelves');
    const said = await heard(mark, 'I made the folder');
    assert.deepStrictEqual(
      said.map(m => m.text),
      ['I made the folder “Shelves” in “Shop” ✦'],
    );
    const lib = await stored(page);
    const made = lib.folders.find(f => f.name === 'Shelves');
    assert.deepStrictEqual([made?.project, made?.parent ?? null], ['p1', null], 'at the top of Shop');
    const seen = await look(page);
    assert.deepStrictEqual(
      [seen.board, seen.home, seen.renaming],
      ['a', false, []],
      'the board stays, nothing is renamed',
    );
    assert.strictEqual(await focused(), 'mcInput', 'and the chat keeps the keyboard');
    assert.deepStrictEqual((await chat()).stored.slice(-2), [
      'me: /folder Shelves',
      'myra: I made the folder “Shelves” in “Shop” ✦',
    ]);
  });

  await check('/folder with no name makes what + Folder makes, and opens its name for typing', async () => {
    await startOn('a');
    const viaButton = await makes(page, 'folder', () => press(page, '#newFolder'));
    await stopTyping();
    await openChat();
    const mark = await typed('/folder');
    const said = await heard(mark, 'I made the folder');
    await still(page);
    const viaCommand = (await stored(page)).folders.find(f => f.name === 'New folder 2');
    assert.deepStrictEqual(
      [viaCommand?.project, viaCommand?.parent ?? null],
      [viaButton.project, viaButton.parent ?? null],
      'the same place as the button’s',
    );
    assert.strictEqual(said[0]?.text, 'I made the folder “New folder 2” in “Shop” ✦', 'the default name, made unique');
    assert.deepStrictEqual((await look(page)).renaming, ['New folder 2'], 'its name is open, as the button leaves it');
    await stopTyping();
  });

  await check('/folder with a name a folder has says it was taken; in no project it says no project', async () => {
    await startOn('a');
    let mark = await typed('/folder Ideas');
    let said = await heard(mark, 'I made the folder');
    assert.strictEqual(said[0]?.text, 'I made the folder “Ideas 2” in “Shop”, as “Ideas” was taken ✦');

    await startOn('loose');
    mark = await typed('/folder Offcuts');
    said = await heard(mark, 'I made the folder');
    assert.strictEqual(said[0]?.text, 'I made the folder “Offcuts” ✦');
    const made = (await stored(page)).folders.find(f => f.name === 'Offcuts');
    assert.strictEqual(made?.project ?? null, null, 'in no project, as + Folder does from a board in none');
  });

  await check('/folder from a folder’s Home goes beside that folder, in its project', async () => {
    await startOn('a');
    await dlg.home('folder:f3');
    const mark = await typed('/folder Benches');
    const said = await heard(mark, 'I made the folder');
    assert.strictEqual(said[0]?.text, 'I made the folder “Benches” in “Garden” ✦');
    const made = (await stored(page)).folders.find(f => f.name === 'Benches');
    assert.deepStrictEqual([made?.project, made?.parent ?? null], ['p2', null]);
  });

  await check('/board makes a board in this folder with the name, opens it, and she says so in ITS chat', async () => {
    await startOn('a');
    await typed('/board Backlog');
    await page.waitForFunction(() => window.__fenmyr.curBoard().name === 'Backlog');
    const said = await chat();
    assert.deepStrictEqual(
      said.stored,
      ['myra: I made the board “Backlog” in “Ideas” ✦'],
      'the new board’s chat holds her line',
    );
    assert.deepStrictEqual(said.drawn, ['I made the board “Backlog” in “Ideas” ✦'], 'and shows it');
    const made = (await stored(page)).boards.find(b => b.name === 'Backlog');
    assert.strictEqual(made?.id, said.id);
    assert.strictEqual(made?.folder, 'f1', 'in the folder of the board it was typed on');
    const seen = await look(page);
    assert.deepStrictEqual(
      [seen.home, seen.nameFocused, seen.nameSelected],
      [false, false, false],
      'its name is left alone',
    );
    assert.strictEqual(await focused(), 'mcInput', 'and the chat keeps the keyboard');
    const before = await diskChat('a');
    assert.strictEqual(before.at(-1), 'me: /board Backlog', 'the board it was typed on keeps what was typed');
    assert.ok(!before.some(m => m.startsWith('myra: I made the board')), 'and none of her line');
  });

  await check('/board with no name makes what + Board makes, with its name ready to type', async () => {
    await startOn('a');
    const viaButton = await makes(page, 'board', () => press(page, '#newBoard'));
    const buttonLook = await look(page);
    await startOn('a');
    await typed('/board');
    await page.waitForFunction(
      id => window.__fenmyr.curBoard().id !== id && window.__fenmyr.curBoard().id !== 'a',
      viaButton.id,
    );
    const said = await chat();
    const made = (await stored(page)).boards.find(b => b.id === said.id);
    const seen = await look(page);
    assert.deepStrictEqual(
      [made?.name, made?.folder, seen.nameSelected, seen.home],
      [viaButton.name, viaButton.folder, buttonLook.nameSelected, buttonLook.home],
      'the same name, folder and name ready to type',
    );
    assert.deepStrictEqual(said.stored, ['myra: I made the board “Untitled board” in “Ideas” ✦']);
  });

  await check(
    '/board goes where + Board goes from a folder’s Home, a project’s, none, and a board in none',
    async () => {
      const cases: [home: string | null, board: string, line: string, folder: string | null][] = [
        ['folder:f3', 'Hoes', 'I made the board “Hoes” in “Tools” ✦', 'f3'],
        ['project:p2', 'Seeds', 'I made the board “Seeds” in “Plants” ✦', 'f2'],
        ['project:p4', 'Odd one', 'I made the board “Odd one” ✦', null],
        ['all', 'Anywhere', 'I made the board “Anywhere” ✦', null],
        [null, 'Stray', 'I made the board “Stray” ✦', null],
      ];
      for (const [home, name, line, folder] of cases) {
        await startOn(home === null ? 'loose' : 'a');
        if (home) await dlg.home(home);
        await typed(`/board ${name}`);
        await page.waitForFunction(n => window.__fenmyr.curBoard().name === n, name);
        const said = await chat();
        assert.deepStrictEqual(
          said.stored,
          [`myra: ${line.replace(/^/, '')}`],
          `${name}: her line is in the new board’s chat`,
        );
        const made = (await stored(page)).boards.find(b => b.id === said.id);
        assert.strictEqual(made?.folder ?? null, folder, `${name}: in ${folder}`);
        assert.strictEqual((await look(page)).home, false, `${name}: Home closes`);
      }
    },
  );

  await check('/board takes names as they are typed: tidied, and two alike are allowed', async () => {
    await startOn('a');
    await typed('/board   Spaced   out ');
    await page.waitForFunction(() => window.__fenmyr.curBoard().name === 'Spaced out');
    const first = (await stored(page)).boards.find(b => b.name === 'Backlog')?.id;
    await startOn('a');
    await typed('/board Backlog');
    await page.waitForFunction(
      id => window.__fenmyr.curBoard().name === 'Backlog' && window.__fenmyr.curBoard().id !== id,
      first,
    );
    assert.strictEqual(
      (await stored(page)).boards.filter(b => b.name === 'Backlog').length,
      2,
      'board names are not made unique',
    );
  });

  assert.deepStrictEqual(
    await page.evaluate(() => Reflect.get(window, 'asked') ?? []),
    [],
    'no ask reached the bridge',
  );
  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('slashMake: ok');
} finally {
  await l.close();
}
