// @ts-nocheck
import { cardEl } from '../ui/dom.ts';
import { typesWith } from '../../shared/cardTypes.ts';
import { applyView } from './view.ts';
import { byId } from './wires.ts';
import { cropping } from '../cards/crop.ts';
import { clamp } from '../core/base.ts';
import { $, stage, world } from '../core/dom.ts';
import { chatOpen } from '../myra/chatWindow.ts';
import { drawOn } from '../tools/draw.ts';
import { vec } from '../tools/penEdit.ts';
import { appState, session } from '../core/state.ts';
let rh;
export let rhEl;

export let rhFor = null;

export const realBox = k => {
  const el = k.type === 'title' ? cardEl(k.id) : null;
  return { w: el?.offsetWidth || k.w, h: el?.offsetHeight || k.h };
};
export let mrot;

export const ROT_FIXED = typesWith('noRotate');
// a group you turned: { key, anchor } (the dot stays on the piece that was on top)
export const selKey = cs =>
  cs
    .map(k => k.id)
    .sort()
    .join();

export const tiltOf = k =>
  (k.rot || 0) +
  (document.body.classList.contains('neat') || ROT_FIXED.includes(k.type) || (k.type === 'stamp' && !k.tilted)
    ? 0
    : k.r || 0);

// which piece carries the dot: one thing is itself; for several, the one on top (and it keeps the dot after you turn them)
export function anchorOf(cs) {
  if (cs.length === 1) return cs[0];
  const kept =
    appState.mrotKeep && appState.mrotKeep.key === selKey(cs) && cs.find(k => k.id === appState.mrotKeep.anchor);
  if (kept) return kept;
  return cs.reduce((best, k) => {
    const b = realBox(k),
      y = k.y + b.h / 2 - (b.h / 2) * Math.cos((tiltOf(k) * Math.PI) / 180);
    return !best || y < best.y ? { k, y } : best;
  }, null).k;
}

function placeDot(x, y, ang) {
  mrot.style.left = x + 'px';
  mrot.style.top = y + 'px';
  mrot.style.rotate = (ang || 0) + 'deg';
  mrot.style.setProperty('--iz', (1 / session.view.z).toFixed(4));
}

function syncMrot() {
  const ids = session.board ? [...session.sel] : [];
  const cs = ids.map(byId).filter(k => k && !k.locked);
  const turnable = cs.length > 1 || (cs.length === 1 && !ROT_FIXED.includes(cs[0].type) && cs[0].type !== 'section');
  const on =
    turnable &&
    !drawOn &&
    !session.editing &&
    !cropping &&
    !(appState.drag && ['move', 'gresize', 'resize'].includes(appState.drag.mode)) &&
    !vec;
  mrot.classList.toggle('on', !!on);
  if (!on) return;
  if (appState.drag && appState.drag.mode === 'mrotate' && appState.drag.dot0) {
    const t = ((appState.drag.cur || 0) * Math.PI) / 180,
      dx = appState.drag.dot0.x - appState.drag.cx,
      dy = appState.drag.dot0.y - appState.drag.cy; // held by the cursor, going round with the turn
    return placeDot(
      appState.drag.cx + dx * Math.cos(t) - dy * Math.sin(t),
      appState.drag.cy + dx * Math.sin(t) + dy * Math.cos(t),
      appState.drag.ang0 + (appState.drag.cur || 0),
    );
  }
  const k = anchorOf(cs),
    b = realBox(k),
    d = tiltOf(k),
    t = (d * Math.PI) / 180; // the top piece's own top middle, turned with it
  placeDot(k.x + b.w / 2 + (b.h / 2) * Math.sin(t), k.y + b.h / 2 - (b.h / 2) * Math.cos(t), d);
}

