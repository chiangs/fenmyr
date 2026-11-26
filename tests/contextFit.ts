// What Myra is sent from a board follows the model's window and is cut in a ranked order, with every cut said in words:
// the window of a chosen model (or an assumed one), the ranking of cards (selected, then wired to them, then the rest,
// each in reading order), the fit that skips a big item but keeps a smaller one after it, the reading of a use from a
// board file, and the wording of each part and each cut, singular and plural.
import assert from 'node:assert';
import {
  BOARD_SHARE,
  CHARS_PER_TOKEN,
  type ContextUse,
  fitRanked,
  leftWords,
  type Part,
  type PartKind,
  PICTURE_TOKENS,
  partWords,
  READING_ROW,
  rankCards,
  readContextUse,
  readList,
  roomOf,
  shareWords,
  tokensOf,
  UNKNOWN_WINDOW,
  usedTokens,
  windowOf,
} from '../src/shared/contextFit.ts';
import { EFFORTS, type ProviderModels } from '../src/shared/models.ts';

const lists: ProviderModels[] = [
  {
    provider: 'claude-code',
    name: 'Claude Code',
    models: [
      { id: 'big', name: 'Big', efforts: EFFORTS, context: 1_000_000 },
      { id: 'quiet', name: 'Quiet', efforts: EFFORTS },
    ],
  },
];
assert.equal(windowOf(lists, { provider: 'claude-code', id: 'big' }), 1_000_000, 'a listed model gives its window');
assert.equal(windowOf(lists, { provider: 'claude-code', id: 'big', effort: 'low' }), 1_000_000, 'whatever its effort');
assert.equal(
  windowOf(lists, { provider: 'claude-code', id: 'quiet' }),
  UNKNOWN_WINDOW,
  'a model with no window is unknown',
);
assert.equal(windowOf(lists, undefined), UNKNOWN_WINDOW, 'no choice is unknown');
assert.equal(
  windowOf(lists, { provider: 'claude-code', effort: 'high' }),
  UNKNOWN_WINDOW,
  'an effort alone names no model',
);
assert.equal(
  windowOf(lists, { provider: 'claude-code', id: 'gone' }),
  UNKNOWN_WINDOW,
  'a model that is not listed is unknown',
);
assert.equal(windowOf([], { provider: 'claude-code', id: 'big' }), UNKNOWN_WINDOW, 'no lists at all is unknown');
assert.equal(tokensOf(10 * CHARS_PER_TOKEN), 10, 'characters are counted at the tokenizer’s rate');
assert.equal(tokensOf(10 * CHARS_PER_TOKEN + 1), 11, 'and a part of a token is a whole one');
assert.equal(roomOf(1_000_000), 1_000_000 * BOARD_SHARE, 'the board may fill its share of the window');
assert.equal(roomOf(7), 1, 'and a share of a token is none');

type Card = { id: string; x: number; y: number };
const card = (id: string, x: number, y: number): Card => ({ id, x, y });
const ids = (cards: readonly Card[]) => cards.map(c => c.id).join(' ');
const board = [
  card('far', 900, 900),
  card('b', 300, 50),
  card('a', 100, 150),
  card('wiredLow', 100, 450),
  card('sel2', 500, 700),
  card('wiredHigh', 700, 10),
  card('sel1', 800, 0),
  card('tieA', 600, 300),
  card('tieB', 600, 399),
  card('other', 0, 1200),
];
const ranked = rankCards(board, new Set(['sel1', 'sel2']), [
  { a: 'wiredHigh', b: 'sel1' },
  { a: 'sel2', b: 'wiredLow' },
  { a: 'sel1', b: 'sel2' },
  { a: 'a', b: 'b' },
]);
assert.equal(
  ids(ranked),
  'sel1 sel2 wiredHigh wiredLow a b tieA tieB far other',
  'selected first, then wired to them, then the rest, each in reading order',
);
assert.equal(ranked.length, board.length, 'no card is dropped or repeated');
assert.notEqual(ranked, board, 'it is a new array');
assert.equal(ids(board.slice(0, 2)), 'far b', 'and the input is left as it was');
// a (y 150) and b (y 50) share a 200 px row, so the one further left reads first although it is lower
assert.equal(ids(rankCards([card('b', 300, 50), card('a', 100, 150)], new Set(), [])), 'a b', 'one row reads by x');
assert.equal(
  ids(rankCards([card('low', 0, READING_ROW), card('high', 900, READING_ROW - 1)], new Set(), [])),
  'high low',
  'the next row reads after',
);
assert.equal(
  ids(rankCards([card('first', 5, 5), card('second', 5, 5), card('third', 5, 5)], new Set(), [])),
  'first second third',
  'a full tie keeps the input order',
);
assert.equal(
  ids(rankCards([card('x', 0, 0)], new Set(), [{ a: 'x', b: 'nobody' }])),
  'x',
  'a link to no card is harmless',
);

