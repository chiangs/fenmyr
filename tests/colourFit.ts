// tools/colour-fit.ts finds a core token for a colour that is one, a mix of two for one that is between them, nothing
// for one that is far from both, and refuses a pair that fits in light mode but not in dark. A body.dark swap is read
// as one pair, and a prefix limits which tokens are looked at.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mixOklch } from '../src/web/ui/color.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-fit-')),
  css = path.join(dir, 'style.css'),
  core = path.join(dir, 'core.json'),
  out = path.join(dir, 'report.json');
fs.writeFileSync(
  core,
  JSON.stringify({
    '--panel': ['#ffffff', '#242019'],
    '--ink': ['#3b342d', '#f6f2ec'],
    '--snow': ['#ffffff', '#ffffff'],
  }),
);
fs.writeFileSync(
  css,
  `:root { --a-same: #ffffff; --a-mid: ${mixOklch('#ffffff', '#3b342d', 0.5)}; --a-mid-dark: ${mixOklch('#242019', '#f6f2ec', 0.5)}; --a-far: #ff0000; --a-light: #ffffff; --a-dark-swap: #000000; --b-other: #ffffff; }
.one { background: var(--a-same); }
.two { background: var(--a-mid); }
body.dark .two { background: var(--a-mid-dark); }
.three { color: var(--a-far); }
.four { background: var(--a-light); }
body.dark .four { background: var(--a-dark-swap); }
.five { background: var(--b-other); }
.six { border: 1px solid var(--a-same); }
`,
);
const run = (...args: string[]) =>
  execFileSync('node', ['tools/colour-fit.ts', '--core', core, '--css', css, '--out', out, ...args], {
    encoding: 'utf8',
  });
type Row = {
  light: string;
  dark: string;
  tokens: string[];
  uses: number;
  fit: { expr: string } | null;
};
const rows = (): Row[] => {
  const raw: unknown = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert(Array.isArray(raw));
  return raw.filter((r): r is Row => typeof r === 'object' && r !== null && 'light' in r);
};
const find = (token: string) => {
  const r = rows().find(x => x.tokens.includes(token));
  assert(r, `${token} not found in the report`);
  return r;
};

run('--prefix', '^--a-');
assert.equal(find('--a-same').fit?.expr, 'var(--snow)', 'an exact core colour is that token');
assert.equal(find('--a-same').uses, 2, 'a shorthand counts as a use');
assert.match(
  find('--a-mid').fit?.expr ?? '',
  /^color-mix\(in oklch, var\(--(ink|panel)\) \d+%, var\(--(ink|panel)\)\)$/,
);
assert.equal(find('--a-far').fit, null, 'a colour far from both is left');
assert.equal(find('--a-light').fit, null, 'a swap that is black in dark mode fits neither core colour');
assert(find('--a-light').tokens.includes('--a-dark-swap'), 'the body.dark swap is read as one pair');
assert(!rows().some(r => r.tokens.includes('--b-other')), 'the prefix leaves other tokens out');

const tight = JSON.parse(run('--prefix', '^--a-', '--tolerance', '0.001').split('\n')[0] ?? '{}');
assert(tight.unmatched >= 3, 'a tighter tolerance matches fewer pairs');
console.log('colour fit ok');
