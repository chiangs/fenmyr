import { layout } from '../layout.ts';
import { parseCodeMap } from '../parse.ts';
import type { VNode } from '../visible.ts';
import { centreOn, fit, size } from './camera.ts';
import { data, load, state } from './ctx.ts';
import { byId } from './h.ts';
import { renderDetail, renderFacts, renderLegend, renderStats, renderTop } from './panel.ts';
import { wirePointer } from './pointer.ts';
import { draw, paint, place } from './scene.ts';

function rebuild(keepView: boolean) {
  const old = data().graph;
  const same = old.mode === state.view;
  const previous = new Map(same ? old.nodes.map(n => [n.key, { x: n.x, y: n.y }]) : []);
  const s = size();
  const g = layout(data().map, state.filter, state.view, s.w / (s.h || 1), previous);
  data().graph = g;
  state.sel = state.sel ? (g.byKey.get(state.sel.key) ?? null) : null;
  state.hover = null;
  draw(g);
  renderTop(g);
  renderDetail(g);
  if (!keepView) fit(g);
}

function select(n: VNode | null) {
  state.sel = n;
  paint(data().graph);
  renderDetail(data().graph);
}

function setView(view: 'files' | 'areas') {
  if (state.view === view) return;
  state.view = view;
  state.sel = null;
  byId('vFiles', HTMLButtonElement).setAttribute('aria-pressed', String(view === 'files'));
  byId('vAreas', HTMLButtonElement).setAttribute('aria-pressed', String(view === 'areas'));
  for (const id of ['lNames', 'lCycle']) byId(id, HTMLElement).hidden = view === 'areas';
  rebuild(false);
}

function clearAll() {
  state.area = null;
  state.words = [];
  byId('q', HTMLInputElement).value = '';
  renderLegend();
  select(null);
}

function wireControls() {
  const box = (id: string, apply: (on: boolean) => void) => {
    const input = byId(id, HTMLInputElement);
    input.addEventListener('change', () => apply(input.checked));
  };
  byId('vFiles', HTMLButtonElement).addEventListener('click', () => setView('files'));
  byId('vAreas', HTMLButtonElement).addEventListener('click', () => setView('areas'));
  byId('fit', HTMLButtonElement).addEventListener('click', () => fit(data().graph));
  box('cTests', on => {
    state.filter.tests = on;
    rebuild(true);
  });
  box('cTools', on => {
    state.filter.tools = on;
    rebuild(true);
  });
  box('cTypes', on => {
    state.filter.types = on;
    rebuild(true);
  });
  box('cNames', on => {
    state.names = on;
    draw(data().graph);
  });
  box('cCycle', on => {
    state.cycle = on;
    paint(data().graph);
  });
  const q = byId('q', HTMLInputElement);
  q.addEventListener('input', () => {
    state.words = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    paint(data().graph);
  });
  q.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !state.words.length) return;
    const g = data().graph;
    const hit = g.nodes
      .filter(n => state.words.every(w => (g.mode === 'files' ? (n.path ?? '') : n.area).toLowerCase().includes(w)))
      .sort((a, b) => b.deg - a.deg)[0];
    if (!hit) return;
    select(hit);
    centreOn(hit.x, hit.y);
    place(g);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && (state.sel || state.area || state.words.length)) clearAll();
  });
  document.addEventListener('click', e => {
    const button = e.target instanceof Element ? e.target.closest('button') : null;
    if (!button) return;
    const g = data().graph;
    if (button.dataset.act === 'clear') return select(null);
    if (button.dataset.act === 'files' && state.sel) {
      const area = state.sel.area;
      setView('files');
      state.area = area;
      renderLegend();
      return paint(data().graph);
    }
    const area = button.dataset.a;
    if (area) {
      state.area = state.area === area ? null : area;
      renderLegend();
      return paint(g);
    }
    const n = button.dataset.k ? g.byKey.get(button.dataset.k) : undefined;
    if (n) {
      select(n);
      centreOn(n.x, n.y);
      place(g);
    }
  });
  let timer = 0;
  new ResizeObserver(() => {
    clearTimeout(timer);
    timer = window.setTimeout(() => fit(data().graph), 120);
  }).observe(byId('stage', HTMLElement));
}

function start() {
  const raw: unknown = JSON.parse(document.getElementById('code-map-data')?.textContent ?? 'null');
  const map = parseCodeMap(raw);
  if (!map) {
    document.body.textContent = 'The code map data could not be read.';
    return;
  }
  load(map);
  renderStats();
  renderFacts();
  renderLegend();
  wirePointer(select);
  wireControls();
  rebuild(false);
}

start();
