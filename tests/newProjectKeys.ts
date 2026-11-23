// The New project dialog's ways of choosing and leaving it: cancelling makes nothing, two quick clicks make one project,
// and the arrow keys, Enter and the search work as the template menu's search does. The template menu is left as it was.
import assert from 'node:assert';
import { launch } from './support/launch.ts';
import { SEEDED, seedLibrary, stored } from './support/library.ts';
import { projectDialog } from './support/projectDialog.ts';
import { still } from './support/settled.ts';

const l = await launch({ boards: SEEDED, open: 'a' });
const { page } = l;
const {
  onBoard,
  open,
  shown,
  gone,
  row,
  rows,
  visibleNames,
  headings,
  selected,
  menu,
  made,
  oneStart,
  cardsOpen,
  openId,
} = projectDialog(page);

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

  await check('cancelling makes nothing: Escape, Cancel and a click outside', async () => {
    const was = await stored(page);
    const boardWas = await openId();
    await open();
    await page.keyboard.press('Escape');
    await gone();
    await open();
    await page.click('#npNo');
    await gone();
    await open();
    await page.mouse.click(4, 4);
    await gone();
    await open();
    await page.fill('#npSearch', 'kanban');
    await page.keyboard.press('Escape');
    await gone();
    const now = await stored(page);
    assert.deepStrictEqual(
      [now.projects.length, now.folders.length, now.boards.length],
      [was.projects.length, was.folders.length, was.boards.length],
      'no project, folder or board',
    );
    assert.strictEqual(await openId(), boardWas, 'and the board stays open');
    assert.deepStrictEqual(await menu(), menuBefore, 'the template menu is as it was');
  });

  await check('two quick clicks make one project', async () => {
    await onBoard('a');
    await open();
    // the page's own clicks, back to back, before anything has had a turn; the last is one on the backdrop
    const m = await made(() =>
      page.evaluate(() => {
        const r = [...document.querySelectorAll<HTMLElement>('#npDlg .np-row')].find(x =>
          x.textContent?.includes('Moodboard'),
        );
        r?.click();
        r?.click();
        document.getElementById('npDlg')?.click();
      }),
    );
    assert.strictEqual(oneStart(m).board.name, 'Moodboard', 'one project, one folder, one board');

    await onBoard('a');
    await open();
    const again = await made(() => row('Blank board').dblclick());
    oneStart(again);

    await onBoard('a');
    await open();
    const keys = await made(async () => {
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
    });
    oneStart(keys);
  });

  await check(
    'while the project is being made the dialog holds: a click outside and Escape do not close it',
    async () => {
      await onBoard('a');
      await open();
      // the save waits until the test lets it go, so the dialog is caught in the middle of making the project
      await page.evaluate(() => {
        const save = Fenmyr.saveFolders;
        Fenmyr.saveFolders = async (...args) => {
          await new Promise<void>(go => Reflect.set(window, 'letGo', go));
          Fenmyr.saveFolders = save;
          return save(...args);
        };
      });
      const m = await made(async () => {
        await row('Blank board').click();
        await page.waitForFunction(() => typeof Reflect.get(window, 'letGo') === 'function');
        assert.ok(
          await page.evaluate(() =>
            [...document.querySelectorAll('#npDlg input, #npDlg button')].every(
              el => (el instanceof HTMLInputElement || el instanceof HTMLButtonElement) && el.disabled,
            ),
          ),
          'every control is disabled',
        );
        await page.mouse.click(4, 4);
        await page.keyboard.press('Escape');
        assert.ok(await shown(), 'a click outside and Escape left it open');
        await page.evaluate(() => Reflect.get(window, 'letGo')());
      });
      oneStart(m);
    },
  );

  await check('the arrow keys move the choice, Enter makes it, from the name and from the search', async () => {
    await onBoard('a');
    await open();
    await page.keyboard.press('ArrowDown');
    assert.deepStrictEqual(await selected(), ['Starter'], 'down: the Starter');
    const names = (await rows()).map(r => r.name);
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    assert.deepStrictEqual(await selected(), [names.at(-1)], 'up from the first: the last');
    await page.keyboard.press('ArrowDown');
    assert.deepStrictEqual(await selected(), ['Blank board'], 'down from the last: the first');
    await page.keyboard.press('ArrowDown');
    const m = await made(() => page.keyboard.press('Enter'));
    const { board } = oneStart(m);
    assert.strictEqual(board.name, 'My first board', 'Enter made the chosen row: the Starter');

    await onBoard('a');
    await open();
    await page.focus('#npSearch');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    assert.deepStrictEqual(await selected(), [names[2]]);
    const viaSearch = oneStart(await made(() => page.keyboard.press('Enter')));
    assert.strictEqual(viaSearch.board.name, names[2], 'from the search box, too');
  });

  await check('the search narrows the rows as the menu’s search does, and Enter makes the first', async () => {
    await onBoard('a');
    await open();
    await page.fill('#npSearch', 'kanban');
    assert.deepStrictEqual(await visibleNames(), ['Kanban']);
    assert.deepStrictEqual(await selected(), ['Kanban'], 'the first that shows is chosen');
    assert.deepStrictEqual(await headings(), ['Plan'], 'only the heading with a row left');
    await page.fill('#npSearch', '');
    assert.strictEqual((await visibleNames()).length, (await rows()).length, 'cleared: all of them');
    assert.deepStrictEqual(await selected(), ['Kanban'], 'and the choice stays where it was');

    for (const q of ['map', 'plan', 'notes', 'a board', 'EMPATHY', 'zzz']) {
      await page.fill('#npSearch', q);
      await page.fill('#tpSearch', q);
      const inMenu = await page.evaluate(() =>
        [...document.querySelectorAll('#tplPick .tp-list button:not([hidden]) b')].map(b => b.textContent ?? ''),
      );
      const here = (await visibleNames()).filter(n => n !== 'Blank board' && n !== 'Starter' && n !== 'Prototype');
      assert.deepStrictEqual(
        here,
        inMenu.filter(n => n !== 'Prototype'),
        `“${q}” finds what the menu’s search finds`,
      );
    }
    await page.fill('#tpSearch', '');
    await page.fill('#npSearch', 'zzz');
    assert.deepStrictEqual(await visibleNames(), [], 'nothing');
    assert.ok(await page.evaluate(() => !document.querySelector<HTMLElement>('#npDlg .np-none')?.hidden), 'it says so');
    assert.deepStrictEqual(await selected(), []);
    const was = (await stored(page)).projects.length;
    await page.keyboard.press('Enter');
    assert.ok(await shown(), 'Enter with nothing chosen does nothing');
    assert.strictEqual((await stored(page)).projects.length, was);

    await page.fill('#npSearch', 'example');
    assert.deepStrictEqual(await selected(), ['Starter'], 'the Starter is found by its words');
    await page.fill('#npSearch', 'blank');
    assert.deepStrictEqual(await selected(), ['Blank board']);
    await page.fill('#npSearch', 'kanban');
    const m = await made(() => page.keyboard.press('Enter'));
    assert.strictEqual(oneStart(m).board.name, 'Kanban');
  });

  await check('the template menu is as it was, and still adds to the open board', async () => {
    await onBoard('a');
    const now = await menu();
    assert.deepStrictEqual(now.names, menuBefore.names);
    assert.deepStrictEqual(now.heads, menuBefore.heads);
    assert.strictEqual(now.html, menuBefore.html, 'row for row');
    const cards = await cardsOpen();
    await page.click('#tools [data-add="tpl"]');
    await page.click('#tplPick [data-tpl="empathy"]');
    await still(page);
    assert.ok((await cardsOpen()) > cards, 'a framework in the menu still goes on this board');
    assert.strictEqual(await openId(), 'a');
  });

  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('newProjectKeys: ok');
} finally {
  await l.close();
}
