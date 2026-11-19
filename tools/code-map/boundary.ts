// The renderer (src/web) and the host (src/host) are two programs. They meet only at src/shared, whose bridge contract is
// ops.ts, and shared code imports neither of them. This reads the import graph and lists every import that breaks that, type-only
// ones included: the contract is meant to be the only coupling, at compile time as well as at run time.
import { areaOf, zoneOf } from './areas.ts';
import type { RawGraph } from './graph.ts';
import type { Boundary, Crossing, Zone } from './types.ts';

const zoneOfFile = (path: string): Zone => zoneOf(areaOf(path));
const FORBIDDEN: [Zone, Zone, string][] = [
  ['renderer', 'host', 'The renderer imports the host'],
  ['host', 'renderer', 'The host imports the renderer'],
  ['shared', 'renderer', 'Shared code imports the renderer'],
  ['shared', 'host', 'Shared code imports the host'],
];

export function boundaryOf(edges: RawGraph['edges']): Boundary {
  const violations: Crossing[] = [],
    viaShared = { renderer: 0, host: 0 };
  for (const e of edges) {
    const from = zoneOfFile(e.from),
      to = zoneOfFile(e.to),
      broken = FORBIDDEN.find(([a, b]) => a === from && b === to);
    if (broken) violations.push({ from: e.from, to: e.to, typeOnly: e.typeOnly, kind: broken[2] });
    if (to === 'shared' && from === 'renderer') viaShared.renderer++;
    if (to === 'shared' && from === 'host') viaShared.host++;
  }
  return { clean: violations.length === 0, violations, viaShared };
}

export const explain = (c: Crossing) =>
  `${c.from} imports ${c.to}${c.typeOnly ? ' (type only)' : ''}: ${c.kind.toLowerCase()}, but the two programs meet only at src/shared`;
