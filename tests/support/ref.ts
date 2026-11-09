import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from './launch.ts';

/** Builds the app in `dir`, since a checkout's last bundle can be older than its code. */
export function build(dir: string) {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  if (pkg.scripts?.build) execFileSync('npm', ['run', 'build', '--silent'], { cwd: dir, stdio: 'inherit' });
}

/** Checks out `ref` in a temporary folder and builds it and this checkout, the two sides of a comparison. */
export function checkout(ref: string): { dir: string; remove: () => void } {
  build(ROOT);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-ref-'));
  execFileSync('git', ['worktree', 'add', '--detach', dir, ref], { cwd: ROOT, stdio: 'ignore' });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'));
  build(dir);
  const remove = () => execFileSync('git', ['worktree', 'remove', '--force', dir], { cwd: ROOT, stdio: 'ignore' });
  return { dir, remove };
}
