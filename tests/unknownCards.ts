// A card this build can't read is kept. One of a type it doesn't know, and one that fails the shape check, open as
// placeholders that can be moved, copied, undone and taken to another board, and a save writes each back as the file had it,
// apart from where it is and how big. Myra is not told of them, and find does not match their words.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { askStandIn } from './support/askStandIn.ts';
import { launch } from './support/launch.ts';
import { still } from './support/settled.ts';

const at = { r: 0 };
const note = { id: 'n1', type: 'note', x: 100, y: 100, w: 220, h: 120, ...at, text: 'a note we can read' };
// a type this build has never heard of, with fields of its own, some nested
const zorblax = {
  id: 'u1',
  type: 'zorblax',
  x: 500,
  y: 100,
  w: 200,
  h: 120,
  ...at,
  text: 'glitter words',
  glitter: { colours: ['a', 'b'], n: 3 },
};
// a type it knows, but a collection whose cards aren't ids
const broken = { id: 'u2', type: 'coll', x: 100, y: 300, w: 288, h: 200, ...at, kids: [1, 2], text: 'broken coll' };
const trayCard = { id: 'u3', type: 'qxvtray', x: 0, y: 0, w: 100, h: 60, data: [1, 2, 3] };
const board = {
  id: 'b',
  name: 'B',
  cards: [note, zorblax, broken],
  links: [{ id: 'l1', a: 'n1', b: 'u1' }],
  tray: [trayCard],
  view: { x: 300, y: 200, z: 1 },
};
const other = { id: 'b2', name: 'Other', cards: [], links: [], tray: [], view: { x: 300, y: 200, z: 1 } };

const l = await launch({ boards: [board, other], open: 'b', claude: true });
const { page } = l;
const fileOf = (id: string) => path.join(l.data, 'fenmyr', 'boards', `${id}.json`);
const read = (id: string): { cards: Record<string, unknown>[]; tray: Record<string, unknown>[] } =>
  JSON.parse(fs.readFileSync(fileOf(id), 'utf8'));
const without = (c: Record<string, unknown> | undefined, ...keys: string[]) =>
  Object.fromEntries(Object.entries(c ?? {}).filter(([k]) => !keys.includes(k)));
const saved = async () => {
  await page.waitForFunction(() => document.getElementById('saved')?.textContent === 'saved');
  await still(page);
};

// they open as placeholders, and the board around them is as it was
assert.strictEqual(await page.locator('#cards .card.unknown').count(), 2, 'two placeholders are drawn');
assert.strictEqual(await page.locator('#cards .card.note').count(), 1, 'and the note');
const text = await page.locator('#cards [data-id="u1"]').innerText();
assert(/newer Fenmyr/i.test(text) && text.includes('zorblax'), `a placeholder says what it is (${text})`);
assert.deepStrictEqual(
  await page.evaluate(() => window.__fenmyr.curBoard()?.tray.map(c => c.type)),
  ['unknown'],
  'a card in Unsorted is kept too',
);

// it can't be edited: a double click puts no cursor in it, and selecting it breaks nothing
await page.locator('#cards [data-id="u1"]').dblclick();
assert.strictEqual(
  await page.evaluate(() => document.querySelector('#cards [data-id="u1"] [contenteditable="true"]') !== null),
  false,
  'a double click does not open it for editing',
);
await page.keyboard.press('Escape');

// an edit: move the placeholder with the mouse, and the file keeps it
const box = await page.locator('#cards [data-id="u1"]').boundingBox();
assert(box, 'the placeholder is on screen');
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 50, { steps: 8 });
await page.mouse.up();
await saved();
const afterMove = read('b');
const moved = afterMove.cards.find(c => c.id === 'u1');
assert(moved && Number(moved.x) > zorblax.x, 'the move was saved');
assert.deepStrictEqual(
  without(moved, 'x', 'y'),
  without(zorblax, 'x', 'y'),
  'the card is as the file had it, but for where it is',
);
assert.deepStrictEqual(
  afterMove.cards.find(c => c.id === 'u2'),
  broken,
  'the card that failed the shape check is as it was',
);
assert.deepStrictEqual(
  afterMove.tray.find(c => c.id === 'u3'),
  trayCard,
  'so is the one in Unsorted',
);
assert(
  afterMove.cards.some(c => c.id === 'n1'),
  'and the note stays',
);

// undo puts it back, still holding everything
await page.keyboard.press('Control+z');
await saved();
const undone = read('b').cards.find(c => c.id === 'u1');
assert.deepStrictEqual(undone, zorblax, 'undo brings it back as it was');

// copy and paste make another that holds the same, with an id of its own
await page.evaluate(() => window.__fenmyr.selectOnly(['u1']));
await page.keyboard.press('Control+c');
await page.keyboard.press('Control+v');
await saved();
const pasted = read('b').cards.filter(c => c.type === 'zorblax');
assert.strictEqual(pasted.length, 2, 'a pasted copy is a second card');
const copy = pasted.find(c => c.id !== 'u1');
assert.deepStrictEqual(
  without(copy, 'id', 'x', 'y'),
  without(zorblax, 'id', 'x', 'y'),
  'and it holds what the first does',
);

// taken to another board, it arrives intact
await page.evaluate(() => window.__fenmyr.selectOnly(['u1']));
await page.keyboard.press('Control+x');
await page.evaluate(() => window.__fenmyr.openBoard('b2'));
await still(page);
await page.keyboard.press('Control+v');
await saved();
const there = read('b2').cards;
assert.strictEqual(there.length, 1, 'the other board has the card');
assert.deepStrictEqual(without(there[0], 'id', 'x', 'y'), without(zorblax, 'id', 'x', 'y'), 'with all it held');
await page.evaluate(() => window.__fenmyr.openBoard('b'));
await still(page);

// Myra is told of the note and of nothing she can't read
await page.click('#mPill');
await still(page);
const { sentFor, send } = askStandIn(l);
await send('what is on this board?');
const prompt = (await sentFor('what is on this board?')).prompt;
assert(prompt.includes('a note we can read'), 'Myra sees the note');
for (const hidden of ['zorblax', 'glitter', 'broken coll', 'qxvtray'])
  assert(!prompt.includes(hidden), `and not the card of ${hidden}: ${prompt.indexOf(hidden)}`);

// find matches the note's words and not a placeholder's (Ctrl+F asks in the chat, and its answer is the find bar)
await page.keyboard.press('Control+f');
await page.waitForFunction(() => document.getElementById('mChat')?.checkVisibility({ visibilityProperty: true }));
await still(page);
await page.keyboard.type('note');
await page.keyboard.press('Enter');
await page.waitForFunction(() => document.getElementById('findBar')?.checkVisibility());
await still(page);
const hit = (await page.locator('#fbCount').textContent()) ?? '';
assert(/1/.test(hit), `find matches the note's words (${hit})`);
await page.fill('#fbQ', 'glitter');
await page.waitForFunction(was => document.getElementById('fbCount')?.textContent !== was, hit);
const miss = (await page.locator('#fbCount').textContent()) ?? '';
assert(!/[1-9]/.test(miss), `and not a placeholder's (${miss})`);

assert.deepStrictEqual(l.errors, [], 'no page errors');
await l.close();
console.log('UNKNOWN CARDS OK');
