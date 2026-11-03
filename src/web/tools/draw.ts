import { cardEl } from '../ui/dom.ts';
import { toWorld } from '../canvas/handles.ts';
import { renderCard } from '../canvas/render.ts';
import { selectOnly } from '../canvas/wires.ts';
import { colorLabel } from '../core/base.ts';
import { $, stage, world } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { card } from '../model/boards.ts';
import { stopPlacing } from './place.ts';
import { session } from '../core/state.ts';
import { INKS, PEN_SIZE, inkPath, penW } from './ink.ts';
import { type InkPoint, isRecord } from '../../shared/model.ts';
import { closestTo, htmlIn } from '../ui/dom.ts';

// the drawing in progress: points with times, and the pen it's drawn with
type Stroke = { pts: InkPoint[]; tool: string; size: number; color: string };

// ---------- drawing: a soft ink (it swells when you slow down and tapers at the ends), plus a marker, a highlighter and an easy eraser ----------
// your pen: the tool, its old s / m / l size, the colour, and each tool's own thickness
const pen: { tool: string; size: string; color: string; sizes: Record<string, number> } = {
  tool: 'pen',
  size: 'm',
  color: 'ink',
  sizes: {},
};

export let drawOn = false;
let stroke: Stroke | null = null;
let erasing = false;
let liveSvg: SVGSVGElement | null = null;
let sizingT: ReturnType<typeof setTimeout> | undefined;

// any thickness, not just three: each tool keeps its own (old drawings saved as s / m / l still read from PEN_SIZE)
const PEN_RANGE: Record<string, [number, number]> = { pen: [2, 48], marker: [2, 40], hi: [8, 72], eraser: [10, 90] };

const range = (): [number, number] => PEN_RANGE[pen.tool] || [2, 48];

const curSize = () => pen.sizes[pen.tool] || 9;

const sizeToT = (v: number) => {
  const [a, b] = range();
  return Math.pow((v - a) / (b - a), 1 / 1.7);
};
// a gentle curve: fine control at the thin end
const tToSize = (t: number) => {
  const [a, b] = range();
  return Math.round(a + (b - a) * Math.pow(Math.min(1, Math.max(0, t)), 1.7));
};

function setSize(v: number) {
  const [a, b] = range();
  pen.sizes[pen.tool] = Math.min(b, Math.max(a, Math.round(v)));
  paintSize();
  try {
    localStorage.setItem('fenmyr:pen', JSON.stringify(pen));
  } catch (e) {}
}

function paintSize() {
  const v = curSize(),
    t = sizeToT(v),
    er = pen.tool === 'eraser',
    col = er ? 'transparent' : pen.color === 'ink' ? 'var(--pen-ink)' : INKS[pen.color] || pen.color;
  $('dbsFill').style.width = `calc(${t * 100}% + ${9 - t * 18}px)`;
  $('dbsKnob').style.left = `calc(${t * 100}% + ${9 - t * 18}px)`;
  $('dbsVal').textContent = String(v);
  const dot = $('dbsDot'),
    d = Math.min(22, Math.max(3, v * (er ? 0.35 : 0.6)));
  Object.assign(dot.style, {
    width: d + 'px',
    height: d + 'px',
    background: col,
    opacity: pen.tool === 'hi' ? '0.45' : '1',
  });
  dot.classList.toggle('er', er);
  // the bubble over the knob shows the true size on the board right now (at this zoom)
  const bub = $('dbsBub').firstElementChild;
  if (!(bub instanceof HTMLElement)) return;
  const bd = Math.min(110, Math.max(2, er ? v : v * session.view.z));
  Object.assign(bub.style, {
    width: bd + 'px',
    height: bd + 'px',
    background: col,
    opacity: pen.tool === 'hi' ? '0.45' : '1',
  });
  bub.classList.toggle('er', er);
  const ring = document.getElementById('eraseRing');
  if (ring) Object.assign(ring.style, { width: v + 'px', height: v + 'px', margin: `${-v / 2}px 0 0 ${-v / 2}px` });
}

