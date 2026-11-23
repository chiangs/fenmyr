// The one way Fenmyr reads and compares versions: the updater, the what's-new card and the build line all use it, so
// a beta ("1.1.0-beta.2") never reads as newer than its release ("1.1.0").
type Version = { core: [number, number, number]; pre: string[] | null };

const VERSION = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*))?$/;
const NUMERIC = /^\d+$/;

export function parseVersion(s: string): Version | null {
  const m = VERSION.exec(s);
  if (!m) return null;
  return { core: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ? m[4].split('.') : null };
}

// numbers compare as numbers and come before words; with all else equal, the shorter list comes first
function comparePre(a: string[], b: string[]) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const p = a[i] ?? '';
    const q = b[i] ?? '';
    if (p === q) continue;
    if (NUMERIC.test(p) && NUMERIC.test(q)) return Number(p) - Number(q);
    if (NUMERIC.test(p) !== NUMERIC.test(q)) return NUMERIC.test(p) ? -1 : 1;
    return p < q ? -1 : 1;
  }
  return a.length - b.length;
}

// Semver precedence: negative when a comes first, positive when b does. Something that isn't a version comes before
// every version, so a damaged value never looks like an update.
export function compareVersions(a: string, b: string) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return x ? 1 : y ? -1 : 0;
  for (let i = 0; i < 3; i++) {
    const d = (x.core[i] ?? 0) - (y.core[i] ?? 0);
    if (d !== 0) return d;
  }
  if (x.pre && y.pre) return comparePre(x.pre, y.pre);
  return x.pre ? -1 : y.pre ? 1 : 0;
}

export const isPrerelease = (v: string) => parseVersion(v)?.pre != null;
