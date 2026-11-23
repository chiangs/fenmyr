import type { CardOf } from '../../shared/model.ts';
import { esc } from '../ui/dom.ts';

// A card this build can't read: it says so and names the type the file gave it. The file keeps it as it was.
export function unknownCard(c: CardOf<'unknown'>) {
  const kind = typeof c.original.type === 'string' ? c.original.type : '',
    named = esc(kind ? `“${kind}”` : 'This card');
  return `<div class="unk"><b>Needs a newer Fenmyr</b><span>${named} can't be shown here. It stays in the board as it was.</span></div>`;
}
