import {
  EFFORTS,
  type ModelChoice,
  type ModelEntry,
  type ProviderId,
  type ProviderModels,
  readModelChoice,
} from '../shared/models.ts';

// models is async because a local provider, such as Ollama, will ask its server which models it has
type Provider = { id: ProviderId; name: string; models: () => Promise<ModelEntry[]> };

// Claude Code has no command that lists its models, so the table is Fenmyr's. Each one took every effort level in
// Claude Code 2.1.330.
const CLAUDE: ModelEntry[] = [
  { id: 'claude-opus-5-5', name: 'Opus 5.5', efforts: EFFORTS },
  { id: 'claude-fable-5-2', name: 'Fable 5.2', efforts: EFFORTS },
  { id: 'claude-sonnet-5-5', name: 'Sonnet 5.5', efforts: EFFORTS },
  { id: 'claude-haiku-5-5', name: 'Haiku 5.5', efforts: EFFORTS },
];
const PROVIDERS: Provider[] = [{ id: 'claude-code', name: 'Claude Code', models: async () => CLAUDE }];

export const listModels = (): Promise<ProviderModels[]> =>
  Promise.all(PROVIDERS.map(async p => ({ provider: p.id, name: p.name, models: await p.models() })));

/** The choice sent with a call, if its provider still lists the model with that effort. Anything else is undefined,
 *  which passes no flags, so a model saved before it left the list never stops Myra answering. */
export async function parseChoice(x: unknown): Promise<ModelChoice | undefined> {
  const choice = readModelChoice(x),
    provider = PROVIDERS.find(p => p.id === choice?.provider);
  if (!choice || !provider) return undefined;
  const model = (await provider.models()).find(m => m.id === choice.id);
  return model?.efforts.includes(choice.effort) ? choice : undefined;
}

/** Claude Code's arguments for a choice; none leaves Claude Code on its own default. */
export function modelArgs(choice: ModelChoice | undefined): string[] {
  if (!choice) return [];
  switch (choice.provider) {
    case 'claude-code':
      return ['--model', choice.id, '--effort', choice.effort];
    default: {
      const unhandled: never = choice.provider;
      return unhandled;
    }
  }
}
