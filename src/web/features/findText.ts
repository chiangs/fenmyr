import type { Card } from '../../shared/model.ts';
import { captureTag } from '../proto/capture.ts';
import { dueChip } from './due.ts';

// The words a piece of markup draws, so a chip or a tag is searched as it reads and not as it is built
const wordsIn = (html: string) => html.replace(/<[^>]+>/g, ' ');

// What only this card's type holds. Every type has a case, even one with nothing to add, so a new card type fails tsc
// until someone decides what find should match on it.
function ownWords(c: Card): (string | undefined)[] {
  switch (c.type) {
    case 'note':
      return [wordsIn(dueChip(c))];
    case 'todo':
      return [...(c.items ?? []).map(i => i.t), wordsIn(dueChip(c))];
    case 'link':
      return [c.desc, c.draft, c.url];
    case 'swatch':
      return [c.label, c.hex];
    case 'coll':
      return c.colNames ?? [];
    case 'font':
      return [c.font];
    case 'vnote':
      return [...(c.props ?? []).map(([key, value]) => `${key} ${value}`), c.excerpt];
    case 'box':
      return [c.img];
    case 'image':
      return [wordsIn(captureTag(c))];
    case 'doc':
      return [wordsIn(c.body ?? '')];
    case 'title':
    case 'canvas':
    case 'shape':
    case 'stamp':
    case 'audio':
    case 'video':
    case 'spotify':
    case 'ink':
    case 'frame':
    case 'section':
    case 'text':
    case 'icon':
    case 'path':
    case 'unknown':
      return [];
    default: {
      const unhandled: never = c;
      return unhandled;
    }
  }
}

// What every card holds, including the label pill on its edge, then what its type adds. Lower case, as the query is.
export const findText = (c: Card) =>
  [c.text, c.name, c.title, ...(c.tags ?? []).map(t => `#${t}`), c.tagText, ...ownWords(c)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
