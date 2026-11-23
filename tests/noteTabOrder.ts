// A note's parts run title, body, label from top to bottom, and Tab and Shift+Tab walk them in that order. Editing
// starts in the body, so Tab goes on to the label and Shift+Tab back to the title. A list item keeps Tab for indent.
import assert from 'node:assert';
import type { Page } from 'playwright';
import { launch } from './support/launch.ts';

const note = (id: string, x: number, y: number, more: Record<string, unknown>) => ({
  id,
  type: 'note',
  x,
  y,
  w: 260,
  h: 150,
  r: 0,
  color: 'butter',
  ...more,
});
const cards = [
  note('full', 0, 0, { name: 'Title', text: 'Body', tagText: 'Label' }),
  note('bare', 320, 0, { name: 'Title', text: 'Body' }),
  note('list', 640, 0, { name: 'Title', text: '- one\n- two', rich: true, tagText: 'Label' }),
  note('myra', 0, 260, { name: 'Myra', text: 'Hello', myra: true, tagText: 'Label' }),
];
const app = await launch({
  boards: [{ id: 'b', name: 'B', cards, links: [], tray: [], view: { x: 160, y: 140, z: 1 } }],
  open: 'b',
});
const { page } = app;

// which part of which card holds the keyboard, or "outside" when it is none of them
const where = (p: Page) =>
  p.evaluate(() => {
    const e = document.activeElement;
    const id = e?.closest('.card')?.getAttribute('data-id');
    if (!e || !id) return 'outside';
    if (e.matches('.nname')) return `${id}:title`;
    if (e.matches('.tag')) return `${id}:label`;
    return e.matches('.body > .text') ? `${id}:body` : 'outside';
  });
const stored = (p: Page, id: string) =>
  p.evaluate(id => window.__fenmyr.board.cards.find(x => x.id === id)?.tagText, id);
const words = (p: Page, id: string) => p.evaluate(id => window.__fenmyr.board.cards.find(x => x.id === id)?.text, id);
const startAtBody = async (id: string) => {
  await page.locator(`#cards [data-id="${id}"] .text`).dblclick();
  await page.waitForFunction(id => window.__fenmyr.editing === id && document.activeElement?.matches('.text'), id);
};
const stop = async () => {
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__fenmyr.editing === null);
};
const walk = async (id: string, keys: string[], expected: string[], why: string) => {
  const seen: string[] = [];
  for (const k of keys) {
    await page.keyboard.press(k);
    seen.push(await where(page));
  }
  assert.deepStrictEqual(seen, expected, `${id}: ${why}`);
};

await startAtBody('full');
assert.strictEqual(await where(page), 'full:body', 'a double-click starts in the body');
await walk(
  'full',
  ['Tab', 'Shift+Tab', 'Shift+Tab', 'Tab', 'Tab', 'Shift+Tab', 'Tab', 'Tab'],
  ['full:label', 'full:body', 'full:title', 'full:body', 'full:label', 'full:body', 'full:label', 'outside'],
  'Tab reads title, body, label from the body and leaves the card after the label',
);
await stop();

await startAtBody('full');
await page.keyboard.press('Tab');
await page.keyboard.type('Kept');
assert.strictEqual(await stored(page, 'full'), 'Kept', 'what is typed after Tab lands in the label');
await page.keyboard.press('Shift+Tab');
assert.strictEqual(await where(page), 'full:body', 'Shift+Tab from the label goes back to the body');
assert.strictEqual(await stored(page, 'full'), 'Kept', 'the label keeps what was typed');
await walk('full', ['Shift+Tab', 'Shift+Tab'], ['full:title', 'outside'], 'Shift+Tab from the title leaves the card');
await stop();

await startAtBody('bare');
await walk('bare', ['Tab'], ['outside'], 'Tab from a body with no label leaves the card');
await stop();

await startAtBody('list');
await page.evaluate(() => {
  const item = document.querySelector('#cards [data-id="list"] .text li:last-child');
  if (item) getSelection()?.setBaseAndExtent(item, 0, item, 0);
});
await walk('list', ['Tab'], ['list:body'], 'Tab in a list item keeps the keyboard in the body');
assert.strictEqual(await words(page, 'list'), '- one\n  - two', 'Tab in a list item indents it');
await stop();

await startAtBody('myra');
await walk(
  'myra',
  ['Shift+Tab', 'Tab', 'Tab'],
  ['myra:title', 'myra:body', 'myra:label'],
  'Myra notes have the same order',
);
await stop();

await app.close();
console.log('NOTE TAB ORDER OK');
