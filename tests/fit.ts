// How the prototype board's columns fold as the window narrows.
import assert from 'node:assert';
import { DEFAULT_LAYOUT, fit } from '../src/web/proto/fit.ts';

assert.deepStrictEqual(fit(DEFAULT_LAYOUT, 1440), [], 'a laptop-wide window shows every column');
assert.deepStrictEqual(fit(DEFAULT_LAYOUT, 1300), ['canvas'], 'the canvas folds first');
assert.deepStrictEqual(fit(DEFAULT_LAYOUT, 900), ['code', 'canvas'], 'then the code');
assert.deepStrictEqual(fit(DEFAULT_LAYOUT, 500), ['code', 'canvas'], 'the preview never folds on its own');
assert.deepStrictEqual(
  fit({ ...DEFAULT_LAYOUT, closed: ['preview'] }, 1300),
  ['preview'],
  'a folded preview makes room',
);
assert.deepStrictEqual(
  fit({ ...DEFAULT_LAYOUT, closed: ['code'] }, 1600),
  ['code'],
  'what the person folds stays folded',
);
console.log('FIT OK');
