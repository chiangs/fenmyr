// @ts-nocheck
import { renderAll } from '../canvas/render.ts';
import { $ } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { closeHome, openBoard, renderCrumbs } from './home.ts';
import { refreshBoards } from './rowMenu.ts';
import { boardsIn, looseBoards, moveBoard, orderKey, saveLib, topLevel } from './tree.ts';
import { card, newBoard } from '../model/boards.ts';
import { chirp } from '../settings/licenses.ts';
import { appState, session } from '../core/state.ts';

// ---------- canvases can go anywhere: inside another board (as a canvas card there), into a folder, or out on their own ----------
const insideOf = (id, maybeAncestor) => {
  let b = appState.boardList.find(x => x.id === id),
    n = 0;
  while (b && b.parent && n++ < 40) {
    if (b.parent === maybeAncestor) return true;
    b = appState.boardList.find(x => x.id === b.parent);
  }
  return false;
};

async function editBoard(id, fn) {
  if (session.board && session.board.id === id) {
    fn(session.board);
    renderAll();
    save();
    return session.board;
  }
  const b = await Fenmyr.load(id);
  if (!b) return null;
  fn(b);
  await Fenmyr.save(b);
  return b;
}

// take a canvas's card off the board it sat inside
export async function unhook(id) {
  const kid =
      appState.boardList.find(x => x.id === id) || (session.board && session.board.id === id ? session.board : null),
    p = kid && kid.parent;
  if (!p) return;
  await editBoard(p, pb => {
    const gone = new Set(pb.cards.filter(c => c.type === 'canvas' && c.board === id).map(c => c.id));
    pb.cards = pb.cards.filter(c => !gone.has(c.id));
    pb.links = (pb.links || []).filter(l => !gone.has(l.a) && !gone.has(l.b));
  });
}

// put a board inside another one, as a canvas card (at a spot, or to the right of what's there)
export async function nestBoard(id, intoId, at) {
  if (id === intoId || insideOf(intoId, id)) {
    chirp("A board can't go inside itself ✦", 2500);
    return false;
  }
  const kid =
    appState.boardList.find(x => x.id === id) || (session.board && session.board.id === id ? session.board : null);
  if (!kid || kid.parent === intoId) return false;
  const into = session.board && session.board.id === intoId ? session.board : await Fenmyr.load(intoId);
  if (!into) return false;
  await unhook(id);
  await editBoard(id, b => {
    b.parent = intoId;
    b.folder = into.folder || null;
  });
  await editBoard(intoId, pb => {
    const x = at ? at.x : pb.cards.length ? Math.max(...pb.cards.map(c => c.x + c.w)) + 60 : 0,
      y = at ? at.y : pb.cards.length ? Math.min(...pb.cards.map(c => c.y)) : 0;
    pb.cards.push(card('canvas', { x, y, text: kid.name, board: id }));
  });
  chirp(`Moved “${kid.name}” inside “${into.name}” ✦`, 3000);
  return true;
}

export const renderCrumbsSoon = () => setTimeout(() => typeof renderCrumbs === 'function' && renderCrumbs(), 50);

export async function loadLib() {
  const [list, lib] = await Promise.all([Fenmyr.list(), Fenmyr.folders().catch(() => null)]);
  appState.boardList = list;
  if (Array.isArray(lib)) {
    appState.projects = [];
    appState.folders = lib;
  } // folders saved before projects existed
  else {
    appState.projects = (lib && lib.projects) || [];
    appState.folders = (lib && lib.folders) || [];
  }
  appState.boardOrder = (lib && !Array.isArray(lib) && lib.order) || {};
  // forget order entries for boards and folders that are gone
  {
    const ids = new Set(list.map(b => b.id));
    Object.keys(appState.boardOrder).forEach(k => {
      if (k !== 'loose' && !appState.folders.some(f => f.id === k)) {
        delete appState.boardOrder[k];
        return;
      }
      appState.boardOrder[k] = appState.boardOrder[k].filter(id => ids.has(id));
      if (!appState.boardOrder[k].length) delete appState.boardOrder[k];
    });
  }
}

