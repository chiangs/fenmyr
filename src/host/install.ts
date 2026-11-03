// Which package manager this computer uses, so setup can show the one install command that works here.
import fs from 'node:fs';
import type { PackageManager } from '../shared/ops.ts';

// ID and ID_LIKE in /etc/os-release name the distribution and the ones it follows (CachyOS is like Arch)
const FAMILIES: [RegExp, PackageManager][] = [
  [/\b(arch|manjaro)\b/, 'pacman'],
  [/\b(debian|ubuntu)\b/, 'apt'],
  [/\b(fedora|rhel|centos)\b/, 'dnf'],
  [/\b(suse|opensuse)\b/, 'zypper'],
];

export function packageManager(): PackageManager | null {
  if (process.platform === 'darwin') return 'brew';
  let release = '';
  try {
    release = fs.readFileSync('/etc/os-release', 'utf8');
  } catch {
    return null;
  }
  const names = [...release.matchAll(/^(?:ID|ID_LIKE)="?([^"\n]*)"?$/gm)].map(m => m[1] ?? '').join(' ');
  return FAMILIES.find(([re]) => re.test(names))?.[1] ?? null;
}
