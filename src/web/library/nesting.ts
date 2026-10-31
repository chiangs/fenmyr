import type { StoredBoard } from '../../shared/model.ts';
import { parseLibrary } from '../../shared/model.ts';
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
const insideOf = (id: string, maybeAncestor: string) => {
  let b = appState.boardList.find(x => x.id === id),
    n = 0;
  while (b?.parent && n++ < 40) {
    if (b.parent === maybeAncestor) return true;
    const parent = b.parent;
    b = appState.boardList.find(x => x.id === parent);
  }
  return false;
};

async function editBoard<R>(id: string, fn: (b: StoredBoard) => R) {
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
export async function unhook(id: string) {
  const kid =
      appState.boardList.find(x => x.id === id) || (session.board && session.board.id === id ? session.board : null),
    p = kid && kid.parent;
  if (!p) return;
  await editBoard(p, pb => {
    const cards = pb.cards ?? [];
    const gone = new Set(cards.filter(c => c.type === 'canvas' && c.board === id).map(c => c.id));
    pb.cards = cards.filter(c => !gone.has(c.id));
    pb.links = (pb.links || []).filter(l => !gone.has(l.a) && !gone.has(l.b));
  });
}

// put a board inside another one, as a canvas card (at a spot, or to the right of what's there)
export async function nestBoard(id: string, intoId: string, at?: { x: number; y: number }) {
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
    const cards = (pb.cards ??= []);
    const x = at ? at.x : cards.length ? Math.max(...cards.map(c => c.x + c.w)) + 60 : 0,
      y = at ? at.y : cards.length ? Math.min(...cards.map(c => c.y)) : 0;
    cards.push(card('canvas', { x, y, text: kid.name, board: id }));
  });
  chirp(`Moved “${kid.name}” inside “${into.name}” ✦`, 3000);
  return true;
}

export const renderCrumbsSoon = () => setTimeout(() => renderCrumbs(), 50);

export async function loadLib() {
  const [list, lib] = await Promise.all([Fenmyr.list(), Fenmyr.folders().catch(() => null)]);
  appState.boardList = list;
  const { projects, folders, order } = parseLibrary(lib);
  appState.projects = projects;
  appState.folders = folders;
  appState.boardOrder = order;
  // forget order entries for boards and folders that are gone
  {
    const ids = new Set(list.map(b => b.id));
    Object.keys(appState.boardOrder).forEach(k => {
      if (k !== 'loose' && !appState.folders.some(f => f.id === k)) {
        delete appState.boardOrder[k];
        return;
      }
      const kept = appState.boardOrder[k]?.filter(id => ids.has(id)) ?? [];
      if (kept.length) appState.boardOrder[k] = kept;
      else delete appState.boardOrder[k];
    });
  }
}

// drag and drop between rows and tiles: boards go into folders, folders go into projects
export const dropZone = (el: HTMLElement, kind: string, onDrop: (id: string) => unknown) => {
  el.addEventListener('dragover', e => {
    if (!e.dataTransfer?.types.includes(`fenmyr/${kind}`)) return;
    e.preventDefault();
    e.stopPropagation();
    el.classList.add('drop');
  });
  el.addEventListener('dragleave', e => {
    if (!(e.relatedTarget instanceof Node && el.contains(e.relatedTarget))) el.classList.remove('drop');
  });
  el.addEventListener('drop', async e => {
    const id = e.dataTransfer?.getData(`fenmyr/${kind}`);
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
const dropEdge = (e: MouseEvent, el: HTMLElement) => {
  const r = el.getBoundingClientRect(),
    y = (e.clientY - r.top) / r.height;
  return y < 0.3 ? 'before' : y > 0.7 ? 'after' : null;
};

const clearEdges = () =>
  document
    .querySelectorAll('.board-row.drop-before, .board-row.drop-after')
    .forEach(x => x.classList.remove('drop-before', 'drop-after'));

async function placeBoard(id: string, target: { id: string; folder?: string | null }, after: boolean) {
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
    appState.boardOrder[from] = appState.boardOrder[from]?.filter(x => x !== id) ?? [];
}

export function reorderZone(el: HTMLElement, b: { id: string; folder?: string | null; parent?: string | null }) {
  if (b.parent && appState.boardList.some(x => x.id === b.parent)) return; // canvases inside another board are not part of a folder's order
  el.addEventListener('dragover', e => {
    if (!e.dataTransfer?.types.includes('fenmyr/board')) return;
    const z = dropEdge(e, el);
    el.classList.remove('drop-before', 'drop-after');
    if (!z) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    el.classList.remove('drop');
    el.classList.add('drop-' + z);
  });
  el.addEventListener('dragleave', e => {
    if (!(e.relatedTarget instanceof Node && el.contains(e.relatedTarget)))
      el.classList.remove('drop-before', 'drop-after');
  });
  el.addEventListener('drop', async e => {
    const z = dropEdge(e, el),
      id = e.dataTransfer?.getData('fenmyr/board');
    clearEdges();
    if (!z || !id) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    await placeBoard(id, b, z === 'after');
    await saveLib();
    refreshBoards();
  });
}

export const draggable = (el: HTMLElement, kind: string, id: string) => {
  el.draggable = true;
  el.ondragstart = e => {
    e.stopPropagation();
    e.dataTransfer?.setData(`fenmyr/${kind}`, id);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    el.classList.add('dragging');
  };
  el.ondragend = () => {
    el.classList.remove('dragging');
    clearEdges();
  };
};

export function inlineRename(el: HTMLElement, obj: { id: string; name: string }, after?: (v: string) => unknown) {
  el.contentEditable = 'true';
  el.focus();
  getSelection()?.selectAllChildren(el);
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
    const v = (el.textContent ?? '').trim();
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

export async function newBoardIn(folderId: string | null) {
  const b = newBoard();
  b.folder = folderId;
  await Fenmyr.save(b);
  closeHome();
  await openBoard(b.id);
  $('boardName').focus();
  const field = $('boardName');
  if (field instanceof HTMLInputElement) field.select();
}
