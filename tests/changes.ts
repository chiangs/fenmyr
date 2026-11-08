// The record of what a reply changed, and the change set read from it, over boards built by hand.
import assert from 'node:assert';
import { countLines, summaryLines, undoLine } from '../src/shared/changeSummary.ts';
import { type BoardLists, changeSet, listsOf, recordOf, shareStrings } from '../src/shared/changes.ts';
import type { Card } from '../src/shared/model.ts';
import { planUndo, undoable } from '../src/shared/replyUndo.ts';

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
const set = changeSet(record, { named: new Set(['a', 'b', 'u1', 'u2', 'c']), skipped: ['typed'] });
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
  changeSet(recordOf(loose0, loose), { named: new Set(), skipped: [] }).relaid,
  { '': ['a'] },
  'a shift nobody asked for outside a collection',
);

// A reply that makes a kanban, files three cards and a new note into it, rewords two notes and removes one.
const asked = (): BoardLists => {
  const l = board();
  l.cards.push(
    { id: 'td', type: 'todo', x: 0, y: 600, w: 240, h: 180, r: 0, color: 'white', text: 'Jobs', items: [] },
    { id: 'dc', type: 'doc', x: 300, y: 600, w: 240, h: 52, r: 0, text: 'Plan', body: '' },
  );
  l.links.push({ id: 'L4', a: 'c', b: 'a' });
  return l;
};
const replied = (from: BoardLists) => {
  const l = listsOf(from),
    filed = ['a', 'td', 'dc'];
  for (const [i, id] of filed.entries()) Object.assign(find(l, id), { x: 1214, y: 66 + i * 160, w: 260 });
  l.cards.push(
    {
      id: 'ph',
      type: 'coll',
      x: 1200,
      y: 0,
      w: 900,
      h: 700,
      r: 0,
      color: 'pink',
      text: 'Phases',
      kanban: true,
      colNames: ['To do', 'Doing', 'Done'],
      kids: [...filed, 'nk'],
    },
    note('nk', 1500, 66, 'Kick-off'),
  );
  for (const [id, text] of [
    ['b', 'Better words'],
    ['k1', 'Clearer'],
  ] as const) {
    const c = find(l, id);
    if (c.type === 'note') c.text = text;
  }
  l.cards = l.cards.filter(c => c.id !== 'c');
  l.links = l.links.filter(x => x.id !== 'L4');
  return l;
};
const before4 = asked(),
  after4 = replied(before4),
  record4 = recordOf(before4, after4),
  set4 = changeSet(record4, { named: new Set(['a', 'td', 'dc', 'b', 'k1']), skipped: [] });
assert.deepStrictEqual(
  summaryLines(record4, set4),
  ['+ 1 kanban, Phases, with 3 columns and 4 cards', '✎ 2 notes reworded', '− 1 note removed'],
  'the cards filed into a new collection, new or moved, count once, in its line; one kind is named, a mix says cards',
);
const one = listsOf(before4);
one.cards.push(note('sh', 0, 0, 'Ship it'));
one.links.push({ id: 'L9', a: 'sh', b: 'a' });
find(one, 'b').color = 'pink';
assert.deepStrictEqual(
  summaryLines(recordOf(before4, one), changeSet(recordOf(before4, one), { named: new Set(['b']), skipped: [] })),
  ['+ 1 note, “Ship it”', '+ 1 connector', '✎ 1 note changed'],
  'one new card is named, a connector is counted, and a new colour is a change, not a rewording',
);
assert.deepStrictEqual(
  countLines({ added: ['x', 'y'], moved: ['m'], removed: ['r'] }),
  ['+ 2 cards', '→ 1 card moved', '− 1 card removed'],
  'a reply kept before the summary was gets counts only',
);

const whole = planUndo(record4, after4, new Set());
assert.deepStrictEqual(whole.lists, before4, 'Undo puts the board back exactly, a removed card in its old place');
assert.deepStrictEqual(whole.skipped, []);
assert.strictEqual(undoLine(whole), 'I’ve put the board back as it was before that reply.');
const again = planUndo(record4, whole.lists, new Set());
assert.deepStrictEqual([again.undone, again.lists], [0, whole.lists], 'a second Undo puts back nothing more');
assert.strictEqual(undoLine(again), 'That reply is already undone.', 'and she says it was already undone, not changed');
assert.deepStrictEqual(
  [undoable(record4, after4), undoable(record4, whole.lists)],
  [true, false],
  'Undo is offered until it has been done',
);

