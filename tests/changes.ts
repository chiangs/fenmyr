// The record of what a reply changed, and the change set read from it, over boards built by hand.
import assert from 'node:assert';
import { type BoardLists, changeSet, listsOf, recordOf } from '../src/shared/changes.ts';
import type { Card } from '../src/shared/model.ts';

const note = (id: string, x: number, y: number, text = id): Card => ({
  id,
  type: 'note',
  x,
  y,
  w: 220,
  h: 140,
  r: 0,
  color: 'white',
  text,
});
const board = (): BoardLists => ({
  cards: [
    { id: 'kb', type: 'coll', x: 0, y: 0, w: 300, h: 400, r: 0, color: 'sky', text: 'Backlog', kids: ['k1', 'k2'] },
    note('k1', 14, 66),
    note('k2', 14, 218),
    note('a', 500, 0),
    note('b', 800, 0),
    note('c', 1100, 0),
  ],
  tray: [note('u1', 0, 0), note('u2', 0, 0)],
  links: [{ id: 'L1', a: 'a', b: 'b' }],
  trayLinks: [],
});
const find = (l: BoardLists, id: string) => {
  const c = [...l.cards, ...l.tray].find(x => x.id === id);
  if (!c) throw new Error(`no ${id}`);
  return c;
};

const live = board(),
  before = listsOf(live);
find(live, 'a').x = 520; // named move
const b = find(live, 'b');
b.x = 820; // a move and a new text: edited, once
if (b.type === 'note') b.text = 'longer words';
find(live, 'k1').h = 200; // a kanban kid grew; the layout pushed k2 down and the collection grew
find(live, 'k2').y = 278;
find(live, 'kb').h = 460;
live.cards = live.cards.filter(c => c.id !== 'c');
const u1 = live.tray.find(c => c.id === 'u1');
if (!u1) throw new Error('no u1');
live.tray = live.tray.filter(c => c !== u1);
live.cards.push(u1);
live.tray = live.tray.filter(c => c.id !== 'u2');
live.cards.push(note('new', 0, 900));
live.links.push({ id: 'L2', a: 'a', b: 'new' });
live.links = live.links.filter(l => l.id !== 'L1');

const record = recordOf(before, live);
const set = changeSet(record, live, { named: new Set(['a', 'b', 'u1', 'u2', 'c']), skipped: ['typed'] });
assert.deepStrictEqual(set.added.sort(), ['new', 'u1'], 'new cards and cards out of Unsorted are added');
assert.deepStrictEqual(set.moved, ['a'], 'a named card with only a new place is moved');
assert.deepStrictEqual(set.edited, ['b'], 'a card moved and edited counts once, as edited');
assert.deepStrictEqual(set.removed.sort(), ['c', 'u2'], 'removed from the board and from Unsorted');
assert.deepStrictEqual(set.relaid, { kb: ['kb', 'k1', 'k2'] }, 'what the layout shifted is grouped by collection');
assert.deepStrictEqual(set.links, { added: ['L2'], removed: ['L1'] });
assert.deepStrictEqual(set.skipped, ['typed']);
const every = [...set.added, ...set.moved, ...set.edited, ...set.removed, ...Object.values(set.relaid).flat()];
assert.strictEqual(new Set(every).size, every.length, 'each card is in one list');

const was = record.cards.find(d => d.id === 'b')?.was?.item;
assert(was?.type === 'note' && was.text === 'b' && was.x === 800, 'the record keeps the card as it was');
find(live, 'a').x = 9999;
assert.strictEqual(record.cards.find(d => d.id === 'a')?.now?.item.x, 520, 'later edits do not reach the record');
assert.deepStrictEqual(recordOf(listsOf(live), live), { cards: [], links: [] }, 'no change, no record');

const loose = board(),
  loose0 = listsOf(loose);
find(loose, 'a').y = 40;
assert.deepStrictEqual(
  changeSet(recordOf(loose0, loose), loose, { named: new Set(), skipped: [] }).relaid,
  { '': ['a'] },
  'a shift nobody asked for outside a collection',
);
console.log('CHANGES OK');
