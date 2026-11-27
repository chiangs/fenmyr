import {
  type BuildEvent,
  type BuildRecord,
  checkErrors,
  type FileDiff,
  type PreviewCheck,
  wasStopped,
} from '../../shared/build.ts';
import { type ChatAction, type ChatMsg, MAX_EXPLAINED } from '../../shared/chat.ts';
import type { Board } from '../../shared/model.ts';
import { session } from '../core/state.ts';
import { chatLog, focusMsg, pushMsg, redrawMsgs, showAdded } from '../myra/chatLog.ts';
import { type Running, runningBuild } from './buildSlot.ts';
import { showChanges } from './dockHead.ts';
import { keepSources } from './sources.ts';

// A build's record in its prototype's chat and the five times it is written: asked, started, ended, checked and
// undone. Each is one changeBoard, open board or not. Each finds the record by build id and applies only what is missing,
// so running one twice changes nothing. On the open board each draws what it changed in the same tick, so a board that
// has just opened can't draw it twice, and none draws the whole chat again, which would lose the buttons of a question
// showing there.
type Change = (b: Board) => boolean;
type Prototype = Extract<Board, { kind: 'prototype' }>;
type Found = { m: ChatMsg; a: BuildRecord };
// what landing a build needs to know of it
type Landing = Pick<Running, 'board' | 'build' | 'request' | 'cards' | 'asked' | 'start' | 'was' | 'files'>;
// what its block needs from the moment it is asked for
type Asked = Pick<Running, 'board' | 'build' | 'request' | 'cards'>;

function find(msgs: readonly ChatMsg[], build: string): Found | null {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i],
      a = m?.acts?.find((x): x is BuildRecord => x.kind === 'build' && x.build === build);
    if (m && a) return { m, a };
  }
  return null;
}

function newBlock(r: Asked, start: Landing['start'] = null): Found {
  const a: BuildRecord = {
    kind: 'build',
    board: r.board,
    build: r.build,
    request: r.request.slice(0, 200),
    cards: r.cards,
    ...(start ? { start } : {}),
  };
  return { m: { who: 'myra', text: '', t: Date.now(), acts: [a] }, a };
}

const line = (text: string, acts: ChatAction[]): ChatMsg =>
  acts.length ? { who: 'myra', text, t: Date.now(), acts } : { who: 'myra', text, t: Date.now() };

/** Draws a build's block again, where its board is open. */
export function redrawBlock(build: string) {
  const found = find(chatLog(), build);
  if (found) redrawMsgs([found.m]);
}

/** Moves keyboard focus onto a build's block, where its board is open. */
export function focusBlock(build: string) {
  const found = find(chatLog(), build);
  if (found) focusMsg(found.m);
}

/** A build's record in the open board's chat, if it still has one. */
export const recordOf = (build: string) => find(chatLog(), build)?.a ?? null;

/** A build's record in a board's chat, open or not, if it still has one. */
export const recordIn = (b: Board, build: string) => find(b.chat ?? [], build)?.a ?? null;

// Which of a block's or a line's Undo this build, Explain the code and Commit show follows the newest build, so when it
// changes only the lines of the builds it changed between are drawn again, and those of a board from before builds were
// named, which go by the newest in the chat. Drawing every one would lay out the whole thread again on each build. The
// header's changes counter follows it too.
type NewestOnly = Extract<ChatAction, { kind: 'build' | 'buildUndo' | 'explain' | 'commit' }>;
const newestOnly = (a: ChatAction): a is NewestOnly =>
  a.kind === 'build' || a.kind === 'buildUndo' || a.kind === 'explain' || a.kind === 'commit';
function redrawBuilds(...builds: (string | undefined)[]) {
  const which = new Set([...builds, undefined]);
  redrawMsgs(chatLog().filter(m => m.acts?.some(a => newestOnly(a) && which.has(a.build))));
  if (session.board) showChanges(session.board);
}

