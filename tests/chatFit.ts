// What Myra is sent of a board follows the model's window, and a reply whose board was trimmed says so. With no model
// chosen the window is 200,000 tokens and the board may take a quarter of it. Through a stand-in Claude Code that keeps
// each prompt: a board that fits goes whole, a 2,000-character note too, with no "cutToFit" and no box under her reply;
// one that fits once every long card is shortened sends them at 300 characters and says how many; one too big even then
// keeps the selected card, which sits last in the board and lowest on it, leaves out the cards ranked lowest, and tells her
// both ways. The reply's box says what was cut, Select these cards selects exactly the cards it names, and the box comes
// back with the chat after a reload. A board file with a stored box shows it; one whose box is damaged drops it alone.
import assert from 'node:assert';
import { askStandIn } from './support/askStandIn.ts';
import { launch } from './support/launch.ts';

type Note = {
  id: string;
  type: 'note';
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  color: string;
  text: string;
};
// `words` long, whatever the note number
const text = (i: number, words: number) => `Note ${i}: `.padEnd(words, 'abcdefghij');
const note = (i: number, words: number): Note => ({
  id: `n${i}`,
  type: 'note',
  x: (i % 10) * 260,
  y: Math.floor(i / 10) * 180,
  w: 220,
  h: 140,
  r: 0,
  color: 'white',
  text: text(i, words),
});
const board = (id: string, cards: Note[]) => ({ id, name: id, cards, links: [], tray: [] });

const LONG = 1_500;
// the one note of 2,000 characters among a few others
const small = [note(0, 2_000), note(1, 80), note(2, 80), note(3, 80)];
// 120 notes of 1,500 characters: whole the board is about 196,000 characters and the room 125,000, cut at 300 about 52,000
const medium = Array.from({ length: 120 }, (_, i) => note(i, LONG));
// 600 notes at the 300-character cut, every sixtieth 1,500 long: cut, the board is still about 237,000 characters
const huge = Array.from({ length: 600 }, (_, i) => note(i, i % 60 === 7 ? LONG : 300));

const use = {
  window: 200_000,
  parts: [{ kind: 'board', tokens: 1_000, count: 3 }],
  left: ['k2', 'k3'],
  pictures: [],
  shortened: ['k1'],
  unseen: [],
  tooBig: [],
};
const kept = {
  ...board(
    'kept',
    ['k1', 'k2', 'k3'].map(id => ({ ...note(0, 40), id })),
  ),
  chat: [
    { who: 'myra', text: 'Here it is.', t: 1, acts: [{ kind: 'context', use }] },
    { who: 'myra', text: 'And this one.', t: 2, acts: [{ kind: 'context', use: { window: 'big' } }] },
  ],
};

const l = await launch({
  boards: [board('small', small), board('medium', medium), board('huge', huge), kept],
  open: 'small',
  claude: true,
});
const { page } = l;
const { sentFor } = askStandIn(l);

type Sent = {
  cards: { id: string; text: string; selected?: true }[];
  unsorted: unknown[];
  cutToFit?: { left: number; shortened: number };
};
// the board JSON is the one line of the prompt that starts with its first key
async function sentBoard(q: string) {
  const { prompt } = await sentFor(q);
  const line = prompt.split('\n').find(s => s.startsWith('{"today"'));
  assert(line, 'the prompt holds the board');
  const parsed: Sent = JSON.parse(line);
  return { prompt, ...parsed };
}
const ask = (q: string) =>
  page.evaluate(async q => {
    await window.__fenmyr.ask(q);
  }, q);
const open = (id: string) =>
  page.evaluate(async id => {
    await window.__fenmyr.openBoard(id);
  }, id);

type Shown = { head: string; lines: string[]; marks: string[] };
const boxes = (): Promise<Shown[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll('#mcList .m-summary.context')].map(b => ({
      head: b.querySelector('b')?.textContent ?? '',
      lines: [...b.querySelectorAll('li')].map(li => li.textContent ?? ''),
      marks: [...b.querySelectorAll<HTMLElement>('li')].map(li => li.dataset.mark ?? ''),
    })),
  );
const pressSelect = () => page.locator('#mcList button', { hasText: 'Select these cards' }).last().click();
const selected = () => page.evaluate(() => window.__fenmyr.sel.toSorted());
const buttons = () => page.locator('#mcList button', { hasText: 'Select these cards' }).count();
const HEAD = 'Not all of the board fitted';
const TOLD = 'If the board JSON has "cutToFit"';

await page.click('#mPill');
await page.waitForFunction(() => document.getElementById('mChat')?.checkVisibility({ visibilityProperty: true }));

