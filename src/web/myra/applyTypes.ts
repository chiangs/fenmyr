import type { Card, Link } from '../../shared/model.ts';
import type { MyraReply } from '../../shared/myraReply.ts';
import type { NoteProps, Template } from '../../shared/ops.ts';
import type { VaultTasksUsed } from '../vault/ask.ts';

// the kinds of card she can add; anything else she names becomes a note
export const MYRA_ADDS = ['todo', 'title', 'swatch', 'doc', 'font'] as const;

// her actions: say, add cards, move cards, place unsorted ideas, add titles, connect cards
export type NoteUsed = {
  vault: string;
  vaultId: string;
  rel: string;
  title: string;
  tags: string[];
  props: NoteProps | undefined;
  excerpt: string;
  text: string;
};
export type Picked = { asked: boolean; used: NoteUsed[]; tasks?: VaultTasksUsed | null };

// a picture she fetched, sized for its card
export type Picture = {
  src: string;
  w: number;
  h: number;
  x: number | undefined;
  y: number | undefined;
  caption: string;
};
// A reply with everything from outside the board in hand, so applying it waits for nothing. Holding it changes nothing.
export type HeldReply = {
  reply: MyraReply;
  q: string;
  ctx: Picked;
  pictures: Picture[];
  template: { mode: 'add'; name: string; cards: Card[]; links: Link[] } | { mode: 'new'; template: Template } | null;
  notes: NoteUsed[];
};
