// What a build is sent from the board follows the model's window, with no window or host: on a 1M window 300 cards of
// 500 characters all go where a fixed 30,000-character cap kept a fraction of them, on a small one the cards keep their
// ranked order and a card too big for what is left is skipped while a smaller one after it goes in, and design.md, myra.md,
// the preview's errors and the request are cut to a share of the room and marked cut. A prototype's own rules and
// design share their document's share with the repo's text: the board's is cut first and wins, the repo's gets what is
// left, and with Ignore on the repo's text is not used at all. At most twenty pictures are
// sent, those past that and those that don't fit are named, and what the window said of the pictures it couldn't take
// passes through. The cards are always one valid JSON array, and the parts never add up to more than the room.
import assert from 'node:assert';
import { type Fitted, fitBuild, type Sent, TEXT_SHARE } from '../src/host/buildFit.ts';
import { MAX_PICTURES, PICTURE_TOKENS, roomOf, tokensOf, usedTokens } from '../src/shared/contextFit.ts';
import type { BoardGuides } from '../src/shared/guides.ts';
import { isRecord } from '../src/shared/model.ts';

const noGuides: BoardGuides = {
  rules: { text: '', ignoreRepo: false },
  design: { text: '', ignoreRepo: false },
};
const blank: Sent = {
  request: '',
  purpose: '',
  device: '',
  errors: '',
  design: '',
  myra: '',
  guides: noGuides,
  cards: [],
  pictures: [],
  unseen: [],
  tooBig: [],
  over: [],
};
// a card of exactly `chars` characters, as JSON the way the page sends it
const card = (id: string, chars: number) => {
  const bare = JSON.stringify({ id, t: '' }).length;
  return { id, text: JSON.stringify({ id, t: 'x'.repeat(chars - bare) }) };
};
const picture = (i: number) => ({ id: `p${i}`, name: `image ${i}`, data: 'data:image/png;base64,AAAA' });
const pictures = (n: number) => Array.from({ length: n }, (_, i) => picture(i));
const ids = (xs: readonly { id: string }[]) => xs.map(x => x.id);
const part = (f: Fitted, kind: string) => f.use.parts.find(p => p.kind === kind);
// the ids of the cards in what the builder is sent, which must be a JSON array of records
function sentIds(f: Fitted): string[] {
  const parsed: unknown = JSON.parse(f.cards);
  assert(Array.isArray(parsed), 'the cards are an array');
  return parsed.map(c => {
    assert(isRecord(c) && typeof c.id === 'string', 'each is a record with its id');
    return c.id;
  });
}

// a big window has room for a whole board, where today's fixed cap kept a fraction of it
const board = Array.from({ length: 300 }, (_, i) => card(`c${i}`, 500));
const wide = fitBuild(
  { ...blank, request: 'r'.repeat(8_000), design: 'd'.repeat(50_000), myra: 'm'.repeat(30_000), cards: board },
  1_000_000,
);
assert(wide.cards.length > 150_000, 'all 300 cards go, where a cap of 30,000 characters kept 60 of them');
assert.deepStrictEqual(sentIds(wide), ids(board), 'in the order they were ranked');
assert.deepStrictEqual(wide.use.left, [], 'none is left out');
assert.equal(wide.design.length, 50_000, 'a 50,000-character design.md goes whole, where 20,000 was the cap');
assert.equal(wide.request.length, 8_000, 'and the request');
assert(!wide.use.parts.some(p => p.cut), 'no part is cut');
assert.equal(wide.use.window, 1_000_000, 'the use names the window it was fitted to');
assert.equal(part(wide, 'cards')?.count, 300, 'and counts the cards');
assert(usedTokens(wide.use) <= roomOf(1_000_000), 'inside the room');

