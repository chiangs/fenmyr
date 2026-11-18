// The colour theme in use: the one chosen for the current mode, applied as a class on <body> (the page reads its colours
// from web/themes.css) and as the card colours that swatches and menus show.
import { COLORS } from '../core/base.ts';
import { settings } from './settings.ts';
import { type Mode, PASTELS, type Theme, themeClass, themeOf } from './themes.ts';

export const themeFor = (mode: Mode): Theme | undefined =>
  themeOf(mode, mode === 'dark' ? settings.darkTheme : settings.lightTheme);

export function applyTheme(mode: Mode) {
  const theme = themeFor(mode),
    cls = theme ? themeClass(theme) : '',
    body = document.body.classList;
  for (const c of [...body].filter(x => x.startsWith('theme-') && x !== cls)) body.remove(c);
  if (cls) body.add(cls);
  // Default keeps the colours swatches have always shown; another theme's own fills are what its cards are drawn with
  const fills =
    !theme || !cls ? PASTELS : Object.fromEntries(Object.entries(theme.tokens.cards).map(([k, c]) => [k, c.fill]));
  Object.assign(COLORS, fills);
}
