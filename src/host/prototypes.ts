// A prototype's own folder of code, under prototypes/ in its project's repo.
import fs from 'node:fs';
import path from 'node:path';
import type { Proto } from '../shared/model.ts';
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

// Makes prototypes/<slug> in the repo, numbered when the name is taken, and the shared root files the repo lacks.
export async function create(root: string, name: string, stack: Proto['stack']): Promise<Proto> {
  const s = await status(root);
  if (s.kind !== 'repo' || s.root !== path.resolve(root)) throw new Error("This project's repo isn't there any more.");
  const base = slugOf(name);
  let slug = base;
  for (let n = 2; fs.existsSync(path.join(s.root, 'prototypes', slug)); n++) slug = `${base}-${n}`;
  const dir = `prototypes/${slug}`;
  write(
    s.root,
    ROOT_FILES(
      path
        .basename(s.root)
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-'),
    ),
    false,
  );
  // the name lands in HTML and JSX text, where these characters mean something
  write(path.join(s.root, dir), STARTERS[stack](name.replace(/[<>&{}]/g, '')), true);
  return { dir, stack };
}