// a small window keeps the cards in order, skips one that is too big and keeps the smaller ones after it
const SMALL = 20_000;
const mixed = [card('a', 1_000), card('big', 20_000), card('b', 1_000), card('c', 1_000)];
const small = fitBuild({ ...blank, cards: mixed }, SMALL);
assert.deepStrictEqual(
  sentIds(small),
  ['a', 'b', 'c'],
  'the cards that fit keep their order, and a smaller one after the big one still goes',
);
assert.deepStrictEqual(small.use.left, ['big'], 'the one left out is named');
assert.deepStrictEqual(
  part(small, 'cards'),
  { kind: 'cards', tokens: 3 * tokensOf(1_001), count: 3 },
  'the part counts the cards kept at what the fit charged for them',
);
assert.equal(small.cards.startsWith('[{'), true, 'one JSON array');
assert.equal(small.cards, `[${mixed[0]?.text},\n${mixed[2]?.text},\n${mixed[3]?.text}]`, 'a card on each line');

// the texts take an eighth of the room each, and a cut one says so
const room = roomOf(SMALL) * 2.5;
const each = Math.floor(room * TEXT_SHARE);
const texts = fitBuild(
  { ...blank, design: 'd'.repeat(10_000), myra: 'short', errors: 'e'.repeat(each), request: 'q'.repeat(100_000) },
  SMALL,
);
assert.equal(texts.design.length, each, 'a long design.md is cut to its share');
assert.deepStrictEqual(part(texts, 'design'), { kind: 'design', tokens: tokensOf(each), cut: true }, 'and marked cut');
assert.deepStrictEqual(part(texts, 'myra'), { kind: 'myra', tokens: tokensOf(5) }, 'a short one is not');
assert.deepStrictEqual(
  part(texts, 'errors'),
  { kind: 'errors', tokens: tokensOf(each) },
  'one that is exactly its share is not cut either',
);
assert.equal(texts.request.length, Math.floor(room / 4), 'the request takes a quarter');
assert.equal(part(texts, 'request')?.cut, true, 'and says so when it is cut');
assert(usedTokens(texts.use) <= roomOf(SMALL), 'the texts and the cards stay inside the room');

// the board's own rules and design add to the repo's text: both are kept, each as its own part
const adds = fitBuild(
  {
    ...blank,
    design: 'repo design',
    myra: 'repo rules',
    guides: {
      rules: { text: 'board rules', ignoreRepo: false },
      design: { text: 'board design!', ignoreRepo: false },
    },
  },
  SMALL,
);
assert.deepStrictEqual(
  [adds.design, adds.myra, adds.boardDesign, adds.boardRules],
  ['repo design', 'repo rules', 'board design!', 'board rules'],
  'the repo’s text and the board’s are both kept, whole',
);
assert.deepStrictEqual(adds.ignoreRepo, { rules: false, design: false }, 'and neither switch is on');
assert.deepStrictEqual(
  part(adds, 'boardRules'),
  { kind: 'boardRules', tokens: tokensOf(11) },
  'the board’s rules are a part',
);
assert.deepStrictEqual(
  part(adds, 'boardDesign'),
  { kind: 'boardDesign', tokens: tokensOf(13) },
  'and its design is another',
);
assert.deepStrictEqual(part(adds, 'myra'), { kind: 'myra', tokens: tokensOf(10) }, 'myra.md is still one');
assert.equal(part(adds, 'design')?.cut, undefined, 'and nothing is cut');

// with Ignore on for a document its repo text isn't used, whatever it held, and the other document is unaffected
const ignored = fitBuild(
  {
    ...blank,
    design: 'repo design',
    myra: 'repo rules',
    guides: {
      rules: { text: 'board rules', ignoreRepo: true },
      design: { text: 'board design', ignoreRepo: false },
    },
  },
  SMALL,
);
assert.deepStrictEqual([ignored.myra, ignored.boardRules], ['', 'board rules'], 'only the board’s rules are sent');
assert.equal(part(ignored, 'myra'), undefined, 'and myra.md is not a part');
assert.deepStrictEqual(ignored.ignoreRepo, { rules: true, design: false }, 'the switch is passed on, for the prompt');
assert.deepStrictEqual(
  [ignored.design, ignored.boardDesign],
  ['repo design', 'board design'],
  'design has a switch of its own, which is off',
);
assert.equal(
  fitBuild({ ...blank, myra: 'repo rules', guides: { ...noGuides, rules: { text: '', ignoreRepo: true } } }, SMALL)
    .myra,
  '',
  'Ignore with no words of the board’s own still leaves the repo’s out',
);

