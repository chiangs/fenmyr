// Find matches the words a card shows, including its label (the pill on its edge, which a picture draws as its caption)
// and a colour's name, and says so in the bar: what it counts, which card it is on and what it dims. A rich note is matched
// by the words it draws and not by the marks it is stored with. Escape leaves the card it was on selected, and a card in
// Unsorted that matches is counted.
import assert from 'node:assert';
import { launch } from './support/launch.ts';
import { still } from './support/settled.ts';

const card = { r: 0, w: 220, h: 140, y: 100 };
const noteA = { id: 'a', type: 'note', x: 100, ...card, text: 'alpha', tagText: '123' };
const noteB = { id: 'b', type: 'note', x: 400, ...card, text: 'beta', tagText: '456' };
const ochre = { id: 'sw', type: 'swatch', x: 700, ...card, w: 120, h: 150, hex: '#cc7722', label: 'Ochre' };
// notes in the dialect, stored with their marks, and a plain one whose stars are only stars
const rich = (id: string, x: number, text: string) => ({ id, type: 'note', x, ...card, y: 320, rich: true, text });
const marked = rich('r1', 100, 'fen**myr**');
const escaped = rich('r2', 400, 'a\\*b');
const underlined = rich('r3', 700, '<u>zqunder</u>');
const linked = rich('r4', 1000, '[zqlabel](https://zqsite.example)');
const stars = { id: 'p1', type: 'note', x: 1000, ...card, text: '**zqplain**' };
const board = {
  id: 'b1',
  name: 'B',
  cards: [noteA, noteB, ochre, marked, escaped, underlined, linked, stars],
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
  // filled, not typed: with every transition late, the chat's field is not yet where it can take the focus the page gave it
  await page.fill('#mcInput', `/find ${q}`);
  await page.press('#mcInput', 'Enter');
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

// a rich note is searched as the words it draws: a mark inside a word doesn't split it, and a mark itself isn't a word
const byWord = await search('fenmyr');
assert.strictEqual(byWord.count, '1 of 1', 'a word with a mark inside it is found');
assert.deepStrictEqual(byWord.cur, ['r1'], 'on its note');
await leave();
// and after the note is edited, it is the new words
await page.evaluate(() => {
  const note = window.__fenmyr.curBoard()?.cards.find(c => c.id === 'r1');
  if (note) note.text = 'zq**edit**';
});
const stale = await search('fenmyr');
assert.strictEqual(stale.count, 'No matches', 'the words a note had before it was edited are not found');
await leave();
const edited = await search('zqedit');
assert.deepStrictEqual([edited.count, edited.cur], ['1 of 1', ['r1']], 'the words it has now are');
await leave();
const byStar = await search('a*b');
assert.deepStrictEqual([byStar.count, byStar.cur], ['1 of 1', ['r2']], 'a star the note escaped is found as a star');
await leave();
const byUnder = await search('zqunder');
assert.deepStrictEqual([byUnder.count, byUnder.cur], ['1 of 1', ['r3']], 'an underlined word is found');
await leave();
const byTag = await search('<u>');
assert.strictEqual(byTag.count, 'No matches', 'the mark that underlines it is not');
await leave();
const byLabelWord = await search('zqlabel');
assert.deepStrictEqual([byLabelWord.count, byLabelWord.cur], ['1 of 1', ['r4']], 'a link is found by its label');
await leave();
const bySite = await search('zqsite');
assert.deepStrictEqual([bySite.count, bySite.cur], ['1 of 1', ['r4']], 'and by its address, which copying keeps too');
await leave();
const byLiteral = await search('**');
assert.deepStrictEqual(
  [byLiteral.count, byLiteral.cur],
  ['1 of 1', ['p1']],
  'stars in a plain note are its words, and the stars a rich note is marked with are not',
);
await leave();

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
