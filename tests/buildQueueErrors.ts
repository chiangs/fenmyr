// A build that waited its turn on the open board is sent the errors the preview shows once it has caught up with the
// build before it, not the errors of the code that build replaced.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { replyBoard } from './fixtures/boards.ts';
import { buildStandIn } from './support/buildStandIn.ts';
import { launch, settle } from './support/launch.ts';
import { freshRepo } from './support/prototype.ts';

const { work, repo } = freshRepo('fenmyr-build-queue-errors-');
const git = (...args: string[]) =>
  execFileSync('git', ['-C', repo, '-c', 'user.name=T', '-c', 'user.email=t@e.st', ...args]).toString();
fs.mkdirSync(path.join(repo, 'prototypes'));
fs.writeFileSync(path.join(repo, 'prototypes', 'design.md'), 'x\n');
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-build-queue-errors-data-'));
const l = await launch({ data, boards: [replyBoard('one', 'One')], open: 'one', claude: true });
const standIn = buildStandIn(l);
const { page } = l;

const texts = () =>
  page.evaluate(() => [...document.querySelectorAll('#mcList .mc-msg')].map(m => m.firstChild?.textContent ?? ''));
const until = async (check: () => Promise<boolean> | boolean, what: string, ms = 20000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await page.waitForTimeout(100);
  }
  assert.fail(`${what}: ${JSON.stringify(await texts())}`);
};
const build = (request: string) =>
  page.evaluate(r => window.__fenmyr.applyMyra({ say: 'Writing it now.', build: { request: r } }, r), request);
const logged = () =>
  page.evaluate(() => [...document.querySelectorAll('#pr-preview .pv-log *')].map(e => e.textContent ?? '').join(' '));

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
      cards: [],
      links: [],
      tray: [],
    });
    await window.__fenmyr.refreshBoards();
    await window.__fenmyr.openBoard('pb');
  }, repo);
  git('add', '-A');
  git('commit', '-qm', 'start');
  await settle(page, 600);

  standIn.next({
    files: { 'src/App.tsx': "export function App() { console.error('boom-old'); return <h1>Old</h1>; }\n" },
    reply: 'Broken.',
  });
  await build('Broken build.');
  await until(async () => (await texts()).includes('Broken.'), 'a build that logs an error lands');
  await until(async () => (await logged()).includes('boom-old'), 'and the preview shows its error');

  standIn.next({
    files: { 'src/App.tsx': 'export function App() { return <h1>Fixed</h1>; }\n' },
    hold: true,
    reply: 'Fixed.',
  });
  await build('Fix build.');
  await until(() => standIn.wrote() === 1, 'the next build writes the fix');
  await build('Waiting build.');
  await until(async () => (await texts()).some(t => t.startsWith('Waiting')), 'another waits behind it');
  standIn.next({ files: { 'src/Two.tsx': 'export const two = 2;\n' }, reply: 'Waited.' });
  standIn.release();
  await until(async () => (await texts()).includes('Waited.'), 'the waiting build runs once the fix lands');

  const [, fix = '', waited = ''] = standIn.builds();
  assert(fix.includes('boom-old'), 'the fix was sent the error the preview showed');
  assert(!waited.includes('boom-old'), 'the build that waited isn’t sent the error the fix took away');
  assert.deepStrictEqual(l.errors, [], 'no errors');
  console.log('BUILD QUEUE ERRORS OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
  fs.rmSync(data, { recursive: true, force: true });
}
