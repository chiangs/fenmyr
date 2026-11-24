// The words she says once she has made a project, folder or board are written once, in src/web/myra/madeLines.ts, and
// read from there by the slash commands and by her own replies, so one action cannot get two wordings.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const WORDING = 'src/web/myra/madeLines.ts';
const PHRASES = [
  'I made the',
  'holds prototypes, so I opened',
  'There is already a project called',
  'There is no project called',
  'I could not find a folder called',
  'so I did not make',
];
const READERS = ['src/web/myra/slashMake.ts', 'src/web/myra/makeInLibrary.ts'];

const sources = (dir: string): string[] =>
  fs
    .readdirSync(path.join(ROOT, dir), { withFileTypes: true })
    .flatMap(e => (e.isDirectory() ? sources(`${dir}/${e.name}`) : e.name.endsWith('.ts') ? [`${dir}/${e.name}`] : []));
const text = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const wording = text(WORDING);
for (const phrase of PHRASES) assert.ok(wording.includes(phrase), `${WORDING} says "${phrase}"`);
for (const file of sources('src/web').filter(f => f !== WORDING))
  for (const phrase of PHRASES) assert.ok(!text(file).includes(phrase), `${file} words its own "${phrase}"`);
for (const file of READERS) assert.ok(text(file).includes("'./madeLines.ts'"), `${file} reads ${WORDING}`);
console.log('madeLines: ok');
