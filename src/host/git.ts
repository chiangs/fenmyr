// Git for linked projects: what a folder is to git, making it a repo, and who commits. Every call names its folder
// with -C, so a repo inside another repo is never mistaken for its parent.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { GitChange, GitIdentity, GitSetup, GitStatus } from '../shared/ops.ts';
import { run } from './util.ts';

// A repo's own settings can make status run a program (core.fsmonitor). Linking a folder must never run its code.
const SAFE = ['-c', 'core.fsmonitor=false'];

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
  const s: { branch: string | null; upstream: string | null; ahead: number; behind: number } = {
    branch: null,
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
    git(root, ['status', '--porcelain=v2', '--branch', '-z']),
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
