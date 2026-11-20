import { $ } from '../core/dom.ts';
import { SHORTCUT_GROUPS, SHORTCUTS } from '../input/keymap.ts';
import { esc } from '../ui/dom.ts';

const rowHtml = (shortcut: (typeof SHORTCUTS)[number]) => {
  const does = esc(shortcut.does),
    keys = esc(shortcut.keys);
  return `<div class="sk-row"><span>${does}</span><span class="sk-key"><kbd class="keycap">${keys}</kbd></span></div>`;
};

// Settings → Board → Keyboard shortcuts: one block per group that has entries, drawn when the tab opens.
export function renderShortcutList() {
  const blocks = SHORTCUT_GROUPS.flatMap(group => {
    const entries = SHORTCUTS.filter(s => s.group === group.id);
    if (!entries.length) return [];
    const heading = esc(group.heading),
      noteText = esc(group.note),
      note = group.note ? `<p class="sk-note">${noteText}</p>` : '',
      rows = entries.map(rowHtml).join('');
    return [`<div class="sk-group"><h4 class="sk-head">${heading}</h4>${note}${rows}</div>`];
  });
  $('setKeys').innerHTML = blocks.join('');
}
