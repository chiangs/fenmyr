import type { BuildEvent, BuildRecord, FileDiff } from '../../shared/build.ts';
import type { ChatAction, ChatMsg } from '../../shared/chat.ts';
import type { Board } from '../../shared/model.ts';
import { session } from '../core/state.ts';
import { chatLog, pushMsg, redrawMsgs, showAdded } from '../myra/chatLog.ts';
import type { Running } from './buildSlot.ts';
import { keepSources } from './sources.ts';

// A build's record in its prototype's chat and the four times it is written: asked, started, ended and undone. Each is
// one changeBoard, open board or not. Each finds the record by build id and applies only what is missing, so running one
// twice changes nothing. On the open board each draws what it changed in the same tick, so a board that has just opened
// can't draw it twice, and none draws the whole chat again, which would lose the buttons of a question showing there.
type Change = (b: Board) => boolean;
type Prototype = Extract<Board, { kind: 'prototype' }>;
type Found = { m: ChatMsg; a: BuildRecord };
// what landing a build needs to know of it
type Landing = Pick<Running, 'board' | 'build' | 'request' | 'cards' | 'asked' | 'start' | 'was' | 'files'>;

function find(msgs: readonly ChatMsg[], build: string): Found | null {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i],
      a = m?.acts?.find((x): x is BuildRecord => x.kind === 'build' && x.build === build);
    if (m && a) return { m, a };
  }
  return null;
}

function newBlock(r: Landing): Found {
  const a: BuildRecord = {
    kind: 'build',
    board: r.board,
    build: r.build,
    request: r.request.slice(0, 200),
    cards: r.cards,
    ...(r.start ? { start: r.start } : {}),
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

/** A build's record in the open board's chat, if it still has one. */
export const recordOf = (build: string) => find(chatLog(), build)?.a ?? null;

// Which of a block's or a line's Undo this build and Commit show follows the newest build, so when it changes only the
// lines of the builds it changed between are drawn again, and those of a board from before builds were named, which go
// by the newest in the chat. Drawing every one would lay out the whole thread again on each build.
type NewestOnly = Extract<ChatAction, { kind: 'build' | 'buildUndo' | 'commit' }>;
const newestOnly = (a: ChatAction): a is NewestOnly =>
  a.kind === 'build' || a.kind === 'buildUndo' || a.kind === 'commit';
function redrawBuilds(...builds: (string | undefined)[]) {
  const which = new Set([...builds, undefined]);
  redrawMsgs(chatLog().filter(m => m.acts?.some(a => newestOnly(a) && which.has(a.build))));
}

/** Asked: the block, as soon as the build is asked for. */
export const asked =
  (r: Running): Change =>
  b => {
    if (b.kind !== 'prototype' || find(b.chat ?? [], r.build)) return false;
    const { m } = newBlock(r);
    pushMsg(b, m);
    if (b !== session.board) return true;
    // the build before it stops being the newest
    redrawBuilds(b.proto.build, r.build);
    showAdded([m]);
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

/** Started: the host's start event. It was already the newest build since it was asked for, so only its block, now
 *  building, is drawn again. */
export const started =
  (r: Running): Change =>
  b => {
    if (b.kind !== 'prototype' || !startIn(b, r)) return false;
    if (b === session.board) redrawBlock(r.build);
    return true;
  };

// the order its edits first named them, then any no edit named; one an edit named that ended unchanged isn't there
const inWriteOrder = (files: FileDiff[], named: readonly string[]) => [
  ...named.flatMap(p => files.filter(f => f.path === p)),
  ...files.filter(f => !named.includes(f.path)),
];

/** Ended: how it ended goes on the record, then her line: her explanation with her next steps, or why it stopped,
 *  with Undo this build, and Commit after her explanation, when it changed files. said: her words for a failure, in
 *  place of "I couldn't finish that" and the reason. A block the chat no longer has, trimmed or cleared away, comes back
 *  first. Once the record has an end, nothing happens. */
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
      found = newBlock(r);
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
        commit: ChatAction[] = files.length ? [{ kind: 'commit', board, message, build }] : [];
      added.push(line(e.text, [...undo, ...commit, ...e.next.map((text): ChatAction => ({ kind: 'next', text }))]));
    } else {
      found.a.end = { kind: 'failed', at, files };
      added.push(line(said ?? `I couldn’t finish that. ${e.text}`, undo));
    }
    for (const m of added) if (m !== found.m) pushMsg(b, m);
    if (b === session.board) {
      // it is the newest, or, when it changed nothing or never started, the one before it is again
      redrawBuilds(build, b.proto.build);
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
