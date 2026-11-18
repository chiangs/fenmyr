// The theme variables come from one place: web/themes.css, written from the theme table. The running app computes every
// token from the table in light and in dark, style.css defines none of them again, and the file on disk is current.
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { DERIVED } from '../src/web/settings/derived.ts';
import { CSS_VARS, THEMES } from '../src/web/settings/themes.ts';
import { launch } from './support/launch.ts';

const root = path.resolve(import.meta.dirname, '..'),
  stale = spawnSync('node', [path.join(root, 'tools/themes-css.ts'), '--check'], { encoding: 'utf8' });
assert.strictEqual(stale.status, 0, `themes.css is out of date: ${stale.stderr}`);

const wanted = (mode: 'light' | 'dark') => {
  const theme = THEMES.find(t => t.mode === mode && t.id.startsWith('default'));
  assert(theme, `no default ${mode} theme`);
  const vars = Object.entries(CSS_VARS).map(([key, name]): [string, string] => [
    name,
    String(Reflect.get(theme.tokens, key)),
  ]);
  for (const [key, card] of Object.entries(theme.tokens.cards)) vars.push([`--card-${key}`, card.fill]);
  vars.push(['--card-link', theme.tokens.cards.butter?.link ?? '']);
  return vars;
};

const style = fs.readFileSync(path.join(root, 'web/style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
for (const name of [...wanted('light').map(([n]) => n), ...Object.keys(DERIVED)])
  assert(
    !new RegExp(`(?<![\\w-])${name}\\s*:`).test(style),
    `style.css defines ${name} again; it comes from themes.css`,
  );

const note = { id: 'n', type: 'note', x: 0, y: 0, w: 200, h: 100, r: 0, text: 'x' },
  app = await launch({ boards: [{ id: 'b', name: 'B', cards: [note], links: [], tray: [] }], open: 'b' });
for (const mode of ['light', 'dark'] as const) {
  const seen = await app.page.evaluate(
    ([dark, names]) => {
      document.body.classList.toggle('dark', dark);
      const cs = getComputedStyle(document.body);
      return names.map(n => [n, cs.getPropertyValue(n).trim()]);
    },
    [mode === 'dark', wanted(mode).map(([n]) => n)] as const,
  );
  assert.deepStrictEqual(
    seen,
    wanted(mode).map(([n, v]) => [n, v]),
    `in ${mode} mode the page computes the table's colours`,
  );
}
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
