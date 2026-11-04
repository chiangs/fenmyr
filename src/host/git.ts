// Git for linked projects: what a folder is to git, making it a repo, and who commits. Every call names its folder
// with -C, so a repo inside another repo is never mistaken for its parent.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { GitChange, GitIdentity, GitSetup, GitStatus } from '../shared/ops.ts';
import { run } from './util.ts';

// A repo's own settings can make status run a program (core.fsmonitor). Linking a folder must never run its code.
// --no-optional-locks: reading status never takes git's index lock, so a git the person runs at the same time doesn't
// fail with "index.lock exists".
const SAFE = ['--no-optional-locks', '-c', 'core.fsmonitor=false'];

async function git(dir: string, args: string[]) {
  const r = await run('git', [...SAFE, '-C', dir, ...args], 30);
  return { code: r.code, out: r.out.toString('utf8'), err: r.err.toString('utf8').trim().split('\n')[0] ?? '' };
}

function folder(dir: string) {
  if (!path.isAbsolute(dir)) throw new Error('Choose the folder by its full path.');
  return path.resolve(dir);
}

const CHANGE: Record<string, GitChange['change']> = { A: 'added', D: 'deleted' };

// `git status --porcelain=v2 --branch -z`: header lines start with #, and a rename's old path is its own record
function readStatus(out: string) {
  const s: { branch: string | null; head: string | null; upstream: string | null; ahead: number; behind: number } = {
    branch: null,
    head: null,
    upstream: null,
    ahead: 0,
    behind: 0,
  };
  const changed: GitChange[] = [];
  const records = out.split('\0');
  for (let i = 0; i < records.length; i++) {
    const rec = records[i] ?? '',
      f = rec.split(' ');
    if (rec.startsWith('# branch.head ')) s.branch = f[2] === '(detached)' ? null : (f[2] ?? null);
    else if (rec.startsWith('# branch.oid ')) s.head = f[2] && f[2] !== '(initial)' ? f[2] : null;
    else if (rec.startsWith('# branch.upstream ')) s.upstream = f[2] ?? null;
    else if (rec.startsWith('# branch.ab ')) {
      s.ahead = Math.abs(Number(f[2]) || 0);
      s.behind = Math.abs(Number(f[3]) || 0);
    } else if (rec.startsWith('? ')) changed.push({ path: rec.slice(2), change: 'untracked' });
    else if (rec.startsWith('u ')) changed.push({ path: f.slice(10).join(' '), change: 'conflict' });
    else if (rec.startsWith('1 ') || rec.startsWith('2 ')) {
      const xy = f[1] ?? '',
        renamed = rec.startsWith('2 ');
      const key = [...xy].find(c => c in CHANGE);
      changed.push({
        path: f.slice(renamed ? 9 : 8).join(' '),
        change: renamed ? 'renamed' : (CHANGE[key ?? ''] ?? 'modified'),
      });
      if (renamed) i++;
    }
  }
  return { ...s, changed };
}

// a remote's address can hold a password or token; the page only needs where it points
const readRemotes = (out: string) =>
  out
    .split('\n')
    .map(l => l.match(/^(\S+)\t(\S+) \(fetch\)$/))
    .filter(m => m !== null)
    .map(m => ({ name: m[1] ?? '', url: (m[2] ?? '').replace(/^([a-z+]+:\/\/)[^@/]+@/i, '$1') }));

export async function status(asked: string): Promise<GitStatus> {
  const dir = folder(asked);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return { kind: 'missing' };
  const top = await git(dir, ['rev-parse', '--show-toplevel']);
  if (top.code === -1) return { kind: 'noGit' };
  if (top.code !== 0) {
    if (/not a git repository/i.test(top.err)) return { kind: 'folder' };
    throw new Error(top.err || "Git couldn't read this folder.");
  }
  const root = top.out.trim();
  const [st, remotes, name, email] = await Promise.all([
    // every untracked file, not just its folder: a new prototype is prototypes/<slug>/..., never only prototypes/
    git(root, ['status', '--porcelain=v2', '--branch', '--untracked-files=all', '-z']),
    git(root, ['remote', '-v']),
    git(root, ['config', 'user.name']),
    git(root, ['config', 'user.email']),
  ]);
  if (st.code !== 0) throw new Error(st.err || "Git couldn't read this repo.");
  return {
    kind: 'repo',
    root,
    ...readStatus(st.out),
    remotes: readRemotes(remotes.out),
    identity: { name: name.out.trim(), email: email.out.trim() },
  };
}

function whyNotInit(s: GitStatus, dir: string): string | null {
  switch (s.kind) {
    case 'folder':
      return null;
    case 'missing':
      return "That folder isn't there any more.";
    case 'noGit':
      return "Git isn't installed on this computer yet.";
    case 'repo':
      return s.root === dir ? 'This folder is already a git repo.' : `This folder is inside the git repo at ${s.root}.`;
    default: {
      const unhandled: never = s;
      return unhandled;
    }
  }
}

