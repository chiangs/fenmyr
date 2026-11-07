import type { BoardLists } from '../../shared/changes.ts';
import type { Card, Link } from '../../shared/model.ts';
import { $, stage, wires } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { session } from '../core/state.ts';
import { chirp } from '../myra/say.ts';
import { LY, layersSoon } from '../panels/layers.ts';
import { settings } from '../settings/settings.ts';
import { applySettings } from '../settings/widgets.ts';
import { cardEl, esc } from '../ui/dom.ts';
import { renderCard } from './render.ts';

type Point = { x: number; y: number };
type Pin = { u: number; v: number };

const center = (c: Card) => ({ x: c.x + c.w / 2, y: c.y + (c.type === 'title' ? 25 : c.h / 2) });

function edgePoint(c: Card, toward: Point) {
  // where the line from a card's center toward a point leaves the card
  const m = center(c),
    dx = toward.x - m.x,
    dy = toward.y - m.y,
    hw = c.w / 2 + 6,
    hh = (c.type === 'title' ? 25 : c.h / 2) + 6;
  const k = Math.min(Math.abs(dx) ? hw / Math.abs(dx) : Infinity, Math.abs(dy) ? hh / Math.abs(dy) : Infinity, 1);
  return { x: m.x + dx * k, y: m.y + dy * k };
}

// a pinned line end: a spot on the card's edge, kept as a fraction of its width and height, so it follows the card when it moves or resizes
function pinPoint(c: Card, p: Pin) {
  const h = c.type === 'title' ? 50 : c.h,
    x = c.x + p.u * c.w,
    y = c.y + p.v * h,
    o = 6;
  return { x: x + (p.u <= 0 ? -o : p.u >= 1 ? o : 0), y: y + (p.v <= 0 ? -o : p.v >= 1 ? o : 0) };
}

export function pinAt(c: Card, w: Point): Pin {
  // the nearest point on the card's edge to where you dropped the end
  const h = c.type === 'title' ? 50 : c.h,
    u = Math.max(0, Math.min(1, (w.x - c.x) / c.w)),
    v = Math.max(0, Math.min(1, (w.y - c.y) / h));
  const d = [u, 1 - u, v, 1 - v],
    k = d.indexOf(Math.min(...d)),
    r = (x: number) => Math.round(x * 1000) / 1000;
  return k === 0 ? { u: 0, v: r(v) } : k === 1 ? { u: 1, v: r(v) } : k === 2 ? { u: r(u), v: 0 } : { u: r(u), v: 1 };
}

export function wireGeom(l: Link, a: Card, b: Card) {
  const ca = l.pa ? pinPoint(a, l.pa) : center(a),
    cb = l.pb ? pinPoint(b, l.pb) : center(b),
    p0 = l.pa ? ca : edgePoint(a, cb),
    p2 = l.pb ? cb : edgePoint(b, ca);
  const dx = p2.x - p0.x,
    dy = p2.y - p0.y,
    len = Math.hypot(dx, dy) || 1,
    n = { x: -dy / len, y: dx / len },
    mid = { x: (p0.x + p2.x) / 2, y: (p0.y + p2.y) / 2 };
  const bend = l.bend ?? Math.min(80, len * 0.2); // a gentle curve unless you've set your own
  const c1 = { x: mid.x + n.x * bend, y: mid.y + n.y * bend },
    handle = { x: mid.x + (n.x * bend) / 2, y: mid.y + (n.y * bend) / 2 };
  return { p0, p2, c1, handle, mid, n };
}

