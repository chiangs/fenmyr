// Keeping a prototype in step with GitHub: a fetch when its board opens shows what's new, Pull brings it in, Myra asks
// to pull before building, and a clash leaves files as they were with two ways out.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch } from './support/launch.ts';

const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-sync-')));
const repo = path.join(work, 'acme'),
  github = path.join(work, 'github.git'),
  other = path.join(work, 'teammate'),
  bin = path.join(work, 'bin');
fs.mkdirSync(bin);
const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
const git = (dir: string, ...args: string[]) =>
  execFileSync('git', ['-C', dir, '-c', 'user.name=T', '-c', 'user.email=t@e.st', ...args], { env }).toString();
fs.writeFileSync(
  path.join(bin, 'claude'),
  `#!/bin/sh
case "$*" in
  *stream-json*)
    echo '{"type":"result","is_error":false,"result":"I made the change."}' ;;
  *) echo '{"type":"result","is_error":false,"result":"{\\"say\\": \\"ok\\"}"}' ;;
esac
`,
  { mode: 0o755 },
);

const l = await launch({ env: { PATH: `${bin}:${process.env.PATH ?? ''}` } });
const { page } = l;
const myra = () =>
  page.evaluate(() => [...document.querySelectorAll('#mcList .mc-msg.myra')].map(m => m.textContent ?? '').join(' | '));
const bar = () => page.evaluate(() => document.getElementById('prGit')?.textContent ?? '');
const tap = (label: string) => page.locator('#mcList .m-acts button', { hasText: label }).last().click();
const until = async (check: () => Promise<boolean>, what: string) => {
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    if (await check()) return;
    await page.waitForTimeout(200);
  }
  assert.fail(`${what}: ${await bar()} || ${await myra()}`);
};
const teammatePushes = (file: string, text: string, message: string) => {
  git(other, 'pull', '-q');
  fs.mkdirSync(path.dirname(path.join(other, file)), { recursive: true });
  fs.writeFileSync(path.join(other, file), text);
  git(other, 'add', '-A');
  git(other, 'commit', '-qm', message);
  git(other, 'push', '-q');
};
const reopen = () =>
  page.evaluate(async () => {
    await window.__fenmyr.openBoard('other');
    await window.__fenmyr.openBoard('pb');
  });

try {
  fs.mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main');
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
    await window.Fenmyr.save({ id: 'other', name: 'Notes', cards: [], links: [], tray: [] });
    await window.__fenmyr.refreshBoards();
    return proto.dir;
  }, repo);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-qm', 'start');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', github]);
  git(repo, 'remote', 'add', 'origin', github);
  git(repo, 'push', '-q', '-u', 'origin', 'main');
  execFileSync('git', ['clone', '-q', github, other], { env });

  teammatePushes('NOTES.md', 'from the teammate\n', 'Add notes at the root');
  await page.evaluate(() => window.__fenmyr.openBoard('pb'));
  await until(async () => /Pull 1 from GitHub/.test(await bar()), 'opening the board fetches and shows what’s new');
  await page.click('#prGit [data-git="pull"]');
  await until(async () => /Pulled\./.test(await myra()), 'Pull brings it in');
  assert.ok(fs.existsSync(path.join(repo, 'NOTES.md')), 'a change at the repo root arrives too');

  teammatePushes('README.md', 'hello\n', 'Add a readme');
  await page.evaluate(() =>
    window.__fenmyr.applyMyra({ say: 'Writing it.', build: { request: 'Make the heading.' } }, 'go'),
  );
  await until(
    async () => /GitHub has 1 commit this computer doesn't have\. Pull them before I start\?/.test(await myra()),
    'Myra asks to pull before building',
  );
  await tap('Pull first');
  await until(async () => /I made the change\./.test(await myra()), 'then builds on the latest');
  assert.ok(fs.existsSync(path.join(repo, 'README.md')));

  const app = path.join(dir, 'src/App.tsx');
  teammatePushes(app, 'export const App = () => <p>theirs</p>;\n', 'Their heading');
  fs.writeFileSync(path.join(repo, app), 'export const App = () => <p>mine</p>;\n');
  git(repo, 'commit', '-qam', 'My heading');
  await reopen();
  await until(async () => /Pull 1 from GitHub/.test(await bar()), 'their commit shows');
  await page.click('#prGit [data-git="pull"]');
  await until(async () => /src\/App\.tsx changed both here and on GitHub/.test(await myra()), 'a clash is explained');
  assert.match(fs.readFileSync(path.join(repo, app), 'utf8'), /mine/, 'and the files are left as they were');
  assert.ok(!fs.existsSync(path.join(repo, '.git', 'rebase-merge')), 'with nothing half-merged');
  await tap('Keep mine on a new branch');
  await until(async () => /Your version is on prototype\/checkout-/.test(await myra()), 'mine goes to a new branch');
  assert.match(
    execFileSync('git', ['-C', github, 'branch'], { env }).toString(),
    /prototype\/checkout-/,
    'on GitHub too',
  );

  git(repo, 'switch', '-q', 'main');
  await reopen();
  await until(async () => /Pull 1 from GitHub/.test(await bar()), 'main is still behind');
  await page.click('#prGit [data-git="pull"]');
  await until(async () => (await myra()).split('changed both here and on GitHub').length === 3, 'the clash again');
  await tap('Take GitHub’s version');
  await until(async () => /theirs/.test(fs.readFileSync(path.join(repo, app), 'utf8')), 'theirs is taken');
  assert.match(
    git(repo, 'for-each-ref', 'refs/fenmyr/before-pull'),
    /refs\/fenmyr\/before-pull\//,
    'mine is kept on a hidden ref',
  );
  await page.evaluate(() => window.__fenmyr.openHome('folder:pf'));
  const tileSays = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.tile.board')]
        .map(t => t.querySelector('.tile-meta small')?.textContent ?? '')
        .join(' | '),
    );
  await until(
    async () => /main · “Their heading”/.test(await tileSays()),
    'the folder home shows each prototype’s branch and last change',
  );
  await page.evaluate(async () => {
    // away from the board first, so its own save can't put the old name back
    await window.__fenmyr.openBoard('other');
    const b = await window.Fenmyr.load('pb');
    if (b) await window.Fenmyr.save({ ...b, name: 'Checkout v2' });
    await window.__fenmyr.refreshBoards();
    await window.__fenmyr.openHome('folder:pf');
  });
  await until(
    async () => /“Their heading” .* · prototypes\/checkout$/.test(await tileSays()),
    'a board renamed without its folder says where its code is',
  );
  await reopen();
  fs.writeFileSync(path.join(repo, app), 'export const App = () => <h1>Edited outside</h1>;\n');
  await page.click('[data-pv="refresh"]');
  await until(
    async () => /Edited outside/.test(await page.evaluate(() => document.querySelector('.pc-text')?.textContent ?? '')),
    'Refresh reads the files again for the code pane too',
  );
  assert.deepStrictEqual(l.errors, []);
  console.log('SYNC OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
}
