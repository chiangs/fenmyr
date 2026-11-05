// Fails when a source file or an area has no one-line description, or a description is left for something that is gone.
// Descriptions live in tools/code-map/descriptions.json and are what the code map shows beside each file.
import path from 'node:path';
import { areaOf } from './areas.ts';
import { DESCRIPTIONS, isClean, MAX_LENGTH, problemsWith, readDescriptions } from './descriptions.ts';
import { readGraph } from './graph.ts';

const root = path.resolve(import.meta.dirname, '..', '..');
const files = readGraph(root).files.map(f => f.path);
const areas = [...new Set(files.map(areaOf))];
const p = problemsWith(readDescriptions(), files, areas);

const lines: string[] = [];
const report = (list: string[], what: string) => {
  for (const item of list) lines.push(`${item}: ${what}`);
};
report(p.missingFiles, 'no description. Add one line for it to tools/code-map/descriptions.json');
report(p.missingAreas, 'no area description. Add one line for it under "areas" in tools/code-map/descriptions.json');
report(p.staleFiles, 'described, but the file no longer exists. Remove it from tools/code-map/descriptions.json');
report(p.staleAreas, 'described, but no file is in this area. Remove it from tools/code-map/descriptions.json');
report(p.long, `description is longer than ${MAX_LENGTH} characters. Keep it to one line`);

if (!isClean(p)) {
  console.error(lines.join('\n'));
  console.error(`\n${path.relative(root, DESCRIPTIONS)} must describe every source file and area.`);
  process.exit(1);
}
console.log(`code map: ${files.length} files and ${areas.length} areas described`);
