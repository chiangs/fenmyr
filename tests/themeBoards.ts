// A board saved in one theme opens right in every other. A card stores its colour's key, never the theme's colour, so the
// same file shows each theme's own fill. The board is saved under Clear, its file is checked for theme colours, and then it
// is opened under each theme in turn.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { THEMES, type Theme } from '../src/web/settings/themes.ts';
import { launch } from './support/launch.ts';

const first = THEMES[0];
assert(first, 'there are themes');
const KEYS = Object.keys(first.tokens.cards);
const cards = KEYS.map((color, i) => ({
  id: `n${i}`,
  type: 'note',
  x: i * 240,
  y: 100,
  w: 200,
  h: 120,
  r: 0,
  color,
  text: color,
}));
const board = { id: 'b', name: 'B', cards, links: [], tray: [] };

// the setting that chooses a theme: Default is the setting's own default, the others are named for their mode
const look = (t: Theme) => {
  const name = t.id.replace(/-(light|dark)$/, '');
  if (name === 'default') return { theme: t.mode };
  return t.mode === 'dark' ? { theme: 'dark', darkTheme: name } : { theme: 'light', lightTheme: name };
};
const clear = THEMES.find(t => t.id === 'clear-light');
assert(clear, 'Clear is a theme');

const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-theme-boards-'));
const saver = await launch({ data, boards: [board], open: 'b', settings: look(clear) });
await saver.page.evaluate(async () => {
  const b = window.__fenmyr.board;
  if (b.cards[0]) b.cards[0].y += 1;
  await Fenmyr.save(b);
});
await saver.close();

const file = path.join(data, 'fenmyr', 'boards', 'b.json');
const saved = fs.readFileSync(file, 'utf8');
assert.deepStrictEqual(
  JSON.parse(saved).cards.map((c: { color: string }) => c.color),
  KEYS,
  'the saved cards hold their colour keys',
);
for (const t of THEMES)
  for (const [key, c] of Object.entries(t.tokens.cards))
    assert(!saved.toLowerCase().includes(c.fill.toLowerCase()), `${t.id}: the file holds no ${key} fill (${c.fill})`);

const hex = (rgb: string) => {
  const m = rgb.match(/[\d.]+/g)?.map(Number) ?? [];
  return `#${m
    .slice(0, 3)
    .map(v => Math.round(v).toString(16).padStart(2, '0'))
    .join('')}`;
};
for (const t of THEMES) {
  const app = await launch({ data, open: 'b', settings: look(t) });
  const fills: string[] = await app.page.evaluate(() =>
    [...document.querySelectorAll('#cards .card.note')].map(
      c => getComputedStyle(c.querySelector('.frame') ?? c).backgroundColor,
    ),
  );
  assert.strictEqual(fills.length, KEYS.length, `${t.id}: every card opens`);
  for (const [i, key] of KEYS.entries())
    assert.strictEqual(
      hex(fills[i] ?? ''),
      t.tokens.cards[key]?.fill.toLowerCase(),
      `${t.id}: the ${key} card is ${t.name}'s ${key}`,
    );
  await app.close();
}
fs.rmSync(data, { recursive: true, force: true });
console.log('THEME BOARDS OK');
