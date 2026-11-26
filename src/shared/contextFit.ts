import { isRecord } from './model.ts';
import type { ModelChoice, ProviderModels } from './models.ts';

/** The docs put 1M tokens at about 2.5M characters on the current tokenizer. */
export const CHARS_PER_TOKEN = 2.5;
/** The most one picture costs on current Claude models (high resolution, 2,576 px long edge), so a picture is counted
 *  at its worst rather than measured. */
export const PICTURE_TOKENS = 4_784;
/** Assumed when the model isn't known, as with Claude Code's own default. */
export const UNKNOWN_WINDOW = 200_000;
/** The most pictures one build sends, however big the window: each is a file the builder opens, and every one has to
 *  cross from the window to the host first. */
export const MAX_PICTURES = 20;
/** What Fenmyr sends from the board may fill this share. The rest is Claude Code's and Myra's instructions, the files a
 *  build reads, and the answer. */
export const BOARD_SHARE = 0.25;

export const tokensOf = (chars: number) => Math.ceil(chars / CHARS_PER_TOKEN);
export const roomOf = (window: number) => Math.floor(window * BOARD_SHARE);

/** The context window of the chosen model, or `UNKNOWN_WINDOW` for a choice that names no model, a model the lists
 *  don't have, or one that doesn't say. A guess that is too small only costs words, one too big would cost a call. */
export function windowOf(lists: readonly ProviderModels[], choice: ModelChoice | undefined): number {
  const id = choice?.id;
  if (id === undefined) return UNKNOWN_WINDOW;
  const model = lists.find(p => p.provider === choice?.provider)?.models.find(m => m.id === id);
  return model?.context ?? UNKNOWN_WINDOW;
}

/** Cards a little apart in y still read as one row, as they do to an eye running along the board. */
export const READING_ROW = 200;

/** The cards in the order they are worth keeping when there isn't room for all: the selected ones, then the ones wired
 *  to a selected card, then the rest. Each group reads the way the board does, row by row and left to right. A new
 *  array, with every card once. */
export function rankCards<C extends { id: string; x: number; y: number }>(
  cards: readonly C[],
  selected: ReadonlySet<string>,
  links: readonly { a: string; b: string }[],
): C[] {
  const wired = new Set<string>();
  for (const { a, b } of links) {
    if (selected.has(a)) wired.add(b);
    if (selected.has(b)) wired.add(a);
  }
  const group = (c: C) => (selected.has(c.id) ? 0 : wired.has(c.id) ? 1 : 2);
  // sort is stable, so cards that tie on group, row and x keep the order they came in
  return [...cards].sort(
    (p, q) => group(p) - group(q) || Math.floor(p.y / READING_ROW) - Math.floor(q.y / READING_ROW) || p.x - q.x,
  );
}

/** Keeps each item whose cost still fits in what is left of `room`. One that doesn't fit is left out and a smaller one
 *  after it can still go in, so a single big card doesn't cost the board the cards behind it. Both lists keep the order
 *  they came in. */
export function fitRanked<T>(items: readonly T[], room: number, cost: (t: T) => number): { kept: T[]; left: T[] } {
  const kept: T[] = [],
    left: T[] = [];
  let spare = room;
  for (const item of items) {
    const c = cost(item);
    if (c <= spare) {
      kept.push(item);
      spare -= c;
    } else left.push(item);
  }
  return { kept, left };
}

const PART_KINDS = ['request', 'cards', 'pictures', 'errors', 'design', 'myra', 'board', 'chat', 'files'] as const;
export type PartKind = (typeof PART_KINDS)[number];
/** cut: a text part sent shorter than it is, as a long design.md can be on a small window. */
export type Part = { kind: PartKind; tokens: number; count?: number; cut?: true };
/** What one build or question was sent, against the window it had. Ids are card ids. left: cards left out to fit;
 *  pictures: cards whose picture was left out to fit; shortened: cards sent with their words cut short; unseen:
 *  wireframe screens that weren’t in view, so no picture could be taken; tooBig: pictures too big to send. */
export type ContextUse = {
  window: number;
  parts: Part[];
  left: string[];
  pictures: string[];
  shortened: string[];
  unseen: string[];
  tooBig: string[];
};

export const usedTokens = (u: ContextUse) => u.parts.reduce((sum, p) => sum + p.tokens, 0);

// A board file keeps every card a trimmed reply names, so the box after a reload names what it named live. The cap only
// stops a damaged file from holding without end.
export const MAX_IDS = 5_000;
const isCount = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0;
const idsOf = (x: unknown) =>
  (Array.isArray(x) ? x : []).filter((s): s is string => typeof s === 'string').slice(0, MAX_IDS);

