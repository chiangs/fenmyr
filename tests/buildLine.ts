// Myra's one line for a build's block in her snapshot of the chat names at most ten files, then how many more, so a
// big build doesn't put every file into each prompt. The block itself still lists every file.
import assert from 'node:assert';
import { type BuildRecord, buildLine, buildState, type FileDiff, fileLines } from '../src/shared/build.ts';

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
console.log('BUILD LINE OK');
