import type { Card } from '../../shared/model.ts';
import { appState, session } from '../core/state.ts';
import { repoActs } from '../repo/myra.ts';
import { aiGrants, tasksLine, updateVaultChip } from '../vault/ask.ts';
import type { Act } from './acts.ts';
import type { HeldReply } from './applyTypes.ts';
import { ask } from './chat.ts';
import { guessNext, noEmoji } from './replyText.ts';
import type { SayAction } from './say.ts';

// What she says once a reply has landed, with its buttons and how long the bubble stays. `touched`: the cards the reply
// made, moved or edited, each once. `more`: buttons its effects offer.
export function replyLine({ reply: r, q, ctx }: HeldReply, touched: readonly Card[], more: readonly SayAction[]) {
  const read = !ctx.asked
    ? ''
    : ctx.tasks
      ? tasksLine(ctx.tasks)
      : ctx.used.length
        ? ` I read ${ctx.used.length} note${ctx.used.length === 1 ? '' : 's'} from your vault: ${ctx.used.map(n => n.title).join(', ')}.`
        : ' I looked in your vault, but found no notes matching that in the folders you allowed.';
  const acts: Act[] = r.confirm
    ? [
        { label: `${r.confirm || 'Yes, make it'} ✦`, run: () => ask(q, true) },
        { label: 'Not now', ghost: true, run: () => {} },
      ]
    : [];
  if (r.offerVault && !ctx.asked && aiGrants(session.board).length)
    acts.push({
      label: 'Search my vault ✦',
      cls: 'next',
      run: () => {
        appState.vaultChip = true;
        updateVaultChip();
        ask(q);
      },
    });
  // what next: Myra's own ideas, or a sensible guess from what she just made
  acts.push(...repoActs(r), ...more);
  const next = acts.length
    ? []
    : (r.next?.length ? r.next : guessNext(r, touched))
        .filter((t: unknown): t is string => typeof t === 'string')
        .map(noEmoji)
        .filter(Boolean)
        .slice(0, 3);
  for (const t of next) acts.push({ kind: 'next', text: t.trim() });
  const said = (r.say && noEmoji(r.say)) || (touched.length ? `Done! I touched ${touched.length} cards.` : 'Done!');
  return { text: said + read, ms: r.confirm ? 0 : next.length ? 16000 : 9000, acts };
}
