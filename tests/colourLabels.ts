// Clear and Lantern print each note's colour name in its corner; no other theme does. The label sits out of the flow, so a
// note's size and its text's place are the same with it as without.
import assert from 'node:assert';
import { THEMES } from '../src/web/settings/themes.ts';
import { launch } from './support/launch.ts';

const note = { id: 'n', type: 'note', x: 100, y: 100, w: 220, h: 120, r: 0, color: 'butter', text: 'hello' },
  app = await launch({ boards: [{ id: 'b', name: 'B', cards: [note], links: [], tray: [] }], open: 'b' });

const measure = (classes: string[], dark: boolean) =>
  app.page.evaluate(
    ([cls, isDark]) => {
      document.body.classList.toggle('dark', isDark);
      for (const c of [...document.body.classList].filter(x => x.startsWith('theme-')))
        document.body.classList.remove(c);
      for (const c of cls) document.body.classList.add(c);
      const card = document.querySelector('.card.note'),
        after = card ? getComputedStyle(card.querySelector('.frame') ?? card, '::after') : null,
        own = card ? getComputedStyle(card) : null;
      return {
        // the note's own size, not the box it has on screen: the board's opening fit is a half-second transition on the
        // whole board, and a box read near its end is a hair short of its final size (307.986 for 308)
        size: own ? [parseFloat(own.width), parseFloat(own.height)] : [],
        label: after && after.display !== 'none' ? after.content : '',
      };
    },
    [classes, dark] as const,
  );

const plain = await measure([], false);
for (const t of THEMES) {
  const name = t.id.replace(/-(light|dark)$/, ''),
    got = await measure([...(name === 'default' ? [] : [`theme-${name}`])], t.mode === 'dark');
  assert.strictEqual(
    got.label,
    t.labels ? '"Cloudberry"' : '',
    `${t.id}: the label is ${t.labels ? 'shown' : 'not shown'}`,
  );
  assert.deepStrictEqual(got.size, plain.size, `${t.id}: the label doesn't change the note's size`);
}
await app.close();
console.log('COLOUR LABELS OK');
