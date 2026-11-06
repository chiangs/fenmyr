import type { Folder, Project, StoredBoard } from '../../shared/model.ts';
import type { BoardSummary } from '../../shared/ops.ts';
import { placeBoard, placeFolder } from '../../shared/placement.ts';
import { COLOR_NAMES, COLORS, uid } from '../core/base.ts';
import { appState, session } from '../core/state.ts';
import { chirp, say } from '../myra/say.ts';
import { copyPrototype, copyPrototypingFolder } from '../repo/copy.ts';
import { renderCrumbsSoon, unhook } from './nesting.ts';
// the order you dragged boards into, per folder (or 'loose'): lists of board ids, kept with the folders so a reorder never rewrites a board
export const saveLib = () =>
  Fenmyr.saveFolders({ projects: appState.projects, folders: appState.folders, order: appState.boardOrder });

export const byName = <T extends { name: string }>(arr: T[], name: unknown) =>
  arr.find(
    x =>
      x.name.trim().toLowerCase() ===
      String(name || '')
        .trim()
        .toLowerCase(),
  );

export const findFolder = (name: unknown) => byName(appState.folders, name);

export function makeProject(name: unknown) {
  const p: Project = byName(appState.projects, name) || {
    id: uid(),
    name: String(name).trim() || 'New project',
    color: COLOR_NAMES[1 + (appState.projects.length % 6)] ?? 'white',
    open: true,
  };
  if (!appState.projects.includes(p)) appState.projects.push(p);
  return p;
}

export function makeFolder(name: unknown, projectId: string | null = null) {
  const f: Folder = findFolder(name) || {
    id: uid(),
    name: String(name).trim() || 'New folder',
    project: projectId,
    open: true,
  };
  if (!appState.folders.includes(f)) appState.folders.push(f);
  return f;
}

// canvases (boards inside boards) live under their parent board, not loose in a folder
export const topLevel = (b: Pick<BoardSummary, 'parent'> | StoredBoard) =>
  !b.parent || !appState.boardList.some(x => x.id === b.parent);

const inOrder = (key: string, list: BoardSummary[]) => {
  const o = appState.boardOrder[key];
  if (!o?.length) return list;
  const at = (id: string) => o.indexOf(id);
  return [...list.filter(b => at(b.id) < 0), ...list.filter(b => at(b.id) >= 0).sort((a, b) => at(a.id) - at(b.id))];
};
// boards you haven't placed yet (new ones) stay on top, newest first, as before
export const boardsIn = (fid: string) =>
  inOrder(
    fid,
    appState.boardList.filter(b => b.folder === fid && topLevel(b)),
  );

// folders can live inside other folders: f.parent is the folder it sits in (its project comes along with it)
export const hasParent = (f: Folder) => !!f.parent && appState.folders.some(x => x.id === f.parent);

export const subFolders = (fid: string) => appState.folders.filter(f => f.parent === fid);

export const foldersIn = (pid: string | null) =>
  appState.folders.filter(
    f => !hasParent(f) && (f.project || null) === pid && (pid === null || appState.projects.some(p => p.id === pid)),
  );

export const looseFolders = () =>
  appState.folders.filter(f => !hasParent(f) && (!f.project || !appState.projects.some(p => p.id === f.project)));

export const folderChain = (f: Folder | undefined) => {
  const out: Folder[] = [];
  let x = f;
  while (x && out.length < 30) {
    out.unshift(x);
    const parent = x.parent;
    x = appState.folders.find(y => y.id === parent);
  }
  return out;
};
// outermost first
export const holdsBoard = (f: Folder): boolean =>
  !!session.board && (boardsIn(f.id).some(b => b.id === session.board.id) || subFolders(f.id).some(holdsBoard));

export const boardsUnder = (f: Folder): number =>
  boardsIn(f.id).length + subFolders(f.id).reduce((n, x) => n + boardsUnder(x), 0);

const setProject = (f: Folder, pid: string | null) => {
  f.project = pid;
  subFolders(f.id).forEach(x => {
    setProject(x, pid);
  });
};

// move a folder into another folder, a project, or out to the top level (never into itself); a prototyping folder going
// to another project is copied instead, and anything the rules refuse says why
export function putFolder(fid: string, into: Folder | null, projectId: string | null = null) {
  const x = appState.folders.find(y => y.id === fid);
  if (!x) return;
  if (into && folderChain(into).includes(x)) return chirp("A folder can't go inside itself ✦", 2500);
  const verdict = placeFolder(appState, x, into, into ? (into.project ?? null) : projectId);
  if (verdict.kind === 'blocked') return say(verdict.why, 5000);
  if (verdict.kind === 'copy') return void copyPrototypingFolder(x, into, verdict.to);
  if (into) {
    x.parent = into.id;
    setProject(x, into.project || null);
    into.open = true;
  } else {
    delete x.parent;
    setProject(x, projectId);
  }
}

export const looseBoards = () =>
  inOrder(
    'loose',
    appState.boardList.filter(b => (!b.folder || !appState.folders.some(f => f.id === b.folder)) && topLevel(b)),
  );

export const orderKey = (b: { folder?: string | null }) =>
  b.folder && appState.folders.some(f => f.id === b.folder) ? b.folder : 'loose';

export const tint = (c: string) => (c in COLORS && c !== 'white' ? `var(--k-${c})` : 'var(--pink)');

// moving a board into a folder (or out of one). A canvas that lived inside another board comes out on its own.
export async function moveBoard(id: string, folderId: string | null) {
  const board = appState.boardList.find(b => b.id === id) ?? (session.board?.id === id ? session.board : {}),
    to = appState.folders.find(f => f.id === folderId) ?? null,
    verdict = placeBoard(appState, board, to);
  if (verdict.kind === 'blocked') return say(verdict.why, 5000);
  if (verdict.kind === 'copy' && to) return copyPrototype(id, to, verdict.to);
  await unhook(id);
  Object.keys(appState.boardOrder).forEach(k => {
    appState.boardOrder[k] = appState.boardOrder[k]?.filter(x => x !== id) ?? [];
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
