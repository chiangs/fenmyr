import { isRecord } from './model.ts';

// What a build knows about itself: the commit it was made from, how it was installed and what it runs on. The host
// answers with it (src/host/appBuild.ts), and every place that names the version reads the same line from here.
export type AppInstall = 'clone' | 'appimage' | 'mac' | 'package' | 'checkout' | 'web';

type BuildStamp = { commit: string | null; changes: boolean; builtAt: string | null };
type Where = {
  install: AppInstall;
  platform: string;
  arch: string | null;
  electron: string | null;
  chrome: string | null;
};
export type AppBuild = BuildStamp &
  Where & {
    version: string;
    prerelease: boolean;
    // the first seven characters of the commit
    short: string | null;
  };

const NO_STAMP: BuildStamp = { commit: null, changes: false, builtAt: null };
const PRERELEASE = /^\d+\.\d+\.\d+-/;

// dist/build.json is written by tools/build.ts; a copy that lacks it, or whose file is damaged, has no commit to show
export function readStamp(raw: unknown): BuildStamp {
  if (!isRecord(raw)) return NO_STAMP;
  const commit = typeof raw.commit === 'string' && /^[0-9a-f]{7,64}$/.test(raw.commit) ? raw.commit : null;
  const builtAt = typeof raw.builtAt === 'string' && !Number.isNaN(Date.parse(raw.builtAt)) ? raw.builtAt : null;
  return { commit, changes: commit !== null && raw.changes === true, builtAt };
}

export const appBuildOf = (version: string, stamp: BuildStamp, where: Where): AppBuild => ({
  ...stamp,
  ...where,
  version,
  prerelease: PRERELEASE.test(version),
  short: stamp.commit?.slice(0, 7) ?? null,
});

// "1.1.0-beta.2 · Beta · a1b2c3d + changes", leaving out whatever isn't known
export function versionLine(b: AppBuild) {
  const commit = b.short && b.changes ? `${b.short} + changes` : b.short;
  return [b.version, b.prerelease && 'Beta', commit].filter(Boolean).join(' · ');
}

function installLine(install: AppInstall) {
  switch (install) {
    case 'clone':
      return 'Installed from a clone (install.sh)';
    case 'appimage':
      return 'Installed as an AppImage';
    case 'mac':
      return 'Installed as a Mac app';
    case 'package':
      return 'Installed from a package';
    case 'checkout':
      return 'Running from a checkout';
    case 'web':
      return 'Running in a browser';
    default: {
      const never: never = install;
      throw new Error(`unknown install ${String(never)}`);
    }
  }
}

// UTC, so the same build reads the same wherever the report is opened
function builtLine(builtAt: string) {
  const when = new Date(builtAt);
  const day = when.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const time = when.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'UTC',
  });
  return `Built ${day}, ${time} UTC`;
}

const OS_NAMES: Record<string, string> = { linux: 'Linux', darwin: 'macOS', win32: 'Windows', web: '' };

// what a person pastes into a bug report
export function detailsText(b: AppBuild) {
  const commit = b.commit && (b.changes ? `Commit ${b.commit} with uncommitted changes` : `Commit ${b.commit}`);
  const system = [OS_NAMES[b.platform] ?? b.platform, b.arch].filter(Boolean).join(' ');
  return [
    `Fenmyr ${b.version}${b.prerelease ? ' (Beta)' : ''}`.trim(),
    commit,
    b.builtAt && builtLine(b.builtAt),
    installLine(b.install),
    [system, b.electron && `Electron ${b.electron}`, b.chrome && `Chrome ${b.chrome}`].filter(Boolean).join(' · '),
  ]
    .filter(Boolean)
    .join('\n');
}