function renderDrawbar() {
  $('dbColors').innerHTML = Object.entries(INKS)
    .map(([n, c]) => {
      const label = colorLabel(n),
        bg = n === 'ink' ? 'var(--pen-ink)' : c,
        on = pen.color === n ? 'on' : '';
      return `<button data-ink="${n}" title="${label}" style="background:${bg}" class="${on}"></button>`;
    })
    .join('');
  for (const b of htmlIn($('drawbar'), '[data-pen]')) b.classList.toggle('on', b.dataset.pen === pen.tool);
  paintSize();
  stage.classList.toggle('erasing', drawOn && pen.tool === 'eraser');
  stage.classList.toggle('drawing', drawOn && pen.tool !== 'eraser');
  try {
    localStorage.setItem('fenmyr:pen', JSON.stringify(pen));
  } catch (e) {}
}

export function enterDraw() {
  if (pen.tool === 'eraser') pen.tool = 'pen';
  stopPlacing();
  selectOnly([]);
  session.selWire = null;
  drawOn = true;
  $('dock').classList.add('drawing');
  renderDrawbar();
  if (!liveSvg) {
    liveSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    liveSvg.classList.add('live-ink');
    world.appendChild(liveSvg);
    const ring = document.createElement('div');
    ring.className = 'erase-ring';
    ring.id = 'eraseRing';
    stage.appendChild(ring);
  }
}

export function exitDraw() {
  drawOn = false;
  stroke = null;
  erasing = false;
  $('dock').classList.remove('drawing');
  stage.classList.remove('drawing', 'erasing');
  if (liveSvg) liveSvg.innerHTML = '';
}

export const O = 5000;

export function drawDown(e: PointerEvent) {
  const w = toWorld(e.clientX, e.clientY);
  stage.setPointerCapture(e.pointerId);
  if (pen.tool === 'eraser') {
    erasing = true;
    eraseAt(e);
    return;
  }
  stroke = { pts: [[w.x, w.y, performance.now()]], tool: pen.tool, size: curSize(), color: pen.color };
  if (liveSvg) liveSvg.innerHTML = '';
}

