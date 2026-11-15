// A build is one block in its prototype's chat. It grows a line per file while Claude Code writes, with the chat left
// as it is and the board file unwritten, then reads "Built in N s" with the lines each file gained and lost and the card
// it was made from. Her explanation follows with Undo this build, Commit and her next steps, which her reply that
// started it doesn't have. Myra reads the block, it and her buttons come back after a restart, and Undo this build says
// so on it and takes Commit away. Only the newest build shows Undo this build and Commit, from the moment it is asked
// for, and one that changed nothing leaves them with the build before. A build cut off by quitting reads stopped and
// can be undone, and a block the chat lost while the build ran comes back.
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

const { work, repo } = freshRepo('fenmyr-build-block-');
const git = (...args: string[]) =>
  execFileSync('git', ['-C', repo, '-c', 'user.name=T', '-c', 'user.email=t@e.st', ...args]).toString();
fs.mkdirSync(path.join(repo, 'prototypes'));
fs.writeFileSync(path.join(repo, 'prototypes', 'design.md'), 'x\n');
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-build-block-data-'));

const start = async () => {
  const l = await launch({ data, boards: [replyBoard('one', 'One')], open: 'one', claude: true });
  return { l, standIn: buildStandIn(l) };
};
let { l, standIn } = await start();
const page = () => l.page;

type Block = { head: string; bar: boolean; lines: string[]; marks: string[]; made: string[]; buttons: string[] };
const blocks = (): Promise<Block[]> =>
  page().evaluate(() =>
    [...document.querySelectorAll('#mcList .mc-msg.bare')].map(m => ({
      head: m.querySelector('.m-summary b')?.textContent ?? '',
      bar: !!m.querySelector('.m-bar'),
      lines: [...m.querySelectorAll('.m-summary li')].map(li => li.textContent ?? ''),
      marks: [...m.querySelectorAll('.m-summary li')].map(
        li => (li instanceof HTMLElement ? li.dataset.mark : '') ?? '',
      ),
      made: [...m.querySelectorAll('.m-sources button')].map(b => b.textContent ?? ''),
      buttons: [...m.querySelectorAll('.m-acts button')].map(b => b.textContent ?? ''),
    })),
  );
const last = async () => (await blocks()).at(-1);
const texts = () => page().evaluate(() => [...document.querySelectorAll('#mcList .mc-msg')].map(m => m.textContent));
const until = async (check: () => Promise<boolean>, what: string, ms = 20000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await page().waitForTimeout(100);
  }
  assert.fail(`${what}: ${JSON.stringify(await blocks())} ${JSON.stringify(await texts())}`);
};
const buttonsUnder = (text: string) =>
  page().evaluate(
    text =>
      [...document.querySelectorAll('#mcList .mc-msg.myra')]
        .filter(m => m.firstChild?.textContent === text)
        .map(m => [...m.querySelectorAll('.m-acts button')].map(b => b.textContent ?? '')),
    text,
  );
const build = (request: string, next: string[] = []) =>
  page().evaluate(
    ({ request, next }) => window.__fenmyr.applyMyra({ say: 'Writing it now.', build: { request }, next }, request),
    { request, next },
  );
const open = async (id: string) => {
  await page().evaluate(id => window.__fenmyr.openBoard(id), id);
  await settle(page(), 400);
};
const relaunch = async () => {
  await l.close();
  ({ l, standIn } = await start());
  await open('pb');
};
const chatOf = (id: string): ChatMsg[] =>
  JSON.parse(fs.readFileSync(path.join(data, 'fenmyr', 'boards', `${id}.json`), 'utf8')).chat ?? [];
const tap = (label: string) => page().locator('#mcList button', { hasText: label }).last().click();
// her line once an Undo this build has finished, panes and all, which lands after the files are back
const back = async (n: number) =>
  until(
    async () => (await texts()).filter(t => t === 'It’s back to how it was before that build ✦').length === n,
    'and she says it’s back',
  );