const sizes: Record<string, number> = { a: 4, huge: 100, b: 3, c: 3, d: 1 };
const fit = fitRanked(Object.keys(sizes), 11, k => sizes[k] ?? 0);
assert.deepEqual(fit.kept, ['a', 'b', 'c', 'd'], 'a big item is skipped and the smaller ones after it still go in');
assert.deepEqual(fit.left, ['huge'], 'and the one left out is the big one');
assert.deepEqual(
  fitRanked(['a', 'b'], 7, k => sizes[k] ?? 0),
  { kept: ['a', 'b'], left: [] },
  'a fit to the last token',
);
assert.deepEqual(
  fitRanked(['a', 'b'], 6, k => sizes[k] ?? 0),
  { kept: ['a'], left: ['b'] },
  'and one token over leaves it out',
);
assert.deepEqual(
  fitRanked([], 10, () => 1),
  { kept: [], left: [] },
  'nothing to fit',
);

const full: ContextUse = {
  window: 1_000_000,
  parts: [
    { kind: 'request', tokens: 120 },
    { kind: 'cards', tokens: 9_000, count: 12 },
    { kind: 'pictures', tokens: 3 * PICTURE_TOKENS, count: 3 },
    { kind: 'design', tokens: 800, count: 1 },
    { kind: 'myra', tokens: 300, count: 1 },
  ],
  left: ['c1', 'c2'],
  pictures: ['c3'],
  shortened: ['c4'],
  unseen: ['s1', 's2'],
  tooBig: ['p1'],
};
assert.deepEqual(readContextUse(JSON.parse(JSON.stringify(full))), full, 'a full use reads back as it was written');
assert.equal(usedTokens(full), 120 + 9_000 + 3 * PICTURE_TOKENS + 800 + 300, 'the tokens used are the parts added up');
assert.deepEqual(
  readContextUse({ window: 10, parts: [] }),
  { window: 10, parts: [], left: [], pictures: [], shortened: [], unseen: [], tooBig: [] },
  'a missing list reads as empty',
);
const parts = readContextUse({
  window: 10,
  parts: [
    { kind: 'cards', tokens: 5, count: 2 },
    { kind: 'nonsense', tokens: 5 },
    { kind: 'chat', tokens: -1 },
    { kind: 'board', tokens: 1.5 },
    { kind: 'files', tokens: '3' },
    { kind: 'errors', tokens: 4, count: -2 },
    { kind: 'design', tokens: 4, count: 'x' },
    { kind: 'myra' },
    'not a part',
    null,
    { kind: 'request', tokens: 7 },
  ],
  left: ['a', 7, null, 'b'],
  pictures: 'not a list',
})?.parts;
assert.deepEqual(
  parts,
  [
    { kind: 'cards', tokens: 5, count: 2 },
    { kind: 'request', tokens: 7 },
  ],
  'a bad part drops alone and the good ones stay',
);
assert.deepEqual(
  readContextUse({ window: 10, parts: [], left: ['a', 7, 'b'], pictures: 'x' })?.left,
  ['a', 'b'],
  'a list keeps only strings',
);
assert.deepEqual(
  readContextUse({ window: 10, parts: [], pictures: 'x' })?.pictures,
  [],
  'a list that is not a list reads as empty',
);
const many = Array.from({ length: 250 }, (_, i) => `c${i}`);
assert.equal(readContextUse({ window: 10, parts: [], tooBig: many })?.tooBig.length, 200, 'a list is capped at 200');
assert.equal(readContextUse({ window: 0, parts: [] }), undefined, 'a window of 0 is no use');
assert.equal(readContextUse({ window: 1.5, parts: [] }), undefined, 'and so is one that is not whole');
assert.equal(readContextUse({ window: '10', parts: [] }), undefined, 'or one that is not a number');
assert.equal(readContextUse({ window: 10 }), undefined, 'a use with no parts is none');
assert.equal(readContextUse({ window: 10, parts: {} }), undefined, 'or parts that are not a list');
assert.equal(readContextUse('x'), undefined, 'or not a record');
assert.equal(readContextUse(null), undefined, 'or nothing');

const used = (tokens: number, window = 1_000_000): ContextUse => ({
  ...full,
  window,
  parts: [{ kind: 'board', tokens }],
});
assert.equal(shareWords(full), 'about 2% of the context', 'a share is rounded to a whole percent');
assert.equal(shareWords(used(4_000, 100_000)), 'about 4% of the context', 'as a share of its own window');
assert.equal(shareWords(used(4_000)), 'under 1% of the context', 'a use that rounds to nothing is under 1%');
assert.equal(shareWords(used(5_000)), 'about 1% of the context', 'and 0.5% rounds up to 1%');
assert.equal(shareWords(used(5_000_000)), 'about 100% of the context', 'a use over the window is capped at all of it');

