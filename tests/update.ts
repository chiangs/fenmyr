// The updater compares what is installed with GitHub, so pulling in the install folder can't hide an update.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { everyOfflineCard } from './fixtures/boards.ts';
import { launch, ROOT } from './support/launch.ts';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-update-'));
const origin = path.join(tmp, 'origin.git');
const repo = path.join(tmp, 'repo');
const app = path.join(tmp, 'app');
const git = (...args: string[]) =>
  execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' }).trim();
const commit = (line: string) => {
  fs.writeFileSync(path.join(repo, 'WHATSNEW.md'), line);
  git('add', '-A');
  git('commit', '-qm', 'change');
  return git('rev-parse', 'HEAD');
};

execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
execFileSync('git', ['clone', '-q', origin, repo], { stdio: 'ignore' });
git('checkout', '-q', '-b', 'main');
const installed = commit('- first\n');
git('push', '-q', '-u', 'origin', 'main');
commit('- first\n- the new thing\n');
git('push', '-q');

fs.mkdirSync(app);
for (const item of ['dist', 'web', 'assets', 'package.json'])
  fs.cpSync(path.join(ROOT, item), path.join(app, item), { recursive: true });

async function check(install: Record<string, string>) {
  fs.writeFileSync(path.join(app, 'install.json'), JSON.stringify(install));
  const l = await launch({ dir: app, boards: [everyOfflineCard()], open: 'every' });
  const info = await l.page.evaluate(() => window.Fenmyr?.updateCheck?.());
  await l.close();
  return info;
}

const pulled = await check({ repo, commit: installed });
assert.strictEqual(pulled?.behind, 1, 'the folder was pulled, but the installed copy is one commit behind');
assert.deepStrictEqual(pulled?.notes, ['the new thing'], 'notes cover what the installed copy lacks');

const current = await check({ repo, commit: git('rev-parse', 'HEAD') });
assert.strictEqual(current?.behind, 0, 'an installed copy at the newest commit is up to date');

const older = await check({ repo });
assert.strictEqual(older?.behind, 0, 'an install from before the commit was recorded falls back to the folder');

const unknown = await check({ repo, commit: 'f'.repeat(40) });
assert.strictEqual(unknown?.behind, 0, 'a commit the folder no longer has falls back to the folder');

fs.rmSync(tmp, { recursive: true, force: true });
console.log('UPDATE OK');
