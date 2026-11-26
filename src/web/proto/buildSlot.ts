import type { BuildLive } from '../../shared/build.ts';
import type { ContextUse } from '../../shared/contextFit.ts';
import type { Ops } from '../../shared/ops.ts';
import type { Job } from '../myra/status.ts';

// What only this session knows of builds: the one running now, one at a time across the app, and the requests waiting
// their turn behind it. build.ts writes it and the block reads it, so neither imports the other for state. Nothing here
// is ever saved, which is why a build cut off by Fenmyr closing reads stopped when its board opens again, and one that
// was waiting reads not started.
export type Running = {
  build: string;
  // the prototype it builds, which may not be the open board by the time it ends, its name for the status line, and
  // its repo
  board: string;
  name: string;
  root: string;
  request: string;
  // how many cards the builder read
  cards: number;
  // when it was asked of the host, and the host's id once protoBuild answers
  asked: number;
  id: string | null;
  // when the host had saved the folder, the snapshot it took, and what the builder was sent against the model's window
  start: { at: number; snapshot: string; use?: ContextUse } | null;
  // the board's build before this one, which stays the one to undo if this one changes nothing
  was: string | undefined;
  // the paths its edits named, first seen first, each once
  files: string[];
  job: Job;
  // takes it off the list of what Stop ends, as soon as it has ended
  off: () => void;
  // Stop was pressed on it: the host's answer to protoBuild kills it by its id, or, if the host turned it away, drops it
  stopped: boolean;
};

type Args = Ops['protoBuild']['args'];
/** A request waiting its turn, with everything its build needs from its board, read while that board was open, since
 *  it may start on another. args: what the host is sent, but for the preview's errors, which are read when it starts, and
 *  the pictures with the cards whose picture wasn't sent, which the pictures promise settles with. */
export type Waiting = Pick<Running, 'build' | 'board' | 'root' | 'request' | 'cards' | 'off'> & {
  args: Omit<Args, 'errors' | 'pictures' | 'unseen' | 'tooBig' | 'over'>;
  pictures: Promise<Pick<Args, 'pictures' | 'unseen' | 'tooBig' | 'over'>>;
  // it waited behind another build or a check, so a screen reader hears when it starts
  waited: boolean;
};

let running: Running | null = null;
// oldest first
const queue: Waiting[] = [];
// the open board's preview catching up with the builds that have landed, and how many it is still catching up with
let catching: Promise<unknown> = Promise.resolve();
let behind = 0;

/** Holds the next build back until `landed` settles: a build has landed, and the open board's preview is catching up with
 *  it and checking it. A build started before then would be sent the errors of the code before. */
export function catchUp(landed: Promise<unknown>) {
  behind++;
  catching = Promise.allSettled([catching, landed.finally(() => behind--)]);
}

/** Settles once the open board's preview has caught up with every build that has landed, one that lands meanwhile too. */
export async function caughtUp() {
  for (let c = catching; ; c = catching) {
    await c;
    if (c === catching) return;
  }
}

/** Takes the slot, before anything is awaited, so a second request can't slip in while this one starts. */
export function claimSlot(r: Running) {
  running = r;
  return r;
}

export const runningBuild = () => running;

/** Frees the slot, if `r` still holds it. */
export function freeSlot(r: Running) {
  if (running === r) running = null;
}

/** Puts a request at the back of the queue, or `first`, back at its front, when the host can't take it yet. */
export function enqueue(w: Waiting, first = false) {
  if (first) queue.unshift(w);
  else queue.push(w);
}

export const dequeue = () => queue.shift() ?? null;

export const firstWaiting = () => queue[0]?.build ?? null;

/** Takes a board's waiting requests off the queue, or every one when no board is named, as when the board or the chats
 *  that showed them are gone and they can no longer be seen or cancelled. */
export function dropWaiting(board?: string) {
  for (let i = queue.length - 1; i >= 0; i--) {
    if (board && queue[i]?.board !== board) continue;
    queue.splice(i, 1)[0]?.off();
  }
}

/** Takes a waiting request off the queue. False when it isn't waiting, as one that has started isn't. */
export function cancel(build: string) {
  const i = queue.findIndex(w => w.build === build);
  if (i >= 0) queue.splice(i, 1)[0]?.off();
  return i >= 0;
}

/** This session's view of a build, by build id, or null when it isn't waiting or running here. */
export function liveOf(build: string): BuildLive | null {
  const at = queue.findIndex(w => w.build === build);
  if (at >= 0) return { phase: 'queued', behind: at === 0 && !running && behind > 0 ? 'check' : 'build' };
  if (running?.build !== build) return null;
  return running.start ? { phase: 'writing', files: running.files } : { phase: 'starting' };
}

// a build runs or waits, so one asked for now would wait its turn
export const building = () => running !== null || queue.length > 0;

// one asked for now would wait its turn, behind a build or the preview check of one that landed
export const waitsTurn = () => building() || behind > 0;

/** A build runs or waits in this repo, so Undo this build, a commit or a pull would change files under it. */
export const busyIn = (root: string) => running?.root === root || queue.some(w => w.root === root);
