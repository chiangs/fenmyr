import type { Ops } from '../../shared/ops.ts';
import { call, desktopOnly } from '../hostCall.ts';

// Git and GitHub, for linking projects to repos. Only the desktop app can reach them.
export const repoOps = {
  gitStatus: (path: string) => call('gitStatus', { path }),
  gitInit: (path: string) => call('gitInit', { path }),
  gitSetIdentity: (o: Ops['gitSetIdentity']['args']) => call('gitSetIdentity', o),
  ghStatus: () => call('ghStatus'),
  repoPick: () => call('repoPick'),
  packageManager: () => call('packageManager'),
};

export const repoFallbacks: typeof repoOps = {
  gitStatus: desktopOnly,
  gitInit: desktopOnly,
  gitSetIdentity: desktopOnly,
  ghStatus: desktopOnly,
  repoPick: desktopOnly,
  packageManager: desktopOnly,
};
