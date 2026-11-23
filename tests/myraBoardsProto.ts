// Her boards.create where + Board asks for a prototype: on a prototype board, or in a prototyping folder's Home, it
// opens the form with the first name filled in and makes nothing, as /board does, and she says the others were not
// made; with no repo to hold prototypes she says only what the button says.
import assert from 'node:assert';
import fs from 'node:fs';
import { launch } from './support/launch.ts';
import { stored } from './support/library.ts';
import { freshRepo, openPrototype } from './support/prototype.ts';
import { replyChat } from './support/replyChat.ts';
import { still } from './support/settled.ts';
import { templateChat } from './support/templateChat.ts';

const { work, repo } = freshRepo('fenmyr-myra-proto-');
const note = { id: 'n', type: 'note', x: 0, y: 0, w: 220, h: 120, r: 0, color: 'white', text: 'A note' };
const l = await launch({
  boards: [{ id: 'plain', name: 'Plain', cards: [note], links: [], tray: [], view: { x: 300, y: 200, z: 1 } }],
  open: 'plain',
  claude: true,
});
const { page } = l;
const { lines, openChat } = templateChat(page);
const { answer, ask } = replyChat(page);

async function check(name: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (e) {
    console.error(`FAIL ${name}`);
    throw e;
  }
}
const heardFrom = async (mark: number) =>
  (await lines())
    .slice(mark)
    .filter(m => m.who === 'myra')
    .map(m => m.text);
const closeForm = async () => {
  await page.keyboard.press('Escape');
  await page.waitForSelector('.tdlg', { state: 'detached' });
};

try {
  await openPrototype(page, repo);
  await openChat();
  await still(page);

  await check('on a prototype board she opens the form with the first name and makes nothing', async () => {
    const before = await stored(page);
    await answer({ say: 'Over to you.', boards: { create: ['Checkout'] } });
    const mark = (await lines()).length;
    await ask('make a board called Checkout');
    await page.waitForSelector('.tdlg #npName');
    assert.match((await page.textContent('.tdlg h3')) ?? '', /New prototype in “Prototypes”/);
    assert.strictEqual(await page.inputValue('#npName'), 'Checkout');
    assert.deepStrictEqual(
      (await heardFrom(mark)).slice(-1),
      ['Over to you. “Prototypes” holds prototypes, so I opened the form for a new one ✦'],
      'in the chat of the prototype it was asked in',
    );
    assert.strictEqual(await page.evaluate(() => window.__fenmyr.curBoard().id), 'pb', 'and the prototype stays open');
    await closeForm();
    assert.strictEqual((await stored(page)).boards.length, before.boards.length, 'nothing is made until Create');
  });

  await check('several names open the form for the first and she says the rest were not made', async () => {
    await answer({ say: 'Over to you.', boards: { create: ['Checkout', 'Cart', 'Receipt'] } });
    const mark = (await lines()).length;
    await ask('make three boards');
    await page.waitForSelector('.tdlg #npName');
    assert.strictEqual(await page.inputValue('#npName'), 'Checkout');
    assert.deepStrictEqual((await heardFrom(mark)).slice(-1), [
      'Over to you. “Prototypes” holds prototypes, so I opened the form for a new one ✦ A prototype is made one at a time, so I did not make the other 2.',
    ]);
    await page.click('#npOk');
    await page.waitForFunction(() => window.__fenmyr.curBoard().name === 'Checkout');
    const names = (await stored(page)).boards.map(b => b.name);
    assert.ok(names.includes('Checkout'), 'Create makes the prototype the form was opened with');
    assert.ok(!names.includes('Cart') && !names.includes('Receipt'), 'and the others were not made');
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
    await answer({ say: 'Over to you.', boards: { create: ['Checkout', 'Cart'] } });
    const mark = (await lines()).length;
    await ask('make two boards');
    await page.waitForSelector('.tdlg.rl');
    assert.deepStrictEqual(await heardFrom(mark), [
      'This project needs a repo before it can hold prototypes ✦',
      'Over to you.',
    ]);
    await page.keyboard.press('Escape');
  });

  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('myraBoardsProto: ok');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
}
