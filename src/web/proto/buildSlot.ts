import type { BuildLive } from '../../shared/build.ts';
import type { Ops } from '../../shared/ops.ts';
import type { Job } from '../myra/status.ts';

// What only this session knows of builds: the one running now, one at a time across the app, and the requests waiting
// their turn behind it. build.ts writes it and the block reads it, so neither imports the other for state. Nothing here
// is ever saved, which is why a build cut off by Fenmyr closing reads stopped when its board opens again, and one that
// was waiting reads not started.
export type Running = {
  build: string;
  // the prototype it builds, which may not be the open board by the time it ends, and its name for the status line
  board: string;
  name: string;
  request: string;
  // how many cards the builder read
  cards: number;
  // when it was asked of the host, and the host's id once protoBuild answers
  asked: number;
  id: string | null;
  // when the host had saved the folder, and the snapshot it took
  start: { at: number; snapshot: string } | null;
  // the board's build before this one, which stays the one to undo if this one changes nothing
  was: string | undefined;
  // the paths its edits named, first seen first, each once
  files: string[];
  job: Job;
};

type Args = Ops['protoBuild']['args'];
/** A request waiting its turn, with everything its build needs from its board, read while that board was open, since
 *  it may start on another. args: what the host is sent, but for the preview's errors, which belong to whichever board
 *  is open when it starts. */
export type Waiting = Pick<Running, 'build' | 'board' | 'name' | 'request' | 'cards'> & {
  args: Omit<Args, 'errors' | 'pictures'>;
  pictures: Promise<Args['pictures']>;
};

let running: Running | null = null;
// oldest first
const queue: Waiting[] = [];

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

/** Takes a waiting request off the queue. False when it isn't waiting, as one that has started isn't. */
export function cancel(build: string) {
  const i = queue.findIndex(w => w.build === build);
  if (i >= 0) queue.splice(i, 1);
  return i >= 0;
}

/** This session's view of a build, by build id, or null when it isn't waiting or running here. */
export function liveOf(build: string): BuildLive | null {
  if (queue.some(w => w.build === build)) return { phase: 'queued' };
  if (running?.build !== build) return null;
  return running.start ? { phase: 'writing', files: running.files } : { phase: 'starting' };
}

// a build runs or waits, so one asked for now would wait its turn
export const building = () => running !== null || queue.length > 0;

/** A build runs or waits on this prototype, so Undo this build, a commit or a pull would change files under it. */
export const busyOn = (board: string) => running?.board === board || queue.some(w => w.board === board);
