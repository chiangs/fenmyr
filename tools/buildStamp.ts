// Which commit a build was made from, written to dist/build.json by tools/build.ts. The app reads it back (src/host/appBuild.ts).
import { execFileSync } from 'node:child_process';

type Stamp = { commit: string | null; changes: boolean; builtAt: string };

function git(dir: string, args: string[], env: NodeJS.ProcessEnv): string | null {
  try {
    return execFileSync('git', ['-C', dir, ...args], {
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

// `changes` ignores untracked files: the build's own output and anyone's scratch files would mark every build.
// GITHUB_SHA is for a build where git isn't there to ask, and it can't say whether files changed.
export function stamp(dir: string, env: NodeJS.ProcessEnv, now = new Date()): Stamp {
  const head = git(dir, ['rev-parse', 'HEAD'], env);
  const builtAt = now.toISOString().replace(/\.\d+Z$/, 'Z');
  if (!head) return { commit: env.GITHUB_SHA || null, changes: false, builtAt };
  const changed = git(dir, ['status', '--porcelain', '--untracked-files=no'], env);
  return { commit: head, changes: !!changed, builtAt };
}
