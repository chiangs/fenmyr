import type { Folder } from '../../shared/model.ts';
import { appState } from '../core/state.ts';
import { newBoard } from '../model/boards.ts';
import { chirp } from '../myra/say.ts';
import { openBoard } from './openBoard.ts';
import { boardsIn, foldersIn, looseBoards, looseFolders, subFolders } from './tree.ts';

// the boards in the order they read down the left box: projects, then loose folders, then loose boards (a folder lists its folders first)
const inFolder = (f: Folder): string[] => [...subFolders(f.id).flatMap(inFolder), ...boardsIn(f.id).map(b => b.id)];
const sidebarOrder = () => [
  ...appState.projects.flatMap(p => foldersIn(p.id).flatMap(inFolder)),
  ...looseFolders().flatMap(inFolder),
  ...looseBoards().map(b => b.id),
];

// where to go when the board you are on is deleted: the one after it in its list, else the one above, else its parent canvas, else the first board left
function boardAfterDelete(gone: Set<string>, current: string) {
  const me = appState.boardList.find(b => b.id === current),
    alive = (id: string) => !gone.has(id) && appState.boardList.some(b => b.id === id);
  if (me?.parent && alive(me.parent)) return me.parent;
  const folder = me?.folder && appState.folders.some(f => f.id === me.folder) ? me.folder : null,
    ids = (folder ? boardsIn(folder) : looseBoards()).map(b => b.id),
    at = ids.indexOf(current),
    after = ids.slice(at + 1).find(alive),
    above = ids.slice(0, Math.max(0, at)).reverse().find(alive);
  return after ?? above ?? sidebarOrder().find(alive) ?? null;
}

// leave a board that is about to be deleted: open its neighbour first, so the edit it may still have waiting to save is written before the file goes
// (the other way round, that save brings the deleted board back). With no board left, a fresh one takes its place.
export async function leaveForDelete(gone: Set<string>, current: string) {
  const next = boardAfterDelete(gone, current);
  if (next) return openBoard(next);
  const fresh = newBoard('My first board');
  await Fenmyr.save(fresh);
  await openBoard(fresh.id);
  chirp('That was your last board, so I made a new one ✦', 4000);
}
