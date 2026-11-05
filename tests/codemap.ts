// The code map: imports are read as the code writes them, cycles are found, a missing description is caught,
// and the JSON, the Markdown and the lookup command agree. Runs on a small throwaway repo, then on this one.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { areaOf, zoneOf } from '../tools/code-map/areas.ts';
import { isClean, parseDescriptions, problemsWith, readDescriptions } from '../tools/code-map/descriptions.ts';
import { readGraph } from '../tools/code-map/graph.ts';
import { layout } from '../tools/code-map/layout.ts';
import { renderMarkdown } from '../tools/code-map/markdown.ts';
import { buildMap } from '../tools/code-map/model.ts';
import { parseCodeMap } from '../tools/code-map/parse.ts';
import { previewSvg } from '../tools/code-map/previewSvg.ts';
import { answer } from '../tools/code-map/query.ts';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codemap-'));
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), text);
};
write('src/shared/model.ts', 'export type Card = { id: string };\n');
write('src/shared/util.ts', "import type { Card } from './model.ts';\nexport const id = (c: Card) => c.id;\n");
write(
  'src/web/core/a.ts',
  "import { b } from './b.ts';\nimport { id } from '../../shared/util.ts';\nexport const a = () => b() + id;\n",
);
write('src/web/core/b.ts', "import { a } from './a.ts';\nexport const b = () => a;\n");
write(
  'src/web/canvas/draw.ts',
  "import { type Card } from '../../shared/model.ts';\nexport * from '../core/a.ts';\nexport const x = import('../core/b.ts');\nimport fs from 'node:fs';\nimport esbuild from 'esbuild/lib/main';\nexport const y = (c: Card, f = fs) => [c, f, esbuild];\n",
);
write('src/web/main.ts', "import './canvas/draw.ts';\n");
write('src/host/main.ts', "import { id } from '../shared/util.ts';\nconsole.log(id);\n");
write('web/vendor/big.js', "import './nothing.js';\n");
write('node_modules/skip/index.js', 'x\n');
write('.gitignore', 'node_modules/\n');
execFileSync('git', ['init', '-q'], { cwd: root });
execFileSync('git', ['add', '-A'], { cwd: root });

const raw = readGraph(root);
const paths = raw.files.map(f => f.path);
assert.ok(
  !paths.some(p => p.includes('node_modules') || p.startsWith('web/vendor')),
  'node_modules and vendor bundles are left out',
);
const edge = (from: string, to: string) => raw.edges.find(e => e.from === from && e.to === to);
assert.ok(edge('src/web/core/a.ts', 'src/web/core/b.ts'), 'a static import is an edge');
assert.strictEqual(
  edge('src/shared/util.ts', 'src/shared/model.ts')?.typeOnly,
  true,
  'import type is marked type-only',
);
assert.strictEqual(
  edge('src/web/canvas/draw.ts', 'src/shared/model.ts')?.typeOnly,
  true,
  'so is an import of only type names',
);
assert.strictEqual(
  edge('src/web/canvas/draw.ts', 'src/web/core/a.ts')?.typeOnly,
  false,
  'a re-export is a runtime import',
);
assert.ok(edge('src/web/canvas/draw.ts', 'src/web/core/b.ts'), 'a dynamic import() is an edge');
assert.deepStrictEqual(
  [...raw.external.keys()],
  ['esbuild'],
  'packages are listed, Node modules and relative imports are not',
);

const described = parseDescriptions({
  areas: { host: 'h', shared: 's', 'web/core': 'c', 'web/canvas': 'v', 'web (root)': 'r' },
  files: Object.fromEntries(paths.map(p => [p, `About ${p}`])),
});
const map = buildMap(raw, described, { commit: 'abc1234def', builtAt: '2026-11-05T10:00:00.000Z' });
const core = (name: string) => map.files.find(f => f.path === `src/web/core/${name}`);
assert.deepStrictEqual(
  map.cycles.map(c => c.files),
  [['src/web/core/a.ts', 'src/web/core/b.ts']],
  'two files that import each other are a cycle',
);
assert.ok(
  core('a.ts')?.inCycle && !map.files.find(f => f.path === 'src/shared/util.ts')?.inCycle,
  'and nothing else is marked',
);
assert.deepStrictEqual(core('b.ts')?.importedBy, ['src/web/canvas/draw.ts', 'src/web/core/a.ts']);
assert.deepStrictEqual(
  [map.files.find(f => f.path === 'src/web/canvas/draw.ts')?.hubRank, core('a.ts')?.hubRank],
  [1, 2],
  'files rank by connections, and a tie goes to the earlier path',
);
const canvas = map.areas.find(a => a.id === 'web/canvas');
assert.deepStrictEqual(canvas?.importsFrom, { 'web/core': 2, shared: 1 }, 'area counts add up the imports that cross');

