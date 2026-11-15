// What the status line shows as builds wait their turn: a board renamed while its request waits is named as it is
// called when its build starts and when it lands.
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
  assert.deepStrictEqual(l.errors, [], 'no errors');
  console.log('BUILD QUEUE STATUS OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
  fs.rmSync(other.work, { recursive: true, force: true });
  fs.rmSync(data, { recursive: true, force: true });
}
