// The git and gh bridge, against real git in a throwaway folder and a stand-in gh.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch } from './support/launch.ts';

const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-git-')));
const repo = path.join(work, 'acme'),
  sub = path.join(repo, 'prototypes'),
  plain = path.join(work, 'plain'),
  bin = path.join(work, 'bin');
for (const d of [repo, plain, bin]) fs.mkdirSync(d);
const ghJSON = {
  hosts: {
    'github.com': [
      { state: 'success', active: true, host: 'github.com', login: 'work-me' },
      { state: 'error', active: false, host: 'github.com', login: 'home-me' },
    ],
  },
};
fs.writeFileSync(
  path.join(bin, 'gh'),
  `#!/bin/sh\n[ "$*" = "auth status --json hosts" ] && echo '${JSON.stringify(ghJSON)}'\n`,
  { mode: 0o755 },
);
// git as the test runs it, apart from anyone's own settings
const sh = (dir: string, ...args: string[]) =>
  execFileSync('git', ['-C', dir, '-c', 'user.name=T', '-c', 'user.email=t@e.st', ...args], {
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
  });

const l = await launch({ env: { PATH: `${bin}:${process.env.PATH ?? ''}` } });
const call = (op: string, ...args: unknown[]) =>
  l.page.evaluate(
    async ([op, args]) => {
      const api: Record<string, unknown> = { ...window.Fenmyr };
      const fn = api[String(op)];
      if (typeof fn !== 'function') throw new Error(`no ${op}`);
      try {
        return { ok: true, value: await fn(...(Array.isArray(args) ? args : [])) };
      } catch (e) {
        return { ok: false, value: e instanceof Error ? e.message : String(e) };
      }
    },
    [op, args] as const,
  );
const value = async (op: string, ...args: unknown[]) => {
  const r = await call(op, ...args);
  assert.ok(r.ok, `${op} failed: ${r.value}`);
  return r.value;
};
const refusal = async (op: string, ...args: unknown[]) => {
  const r = await call(op, ...args);
  assert.ok(!r.ok, `${op} should have refused`);
  return String(r.value);
};

