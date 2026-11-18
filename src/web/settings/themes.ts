// The colour themes. Each one sets every token for its mode, and the contrast it promises: AA or AAA.
// tests/themes.ts checks each theme against its promise, and the gaps a theme is still known to have.
import { apart, contrast, type Vision } from '../ui/color.ts';
import { derive, TEXT } from './derive.ts';

export type Mode = 'light' | 'dark';
export type Target = 'aa' | 'aaa';
type CardColour = { fill: string; ink: string; link: string };
export type Tokens = {
  bg: string;
  dot: string;
  panel: string;
  surface2: string;
  ink: string;
  inkSoft: string;
  inkFaint: string;
  inkInverse: string;
  blush: string;
  accent: string;
  accentSoft: string;
  accentDeep: string;
  accentText: string;
  accentTint: string;
  accentWash: string;
  accentMid: string;
  onAccent: string;
  onPastel: string;
  focus: string;
  danger: string;
  ok: string;
  rec: string;
  snow: string;
  shade: string;
  cards: Record<string, CardColour>;
};
type CheckId = 'text' | 'softText' | 'accentText' | 'onAccent' | 'focus' | 'cardText' | 'cardLink' | 'cardsApart';
export type Theme = { id: string; name: string; mode: Mode; target: Target; tokens: Tokens; knownGaps: CheckId[] };

// The CSS variable each token sets, in the order tools/themes-css.ts writes them. `bg` isn't here: the board's colour is
// set at run time (a board can have its own). The cards' fills and link colour are written as --card-<key>.
export const CSS_VARS: Record<Exclude<keyof Tokens, 'bg' | 'cards'>, string> = {
  ink: '--ink',
  inkSoft: '--ink-soft',
  inkFaint: '--ink-faint',
  inkInverse: '--ink-inverse',
  panel: '--surface',
  surface2: '--surface-2',
  dot: '--dot',
  blush: '--blush',
  accent: '--pink-deep',
  accentSoft: '--accent-soft',
  accentDeep: '--accent-deep',
  accentText: '--accent-text',
  accentTint: '--accent-tint',
  accentWash: '--accent-wash',
  accentMid: '--accent-mid',
  onAccent: '--on-accent',
  onPastel: '--on-pastel',
  focus: '--select',
  danger: '--danger',
  ok: '--ok',
  rec: '--rec',
  snow: '--snow',
  shade: '--shade',
};

// colours that are the same in light and in dark: the amber tints, the status colours, white and black
const SAME = {
  accentSoft: '#f6b45e',
  accentDeep: '#965f23',
  accentTint: '#f9c795',
  accentWash: '#fbdcbc',
  accentMid: '#d9771f',
  danger: '#e0455a',
  ok: '#3fae6a',
  rec: '#ff5a6e',
  snow: '#ffffff',
  shade: '#000000',
  onPastel: '#3f3a34',
};

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
      inkFaint: '#bcb1a3',
      inkInverse: '#ffffff',
      surface2: '#f4f0ed',
      blush: '#fdeedd',
      ...SAME,
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
      inkFaint: '#8f8576',
      inkInverse: '#1d1a16',
      surface2: '#2e2922',
      blush: '#3d2f22',
      ...SAME,
      accent: '#e88a24',
      accentText: '#e88a24',
      onAccent: '#1d1a16',
      focus: '#0090f5',
      cards: cardsOf(DARK_FILLS, '#3f3a34', '#842e00', { white: { fill: '#38332d', ink: '#f6f2ec', link: '#f9c795' } }),
    },
    knownGaps: [],
  },
  // the four themes from #251: a pair for light and a pair for dark, one made for looks and one for accessibility
  {
    id: 'midsummer-light',
    name: 'Midsummer',
    mode: 'light',
    target: 'aa',
    tokens: derive('light', 'aa', {
      bg: '#f1f4ee',
      dot: '#cfd8c8',
      panel: '#ffffff',
      surface2: '#eaf0e5',
      ink: '#24302a',
      inkSoft: '#55645b',
      accent: '#c4502a',
      onAccent: '#ffffff',
      focus: '#2f6fd6',
      cardInk: '#24302a',
      fills: {
        white: '#ffffff',
        butter: '#f6d39d',
        pink: '#f9b5c7',
        mint: '#a6d6a8',
        sky: '#c1e3fd',
        lilac: '#d0c7ef',
        peach: '#ecdfc8',
      },
    }),
    knownGaps: [],
  },
  {
    id: 'clear-light',
    name: 'Clear',
    mode: 'light',
    target: 'aaa',
    tokens: derive('light', 'aaa', {
      bg: '#f3f0e9',
      dot: '#cbc2b4',
      panel: '#fbfaf6',
      surface2: '#ebe7de',
      ink: '#14110e',
      inkSoft: '#3f3831',
      accent: '#8a3d00',
      onAccent: '#ffffff',
      focus: '#0047b3',
      cardInk: '#14110e',
      fills: {
        white: '#ffffff',
        butter: '#fdc563',
        pink: '#c59099',
        mint: '#87b24b',
        sky: '#9cd9f5',
        lilac: '#c3a7d7',
        peach: '#f3dec0',
      },
    }),
    knownGaps: [],
  },
  {
    id: 'polar-night-dark',
    name: 'Polar Night',
    mode: 'dark',
    target: 'aa',
    tokens: derive('dark', 'aa', {
      bg: '#0e1621',
      dot: '#23303e',
      panel: '#16202c',
      surface2: '#1f2c3a',
      ink: '#e6edf3',
      inkSoft: '#a9b6c3',
      accent: '#6fe0c0',
      onAccent: '#0e1621',
      focus: '#8ab4ff',
      cardInk: '#eef2f6',
      fills: {
        white: '#2b3644',
        butter: '#6b4b16',
        pink: '#743f4a',
        mint: '#235448',
        sky: '#13568a',
        lilac: '#5b3f74',
        peach: '#4a4034',
      },
    }),
    knownGaps: [],
  },
  {
    id: 'lantern-dark',
    name: 'Lantern',
    mode: 'dark',
    target: 'aaa',
    tokens: derive('dark', 'aaa', {
      bg: '#141619',
      dot: '#3a3f46',
      panel: '#1e2125',
      surface2: '#2a2e33',
      ink: '#f4f2ee',
      inkSoft: '#cfcac2',
      accent: '#ffb547',
      onAccent: '#141619',
      focus: '#7cc0ff',
      cardInk: '#101214',
      fills: {
        white: '#d9dde2',
        butter: '#f2ce9b',
        pink: '#ed8fb3',
        mint: '#74b76a',
        sky: '#7ec7f9',
        lilac: '#af9ae6',
        peach: '#d2bca4',
      },
    }),
    knownGaps: [],
  },
];

export const themeOf = (mode: Mode, id = 'default') =>
  THEMES.find(t => t.mode === mode && t.id === `${id}-${mode}`) ?? THEMES.find(t => t.mode === mode);

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
