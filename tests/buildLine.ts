// Myra's one line for a build's block in her snapshot of the chat names at most ten files, then how many more, so a
// big build doesn't put every file into each prompt. The block itself still lists every file. It ends with what the
// builder was left without, after how the preview ran, so she can say why it missed a card.
import assert from 'node:assert';
import { type BuildRecord, buildLine, buildState, type FileDiff, fileLines } from '../src/shared/build.ts';
import type { ContextUse } from '../src/shared/contextFit.ts';

const record = (n: number): BuildRecord => {
  const files = Array.from(
    { length: n },
    (_, i): FileDiff => ({ kind: 'text', path: `src/f${i}.tsx`, added: 1, removed: 0 }),
  );
  return {
    kind: 'build',
    board: 'pb',
    build: 'b1',
    request: 'Many files.',
    cards: 0,
    start: { at: 1000, snapshot: 'a'.repeat(40) },
    end: { kind: 'built', at: 3000, files, outside: [], from: [] },
  };
};
const names = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => `src/f${from + i}.tsx +1 −0`);

assert.equal(buildLine(record(10), null), `Built in 2 s: ${names(0, 10).join(', ')}`, 'ten files are all named');
assert.equal(
  buildLine(record(50), null),
  `Built in 2 s: ${names(0, 10).join(', ')}, and 40 more`,
  'past ten, the line says how many more',
);
assert.equal(fileLines(buildState(record(50), null)).length, 50, 'and the block still lists every file');
assert.equal(
  buildLine(
    { ...record(0), end: undefined },
    { phase: 'writing', files: names(0, 12).map(n => n.split(' ')[0] ?? '') },
  ),
  `Building…: ${names(0, 10)
    .map(n => n.split(' ')[0])
    .join(', ')}, and 2 more`,
  'and so does a build still writing',
);

const use = (more: Partial<ContextUse>): ContextUse => ({
  window: 200_000,
  parts: [{ kind: 'cards', tokens: 900, count: 3 }],
  left: [],
  pictures: [],
  shortened: [],
  unseen: [],
  tooBig: [],
  ...more,
});
const withUse = (u: ContextUse, n = 1): BuildRecord => {
  const r = record(n);
  return { ...r, start: { at: 1000, snapshot: 'a'.repeat(40), use: u } };
};
assert.equal(
  buildLine(withUse(use({})), null),
  buildLine(record(1), null),
  'a build that was sent everything reads as it did before',
);
assert.equal(
  buildLine(withUse(use({ left: ['a', 'b'], unseen: ['s'] })), null),
  'Built in 2 s: src/f0.tsx +1 −0. 2 cards were left out to fit; 1 screen wasn’t in view, so its layout went without a picture',
  'what was left out ends the line',
);
const checked = withUse(use({ left: ['a'] }));
assert.equal(
  buildLine(
    {
      ...checked,
      end: { kind: 'built', at: 3000, files: [], outside: [], from: [], check: { kind: 'ran', count: 0, errors: [] } },
    },
    null,
  ),
  'Built in 2 s. Preview runs · no errors. 1 card was left out to fit',
  'after how its preview ran',
);
console.log('BUILD LINE OK');
