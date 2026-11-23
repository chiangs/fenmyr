// The paths that start a board from something that already has cards: a starter in the template picker, Add the example
// board in Settings, and one of Yours that opens a new board. Each puts the board where it always put it, fits it, and
// leaves Home as it was. They ran before the one module made boards, and must give the same answers after.
import assert from 'node:assert';
import type { Folder } from '../src/shared/model.ts';
import { launch } from './support/launch.ts';
import { boardIn, look, makes, SEEDED, seedLibrary } from './support/library.ts';
import { still } from './support/settled.ts';

// Shop has a prototyping folder besides Ideas, with a board in it
const PROTOTYPES: Folder = { id: 'pf', name: 'Prototypes', project: 'p1', open: true, kind: 'prototyping' };
const l = await launch({ boards: [...SEEDED, boardIn('pb', 'pf')], open: 'a' });
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
// Back on a board with Home shut
const onBoard = async (id: string) => {
  await page.evaluate(async b => {
    await window.__fenmyr.openBoard(b);
    document.getElementById('homeClose')?.click();
  }, id);
  await still(page);
};
// The picker's rows are there whether or not it is open, and Home covers the button that opens it
const pickRow = (selector: string) => page.evaluate(sel => document.querySelector<HTMLElement>(sel)?.click(), selector);
const opens = async (id: string) => {
  await page.waitForFunction(b => window.__fenmyr.curBoard().id === b, id);
  await still(page);
};
const cards = () => page.evaluate(() => window.__fenmyr.curBoard().cards.length);
// A board that arrives with cards is fitted to the window, which moves it off the view a new board starts with
const fitted = () => page.waitForFunction(() => window.__fenmyr.view.z !== 1 || window.__fenmyr.view.x !== 160);

try {
  await seedLibrary(page, [PROTOTYPES]);

  await check('a starter opens a new board in the folder you are in, with its cards fitted', async () => {
    await onBoard('a');
    await page.click('#tools [data-add="tpl"]');
    const made = await makes(page, 'board', async () => {
      await page.click('#tplPick [data-starter="Moodboard"]');
      await page.waitForFunction(() => window.__fenmyr.curBoard().name === 'Moodboard');
    });
    assert.deepStrictEqual([made.name, made.folder], ['Moodboard', 'f1']);
    await opens(made.id);
    assert.ok((await cards()) > 0, 'with its cards');
    await fitted();
    const seen = await look(page);
    assert.deepStrictEqual([seen.home, seen.nameFocused], [false, false], 'its name is not selected');
  });

  await check('a starter goes where Home is looking, and leaves Home open', async () => {
    const where = async (at: string, from = 'a') => {
      await onBoard(from);
      await home(at);
      const made = await makes(page, 'board', () => pickRow('#tplPick [data-starter="Brain dump"]'));
      await opens(made.id);
      return { made, seen: await look(page) };
    };
    for (const [at, folder] of [
      ['folder:f3', 'f3'],
      ['project:p2', 'f2'],
      ['project:p4', null],
      ['all', null],
    ] as const) {
      const { made, seen } = await where(at);
      assert.strictEqual(made.folder, folder, `Home at ${at}`);
      // The board opens behind Home, which stays: a button on the toolbar closes it, these paths never did
      assert.deepStrictEqual([seen.board, seen.home], ['Brain dump', true], `Home at ${at} stays open`);
    }
    await onBoard('loose');
    const made = await makes(page, 'board', () => pickRow('#tplPick [data-starter="Brain dump"]'));
    assert.strictEqual(made.folder, null, 'from a board in none');
    await opens(made.id);
  });

  await check('inside a prototyping folder a starter still lands in it, as a plain board', async () => {
    await onBoard('pb');
    const made = await makes(page, 'board', () => pickRow('#tplPick [data-starter="Moodboard"]'));
    await opens(made.id);
    assert.deepStrictEqual([made.folder, made.kind], ['pf', undefined]);
  });

  await check('Add the example board makes My first board where you are, and shuts Settings', async () => {
    await onBoard('a');
    await page.click('#gearBtn');
    await page.click('#setTabs [data-tab="about"]');
    const made = await makes(page, 'board', async () => {
      await page.click('#addExample');
      await page.waitForFunction(() => window.__fenmyr.curBoard().name === 'My first board');
    });
    assert.deepStrictEqual([made.name, made.folder], ['My first board', 'f1']);
    await opens(made.id);
    await still(page);
    assert.ok((await cards()) > 0, 'with its cards');
    await fitted();
    assert.ok(
      await page.evaluate(() => !document.getElementById('settings')?.classList.contains('on')),
      'Settings is shut',
    );
    assert.deepStrictEqual((await look(page)).home, false);

    await home('folder:f1');
    const again = await makes(page, 'board', () => pickRow('#addExample'));
    assert.strictEqual(again.folder, 'f1', 'from a folder’s Home: that folder');
    await opens(again.id);
    assert.strictEqual((await look(page)).home, true, 'and Home stays open');
  });

  await check('one of Yours that opens a new board does the same, with its own cards', async () => {
    const pick = () =>
      page
        .locator('#tplPick [data-mine]', { hasText: 'Client kickoff' })
        .evaluate(row => row instanceof HTMLElement && row.click());
    await onBoard('a');
    await page.evaluate(() => window.__fenmyr.saveAsTemplate('Client kickoff', null, { desc: '', mode: 'new' }));
    const before = await cards();
    const made = await makes(page, 'board', pick);
    await opens(made.id);
    assert.deepStrictEqual([made.name, made.folder], ['Client kickoff', 'f1']);
    assert.strictEqual(await cards(), before, 'the cards the template saved');
    assert.deepStrictEqual((await look(page)).home, false);

    await onBoard('a');
    await home('folder:f3');
    const fromHome = await makes(page, 'board', pick);
    assert.strictEqual(fromHome.folder, 'f3', 'from a folder’s Home: that folder');
    await opens(fromHome.id);
    assert.strictEqual((await look(page)).home, true, 'and Home stays open');
  });

  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('createTemplates: ok');
} finally {
  await l.close();
}
