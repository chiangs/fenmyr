import type { Folder } from '../../shared/model.ts';
import { MAX_MADE } from '../../shared/myraReply.ts';
import { appState } from '../core/state.ts';

// What she says once she has made something, for /project, /folder and /board and for her own replies, so one action
// has one wording wherever it came from.

const inside = (place: string | undefined) => (place ? ` in “${place}”` : '');

// a folder is made unique, so the name she was given may not be the one it got
const askedFor = (asked: string, made: string) => (asked && asked !== made ? `, as “${asked}” was taken` : '');

const quoted = (names: readonly string[]) => {
  const all = names.map(n => `“${n}”`),
    last = all.pop();
  return all.length ? `${all.join(', ')} and ${last}` : (last ?? '');
};

const left = (n: number, which: string) => (n === 1 ? `the ${which} one` : `the ${which} ${n}`);

export function folderMade(made: Folder, asked: string) {
  const project = appState.projects.find(p => p.id === made.project)?.name,
    where = inside(project),
    why = askedFor(asked, made.name);
  return `I made the folder “${made.name}”${where}${why} ✦`;
}

export function boardsMade(names: readonly string[], into: string | undefined) {
  const what = names.length === 1 ? 'board' : 'boards',
    list = quoted(names),
    where = inside(into);
  return `I made the ${what} ${list}${where} ✦`;
}

// She has sent the person to the form, which makes the prototype once it is filled in.
export const prototypeAsked = (into: string) => `“${into}” holds prototypes, so I opened the form for a new one ✦`;

// Nothing is made until a choice in the dialog, so she speaks only when the name it started with is not the one asked for.
export const projectTaken = ({ name, asked }: { name: string; asked: string }) =>
  asked && asked !== name
    ? `There is already a project called “${asked}”, so I started the name at “${name}”.`
    : undefined;

export const noProject = (project: string, folder: string) =>
  `There is no project called “${project}” yet, so I did not make the folder “${folder}”.`;

// the names after the one a dialog or a form takes
const oneAtATime = (what: string, rest: number) => `${what} one at a time, so I did not make ${left(rest, 'other')}.`;
export const oneProject = (rest: number) => oneAtATime('The dialog starts projects', rest);
export const onePrototype = (rest: number) => oneAtATime('A prototype is made', rest);

export const cappedAt = (over: number) =>
  `I make up to ${MAX_MADE} at a time, so I did not make ${left(over, 'last')}.`;
