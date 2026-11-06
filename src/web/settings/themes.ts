// The colour themes. Each one sets every token for its mode, and the contrast it promises: AA or AAA.
// tests/themes.ts checks each theme against its promise, and the gaps a theme is still known to have.
import { apart, contrast, type Vision } from '../ui/color.ts';

export type Mode = 'light' | 'dark';
type Target = 'aa' | 'aaa';
type CardColour = { fill: string; ink: string };
type Tokens = {
  bg: string;
  dot: string;
  panel: string;
  ink: string;
  inkSoft: string;
  accent: string;
  onAccent: string;
  focus: string;
  cards: Record<string, CardColour>;
};
type CheckId = 'text' | 'softText' | 'accentText' | 'onAccent' | 'focus' | 'cardText' | 'cardsApart';
type Theme = { id: string; name: string; mode: Mode; target: Target; tokens: Tokens; knownGaps: CheckId[] };

// the card colours as they look today, keyed as boards store them; core/base.ts reads them from here
export const PASTELS: Record<string, string> = {
  white: '#ffffff',
  pink: '#ffdcd8',
  butter: '#ffe3bd',
  mint: '#e0edd3',
  lilac: '#ebe1f2',
  sky: '#d9e7f3',
  peach: '#f1ebe2',
};
const cardsOf = (fills: Record<string, string>, ink: string, own: Record<string, CardColour> = {}) =>
  Object.fromEntries(Object.keys(PASTELS).map(k => [k, own[k] ?? { fill: fills[k] ?? '#ffffff', ink }]));

// Today's look, before #251 fixes it. Its known gaps are what the colour test records rather than fails.
export const THEMES: Theme[] = [
  {
    id: 'default-light',
    name: 'Default',
    mode: 'light',
    target: 'aa',
    tokens: {
      bg: '#faf7f2',
      dot: '#e4dccf',
      panel: '#ffffff',
      ink: '#3b342d',
      inkSoft: '#8a7f73',
      accent: '#e88a24',
      onAccent: '#ffffff',
      focus: '#0d99ff',
      cards: cardsOf(PASTELS, '#3b342d'),
    },
    knownGaps: ['softText', 'accentText', 'onAccent', 'focus', 'cardsApart'],
  },
  {
    id: 'default-dark',
    name: 'Default',
    mode: 'dark',
    target: 'aa',
    tokens: {
      bg: '#12100d',
      dot: '#332d25',
      panel: '#242019',
      ink: '#f6f2ec',
      inkSoft: '#c6bcae',
      accent: '#e88a24',
      onAccent: '#ffffff',
      focus: '#0d99ff',
      cards: cardsOf(PASTELS, '#3f3a34', { white: { fill: '#38332d', ink: '#f6f2ec' } }),
    },
    knownGaps: ['onAccent', 'cardsApart'],
  },
];

export const themeOf = (mode: Mode, id = 'default') =>
  THEMES.find(t => t.mode === mode && t.id === `${id}-${mode}`) ?? THEMES.find(t => t.mode === mode);

const TEXT: Record<Target, number> = { aa: 4.5, aaa: 7 };
const NON_TEXT: Record<Target, number> = { aa: 3, aaa: 4.5 };
// below about 0.02 two colours look the same; the accessible themes keep three times that
const APART: Record<Target, number> = { aa: 0.02, aaa: 0.06 };
const VISIONS: Vision[] = ['typical', 'protan', 'deutan', 'tritan'];

type Check = { id: CheckId; got: number; need: number; worst: string };

// every promise a theme makes, with the weakest pair it found
export function checksOf(t: Theme): Check[] {
  const { bg, panel, ink, inkSoft, accent, onAccent, focus, cards } = t.tokens,
    text = TEXT[t.target],
    weakest = (pairs: [string, number][]) => pairs.reduce((a, b) => (b[1] < a[1] ? b : a)),
    check = (id: CheckId, need: number, pairs: [string, number][]): Check => {
      const [worst, got] = weakest(pairs);
      return { id, got: Math.round(got * 1000) / 1000, need, worst };
    },
    fills = Object.entries(cards),
    pairsApart = VISIONS.flatMap(v =>
      fills.flatMap(([a, ca], i) =>
        fills.slice(i + 1).map(([b, cb]): [string, number] => [`${a}/${b} ${v}`, apart(ca.fill, cb.fill, v)]),
      ),
    );
  return [
    check('text', text, [
      ['ink on panel', contrast(ink, panel)],
      ['ink on board', contrast(ink, bg)],
    ]),
    check('softText', text, [
      ['quiet text on panel', contrast(inkSoft, panel)],
      ['quiet text on board', contrast(inkSoft, bg)],
    ]),
    check('accentText', text, [['accent on panel', contrast(accent, panel)]]),
    check('onAccent', text, [['text on accent', contrast(onAccent, accent)]]),
    check('focus', NON_TEXT[t.target], [
      ['focus on board', contrast(focus, bg)],
      ['focus on panel', contrast(focus, panel)],
    ]),
    check(
      'cardText',
      text,
      fills.map(([k, c]) => [`text on ${k}`, contrast(c.ink, c.fill)]),
    ),
    check('cardsApart', APART[t.target], pairsApart),
  ];
}
