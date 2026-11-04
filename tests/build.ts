// Myra writing a prototype's code through a stand-in Claude Code: the files change in the prototype's folder, the
// preview shows the result, her explanation comes with an Undo that puts the folder back without touching what's
// staged, and a change outside the folder is reported.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch } from './support/launch.ts';

const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-build-')));
const repo = path.join(work, 'acme');
fs.mkdirSync(repo);
const git = (...args: string[]) =>
  execFileSync('git', ['-C', repo, '-c', 'user.name=T', '-c', 'user.email=t@e.st', ...args]).toString();
git('init', '-q', '-b', 'main');
// linking a repo makes sure git knows who commits
git('config', 'user.name', 'Ann Lee');
git('config', 'user.email', 'ann@example.com');
fs.writeFileSync(path.join(repo, 'design.md'), 'Buttons are always mint.\n');

const bin = path.join(work, 'bin');
fs.mkdirSync(bin);
// a stand-in for Claude Code: for a build it writes App.tsx where it's run (and, when asked, a file outside), then
// reports it the way stream-json does; Myra's ordinary questions just get a short reply
fs.writeFileSync(
  path.join(bin, 'claude'),
  `#!/bin/sh
case "$*" in
  *stream-json*)
    printf '%s' "$2" > ${work}/prompt.txt
    echo 'export function App() { return <h1>Built by Myra</h1>; }' > src/App.tsx
    case "$2" in *OUTSIDE*) echo stray > ../../stray.txt ;; esac
    echo '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Write","input":{"file_path":"'"$PWD"'/src/App.tsx"}}]}}'
    echo '{"type":"result","is_error":false,"result":"I built the heading from your Checkout note."}' ;;
  *) echo '{"type":"result","is_error":false,"result":"{\\"say\\": \\"ok\\"}"}' ;;
esac
`,
  { mode: 0o755 },
);
// first on PATH, and there before Fenmyr starts, since Fenmyr remembers where it found Claude Code
const l = await launch({ env: { PATH: `${bin}:${process.env.PATH ?? ''}` } });
const { page } = l;
const lastMyra = () =>
  page.evaluate(() => [...document.querySelectorAll('#mcList .mc-msg.myra')].map(m => m.textContent ?? '').join(' | '));
const until = async (check: () => Promise<boolean>, what: string) => {
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    if (await check()) return;
    await page.waitForTimeout(200);
  }
  assert.fail(`${what}: ${await lastMyra()}`);
};
const build = (request: string) =>
  page.evaluate(r => window.__fenmyr.applyMyra({ say: 'Writing it now.', build: { request: r } }, 'build it'), request);

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
  fs.writeFileSync(path.join(repo, 'staged.txt'), 'mine');
  git('add', 'staged.txt');
  const starter = fs.readFileSync(app, 'utf8');

  await build('Make the Checkout heading.');
  await until(
    async () => /I built the heading from your Checkout note/.test(await lastMyra()),
    'her explanation arrives',
  );
  assert.match(fs.readFileSync(app, 'utf8'), /Built by Myra/, 'the code is written in the prototype’s folder');
  const prompt = fs.readFileSync(path.join(work, 'prompt.txt'), 'utf8');
  assert.match(prompt, /Make the Checkout heading\./, 'the builder gets the request');
  assert.match(prompt, /Checkout: show the total first/, 'and the cards');
  assert.match(prompt, /Buttons are always mint\./, 'and design.md');
  const frame = page.frameLocator('#pr-preview iframe');
  await until(
    async () =>
      (await frame
        .locator('h1')
        .textContent()
        .catch(() => '')) === 'Built by Myra',
    'the preview shows it',
  );
  assert.match(
    await page.evaluate(() => document.querySelector('.pc-text')?.textContent ?? ''),
    /Built by Myra|<!doctype/i,
  );

  await page.locator('#mcList .m-acts button', { hasText: 'Undo' }).last().click();
  await until(async () => fs.readFileSync(app, 'utf8') === starter, 'Undo puts the folder back');
  assert.strictEqual(
    git('diff', '--cached', '--name-only').trim(),
    'staged.txt',
    'what was staged stays staged, and only that',
  );

  await build('Make the Checkout heading. Then more.');
  await until(async () => (await lastMyra()).split('I built the heading').length === 3, 'a second build');
  const tapMyra = (label: string) => page.locator('#mcList .m-acts button', { hasText: label }).last().click();
  await tapMyra('Commit…');
  await until(
    async () =>
      /Commit 1 changed file in acme\/prototypes\/checkout to main\? Message: “Make the Checkout heading”/.test(
        await lastMyra(),
      ),
    'Myra asks before committing, in git’s terms',
  );
  assert.match(await lastMyra(), /It stays on this computer until you push/, 'and in plain words');
  await tapMyra('Commit');
  await until(async () => /Committed\./.test(await lastMyra()), 'the commit is made');
  assert.strictEqual(git('log', '-1', '--format=%s').trim(), 'Make the Checkout heading');
  assert.deepStrictEqual(
    git('show', '--name-only', '--format=', 'HEAD').trim().split('\n'),
    [`${dir}/src/App.tsx`],
    'only the prototype’s folder',
  );
  assert.strictEqual(
    git('diff', '--cached', '--name-only').trim(),
    'staged.txt',
    'what the person staged stays staged',
  );

  const bare = path.join(work, 'github.git');
  execFileSync('git', ['init', '-q', '--bare', bare]);
  git('remote', 'add', 'origin', bare);
  await page.click('#prGit [data-git="push"]');
  await until(async () => /Push main of acme to /.test(await lastMyra()), 'Myra asks before pushing');
  await page.locator('#mcList .m-acts button.danger', { hasText: 'Push main to' }).last().click();
  await until(async () => /Pushed\./.test(await lastMyra()), 'the push is made');
  assert.strictEqual(
    execFileSync('git', ['-C', bare, 'log', '-1', '--format=%s', 'main']).toString().trim(),
    'Make the Checkout heading',
    'GitHub’s stand-in has the commit',
  );

  await build('OUTSIDE this time.');
  await until(
    async () => /I also changed files outside this prototype: stray\.txt/.test(await lastMyra()),
    'a change outside the folder is reported',
  );
  assert.deepStrictEqual(l.errors, []);
  console.log('BUILD OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
}
