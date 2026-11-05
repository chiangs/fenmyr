import type { CodeMap, Zone } from './types.ts';

export type Filter = { tests: boolean; tools: boolean; types: boolean };
export type Mode = 'files' | 'areas';

// A circle on the graph: a file, or in the areas view a whole area. The position and speed belong to the layout.
export type VNode = {
  key: string;
  label: string;
  area: string;
  path: string | null;
  files: number;
  lines: number;
  deg: number;
  r: number;
  rank: number;
  out: VNode[];
  inn: VNode[];
  x: number;
  y: number;
  vx: number;
  vy: number;
  hx: number;
  hy: number;
  fixed: boolean;
  placed: boolean;
};
export type VEdge = { a: VNode; b: VNode; w: number; k: number; len: number; da: number; db: number };
export type VGraph = { mode: Mode; nodes: VNode[]; edges: VEdge[]; byKey: Map<string, VNode> };

const shown = (zone: Zone, f: Filter) => (f.tests || zone !== 'tests') && (f.tools || zone !== 'tools');

function node(key: string, label: string, area: string): VNode {
  return {
    key,
    label,
    area,
    path: null,
    files: 0,
    lines: 0,
    deg: 0,
    r: 4,
    rank: 0,
    out: [],
    inn: [],
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    hx: 0,
    hy: 0,
    fixed: false,
    placed: false,
  };
}

function finish(mode: Mode, nodes: VNode[], edges: VEdge[], size: (deg: number) => number): VGraph {
  for (const e of edges) {
    e.a.out.push(e.b);
    e.b.inn.push(e.a);
    e.a.deg += e.w;
    e.b.deg += e.w;
  }
  for (const n of nodes) n.r = size(n.deg);
  const ranked = [...nodes].sort((a, b) => b.deg - a.deg);
  for (const [i, n] of ranked.entries()) n.rank = i;
  return { mode, nodes, edges, byKey: new Map(nodes.map(n => [n.key, n])) };
}
const edge = (a: VNode, b: VNode, w: number): VEdge => ({ a, b, w, k: 0, len: 0, da: 1, db: 1 });

export function filesGraph(map: CodeMap, f: Filter): VGraph {
  const files = map.files.filter(x => shown(x.zone, f));
  const nodes = files.map(x => {
    const n = node(x.path, x.name, x.area);
    n.path = x.path;
    n.lines = x.lines;
    return n;
  });
  const byKey = new Map(nodes.map(n => [n.key, n]));
  const edges: VEdge[] = [];
  for (const x of files) {
    const a = byKey.get(x.path);
    for (const to of x.imports) {
      const b = byKey.get(to);
      if (a && b && (f.types || !x.typeOnly.includes(to))) edges.push(edge(a, b, 1));
    }
  }
  return finish('files', nodes, edges, deg => 3.2 + 1.6 * Math.sqrt(deg));
}

// one circle per area; a line for the imports that cross from one area to another
export function areasGraph(map: CodeMap, f: Filter): VGraph {
  const files = map.files.filter(x => shown(x.zone, f));
  const kept = new Set(files.map(x => x.path));
  const areaOfPath = new Map(map.files.map(x => [x.path, x.area]));
  const byArea = new Map<string, VNode>();
  for (const x of files) {
    const n = byArea.get(x.area) ?? node(x.area, x.area, x.area);
    n.files++;
    n.lines += x.lines;
    byArea.set(x.area, n);
  }
  const weights = new Map<string, number>();
  for (const x of files)
    for (const to of x.imports) {
      const there = areaOfPath.get(to);
      if (!kept.has(to) || !there || there === x.area || (!f.types && x.typeOnly.includes(to))) continue;
      const key = `${x.area}\u0001${there}`;
      weights.set(key, (weights.get(key) ?? 0) + 1);
    }
  const edges: VEdge[] = [];
  for (const [key, w] of weights) {
    const [from, to] = key.split('\u0001');
    const a = byArea.get(from ?? ''),
      b = byArea.get(to ?? '');
    if (a && b) edges.push(edge(a, b, w));
  }
  return finish('areas', [...byArea.values()], edges, deg => Math.min(64, 9 + 2.3 * Math.sqrt(deg)));
}
