// @ts-nocheck
import { cardEl } from '../ui/dom.ts';
import { fit, toWorld } from '../canvas/handles.ts';
import { renderAll } from '../canvas/render.ts';
import { layoutAll } from '../cards/kanban.ts';
import { $, stage } from './dom.ts';
import { dueIndex } from '../features/due.ts';
import { endEdit, syncBoardTags } from '../features/tags.ts';
import { refreshBoards } from '../library/rowMenu.ts';
import { chatOpen } from '../myra/chatWindow.ts';
import { layersSoon } from '../panels/layers.ts';
import { say } from '../settings/licenses.ts';
import { renderPalette } from '../ui/colorPicker.ts';
import { WF } from '../wireframe/wireframes.ts';
import { appState, session } from './state.ts';

// ---------- undo / redo: a snapshot of the board after each change settles ----------
let past = [];
let future = [];
let restoring = false;
export let snapT = 0;

const stateOf = () =>
  JSON.stringify({
    cards: session.board.cards,
    links: session.board.links,
    tray: session.board.tray,
    trayLinks: session.board.trayLinks,
    palette: session.board.palette,
  });

export function remember() {
  if (restoring || !session.board) return;
  const st = stateOf();
  if (past[past.length - 1] !== st) {
    past.push(st);
    if (past.length > 80) past.shift();
    future = [];
  }
}

export function resetHistory() {
  past = session.board ? [stateOf()] : [];
  future = [];
}

export function travel(dir) {
  clearTimeout(snapT);
  remember(); // catch the very latest change first
  if (dir < 0 ? past.length < 2 : !future.length)
    return say(dir < 0 ? 'Nothing left to undo' : 'Nothing to redo', 1800);
  if (dir < 0) future.push(past.pop());
  else past.push(future.pop());
  const st = JSON.parse(past[past.length - 1]);
  restoring = true;
  Object.assign(session.board, st);
  if (!st.trayLinks) delete session.board.trayLinks;
  session.sel.clear();
  session.selWire = null;
  endEdit();
  renderAll();
  renderPalette();
  save();
  restoring = false;
}

// every card keeps real numbers for its place and size (a bad one would break saving)
function cleanNumbers() {
  session.board.cards.forEach(c => {
    ['x', 'y'].forEach(k => {
      if (!Number.isFinite(c[k])) c[k] = 0;
    });
    ['w', 'h'].forEach(k => {
      if (!Number.isFinite(c[k]) || c[k] <= 0) c[k] = k === 'w' ? 200 : 100;
    });
    ['r', 'rot'].forEach(k => {
      if (c[k] != null && !Number.isFinite(c[k])) c[k] = 0;
    });
  });
}

export function save() {
  if (!appState.drag && session.board) {
    layoutAll();
    cleanNumbers();
    syncBoardTags();
  }
  if (!restoring) {
    clearTimeout(snapT);
    snapT = setTimeout(remember, 350);
  }
  layersSoon();
  $('saved').textContent = 'saving…';
  clearTimeout(appState.saveT);
  appState.saveT = setTimeout(async () => {
    session.board.view = session.view;
    await Fenmyr.save(session.board);
    $('saved').textContent = 'saved';
    dueIndex();
    refreshBoards();
  }, 400);
}

// after Myra works: glide to what she made (unless it's already in view) and let it glow for a moment
export function showWhatMyraMade(cs) {
  cs = [...new Set(cs)].filter(c => session.board.cards.includes(c));
  if (!cs.length) return;
  const r = stage.getBoundingClientRect(),
    L = 270,
    ch = chatOpen() && $('mChat').getBoundingClientRect(),
    R = ch && ch.width ? Math.max(260, Math.min(r.right - ch.left + 30, r.width - L - 520)) : 260,
    a = toWorld(r.left + L, r.top + 60),
    b = toWorld(r.right - R, r.bottom - 110);
  const inView =
    cs.every(c => c.x >= a.x && c.y >= a.y && c.x + c.w <= b.x && c.y + c.h <= b.y) && session.view.z > 0.45;
  if (!inView) fit(cs, 140, 1);
  const glow = cs.filter(c => !WF.includes(c.type) || c.type === 'frame' || !c.onFrame); // whole screens glow, not every word on them
  setTimeout(
    () =>
      glow.forEach(c => {
        const el = cardEl(c.id);
        if (!el) return;
        el.classList.remove('just-made');
        void el.offsetWidth;
        el.classList.add('just-made');
        setTimeout(() => el.classList.remove('just-made'), 1900);
      }),
    inView ? 0 : 450,
  );
}