try {
  assert.match(await refusal('gitStatus', 'acme'), /full path/, 'a relative path is refused');
  assert.deepStrictEqual(await value('gitStatus', path.join(work, 'gone')), { kind: 'missing' });
  assert.deepStrictEqual(await value('gitStatus', plain), { kind: 'folder' });

  const fresh = await value('gitInit', repo);
  assert.deepStrictEqual(fresh, {
    kind: 'repo',
    root: repo,
    branch: 'main',
    head: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    changed: [],
    remotes: [],
    identity: { name: '', email: '' },
  });
  assert.match(await refusal('gitInit', repo), /already a git repo/);

  fs.mkdirSync(sub);
  fs.writeFileSync(path.join(sub, 'a.txt'), 'a');
  const inside = await value('gitStatus', sub);
  assert.ok(
    inside && typeof inside === 'object' && 'root' in inside && inside.root === repo,
    'a subfolder finds its repo',
  );
  assert.match(await refusal('gitInit', sub), /inside the git repo at/, 'no repo inside a repo');

  assert.match(await refusal('gitSetIdentity', { path: repo, name: 'Me', email: 'nope', everywhere: false }), /email/);
  const named = await value('gitSetIdentity', {
    path: repo,
    name: 'Ann Lee',
    email: 'ann@example.com',
    everywhere: false,
  });
  assert.deepStrictEqual(Reflect.get(Object(named), 'identity'), { name: 'Ann Lee', email: 'ann@example.com' });
  assert.ok(!fs.existsSync(path.join(l.data, '.gitconfig')), 'a name for this repo stays in this repo');

  fs.mkdirSync(path.join(sub, 'card', 'src'), { recursive: true });
  fs.writeFileSync(path.join(sub, 'card', 'src', 'App.tsx'), 'x');
  fs.writeFileSync(path.join(sub, 'package.json'), '{}');
  fs.writeFileSync(path.join(repo, 'notes.txt'), 'n');
  const unborn = Object(await value('gitStatus', repo));
  assert.strictEqual(unborn.head, null, 'a repo nobody has committed to says so');
  assert.ok(
    unborn.changed.some((c: { path: string }) => c.path === 'prototypes/card/src/App.tsx'),
    'a new prototype’s files are listed one by one, not as prototypes/',
  );
  sh(repo, 'remote', 'add', 'origin', 'https://example.com/acme.git');
  assert.match(
    await refusal('gitPush', { root: repo, account: '' }),
    /nothing to push yet\. Commit this prototype first/,
    'a push before any commit says what to do',
  );
  sh(repo, 'remote', 'remove', 'origin');
  await value('gitCommit', { root: repo, dir: 'prototypes/card', message: 'Card' });
  assert.deepStrictEqual(
    sh(repo, 'show', '--name-only', '--format=', 'HEAD').toString().trim().split('\n'),
    ['prototypes/a.txt', 'prototypes/card/src/App.tsx', 'prototypes/package.json'],
    'the first commit takes the prototype and the files prototypes share, and nothing else',
  );
  fs.rmSync(path.join(repo, 'notes.txt'));

  fs.writeFileSync(path.join(repo, 'keep.txt'), 'k');
  fs.writeFileSync(path.join(repo, 'gone.txt'), 'g');
  sh(repo, 'add', '-A');
  sh(repo, 'commit', '-qm', 'first');
  const bare = path.join(work, 'bare.git');
  execFileSync('git', ['clone', '-q', '--bare', repo, bare]);
  sh(repo, 'remote', 'add', 'backup', bare);
  sh(repo, 'remote', 'add', 'origin', 'https://ann:s3cret@example.com/acme.git');
  sh(repo, 'fetch', '-q', 'backup');
  sh(repo, 'branch', '-q', '-u', 'backup/main');
  sh(repo, 'mv', 'prototypes/a.txt', 'prototypes/b.txt');
  fs.writeFileSync(path.join(repo, 'new file.txt'), 'n');
  sh(repo, 'commit', '-qm', 'second');
  sh(repo, 'mv', 'prototypes/b.txt', 'prototypes/c.txt');
  fs.writeFileSync(path.join(repo, 'new file.txt'), 'changed');
  fs.writeFileSync(path.join(repo, 'keep.txt'), 'edited');
  fs.rmSync(path.join(repo, 'gone.txt'));
  fs.writeFileSync(path.join(repo, 'staged.txt'), 's');
  sh(repo, 'add', 'staged.txt');

  const marker = path.join(work, 'ran');
  fs.writeFileSync(path.join(work, 'hook.sh'), `#!/bin/sh\ntouch ${marker}\n`, { mode: 0o755 });
  sh(repo, 'config', 'core.fsmonitor', path.join(work, 'hook.sh'));

  const st = Object(await value('gitStatus', repo));
  assert.strictEqual(st.upstream, 'backup/main');
  assert.strictEqual(st.ahead, 1, 'one commit not yet pushed');
  assert.strictEqual(st.behind, 0);
  assert.deepStrictEqual(st.changed, [
    { path: 'gone.txt', change: 'deleted' },
    { path: 'keep.txt', change: 'modified' },
    { path: 'prototypes/c.txt', change: 'renamed' },
    { path: 'staged.txt', change: 'added' },
    { path: 'new file.txt', change: 'untracked' },
  ]);
  assert.deepStrictEqual(st.remotes, [
    { name: 'backup', url: bare },
    { name: 'origin', url: 'https://example.com/acme.git' },
  ]);
  assert.ok(!JSON.stringify(st).includes('s3cret'), 'a password in a remote address never reaches the page');
  assert.ok(!fs.existsSync(marker), 'reading a repo never runs a program its settings name');

  assert.deepStrictEqual(await value('ghStatus'), {
    kind: 'ready',
    accounts: [
      { host: 'github.com', login: 'work-me', active: true, ok: true },
      { host: 'github.com', login: 'home-me', active: false, ok: false },
    ],
  });
  assert.deepStrictEqual(l.errors, []);
  console.log('GIT OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
}