export async function init(asked: string): Promise<GitStatus> {
  const dir = folder(asked);
  const why = whyNotInit(await status(dir), dir);
  if (why) throw new Error(why);
  const r = await git(dir, ['init', '--initial-branch=main']);
  if (r.code !== 0) throw new Error(r.err || "Git couldn't make this folder a repo.");
  return status(dir);
}

function checkIdentity(name: string, email: string) {
  const n = name.trim(),
    e = email.trim();
  if (!n || /[\r\n]/.test(n)) throw new Error('Type the name to put on your saves.');
  if (!/^[^\s@]+@[^\s@]+$/.test(e)) throw new Error('Type an email address, like you@example.com.');
  return [
    ['user.name', n],
    ['user.email', e],
  ] as const;
}

export async function setIdentity(asked: string, name: string, email: string, everywhere: boolean) {
  const dir = folder(asked),
    pairs = checkIdentity(name, email);
  const s = await status(dir);
  if (s.kind !== 'repo') throw new Error('Make this folder a git repo first.');
  const scope = everywhere ? ['--global'] : [];
  for (const [key, value] of pairs) {
    const r = await git(s.root, ['config', ...scope, key, value]);
    if (r.code !== 0) throw new Error(r.err || "Git couldn't save your name and email.");
  }
  return status(dir);
}

// What setup needs to know, from the settings that apply to every repo on this computer.
export async function setup(): Promise<GitSetup> {
  const home = os.homedir();
  const [version, name, email, helper] = await Promise.all([
    git(home, ['--version']),
    git(home, ['config', '--global', 'user.name']),
    git(home, ['config', '--global', 'user.email']),
    git(home, ['config', '--global', '--get-all', 'credential.https://github.com.helper']),
  ]);
  return {
    git: version.code === 0,
    identity: { name: name.out.trim(), email: email.out.trim() },
    ghForGit: /\bgh(\.exe)? auth git-credential/.test(helper.out),
  };
}

export async function setGlobalIdentity(name: string, email: string): Promise<GitIdentity> {
  for (const [key, value] of checkIdentity(name, email)) {
    const r = await git(os.homedir(), ['config', '--global', key, value]);
    if (r.code !== 0) throw new Error(r.err || "Git couldn't save your name and email.");
  }
  return (await setup()).identity;
}

// git ends a failure with a summary ("failed to push some refs"); the line that says why comes first
const firstLine = (err: string) => {
  const lines = err
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
  return (lines.find(l => /^(error|fatal):/.test(l)) ?? lines[0] ?? '').replace(/^(error|fatal):\s*/, '');
};

const plain = (err: string) =>
  /author identity unknown|tell me who you are/i.test(err)
    ? 'Git doesn’t know who is committing. Add your name and email in Settings → Helpers → Git and GitHub.'
    : /conflict/i.test(err)
      ? 'Git found changes that clash with these. Pull first, then sort out the files it lists.'
      : /rejected|non-fast-forward|fetch first/i.test(err)
        ? 'GitHub has commits this computer doesn’t have yet. Pull first, then push again.'
        : /authentication|could not read username|permission denied|403/i.test(err)
          ? 'GitHub didn’t accept the sign-in. Sign in again in Settings → Helpers.'
          : /src refspec .* does not match/i.test(err)
            ? 'There’s nothing to push yet. Commit this prototype first, then push.'
            : firstLine(err) || 'Git couldn’t do that.';

// The files every prototype shares (package.json, myra.md…) sit beside the prototypes' folders. A prototype's code
// needs them, so they go into its commits too.
const sharedFiles = (root: string) => {
  try {
    return fs
      .readdirSync(path.join(root, 'prototypes'), { withFileTypes: true })
      .filter(e => e.isFile())
      .map(e => `prototypes/${e.name}`);
  } catch {
    return [];
  }
};

// Commits the prototype's folder and the shared files only: anything else the person has staged stays staged and out
// of this commit.
export async function commitFolder(root: string, dir: string, message: string) {
  const s = await status(root);
  if (s.kind !== 'repo') throw new Error("This prototype's repo isn't there any more.");
  const m = message.trim();
  if (!m) throw new Error('Write a few words about what changed.');
  const paths = [dir, ...sharedFiles(s.root)];
  const add = await git(s.root, ['add', '-A', '--', ...paths]);
  if (add.code !== 0) throw new Error(plain(add.err));
  const r = await git(s.root, ['commit', '-q', '-m', m, '--only', '--', ...paths]);
  if (r.code !== 0)
    throw new Error(
      /nothing to commit|no changes added/i.test(r.err + r.out) ? 'There’s nothing new to commit.' : plain(r.err),
    );
  return status(s.root);
}

