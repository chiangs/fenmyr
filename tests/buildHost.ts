// The host's side of a build, with no window: a fake code agent edits a prototype in a temp repo, and the events carry
// the snapshot as it starts, every changed file with the lines it gained and lost as it ends, the snapshot and files
// when it fails, and the builder's next steps. One build runs in a repo at a time. The renderer's parse keeps what the
// host sends and drops what is malformed.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { CodeAgent } from '../src/host/codeAgent.ts';
import { type BuildEvent, type FileDiff, readBuildEvent } from '../src/shared/build.ts';

const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-build-host-')));
// the host keeps its own files under XDG_DATA_HOME, read when its modules load
process.env.XDG_DATA_HOME = work;
const { startBuild } = await import('../src/host/build.ts');

const repo = path.join(work, 'acme'),
  dir = 'prototypes/checkout',
  src = path.join(repo, dir, 'src');
const git = (...args: string[]) =>
  execFileSync('git', ['-C', repo, '-c', 'user.name=T', '-c', 'user.email=t@e.st', ...args]).toString();
fs.mkdirSync(src, { recursive: true });
git('init', '-q', '-b', 'main');
fs.writeFileSync(path.join(src, 'App.tsx'), 'a\nb\nc\n');
fs.writeFileSync(path.join(src, 'old.ts'), 'x\ny\n');
git('add', '-A');
git('commit', '-qm', 'Start');

// one build run to its end, with every event it sent
function build(agent: CodeAgent, root = repo) {
  const events: BuildEvent[] = [],
    all = Promise.withResolvers<BuildEvent[]>();
  const send = (e: BuildEvent) => {
    events.push(e);
    if (e.type === 'done' || e.type === 'error') all.resolve(events);
  };
  startBuild({ root, dir, stack: 'react', request: 'Add a total' }, send, agent);
  return all.promise;
}
const byPath = (files: FileDiff[]) => files.toSorted((a, b) => a.path.localeCompare(b.path));

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);
const edits: CodeAgent = async ({ cwd }, edited) => {
  fs.writeFileSync(path.join(cwd, 'src/App.tsx'), 'a\nB\nc\nd\ne\n');
  edited('src/App.tsx');
  fs.writeFileSync(path.join(cwd, 'src/Total.tsx'), '1\n2\n3\n4\n');
  edited('src/Total.tsx');
  fs.rmSync(path.join(cwd, 'src/old.ts'));
  fs.writeFileSync(path.join(cwd, 'logo.png'), PNG);
  edited('logo.png');
  return 'I added the total from your Checkout note.\nCARDS: src/App.tsx=n1\nNEXT: Add a total | Show a receipt';
};
const first = await build(edits);
const [start] = first,
  done = first.at(-1);
assert.deepStrictEqual(
  first.map(e => e.type),
  ['start', 'edit', 'edit', 'edit', 'done'],
  'a build starts, reports each edit, then ends',
);
assert(start?.type === 'start' && done?.type === 'done');
assert(
  git('for-each-ref', '--format=%(objectname)', 'refs/fenmyr/snapshots/').split('\n').includes(start.snapshot),
  'the start carries the snapshot kept under refs/fenmyr/snapshots/',
);
assert.equal(git('cat-file', '-t', start.snapshot).trim(), 'commit');
assert.equal(done.snapshot, start.snapshot, 'the end repeats the snapshot');
assert.deepStrictEqual(
  byPath(done.files),
  byPath([
    // b became B, and d and e were added
    { kind: 'text', path: 'src/App.tsx', added: 3, removed: 1 },
    { kind: 'text', path: 'src/Total.tsx', added: 4, removed: 0 },
    { kind: 'text', path: 'src/old.ts', added: 0, removed: 2 },
    { kind: 'binary', path: 'logo.png' },
  ]),
  'every file the build changed, with the lines counted by hand from the edit',
);
assert.deepStrictEqual(done.next, ['Add a total', 'Show a receipt'], 'the builder’s next steps');
assert.equal(done.text, 'I added the total from your Checkout note.', 'neither closing line stays in her words');
assert.deepStrictEqual(done.sources, { 'src/App.tsx': ['n1'] });
assert.deepStrictEqual(
  readBuildEvent(JSON.parse(JSON.stringify(done))),
  done,
  'the renderer’s parse keeps everything the host sends',
);

