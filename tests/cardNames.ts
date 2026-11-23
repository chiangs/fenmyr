// In every theme a card's accessible name says what it is and, when it has a colour, the colour's name, so a person who
// can't see the colour gets the cue that Clear and Lantern print on the card. The name is the same in every theme: the
// label is drawn only in some, the name is not.
import assert from 'node:assert';
import { THEMES } from '../src/web/settings/themes.ts';
import { launch } from './support/launch.ts';

const card = (id: string, type: string, x: number, more: Record<string, unknown>) => ({
  id,
  type,
  x,
  y: 100,
  w: 200,
  h: 120,
  r: 0,
  ...more,
});
const NAMES: [id: string, name: string][] = [
  ['butter', 'Note, Cloudberry'],
  ['mint', 'Note, Moss'],
  ['sky', 'Checklist, Fjord'],
  ['plain', 'Note'],
];
const cards = [
  card('butter', 'note', 0, { color: 'butter', text: 'hello' }),
  card('mint', 'note', 260, { color: 'mint', text: 'there' }),
  card('sky', 'todo', 520, { color: 'sky', items: [{ t: 'one', done: false }] }),
  card('plain', 'note', 780, { text: 'no colour' }),
];
const app = await launch({ boards: [{ id: 'b', name: 'B', cards, links: [], tray: [] }], open: 'b' });
const { page } = app;

const apply = (classes: string[], dark: boolean) =>
  page.evaluate(
    ([cls, isDark]) => {
      document.body.classList.toggle('dark', isDark);
      for (const c of [...document.body.classList].filter(x => x.startsWith('theme-')))
        document.body.classList.remove(c);
      for (const c of cls) document.body.classList.add(c);
    },
    [classes, dark] as const,
  );
const nameOf = async (id: string) => {
  const tree = await page.locator(`#cards [data-id="${id}"]`).ariaSnapshot();
  return /^- group "([^"]*)"/.exec(tree)?.[1];
};

for (const t of THEMES) {
  const name = t.id.replace(/-(light|dark)$/, '');
  await apply(name === 'default' ? [] : [`theme-${name}`], t.mode === 'dark');
  for (const [id, expected] of NAMES) assert.strictEqual(await nameOf(id), expected, `${t.id}: the ${id} card's name`);
}
await app.close();
console.log('CARD NAMES OK');
