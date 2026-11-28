import type { Link } from './model.ts';

// Which ends of a wire have an arrowhead. A link stores it as `arrow`: true for an arrowhead at b, 'both' for one at a
// and at b, and absent or false for none, so a board saved before wires pointed both ways opens unchanged. Whatever
// reads or sets an arrowhead goes through here, and the words are the ones Myra reads and writes.
const ARROWS = ['none', 'end', 'both'] as const;
export type Arrow = (typeof ARROWS)[number];

export const isArrow = (x: unknown): x is Arrow => ARROWS.some(a => a === x);

export const arrowOf = (l: Pick<Link, 'arrow'>): Arrow =>
  l.arrow === 'both' ? 'both' : l.arrow === true ? 'end' : 'none';

export function setArrow(l: Link, arrow: Arrow) {
  if (arrow === 'none') delete l.arrow;
  else l.arrow = arrow === 'both' ? 'both' : true;
}
