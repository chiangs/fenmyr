import type { BuildRecord } from '../../shared/build.ts';
import type { ChatAction } from '../../shared/chat.ts';
import type { Board } from '../../shared/model.ts';
import { session } from '../core/state.ts';
import { changeBoard } from '../library/boardWrites.ts';
import type { Button } from '../myra/acts.ts';
import { chatLog } from '../myra/chatLog.ts';
import { type SayAction, say } from '../myra/say.ts';
import { rootOf } from '../repo/codeFolder.ts';
import { recordOf, undone } from './buildRecord.ts';
import { runningBuild } from './buildSlot.ts';
import { renderCode } from './code.ts';
import { askCommit } from './gitActions.ts';
import { renderGitBar } from './gitbar.ts';
import { renderPreview } from './preview.ts';

// The buttons a build leaves: Undo this build and Commit under her line, and Undo this build on the block of a build
// Fenmyr closed on. Each shows only while its prototype is open, and only for the board's newest build: Undo puts the
// whole folder back as it was before the build, so an older one would undo the builds after it too, and Commit takes
// the whole folder.
type Prototype = Extract<Board, { kind: 'prototype' }>;

// A build being asked for on this board is already its newest: the one before it can't be undone while the host saves
// the folder. It becomes the board's own once the folder is saved, and the one before comes back if it never is.
const newestBuild = (b: Prototype) => {
  const r = runningBuild();
  return r?.board === b.id ? r.build : b.proto.build;
};

/** The code, the git bar and the preview catch up with the folder, when a prototype is open. */
export async function refreshPanes() {
  if (session.board?.kind !== 'prototype') return;
  await Promise.all([renderCode(session.board), renderGitBar(session.board), renderPreview(session.board)]);
}

async function undo(b: Prototype, root: string, snapshot: string, build: string | undefined) {
  await Fenmyr.protoUndo({ root, dir: b.proto.dir, snapshot });
  if (build) await changeBoard(b.id, undone(build));
  await refreshPanes();
  say('It’s back to how it was before that build ✦', 5000);
}

const openProto = (board: string) => {
  const b = session.board;
  return b?.id === board && b.kind === 'prototype' ? b : null;
};

type BuildUndo = Extract<ChatAction, { kind: 'buildUndo' }>;
const newestUndo = (board: string) =>
  chatLog()
    .flatMap(m => m.acts ?? [])
    .findLast((a): a is BuildUndo => a.kind === 'buildUndo' && a.board === board);

// A board from before builds were named goes by the newest Undo in its chat.
const isLatest = (b: Prototype, a: BuildUndo) => {
  const newest = newestBuild(b);
  return newest ? a.build === newest : newestUndo(a.board)?.snapshot === a.snapshot;
};

export function buildUndoButton(a: BuildUndo): Omit<Button, 'after'> | null {
  const b = openProto(a.board),
    root = b && rootOf(b);
  if (!b || !root || !isLatest(b, a)) return null;
  return { label: 'Undo this build', ghost: true, run: () => undo(b, root, a.snapshot, a.build) };
}

type Commit = Extract<ChatAction, { kind: 'commit' }>;
const newestCommit = (board: string) =>
  chatLog()
    .flatMap(m => m.acts ?? [])
    .findLast((a): a is Commit => a.kind === 'commit' && a.board === board);

// Not once Undo this build has put the build's files back: the message would be for changes that are gone. A Commit
// from before it named its build shows while it is the newest in the chat and the newest build has no block.
function commitShows(b: Prototype, a: Commit) {
  const newest = newestBuild(b);
  if (a.build) return a.build === newest && !recordOf(a.build)?.undone;
  return newestCommit(a.board) === a && !(newest && recordOf(newest));
}

export function commitButton(a: Commit): SayAction | null {
  const b = openProto(a.board);
  return b && commitShows(b, a) ? { label: 'Commit', cls: 'next', run: () => askCommit(b, a.message) } : null;
}

/** Undo this build on the block of a build Fenmyr closed on, which has no line of hers to carry it. A click mustn't
 *  take the record with it, so it shows until the record says it's undone. */
export function stoppedUndo(a: BuildRecord): Omit<Button, 'after'> | null {
  const b = openProto(a.board),
    root = b && rootOf(b),
    start = a.start;
  if (!b || !root || !start || a.undone || newestBuild(b) !== a.build) return null;
  return { label: 'Undo this build', ghost: true, run: () => undo(b, root, start.snapshot, a.build) };
}
