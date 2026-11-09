import { type ChatAction, clip, type ReadNote, type WebPage } from '../../shared/chat.ts';
import { buildUndoButton, commitButton } from '../proto/build.ts';
import { sourceButton } from '../proto/sources.ts';
import { offerPieces } from '../repo/offer.ts';
import { openNote } from '../vault/notes.ts';
import { ask } from './chat.ts';
import { changesPieces } from './replyUndo.ts';
import type { SayAction } from './say.ts';

// A button under one of her lines: a stored kind, kept with the message, or a closure that lasts only as long as the
// window shows it.
export type Act = SayAction | ChatAction;

export const storedOf = (acts: readonly Act[]): ChatAction[] => acts.filter(a => 'kind' in a);

// Under her words, always in this order, whatever order the acts are kept in.
export const SLOTS = ['summary', 'reply', 'other', 'sources', 'next'] as const;
type Row = Exclude<(typeof SLOTS)[number], 'summary' | 'sources'>;

// what a click takes away: nothing, this button, or every button in its row
export type After = 'stay' | 'self' | 'row';
export type Button = SayAction & { title?: string; after: After };
export type Piece =
  | { slot: 'summary'; head: string; lines: readonly string[]; cls?: string }
  | { slot: 'sources'; head: string; links: readonly Button[] }
  | { slot: Row; button: Button };

const one = (slot: Row, after: After, b: SayAction | null): Piece[] => (b ? [{ slot, button: { ...b, after } }] : []);

const count = (n: number, single: string, plural: string) => `${n} ${n === 1 ? single : plural}`;
const link = (label: string, title: string, run: () => unknown): Button => ({ label, title, after: 'stay', run });

// The site follows her title so a lookalike address shows; the tooltip holds the whole title and address.
function pageLink({ url, title }: WebPage) {
  const host = new URL(url).hostname,
    label = title === host ? host : `${clip(title, 80)} · ${host}`;
  return link(label, title === host ? url : `${title}\n${url}`, () => Fenmyr.openURL(url));
}

// what she read: one line of links for her vault notes, and one for the pages she opened
function readPieces({ notes, pages }: { notes: readonly ReadNote[]; pages: readonly WebPage[] }): Piece[] {
  const pieces: Piece[] = [];
  if (notes.length)
    pieces.push({
      slot: 'sources',
      head: `I read ${count(notes.length, 'note', 'notes')} from your vault`,
      links: notes.map(n => link(n.title, 'Open in Obsidian', () => openNote(n.vault, n.rel))),
    });
  if (pages.length)
    pieces.push({
      slot: 'sources',
      head: `I read ${count(pages.length, 'web page', 'web pages')}`,
      links: pages.map(pageLink),
    });
  return pieces;
}

// One view per stored kind; a kind without one fails the type check. A view gives nothing when it has nothing to show
// now: its card is gone, its prototype isn't the open board, or a newer build's Undo is in the chat.
const VIEW: { [K in ChatAction['kind']]: (a: Extract<ChatAction, { kind: K }>) => Piece[] } = {
  next: a => one('next', 'row', { label: a.text, cls: 'next', run: () => ask(a.text) }),
  changes: changesPieces,
  source: a => one('other', 'stay', sourceButton(a.card)),
  buildUndo: a => one('other', 'self', buildUndoButton(a)),
  commit: a => one('other', 'self', commitButton(a)),
  read: readPieces,
  offer: offerPieces,
};

const viewOf = <K extends ChatAction['kind']>(k: K, a: Extract<ChatAction, { kind: K }>) => VIEW[k](a);

// A closure is a one-off choice, such as Yes and Not now, so clicking one takes its row.
export const piecesOf = (a: Act): Piece[] => ('kind' in a ? viewOf(a.kind, a) : one('other', 'row', a));