function eraseAt(e: PointerEvent) {
  const w = toWorld(e.clientX, e.clientY),
    r = (pen.sizes.eraser || 28) / 2 / session.view.z;
  let hit = false; // the eraser is a size on screen, like the ring you see
  session.board.cards.forEach(c => {
    if (c.type !== 'ink') return;
    {
      const sx = c.w / c.ow,
        sy = c.h / c.oh,
        half = penW(c.pen, c.size) / 2;
      if (w.x < c.x - r - half || w.x > c.x + c.w + r + half || w.y < c.y - r - half || w.y > c.y + c.h + r + half)
        return;
      if (c.pts.some(p => Math.hypot(c.x + p[0] * sx - w.x, c.y + p[1] * sy - w.y) < r + half)) {
        hit = true;
        session.board.cards = session.board.cards.filter(x => x !== c);
        const el = cardEl(c.id);
        if (el) {
          el.classList.add('fading');
          setTimeout(() => el.remove(), 260);
        }
      }
    }
  });
  if (hit) save();
}
export function init50() {
  let saved: unknown = null;
  try {
    saved = JSON.parse(localStorage.getItem('fenmyr:pen') || '{}');
  } catch {}
  const kept: Record<string, number> = {};
  if (isRecord(saved)) {
    for (const k of ['tool', 'size', 'color'] as const) {
      const v = saved[k];
      if (typeof v === 'string') pen[k] = v;
    }
    if (isRecord(saved.sizes)) for (const [k, v] of Object.entries(saved.sizes)) if (typeof v === 'number') kept[k] = v;
  }
  pen.sizes = {
    pen: PEN_SIZE.pen?.[pen.size] || 9,
    marker: PEN_SIZE.marker?.[pen.size] || 8,
    hi: PEN_SIZE.hi?.[pen.size] || 24,
    eraser: 28,
    ...kept,
  };

  {
    const tr = $('dbsTrack');
    let on = false;
    const at = (e: PointerEvent) => {
      const r = tr.getBoundingClientRect();
      setSize(tToSize((e.clientX - r.left - 9) / (r.width - 18)));
    };
    tr.addEventListener('pointerdown', e => {
      e.preventDefault();
      e.stopPropagation();
      on = true;
      tr.setPointerCapture(e.pointerId);
      $('dbSize').classList.add('sizing');
      at(e);
    });
    tr.addEventListener('pointermove', e => on && at(e));
    const up = () => {
      on = false;
      $('dbSize').classList.remove('sizing');
    };
    tr.addEventListener('pointerup', up);
    tr.addEventListener('pointercancel', up);
    tr.addEventListener('keydown', e => {
      const steps: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 },
        d = steps[e.key];
      if (!d) return;
      e.preventDefault();
      e.stopPropagation();
      setSize(curSize() + d * Math.max(1, Math.round(curSize() * 0.08)));
    });
    tr.addEventListener(
      'wheel',
      e => {
        e.preventDefault();
        e.stopPropagation();
        setSize(curSize() + (e.deltaY < 0 || e.deltaX > 0 ? 1 : -1) * Math.max(1, Math.round(curSize() * 0.06)));
      },
      { passive: false },
    );
  }

  // [ and ] while drawing: smaller / bigger, with the bubble flashing up so you can see it
  addEventListener('keydown', e => {
    if (!drawOn || e.metaKey || e.ctrlKey || closestTo(e.target, 'input, textarea, [contenteditable="true"]')) return;
    const d = e.key === ']' ? 1 : e.key === '[' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    setSize(curSize() + d * Math.max(1, Math.round(curSize() * 0.12)));
    $('dbSize').classList.add('sizing');
    clearTimeout(sizingT);
    sizingT = setTimeout(() => $('dbSize').classList.remove('sizing'), 700);
  });

  $('drawbar').addEventListener('pointerdown', e => e.stopPropagation());

  $('drawbar').onclick = e => {
    const t = closestTo(e.target, '[data-pen]'),
      k = closestTo(e.target, '[data-ink]');
    if (closestTo(e.target, '[data-db="done"]')) return exitDraw();
    if (t) pen.tool = t.dataset.pen ?? 'pen';
    if (k) {
      pen.color = k.dataset.ink ?? 'ink';
      if (pen.tool === 'eraser') pen.tool = 'pen';
    }
    renderDrawbar();
  };

  addEventListener('pointermove', e => {
    if (!drawOn) return;
    const ring = document.getElementById('eraseRing');
    if (ring) {
      const r = stage.getBoundingClientRect();
      ring.style.left = e.clientX - r.left + 'px';
      ring.style.top = e.clientY - r.top + 'px';
    }
    if (erasing) return eraseAt(e);
    if (!stroke) return;
    const w = toWorld(e.clientX, e.clientY),
      last = stroke.pts.at(-1);
    if (last && Math.hypot(w.x - last[0], w.y - last[1]) < 1.5 / session.view.z) return;
    stroke.pts.push([w.x, w.y, performance.now()]);
    if (!liveSvg) return;
    liveSvg.innerHTML = inkPath(
      stroke.pts.map((p): InkPoint => [p[0] + O, p[1] + O, p[2]]),
      stroke.tool,
      stroke.size,
      stroke.color,
      false,
    );
  });

  addEventListener('pointerup', () => {
    if (!drawOn) return;
    erasing = false;
    if (!stroke) return;
    const s2 = stroke;
    stroke = null;
    if (liveSvg) liveSvg.innerHTML = '';
    const pad = penW(s2.tool, s2.size) + 4,
      xs = s2.pts.map(p => p[0]),
      ys = s2.pts.map(p => p[1]);
    const x0 = Math.min(...xs) - pad,
      y0 = Math.min(...ys) - pad,
      w = Math.max(...xs) - x0 + pad,
      h = Math.max(...ys) - y0 + pad;
    const pts = s2.pts.map((p): InkPoint => [+(p[0] - x0).toFixed(1), +(p[1] - y0).toFixed(1), Math.round(p[2] ?? 0)]);
    const c = card('ink', { x: x0, y: y0, w, h, ow: w, oh: h, r: 0, pts, pen: s2.tool, size: s2.size, ink: s2.color });
    session.board.cards.push(c);
    renderCard(c);
    save();
  });
}