// a board text past the share is cut to it and wins: the repo's text for that document has nothing left, and says so
const capped = fitBuild(
  {
    ...blank,
    design: 'repo design',
    myra: 'repo rules',
    guides: { ...noGuides, rules: { text: 'b'.repeat(each + 500), ignoreRepo: false } },
  },
  SMALL,
);
assert.equal(capped.boardRules.length, each, 'the board’s rules are cut to the share');
assert.deepStrictEqual(
  part(capped, 'boardRules'),
  { kind: 'boardRules', tokens: tokensOf(each), cut: true },
  'and marked cut',
);
assert.equal(capped.myra, '', 'the repo’s rules are dropped, because nothing is left of the share');
assert.deepStrictEqual(
  part(capped, 'myra'),
  { kind: 'myra', tokens: 0, count: 0, cut: true },
  'and listed with no words, cut, so it isn’t dropped without a word',
);
assert.equal(capped.design, 'repo design', 'the share is the document’s own: the design is not touched');
assert(usedTokens(capped.use) <= roomOf(SMALL), 'inside the room');

// a board text that leaves room: the repo's text is cut to what is left of the share
const roomy = fitBuild(
  {
    ...blank,
    myra: 'r'.repeat(5_000),
    guides: { ...noGuides, rules: { text: 'b'.repeat(400), ignoreRepo: false } },
  },
  SMALL,
);
assert.equal(roomy.boardRules.length, 400, 'the board’s rules go whole');
assert.equal(part(roomy, 'boardRules')?.cut, undefined, 'and are not cut');
assert.equal(roomy.myra.length, each - 400, 'the repo’s rules get what is left of the share');
assert.deepStrictEqual(
  part(roomy, 'myra'),
  { kind: 'myra', tokens: tokensOf(each - 400), cut: true },
  'and are marked cut',
);
const exact = fitBuild(
  { ...blank, myra: 'r', guides: { ...noGuides, rules: { text: 'b'.repeat(each), ignoreRepo: false } } },
  SMALL,
);
assert.deepStrictEqual(
  [exact.boardRules.length, part(exact, 'boardRules')?.cut, exact.myra],
  [each, undefined, ''],
  'a board text of exactly the share is not cut, and leaves the repo’s none',
);

// what the texts take comes off what the cards may have
const crowded = fitBuild({ ...blank, design: 'd'.repeat(10_000), cards: [card('a', 6_000), card('b', 6_000)] }, SMALL);
assert.deepStrictEqual(crowded.use.left, ['b'], 'a card that fits only without the design is left out');

// purpose and device are fields, cut to a fixed length, counted with the request, and never marked cut
const fields = fitBuild(
  { ...blank, request: 'Add a total', purpose: 'p'.repeat(600), device: 'tablet'.repeat(5) },
  SMALL,
);
assert.deepStrictEqual([fields.purpose.length, fields.device.length], [500, 20], 'the fields are cut to 500 and 20');
assert.deepStrictEqual(
  part(fields, 'request'),
  { kind: 'request', tokens: tokensOf('Add a total'.length + 500 + 20) },
  'the request part counts them, and is not cut for them',
);

// parts that have nothing in them are not listed, but the request and the cards always are
const none = fitBuild(blank, SMALL);
assert.deepStrictEqual(
  none.use.parts,
  [
    { kind: 'request', tokens: 0 },
    { kind: 'cards', tokens: 0, count: 0 },
  ],
  'the request is listed with no words, the cards with none, and nothing else',
);
assert.equal(none.cards, '', 'no cards is an empty string, not []');
assert.deepStrictEqual(
  none.use,
  { window: SMALL, parts: none.use.parts, left: [], pictures: [], shortened: [], unseen: [], tooBig: [] },
  'and nothing is left out',
);

