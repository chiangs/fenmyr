// Quick capture in the real app: Enter saves to Unsorted, Shift+Enter puts the idea on the board to write out first,
// and it goes to Unsorted when the writing is done, unless it's empty, a link, connected, or kept on the board.
import assert from 'node:assert';
import { launch } from './support/launch.ts';

// the launcher waits for a card, so the board has one, well away from the middle of the view
const far = { id: 'far', type: 'title', x: 4000, y: 4000, w: 200, h: 60, r: 0, text: 'Far away' };
const l = await launch({ boards: [{ id: 'b1', name: 'Capture', cards: [far], links: [], tray: [] }], open: 'b1' });
const { page } = l;

const where = () =>
  page.evaluate(() => {
    const b = window.__fenmyr.curBoard();
    return {
      board: b.cards.filter(c => c.type === 'note').map(c => c.text),
      tray: b.tray.map(c => (c.type === 'note' ? c.text : c.type)),
      editing: !!document.querySelector('.card.editing'),
    };
  });
const capture = async (text: string, key: string) => {
  await page.keyboard.press('Control+k');
  await page.locator('#capInput').fill(text);
  await page.keyboard.press(key);
  await page.waitForTimeout(150);
};
const finishEditing = async () => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
};

await capture('plain idea', 'Enter');
assert.deepStrictEqual(await where(), { board: [], tray: ['plain idea'], editing: false }, 'Enter saves to Unsorted');

await capture('longer idea', 'Shift+Enter');
assert.deepStrictEqual(
  await where(),
  { board: ['longer idea'], tray: ['plain idea'], editing: true },
  'Shift+Enter puts it on the board, open for editing',
);
await page.keyboard.type(' with more words');
await finishEditing();
assert.deepStrictEqual(
  await where(),
  { board: [], tray: ['longer idea with more words', 'plain idea'], editing: false },
  'finishing the edit moves it to the top of Unsorted, with what was added',
);
assert.ok(!(await page.locator('#tray').getAttribute('class'))?.includes('closed'), 'Unsorted opens');

await page.getByRole('button', { name: 'Keep on board' }).click();
await page.waitForTimeout(150);
assert.deepStrictEqual(
  (await where()).board,
  ['longer idea with more words'],
  'Keep on board puts it back on the board',
);
await page.evaluate(() => {
  const b = window.__fenmyr.curBoard();
  b.cards = b.cards.filter(c => c.type !== 'note');
  window.__fenmyr.renderAll();
});

await capture('gone', 'Shift+Enter');
await page.keyboard.press('Control+a');
await page.keyboard.press('Backspace');
await finishEditing();
assert.deepStrictEqual((await where()).board, [], 'an emptied note is dropped');
assert.deepStrictEqual((await where()).tray, ['plain idea'], 'and nothing goes to Unsorted');

await capture('https://example.com', 'Shift+Enter');
const after = await where();
assert.strictEqual(after.board.length, 0, 'a link has nothing to write, so it skips the board');
assert.strictEqual(after.tray[0], 'link', 'and goes straight to Unsorted');

await capture('', 'Shift+Enter');
assert.strictEqual((await where()).board.length, 0, 'an empty box does nothing');

await capture('tied', 'Shift+Enter');
await page.evaluate(() => {
  const b = window.__fenmyr.curBoard(),
    note = b.cards.find(c => c.type === 'note');
  if (note) b.links.push({ id: 'l1', a: note.id, b: 'far' });
});
await finishEditing();
assert.deepStrictEqual((await where()).board, ['tied'], 'a note connected while it was written stays on the board');
await page.evaluate(() => {
  const b = window.__fenmyr.curBoard();
  b.cards = b.cards.filter(c => c.type !== 'note');
  b.links = [];
  window.__fenmyr.renderAll();
});

await capture('to undo', 'Shift+Enter');
await finishEditing();
await page.waitForTimeout(500);
await page.keyboard.press('Control+z');
await page.waitForTimeout(300);
assert.deepStrictEqual(
  { board: (await where()).board, tray: (await where()).tray.includes('to undo') },
  { board: ['to undo'], tray: false },
  'undo after the move puts the note back on the board',
);

assert.deepStrictEqual(l.errors, [], 'no page errors');
await l.close();
console.log('CAPTURE OK');
