// What the wire-arrow tests share: a wire of both with a style a copy that rebuilds a wire field by field would lose,
// the boards that hold it, and reading a wire as the page draws it. Two rows of two level cards, so the wires of a row run
// straight across and their heads are easy to find.
import type { Page } from 'playwright';
import type { Link } from '../../src/shared/model.ts';
import { still } from './settled.ts';
import { rec } from './zipKit.ts';

export async function check(name: string, run: () => Promise<void> | void) {
  try {
    await run();
  } catch (e) {
    console.error(`FAIL ${name}`);
    throw e;
  }
}

// what a wire keeps besides its ends and its arrowhead, so a copy that rebuilds a wire field by field loses something
export const STYLE = { bend: 40, w: 4, color: '#4f8fc9', dash: true, pa: { u: 1, v: 0.5 }, pb: { u: 0, v: 0.5 } };
export const BOTH: Link = { id: 'wb', a: 'A', b: 'B', arrow: 'both', ...STYLE };
const note = (id: string, x: number, y: number) => ({
  id,
  type: 'note',
  x,
  y,
  w: 200,
  h: 100,
  r: 0,
  text: id,
  color: 'butter',
});
const cards = [note('A', 0, 0), note('B', 480, 0), note('C', 0, 260), note('D', 480, 260)];
const view = { x: 300, y: 250, z: 1 };
export const wiresBoard = {
  id: 'wires',
  name: 'Wires',
  color: 'sky',
  cards,
  links: [
    BOTH,
    { id: 'wn', a: 'A', b: 'C' },
    { id: 'we', a: 'C', b: 'D', arrow: true },
    { id: 'wf', a: 'D', b: 'B', arrow: false },
    // a value no version writes, as a file edited by hand or made by a later version might hold
    { id: 'wx', a: 'B', b: 'D', arrow: 'sideways' },
  ],
  tray: [],
  view,
};
// what boards from before wires pointed both ways hold: an arrowhead at the end, or `false`, or nothing
export const beforeBoard = {
  id: 'before',
  name: 'Before',
  cards,
  links: [
    { id: 'o1', a: 'A', b: 'B', arrow: true },
    { id: 'o2', a: 'C', b: 'D', arrow: false },
    { id: 'o3', a: 'A', b: 'C' },
  ],
  tray: [],
  view,
};
// a wire without its id and its ends: what a copy of it keeps, whichever cards it joins
export const style = (x: Record<string, unknown> | undefined) => {
  const { id, a, b, ...rest } = x ?? {};
  return rest;
};
export const BOTH_STYLE = style(BOTH);
export const wiresIn = (x: unknown) => (Array.isArray(x) ? x.map(rec) : []);

export function wireKit(page: Page) {
  const board = () => page.evaluate(() => structuredClone(window.__fenmyr.curBoard()));
  const links = async () => (await board()).links;
  const link = async (id: string) => (await links()).find(x => x.id === id);
  const ids = async () => new Set((await links()).map(x => x.id));
  const open = async (id: string) => {
    await page.evaluate(id => window.__fenmyr.openBoard(id), id);
    await page.waitForFunction(id => window.__fenmyr.curBoard().id === id, id);
    await still(page);
  };
  const select = (id: string) => page.evaluate(id => window.__fenmyr.selectWire(id), id);
  // Where a wire's line starts and ends and where the tips of its arrowheads are, as drawn. The line is `M start Q control
  // end`, and each head `M left L tip L right`; a wire with no head draws no head, so the line is the hit area's neighbour.
  const drawn = (id: string) =>
    page.evaluate(id => {
      const hit = document.querySelector(`.wires path.w-hit[data-wire="${id}"]`),
        arrow = hit?.previousElementSibling?.classList.contains('w-arrow') ? hit.previousElementSibling : null,
        line = arrow ? arrow.previousElementSibling : (hit?.previousElementSibling ?? null),
        nums = (d: string | null | undefined) => (d ?? '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [],
        [x0, y0, , , x2, y2] = nums(line?.getAttribute('d')),
        // a head is `M left L tip L right`, six numbers, the tip the third pair
        head = nums(arrow?.getAttribute('d')),
        tips = Array.from({ length: head.length / 6 }, (_, i) => [head[i * 6 + 2], head[i * 6 + 3]]);
      return { start: [x0, y0], end: [x2, y2], tips, d: arrow?.getAttribute('d') ?? '' };
    }, id);
  const heads = async (id: string) => {
    const w = await drawn(id);
    return w.tips.map(t =>
      t[0] === w.start[0] && t[1] === w.start[1] ? 'start' : t[0] === w.end[0] && t[1] === w.end[1] ? 'end' : '?',
    );
  };
  return { board, links, link, ids, open, select, drawn, heads };
}
