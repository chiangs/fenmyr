// Every colour theme keeps its promise: AA or AAA contrast for text, focus and card text, and card colours that stay
// apart for every kind of colour blindness. Gaps a theme is known to have are recorded, and must still be real.
import assert from 'node:assert';
import { DERIVED } from '../src/web/settings/derived.ts';
import { checksOf, THEMES } from '../src/web/settings/themes.ts';
import { apart, bestInk, contrast, readableShade } from '../src/web/ui/color.ts';

assert.strictEqual(Math.round(contrast('#000000', '#ffffff') * 10) / 10, 21, 'black on white is 21:1');
assert.strictEqual(contrast('#777777', '#777777'), 1, 'a colour on itself is 1:1');
assert.strictEqual(apart('#ffe3bd', '#ffe3bd', 'deutan'), 0, 'a colour is no distance from itself');
assert.ok(
  apart('#ff0000', '#00ff00', 'typical') > apart('#ff0000', '#00ff00', 'deutan'),
  'red and green close up for deutan vision',
);

// a custom accent of any colour still makes links and button text that read at 4.5:1
for (const accent of ['#e88a24', '#ffd76a', '#7fb86a', '#0d99ff', '#7c4dff', '#ff5a6e', '#ffffff', '#000000'])
  for (const [mode, surfaces, ink] of [
    ['light', ['#ffffff', '#faf7f2'], '#3b342d'],
    ['dark', ['#242019', '#12100d'], '#1d1a16'],
  ] as const) {
    const text = readableShade(accent, [...surfaces], 4.5);
    for (const s of surfaces)
      assert.ok(contrast(text, s) >= 4.5, `${mode}: links from accent ${accent} read on ${s} (${text})`);
    const on = bestInk(accent, ['#ffffff', ink]);
    assert.ok(contrast(on, accent) >= 4, `${mode}: text on accent ${accent} reads (${on})`);
  }

const problems: string[] = [];
for (const t of THEMES) {
  for (const c of checksOf(t)) {
    const passes = c.got >= c.need,
      known = t.knownGaps.includes(c.id);
    if (!passes && !known) problems.push(`${t.id}: ${c.id} is ${c.got}, needs ${c.need} (${c.worst})`);
    if (passes && known) problems.push(`${t.id}: ${c.id} now passes (${c.got}), so take it out of knownGaps`);
  }
}
assert.deepStrictEqual(problems, [], 'every theme keeps its promise');

// the core colours reach the page from web/themes.css, which tests/themesCss.ts checks against this table; the one place
// two tables have to agree is the link on a dark Snow note, which is the accent tint
const dark = THEMES.find(t => t.id === 'default-dark')?.tokens;
assert.ok(dark, 'the dark Default theme is in the table');
assert.strictEqual(DERIVED['--link-on-dark'], 'var(--accent-tint)', '--link-on-dark is the accent tint');
assert.strictEqual(dark.accentTint, dark.cards.white?.link, 'a link on a dark Snow note matches the accent tint');

console.log(`THEMES OK (${THEMES.length} themes)`);
