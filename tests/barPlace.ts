// Where the context bar goes beside a selection or a connector, worked out without the app.
import assert from 'node:assert';
import { type Box, dockBeside, type Placement, place, type Side, type Size } from '../src/web/selbar/place.ts';

// the free view on a 1440 x 900 window: between the side widgets, under the header, above the bottom bar
const FRAME: Box = { l: 258, t: 59, r: 1162, b: 820 };
const BAR: Size = { w: 300, h: 50 };
const box = (l: number, t: number, r: number, b: number): Box => ({ l, t, r, b });
const point = (x: number, y: number) => box(x, y, x, y);
const at = (b: Box, prefer: Side, frame = FRAME, size = BAR) => place({ box: b, prefer }, frame, size);
const is = (x: number, y: number, side: Side, stuck: Placement['stuck'] = null): Placement => ({ x, y, side, stuck });

assert.deepStrictEqual(at(box(400, 300, 620, 440), 'above'), is(360, 238, 'above'), 'centred 12 px above a card');
assert.deepStrictEqual(
  at(box(400, 80, 620, 220), 'above'),
  is(360, 232, 'below'),
  'no room above: 12 px under it instead',
);
assert.deepStrictEqual(
  at(box(400, 20, 620, 900), 'above'),
  is(360, 59, 'above', 'top'),
  'taller than the view: held at the top of the view',
);
assert.deepStrictEqual(
  at(box(400, -400, 620, -200), 'above'),
  is(360, 59, 'above', 'top'),
  'above the view: held at its top',
);
assert.deepStrictEqual(
  at(box(400, 1000, 620, 1100), 'above'),
  is(360, 770, 'above', 'bottom'),
  'below the view: held at its bottom',
);
assert.deepStrictEqual(
  at(box(100, 300, 200, 400), 'above'),
  is(258, 238, 'above'),
  'under the left widgets: kept to their right',
);
assert.deepStrictEqual(
  at(box(1100, 300, 1300, 400), 'above'),
  is(862, 238, 'above'),
  'under the right widgets: kept to their left',
);
assert.deepStrictEqual(
  at(box(400, 300, 620, 440), 'above', FRAME, { w: 1000, h: 50 }),
  is(258, 238, 'above'),
  'a bar wider than the view starts at its left edge',
);
assert.deepStrictEqual(
  at(box(400, 300, 620, 440), 'above', FRAME, { w: 300, h: 900 }),
  is(360, 59, 'above', 'top'),
  'a bar taller than the view starts at its top',
);
assert.deepStrictEqual(at(point(700, 500), 'above'), is(550, 438, 'above'), 'a level line: above its middle');
assert.deepStrictEqual(at(point(700, 500), 'left'), is(388, 475, 'left'), 'an upright line: beside its middle');
assert.deepStrictEqual(
  at(point(400, 500), 'left'),
  is(412, 475, 'right'),
  'an upright line near the left widgets: on its other side',
);
assert.deepStrictEqual(
  at(point(700, 500), 'left', box(450, 59, 950, 820)),
  is(550, 438, 'above'),
  'no room on either side of an upright line: above its middle',
);

// the Pieces picker beside its screen, 292 px wide and 480 tall
const PICKER: Size = { w: 292, h: 480 };
const BOARD = { l: 12, r: 1428 };
const dock = (b: Box) => dockBeside(b, FRAME, PICKER, BOARD);
assert.deepStrictEqual(
  dock(box(300, 100, 600, 700)),
  { x: 612, y: 100, w: 292, h: 480, side: 'right' },
  'room on the right: 12 px right',
);
assert.deepStrictEqual(
  dock(box(700, 100, 1000, 700)),
  { x: 396, y: 100, w: 292, h: 480, side: 'left' },
  'room only on the left: 12 px left',
);
assert.deepStrictEqual(
  dock(box(400, 100, 900, 700)),
  { x: 870, y: 100, w: 292, h: 480, side: 'edge' },
  'room on neither side: against the far edge with more room',
);
assert.deepStrictEqual(
  dock(box(500, 100, 1100, 700)),
  { x: 258, y: 100, w: 292, h: 480, side: 'edge' },
  'more room on the left: against the left edge',
);
assert.deepStrictEqual(
  dock(box(300, -500, 600, 2000)),
  { x: 612, y: 59, w: 292, h: 480, side: 'right' },
  'a screen above the view: the picker starts at the top of the view',
);
assert.deepStrictEqual(
  dock(box(300, 600, 600, 1400)),
  { x: 612, y: 340, w: 292, h: 480, side: 'right' },
  'a screen low in the view: the picker is kept inside its bottom',
);
assert.deepStrictEqual(
  dock(box(-900, 100, -100, 700)),
  { x: 870, y: 100, w: 292, h: 480, side: 'edge' },
  'a screen off to the left: the picker stays inside the view, on the side with room',
);
// a free view narrower than two pickers: a sheet across its bottom, half its height
const NARROW: Box = { l: 258, t: 59, r: 700, b: 720 };
assert.deepStrictEqual(
  dockBeside(box(341, 272, 459, 528), NARROW, PICKER, BOARD),
  { x: 258, y: 389.5, w: 442, h: 330.5, side: 'sheet' },
  'no room for a column beside the screen: a sheet across the bottom of the free view',
);
assert.deepStrictEqual(
  dockBeside(box(290, 300, 320, 400), { l: 278, t: 59, r: 330, b: 820 }, PICKER, { l: 12, r: 330 }),
  { x: 38, y: 439.5, w: 292, h: 380.5, side: 'sheet' },
  'a free view narrower than the picker: the sheet keeps its width, reaching left over the widgets',
);
assert.deepStrictEqual(
  dockBeside(box(300, 100, 340, 300), { ...FRAME, r: FRAME.l + 595 }, PICKER, BOARD).side,
  'sheet',
  'a free view one pixel short of two pickers and a gap gets the sheet, even where the picker would fit beside',
);
console.log('BAR PLACE OK');
