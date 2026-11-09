// Landing a planned reply over boards built by hand: on a board unchanged since, exactly what was planned; a card the
// person changed since stays theirs, with its collection, and she touched only what landed; a card being typed in still
// takes a change to its place; and landing it again changes nothing more.
import assert from 'node:assert';
import { type BoardLists, landedTouched, listsOf, recordOf } from '../src/shared/changes.ts';
import type { Card } from '../src/shared/model.ts';
import { planDo } from '../src/shared/replyUndo.ts';

const note = (id: string, x: number, y: number): Card => ({
  id,
  type: 'note',
  x,
  y,
  w: 220,
  h: 140,
  r: 0,
  color: 'white',
  text: id,
});
const tied = (id: string, x: number, tie: string): Card => ({ ...note(id, x, 0), tie });
const board = (): BoardLists => ({
  cards: [
    { id: 'kb', type: 'coll', x: 0, y: 0, w: 300, h: 400, r: 0, color: 'sky', text: 'Backlog', kids: ['k1', 'k2'] },
    note('k1', 14, 66),
    note('k2', 14, 218),
    note('a', 500, 0),
    note('b', 800, 0),
    note('c', 1100, 0),
  ],
  tray: [tied('u1', 0, 'u1'), tied('u2', 240, 'u1'), tied('u3', 0, 'u3'), tied('u4', 240, 'u3'), note('u5', 0, 0)],
  links: [
    { id: 'L1', a: 'a', b: 'b' },
    { id: 'L2', a: 'b', b: 'c' },
  ],
  trayLinks: [
    { id: 'TL1', a: 'u1', b: 'u2' },
    { id: 'TL2', a: 'u3', b: 'u4' },
  ],
});
const find = (l: BoardLists, id: string) => {
  const c = [...l.cards, ...l.tray].find(x => x.id === id);
  if (!c) throw new Error(`no ${id}`);
  return c;
};
const ids = (cs: readonly Card[]) => cs.map(c => c.id);

// The board as a reply plans it, the planner's way: cards changed in place, new ones and ones from Unsorted put last.
// It files `a` into the collection and rewords k1, which re-lays k2; rewords b; removes c with its connector; takes u5
// out of Unsorted; removes u1, so u2 is no longer tied; adds a note with a connector to it.
const planned = (from: BoardLists) => {
  const l = listsOf(from),
    kb = find(l, 'kb'),
    u5 = find(l, 'u5');
  if (kb.type === 'coll') kb.kids.push('a');
  Object.assign(kb, { h: 620 });
  Object.assign(find(l, 'a'), { x: 14, y: 430 });
  Object.assign(find(l, 'k1'), { text: 'Longer words', h: 200 });
  Object.assign(find(l, 'k2'), { y: 278 });
  Object.assign(find(l, 'b'), { text: 'Reworded' });
  l.cards = l.cards.filter(c => c.id !== 'c');
  l.links = l.links.filter(x => x.id !== 'L2');
  l.tray = l.tray.filter(c => c !== u5 && c.id !== 'u1');
  Object.assign(u5, { x: 600, y: 600 });
  l.cards.push(u5, note('new', 900, 600));
  delete find(l, 'u2').tie;
  l.trayLinks = l.trayLinks?.filter(x => x.id !== 'TL1');
  l.links.push({ id: 'L3', a: 'b', b: 'new' });
  return l;
};

const plan = planned(board()),
  record = recordOf(board(), plan),
  now = board(),
  untouched = JSON.stringify(now),
  landed = planDo(record, now, new Set());
assert.deepStrictEqual(
  landed.lists,
  plan,
  'on a board unchanged since, the planned lists themselves: order, Unsorted, ties, connectors and re-laid cards',
);
assert.deepStrictEqual(landed.skipped, [], 'nothing is left');
assert.strictEqual(JSON.stringify(now), untouched, 'the board it is given is not changed');

const again = planDo(record, landed.lists, new Set());
assert.deepStrictEqual(again.lists, landed.lists, 'landing it again changes nothing more');
assert.strictEqual(again.undone, 0, 'and lands nothing');

const theirs = board();
Object.assign(find(theirs, 'b'), { text: 'Their words' });
const left = planDo(record, theirs, new Set()),
  rest = listsOf(plan);
