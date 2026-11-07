// Where Myra's chat sits and what her input says, for every case of the rules, in Node.
import assert from 'node:assert';
import { askHint, cutName, type Geometry, placeChat } from '../src/web/myra/chatRules.ts';

// the bottom bar 18 px over the window's bottom, 50 tall, from 260 px, her 200 px box at its end
const desk = (w: number, h: number, toolsR: number, more: Partial<Geometry> = {}): Geometry => ({
  view: { w, h },
  bar: { l: 260, t: h - 68, r: toolsR + 200, b: h - 18 },
  box: { l: toolsR, t: h - 68, r: toolsR + 200, b: h - 18 },
  modeLift: 0,
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
assert.deepStrictEqual(
  placeChat(desk(1280, 800, 1064, { modeLift: 58 })),
  { kind: 'wide', chat: { l: 260, t: 102, r: 1266, b: 662 } },
  'wide, it rises over drawing’s or find’s bar',
);
assert.deepStrictEqual(
  placeChat(desk(1440, 900, 1076, { modeLift: 58 })),
  { kind: 'joined', chat: { l: 1076, t: 322, r: 1426, b: 882 } },
  'joined, it stays on the bar beside drawing’s or find’s bar',
);
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

assert.strictEqual(cutName('Myra'), 'Myra', 'a short name stays whole');
assert.strictEqual(cutName('Twelve-lette'), 'Twelve-lette', '12 letters stay whole');
assert.strictEqual(cutName('Bartholomew-Smithe'), 'Bartholomew…', 'past 12 letters: 11 and an ellipsis');
assert.strictEqual(cutName('🍓🍓🍓🍓🍓🍓🍓🍓🍓🍓🍓🍓🍓'), '🍓🍓🍓🍓🍓🍓🍓🍓🍓🍓🍓…', 'letters, not code units');

assert.strictEqual(askHint('Myra', 0, false), 'Ask Myra… “group these by theme”');
assert.strictEqual(askHint('Bartholomew-Smithe', 1, false), 'Ask Bartholomew… to change this…', 'one card');
assert.strictEqual(askHint('Pip', 3, false), 'Ask Pip to change these 3…', 'several cards');
assert.strictEqual(askHint('Pip', 0, true), 'Ask Pip about this prototype…', 'a prototype board');

console.log('CHAT RULES OK');
