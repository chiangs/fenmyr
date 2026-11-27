// The host's side of a build, with no window: a fake code agent edits a prototype in a temp repo, and the events carry
// the snapshot as it starts, every changed file with the lines it gained and lost as it ends, the snapshot and files
// when it fails, and the builder's next steps. One build runs in a repo at a time, a stopped one ends as a failure that
// says the person stopped it, and one cut off by Fenmyr quitting sends no end. The renderer's parse keeps what the host sends and drops what is malformed.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import type { CodeAgent } from '../src/host/codeAgent.ts';
import type { Untrusted } from '../src/host/util.ts';
import { type BuildEvent, type FileDiff, readBuildEvent, STOPPED_BY_YOU } from '../src/shared/build.ts';
import type { Ops } from '../src/shared/ops.ts';

const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-build-host-')));
// the host keeps its own files under XDG_DATA_HOME, read when its modules load
process.env.XDG_DATA_HOME = work;
const { startBuild, stopBuild } = await import('../src/host/build.ts');
const { stopCodeAgents } = await import('../src/host/claudeCode.ts');

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

// one build run to its end, with every event it sent; `more` is what the window sends beside the request
function build(agent: CodeAgent, root = repo, more: Untrusted<Ops['protoBuild']['args']> = {}) {
  const events: BuildEvent[] = [],
    all = Promise.withResolvers<BuildEvent[]>();
  const send = (e: BuildEvent) => {
    events.push(e);
    if (e.type === 'done' || e.type === 'error') all.resolve(events);
  };
  if (startBuild({ ...more, root, dir, stack: 'react', request: 'Add a total' }, send, agent).kind === 'busy')
    all.reject(new Error('The repo was busy.'));
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
assert.equal(
  start.use?.window,
  200_000,
  'the start says what the builder was sent, on the window assumed with no model',
);
assert.deepStrictEqual(
  start.use?.parts.find(p => p.kind === 'cards'),
  { kind: 'cards', tokens: 0, count: 0 },
  'with a cards part, even for no cards',
);
assert.deepStrictEqual(readBuildEvent(JSON.parse(JSON.stringify(start))), start, 'and the renderer’s parse keeps it');
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

// the cards and pictures are read where they enter: a damaged entry drops alone, and what the window can't hold is said
const prompts: string[] = [];
const reads: CodeAgent = async job => {
  prompts.push(job.prompt);
  return 'Read.';
};
const big = { id: 'big', text: JSON.stringify({ id: 'big', text: 'x'.repeat(130_000) }) };
const sent = await build(reads, repo, {
  cards: [
    { id: 'n1', text: '{"id":"n1","text":"Total first"}' },
    big,
    { id: 'n2' },
    'n3',
    { id: 4, text: 'x' },
    { id: 'n5', text: '{"id":"n5"}' },
  ],
  pictures: [
    { id: 'n1', name: 'image logo', data: `data:image/png;base64,${PNG.toString('base64')}` },
    { id: 'n5', name: 'sketch', data: 'not a data url' },
    { id: 'n6', name: 'sketch' },
  ],
  unseen: ['s1', 3],
  tooBig: ['t1'],
  over: ['o1'],
});
const [kept] = sent;
assert(kept?.type === 'start' && kept.use, 'a build with cards starts with its use');
assert.deepStrictEqual(kept.use.left, ['big'], 'the card too big for the window is left out, by its id');
assert.deepStrictEqual(
  [kept.use.parts.find(p => p.kind === 'cards')?.count, kept.use.parts.find(p => p.kind === 'pictures')?.count],
  [2, 1],
  'a damaged card or picture drops alone, so two cards and one picture were sent',
);
assert.deepStrictEqual(
  [kept.use.pictures, kept.use.unseen, kept.use.tooBig],
  [['o1'], ['s1'], ['t1']],
  'what the window couldn’t take a picture of is kept, and only as ids',
);
assert(
  prompts[0]?.includes('{"id":"n1","text":"Total first"},\n{"id":"n5"}]\n(1 more card was left out to fit'),
  'the builder gets the cards that fit, and is told how many it was not given',
);
assert.match(prompts[0] ?? '', /PICTURES OF THEM[^\n]*\n\S+1\.png \(image logo\)\n/, 'and the picture');

// the board's own rules and design are read where they enter too: a damaged one is no text and the other still goes
await build(reads, repo, {
  guides: { rules: { text: 7, ignoreRepo: 'yes' }, design: { text: 'Square corners.', ignoreRepo: true } },
});
assert.match(
  prompts.at(-1) ?? '',
  /DESIGN \(prototypes\/design\.md[^\n]*\nnot used for this prototype: its own design below takes its place\n\nTHIS PROTOTYPE'S OWN DESIGN [^\n]*\nSquare corners\.\n\nHOW TO WORK HERE [^\n]*\nnothing yet\n\nTHIS PROTOTYPE'S OWN RULES [^\n]*\nnone$/,
  'the design with Ignore on takes the place of the repo’s, and the damaged rules are none, the repo’s kept',
);
const [guided] = await build(reads, repo, { guides: { rules: { text: 'Never use gradients.', ignoreRepo: false } } });
assert(guided?.type === 'start' && guided.use, 'a build with guides starts with its use');
assert.deepStrictEqual(
  guided.use.parts.filter(p => p.kind.startsWith('board')).map(p => p.kind),
  ['boardRules'],
  'only the rules that held words are a part',
);
assert.match(
  prompts.at(-1) ?? '',
  /DESIGN \(prototypes\/design\.md[^\n]*\nnone yet\n\nTHIS PROTOTYPE'S OWN DESIGN [^\n]*\nnone\n\nHOW TO WORK HERE [^\n]*\nnothing yet\n\nTHIS PROTOTYPE'S OWN RULES [^\n]*\nNever use gradients\.$/,
  'the rules come after the repo’s, with no design of the board’s own',
);
assert.match(prompts[0] ?? '', /THIS PROTOTYPE'S OWN RULES [^\n]*\nnone$/, 'a build sent no guides at all says none');

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
assert.deepStrictEqual(
  startBuild({ root: repo, dir, stack: 'react', request: 'Again' }, () => {}, waits),
  { kind: 'busy' },
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
    build: 'k1',
    board: 'pb',
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
    build: 'k1',
    board: 'pb',
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

// A stop ends the build as a failure that says the person stopped it, with the snapshot and the files written so far,
// whether it came before Claude Code ran, while it ran, or as it finished
const begin = (agent: CodeAgent) => {
  const events: BuildEvent[] = [],
    ended = Promise.withResolvers<BuildEvent[]>();
  const started = startBuild(
    { root: repo, dir, stack: 'react', request: 'Stop it' },
    e => {
      events.push(e);
      if (e.type === 'done' || e.type === 'error') ended.resolve(events);
    },
    agent,
  );
  assert(started.kind === 'started', 'the build started');
  return { id: started.id, events, ended: ended.promise };
};
const untilEdit = async (events: BuildEvent[]) => {
  for (const end = Date.now() + 10000; !events.some(e => e.type === 'edit'); await sleep(20))
    assert(Date.now() < end, 'the build writes its file');
};
let ran = false;
const early = begin(async () => {
  ran = true;
  return 'Built.';
});
assert.equal(stopBuild(early.id), true, 'a build is stopped before Claude Code has run');
const [seenEarly, lateEnd, ...afterEarly] = await early.ended;
assert(!ran, 'and Claude Code never runs');
assert(seenEarly?.type === 'start' && lateEnd?.type === 'error' && !afterEarly.length, 'the build ends in its error');
assert.deepStrictEqual(
  [lateEnd.text, lateEnd.snapshot, lateEnd.files],
  [STOPPED_BY_YOU, seenEarly.snapshot, []],
  'which says the person stopped it, with the snapshot and no files',
);
assert.equal(stopBuild(early.id), false, 'a build that has ended has no stop');
assert.equal(stopBuild('no-such-build'), false, 'nor has one that never ran');

const hangs: CodeAgent = async ({ cwd, signal }, edited) => {
  assert(signal && !signal.aborted, 'Claude Code is given the build’s signal');
  fs.writeFileSync(path.join(cwd, 'src/Half.tsx'), 'half\n');
  edited('src/Half.tsx');
  await new Promise(done => signal.addEventListener('abort', done));
  throw new Error('Claude Code stopped before it finished.');
};
const during = begin(hangs);
await untilEdit(during.events);
assert.equal(stopBuild(during.id), true, 'a build is stopped while Claude Code runs');
const stopped = (await during.ended).at(-1);
assert(stopped?.type === 'error', 'it ends in its error');
assert.equal(stopped.text, STOPPED_BY_YOU, 'with the person’s stop as the reason, not Claude Code’s');
assert.deepStrictEqual(
  stopped.files,
  [{ kind: 'text', path: 'src/Half.tsx', added: 1, removed: 0 }],
  'and the file it wrote before it was stopped',
);
fs.rmSync(path.join(src, 'Half.tsx'));

const finishes: CodeAgent = async ({ cwd, signal }, edited) => {
  fs.writeFileSync(path.join(cwd, 'src/Late.tsx'), 'late\n');
  edited('src/Late.tsx');
  await new Promise(done => signal?.addEventListener('abort', done));
  return 'I built it.';
};
const late = begin(finishes);
await untilEdit(late.events);
stopBuild(late.id);
const lateStopped = (await late.ended).at(-1);
assert(lateStopped?.type === 'error', 'a build that finishes as the stop lands still ends stopped, not done');
assert.equal(lateStopped.text, STOPPED_BY_YOU);
fs.rmSync(path.join(src, 'Late.tsx'));

// Quitting stops Claude Code, and what it had written by then isn't counted. An end would say the build changed
// nothing, so none goes, and its record reads stopped next time, with Undo this build.
const cutOff: BuildEvent[] = [],
  killed = Promise.withResolvers<void>();
const halfway: CodeAgent = async ({ cwd }, edited) => {
  fs.writeFileSync(path.join(cwd, 'src/App.tsx'), 'half\n');
  edited('src/App.tsx');
  await killed.promise;
  throw new Error('Claude Code stopped before it finished.');
};
startBuild({ root: repo, dir, stack: 'react', request: 'Quit' }, e => cutOff.push(e), halfway);
for (const end = Date.now() + 10000; !cutOff.some(e => e.type === 'edit'); await sleep(20))
  assert(Date.now() < end, 'the build that is cut off writes App.tsx');
stopCodeAgents();
killed.resolve();
await sleep(500);
assert.deepStrictEqual(
  cutOff.map(e => e.type),
  ['start', 'edit'],
  'a build cut off by quitting sends no end',
);

fs.rmSync(work, { recursive: true, force: true });
console.log('BUILD HOST OK');
