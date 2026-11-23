import { isUpdateChannel, type UpdateChannel } from '../../shared/updateChannel.ts';
import { $ } from '../core/dom.ts';
import { currentChannel } from '../settings/about.ts';
import { settings } from '../settings/settings.ts';
import { applySettings } from '../settings/widgets.ts';
import { closestTo, htmlIn } from '../ui/dom.ts';

const NOTES: Record<UpdateChannel, string> = {
  stable: 'Tested releases.',
  beta: 'New things early, with some rough edges. Stable releases come too.',
  main: 'Each change as it’s merged. For people working on Fenmyr.',
};

// only a clone install has a channel, so only its update check shows the row
export function paintChannel(shown: boolean) {
  const channel = currentChannel();
  $('suChannelRow').hidden = !shown;
  $('suChannelNote').textContent = NOTES[channel];
  for (const b of htmlIn($('suChannel'), '[data-v]')) {
    const on = b.dataset.v === channel;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  }
}

// `switched` runs a fresh check, since the answer depends on the channel
export function initChannelRow(switched: () => void) {
  $('suChannel').onclick = e => {
    const v = closestTo(e.target, '[data-v]')?.dataset.v;
    if (!isUpdateChannel(v)) return;
    settings.updateChannel = v;
    applySettings();
    paintChannel(true);
    switched();
  };
}
