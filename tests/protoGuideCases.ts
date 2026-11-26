// Which chips the "Myra sees" strip gets for a prototype's rules and design, in Node: each case of where the repo's file
// stands and whether the board has words, in what order, and that none of them changes what a message goes with.
import assert from 'node:assert';
import { capture, chipsOf, NO_FLIPS, type SeesInput } from '../src/web/myra/sees.ts';

const none = { text: '', ignoreRepo: false };
const input = (more: Partial<SeesInput> = {}): SeesInput => ({
  sel: ['a'],
  one: null,
  vaults: [],
  web: true,
  added: [],
  guides: null,
  ...more,
});
const names = (i: SeesInput) =>
  chipsOf(i, NO_FLIPS).map(c => (c.kind === 'guide' ? `${c.role}-${c.repo}${c.board ? '+board' : ''}` : c.kind));
// the rules as the board has them, and the design as it has none, for a project with a repo or without
const rules = (repo: boolean, text: string, ignoreRepo: boolean) =>
  names(input({ guides: { repo, board: { rules: { text, ignoreRepo }, design: none } } }));

assert.deepStrictEqual(names(input()), ['board', 'selection', 'web'], 'an ordinary board has no guide chips');
// the six cases for the rules, which the design reads the same way
assert.deepStrictEqual(rules(true, '', false), ['board', 'rules-sent', 'design-sent', 'selection', 'web'], 'repo');
assert.deepStrictEqual(
  rules(true, 'r', false),
  ['board', 'rules-sent+board', 'design-sent', 'selection', 'web'],
  'a repo and the board’s words: one chip, not two',
);
assert.deepStrictEqual(
  rules(true, 'r', true),
  ['board', 'rules-ignored+board', 'design-sent', 'selection', 'web'],
  'the board’s words alone, the repo’s file ignored',
);
assert.deepStrictEqual(
  rules(true, '', true),
  ['board', 'rules-ignored', 'design-sent', 'selection', 'web'],
  'the repo’s file ignored and nothing in its place',
);
assert.deepStrictEqual(
  rules(false, 'r', false),
  ['board', 'rules-none+board', 'selection', 'web'],
  'no repo, the board’s words',
);
assert.deepStrictEqual(rules(false, '', false), ['board', 'selection', 'web'], 'no repo and no words: no chip');
assert.deepStrictEqual(
  rules(false, 'r', true),
  ['board', 'rules-none+board', 'selection', 'web'],
  'with no repo there is no repo file to ignore',
);
assert.deepStrictEqual(rules(false, '', true), ['board', 'selection', 'web'], 'nor one to say is ignored');
assert.deepStrictEqual(
  names(
    input({
      guides: {
        repo: true,
        board: { rules: { text: 'r', ignoreRepo: false }, design: { text: '', ignoreRepo: true } },
      },
    }),
  ),
  ['board', 'rules-sent+board', 'design-ignored', 'selection', 'web'],
  'the rules, then the design, one chip each, after the board and before the selection',
);
assert.deepStrictEqual(
  capture(input({ guides: { repo: true, board: { rules: { text: 'r', ignoreRepo: true }, design: none } } }), NO_FLIPS),
  capture(input(), NO_FLIPS),
  'a message goes with the same things whatever the guide chips say',
);
console.log('PROTO GUIDE CASES OK');
