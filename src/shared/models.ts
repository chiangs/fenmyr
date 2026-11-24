import { isRecord } from './model.ts';

export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type Effort = (typeof EFFORTS)[number];
const PROVIDERS = ['claude-code'] as const;
export type ProviderId = (typeof PROVIDERS)[number];
/** Who a choice with no model is for: Claude Code, which runs on its own settings wherever Fenmyr sets nothing. */
export const DEFAULT_PROVIDER: ProviderId = 'claude-code';
/** The model and the effort each either set or left out, and a part left out is Default: no flag is sent, so Claude Code
 *  uses its own settings for it. Both left out is no choice at all, so it can't be written down: `makeChoice` gives
 *  undefined for it. */
export type ModelChoice = { provider: ProviderId } & (
  | { id: string; effort?: Effort }
  | { id?: undefined; effort: Effort }
);
export type ModelEntry = { id: string; name: string; efforts: readonly Effort[]; note?: string };
export type ProviderModels = { provider: ProviderId; name: string; models: ModelEntry[] };

export function makeChoice(provider: ProviderId, id?: string, effort?: Effort): ModelChoice | undefined {
  if (id !== undefined) return effort ? { provider, id, effort } : { provider, id };
  return effort ? { provider, effort } : undefined;
}

/** Shape check only, for data from IPC or localStorage. A part that is there but not a model or an effort spoils the
 *  whole choice, not just itself, so a damaged value never half-applies. The host also checks the id against the
 *  provider's list. */
export function readModelChoice(x: unknown): ModelChoice | undefined {
  if (!isRecord(x)) return undefined;
  const provider = PROVIDERS.find(p => p === x.provider),
    effort = EFFORTS.find(e => e === x.effort);
  if (!provider || (x.effort !== undefined && !effort)) return undefined;
  if (x.id === undefined) return makeChoice(provider, undefined, effort);
  return typeof x.id === 'string' ? makeChoice(provider, x.id, effort) : undefined;
}

/** Where a choice stands against what the providers list: still there, gone, or not known. A provider that lists no
 *  models, as when a local server isn't running, says nothing about the model, and neither does an answer of no
 *  providers at all, as when there is no host to ask. The host drops anything but 'listed'; the page clears only
 *  'gone', so a server that is off for a while never costs someone their choice. */
type Listing = 'listed' | 'gone' | 'unknown';
export function listing(lists: readonly ProviderModels[], choice: ModelChoice): Listing {
  if (!lists.length) return 'unknown';
  const provider = lists.find(p => p.provider === choice.provider);
  if (!provider) return 'gone';
  // with no model to look for, the effort was checked when the choice was read
  if (choice.id === undefined) return 'listed';
  if (!provider.models.length) return 'unknown';
  const model = provider.models.find(m => m.id === choice.id);
  return model && (!choice.effort || model.efforts.includes(choice.effort)) ? 'listed' : 'gone';
}
