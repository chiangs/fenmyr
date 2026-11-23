// The New project dialog (src/web/library/newProject.ts): a name and one searchable list of ways to start the first board.
// It lists Blank, the Starter and the template menu's rows, and each row makes the project, a Boards folder and that
// board, and leaves the window on it.
import assert from 'node:assert';
import { launch } from './support/launch.ts';
import { look, SEEDED, seedLibrary } from './support/library.ts';
import { projectDialog } from './support/projectDialog.ts';
import { rect } from './support/settled.ts';

const l = await launch({ boards: SEEDED, open: 'a' });
const { page } = l;
const { onBoard, home, open, gone, row, field, rows, headings, selected, menu, made, oneStart, cardsOpen, openId } =
  projectDialog(page);

async function check(name: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (e) {
    console.error(`FAIL ${name}`);
    throw e;
  }
}

try {
  await seedLibrary(page);
  await page.evaluate(async () => {
    await window.__fenmyr.openBoard('a');
    await window.__fenmyr.saveAsTemplate('Client kickoff', null, { desc: '', mode: 'new' });
    await window.__fenmyr.saveAsTemplate('Weekly notes', null, { desc: '', mode: 'add' });
  });
  const menuBefore = await menu();

  await check('it lists Blank, the Starter, then the template menu’s rows, with Blank chosen', async () => {
    await open();
    const shownRows = await rows();
    const fromMenu = menuBefore.names.filter(n => n !== 'Prototype');
    assert.deepStrictEqual(
      shownRows.map(r => r.name),
      ['Blank board', 'Starter', ...fromMenu],
      'in the menu’s order, without the Prototype',
    );
    assert.ok(
      fromMenu.includes('Moodboard') && fromMenu.includes('Empathy map') && fromMenu.includes('Client kickoff'),
    );
    assert.deepStrictEqual(await headings(), ['Start', ...menuBefore.heads.filter(h => h !== 'Build')]);
    assert.deepStrictEqual(await selected(), ['Blank board'], 'Blank is chosen');
    assert.strictEqual(shownRows[0]?.aria, 'true');
    assert.deepStrictEqual(
      shownRows.filter(r => r.name !== 'Blank board' && r.aria === 'true'),
      [],
      'and only Blank',
    );
    await page.keyboard.press('Escape');
    await gone();
  });

  await check('the name is a unique New project, selected, and a name it is given is kept', async () => {
    await open();
    assert.deepStrictEqual(await field(), { value: 'New project', selected: true, focused: true });
    await page.keyboard.press('Escape');
    await gone();
    await open('Backlog');
    assert.deepStrictEqual(await field(), { value: 'Backlog', selected: true, focused: true });
    await page.keyboard.press('Escape');
    await gone();
    await open('Garden');
    assert.strictEqual((await field())?.value, 'Garden 2', 'Garden is taken');
    await page.keyboard.press('Escape');
    await gone();
    await open('  <b>"Q"</b> & co ');
    assert.strictEqual((await field())?.value, '<b>"Q"</b> & co', 'text, not markup');
    await page.keyboard.press('Escape');
    await gone();
  });

  await check('it is a dialog in the middle of the window, over the page', async () => {
    await open();
    const box = await rect(page, '#npDlg .tdlg');
    const win = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
    assert.ok(Math.abs(box.x + box.width / 2 - win.w / 2) < 2, 'level across');
    assert.ok(Math.abs(box.y + box.height / 2 - win.h / 2) < 2, 'level down');
    assert.ok(box.height < win.h && box.width < win.w);
    await page.keyboard.press('Escape');
    await gone();
  });

  await check('Blank makes a project, a Boards folder and a board whose name is ready to type', async () => {
    await onBoard('a');
    await open();
    const m = await made(() => row('Blank board').click());
    const { project, board } = oneStart(m);
    assert.strictEqual(project.name, 'New project');
    assert.strictEqual(board.name, 'Untitled board');
    const seen = await look(page);
    assert.deepStrictEqual(
      [seen.board, seen.home, seen.nameSelected],
      ['Untitled board', false, true],
      'the window is on it, with its name selected',
    );
    assert.strictEqual(await openId(), board.id);
    assert.strictEqual(await cardsOpen(), 0, 'it is empty');
  });

  await check('the Starter makes the example board, from Home, and Home closes', async () => {
    await home('all');
    await open();
    const m = await made(() => row('Starter').click());
    const { board } = oneStart(m);
    assert.strictEqual(board.name, 'My first board');
    const seen = await look(page);
    assert.deepStrictEqual([seen.board, seen.home, seen.nameFocused], ['My first board', false, false]);
    assert.ok((await cardsOpen()) > 3, 'with its cards');
    assert.strictEqual(await openId(), board.id);
  });

  await check('a framework is a new blank board with the framework placed on it', async () => {
    await onBoard('a');
    const before = await page.evaluate(() => window.__fenmyr.curBoard().cards.length);
    await open();
    const m = await made(() => row('Empathy map').click());
    const { board } = oneStart(m);
    assert.strictEqual(board.name, 'Empathy map');
    assert.deepStrictEqual([(await look(page)).board, (await look(page)).home], ['Empathy map', false]);
    assert.ok((await cardsOpen()) > 1, 'the framework’s cards are on it');
    await onBoard('a');
    assert.strictEqual(await cardsOpen(), before, 'and none went to the board that was open');
  });

  await check('a starter board from the menu makes it as the first board', async () => {
    await home('project:p2');
    await open();
    const m = await made(() => row('Moodboard').click());
    const { board } = oneStart(m);
    assert.strictEqual(board.name, 'Moodboard');
    assert.deepStrictEqual([(await look(page)).board, (await look(page)).home], ['Moodboard', false]);
    assert.ok((await cardsOpen()) > 0);
  });

  await check('one of Yours makes its board, whether it adds to a board or opens a new one', async () => {
    for (const name of ['Client kickoff', 'Weekly notes']) {
      await onBoard('a');
      const own = await cardsOpen();
      await open();
      assert.ok((await headings()).includes('Yours'));
      const m = await made(() => row(name).click());
      const { board } = oneStart(m);
      assert.strictEqual(board.name, name);
      assert.deepStrictEqual([(await look(page)).board, (await look(page)).home], [name, false]);
      assert.strictEqual(await cardsOpen(), own, `${name}: the cards it saved`);
      await onBoard('a');
      assert.strictEqual(await cardsOpen(), own, `${name}: not added to the board that was open`);
    }
  });

  await check(
    'the name typed is the project’s, a taken one gets a number, and the folder is always Boards',
    async () => {
      await onBoard('a');
      await open();
      await page.fill('#npName', 'Brand work');
      const first = oneStart(await made(() => row('Blank board').click()));
      assert.strictEqual(first.project.name, 'Brand work');
      await onBoard('a');
      await open('Brand work');
      assert.strictEqual((await field())?.value, 'Brand work 2');
      await page.fill('#npName', 'Brand work');
      const second = oneStart(await made(() => row('Blank board').click()));
      assert.strictEqual(second.project.name, 'Brand work 2', 'a name that is taken is numbered');
      assert.strictEqual(
        second.folder.name,
        'Boards',
        'and its folder is still Boards, though another project has one',
      );
      await onBoard('a');
      await open();
      await page.fill('#npName', '   ');
      const blank = oneStart(await made(() => row('Blank board').click()));
      assert.match(blank.project.name, /^New project( \d+)?$/, 'no name: the usual one');
    },
  );

  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('newProject: ok');
} finally {
  await l.close();
}
