import type { ChatMsg, Folder, Project } from '../../shared/model.ts';
import { uid } from '../core/base.ts';
import { appState } from '../core/state.ts';
import { refreshBoards } from '../library/rowMenu.ts';
import { boardsIn, saveLib } from '../library/tree.ts';
import { say } from '../settings/licenses.ts';

const repoName = (p: Project) => p.repo?.path.split('/').filter(Boolean).pop() ?? p.name;

// Myra tells the copy's chat where it came from, first in git's terms, then in plain words.
const copiedNote = (name: string, from: Project, to: Project, dir: string, files: number): ChatMsg[] => {
  const t = Date.now(),
    s = files === 1 ? '' : 's';
  return [
    {
      who: 'myra',
      text: `I copied “${name}” from ${from.name} into ${repoName(to)}/${dir}. ${files} new file${s}, not committed yet.`,
      t,
    },
    {
      who: 'myra',
      text: `Committing saves it in ${to.name}’s history, so you can always come back to this version. It stays on this computer until you push, which sends it to GitHub.`,
      t,
    },
  ];
};

// A prototype board and its code, copied into a prototyping folder of another project. The original stays.
async function copyBoard(id: string, into: Folder, to: Project) {
  const b = await Fenmyr.load(id);
  const fromFolder = appState.folders.find(f => f.id === b?.folder);
  const from = appState.projects.find(p => p.id === fromFolder?.project);
  if (b?.kind !== 'prototype' || !from?.repo || !to.repo) return;
  const code = await Fenmyr.protoCopy({ fromRoot: from.repo.path, dir: b.proto.dir, toRoot: to.repo.path });
  const { parent: _parent, ...rest } = b;
  await Fenmyr.save({
    ...rest,
    id: uid(),
    folder: into.id,
    proto: { ...b.proto, dir: code.dir },
    chat: [...(b.chat ?? []), ...copiedNote(b.name ?? 'Untitled', from, to, code.dir, code.files)],
  });
}

const failed = (e: unknown) => say(e instanceof Error ? e.message : String(e), 6000);

export async function copyPrototype(id: string, into: Folder, to: Project) {
  try {
    await copyBoard(id, into, to);
    await refreshBoards();
    say(`Copied it to “${to.name}”. The original stays where it was ✦`, 5000);
  } catch (e) {
    failed(e);
  }
}

export async function copyPrototypingFolder(f: Folder, parent: Folder | null, to: Project) {
  const made: Folder = { id: uid(), name: f.name, project: to.id, kind: 'prototyping', open: true };
  if (parent) made.parent = parent.id;
  appState.folders.push(made);
  await saveLib();
  try {
    for (const b of boardsIn(f.id)) await copyBoard(b.id, made, to);
    say(`Copied “${f.name}” to “${to.name}”. The original stays where it was ✦`, 5000);
  } catch (e) {
    failed(e);
  }
  await refreshBoards();
}
