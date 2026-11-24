import { isRecord } from './model.ts';

export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type Effort = (typeof EFFORTS)[number];
const PROVIDERS = ['claude-code'] as const;
export type ProviderId = (typeof PROVIDERS)[number];
export type ModelChoice = { provider: ProviderId; id: string; effort: Effort };
export type ModelEntry = { id: string; name: string; efforts: readonly Effort[]; note?: string };
export type ProviderModels = { provider: ProviderId; name: string; models: ModelEntry[] };

/** Shape check only, for data from IPC or localStorage. The host also checks the id against the provider's list. */
export function readModelChoice(x: unknown): ModelChoice | undefined {
  if (!isRecord(x) || typeof x.id !== 'string') return undefined;
  const provider = PROVIDERS.find(p => p === x.provider),
    effort = EFFORTS.find(e => e === x.effort);
  return provider && effort ? { provider, id: x.id, effort } : undefined;
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
  if (!provider.models.length) return 'unknown';
  return provider.models.find(m => m.id === choice.id)?.efforts.includes(choice.effort) ? 'listed' : 'gone';
}
