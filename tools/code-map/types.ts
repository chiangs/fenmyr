// The shape of code-map.json. A session or a tool reads this file; the page embeds the same data.
export type Zone = 'host' | 'shared' | 'renderer' | 'static' | 'tests' | 'tools';

export type MapFile = {
  path: string;
  name: string;
  dir: string;
  area: string;
  zone: Zone;
  lines: number;
  description: string;
  /** every file this one imports, runtime and type-only */
  imports: string[];
  /** the imports above that are `import type` only, which cost nothing at run time */
  typeOnly: string[];
  importedBy: string[];
  /** imports plus importedBy: what sizes a circle on the page */
  connections: number;
  /** 1 is the most connected file */
  hubRank: number;
  inCycle: boolean;
};

export type MapArea = {
  id: string;
  zone: Zone;
  description: string;
  files: number;
  lines: number;
  /** how many imports go from this area to each other area */
  importsFrom: Record<string, number>;
  importedBy: Record<string, number>;
};

/** one import that crosses the line between the two programs, or between shared code and either of them */
export type Crossing = { from: string; to: string; typeOnly: boolean; kind: string };

/**
 * The renderer and the host are two programs that meet only at src/shared (the bridge contract is src/shared/ops.ts), and
 * shared code imports neither. `violations` is every import that breaks that, type-only included.
 */
export type Boundary = {
  clean: boolean;
  violations: Crossing[];
  /** how many imports of shared code come from each program: where they meet */
  viaShared: { renderer: number; host: number };
};

export type CodeMap = {
  version: 1;
  commit: string;
  builtAt: string;
  areas: MapArea[];
  files: MapFile[];
  boundary: Boundary;
  /** groups of files that import each other round in a circle, over runtime imports, largest first */
  cycles: { size: number; files: string[] }[];
  /** packages from node_modules (Node's own modules left out) and the files that import them */
  external: { package: string; files: string[] }[];
};
