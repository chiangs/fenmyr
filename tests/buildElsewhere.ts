// A build lands in its own prototype's chat wherever the person is: an ordinary board open meanwhile gains nothing and
// hears of it on the status line, the prototype keeps her explanation with buttons that work when it opens, a failed
// build that changed files can be undone, and a change to a board as it opens is never lost.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { ChatMsg } from '../src/shared/chat.ts';
import { replyBoard } from './fixtures/boards.ts';
import { buildStandIn } from './support/buildStandIn.ts';
import { launch, settle } from './support/launch.ts';
import { freshRepo } from './support/prototype.ts';

const { work, repo } = freshRepo('fenmyr-build-elsewhere-');
const git = (...args: string[]) =>
  execFileSync('git', ['-C', repo, '-c', 'user.name=T', '-c', 'user.email=t@e.st', ...args]).toString();
fs.mkdirSync(path.join(repo, 'prototypes'));
fs.writeFileSync(path.join(repo, 'prototypes', 'design.md'), 'x\n');

const l = await launch({ boards: [replyBoard('one', 'One')], open: 'one', claude: true });
const { page } = l;
const standIn = buildStandIn(l);
const status = () => page.evaluate(() => document.getElementById('mcStatusSay')?.textContent ?? '');
const texts = () => page.evaluate(() => [...document.querySelectorAll('#mcList .mc-msg')].map(m => m.textContent));
const until = async (check: () => Promise<boolean>, what: string, ms = 20000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await page.waitForTimeout(100);
  }
  assert.fail(`${what}: ${await status()} | ${JSON.stringify(await texts())}`);
};
const chatOf = (id: string): ChatMsg[] =>
  JSON.parse(fs.readFileSync(path.join(l.data, 'fenmyr', 'boards', `${id}.json`), 'utf8')).chat ?? [];
const buttonsUnder = (text: string) =>
  page.evaluate(
    text =>
      [...document.querySelectorAll('#mcList .mc-msg.myra')]
        .filter(m => m.firstChild?.textContent === text)
        .map(m => [...m.querySelectorAll('.m-acts button')].map(b => b.textContent ?? '')),
    text,
  );
const build = (request: string) =>
  page.evaluate(r => window.__fenmyr.applyMyra({ say: 'Writing it now.', build: { request: r } }, 'build it'), request);
