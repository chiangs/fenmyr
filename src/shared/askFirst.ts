// When one of Myra's replies waits in the chat as a plan before it changes the board: it would add, move or edit more
// than 10 cards, or remove any. The app counts, from the plan itself, so the count is what Do it would land.
import { isFromReading } from './cardTypes.ts';
import type { BoardPatch, ChangeSet } from './changes.ts';

const PLAN_OVER = 10;

// cards: each card added, moved or edited, once. removed: from the board or from Unsorted.
type Weight = { cards: number; removed: number };

// A screen's pieces go with their frame, so a screen is one card, and cards a collection only re-laid go with it. A
// card made from what she read, such as a vault note, never counts, so reading alone never waits as a plan. Connectors
// don't count: a reply removes one only with a card.
export function weigh(record: BoardPatch, set: ChangeSet): Weight {
  const item = new Map(record.cards.map(d => [d.id, d.now?.item])),
    touched = new Set([...set.added, ...set.moved, ...set.edited]),
    added = new Set(set.added);
  const counts = (id: string) => {
    const c = item.get(id);
    if (!c) return true;
    if (added.has(id) && isFromReading(c.type)) return false;
    return !(c.onFrame && touched.has(c.onFrame));
  };
  return { cards: [...touched].filter(counts).length, removed: set.removed.length };
}

export const asksFirst = (w: Weight) => w.removed > 0 || w.cards > PLAN_OVER;

// What a whole message says to a waiting plan, when that is all it says. Only these exact words, so "no, make it
// three groups" or "don't just do it" still goes to her.
type Answer = 'do' | 'just' | 'cancel';
const ANSWERS = new Map<string, Answer>([
  ['just do it', 'just'],
  ['yes', 'do'],
  ['yes please', 'do'],
  ['yep', 'do'],
  ['ok', 'do'],
  ['sure', 'do'],
  ['do it', 'do'],
  ['do that', 'do'],
  ['please do', 'do'],
  ['go ahead', 'do'],
  ['go for it', 'do'],
  ['sounds good', 'do'],
  ['looks good', 'do'],
  ['no', 'cancel'],
  ['cancel', 'cancel'],
  ['never mind', 'cancel'],
]);
export const answerOf = (q: string): Answer | null =>
  ANSWERS.get(
    q
      .toLowerCase()
      .replace(/[✦.!,…]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  ) ?? null;
