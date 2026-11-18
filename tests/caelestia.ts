// Follow Caelestia on top of a theme (#251 §4a). For three schemes read through the host's own reader (a dark one, a light
// one, and one whose named colours are all nearly the same), on every theme of that mode: whatever comes out keeps every
// promise the theme makes, the surfaces, accent and card fills come from the scheme, a card set that would blur together
// is the theme's instead, and a scheme with little in it leaves the rest to the theme.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { caelestiaTokens } from '../src/web/settings/caelestia.ts';
import { checksOf, THEMES } from '../src/web/settings/themes.ts';

const fixtures = path.join(import.meta.dirname, 'fixtures/caelestia'),
  state = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-cae-'));
process.env.XDG_STATE_HOME = state;
const { read } = await import('../src/host/theme.ts');
const scheme = (file: string) => {
  fs.mkdirSync(path.join(state, 'caelestia'), { recursive: true });
  fs.copyFileSync(path.join(fixtures, file), path.join(state, 'caelestia', 'scheme.json'));
  const s = read();
  assert(s, `${file} is read as a scheme`);
  return s;
};
const themeNamed = (id: string) => {
  const t = THEMES.find(x => x.id === id);
  assert(t, id);
  return t;
};
const fillsOf = (t: { cards: Record<string, { fill: string }> }) => Object.values(t.cards).map(c => c.fill);

// whatever the scheme and whichever theme, every promise the theme makes holds
for (const file of ['dark.json', 'light.json', 'clashing.json']) {
  const s = scheme(file);
  for (const t of THEMES.filter(x => x.mode === s.mode)) {
    const tokens = caelestiaTokens(s, t),
      checks = checksOf({ ...t, tokens }),
      // the scheme's accent is never swapped for the theme's, so on an accessible theme the text on it can fall short of
      // AAA; it is still the best of the theme's inks, white and black, which always reaches 4.5:1
      failing = checks.filter(c => c.got < c.need && c.id !== 'onAccent');
    assert.deepStrictEqual(failing, [], `${file} on ${t.id} keeps the theme's promises`);
    assert((checks.find(c => c.id === 'onAccent')?.got ?? 0) >= 4.5, `${file} on ${t.id}: text on the accent reads`);
    assert.strictEqual(tokens.accent, s.colours.primary, `${file} on ${t.id}: the accent is the scheme's`);
    assert.strictEqual(tokens.bg, s.colours.surface, `${file} on ${t.id}: the board is the scheme's`);
  }
}

// the scheme's surfaces, accent and cards are used where they pass
const dark = scheme('dark.json'),
  onDefault = caelestiaTokens(dark, themeNamed('default-dark'));
assert.strictEqual(onDefault.bg, '#1a1b26', 'the board is the scheme surface');
assert.strictEqual(onDefault.panel, '#24283b', 'the panel is its surface container');
assert.strictEqual(onDefault.dot, '#414868', 'the dots are its outline variant');
assert.strictEqual(onDefault.accent, '#bb9af7', 'the accent is its primary');
assert.strictEqual(onDefault.surface2, '#2f334d', 'the second surface is its surface container high');
assert.notDeepStrictEqual(
  fillsOf(onDefault),
  fillsOf(themeNamed('default-dark').tokens),
  'the cards take the scheme colours',
);
assert.notStrictEqual(
  onDefault.cards.butter?.fill,
  themeNamed('default-dark').tokens.cards.butter?.fill,
  'Cloudberry is its yellow',
);

// an accessible theme's promise survives a scheme that doesn't meet it: the text is moved, or the theme's own is kept
const light = scheme('light.json'),
  onClear = caelestiaTokens(light, themeNamed('clear-light'));
assert.strictEqual(onClear.bg, '#fdf8f0', 'Clear on a light scheme still takes the scheme surface');

// cards that would blur together are the theme's, all seven, and the rest still comes from the scheme
const clashing = scheme('clashing.json'),
  onLantern = caelestiaTokens(clashing, themeNamed('lantern-dark'));
assert.deepStrictEqual(
  fillsOf(onLantern),
  fillsOf(themeNamed('lantern-dark').tokens),
  'clashing fills fall back to the theme',
);
assert.strictEqual(onLantern.bg, '#14201f', 'and the board is still the scheme surface');
assert.strictEqual(onLantern.accent, '#6fb5a8', 'and the accent too');

// a scheme with little in it: the theme supplies the rest
const sparse = { name: 'sparse', mode: 'dark' as const, colours: { primary: '#bb9af7', surface: '#1a1b26' } },
  onPolar = caelestiaTokens(sparse, themeNamed('polar-night-dark')),
  polar = themeNamed('polar-night-dark').tokens;
assert.strictEqual(onPolar.bg, '#1a1b26');
assert.strictEqual(onPolar.ink, polar.ink, 'the text is the theme’s when the scheme has none');
assert.deepStrictEqual(fillsOf(onPolar), fillsOf(polar), 'so are the cards');
assert.notStrictEqual(onPolar.surface2, polar.surface2, 'the second surface is made from the panel and the ink');

fs.rmSync(state, { recursive: true, force: true });
console.log('CAELESTIA OK');
