import type { BoardPatch } from '../../shared/changes.ts';

// What each recent reply changed, with every card and connector as it was before, for Undo under that reply. In
// memory only, and only for the open board: pictures are data URLs, so the board file would hold a removed one twice.
const KEPT = 20;
const kept = new Map<string, BoardPatch>();

export function keepReply(id: string, record: BoardPatch) {
  kept.set(id, record);
  for (const old of kept.keys()) {
    if (kept.size <= KEPT) break;
    kept.delete(old);
  }
}

export const replyRecord = (id: string) => kept.get(id);

export function forgetReplies() {
  kept.clear();
}
