import type { Folder, Project } from '../../shared/model.ts';
import type { FolderWish, MyraReply, Wanted } from '../../shared/myraReply.ts';
import { appState, session } from '../core/state.ts';
import { addBoardHere, addFolderHere } from '../library/addHere.ts';
import { createFolder, currentPlace } from '../library/create.ts';
import { openNewProject } from '../library/newProject.ts';
import { byName, findFolder, moveBoard, putFolder } from '../library/tree.ts';
import {
  boardsMade,
  cappedAt,
  folderMade,
  noFolder,
  noProject,
  oneProject,
  onePrototype,
  projectTaken,
  prototypeAsked,
} from './madeLines.ts';

// What her reply makes in the library, and the folders and boards it sorts. Each is what the button or slash command
// does, through the same function, and `told` collects what she says of it, which joins her own words once the work is done.

// Her folders.create: what /folder makes, at the top of the project the person is in or of the one she names. A project
// that does not exist is not made for it: a project is started in its dialog, which the person finishes.
export async function makeFolders({ items, over }: Wanted<FolderWish>, told: string[]) {
  for (const { name, project } of items) {
    const into = project ? byName(appState.projects, project) : undefined;
    if (project && !into) {
      told.push(noProject(project, name));
      continue;
    }
    told.push(folderMade(await addFolderHere(name, into), name));
  }
  if (over) told.push(cappedAt(over));
}

// Her boards.create: each name is what /board with that name makes, where the person is looking, and she says what she
// made once all are made. Each opens as it is made, so the last stays open and her line is in its chat.
export async function makeBoards({ items, over }: Wanted<string>, told: string[]) {
  const made: string[] = [];
  let into: string | undefined;
  for (const [i, name] of items.entries()) {
    const added = await addBoardHere(name);
    if (added.kind === 'prototype') {
      // a prototyping folder holds prototypes, which a form makes one at a time; without a repo she has sent the
      // person to link one and said so already
      const rest = items.length - i - 1;
      if (added.asked) told.push(prototypeAsked(added.into.name), ...(rest ? [onePrototype(rest)] : []));
      return;
    }
    made.push(added.board.name);
    into = added.into?.name;
  }
  if (made.length) told.push(boardsMade(made, into));
  if (over) told.push(cappedAt(over));
}

// Her projects.create opens the New project dialog with the first name in it and makes nothing: the person chooses how
// the first board begins, and the project is made then. The dialog starts one at a time, so she says the rest were not made.
export function startProject({ items, over }: Wanted<string>, told: string[]) {
  const [first, ...rest] = items;
  if (first === undefined) return;
  const opened = openNewProject(first),
    taken = opened && projectTaken(opened),
    others = rest.length + over;
  if (taken) told.push(taken);
  if (others) told.push(oneProject(others));
}

type Sorting = NonNullable<MyraReply['folders']>;

// The project the person is in: the one they are looking at, or else the one the open board's folder is in.
function projectHere() {
  const id = currentPlace().project ?? appState.folders.find(f => f.id === session.board?.folder)?.project;
  return appState.projects.find(p => p.id === id);
}

// The folder a name means. It is looked for in each project of `lookIn` in turn and, with `anywhere`, then in the whole
// library, so two projects that each have a "Boards" folder are not mixed up and a name only one folder has is found
// wherever it is.
function folderNamed(name: string, lookIn: readonly (Project | undefined)[], anywhere: boolean) {
  for (const project of lookIn) {
    const there = project ? appState.folders.filter(f => f.project === project.id) : [],
      found = byName(there, name);
    if (found) return found;
  }
  return anywhere ? findFolder(name) : undefined;
}

// Her folders.file puts a folder that is there into the project she names, or takes it out of its project with none. It
// makes nothing: a project or folder that is not there is left out with a line, and the other entries still apply. The
// project is where the folder goes, so it is not searched, or a folder of that name already in it would be the one found.
export function fileFolders(files: NonNullable<Sorting['file']>, told: string[]) {
  const here = projectHere();
  for (const { folder, project } of files) {
    const into = project ? byName(appState.projects, project) : undefined;
    if (project && !into) {
      told.push(noProject(project, folder));
      continue;
    }
    const found = folderNamed(folder, [here], true);
    if (!found) {
      told.push(noFolder(folder));
      continue;
    }
    putFolder(found.id, null, into?.id ?? null);
  }
}

// Her folders.move puts a board into a folder, or out of its folders with none. With a project named, that is the only
// project the folder is looked for in, and it is made there when it is not, so it may be numbered as /folder numbers it;
// with none, it is the project the person is in and then the whole library, and a folder that is nowhere is made in the
// project the person is in. A project that is not there is not made: that entry is left out with a line, and the other
// entries still apply.
export async function moveBoards(moves: NonNullable<Sorting['move']>, told: string[]) {
  const here = projectHere(),
    made = new Map<string, Folder>();
  for (const { board, folder, project } of moves) {
    if (!appState.boardList.some(b => b.id === board)) continue;
    if (!folder) {
      await moveBoard(board, null);
      continue;
    }
    const target = project ? byName(appState.projects, project) : undefined;
    if (project && !target) {
      told.push(noProject(project, folder));
      continue;
    }
    // a name that was numbered when it was made is not the name she gives the next board for it
    const asked = `${target?.id}\n${folder.trim().toLowerCase()}`;
    let into = made.get(asked) ?? folderNamed(folder, [target ?? here], !target);
    if (!into) {
      into = await createFolder({ project: (target ?? here)?.id ?? null, folder: null }, folder);
      made.set(asked, into);
      told.push(folderMade(into, folder));
    }
    await moveBoard(board, into.id);
  }
}
