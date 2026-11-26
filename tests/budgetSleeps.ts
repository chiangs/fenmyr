import assert from 'node:assert';
import ts from 'typescript';
import { findAsyncWaits } from '../tools/asyncWaits.ts';
import { findSleeps, MARKER, type SleepStyle } from '../tools/sleeps.ts';

const find = (...lines: string[]) =>
  findSleeps(ts.createSourceFile('x.ts', lines.join('\n'), ts.ScriptTarget.Latest, true));
const styles = (...lines: string[]): SleepStyle[] =>
  find(...lines)
    .sleeps.map(s => s.style)
    .sort();

assert.deepStrictEqual(styles('await page.waitForTimeout(300);', 'await l.page.waitForTimeout(ms);'), [
  'waitForTimeout',
  'waitForTimeout',
]);
assert.deepStrictEqual(styles('const T = window.__t;', 'await T.wait(400);', 'await other.wait(400);'), ['T.wait']);
assert.deepStrictEqual(styles('await new Promise(r => setTimeout(r, 700));'), ['promise']);
assert.deepStrictEqual(styles('await new Promise<void>(res => setTimeout(() => res(), 700));'), ['promise']);
assert.deepStrictEqual(styles('await new Promise(function (r) { setTimeout(r, 7); });'), ['promise']);
assert.deepStrictEqual(styles('await settle(page, 400);', 'await settle(page);', 'await r.settle(0, "ok");'), [
  'settle',
  'settle',
]);

assert.deepStrictEqual(styles('const png = await new Promise(res => setTimeout(() => res(late), 1500));'), []);
assert.deepStrictEqual(styles('new Promise(r => requestAnimationFrame(r));', 'setTimeout(() => go(), 5);'), []);

assert.deepStrictEqual(
  styles(
    'const wait = (ms: number) => new Promise(res => setTimeout(res, ms));',
    'await wait(50);',
    'await wait(800);',
  ),
  ['promise', 'promise'],
);
assert.deepStrictEqual(
  styles('function nap(ms) { return new Promise(r => setTimeout(r, ms)); }', 'await nap(1);', 'await nap(2);'),
  ['promise', 'promise'],
);
assert.deepStrictEqual(styles('const wait = (ms: number) => new Promise(res => setTimeout(res, ms));'), []);

const why = `// ${MARKER}: the debounce under test is 250 ms`;
assert.deepStrictEqual(styles(why, 'await page.waitForTimeout(300);'), []);
assert.deepStrictEqual(styles(why, 'await page.waitForTimeout(300);', 'await page.waitForTimeout(300);'), [
  'waitForTimeout',
]);
assert.deepStrictEqual(styles(why, '', 'await page.waitForTimeout(300);'), ['waitForTimeout']);
assert.deepStrictEqual(find(why, 'await page.waitForTimeout(300);').bareMarkers, []);

for (const bare of [`// ${MARKER}`, `// ${MARKER}:`, `  //${MARKER}:   `]) {
  const found = find(bare, 'await page.waitForTimeout(300);');
  assert.deepStrictEqual(found.bareMarkers, [1], `a marker with no reason: "${bare}"`);
  assert.strictEqual(found.sleeps.length, 1, `and it excuses nothing: "${bare}"`);
}

const asyncWaits = (...lines: string[]) =>
  findAsyncWaits(ts.createSourceFile('x.ts', lines.join('\n'), ts.ScriptTarget.Latest, true));
assert.deepStrictEqual(
  asyncWaits(
    'await page.waitForFunction(async () => (await read()) === 1);',
    'await l.page.waitForFunction(async function () { return true; }, undefined, { polling: 100 });',
    'await page.waitForFunction(',
    '  async id => !!(await read(id)),',
    '  pasted,',
    ');',
  ),
  [1, 2, 3],
  'an async predicate is counted at its call, however it is written',
);
assert.deepStrictEqual(
  asyncWaits(
    'await page.waitForFunction(() => window.ready);',
    'await page.waitForFunction(id => !!document.getElementById(id), pasted);',
    'await page.waitForFunction(function () { return true; });',
    'await page.evaluate(async () => await read());',
    'await page.waitForFunction(() => { void (async () => { await read(); })(); return Reflect.get(window, "ok"); }, undefined, { polling: 100 });',
  ),
  [],
  'a sync predicate is not counted, nor an async call that is not waitForFunction, nor an async function inside a sync predicate',
);

console.log('budgetSleeps: ok');
