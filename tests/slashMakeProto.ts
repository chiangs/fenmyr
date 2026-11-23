// /board where + Board asks for a prototype: on a prototype board, or in a prototyping folder's Home, it opens the same
// form with the name filled in and makes nothing, and she says so in the chat it was typed in; with no repo to hold
// prototypes she says only what the button says. /folder is the same there as anywhere.
import assert from 'node:assert';
import fs from 'node:fs';
import { launch } from './support/launch.ts';
import { stored } from './support/library.ts';
import { freshRepo, openPrototype } from './support/prototype.ts';
import { still } from './support/settled.ts';
import { templateChat } from './support/templateChat.ts';

const { work, repo } = freshRepo('fenmyr-slash-proto-');
const note = { id: 'n', type: 'note', x: 0, y: 0, w: 220, h: 120, r: 0, color: 'white', text: 'A note' };
const l = await launch({
  boards: [{ id: 'plain', name: 'Plain', cards: [note], links: [], tray: [], view: { x: 300, y: 200, z: 1 } }],
  open: 'plain',
  settings: { ai: false },
});
const { page } = l;
const { typed, heard, openChat } = templateChat(page);

async function check(name: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (e) {
    console.error(`FAIL ${name}`);
    throw e;
  }
}

try {
  await page.evaluate(() => {
    window.Fenmyr.ask = async (prompt: string) => {
      Reflect.set(window, 'asked', [...(Reflect.get(window, 'asked') ?? []), prompt]);
      return JSON.stringify({ say: 'Sure.' });
    };
  });
  await openPrototype(page, repo);
  await still(page);

  await check('on a prototype board /board asks for a prototype, with the name, and makes nothing', async () => {
    const before = await stored(page);
    const mark = await typed('/board Checkout');
    await page.waitForSelector('.tdlg #npName');
    assert.match((await page.textContent('.tdlg h3')) ?? '', /New prototype in “Prototypes”/);
    assert.strictEqual(await page.inputValue('#npName'), 'Checkout');
    const said = await heard(mark, 'holds prototypes');
    assert.deepStrictEqual(
      said.map(m => m.text),
      ['“Prototypes” holds prototypes, so I opened the form for a new one ✦'],
      'in the chat of the prototype it was typed in',
    );
    assert.strictEqual(await page.evaluate(() => window.__fenmyr.curBoard().id), 'pb', 'and the prototype stays open');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.tdlg', { state: 'detached' });
    assert.strictEqual((await stored(page)).boards.length, before.boards.length, 'nothing is made until Create');
  });

  await check('with no name the form is empty, as the button’s is', async () => {
    await typed('/board');
    await page.waitForSelector('.tdlg #npName');
    assert.strictEqual(await page.inputValue('#npName'), '');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.tdlg', { state: 'detached' });
  });

  await check('Create makes the prototype the form was opened with', async () => {
    await typed('/board Checkout');
    await page.waitForSelector('.tdlg #npName');
    await page.click('#npOk');
    await page.waitForFunction(() => window.__fenmyr.curBoard().name === 'Checkout');
    const made = (await stored(page)).boards.find(b => b.name === 'Checkout');
    assert.ok(made, 'a board called Checkout');
    assert.strictEqual(made.folder, 'pf', 'in the prototyping folder');
  });

  await check('/folder on a prototype board is a folder at the top of its project', async () => {
    const mark = await typed('/folder Shelves');
    const said = await heard(mark, 'I made the folder');
    assert.strictEqual(said[0]?.text, 'I made the folder “Shelves” in “Acme” ✦');
    const made = (await stored(page)).folders.find(f => f.name === 'Shelves');
    assert.deepStrictEqual([made?.project, made?.parent ?? null, made?.kind ?? null], ['p1', null, null]);
  });

  await check('with no repo she sends the person to link one, and says no more than the button does', async () => {
    await page.evaluate(async () => {
      await window.Fenmyr.saveFolders({
        projects: [{ id: 'p9', name: 'Nobody', open: true }],
        folders: [{ id: 'pf9', name: 'Prototypes', project: 'p9', kind: 'prototyping', open: true }],
        order: {},
      });
      await window.__fenmyr.refreshBoards();
      await window.__fenmyr.openBoard('plain');
    });
    await openChat();
    await page.evaluate(() => window.__fenmyr.openHome('folder:pf9'));
    await still(page);
    const mark = await typed('/board Checkout');
    await page.waitForSelector('.tdlg.rl');
    const said = await heard(mark, 'needs a repo');
    assert.deepStrictEqual(
      said.map(m => m.text),
      ['This project needs a repo before it can hold prototypes ✦'],
      'her one line is the button’s own',
    );
    await page.keyboard.press('Escape');
  });

  assert.deepStrictEqual(
    await page.evaluate(() => Reflect.get(window, 'asked') ?? []),
    [],
    'no ask reached the bridge',
  );
  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('slashMakeProto: ok');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
}
