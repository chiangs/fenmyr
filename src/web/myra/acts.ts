import type { ChatAction } from '../../shared/chat.ts';
import { buildUndoButton } from '../proto/build.ts';
import { gitAction } from '../proto/gitActions.ts';
import { sourceButton } from '../proto/sources.ts';
import { ask } from './chat.ts';
import type { SayAction } from './say.ts';

// A button under one of her lines: a stored kind, kept with the message, or a closure that lasts only as long as the
// window shows it.
export type Act = SayAction | ChatAction;

export const storedOf = (acts: readonly Act[]): ChatAction[] => acts.filter(a => 'kind' in a);

// The one place a stored action becomes a button. Null when it has none now: its card is gone, the build was on
// another board, or (until Phase 4 draws them) a reply's changes.
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
      return buildUndoButton(a.board, a.snapshot);
    case 'commit':
      return { label: 'Commit', cls: 'next', run: () => gitAction('commit', a.message) };
    default: {
      const unhandled: never = a;
      return unhandled;
    }
  }
}
