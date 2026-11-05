// Every row of the rule for moving boards and folders: move, copy to another project, or refuse with a reason.
import assert from 'node:assert';
import type { Folder, Project } from '../src/shared/model.ts';
import { placeBoard, placeFolder } from '../src/shared/placement.ts';

const acme: Project = { id: 'acme', name: 'Acme', repo: { path: '/code/acme' } },
  lion: Project = { id: 'lion', name: 'Lioness', repo: { path: '/code/lion' } },
  bare: Project = { id: 'bare', name: 'Personal' };
const protoA: Folder = { id: 'pa', name: 'Prototypes', project: 'acme', kind: 'prototyping' },
  protoA2: Folder = { id: 'pa2', name: 'More', project: 'acme', kind: 'prototyping' },
  plainA: Folder = { id: 'fa', name: 'Planning', project: 'acme' },
  protoL: Folder = { id: 'pl', name: 'Prototypes', project: 'lion', kind: 'prototyping' },
  protoB: Folder = { id: 'pb', name: 'Prototypes', project: 'bare', kind: 'prototyping' },
  holder: Folder = { id: 'h', name: 'Holder', project: 'acme' },
  nested: Folder = { id: 'n', name: 'Nested', project: 'acme', parent: 'h', kind: 'prototyping' };
const lib = { projects: [acme, lion, bare], folders: [protoA, protoA2, plainA, protoL, protoB, holder, nested] };
const proto = { kind: 'prototype', folder: 'pa' },
  plain = { folder: 'fa' };

assert.deepStrictEqual(placeBoard(lib, proto, protoA2), { kind: 'move' }, 'a prototype moves within its project');
assert.match(String(Reflect.get(placeBoard(lib, proto, plainA), 'why')), /live in prototyping folders/);
assert.match(
  String(Reflect.get(placeBoard(lib, proto, null), 'why')),
  /live in prototyping folders/,
  'or out of folders',
);
assert.deepStrictEqual(placeBoard(lib, proto, protoL), { kind: 'copy', to: lion }, 'to a linked project it copies');
const toBare = placeBoard(lib, proto, protoB);
assert.ok(
  toBare.kind === 'blocked' && toBare.link === bare && /Link “Personal”/.test(toBare.why),
  'an unlinked one asks for a repo',
);
assert.match(String(Reflect.get(placeBoard(lib, plain, protoA), 'why')), /hold only prototype boards/);
assert.deepStrictEqual(placeBoard(lib, plain, plainA), { kind: 'move' }, 'plain boards move as before');
assert.deepStrictEqual(placeBoard(lib, plain, null), { kind: 'move' });

assert.deepStrictEqual(
  placeFolder(lib, protoA, plainA, null),
  { kind: 'move' },
  'a prototyping folder moves within its project',
);
assert.deepStrictEqual(
  placeFolder(lib, protoA, null, 'lion'),
  { kind: 'copy', to: lion },
  'and copies to a linked one',
);
assert.ok(placeFolder(lib, protoA, null, 'bare').kind === 'blocked', 'but not to an unlinked one');
assert.match(
  String(Reflect.get(placeFolder(lib, protoA, null, null), 'why')),
  /project with a repo/,
  'nor out of projects',
);
assert.match(String(Reflect.get(placeFolder(lib, plainA, protoA2, null), 'why')), /hold only prototype boards/);
assert.match(
  String(Reflect.get(placeFolder(lib, holder, null, 'lion'), 'why')),
  /Drag each prototyping folder/,
  'a folder holding prototypes stays put',
);
assert.deepStrictEqual(placeFolder(lib, holder, null, 'acme'), { kind: 'move' }, 'within its own project it moves');
assert.deepStrictEqual(placeFolder(lib, plainA, null, 'lion'), { kind: 'move' }, 'plain folders move as before');
console.log('PLACEMENT OK');