try {
  const dir = await page().evaluate(async repo => {
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
      // its newest build is from before Commit named its build
      proto: { ...proto, build: 'old' },
      cards: [
        { id: 'n1', type: 'note', x: 0, y: 0, w: 220, h: 120, text: 'Checkout: show the total first' },
        { id: 'n2', type: 'note', x: 260, y: 0, w: 220, h: 120, text: 'Card fields' },
      ],
      links: [],
      tray: [],
      chat: [
        { who: 'me', text: 'Hello', t: 1 },
        {
          who: 'myra',
          text: 'An older build.',
          t: 2,
          acts: [
            { kind: 'commit', board: 'pb', message: 'Older' },
            { kind: 'buildUndo', board: 'pb', snapshot: 'a'.repeat(40), build: 'old' },
          ],
        },
      ],
    });
    await window.__fenmyr.refreshBoards();
    return proto.dir;
  }, repo);
  const file = (f: string) => path.join(repo, dir, f),
    starter = fs.readFileSync(file('src/App.tsx'), 'utf8'),
    // the lines git counts in the starter, every one of them replaced by the build's one line
    starterLines = starter.split('\n').length - (starter.endsWith('\n') ? 1 : 0);
  git('add', '-A');
  git('commit', '-qm', 'start');
  fs.writeFileSync(path.join(repo, 'staged.txt'), 'mine');
  git('add', 'staged.txt');
  await open('pb');
  const boardFile = path.join(data, 'fenmyr', 'boards', 'pb.json'),
    written = () => fs.statSync(boardFile).mtimeMs;

  assert.deepStrictEqual(
    await buttonsUnder('An older build.'),
    [['Commit', 'Undo this build']],
    'an older build’s line',
  );
  standIn.next({ files: { 'src/Half.tsx': 'half\n' }, fail: 'I ran out of room.' });
  await build('Start the form.');
  const half = 'I couldn’t finish that. I ran out of room.';
  await until(async () => (await buttonsUnder(half)).length === 1, 'a build that fails after writing a file');
  assert.deepStrictEqual(await buttonsUnder('An older build.'), [[]], 'takes the older build’s Commit and Undo away');
  await tap('Undo this build');
  await until(async () => !fs.existsSync(file('src/Half.tsx')), 'and its own Undo this build takes Half.tsx away');
  await back(1);

  await page().evaluate(() => Object.assign(document.querySelector('#mcList .mc-msg.me') ?? {}, { kept: 'yes' }));
  const explained = 'I made the form and put the total first.';
  standIn.next({
    files: {
      'src/App.tsx': 'export const App = () => <h1>Made by the stand-in</h1>;\n',
      'src/Form.tsx': 'export function Form() {\n  return <form />;\n}\n',
    },
    pause: true,
    hold: true,
    reply: `${explained}\nCARDS: src/App.tsx=n1; src/Form.tsx=n1\nNEXT: Add a coupon field | Show the total in bold`,
  });
  await build('Make the checkout form.', ['A chip on the wrong line']);
  await until(
    async () => (await last())?.lines.join('|') === 'Read 2 cards|src/App.tsx',
    'it grows a line for App.tsx',
  );
  const b = await last();
  assert.strictEqual(b?.head, 'Building…', 'while Claude Code writes');
  assert.ok(b?.bar, 'with a moving bar');
  assert.deepStrictEqual(b?.marks, ['done', 'now'], 'the file being written marked as such');
  // her reply's save has landed by now
  await settle(page(), 1000);
  const before = written();
  standIn.release();
  await until(
    async () => (await last())?.lines.join('|') === 'Read 2 cards|src/App.tsx|src/Form.tsx',
    'then a line for Form.tsx',
  );
  assert.deepStrictEqual((await last())?.marks, ['done', 'done', 'now'], 'the newest marked, the others done');
  await page().waitForTimeout(800);
  assert.strictEqual(written(), before, 'and the board file isn’t written for each file');
  standIn.release();

  await until(async () => /^Built in \d+ s$/.test((await last())?.head ?? ''), 'it ends built');
  const built = await last();
  assert.deepStrictEqual(
    built?.lines,
    ['Read 2 cards', `src/App.tsx +1 −${starterLines}`, 'src/Form.tsx +3 −0'],
    'with the lines each file gained and lost',
  );
  assert.ok(!built?.bar, 'and no bar');
  assert.deepStrictEqual(built?.made, ['↗ Checkout: show the total first'], 'made from the card it names');
  await until(async () => (await buttonsUnder(explained)).length === 1, 'her explanation follows');
  const hers = [['Undo this build', 'Commit', 'Add a coupon field', 'Show the total in bold']];
  assert.deepStrictEqual(await buttonsUnder(explained), hers, 'with Undo this build, Commit and her next steps');
  assert.deepStrictEqual(
    (await buttonsUnder('Writing it now.')).at(-1),
    [],
    'her reply that started it has no next steps',
  );
  assert.deepStrictEqual(
    (await texts()).slice(-3).map(t => (t?.startsWith('Built in') ? 'block' : t)),
    ['Writing it now.', 'block', `${explained}Undo this buildCommitAdd a coupon fieldShow the total in bold`],
    'three messages: her reply, the block and her explanation',
  );
  assert.strictEqual(
    await page().evaluate(() => Reflect.get(document.querySelector('#mcList .mc-msg.me') ?? {}, 'kept')),
    'yes',
    'the chat was never drawn again: the person’s line is the same element',
  );

  await page().evaluate(() => window.__fenmyr.ask('What did you change?'));
  assert.match(
    standIn.asks().at(-1) ?? '',
    new RegExp(`Myra: Built in \\d+ s: src/App\\.tsx \\+1 −${starterLines}, src/Form\\.tsx \\+3 −0`),
    'Myra reads the block when asked next',
  );

  await relaunch();
  assert.deepStrictEqual(await last(), built, 'after a restart the block reads the same');
  assert.deepStrictEqual(await buttonsUnder(explained), hers, 'and her buttons come back');
  await tap('Undo this build');
  await until(
    async () => fs.readFileSync(file('src/App.tsx'), 'utf8') === starter,
    'Undo this build puts App.tsx back',
  );
  await until(async () => !fs.existsSync(file('src/Form.tsx')), 'and takes Form.tsx away');
  assert.strictEqual(git('diff', '--cached', '--name-only').trim(), 'staged.txt', 'leaving what was staged');
  await until(async () => (await last())?.head.endsWith(' · undone') ?? false, 'and the block says it was undone');
  await back(2);
  assert.deepStrictEqual(
    await buttonsUnder(explained),
    [['Add a coupon field', 'Show the total in bold']],
    'and Commit goes from her line',
  );

  standIn.next({ files: { 'src/Total.tsx': 'export const total = 1;\n' }, reply: 'I added the total.' });
  await build('Add the total.');
  await until(async () => (await buttonsUnder('I added the total.')).length === 1, 'a second build lands');
  const newest = [
    ['Add a coupon field', 'Show the total in bold'],
    ['Undo this build', 'Commit'],
  ];
  const rows = async () => [...(await buttonsUnder(explained)), ...(await buttonsUnder('I added the total.'))];
  assert.deepStrictEqual(await rows(), newest, 'only the newest build shows Undo this build and Commit');
  await open('one');
  await open('pb');
  assert.deepStrictEqual(await rows(), newest, 'after opening it again too');

  // the host takes a while to answer, so the next build is still starting
  await page().evaluate(() => {
    const real = window.Fenmyr.protoBuild;
    window.Fenmyr.protoBuild = async a => {
      window.Fenmyr.protoBuild = real;
      await new Promise(go => Object.assign(window, { go }));
      return real(a);
    };
  });
  standIn.next({ files: {}, reply: 'Nothing needed changing.' });
  await build('Check the total.');
  await until(async () => (await last())?.head === 'Starting…', 'the next build starts');
  assert.ok((await last())?.bar, 'with its bar');
  assert.deepStrictEqual(
    await buttonsUnder('I added the total.'),
    [[]],
    'and the build before can’t be undone or committed meanwhile',
  );
  await page().evaluate(() => {
    const go = Reflect.get(window, 'go');
    if (typeof go === 'function') go();
  });
  await until(async () => (await buttonsUnder('Nothing needed changing.')).length === 1, 'it ends');
  assert.deepStrictEqual(await buttonsUnder('Nothing needed changing.'), [[]], 'having changed nothing to undo');
  assert.deepStrictEqual(
    await buttonsUnder('I added the total.'),
    [['Undo this build', 'Commit']],
    'so the build before is the newest again',
  );

  const total = fs.readFileSync(file('src/App.tsx'), 'utf8');
  standIn.next({ files: { 'src/App.tsx': 'export const App = () => <h1>Cut off</h1>;\n' }, hold: true });
  await build('Change the heading.');
  await until(async () => (await last())?.lines.includes('src/App.tsx') ?? false, 'a third build writes App.tsx');
  await until(
    async () =>
      chatOf('pb').some(m => m.acts?.some(a => a.kind === 'build' && a.request === 'Change the heading.' && a.start)),
    'and its start is saved',
  );
  await relaunch();
  const stopped = await last();
  assert.strictEqual(stopped?.head, 'Stopped · Fenmyr closed before it finished', 'quitting cuts it off');
  assert.deepStrictEqual(stopped?.buttons, ['Undo this build'], 'and its block offers Undo this build');
  assert.deepStrictEqual(
    await buttonsUnder('I added the total.'),
    [[]],
    'while the build before it, never undone, offers neither Undo this build nor Commit',
  );
  await tap('Undo this build');
  await until(async () => fs.readFileSync(file('src/App.tsx'), 'utf8') === total, 'which puts App.tsx back');
  await until(async () => (await last())?.buttons.length === 0, 'and goes');
  assert.match((await last())?.head ?? '', / · undone$/, 'as the block says');
  await back(3);

  standIn.next({ files: { 'src/Clear.tsx': 'export const c = 1;\n' }, hold: true, reply: 'I kept going.' });
  await build('Keep going.');
  await until(async () => standIn.wrote() === 1, 'a fourth build writes Clear.tsx');
  await page().evaluate(() => document.getElementById('clearChats')?.click());
  await until(async () => (await blocks()).length === 0, 'Clear all chats takes its block away');
  standIn.release();
  await until(async () => (await buttonsUnder('I kept going.')).length === 1, 'when it ends');
  assert.deepStrictEqual(
    (await texts()).map(t => (t?.startsWith('Built in') ? 'block' : t?.slice(0, 13))),
    ['block', 'I kept going.'],
    'its block comes back before her explanation',
  );
  assert.deepStrictEqual((await last())?.lines, ['Read 2 cards', 'src/Clear.tsx +1 −0'], 'with what it wrote');
  assert.deepStrictEqual(l.errors, []);
  console.log('BUILD BLOCK OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
  fs.rmSync(data, { recursive: true, force: true });
}