/** The files a prototype's newest build changed, for the changes counter: none while one of its builds runs, once the
 *  newest is undone, or when it changed nothing. The newest is the last one in its chat that started, so a request
 *  waiting its turn, or one that never started, leaves the build before it counted, since neither changed a file. It
 *  isn't `proto.build`, which goes back to the build before one that changed nothing, so that build's Undo this build
 *  and Commit return; the counter says what the last build changed, which was nothing. A build Fenmyr closed on has no
 *  end, so what it changed isn't known and nothing is counted. */
export function newestChanges(b: Board): string[] {
  if (b.kind !== 'prototype' || runningBuild()?.board === b.id) return [];
  const a = (b.chat ?? [])
    .flatMap(m => m.acts ?? [])
    .findLast((x): x is BuildRecord => x.kind === 'build' && !!x.start);
  return a?.end && !a.undone ? a.end.files.map(f => f.path) : [];
}

/** A build has left the queue, or gone back to it, so which is its prototype's newest has changed where it is open:
 *  the build before it shows Undo this build and Commit only while this one doesn't run. */
export function redrawNewest(r: Pick<Running, 'board' | 'build'>) {
  const b = session.board;
  if (b?.kind === 'prototype' && b.id === r.board) redrawBuilds(b.proto.build, r.build);
}

/** Asked: the block, as soon as the build is asked for, whether it starts or waits its turn. */
export const asked =
  (r: Asked): Change =>
  b => {
    if (b.kind !== 'prototype' || find(b.chat ?? [], r.build)) return false;
    const { m } = newBlock(r);
    pushMsg(b, m);
    if (b === session.board) showAdded([m]);
    return true;
  };

// The host has saved the folder: its snapshot and time go on the record together, and only now does it become the
// board's newest build, so a build that fails before that leaves the one before it with Undo this build.
function startIn(b: Prototype, r: Landing) {
  const found = find(b.chat ?? [], r.build);
  let changed = false;
  if (r.start && found && !found.a.start) {
    found.a.start = r.start;
    changed = true;
  }
  if (r.start && b.proto.build !== r.build) {
    r.was = b.proto.build;
    b.proto = { ...b.proto, build: r.build };
    changed = true;
  }
  return changed;
}

/** Started: the host's start event. Its block, now building, is drawn again, and so is the block of the build before
 *  it, which is no longer the newest and stops waiting for a check of its preview. Their buttons were drawn when it
 *  left the queue. */
export const started =
  (r: Running): Change =>
  b => {
    if (b.kind !== 'prototype' || !startIn(b, r)) return false;
    if (b === session.board) {
      redrawBlock(r.build);
      if (r.was) redrawBlock(r.was);
    }
    return true;
  };

// the order its edits first named them, then any no edit named; one an edit named that ended unchanged isn't there
const inWriteOrder = (files: FileDiff[], named: readonly string[]) => [
  ...named.flatMap(p => files.filter(f => f.path === p)),
  ...files.filter(f => !named.includes(f.path)),
];

// Her one line over what a build the person stopped had written, which carries its Undo. She said "Okay, I’ve stopped."
// when Stop was pressed, and it isn't a failure.
const KEPT = 'I’ve kept what I’d written so far.';

/** Ended: how it ended goes on the record, then her line: her explanation with her next steps, or why it stopped,
 *  with Undo this build, and Commit after her explanation, when it changed files. said: her words for a failure, in
 *  place of "I couldn't finish that" and the reason. A build the person stopped has no failure line, and a line only
 *  when it left files to undo. A block the chat no longer has, trimmed or cleared away, comes back first. Once the
 *  record has an end, nothing happens. */
