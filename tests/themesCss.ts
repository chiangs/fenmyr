// The theme variables come from one place: web/themes.css, written from the theme table. The running app computes every
// token from the table in light and in dark, style.css defines none of them again, and the file on disk is current.
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { DERIVED } from '../src/web/settings/derived.ts';
import { CSS_VARS, cardVars, LABEL_VAR, THEMES } from '../src/web/settings/themes.ts';
import { launch } from './support/launch.ts';

const root = path.resolve(import.meta.dirname, '..'),
  stale = spawnSync('node', [path.join(root, 'tools/themes-css.ts'), '--check'], { encoding: 'utf8' });
assert.strictEqual(stale.status, 0, `themes.css is out of date: ${stale.stderr}`);

const wanted = (theme: (typeof THEMES)[number]) => {
  const vars = Object.entries(CSS_VARS).map(([key, name]): [string, string] => [
    name,
    String(Reflect.get(theme.tokens, key)),
  ]);
  vars.push([LABEL_VAR, theme.labels ? 'block' : 'none']);
  // the page reports the edge with the border colour filled in
  vars.push(['--card-edge', theme.outline ? `inset 0 0 0 1.5px ${theme.tokens.border}` : '0 0 0 0 transparent']);
  vars.push(['--straight', theme.straight ? '0' : '1']);
  for (const [key, card] of Object.entries(theme.tokens.cards)) vars.push(...cardVars(key, card));
  return vars;
};
// the classes on <body> that apply a theme: Default is :root or body.dark alone, another is body.theme-<name>
const classesOf = (t: (typeof THEMES)[number]) => {
  const name = t.id.replace(/-(light|dark)$/, '');
  return [...(t.mode === 'dark' ? ['dark'] : []), ...(name === 'default' ? [] : [`theme-${name}`])];
};

// a card may give its own contents another ink, as a Snow frame does in a dark theme where Snow is light; that is scoped to the card, not a second definition
const style = fs
  .readFileSync(path.join(root, 'web/style.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/[^{}]*\.card[^{}]*\{[^{}]*\}/g, '');
const first = THEMES[0];
assert(first, 'there are themes');
for (const name of [...wanted(first).map(([n]) => n), ...Object.keys(DERIVED)])
  assert(
    !new RegExp(`(?<![\\w-])${name}\\s*:`).test(style),
    `style.css defines ${name} again; it comes from themes.css`,
  );

const note = { id: 'n', type: 'note', x: 0, y: 0, w: 200, h: 100, r: 0, text: 'x' },
  app = await launch({ boards: [{ id: 'b', name: 'B', cards: [note], links: [], tray: [] }], open: 'b' });
for (const theme of THEMES) {
  const names = wanted(theme).map(([n]) => n),
    seen = await app.page.evaluate(
      ([classes, wantedNames]) => {
        document.body.classList.remove('dark');
        for (const c of [...document.body.classList].filter(x => x.startsWith('theme-')))
          document.body.classList.remove(c);
        for (const c of classes) document.body.classList.add(c);
        const cs = getComputedStyle(document.body);
        return wantedNames.map(n => [n, cs.getPropertyValue(n).trim()]);
      },
      [classesOf(theme), names] as const,
    );
  assert.deepStrictEqual(seen, wanted(theme), `${theme.id}: the page computes the table's colours`);
}
// a theme class is how a theme is applied, so leaving one on must not leak into the next
await app.page.evaluate(() => {
  for (const c of [...document.body.classList].filter(x => x === 'dark' || x.startsWith('theme-')))
    document.body.classList.remove(c);
});

// a derived colour follows the mode: it is worked out on <body>, where the dark class and the theme apply
const flips = await app.page.evaluate(
  names =>
    names.filter(name => {
      const at = (dark: boolean) => {
        document.body.classList.toggle('dark', dark);
        return getComputedStyle(document.body).getPropertyValue(name).trim();
      };
      return at(false) === '' || at(true) === '';
    }),
  Object.keys(DERIVED),
);
assert.deepStrictEqual(flips, [], 'every derived colour is defined in light and in dark');
await app.close();
console.log('THEMES CSS OK');
