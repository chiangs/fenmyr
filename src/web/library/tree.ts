// @ts-nocheck
import { COLORS, COLOR_NAMES, uid } from '../core/base.ts';
import { renderCrumbsSoon, unhook } from './nesting.ts';
import { appState, session } from '../core/state.ts';
// the order you dragged boards into, per folder (or 'loose'): lists of board ids, kept with the folders so a reorder never rewrites a board
export const saveLib = () =>
  Fenmyr.saveFolders({ projects: appState.projects, folders: appState.folders, order: appState.boardOrder });

export const byName = (arr, name) =>
  arr.find(
    x =>
      x.name.trim().toLowerCase() ===
      String(name || '')
        .trim()
        .toLowerCase(),
  );

export const findFolder = name => byName(appState.folders, name);

export function makeProject(name) {
  const p = byName(appState.projects, name) || {
    id: uid(),
    name: String(name).trim() || 'New project',
    color: COLOR_NAMES[1 + (appState.projects.length % 6)],
    open: true,
  };
  if (!appState.projects.includes(p)) appState.projects.push(p);
  return p;
}

export function makeFolder(name, projectId = null) {
  const f = findFolder(name) || {
    id: uid(),
    name: String(name).trim() || 'New folder',
    project: projectId,
    open: true,
  };
  if (!appState.folders.includes(f)) appState.folders.push(f);
  return f;
}

// canvases (boards inside boards) live under their parent board, not loose in a folder
export const topLevel = b => !b.parent || !appState.boardList.some(x => x.id === b.parent);

const inOrder = (key, list) => {
  const o = appState.boardOrder[key];
  if (!o || !o.length) return list;
  const at = id => o.indexOf(id);
  return [...list.filter(b => at(b.id) < 0), ...list.filter(b => at(b.id) >= 0).sort((a, b) => at(a.id) - at(b.id))];
};
// boards you haven't placed yet (new ones) stay on top, newest first, as before
export const boardsIn = fid =>
  inOrder(
    fid,
    appState.boardList.filter(b => b.folder === fid && topLevel(b)),
  );

// folders can live inside other folders: f.parent is the folder it sits in (its project comes along with it)
export const hasParent = f => !!f.parent && appState.folders.some(x => x.id === f.parent);

export const subFolders = fid => appState.folders.filter(f => f.parent === fid);

export const foldersIn = pid =>
  appState.folders.filter(
    f => !hasParent(f) && (f.project || null) === pid && (pid === null || appState.projects.some(p => p.id === pid)),
  );

export const looseFolders = () =>
  appState.folders.filter(f => !hasParent(f) && (!f.project || !appState.projects.some(p => p.id === f.project)));

export const folderChain = f => {
  const out = [];
  let x = f;
  while (x && out.length < 30) {
    out.unshift(x);
    x = appState.folders.find(y => y.id === x.parent);
  }
  return out;
};
// outermost first
export const holdsBoard = f =>
  !!session.board && (boardsIn(f.id).some(b => b.id === session.board.id) || subFolders(f.id).some(holdsBoard));

export const boardsUnder = f => boardsIn(f.id).length + subFolders(f.id).reduce((n, x) => n + boardsUnder(x), 0);

const setProject = (f, pid) => {
  f.project = pid;
  subFolders(f.id).forEach(x => setProject(x, pid));
};

// move a folder into another folder, a project, or out to the top level (never into itself)
export function putFolder(fid, into, projectId = null) {
  const x = appState.folders.find(y => y.id === fid);
  if (!x || (into && folderChain(into).includes(x))) return false;
  if (into) {
    x.parent = into.id;
    setProject(x, into.project || null);
    into.open = true;
  } else {
    delete x.parent;
    setProject(x, projectId);
  }
  return true;
}

export const looseBoards = () =>
  inOrder(
    'loose',
    appState.boardList.filter(b => (!b.folder || !appState.folders.some(f => f.id === b.folder)) && topLevel(b)),
  );

export const orderKey = b => (b.folder && appState.folders.some(f => f.id === b.folder) ? b.folder : 'loose');

export const tint = c => (COLORS[c] && c !== 'white' ? `var(--k-${c})` : 'var(--pink)');

// moving a board into a folder (or out of one). A canvas that lived inside another board comes out on its own.
export async function moveBoard(id, folderId) {
  await unhook(id);
  Object.keys(appState.boardOrder).forEach(k => {
    appState.boardOrder[k] = appState.boardOrder[k].filter(x => x !== id);
  }); // moved: no longer placed anywhere (it lands on top of its new folder)

  if (session.board && session.board.id === id) {
    session.board.folder = folderId;
    delete session.board.parent;
    await Fenmyr.save(session.board);
    renderCrumbsSoon();
    return;
  }
  const b = await Fenmyr.load(id);
  if (!b) return;
  b.folder = folderId;
  delete b.parent;
  await Fenmyr.save(b);
}
export function init5() {
  // ---------- the library: projects hold folders, folders hold boards ----------
  // stored as one small file: { projects: [{id, name, color, open}], folders: [{id, name, project, open}] }
  appState.projects = [];
  appState.folders = [];
  appState.boardList = [];

  appState.boardOrder = {};
}
