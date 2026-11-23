// Every promise a colour theme makes, with the weakest pair that tests it: text, focus, borders, status colours, card text
// and the kanban marks at the theme's target, and card colours that stay apart for every kind of colour blindness.
// tests/themes.ts runs them; a gap a theme is known to have is named in its knownGaps.
import { apart, contrast, type Vision } from '../ui/color.ts';
import { APART, NON_TEXT, TEXT } from './derive.ts';
import type { Theme } from './themes.ts';

export type CheckId =
  | 'text'
  | 'softText'
  | 'accentText'
  | 'onAccent'
  | 'focus'
  | 'borderStrong'
  | 'status'
  | 'onStatus'
  | 'cardText'
  | 'cardLink'
  | 'deep'
  | 'cardsApart';

const VISIONS: Vision[] = ['typical', 'protan', 'deutan', 'tritan'];

export type Check = { id: CheckId; got: number; need: number; worst: string };

// every promise a theme makes, with the weakest pair it found
export function checksOf(t: Theme): Check[] {
  const {
      bg,
      panel,
      ink,
      inkSoft,
      accent,
      accentText,
      onAccent,
      focus,
      borderStrong,
      danger,
      warn,
      ok,
      onStatus,
      cards,
    } = t.tokens,
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
    check('borderStrong', NON_TEXT[t.target], [['strong border on panel', contrast(borderStrong, panel)]]),
    check(
      'status',
      text,
      Object.entries({ danger, warn, ok }).flatMap(([k, c]): [string, number][] => [
        [`${k} on panel`, contrast(c, panel)],
        [`${k} on board`, contrast(c, bg)],
      ]),
    ),
    check(
      'onStatus',
      text,
      Object.entries({ danger, warn, ok }).map(([k, c]): [string, number] => [`text on ${k}`, contrast(onStatus, c)]),
    ),
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
    check(
      'deep',
      3,
      fills.map(([k, c]) => [`${k} deep on panel`, contrast(c.deep, panel)]),
    ),
    check('cardsApart', APART[t.target], pairsApart),
  ];
}
