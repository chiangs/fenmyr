// A window reloaded while a build runs, as F12 and a reload can do in the packaged app: the host goes on writing, so
// Undo this build on the block is turned away in Myra's words and the folder stays as the build left it. The build's
// end still lands, on the record its board keeps, so the block reads what the build did, her line follows with Undo
// this build and Commit, that Undo puts the folder back, and all of it is there after a restart.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { replyBoard } from './fixtures/boards.ts';
import { buildStandIn } from './support/buildStandIn.ts';
import { launch, settle } from './support/launch.ts';
import { freshRepo } from './support/prototype.ts';

const { work, repo } = freshRepo('fenmyr-build-reload-');
const git = (...args: string[]) =>
  execFileSync('git', ['-C', repo, '-c', 'user.name=T', '-c', 'user.email=t@e.st', ...args]).toString();
fs.mkdirSync(path.join(repo, 'prototypes'));
fs.writeFileSync(path.join(repo, 'prototypes', 'design.md'), 'x\n');
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-build-reload-data-'));

const start = () => launch({ data, boards: [replyBoard('one', 'One')], open: 'one', claude: true });
let l = await start();
const standIn = buildStandIn(l);
const page = () => l.page;

const BUSY = 'I’m still building. You can undo once it’s done.';
const texts = () =>
  page().evaluate(() => [...document.querySelectorAll('#mcList .mc-msg')].map(m => m.firstChild?.textContent ?? ''));
const block = () =>
  page().evaluate(() => {
    const m = [...document.querySelectorAll('#mcList .mc-msg.bare')].at(-1);
    return {
      head: m?.querySelector('.m-summary b')?.textContent ?? '',
      lines: [...(m?.querySelectorAll('.m-summary li') ?? [])].map(li => li.textContent ?? ''),
      buttons: [...(m?.querySelectorAll('.m-acts button') ?? [])].map(b => b.textContent ?? ''),
    };
  });
const until = async (check: () => Promise<boolean> | boolean, what: string, ms = 20000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await page().waitForTimeout(100);
  }
  assert.fail(`${what}: ${JSON.stringify(await block())} ${JSON.stringify(await texts())}`);
};
const open = async (id: string) => {
  await page().evaluate(id => window.__fenmyr.openBoard(id), id);
  await settle(page(), 600);
};
const buttonsUnder = (text: string) =>
  page().evaluate(
    text =>
      [...document.querySelectorAll('#mcList .mc-msg.myra')]
        .filter(m => m.firstChild?.textContent === text)
        .map(m => [...m.querySelectorAll('.m-acts button')].map(b => b.textContent ?? '')),
    text,
  );
const record = () => {
  const chat: { acts?: { kind: string; start?: unknown }[] }[] =
    JSON.parse(fs.readFileSync(path.join(data, 'fenmyr', 'boards', 'pb.json'), 'utf8')).chat ?? [];
  return chat.flatMap(m => m.acts ?? []).find(a => a.kind === 'build');
};

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
      proto,
      cards: [],
      links: [],
      tray: [],
    });
    await window.__fenmyr.refreshBoards();
    return proto.dir;
  }, repo);
  const file = (f: string) => path.join(repo, dir, f),
    starter = fs.readFileSync(file('src/App.tsx'), 'utf8'),
    half = 'export const App = () => <h1>Half</h1>;\n',
    starterLines = starter.split('\n').length - (starter.endsWith('\n') ? 1 : 0);
  git('add', '-A');
  git('commit', '-qm', 'start');
  await open('pb');

  standIn.next({
    files: { 'src/App.tsx': half, 'src/late.tsx': 'late\n' },
    pause: true,
    reply: 'Built through a reload.',
  });
  await page().evaluate(() =>
    window.__fenmyr.applyMyra({ say: 'Writing it now.', build: { request: 'Reload during.' } }, 'Reload during.'),
  );
  await until(() => standIn.wrote() === 1 && !!record()?.start, 'the folder is saved and App.tsx written');
  await page().reload();
  await page().waitForFunction(() => !!window.__fenmyr?.curBoard());
  await open('pb');
  assert.deepStrictEqual((await block()).buttons, ['Undo this build'], 'the reloaded window offers Undo this build');

  await page().locator('#mcList button', { hasText: 'Undo this build' }).last().click();
  await until(async () => (await texts()).includes(BUSY), 'Myra turns the Undo away while the host still writes');
  assert.equal(fs.readFileSync(file('src/App.tsx'), 'utf8'), half, 'and the folder stays as the build left it');

  standIn.release();
  await until(
    async () => (await texts()).includes('Built through a reload.'),
    'the build’s end lands after the reload',
  );
  await until(async () => /^Preview runs/.test((await block()).lines.at(-1) ?? ''), 'its preview is checked');
  const built = await block();
  assert.match(built.head, /^Built in \d+ s$/, 'the block reads that it was built');
  assert.deepStrictEqual(
    built.lines,
    ['No cards to read', `src/App.tsx +1 −${starterLines}`, 'src/late.tsx +1 −0', 'Preview runs · no errors'],
    'with what it changed, and how its preview ran',
  );
  assert.deepStrictEqual(built.buttons, [], 'and no Undo of its own once her line has one');
  assert.deepStrictEqual(await buttonsUnder('Built through a reload.'), [['Undo this build', 'Commit']]);

  await page().locator('#mcList button', { hasText: 'Undo this build' }).last().click();
  await until(
    () => fs.readFileSync(file('src/App.tsx'), 'utf8') === starter && !fs.existsSync(file('src/late.tsx')),
    'that Undo puts the folder back',
  );
  await until(async () => (await block()).head.endsWith('· undone'), 'and the block says so');

  await l.close();
  l = await start();
  await open('pb');
  assert.match((await block()).head, /^Built in \d+ s · undone$/, 'all of it is there after a restart');
  assert.deepStrictEqual(l.errors, [], 'no errors');
  console.log('BUILD RELOAD OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
  fs.rmSync(data, { recursive: true, force: true });
}
