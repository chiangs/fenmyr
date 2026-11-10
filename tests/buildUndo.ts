// Undo after a build, with no window: every file git sees comes back exactly as the snapshot had it, and a file git
// ignores is never touched, whether it was there before the build, like a .env, or the build wrote it.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-build-undo-')));
process.env.XDG_DATA_HOME = work;
const { snapshot, undo } = await import('../src/host/prototypes.ts');

const repo = path.join(work, 'acme'),
  dir = 'prototypes/checkout',
  proto = path.join(repo, dir);
const git = (...args: string[]) =>
  execFileSync('git', ['-C', repo, '-c', 'user.name=T', '-c', 'user.email=t@e.st', ...args]).toString();
const write = (file: string, body: string) => {
  fs.mkdirSync(path.dirname(path.join(proto, file)), { recursive: true });
  fs.writeFileSync(path.join(proto, file), body);
};
const has = (file: string) => fs.existsSync(path.join(proto, file));
const read = (file: string) => (has(file) ? fs.readFileSync(path.join(proto, file), 'utf8') : null);

fs.mkdirSync(repo);
git('init', '-q', '-b', 'main');
fs.writeFileSync(path.join(repo, '.gitignore'), '*.log\n.env\nnode_modules/\ndist/\n');
write('src/App.tsx', 'a\nb\n');
write('src/old.ts', 'x\n');
git('add', '-A');
git('commit', '-qm', 'Start');
write('src/draft.ts', 'not committed yet\n');
write('.env', 'SECRET=1\n');
write('notes.log', 'kept\n');

const snap = await snapshot(repo, dir);
write('src/App.tsx', 'changed\n');
fs.rmSync(path.join(proto, 'src/old.ts'));
write('src/draft.ts', 'rewritten\n');
write('src/New.tsx', 'new\n');
write('.env', 'SECRET=2\n');
write('src/debug.log', 'written by the build\n');
write('dist/out.js', 'built\n');

await undo(repo, dir, snap);
assert.equal(read('src/App.tsx'), 'a\nb\n', 'a tracked file comes back as it was');
assert.equal(read('src/old.ts'), 'x\n', 'a tracked file the build removed comes back');
assert.equal(read('src/draft.ts'), 'not committed yet\n', 'a file not yet committed comes back as it was');
assert(!has('src/New.tsx'), 'a file the build added is removed');
assert.equal(read('notes.log'), 'kept\n', 'an ignored file from before the build is kept');
assert.equal(read('.env'), 'SECRET=2\n', 'an ignored file is left as it is, even one the build changed');
assert(has('src/debug.log') && has('dist/out.js'), 'and ignored files the build wrote stay');

fs.rmSync(work, { recursive: true, force: true });
console.log('BUILD UNDO OK');
