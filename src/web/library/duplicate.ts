import type { Folder, Project } from '../../shared/model.ts';
import type { BoardSummary } from '../../shared/ops.ts';
import { uid } from '../core/base.ts';
import { appState } from '../core/state.ts';
import { chirp } from '../myra/say.ts';
import { boardTree, renewed } from './boardTree.ts';
import { walkFolder } from './folderWalk.ts';
import { type Kind, refreshBoards, type Thing } from './rowMenu.ts';
import { boardsIn, foldersIn, saveLib, subFolders } from './tree.ts';

// copying a board also copies the canvases inside it, so the copy doesn't share them
async function copyBoard(id: string, into: { name?: string; parent?: string; folder?: string | null } = {}) {
  const copies = renewed((await boardTree(id, Fenmyr.load)).boards, id, into).boards;
  for (const c of copies) await Fenmyr.save(c);
  return copies[0] ?? null;
}

export async function duplicate(kind: Kind, obj: Thing) {
  if (kind === 'board') {
    const c = await copyBoard(obj.id, { name: `${obj.name} copy` });
    await refreshBoards();
    if (c) chirp(`Made “${c.name}” ✦`, 3500);
    return;
  }
  // copy a folder, the folders inside it and all their boards
  const copyFolder = (f0: Folder, name: string, project: string | null, parent: string | null) =>
    walkFolder<Folder, BoardSummary, Folder>(
      f0,
      { boards: f => boardsIn(f.id), subs: f => subFolders(f.id) },
      {
        folder: async (f, above) => {
          const copy: Folder = { id: uid(), name: above ? f.name : name, project, open: true },
            into = above ? above.id : parent;
          if (into) copy.parent = into;
          appState.folders.push(copy);
          await saveLib();
          return copy;
        },
        board: (b, into) => copyBoard(b.id, { folder: into.id }),
      },
    );
  if (kind === 'folder') await copyFolder(obj, `${obj.name} copy`, obj.project || null, obj.parent || null);
  if (kind === 'project') {
    const p: Project = { id: uid(), name: `${obj.name} copy`, open: true, ...(obj.color ? { color: obj.color } : {}) };
    appState.projects.push(p);
    await saveLib();
    for (const f0 of foldersIn(obj.id)) await copyFolder(f0, f0.name, p.id, null);
  }
  await refreshBoards();
  chirp(`Made “${obj.name} copy” ✦`, 3500);
}
