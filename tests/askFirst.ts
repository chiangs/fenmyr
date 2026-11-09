// When Myra's reply waits as a plan, counted on boards built by hand: per card, with a screen's pieces and a
// collection's re-laid cards riding free and cards made from reading never counting; any removal plans. Also what she
// says about cards a plan left, a plan kept with its message, and the whole messages that answer a waiting plan.
import assert from 'node:assert';
import { answerOf, asksFirst, weigh } from '../src/shared/askFirst.ts';
import { leftLine } from '../src/shared/changeSummary.ts';
import { type BoardLists, changeSet, listsOf, recordOf } from '../src/shared/changes.ts';
import { readMsgs } from '../src/shared/chat.ts';
import type { Card } from '../src/shared/model.ts';

const base = { w: 220, h: 140, r: 0 };
const note = (id: string, x = 0, text = id): Card => ({ ...base, id, type: 'note', x, y: 0, color: 'white', text });
const vnote = (id: string, text = id): Card => ({ ...base, id, type: 'vnote', x: 0, y: 900, vault: 'v', text });
const frame = (id: string): Card => ({ ...base, id, type: 'frame', x: 0, y: 0, w: 393, h: 852 });
const piece = (id: string, onFrame: string): Card => ({ ...base, id, type: 'text', x: 10, y: 10, onFrame, text: id });
const coll = (id: string, kids: string[], x = 0): Card => ({ ...base, id, type: 'coll', x, y: 0, kids });
const lists = (cards: Card[], tray: Card[] = []): BoardLists => ({ cards, tray, links: [] });
const many = <T>(n: number, make: (i: number) => T) => Array.from({ length: n }, (_, i) => make(i));

// weighs a reply that turns `before` into `after`; named: the cards it names to move or edit
const weighed = (before: BoardLists, after: BoardLists, named: string[] = []) => {
  const record = recordOf(before, after);
  return weigh(record, changeSet(record, { named: new Set(named), skipped: [] }));
};
const adding = (cards: Card[]) => weighed(lists([]), lists(cards));

assert.deepStrictEqual(adding(many(10, i => note(`n${i}`, i * 240))), { cards: 10, removed: 0 });
assert.strictEqual(asksFirst(adding(many(10, i => note(`n${i}`, i * 240)))), false, 'ten new cards land at once');
assert.strictEqual(asksFirst(adding(many(11, i => note(`n${i}`, i * 240)))), true, 'eleven wait as a plan');

const tray = lists([note('a')], [note('u1'), note('u2')]);
const lessTray = listsOf(tray);
lessTray.tray = lessTray.tray.filter(c => c.id !== 'u2');
assert.deepStrictEqual(weighed(tray, lessTray), { cards: 0, removed: 1 });
assert.strictEqual(asksFirst(weighed(tray, lessTray)), true, 'removing one card from Unsorted waits as a plan');

const screens = many(3, s => [frame(`f${s}`), ...many(20, p => piece(`f${s}p${p}`, `f${s}`))]).flat();
assert.deepStrictEqual(adding(screens), { cards: 3, removed: 0 }, 'three screens of 20 pieces are three cards');
const reworded = listsOf(lists(screens));
for (const c of reworded.cards) if (c.type === 'text') c.text = 'New words';
assert.deepStrictEqual(
  weighed(lists(screens), reworded),
  { cards: 60, removed: 0 },
  'pieces count when only they change',
);

const kids = many(8, i => ({ ...note(`k${i}`), x: 14, y: 60 + i * 150 }));
const board = lists([
  coll(
    'c',
    kids.map(k => k.id),
  ),
  ...kids,
]);
const shifted = listsOf(board);
for (const c of shifted.cards) Object.assign(c, { x: c.x + 500 });
assert.deepStrictEqual(weighed(board, shifted, ['c']), { cards: 1, removed: 0 }, 'a moved collection is one card');
assert.deepStrictEqual(
  adding([
    coll(
      'c',
      kids.slice(0, 6).map(k => k.id),
    ),
    ...kids.slice(0, 6),
  ]),
  { cards: 7, removed: 0 },
  'a new collection with six notes filed in it is seven cards',
);

const read = many(12, i => vnote(`v${i}`));
assert.deepStrictEqual(adding(read), { cards: 0, removed: 0 }, 'notes she read and put on the board never count');
assert.strictEqual(asksFirst(adding([...read, ...many(10, i => note(`n${i}`, i * 240))])), false);
const edited = listsOf(lists(read));
for (const c of edited.cards) if (c.type === 'vnote') c.text = 'Her summary';
assert.deepStrictEqual(
  weighed(
    lists(read),
    edited,
    read.map(c => c.id),
  ),
  { cards: 12, removed: 0 },
  'editing them does',
);

const linked = listsOf(lists(many(2, i => note(`n${i}`, i * 240))));
linked.links.push({ id: 'L1', a: 'n0', b: 'n1' });
assert.deepStrictEqual(weighed(lists(many(2, i => note(`n${i}`, i * 240))), linked), { cards: 0, removed: 0 });

assert.strictEqual(leftLine([]), '', 'nothing left, nothing to say');
assert.strictEqual(
  leftLine([note('n3', 0, 'Third note')]),
  'I left “Third note” as you have it, since it changed after my plan.',
);
assert.strictEqual(
  leftLine([note('a', 0, 'Moodboard'), note('b', 0, 'Brief'), note('c')]),
  'I left “Moodboard”, “Brief” and 1 more card as you have them, since they changed after my plan.',
);

const [kept] = readMsgs([
  {
    who: 'myra',
    text: 'Here’s my plan.',
    t: 1,
    acts: [
      { kind: 'plan', plan: 'p1', steps: ['+ 11 notes'], ended: 'cancelled' },
      { kind: 'plan', plan: 'p2', steps: ['− 1 note removed'], ended: 'later' },
      { kind: 'plan', plan: 'p3', steps: [3] },
      { kind: 'plan', steps: [] },
    ],
  },
]);
assert.deepStrictEqual(
  kept?.acts,
  [
    { kind: 'plan', plan: 'p1', steps: ['+ 11 notes'], ended: 'cancelled' },
    { kind: 'plan', plan: 'p2', steps: ['− 1 note removed'] },
  ],
  'a plan comes back with its message; an ending this version doesn’t know reads as none, and a bad plan drops alone',
);

for (const yes of ['Yes', 'yes!', 'Do it ✦', 'go ahead.', 'OK', 'sure'])
  assert.strictEqual(answerOf(yes), 'do', `"${yes}" is Do it`);
assert.strictEqual(answerOf('Just do it!'), 'just', '"just do it" is Just do it');
for (const no of ['no', 'Never mind', 'cancel.']) assert.strictEqual(answerOf(no), 'cancel', `"${no}" is Cancel`);
for (const more of [
  'no, make it three groups',
  'yes please, but pink',
  'do it?',
  'don’t do it',
  'don’t just do it',
  'so do it later',
])
  assert.strictEqual(answerOf(more), null, `"${more}" goes to her`);

console.log('ASK FIRST OK');
