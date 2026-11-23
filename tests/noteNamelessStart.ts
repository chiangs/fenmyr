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
    { id: 'b', name: 'B', cards: [note('n', 0), note('m', 320)], links: [], tray: [], view: { x: 160, y: 140, z: 1 } },
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

await app.close();
console.log('NOTE NAMELESS START OK');
