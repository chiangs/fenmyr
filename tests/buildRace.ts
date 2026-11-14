// Two builds asked for at once: one runs, Myra turns the other away in her own words, and the one that ran keeps its
// Undo. A build the host refuses gets the same line from her and leaves the board's newest build as it was.
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

const WAIT = 'I’m still writing the last change. I’ll start on this once it’s done.';
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
  await until(async () => (await builtRows()).length === 1, 'a build lands');
  await settle(page, 2500);
  assert.equal(fs.readFileSync(count, 'utf8').trim(), '1', 'one of the two builds runs');
  const said = await lines();
  assert.deepStrictEqual(
    said.filter(t => t.includes('still writing') || t.includes('already running')),
    [WAIT],
    'Myra turns the other away once, in her own words',
  );
  assert.deepStrictEqual(await builtRows(), [['Commit', 'Undo']], 'and the build that ran keeps its Undo');

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
      }),
    { repo, dir },
  );
  await build('Third build.');
  await until(async () => (await lines()).filter(t => t === WAIT).length === 2, 'the host refuses it');
  assert(!(await lines()).some(t => t.includes('already running')), 'in her words, not the host’s');
  assert.equal(await newest(), kept, 'a build the host refuses leaves the board’s newest build as it was');
  await until(async () => fs.readFileSync(count, 'utf8').trim() === '2', 'the other build ends');
  await settle(page, 800);
  await open('one');
  await open('pb');
  assert.deepStrictEqual(await builtRows(), [['Commit', 'Undo']], 'so the build that ran still has its Undo');
  assert.deepStrictEqual(l.errors, []);
  console.log('BUILD RACE OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
}
