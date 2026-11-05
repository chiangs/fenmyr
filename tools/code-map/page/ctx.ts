import { type Tint, tints } from '../palette.ts';
import type { CodeMap, MapArea, MapFile } from '../types.ts';
import type { Filter, Mode, VGraph, VNode } from '../visible.ts';

export type State = {
  view: Mode;
  filter: Filter;
  names: boolean;
  cycle: boolean;
  area: string | null;
  words: string[];
  sel: VNode | null;
  hover: VNode | null;
};

export const state: State = {
  view: 'files',
  filter: { tests: false, tools: false, types: true },
  names: true,
  cycle: false,
  area: null,
  words: [],
  sel: null,
  hover: null,
};

type Loaded = {
  map: CodeMap;
  tint: Map<string, Tint>;
  files: Map<string, MapFile>;
  areas: Map<string, MapArea>;
  graph: VGraph;
};
let loaded: Loaded | null = null;

export function load(map: CodeMap) {
  loaded = {
    map,
    tint: tints(map.areas.map(a => a.id)),
    files: new Map(map.files.map(f => [f.path, f])),
    areas: new Map(map.areas.map(a => [a.id, a])),
    graph: { mode: 'files', nodes: [], edges: [], byKey: new Map() },
  };
}

export function data(): Loaded {
  if (!loaded) throw new Error('the code map is not loaded');
  return loaded;
}
