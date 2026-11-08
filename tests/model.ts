// Library and board files keep what they had, keep the prototype fields when they're sound, and drop them when not.
import assert from 'node:assert';
import { parseBoard, parseLibrary } from '../src/shared/model.ts';
import { githubOf, readRepoLink, repoClash, repoNameFor, splitCardsLine } from '../src/shared/repos.ts';

const json = (x: unknown) => JSON.parse(JSON.stringify(x));

const oldLibrary = {
  projects: [{ id: 'p1', name: 'Acme', open: true }],
  folders: [{ id: 'f1', name: 'Planning', project: 'p1' }],
  order: { f1: ['b1'] },
};
assert.deepStrictEqual(
  json(parseLibrary(oldLibrary)),
  oldLibrary,
  'a library from before prototypes saves back unchanged',
);

const oldBoard = { id: 'b1', name: 'Plan', cards: [], links: [], tray: [], chat: [{ who: 'me', text: 'hi', t: 1 }] };
assert.deepStrictEqual(json(parseBoard(oldBoard)), oldBoard, 'a board from before prototypes saves back unchanged');

const set = { added: ['a'], moved: ['b'], removed: ['c'], relaid: { kb: ['k1', 'kb'] }, links: { added: ['l1'] } };
const everyKind = [
  { kind: 'next', text: 'Make it a list' },
  { kind: 'changes', reply: 'r1', set },
  { kind: 'changes', reply: 'r2', set, lines: ['+ 1 kanban, Phases, with 3 columns', '− 1 card removed'] },
  { kind: 'source', card: 'n1' },
  { kind: 'buildUndo', board: 'pb', snapshot: 'abc123' },
  { kind: 'buildUndo', board: 'pb', snapshot: 'def456', build: 'k3x9q2' },
  { kind: 'commit', board: 'pb', message: 'Make the heading' },
  {
    kind: 'read',
    notes: [{ vault: 'v1', rel: 'Plans/Roadmap.md', title: 'Roadmap' }],
    pages: [{ url: 'https://example.com/a', title: 'Planning in phases' }],
  },
];
const withActs = (acts: unknown) => ({
  id: 'b1',
  name: 'Plan',
  cards: [],
  links: [],
  tray: [],
  chat: [{ who: 'myra', text: 'Done!', t: 2, acts }],
});
assert.deepStrictEqual(
  json(parseBoard(withActs(everyKind))),
  withActs(everyKind),
  'every kind of stored button saves back as it was',
);
const kept = (acts: unknown) => parseBoard(withActs(acts))?.chat?.[0];
assert.deepStrictEqual(
  kept([
    { kind: 'offer', board: 'x' },
    { kind: 'next' },
    { kind: 'source', card: 7 },
    { kind: 'changes', reply: 'r1', set: { ...set, moved: [1] } },
    { kind: 'changes', reply: 'r1', set: { ...set, relaid: { kb: 'k1' } } },
    'next',
    null,
    { kind: 'commit', message: 'No board' },
    { kind: 'commit', board: 'pb', message: 'Keep me' },
  ])?.acts,
  [{ kind: 'commit', board: 'pb', message: 'Keep me' }],
  'an unknown kind and a malformed button are dropped, and the rest kept',
);
assert.deepStrictEqual(
  kept([
    {
      kind: 'changes',
      reply: 'r1',
      set: { ...set, edited: [], relaid: {}, links: { added: [], removed: [] }, skipped: [] },
    },
  ])?.acts,
  [{ kind: 'changes', reply: 'r1', set: { added: ['a'], moved: ['b'], removed: ['c'] } }],
  'a change set keeps only the lists with something in them',
);
assert.deepStrictEqual(
  kept([{ kind: 'changes', reply: 'r1', set, lines: ['+ 1 note', 2] }])?.acts,
  [{ kind: 'changes', reply: 'r1', set }],
  'summary lines that are not all words are dropped, and what the reply changed is kept',
);
assert.deepStrictEqual(
  json(kept([{ kind: 'toString' }, { kind: 'next', text: 3 }])),
  { who: 'myra', text: 'Done!', t: 2 },
  'a message whose buttons are all unreadable stays, with no buttons key',
);
assert.deepStrictEqual(json(kept('next')), { who: 'myra', text: 'Done!', t: 2 }, 'buttons that are not a list too');
assert.deepStrictEqual(
  kept([
    {
      kind: 'read',
      notes: [
        { vault: 'v1', rel: 'a.md', title: 'A' },
        { vault: 'v1', rel: 'b.md' },
      ],
      pages: [
        { url: 'javascript:alert(1)', title: 'Script' },
        { url: 'file:///etc/passwd', title: 'File' },
        { url: 'obsidian://open?vault=x', title: 'App' },
        { url: 'http://example.com/', title: 'Kept' },
      ],
    },
    { kind: 'read', pages: [{ url: 'https://example.com/b', title: 'Only pages' }] },
    { kind: 'read', notes: [], pages: [{ url: 'javascript:void 0', title: 'Nothing left' }] },
  ])?.acts,
  [
    {
      kind: 'read',
      notes: [{ vault: 'v1', rel: 'a.md', title: 'A' }],
      pages: [{ url: 'http://example.com/', title: 'Kept' }],
    },
    { kind: 'read', notes: [], pages: [{ url: 'https://example.com/b', title: 'Only pages' }] },
  ],
  'what she read keeps only sound notes and http or https pages, a missing list reads as empty, and an empty one goes',
);
const earlier = {
  id: 'b1',
  name: 'Plan',
  chats: [{ id: 'c1', title: 'Before', t: 1, msgs: withActs(everyKind).chat }],
};
assert.deepStrictEqual(json(parseBoard(earlier)), earlier, 'an earlier chat keeps its buttons too');