// drag and drop between rows and tiles: boards go into folders, folders go into projects
export const dropZone = (el, kind, onDrop) => {
  el.addEventListener('dragover', e => {
    if (!e.dataTransfer.types.includes('fenmyr/' + kind)) return;
    e.preventDefault();
    e.stopPropagation();
    el.classList.add('drop');
  });
  el.addEventListener('dragleave', e => {
    if (!el.contains(e.relatedTarget)) el.classList.remove('drop');
  });
  el.addEventListener('drop', async e => {
    const id = e.dataTransfer.getData('fenmyr/' + kind);
    if (!id) return;
    e.preventDefault();
    e.stopPropagation();
    el.classList.remove('drop');
    await onDrop(id);
    await saveLib();
    refreshBoards();
  });
};

// drag a board between two rows to put it there (the top and bottom edge of a row; the middle still files it inside that board, as before)
const dropEdge = (e, el) => {
  const r = el.getBoundingClientRect(),
    y = (e.clientY - r.top) / r.height;
  return y < 0.3 ? 'before' : y > 0.7 ? 'after' : null;
};

const clearEdges = () =>
  document
    .querySelectorAll('.board-row.drop-before, .board-row.drop-after')
    .forEach(x => x.classList.remove('drop-before', 'drop-after'));

async function placeBoard(id, target, after) {
  const mine =
    appState.boardList.find(x => x.id === id) || (session.board && session.board.id === id ? session.board : null);
  if (!mine || id === target.id) return;
  const key = orderKey(target),
    from = orderKey(mine);
  if (key !== from || !topLevel(mine) || mine.parent) await moveBoard(id, key === 'loose' ? null : key);
  const ids = (key === 'loose' ? looseBoards() : boardsIn(key)).map(x => x.id).filter(x => x !== id),
    at = ids.indexOf(target.id) + (after ? 1 : 0);
  ids.splice(at < 0 ? ids.length : at, 0, id);
  appState.boardOrder[key] = ids;
  if (from !== key && appState.boardOrder[from])
    appState.boardOrder[from] = appState.boardOrder[from].filter(x => x !== id);
}

export function reorderZone(el, b) {
  if (b.parent && appState.boardList.some(x => x.id === b.parent)) return; // canvases inside another board are not part of a folder's order
  el.addEventListener('dragover', e => {
    if (!e.dataTransfer.types.includes('fenmyr/board')) return;
    const z = dropEdge(e, el);
    el.classList.remove('drop-before', 'drop-after');
    if (!z) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    el.classList.remove('drop');
    el.classList.add('drop-' + z);
  });
  el.addEventListener('dragleave', e => {
    if (!el.contains(e.relatedTarget)) el.classList.remove('drop-before', 'drop-after');
  });
  el.addEventListener('drop', async e => {
    const z = dropEdge(e, el),
      id = e.dataTransfer.getData('fenmyr/board');
    clearEdges();
    if (!z || !id) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    await placeBoard(id, b, z === 'after');
    await saveLib();
    refreshBoards();
  });
}

export const draggable = (el, kind, id) => {
  el.draggable = true;
  el.ondragstart = e => {
    e.stopPropagation();
    e.dataTransfer.setData('fenmyr/' + kind, id);
    e.dataTransfer.effectAllowed = 'move';
    el.classList.add('dragging');
  };
  el.ondragend = () => {
    el.classList.remove('dragging');
    clearEdges();
  };
};

export function inlineRename(el, obj, after) {
  el.contentEditable = 'true';
  el.focus();
  getSelection().selectAllChildren(el);
  el.onkeydown = ev => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      el.blur();
    }
    if (ev.key === 'Escape') {
      el.textContent = obj.name;
      el.blur();
    }
    ev.stopPropagation();
  };
  el.onblur = async () => {
    el.contentEditable = 'false';
    const v = el.textContent.trim();
    // the list may have reloaded while you typed, so rename the current copy (found by id), not the one we started with
    const liveObj = [...appState.projects, ...appState.folders].find(x => x.id === obj.id) || obj;
    if (v) {
      liveObj.name = v;
      obj.name = v;
    }
    await (after ? after(v) : saveLib());
    refreshBoards();
  };
}

export async function newBoardIn(folderId) {
  const b = newBoard();
  b.folder = folderId;
  await Fenmyr.save(b);
  closeHome();
  await openBoard(b.id);
  $('boardName').focus();
  $('boardName').select();
}
