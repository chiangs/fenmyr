// A prototype's own folder of code, under prototypes/ in its project's repo.
import fs from 'node:fs';
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
