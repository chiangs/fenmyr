// Looks one file or area up in the code map, built from the checkout as it is now:
//   node tools/code-map/query.ts src/web/core/history.ts   (or just history.ts, when the name is unique)
//   node tools/code-map/query.ts web/canvas                 (an area)
//   node tools/code-map/query.ts --hubs | --cycle | --areas
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { readDescriptions } from './descriptions.ts';
import { readGraph } from './graph.ts';
import { buildMap } from './model.ts';
import type { CodeMap, MapArea, MapFile } from './types.ts';

const root = path.resolve(import.meta.dirname, '..', '..');
const git = (...args: string[]) => {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
};

const names = (paths: string[]) => (paths.length ? paths.map(p => `  ${p}`).join('\n') : '  none');

function fileText(f: MapFile): string {
  const cycle = f.inCycle ? '\nIn the import cycle: yes' : '';
  return [
    f.path,
    f.description || '(no description yet)',
    `Area: ${f.area}. ${f.lines} lines. ${f.connections} connections, hub rank ${f.hubRank}.${cycle}`,
    '',
    `Imports (${f.imports.length}):`,
    names(f.imports.map(p => (f.typeOnly.includes(p) ? `${p} (type only)` : p))),
    '',
    `Imported by (${f.importedBy.length}):`,
    names(f.importedBy),
  ].join('\n');
}

function areaText(a: MapArea, files: MapFile[]): string {
  const counts = (c: Record<string, number>) =>
    Object.entries(c)
      .sort((x, y) => y[1] - x[1])
      .map(([k, n]) => `  ${k} (${n})`)
      .join('\n') || '  none';
  return [
    a.id,
    a.description || '(no description yet)',
    `${a.files} files, ${a.lines} lines.`,
    '',
    'Imports from:',
    counts(a.importsFrom),
    '',
    'Imported by:',
    counts(a.importedBy),
    '',
    'Files:',
    files
      .filter(f => f.area === a.id)
      .map(f => `  ${f.name}: ${f.description}`)
      .join('\n'),
  ].join('\n');
}

export function answer(map: CodeMap, arg: string): string {
  if (arg === '--hubs')
    return [...map.files]
      .sort((a, b) => a.hubRank - b.hubRank)
      .slice(0, 20)
      .map(f => `${f.hubRank}. ${f.path} (${f.connections}): ${f.description}`)
      .join('\n');
  if (arg === '--areas') return map.areas.map(a => `${a.id} (${a.files} files): ${a.description}`).join('\n');
  if (arg === '--cycle') {
    const c = map.cycles[0];
    return c ? `${c.size} files can reach each other through runtime imports:\n${names(c.files)}` : 'No import cycle.';
  }
  const exact = map.files.find(f => f.path === arg);
  if (exact) return fileText(exact);
  const area = map.areas.find(a => a.id === arg);
  if (area) return areaText(area, map.files);
  const found = map.files.filter(f => f.path.includes(arg));
  if (found.length === 1 && found[0]) return fileText(found[0]);
  if (found.length > 1)
    return `${found.length} files match "${arg}". Use a longer part of the path:\n${names(found.slice(0, 25).map(f => f.path))}`;
  return `Nothing matches "${arg}". Try a path such as src/web/core/history.ts, an area such as web/canvas, or --areas.`;
}

if (import.meta.main) {
  const arg = process.argv[2];
  if (!arg) {
    console.log('Usage: node tools/code-map/query.ts <file or area> | --hubs | --cycle | --areas');
  } else {
    const map = buildMap(readGraph(root), readDescriptions(), {
      commit: git('rev-parse', 'HEAD'),
      builtAt: new Date().toISOString(),
    });
    console.log(answer(map, arg));
  }
}
