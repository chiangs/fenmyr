import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// GitHub for the updater's tests: a bare origin and a clone of it, which an install is "made from". Releases are tagged
// in the origin itself, so the clone only sees them once it fetches, as it does from GitHub.
export function makeRepo() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-update-'));
  const origin = path.join(tmp, 'origin.git');
  const repo = path.join(tmp, 'repo');
  const author = ['-c', 'user.name=t', '-c', 'user.email=t@t'];
  const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...author, ...args], { encoding: 'utf8' }).trim();
  const commit = (line: string) => {
    fs.writeFileSync(path.join(repo, 'WHATSNEW.md'), line);
    git('add', '-A');
    git('commit', '-qm', 'change');
    return git('rev-parse', 'HEAD');
  };
  const tag = (name: string, sha: string) => execFileSync('git', ['--git-dir', origin, 'tag', name, sha]);
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
  execFileSync('git', ['clone', '-q', origin, repo], { stdio: 'ignore' });
  git('checkout', '-q', '-b', 'main');
  const first = commit('- first\n');
  git('push', '-q', '-u', 'origin', 'main');
  const second = commit('- first\n- the new thing\n');
  git('push', '-q');
  return {
    tmp,
    origin,
    repo,
    git,
    commit,
    tag,
    first,
    second,
    remove: () => fs.rmSync(tmp, { recursive: true, force: true }),
  };
}
