// Where the context bar goes beside a selection or a connector, worked out without the app.
import assert from 'node:assert';
import { type Box, type Placement, place, type Side, type Size } from '../src/web/selbar/place.ts';

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
console.log('BAR PLACE OK');
