// Builds the code map site into a folder (default: site/): the interactive page, code-map.json, code-map.md and
// the README preview. The Pages workflow runs this on every merge to main.
//   node tools/code-map/build.ts [folder]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { areaOf } from './areas.ts';
import { isClean, problemsWith, readDescriptions } from './descriptions.ts';
import { readGraph } from './graph.ts';
import { renderMarkdown } from './markdown.ts';
import { buildMap } from './model.ts';
import { previewSvg } from './previewSvg.ts';
import type { CodeMap } from './types.ts';

const root = path.resolve(import.meta.dirname, '..', '..');
const here = import.meta.dirname;

function commit() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

// Inside a <script>, only "</script" and "<!--" can end or confuse the tag. In the data every "<" sits inside a string,
// where the escape means the same; in code a "<" can be an operator, so only those two are changed.
const inData = (json: string) => json.replaceAll('<', '\\u003c');
const inCode = (code: string) => code.replaceAll('</script', '<\\/script').replaceAll('<!--', '<\\!--');

async function page(map: CodeMap) {
  const bundle = await build({
    entryPoints: [path.join(here, 'page', 'main.ts')],
    bundle: true,
    write: false,
    minify: true,
    format: 'iife',
    target: 'chrome120',
    platform: 'browser',
    logLevel: 'warning',
  });
  const script = bundle.outputFiles[0]?.text ?? '';
  const template = fs.readFileSync(path.join(here, 'page', 'page.tpl'), 'utf8');
  const css = fs.readFileSync(path.join(here, 'page', 'page.css'), 'utf8');
  return template
    .replace('{{css}}', () => css)
    .replace('{{data}}', () => inData(JSON.stringify(map)))
    .replace('{{script}}', () => inCode(script));
}

const out = path.resolve(process.argv[2] ?? 'site');
const raw = readGraph(root);
const descriptions = readDescriptions();
const problems = problemsWith(
  descriptions,
  raw.files.map(f => f.path),
  [...new Set(raw.files.map(f => areaOf(f.path)))],
);
if (!isClean(problems)) console.warn('Some files or areas have no description: run node tools/code-map/check.ts');

const map = buildMap(raw, descriptions, { commit: commit(), builtAt: new Date().toISOString() });
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), await page(map));
fs.writeFileSync(path.join(out, 'code-map.json'), `${JSON.stringify(map, null, 1)}\n`);
fs.writeFileSync(path.join(out, 'code-map.md'), renderMarkdown(map));
fs.writeFileSync(path.join(out, 'preview.svg'), previewSvg(map));
// a Jekyll build would ignore files that start with an underscore; this site is served as it is
fs.writeFileSync(path.join(out, '.nojekyll'), '');
console.log(
  `code map: ${map.files.length} files, ${map.areas.length} areas, written to ${path.relative(process.cwd(), out) || '.'}`,
);
