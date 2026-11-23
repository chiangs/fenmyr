// Clear and Lantern draw a 1.5 px outline in the border colour inside every card's frame, so a card's edge doesn't depend
// on its fill or shadow, and sit their cards straight: a tilted note shows no tilt, and a stamp keeps the tilt it was
// given. No other theme changes, and the outline doesn't change a card's size or where its words sit.
import assert from 'node:assert';
import { THEMES, type Theme } from '../src/web/settings/themes.ts';
import { rgbOf } from '../src/web/ui/color.ts';
import { launch } from './support/launch.ts';

const look = (t: Theme) => {
  const name = t.id.replace(/-(light|dark)$/, '');
  if (name === 'default') return { theme: t.mode };
  return t.mode === 'dark' ? { theme: 'dark', darkTheme: name } : { theme: 'light', lightTheme: name };
};
const note = { id: 'n', type: 'note', x: 0, y: 100, w: 220, h: 120, r: 6, color: 'sky', text: 'A tilted note' };
const stamp = {
  id: 's',
  type: 'stamp',
  x: 300,
  y: 100,
  w: 56,
  h: 56,
  r: 12,
  tilted: true,
  color: 'white',
  emoji: '⭐',
};
const board = { id: 'b', name: 'B', cards: [note, stamp], links: [], tray: [], view: { x: 300, y: 200, z: 1 } };

type Seen = { shadow: string; rotate: string; stampRotate: string; size: number[]; words: number[] };
const read = async (t: Theme): Promise<Seen> => {
  const app = await launch({ boards: [board], open: 'b', settings: { ...look(t), tilt: true } });
  const seen: Seen = await app.page.evaluate(() => {
    const card = document.querySelector<HTMLElement>('#cards [data-id="n"]');
    const body = card?.querySelector<HTMLElement>('.body');
    return {
      shadow: card ? getComputedStyle(card.querySelector('.frame') ?? card).boxShadow : '',
      rotate: card ? getComputedStyle(card).rotate : '',
      stampRotate: getComputedStyle(document.querySelector<HTMLElement>('#cards [data-id="s"]') ?? document.body)
        .rotate,
      size: [card?.offsetWidth ?? 0, card?.offsetHeight ?? 0],
      words: [body?.offsetLeft ?? 0, body?.offsetTop ?? 0],
    };
  });
  await app.close();
  return seen;
};

const first = THEMES.find(t => t.id === 'default-light');
assert(first, 'Default is a theme');
const plain = await read(first);
for (const t of THEMES) {
  const seen = t.id === 'default-light' ? plain : await read(t);
  const ringed = seen.shadow.includes('1.5px') && seen.shadow.includes('inset');
  assert.strictEqual(ringed, t.outline, `${t.id}: the card ${t.outline ? 'has' : 'has no'} outline (${seen.shadow})`);
  if (t.outline) {
    const [r, g, b] = rgbOf(t.tokens.border);
    assert(
      seen.shadow.includes(`rgb(${r}, ${g}, ${b})`),
      `${t.id}: the outline is the border colour ${t.tokens.border} (${seen.shadow})`,
    );
  }
  assert.strictEqual(
    seen.rotate === 'none' || seen.rotate === '0deg',
    t.straight,
    `${t.id}: a tilted note ${t.straight ? 'sits straight' : 'keeps its tilt'} (${seen.rotate})`,
  );
  assert.notStrictEqual(seen.stampRotate, 'none', `${t.id}: a stamp keeps the tilt it was given (${seen.stampRotate})`);
  assert.deepStrictEqual(seen.size, plain.size, `${t.id}: the outline doesn't change the card's size`);
  assert.deepStrictEqual(seen.words, plain.words, `${t.id}: or where its words sit`);
}
// Straight cards is an option: off, Clear shows the tilt a note was given, and a stamp is as it was
{
  const t = THEMES.find(x => x.id === 'clear-light');
  assert(t, 'Clear is a theme');
  const app = await launch({ boards: [board], open: 'b', settings: { ...look(t), tilt: true, straightCards: false } });
  const rotate = await app.page.evaluate(() => {
    const card = document.querySelector<HTMLElement>('#cards [data-id="n"]');
    return card ? getComputedStyle(card).rotate : '';
  });
  assert(rotate !== 'none' && rotate !== '0deg', `with Straight cards off a tilted note keeps its tilt (${rotate})`);
  await app.close();
}
console.log('CARD EXTRAS OK');
