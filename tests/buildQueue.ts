// A build asked for while another runs waits its turn as its own block, "Waiting for the build before it", with its
// request and Cancel, then starts with no click when the one before it ends, on whichever board is open, and lands in
// its own prototype. Cancel leaves "Not started" and nothing for the builder. While a build runs or waits on a
// prototype, Undo this build, Commit and Pull are turned away in Myra's words, change no file and stay where they were,
// so they work once nothing waits. Myra's facts say a build is running, so her words can match.
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

const { work, repo } = freshRepo('fenmyr-build-queue-');
const git = (...args: string[]) =>
  execFileSync('git', ['-C', repo, '-c', 'user.name=T', '-c', 'user.email=t@e.st', ...args]).toString();
fs.mkdirSync(path.join(repo, 'prototypes'));
fs.writeFileSync(path.join(repo, 'prototypes', 'design.md'), 'x\n');
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-build-queue-data-'));

const l = await launch({ data, boards: [replyBoard('one', 'One')], open: 'one', claude: true });
const standIn = buildStandIn(l);
const { page } = l;

type Block = { head: string; lines: string[]; marks: string[]; buttons: string[] };
const blocks = (): Promise<Block[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll('#mcList .mc-msg.bare')].map(m => ({
      head: m.querySelector('.m-summary b')?.textContent ?? '',
      lines: [...m.querySelectorAll('.m-summary li')].map(li => li.textContent ?? ''),
      marks: [...m.querySelectorAll('.m-summary li')].map(
        li => (li instanceof HTMLElement ? li.dataset.mark : '') ?? '',
      ),
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
const buttonsUnder = (text: string) =>
  page.evaluate(
    text =>
      [...document.querySelectorAll('#mcList .mc-msg.myra')]
        .filter(m => m.firstChild?.textContent === text)
        .map(m => [...m.querySelectorAll('.m-acts button')].map(b => b.textContent ?? '')),
    text,
  );
const tapUnder = (text: string, label: string) =>
  page
    .locator('#mcList .mc-msg.myra')
    .filter({ hasText: new RegExp(`^${text.replace('.', '\\.')}`) })
    .getByRole('button', { name: label })
    .click();
const build = (request: string) =>
  page.evaluate(r => window.__fenmyr.applyMyra({ say: 'Writing it now.', build: { request: r } }, r), request);
const open = async (id: string) => {
  await page.evaluate(id => window.__fenmyr.openBoard(id), id);
  await settle(page, 400);
};
const chatOf = (id: string): ChatMsg[] =>
  JSON.parse(fs.readFileSync(path.join(data, 'fenmyr', 'boards', `${id}.json`), 'utf8')).chat ?? [];
const recordIn = (id: string, request: string) =>
  chatOf(id)
    .flatMap(m => m.acts ?? [])
    .find(a => a.kind === 'build' && a.request === request);
const commits = () => git('rev-list', '--all', '--count').trim();

try {
  const dirs = await page.evaluate(async repo => {
    await window.Fenmyr.saveFolders({
      projects: [{ id: 'p1', name: 'Acme', open: true, repo: { path: repo } }],
      folders: [{ id: 'pf', name: 'Prototypes', project: 'p1', kind: 'prototyping', open: true }],
      order: {},
    });
    const made: string[] = [];
    for (const [id, name] of [
      ['pb', 'Checkout'],
      ['pc', 'Basket'],
    ] as const) {
      const proto = await window.Fenmyr.protoCreate({ root: repo, name, stack: 'react' });
      await window.Fenmyr.save({ id, name, folder: 'pf', kind: 'prototype', proto, cards: [], links: [], tray: [] });
      made.push(proto.dir);
    }
    await window.__fenmyr.refreshBoards();
    return made;
  }, repo);
  const [pbDir = '', pcDir = ''] = dirs;
  const inPb = (f: string) => path.join(repo, pbDir, f);
  git('add', '-A');
  git('commit', '-qm', 'start');
  await open('pb');

  await page.evaluate(() => window.__fenmyr.ask('What is this?'));
  assert.doesNotMatch(standIn.asks().at(-1) ?? '', /"building":true/, 'with no build, Myra’s facts don’t say one runs');

  standIn.next({ files: { 'src/App.tsx': 'export const App = () => <h1>One</h1>;\n' }, hold: true, reply: 'First.' });
  await build('First build.');
  await until(() => standIn.wrote() === 1, 'the first build writes App.tsx');
  await build('Second build.\nWith the total first.');
  await until(async () => (await blocks()).length === 2, 'the second request adds its own block');
  assert.deepStrictEqual(
    (await blocks())[1],
    {
      head: 'Waiting for the build before it',
      lines: ['No cards to read', 'Second build.'],
      marks: ['done', 'wait'],
      buttons: ['Cancel'],
    },
    'a request during a build waits, with its first line and Cancel',
  );
  assert(!(await texts()).some(t => /still writing|Ask me again/.test(t)), 'and Myra doesn’t turn it away');

  await page.evaluate(() => window.__fenmyr.ask('Is it done yet?'));
  assert.match(
    standIn.asks().at(-1) ?? '',
    /"building":true/,
    'a question asked during a build tells Myra one is running',
  );

  await build('Third build.');
  await until(async () => (await blocks()).length === 3, 'a third request waits too');
  await page.locator('#mcList .mc-msg.bare').nth(2).getByRole('button', { name: 'Cancel' }).click();
  await until(async () => (await blocks())[2]?.head === 'Not started', 'Cancel leaves it reading Not started');
  assert.deepStrictEqual((await blocks())[2]?.buttons, [], 'with no button');
  assert.deepStrictEqual((await blocks())[1]?.head, 'Waiting for the build before it', 'and the other still waits');

  standIn.next({ files: { 'src/Form.tsx': 'export const Form = () => null;\n' }, reply: 'Second.' });
  standIn.release();
  await until(async () => (await texts()).includes('Second.'), 'the second starts with no click and lands');
  const heads = (await blocks()).map(b => b.head);
  assert.match(heads[0] ?? '', /^Built in \d+ s$/, 'the first ends built');
  assert.match(heads[1] ?? '', /^Built in \d+ s$/, 'and so does the second');
  await settle(page, 1500);
  const builds = standIn.builds();
  assert.equal(builds.length, 2, 'the builder ran two builds, never the cancelled one');
  assert(builds[0]?.includes('First build.') && builds[1]?.includes('Second build.'), 'in the order asked');
  assert.equal(heads[2], 'Not started', 'the cancelled one still reads Not started');
  const cancelled = recordIn('pb', 'Third build.');
  assert(cancelled?.kind === 'build' && !cancelled.start && !cancelled.end, 'and nothing is stored for the cancel');

  standIn.next({ files: { 'src/App.tsx': 'export const App = () => <h1>Four</h1>;\n' }, hold: true, reply: 'Fourth.' });
  await build('Fourth build.');
  await until(() => standIn.wrote() === 1, 'the fourth build writes App.tsx');
  await build('Fifth build.');
  await until(async () => (await blocks()).at(-1)?.head === 'Waiting for the build before it', 'the fifth waits');
  await open('one');
  standIn.next({ files: { 'src/Late.tsx': 'export const late = 1;\n' }, reply: 'Fifth.' });
  standIn.release();
  await until(() => {
    const r = recordIn('pb', 'Fifth build.');
    return r?.kind === 'build' && r.end?.kind === 'built' && chatOf('pb').some(m => m.text === 'Fifth.');
  }, 'a build that waited runs with its board closed and lands in its own file');
  assert(fs.existsSync(inPb('src/Late.tsx')), 'in its own prototype’s folder');

  await open('pc');
  standIn.next({
    files: { 'src/App.tsx': 'export const App = () => <h1>Basket</h1>;\n' },
    hold: true,
    reply: 'Basket.',
  });
  await build('Basket build.');
  await until(() => standIn.wrote() === 1, 'a build runs on the other prototype');
  await open('pb');
  assert.deepStrictEqual(await buttonsUnder('Fifth.'), [['Undo this build', 'Commit']], 'the newest build here');
  await build('Sixth build.');
  await until(async () => (await blocks()).at(-1)?.head === 'Waiting for the build before it', 'the sixth waits');
  const before = commits();

  await tapUnder('Fifth.', 'Undo this build');
  const noUndo = 'I’m still building. You can undo once it’s done.';
  await until(async () => (await texts()).includes(noUndo), 'Undo this build waits while a build waits here');
  assert(fs.existsSync(inPb('src/Late.tsx')), 'and changes no file');
  await tapUnder('Fifth.', 'Commit');
  const noCommit = 'I’m still building. You can commit once it’s done.';
  await until(async () => (await texts()).includes(noCommit), 'her line’s Commit waits too');
  await page.click('#prGit [data-git="commit"]');
  await until(async () => (await texts()).filter(t => t === noCommit).length === 2, 'and so does the git bar’s');
  await page.evaluate(() => window.__fenmyr.applyMyra({ say: 'Pulling now.', git: { action: 'pull' } }, 'pull'));
  await until(
    async () => (await texts()).some(t => t.includes('I’m still building. You can pull once it’s done.')),
    'Pull waits too',
  );
  assert.equal(commits(), before, 'nothing was committed');
  assert(!(await texts()).some(t => t.startsWith('Commit ')), 'nor asked about');
  assert.deepStrictEqual(await buttonsUnder('Fifth.'), [['Undo this build', 'Commit']], 'and both buttons stay');

  await page.locator('#mcList .mc-msg.bare').last().getByRole('button', { name: 'Cancel' }).click();
  await until(async () => (await blocks()).at(-1)?.head === 'Not started', 'the sixth is cancelled');
  standIn.release();
  await until(() => chatOf('pc').some(m => m.text === 'Basket.'), 'the other prototype’s build lands');
  assert(fs.readFileSync(path.join(repo, pcDir, 'src/App.tsx'), 'utf8').includes('Basket'), 'in its own folder');
  await tapUnder('Fifth.', 'Undo this build');
  await until(
    () => !fs.existsSync(inPb('src/Late.tsx')),
    'once no build runs or waits, the same Undo this build works',
  );
  assert.deepStrictEqual(
    standIn
      .builds()
      .map(p =>
        ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Basket', 'Sixth'].find(n => p.includes(`${n} build.`)),
      ),
    ['First', 'Second', 'Fourth', 'Fifth', 'Basket'],
    'and the builder ran each build in turn, never a cancelled one',
  );
  assert.deepStrictEqual(l.errors, [], 'no errors');
  console.log('BUILD QUEUE OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
  fs.rmSync(data, { recursive: true, force: true });
}
