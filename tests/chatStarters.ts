// The starters an empty chat offers: up to four that fit the board, with its counts, prototype starters on a
// prototype board and sensible ones on an empty board, in Node.
import assert from 'node:assert';
import type { Card } from '../src/shared/model.ts';
import { type StarterInput, starters } from '../src/web/myra/starters.ts';

let n = 0;
const at = { x: 0, y: 0, w: 100, h: 100 };
const note = (more: object = {}): Card => ({ id: `n${n++}`, type: 'note', ...at, ...more });
const many = (k: number, make: () => Card) => Array.from({ length: k }, make);
const of = (cards: Card[], more: Partial<StarterInput> = {}) =>
  starters({ cards, unsorted: 0, selected: 0, prototype: false, mobbin: false, dueBy: '2026-11-15', ...more });

assert.deepStrictEqual(
  of([]),
  ['Help me plan a project', 'Brainstorm ideas with me', 'Set up a kanban for this week'],
  'an empty board offers ways to start',
);
assert.deepStrictEqual(
  of([], { mobbin: true }),
  [
    'Help me plan a project',
    'Brainstorm ideas with me',
    'Set up a kanban for this week',
    'Find onboarding screens on Mobbin',
  ],
  'with Mobbin on, an empty board also offers Mobbin',
);
assert.deepStrictEqual(of([note()]), ['What should I add next?'], 'one card: what to add next');
assert.deepStrictEqual(
  of(many(6, note)),
  ['Group my 6 notes by theme', 'What am I missing?', 'Make a checklist from this board'],
  'six loose notes are counted',
);

const kids = many(4, note),
  coll: Card = { id: 'c', type: 'coll', ...at, kids: kids.map(k => k.id) };
assert.deepStrictEqual(
  of([...kids, coll, note(), note()]),
  ['What am I missing?', 'Make a checklist from this board'],
  'notes in a collection are not loose',
);

assert.deepStrictEqual(
  of(many(6, note), { selected: 3 }),
  ['Group these 3 cards by theme', 'What am I missing?', 'Make a checklist from this board'],
  'a selection of three is grouped, and the loose-notes starter steps aside',
);
assert.strictEqual(of(many(6, note), { selected: 1 })[0], 'What could I add to this?', 'one selected card');

assert.strictEqual(of([note()], { unsorted: 1 })[0], 'Find a place for the idea in Unsorted', 'one idea in Unsorted');
assert.strictEqual(
  of([note()], { unsorted: 3 })[0],
  'Find places for the 3 ideas in Unsorted',
  'three ideas in Unsorted',
);

const todo = (done: boolean[], due?: string): Card => ({
  id: `t${n++}`,
  type: 'todo',
  ...at,
  items: done.map((d, i) => ({ t: `item ${i}`, done: d })),
  ...(due ? { due } : {}),
});
assert.deepStrictEqual(
  of([todo([false, false, true]), todo([false, false, false, true])]),
  ['Which of my 5 open tasks comes first?', 'What should I add next?'],
  'unticked items across checklists are counted, ticked ones are not',
);
assert.strictEqual(
  of([note({ due: '2026-11-15T17:00' })])[0],
  'What’s due this week?',
  'due on the last day of the week',
);
assert.strictEqual(of([note({ due: '2025-01-01' })])[0], 'What’s due this week?', 'overdue counts');
assert.deepStrictEqual(of([note({ due: '2026-11-16' })]), ['What should I add next?'], 'due next week does not');
assert.deepStrictEqual(of([note({ due: 'soon' })]), ['What should I add next?'], 'a due that is not a date does not');

const doc = (): Card => ({ id: `d${n++}`, type: 'doc', ...at });
assert.strictEqual(of([doc()])[0], 'Sum up my doc', 'one doc');
assert.strictEqual(of([doc(), doc()])[0], 'Sum up my 2 docs', 'two docs');

const link = (): Card => ({ id: `l${n++}`, type: 'link', ...at });
const pic = (): Card => ({ id: `p${n++}`, type: 'image', ...at });
const frame = (): Card => ({ id: `f${n++}`, type: 'frame', ...at });
assert.deepStrictEqual(
  of([...many(4, link), ...many(3, pic), frame()]),
  [
    'Group my 4 links by topic',
    'Make a mood board from my pictures',
    'Wireframe the next screen',
    'What am I missing?',
  ],
  'links, pictures and frames, and never more than four',
);
assert.ok(of([frame()], { mobbin: true }).includes('Find onboarding screens on Mobbin'), 'Mobbin with a frame');
assert.ok(
  !of(many(3, note), { mobbin: true }).includes('Find onboarding screens on Mobbin'),
  'no Mobbin for plain notes',
);

const proto = { prototype: true };
assert.deepStrictEqual(of([], proto), ['What should the first screen show?'], 'an empty prototype board');
assert.deepStrictEqual(
  of([note(), frame()], { ...proto, mobbin: true }),
  [
    'Sum up what’s on the board',
    'What should the first screen show?',
    'Build the first screen from my wireframes',
    'What am I missing?',
  ],
  'a prototype board with a wireframe',
);
assert.strictEqual(of([note()], { ...proto, selected: 1 })[0], 'Sum up what these cards say', 'a prototype selection');
assert.deepStrictEqual(
  of([note()], { ...proto, mobbin: true }),
  [
    'Sum up what’s on the board',
    'What should the first screen show?',
    'What am I missing?',
    'Find onboarding screens on Mobbin',
  ],
  'prototype starters only, Mobbin last',
);

for (const k of [0, 1, 3, 9]) {
  const lines = of(many(k, note), { selected: k, unsorted: k, mobbin: true });
  assert.ok(lines.length >= 1 && lines.length <= 4, `between one and four starters for ${k} of everything`);
  assert.strictEqual(new Set(lines).size, lines.length, `no starter twice for ${k} of everything`);
}

console.log('CHAT STARTERS OK');
