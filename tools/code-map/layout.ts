import type { CodeMap } from './types.ts';
import { areasGraph, type Filter, filesGraph, type Mode, type VGraph, type VNode } from './visible.ts';

export type Positions = ReadonlyMap<string, { x: number; y: number }>;

// the same circles in the same places every time, so the page and the preview image agree
function seeded() {
  let s = 7;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

// Areas sit where a layout of the areas themselves puts them, so areas that import each other end up near each other.
function homesOf(map: CodeMap, f: Filter, mode: Mode, aspect: number, nodes: VNode[]) {
  const homes = new Map<string, { x: number; y: number }>();
  if (mode === 'files') {
    const ag = areasGraph(map, f);
    arrange(ag, new Map(), ringHomes(ag.nodes));
    const wide = Math.min(1.9, Math.max(1, aspect));
    for (const n of ag.nodes) homes.set(n.area, { x: n.x * 1.55 * wide, y: n.y * 1.55 });
    return homes;
  }
  return ringHomes(nodes);
}

function ringHomes(nodes: VNode[]) {
  const homes = new Map<string, { x: number; y: number }>();
  const list = nodes.map(n => n.area).sort();
  const radius = 90 + 60 * Math.sqrt(list.length);
  list.forEach((a, i) => {
    const t = (i / list.length) * Math.PI * 2 - Math.PI / 2;
    homes.set(a, { x: Math.cos(t) * radius, y: Math.sin(t) * radius });
  });
  return homes;
}

function arrange(g: VGraph, previous: Positions, homes: ReadonlyMap<string, { x: number; y: number }>) {
  const rnd = seeded();
  let fresh = 0;
  for (const n of g.nodes) {
    const home = homes.get(n.area) ?? { x: 0, y: 0 },
      was = previous.get(n.key);
    n.hx = home.x;
    n.hy = home.y;
    n.x = was ? was.x : home.x + (rnd() - 0.5) * 120;
    n.y = was ? was.y : home.y + (rnd() - 0.5) * 120;
    n.vx = n.vy = 0;
    n.fixed = false;
    n.placed = !!was;
    if (!was) fresh++;
  }
  for (const e of g.edges) {
    e.da = Math.max(1, e.a.out.length + e.a.inn.length);
    e.db = Math.max(1, e.b.out.length + e.b.inn.length);
    if (g.mode === 'files') {
      e.k = Math.min(1, 1 / Math.min(e.da, e.db)) * (e.a.area === e.b.area ? 1 : 0.3);
      e.len = 22 + e.a.r + e.b.r;
    } else {
      e.k = Math.min(0.6, 0.12 + e.w / 30);
      e.len = 150 + e.a.r + e.b.r;
    }
  }
  const iterations = fresh > g.nodes.length / 2 ? 420 : 120;
  for (let i = 0; i < iterations; i++) tick(g, 0.015 ** (i / iterations));
}

export function layout(map: CodeMap, f: Filter, mode: Mode, aspect: number, previous: Positions = new Map()): VGraph {
  const g = mode === 'files' ? filesGraph(map, f) : areasGraph(map, f);
  arrange(g, previous, homesOf(map, f, mode, aspect, g.nodes));
  return g;
}

// one step of the simulation: circles push each other apart, imports pull them together, areas pull their files home
export function tick(g: VGraph, alpha: number) {
  const nodes = g.nodes,
    files = g.mode === 'files';
  const charge = files ? 60 : 520,
    reach = files ? 190 : 520,
    gravity = files ? 0.22 : 0.012;
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    if (!a) continue;
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      if (!b) continue;
      let dx = b.x - a.x,
        dy = b.y - a.y,
        d2 = dx * dx + dy * dy;
      if (d2 > reach * reach) continue;
      if (d2 < 1e-4) {
        dx = 0.01;
        dy = i % 2 ? 0.01 : -0.01;
        d2 = dx * dx + dy * dy;
      }
      const d = Math.sqrt(d2),
        push = (charge * alpha) / d2,
        ca = 1 + a.r / 5,
        cb = 1 + b.r / 5;
      a.vx -= dx * push * cb;
      a.vy -= dy * push * cb;
      b.vx += dx * push * ca;
      b.vy += dy * push * ca;
      const gap = a.r + b.r + (files ? 2.5 : 10);
      if (d < gap) {
        const f = ((gap - d) / d) * 0.5;
        a.vx -= dx * f;
        a.vy -= dy * f;
        b.vx += dx * f;
        b.vy += dy * f;
      }
    }
  }
  for (const e of g.edges) {
    const dx = e.b.x - e.a.x,
      dy = e.b.y - e.a.y,
      d = Math.sqrt(dx * dx + dy * dy) || 1e-3,
      f = ((d - e.len) / d) * alpha * e.k,
      bias = e.da / (e.da + e.db);
    e.b.vx -= dx * f * bias;
    e.b.vy -= dy * f * bias;
    e.a.vx += dx * f * (1 - bias);
    e.a.vy += dy * f * (1 - bias);
  }
  for (const n of nodes) {
    n.vx += (n.hx - n.x) * gravity * alpha;
    n.vy += (n.hy - n.y) * gravity * alpha;
    if (!files) {
      n.vx -= n.x * 0.004 * alpha;
      n.vy -= n.y * 0.004 * alpha;
    }
    if (n.fixed) {
      n.vx = n.vy = 0;
      continue;
    }
    n.vx *= 0.55;
    n.vy *= 0.55;
    n.x += n.vx;
    n.y += n.vy;
  }
}