const relaid = listsOf(after4);
Object.assign(find(relaid, 'a'), { x: 1300, h: 300 });
find(relaid, 'ph').h = 900;
assert.deepStrictEqual(
  planUndo(record4, relaid, new Set()).lists,
  before4,
  'a collection re-laying its cards or measuring itself is not the person changing them',
);

const mine = listsOf(after4),
  b4 = find(mine, 'b');
if (b4.type === 'note') b4.text = 'Mine now';
const partly = planUndo(record4, mine, new Set());
assert.deepStrictEqual(
  partly.lists,
  { ...before4, cards: before4.cards.map(c => (c.id === 'b' ? b4 : c)) },
  'a card the person changed since is left as they have it, and the rest goes back',
);
assert.strictEqual(
  undoLine(partly),
  'I’ve put back what that reply changed, apart from “Mine now”, which has changed since. I’ve left it as it is.',
);
assert.deepStrictEqual(
  planUndo(record4, after4, new Set(['b'])).skipped.map(c => c.id),
  ['b'],
  'the card being typed in is left and named',
);

const renamed = listsOf(after4),
  ph = find(renamed, 'ph');
if (ph.type === 'coll') ph.text = 'Stages';
const unit = planUndo(record4, renamed, new Set());
assert.deepStrictEqual(
  ['ph', 'a', 'td', 'dc', 'nk'].map(id => unit.lists.cards.find(c => c.id === id)),
  ['ph', 'a', 'td', 'dc', 'nk'].map(id => find(renamed, id)),
  'a collection changed since keeps the cards in it, so they never fall out of step',
);
assert.deepStrictEqual(
  [unit.skipped.map(c => c.id), find(unit.lists, 'b'), unit.lists.cards.some(c => c.id === 'c')],
  [['ph'], find(before4, 'b'), true],
  'and only the collection is named, while the rest goes back',
);

const gone = listsOf(after4);
gone.cards = gone.cards.filter(c => c.id !== 'a');
const lone = planUndo(record4, gone, new Set());
assert.deepStrictEqual(
  [lone.lists.cards.some(c => c.id === 'c'), lone.lists.links.some(l => l.id === 'L4')],
  [true, false],
  'a connector goes back only when both its cards are there',
);
assert.strictEqual(
  undoLine({ undone: 2, skipped: [note('x', 0, 0, 'One'), note('y', 0, 0, 'Two'), note('z', 0, 0, 'Three')], back: 0 }),
  'I’ve put back what that reply changed, apart from “One”, “Two” and 1 more card, which have changed since. I’ve left those as they are.',
);
assert.strictEqual(
  undoLine({ undone: 0, skipped: [], back: 0 }),
  'Everything from that reply has changed since, so I’ve left the board as it is.',
);

const lines = (from: BoardLists, to: BoardLists, named: string[]) =>
  summaryLines(recordOf(from, to), changeSet(recordOf(from, to), { named: new Set(named), skipped: [] }));
const later = listsOf(board());
later.cards.push(
  { id: 'lt', type: 'coll', x: 0, y: 900, w: 300, h: 200, r: 0, color: 'sky', text: 'Later', kids: ['c'] },
  { id: 'em', type: 'coll', x: 400, y: 900, w: 300, h: 200, r: 0, color: 'sky', kids: [] },
);
Object.assign(find(later, 'c'), { x: 14, y: 966 });
assert.deepStrictEqual(
  lines(board(), later, ['c']),
  ['+ 1 collection, Later, with 1 card', '+ 1 collection'],
  'a card filed into a new collection is not also a move, and an empty one has no count',
);
const out = listsOf(board()),
  kb = find(out, 'kb');
if (kb.type === 'coll') kb.kids = ['k2'];
assert.deepStrictEqual(
  lines(board(), out, ['k1']),
  ['→ 1 note moved out'],
  'a card taken out of a collection is moved',
);

