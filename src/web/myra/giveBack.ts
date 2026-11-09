import { boardGone, clearedCount, giveBackWords, wordsAfter } from './chatDraft.ts';
import { reply } from './say.ts';
import type { Added } from './sees.ts';
import { putBack } from './seesStrip.ts';

/** A message that did not reach Myra: the board it was written on, what the person typed (empty when the words were not
 *  theirs, as with a starter), what went with it, and the Clear all chats count when it was sent. */
export type Unsent = { board: string; words: string; added: readonly Added[]; cleared: number };

/** Gives a message that never reached Myra back to the person: the words to the input when it is empty, and the files
 *  and pasted texts to the strip, all on the board it was written on. After Clear all chats, or once the board is gone,
 *  nothing comes back. */
export function giveBack({ board, words, added, cleared }: Unsent) {
  if (cleared !== clearedCount() || boardGone(board)) return;
  const left = putBack(board, added, wordsAfter(board, words));
  if (words) giveBackWords(board, words);
  if (left)
    reply(
      `There was no room to put back ${left === 1 ? 'one file or pasted text' : `${left} files or pasted texts`} you added after sending, so I left ${left === 1 ? 'it' : 'them'} out.`,
    );
}
