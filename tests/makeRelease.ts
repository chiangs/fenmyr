// make-release.sh publishes a version with a prerelease part as a GitHub prerelease, so /releases/latest stays on the
// last stable release, tags the commit it built, and stops first when GitHub doesn't have that commit. The build and gh
// are stand-ins that write down what they were asked.
import assert from 'node:assert';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from './support/launch.ts';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-release-'));
const origin = path.join(tmp, 'origin.git');
const repo = path.join(tmp, 'repo');
const bin = path.join(tmp, 'bin');
const ghArgs = path.join(repo, 'gh.args');
const built = path.join(repo, 'built');
const git = (...args: string[]) =>
  execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' }).trim();
const program = (name: string, body: string) =>
  fs.writeFileSync(path.join(bin, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });

execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
execFileSync('git', ['clone', '-q', origin, repo], { stdio: 'ignore' });
fs.mkdirSync(bin);
program('npm', 'exit 0');
program('npx', 'mkdir -p build/release && touch build/release/Fenmyr-x86_64.AppImage built');
program('gh', `printf '%s\\n' "$@" > "${ghArgs}"`);
fs.copyFileSync(path.join(ROOT, 'make-release.sh'), path.join(repo, 'make-release.sh'));
fs.writeFileSync(path.join(repo, 'WHATSNEW.md'), "# What's new\n\n## December 2026 · 1.1.0-beta.1\n\n- A new thing.\n");
const version = (v: string) => fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ version: v }));
version('1.1.0-beta.1');
git('add', '-A');
git('commit', '-qm', 'one');
git('push', '-q', '-u', 'origin', 'HEAD:main');

function release(v: string, ...args: string[]) {
  version(v);
  for (const f of [ghArgs, built]) fs.rmSync(f, { force: true });
  const run = spawnSync('bash', [path.join(repo, 'make-release.sh'), ...args], {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    encoding: 'utf8',
  });
  const asked = fs.existsSync(ghArgs) ? fs.readFileSync(ghArgs, 'utf8').split('\n') : null;
  return { ...run, asked, built: fs.existsSync(built) };
}
const head = git('rev-parse', 'HEAD');

const beta = release('1.1.0-beta.1', '--dry');
assert.strictEqual(beta.status, 0, `--dry works: ${beta.stderr}`);
assert.match(beta.stdout, /gh release create v1\.1\.0-beta\.1 /, '--dry prints the release command');
assert.match(beta.stdout, / --prerelease /, 'with --prerelease for a beta');
assert.ok(beta.stdout.includes(`--target ${head}`), 'and the commit it built');
assert.strictEqual(beta.asked, null, 'and runs nothing on GitHub');
assert.ok(beta.built, 'it still builds the AppImage for a beta');

const stable = release('1.1.0', '--dry');
assert.match(stable.stdout, /gh release create v1\.1\.0 /, 'a stable --dry prints its command');
assert.ok(!stable.stdout.includes('--prerelease'), 'without --prerelease');

const sent = release('1.1.0-beta.1');
assert.strictEqual(sent.status, 0, `a pushed commit is released: ${sent.stderr}`);
assert.ok(
  sent.asked?.includes('--prerelease'),
  'a beta goes to GitHub as a prerelease, so /releases/latest never serves it',
);
assert.deepStrictEqual(sent.asked?.slice(0, 2), ['release', 'create'], 'through gh release create');
assert.strictEqual(sent.asked?.[sent.asked.indexOf('--target') + 1], head, 'tagging the commit that was built');
assert.ok(
  sent.asked?.some(a => a.startsWith('- A new thing.')),
  'with the newest WHATSNEW.md section as its notes',
);
assert.match(sent.stdout, /Published v1\.1\.0-beta\.1 as a prerelease/, 'and says so');

const final = release('1.1.0');
assert.strictEqual(final.status, 0, `a stable version is released: ${final.stderr}`);
assert.ok(!final.asked?.includes('--prerelease'), 'a stable release is not a prerelease');
assert.match(final.stdout, /Published v1\.1\.0\n/, 'and says it is published');

// a commit GitHub doesn't have is refused before anything is built
fs.writeFileSync(path.join(repo, 'local.txt'), 'mine\n');
git('add', '-A');
git('commit', '-qm', 'local');
const unpushed = release('1.1.0-beta.1');
assert.notStrictEqual(unpushed.status, 0, 'a commit that is not on GitHub is refused');
assert.match(unpushed.stdout, /isn't on GitHub yet/, 'in plain words');
assert.ok(!unpushed.built && unpushed.asked === null, 'before building or releasing anything');

// a version the updater could never find is refused too
git('push', '-q');
const odd = release('1.1');
assert.notStrictEqual(odd.status, 0, 'a version that is not a release name is refused');
assert.ok(!odd.built && odd.asked === null, 'before building or releasing anything');

fs.rmSync(tmp, { recursive: true, force: true });
console.log('MAKE RELEASE OK');