function syncRH() {
  syncMrot();
  const ids = session.board ? [...session.sel] : [],
    c = ids.length === 1 ? byId(ids[0]) : null;
  const ok =
    c &&
    !['ink'].includes(c.type) &&
    session.editing !== c.id &&
    !drawOn &&
    !(appState.drag && appState.drag.mode === 'move') &&
    !cropping;
  // a whole group selected (a button, an input…): one corner for the group
  const g = !c && ids.length > 1 && byId(ids[0])?.group,
    grp = g && ids.every(i => byId(i)?.group === g) && !drawOn && !(appState.drag && appState.drag.mode === 'move');
  if (grp) {
    const cs = ids.map(byId);
    rhFor = 'g:' + g;
    rh.classList.add('on');
    rh.style.left = Math.max(...cs.map(k => k.x + k.w)) + 'px';
    rh.style.top =
      Math.max(...cs.map(k => k.y + (k.type === 'title' ? cardEl(k.id)?.offsetHeight || k.h : k.h))) + 'px';
    requestAnimationFrame(syncRH);
    return;
  }
  const multi =
    !c &&
    !grp &&
    ids.length > 1 &&
    !drawOn &&
    !(appState.drag && appState.drag.mode === 'move') &&
    !cropping &&
    !session.editing;
  if (multi) {
    const cs = ids.map(byId).filter(k => k && !k.locked && k.type !== 'ink');
    if (cs.length > 1) {
      const R = realBox;
      rhFor = 'm';
      rh.classList.add('on');
      const rs_ = cs.map(k => cardEl(k.id)?.getBoundingClientRect()).filter(r => r && r.width); // the real bottom-right of what you see (turned things included)
      const pt = rs_.length
        ? toWorld(Math.max(...rs_.map(r => r.right)), Math.max(...rs_.map(r => r.bottom)))
        : { x: Math.max(...cs.map(k => k.x + R(k).w)), y: Math.max(...cs.map(k => k.y + R(k).h)) };
      rh.style.left = pt.x + 'px';
      rh.style.top = pt.y + 'px';
      requestAnimationFrame(syncRH);
      return;
    }
  }
  rhFor = ok ? c.id : null;
  rh.classList.toggle('on', !!ok);
  if (ok) {
    const el = cardEl(c.id);
    const h = c.type === 'title' && el ? el.offsetHeight : c.h;
    // a title's real width (its saved width lags a moment after the text, size or font changes, which left the corner floating off to the side)
    const w = c.type === 'title' && el && el.offsetWidth ? el.offsetWidth : c.w;
    if (c.type === 'title' && !c.fixedW && Math.abs(w - c.w) > 1) c.w = w;
    // follow the card's own turn (tilt, or a wireframe's rotation) so the corner sits exactly on it
    const deg = (c.rot || 0) + (document.body.classList.contains('neat') ? 0 : c.r || 0),
      a = (deg * Math.PI) / 180,
      cx = c.x + w / 2,
      cy = c.y + h / 2,
      dx = w / 2,
      dy = h / 2;
    rh.style.left = cx + dx * Math.cos(a) - dy * Math.sin(a) + 'px';
    rh.style.top = cy + dx * Math.sin(a) + dy * Math.cos(a) + 'px';
  }
  requestAnimationFrame(syncRH);
}
// starts after the rest of the app is set up
export const toWorld = (cx, cy) => {
  const r = stage.getBoundingClientRect();
  return { x: (cx - r.left - session.view.x) / session.view.z, y: (cy - r.top - session.view.y) / session.view.z };
};

// a trackpad sends several scroll/pinch steps per frame: do the math for each one, but draw only once per frame
let viewRaf = 0;

export const viewSoon = () => {
  if (!viewRaf)
    viewRaf = requestAnimationFrame(() => {
      viewRaf = 0;
      applyView();
    });
};

export function zoomAt(cx, cy, z, soon) {
  const r = stage.getBoundingClientRect(),
    p = toWorld(cx, cy);
  session.view.z = clamp(z, 0.15, 3);
  session.view.x = cx - r.left - p.x * session.view.z;
  session.view.y = cy - r.top - p.y * session.view.z;
  soon ? viewSoon() : applyView();
}

// Ctrl + mouse wheel moves one step along these, so every notch is the same size and 100% is always one of them
export const ZOOM_STEPS = [0.15, 0.2, 0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];

export function stepZoom(cx, cy, dir) {
  const z = session.view.z,
    next = dir > 0 ? ZOOM_STEPS.find(s => s > z + 0.001) : [...ZOOM_STEPS].reverse().find(s => s < z - 0.001);
  if (next) zoomAt(cx, cy, next);
}

export function fit(cards, pad = 120, maxZ = 1.4) {
  if (!cards.length) return;
  const r = stage.getBoundingClientRect();
  const x0 = Math.min(...cards.map(c => c.x)),
    y0 = Math.min(...cards.map(c => c.y)),
    x1 = Math.max(...cards.map(c => c.x + c.w)),
    y1 = Math.max(...cards.map(c => c.y + c.h));
  const ph = document.body.classList.contains('phone'),
    L = ph ? 0 : 270,
    ch = !ph && chatOpen() && $('mChat').getBoundingClientRect(),
    R = ph ? 0 : ch && ch.width ? Math.max(260, Math.min(r.right - ch.left + 30, r.width - L - 520)) : 260; // a phone has no side panels to leave room for   // the open space between the left boxes and the tray (or Myra's chat, when it's open)
  session.view.z = clamp(Math.min((r.width - L - R - pad) / (x1 - x0), (r.height - pad * 2) / (y1 - y0)), 0.2, maxZ);
  session.view.x = L + (r.width - L - R - (x1 - x0) * session.view.z) / 2 - x0 * session.view.z;
  session.view.y = (r.height - (ph ? 90 : 0) - (y1 - y0) * session.view.z) / 2 - y0 * session.view.z + (ph ? 20 : 0);
  world.style.transition = 'transform .5s cubic-bezier(.2,.8,.3,1)';
  applyView();
  setTimeout(() => (world.style.transition = ''), 520);
}
export function init9() {
  // ---------- the resize corner lives on its own layer above every card (like Figma), so a neighbor that overlaps can never hide it ----------
  rh = document.createElement('div');
  rhEl = rh;
  rh.id = 'rh';
  rh.setAttribute('aria-label', 'Resize');
  world.appendChild(rh);
  // titles size themselves to their words
  mrot = document.createElement('div');
  mrot.id = 'mrot';
  mrot.title = 'Drag to turn them together (Shift: 15° steps)';
  world.appendChild(mrot);
  // these stay upright (they only move around the turn)
  // the turn dot is a handle attached to what you selected: on top when it's straight, and it turns with it (and stays there after) like a real handle
  appState.mrotKeep = null;

  requestAnimationFrame(syncRH);
}