const fails: CodeAgent = async ({ cwd }, edited) => {
  fs.appendFileSync(path.join(cwd, 'src/App.tsx'), 'f\n');
  edited('src/App.tsx');
  throw new Error('Claude Code stopped before it finished.');
};
const second = await build(fails);
const [restart] = second,
  failed = second.at(-1);
assert.deepStrictEqual(
  second.map(e => e.type),
  ['start', 'edit', 'error'],
);
assert(restart?.type === 'start' && failed?.type === 'error');
assert.equal(failed.text, 'Claude Code stopped before it finished.');
assert.equal(failed.snapshot, restart.snapshot, 'a failure carries its snapshot, so what it wrote can be undone');
assert.deepStrictEqual(
  failed.files,
  [{ kind: 'text', path: 'src/App.tsx', added: 1, removed: 0 }],
  'and the file it wrote before it stopped',
);

const loose = path.join(work, 'loose');
fs.mkdirSync(loose);
const [noRepo, ...more] = await build(edits, loose);
assert(noRepo?.type === 'error' && !more.length, 'a build that can’t save the folder fails with no start');
assert.deepStrictEqual([noRepo.snapshot, noRepo.files], [null, []], 'with no snapshot and no files');

const gate = Promise.withResolvers<void>(),
  then = Promise.withResolvers<BuildEvent[]>();
const waits: CodeAgent = async () => {
  await gate.promise;
  return 'Waited.';
};
// the next build starts from the first one's last event, the earliest a waiting request could
const askNext = (e: BuildEvent) => {
  if (e.type !== 'done') return;
  try {
    build(async () => 'Again.').then(then.resolve, then.reject);
  } catch (err) {
    then.reject(err);
  }
};
startBuild({ root: repo, dir, stack: 'react', request: 'Wait' }, askNext, waits);
assert.throws(
  () => startBuild({ root: repo, dir, stack: 'react', request: 'Again' }, () => {}, waits),
  /A build is already running in this repo\./,
  'a second build in the same repo is refused before it gets an id',
);
gate.resolve();
assert.equal((await then.promise).at(-1)?.type, 'done', 'a build asked for as the first one ends runs');

const snap = 'a'.repeat(40);
assert.equal(readBuildEvent({ id: 'b1', type: 'start', snapshot: 'HEAD~1' }), null, 'a start needs a snapshot');
assert.equal(readBuildEvent({ id: 'b1', type: 'stop' }), null, 'an unknown type is malformed');
assert.equal(readBuildEvent({ type: 'edit', file: 'src/App.tsx' }), null, 'an event needs its build’s id');
assert.deepStrictEqual(
  readBuildEvent({
    id: 'b1',
    type: 'done',
    text: 'Built.',
    snapshot: snap,
    files: [
      { kind: 'text', path: 'src/App.tsx', added: 2, removed: 0 },
      { kind: 'text', path: 'src/B.tsx', added: -1, removed: 0 },
      { kind: 'text', path: 'src/C.tsx', added: 1.5, removed: 0 },
      { kind: 'text', path: '../outside.txt', added: 1, removed: 0 },
      { kind: 'binary', path: 'logo.png', added: 9 },
      'src/D.tsx',
    ],
    outside: ['README.md', 3],
    sources: { 'src/App.tsx': ['n1'], '/etc/passwd': ['n2'] },
    next: ['One', ' ', 'x'.repeat(81), 'Two', 'Three', 'Four'],
  }),
  {
    id: 'b1',
    type: 'done',
    text: 'Built.',
    snapshot: snap,
    files: [
      { kind: 'text', path: 'src/App.tsx', added: 2, removed: 0 },
      { kind: 'binary', path: 'logo.png' },
    ],
    outside: ['README.md'],
    sources: { 'src/App.tsx': ['n1'] },
    next: ['One', 'Two', 'Three'],
  },
  'a bad entry drops alone, and at most three next steps of 80 characters stay',
);
const many = Array.from({ length: 250 }, (_, i) => ({ kind: 'binary', path: `img/${i}.png` }));
const capped = readBuildEvent({ id: 'b1', type: 'error', text: 'Stopped.', snapshot: 'nope', files: many });
assert(capped?.type === 'error', 'a failure lands even with a bad snapshot');
assert.deepStrictEqual([capped.snapshot, capped.files.length], [null, 200], 'and keeps at most 200 files');

fs.rmSync(work, { recursive: true, force: true });
console.log('BUILD HOST OK');
