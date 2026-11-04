// How the prototype board's columns fold as the window narrows.
import assert from 'node:assert';
import { DEFAULT_LAYOUT, fit } from '../src/web/proto/fit.ts';

assert.deepStrictEqual(fit(DEFAULT_LAYOUT, 1440), [], 'a laptop-wide window shows every column');
assert.deepStrictEqual(fit(DEFAULT_LAYOUT, 1300), ['canvas'], 'the canvas folds first');
assert.deepStrictEqual(fit(DEFAULT_LAYOUT, 900), ['canvas', 'code'], 'then the code');
assert.deepStrictEqual(fit(DEFAULT_LAYOUT, 500), ['canvas', 'code'], 'the preview never folds');
assert.deepStrictEqual(
  fit({ ...DEFAULT_LAYOUT, closed: ['code'] }, 1600),
  ['code'],
  'what the person folds stays folded',
);
console.log('FIT OK');
