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

// --skip-core stops a core token being a building block, --prefix limits the tokens looked at, and --keep-hex writes what
// then fits nothing into the table as its old colour, so it is still set in one place
fs.writeFileSync(
  at('core2.json'),
  JSON.stringify({
    '--card-a': ['#e2eed0', '#e2eed0'],
    '--surface': ['#ffffff', '#242019'],
    '--ink': ['#3b342d', '#f6f2ec'],
  }),
);
fs.writeFileSync(at('table2.ts'), 'export const DERIVED = {};\n');
fs.writeFileSync(
  at('style2.css'),
  ':root { --b-pale: #e2eed0; --b-other: #e2eed0; }\n.p { background: var(--b-pale); }\n.o { background: var(--b-other); }\n',
);
const run2 = (...extra: string[]) =>
  execFileSync(
    'node',
    [
      path.join(import.meta.dirname, '../tools/colour-derive.ts'),
      '--core',
      at('core2.json'),
      '--css',
      at('style2.css'),
      '--themes',
      at('themes.css'),
      '--table',
      at('table2.ts'),
      '--source',
      at('src'),
      '--apply',
      ...extra,
    ],
    { encoding: 'utf8' },
  );
run2('--prefix', '^--b-pale$');
let table2 = fs.readFileSync(at('table2.ts'), 'utf8');
assert.match(table2, /'--b-pale': 'var\(--card-a\)'/, 'a card colour is a building block unless it is skipped');
assert(!table2.includes('--b-other'), 'and the prefix leaves other tokens alone');
fs.writeFileSync(at('style2.css'), ':root { --b-pale: #e2eed0; }\n.p { background: var(--b-pale); }\n');
run2('--skip-core', '^--card-', '--keep-hex');
table2 = fs.readFileSync(at('table2.ts'), 'utf8');
assert.match(table2, /'--b-pale': '#e2eed0'/, 'skipped, it fits nothing, so the old colour is kept in the table');
assert(!/--b-pale:/.test(fs.readFileSync(at('style2.css'), 'utf8')), 'and is no longer defined in the stylesheet');

fs.rmSync(dir, { recursive: true, force: true });
console.log('COLOUR DERIVE OK');
