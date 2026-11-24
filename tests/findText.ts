// Find matches the words a card shows, including its label (the pill on its edge, which a picture draws as its caption)
// and a colour's name, and says so in the bar: what it counts, which card it is on and what it dims. Escape leaves the
// card it was on selected, and a card in Unsorted that matches is counted.
import assert from 'node:assert';
import { launch } from './support/launch.ts';
import { still } from './support/settled.ts';

const card = { r: 0, w: 220, h: 140, y: 100 };
const noteA = { id: 'a', type: 'note', x: 100, ...card, text: 'alpha', tagText: '123' };
const noteB = { id: 'b', type: 'note', x: 400, ...card, text: 'beta', tagText: '456' };
const ochre = { id: 'sw', type: 'swatch', x: 700, ...card, w: 120, h: 150, hex: '#cc7722', label: 'Ochre' };
const board = {
  id: 'b1',
  name: 'B',
  cards: [noteA, noteB, ochre],
  links: [],
  tray: [],
  view: { x: 300, y: 200, z: 1 },
};

const l = await launch({ boards: [board], open: 'b1' });
const { page } = l;

// Ctrl+F asks in Myra's chat, and sending it puts up the bar with the answer already in it
async function search(q: string) {
  await page.keyboard.press('Control+f');
  await page.waitForFunction(() => document.getElementById('mChat')?.checkVisibility({ visibilityProperty: true }));
  await still(page);
  await page.keyboard.type(q);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.getElementById('findBar')?.checkVisibility());
  await still(page);
  return page.evaluate(() => {
    const ids = (sel: string) =>
      [...document.querySelectorAll(sel)].flatMap(e => (e instanceof HTMLElement && e.dataset.id ? e.dataset.id : []));
    return {
      count: document.getElementById('fbCount')?.textContent ?? '',
      lit: ids('#cards .card:not(.dim)'),
      cur: ids('#cards .card.find-cur'),
    };
  });
}
async function leave() {
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('findBar')?.checkVisibility());
  await still(page);
  return page.evaluate(() =>
    [...document.querySelectorAll('#cards .card.sel')].flatMap(e =>
      e instanceof HTMLElement && e.dataset.id ? e.dataset.id : [],
    ),
  );
}

// a label alone is enough, and the card whose label is another number is left dim
const byLabel = await search('123');
assert.strictEqual(byLabel.count, '1 of 1', 'a note is found by its label');
assert.deepStrictEqual(
  [byLabel.lit, byLabel.cur],
  [['a'], ['a']],
  'it is the one the bar is on, and the others are dim',
);
assert.deepStrictEqual(await leave(), ['a'], 'and Escape leaves that note selected');

// a colour is still found by its name
const byName = await search('ochre');
assert.strictEqual(byName.count, '1 of 1', 'a colour is found by its name');
assert.deepStrictEqual(byName.cur, ['sw'], 'and the bar is on it');
assert.deepStrictEqual(await leave(), ['sw'], 'Escape leaves the colour selected');

// a label that is nowhere on the board finds nothing
const none = await search('789');
assert.strictEqual(none.count, 'No matches', 'a label that is not on the board is not found');
assert.deepStrictEqual(none.cur, [], 'and the bar is on no card');
await leave();

// Unsorted is searched by label too, and counted after the cards on the board
await page.evaluate(() => {
  const spare = {
    id: 't1',
    type: 'note' as const,
    x: 0,
    y: 0,
    w: 220,
    h: 140,
    r: 0,
    text: 'gamma',
    tagText: '123 spare',
  };
  window.__fenmyr.curBoard()?.tray.push(spare);
});
const tray = await search('123');
assert.strictEqual(tray.count, '1 of 1 · +1 in Unsorted', 'a labelled card in Unsorted is counted');
await leave();

assert.deepStrictEqual(l.errors, [], 'no page errors');
await l.close();
console.log('FIND TEXT OK');
