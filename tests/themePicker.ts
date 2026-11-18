// The theme picker in Settings: a radio row for each theme with its name and ten colours, choosing one restyles the page
// at once (the class on <body>, the board's colour, the card colours) and is kept, the arrow keys move between rows,
// light and dark are chosen apart, a saved name that isn't a theme shows Default, and colours of your own say so.
import assert from 'node:assert';
import { THEMES } from '../src/web/settings/themes.ts';
import { launch } from './support/launch.ts';

const note = { id: 'n', type: 'note', x: 0, y: 0, w: 200, h: 100, r: 0, text: 'x', color: 'butter' },
  board = { id: 'b', name: 'B', cards: [note], links: [], tray: [] };
const bg = (id: string) => THEMES.find(t => t.id === id)?.tokens.bg;

let l = await launch({ boards: [board], open: 'b' });
let { page } = l;
await page.click('#gearBtn');

const state = () =>
  page.evaluate(() => ({
    classes: [...document.body.classList].filter(c => c === 'dark' || c.startsWith('theme-')).sort(),
    board: document.body.style.getPropertyValue('--board'),
    surface: getComputedStyle(document.body).getPropertyValue('--surface').trim(),
    saved: JSON.parse(localStorage.getItem('fenmyr:settings') || '{}'),
    checked: [...document.querySelectorAll('.tp-row[aria-checked="true"]')].map(r => r.getAttribute('data-v')),
  }));
const row = (group: string, v: string) => page.locator(`#${group} [data-v="${v}"]`);

const rows = await page.evaluate(() =>
  ['themeLight', 'themeDark'].map(g =>
    [...document.querySelectorAll(`#${g} .tp-row`)].map(r => [
      r.getAttribute('data-v'),
      r.getAttribute('aria-label'),
      r.querySelectorAll('.tp-chips i').length,
    ]),
  ),
);
assert.deepStrictEqual(
  rows[0],
  [
    ['default', 'Default', 10],
    ['midsummer', 'Midsummer', 10],
    ['clear', 'Clear, accessible', 10],
  ],
  'the light group',
);
assert.deepStrictEqual(
  rows[1],
  [
    ['default', 'Default', 10],
    ['polar-night', 'Polar Night', 10],
    ['lantern', 'Lantern, accessible', 10],
  ],
  'the dark group',
);
assert.deepStrictEqual((await state()).checked, ['default', 'default'], 'Default is chosen in both');
assert.deepStrictEqual((await state()).classes, [], 'and no theme class is on the page');

// choosing restyles at once, with no reload, and is kept
await row('themeLight', 'midsummer').click();
let s = await state();
assert.deepStrictEqual(s.classes, ['theme-midsummer']);
assert.strictEqual(s.board, bg('midsummer-light'), "the board takes the theme's colour");
assert.strictEqual(s.surface, '#ffffff');
assert.strictEqual(s.saved.lightTheme, 'midsummer', 'the choice is kept');
assert.deepStrictEqual(s.checked, ['midsummer', 'default']);
const swatch = await page.evaluate(() => {
  const el = document.querySelector('#noteColors [data-nc="butter"]');
  return el ? getComputedStyle(el).backgroundColor : '';
});
assert.strictEqual(swatch, 'rgb(246, 211, 157)', "the note colour swatches show the theme's own Cloudberry");

// the arrow keys move between rows and choose as they go, and wrap round
await row('themeLight', 'midsummer').focus();
await page.keyboard.press('ArrowDown');
assert.deepStrictEqual((await state()).classes, ['theme-clear'], 'ArrowDown chooses the next row');
await page.keyboard.press('ArrowDown');
assert.deepStrictEqual((await state()).classes, [], 'and wraps to Default');
await page.keyboard.press('ArrowUp');
assert.deepStrictEqual((await state()).classes, ['theme-clear'], 'ArrowUp goes back the other way');
assert.strictEqual(
  await page.evaluate(() => document.querySelectorAll('#themeLight .tp-row[tabindex="0"]').length),
  1,
  'one stop in the Tab order',
);

// light and dark are chosen apart
await page.click('#settings [data-seg="theme"] [data-v="dark"]');
await row('themeDark', 'lantern').click();
s = await state();
assert.deepStrictEqual(s.classes, ['dark', 'theme-lantern']);
assert.strictEqual(s.board, bg('lantern-dark'));
assert.strictEqual(s.saved.lightTheme, 'clear', 'the light choice is still kept');
await page.click('#settings [data-seg="theme"] [data-v="light"]');
assert.deepStrictEqual((await state()).classes, ['theme-clear'], 'back in light mode it is the light theme again');
await l.close();

// a saved name that isn't a theme is Default, and colours of your own show their note
l = await launch({
  boards: [board],
  open: 'b',
  settings: { lightTheme: 'nonsense', colors: { light: { accent: '#112233' }, dark: {} } },
});
page = l.page;
await page.click('#gearBtn');
s = await state();
assert.deepStrictEqual(s.checked, ['default', 'default'], 'an unknown name shows Default as chosen');
assert.deepStrictEqual(s.classes, [], 'and uses it');
assert.strictEqual(await page.locator('#themeNote').isVisible(), true, 'your own colours say they sit on top');
await page.click('#themeReset');
assert.strictEqual(await page.locator('#themeNote').isVisible(), false, 'Reset to theme clears them and the note');
await l.close();
console.log('THEME PICKER OK');