// a board that fits goes whole, with nothing said under her reply
await ask('whole');
const whole = await sentBoard('whole');
assert.strictEqual(whole.cards.find(c => c.id === 'n0')?.text.length, 2_000, 'the 2,000-character note went whole');
assert.strictEqual(whole.cutToFit, undefined, 'and nothing says it was cut');
assert.deepStrictEqual(await boxes(), [], 'her reply shows no box');
assert.strictEqual(await buttons(), 0, 'and no button');
assert(whole.prompt.includes(TOLD), 'she is told what "cutToFit" means, whether or not this board has it');

// a board that fits once its long cards are shortened: every card says how it was cut
await open('medium');
await ask('shortened');
const shortened = await sentBoard('shortened');
assert.strictEqual(shortened.cards.length, 120, 'every card was sent');
assert(
  shortened.cards.every(c => c.text.length === 300),
  'each of them cut to 300 characters',
);
assert.deepStrictEqual(shortened.cutToFit, { left: 0, shortened: 120 }, 'and she is told how many');
assert.deepStrictEqual(
  await boxes(),
  [{ head: HEAD, lines: ['120 cards were shortened to fit'], marks: ['bad'] }],
  'the reply says so, as something to look at',
);
await pressSelect();
assert.deepStrictEqual(
  await selected(),
  medium.map(c => c.id).toSorted(),
  'Select these cards selects the 120 that were shortened',
);

// stored with the reply: after a reload the box is there, and so is its button
// the board file is written a moment after the reply, so its answer is stored for the next look
await page.waitForFunction(
  () => {
    void window.Fenmyr.load('medium').then(b =>
      Reflect.set(window, 'onDisk', !!b?.chat?.some(m => m.acts?.some(a => a.kind === 'context'))),
    );
    return Reflect.get(window, 'onDisk') === true;
  },
  undefined,
  { polling: 100 },
);
await page.reload();
await page.waitForFunction(() => window.__fenmyr?.curBoard() && document.querySelector('#cards .card'));
await open('medium');
await page.click('#mPill');
await page.waitForFunction(() => document.getElementById('mChat')?.checkVisibility({ visibilityProperty: true }));
assert.deepStrictEqual(
  (await boxes()).map(b => b.lines),
  [['120 cards were shortened to fit']],
  'the box is back after a reload',
);
await page.evaluate(() => window.__fenmyr.selectOnly([]));
await pressSelect();
assert.deepStrictEqual(await selected(), medium.map(c => c.id).toSorted(), 'with its button');

// a board too big even then: the selected card, last in the board and lowest on it, still goes
await open('huge');
await page.evaluate(() => window.__fenmyr.selectOnly(['n599']));
await ask('dropped');
const dropped = await sentBoard('dropped');
const sentIds = new Set(dropped.cards.map(c => c.id));
const missing = huge.filter(c => !sentIds.has(c.id)).map(c => c.id);
assert(
  dropped.cards.some(c => c.id === 'n599' && c.selected && c.text.length === 300),
  'the selected card was sent, marked selected',
);
assert(missing.length > 0 && missing.length < 600, `some cards were left out and some sent: ${missing.length} left`);
const cut = dropped.cards.filter(c => c.text.length === 300 && huge.some(h => h.id === c.id && h.text.length > 300));
assert(cut.length >= 2, `a few of the long notes were sent, cut: ${cut.length}`);
assert.deepStrictEqual(
  dropped.cutToFit,
  { left: missing.length, shortened: cut.length },
  'she is told how many were left out and how many were cut',
);
assert(dropped.prompt.includes(TOLD), 'and what that means');
assert.deepStrictEqual(
  await boxes(),
  [
    {
      head: HEAD,
      lines: [`${missing.length} cards were left out to fit`, `${cut.length} cards were shortened to fit`],
      marks: ['bad', 'bad'],
    },
  ],
  'the reply says how many were left out and how many cut',
);
await pressSelect();
const named = [...missing, ...cut.map(c => c.id)].toSorted();
assert.deepStrictEqual(
  await selected(),
  named,
  'Select these cards selects the cards left out and the ones cut, which is every id the box names',
);

// a board file with a stored box shows it, and one whose box is damaged keeps its line and loses the box alone
await open('kept');
assert.deepStrictEqual(
  await page.locator('#mcList .mc-msg.myra').evaluateAll(ms => ms.map(m => m.firstChild?.textContent)),
  ['Here it is.', 'And this one.'],
  'both of her lines are there',
);
assert.deepStrictEqual(
  await boxes(),
  [{ head: HEAD, lines: ['2 cards were left out to fit', '1 card was shortened to fit'], marks: ['bad', 'bad'] }],
  'the stored box reads as it was kept, and the damaged one is gone',
);
await pressSelect();
assert.deepStrictEqual(await selected(), ['k1', 'k2', 'k3'], 'its button selects the cards it names');

assert.deepStrictEqual(l.errors, [], 'no page errors');
await l.close();
console.log('CHAT FIT OK');
