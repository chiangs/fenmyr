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
  gitSetup: () => call('gitSetup'),
  gitSetGlobalIdentity: (name: string, email: string) => call('gitSetGlobalIdentity', { name, email }),
  ghLogin: () => call('ghLogin'),
  ghLoginCancel: () => call('ghLoginCancel'),
  ghSetupGit: () => call('ghSetupGit'),
  ghRepoCreate: (o: Ops['ghRepoCreate']['args']) => call('ghRepoCreate', o),
  protoCreate: (o: Ops['protoCreate']['args']) => call('protoCreate', o),
};

export const repoFallbacks: typeof repoOps = {
  gitStatus: desktopOnly,
  gitInit: desktopOnly,
  gitSetIdentity: desktopOnly,
  ghStatus: desktopOnly,
  repoPick: desktopOnly,
  packageManager: desktopOnly,
  gitSetup: desktopOnly,
  gitSetGlobalIdentity: desktopOnly,
  ghLogin: desktopOnly,
  ghLoginCancel: desktopOnly,
  ghSetupGit: desktopOnly,
  ghRepoCreate: desktopOnly,
  protoCreate: desktopOnly,
};