Object.assign(find(rest, 'b'), { text: 'Their words' });
assert.deepStrictEqual(ids(left.skipped), ['b'], 'a card the person changed since is named');
assert.deepStrictEqual(left.lists, rest, 'it stays as they have it, and the rest lands as planned');
const leftAgain = planDo(record, left.lists, new Set());
assert.deepStrictEqual(leftAgain.lists, left.lists, 'landing that again changes nothing more');
assert.strictEqual(leftAgain.undone, 0);

for (const [changed, words] of [
  ['kb', 'Their name'],
  ['k1', 'Their words'],
] as const) {
  const since = board();
  Object.assign(find(since, changed), { text: words });
  const whole = planDo(record, since, new Set());
  assert.deepStrictEqual(ids(whole.skipped), [changed], `${changed} changed since is named`);
  for (const id of ['kb', 'k1', 'k2', 'a'])
    assert.deepStrictEqual(
      find(whole.lists, id),
      find(since, id),
      `${changed} changed since: ${id} stays as they have it, since a collection goes with its cards or not at all`,
    );
  assert.deepStrictEqual(find(whole.lists, 'b'), find(plan, 'b'), 'what is outside it still lands');
}

const renamed = board();
Object.assign(find(renamed, 'kb'), { text: 'Their name' });
assert.deepStrictEqual(
  landedTouched(
    ['new', 'a', 'k1', 'b', 'u5', 'u3'],
    record,
    recordOf(renamed, planDo(record, renamed, new Set()).lists),
  ),
  ['new', 'b', 'u5', 'u3'],
  'the cards she touched are the ones that landed, less those left with the collection, and one she touched unplanned',
);

const drawn = board();
drawn.links.push({ id: 'L9', a: 'a', b: 'c' });
const connected = planDo(record, drawn, new Set());
assert.deepStrictEqual(ids(connected.skipped), ['c'], 'a card the plan removes but they connected since is named');
assert(
  connected.lists.cards.some(c => c.id === 'c') && connected.lists.links.some(x => x.id === 'L9'),
  'and stays with their connector',
);

const typing = planDo(record, board(), new Set(['b']));
assert.deepStrictEqual(ids(typing.skipped), ['b'], 'the card being typed in is left');
assert.deepStrictEqual(find(typing.lists, 'b'), find(board(), 'b'));
const typingKid = planDo(record, board(), new Set(['k2']));
assert.deepStrictEqual(
  typingKid.lists,
  plan,
  'a card being typed in that the plan only re-lays moves with its collection',
);

// Typing changes what a card says, never what a collection holds or which one holds a card, so the plans below land
// whole while the collection's name, a column's name or a card in it is being typed.
const kanban = () => {
  const l = board();
  Object.assign(find(l, 'kb'), {
    kanban: true,
    cols: 3,
    colNames: ['To do', 'Doing', 'Done'],
    colOf: { k1: 0, k2: 0 },
  });
  return l;
};
const whole = (from: () => BoardLists, change: (l: BoardLists, kb: Card) => void, keep: string, what: string) => {
  const l = listsOf(from());
  change(l, find(l, 'kb'));
  const landed = planDo(recordOf(from(), l), from(), new Set([keep]));
  assert.deepStrictEqual([landed.lists, ids(landed.skipped)], [l, []], what);
};
whole(
  board,
  (l, kb) => {
    if (kb.type === 'coll') kb.kids.push('new', 'a');
    Object.assign(kb, { h: 700 });
    Object.assign(find(l, 'a'), { x: 14, y: 530 });
    l.cards.push(note('new', 14, 370));
  },
  'kb',
  'a new card and one moved in are filed into a collection whose name is being typed, which grows to hold them',
);
whole(
  kanban,
  (l, kb) => {
    if (kb.type === 'coll') kb.kids.push('new');
    if (kb.type === 'coll' && kb.colOf) kb.colOf.new = 1;
    l.cards.push(note('new', 300, 66));
  },
  'kb',
  "a new card lands in a kanban's column whose name is being typed",
);
whole(
  board,
  l => {
    l.cards = l.cards.filter(c => c.id !== 'kb');
  },
  'k1',
  'a collection goes while a card in it is being typed in, and the card stays where it is',
);

console.log('LAND PLAN OK');
