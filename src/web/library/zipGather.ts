import {
  type ExportFolder,
  type ExportProject,
  foldersOut,
  projectsOut,
  type RootKind,
} from '../../shared/fenmyrZip.ts';
import type { Folder, StoredBoard } from '../../shared/model.ts';
import type { BoardSummary } from '../../shared/ops.ts';
import { appState } from '../core/state.ts';
import { boardTree } from './boardTree.ts';
import { walkFolder } from './folderWalk.ts';
import type { Kind } from './rowMenu.ts';
import { boardsIn, foldersIn, subFolders } from './tree.ts';

// What a zip of a board, a folder or a project would hold: every board once, with the boards inside their canvas cards,
// how many of them are boards in their own right, and the project and folders that hold them. A canvas whose board
// can't be loaded is counted, and keeps its card.
export type Gathered = {
  name: string;
  root: { kind: RootKind; id: string };
  boards: StoredBoard[];
  roots: number;
  missing: number;
  projects: ExportProject[];
  folders: ExportFolder[];
};

async function inFolders(tops: Folder[]) {
  const boards = new Map<string, StoredBoard>(),
    folders: Folder[] = [];
  let roots = 0,
    missing = 0;
  for (const top of tops)
    await walkFolder<Folder, BoardSummary, Folder>(
      top,
      { boards: f => boardsIn(f.id), subs: f => subFolders(f.id) },
      {
        folder: f => {
          folders.push(f);
          return f;
        },
        board: async b => {
          const tree = await boardTree(b.id, Fenmyr.load);
          if (tree.boards[0]) roots++;
          missing += tree.missing;
          for (const x of tree.boards) boards.set(x.id, x);
        },
      },
    );
  return { boards: [...boards.values()], folders, roots, missing };
}

export async function gather(kind: Kind, id: string): Promise<Gathered | null> {
  if (kind === 'board') {
    const tree = await boardTree(id, Fenmyr.load),
      root = tree.boards[0];
    if (!root) return null;
    return {
      name: root.name || 'Untitled board',
      root: { kind, id },
      boards: tree.boards,
      roots: 1,
      missing: tree.missing,
      projects: [],
      folders: [],
    };
  }
  if (kind === 'folder') {
    const folder = appState.folders.find(f => f.id === id);
    if (!folder) return null;
    const found = await inFolders([folder]);
    // what holds the folder stays behind, so the zip points at nothing that isn't in it
    const entries = foldersOut(found.folders).map(e => ({
      ...e,
      project: null,
      parent: e.id === id ? null : e.parent,
    }));
    return { ...found, name: folder.name, root: { kind, id }, projects: [], folders: entries };
  }
  const project = appState.projects.find(p => p.id === id);
  if (!project) return null;
  const found = await inFolders(foldersIn(id));
  return {
    ...found,
    name: project.name,
    root: { kind, id },
    projects: projectsOut([project]),
    folders: foldersOut(found.folders),
  };
}