const lib = parseLibrary({
  projects: [
    { id: 'p1', name: 'Acme', repo: { path: '/home/me/code/acme' } },
    { id: 'p2', name: 'Relative', repo: { path: 'code/acme' } },
    { id: 'p3', name: 'Junk', repo: 'yes' },
  ],
  folders: [
    { id: 'f1', name: 'Checkout prototypes', project: 'p1', kind: 'prototyping' },
    { id: 'f2', name: 'Odd', project: 'p1', kind: 'secret' },
  ],
});
assert.deepStrictEqual(lib.projects[0]?.repo, { path: '/home/me/code/acme' }, 'an absolute repo path is kept');
assert.strictEqual(lib.projects[1]?.repo, undefined, 'a relative repo path is dropped');
assert.strictEqual(lib.projects[2]?.repo, undefined, 'a repo that is not an object is dropped');
assert.strictEqual(lib.folders[0]?.kind, 'prototyping', 'a prototyping folder stays one');
assert.ok(!('kind' in (lib.folders[1] ?? {})), 'an unknown folder kind is dropped');
assert.deepStrictEqual(
  parseLibrary([{ id: 'f1', name: 'Old list', kind: 'prototyping' }]).folders[0]?.kind,
  'prototyping',
  'the oldest library format reads folder kinds too',
);

const proto = (p: unknown) => parseBoard({ id: 'b2', name: 'Checkout', kind: 'prototype', proto: p });
assert.deepStrictEqual(proto({ dir: 'prototypes/checkout-flow', stack: 'html' })?.proto, {
  dir: 'prototypes/checkout-flow',
  stack: 'html',
});
assert.strictEqual(proto({ dir: 'prototypes/checkout-flow' })?.proto?.stack, 'react', 'the stack defaults to React');
const named = { dir: 'prototypes/checkout-flow', stack: 'react', build: 'k3x9q2' };
assert.deepStrictEqual(json(proto(named)?.proto), named, 'a prototype keeps the build it last started');
for (const build of [7, '', 'x'.repeat(65)])
  assert.ok(!('build' in json(proto({ ...named, build })?.proto)), `a build of ${JSON.stringify(build)} is dropped`);
for (const dir of ['../escape', 'prototypes/../../etc', 'prototypes/a/b', 'src/app', 'prototypes/Checkout', '', 7]) {
  const b = json(proto({ dir, stack: 'react' }));
  assert.ok(!('kind' in b) && !('proto' in b), `a code folder of ${JSON.stringify(dir)} makes it a plain board`);
}
const strayProto = json(parseBoard({ id: 'b3', name: 'Plain', proto: { dir: 'prototypes/x', stack: 'react' } }));
assert.ok(!('proto' in strayProto), 'a code folder without the prototype kind is dropped');

const acme = { id: 'a', name: 'Acme', repo: { path: '/code/acme' } },
  none = { id: 'c', name: 'None' };
const clash = (self: string, root: string) => repoClash([acme, none], self, root)?.name;
assert.strictEqual(clash('x', '/code/acme'), 'Acme', 'the same repo is taken');
assert.strictEqual(clash('x', '/code/acme/inner'), 'Acme', 'a repo inside a linked one is taken');
assert.strictEqual(clash('x', '/code'), 'Acme', 'a repo around a linked one is taken');
assert.strictEqual(clash('x', '/code/acme2'), undefined, 'a name that only starts the same is free');
assert.strictEqual(clash('a', '/code/acme'), undefined, 'a project never clashes with itself');
const rootRepo = { id: 'r', name: 'Everything', repo: { path: '/' } };
assert.strictEqual(repoClash([rootRepo], 'x', '/code/b')?.name, 'Everything', 'a repo at / holds every other');

for (const url of [
  'https://github.com/ann-lee/acme',
  'https://github.com/ann-lee/acme.git',
  'git@github.com:ann-lee/acme.git',
  'ssh://git@github.com/ann-lee/acme.git',
])
  assert.deepStrictEqual(githubOf(url), { owner: 'ann-lee', name: 'acme' }, url);
for (const url of ['https://gitlab.com/ann/acme', 'https://github.com/ann', 'https://evil.com/github.com/a/b'])
  assert.strictEqual(githubOf(url), null, url);
assert.strictEqual(repoNameFor('Checkout Flow!'), 'checkout-flow');
assert.strictEqual(repoNameFor('✦✦'), 'prototypes', 'a name with nothing usable still gets one');

const github = { owner: 'ann-lee', name: 'acme', account: 'ann-work' };
assert.deepStrictEqual(readRepoLink({ path: '/code/acme', github }), { path: '/code/acme', github });
assert.deepStrictEqual(
  readRepoLink({ path: '/code/acme', github: { ...github, name: '../x y' } }),
  { path: '/code/acme' },
  'a GitHub copy with a bad part is dropped and the folder kept',
);

assert.deepStrictEqual(
  splitCardsLine('I built it.\nCARDS: src/App.tsx=a1, b2; ./src/Field.tsx=c3; ../outside.txt=z9'),
  { text: 'I built it.', sources: { 'src/App.tsx': ['a1', 'b2'], 'src/Field.tsx': ['c3'] } },
  'the builder’s card line comes off its reply, and a path outside the folder is dropped',
);
assert.deepStrictEqual(splitCardsLine('I built it.\nCARDS: none'), { text: 'I built it.', sources: {} });
assert.deepStrictEqual(splitCardsLine('No line at all.'), { text: 'No line at all.', sources: {} });

console.log('MODEL OK');
