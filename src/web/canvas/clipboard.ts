// @ts-nocheck
import { renderCard } from './render.ts';
import { byId, renderWires, selectOnly } from './wires.ts';
import { layoutAll } from '../cards/kanban.ts';
import { uid } from '../core/base.ts';
import { stage } from '../core/dom.ts';
import { remember, save } from '../core/history.ts';
import { homeAt } from '../library/home.ts';
import { removeSelected } from '../myra/helpers.ts';
import { centerWorld } from '../panels/zoomMenu.ts';
import { selCards } from '../selbar/selbar.ts';
import { chirp } from '../settings/licenses.ts';
import { onFrame } from '../wireframe/tilt.ts';
import { appState, session } from '../core/state.ts';

// ---------- copy, cut and paste cards: works across boards (the clip lives in Fenmyr, plus their words go to the system clipboard) ----------
const CLIP = 'fenmyr:clip';

export let lastClip = null;
let pasteN = 0;

export function copyCards() {
  const ids = new Set();
  const take = c => {
    if (!c || ids.has(c.id)) return;
    ids.add(c.id);
    if (c.type === 'coll') (c.kids || []).forEach(k => take(byId(k)));
    if (c.type === 'frame') onFrame(c).forEach(take);
    if (c.group) session.board.cards.filter(x => x.group === c.group).forEach(take);
  };
  selCards().forEach(take);
  if (!ids.size) return null;
  const cards = session.board.cards.filter(c => ids.has(c.id)).map(c => JSON.parse(JSON.stringify(c)));
  const links = session.board.links.filter(l => ids.has(l.a) && ids.has(l.b)).map(l => ({ ...l }));
  const text =
    cards
      .map(c => c.text || c.title || c.name || c.label || '')
      .filter(Boolean)
      .join('\n') || `${cards.length} Fenmyr card${cards.length > 1 ? 's' : ''}`;
  lastClip = { cards, links, from: session.board.id, text };
  pasteN = 0;
  try {
    localStorage.setItem(CLIP, JSON.stringify(lastClip));
  } catch (e) {} // big pictures may not fit; the copy still works while the app is open
  return lastClip;
}

// a fresh copy of a card, pointing at the copies of whatever it holds (collection cards, frame contents, its group)
function copyOf(c, map, gmap) {
  const n = JSON.parse(JSON.stringify(c));
  n.id = map[c.id];
  if (n.kids) n.kids = n.kids.map(k => map[k]).filter(Boolean);
  if (n.colOf)
    n.colOf = Object.fromEntries(
      Object.entries(n.colOf)
        .filter(([k]) => map[k])
        .map(([k, v]) => [map[k], v]),
    );
  if (n.onFrame) {
    if (map[n.onFrame]) n.onFrame = map[n.onFrame];
    else delete n.onFrame;
  }
  if (n.group) n.group = gmap[n.group] || (gmap[n.group] = uid());
  return n;
}

// Option-drag (Alt on Windows): the originals stay put and a copy comes along with the cursor, like in Figma
export function cloneForDrag() {
  const src = appState.drag.start.map(s => s.c),
    map = {},
    gmap = {};
  src.forEach(c => (map[c.id] = uid()));
  const fresh = src.map(c => copyOf(c, map, gmap)),
    links = session.board.links.filter(l => map[l.a] && map[l.b]);
  session.board.cards.push(...fresh);
  fresh.forEach(c => renderCard(c, true));
  links.forEach(l => session.board.links.push({ ...l, id: uid(), a: map[l.a], b: map[l.b] }));
  layoutAll();
  renderWires();
  selectOnly([...session.sel].map(i => map[i]).filter(Boolean));
  appState.drag.start = fresh.map(c => ({ c, x: c.x, y: c.y }));
  appState.drag.cloned = true;
  stage.classList.add('cloning');
}

export function pasteCards() {
  const c0 = lastClip;
  if (!c0?.cards?.length || !session.board) return;
  remember();
  const map = {},
    gmap = {};
  c0.cards.forEach(c => (map[c.id] = uid()));
  const x0 = Math.min(...c0.cards.map(c => c.x)),
    y0 = Math.min(...c0.cards.map(c => c.y)),
    x1 = Math.max(...c0.cards.map(c => c.x + c.w)),
    y1 = Math.max(...c0.cards.map(c => c.y + c.h));
  let dx, dy;
  if (c0.from === session.board.id) {
    pasteN++;
    dx = dy = 30 * pasteN;
  } // same board: a little down and right of the original
  else {
    const ctr = centerWorld();
    dx = ctr.x - (x0 + x1) / 2;
    dy = ctr.y - (y0 + y1) / 2;
  } // another board: right in the middle of the view
  const fresh = c0.cards.map(c => {
    const n = copyOf(c, map, gmap);
    n.x += dx;
    n.y += dy;
    return n;
  });
  session.board.cards.push(...fresh);
  fresh.forEach(c => renderCard(c, true)); // all in first, so collections find the cards that belong in them
  (c0.links || []).forEach(l => session.board.links.push({ ...l, id: uid(), a: map[l.a], b: map[l.b] }));
  layoutAll();
  renderWires();
  save();
  const inside = new Set(fresh.flatMap(c => c.kids || []));
  const freshIds = new Set(fresh.map(c => c.id));
  selectOnly(fresh.filter(c => !inside.has(c.id) && !(c.onFrame && freshIds.has(c.onFrame))).map(c => c.id)); // select the tops, not every card inside them
  if (c0.from !== session.board.id) chirp(`Pasted ${fresh.length} card${fresh.length > 1 ? 's' : ''} ✦`, 2200);
}
export function init22() {
  appState.pendingPaste = false;

  try {
    lastClip = JSON.parse(localStorage.getItem(CLIP) || 'null');
  } catch (e) {}

  addEventListener('copy', e => {
    if (e.target.closest?.('input, textarea, [contenteditable="true"]') || !session.sel.size || homeAt) return;
    const r = copyCards();
    if (!r) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', r.text);
    e.clipboardData.setData('text/x-fenmyr', '1');
  });

  addEventListener('cut', e => {
    if (e.target.closest?.('input, textarea, [contenteditable="true"]') || !session.sel.size || homeAt) return;
    const r = copyCards();
    if (!r) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', r.text);
    e.clipboardData.setData('text/x-fenmyr', '1');
    removeSelected();
  });
}
