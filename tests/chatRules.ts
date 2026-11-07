// Where Myra's chat sits, what board it leaves free, what her input and box say, and what opens and closes the chat,
// for every case of the rules, in Node.
import assert from 'node:assert';
import {
  askHint,
  type CloseInput,
  closes,
  closeWait,
  cutName,
  draftLabel,
  freeOf,
  type Geometry,
  placeChat,
  type Rect,
} from '../src/web/myra/chatRules.ts';

// the bottom bar 18 px over the window's bottom, 50 tall, from 260 px, her 200 px box at its end
const desk = (w: number, h: number, toolsR: number, more: Partial<Geometry> = {}): Geometry => ({
  view: { w, h },
  bar: { l: 260, t: h - 68, r: toolsR + 200, b: h - 18 },
  box: { l: toolsR, t: h - 68, r: toolsR + 200, b: h - 18 },
  mode: null,
  timer: false,
  height: null,
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
assert.deepStrictEqual(
  placeChat(desk(1440, 900, 1076, { height: 700 })),
  { kind: 'joined', chat: { l: 1076, t: 182, r: 1426, b: 882 } },
  'a height dragged at the top edge replaces the usual 560',
);
assert.deepStrictEqual(
  placeChat(desk(1440, 900, 1076, { height: 2000 })),
  { kind: 'joined', chat: { l: 1076, t: 60, r: 1426, b: 882 } },
  'a dragged height still keeps 60 px from the top',
);
assert.deepStrictEqual(
  placeChat(desk(1440, 900, 1076, { height: 100 })),
  { kind: 'joined', chat: { l: 1076, t: 642, r: 1426, b: 882 } },
  'and is never under 240 px',
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

const esc = (more: Partial<Extract<CloseInput, { type: 'esc' }>> = {}): CloseInput => ({
  type: 'esc',
  composing: false,
  ...more,
});
const click = (more: Partial<Extract<CloseInput, { type: 'press' }>> = {}): CloseInput => ({
  type: 'press',
  empty: true,
  busy: false,
  second: false,
  travel: 0,
  button: 0,
  ...more,
});
const rows: [CloseInput, Geometry['where'], boolean, string][] = [
  [esc(), 'desk', true, 'Esc with focus in the chat closes it'],
  [esc({ composing: true }), 'desk', false, 'Esc while an IME composes does nothing'],
  [esc(), 'phone', true, 'Esc in a phone’s sheet closes it'],
  [esc(), 'proto', false, 'a prototype board’s chat stays docked open on Esc'],
  [{ type: 'fold' }, 'desk', true, 'the fold button closes it'],
  [{ type: 'fold' }, 'proto', false, 'a prototype board’s chat has no fold'],
  [click(), 'desk', true, 'a click on empty board closes it'],
  [click({ travel: 4 }), 'desk', true, 'a click that wobbles up to 4 px is still a click'],
  [click({ travel: 4.5 }), 'desk', false, 'a drag, marquee or pan leaves it open'],
  [click({ empty: false }), 'desk', false, 'a click on a card, a panel or a widget leaves it open'],
  [click({ busy: true }), 'desk', false, 'a click a tool in hand or an open menu takes leaves it open'],
  [click({ second: true }), 'desk', false, 'the second press of a double-click on empty board leaves it open'],
  [click({ button: 2 }), 'desk', false, 'a right click leaves it open'],
  [click({ button: 1 }), 'desk', false, 'a middle click leaves it open'],
  [click(), 'phone', false, 'a phone’s sheet keeps its own rules'],
  [click(), 'proto', false, 'a prototype board’s chat stays docked open'],
];
for (const [e, where, want, why] of rows) assert.strictEqual(closes(e, where), want, why);

assert.ok(closeWait(true) >= 500, 'with double-click notes on, a click waits out a double-click before closing');
assert.strictEqual(closeWait(false), 0, 'with them off, it closes at once');

const shown = (text: string) => draftLabel(text, 'Myra')?.shown ?? null;
assert.strictEqual(shown(''), null, 'no text, no draft');
assert.strictEqual(shown('  \n '), null, 'only spaces and new lines, no draft');
assert.strictEqual(shown('hello'), 'Draft · 1 line');
assert.strictEqual(shown('one\ntwo\nthree'), 'Draft · 3 lines', 'lines as written');
assert.strictEqual(shown('one\n\nthree\n\n'), 'Draft · 3 lines', 'blank lines inside count, trailing ones do not');
assert.strictEqual(
  draftLabel('one\ntwo', 'Pip')?.spoken,
  'Ask Pip, draft, 2 lines',
  'her box keeps "Ask Pip" in its name',
);

console.log('CHAT RULES OK');
