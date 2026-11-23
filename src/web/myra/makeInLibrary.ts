import type { FolderWish, Wanted } from '../../shared/myraReply.ts';
import { appState } from '../core/state.ts';
import { addBoardHere, addFolderHere } from '../library/addHere.ts';
import { openNewProject } from '../library/newProject.ts';
import { byName } from '../library/tree.ts';
import {
  boardsMade,
  cappedAt,
  folderMade,
  noProject,
  oneProject,
  onePrototype,
  projectTaken,
  prototypeAsked,
} from './madeLines.ts';

// What her reply makes in the library. Each is what the button or slash command makes, through the same function, and
// `told` collects what she says of it, which joins her own words once the work is done.

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
