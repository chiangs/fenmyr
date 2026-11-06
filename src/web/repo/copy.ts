import type { Board, Folder, Project } from '../../shared/model.ts';
import { uid } from '../core/base.ts';
import { save } from '../core/history.ts';
import { appState } from '../core/state.ts';
import { refreshBoards } from '../library/rowMenu.ts';
import { boardsIn, saveLib } from '../library/tree.ts';
import { say } from '../myra/say.ts';
import { renderGitBar } from '../proto/gitbar.ts';
import { openColumn } from '../proto/layout.ts';
import { askGit } from './askGit.ts';
import { rootOf } from './codeFolder.ts';

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
    proto: { ...b.proto, dir: code.dir, copied: { from: from.name, files: code.files } },
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

type Prototype = Extract<Board, { kind: 'prototype' }>;

async function commitCopy(b: Prototype, root: string, message: string) {
  try {
    await Fenmyr.gitCommit({ root, dir: b.proto.dir, message });
    say('Committed. This version is in the history now ✦', 4000);
    renderGitBar(b);
  } catch (e) {
    failed(e);
  }
}

// A copied prototype, opened for the first time: Myra says where it came from and offers to commit it, in git's
// terms and then in plain words. She asks once; the question stays in the chat, and Commit in the git bar is always there.
export async function askAboutCopy(b: Board) {
  if (b.kind !== 'prototype' || !b.proto.copied) return;
  const { from, files } = b.proto.copied,
    { copied: _asked, ...proto } = b.proto;
  b.proto = proto;
  save();
  const root = rootOf(b);
  if (!root) return;
  const s = await Fenmyr.gitStatus(root).catch(() => null),
    repo = root.split('/').filter(Boolean).pop() ?? root,
    branch = s?.kind === 'repo' ? (s.branch ?? 'this branch') : 'this branch',
    to = appState.projects.find(p => p.repo?.path === root)?.name ?? repo,
    count = files === 1 ? '1 new file' : `${files} new files`,
    name = b.name ?? 'this prototype';
  askGit(
    `I copied “${name}” from ${from} into ${repo}/${b.proto.dir}. ${count}, not committed yet. Commit them to ${branch}?`,
    `Committing saves it in ${to}’s history, so you can always come back to this version. It stays on this computer until you push, which sends it to GitHub.`,
    [
      { label: 'Commit', cls: 'next', run: () => commitCopy(b, root, `Copy “${name}” from ${from}`) },
      { label: 'Show files', ghost: true, run: () => openColumn('code') },
      { label: 'Not now', ghost: true, run: () => {} },
    ],
  );
}
