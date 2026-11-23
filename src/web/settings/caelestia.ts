// Follow Caelestia: the scheme's colours on top of the theme chosen for the mode. Caelestia supplies the surfaces, the text,
// the accent, the focus colour and the seven card fills; the theme supplies what Caelestia doesn't, and its own values
// wherever Caelestia's miss the contrast the theme promises. Cards come from Caelestia only if its fills stay apart for
// every kind of colour blindness; if any two come out too close, all seven are the theme's, since a mix would make a
// board's colours inconsistent.
import type { CaelestiaScheme } from '../../shared/ops.ts';
import { bestInk, contrast, mixHex, readableShade } from '../ui/color.ts';
import { type Chosen, derive, NON_TEXT, TEXT } from './derive.ts';
import { checksOf } from './themeChecks.ts';
import type { Theme, Tokens } from './themes.ts';

// Caelestia's name for the colour each card key is made from; the first one it has is used
const CARD_FROM: Record<string, string[]> = {
  white: ['surfaceContainerHighest'],
  butter: ['yellow'],
  pink: ['pink', 'red'],
  mint: ['green'],
  sky: ['sky', 'blue'],
  lilac: ['mauve', 'lavender'],
  peach: ['peach', 'rosewater'],
};

export function caelestiaTokens(scheme: CaelestiaScheme, theme: Theme): Tokens {
  const c = scheme.colours,
    pick = (...keys: string[]) => keys.map(k => c[k]).find(Boolean),
    base = theme.tokens,
    cardInk = base.cards.butter?.ink ?? base.onPastel,
    text = TEXT[theme.target],
    // a colour that misses its target is moved in lightness until it passes, and that goes for the theme's own colour too when
    // the scheme has none, since it now sits on the scheme's surfaces; if it can't be done, the theme's own is used
    solve = (colour: string | undefined, fallback: string, need: number, on: string[]) => {
      const shade = readableShade(colour ?? fallback, on, need);
      return on.every(b => contrast(shade, b) >= need) ? shade : fallback;
    },
    bg = pick('surface') ?? base.bg,
    panel = pick('surfaceContainer', 'surface') ?? base.panel,
    ink = solve(pick('onSurface'), base.ink, text, [panel, bg]),
    accent = pick('primary') ?? base.accent,
    onPrimary = pick('onPrimary'),
    // Snow is the scheme's brightest surface as it is, with the scheme's text on it, as Default dark draws it; if that text
    // doesn't read there, Snow is the theme's
    snowFrom = pick('surfaceContainerHighest'),
    snow =
      snowFrom && contrast(ink, snowFrom) >= text
        ? { fill: snowFrom, ink }
        : { fill: base.cards.white?.fill ?? '#ffffff', ink: base.cards.white?.ink ?? cardInk },
    chosen: Chosen = {
      bg,
      dot: pick('outlineVariant', 'outline') ?? base.dot,
      border: pick('outlineVariant', 'outline') ?? base.border,
      panel,
      surface2: pick('surfaceContainerHigh') ?? mixHex(panel, ink, 0.06),
      ink,
      inkSoft: solve(pick('onSurfaceVariant'), base.inkSoft, text, [panel, bg]),
      accent,
      // the scheme's own text colour for the accent if it reads, then the theme's inks, then white or black: one of them always reads at 4.5:1
      onAccent:
        [onPrimary, ink, base.onAccent, '#ffffff', '#000000'].find(c => c && contrast(c, accent) >= text) ??
        bestInk(accent, ['#ffffff', '#000000']),
      focus: solve(pick('secondary'), base.focus, NON_TEXT[theme.target], [bg, panel]),
      cardInk,
      fills: Object.fromEntries(
        Object.entries(CARD_FROM).map(([key, from]) => {
          const found = pick(...from),
            fill = found ? readableShade(found, [cardInk], text) : undefined;
          return [
            key,
            key === 'white'
              ? snow.fill
              : fill && contrast(cardInk, fill) >= text
                ? fill
                : (base.cards[key]?.fill ?? '#ffffff'),
          ];
        }),
      ),
      inks: { white: snow.ink },
    },
    themeFills = Object.fromEntries(Object.entries(base.cards).map(([k, v]) => [k, v.fill])),
    themeInks = Object.fromEntries(Object.entries(base.cards).map(([k, v]) => [k, v.ink])),
    themeCards = { fills: themeFills, inks: themeInks },
    themeOwn: Record<string, Partial<Chosen>> = {
      cardsApart: themeCards,
      cardText: themeCards,
      cardLink: themeCards,
      text: { ink: base.ink },
      softText: { inkSoft: base.inkSoft },
      focus: { focus: base.focus },
    };
  // each promise the theme makes is checked on what came out, and the text, focus and card colours behind one that fails go
  // back to the theme's. The scheme's board, dots, panel and accent are never given up: if a promise still can't be kept
  // on them, they are what you chose, and the result is used as it is
  let now = chosen,
    tokens = derive(theme.mode, theme.target, now);
  for (let pass = 0; pass < 3; pass++) {
    const fix = checksOf({ ...theme, tokens })
      .filter(k => k.got < k.need)
      .flatMap(k => (themeOwn[k.id] ? [themeOwn[k.id]] : []));
    if (!fix.length) break;
    now = Object.assign({}, now, ...fix);
    tokens = derive(theme.mode, theme.target, now);
  }
  return tokens;
}
