// Library and board files keep what they had, keep the prototype fields when they're sound, and drop them when not.
import assert from 'node:assert';
import { parseBoard, parseLibrary } from '../src/shared/model.ts';
import { repoClash } from '../src/shared/repos.ts';

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

console.log('MODEL OK');
