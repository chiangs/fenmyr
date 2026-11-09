// What a board's unsent message to Myra leaves behind. A deleted board leaves nothing in memory; Clear all chats clears a
// prototype board's draft too; leaving "On each board" takes drafts out of the files and switching back puts none back
// until the next edit.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch } from './support/launch.ts';
import { longText, pasteIntoChat } from './support/paste.ts';

const card = (id: string) => ({ id, type: 'note', x: 0, y: 0, w: 220, h: 140, r: 0, color: 'butter', text: id });
const plain = (id: string, name: string, more = {}) => ({
  id,
  name,
  cards: [card(id)],
  links: [],
  tray: [],
  view: { x: 0, y: 0, z: 1 },
  ...more,
});

async function check(name: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (e) {
    console.error(`FAIL ${name}`);
    throw e;
  }
}

const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-kept-'));
try {
  await check('a deleted board leaves no draft or pasted text behind in memory', async () => {
    const l = await launch({ boards: [plain('a', 'Alpha'), plain('b', 'Bravo'), plain('c', 'Charlie')], open: 'b' });
    const { page } = l;
    const go = async (id: string) => {
      await page.evaluate(id => window.__fenmyr.openBoard(id), id);
      await page.waitForTimeout(150);
    };
    const held = () => page.evaluate(() => [window.__fenmyr.nextBoards(), window.__fenmyr.draftBoards()]);
    await page.click('#mPill');
    await page.waitForTimeout(400);
    await page.fill('#mcInput', 'to be deleted');
    assert.strictEqual(await pasteIntoChat(page, longText(120)), true);
    await go('c');
    assert.deepStrictEqual(await held(), [['b'], ['b']], 'B is held while it exists');
    await page.evaluate(async () => {
      await window.Fenmyr.remove('b');
      await window.__fenmyr.refreshBoards();
    });
    await go('a');
    assert.deepStrictEqual(await held(), [[], []], 'and forgotten once it is gone');
    await l.close();
  });

  await check('Clear all chats clears a prototype board’s draft, and Keep chats does not bring one back', async () => {
    const proto = plain('p', 'Checkout', { kind: 'prototype', proto: { dir: 'prototypes/checkout', stack: 'react' } });
    const l = await launch({
      boards: [proto, plain('a', 'Alpha')],
      open: 'p',
      settings: { chatKeep: 'board' },
      data,
    });
    const { page } = l;
    const stored = (id: string): string | undefined => {
      try {
        return JSON.parse(fs.readFileSync(path.join(data, 'fenmyr', 'boards', `${id}.json`), 'utf8')).chatDraft?.text;
      } catch {
        return undefined;
      }
    };
    const until = async (ok: () => boolean, what: string) => {
      const end = Date.now() + 6000;
      while (Date.now() < end && !ok()) await page.waitForTimeout(80);
      assert.ok(ok(), what);
    };
    const text = () => page.inputValue('#mcInput');
    const go = async (id: string) => {
      await page.evaluate(id => window.__fenmyr.openBoard(id), id);
      await page.waitForTimeout(250);
    };
    const blur = () => page.evaluate(() => document.getElementById('mcInput')?.blur());
    const keep = (v: string) =>
      page.evaluate(
        v =>
          document
            .querySelector(`[data-seg="chatKeep"] [data-v="${v}"]`)
            ?.dispatchEvent(new MouseEvent('click', { bubbles: true })),
        v,
      );
    await page.fill('#mcInput', 'prototype words');
    await blur();
    await until(() => stored('p') === 'prototype words', 'the prototype board holds it');
    await page.evaluate(() => document.getElementById('clearChats')?.click());
    await until(() => stored('p') === undefined, 'Clear all chats empties its file');
    assert.strictEqual(await text(), '', 'and its input');
    await go('a');
    await go('p');
    assert.strictEqual(await text(), '', 'switching away and back does not bring it back');
    await go('a');
    await page.click('#mPill');
    await page.waitForTimeout(400);
    await page.fill('#mcInput', 'plain words');
    await blur();
    await until(() => stored('a') === 'plain words', 'a plain board holds one');
    await keep('session');
    await until(() => stored('a') === undefined, 'leaving "On each board" takes it out of the file');
    await keep('board');
    await go('p');
    await go('a');
    assert.strictEqual(await text(), 'plain words', 'memory still has it');
    await page.waitForTimeout(2800);
    assert.strictEqual(stored('a'), undefined, 'but the file gets it back only with the next edit');
    await l.close();
  });
} finally {
  fs.rmSync(data, { recursive: true, force: true });
}
console.log('CHAT DRAFT KEPT OK');