const drawn = listsOf(one);
drawn.links.push({ id: 'P1', a: 'sh', b: 'b' });
const kept1 = planUndo(recordOf(before4, one), drawn, new Set());
assert.deepStrictEqual(
  [kept1.lists.cards.some(c => c.id === 'sh'), kept1.lists.links.map(l => l.id), find(kept1.lists, 'b')],
  [true, [...before4.links.map(l => l.id), 'P1'], find(before4, 'b')],
  'a card she added keeps a connector the person drew to it, and stays, while the rest goes back',
);
assert.strictEqual(
  undoLine(kept1),
  'I’ve put back what that reply changed, apart from “Ship it”, which has changed since. I’ve left it as it is.',
  'and she names it',
);
const onlyHers = listsOf(board());
onlyHers.cards.push(note('h1', 0, 900, 'Hers'), note('h2', 300, 900, 'Also hers'));
const hersRecord = recordOf(board(), onlyHers);
onlyHers.links.push({ id: 'P4', a: 'h1', b: 'a' });
const linked = planUndo(hersRecord, onlyHers, new Set());
assert.deepStrictEqual(
  [linked.undone, linked.skipped.map(c => c.id), undoLine(linked)],
  [
    1,
    ['h1'],
    'I’ve put back what that reply changed, apart from “Hers”, which has changed since. I’ve left it as it is.',
  ],
  'a card of hers the person drew a connector to is named',
);
onlyHers.links.push({ id: 'P5', a: 'h2', b: 'h1' });
const linkedBoth = planUndo(hersRecord, onlyHers, new Set());
assert.deepStrictEqual(
  [linkedBoth.undone, undoLine(linkedBoth)],
  [0, '“Hers” and “Also hers” have changed since that reply, so I’ve left the board as it is.'],
  'when connectors are the only change since, she names the cards they touch',
);
const fromTray = listsOf(board()),
  t1 = fromTray.tray.splice(0, 1)[0];
if (!t1) throw new Error('no u1');
fromTray.cards.push(t1);
const trayRecord = recordOf(board(), fromTray);
fromTray.links.push({ id: 'P2', a: 'u1', b: 'a' });
assert.deepStrictEqual(
  [planUndo(trayRecord, fromTray, new Set()).lists, undoable(trayRecord, fromTray)],
  [fromTray, false],
  'a card she took out of Unsorted stays on the board with a connector the person drew to it',
);
const intoColl = listsOf(after4);
intoColl.links.push({ id: 'P3', a: 'nk', b: 'b' });
const kept3 = planUndo(record4, intoColl, new Set());
assert.deepStrictEqual(
  [['ph', 'nk', 'a', 'td', 'dc'].map(id => find(kept3.lists, id)), kept3.lists.links.some(l => l.id === 'P3')],
  [['ph', 'nk', 'a', 'td', 'dc'].map(id => find(intoColl, id)), true],
  'a card in a collection she made keeps a connector the person drew, and so does the collection with its cards',
);
assert.deepStrictEqual(
  [kept3.skipped.map(c => c.id), find(kept3.lists, 'b'), kept3.lists.cards.some(c => c.id === 'c')],
  [['nk'], find(before4, 'b'), true],
  'only that card is named, and the rest goes back',
);
const untouched = find(after4, 'k2');
assert.strictEqual(
  find(planUndo(record4, after4, new Set()).lists, 'k2'),
  untouched,
  'a card Undo does not put back is the same object, so an open editor still writes to the board',
);

const pic = (fill: string): Card => ({ id: fill, type: 'image', x: 0, y: 0, w: 10, h: 10, src: fill.repeat(2000) });
const held = { cards: [pic('p'), pic('q')], links: [] },
  readBack = JSON.parse(JSON.stringify({ cards: [{ ...pic('q'), src: 'r'.repeat(2000) }, pic('p')], links: [] }));
shareStrings(readBack, held);
assert.deepStrictEqual(
  readBack,
  { cards: [{ ...pic('q'), src: 'r'.repeat(2000) }, pic('p')], links: [] },
  'sharing strings with the board before Ctrl+Z changes no value, whatever order the cards come back in',
);
console.log('CHANGES OK');
