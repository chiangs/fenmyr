// A prototype's own folder of code, under prototypes/ in its project's repo.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PROTO_DIR, type Proto, protoSlug } from '../shared/repos.ts';
import { status } from './git.ts';
import { SHARED_FILES, STARTERS } from './protoStarter.ts';
import { pathDirs, run, which } from './util.ts';

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

// Makes the prototype's folder, and the files every prototype shares in prototypes/ where the repo lacks them.
export async function create(root: string, name: string, stack: Proto['stack']): Promise<Proto> {
  const repo = await repoRoot(root);
  const dir = freeDir(repo, protoSlug(name));
  write(
    path.join(repo, 'prototypes'),
    SHARED_FILES(
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

// A file of an installed package, for the preview's bundler: only from prototypes/node_modules, and null when it
// isn't there, since the bundler tries several names.
export async function moduleFile(root: string, file: string) {
  const base = path.join(await repoRoot(root), 'prototypes', 'node_modules'),
    f = path.resolve(base, file);
  if (!f.startsWith(`${base}/`)) throw new Error("That isn't part of an installed package.");
  try {
    return fs.statSync(f).isFile() && fs.statSync(f).size < 4_000_000 ? fs.readFileSync(f, 'utf8') : null;
  } catch {
    return null;
  }
}

// the packages prototypes/package.json lists, for the builder to know what it may import
export function installed(repo: string) {
  try {
    const j: unknown = JSON.parse(fs.readFileSync(path.join(repo, 'prototypes', 'package.json'), 'utf8'));
    const deps = typeof j === 'object' && j !== null && 'dependencies' in j ? j.dependencies : null;
    return typeof deps === 'object' && deps !== null ? Object.keys(deps) : [];
  } catch {
    return [];
  }
}

const PACKAGE = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

// npm install into prototypes/, with no install scripts run, after the person said yes to these names.
export async function install(root: string, packages: string[]) {
  const repo = await repoRoot(root);
  const bad = packages.find(p => !PACKAGE.test(p));
  if (!packages.length || bad) throw new Error(`“${bad ?? ''}” isn't a package name npm accepts.`);
  const npm = which('npm', pathDirs());
  if (!npm) throw new Error('npm isn’t installed on this computer. Install Node.js from nodejs.org, then try again.');
  const prefix = path.join(repo, 'prototypes');
  const r = await run(
    npm,
    ['install', '--prefix', prefix, '--ignore-scripts', '--no-audit', '--no-fund', '--save', ...packages],
    300,
  );
  if (r.code !== 0) throw new Error(r.err.toString('utf8').trim().split('\n').pop() || 'npm couldn’t install that.');
  return packages;
}

// The values Keep these values saves: only the prototype's src/tweaks.json, and only as JSON.
export async function writeTweaks(root: string, dir: string, json: string) {
  const repo = await inRepo(root, dir);
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    throw new Error("Those controls aren't valid.");
  fs.writeFileSync(path.join(repo, dir, 'src', 'tweaks.json'), `${JSON.stringify(parsed, null, 2)}\n`);
  return true as const;
}
