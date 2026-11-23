import { isPrerelease } from './version.ts';

// Which builds a clone install follows: tested releases only, early releases too, or every change as it is merged to main.
export type UpdateChannel = 'stable' | 'beta' | 'main';

export const isUpdateChannel = (v: unknown): v is UpdateChannel => v === 'stable' || v === 'beta' || v === 'main';

// Until someone chooses, a prerelease follows Beta and anything else follows Stable.
export const channelFor = (chosen: UpdateChannel | undefined, version: string): UpdateChannel =>
  chosen ?? (isPrerelease(version) ? 'beta' : 'stable');
