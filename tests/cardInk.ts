// The words on a card read on its fill in every theme: a Snow note is light in Lantern and dark in Default dark, so its text
// can't be one colour for "dark mode". Every colour of note, and a doc (whose frame is Snow in dark), is measured in the app.
import assert from 'node:assert';
import { TEXT } from '../src/web/settings/derive.ts';
import { cardVars, THEMES } from '../src/web/settings/themes.ts';
import { contrast } from '../src/web/ui/color.ts';
import { launch } from './support/launch.ts';

const KEYS = ['white', 'pink', 'butter', 'mint', 'lilac', 'sky', 'peach'],
  cards = KEYS.map((color, i) => ({
    id: `n${i}`,
    type: 'note',
    x: i * 220,
    y: 0,
    w: 200,
    h: 100,
    r: 0,
    color,
    text: 'x',
  })),
  doc = { id: 'd', type: 'doc', x: 0, y: 200, w: 200, h: 100, r: 0, text: 'x' },
  app = await launch({ boards: [{ id: 'b', name: 'B', cards: [...cards, doc], links: [], tray: [] }], open: 'b' });

const hex = (rgb: string) => {
  const m = rgb.match(/[\d.]+/g)?.map(Number) ?? [];
  return `#${m
    .slice(0, 3)
    .map(v => Math.round(v).toString(16).padStart(2, '0'))
    .join('')}`;
};

for (const theme of THEMES) {
  const name = theme.id.replace(/-(light|dark)$/, ''),
    vars = Object.entries(theme.tokens.cards).flatMap(([k, c]) => cardVars(k, c)),
    seen = await app.page.evaluate(
      ([dark, cls, pairs]) => {
        document.body.classList.toggle('dark', dark);
        for (const c of [...document.body.classList].filter(x => x.startsWith('theme-')))
          document.body.classList.remove(c);
        if (cls) document.body.classList.add(cls);
        for (const [n, v] of pairs) document.body.style.setProperty(n, v);
        const read = (id: string, inner: string) => {
          const card = document.querySelector(`.card[data-id="${id}"]`);
          if (!card) return null;
          const frame = card.querySelector('.frame') ?? card,
            text = card.querySelector(inner) ?? card;
          return [getComputedStyle(text).color, getComputedStyle(frame).backgroundColor];
        };
        return [...['n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6'].map(id => read(id, '.text')), read('d', '.text')];
      },
      [theme.mode === 'dark', name === 'default' ? '' : `theme-${name}`, vars] as const,
    );
  seen.forEach((pair, i) => {
    assert(pair, `${theme.id}: card ${i} is on the board`);
    const got = contrast(hex(pair[0] ?? ''), hex(pair[1] ?? ''));
    assert(
      got >= TEXT[theme.target],
      `${theme.id}: ${KEYS[i] ?? 'doc'} text is ${got.toFixed(2)}:1 on its card, under ${TEXT[theme.target]}`,
    );
  });
}
await app.close();
console.log('CARD INK OK');
