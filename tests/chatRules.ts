// Where Myra's chat sits, what board it leaves free and what her input says, for every case of the rules, in Node.
import assert from 'node:assert';
import { askHint, cutName, freeOf, type Geometry, placeChat, type Rect } from '../src/web/myra/chatRules.ts';

// the bottom bar 18 px over the window's bottom, 50 tall, from 260 px, her 200 px box at its end
const desk = (w: number, h: number, toolsR: number, more: Partial<Geometry> = {}): Geometry => ({
  view: { w, h },
  bar: { l: 260, t: h - 68, r: toolsR + 200, b: h - 18 },
  box: { l: toolsR, t: h - 68, r: toolsR + 200, b: h - 18 },
  mode: null,
  timer: false,
  where: 'desk',
  ...more,
});

assert.deepStrictEqual(
  placeChat(desk(1440, 900, 1076)),
  { kind: 'joined', chat: { l: 1076, t: 322, r: 1426, b: 882 } },
  'at 1440 px it joins the tools over her box, as wide as the room up to 14 px from the window’s right',
);
assert.deepStrictEqual(
  placeChat(desk(1440, 900, 900)),
  { kind: 'joined', chat: { l: 900, t: 322, r: 1300, b: 882 } },
  'with room to spare it is 400 × 560',
);
assert.deepStrictEqual(
  placeChat(desk(1426, 900, 1092)),
  { kind: 'joined', chat: { l: 1092, t: 322, r: 1412, b: 882 } },
  'exactly 320 px of room still joins',
);
assert.strictEqual(placeChat(desk(1426, 900, 1092.5)).kind, 'wide', 'under 320 px of room it goes wide');
assert.deepStrictEqual(
  placeChat(desk(1280, 800, 1064)),
  { kind: 'wide', chat: { l: 260, t: 160, r: 1266, b: 720 } },
  'under 320 px of room it spans from the bar’s left to 14 px from the window’s right, 12 px above the bar',
);
// drawing's bar as it is: 674 px wide, from 258 px at the furthest left, 58 px with its gap
const drawing = { mode: { lift: 58, l: 258, w: 674 } };
assert.deepStrictEqual(
  placeChat(desk(1280, 800, 1064, drawing)),
  { kind: 'wide', chat: { l: 260, t: 102, r: 1266, b: 662 } },
  'wide, it rises over drawing’s or find’s bar',
);
assert.deepStrictEqual(
  placeChat(desk(1440, 900, 1076, drawing)),
  { kind: 'joined', chat: { l: 1076, t: 322, r: 1426, b: 882 } },
  'joined, it stays on the bar beside drawing’s or find’s bar',
);
assert.deepStrictEqual(
  placeChat(desk(1280, 800, 908, drawing)),
  { kind: 'wide', chat: { l: 260, t: 102, r: 1266, b: 662 } },
  'with room to join, it goes wide over drawing’s or find’s bar when that bar would reach under it',
);
assert.strictEqual(placeChat(desk(1440, 900, 944, drawing)).kind, 'joined', 'that bar ending 12 px short still joins');
assert.strictEqual(placeChat(desk(1440, 900, 943.5, drawing)).kind, 'wide', 'under 12 px short it goes wide');
assert.strictEqual(placeChat(desk(1280, 800, 908)).kind, 'joined', 'with that bar gone it joins again');
assert.deepStrictEqual(
  placeChat(desk(1440, 640, 1076, { timer: true })),
  { kind: 'joined', chat: { l: 1076, t: 100, r: 1426, b: 622 } },
  'on a short window it keeps 60 px from the top, and 40 more for a timer',
);
assert.deepStrictEqual(
  placeChat(desk(1440, 300, 1076, { timer: true })),
  { kind: 'joined', chat: { l: 1076, t: 48, r: 1426, b: 282 } },
  'on a tiny window it is never under 240 px unless that would push it, or the timer over it, past the top',
);
assert.deepStrictEqual(placeChat(desk(600, 900, 300, { where: 'phone' })), { kind: 'sheet' }, 'a phone has its sheet');
assert.deepStrictEqual(
  placeChat(desk(1440, 900, 900, { where: 'proto' })),
  { kind: 'docked' },
  'docked on a prototype',
);

const frame: Rect = { l: 270, t: 60, r: 1180, b: 790 };
assert.deepStrictEqual(freeOf(frame, null), frame, 'with the chat closed the whole frame is free');
assert.deepStrictEqual(
  freeOf(frame, { l: 1076, t: 322, r: 1426, b: 882 }),
  { l: 270, t: 60, r: 1046, b: 790 },
  'a joined chat leaves the board left of it, 30 px short',
);
assert.deepStrictEqual(
  freeOf(frame, { l: 260, t: 260, r: 1086, b: 820 }),
  { l: 270, t: 60, r: 1180, b: 230 },
  'a wide chat leaves the board above it, 30 px short',
);
assert.deepStrictEqual(freeOf(frame, { l: 1300, t: 60, r: 1426, b: 882 }), frame, 'a chat past the frame takes none');

assert.strictEqual(cutName('Myra'), 'Myra', 'a short name stays whole');
assert.strictEqual(cutName('Twelve-lette'), 'Twelve-lette', '12 letters stay whole');
assert.strictEqual(cutName('Bartholomew-Smithe'), 'Bartholomew…', 'past 12 letters: 11 and an ellipsis');
assert.strictEqual(cutName('🍓🍓🍓🍓🍓🍓🍓🍓🍓🍓🍓🍓🍓'), '🍓🍓🍓🍓🍓🍓🍓🍓🍓🍓🍓…', 'letters, not code units');

const roomy = () => true,
  cramped = () => false;
assert.strictEqual(askHint('Myra', 0, false, roomy), 'Ask Myra… “group these by theme”');
assert.strictEqual(askHint('Myra', 0, false, cramped), 'Ask Myra…', 'without room for the example, just her name');
assert.strictEqual(
  askHint('Bartholomew-Smithe', 0, false, roomy),
  'Ask Bartholomew… “group these by theme”',
  'a cut name has one ellipsis',
);
assert.strictEqual(askHint('Bartholomew-Smithe', 0, false, cramped), 'Ask Bartholomew…', 'a cut name, no room');
assert.strictEqual(askHint('Bartholomew-Smithe', 1, false, roomy), 'Ask Bartholomew… to change this…', 'one card');
assert.strictEqual(askHint('Pip', 3, false, roomy), 'Ask Pip to change these 3…', 'several cards');
assert.strictEqual(askHint('Pip', 0, true, roomy), 'Ask Pip about this prototype…', 'a prototype board');

console.log('CHAT RULES OK');
