// Where Myra's chat window sits, and what her box and input say. No DOM, so tests/chatRules.ts checks every case in
// Node.

/** Window pixels. */
export type Rect = { l: number; t: number; r: number; b: number };

/** What chatWindow measures before placing the chat. */
export type Geometry = {
  view: { w: number; h: number };
  /** The bottom bar: the tools, then her box. */
  bar: Rect;
  box: Rect;
  /** Drawing's or find's bar over the bottom bar, with its gap, or 0. */
  modeLift: number;
  /** A timer chip shows, and sits above the open chat. */
  timer: boolean;
  where: 'desk' | 'phone' | 'proto';
};

export type Placement =
  /** Left edge on her box's left, which is the tools' right edge, bottom on the bar's bottom: it covers her box. */
  | { kind: 'joined'; chat: Rect }
  /** Too little room right of the tools: from the bar's left to the window's right, above the bar. */
  | { kind: 'wide'; chat: Rect }
  /** A phone's sheet, placed by CSS. */
  | { kind: 'sheet' }
  /** A prototype board's chat, docked in its pane. */
  | { kind: 'docked' };

const CHAT = { w: 400, h: 560, minW: 320, minH: 240, inset: 14, gap: 12, top: 60, edge: 8, chip: 40 };

export function placeChat(g: Geometry): Placement {
  switch (g.where) {
    case 'phone':
      return { kind: 'sheet' };
    case 'proto':
      return { kind: 'docked' };
    case 'desk':
      break;
    default: {
      const unknown: never = g.where;
      return unknown;
    }
  }
  const right = g.view.w - CHAT.inset,
    room = right - g.box.l,
    joined = room >= CHAT.minW,
    b = joined ? g.bar.b : g.bar.t - CHAT.gap - g.modeLift,
    chip = g.timer ? CHAT.chip : 0,
    h = Math.min(Math.max(CHAT.minH, Math.min(CHAT.h, b - CHAT.top - chip)), b - CHAT.edge - chip),
    l = joined ? g.box.l : g.bar.l,
    r = joined ? l + Math.min(CHAT.w, room) : right;
  return { kind: joined ? 'joined' : 'wide', chat: { l, t: b - h, r, b } };
}

const NAME_MAX = 12;

/** Her name as the placeholder shows it: past 12 letters, the first 11 and an ellipsis. */
export function cutName(name: string): string {
  const letters = Array.from(name);
  return letters.length > NAME_MAX ? `${letters.slice(0, NAME_MAX - 1).join('')}…` : name;
}

/** The chat input's placeholder: with cards selected it says they go along with what you ask. */
export function askHint(name: string, selected: number, proto: boolean): string {
  const n = cutName(name);
  if (selected === 1) return `Ask ${n} to change this…`;
  if (selected > 1) return `Ask ${n} to change these ${selected}…`;
  return proto ? `Ask ${n} about this prototype…` : `Ask ${n}… “group these by theme”`;
}
