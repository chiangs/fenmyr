import type { NoteProps } from '../../shared/ops.ts';
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
