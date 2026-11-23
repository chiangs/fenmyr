import { appState } from '../core/state.ts';
import { addBoardHere, addFolderHere } from '../library/addHere.ts';
import { openNewProject } from '../library/newProject.ts';
import { reply } from './say.ts';

// what comes after the command, as a name: one line, with no gaps at the ends or doubled inside
const nameOf = (arg: string) => arg.replace(/\s+/g, ' ').trim();

const inside = (place: string | undefined) => (place ? ` in “${place}”` : '');

// a folder is made unique, so the name she says may not be the one asked for
const askedFor = (asked: string, made: string) => (asked && asked !== made ? `, as “${asked}” was taken` : '');

// Each does what its button does, through the same function, and she speaks once it is done. /board has opened the new
// board by then, and chats are kept per board, so her line is in the new board's chat.

// Nothing is made until a choice in the dialog, so there is nothing to confirm: she speaks only when the name is not
// the one asked for.
export function slashProject(arg: string) {
  const opened = openNewProject(nameOf(arg));
  if (opened?.asked && opened.asked !== opened.name)
    reply(`There is already a project called “${opened.asked}”, so I started the name at “${opened.name}”.`);
}

export async function slashFolder(arg: string) {
  const asked = nameOf(arg),
    made = await addFolderHere(asked),
    project = appState.projects.find(p => p.id === made.project)?.name,
    where = inside(project),
    why = askedFor(asked, made.name);
  reply(`I made the folder “${made.name}”${where}${why} ✦`);
}

export async function slashBoard(arg: string) {
  const added = await addBoardHere(nameOf(arg));
  switch (added.kind) {
    case 'board': {
      const where = inside(added.into?.name);
      return reply(`I made the board “${added.board.name}”${where} ✦`);
    }
    case 'prototype':
      // without a repo she has sent the person to link one, and said so already
      if (added.asked) reply(`“${added.into.name}” holds prototypes, so I opened the form for a new one ✦`);
      return;
    default: {
      const unhandled: never = added;
      return unhandled;
    }
  }
}
