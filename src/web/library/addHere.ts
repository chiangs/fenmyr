import type { Folder } from '../../shared/model.ts';
import { type Added, addBoardTo } from '../repo/prototypes.ts';
import { blankBoard, boardFolder, createBoard, createFolder, currentPlace } from './create.ts';
import { renameNewest } from './rowMenu.ts';

// What + Board does, for the button and for /board, so the two cannot drift: a board in the folder the person is in (or
// the project's first folder, or none) that opens, or a prototype when that folder holds prototypes.
export async function addBoardHere(name = ''): Promise<Added> {
  const at = currentPlace(),
    into = boardFolder(at);
  if (into) return addBoardTo(into, name);
  const board = await createBoard(at, { board: blankBoard(name), open: 'board' });
  return { kind: 'board', board, into: undefined };
}

// What + Folder does, for the button and for /folder: a folder at the top of the project the person is in, never inside
// the folder they are in. With no name the new folder's name is opened for typing, and with one it is left alone.
export async function addFolderHere(name = ''): Promise<Folder> {
  const f = await createFolder({ ...currentPlace(), folder: null }, name);
  if (!name.trim()) renameNewest('.node.folder', f);
  return f;
}
