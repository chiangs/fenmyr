// A prototype's own folder of code, under prototypes/ in its project's repo.
import fs from 'node:fs';
import path from 'node:path';
import { PROTO_DIR, type Proto } from '../shared/model.ts';
import { status } from './git.ts';
import { ROOT_FILES, STARTERS } from './protoStarter.ts';

const slugOf = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '') || 'prototype';

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
  const dir = freeDir(repo, slugOf(name));
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
