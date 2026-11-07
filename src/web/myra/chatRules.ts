// Where Myra's chat window sits, how much board it leaves free, and what her box and input say. No DOM, so
// tests/chatRules.ts checks every case in Node.

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
  /** The height dragged at the chat's top edge, or null for the usual 560. */
  height: number | null;
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
    h = Math.min(Math.max(CHAT.minH, Math.min(g.height ?? CHAT.h, b - CHAT.top - chip)), b - CHAT.edge - chip),
    l = joined ? g.box.l : g.bar.l,
    r = joined ? l + Math.min(CHAT.w, room) : right;
  return { kind: joined ? 'joined' : 'wide', chat: { l, t: b - h, r, b } };
}

// cards fitted beside the chat keep this far from it
const FREE_GAP = 30;
const area = (r: Rect) => Math.max(0, r.r - r.l) * Math.max(0, r.b - r.t);

/** The part of frame the open chat leaves free: left of it or above it, whichever is bigger. A joined chat usually
 *  leaves the left part, a wide one the part above. */
export function freeOf(frame: Rect, chat: Rect | null): Rect {
  if (!chat) return frame;
  const left = { ...frame, r: Math.min(frame.r, chat.l - FREE_GAP) },
    above = { ...frame, b: Math.min(frame.b, chat.t - FREE_GAP) };
  return area(left) >= area(above) ? left : above;
}

const NAME_MAX = 12;

/** Her name as the placeholder shows it: past 12 letters, the first 11 and an ellipsis. */
export function cutName(name: string): string {
  const letters = Array.from(name);
  return letters.length > NAME_MAX ? `${letters.slice(0, NAME_MAX - 1).join('')}…` : name;
}

/** The chat input's placeholder: with cards selected it says they go along with what you ask. With none it gives an
 *  example, unless the example would not fit on one line. */
export function askHint(name: string, selected: number, proto: boolean, fits: (hint: string) => boolean): string {
  const n = cutName(name);
  if (selected === 1) return `Ask ${n} to change this…`;
  if (selected > 1) return `Ask ${n} to change these ${selected}…`;
  if (proto) return `Ask ${n} about this prototype…`;
  const ask = n.endsWith('…') ? `Ask ${n}` : `Ask ${n}…`,
    example = `${ask} “group these by theme”`;
  return fits(example) ? example : ask;
}

/** Something that might close the open chat. */
export type CloseInput =
  /** Esc, with focus inside the chat or not. The slash menu and an IME composing take it first. */
  | { type: 'esc'; inChat: boolean; menu: boolean; composing: boolean }
  /** The fold button in the chat's header. */
  | { type: 'fold' }
  /** A press and its release. `empty`: it started on empty board, not on a card, a connector, a panel or a widget.
   *  `busy`: a tool was in hand or a menu was open at the press. */
  | { type: 'press'; empty: boolean; busy: boolean; travel: number; button: number };

// further than this between press and release is a drag, a marquee or a pan
const CLICK_TRAVEL = 4;

/** Whether the event closes the chat. A prototype board keeps it docked open, and a phone's sheet keeps its own
 *  rules for presses. A click on a card leaves it open, so cards can be selected while chatting. */
export function closes(e: CloseInput, where: Geometry['where']): boolean {
  if (where === 'proto') return false;
  switch (e.type) {
    case 'esc':
      return e.inChat && !e.menu && !e.composing;
    case 'fold':
      return true;
    case 'press':
      return where === 'desk' && e.empty && !e.busy && e.button === 0 && e.travel <= CLICK_TRAVEL;
    default: {
      const unknown: never = e;
      return unknown;
    }
  }
}

/** Where focus came from when it reached her box: nowhere (the window regaining focus), the chat (a close handing it
 *  back) or any other element. */
export type FocusFrom = 'nothing' | 'chat' | 'elsewhere';

/** Focus arriving at her box opens the chat only when you moved it there. */
export const opensOnFocus = (from: FocusFrom) => from === 'elsewhere';

/** What her box says while the closed chat holds text, or null when it holds none. Lines are counted as written,
 *  without trailing new lines. */
export function draftLabel(text: string): string | null {
  const kept = text.trimEnd();
  if (!kept) return null;
  const n = kept.split('\n').length;
  return n === 1 ? 'Draft · 1 line' : `Draft · ${n} lines`;
}
