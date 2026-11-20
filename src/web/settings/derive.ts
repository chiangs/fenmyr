// Fills in the tokens a theme doesn't choose. A theme sets what someone picked: its board and panel, its ink, its accent
// and the seven card fills. Everything else is worked out from those by rules, so the contrast the theme promises holds
// for the derived colours too: text and status colours are moved in lightness until they read, and the rest are mixes.
import { bestInk, contrast, mixHex, readableShade, solidOklch } from '../ui/color.ts';
import type { Mode, Target, Tokens } from './themes.ts';

export const TEXT: Record<Target, number> = { aa: 4.5, aaa: 7 };
export const NON_TEXT: Record<Target, number> = { aa: 3, aaa: 4.5 };
// below about 0.02 two colours look the same; the accessible themes keep three times that
export const APART: Record<Target, number> = { aa: 0.02, aaa: 0.06 };

export type Chosen = Pick<
  Tokens,
  'bg' | 'dot' | 'panel' | 'surface2' | 'ink' | 'inkSoft' | 'accent' | 'onAccent' | 'focus'
> & {
  cardInk: string;
  fills: Record<string, string>;
  // a card that doesn't use the card ink, like Default dark's Snow, which is dark with light text
  inks?: Record<string, string>;
};

// a card's quieter text and its placeholders: its own ink eased towards its fill, so they read on that card whichever theme it is in
export const quiet = (ink: string, fill: string) => ({ soft: mixHex(ink, fill, 0.2), faint: mixHex(ink, fill, 0.5) });

export function derive(mode: Mode, target: Target, c: Chosen): Tokens {
  const text = TEXT[target],
    on = [c.panel, c.bg],
    // a status colour has a hue and a chroma of its own; only its lightness is solved, against the panel and the board
    status = (hue: number, chroma: number) => readableShade(solidOklch(0.6, chroma, hue), on, text);
  return {
    bg: c.bg,
    dot: c.dot,
    panel: c.panel,
    surface2: c.surface2,
    ink: c.ink,
    inkSoft: c.inkSoft,
    inkFaint: mixHex(c.inkSoft, c.panel, 0.5),
    inkInverse: c.panel,
    blush: mixHex(c.panel, c.accent, mode === 'dark' ? 0.16 : 0.12),
    accent: c.accent,
    accentSoft: mixHex(c.accent, mode === 'dark' ? c.ink : c.panel, 0.3),
    accentDeep: mixHex(c.accent, '#000000', 0.35),
    accentText: readableShade(c.accent, on, text),
    accentTint: mixHex(c.accent, '#ffffff', 0.5),
    accentWash: mixHex(c.accent, '#ffffff', 0.7),
    accentMid: mixHex(c.accent, '#000000', 0.07),
    onAccent: c.onAccent,
    onPastel: c.cardInk,
    focus: c.focus,
    danger: status(25, 0.15),
    ok: status(150, 0.12),
    rec: '#ff5a6e',
    snow: '#ffffff',
    shade: '#000000',
    // a link in a note is the accent, moved until it reads on that card's own fill
    cards: Object.fromEntries(
      Object.entries(c.fills).map(([key, fill]) => {
        const ink = c.inks?.[key] ?? c.cardInk;
        return [key, { fill, ink, ...quiet(ink, fill), link: readableShade(c.accent, [fill], text) }];
      }),
    ),
  };
}

// An accent someone picked over a theme gets its text colours the way the theme's own do, so the promise holds wherever
// it can: the theme's ink, or its panel or white, whichever reads best on it. `reads` is false when none reaches the
// target, and Settings says so.
export function accentOver(t: Tokens, target: Target, accent: string) {
  const onAccent = bestInk(accent, [t.ink, t.inkInverse, t.snow]);
  return {
    onAccent,
    accentText: readableShade(accent, [t.panel, t.bg], TEXT[target]),
    reads: contrast(onAccent, accent) >= TEXT[target],
  };
}
