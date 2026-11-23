// A page that is not the app's own, sent into the window, still gets the preload and so can post to the bridge. The host
// drops what it posts, says so in one log line, and runs nothing.
import assert from 'node:assert';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, ROOT } from './support/launch.ts';

const l = await launch();
const { app, page } = l;
await app.evaluate(() => {
  const lines: string[] = [];
  Reflect.set(globalThis, 'droppedLines', lines);
  console.warn = (...a: unknown[]) => {
    lines.push(a.join(' '));
  };
});

const home = page.url();
const elsewhere = pathToFileURL(path.join(ROOT, 'web', 'fonts.css')).href;
await page.goto(elsewhere);
assert.strictEqual(await page.evaluate(() => typeof window.fenmyrHost?.post), 'function', 'the preload runs there');
await page.evaluate(() =>
  window.fenmyrHost?.post({ id: 1, op: 'save', args: { board: { id: 'planted', name: 'Planted', cards: [] } } }),
);

// the answer to a later message from the app's own page comes after the host has dealt with the earlier one
await page.goto(home);
await page.waitForFunction(() => window.__fenmyr?.curBoard());
const boards = await page.evaluate(async () => (await Fenmyr.list()).map(b => b.id));
assert(!boards.includes('planted'), 'the operation did not run');
const lines = await app.evaluate(() => Reflect.get(globalThis, 'droppedLines'));
assert.strictEqual(Array.isArray(lines) ? lines.length : -1, 1, 'one log line');
const [line] = Array.isArray(lines) ? lines : [];
assert(
  typeof line === 'string' && line.includes(elsewhere) && line.includes('"save"'),
  `the line names the page and the op: ${line}`,
);
assert.deepStrictEqual(l.errors, []);
await l.close();
console.log('BRIDGE SENDER OK');
