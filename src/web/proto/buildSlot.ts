import type { BuildLive } from '../../shared/build.ts';
import type { Job } from '../myra/status.ts';

// What only this session knows of the build running now: one at a time across the app. build.ts writes it and the
// block reads it, so neither imports the other for state. Nothing here is ever saved, which is why a build cut off by
// Fenmyr closing reads stopped when its board opens again.
export type Running = {
  build: string;
  // the prototype it builds, which may not be the open board by the time it ends, and its name for the status line
  board: string;
  name: string;
  request: string;
  // how many cards the builder read
  cards: number;
  // when it was asked for, and the host's id once protoBuild answers
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

let running: Running | null = null;

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

/** This session's view of a build, by build id, or null when it isn't running here. */
export function liveOf(build: string): BuildLive | null {
  if (running?.build !== build) return null;
  return running.start ? { phase: 'writing', files: running.files } : { phase: 'starting' };
}

// a build is being written, so one asked for now wouldn't start
export const building = () => running !== null;
