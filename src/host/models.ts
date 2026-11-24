import {
  EFFORTS,
  listing,
  type ModelChoice,
  type ModelEntry,
  type ProviderId,
  type ProviderModels,
  readModelChoice,
} from '../shared/models.ts';

// models is async because a local provider, such as Ollama, will ask its server which models it has. It must never
// reject: a provider catches its own server errors and answers [], which `listing` reads as unknown, so a server that is
// off neither stops a call nor costs anyone their saved choice. Claude's table can't fail, so nothing checks this until a
// provider with a server arrives, and its tests should.
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

const listOf = async (p: Provider): Promise<ProviderModels> => ({
  provider: p.id,
  name: p.name,
  models: await p.models(),
});

export const listModels = (): Promise<ProviderModels[]> => Promise.all(PROVIDERS.map(listOf));

/** The choice sent with a call, if its provider still lists its model with that effort (`listing`, the same check the
 *  page makes). Anything else is undefined, which passes no flags, so a model saved before it left the list never stops
 *  Myra answering. Only the choice's own provider is asked, since a local one needs its server. */
export async function parseChoice(x: unknown): Promise<ModelChoice | undefined> {
  const choice = readModelChoice(x),
    provider = PROVIDERS.find(p => p.id === choice?.provider);
  if (!choice || !provider) return undefined;
  return listing([await listOf(provider)], choice) === 'listed' ? choice : undefined;
}

/** Claude Code's arguments for a choice. A part the choice leaves out sends no flag, so Claude Code keeps its own setting
 *  for it, and no choice leaves it on its own for both. */
export function modelArgs(choice: ModelChoice | undefined): string[] {
  if (!choice) return [];
  switch (choice.provider) {
    case 'claude-code':
      return [
        ...(choice.id === undefined ? [] : ['--model', choice.id]),
        ...(choice.effort ? ['--effort', choice.effort] : []),
      ];
    default: {
      const unhandled: never = choice.provider;
      return unhandled;
    }
  }
}