const part = (kind: PartKind, count?: number): Part => ({
  kind,
  tokens: 1,
  ...(count === undefined ? {} : { count }),
});
const only = (...p: Part[]): ContextUse => ({ ...full, parts: p });
assert.equal(readList(full), '12 cards, 3 pictures, design.md and myra.md', 'the board, in order, joined with and');
assert.equal(
  readList(only(part('myra', 1), part('pictures', 1), part('cards', 1))),
  '1 card, 1 picture and myra.md',
  'singular, and in order whatever the parts were',
);
assert.equal(readList(only(part('cards', 2), part('design', 1))), '2 cards and design.md', 'two read as a and b');
assert.equal(readList(only(part('cards', 1))), '1 card', 'one stands alone');
assert.equal(
  readList(only(part('cards', 0), part('pictures', 0), part('design', 0), part('myra', 0))),
  '',
  'parts with count 0 are skipped',
);
assert.equal(readList(only(part('cards', 0), part('pictures', 3))), '3 pictures', 'and the rest still read');
assert.equal(
  readList(only(part('request'), part('board'), part('chat'), part('files'), part('errors'))),
  '',
  'other parts are not about the board',
);
assert.equal(readList(only()), '', 'no parts, no list');
assert.equal(readList(only(part('cards', 1_200))), '1,200 cards', 'numbers are grouped');

const empty: ContextUse = { ...full, left: [], pictures: [], shortened: [], unseen: [], tooBig: [] };
const ofIds = (n: number) => Array.from({ length: n }, (_, i) => `c${i}`);
assert.deepEqual(leftWords(empty), [], 'nothing left out says nothing');
assert.deepEqual(
  leftWords({ ...empty, pictures: ofIds(2), left: ofIds(4) }),
  ['2 pictures and 4 cards were left out to fit'],
  'pictures first, then cards, in one line',
);
assert.deepEqual(
  leftWords({ ...empty, pictures: ofIds(1), left: ofIds(1) }),
  ['1 picture and 1 card were left out to fit'],
  'one of each is still two things',
);
assert.deepEqual(leftWords({ ...empty, left: ofIds(1) }), ['1 card was left out to fit'], 'one card');
assert.deepEqual(leftWords({ ...empty, left: ofIds(4) }), ['4 cards were left out to fit'], 'some cards');
assert.deepEqual(leftWords({ ...empty, pictures: ofIds(1) }), ['1 picture was left out to fit'], 'one picture');
assert.deepEqual(leftWords({ ...empty, pictures: ofIds(2) }), ['2 pictures were left out to fit'], 'some pictures');
assert.deepEqual(leftWords({ ...empty, shortened: ofIds(1) }), ['1 card was shortened to fit'], 'one card shortened');
assert.deepEqual(
  leftWords({ ...empty, shortened: ofIds(3) }),
  ['3 cards were shortened to fit'],
  'some cards shortened',
);
assert.deepEqual(
  leftWords({ ...empty, unseen: ofIds(1) }),
  ['1 screen wasn’t in view, so it went without a picture'],
  'one screen unseen',
);
assert.deepEqual(
  leftWords({ ...empty, unseen: ofIds(2) }),
  ['2 screens weren’t in view, so they went without a picture'],
  'some screens unseen',
);
assert.deepEqual(leftWords({ ...empty, tooBig: ofIds(1) }), ['1 picture was too big to send'], 'one picture too big');
assert.deepEqual(
  leftWords({ ...empty, tooBig: ofIds(2) }),
  ['2 pictures were too big to send'],
  'some pictures too big',
);
assert.deepEqual(
  leftWords(full),
  [
    '1 picture and 2 cards were left out to fit',
    '1 card was shortened to fit',
    '2 screens weren’t in view, so they went without a picture',
    '1 picture was too big to send',
  ],
  'every case at once is one line each, in order',
);

const words: [Part, string][] = [
  [{ kind: 'request', tokens: 1_200 }, 'The request · about 1,200 tokens'],
  [{ kind: 'cards', tokens: 9_000, count: 12 }, '12 cards · about 9,000 tokens'],
  [{ kind: 'cards', tokens: 750, count: 1 }, '1 card · about 750 tokens'],
  [{ kind: 'pictures', tokens: 14_352, count: 3 }, '3 pictures · about 14,352 tokens'],
  [{ kind: 'pictures', tokens: 4_784, count: 1 }, '1 picture · about 4,784 tokens'],
  [{ kind: 'design', tokens: 800 }, 'design.md · about 800 tokens'],
  [{ kind: 'myra', tokens: 300 }, 'myra.md · about 300 tokens'],
  [{ kind: 'errors', tokens: 60 }, 'Preview errors · about 60 tokens'],
  [{ kind: 'board', tokens: 2_000 }, 'The board · about 2,000 tokens'],
  [{ kind: 'chat', tokens: 1 }, 'The chat so far · about 1 token'],
  [{ kind: 'files', tokens: 5_000 }, 'Added files · about 5,000 tokens'],
  [{ kind: 'cards', tokens: 40 }, 'Cards · about 40 tokens'],
  [{ kind: 'pictures', tokens: 40 }, 'Pictures · about 40 tokens'],
];
for (const [p, expected] of words) assert.equal(partWords(p), expected, `${p.kind} reads in words`);
console.log('CONTEXT FIT OK');
