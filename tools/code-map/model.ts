import { areaOf, zoneOf } from './areas.ts';
import type { Descriptions } from './descriptions.ts';
import type { RawGraph } from './graph.ts';
import type { CodeMap, MapArea, MapFile } from './types.ts';

// groups of files that can reach each other through runtime imports (Tarjan), largest first
function cyclesOf(paths: string[], edges: RawGraph['edges']): string[][] {
  const next = new Map<string, string[]>(paths.map(p => [p, []]));
  for (const e of edges) if (!e.typeOnly) next.get(e.from)?.push(e.to);
  const index = new Map<string, number>(),
    low = new Map<string, number>(),
    on = new Set<string>(),
    stack: string[] = [],
    groups: string[][] = [];
  let counter = 0;
  const visit = (v: string) => {
    index.set(v, counter);
    low.set(v, counter++);
    stack.push(v);
    on.add(v);
    for (const w of next.get(v) ?? []) {
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v) ?? 0, low.get(w) ?? 0));
      } else if (on.has(w)) low.set(v, Math.min(low.get(v) ?? 0, index.get(w) ?? 0));
    }
    if (low.get(v) !== index.get(v)) return;
    const group: string[] = [];
    for (let w = stack.pop(); w !== undefined; w = stack.pop()) {
      on.delete(w);
      group.push(w);
      if (w === v) break;
    }
    if (group.length > 1) groups.push(group.sort());
  };
  for (const p of paths) if (!index.has(p)) visit(p);
  return groups.sort((a, b) => b.length - a.length);
}

function areaInfo(files: MapFile[], d: Descriptions): MapArea[] {
  const byPath = new Map(files.map(f => [f.path, f]));
  const areas = new Map<string, MapArea>();
  for (const f of files) {
    const a = areas.get(f.area) ?? {
      id: f.area,
      zone: f.zone,
      description: d.areas[f.area] ?? '',
      files: 0,
      lines: 0,
      importsFrom: {},
      importedBy: {},
    };
    a.files++;
    a.lines += f.lines;
    areas.set(f.area, a);
  }
  for (const f of files)
    for (const to of f.imports) {
      const other = byPath.get(to);
      const mine = areas.get(f.area),
        theirs = other && areas.get(other.area);
      if (!other || !mine || !theirs || mine === theirs) continue;
      mine.importsFrom[theirs.id] = (mine.importsFrom[theirs.id] ?? 0) + 1;
      theirs.importedBy[mine.id] = (theirs.importedBy[mine.id] ?? 0) + 1;
    }
  return [...areas.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function buildMap(raw: RawGraph, d: Descriptions, meta: { commit: string; builtAt: string }): CodeMap {
  const imports = new Map<string, string[]>(raw.files.map(f => [f.path, []])),
    typeOnly = new Map<string, string[]>(raw.files.map(f => [f.path, []])),
    importedBy = new Map<string, string[]>(raw.files.map(f => [f.path, []]));
  for (const e of raw.edges) {
    imports.get(e.from)?.push(e.to);
    importedBy.get(e.to)?.push(e.from);
    if (e.typeOnly) typeOnly.get(e.from)?.push(e.to);
  }
  const cycles = cyclesOf(
    raw.files.map(f => f.path),
    raw.edges,
  );
  const cyclic = new Set(cycles.flat());
  const files: MapFile[] = raw.files.map(f => {
    const area = areaOf(f.path),
      out = (imports.get(f.path) ?? []).sort(),
      into = (importedBy.get(f.path) ?? []).sort();
    return {
      path: f.path,
      name: f.path.split('/').pop() ?? f.path,
      dir: f.path.split('/').slice(0, -1).join('/'),
      area,
      zone: zoneOf(area),
      lines: f.lines,
      description: d.files[f.path] ?? '',
      imports: out,
      typeOnly: (typeOnly.get(f.path) ?? []).sort(),
      importedBy: into,
      connections: out.length + into.length,
      hubRank: 0,
      inCycle: cyclic.has(f.path),
    };
  });
  const ranked = [...files].sort((a, b) => b.connections - a.connections || a.path.localeCompare(b.path));
  for (const [i, f] of ranked.entries()) f.hubRank = i + 1;
  return {
    version: 1,
    commit: meta.commit,
    builtAt: meta.builtAt,
    areas: areaInfo(files, d),
    files,
    cycles: cycles.map(g => ({ size: g.length, files: g })),
    external: [...raw.external]
      .map(([pkg, set]) => ({ package: pkg, files: [...set].sort() }))
      .sort((a, b) => b.files.length - a.files.length || a.package.localeCompare(b.package)),
  };
}
