// tools/colour-derive.ts turns area colours into expressions of the core tokens: a colour used in light rules alone is
// fitted in light and keeps its old colour in dark, one used in dark rules alone is fitted in dark, one used in both in
// both, and the old definitions go. An unused colour is removed. A colour the html element uses, one the renderer sets
// by name, and one that fits nothing are left where they are.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-derive-')),
  at = (f: string) => path.join(dir, f);
fs.mkdirSync(at('src'));
fs.writeFileSync(
  at('core.json'),
  JSON.stringify({
    '--surface': ['#ffffff', '#242019'],
    '--surface-2': ['#f4f0ed', '#2e2922'],
    '--ink': ['#3b342d', '#f6f2ec'],
  }),
);
fs.writeFileSync(at('themes.css'), ':root { --ink: #3b342d; }\nbody.dark { --ink: #f6f2ec; }\n');
fs.writeFileSync(at('src/set.ts'), "document.body.style.setProperty('--a-js', '#f4f0ed');\n");
fs.writeFileSync(at('table.ts'), 'export const DERIVED = {};\n');
fs.writeFileSync(
  at('style.css'),
  `:root { --a-light: #f4f0ed; --a-dark: #2e2922; --a-both: #ffffff; --a-unused: #123456; --a-html: #f4f0ed; --a-js: #f4f0ed; --a-far: #ff0000; }
body.dark { --a-both: #242019; }
/* the one used in light */
.x { background: var(--a-light); }
body.dark .y { background: var(--a-dark); }
.z { background: var(--a-both); }
body.dark .z2 { color: var(--a-both); }
html { background: var(--a-html); }
.j { background: var(--a-js); }
.f { color: var(--a-far); }
`,
);
const pairs = at('pairs.json'),
  out = execFileSync(
    'node',
    [
      path.join(import.meta.dirname, '../tools/colour-derive.ts'),
      '--core',
      at('core.json'),
      '--css',
      at('style.css'),
      '--themes',
      at('themes.css'),
      '--table',
      at('table.ts'),
      '--source',
      at('src'),
      '--apply',
      '--pairs',
      pairs,
    ],
    { encoding: 'utf8' },
  );
const table = fs.readFileSync(at('table.ts'), 'utf8'),
  css = fs.readFileSync(at('style.css'), 'utf8');

assert.match(
  table,
  /'--a-light': \['var\(--surface-2\)', '#f4f0ed'\]/,
  'light-only: the mix, and the old colour in dark',
);
assert.match(table, /'--a-dark': 'var\(--surface-2\)'/, 'dark-only: fitted in dark alone');
assert.match(table, /'--a-both': 'var\(--surface\)'/, 'used in both: fitted in both');
for (const left of ['--a-unused', '--a-html', '--a-js', '--a-far'])
  assert(!table.includes(left), `${left} is not in the table`);

for (const gone of ['--a-light', '--a-dark', '--a-both', '--a-unused'])
  assert(!new RegExp(`${gone}:`).test(css), `${gone} is no longer defined in the stylesheet`);
for (const stays of ['--a-html: #f4f0ed', '--a-js: #f4f0ed', '--a-far: #ff0000'])
  assert(css.includes(stays), `${stays} stays`);
assert(css.includes('/* the one used in light */'), 'comments stay');
assert.match(out, /"derived":3/, 'it says how many it derived');

const written: unknown = JSON.parse(fs.readFileSync(pairs, 'utf8'));
assert(Array.isArray(written) && written.length === 3, 'a pair for each derived colour, for colour-compare');
assert.deepStrictEqual(written[1]?.slice(4), ['dark'], 'a dark-only colour is only compared in dark');

fs.rmSync(dir, { recursive: true, force: true });
console.log('COLOUR DERIVE OK');
