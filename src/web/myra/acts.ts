import type { ChatAction } from '../../shared/chat.ts';
import { buildUndoButton, commitButton } from '../proto/build.ts';
import { sourceButton } from '../proto/sources.ts';
import { ask } from './chat.ts';
import type { SayAction } from './say.ts';

// A button under one of her lines: a stored kind, kept with the message, or a closure that lasts only as long as the
// window shows it.
export type Act = SayAction | ChatAction;

export const storedOf = (acts: readonly Act[]): ChatAction[] => acts.filter(a => 'kind' in a);

// The one place a stored action becomes a button. Null when it has none now: its card is gone, its prototype isn't the
// open board, a newer build's Undo is in the chat, or (until Phase 4 draws them) a reply's changes.
export function actView(a: Act): SayAction | null {
  if (!('kind' in a)) return a;
  switch (a.kind) {
    case 'next':
      return { label: a.text, cls: 'next', run: () => ask(a.text) };
    case 'changes':
      return null;
    case 'source':
      return sourceButton(a.card);
    case 'buildUndo':
      return buildUndoButton(a);
    case 'commit':
      return commitButton(a);
    default: {
      const unhandled: never = a;
      return unhandled;
    }
  }
}
