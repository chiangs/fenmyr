import type { UpdateChannel } from '../shared/updateChannel.ts';
import { compareVersions, isPrerelease, parseVersion } from '../shared/version.ts';

// The newest release a channel may move to, from the names of a clone's tags. A name that isn't a version (v1.1, test)
// is skipped, and Stable skips the prereleases too.
export function newestTag(names: string[], channel: Exclude<UpdateChannel, 'main'>) {
  const releases = names.filter(n => n.startsWith('v') && parseVersion(n) && (channel === 'beta' || !isPrerelease(n)));
  return releases.sort(compareVersions).at(-1) ?? null;
}
