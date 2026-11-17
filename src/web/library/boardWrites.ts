import type { Board } from '../../shared/model.ts';
import { saveNow } from '../core/history.ts';
import { session } from '../core/state.ts';

// A board's file is one shared target: the open board's saves, an open that loads it, and a build that lands in it
// while it's closed. Each board gets one queue, so a change is never read before an earlier one is written.
const tails = new Map<string, Promise<void>>();

function queue(id: string, task: () => Promise<void>) {
  const run = (tails.get(id) ?? Promise.resolve()).then(task);
  const tail = run.catch(() => {});
  tails.set(id, tail);
  void tail.then(() => {
    if (tails.get(id) === tail) tails.delete(id);
  });
  return run;
}

function holdBoard(id: string): Promise<() => void> {
  return new Promise(granted => {
    void queue(id, () => new Promise<void>(release => granted(release)));
  });
}

/** openBoard holds the board it leaves and the one it opens, from before it loads until session.board is the new one,
 *  so a change to either waits to see which is open. In id order, so two opens never each hold what the other waits
 *  for. Resolves with the release. */
export async function holdBoards(ids: readonly string[]): Promise<() => void> {
  const releases: (() => void)[] = [];
  for (const id of [...new Set(ids)].sort()) releases.push(await holdBoard(id));
  return () => {
    for (const release of releases) release();
  };
}

/** Changes a board whether or not it is open, one change at a time per board, after any hold on it. On the open board
 *  it changes session.board in place and writes it at once with saveNow; on a closed one it loads, changes and saves
 *  the file. change returns false when it had nothing to do, and then nothing is written. */
export function changeBoard(id: string, change: (b: Board) => boolean): Promise<void> {
  return queue(id, async () => {
    if (session.board?.id === id) {
      if (change(session.board)) await saveNow();
      return;
    }
    const stored = await Fenmyr.load(id);
    if (!stored) return;
    const b: Board = { name: '', cards: [], links: [], tray: [], ...stored };
    if (change(b)) await Fenmyr.save(b);
  });
}
