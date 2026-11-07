// The buttons under Myra's build lines once they are stored: after two builds only the newest Undo shows, and it puts
// back only that build; Commit and Undo show only on the prototype they built; a build that lands while another board is
// open leaves its buttons there for that visit alone; and a reply that opens a new prototype doesn't take what it
// changed on the old board with it.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { replyBoard } from './fixtures/boards.ts';
import { launch, settle } from './support/launch.ts';

const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-build-buttons-')));
const repo = path.join(work, 'acme');
fs.mkdirSync(path.join(repo, 'prototypes'), { recursive: true });
const git = (...args: string[]) =>
  execFileSync('git', ['-C', repo, '-c', 'user.name=T', '-c', 'user.email=t@e.st', ...args]).toString();
git('init', '-q', '-b', 'main');
git('config', 'user.name', 'Ann Lee');
git('config', 'user.email', 'ann@example.com');
fs.writeFileSync(path.join(repo, 'prototypes', 'design.md'), 'x\n');
const bin = path.join(work, 'bin');
fs.mkdirSync(bin);
// a stand-in for Claude Code whose builds are numbered, and slow when asked, so a board can be switched mid-build
fs.writeFileSync(
  path.join(bin, 'claude'),
  `#!/bin/sh
case "$*" in
  *stream-json*)
    case "$2" in *SLOW*) sleep 4 ;; esac
    n=$(cat ${work}/n 2>/dev/null || echo 0); n=$((n+1)); echo $n > ${work}/n
    echo "export function App() { return <h1>Build $n</h1>; }" > src/App.tsx
    echo '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Write","input":{"file_path":"'"$PWD"'/src/App.tsx"}}]}}'
    printf '%s\\n' '{"type":"result","is_error":false,"result":"I built it.\\nCARDS: src/App.tsx=n1"}' ;;
  *) echo '{"type":"result","is_error":false,"result":"{\\"say\\": \\"ok\\"}"}' ;;
esac
`,
  { mode: 0o755 },
);

const l = await launch({
  boards: [replyBoard('one', 'One')],
  open: 'one',
  env: { PATH: `${bin}:${process.env.PATH ?? ''}` },
});
const { page } = l;
const builtRows = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('#mcList .mc-msg.myra')]
      .filter(m => m.firstChild?.textContent === 'I built it.')
      .map(m => [...m.querySelectorAll('.m-acts button')].map(b => b.textContent ?? '')),
  );
const until = async (check: () => Promise<boolean>, what: string, ms = 20000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await page.waitForTimeout(200);
  }
  assert.fail(`${what}: ${JSON.stringify(await builtRows())}`);
};
const built = async (n: number) => {
  await until(async () => (await builtRows()).length === n, `build ${n} lands`);
  await settle(page, 500);
};
const build = (request: string) =>
  page.evaluate(r => window.__fenmyr.applyMyra({ say: 'Writing it now.', build: { request: r } }, 'build it'), request);
const open = async (id: string) => {
  await page.waitForTimeout(500);
  await page.evaluate(id => window.__fenmyr.openBoard(id), id);
  await settle(page, 400);
  await page.evaluate(() => {
    if (!document.getElementById('myra')?.classList.contains('chat')) document.getElementById('mPill')?.click();
  });
  await settle(page, 300);
};
const reopen = async (id: string) => {
  await open(id === 'one' ? 'pb' : 'one');
  await open(id);
};
const tap = (label: string) => page.locator('#mcList .m-acts button', { hasText: label }).last().click();
const fileOf = (id: string) => JSON.parse(fs.readFileSync(path.join(l.data, 'fenmyr', 'boards', `${id}.json`), 'utf8'));

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
    await window.__fenmyr.openBoard('pb');
    return proto.dir;
  }, repo);
  const app = path.join(repo, dir, 'src/App.tsx');
  git('add', '-A');
  git('commit', '-qm', 'start');

  await build('First build.');
  await built(1);
  await build('Second build.');
  await built(2);
  await reopen('pb');
  await built(2);
  assert.deepStrictEqual(
    await builtRows(),
    [['Commit'], ['Commit', 'Undo']],
    'after two builds only the newest one’s Undo shows',
  );

  await tap('Commit');
  await until(async () => (await page.textContent('#mcList'))?.includes('Message: “Second build”') ?? false, 'asks');
  await tap('Not now');
  await reopen('pb');
  assert.deepStrictEqual(
    await builtRows(),
    [['Commit'], ['Undo']],
    'Commit then Not now keeps that build’s Undo, and only the Commit goes',
  );
  await tap('Undo');
  await until(async () => fs.readFileSync(app, 'utf8').includes('Build 1'), 'Undo puts back the last build');
  assert.match(fs.readFileSync(app, 'utf8'), /Build 1/, 'and only the last build');

  await build('SLOW third build.');
  await page.waitForTimeout(300);
  await open('one');
  await built(1);
  assert.deepStrictEqual(await builtRows(), [['Commit', 'Undo']], 'a build that lands on another board shows there');
  assert.deepStrictEqual(
    fileOf('one')
      .chat.filter((m: { text: string }) => m.text === 'I built it.')
      .map((m: { acts?: unknown }) => m.acts),
    [undefined],
    'but its buttons aren’t kept with that board',
  );
  await tap('Commit');
  await until(
    async () => /Commit 1 changed file in acme\/prototypes\/checkout/.test((await page.textContent('#mcList')) ?? ''),
    'its Commit there asks about the prototype it built',
  );
  await tap('Not now');
  await reopen('one');
  assert.deepStrictEqual(await builtRows(), [[]], 'and they are gone once that board opens again');

  const made = await page.evaluate(() =>
    window.__fenmyr.applyMyra(
      { say: 'Made it.', add: [{ text: 'On board one' }], newPrototype: { name: 'Shop', project: 'Acme' } },
      'q',
    ),
  );
  await settle(page, 1200);
  const now = await page.evaluate(() => window.__fenmyr.curBoard());
  assert.strictEqual(now.kind, 'prototype', 'the reply opens the new prototype');
  assert.ok(made, 'and is applied');
  const line = now.chat?.find(m => m.text === 'Made it.');
  assert.ok(line, 'her line lands on the new prototype');
  assert.deepStrictEqual(line.acts ?? [], [], 'without what the reply changed on board one');
  assert.ok(
    fileOf('one').cards.some((c: { text?: string }) => c.text === 'On board one'),
    'which board one keeps',
  );
  assert.deepStrictEqual(l.errors, []);
  console.log('BUILD BUTTONS OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
}
