import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isRecord } from '../../src/shared/model.ts';
import { ROOT } from './launch.ts';

// A folder Fenmyr can run from that is `from` in everything but its version, so a run can be a release or a beta. The
// built folders are linked, not copied; a test that puts an install.json in it puts it in this folder alone.
export function appCopy(version: string, from = ROOT) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-app-'));
  for (const item of ['dist', 'web', 'assets']) fs.symlinkSync(path.join(from, item), path.join(dir, item));
  const pkg: unknown = JSON.parse(fs.readFileSync(path.join(from, 'package.json'), 'utf8'));
  if (!isRecord(pkg)) throw new Error('package.json is not an object');
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ ...pkg, version }));
  return { dir, remove: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
