import { isRecord } from '../../shared/model.ts';
import { B, FIELD_LABEL, IC, type Piece, PH, T, numOf, str } from './pieceKit.ts';
import { MORE } from './pieceMore.ts';
import { WEB } from './pieceWeb.ts';

const CONTROLS: Record<string, Piece> = {
  'Nav bar': {
    icon: 'browser',
    bar: 'top',
    make: (W, o) => [
      B(0, 0, W, 56, { fill: '#fafafa', stroke: '#e4e4e7', sw: 1 }),
      ...(o.back === false ? [] : [IC(14, 16, 'arrow-left')]),
      T(56, 18, W - 112, str(o.title, str(o.text, 'Title')), { size: 17, weight: 700, align: 'center' }),
      IC(W - 38, 16, str(o.icon, 'more-vertical')),
    ],
  },
  'Tab bar': {
    icon: 'browsers',
    bar: 'bottom',
    make: (W, o) => {
      const items = (
          Array.isArray(o.tabs)
            ? o.tabs
            : [
                ['home', 'Home'],
                ['search', 'Search'],
                ['heart', 'Saved'],
                ['user', 'Profile'],
              ]
        )
          .slice(0, 5)
          .map((t): [string, string] =>
            Array.isArray(t)
              ? [str(t[0]), str(t[1])]
              : isRecord(t)
                ? [str(t.icon, 'circle'), str(t.label, str(t.text))]
                : ['circle', ''],
          ),
        cw = W / items.length;
      return [
        B(0, 0, W, 64, { fill: '#fafafa', stroke: '#e4e4e7', sw: 1 }),
        ...items.flatMap(([n, l], i) => [
          IC(i * cw + cw / 2 - 12, 10, n, 24, { color: i === (o.active ?? 0) ? '#18181b' : '#71717a' }),
          T(i * cw, 38, cw, l, { size: 11, align: 'center', color: i === (o.active ?? 0) ? '#18181b' : '#71717a' }),
        ]),
      ];
    },
  },
  Button: {
    icon: 'cursor-click',
    w: 160,
    make: (W, o) => {
      const sec = o.style === 'secondary' || o.style === 'outline';
      return [
        B(0, 0, W, 48, {
          fill: sec ? '#ffffff' : '#27272a',
          stroke: sec ? '#27272a' : undefined,
          sw: sec ? 1.5 : 0,
          radius: 12,
        }),
        T(0, 14, W, str(o.text, 'Button'), {
          size: 15,
          weight: 600,
          color: sec ? '#27272a' : '#ffffff',
          align: 'center',
        }),
      ];
    },
  },
  Input: {
    icon: 'input',
    w: 300,
    make: (W, o) => {
      const top = o.label ? 22 : 0;
      return [
        ...FIELD_LABEL(o, W),
        B(0, top, W, 48, { fill: '#ffffff', stroke: '#d4d4d8', sw: 1.5, radius: 10 }),
        T(14, top + 14, W - 28, str(o.text, 'Placeholder'), { color: '#a1a1aa' }),
      ];
    },
  },
  Search: {
    icon: 'search',
    w: 300,
    make: (W, o) => [
      B(0, 0, W, 44, { fill: '#f4f4f5', radius: 22 }),
      IC(14, 10, 'search', 24, { color: '#71717a' }),
      T(46, 12, W - 60, str(o.text, 'Search'), { color: '#a1a1aa' }),
    ],
  },
  Card: {
    icon: 'rectangle',
    w: 300,
    make: (W, o) => [
      B(0, 0, W, 236, { fill: '#ffffff', stroke: '#e4e4e7', sw: 1, radius: 14 }),
      B(10, 10, W - 20, 130, { radius: 10 }),
      IC(W / 2 - 12, 63, str(o.icon, 'image'), 24, { color: '#a1a1aa' }),
      T(16, 154, W - 32, str(o.title, 'Card title'), { size: 17, weight: 700 }),
      T(16, 182, W - 32, str(o.text, 'A short line about this card.'), { size: 13, color: '#71717a' }),
    ],
  },
  'List row': {
    icon: 'list',
    bar: 'row',
    make: (W, o) => [
      B(0, 0, W, 68, { fill: '#ffffff' }),
      o.icon ? IC(24, 22, str(o.icon), 24, { color: '#52525b' }) : B(16, 14, 40, 40, { radius: 20 }),
      T(68, 15, W - 120, str(o.title, str(o.text, 'Row title')), { weight: 600 }),
      T(68, 36, W - 120, typeof o.sub === 'string' ? o.sub : 'Supporting text', { size: 13, color: '#71717a' }),
      IC(W - 36, 22, 'caret-right', 24, { color: '#a1a1aa' }),
      B(68, 67, W - 68, 1, { fill: '#e4e4e7' }),
    ],
  },
  Toggle: {
    icon: 'toggle',
    w: 52,
    make: (W, o) =>
      o.text
        ? [
            T(0, 6, W - 70, str(o.text)),
            B(W - 52, 0, 52, 30, { fill: o.on === false ? '#d4d4d8' : '#27272a', radius: 15 }),
            B(o.on === false ? W - 49 : W - 27, 3, 24, 24, { fill: '#ffffff', radius: 12 }),
          ]
        : [B(0, 0, 52, 30, { fill: '#27272a', radius: 15 }), B(25, 3, 24, 24, { fill: '#ffffff', radius: 12 })],
  },
  Checkbox: {
    icon: 'task',
    w: 240,
    make: (W, o) => [
      B(0, 0, 22, 22, { fill: o.on === false ? '#ffffff' : '#27272a', stroke: '#27272a', sw: 1.5, radius: 6 }),
      ...(o.on === false ? [] : [IC(1, 1, 'check', 20, { color: '#ffffff' })]),
      T(32, 2, W - 32, str(o.text, 'Remember me')),
    ],
  },
  Avatar: {
    icon: 'user-circle',
    w: 56,
    make: (_W, o) => {
      const s = numOf(o.size, 56);
      return [B(0, 0, s, s, { radius: s / 2 }), IC(s / 4, s / 4, 'user', s / 2, { color: '#a1a1aa' })];
    },
  },
  Image: {
    icon: 'image',
    w: 300,
    make: (W, o) => {
      const h = numOf(o.h, 180);
      return o.img
        ? [PH(0, 0, W, h, str(o.img), { radius: 12 })]
        : [B(0, 0, W, h, { radius: 12 }), IC(W / 2 - 16, h / 2 - 16, str(o.icon, 'image'), 32, { color: '#a1a1aa' })];
    },
  },
  Heading: {
    icon: 'title',
    w: 300,
    make: (W, o) => [
      T(0, 0, W, str(o.text, str(o.title, 'Heading')), {
        size: numOf(o.size, 28),
        weight: 800,
        align: str(o.align, 'left'),
      }),
      ...(o.sub === ''
        ? []
        : [
            T(0, numOf(o.size, 28) * 1.3 + 6, W, str(o.sub, 'A little line underneath it.'), {
              size: 15,
              color: '#71717a',
              align: str(o.align, 'left'),
            }),
          ]),
    ],
  },
};

// every element the panel offers and Myra can ask for by name
export const PIECES: Record<string, Piece> = { ...CONTROLS, ...MORE, ...WEB };
