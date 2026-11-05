import { hsl } from '../palette.ts';
import type { VEdge, VGraph, VNode } from '../visible.ts';
import { cam } from './camera.ts';
import { data, state } from './ctx.ts';
import { byId, svg } from './h.ts';

const edgeEls = new Map<VEdge, SVGPathElement>();
const nodeEls = new Map<VNode, SVGGElement>();
const labelEls = new Map<VNode, SVGTextElement>();
const clusterEls = new Map<string, SVGTextElement>();
const owner = new WeakMap<Element, VNode>();
// labels shown only while a circle is active, so they can be taken away again
const temporary = new Set<VNode>();

export const colourOf = (area: string) => hsl(data().tint.get(area), 'var(--nl)');
const labelled = (g: VGraph, n: VNode) => g.mode === 'areas' || (state.names && n.rank < 16);

export function nodeAt(target: EventTarget | null): VNode | null {
  const hit = target instanceof Element ? target.closest('g.node') : null;
  return hit ? (owner.get(hit) ?? null) : null;
}

function labelFor(n: VNode) {
  const t = svg('text', { class: 'lbl', 'text-anchor': 'middle' }, byId('gLabels', SVGGElement));
  t.textContent = n.label;
  labelEls.set(n, t);
  return t;
}

export function draw(g: VGraph) {
  for (const id of ['gClusters', 'gEdges', 'gNodes', 'gLabels']) byId(id, SVGGElement).replaceChildren();
  for (const m of [edgeEls, nodeEls, labelEls, clusterEls]) m.clear();
  temporary.clear();
  for (const e of g.edges) edgeEls.set(e, svg('path', { class: 'edge' }, byId('gEdges', SVGGElement)));
  for (const n of g.nodes) {
    const el = svg('g', { class: 'node' }, byId('gNodes', SVGGElement));
    svg('circle', { r: n.r.toFixed(1) }, el).style.fill = colourOf(n.area);
    owner.set(el, n);
    nodeEls.set(n, el);
    if (labelled(g, n)) labelFor(n);
  }
  if (g.mode === 'files') {
    const counts = new Map<string, number>();
    for (const n of g.nodes) counts.set(n.area, (counts.get(n.area) ?? 0) + 1);
    for (const [area, count] of counts) {
      if (count < 2) continue;
      const t = svg('text', { class: 'area-lbl' }, byId('gClusters', SVGGElement));
      t.textContent = area;
      clusterEls.set(area, t);
    }
  }
  paint(g);
  place(g);
}

const curve = (e: VEdge, areas: boolean) => {
  const { a, b } = e,
    start = `M${a.x.toFixed(1)} ${a.y.toFixed(1)}`,
    end = `${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  if (!areas) return `${start}L${end}`;
  const cx = ((a.x + b.x) / 2 - (b.y - a.y) * 0.14).toFixed(1),
    cy = ((a.y + b.y) / 2 + (b.x - a.x) * 0.14).toFixed(1);
  return `${start}Q${cx} ${cy} ${end}`;
};

function placeLabels() {
  for (const [n, el] of labelEls) {
    el.setAttribute('x', n.x.toFixed(1));
    el.setAttribute('y', (n.y + n.r + 11 / cam.k).toFixed(1));
  }
}

export function place(g: VGraph) {
  for (const [e, el] of edgeEls) el.setAttribute('d', curve(e, g.mode === 'areas'));
  for (const [n, el] of nodeEls) el.setAttribute('transform', `translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})`);
  placeLabels();
  if (g.mode !== 'files') return;
  const sums = new Map<string, { x: number; n: number; top: number }>();
  for (const n of g.nodes) {
    const s = sums.get(n.area) ?? { x: 0, n: 0, top: Infinity };
    s.x += n.x;
    s.n++;
    s.top = Math.min(s.top, n.y - n.r);
    sums.set(n.area, s);
  }
  for (const [area, el] of clusterEls) {
    const s = sums.get(area);
    if (!s) continue;
    el.setAttribute('x', (s.x / s.n).toFixed(1));
    el.setAttribute('y', (s.top - 8 / cam.k).toFixed(1));
  }
}

const matches = (g: VGraph, n: VNode) => {
  const hay = (g.mode === 'files' ? (n.path ?? '') : n.area).toLowerCase();
  return state.words.every(w => hay.includes(w));
};

// Hover or selection shows what a circle imports and what imports it; search and area focus fade the rest.
export function paint(g: VGraph) {
  const active = state.hover ?? state.sel,
    outs = new Set(active?.out),
    ins = new Set(active?.inn),
    searching = state.words.length > 0,
    focusing = state.area !== null && g.mode === 'files',
    few = outs.size + ins.size <= 30;
  const faded = new Set<VNode>();
  for (const n of g.nodes) {
    let dim = false;
    if (active) dim = n !== active && !outs.has(n) && !ins.has(n);
    if (!dim && searching) dim = !matches(g, n);
    if (!dim && focusing) dim = n.area !== state.area;
    if (dim) faded.add(n);
    const el = nodeEls.get(n);
    el?.classList.toggle('dim', dim);
    el?.classList.toggle('sel', n === state.sel);
    const inCycle = n.path ? !!data().files.get(n.path)?.inCycle : false;
    el?.classList.toggle('cyc', state.cycle && g.mode === 'files' && inCycle);
    const want = labelled(g, n) || (!!active && (n === active || (few && (outs.has(n) || ins.has(n)))));
    if (want && !labelEls.has(n)) {
      temporary.add(n);
      labelFor(n);
    } else if (!want && temporary.has(n)) {
      labelEls.get(n)?.remove();
      labelEls.delete(n);
      temporary.delete(n);
    }
    labelEls.get(n)?.classList.toggle('dim', dim);
  }
  for (const [e, el] of edgeEls) {
    const out = !!active && e.a === active,
      inn = !!active && e.b === active;
    el.classList.toggle('out', out);
    el.classList.toggle('in', inn && !out);
    el.classList.toggle('dim', active ? !(out || inn) : (searching || focusing) && (faded.has(e.a) || faded.has(e.b)));
  }
  for (const [area, el] of clusterEls) el.classList.toggle('dim', focusing && area !== state.area);
  placeLabels();
  const top = active ? nodeEls.get(active) : undefined;
  if (top) top.parentNode?.appendChild(top);
}