// descriptions: a missing, a stale and an over-long one are each reported
const areas = map.areas.map(a => a.id);
assert.ok(isClean(problemsWith(described, paths, areas)), 'complete descriptions pass');
const gaps = problemsWith(
  parseDescriptions({ areas: { host: 'h' }, files: { 'src/host/main.ts': 'x'.repeat(300), 'src/gone.ts': 'old' } }),
  paths,
  areas,
);
assert.ok(gaps.missingFiles.includes('src/web/main.ts') && gaps.staleFiles.includes('src/gone.ts'));
assert.ok(gaps.missingAreas.includes('shared') && gaps.long.includes('src/host/main.ts'));
assert.deepStrictEqual(parseDescriptions('nonsense'), { areas: {}, files: {} }, 'odd input is not trusted');

// the JSON survives a round trip, and a damaged file is refused or repaired, never trusted
assert.deepStrictEqual(
  parseCodeMap(JSON.parse(JSON.stringify(map))),
  map,
  'code-map.json reads back as it was written',
);
assert.strictEqual(parseCodeMap({ version: 2 }), null, 'an unknown version is refused');
assert.strictEqual(
  parseCodeMap(JSON.parse('{"version":1,"files":[{"path":3},{"path":"a.ts","lines":"x","imports":[1,"b.ts"]}]}'))
    ?.files[0]?.imports[0],
  'b.ts',
);

// Markdown and the lookup command
const md = renderMarkdown(map);
assert.match(md, /Built from commit abc1234 on 2026-11-05/);
assert.match(md, /### web\/core/);
assert.match(md, /`a\.ts` \[imported by 2, imports 2, in the import cycle\]: About src\/web\/core\/a\.ts/);
assert.match(answer(map, 'src/web/core/a.ts'), /Imports \(2\):\n {2}src\/shared\/util\.ts\n {2}src\/web\/core\/b\.ts/);
assert.match(answer(map, 'draw'), /^src\/web\/canvas\/draw\.ts/, 'a part of the path finds a unique file');
assert.match(answer(map, 'main.ts'), /2 files match/, 'and says so when it is not unique');
assert.match(answer(map, 'web/core'), /^web\/core\nc\n2 files/);
assert.match(answer(map, '--cycle'), /2 files can reach each other/);
assert.match(answer(map, 'nope'), /Nothing matches "nope"/);

// the layout is the same every time, so the page and the preview agree
const flt = { tests: false, tools: false, types: true };
const one = layout(map, flt, 'files', 1.6),
  two = layout(map, flt, 'files', 1.6);
assert.deepStrictEqual(
  one.nodes.map(n => [n.x, n.y]),
  two.nodes.map(n => [n.x, n.y]),
  'the same input gives the same places',
);
assert.ok(one.nodes.every(n => Number.isFinite(n.x) && Number.isFinite(n.y)));
const svg = previewSvg(map);
assert.match(svg, /^<svg[^>]+viewBox="0 0 1200 720"/);
assert.ok(!/<script|onload/i.test(svg), 'the preview image carries no script');

assert.deepStrictEqual(
  [areaOf('src/web/canvas/x.ts'), areaOf('src/web/main.ts'), areaOf('web/sw.js'), areaOf('tests/smoke/a.ts')],
  ['web/canvas', 'web (root)', 'static', 'tests/smoke'],
);
assert.deepStrictEqual(
  [zoneOf('host'), zoneOf('web/ui'), zoneOf('tests/smoke'), zoneOf('other')],
  ['host', 'renderer', 'tests', 'tools'],
);
fs.rmSync(root, { recursive: true, force: true });

// this repository: every file and area has a description, and its map is whole
const here = path.resolve(import.meta.dirname, '..');
const real = readGraph(here);
const realPaths = real.files.map(f => f.path);
assert.ok(
  isClean(problemsWith(readDescriptions(), realPaths, [...new Set(realPaths.map(areaOf))])),
  'tools/code-map/descriptions.json describes every file (run node tools/code-map/check.ts)',
);
assert.ok(real.files.length > 100 && real.edges.length > 500, 'this repository is read in full');
console.log('CODE MAP OK');
