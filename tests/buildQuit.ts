// Quitting Fenmyr during a build stops Claude Code: a stand-in that writes App.tsx, then waits before writing again, is
// gone once the app has closed, and its second write never happens.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { launch } from './support/launch.ts';

const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-build-quit-')));
const repo = path.join(work, 'acme'),
  bin = path.join(work, 'bin'),
  pidFile = path.join(work, 'pid'),
  late = path.join(work, 'late.txt');
const [pidAt, lateAt] = [pidFile, late].map(f => JSON.stringify(f));
fs.mkdirSync(repo);
fs.mkdirSync(bin);
execFileSync('git', ['-C', repo, 'init', '-q', '-b', 'main']);
// One process with no children of its own. What Fenmyr spawns inherits the app's descriptors, and closing the app
// waits until every process holding them has ended: a child left behind by a shell stand-in would hold it open.
fs.writeFileSync(
  path.join(bin, 'claude'),
  `#!/usr/bin/env node
const fs = require('node:fs');
const say = j => console.log(JSON.stringify(j));
if (!process.argv.includes('stream-json')) {
  say({ type: 'result', is_error: false, result: '{"say": "ok"}' });
  process.exit(0);
}
fs.writeFileSync(${pidAt}, String(process.pid));
fs.writeFileSync('src/App.tsx', 'export function App() { return <h1>Half built</h1>; }\\n');
say({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: process.cwd() + '/src/App.tsx' } }] } });
setTimeout(() => {
  fs.writeFileSync(${lateAt}, 'late');
  say({ type: 'result', is_error: false, result: 'I built it.\\nCARDS: none' });
}, 20000);
`,
  { mode: 0o755 },
);
// a process that has ended but not yet been reaped still has a /proc entry, in state Z
const alive = (pid: number) => {
  try {
    return !/\) [ZX] /.test(fs.readFileSync(`/proc/${pid}/stat`, 'utf8'));
  } catch {
    return false;
  }
};

const l = await launch({ env: { PATH: `${bin}:${process.env.PATH ?? ''}` } });
let pid = 0;
try {
  const dir = await l.page.evaluate(async repo => {
    const F = window.Fenmyr;
    const { dir } = await F.protoCreate({ root: repo, name: 'Checkout', stack: 'react' });
    await F.protoBuild({
      root: repo,
      dir,
      stack: 'react',
      request: 'Build it',
      purpose: '',
      device: '',
      cards: '[]',
      errors: '',
      pictures: [],
    });
    return dir;
  }, repo);
  const app = path.join(repo, dir, 'src/App.tsx');
  for (let end = Date.now() + 15000; Date.now() < end && !pid; await sleep(100))
    if (fs.existsSync(pidFile) && fs.readFileSync(app, 'utf8').includes('Half built'))
      pid = Number(fs.readFileSync(pidFile, 'utf8'));
  assert(pid && alive(pid), 'Claude Code is partway through the build when Fenmyr quits');
} finally {
  await l.close();
}
const left = alive(pid);
if (left) process.kill(pid);
assert(!left, 'quitting Fenmyr stopped Claude Code');
assert(!fs.existsSync(late), 'and it wrote nothing after Fenmyr quit');
fs.rmSync(work, { recursive: true, force: true });
console.log('BUILD QUIT OK');
