// @ts-nocheck
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

// ---------- drawing: a soft ink (it swells when you slow down and tapers at the ends), plus a marker, a highlighter and an easy eraser ----------
const INKS = {
  ink: '#3b342d',
  pink: '#dc4b3e',
  coral: '#e07a5f',
  butter: '#f0b04a',
  mint: '#6fae5a',
  sky: '#4f8fc9',
  lilac: '#a98ad6',
  white: '#ffffff',
};

const PEN_SIZE = { pen: { s: 5, m: 9, l: 16 }, marker: { s: 4, m: 8, l: 14 }, hi: { s: 14, m: 24, l: 38 } };

const pen = { tool: 'pen', size: 'm', color: 'ink' };

export let drawOn = false;
let stroke = null;
let erasing = false;
let liveSvg = null;

// any thickness, not just three: each tool keeps its own (old drawings saved as s / m / l still read from PEN_SIZE)
const PEN_RANGE = { pen: [2, 48], marker: [2, 40], hi: [8, 72], eraser: [10, 90] };

const penW = (tool, size) => (typeof size === 'number' ? size : (PEN_SIZE[tool] || PEN_SIZE.pen)[size] || 9);

const curSize = () => pen.sizes[pen.tool] || 9;

const sizeToT = v => {
  const [a, b] = PEN_RANGE[pen.tool] || PEN_RANGE.pen;
  return Math.pow((v - a) / (b - a), 1 / 1.7);
};
// a gentle curve: fine control at the thin end
const tToSize = t => {
  const [a, b] = PEN_RANGE[pen.tool] || PEN_RANGE.pen;
  return Math.round(a + (b - a) * Math.pow(Math.min(1, Math.max(0, t)), 1.7));
};

function setSize(v) {
  const [a, b] = PEN_RANGE[pen.tool] || PEN_RANGE.pen;
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
  $('dbsVal').textContent = v;
  const dot = $('dbsDot'),
    d = Math.min(22, Math.max(3, v * (er ? 0.35 : 0.6)));
  Object.assign(dot.style, {
    width: d + 'px',
    height: d + 'px',
    background: col,
    opacity: pen.tool === 'hi' ? 0.45 : 1,
  });
  dot.classList.toggle('er', er);
  // the bubble over the knob shows the true size on the board right now (at this zoom)
  const bub = $('dbsBub').firstElementChild,
    bd = Math.min(110, Math.max(2, er ? v : v * session.view.z));
  Object.assign(bub.style, {
    width: bd + 'px',
    height: bd + 'px',
    background: col,
    opacity: pen.tool === 'hi' ? 0.45 : 1,
  });
  bub.classList.toggle('er', er);
  const ring = $('eraseRing');
  if (ring) Object.assign(ring.style, { width: v + 'px', height: v + 'px', margin: `${-v / 2}px 0 0 ${-v / 2}px` });
}

