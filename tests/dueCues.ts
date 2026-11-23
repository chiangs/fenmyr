// The red of an overdue chip is never the only cue: it has its own icon and says "Overdue". A chip that turns overdue while
// the board is open gets both, and a chip that isn't overdue keeps the clock and no word.
import assert from 'node:assert';
import { launch } from './support/launch.ts';

const two = (n: number) => String(n).padStart(2, '0');
const local = (ms: number) => {
  const t = new Date(Date.now() + ms);
  return `${t.getFullYear()}-${two(t.getMonth() + 1)}-${two(t.getDate())}T${two(t.getHours())}:${two(t.getMinutes())}`;
};
const MINUTE = 6e4;
const note = (id: string, x: number, due: string) => ({
  id,
  type: 'note',
  x,
  y: 100,
  w: 200,
  h: 120,
  r: 0,
  color: 'white',
  text: id,
  due,
});
const cards = [
  note('later', 0, local(2 * 864e5)),
  note('soon', 260, local(30 * MINUTE)),
  note('over', 520, local(-864e5)),
];
const l = await launch({ boards: [{ id: 'b', name: 'B', cards, links: [], tray: [] }], open: 'b', clock: true });
const { page } = l;

const chip = (id: string) =>
  page.evaluate(id => {
    const el = document.querySelector(`#cards [data-id="${id}"] .due`);
    return el
      ? {
          cls: el.className.trim(),
          icon: el.querySelector('svg')?.getAttribute('data-ico') ?? '',
          text: (el.textContent ?? '').trim(),
        }
      : null;
  }, id);

const over = await chip('over');
assert.strictEqual(over?.cls, 'due over', 'the overdue note has an overdue chip');
assert.strictEqual(over?.icon, 'warning', 'which has its own icon');
assert(over?.text.startsWith('Overdue ·'), `and says so (${over?.text})`);

for (const id of ['later', 'soon']) {
  const c = await chip(id);
  assert.strictEqual(c?.icon, 'clock', `${id}: a chip that isn't overdue keeps the clock`);
  assert(!c?.text.includes('Overdue'), `${id}: and says nothing of being overdue (${c?.text})`);
}
assert.strictEqual((await chip('soon'))?.cls, 'due soon', 'a note due within a day is soon');

await page.clock.fastForward(31 * MINUTE);
await page.waitForFunction(() => document.querySelector('#cards [data-id="soon"] .due')?.classList.contains('over'));
const turned = await chip('soon');
assert.strictEqual(turned?.icon, 'warning', 'a chip that turns overdue gets the icon');
assert(turned?.text.startsWith('Overdue ·'), `and the word (${turned?.text})`);
assert.strictEqual((await chip('later'))?.icon, 'clock', 'while a later note is untouched');

await l.close();
console.log('DUE CUES OK');
