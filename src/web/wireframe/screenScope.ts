import type { Card, CardOf } from '../../shared/model.ts';
import { byId } from '../core/state.ts';

/** The screen the wireframe tools act on: the one selected screen when every other selected card sits on it, else the
 *  screen every selected card sits on. Null for two screens, a card on none, or cards on different screens. */
export function screenOf(cs: readonly Card[]): CardOf<'frame'> | null {
  const screens = cs.filter(c => c.type === 'frame'),
    id = screens.length > 1 ? undefined : (screens[0]?.id ?? cs[0]?.onFrame),
    s = id ? byId(id) : undefined;
  return s?.type === 'frame' && cs.every(c => c === s || c.onFrame === s.id) ? s : null;
}
