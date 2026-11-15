// tools/colour-convert.ts moves raw colours onto variables without changing any colour: hex and rgba(), a pair of
// tokens for surfaces and highlights, comments, custom properties and !important left as they were, an excluded rule
// untouched, an unknown colour reported, and a second run finding nothing to do.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-colours-')),
  css = path.join(dir, 'style.css'),
  map = path.join(dir, 'map.json'),
  pairs = path.join(dir, 'pairs.json'),
  tool = path.join(import.meta.dirname, '..', 'tools', 'colour-convert.ts');

const FIXTURE = `:root { --ink: #3b342d; }
/* a comment with #123456 in it */
.card { background: #fff; color: #FFF; border: 1px solid #3b342d; }
.shade { box-shadow: 0 4px 12px rgba(0, 0, 0, .35), inset 0 0 0 1px rgba(255, 255, 255, 1); }
.dark { background: #38332d !important; }
.broken { filter: drop-shadow(0 0 0 rgba(1, 2, 3), .5); }
.keep { color: #3b342d; }
.odd { color: #abcdef; background: #1234; }
@media (max-width: 600px) { .small { color: #3b342d; } }
`;
fs.writeFileSync(css, FIXTURE);
fs.writeFileSync(
  map,
  JSON.stringify({
    '#ffffff': ['--snow', '--hilite'],
    '#000000': '--shade',
    '#3b342d': '--ink',
    '#38332d': '--dark-snow',
  }),
);
const run = (...extra: string[]) =>
  JSON.parse(
    execFileSync('node', [tool, '--css', css, '--map', map, '--pairs', pairs, '--exclude', '\\.keep', ...extra], {
      encoding: 'utf8',
    }),
  );

const dry = run('--dry');
assert.strictEqual(fs.readFileSync(css, 'utf8'), FIXTURE, '--dry leaves the stylesheet alone');
assert.strictEqual(dry.edits, 6, '--dry still counts what it would change');

const first = run(),
  out = fs.readFileSync(css, 'utf8');
assert.strictEqual(first.edits, 6, 'six declarations change: three in .card, then .shade, .dark and .small');
assert.ok(out.includes('background: var(--snow);'), 'white on a background is the surface token');
assert.ok(
  out.includes('color: var(--hilite);'),
  'white on text is the other token, and capitals and short hex are read',
);
assert.ok(out.includes('border: 1px solid var(--ink)'), 'hex inside a shorthand is converted');
assert.ok(
  out.includes('rgb(from var(--shade) r g b / .35)') &&
    out.includes('inset 0 0 0 1px var(--hilite))'.replace('))', ')')),
  'rgba gets an alpha form, and an alpha of 1 is the plain token',
);
assert.ok(out.includes('background: var(--dark-snow) !important;'), '!important stays after the token');
assert.ok(out.includes('/* a comment with #123456 in it */'), 'a comment is not read as a colour');
assert.ok(out.includes(':root { --ink: #3b342d; }'), 'a custom property keeps its value');
assert.ok(out.includes('rgba(1, 2, 3), .5)'), 'a declaration the browser already drops is left alone');
assert.ok(out.includes('.keep { color: #3b342d; }'), 'an excluded rule is untouched');
assert.ok(out.includes('.small { color: var(--ink); }'), 'a rule inside @media is converted');
assert.deepStrictEqual(
  first.missing,
  ['#1234', '#abcdef'],
  'colours with no token, and alpha hex, are reported, not guessed',
);
assert.ok(out.includes('color: #abcdef;'), 'an unknown colour stays as it was');

const written: unknown = JSON.parse(fs.readFileSync(pairs, 'utf8'));
assert.ok(Array.isArray(written) && written.length === 6, 'the pairs file lists each change as [property, old, new]');
assert.deepStrictEqual(written[0], ['background', '#fff', 'var(--snow)']);

assert.strictEqual(run().edits, 0, 'a second run has nothing left to do');

fs.rmSync(dir, { recursive: true, force: true });
console.log('COLOUR CONVERT OK');
