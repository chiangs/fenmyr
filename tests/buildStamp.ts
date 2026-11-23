// The build stamp says which commit a build was made from, and whether tracked files differed from it. In Node: a
// temporary repo for a clean, a modified and an untracked-only checkout, and the fallbacks when git can't answer. Then
// the stamp the build wrote to dist/build.json, which is for the commit this checkout is on.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stamp } from '../tools/buildStamp.ts';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-stamp-'));
const repo = path.join(tmp, 'repo');
const bare = path.join(tmp, 'not-a-repo');
fs.mkdirSync(repo);
fs.mkdirSync(bare);
const git = (...args: string[]) =>
  execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' }).trim();
git('init', '-q', '-b', 'main');
fs.writeFileSync(path.join(repo, 'a.txt'), 'one\n');
git('add', '-A');
git('commit', '-qm', 'first');
const head = git('rev-parse', 'HEAD');

// the build's own environment has no GITHUB_SHA unless CI set it
const { GITHUB_SHA: _ci, ...env } = process.env;
const at = new Date('2026-11-21T10:30:00.987Z');

const clean = stamp(repo, env, at);
assert.deepStrictEqual(clean, { commit: head, changes: false, builtAt: '2026-11-21T10:30:00Z' }, 'a clean checkout');

fs.writeFileSync(path.join(repo, 'scratch.txt'), 'local notes\n');
assert.strictEqual(stamp(repo, env).changes, false, 'an untracked file alone is not a change');

fs.writeFileSync(path.join(repo, 'a.txt'), 'two\n');
assert.deepStrictEqual(
  [stamp(repo, env).commit, stamp(repo, env).changes],
  [head, true],
  'a modified tracked file is a change, on the same commit',
);

git('checkout', '--', 'a.txt');
fs.writeFileSync(path.join(repo, 'a.txt'), 'one\n');
assert.strictEqual(stamp(repo, env).changes, false, 'putting the file back clears it');

const sha = 'f'.repeat(40);
const noGit = { ...env, PATH: '' };
assert.deepStrictEqual(
  stamp(repo, { ...noGit, GITHUB_SHA: sha }, at),
  { commit: sha, changes: false, builtAt: '2026-11-21T10:30:00Z' },
  'with no git, the commit CI gave it',
);
assert.strictEqual(stamp(repo, noGit).commit, null, 'with no git and no GITHUB_SHA, no commit');
assert.strictEqual(stamp(bare, { ...env, GITHUB_SHA: sha }).commit, sha, 'a folder that is not a repo falls back too');
assert.strictEqual(stamp(bare, env).commit, null, 'a folder that is not a repo has no commit without GITHUB_SHA');
fs.rmSync(tmp, { recursive: true, force: true });
console.log('BUILD STAMP (Node) OK');

const built = path.join(import.meta.dirname, '../dist/build.json');
assert.ok(fs.existsSync(built), 'dist/build.json is missing: run npm run build first');
const written: unknown = JSON.parse(fs.readFileSync(built, 'utf8'));
const root = path.join(import.meta.dirname, '..');
const here = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
assert.ok(typeof written === 'object' && written !== null, 'the stamp is a JSON object');
assert.strictEqual(Reflect.get(written, 'commit'), here, "the build's stamp is for the commit being tested");
assert.strictEqual(typeof Reflect.get(written, 'changes'), 'boolean', 'the stamp says whether files changed');
assert.ok(!Number.isNaN(Date.parse(String(Reflect.get(written, 'builtAt')))), 'the stamp says when it was built');
console.log('BUILD STAMP (dist) OK');