// connector weight and colour; a colour from a board file is checked before it goes into the page
export const wireW = (l: Link) => (l.w === 4 || l.w === 6 ? l.w : 2);
export const wireColor = (l: Link) => (/^#[0-9a-f]{3,8}$/i.test(l.color || '') ? l.color : '');

// the drawing sits in an SVG shifted by this much, so lines off the top or left of the board still show
const O = 5000;
const shift = (p: Point) => ({ x: p.x + O, y: p.y + O });

// an arrowhead at the end of the curve, sized to the line's weight
function arrowPath(c1: Point, p2: Point, ww: number) {
  const ux = p2.x - c1.x,
    uy = p2.y - c1.y,
    ul = Math.hypot(ux, uy) || 1,
    ax = ux / ul,
    ay = uy / ul,
    tip = shift(p2),
    hl = 11 + (ww - 2) * 2,
    hw = 7 + (ww - 2) * 1.2,
    lx = tip.x - ax * hl - ay * hw,
    ly = tip.y - ay * hl + ax * hw,
    rx = tip.x - ax * hl + ay * hw,
    ry = tip.y - ay * hl - ax * hw;
  return `M${lx} ${ly} L${tip.x} ${tip.y} L${rx} ${ry}`;
}

// one connector: its line, arrow and invisible wide hit area; selected, a glow behind it and its handles
function wireMarkup(l: Link, a: Card, b: Card, on: boolean) {
  const g = wireGeom(l, a, b),
    p0 = shift(g.p0),
    c1 = shift(g.c1),
    p2 = shift(g.p2),
    hd = shift(g.handle),
    d = `M${p0.x} ${p0.y} Q${c1.x} ${c1.y} ${p2.x} ${p2.y}`,
    // weight (regular 2, medium 4, bold 6) and colour; unset means the defaults, which follow the theme
    ww = wireW(l),
    k = ww / 2,
    color = wireColor(l),
    colorCss = color ? `stroke:${color};` : '',
    widthCss = ww !== 2 ? `stroke-width:${ww};` : '',
    sty = colorCss + widthCss,
    dashLen = 6 * k,
    gapLen = 7 * k,
    ds = l.dash && ww !== 2 ? `stroke-dasharray:${dashLen} ${gapLen};` : '',
    dash = l.dash ? ' dash' : '',
    haloW = ww + 6,
    hitW = Math.max(16, ww + 12),
    ad = l.arrow ? arrowPath(g.c1, g.p2, ww) : '',
    arrow = ad ? `<path class="w-arrow" style="${sty}" d="${ad}"/>` : '',
    // selected: a soft blue glow behind the line, so its real colour stays visible
    lineHalo = on ? `<path class="w-halo" style="stroke-width:${haloW}" d="${d}"/>` : '',
    arrowHalo = on && ad ? `<path class="w-halo" style="stroke-width:${haloW}" d="${ad}"/>` : '',
    ends = on
      ? `<circle class="w-end" data-end="a" data-wire="${l.id}" cx="${p0.x}" cy="${p0.y}" r="6"/><circle class="w-end" data-end="b" data-wire="${l.id}" cx="${p2.x}" cy="${p2.y}" r="6"/><circle class="w-bend" data-wire="${l.id}" cx="${hd.x}" cy="${hd.y}" r="7"/>`
      : '';
  return `${lineHalo}${arrowHalo}<path class="w${dash}" style="${sty}${ds}" d="${d}"/>${arrow}<path class="w-hit" style="stroke-width:${hitW}" data-wire="${l.id}" d="${d}"/>${ends}`;
}

// the line that follows the pointer while you draw a new connector
function liveMarkup(a: Point, b: Point) {
  const s = shift(a),
    e = shift(b),
    mx = (a.x + b.x) / 2 + O,
    my = (a.y + b.y) / 2 - 30 + O;
  return `<path class="live" d="M${s.x} ${s.y} Q${mx} ${my} ${e.x} ${e.y}"/>`;
}

export function renderWires(live?: { a: Point; b: Point }) {
  let h = '';
  for (const l of session.board.links) {
    const a = byId(l.a),
      b = byId(l.b);
    if (a && b) h += wireMarkup(l, a, b, session.selWire === l.id);
  }
  if (live) h += liveMarkup(live.a, live.b);
  wires.innerHTML = h;
}

export const linkById = (id: string) => session.board.links.find(l => l.id === id);

export function selectWire(id: string | null) {
  session.selWire = id;
  if (id) selectOnly([]);
  renderWires();
}

export const byId = (id: string) => session.board.cards.find(c => c.id === id);

let trayN: number | null = null;

export function renderTray() {
  if (window.__phone?.on) setTimeout(window.__phone.count);
  // Unsorted turned off in Settings: still say when something lands there, with a way to see it
  if (settings.wTray === false && trayN !== null && session.board.tray.length > trayN)
    chirp('Saved to Unsorted ✦', 4000, [
      {
        label: 'Show Unsorted',
        run: () => {
          settings.wTray = true;
          applySettings();
        },
      },
    ]);
  trayN = session.board.tray.length;
  const list = $('trayList');
  list.innerHTML = '';
  $('trayCount').textContent = String(session.board.tray.length);
  session.board.tray.forEach(c => {
    const d = document.createElement('div');
    d.className = 'tray-item';
    d.dataset.id = c.id;
    d.style.setProperty('--tilt', `${(c.r ?? 0) / 2}deg`);
    const src = c.type === 'image' ? esc(c.src) : '';
    d.innerHTML = c.type === 'image' ? `<img src="${src}">` : esc(c.type === 'link' ? c.title || c.url : c.text);
    list.appendChild(d);
  });
}

// Unsorted keeps ideas simple: every card is its own item. But cards that were joined by connectors when they went in stay tied (c.tie, and their
// connectors wait in board.trayLinks), so pulling one back out brings the others with it, laid out as they were, reconnected
export function sendToTray(cards: Card[]) {
  const ids = new Set(cards.map(c => c.id)),
    joined = session.board.links.filter(l => ids.has(l.a) && ids.has(l.b)),
    up = new Map(cards.map(c => [c.id, c.id]));
  const root = (start: string) => {
    let id = start;
    for (let next = up.get(id); next !== undefined && next !== id; next = up.get(id)) id = next;
    return id;
  };
  joined.forEach(l => {
    up.set(root(l.a), root(l.b));
  });
  const size: Record<string, number> = {};
  cards.forEach(c => {
    const r = root(c.id);
    size[r] = (size[r] || 0) + 1;
  });
  cards.forEach(c => {
    const r = root(c.id);
    if ((size[r] ?? 0) > 1) c.tie = r;
    else delete c.tie;
  });
  session.board.trayLinks = [...(session.board.trayLinks || []), ...joined];
  session.board.cards = session.board.cards.filter(c => !ids.has(c.id));
  session.board.links = session.board.links.filter(l => !ids.has(l.a) && !ids.has(l.b));
  cards.forEach(c => {
    session.board.tray.unshift(c);
    cardEl(c.id)?.remove();
  });
}

// back onto the board with c's top-left at `at`; the rest of its group follows. Returns everything that came out.
export function pullFromTray(b: BoardLists, c: Card, at: Point) {
  const members = c.tie ? b.tray.filter(m => m.tie === c.tie) : [c];
  if (!members.includes(c)) members.push(c);
  const dx = at.x - c.x,
    dy = at.y - c.y,
    ids = new Set(members.map(m => m.id));
  members.forEach(m => {
    if (m === c) {
      m.x = at.x;
      m.y = at.y;
    } else {
      m.x += dx;
      m.y += dy;
    }
  });
  const back = (b.trayLinks || []).filter(l => ids.has(l.a) && ids.has(l.b));
  b.trayLinks = (b.trayLinks || []).filter(l => !back.includes(l));
  b.links.push(...back);
  b.tray = b.tray.filter(m => !ids.has(m.id));
  members.forEach(m => {
    delete m.tie;
    b.cards.push(m);
  });
  return members;
}

export function takeFromTray(c: Card, at: Point) {
  const members = pullFromTray(session.board, c, at);
  members.forEach(m => {
    renderCard(m, true);
  });
  save();
  renderWires();
  return members;
}

// (the stage gets a 'multi' class when more than one thing is selected: tilt handles only show for one thing at a time)
export function selectOnly(ids: string[]) {
  if (ids.length && session.selWire) {
    session.selWire = null;
    renderWires();
  }
  session.sel = new Set(ids);
  stage.classList.toggle('multi', session.sel.size > 1);
  LY.reveal = true;
  layersSoon();
  session.board.cards.forEach(c => {
    const el = cardEl(c.id);
    el?.classList.toggle('sel', session.sel.has(c.id));
  });
}
export function init11() {
  // ---------- connectors: curved lines from edge to edge; select one to bend it, re-attach it, or restyle it ----------
  session.selWire = null;
}
