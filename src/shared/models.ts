import { isRecord } from './model.ts';

export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
type Effort = (typeof EFFORTS)[number];
const PROVIDERS = ['claude-code'] as const;
export type ProviderId = (typeof PROVIDERS)[number];
export type ModelChoice = { provider: ProviderId; id: string; effort: Effort };
export type ModelEntry = { id: string; name: string; efforts: readonly Effort[]; note?: string };

/** Shape check only, for data from IPC or localStorage. The host also checks the id against the provider's list. */
export function readModelChoice(x: unknown): ModelChoice | undefined {
  if (!isRecord(x) || typeof x.id !== 'string') return undefined;
  const provider = PROVIDERS.find(p => p === x.provider),
    effort = EFFORTS.find(e => e === x.effort);
  return provider && effort ? { provider, id: x.id, effort } : undefined;
}
