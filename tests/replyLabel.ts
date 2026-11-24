// "label" in Myra's reply is a colour's name, so it renames a colour and lands on no other card, whether she adds the card
// or edits one. A note's own label, the pill on its edge, is her "tag", and that still reaches it.
import assert from 'node:assert';
import { launch } from './support/launch.ts';
import { replyChat } from './support/replyChat.ts';

const card = { r: 0, y: 100, w: 220, h: 140 };
const note = { id: 'n', type: 'note', x: 100, ...card, text: 'alpha', tagText: 'old pill' };
const swatch = { id: 'sw', type: 'swatch', x: 400, ...card, w: 120, h: 150, hex: '#cc7722', label: 'Ochre' };
const board = { id: 'b1', name: 'B', cards: [note, swatch], links: [], tray: [], view: { x: 300, y: 200, z: 1 } };

const l = await launch({ boards: [board], open: 'b1', claude: true });
const { page } = l;
const { answer, ask } = replyChat(page);

type Seen = { id: string; type: string; text?: string; hex?: string; label?: string; hasLabel: boolean; pill?: string };
const cards = () =>
  page.evaluate(() =>
    window.__fenmyr.curBoard().cards.map(c => ({
      id: c.id,
      type: c.type,
      text: c.text,
      hex: c.type === 'swatch' ? c.hex : undefined,
      label: c.type === 'swatch' ? c.label : undefined,
      hasLabel: Object.hasOwn(c, 'label'),
      pill: c.tagText,
    })),
  );
const byId = (all: Seen[], id: string) => {
  const found = all.find(c => c.id === id);
  assert(found, `${id} is on the board`);
  return found;
};

await answer({
  say: 'Done.',
  edit: [
    { id: 'n', label: 'Moss', tag: 'new pill' },
    { id: 'sw', label: 'Moss' },
  ],
});
await ask('rename');
const edited = await cards();
assert.strictEqual(byId(edited, 'sw').label, 'Moss', 'an edit with a label renames a colour');
assert.strictEqual(byId(edited, 'n').hasLabel, false, 'an edit with a label gives a note none');
assert.strictEqual(byId(edited, 'n').pill, 'new pill', 'a note’s own label is still her tag');

await answer({
  say: 'Added.',
  add: [
    { type: 'swatch', hex: '#336699', label: 'Fjord' },
    { type: 'note', text: 'a new note', label: 'Fjord' },
  ],
});
await ask('add');
const added = (await cards()).filter(c => c.id !== 'n' && c.id !== 'sw');
const fjord = added.find(c => c.type === 'swatch'),
  fresh = added.find(c => c.type === 'note');
assert.strictEqual(fjord?.label, 'Fjord', 'a colour she adds takes the label as its name');
assert(fresh, 'the note she added is on the board');
assert.strictEqual(fresh.hasLabel, false, 'a note she adds with a label has none');

await l.close();
console.log('REPLY LABEL OK');
