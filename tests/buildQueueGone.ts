// A request waiting its turn whose board goes before its turn never runs, whether the board is deleted in the library
// or its file goes some other way, and the request behind it still does. A deleted board's request no longer holds back
// Commit on the other prototypes in its repo. Clear all chats takes the waiting requests with their blocks, while the
// build that runs goes on and its block comes back when it lands.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ChatMsg } from '../src/shared/chat.ts';
import { replyBoard } from './fixtures/boards.ts';
import { buildStandIn } from './support/buildStandIn.ts';
import { launch, settle } from './support/launch.ts';
import { freshRepo } from './support/prototype.ts';

const { work, repo } = freshRepo('fenmyr-build-queue-gone-');
const other = freshRepo('fenmyr-build-queue-gone-other-');
const git = (...args: string[]) =>
  execFileSync('git', ['-C', repo, '-c', 'user.name=T', '-c', 'user.email=t@e.st', ...args]).toString();
fs.mkdirSync(path.join(repo, 'prototypes'));
fs.writeFileSync(path.join(repo, 'prototypes', 'design.md'), 'x\n');
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-build-queue-gone-data-'));

const l = await launch({ data, boards: [replyBoard('one', 'One')], open: 'one', claude: true });
const standIn = buildStandIn(l);
const { page } = l;

const WAITING = 'Waiting for the build before it';
const heads = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('#mcList .mc-msg.bare')].map(m => m.querySelector('.m-summary b')?.textContent ?? ''),
  );
const texts = () =>
  page.evaluate(() => [...document.querySelectorAll('#mcList .mc-msg')].map(m => m.firstChild?.textContent ?? ''));
const until = async (check: () => Promise<boolean> | boolean, what: string, ms = 20000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await page.waitForTimeout(100);
  }
  assert.fail(`${what}: ${JSON.stringify(await heads())} ${JSON.stringify(await texts())}`);
};
const build = (request: string) =>
  page.evaluate(r => window.__fenmyr.applyMyra({ say: 'Writing it now.', build: { request: r } }, r), request);
const open = async (id: string) => {
  await page.evaluate(id => window.__fenmyr.openBoard(id), id);
  await settle(page, 400);
};
const boardFile = (id: string) => path.join(data, 'fenmyr', 'boards', `${id}.json`);
const chatOf = (id: string): ChatMsg[] => JSON.parse(fs.readFileSync(boardFile(id), 'utf8')).chat ?? [];
const waits = async () => (await heads()).at(-1) === WAITING;
const inSidebar = (name: string) =>
  page.evaluate(
    name => [...document.querySelectorAll('.board-row')].some(r => r.querySelector('span')?.textContent === name),
    name,
  );
const NAMES = [
  'Basket two',
  'Checkout two',
  'Cleared two',
  'Basket',
  'Checkout',
  'Receipt',
  'Invoice',
  'Cleared',
  'Held',
  'After',
];
const ran = () => standIn.builds().map(p => NAMES.find(n => p.includes(`${n} build.`)));

