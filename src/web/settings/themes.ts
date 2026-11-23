// The colour themes. Each one sets every token for its mode, and the contrast it promises: AA or AAA.
// tests/themes.ts checks each theme against its promise, and the gaps a theme is still known to have.
import { derive, onStatusOf, quiet, strongBorder } from './derive.ts';
import type { CheckId } from './themeChecks.ts';

export type Mode = 'light' | 'dark';
export type Target = 'aa' | 'aaa';
// deep is the fill's own hue made strong enough to show as a mark on the panel: a kanban column's dot is drawn in it
export type CardColour = { fill: string; ink: string; soft: string; faint: string; link: string; deep: string };
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
  border: string;
  borderStrong: string;
  danger: string;
  warn: string;
  ok: string;
  onStatus: string;
  pen: string;
  rec: string;
  snow: string;
  shade: string;
  cards: Record<string, CardColour>;
};
export type Theme = {
  id: string;
  name: string;
  mode: Mode;
  target: Target;
  tokens: Tokens;
  // what a theme adds for people who can't rely on colour or fill: a 1.5 px outline in the border colour on every card, so its
  // edge doesn't depend on its fill or shadow, and cards that sit straight (a stamp keeps the tilt it was given)
  outline: boolean;
  straight: boolean;
  // what the theme adds for people who can't rely on colour: Clear and Lantern print each note's colour name on it
  labels: boolean;
  // a thicker focus ring on every control and on a selected card, for the themes made to be seen without relying on colour
  ring: boolean;
  knownGaps: CheckId[];
};

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
  border: '--border',
  borderStrong: '--border-strong',
  danger: '--danger',
  warn: '--warn',
  ok: '--ok',
  onStatus: '--on-status',
  pen: '--pen-ink',
  rec: '--rec',
  snow: '--snow',
  shade: '--shade',
};

// the variables a card's colours are written as: its fill and what reads on it. style.css gives each card its own
// through .c-<key>, so a Snow card that is light in one theme and dark in another needs nothing special
export function cardVars(key: string, c: CardColour): [string, string][] {
  const vars: [string, string][] = [
    [`--card-${key}`, c.fill],
    [`--card-${key}-ink`, c.ink],
    [`--card-${key}-soft`, c.soft],
    [`--card-${key}-faint`, c.faint],
    [`--card-${key}-link`, c.link],
  ];
  // a kanban column's dot (Snow has none)
  if (key !== 'white') vars.push([`--k-${key}`, c.deep]);
  return vars;
}

// colours that are the same in light and in dark: the amber tints, the status colours, white and black
const SAME = {
  accentSoft: '#f6b45e',
  accentDeep: '#965f23',
  accentTint: '#f9c795',
  accentWash: '#fbdcbc',
  accentMid: '#d9771f',
  danger: '#e0455a',
  warn: '#e8a317',
  ok: '#3fae6a',
  rec: '#ff5a6e',
  snow: '#ffffff',
  shade: '#000000',
  onPastel: '#3f3a34',
};

// the kanban dots and other deep marks as Default has always drawn them, the same in light and in dark
const DEEP: Record<string, string> = {
  white: '#8f8576',
  pink: '#e8796b',
  butter: '#f0b04a',
  mint: '#7fb86a',
  lilac: '#a98ad6',
  sky: '#6fa3d6',
  peach: '#c9b49a',
};
const STATUS = [SAME.danger, SAME.warn, SAME.ok];

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
// whether a theme prints each note's colour name on it; style.css shows the label when this is not none
export const LABEL_VAR = '--colour-label';
// the focus ring of a theme with `ring`: tools/themes-css.ts writes it, and tests/focusRing.ts holds every control to it
export const RING = { width: '3px', offset: '2px' };
// the class on <body> that turns that ring off: Settings, Appearance, Accessibility, Thicker focus ring
export const RING_OFF = 'no-thick-focus';
// and the one that lets a tilted card show its tilt in a theme that sits its cards straight
export const STRAIGHT_OFF = 'no-straight';

export const CARD_VAR_NAMES = Object.keys(PASTELS).flatMap(k =>
  cardVars(k, { fill: '', ink: '', soft: '', faint: '', link: '', deep: '' }).map(([name]) => name),
);

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
  Object.fromEntries(
    Object.keys(PASTELS).map(k => {
      const fill = fills[k] ?? '#ffffff';
      return [k, own[k] ?? { fill, ink, link, ...quiet(ink, fill), deep: DEEP[k] ?? fill }];
    }),
  );

export const THEMES: Theme[] = [
  {
    id: 'default-light',
    name: 'Default',
    mode: 'light',
    outline: false,
    straight: false,
    target: 'aa',
    ring: false,
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
      border: '#e4dccf',
      borderStrong: strongBorder('#e4dccf', '#3b342d', '#ffffff', 'aa'),
      onStatus: onStatusOf('#3b342d', '#ffffff', STATUS),
      pen: '#3b342d',
      cards: cardsOf(PASTELS, '#3b342d', '#a24900'),
    },
    labels: false,
    knownGaps: ['status', 'onStatus', 'deep'],
  },
  {
    id: 'default-dark',
    name: 'Default',
    mode: 'dark',
    outline: false,
    straight: false,
    target: 'aa',
    ring: false,
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
      border: '#332d25',
      borderStrong: strongBorder('#332d25', '#f6f2ec', '#242019', 'aa'),
      onStatus: onStatusOf('#f6f2ec', '#242019', STATUS),
      pen: '#f0ebe4',
      cards: cardsOf(DARK_FILLS, '#3f3a34', '#842e00', {
        white: {
          fill: '#38332d',
          ink: '#f6f2ec',
          soft: '#c6bcae',
          faint: '#8f8576',
          link: '#f9c795',
          deep: DEEP.white ?? '',
        },
      }),
    },
    labels: false,
    knownGaps: ['status', 'onStatus'],
  },
  // the four themes from #251: a pair for light and a pair for dark, one made for looks and one for accessibility
  {
    id: 'midsummer-light',
    name: 'Midsummer',
    mode: 'light',
    outline: false,
    straight: false,
    target: 'aa',
    ring: false,
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
      border: '#d6ddd0',
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
    labels: false,
    knownGaps: [],
  },
  {
    id: 'clear-light',
    name: 'Clear',
    mode: 'light',
    outline: true,
    straight: true,
    target: 'aaa',
    ring: true,
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
      border: '#6e655a',
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
    labels: true,
    knownGaps: [],
  },
  {
    id: 'polar-night-dark',
    name: 'Polar Night',
    mode: 'dark',
    outline: false,
    straight: false,
    target: 'aa',
    ring: false,
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
      border: '#2c3a4a',
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
    labels: false,
    knownGaps: [],
  },
  {
    id: 'lantern-dark',
    name: 'Lantern',
    mode: 'dark',
    outline: true,
    straight: true,
    target: 'aaa',
    ring: true,
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
      border: '#8d939b',
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
    labels: true,
    knownGaps: [],
  },
];

// "midsummer" for midsummer-light: the name a setting stores and the class on <body> is built from
export const themeName = (t: Theme) => t.id.replace(/-(light|dark)$/, '');
export const themeClass = (t: Theme) => (themeName(t) === 'default' ? '' : `theme-${themeName(t)}`);

export const themeOf = (mode: Mode, id = 'default') =>
  THEMES.find(t => t.mode === mode && t.id === `${id}-${mode}`) ?? THEMES.find(t => t.mode === mode);