function readPart(x: unknown): Part[] {
  if (!isRecord(x) || !isCount(x.tokens)) return [];
  const kind = PART_KINDS.find(k => k === x.kind);
  if (!kind) return [];
  const cut: { cut?: true } = x.cut === true ? { cut: true } : {};
  if (x.count === undefined) return [{ kind, tokens: x.tokens, ...cut }];
  return isCount(x.count) ? [{ kind, tokens: x.tokens, count: x.count, ...cut }] : [];
}

/** A use from a board file: undefined without a window or its parts. A part that is damaged drops alone, so one odd
 *  part doesn't cost the others, and a list that is damaged reads as empty. */
export function readContextUse(x: unknown): ContextUse | undefined {
  if (!isRecord(x) || !isCount(x.window) || x.window < 1 || !Array.isArray(x.parts)) return undefined;
  return {
    window: x.window,
    parts: x.parts.flatMap(readPart),
    left: idsOf(x.left),
    pictures: idsOf(x.pictures),
    shortened: idsOf(x.shortened),
    unseen: idsOf(x.unseen),
    tooBig: idsOf(x.tooBig),
  };
}

export const num = (n: number) => n.toLocaleString('en-GB');
export const counted = (n: number, one: string, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;
const joined = (words: string[]) =>
  words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words.at(-1)}` : (words[0] ?? '');

/** How much of the window the use took, in a few words. It says "under 1%" rather than "about 0%" for a small use,
 *  since 0% reads as nothing sent. */
export function shareWords(u: ContextUse): string {
  const used = usedTokens(u),
    percent = Math.min(100, Math.round((used / u.window) * 100));
  return used > 0 && percent === 0 ? 'under 1% of the context' : `about ${num(percent)}% of the context`;
}

/** What was read from the board, as a list: the cards, their pictures, then the two files about the design. */
export function readList(u: ContextUse): string {
  const words: string[] = [],
    cards = u.parts.find(p => p.kind === 'cards')?.count,
    pictures = u.parts.find(p => p.kind === 'pictures')?.count;
  if (cards) words.push(counted(cards, 'card'));
  if (pictures) words.push(counted(pictures, 'picture'));
  for (const kind of ['design', 'myra'] as const) {
    const part = u.parts.find(p => p.kind === kind);
    if (part && part.count !== 0) words.push(`${kind}.md`);
  }
  return joined(words);
}

// what a text part is called in a line about it being shortened
const TEXT_NAMES: Record<PartKind, string> = {
  request: 'The request',
  cards: 'The cards',
  pictures: 'The pictures',
  errors: 'The preview errors',
  design: 'design.md',
  myra: 'myra.md',
  board: 'The board',
  chat: 'The chat so far',
  files: 'The added files',
};

/** One line for each thing that was given up to fit, so a cut is never silent. */
export function leftWords(u: ContextUse): string[] {
  const lines: string[] = [],
    cut = u.left.length,
    noPicture = u.pictures.length,
    short = u.shortened.length,
    unseen = u.unseen.length,
    tooBig = u.tooBig.length;
  if (cut + noPicture) {
    const things = joined([
      ...(noPicture ? [counted(noPicture, 'picture')] : []),
      ...(cut ? [counted(cut, 'card')] : []),
    ]);
    lines.push(`${things} ${cut + noPicture === 1 ? 'was' : 'were'} left out to fit`);
  }
  if (short) lines.push(`${counted(short, 'card')} ${short === 1 ? 'was' : 'were'} shortened to fit`);
  if (unseen) {
    const tail = unseen === 1 ? 'wasn’t in view, so its layout went' : 'weren’t in view, so their layouts went';
    lines.push(`${counted(unseen, 'screen')} ${tail} without a picture`);
  }
  if (tooBig) lines.push(`${counted(tooBig, 'picture')} ${tooBig === 1 ? 'was' : 'were'} too big to send`);
  const cutText = u.parts.filter(p => p.cut).map(p => TEXT_NAMES[p.kind]);
  if (cutText.length) lines.push(`${joined(cutText)} ${cutText.length === 1 ? 'was' : 'were'} shortened to fit`);
  return lines;
}

/** One part for a hover list, with what it cost. */
export function partWords(p: Part): string {
  const cost = `about ${counted(p.tokens, 'token')}`;
  switch (p.kind) {
    case 'request':
      return `The request · ${cost}`;
    case 'cards':
      return `${p.count === undefined ? 'Cards' : counted(p.count, 'card')} · ${cost}`;
    case 'pictures':
      return `${p.count === undefined ? 'Pictures' : counted(p.count, 'picture')} · ${cost}`;
    case 'errors':
      return `Preview errors · ${cost}`;
    case 'design':
      return `design.md · ${cost}`;
    case 'myra':
      return `myra.md · ${cost}`;
    case 'board':
      return `The board · ${cost}`;
    case 'chat':
      return `The chat so far · ${cost}`;
    case 'files':
      return `Added files · ${cost}`;
    default: {
      const unhandled: never = p.kind;
      return unhandled;
    }
  }
}
