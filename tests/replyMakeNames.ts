// What Myra's reply can ask the app to make is read once, where it enters: boards, folders and projects come out as
// tidy names, each once, at most MAX_MADE of them, and a bad entry or a bad field costs only itself.
import assert from 'node:assert';
import { boardsToMake, foldersToMake, MAX_MADE, parseReply, projectsToMake } from '../src/shared/myraReply.ts';

const boards = (create: unknown) => boardsToMake(parseReply({ boards: { create } }));

assert.deepStrictEqual(boards(['Backlog', 'Done']), { items: ['Backlog', 'Done'], over: 0 });
assert.deepStrictEqual(boardsToMake(parseReply({ say: 'hi' })), { items: [], over: 0 }, 'no boards key, nothing');

for (const odd of [
  'Backlog',
  7,
  null,
  true,
  {},
  { create: 'Backlog' },
  { create: 9 },
  { create: null },
  { create: [] },
])
  assert.deepStrictEqual(
    boardsToMake(parseReply({ say: 'ok', boards: odd })).items,
    [],
    `${JSON.stringify(odd)} makes nothing`,
  );
assert.strictEqual(parseReply({ say: 'ok', boards: 'x' }).say, 'ok', 'and the rest of the reply stands');
assert.strictEqual(parseReply({ say: 'ok', boards: { create: 'x' } }).say, 'ok');

assert.deepStrictEqual(
  boards(['  Spaced   out ', '', '   ', 7, null, { name: 'x' }, ['a'], '\t\n', 'Keep']).items,
  ['Spaced out', 'Keep'],
  'a name that is not text or says nothing is dropped alone, and the rest is tidied to one line',
);
assert.deepStrictEqual(
  boards(['Backlog', 'backlog', ' BACKLOG ', 'Done', 'done']).items,
  ['Backlog', 'Done'],
  'once each',
);
assert.deepStrictEqual(
  boards(['A', '', 'a', 'B']),
  { items: ['A', 'B'], over: 0 },
  'a repeat is not left out by the cap',
);

const many = Array.from({ length: MAX_MADE + 5 }, (_, i) => `Board ${i + 1}`);
const capped = boards([...many, '', 'Board 1', 9]);
assert.strictEqual(capped.items.length, MAX_MADE, 'no more than the cap');
assert.deepStrictEqual(capped.items, many.slice(0, MAX_MADE), 'the first ones');
assert.strictEqual(capped.over, 5, 'and the good names after them are counted: not the empty, the repeated or the odd');
assert.strictEqual(MAX_MADE, 12);

const huge = boards(Array.from({ length: 50000 }, (_, i) => `Board ${i}`));
assert.deepStrictEqual([huge.items.length, huge.over], [MAX_MADE, 50000 - MAX_MADE], 'a huge list is only counted');

const [long] = boards([`${'word '.repeat(60)}`]).items;
assert.strictEqual(Array.from(long ?? '').length, 60, 'a name is kept to 60 characters');
assert.ok(long?.endsWith('…'), 'with an ellipsis');
assert.deepStrictEqual(
  boards(['‮fdp.exe‬', 'Tab\there\u0000there']).items,
  ['fdp.exe', 'Tab here there'],
  'overrides and control characters gone',
);
assert.deepStrictEqual(
  boards(['😀'.repeat(70)]).items.map(n => Array.from(n).length),
  [60],
  'cut between characters, not in one',
);

const projects = (create: unknown) => projectsToMake(parseReply({ projects: { create } }));
assert.deepStrictEqual(projects([' Garden ', 'garden', '', 'Shed']), { items: ['Garden', 'Shed'], over: 0 });
assert.deepStrictEqual(projects('Garden').items, [], 'projects that are not a list are dropped');
assert.deepStrictEqual(
  projectsToMake(parseReply({ projects: { rename: [{ from: 'a', to: 'b' }] } })).items,
  [],
  'a rename makes no project',
);

const folders = (create: unknown) => foldersToMake(parseReply({ folders: { create } }));
assert.deepStrictEqual(
  folders([
    'Plans',
    { name: 'Tools', project: 'Garden' },
    { name: ' Sheds ', project: null },
    { name: '' },
    { name: 'Seeds', project: ' garden ' },
  ]),
  {
    items: [
      { name: 'Plans', project: '' },
      { name: 'Tools', project: 'Garden' },
      { name: 'Sheds', project: '' },
      { name: 'Seeds', project: 'garden' },
    ],
    over: 0,
  },
  'a name alone, or with the project it goes in; none or an empty name is dropped',
);
assert.deepStrictEqual(
  folders(['Plans', 'plans', { name: 'Plans', project: 'Garden' }, { name: 'PLANS', project: 'garden' }]).items,
  [
    { name: 'Plans', project: '' },
    { name: 'Plans', project: 'Garden' },
  ],
  'a folder is once for each project it is asked for in',
);
assert.deepStrictEqual(
  folders(Array.from({ length: 30 }, (_, i) => `Folder ${i}`)),
  { items: Array.from({ length: MAX_MADE }, (_, i) => ({ name: `Folder ${i}`, project: '' })), over: 30 - MAX_MADE },
  'folders have the same cap',
);
assert.deepStrictEqual(folders(7).items, []);
console.log('replyMakeNames: ok');
