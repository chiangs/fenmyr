import type { Board } from '../tests/support/launch.ts';
import type { Group, Step } from './visual-myra.ts';

// Three columns of two cards, one above the other, each pair joined by a wire: arrowheads at both ends, at the end and
// none. An upright wire has its bar beside its middle, so the heads stay in view, and the other pairs sit lower, out of
// the bar's way. The first wire is selected, then its arrow picker is opened. A checkout from before wires pointed both ways draws that wire with one head and has no
// picker, so its second step leaves the bar as it was.
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
const wires = (): Board => ({
  id: 'wires',
  name: 'Wires',
  color: 'sky',
  cards: [
    note('A', 0, 0),
    note('C', 0, 240),
    note('B', 340, 300),
    note('D', 340, 540),
    note('E', 680, 300),
    note('F', 680, 540),
  ],
  links: [
    { id: 'wb', a: 'A', b: 'C', arrow: 'both' },
    { id: 'we', a: 'B', b: 'D', arrow: true },
    { id: 'wn', a: 'E', b: 'F' },
  ],
  tray: [],
  view: { x: 300, y: 250, z: 1 },
});

const selectBoth: Step = async page => {
  await page.evaluate(() => window.__fenmyr.selectWire('wb'));
  await page.mouse.move(5, 450);
};
const openPicker: Step = async page => {
  await page.evaluate(() => document.querySelector<HTMLElement>('#selbar [data-pop="warr"]')?.click());
  await page.mouse.move(5, 450);
};

const states: [string, Step][] = [
  ['board', async () => {}],
  ['both', selectBoth],
  ['picker', openPicker],
];

export const WIRE_GROUPS: Record<string, Group> = {
  wires: { board: wires, states },
  'wires-dark': { board: wires, settings: { theme: 'dark' }, states },
};
