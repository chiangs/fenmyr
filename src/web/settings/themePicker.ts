// The theme picker in Settings: a group of radio rows for light and one for dark, each showing the theme's name and a row
// of its colours. The rows are drawn once; after that only which one is selected changes. Choosing goes through the same
// data-seg handler as every other choice, so the setting is saved and the page restyled with no reload.
import { $ } from '../core/dom.ts';
import { htmlIn } from '../ui/dom.ts';
import { caelestiaFor, themeFor } from './activeTheme.ts';
import { settings } from './settings.ts';
import { type Mode, THEMES, type Theme, themeName, themeOf } from './themes.ts';

// the board (outlined, since it can be as light as the panel), the panel, the accent, then the seven card fills in order
const chipsOf = (t: Theme) => [
  t.tokens.bg,
  t.tokens.panel,
  t.tokens.accent,
  ...Object.values(t.tokens.cards).map(c => c.fill),
];

function rowOf(t: Theme) {
  const id = themeName(t),
    accessible = t.target === 'aaa',
    label = accessible ? `${t.name}, accessible` : t.name,
    sub = accessible ? '<small>Accessible</small>' : '',
    chips = chipsOf(t)
      .map(c => `<i style="background:${c}"></i>`)
      .join('');
  return `<button type="button" class="tp-row" role="radio" data-v="${id}" aria-label="${label}"><span class="tp-radio" aria-hidden="true"></span><span class="tp-name">${t.name}${sub}</span><span class="tp-chips" aria-hidden="true">${chips}</span></button>`;
}

const groupOf = (mode: Mode) => $(mode === 'dark' ? 'themeDark' : 'themeLight');

// the arrow keys move between the rows of a group, and a row takes the choice as it takes the focus
function moveWithArrows(group: HTMLElement) {
  group.onkeydown = e => {
    const step =
      e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    const rows = htmlIn(group, '.tp-row'),
      here = rows.findIndex(r => r === document.activeElement),
      next = rows[(here + step + rows.length) % rows.length];
    e.preventDefault();
    next?.focus();
    next?.click();
  };
}

export function paintThemePicker() {
  for (const mode of ['light', 'dark'] as const) {
    const group = groupOf(mode);
    if (!group.firstElementChild) {
      group.innerHTML = THEMES.filter(t => t.mode === mode)
        .map(rowOf)
        .join('');
      moveWithArrows(group);
    }
    // a name that isn't a theme shows Default as chosen, which is what the page is using
    const chosen = themeOf(mode, mode === 'dark' ? settings.darkTheme : settings.lightTheme),
      current = chosen ? themeName(chosen) : 'default';
    for (const row of htmlIn(group, '.tp-row')) {
      const on = row.dataset.v === current;
      row.setAttribute('aria-checked', String(on));
      row.tabIndex = on ? 0 : -1;
    }
  }
  // the Follow Caelestia row says which theme its colours go on
  const mode = document.body.classList.contains('dark') ? 'dark' : 'light',
    base = themeFor(mode);
  $('caeBase').textContent = base ? `Based on ${base.name}.` : '';
  // colours of your own: not Caelestia's, which are not yours to reset
  $('themeNote').hidden = !!caelestiaFor(mode) || !Object.keys(settings.colors[mode]).length;
  $('themeReset').onclick = () => $('colReset').click();
}