try {
  await page.evaluate(
    async ({ repo, otherRepo }) => {
      await window.Fenmyr.saveFolders({
        projects: [
          { id: 'p1', name: 'Acme', open: true, repo: { path: repo } },
          { id: 'p2', name: 'Shop', open: true, repo: { path: otherRepo } },
        ],
        folders: [
          { id: 'pf', name: 'Prototypes', project: 'p1', kind: 'prototyping', open: true },
          { id: 'pf2', name: 'Prototypes', project: 'p2', kind: 'prototyping', open: true },
        ],
        order: {},
      });
      const protos: [string, string, string, string][] = [
        ['pb', 'Checkout', repo, 'pf'],
        ['pd', 'Receipt', repo, 'pf'],
        ['pe', 'Invoice', repo, 'pf'],
        ['pc', 'Basket', otherRepo, 'pf2'],
      ];
      for (const [id, name, root, folder] of protos) {
        const proto = await window.Fenmyr.protoCreate({ root, name, stack: 'react' });
        await window.Fenmyr.save({ id, name, folder, kind: 'prototype', proto, cards: [], links: [], tray: [] });
      }
      await window.__fenmyr.refreshBoards();
    },
    { repo, otherRepo: other.repo },
  );
  git('add', '-A');
  git('commit', '-qm', 'start');

  await open('pc');
  standIn.next({ files: { 'src/App.tsx': 'export const App = () => <h1>Basket</h1>;\n' }, hold: true });
  await build('Basket build.');
  await until(() => standIn.wrote() === 1, 'a build runs on another project’s prototype');
  await open('pd');
  await build('Receipt build.');
  await until(waits, 'a request on Receipt waits behind it');
  await open('one');
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('.board-row')].find(
      r => r.querySelector('span')?.textContent === 'Receipt',
    );
    row?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200 }));
    document.querySelector<HTMLElement>('#rowMenu [data-m="del"]')?.click();
    document.querySelector<HTMLElement>('#rowMenu [data-m="yes"]')?.click();
  });
  await until(() => !fs.existsSync(boardFile('pd')), 'Receipt is deleted in the library');
  await open('pb');
  await page.click('#prGit [data-git="commit"]');
  await until(
    async () => (await texts()).includes('There’s nothing new in this prototype to commit.'),
    'Commit on a prototype in the same repo isn’t held back by the deleted board’s request',
  );
  assert(!(await texts()).some(t => t.startsWith('I’m still building')), 'nor turned away');
  await build('Checkout build.');
  await until(waits, 'a request on Checkout waits behind the running build');
  standIn.next({ files: { 'src/Two.tsx': 'export const two = 2;\n' }, reply: 'Checkout.' });
  standIn.release();
  await until(() => chatOf('pb').some(m => m.text === 'Checkout.'), 'the request behind the deleted one runs');
  await settle(page, 800);
  assert.deepStrictEqual(ran(), ['Basket', 'Checkout'], 'and the deleted board’s request never ran');

  await open('pc');
  standIn.next({ files: { 'src/App.tsx': 'export const App = () => <h1>Basket 2</h1>;\n' }, hold: true });
  await build('Basket two build.');
  await until(() => standIn.wrote() === 1, 'another build runs on the other project’s prototype');
  await open('pe');
  await build('Invoice build.');
  await until(waits, 'a request on Invoice waits');
  await open('pb');
  await build('Checkout two build.');
  await until(waits, 'and one on Checkout behind it');
  fs.rmSync(boardFile('pe'));
  await until(async () => !(await inSidebar('Invoice')), 'Invoice’s file goes outside Fenmyr');
  standIn.next({ files: { 'src/Three.tsx': 'export const three = 3;\n' }, reply: 'Checkout two.' });
  standIn.release();
  await until(() => chatOf('pb').some(m => m.text === 'Checkout two.'), 'the request behind Invoice’s runs');
  await settle(page, 800);
  assert.deepStrictEqual(
    ran(),
    ['Basket', 'Checkout', 'Basket two', 'Checkout two'],
    'and the request of a board whose file has gone never runs',
  );

  standIn.next({ files: { 'src/Held.tsx': 'export const held = 1;\n' }, hold: true, reply: 'Held.' });
  await build('Held build.');
  await until(() => standIn.wrote() === 1, 'a build runs on Checkout');
  await build('Cleared build.');
  await build('Cleared two build.');
  await until(async () => (await heads()).filter(h => h === WAITING).length === 2, 'two requests wait behind it');
  await page.evaluate(() => document.getElementById('clearChats')?.click());
  await until(async () => !(await heads()).length, 'Clear all chats takes their blocks');
  standIn.next({ files: { 'src/After.tsx': 'export const after = 1;\n' }, reply: 'After.' });
  standIn.release();
  await until(() => chatOf('pb').some(m => m.text === 'Held.'), 'the build that ran goes on and lands');
  await until(async () => /^Built in/.test((await heads())[0] ?? ''), 'and its block comes back');
  await settle(page, 1500);
  await build('After build.');
  await until(() => chatOf('pb').some(m => m.text === 'After.'), 'a later request still runs');
  assert.deepStrictEqual(ran().slice(4), ['Held', 'After'], 'and the requests that waited through the clear never ran');
  assert.deepStrictEqual(l.errors, [], 'no errors');
  console.log('BUILD QUEUE GONE OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
  fs.rmSync(other.work, { recursive: true, force: true });
  fs.rmSync(data, { recursive: true, force: true });
}
