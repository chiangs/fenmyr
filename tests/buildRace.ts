// Two builds asked for at once: the second waits its turn and runs once the first ends, and neither is turned away. A
// build asked for while the host writes one this window didn't start waits for that one's end, leaving the board's
// newest build as it was until then, and then runs.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { replyBoard } from './fixtures/boards.ts';
import { launch, settle } from './support/launch.ts';

const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-build-race-')));
const repo = path.join(work, 'acme'),
  bin = path.join(work, 'bin'),
  count = path.join(work, 'n');
fs.mkdirSync(repo);
fs.mkdirSync(bin);
const git = (...args: string[]) =>
  execFileSync('git', ['-C', repo, '-c', 'user.name=T', '-c', 'user.email=t@e.st', ...args]).toString();
git('init', '-q', '-b', 'main');
// a stand-in for Claude Code that counts its builds and takes two seconds over each
fs.writeFileSync(
  path.join(bin, 'claude'),
  `#!/bin/sh
case "$*" in
  *stream-json*)
    sleep 2
    n=$(cat ${count} 2>/dev/null || echo 0); n=$((n+1)); echo $n > ${count}
    echo "export function App() { return <h1>Build $n</h1>; }" > src/App.tsx
    echo '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Write","input":{"file_path":"'"$PWD"'/src/App.tsx"}}]}}'
    printf '%s\\n' '{"type":"result","is_error":false,"result":"I built it.\\nCARDS: none"}' ;;
  *) echo '{"type":"result","is_error":false,"result":"{\\"say\\": \\"ok\\"}"}' ;;
esac
`,
  { mode: 0o755 },
);

const WAITING = 'Waiting for the build before it';
const l = await launch({
  boards: [replyBoard('one', 'One')],
  open: 'one',
  env: { PATH: `${bin}:${process.env.PATH ?? ''}` },
});
const { page } = l;
const lines = () => page.$$eval('#mcList .mc-msg', ms => ms.map(m => m.textContent ?? ''));
const builtRows = () =>
  page.$$eval('#mcList .mc-msg.myra', ms =>
    ms
      .filter(m => m.firstChild?.textContent === 'I built it.')
      .map(m => [...m.querySelectorAll('.m-acts button')].map(b => b.textContent ?? '')),
  );
const until = async (check: () => Promise<boolean>, what: string) => {
  for (let end = Date.now() + 20000; Date.now() < end; await page.waitForTimeout(200)) if (await check()) return;
  assert.fail(`${what}: ${JSON.stringify(await lines())}`);
};
const build = (request: string) =>
  page.evaluate(r => window.__fenmyr.applyMyra({ say: 'Writing it now.', build: { request: r } }, 'build it'), request);
const newest = () =>
  page.evaluate(() => {
    const b = window.__fenmyr.curBoard();
    return b?.kind === 'prototype' ? b.proto.build : null;
  });
const open = async (id: string) => {
  await page.waitForTimeout(500);
  await page.evaluate(id => window.__fenmyr.openBoard(id), id);
  await settle(page, 400);
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
  await open('pb');

  // the host takes the first build at once and its answer reaches the page a second later, so the second is asked for
  // while the first is still starting
  await page.evaluate(() => {
    const real = window.Fenmyr.protoBuild;
    window.Fenmyr.protoBuild = async a => {
      window.Fenmyr.protoBuild = real;
      document.body.dataset.asked = 'yes';
      const r = await real(a);
      await new Promise(res => setTimeout(res, 1000));
      return r;
    };
  });
  await build('First build.');
  await until(() => page.evaluate(() => document.body.dataset.asked === 'yes'), 'the first build is asked for');
  await build('Second build.');
  await until(async () => (await lines()).some(t => t.startsWith(WAITING)), 'the second waits its turn');
  await until(async () => (await builtRows()).length === 2, 'then runs once the first ends, with no click');
  assert.equal(fs.readFileSync(count, 'utf8').trim(), '2', 'both builds run');
  assert(!(await lines()).some(t => /still writing|already running|Couldn’t start/.test(t)), 'neither is turned away');
  assert.deepStrictEqual(await builtRows(), [[], ['Undo this build', 'Commit']], 'and the newest keeps its Undo');

  const kept = await newest();
  assert.ok(kept, 'the board names its newest build');
  // a build the renderer didn't start holds the repo, as one left running by an earlier window would
  await page.evaluate(
    ({ repo, dir }) =>
      window.Fenmyr.protoBuild({
        root: repo,
        dir,
        stack: 'react',
        request: 'Elsewhere',
        purpose: '',
        device: '',
        cards: '[]',
        errors: '',
        pictures: [],
        build: '',
        board: '',
      }),
    { repo, dir },
  );
  await build('Third build.');
  await until(
    async () => (await lines()).filter(t => t.startsWith(WAITING)).length === 1,
    'the host can’t take it yet',
  );
  assert(!(await lines()).some(t => /already running|Couldn’t start/.test(t)), 'so it waits rather than failing');
  assert.equal(await newest(), kept, 'and the board’s newest build stays as it was');
  await until(async () => (await builtRows()).length === 3, 'it runs once the other build ends');
  assert.equal(fs.readFileSync(count, 'utf8').trim(), '4', 'after the build the host was writing');
  assert.notEqual(await newest(), kept, 'and it is the newest now');
  await settle(page, 800);
  await open('one');
  await open('pb');
  assert.deepStrictEqual(
    await builtRows(),
    [[], [], ['Undo this build', 'Commit']],
    'so only the newest build has its Undo',
  );
  assert.deepStrictEqual(l.errors, []);
  console.log('BUILD RACE OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
}
