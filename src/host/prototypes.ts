// A prototype's own folder of code, under prototypes/ in its project's repo.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PROTO_DIR, type Proto, protoSlug } from '../shared/repos.ts';
import { status } from './git.ts';
import { ROOT_FILES, STARTERS } from './protoStarter.ts';
import { run } from './util.ts';

function write(root: string, files: Record<string, string>, overwrite: boolean) {
  for (const [rel, body] of Object.entries(files)) {
    const f = path.join(root, rel);
    if (!overwrite && fs.existsSync(f)) continue;
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, body);
  }
}

async function repoRoot(root: string) {
  const s = await status(root);
  if (s.kind !== 'repo' || s.root !== path.resolve(root)) throw new Error("This project's repo isn't there any more.");
  return s.root;
}

// prototypes/<slug>, numbered when the name is taken
function freeDir(root: string, base: string) {
  let slug = base;
  for (let n = 2; fs.existsSync(path.join(root, 'prototypes', slug)); n++) slug = `${base}-${n}`;
  return `prototypes/${slug}`;
}

// Makes the prototype's folder and the shared root files the repo lacks.
export async function create(root: string, name: string, stack: Proto['stack']): Promise<Proto> {
  const repo = await repoRoot(root);
  const dir = freeDir(repo, protoSlug(name));
  write(
    repo,
    ROOT_FILES(
      path
        .basename(repo)
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-'),
    ),
    false,
  );
  // the name lands in HTML and JSX text, where these characters mean something
  write(path.join(repo, dir), STARTERS[stack](name.replace(/[<>&{}]/g, '')), true);
  return { dir, stack };
}

// A copied prototype board's code, put in another project's repo under a free name. Nothing is committed: the
// person decides that in the repo it lands in.
export async function copy(fromRoot: string, dir: string, toRoot: string) {
  if (!PROTO_DIR.test(dir)) throw new Error("That isn't a prototype's folder.");
  const [from, to] = await Promise.all([repoRoot(fromRoot), repoRoot(toRoot)]);
  const src = path.join(from, dir);
  if (!fs.existsSync(src)) throw new Error(`The code for this prototype isn't in ${dir} any more.`);
  const made = freeDir(to, path.basename(dir));
  let files = 0;
  fs.cpSync(src, path.join(to, made), {
    recursive: true,
    filter: f => {
      if (['node_modules', '.git'].includes(path.basename(f))) return false;
      if (fs.statSync(f).isFile()) files++;
      return true;
    },
  });
  return { dir: made, files };
}

const inRepo = async (root: string, dir: string) => {
  if (!PROTO_DIR.test(dir)) throw new Error("That isn't a prototype's folder.");
  return repoRoot(root);
};

export async function exists(root: string, dir: string) {
  return fs.existsSync(path.join(await inRepo(root, dir), dir));
}

// Its folder renamed to match the board's new name. git mv keeps the history with it; a folder git doesn't track yet
// is simply renamed.
export async function rename(root: string, dir: string, name: string) {
  const repo = await inRepo(root, dir),
    to = freeDir(repo, protoSlug(name));
  const r = await run('git', ['-C', repo, 'mv', dir, to], 30);
  if (r.code !== 0) fs.renameSync(path.join(repo, dir), path.join(repo, to));
  return { dir: to };
}

// A missing folder back as it was at the last commit, or fresh starter files when it was never committed.
export async function restore(root: string, dir: string, name: string, stack: Proto['stack']) {
  const repo = await inRepo(root, dir);
  const r = await run('git', ['-C', repo, 'checkout', 'HEAD', '--', dir], 30);
  if (r.code === 0) return 'restored' as const;
  write(path.join(repo, dir), STARTERS[stack](name.replace(/[<>&{}]/g, '')), true);
  return 'fresh' as const;
}

const SKIP = new Set(['node_modules', '.git', 'dist']);

// The prototype's files for the code pane, by path inside its folder.
export async function files(root: string, dir: string) {
  const base = path.join(await inRepo(root, dir), dir),
    out: string[] = [];
  const walk = (rel: string) => {
    for (const e of fs.readdirSync(path.join(base, rel), { withFileTypes: true })) {
      if (SKIP.has(e.name) || out.length >= 500) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(r);
      else if (e.isFile()) out.push(r);
    }
  };
  if (fs.existsSync(base)) walk('');
  return out.sort();
}

// One file's text, only from inside the prototype's folder.
export async function read(root: string, dir: string, file: string) {
  const base = path.join(await inRepo(root, dir), dir),
    f = path.resolve(base, file);
  if (!f.startsWith(`${base}/`)) throw new Error("That file isn't part of this prototype.");
  const buf = fs.readFileSync(f);
  if (buf.length > 300_000) return `This file is ${Math.round(buf.length / 1000)} KB, too big to show here.`;
  return buf.includes(0) ? 'This file isn’t text, so it isn’t shown here.' : buf.toString('utf8');
}

// A built preview as a file the browser can open, in a folder of its own under the system's temporary folder.
export function previewFile(html: string, name: string) {
  const dir = path.join(os.tmpdir(), 'fenmyr-preview');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `${protoSlug(name)}.html`);
  fs.writeFileSync(f, html);
  return f;
}

// Before every change Myra makes, the prototype's folder is saved on a hidden git ref, so the change can be undone.
// It goes through an index of its own, so nothing the person has staged is touched.
export async function snapshot(root: string, dir: string) {
  const repo = await inRepo(root, dir),
    index = path.join(os.tmpdir(), `fenmyr-index-${process.pid}-${Date.now()}`),
    own = { GIT_INDEX_FILE: index };
  const git = async (args: string[]) => {
    const r = await run(
      'git',
      ['-C', repo, '-c', 'user.name=Fenmyr', '-c', 'user.email=fenmyr@localhost', ...args],
      30,
      own,
    );
    if (r.code !== 0) throw new Error(r.err.toString('utf8').trim() || 'Git couldn’t save a snapshot.');
    return r.out.toString('utf8').trim();
  };
  try {
    await git(['add', '-A', '--', dir]);
    const tree = await git(['write-tree']);
    const head = await run('git', ['-C', repo, 'rev-parse', '--verify', '-q', 'HEAD'], 30);
    const parent = head.code === 0 ? ['-p', head.out.toString('utf8').trim()] : [];
    const commit = await git(['commit-tree', tree, ...parent, '-m', `Before Myra's change to ${dir}`]);
    await git(['update-ref', `refs/fenmyr/snapshots/${path.basename(dir)}/${Date.now()}`, commit]);
    return commit;
  } finally {
    fs.rmSync(index, { force: true });
  }
}

// The folder exactly as a snapshot had it: files added since are removed, and the index is left alone.
export async function undo(root: string, dir: string, commit: string) {
  if (!/^[0-9a-f]{40,64}$/.test(commit)) throw new Error("That isn't a snapshot.");
  const repo = await inRepo(root, dir);
  const listed = await run('git', ['-C', repo, 'ls-tree', '-r', '--name-only', commit, '--', dir], 30);
  const kept = new Set(listed.out.toString('utf8').split('\n').filter(Boolean));
  for (const f of await files(root, dir))
    if (!kept.has(`${dir}/${f}`)) fs.rmSync(path.join(repo, dir, f), { force: true });
  if (kept.size) {
    const r = await run('git', ['-C', repo, 'restore', `--source=${commit}`, '--worktree', '--', dir], 30);
    if (r.code !== 0) throw new Error(r.err.toString('utf8').trim() || 'Git couldn’t put the snapshot back.');
  }
  return true as const;
}
