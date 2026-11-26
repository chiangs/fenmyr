import type { Card } from '../../src/shared/model.ts';

/** The pairs of cards that overlap, by id. */
export const overlaps = (cs: Card[]) =>
  cs.flatMap((a, i) =>
    cs
      .slice(i + 1)
      .filter(b => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h)
      .map(b => [a.id, b.id]),
  );

/** A prototype's own rules and design: the doc cards that have a role. */
export const roleDocs = (cs: Card[]) => cs.flatMap(c => (c.type === 'doc' && c.role ? [c] : []));
