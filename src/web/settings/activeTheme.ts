// The colour theme in use: the one chosen for the current mode, applied as a class on <body> (the page reads its colours
// from web/themes.css) and as the card colours that swatches and menus show. With Follow Caelestia on, the scheme's
// colours go on top of it.
import type { CaelestiaScheme } from '../../shared/ops.ts';
import { COLORS } from '../core/base.ts';
import { appState } from '../core/state.ts';
import { caelestiaTokens } from './caelestia.ts';
import { settings } from './settings.ts';
import { type Mode, PASTELS, type Theme, type Tokens, themeClass, themeOf } from './themes.ts';

export const themeFor = (mode: Mode): Theme | undefined =>
  themeOf(mode, mode === 'dark' ? settings.darkTheme : settings.lightTheme);

// Caelestia's colours on the theme for this mode, when it is being followed. Worked out once for a scheme and a theme,
// since settings are applied often.
let last: { scheme: CaelestiaScheme; theme: Theme; tokens: Tokens } | undefined;
export function caelestiaFor(mode: Mode) {
  const scheme = appState.cae,
    theme = themeFor(mode);
  if (!settings.caelestia || !scheme || !theme) return null;
  if (last?.scheme !== scheme || last.theme !== theme) last = { scheme, theme, tokens: caelestiaTokens(scheme, theme) };
  return last.tokens;
}

export function applyTheme(mode: Mode) {
  const theme = themeFor(mode),
    cls = theme ? themeClass(theme) : '',
    body = document.body.classList,
    cae = caelestiaFor(mode),
    cards = cae?.cards ?? theme?.tokens.cards ?? {};
  for (const c of [...body].filter(x => x.startsWith('theme-') && x !== cls)) body.remove(c);
  if (cls) body.add(cls);
  // Default keeps the colours swatches have always shown; another theme's own fills, or Caelestia's, are what its cards are drawn with
  const fills = cae || cls ? Object.fromEntries(Object.entries(cards).map(([k, c]) => [k, c.fill])) : PASTELS;
  Object.assign(COLORS, fills);
}
