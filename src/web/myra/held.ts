import { parentOf } from '../cards/collection.ts';
import { byId } from '../core/state.ts';
import { hold } from './status.ts';

/** Gives her the clipboard while the card being edited (`id`) is a checklist or a kanban board or one of its cards. */
export function holdForEdit(id: string | null) {
  const c = id ? byId(id) : undefined,
    kanban = (x: typeof c) => x?.type === 'coll' && !!x.kanban;
  hold('clipboard', !!c && (c.type === 'todo' || kanban(c) || kanban(parentOf(c.id))));
}
