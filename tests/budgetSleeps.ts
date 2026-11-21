import assert from 'node:assert';
import ts from 'typescript';
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

console.log('budgetSleeps: ok');