// Pushes the branch to origin. With a GitHub account named, gh's sign-in for it does the authenticating.
export async function push(root: string, credential: { gh: string; env: Record<string, string> } | null) {
  const s = await status(root);
  if (s.kind !== 'repo' || !s.branch) throw new Error('There’s no branch to push.');
  if (!s.head) throw new Error('There’s nothing to push yet. Commit this prototype first, then push.');
  if (!s.remotes.some(x => x.name === 'origin'))
    throw new Error('This repo has no GitHub copy yet. Put it on GitHub first.');
  const helper = credential
    ? ['-c', 'credential.helper=', '-c', `credential.helper=!${credential.gh} auth git-credential`]
    : [];
  const r = await run('git', [...SAFE, ...helper, '-C', s.root, 'push', '-u', 'origin', s.branch], 120, {
    ...credential?.env,
    GIT_TERMINAL_PROMPT: '0',
  });
  if (r.code !== 0) throw new Error(plain(r.err.toString('utf8').trim()));
  return status(s.root);
}

type Credential = { gh: string; env: Record<string, string> } | null;
const remote = async (root: string, credential: Credential, args: string[], timeout = 120) => {
  const helper = credential
    ? ['-c', 'credential.helper=', '-c', `credential.helper=!${credential.gh} auth git-credential`]
    : [];
  const r = await run('git', [...SAFE, ...helper, '-C', root, ...args], timeout, {
    ...credential?.env,
    GIT_TERMINAL_PROMPT: '0',
  });
  return { code: r.code, out: r.out.toString('utf8'), err: r.err.toString('utf8').trim() };
};

// What GitHub has that this computer doesn't. It only reads, so it runs without asking.
export async function fetchOrigin(root: string, credential: Credential) {
  const s = await status(root);
  if (s.kind !== 'repo' || !s.remotes.some(x => x.name === 'origin')) return s;
  await remote(s.root, credential, ['fetch', '--quiet', 'origin'], 60);
  return status(s.root);
}

// A fast-forward when GitHub only moved ahead; a rebase when both sides did. A conflict stops at once and leaves the
// files as they were, naming the ones that clashed.
export async function pull(
  root: string,
  credential: Credential,
): Promise<{ kind: 'pulled' } | { kind: 'conflict'; files: string[] }> {
  const s = await status(root);
  if (s.kind !== 'repo' || !s.upstream) throw new Error('This branch has no GitHub copy to pull from.');
  const ff = await remote(s.root, credential, ['pull', '--ff-only', '--quiet']);
  if (ff.code === 0) return { kind: 'pulled' };
  if (/would be overwritten|uncommitted|unstaged/i.test(ff.err))
    throw new Error('Commit your changes first, then pull.');
  const rebase = await remote(s.root, credential, [
    '-c',
    'user.name=Fenmyr',
    '-c',
    'user.email=fenmyr@localhost',
    'pull',
    '--rebase',
    '--quiet',
  ]);
  if (rebase.code === 0) return { kind: 'pulled' };
  const clashed = await git(s.root, ['diff', '--name-only', '--diff-filter=U']);
  await git(s.root, ['rebase', '--abort']);
  const files = clashed.out.split('\n').filter(Boolean);
  if (!files.length) throw new Error(plain(rebase.err));
  return { kind: 'conflict', files };
}

// After a conflict: this computer's version goes to a new branch on GitHub, so nothing is lost.
export async function keepMine(root: string, branch: string, credential: Credential) {
  if (!/^prototype\/[a-z0-9-]+$/.test(branch)) throw new Error("That isn't a branch name Fenmyr makes.");
  const s = await status(root);
  if (s.kind !== 'repo') throw new Error("This repo isn't there any more.");
  const sw = await git(s.root, ['switch', '-c', branch]);
  if (sw.code !== 0) throw new Error(plain(sw.err));
  const r = await remote(s.root, credential, ['push', '-u', 'origin', branch]);
  if (r.code !== 0) throw new Error(plain(r.err));
  return status(s.root);
}

// After a conflict: GitHub's version. This computer's commit is kept on a hidden ref first, so it can be found again.
export async function takeTheirs(root: string) {
  const s = await status(root);
  if (s.kind !== 'repo' || !s.upstream) throw new Error('This branch has no GitHub copy.');
  const kept = await git(s.root, ['update-ref', `refs/fenmyr/before-pull/${Date.now()}`, 'HEAD']);
  if (kept.code !== 0) throw new Error(plain(kept.err));
  const r = await git(s.root, ['reset', '--hard', '@{u}']);
  if (r.code !== 0) throw new Error(plain(r.err));
  return status(s.root);
}
