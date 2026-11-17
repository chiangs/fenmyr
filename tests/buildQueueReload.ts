// A window reloaded while a build runs knows nothing of that build, but the host goes on writing it. A commit or a pull
// then is turned away by the host in Myra's words, changing nothing, and the question's Commit stays so it works once
// the build is done. A build asked for then is one the host can't take yet, so it waits its turn as its own block rather
// than reading "Couldn't start", and starts by itself once the end of the build from before the reload is heard.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { replyBoard } from './fixtures/boards.ts';
import { buildStandIn } from './support/buildStandIn.ts';
import { launch, settle } from './support/launch.ts';
import { freshRepo } from './support/prototype.ts';

const { work, repo } = freshRepo('fenmyr-build-queue-reload-');
const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args]).toString();
git('config', 'user.name', 'T');
git('config', 'user.email', 't@e.st');
fs.mkdirSync(path.join(repo, 'prototypes'));
fs.writeFileSync(path.join(repo, 'prototypes', 'design.md'), 'x\n');
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-build-queue-reload-data-'));

const l = await launch({ data, boards: [replyBoard('one', 'One')], open: 'one', claude: true });
const standIn = buildStandIn(l);
const { page } = l;

type Block = { head: string; buttons: string[] };
const blocks = (): Promise<Block[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll('#mcList .mc-msg.bare')].map(m => ({
      head: m.querySelector('.m-summary b')?.textContent ?? '',
      buttons: [...m.querySelectorAll('.m-acts button')].map(b => b.textContent ?? ''),
    })),
  );
const texts = () =>
  page.evaluate(() => [...document.querySelectorAll('#mcList .mc-msg')].map(m => m.firstChild?.textContent ?? ''));
const until = async (check: () => Promise<boolean> | boolean, what: string, ms = 20000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await page.waitForTimeout(100);
  }
  assert.fail(`${what}: ${JSON.stringify(await blocks())} ${JSON.stringify(await texts())}`);
};
const build = (request: string) =>
  page.evaluate(r => window.__fenmyr.applyMyra({ say: 'Writing it now.', build: { request: r } }, r), request);
const question = () => page.locator('#mcList .mc-msg.myra', { hasText: 'Committing saves this version' }).last();
const tapCommit = () =>
  question()
    .locator('.m-acts button', { hasText: /^Commit$/ })
    .click();
const commits = () => git('rev-list', '--all', '--count').trim();
const open = async (id: string) => {
  await page.evaluate(id => window.__fenmyr.openBoard(id), id);
  await settle(page, 600);
};

try {
  const dir = await page.evaluate(async repo => {
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
    return proto.dir;
  }, repo);
  git('add', '-A');
  git('commit', '-qm', 'start');
  await open('pb');

  standIn.next({
    files: { 'src/App.tsx': 'export const App = () => <h1>Half</h1>;\n', 'src/late.tsx': 'late\n' },
    pause: true,
    reply: 'Built through a reload.',
  });
  await build('Reload during.');
  await until(() => standIn.wrote() === 1, 'the first build writes App.tsx');
  await page.reload();
  await page.waitForFunction(() => !!window.__fenmyr?.curBoard());
  await open('pb');

  await page.click('#prGit [data-git="commit"]');
  await until(
    async () => (await question().count()) === 1,
    'the git bar’s Commit asks, as the window knows of no build',
  );
  const before = commits();
  await tapCommit();
  await until(
    async () => (await texts()).includes('I’m still building. You can commit once it’s done.'),
    'the host turns the commit away, in her words',
  );
  await settle(page, 400);
  assert.equal(commits(), before, 'nothing is committed under the build');
  assert.deepStrictEqual(
    await question().locator('.m-acts button').allTextContents(),
    ['Commit', 'Not now'],
    'and the question’s Commit stays',
  );
  await page.evaluate(() => window.__fenmyr.applyMyra({ say: 'Pulling now.', git: { action: 'pull' } }, 'pull'));
  await until(
    async () => (await texts()).includes('I’m still building. You can pull once it’s done.'),
    'Pull is turned away the same way',
  );

  await build('After the reload.');
  await until(async () => (await blocks()).length === 2, 'a build asked for after the reload adds its block');
  await settle(page, 800);
  assert.deepStrictEqual(
    (await blocks())[1],
    { head: 'Waiting for the build before it', buttons: ['Cancel'] },
    'it waits for the build the host is still writing, rather than reading Couldn’t start',
  );
  assert.equal(standIn.builds().length, 1, 'and the builder hasn’t started it');

  standIn.next({ files: { 'src/After.tsx': 'export const after = 1;\n' }, reply: 'After.' });
  standIn.release();
  await until(async () => (await texts()).includes('Built through a reload.'), 'the first build’s end lands');
  await until(async () => (await texts()).includes('After.'), 'then the waiting one starts by itself and lands');
  assert.match((await blocks())[1]?.head ?? '', /^Built in \d+ s$/, 'its block reads built');
  assert(fs.existsSync(path.join(repo, dir, 'src/After.tsx')), 'and it wrote its file');
  assert.equal(standIn.builds().length, 2, 'the builder ran it once');
  await tapCommit();
  await until(() => commits() !== before, 'once the build is done, the same Commit commits');
  assert.deepStrictEqual(l.errors, [], 'no errors');
  console.log('BUILD QUEUE RELOAD OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
  fs.rmSync(data, { recursive: true, force: true });
}
