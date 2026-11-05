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

export type CodeMap = {
  version: 1;
  commit: string;
  builtAt: string;
  areas: MapArea[];
  files: MapFile[];
  /** groups of files that import each other round in a circle, over runtime imports, largest first */
  cycles: { size: number; files: string[] }[];
  /** packages from node_modules (Node's own modules left out) and the files that import them */
  external: { package: string; files: string[] }[];
};
