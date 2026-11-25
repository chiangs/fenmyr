import type { CardOf } from '../../shared/model.ts';
import { appState, session } from '../core/state.ts';
import { homeAt } from '../library/home.ts';
import { selCards } from '../selbar/selected.ts';
import { keepSettings, settings } from '../settings/settings.ts';
import { closePicker, onPhone, openPicker, pickerScreen } from './piecePick.ts';

// the selection the last frame saw: the picker opens when it changes, so Esc closing it doesn't open it again
let seen = '';

/** Pieces in the bar: hides the picker open on its screen, and then selecting a screen leaves it hidden; or opens it
 *  with the cursor in its search, and selecting a screen opens it again. */
export function togglePieces(screen: CardOf<'frame'>) {
  const open = pickerScreen() !== screen.id;
  settings.autoPieces = open;
  keepSettings();
  if (open) openPicker(screen, 'bar');
  else closePicker();
}

/** Each frame, before the picker follows the selection: when the selection has just become one screen, the picker
 *  opens beside it, or moves there, and the keyboard stays on the board. Not on a phone, where the picker is a sheet
 *  over the board, and not mid-drag, so a marquee passing over a screen doesn't flash it. */
export function autoPieces() {
  if (appState.drag) return;
  const now = [...session.sel].join();
  if (now === seen) return;
  seen = now;
  const sel = selCards(),
    s = sel.length === 1 ? sel[0] : undefined;
  if (s?.type !== 'frame' || !settings.autoPieces || onPhone() || homeAt || pickerScreen() === s.id) return;
  openPicker(s, 'bar', false);
}
