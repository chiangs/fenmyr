import type { Board, Folder, Project } from '../../shared/model.ts';
import { fit } from '../canvas/handles.ts';
import { uid } from '../core/base.ts';
import { $ } from '../core/dom.ts';
import { appState, session } from '../core/state.ts';
import { newBoard } from '../model/boards.ts';
import { closeHome, homeAt } from './home.ts';
import { openBoard } from './openBoard.ts';
import { refreshBoards } from './rowMenu.ts';
import { byName, foldersIn, makeFolder, makeProject, saveLib } from './tree.ts';

// Where a new folder or board goes: inside `folder` if there is one, else at the top of `project`, else in neither.
// A folder's own project comes along with it, so a caller that has a folder gives both.
export type Place = { project: string | null; folder: string | null };

// makeProject and makeFolder hand back the one that already has the name, so a new one needs a name nobody has.
export const uniqueName = (arr: { name: string }[], base: string) => {
  let n = base,
    k = 2;
  while (byName(arr, n)) n = `${base} ${k++}`;
  return n;
};

// The folder and project the person is in, or the ones Home is showing, so + Folder and + Board add where they are looking.
export function currentPlace(): Place {
  const at = homeAt,
    f = at
      ? at.level === 'folder'
        ? appState.folders.find(x => x.id === at.id)
        : null
      : appState.folders.find(x => x.id === session.board?.folder),
    p =
      at?.level === 'project'
        ? appState.projects.find(x => x.id === at.id)
        : at?.level === 'all'
          ? null
          : f && appState.projects.find(x => x.id === f.project);
  return { project: p?.id ?? null, folder: f?.id ?? null };
}

// A board lives in a folder, so a place with only a project means that project's first folder, and none means loose.
export const boardFolder = (at: Place): Folder | undefined =>
  appState.folders.find(f => f.id === at.folder) ?? (at.project ? foldersIn(at.project)[0] : undefined);

export async function createProject(name = ''): Promise<Project> {
  const p = makeProject(uniqueName(appState.projects, name.trim() || 'New project'));
  await saveLib();
  await refreshBoards();
  return p;
}

export async function createFolder(at: Place, name = ''): Promise<Folder> {
  const f = makeFolder(uniqueName(appState.folders, name.trim() || 'New folder'), at.project);
  if (at.folder) f.parent = at.folder;
  await saveLib();
  await refreshBoards();
  return f;
}

// A new project's first folder. It is alone in its project, so it keeps its plain name: createFolder's names are unique
// across every project, which would call the second project's "Boards 2".
export async function createFirstFolder(project: Project): Promise<Folder> {
  const f: Folder = { id: uid(), name: 'Boards', project: project.id, open: true };
  appState.folders.push(f);
  await saveLib();
  await refreshBoards();
  return f;
}

// What the person is left looking at. The three differ as the paths that make boards always did: 'name' closes Home,
// opens the board and selects its name, 'board' does the same without selecting the name, and 'cards' opens it with
// Home left as it was. The New project dialog is the one place that chose: 'name' for a blank board, 'board' for the rest.
export type Open = 'name' | 'board' | 'cards';

// An empty board called what the person said, or Untitled board when they said nothing.
export const blankBoard = (name = '') => newBoard(name.trim() || undefined);

// A board's name is not made unique: two Untitled boards have always been allowed.
export async function createBoard(at: Place, { board = newBoard(), open }: { board?: Board; open?: Open } = {}) {
  const into = boardFolder(at);
  if (into) board.folder = into.id;
  await Fenmyr.save(board);
  if (!open) {
    await refreshBoards();
    return board;
  }
  if (open !== 'cards') closeHome();
  await openBoard(board.id);
  fit(session.board.cards);
  if (open === 'name') {
    const field = $('boardName');
    field.focus();
    if (field instanceof HTMLInputElement) field.select();
  }
  return board;
}

// A board that arrives with cards. With no place it goes where the person is looking and leaves Home as it was, as the
// picker's rows always did; a place comes from a caller that is taking the person there, so the board is shown.
export const createWithCards = (board: Board, at?: Place) =>
  createBoard(at ?? currentPlace(), { board, open: at ? 'board' : 'cards' });

export const createExample = (at?: Place) => createWithCards(newBoard('My first board', 'My first board'), at);
