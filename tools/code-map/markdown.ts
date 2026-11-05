import type { CodeMap, MapFile } from './types.ts';

const top = (counts: Record<string, number>, n = 6) =>
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([area, count]) => `${area} (${count})`)
    .join(', ');

const line = (f: MapFile) => {
  const flag = f.inCycle ? ', in the import cycle' : '';
  return `- \`${f.name}\` [imported by ${f.importedBy.length}, imports ${f.imports.length}${flag}]: ${f.description}`;
};

// A compact index of the whole codebase for reading, a session at a time. The full graph is in code-map.json.
export function renderMarkdown(map: CodeMap): string {
  const out: string[] = [];
  const short = map.commit.slice(0, 7);
  out.push(
    '# Fenmyr code map',
    '',
    `Built from commit ${short} on ${map.builtAt.slice(0, 10)}. One line for each source file and area, and how they import one another.`,
    'The same data as JSON is in code-map.json. To look one file up in a checkout, run `node tools/code-map/query.ts <file>`.',
    '',
    'In each line, "imported by" is how many files import it and "imports" is how many files it imports. Type-only imports are counted.',
    '',
    '## Areas',
    '',
    '| Area | Files | Lines | What it is for |',
    '|---|---|---|---|',
  );
  for (const a of map.areas) out.push(`| ${a.id} | ${a.files} | ${a.lines} | ${a.description} |`);
  out.push('', '## Most connected files', '', 'Changing one of these affects the most other files.', '');
  [...map.files]
    .sort((a, b) => a.hubRank - b.hubRank)
    .slice(0, 15)
    .forEach(f => {
      const connections = f.connections === 1 ? '1 connection' : `${f.connections} connections`;
      out.push(`${f.hubRank}. \`${f.path}\` (${connections}): ${f.description}`);
    });
  const cycle = map.cycles[0];
  if (cycle) {
    out.push(
      '',
      '## Import cycle',
      '',
      `${cycle.size} files can reach each other through runtime imports, so a change to one can reach any of the others. These files are marked "in the import cycle" below. The full list is in code-map.json.`,
    );
  }
  out.push('', '## Files by area');
  for (const a of map.areas) {
    out.push('', `### ${a.id}`, '', a.description, '');
    const from = top(a.importsFrom),
      by = top(a.importedBy);
    if (from) out.push(`Imports from: ${from}.`);
    if (by) out.push(`Imported by: ${by}.`);
    if (from || by) out.push('');
    for (const f of map.files) if (f.area === a.id) out.push(line(f));
  }
  out.push('');
  return out.join('\n');
}
