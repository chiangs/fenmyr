// install.sh --to moves a clone to one release: it checks the name before it runs any git command, checks the tag out
// detached in place of pulling, and records that commit. --update from a tag goes back to main and pulls. The real
// script runs against a bare repo standing in for GitHub, with Electron and npm replaced by programs that do nothing.
import assert from 'node:assert';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { isRecord } from '../src/shared/model.ts';
import { ROOT } from './support/launch.ts';
import { makeRepo } from './support/updateRepo.ts';

const r = makeRepo();
const home = path.join(r.tmp, 'home');
const bin = path.join(r.tmp, 'bin');
const gitLog = path.join(r.tmp, 'git.log');
fs.mkdirSync(home);
fs.mkdirSync(bin);
const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
const program = (name: string, body: string) =>
  fs.writeFileSync(path.join(bin, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
program('git', `echo "$*" >> "${gitLog}"\nexec "${realGit}" "$@"`);
program('electron', 'exit 0');
program('npm', 'exit 0');

// what a clone of Fenmyr holds: the files the installer copies, with the release's name in one of them
const put = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(r.repo, file)), { recursive: true });
  fs.writeFileSync(path.join(r.repo, file), text);
};
const release = (name: string) => {
  put('web/release.txt', name);
  r.git('add', '-A');
  r.git('commit', '-qm', name);
  r.git('push', '-q');
  return r.git('rev-parse', 'HEAD');
};
fs.copyFileSync(path.join(ROOT, 'install.sh'), path.join(r.repo, 'install.sh'));
fs.chmodSync(path.join(r.repo, 'install.sh'), 0o755);
put('package.json', JSON.stringify({ version: '1.0.0', devDependencies: { electron: '1.0.0' } }));
for (const file of [
  'LICENSE',
  'NOTICE',
  'THIRD-PARTY-NOTICES.md',
  'dist/main.cjs',
  'assets/icon.png',
  'packaging/fenmyr.desktop',
])
  put(file, 'x\n');
const one = release('v1.0.0');
const two = release('v1.1.0');
const ahead = release('after v1.1.0');
r.tag('v1.0.0', one);
r.tag('v1.1.0', two);

const install = (...args: string[]) =>
  spawnSync('bash', [path.join(r.repo, 'install.sh'), '--no-open', '--yes', ...args], {
    env: {
      ...process.env,
      HOME: home,
      PATH: `${bin}:${process.env.PATH}`,
      XDG_DATA_HOME: path.join(home, '.local/share'),
    },
    encoding: 'utf8',
  });
const installed = () => {
  const text = fs.readFileSync(path.join(home, '.local/lib/fenmyr/app/install.json'), 'utf8');
  const json: unknown = JSON.parse(text);
  return isRecord(json) ? json.commit : undefined;
};
const copy = () => fs.readFileSync(path.join(home, '.local/lib/fenmyr/app/web/release.txt'), 'utf8');
const branch = () => {
  try {
    return r.git('symbolic-ref', '--short', '-q', 'HEAD');
  } catch {
    return null;
  }
};
const gitCommands = () =>
  fs.existsSync(gitLog) ? fs.readFileSync(gitLog, 'utf8').trim().split('\n').filter(Boolean) : [];

// a clone on main, a release behind the newest commit
assert.strictEqual(branch(), 'main', 'the clone starts on main');
assert.strictEqual(r.git('rev-parse', 'HEAD'), ahead, 'with the newest commit');
const to = install('--update', '--to', 'v1.1.0');
assert.strictEqual(to.status, 0, `--to v1.1.0 installs: ${to.stderr}`);
assert.strictEqual(r.git('rev-parse', 'HEAD'), two, 'it lands on exactly the tagged commit');
assert.strictEqual(branch(), null, 'detached, not on a branch');
assert.strictEqual(installed(), two, 'and install.json records that commit');
assert.strictEqual(copy(), 'v1.1.0', 'with that release in what was installed');
const commands = gitCommands();
assert.ok(commands.includes('fetch --tags origin'), 'it fetches the tags first');
assert.ok(commands.includes('checkout --quiet --detach refs/tags/v1.1.0'), 'and checks the tag out');
assert.ok(!commands.some(c => c.startsWith('pull')), 'in place of pulling');

// Every change from a release: back onto main, then the pull
const back = install('--update');
assert.strictEqual(back.status, 0, `--update from a release installs: ${back.stderr}`);
assert.strictEqual(branch(), 'main', 'it goes back to main');
assert.strictEqual(r.git('rev-parse', 'HEAD'), ahead, 'and pulls the newest commit');
assert.strictEqual(installed(), ahead, 'which is the commit recorded');
assert.strictEqual(copy(), 'after v1.1.0', 'and installed');

// a name that isn't a release stops before any git command, and nothing changes
const before = gitCommands().length;
for (const bad of [
  'v1.1',
  'main',
  'v1.1.0beta',
  '1.1.0',
  'v1.1.0; touch pwned',
  'v1.1.0$(touch pwned)',
  '--update',
  '',
]) {
  const run = install('--to', bad);
  assert.notStrictEqual(run.status, 0, `--to "${bad}" is refused`);
  assert.match(run.stdout, /isn't a release, so nothing was changed/, `--to "${bad}" says so`);
}
const noName = install('--to');
assert.notStrictEqual(noName.status, 0, '--to with no name is refused');
assert.match(noName.stdout, /--to needs a release/, 'and says what it needs');
assert.strictEqual(gitCommands().length, before, 'none of them ran a git command');
assert.ok(!fs.existsSync(path.join(r.repo, 'pwned')), 'and nothing in a name ran as a command');
assert.strictEqual(installed(), ahead, 'the install is as it was');

// a release that doesn't exist stops at the checkout, with nothing replaced
const missing = install('--update', '--to', 'v9.9.9');
assert.notStrictEqual(missing.status, 0, 'a release GitHub doesn’t have stops the install');
assert.strictEqual(branch(), 'main', 'the clone stays on main');
assert.strictEqual(installed(), ahead, 'and the install is as it was');

r.remove();
console.log('UPDATE INSTALL OK');
