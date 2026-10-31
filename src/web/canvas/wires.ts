// @ts-nocheck
import { esc } from './render.ts';
import { $, cardsEl, stage, wires } from '../core/dom.ts';
import { LY, layersSoon } from '../panels/layers.ts';
import { chirp } from '../settings/licenses.ts';
import { settings } from '../settings/settings.ts';
import { applySettings } from '../settings/widgets.ts';
import { addCard } from '../tools/penEdit.ts';
import { session } from '../core/state.ts';

const center = c => ({ x: c.x + c.w / 2, y: c.y + (c.type === 'title' ? 25 : c.h / 2) });

function edgePoint(c, toward) {
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
function pinPoint(c, p) {
  const h = c.type === 'title' ? 50 : c.h,
    x = c.x + p.u * c.w,
    y = c.y + p.v * h,
    o = 6;
  return { x: x + (p.u <= 0 ? -o : p.u >= 1 ? o : 0), y: y + (p.v <= 0 ? -o : p.v >= 1 ? o : 0) };
}

export function pinAt(c, w) {
  // the nearest point on the card's edge to where you dropped the end
  const h = c.type === 'title' ? 50 : c.h,
    u = Math.max(0, Math.min(1, (w.x - c.x) / c.w)),
    v = Math.max(0, Math.min(1, (w.y - c.y) / h));
  const d = [u, 1 - u, v, 1 - v],
    k = d.indexOf(Math.min(...d)),
    r = x => Math.round(x * 1000) / 1000;
  return k === 0 ? { u: 0, v: r(v) } : k === 1 ? { u: 1, v: r(v) } : k === 2 ? { u: r(u), v: 0 } : { u: r(u), v: 1 };
}

export function wireGeom(l, a, b) {
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
export const wireW = l => (l.w === 4 || l.w === 6 ? l.w : 2);
export const wireColor = l => (/^#[0-9a-f]{3,8}$/i.test(l.color || '') ? l.color : '');

export function renderWires(live) {
  const O = 5000;
  let h = '';
  session.board.links.forEach(l => {
    const a = byId(l.a),
      b = byId(l.b);
    if (!a || !b) return;
    const g = wireGeom(l, a, b);
    const d = `M${g.p0.x + O} ${g.p0.y + O} Q${g.c1.x + O} ${g.c1.y + O} ${g.p2.x + O} ${g.p2.y + O}`,
      on = session.selWire === l.id;
    // weight (regular 2, medium 4, bold 6) and colour; unset means the defaults, which follow the theme
    const ww = wireW(l),
      k = ww / 2,
      sty = `${wireColor(l) ? `stroke:${wireColor(l)};` : ''}${ww !== 2 ? `stroke-width:${ww};` : ''}`,
      ds = l.dash && ww !== 2 ? `stroke-dasharray:${6 * k} ${7 * k};` : '';
    let arrow = '',
      halo = '';
    if (l.arrow) {
      const ux = g.p2.x - g.c1.x,
        uy = g.p2.y - g.c1.y,
        ul = Math.hypot(ux, uy) || 1,
        ax = ux / ul,
        ay = uy / ul,
        tip = { x: g.p2.x + O, y: g.p2.y + O },
        hl = 11 + (ww - 2) * 2,
        hw = 7 + (ww - 2) * 1.2;
      const ad = `M${tip.x - ax * hl - ay * hw} ${tip.y - ay * hl + ax * hw} L${tip.x} ${tip.y} L${tip.x - ax * hl + ay * hw} ${tip.y - ay * hl - ax * hw}`;
      arrow = `<path class="w-arrow" style="${sty}" d="${ad}"/>`;
      if (on) halo += `<path class="w-halo" style="stroke-width:${ww + 6}" d="${ad}"/>`;
    }
    if (on) halo = `<path class="w-halo" style="stroke-width:${ww + 6}" d="${d}"/>` + halo; // selected: a soft blue glow behind the line, so its real colour stays visible
    h += `${halo}<path class="w${l.dash ? ' dash' : ''}" style="${sty}${ds}" d="${d}"/>${arrow}<path class="w-hit" style="stroke-width:${Math.max(16, ww + 12)}" data-wire="${l.id}" d="${d}"/>`;
    if (on)
      h += `<circle class="w-end" data-end="a" data-wire="${l.id}" cx="${g.p0.x + O}" cy="${g.p0.y + O}" r="6"/><circle class="w-end" data-end="b" data-wire="${l.id}" cx="${g.p2.x + O}" cy="${g.p2.y + O}" r="6"/><circle class="w-bend" data-wire="${l.id}" cx="${g.handle.x + O}" cy="${g.handle.y + O}" r="7"/>`;
  });
  if (live) {
    const a = live.a,
      b = live.b;
    h += `<path class="live" d="M${a.x + O} ${a.y + O} Q${(a.x + b.x) / 2 + O} ${(a.y + b.y) / 2 - 30 + O} ${b.x + O} ${b.y + O}"/>`;
  }
  wires.innerHTML = h;
}

export const linkById = id => session.board.links.find(l => l.id === id);

export function selectWire(id) {
  session.selWire = id;
  if (id) selectOnly([]);
  renderWires();
}

export const byId = id => session.board.cards.find(c => c.id === id);

let trayN = null;

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
  $('trayCount').textContent = session.board.tray.length;
  session.board.tray.forEach(c => {
    const d = document.createElement('div');
    d.className = 'tray-item';
    d.dataset.id = c.id;
    d.style.setProperty('--tilt', c.r / 2 + 'deg');
    d.innerHTML = c.type === 'image' ? `<img src="${esc(c.src)}">` : esc(c.type === 'link' ? c.title || c.url : c.text);
    list.appendChild(d);
  });
}

// Unsorted keeps ideas simple: every card is its own item. But cards that were joined by connectors when they went in stay tied (c.tie, and their
// connectors wait in board.trayLinks), so pulling one back out brings the others with it, laid out as they were, reconnected
export function sendToTray(cards) {
  const ids = new Set(cards.map(c => c.id)),
    joined = session.board.links.filter(l => ids.has(l.a) && ids.has(l.b)),
    up = new Map(cards.map(c => [c.id, c.id]));
  const root = id => {
    while (up.get(id) !== id) id = up.get(id);
    return id;
  };
  joined.forEach(l => up.set(root(l.a), root(l.b)));
  const size = {};
  cards.forEach(c => {
    const r = root(c.id);
    size[r] = (size[r] || 0) + 1;
  });
  cards.forEach(c => {
    const r = root(c.id);
    if (size[r] > 1) c.tie = r;
    else delete c.tie;
  });
  session.board.trayLinks = [...(session.board.trayLinks || []), ...joined];
  session.board.cards = session.board.cards.filter(c => !ids.has(c.id));
  session.board.links = session.board.links.filter(l => !ids.has(l.a) && !ids.has(l.b));
  cards.forEach(c => {
    session.board.tray.unshift(c);
    cardsEl.querySelector(`[data-id="${c.id}"]`)?.remove();
  });
}

// back onto the board with c's top-left at `at`; the rest of its group follows. Returns everything that came out.
export function takeFromTray(c, at) {
  const members = c.tie ? session.board.tray.filter(m => m.tie === c.tie) : [c];
  if (!members.includes(c)) members.push(c);
  const dx = c.x == null ? 0 : at.x - c.x,
    dy = c.y == null ? 0 : at.y - c.y,
    ids = new Set(members.map(m => m.id));
  members.forEach(m => {
    if (m === c) {
      m.x = at.x;
      m.y = at.y;
    } else if (m.x != null) {
      m.x += dx;
      m.y += dy;
    }
  });
  const back = (session.board.trayLinks || []).filter(l => ids.has(l.a) && ids.has(l.b));
  session.board.trayLinks = (session.board.trayLinks || []).filter(l => !back.includes(l));
  session.board.links.push(...back);
  session.board.tray = session.board.tray.filter(m => !ids.has(m.id));
  members.forEach(m => {
    delete m.tie;
    addCard(m);
  });
  if (back.length) renderWires();
  return members;
}

// a tied card that lost its partners (Myra removed them) is just an ordinary item again
export function tidyTies() {
  const n = {};
  session.board.tray.forEach(c => c.tie && (n[c.tie] = (n[c.tie] || 0) + 1));
  session.board.tray.forEach(c => {
    if (c.tie && n[c.tie] < 2) delete c.tie;
  });
  const ids = new Set(session.board.tray.map(c => c.id));
  session.board.trayLinks = (session.board.trayLinks || []).filter(l => ids.has(l.a) && ids.has(l.b));
  if (!session.board.trayLinks.length) delete session.board.trayLinks;
}

// (the stage gets a 'multi' class when more than one thing is selected: tilt handles only show for one thing at a time)
export function selectOnly(ids) {
  if (ids.length && session.selWire) {
    session.selWire = null;
    renderWires();
  }
  session.sel = new Set(ids);
  stage.classList.toggle('multi', session.sel.size > 1);
  LY.reveal = true;
  layersSoon();
  session.board.cards.forEach(c => {
    const el = cardsEl.querySelector(`[data-id="${c.id}"]`);
    el && el.classList.toggle('sel', session.sel.has(c.id));
  });
}
export function init11() {
  // ---------- connectors: curved lines from edge to edge; select one to bend it, re-attach it, or restyle it ----------
  session.selWire = null;
}
