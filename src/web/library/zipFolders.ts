import type { ExportFolder, ImportResult } from '../../shared/fenmyrZip.ts';
import type { Folder, StoredBoard } from '../../shared/model.ts';
import { placeFolder } from '../../shared/placement.ts';
import { uid } from '../core/base.ts';
import { appState } from '../core/state.ts';
import { renewed } from './boardTree.ts';
import { createProject, type Place, uniqueName } from './create.ts';
import { walkFolder } from './folderWalk.ts';
import { refreshBoards } from './rowMenu.ts';
import { foldersIn, looseFolders, saveLib, subFolders } from './tree.ts';

// Places the folder or project of a zip. Every project, folder and board gets a new id, and what pointed at an old one
// (a folder's project and parent, a board's folder and parent, a canvas card's board) points at the new, so a zip opened
// twice makes two copies that share nothing. Names are kept inside; only the one that lands here is numbered, as
// Duplicate and + Folder do, because nothing else it holds can clash with what is new.
//
// createProject is used for the project: it numbers the name and saves. createFolder and createBoard are not. The first
// numbers a name against every folder there is, so a second copy of a project would hold "Ideas 2" next to "Ideas"; and
// both rebuild the sidebar on each call, which a project of dozens of folders and boards would do dozens of times. They
// are made here as Duplicate makes them, and the sidebar is rebuilt once at the end.
export type Landed =
  | { kind: 'placed'; name: string; folders: number; boards: number; orphaned: number; home: string }
  | { kind: 'blocked'; why: string };
const unreadable: Landed = { kind: 'blocked', why: "I couldn't read that zip." };

export async function landStructure(got: ImportResult, at: Place, picked: boolean): Promise<Landed> {
  const { root, projects, folders } = got.manifest,
    held = new Map<string, StoredBoard[]>(),
    known = new Set(got.boards.map(b => b.id));
  // a board is one of a folder's own unless another board in the zip holds it as a canvas
  for (const b of got.boards) {
    if (!b.folder || (b.parent && known.has(b.parent))) continue;
    const mine = held.get(b.folder);
    if (mine) mine.push(b);
    else held.set(b.folder, [b]);
  }
  const placed = { folders: 0, boards: 0, orphaned: 0 };
  const walk = (top: ExportFolder, project: string | null, parent: string | null, name: string) =>
    walkFolder<ExportFolder, StoredBoard, Folder>(
      top,
      { boards: f => held.get(f.id) ?? [], subs: f => folders.filter(x => x.parent === f.id) },
      {
        folder: async (f, above) => {
          const made: Folder = {
            id: uid(),
            name: above ? f.name : name,
            project: above ? (above.project ?? null) : project,
            open: true,
            ...(f.cover ? { cover: f.cover } : {}),
          };
          const holder = above ? above.id : parent;
          if (holder) made.parent = holder;
          appState.folders.push(made);
          placed.folders++;
          await saveLib();
          return made;
        },
        board: async (b, into) => {
          const { boards: copies, orphaned } = renewed(got.boards, b.id, { folder: into.id });
          // it is a board of its own here, wherever it hung before
          if (copies[0]) delete copies[0].parent;
          for (const c of copies) await Fenmyr.save(c);
          placed.boards += copies.length;
          placed.orphaned += orphaned;
        },
      },
    );

  if (root.kind === 'folder') {
    const top = folders.find(f => f.id === root.id),
      into = picked ? appState.folders.find(f => f.id === at.folder) : undefined,
      project = into ? (into.project ?? null) : at.project,
      verdict = placeFolder(appState, { id: '', name: '' }, into ?? null, project);
    if (!top) return unreadable;
    if (verdict.kind === 'blocked') return { kind: 'blocked', why: verdict.why };
    if (into) into.open = true;
    const siblings = into ? subFolders(into.id) : project ? foldersIn(project) : looseFolders(),
      name = uniqueName(siblings, top.name),
      made = await walk(top, project, into?.id ?? null, name);
    await refreshBoards();
    return { ...placed, kind: 'placed', name, folders: placed.folders - 1, home: `folder:${made.id}` };
  }

  const source = projects.find(p => p.id === root.id);
  if (!source) return unreadable;
  const created = await createProject(source.name),
    // the library is read again after it is saved, so what is set goes on the row that is there now
    project = appState.projects.find(p => p.id === created.id);
  if (project) {
    if (source.color) project.color = source.color;
    if (source.cover) project.cover = source.cover;
  }
  for (const top of folders.filter(f => !folders.some(x => x.id === f.parent)))
    await walk(top, created.id, null, top.name);
  await saveLib();
  await refreshBoards();
  return { ...placed, kind: 'placed', name: created.name, home: `project:${created.id}` };
}