// a filled ribbon around the line: wider where you slowed down, thin at the start and end, with a little breathing wobble
function butter(raw, finished, BASE) {
  const pts = [];
  let acc = 0;
  for (let i = 0; i < raw.length; i++) {
    if (i === 0) {
      pts.push({ x: raw[0][0], y: raw[0][1] });
      continue;
    }
    const a = raw[i - 1],
      b = raw[i],
      seg = Math.hypot(b[0] - a[0], b[1] - a[1]),
      dt = Math.max(1, b[2] - a[2]);
    let d = acc;
    while (d < seg) {
      const k = d / seg;
      pts.push({ x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, v: seg / dt });
      d += 3;
    }
    acc = d - seg;
  }
  if (pts.length < 2) return '';
  if (finished && pts.length > 6) {
    const a = pts[0],
      z = pts[pts.length - 1];
    if (Math.hypot(a.x - z.x, a.y - z.y) < 14) pts.splice(-2, 2);
  }
  let s = pts[1]?.v || 0.3;
  const lens = [0];
  for (let i = 1; i < pts.length; i++)
    lens.push(lens[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const total = lens[lens.length - 1],
    MIN = Math.max(1, BASE / 9),
    ramp = Math.min(54, BASE * 6);
  const width = i => {
    s += ((pts[i].v == null ? s : pts[i].v) - s) * 0.08;
    const slow = Math.max(0, Math.min(1, 1 - s / 1.8));
    let w = MIN + (BASE - MIN) * (0.22 + 0.78 * slow * slow);
    const inR = Math.min(1, lens[i] / ramp),
      outR = finished ? Math.min(1, (total - lens[i]) / ramp) : 1;
    return w * Math.pow(inR, 0.8) * Math.pow(outR, 0.8) * (1 + 0.12 * Math.sin(lens[i] / 11)) + 0.4;
  };
  const L = [],
    R = [];
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[Math.max(0, i - 1)],
      p1 = pts[Math.min(pts.length - 1, i + 1)];
    let nx = -(p1.y - p0.y),
      ny = p1.x - p0.x;
    const n = Math.hypot(nx, ny) || 1;
    nx /= n;
    ny /= n;
    const w = width(i) / 2;
    L.push([pts[i].x + nx * w, pts[i].y + ny * w]);
    R.push([pts[i].x - nx * w, pts[i].y - ny * w]);
  }
  const seq = L.concat(R.reverse());
  let d = `M${seq[0][0].toFixed(1)} ${seq[0][1].toFixed(1)}`;
  for (let i = 1; i < seq.length; i++) {
    const m = seq[i - 1],
      c = seq[i];
    d += ` Q${m[0].toFixed(1)} ${m[1].toFixed(1)} ${((m[0] + c[0]) / 2).toFixed(1)} ${((m[1] + c[1]) / 2).toFixed(1)}`;
  }
  return d + ' Z';
}

function centerline(p) {
  if (p.length < 3) return `M${p[0][0]} ${p[0][1]} L${p[p.length - 1][0] + 0.1} ${p[p.length - 1][1]}`;
  let d = `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
  for (let i = 1; i < p.length - 1; i++)
    d += ` Q${p[i][0].toFixed(1)} ${p[i][1].toFixed(1)} ${((p[i][0] + p[i + 1][0]) / 2).toFixed(1)} ${((p[i][1] + p[i + 1][1]) / 2).toFixed(1)}`;
  return d + ` L${p[p.length - 1][0].toFixed(1)} ${p[p.length - 1][1].toFixed(1)}`;
}

export function inkPath(pts, tool, size, color, finished) {
  const col = color === 'ink' || !color ? 'var(--pen-ink)' : INKS[color] || color,
    w = penW(tool, size);
  if (tool === 'pen') {
    if (pts.length < 2) {
      const [x, y] = pts[0];
      return `<path style="fill:${col}" d="M${x - w / 3} ${y} a${w / 3} ${w / 3} 0 1 0 ${w / 1.5} 0 a${w / 3} ${w / 3} 0 1 0 ${-w / 1.5} 0"/>`;
    }
    return `<path style="fill:${col}" d="${butter(pts, finished, w)}"/>`;
  }
  return `<path fill="none" style="stroke:${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${tool === 'hi' ? ' opacity=".38" style="mix-blend-mode:multiply"' : ''} d="${centerline(pts)}"/>`;
}

function renderDrawbar() {
  $('dbColors').innerHTML = Object.entries(INKS)
    .map(
      ([n, c]) =>
        `<button data-ink="${n}" title="${colorLabel(n)}" style="background:${n === 'ink' ? 'var(--pen-ink)' : c}" class="${pen.color === n ? 'on' : ''}"></button>`,
    )
    .join('');
  $('drawbar')
    .querySelectorAll('[data-pen]')
    .forEach(b => b.classList.toggle('on', b.dataset.pen === pen.tool));
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

export function drawDown(e) {
  const w = toWorld(e.clientX, e.clientY);
  stage.setPointerCapture(e.pointerId);
  if (pen.tool === 'eraser') {
    erasing = true;
    eraseAt(e);
    return;
  }
  stroke = { pts: [[w.x, w.y, performance.now()]], tool: pen.tool, size: curSize(), color: pen.color };
  liveSvg.innerHTML = '';
}

function eraseAt(e) {
  const w = toWorld(e.clientX, e.clientY),
    r = (pen.sizes.eraser || 28) / 2 / session.view.z;
  let hit = false; // the eraser is a size on screen, like the ring you see
  session.board.cards
    .filter(c => c.type === 'ink')
    .forEach(c => {
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
    });
  if (hit) save();
}
export function init50() {
  try {
    Object.assign(pen, JSON.parse(localStorage.getItem('fenmyr:pen') || '{}'));
  } catch (e) {}

  pen.sizes = Object.assign(
    {
      pen: PEN_SIZE.pen[pen.size] || 9,
      marker: PEN_SIZE.marker[pen.size] || 8,
      hi: PEN_SIZE.hi[pen.size] || 24,
      eraser: 28,
    },
    pen.sizes || {},
  );

  {
    const tr = $('dbsTrack');
    let on = false;
    const at = e => {
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
      const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
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
    if (!drawOn || e.metaKey || e.ctrlKey || e.target.closest?.('input, textarea, [contenteditable="true"]')) return;
    const d = e.key === ']' ? 1 : e.key === '[' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    setSize(curSize() + d * Math.max(1, Math.round(curSize() * 0.12)));
    $('dbSize').classList.add('sizing');
    clearTimeout(setSize.t);
    setSize.t = setTimeout(() => $('dbSize').classList.remove('sizing'), 700);
  });

  $('drawbar').addEventListener('pointerdown', e => e.stopPropagation());

  $('drawbar').onclick = e => {
    const t = e.target.closest('[data-pen]'),
      k = e.target.closest('[data-ink]');
    if (e.target.closest('[data-db="done"]')) return exitDraw();
    if (t) pen.tool = t.dataset.pen;
    if (k) {
      pen.color = k.dataset.ink;
      if (pen.tool === 'eraser') pen.tool = 'pen';
    }
    renderDrawbar();
  };

  addEventListener('pointermove', e => {
    if (!drawOn) return;
    const ring = $('eraseRing');
    if (ring) {
      const r = stage.getBoundingClientRect();
      ring.style.left = e.clientX - r.left + 'px';
      ring.style.top = e.clientY - r.top + 'px';
    }
    if (erasing) return eraseAt(e);
    if (!stroke) return;
    const w = toWorld(e.clientX, e.clientY),
      last = stroke.pts[stroke.pts.length - 1];
    if (Math.hypot(w.x - last[0], w.y - last[1]) < 1.5 / session.view.z) return;
    stroke.pts.push([w.x, w.y, performance.now()]);
    liveSvg.innerHTML = inkPath(
      stroke.pts.map(p => [p[0] + O, p[1] + O, p[2]]),
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
    liveSvg.innerHTML = '';
    const pad = penW(s2.tool, s2.size) + 4,
      xs = s2.pts.map(p => p[0]),
      ys = s2.pts.map(p => p[1]);
    const x0 = Math.min(...xs) - pad,
      y0 = Math.min(...ys) - pad,
      w = Math.max(...xs) - x0 + pad,
      h = Math.max(...ys) - y0 + pad;
    const pts = s2.pts.map(p => [+(p[0] - x0).toFixed(1), +(p[1] - y0).toFixed(1), Math.round(p[2])]);
    const c = card('ink', { x: x0, y: y0, w, h, ow: w, oh: h, r: 0, pts, pen: s2.tool, size: s2.size, ink: s2.color });
    session.board.cards.push(c);
    renderCard(c);
    save();
  });
}
