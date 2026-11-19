// The renderer and the host are two programs that meet only at src/shared. The boundary check lists every import that breaks
// that (type-only ones too, and shared code reaching out), this repository stays clean, and the code map page opens on its
// areas view with the boundary's status in the header: green when clean, red with the count when not.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { boundaryOf, explain } from '../tools/code-map/boundary.ts';
import { readGraph } from '../tools/code-map/graph.ts';
import { renderMarkdown } from '../tools/code-map/markdown.ts';
import { parseCodeMap } from '../tools/code-map/parse.ts';
import { launch } from './support/launch.ts';

const edge = (from: string, to: string, typeOnly = false) => ({ from, to, typeOnly });

// each way the line can be crossed is found, and each is told apart from the allowed imports
const clean = boundaryOf([
  edge('src/web/canvas/a.ts', 'src/shared/ops.ts'),
  edge('src/host/main.ts', 'src/shared/ops.ts', true),
  edge('src/web/canvas/a.ts', 'src/web/core/b.ts'),
  edge('src/shared/ops.ts', 'src/shared/model.ts'),
  edge('tests/x.ts', 'src/host/main.ts'),
]);
assert.deepStrictEqual(
  clean,
  { clean: true, violations: [], viaShared: { renderer: 1, host: 1 } },
  'allowed imports are clean',
);
const broken = boundaryOf([
  edge('src/web/canvas/a.ts', 'src/host/main.ts'),
  edge('src/host/main.ts', 'src/web/core/b.ts'),
  edge('src/shared/ops.ts', 'src/web/core/b.ts'),
  edge('src/shared/ops.ts', 'src/host/main.ts', true),
]);
assert.strictEqual(broken.clean, false);
assert.deepStrictEqual(
  broken.violations.map(v => v.kind),
  [
    'The renderer imports the host',
    'The host imports the renderer',
    'Shared code imports the renderer',
    'Shared code imports the host',
  ],
  'the renderer, the host and shared code each reaching across are found',
);
assert.strictEqual(broken.violations[3]?.typeOnly, true, 'a type-only import is a violation too');
assert.match(
  explain({ from: 'src/shared/a.ts', to: 'src/host/b.ts', typeOnly: true, kind: 'Shared code imports the host' }),
  /\(type only\).*meet only at src\/shared/,
);

// this repository keeps the line
const root = path.resolve(import.meta.dirname, '..'),
  graph = readGraph(root);
assert.deepStrictEqual(boundaryOf(graph.edges).violations, [], 'src/web and src/host import nothing from each other');

// the map carries it, and a damaged one is read back as broken, never as clean
const site = fs.mkdtempSync(path.join(os.tmpdir(), 'codemap-site-'));
execFileSync('node', [path.join(root, 'tools/code-map/build.ts'), site], { cwd: root, stdio: 'ignore' });
const map = parseCodeMap(JSON.parse(fs.readFileSync(path.join(site, 'code-map.json'), 'utf8')));
assert(map, 'the built map reads back');
assert.strictEqual(map.boundary.clean, true);
assert(map.boundary.viaShared.renderer > 0 && map.boundary.viaShared.host > 0, 'both programs import shared');
assert.match(renderMarkdown(map), /## Renderer and host\n\nClean\./, 'the Markdown says so');
const leaked = parseCodeMap({ version: 1, boundary: { violations: [{ from: 'a.ts', to: 'b.ts', kind: 'x' }] } });
assert.strictEqual(leaked?.boundary.clean, false, 'a violation in the data is never read as clean');

// the page: areas first, files one click away, and the status in the header
const html = fs.readFileSync(path.join(site, 'index.html'), 'utf8'),
  DATA = /(<script type="application\/json" id="code-map-data">)([\s\S]*?)(<\/script>)/;
const withViolation = html.replace(DATA, (_all, open: string, json: string, close: string) => {
  const m: unknown = JSON.parse(json);
  if (typeof m !== 'object' || m === null) throw new Error('no map data');
  const patched = {
    ...m,
    boundary: {
      clean: false,
      viaShared: { renderer: 1, host: 1 },
      violations: [
        { from: 'src/web/a.ts', to: 'src/host/b.ts', typeOnly: false, kind: 'The renderer imports the host' },
      ],
    },
  };
  return `${open}${JSON.stringify(patched).replaceAll('<', '\\u003c')}${close}`;
});
fs.writeFileSync(path.join(site, 'broken.html'), withViolation);

const note = { id: 'n', type: 'note', x: 0, y: 0, w: 200, h: 100, r: 0, text: 'x' },
  app = await launch({ boards: [{ id: 'b', name: 'B', cards: [note], links: [], tray: [] }], open: 'b' }),
  { page } = app;
const look = () =>
  page.evaluate(() => ({
    areas: document.getElementById('vAreas')?.getAttribute('aria-pressed'),
    files: document.getElementById('vFiles')?.getAttribute('aria-pressed'),
    boundary: document.getElementById('boundary')?.className,
    text: document.getElementById('boundary')?.textContent,
    title: document.getElementById('boundary')?.title,
    top: document.getElementById('topH')?.textContent,
    namesShown: getComputedStyle(document.getElementById('lNames') ?? document.body).display !== 'none',
    cycleShown: getComputedStyle(document.getElementById('lCycle') ?? document.body).display !== 'none',
    nodes: document.querySelectorAll('#gNodes > *').length,
    placeholder: document.getElementById('q')?.getAttribute('placeholder'),
  }));
await page.goto(`file://${path.join(site, 'index.html')}`);
await page.waitForSelector('#gNodes > *');
const first = await look();
assert.deepStrictEqual([first.areas, first.files], ['true', 'false'], 'the page opens on the areas view');
assert.strictEqual(first.top, 'Most connected areas');
assert.deepStrictEqual([first.namesShown, first.cycleShown], [false, false], 'the file-only options are not on screen');
assert(first.nodes < 60, `areas are drawn, not every file (${first.nodes} circles)`);
assert.match(first.placeholder ?? '', /Find an area/);
assert.strictEqual(first.boundary, 'boundary ok');
assert.match(first.text ?? '', /Renderer .* host.*clean/);
assert.match(first.title ?? '', /import each other 0 times/);
await page.click('#vFiles');
const files = await look();
assert.deepStrictEqual([files.areas, files.files], ['false', 'true'], 'Files is one click away');
assert(files.nodes > 200, 'and draws the files');
assert.deepStrictEqual([files.namesShown, files.cycleShown], [true, true], 'and they come back with the files');
assert.match(files.placeholder ?? '', /Find a file/);

await page.goto(`file://${path.join(site, 'broken.html')}`);
await page.waitForSelector('#gNodes > *');
const red = await look();
assert.strictEqual(red.boundary, 'boundary bad', 'a violation turns the status red');
assert.match(red.text ?? '', /1 import cross it/);
assert.match(red.title ?? '', /src\/web\/a\.ts imports src\/host\/b\.ts/);
await app.close();
fs.rmSync(site, { recursive: true, force: true });
console.log('CODE MAP BOUNDARY OK');
