// A note with no name starts typing in its words when double-clicked. Selecting it must not push the words down, or the
// second click lands on the empty name line instead. The "Name" line shows once the note is being typed in.
import assert from 'node:assert';
import type { Page } from 'playwright';
import { launch } from './support/launch.ts';

const note = (id: string, x: number) => ({
  id,
  type: 'note',
  x,
  y: 0,
  w: 260,
  h: 150,
  r: 0,
  color: 'butter',
  text: 'Hello',
});
const app = await launch({
  boards: [
    {
      id: 'b',
      name: 'B',
      cards: [note('n', 0), note('m', 320), note('k', 640)],
      links: [],
      tray: [],
      view: { x: 160, y: 140, z: 1 },
    },
  ],
  open: 'b',
});
const { page } = app;

const nameShown = (p: Page, id: string) =>
  p.evaluate(id => {
    const name = document.querySelector(`#cards [data-id="${id}"] .nname`);
    return !!name && getComputedStyle(name).display !== 'none';
  }, id);
const focus = (p: Page) =>
  p.evaluate(() => {
    const e = document.activeElement;
    return e?.matches('.nname') ? 'name' : e?.matches('.body > .text') ? 'words' : 'elsewhere';
  });

await page.locator('#cards [data-id="m"] .text').click();
await page.waitForFunction(() => document.querySelector('#cards [data-id="m"].sel'));
assert.strictEqual(await nameShown(page, 'm'), false, 'a selected note with no name shows no empty name line');

await page.locator('#cards [data-id="n"] .text').dblclick();
await page.waitForFunction(() => window.__fenmyr.editing === 'n');
assert.strictEqual(await focus(page), 'words', 'a double-click on the words of a nameless note types in the words');
assert.strictEqual(await nameShown(page, 'n'), true, 'the name line shows once the note is being typed in');

await page.keyboard.type('!');
const stored = await page.evaluate(() => {
  const c = window.__fenmyr.board.cards.find(x => x.id === 'n');
  return { text: c?.text, name: c?.name ?? '' };
});
assert.strictEqual(stored.name, '', 'nothing was typed into the name');
assert.ok(stored.text?.endsWith('!'), 'what was typed went on the end of the words');

// a click followed at once by a double-click: the name line the typing opens sits under the pointer for the last click
const quick = page.locator('#cards [data-id="k"] .text');
await quick.click();
await quick.dblclick();
await page.waitForFunction(() => window.__fenmyr.editing === 'k');
assert.strictEqual(await focus(page), 'words', 'a click followed at once by a double-click types in the words');

// a quick click and double-click is three presses; the name line that appears after the second must not take the third
const words = await page.locator('#cards [data-id="m"] .text').boundingBox();
assert.ok(words, 'the words have a box');
await page.mouse.move(words.x + words.width / 2, words.y + words.height / 2);
for (const clickCount of [1, 2, 3]) {
  await page.mouse.down({ clickCount });
  await page.mouse.up({ clickCount });
}
await page.waitForFunction(() => window.__fenmyr.editing === 'm');
assert.strictEqual(await focus(page), 'words', 'three quick presses keep the typing in the words');

// sleeps on purpose: the clicks that started the typing are over once the 420 ms double-tap window in canvas/release.ts has passed
await page.waitForFunction(until => Date.now() > until, Date.now() + 600);
await page.locator('#cards [data-id="m"] .nname').dblclick();
await page.waitForFunction(() => document.activeElement?.matches('#cards [data-id="m"] .nname'));
assert.strictEqual(await focus(page), 'name', 'a double-click on the name line types in the name');

await app.close();
console.log('NOTE NAMELESS START OK');