const open = async (id: string) => {
  await page.evaluate(id => window.__fenmyr.openBoard(id), id);
  await settle(page, 300);
  await page.evaluate(() => {
    if (!document.getElementById('myra')?.classList.contains('chat')) document.getElementById('mPill')?.click();
  });
  await settle(page, 300);
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
      cards: [{ id: 'n1', type: 'note', x: 0, y: 0, w: 220, h: 120, text: 'Checkout: show the total first' }],
      links: [],
      tray: [],
    });
    await window.__fenmyr.refreshBoards();
    return proto.dir;
  }, repo);
  const app = path.join(repo, dir, 'src/App.tsx'),
    starter = fs.readFileSync(app),
    // Undo this build can remove the file for a moment while it puts it back
    appNow = () => {
      try {
        return fs.readFileSync(app);
      } catch {
        return Buffer.alloc(0);
      }
    };
  git('add', '-A');
  git('commit', '-qm', 'start');
  git('config', 'user.name', 'T');
  git('config', 'user.email', 't@e.st');

  await open('pb');
  standIn.next({
    files: { 'src/App.tsx': 'export function App() { return <h1>Total first</h1>; }\n' },
    hold: true,
    reply: 'I put the total first.\nCARDS: src/App.tsx=n1',
  });
  await build('Put the total first.');
  await until(async () => appNow().includes('Total first'), 'the build writes App.tsx');
  await open('one');
  const before = { file: chatOf('one').length, shown: (await texts()).length };
  assert.strictEqual(await status(), 'Building Checkout', 'another board’s status line names the build');
  assert.strictEqual(
    await page.getAttribute('#mcStatus', 'title'),
    'Building Checkout',
    'in full on hover, where a narrow chat cuts it short',
  );
  standIn.release();
  await until(async () => (await status()) === 'Checkout is built', 'and says when it is built');
  const noted = Date.now();
  await until(async () => (await status()) === 'Ready', 'then rests again', 9000);
  const shown = Date.now() - noted;
  assert.ok(shown > 7000 && shown < 9000, `for 8 seconds, not ${shown} ms`);
  assert.strictEqual((await texts()).length, before.shown, 'the open chat gains no message');
  assert.strictEqual(chatOf('one').length, before.file, 'nor does its file');
  const landed = chatOf('pb').filter(m => m.text === 'I put the total first.');
  assert.strictEqual(landed.length, 1, 'her explanation lands once in the prototype’s file');
  assert.deepStrictEqual(
    landed[0]?.acts?.map(a => [a.kind, 'board' in a && a.board]),
    [
      ['commit', 'pb'],
      ['buildUndo', 'pb'],
    ],
    'with Commit and Undo this build kept',
  );
  assert.ok(
    chatOf('pb').some(m => m.acts?.some(a => a.kind === 'source' && a.card === 'n1')),
    'and the card it came from',
  );

  await open('pb');
  assert.deepStrictEqual(
    await buttonsUnder('I put the total first.'),
    [['Commit', 'Undo this build']],
    'opening the prototype shows its buttons',
  );
  await page.locator('#mcList .m-acts button', { hasText: 'Undo this build' }).last().click();
  await until(async () => appNow().equals(starter), 'Undo this build puts App.tsx back');

  standIn.next({ files: { 'src/App.tsx': 'half written\n' }, hold: true, fail: 'I ran out of room.' });
  await build('Add a coupon field.');
  await until(async () => appNow().toString() === 'half written\n', 'the failing build writes App.tsx');
  await open('one');
  standIn.release();
  await until(async () => (await status()) === 'Checkout’s build stopped', 'a stopped build is noted elsewhere');
  await open('pb');
  const failed = 'I couldn’t finish that. I ran out of room.';
  assert.deepStrictEqual(await buttonsUnder(failed), [['Undo this build']], 'a failed build that changed files');
  await page.locator('#mcList .m-acts button', { hasText: 'Undo this build' }).last().click();
  await until(async () => appNow().equals(starter), 'can be undone, byte for byte');

  standIn.next({ files: {}, fail: 'I couldn’t read the cards.' });
  await build('Try again.');
  const empty = 'I couldn’t finish that. I couldn’t read the cards.';
  await until(async () => (await buttonsUnder(empty)).length === 1, 'a failure that changed nothing lands');
  assert.deepStrictEqual(await buttonsUnder(empty), [[]], 'with nothing to undo');

  // a question asked while a build runs keeps the buttons it was drawn with when the build lands on its open board
  const question = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('#mcList .mc-msg.myra')]
        .filter(m => m.firstChild?.textContent?.startsWith('Commit '))
        .map(m => [...m.querySelectorAll('.m-acts button')].map(b => b.textContent ?? '')),
    );
  standIn.next({ files: { 'src/App.tsx': 'export function App() { return <h1>First</h1>; }\n' }, reply: 'First.' });
  await build('First.');
  await until(async () => (await buttonsUnder('First.')).length === 1, 'the first build lands');
  const other = path.join(repo, dir, 'src/Other.tsx');
  standIn.next({ files: { 'src/Other.tsx': 'export const other = 2;\n' }, hold: true, reply: 'Second.' });
  await build('Second.');
  await until(async () => fs.existsSync(other), 'the second build writes Other.tsx');
  await page.click('#prGit [data-git="commit"]');
  await until(async () => (await question()).length === 1, 'Commit asks first');
  standIn.release();
  await until(async () => (await buttonsUnder('Second.')).length === 1, 'the second build lands on its open board');
  assert.deepStrictEqual(await question(), [['Commit', 'Not now']], 'the question keeps its buttons');
  await page
    .locator('#mcList .mc-msg.myra')
    .filter({ hasText: /^First\./ })
    .getByRole('button', { name: 'Undo this build' })
    .click();
  await settle(page, 600);
  assert.ok(fs.existsSync(other), 'the first build’s Undo this build, pressed after the second, changes nothing');
  assert.deepStrictEqual(await buttonsUnder('First.'), [['Commit']], 'and goes');
  await page
    .locator('#mcList .mc-msg.myra')
    .filter({ hasText: /^Commit / })
    .getByRole('button', { name: 'Commit' })
    .click();
  await until(async () => git('status', '--porcelain').trim() === '', 'and its Commit still commits');

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
