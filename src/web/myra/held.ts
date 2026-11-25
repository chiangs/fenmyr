import { parentOf } from '../cards/collection.ts';
import { byId } from '../core/state.ts';
import { STRIKE_S } from '../gooBusy.ts';
import { goo } from './goos.ts';
import { hold } from './status.ts';

/** Gives her the clipboard while the card being edited (`id`) is a checklist or a kanban board or one of its cards. */
export function holdForEdit(id: string | null) {
  const c = id ? byId(id) : undefined,
    kanban = (x: typeof c) => x?.type === 'coll' && !!x.kanban;
  hold('clipboard', !!c && (c.type === 'todo' || kanban(c) || kanban(parentOf(c.id))));
}

// the screen tool is in hand, waiting for a screen to be placed; and the strike that keeps her hammer out after it ends
let framing = false;
let striking: ReturnType<typeof setTimeout> | undefined;

/** Gives her the hammer while the screen tool is in hand (`on`). */
export function hammerFor(on: boolean) {
  framing = on;
  hold('hammer', framing || !!striking);
}

/** Brings her hammer down as a screen lands, and keeps it out for the strike even when the tool is put down. */
export function strikeHammer() {
  hold('hammer', true);
  goo.strike();
  clearTimeout(striking);
  striking = setTimeout(
    () => {
      striking = undefined;
      hold('hammer', framing);
    },
    STRIKE_S * 1000 + 150,
  );
}
