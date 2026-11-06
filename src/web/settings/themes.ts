// The colour themes. Each one sets every token for its mode, and the contrast it promises: AA or AAA.
// tests/themes.ts checks each theme against its promise, and the gaps a theme is still known to have.
import { apart, contrast, type Vision } from '../ui/color.ts';

export type Mode = 'light' | 'dark';
type Target = 'aa' | 'aaa';
type CardColour = { fill: string; ink: string; link: string };
type Tokens = {
  bg: string;
  dot: string;
  panel: string;
  ink: string;
  inkSoft: string;
  accent: string;
  accentText: string;
  onAccent: string;
  focus: string;
  cards: Record<string, CardColour>;
};
type CheckId = 'text' | 'softText' | 'accentText' | 'onAccent' | 'focus' | 'cardText' | 'cardLink' | 'cardsApart';
type Theme = { id: string; name: string; mode: Mode; target: Target; tokens: Tokens; knownGaps: CheckId[] };

// The card colours, keyed as boards store them; core/base.ts reads them from here. Lingonberry, Moss, Fjord and
// Heather were nudged apart (#251) so no two look alike for any kind of colour blindness.
export const PASTELS: Record<string, string> = {
  white: '#ffffff',
  pink: '#ffd7d3',
  butter: '#ffe3bd',
  mint: '#e2eed0',
  lilac: '#ece0ec',
  sky: '#d6e8fb',
  peach: '#f1ebe2',
};
// the same colours dimmed for a dark board, so they don't glare; Snow is a dark card there
const DARK_FILLS: Record<string, string> = {
  white: '#38332d',
  pink: '#e2b0ac',
  butter: '#e0bd8c',
  mint: '#bccba5',
  lilac: '#cabbca',
  sky: '#aec5dc',
  peach: '#cdc6bb',
};
// a link in a note is its own shade of the accent: the accent text is made for the panel and board, and on a pastel
// card it falls under 4.5:1
const cardsOf = (fills: Record<string, string>, ink: string, link: string, own: Record<string, CardColour> = {}) =>
  Object.fromEntries(Object.keys(PASTELS).map(k => [k, own[k] ?? { fill: fills[k] ?? '#ffffff', ink, link }]));

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
      inkSoft: '#796f63',
      accent: '#e88a24',
      accentText: '#b15800',
      onAccent: '#3b342d',
      focus: '#0090f5',
      cards: cardsOf(PASTELS, '#3b342d', '#a24900'),
    },
    knownGaps: [],
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
      accentText: '#e88a24',
      onAccent: '#1d1a16',
      focus: '#0090f5',
      cards: cardsOf(DARK_FILLS, '#3f3a34', '#842e00', { white: { fill: '#38332d', ink: '#f6f2ec', link: '#f9c795' } }),
    },
    knownGaps: [],
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
  const { bg, panel, ink, inkSoft, accent, accentText, onAccent, focus, cards } = t.tokens,
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
    check('accentText', text, [
      ['accent text on panel', contrast(accentText, panel)],
      ['accent text on board', contrast(accentText, bg)],
    ]),
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
    check(
      'cardLink',
      text,
      fills.map(([k, c]) => [`link on ${k}`, contrast(c.link, c.fill)]),
    ),
    check('cardsApart', APART[t.target], pairsApart),
  ];
}
