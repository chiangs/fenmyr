import type { Card } from '../../shared/model.ts';

// What only this card's type holds. Every type has a case, even one with nothing to add, so a new card type fails tsc
// until someone decides what find should match on it.
function ownWords(c: Card): (string | undefined)[] {
  switch (c.type) {
    case 'todo':
      return (c.items ?? []).map(i => i.t);
    case 'swatch':
      return [c.label];
    case 'doc':
      return [c.body?.replace(/<[^>]+>/g, ' ')];
    case 'note':
    case 'title':
    case 'image':
    case 'link':
    case 'coll':
    case 'canvas':
    case 'shape':
    case 'stamp':
    case 'audio':
    case 'video':
    case 'spotify':
    case 'ink':
    case 'frame':
    case 'section':
    case 'box':
    case 'text':
    case 'icon':
    case 'font':
    case 'vnote':
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
