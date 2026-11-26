// A prototype board's own rules and design come from its doc cards by role: their words in reading order, trimmed, the
// empty ones dropped and the rest joined with a blank line, with the repo's text left out when any of them says so. The
// host reads what the window sent as data: anything malformed is no text, and the repo's text stays.
import assert from 'node:assert';
import { guidesOf, isGuide, readBoardGuides } from '../src/shared/guides.ts';
import type { Card, CardOf } from '../src/shared/model.ts';

const doc = (id: string, x: number, y: number, body: string | undefined, more: Partial<CardOf<'doc'>> = {}): Card => ({
  id,
  type: 'doc',
  x,
  y,
  w: 240,
  h: 52,
  ...(body === undefined ? {} : { body }),
  ...more,
});
const none = { text: '', ignoreRepo: false };

assert.deepStrictEqual(guidesOf([]), { rules: none, design: none }, 'a board with no such cards has no text');
assert.deepStrictEqual(
  guidesOf([doc('d', 0, 0, 'Just a doc'), { id: 'n', type: 'note', x: 0, y: 0, w: 220, h: 140, text: 'A note' }]),
  { rules: none, design: none },
  'an ordinary doc and a note are not the board’s own words',
);

const one = guidesOf([
  doc('r', 0, 0, '  Never use gradients.\n\n', { role: 'rules' }),
  doc('d', 300, 0, 'Square corners.', { role: 'design', ignoreRepo: true }),
]);
assert.deepStrictEqual(
  one,
  {
    rules: { text: 'Never use gradients.', ignoreRepo: false },
    design: { text: 'Square corners.', ignoreRepo: true },
  },
  'each document takes its own card’s words, trimmed, and its own switch',
);

// two cards of one role, as a copied card makes: all of them count, in reading order, a row being cards 200 px apart
const copied = guidesOf([
  doc('low', 0, 600, 'Third', { role: 'rules' }),
  doc('right', 300, 0, 'Second', { role: 'rules' }),
  doc('lower-left', 0, 150, 'Fourth is not here', { role: 'design' }),
  doc('left', 0, 120, 'First', { role: 'rules' }),
]);
assert.equal(
  copied.rules.text,
  'First\n\nSecond\n\nThird',
  'top to bottom in rows, then left to right, a blank line between',
);
assert.equal(copied.design.text, 'Fourth is not here', 'and the other document is not mixed in');

const blanks = guidesOf([
  doc('a', 0, 0, '   ', { role: 'rules' }),
  doc('b', 0, 300, undefined, { role: 'rules' }),
  doc('c', 0, 600, 'Only this', { role: 'rules' }),
]);
assert.equal(blanks.rules.text, 'Only this', 'a card with no words adds nothing, not even a blank line');

const either = guidesOf([
  doc('a', 0, 0, 'One', { role: 'rules' }),
  doc('b', 0, 300, 'Two', { role: 'rules', ignoreRepo: true }),
  doc('c', 0, 600, 'Plain', { ignoreRepo: true }),
]);
assert.deepStrictEqual(
  either.rules,
  { text: 'One\n\nTwo', ignoreRepo: true },
  'Ignore is on when any card of the role has it',
);
assert.equal(either.design.ignoreRepo, false, 'a doc with no role doesn’t switch anything');
assert.deepStrictEqual(
  guidesOf([doc('a', 0, 0, '', { role: 'design', ignoreRepo: true })]).design,
  { text: '', ignoreRepo: true },
  'Ignore with no words of its own is still on',
);

assert.deepStrictEqual(
  [doc('a', 0, 0, 'x', { role: 'rules' }), doc('b', 0, 0, 'x'), doc('c', 0, 0, 'x', { ignoreRepo: true })].map(isGuide),
  [true, false, false],
  'a doc with a role is one of the board’s own documents, not one of the cards the build is about',
);

assert.deepStrictEqual(readBoardGuides(one), one, 'what the window sent is read as it was');
for (const bad of [undefined, null, 'rules', 7, [], { rules: 'x', design: 4 }])
  assert.deepStrictEqual(
    readBoardGuides(bad),
    { rules: none, design: none },
    `${JSON.stringify(bad)} reads as no text`,
  );
assert.deepStrictEqual(
  readBoardGuides({ rules: { text: 7, ignoreRepo: 'yes' }, design: { text: 'Kept', ignoreRepo: true } }),
  { rules: none, design: { text: 'Kept', ignoreRepo: true } },
  'a damaged one is empty and the other is kept',
);

console.log('GUIDES OK');
