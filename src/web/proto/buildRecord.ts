import type { BuildEvent, BuildRecord, FileDiff } from '../../shared/build.ts';
import type { ChatAction, ChatMsg } from '../../shared/chat.ts';
import type { Board } from '../../shared/model.ts';
import { session } from '../core/state.ts';
import { chatLog, pushMsg, redrawMsg, showAdded } from '../myra/chatLog.ts';
import type { Running } from './buildSlot.ts';
import { keepSources } from './sources.ts';

// A build's record in its prototype's chat and the four times it is written: asked, started, ended and undone. Each is
// one changeBoard, open board or not. Each finds the record by build id and applies only what is missing, so running one
// twice changes nothing. On the open board each draws what it changed in the same tick, so a board that has just opened
// can't draw it twice, and none draws the whole chat again, which would lose the buttons of a question showing there.
type Change = (b: Board) => boolean;
type Prototype = Extract<Board, { kind: 'prototype' }>;
type Found = { m: ChatMsg; a: BuildRecord };

function find(msgs: readonly ChatMsg[], build: string): Found | null {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i],
      a = m?.acts?.find((x): x is BuildRecord => x.kind === 'build' && x.build === build);
    if (m && a) return { m, a };
  }
  return null;
}

function newBlock(r: Running): Found {
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
  if (found) redrawMsg(found.m);
}

// Every block, and every line with Undo this build or Commit: which of their buttons show follows the newest build.
const NEWEST_ONLY = new Set<ChatAction['kind']>(['build', 'buildUndo', 'commit']);
function redrawBuilds() {
  for (const m of chatLog()) if (m.acts?.some(a => NEWEST_ONLY.has(a.kind))) redrawMsg(m);
}

/** Asked: the block, as soon as the build is asked for. */
export const asked =
  (r: Running): Change =>
  b => {
    if (b.kind !== 'prototype' || find(b.chat ?? [], r.build)) return false;
    const { m } = newBlock(r);
    pushMsg(b, m);
    if (b === session.board) showAdded([m]);
    return true;
  };

// The host has saved the folder: its snapshot and time go on the record together, and only now does it become the
// board's newest build, so a build that fails before that leaves the one before it with Undo this build.
function startIn(b: Prototype, r: Running) {
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

/** Started: the host's start event. */
export const started =
  (r: Running): Change =>
  b => {
    if (b.kind !== 'prototype' || !startIn(b, r)) return false;
    if (b === session.board) redrawBuilds();
    return true;
  };

// the order its edits first named them, then any no edit named; one an edit named that ended unchanged isn't there
const inWriteOrder = (files: FileDiff[], named: readonly string[]) => [
  ...named.flatMap(p => files.filter(f => f.path === p)),
  ...files.filter(f => !named.includes(f.path)),
];

/** Ended: how it ended goes on the record, then her line: her explanation with Undo this build, Commit and her next
 *  steps, or why it stopped, with Undo this build when it changed files. said: her words for a failure, in place of
 *  "I couldn't finish that" and the reason. A block the chat no longer has, trimmed or cleared away, comes back first.
 *  Once the record has an end, nothing happens. */
export const ended =
  (r: Running, e: Extract<BuildEvent, { type: 'done' | 'error' }>, at: number, said?: string): Change =>
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
      files = inWriteOrder(e.files, r.files);
    if (e.type === 'done') {
      found.a.end = { kind: 'built', at, files, outside: e.outside, from: keepSources(b, e.sources) };
      // the commit message she suggests: the first line of what she was asked to do
      const message = r.request.split(/[\n.]/)[0]?.trim().slice(0, 72) ?? '';
      added.push(
        line(e.text, [
          { kind: 'buildUndo', board, snapshot: e.snapshot, build },
          { kind: 'commit', board, message, build },
          ...e.next.map((text): ChatAction => ({ kind: 'next', text })),
        ]),
      );
    } else {
      found.a.end = { kind: 'failed', at, files };
      // it changed nothing, so the build before it keeps Undo this build, unless a newer one has started since
      if (!files.length && b.proto.build === build) b.proto = { ...b.proto, build: r.was };
      const undo: ChatAction[] =
        e.snapshot && files.length ? [{ kind: 'buildUndo', board, snapshot: e.snapshot, build }] : [];
      added.push(line(said ?? `I couldn’t finish that. ${e.text}`, undo));
    }
    for (const m of added) if (m !== found.m) pushMsg(b, m);
    if (b === session.board) {
      redrawBuilds();
      showAdded(added);
    }
    return true;
  };

/** Undone: Undo this build put the folder back as it was before the build. */
export const undone =
  (build: string): Change =>
  b => {
    const found = find(b.chat ?? [], build);
    if (!found || found.a.undone) return false;
    found.a.undone = true;
    if (b === session.board) redrawMsg(found.m);
    return true;
  };
