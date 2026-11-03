// GitHub's own command-line tool, gh, holds the sign-ins. Fenmyr never sees or stores a token.
import type { GhAccount, GhState } from '../shared/ops.ts';
import { isRecord, pathDirs, run, text, which } from './util.ts';

// Looked up on every call: it's a few file checks, and installing gh while Fenmyr is open then just works.
const ghPath = () => which('gh', pathDirs());

export async function status(): Promise<GhState> {
  const gh = ghPath();
  if (!gh) return { kind: 'missing' };
  // with --json it lists every account and never prints a token
  const r = await run(gh, ['auth', 'status', '--json', 'hosts'], 30);
  let hosts: unknown;
  try {
    hosts = JSON.parse(r.out.toString('utf8')).hosts;
  } catch {
    throw new Error('This gh is too old for Fenmyr. Update it, then try again.');
  }
  const accounts: GhAccount[] = isRecord(hosts)
    ? Object.values(hosts)
        .flatMap(list => (Array.isArray(list) ? list : []))
        .filter(isRecord)
        .map(a => ({ host: text(a.host), login: text(a.login), active: a.active === true, ok: a.state === 'success' }))
        .filter(a => a.host && a.login)
    : [];
  return { kind: 'ready', accounts };
}