// pictures: twenty at most, however big the window
const wideShots = fitBuild({ ...blank, pictures: pictures(25) }, 1_000_000);
assert.equal(wideShots.pictures.length, MAX_PICTURES, 'twenty of twenty-five pictures are sent');
assert.deepStrictEqual(ids(wideShots.pictures), ids(pictures(20)), 'the first twenty, in their order');
assert.deepStrictEqual(wideShots.use.pictures, ['p20', 'p21', 'p22', 'p23', 'p24'], 'and the other five are named');
assert.deepStrictEqual(
  part(wideShots, 'pictures'),
  { kind: 'pictures', tokens: 20 * PICTURE_TOKENS, count: 20 },
  'each is counted at its worst',
);
assert.deepStrictEqual(wideShots.pictures[3], picture(3), 'a picture is sent as it came');
assert.deepStrictEqual(
  fitBuild({ ...blank, pictures: pictures(2), over: ['o1', 'o2'] }, 1_000_000).use.pictures,
  ['o1', 'o2'],
  'the cards the window took no picture of, past twenty, are named too',
);

// pictures take what the cards left, in order, and the ones that don't fit are named after the ones past twenty
const tight = fitBuild({ ...blank, pictures: pictures(25), over: ['o1'] }, SMALL);
assert.deepStrictEqual(ids(tight.pictures), ['p0'], 'one picture fits in the room of a small window');
assert.deepStrictEqual(
  tight.use.pictures,
  [
    'o1',
    ...pictures(25)
      .slice(20)
      .map(p => p.id),
    ...pictures(20)
      .slice(1)
      .map(p => p.id),
  ],
  'those past twenty come first, then the ones that don’t fit',
);
const crowdedOut = fitBuild({ ...blank, cards: [card('a', 11_000)], pictures: pictures(2) }, SMALL);
assert.deepStrictEqual(ids(crowdedOut.pictures), [], 'cards that take the room leave none for a picture');
assert.deepStrictEqual(part(crowdedOut, 'pictures'), { kind: 'pictures', tokens: 0, count: 0 }, 'it is still listed');
assert.deepStrictEqual(crowdedOut.use.pictures, ['p0', 'p1'], 'and both are named');
assert.equal(part(fitBuild(blank, 1_000_000), 'pictures'), undefined, 'with no picture offered the part is not listed');

// what the window knew of the pictures it couldn't take passes through
const known = fitBuild({ ...blank, unseen: ['s1', 's2'], tooBig: ['t1'] }, SMALL);
assert.deepStrictEqual([known.use.unseen, known.use.tooBig], [['s1', 's2'], ['t1']], 'unseen and tooBig are kept');
assert.deepStrictEqual(known.use.shortened, [], 'no card has its words cut');

// whatever was kept, the cards are one valid JSON array and the parts stay inside the room
const everything: Sent = {
  ...blank,
  request: 'Build it',
  purpose: 'p'.repeat(600),
  device: 'phone',
  errors: 'e'.repeat(9_000),
  design: 'd'.repeat(90_000),
  myra: 'm'.repeat(90_000),
  guides: {
    rules: { text: 'g'.repeat(90_000), ignoreRepo: false },
    design: { text: 'h'.repeat(90_000), ignoreRepo: false },
  },
  cards: [card('a', 300), card('b', 30_000), card('c', 700), card('d', 70_000), card('e', 40)],
  pictures: pictures(30),
};
for (const window of [20_000, 40_000, 200_000, 1_000_000]) {
  const f = fitBuild(everything, window);
  assert.deepStrictEqual(
    sentIds(f),
    ids(everything.cards).filter(id => !f.use.left.includes(id)),
    `and are the cards that were kept, in order, at ${window}`,
  );
  assert(usedTokens(f.use) <= roomOf(window), `the parts stay inside the room at ${window}`);
  assert.deepStrictEqual(
    f.use.left.length + (part(f, 'cards')?.count ?? 0),
    5,
    `every card is kept or left at ${window}`,
  );
}

// a window too small for the texts keeps no card, and says so
const tiny = fitBuild({ ...blank, request: 'q'.repeat(5_000), cards: [card('a', 600)] }, 1_000);
assert.equal(tiny.cards, '', 'a window with no room for a card sends none');
assert.deepStrictEqual(tiny.use.left, ['a'], 'and names it');
assert.equal(part(tiny, 'cards')?.count, 0, 'the cards part is still listed');

console.log('BUILD FIT OK');
