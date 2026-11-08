import type { Card } from '../../shared/model.ts';
import { webPagesOf } from '../../shared/myraReply.ts';
import { appState, session } from '../core/state.ts';
import { repoActs } from '../repo/myra.ts';
import { aiGrants, tasksLine, updateVaultChip } from '../vault/ask.ts';
import type { Act } from './acts.ts';
import type { HeldReply } from './applyTypes.ts';
import { ask } from './chat.ts';
import { guessNext, noEmoji } from './replyText.ts';
import type { SayAction } from './say.ts';

// what next: up to three, each once, as a person would type them
const nextOf = (list: readonly unknown[]) =>
  list
    .filter((t): t is string => typeof t === 'string')
    .map(t => noEmoji(t).trim())
    .filter(Boolean)
    .slice(0, 3);

// What she says once a reply has landed, with its buttons and how long the bubble stays. `touched`: the cards the reply
// made, moved or edited, each once. `more`: buttons its effects offer.
export function replyLine(
  { reply: r, q, ctx, notes }: HeldReply,
  touched: readonly Card[],
  more: readonly SayAction[],
) {
  const looked = !ctx.asked
    ? ''
    : ctx.tasks
      ? tasksLine(ctx.tasks)
      : ctx.used.length
        ? ''
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
  acts.push(...repoActs(r), ...more);
  // her own next steps always show; a guess from what she just made gives way to any other button
  const own = nextOf(r.next ?? []),
    next = own.length ? own : acts.length ? [] : nextOf(guessNext(r, touched));
  for (const t of next) acts.push({ kind: 'next', text: t });
  // the notes she named, or else every note she was given; pages only when she could have opened them
  const used = (notes.length ? notes : ctx.used).map(n => ({ vault: n.vaultId, rel: n.rel, title: n.title })),
    pages = ctx.web ? webPagesOf(r) : [];
  if (used.length || pages.length) acts.push({ kind: 'read', notes: used, pages });
  const said = (r.say && noEmoji(r.say)) || (touched.length ? `Done! I touched ${touched.length} cards.` : 'Done!');
  const lasting = next.length || used.length || pages.length;
  return { text: said + looked, ms: r.confirm ? 0 : lasting ? 16000 : 9000, acts };
}
