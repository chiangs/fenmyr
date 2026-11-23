import { addBoardHere, addFolderHere } from '../library/addHere.ts';
import { openNewProject } from '../library/newProject.ts';
import { boardsMade, folderMade, projectTaken, prototypeAsked } from './madeLines.ts';
import { reply } from './say.ts';

// what comes after the command, as a name: one line, with no gaps at the ends or doubled inside
const nameOf = (arg: string) => arg.replace(/\s+/g, ' ').trim();

// Each does what its button does, through the same function, and she speaks once it is done. /board has opened the new
// board by then, and chats are kept per board, so her line is in the new board's chat. Her words are in madeLines.ts,
// which her own replies read too.

export function slashProject(arg: string) {
  const opened = openNewProject(nameOf(arg)),
    taken = opened && projectTaken(opened);
  if (taken) reply(taken);
}

export async function slashFolder(arg: string) {
  const asked = nameOf(arg),
    made = await addFolderHere(asked);
  reply(folderMade(made, asked));
}

export async function slashBoard(arg: string) {
  const added = await addBoardHere(nameOf(arg));
  switch (added.kind) {
    case 'board':
      return reply(boardsMade([added.board.name], added.into?.name));
    case 'prototype':
      // without a repo she has sent the person to link one, and said so already
      if (added.asked) reply(prototypeAsked(added.into.name));
      return;
    default: {
      const unhandled: never = added;
      return unhandled;
    }
  }
}
