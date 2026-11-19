// Where Myra's chat window sits, how much board it leaves free, and what her box and input say. No DOM, so
// tests/chatRules.ts checks every case in Node.
import { MAX_FILES, tooMany } from '../../shared/askFiles.ts';
import { DRAFT_MAX } from '../../shared/chat.ts';

/** Window pixels. */
export type Rect = { l: number; t: number; r: number; b: number };

/** What chatWindow measures before placing the chat. */
export type Geometry = {
  view: { w: number; h: number };
  /** The bottom bar: zoom, then her box. */
  bar: Rect;
  box: Rect;
  /** How far find's bar over the bottom bar lifts what sits at its height, its height and gap, or 0 while it is down. */
  lift: number;
  /** The tools panel at the top right and the mode card beside it, as they show. */
  tools: Rect[];
  /** A timer chip shows, and sits above the open chat. */
  timer: boolean;
  /** The height dragged at the chat's top edge, or null for the usual 560. */
  height: number | null;
  where: 'desk' | 'phone' | 'proto';
};

export type Placement =
  /** Left edge on her box's left, which is zoom's right edge, bottom on the bar's bottom: it covers her box. */
  | { kind: 'joined'; chat: Rect }
  /** Too little room right of her box's left, or find's bar is up, which reaches under a joined chat: from the bar's
   *  left to the window's right, above the bar and find's bar. */
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
    joined = room >= CHAT.minW && !g.lift,
    b = joined ? g.bar.b : g.bar.t - CHAT.gap - g.lift,
    l = joined ? g.box.l : g.bar.l,
    r = joined ? l + Math.min(CHAT.w, room) : right,
    // a narrow window brings the chat under the tools and the mode card, and it stops short of them, however short the
    // window, so they stay in reach
    roof = Math.max(0, ...g.tools.filter(t => t.l < r && t.r > l).map(t => t.b + CHAT.gap)),
    top = Math.max(CHAT.top, roof),
    chip = g.timer ? CHAT.chip : 0,
    h = Math.min(
      Math.max(CHAT.minH, Math.min(g.height ?? CHAT.h, b - top - chip)),
      b - Math.max(CHAT.edge, roof) - chip,
    );
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
export function askHint(
  name: string,
  selected: number,
  proto: boolean,
  fits: (hint: string) => boolean,
  plan = false,
): string {
  const n = cutName(name);
  // whatever they write goes with the plan, to change it
  if (plan) return `Tell ${n} what to change…`;
  if (selected === 1) return `Ask ${n} to change this…`;
  if (selected > 1) return `Ask ${n} to change these ${selected}…`;
  if (proto) return `Ask ${n} about this prototype…`;
  const ask = n.endsWith('…') ? `Ask ${n}` : `Ask ${n}…`,
    example = `${ask} “group these by theme”`;
  return fits(example) ? example : ask;
}

/** Something that might close the open chat. */
export type CloseInput =
  /** Esc with focus inside the chat. The slash menu takes its own Esc before the chat hears it. */
  | { type: 'esc'; composing: boolean }
  /** The fold button in the chat's header. */
  | { type: 'fold' }
  /** A press and its release. `empty`: it started on empty board, not on a card, a connector, a panel or a widget.
   *  `busy`: a tool was in hand or a menu was open at the press. `second`: it came while an earlier click's close
   *  was still waiting, so the two make a double-click. */
  | { type: 'press'; empty: boolean; busy: boolean; second: boolean; travel: number; button: number };

// further than this between press and release is a drag, a marquee or a pan
const CLICK_TRAVEL = 4;

/** Whether the event closes the chat. A prototype board keeps it docked open, and a phone's sheet keeps its own
 *  rules for presses. A click on a card leaves it open, so cards can be selected while chatting. */
export function closes(e: CloseInput, where: Geometry['where']): boolean {
  if (where === 'proto') return false;
  switch (e.type) {
    case 'esc':
      return !e.composing;
    case 'fold':
      return true;
    case 'press':
      return where === 'desk' && e.empty && !e.busy && !e.second && e.button === 0 && e.travel <= CLICK_TRAVEL;
    default: {
      const unknown: never = e;
      return unknown;
    }
  }
}

export type EscStep = 'shrink' | 'close' | 'none';

/** What Esc does with focus in the chat: the writing area shrinks first, then the close rules decide. A prototype
 *  board's docked chat shrinks too, though it never closes. */
export function escStep(e: { composing: boolean; expanded: boolean }, where: Geometry['where']): EscStep {
  if (e.composing) return 'none';
  if (e.expanded) return 'shrink';
  return closes({ type: 'esc', composing: false }, where) ? 'close' : 'none';
}

/** How long a click on empty board waits before it closes the chat. A double-click there makes a note beside the
 *  chat, and the second press can only cancel a close that has not happened yet; closing at once and reopening would
 *  flash the chat and lose the caret. 500 ms is the usual longest double-click gap. With double-click notes off, it
 *  closes at once. */
export const closeWait = (dblNote: boolean) => (dblNote ? 500 : 0);

const linesIn = (text: string) => text.trimEnd().split('\n').length;

/** A paste longer than this many characters becomes a chip. */
export const PASTE_AT = 2000;

/** What a pasted-text chip says: lines as written, counting \r\n as one break. */
export const pastedLabel = (text: string) => {
  const n = linesIn(text);
  return `Pasted text · ${n === 1 ? '1 line' : `${n.toLocaleString('en-GB')} lines`}`;
};

export const tooLong = `That’s too long to paste. A message can hold up to ${DRAFT_MAX.toLocaleString('en-GB')} characters.`;

export type PasteIn = {
  /** The clipboard's plain text. */
  text: string;
  /** Ctrl/Cmd+Shift+V: the person asked for the words as they are. */
  plain: boolean;
  /** Chips exist only in the desktop app. */
  native: boolean;
  /** Characters that stay: the input minus the selection, plus every pasted text already held. */
  kept: number;
  /** Files and pasted texts already on the next message. */
  attachments: number;
};
export type PasteAction = { type: 'insert' } | { type: 'chip' } | { type: 'refuse'; why: string };

/** What a text paste does, in order: nothing to do for no text; refused whole when the draft would outgrow its budget,
 *  since the box would otherwise cut it short without a word; typed in for a short, plain or web paste; refused when
 *  the message holds its most files; otherwise a chip. */
export function pasteAction(i: PasteIn): PasteAction {
  if (!i.text) return { type: 'insert' };
  if (i.kept + i.text.length > DRAFT_MAX) return { type: 'refuse', why: tooLong };
  if (!i.native || i.plain || i.text.length <= PASTE_AT) return { type: 'insert' };
  if (i.attachments >= MAX_FILES) return { type: 'refuse', why: tooMany };
  return { type: 'chip' };
}

/** What her box shows while the closed chat holds text or pasted texts, and the name it has then, or null when it
 *  holds neither. Lines are counted as written, without trailing new lines. */
export function draftLabel(text: string, name: string, pastes = 0): { shown: string; spoken: string } | null {
  const kept = text.trimEnd();
  if (!kept && !pastes) return null;
  const n = linesIn(kept),
    parts = [
      ...(kept ? [n === 1 ? '1 line' : `${n} lines`] : []),
      ...(pastes ? [pastes === 1 ? 'pasted text' : `${pastes} pasted texts`] : []),
    ];
  return { shown: `Draft · ${parts.join(' + ')}`, spoken: `Ask ${name}, draft, ${parts.join(' and ')}` };
}
