// What the status line shows and a screen reader hears as builds wait their turn: a board renamed while its request
// waits is named as it is called when its build starts and when it lands; the live region says a request waits, that
// it started and that it was cancelled; after Cancel, keyboard focus stays on the block it left; and the note that a
// build on another board is built keeps the line for its 8 seconds when the next build starts straight after it.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { replyBoard } from './fixtures/boards.ts';
import { buildStandIn } from './support/buildStandIn.ts';
import { launch, settle } from './support/launch.ts';
import { freshRepo } from './support/prototype.ts';

const { work, repo } = freshRepo('fenmyr-build-queue-status-');
const other = freshRepo('fenmyr-build-queue-status-other-');
const git = (...args: string[]) =>
  execFileSync('git', ['-C', repo, '-c', 'user.name=T', '-c', 'user.email=t@e.st', ...args]).toString();
fs.mkdirSync(path.join(repo, 'prototypes'));
fs.writeFileSync(path.join(repo, 'prototypes', 'design.md'), 'x\n');
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-build-queue-status-data-'));

const l = await launch({ data, boards: [replyBoard('one', 'One')], open: 'one', claude: true });
const standIn = buildStandIn(l);
const { page } = l;

const heads = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('#mcList .mc-msg.bare')].map(m => m.querySelector('.m-summary b')?.textContent ?? ''),
  );
// what the status line shows, without what only a screen reader hears
const status = () => page.evaluate(() => document.getElementById('mcStatusSay')?.firstChild?.textContent ?? '');
const until = async (check: () => Promise<boolean> | boolean, what: string, ms = 20000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await page.waitForTimeout(50);
  }
  assert.fail(`${what}: ${JSON.stringify(await status())} ${JSON.stringify(await heads())}`);
};
const build = (request: string) =>
  page.evaluate(r => window.__fenmyr.applyMyra({ say: 'Writing it now.', build: { request: r } }, r), request);
const open = async (id: string) => {
  await page.evaluate(id => window.__fenmyr.openBoard(id), id);
  await settle(page, 400);
};
// every change to what only a screen reader hears from the status line, oldest first
const heard = async (): Promise<string[]> =>
  JSON.parse(await page.evaluate(() => document.documentElement.dataset.heard ?? '[]'));
const waits = async () => (await heads()).at(-1) === 'Waiting for the build before it';

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
  await until(() => standIn.wrote() === 1, 'a build runs on Basket');
  await open('pb');
  await build('Renamed build.');
  await until(waits, 'a request on Checkout waits');
  await open('one');
  await page.evaluate(() => window.__fenmyr.renameBoard({ id: 'pb' }, 'Checkout Two'));
  await open('pc');
  standIn.next({ files: { 'src/Renamed.tsx': 'export const r = 1;\n' }, ms: 3000 });
  standIn.release();
  await until(
    async () => (await status()) === 'Building Checkout Two',
    'while its build runs, the status line names the board as it is called now',
  );
  await until(async () => (await status()) === 'Checkout Two is built', 'and so it does once it lands');

  await page.evaluate(() => {
    const say = document.getElementById('mcStatusSay'),
      log: string[] = [];
    if (!say) return;
    new MutationObserver(() => {
      const h = say.querySelector('.mc-heard')?.textContent ?? '';
      if (h && h !== log.at(-1)) log.push(h);
      document.documentElement.dataset.heard = JSON.stringify(log);
    }).observe(say, { childList: true, subtree: true, characterData: true });
  });
  await open('pb');
  standIn.next({ files: { 'src/App.tsx': 'export const App = () => <h1>First</h1>;\n' }, hold: true });
  await build('First build.');
  await until(() => standIn.wrote() === 1, 'a build runs on Checkout Two');
  await build('Second build.');
  await until(waits, 'a second request waits');
  await until(
    async () => (await heard()).includes('Checkout Two’s build waits its turn'),
    'a screen reader hears that it waits',
  );
  await build('Third build.');
  await until(async () => (await heads()).filter(h => h.startsWith('Waiting')).length === 2, 'a third waits');
  await page.locator('#mcList .mc-msg.bare').last().getByRole('button', { name: 'Cancel' }).focus();
  await page.keyboard.press('Enter');
  await until(async () => (await heads()).at(-1) === 'Not started', 'Cancel from the keyboard cancels it');
  assert(
    await page.evaluate(() => {
      const a = document.activeElement;
      return a === [...document.querySelectorAll('#mcList .mc-msg.bare')].at(-1);
    }),
    'and focus stays on the block it left',
  );
  await until(
    async () => (await heard()).includes('Checkout Two’s build is cancelled'),
    'a screen reader hears that it was cancelled',
  );
  standIn.next({ files: { 'src/Second.tsx': 'export const second = 2;\n' }, ms: 1500 });
  standIn.release();
  await until(
    async () => (await heard()).includes('Checkout Two’s build has started'),
    'and hears the waiting build start by itself',
  );
  await until(async () => !(await heads()).includes('Building…'), 'it lands');
  await settle(page, 1000);

  standIn.next({ files: { 'src/App.tsx': 'export const App = () => <h1>Again</h1>;\n' }, hold: true });
  await build('Checkout build.');
  await until(() => standIn.wrote() === 1, 'another build runs on Checkout Two');
  await open('pd');
  await build('Receipt build.');
  await until(waits, 'a request on Receipt waits behind it');
  await open('one');
  const ran = standIn.builds().length;
  standIn.next({ files: { 'src/Receipt.tsx': 'export const receipt = 1;\n' }, ms: 10000 });
  standIn.release();
  await until(() => standIn.builds().length === ran + 1, 'Receipt’s build starts as soon as Checkout Two’s lands');
  assert.equal(await status(), 'Checkout Two is built', 'and the status line still says the one before is built');
  await until(
    async () => (await status()) === 'Building Receipt',
    'then, once that note has had its time, the line says what is building',
    12000,
  );
  await until(async () => (await status()) === 'Receipt is built', 'Receipt’s build lands');
  assert.equal(
    await page.evaluate(() => document.getElementById('mcStatusSay')?.textContent),
    'Receipt is built',
    'and a screen reader no longer hears that it started',
  );
  assert.deepStrictEqual(l.errors, [], 'no errors');
  console.log('BUILD QUEUE STATUS OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
  fs.rmSync(other.work, { recursive: true, force: true });
  fs.rmSync(data, { recursive: true, force: true });
}
