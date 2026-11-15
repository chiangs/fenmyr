// A change to a board as it opens is never lost: started in the same tick as the open, in either order, it is on the
// open board and in its file exactly once, and stays there through the next save.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import type { ChatMsg } from '../src/shared/chat.ts';
import { replyBoard } from './fixtures/boards.ts';
import { launch, settle } from './support/launch.ts';
import { freshRepo } from './support/prototype.ts';

const { work, repo } = freshRepo('fenmyr-build-elsewhere-');
fs.mkdirSync(path.join(repo, 'prototypes'));

const l = await launch({ boards: [replyBoard('one', 'One')], open: 'one', claude: true });
const { page } = l;
const chatOf = (id: string): ChatMsg[] =>
  JSON.parse(fs.readFileSync(path.join(l.data, 'fenmyr', 'boards', `${id}.json`), 'utf8')).chat ?? [];
const open = async (id: string) => {
  await page.evaluate(id => window.__fenmyr.openBoard(id), id);
  await settle(page, 300);
  await page.evaluate(() => {
    if (!document.getElementById('myra')?.classList.contains('chat')) document.getElementById('mPill')?.click();
  });
  await settle(page, 300);
};

try {
  await page.evaluate(async repo => {
    await window.Fenmyr.saveFolders({
      projects: [{ id: 'p1', name: 'Acme', open: true, repo: { path: repo } }],
      folders: [{ id: 'pf', name: 'Prototypes', project: 'p1', kind: 'prototyping', open: true }],
      order: {},
    });
    const proto = await window.Fenmyr.protoCreate({ root: repo, name: 'Checkout', stack: 'react' });
    await window.Fenmyr.save({
      id: 'pb',
      name: 'Checkout',
      folder: 'pf',
      kind: 'prototype',
      proto,
      cards: [{ id: 'n1', type: 'note', x: 0, y: 0, w: 220, h: 120, text: 'Checkout: show the total first' }],
      links: [],
      tray: [],
    });
    await window.__fenmyr.refreshBoards();
  }, repo);
  // both start in the same tick, in the order given
  const race = (text: string, first: 'change' | 'open') =>
    page.evaluate(
      async ({ text, first }) => {
        const change = () =>
          window.__fenmyr.changeBoard('pb', b => {
            b.chat = [...(b.chat ?? []), { who: 'myra', text, t: Date.now() }];
            return true;
          });
        const opening = () => window.__fenmyr.openBoard('pb');
        await Promise.all(first === 'change' ? [change(), opening()] : [opening(), change()]);
      },
      { text, first },
    );
  for (const first of ['change', 'open'] as const) {
    const text = `Held, ${first} first`;
    await open('one');
    await race(text, first);
    const onBoard = await page.evaluate(t => window.__fenmyr.curBoard().chat?.filter(m => m.text === t).length, text);
    assert.strictEqual(onBoard, 1, `${text}: the open board holds the change once`);
    // a later save of the open board must keep it
    await page.evaluate(() => window.__fenmyr.newNote());
    await settle(page, 600);
    assert.strictEqual(chatOf('pb').filter(m => m.text === text).length, 1, `${text}: and so does its file`);
  }
  assert.deepStrictEqual(l.errors, []);
  console.log('BUILD ELSEWHERE OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
}
