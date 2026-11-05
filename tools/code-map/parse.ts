import type { CodeMap, MapArea, MapFile, Zone } from './types.ts';

// code-map.json comes from disk or a web page, so it is unknown until it has been checked field by field here
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const ZONES: Zone[] = ['host', 'shared', 'renderer', 'static', 'tests', 'tools'];
const zone = (v: unknown): Zone => ZONES.find(z => z === v) ?? 'tools';

function counts(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (isRecord(v)) for (const [k, n] of Object.entries(v)) out[k] = num(n);
  return out;
}

function file(v: unknown): MapFile | null {
  if (!isRecord(v) || !str(v.path)) return null;
  return {
    path: str(v.path),
    name: str(v.name),
    dir: str(v.dir),
    area: str(v.area),
    zone: zone(v.zone),
    lines: num(v.lines),
    description: str(v.description),
    imports: list(v.imports),
    typeOnly: list(v.typeOnly),
    importedBy: list(v.importedBy),
    connections: num(v.connections),
    hubRank: num(v.hubRank),
    inCycle: v.inCycle === true,
  };
}

function area(v: unknown): MapArea | null {
  if (!isRecord(v) || !str(v.id)) return null;
  return {
    id: str(v.id),
    zone: zone(v.zone),
    description: str(v.description),
    files: num(v.files),
    lines: num(v.lines),
    importsFrom: counts(v.importsFrom),
    importedBy: counts(v.importedBy),
  };
}

const some = <T>(v: unknown, read: (x: unknown) => T | null): T[] =>
  Array.isArray(v) ? v.map(read).filter((x): x is T => x !== null) : [];

export function parseCodeMap(raw: unknown): CodeMap | null {
  if (!isRecord(raw) || raw.version !== 1) return null;
  return {
    version: 1,
    commit: str(raw.commit),
    builtAt: str(raw.builtAt),
    areas: some(raw.areas, area),
    files: some(raw.files, file),
    cycles: some(raw.cycles, c => (isRecord(c) ? { size: num(c.size), files: list(c.files) } : null)),
    external: some(raw.external, x => (isRecord(x) ? { package: str(x.package), files: list(x.files) } : null)),
  };
}
