// GitHub's own command-line tool, gh, holds the sign-ins. Fenmyr never sees or stores a token.
import { type ChildProcess, spawn } from 'node:child_process';
import path from 'node:path';
import type { GhAccount, GhState, HostEvents } from '../shared/ops.ts';
import { githubOf, REPO_NAME } from '../shared/repos.ts';
import { env, isRecord, pathDirs, run, text, which } from './util.ts';

// Looked up on every call: it's a few file checks, and installing gh while Fenmyr is open then just works.
const ghPath = () => which('gh', pathDirs());

export async function status(): Promise<GhState> {
  const gh = ghPath();
  if (!gh) return { kind: 'missing' };
  // with --json it lists every account and never prints a token
  const r = await run(gh, ['auth', 'status', '--json', 'hosts'], 30);
  let hosts: unknown;
  try {
    hosts = JSON.parse(r.out.toString('utf8')).hosts;
  } catch {
    throw new Error('This gh is too old for Fenmyr. Update it, then try again.');
  }
  const accounts: GhAccount[] = isRecord(hosts)
    ? Object.values(hosts)
        .flatMap(list => (Array.isArray(list) ? list : []))
        .filter(isRecord)
        .map(a => ({ host: text(a.host), login: text(a.login), active: a.active === true, ok: a.state === 'success' }))
        .filter(a => a.host && a.login)
    : [];
  return { kind: 'ready', accounts };
}

const DEVICE_PAGE = 'https://github.com/login/device';
let login: ChildProcess | null = null;

// With no terminal, gh prints GitHub's one-time code and address, then waits until the person approves in their
// browser. The code goes back to the page at once; `done` hears how the sign-in ended.
export function startLogin(done: (r: HostEvents['ghLogin']) => void): Promise<{ code: string; url: string }> {
  const gh = ghPath();
  if (!gh) return Promise.reject(new Error("gh isn't installed yet."));
  login?.kill();
  const p = spawn(gh, ['auth', 'login', '--web', '--hostname', 'github.com', '--git-protocol', 'https'], {
    env: env(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  login = p;
  let said = '';
  return new Promise((res, rej) => {
    const late = setTimeout(() => {
      p.kill();
      rej(new Error("gh didn't start the sign-in. Try again."));
    }, 20000);
    const hear = (d: Buffer) => {
      said += d.toString('utf8');
      const code = said.match(/one-time code\W*([A-Z0-9]{4}-[A-Z0-9]{4})/i)?.[1];
      // only GitHub's own page is ever opened
      const url = said.match(/https:\/\/github\.com\/\S+/)?.[0] ?? DEVICE_PAGE;
      if (!code) return;
      clearTimeout(late);
      res({ code, url });
    };
    p.stdout.on('data', hear);
    p.stderr.on('data', hear);
    p.on('error', e => {
      clearTimeout(late);
      rej(e);
    });
    p.on('close', status => {
      clearTimeout(late);
      if (login === p) login = null;
      const last = said.trim().split('\n').pop() ?? '';
      rej(new Error(last || "gh didn't start the sign-in."));
      done({ ok: status === 0, message: status === 0 ? '' : last || 'The sign-in stopped before GitHub approved it.' });
    });
  });
}

export function cancelLogin() {
  login?.kill();
  login = null;
  return true as const;
}

// Makes git push to GitHub with gh's sign-in. It changes git's settings for this person, so it only runs when asked.
export async function setupGit() {
  const gh = ghPath();
  if (!gh) throw new Error("gh isn't installed yet.");
  const r = await run(gh, ['auth', 'setup-git', '--hostname', 'github.com'], 30);
  if (r.code !== 0) throw new Error(r.err.toString('utf8').trim() || "gh couldn't set up git.");
  return true as const;
}

const lastLine = (b: Buffer) => b.toString('utf8').trim().split('\n').pop() ?? '';

// gh acts as its active account. For another one, that account's token goes to gh through its environment and never
// leaves this process.
export async function asAccount(account: string) {
  const gh = ghPath();
  if (!gh) throw new Error("gh isn't installed yet.");
  const r = await run(gh, ['auth', 'token', '--hostname', 'github.com', '--user', account], 30);
  const token = r.out.toString('utf8').trim();
  if (r.code !== 0 || !token) throw new Error(`Sign in to GitHub as ${account} again in Settings → Helpers.`);
  return { gh, env: { GH_TOKEN: token } };
}

export async function createRepo(dir: string, account: string, name: string, isPrivate: boolean) {
  if (!path.isAbsolute(dir)) throw new Error('Choose the folder by its full path.');
  if (!REPO_NAME.test(name)) throw new Error('A repo name can use letters, numbers, dots, dashes and underscores.');
  const { gh, env: as } = await asAccount(account);
  const visibility = isPrivate ? '--private' : '--public';
  const r = await run(gh, ['repo', 'create', name, visibility, '--source', dir, '--remote', 'origin'], 60, as);
  if (r.code !== 0) throw new Error(lastLine(r.err) || "GitHub didn't make the repo.");
  const made = githubOf(lastLine(r.out));
  if (!made) throw new Error("GitHub made the repo, but gh didn't say where. Check github.com.");
  return made;
}
