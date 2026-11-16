// Explain the code only reads, so it takes no part in the one-build-at-a-time slot. It runs and lands while another
// prototype builds and this prototype's request waits behind it, and that request still starts once the build before
// it ends. Pressed before a build of its own prototype, it leaves that build free to start and land, and her answer
// follows. The status line names whichever began last.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { replyBoard } from './fixtures/boards.ts';
import { buildStandIn } from './support/buildStandIn.ts';
import { launch, settle } from './support/launch.ts';
import { freshRepo } from './support/prototype.ts';

const { work, repo } = freshRepo('fenmyr-build-explain-busy-');
const git = (...args: string[]) =>
  execFileSync('git', ['-C', repo, '-c', 'user.name=T', '-c', 'user.email=t@e.st', ...args]).toString();
fs.mkdirSync(path.join(repo, 'prototypes'));
fs.writeFileSync(path.join(repo, 'prototypes', 'design.md'), 'x\n');
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-build-explain-busy-data-'));

const l = await launch({ data, boards: [replyBoard('one', 'One')], open: 'one', claude: true });
const standIn = buildStandIn(l);
const page = l.page;

const EXPLAIN = 'Explain the code';
const texts = () =>
  page.evaluate(() => [...document.querySelectorAll('#mcList .mc-msg')].map(m => m.firstChild?.textContent ?? ''));
const heads = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('#mcList .mc-msg.bare .m-summary > b')].map(b => b.textContent ?? ''),
  );
const say = () => page.evaluate(() => document.querySelector('#mcStatusSay')?.firstChild?.textContent ?? '');
const until = async (check: () => Promise<boolean> | boolean, what: string, ms = 30000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await page.waitForTimeout(100);
  }
  assert.fail(`${what}: ${JSON.stringify(await texts())} ${JSON.stringify(await heads())} ${await say()}`);
};
const ask = (request: string) =>
  page.evaluate(r => window.__fenmyr.applyMyra({ say: 'Writing it now.', build: { request: r } }, r), request);
const landed = (request: string) =>
  until(async () => (await texts()).includes(`Done: ${request}`), `the build “${request}” lands`);
const open = async (id: string) => {
  await page.evaluate(id => window.__fenmyr.openBoard(id), id);
  await settle(page, 400);
};
const buttonsUnder = (text: string) =>
  page.evaluate(
    text =>
      [...document.querySelectorAll('#mcList .mc-msg.myra')]
        .filter(m => m.firstChild?.textContent === text)
        .map(m => [...m.querySelectorAll('.m-acts button')].map(b => b.textContent ?? '')),
    text,
  );
const tapUnder = (text: string, label: string) =>
  page.locator('#mcList .mc-msg.myra', { hasText: text }).getByRole('button', { name: label, exact: true }).click();
const app = (h: string) => `export function App() { return <h1>${h}</h1>; }\n`;

try {
  await page.evaluate(async repo => {
    await window.Fenmyr.saveFolders({
      projects: [{ id: 'p1', name: 'Acme', open: true, repo: { path: repo } }],
      folders: [{ id: 'pf', name: 'Prototypes', project: 'p1', kind: 'prototyping', open: true }],
      order: {},
    });
    for (const [id, name] of [
      ['pb', 'Checkout'],
      ['pb2', 'Basket'],
    ] as const) {
      const proto = await window.Fenmyr.protoCreate({ root: repo, name, stack: 'react' });
      await window.Fenmyr.save({ id, name, folder: 'pf', kind: 'prototype', proto, cards: [], links: [], tray: [] });
    }
    await window.__fenmyr.refreshBoards();
    await window.__fenmyr.openBoard('pb');
  }, repo);
  git('add', '-A');
  git('commit', '-qm', 'start');
  await settle(page, 600);

  standIn.next({ files: { 'src/App.tsx': app('A') }, reply: 'Done: A.' });
  await ask('A.');
  await landed('A.');

  await open('pb2');
  standIn.next({ files: { 'src/App.tsx': app('X') }, hold: true, reply: 'Done: X.' });
  await ask('X.');
  await until(() => standIn.wrote() === 1, 'Basket’s build is writing');

  await open('pb');
  standIn.next({ files: { 'src/App.tsx': app('B') }, reply: 'Done: B.' });
  await ask('B.');
  await until(async () => (await heads()).at(-1) === 'Waiting for the build before it', 'Checkout’s request waits');
  assert.deepStrictEqual(
    await buttonsUnder('Done: A.'),
    [['Undo this build', EXPLAIN, 'Commit']],
    'Explain the code shows while another prototype builds and this one’s request waits',
  );

  standIn.explain({ reply: 'A explained.', hold: true });
  await tapUnder('Done: A.', EXPLAIN);
  await until(async () => (await say()) === 'Reading the code…', 'the status line names the explanation, begun last');
  await until(() => standIn.explains().length === 1, 'Claude Code reads while Basket builds');
  standIn.explained();
  await until(async () => (await texts()).at(-1) === 'A explained.', 'her answer lands while the request still waits');
  assert.strictEqual((await heads()).at(-1), 'Waiting for the build before it', 'which goes on waiting its turn');
  assert.strictEqual(await say(), 'Building Basket', 'and the status line names the build again');

  standIn.release();
  await landed('B.');
  assert.strictEqual(
    (await texts()).indexOf('A explained.') < (await texts()).indexOf('Done: B.'),
    true,
    'once Basket’s build ends, the request that waited starts and lands',
  );

  standIn.explain({ reply: 'B explained.', hold: true });
  await tapUnder('Done: B.', EXPLAIN);
  await until(() => standIn.explains().length === 2, 'Claude Code reads B’s code');
  standIn.next({ files: { 'src/App.tsx': app('C') }, hold: true, reply: 'Done: C.' });
  await ask('C.');
  await until(() => standIn.wrote() === 1, 'a build asked for while she reads isn’t turned away');
  await until(async () => (await say()) === 'Building', 'the status line names the build, begun last');
  standIn.release();
  await landed('C.');
  await until(async () => (await say()) === 'Reading the code…', 'and goes back to the explanation once it has landed');
  standIn.explained();
  await until(async () => (await texts()).at(-1) === 'B explained.', 'her answer lands after the build');
  assert.deepStrictEqual(await buttonsUnder('Done: B.'), [[]], 'the build before has no buttons left');
  assert.deepStrictEqual(await buttonsUnder('Done: C.'), [['Undo this build', EXPLAIN, 'Commit']], 'the newest has');
  console.log('BUILD EXPLAIN BUSY OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
  fs.rmSync(data, { recursive: true, force: true });
}