export const ended =
  (r: Landing, e: Extract<BuildEvent, { type: 'done' | 'error' }>, at: number, said?: string): Change =>
  b => {
    if (b.kind !== 'prototype' || find(b.chat ?? [], r.build)?.a.end) return false;
    // its end repeats the snapshot, so a start event that never landed is made good here
    if (!r.start && e.snapshot) r.start = { at: r.asked, snapshot: e.snapshot };
    startIn(b, r);
    const added: ChatMsg[] = [];
    let found = find(b.chat ?? [], r.build);
    if (!found) {
      found = newBlock(r, r.start);
      pushMsg(b, found.m);
      added.push(found.m);
    }
    const { board, build } = r,
      files = inWriteOrder(e.files, r.files),
      undo: ChatAction[] =
        e.snapshot && files.length ? [{ kind: 'buildUndo', board, snapshot: e.snapshot, build }] : [];
    // One that changed nothing has nothing to undo or commit, so the build before it stays the newest, with its own
    // Undo this build and Commit, unless a newer one has started since.
    if (!files.length && b.proto.build === build) b.proto = { ...b.proto, build: r.was };
    if (e.type === 'done') {
      found.a.end = { kind: 'built', at, files, outside: e.outside, from: keepSources(b, e.sources) };
      // the commit message she suggests: the first line of what she was asked to do
      const message = r.request.split(/[\n.]/)[0]?.trim().slice(0, 72) ?? '',
        paths = files.slice(0, MAX_EXPLAINED).map(f => f.path),
        kept: ChatAction[] = files.length
          ? [
              { kind: 'explain', board, build, files: paths },
              { kind: 'commit', board, message, build },
            ]
          : [];
      added.push(line(e.text, [...undo, ...kept, ...e.next.map((text): ChatAction => ({ kind: 'next', text }))]));
    } else {
      found.a.end = { kind: 'failed', at, files };
      if (!wasStopped(e)) added.push(line(said ?? `I couldn’t finish that. ${e.text}`, undo));
      else if (undo.length) added.push(line(KEPT, undo));
    }
    for (const m of added) if (m !== found.m) pushMsg(b, m);
    if (b === session.board) {
      // It is the newest, or, when it changed nothing or never started, the one before it is again. When its start was
      // never heard, the one before it is drawn too, since it no longer waits for a check.
      redrawBuilds(build, b.proto.build, r.was);
      showAdded(added);
    }
    return true;
  };

/** Ended, for a build this window didn't start, such as one it was reloaded in the middle of: its record stands in for
 *  what the window would have known, and with no record left there is nothing to land it on. */
export const endedLost =
  (e: Extract<BuildEvent, { type: 'done' | 'error' }>): Change =>
  b => {
    const a = find(b.chat ?? [], e.build)?.a;
    if (!a || a.end) return false;
    const { board, build, request, cards, start = null } = a;
    return ended(
      { board, build, request, cards, asked: start?.at ?? Date.now(), start, was: undefined, files: [] },
      e,
      Date.now(),
    )(b);
  };

/** Checked: what its preview did, kept once, while it is still the board's newest build and not undone, so a newer
 *  build's preview never answers for it. Only its block shows it. */
export const checked =
  (build: string, check: PreviewCheck): Change =>
  b => {
    if (b.kind !== 'prototype' || b.proto.build !== build) return false;
    const a = find(b.chat ?? [], build)?.a;
    if (a?.end?.kind !== 'built' || a.end.check || a.undone) return false;
    a.end.check = check;
    if (b === session.board) redrawBlock(build);
    return true;
  };

/** The errors the kept check of a board's newest build found, or none when it has no check or was undone. */
export function newestErrors(b: Board) {
  const a = b.kind === 'prototype' && b.proto.build ? find(b.chat ?? [], b.proto.build)?.a : undefined,
    check = a?.end?.kind === 'built' && !a.undone ? a.end.check : undefined;
  return check ? checkErrors(check) : '';
}

/** Undone: Undo this build put the folder back as it was before the build. */
export const undone =
  (build: string): Change =>
  b => {
    const found = find(b.chat ?? [], build);
    if (!found || found.a.undone) return false;
    found.a.undone = true;
    // the block says so, and Commit goes from her line
    if (b === session.board) redrawBuilds(build);
    return true;
  };
