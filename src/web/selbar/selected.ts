import type { Card } from '../../shared/model.ts';
import { byId } from '../canvas/wires.ts';
import { session } from '../core/state.ts';

// the selected cards, in the order they were picked
export function selCards(): Card[] {
  return [...session.sel].map(byId).filter(c => c !== undefined);
}
