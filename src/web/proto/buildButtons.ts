import { type BuildRecord, checkFailed } from '../../shared/build.ts';
import type { ChatAction } from '../../shared/chat.ts';
import type { Board } from '../../shared/model.ts';
import { session } from '../core/state.ts';
import { changeBoard } from '../library/boardWrites.ts';
import type { Button } from '../myra/acts.ts';
import { ask } from '../myra/chat.ts';
import { chatLog } from '../myra/chatLog.ts';
import { type SayAction, say } from '../myra/say.ts';
import { rootOf } from '../repo/codeFolder.ts';
import { recordOf, undone } from './buildRecord.ts';
import { runningBuild } from './buildSlot.ts';
import { hostBusy, stillBuilding } from './buildWait.ts';
import { renderCode } from './code.ts';
import { askCommit } from './gitActions.ts';
import { renderGitBar } from './gitbar.ts';
import { renderPreview } from './preview.ts';

// The buttons a build leaves: Undo this build and Commit under her line, Undo this build on the block of a build Fenmyr
// closed on, and Fix the errors on the block of one whose preview check failed. Each shows only while its prototype is
// open, and only for the board's newest build: Undo puts the whole folder back as it was before the build, so an older
// one would undo the builds after it too, Commit takes the whole folder, and the preview runs the newest code.
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
  const done = await Fenmyr.protoUndo({ root, dir: b.proto.dir, snapshot });
  // a window reloaded while the build ran thinks it stopped
  if (done.kind === 'busy') return hostBusy('undo');
  if (build) await changeBoard(b.id, undone(build));
  await refreshPanes();
  return say('It’s back to how it was before that build ✦', 5000);
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
  return {
    label: 'Undo this build',
    ghost: true,
    held: () => stillBuilding(b, 'undo'),
    run: () => undo(b, root, a.snapshot, a.build),
  };
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
  if (!b || !commitShows(b, a)) return null;
  return {
    label: 'Commit',
    cls: 'next',
    held: () => stillBuilding(b, 'commit'),
    run: () => askCommit(b, a.message),
  };
}

/** Undo this build on the block of a build Fenmyr closed on, which has no line of hers to carry it. A click mustn't
 *  take the record with it, so it shows until the record says it's undone. */
export function stoppedUndo(a: BuildRecord): Omit<Button, 'after'> | null {
  const b = openProto(a.board),
    root = b && rootOf(b),
    start = a.start;
  if (!b || !root || !start || a.undone || newestBuild(b) !== a.build) return null;
  return {
    label: 'Undo this build',
    ghost: true,
    held: () => stillBuilding(b, 'undo'),
    run: () => undo(b, root, start.snapshot, a.build),
  };
}

/** Fix the errors on the block of a build whose preview check found errors, while it is the newest and not undone. It
 *  asks her as the person would, so a build it leads to waits its turn like any other. Its errors reach that build as
 *  the preview's errors when it starts. */
export function fixButton(a: BuildRecord): Omit<Button, 'after'> | null {
  const b = openProto(a.board),
    check = a.end?.kind === 'built' ? a.end.check : undefined;
  if (!b || !check || !checkFailed(check) || a.undone || newestBuild(b) !== a.build) return null;
  return { label: 'Fix the errors', run: () => ask('Fix the errors in the preview') };
}
