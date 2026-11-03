import { type Card, isRecord } from '../../shared/model.ts';
import { renderCard } from '../canvas/render.ts';
import { uid } from '../core/base.ts';
import { card } from '../model/boards.ts';
import { IC, type Opts, type PieceItem, T, numOf, str } from './pieceKit.ts';
import { PIECES } from './pieces.ts';
import { WEB } from './pieceWeb.ts';
import { useFont } from './tilt.ts';
import { DEVICES } from './wireframes.ts';
import { session } from '../core/state.ts';

const IPHONE: [number, number, number] = [393, 852, 44];
// one entry in a screen's list: the piece's name and its options, with its numbers read
type Item = Opts & { w?: number; h?: number; size?: number; count?: number };

// a screen's look: colors and fonts swapped onto the gray pieces
const GRAY = {
  text: '#27272a',
  ink: '#18181b',
  muted: '#71717a',
  soft: '#52525b',
  surface: '#f4f4f5',
  bar: '#fafafa',
  line: '#e4e4e7',
};

// a screen's own colours and fonts, as Myra gives them; only words are kept
type Theme = Record<string, string>;
const readTheme = (x: unknown): Theme | null =>
  isRecord(x)
    ? Object.fromEntries(Object.entries(x).filter((e): e is [string, string] => typeof e[1] === 'string'))
    : null;

function themeIt(list: PieceItem[], th: Theme | null) {
  if (!th) return list;
  const t = {
    bg: '#ffffff',
    text: '#18181b',
    muted: '#71717a',
    primary: '#18181b',
    onPrimary: '#ffffff',
    surface: '#f4f4f5',
    font: 'Figtree',
    headFont: '',
    ...th,
  };
  useFont(t.font);
  if (t.headFont) useFont(t.headFont);
  return list.map(it => {
    const c = { ...it };
    if (c.type === 'text') {
      c.font = (c.weight ?? 0) >= 700 && t.headFont ? t.headFont : t.font;
      if (c.color === GRAY.text || c.color === GRAY.ink) c.color = t.text;
      else if (c.color === GRAY.muted || c.color === GRAY.soft) c.color = t.muted;
      else if (c.color === '#ffffff' && th.onPrimary) c.color = t.onPrimary;
    }
    if (c.type === 'box' && !c.img) {
      if (c.fill === '#18181b' || c.fill === '#27272a') c.fill = t.primary;
      else if (c.fill === '#ffffff') c.fill = t.bg;
      else if (c.fill === GRAY.surface || c.fill === GRAY.bar) c.fill = t.surface;
      if (c.stroke === '#18181b' || c.stroke === '#27272a') c.stroke = t.primary;
    }
    if (c.type === 'icon' && (c.color === GRAY.text || c.color === '#3f3f46')) c.color = t.text;
    return c;
  });
}

// elements only Myra asks for by name (they are the panel's Text and Icon tools)
const EXTRA: Record<string, (W: number, o: Opts) => PieceItem[]> = {
  Text: (W, o) => [
    T(0, 0, W, str(o.text), {
      size: numOf(o.size, 15),
      weight: numOf(o.weight, 500),
      align: str(o.align, 'left'),
      color: str(o.color, '#3f3f46'),
    }),
  ],
  Icon: (W, o) => {
    const s = numOf(o.size, 32);
    return [
      IC(o.align === 'center' ? W / 2 - s / 2 : 0, 0, str(o.name, str(o.icon, 'star')), s, {
        color: str(o.color, '#27272a'),
      }),
    ];
  },
};

const pieceH = (items: PieceItem[], o: Opts) =>
  Math.max(o.h && !items.length ? numOf(o.h, 0) : 0, ...items.map(i => i.y + i.h));

// a number Myra wrote as a number or as digits; anything else counts as not given
const num = (v: unknown) => {
  const n = typeof v === 'number' || typeof v === 'string' ? +v : NaN;
  return Number.isFinite(n) && v !== '' ? n : undefined;
};

// a whole screen from a list of pieces, top to bottom: bars hug the edges, the rest stacks with even gaps
export function buildScreen(raw: unknown, x: number, y: number) {
  const spec = isRecord(raw) ? raw : {},
    items = (Array.isArray(spec.items) ? spec.items : []).filter(isRecord).map(
      (it): Item => ({
        ...it,
        w: num(it.w),
        h: num(it.h),
        size: num(it.size),
        count: num(it.count),
      }),
    ),
    device = str(spec.device),
    theme = readTheme(spec.theme),
    named = DEVICES[device],
    dev = named ?? IPHONE,
    W = num(spec.w) || dev[0],
    phone = !device || /iPhone|Android/.test(device),
    webFirst = items.some(it => /^(header|hero|features|footer)$/i.test(str(it.piece)));
  const f = card('frame', {
    x,
    y,
    w: W,
    h: num(spec.h) || (webFirst && device === 'Desktop' ? 600 : dev[1]),
    r: 0,
    name: str(spec.name, 'Screen'),
    device: named ? device : 'iPhone',
    radius: webFirst ? 12 : dev[2],
    fill: '#ffffff',
  });
  session.board.cards.push(f);
  renderCard(f, true);
  const M = device === 'Desktop' ? 64 : 24,
    CW = W - M * 2,
    GAP = num(spec.gap) || 16,
    made: Card[] = [f];
  let top = y + (phone ? 44 : 0),
    bottom = y + f.h;
  const put = (list: PieceItem[], ox: number, oy: number) => {
    const g = uid();
    list.forEach(it => {
      const c = card(it.type, {
        ...it,
        x: ox + it.x,
        y: oy + it.y,
        r: 0,
        group: list.length > 1 ? g : undefined,
        onFrame: f.id,
      });
      session.board.cards.push(c);
      renderCard(c, true);
      made.push(c);
    });
  };
  const nav = items.find(it => /^nav ?(bar)?$/i.test(str(it.piece).trim())),
    tab = items.find(it => /^tab ?bar$/i.test(str(it.piece).trim())); // exact names: Tabs and Table are their own elements
  if (nav) {
    put(themeIt(PIECES['Nav bar']?.make(W, nav) ?? [], theme), x, top);
    top += 56;
  }
  let tabMade: Card[] = []; // the tab bar's cards: the only things that move down when a long screen grows
  if (tab) {
    const l = themeIt(PIECES['Tab bar']?.make(W, tab) ?? [], theme);
    bottom -= 64 + (phone ? 20 : 0);
    const n0 = made.length;
    put(l, x, bottom);
    tabMade = made.slice(n0);
  }
  const isWeb = items.some(it => Object.keys(WEB).some(k => k.toLowerCase() === str(it.piece).toLowerCase()));
  if (theme?.bg) {
    f.fill = theme.bg;
    renderCard(f);
  }
  let cur = top + (num(spec.padTop) ?? (isWeb ? 0 : 20));
  items
    .filter(it => it !== nav && it !== tab)
    .forEach(it => {
      const piece = str(it.piece).toLowerCase(),
        name =
          Object.keys(PIECES).find(k => k.toLowerCase() === piece) ||
          Object.keys(EXTRA).find(k => k.toLowerCase() === piece) ||
          'Text';
      const P = PIECES[name],
        full = name === 'List row' || !!P?.web,
        w = full ? W : ['Avatar', 'Toggle'].includes(name) && !it.text ? (P?.w ?? CW) : it.w || CW,
        rows = Array.isArray(it.rows) ? it.rows : null;
      const reps = Math.max(1, Math.min(8, it.count || (rows ? rows.length : 1)));
      for (let k = 0; k < reps; k++) {
        const row = rows?.[k],
          o = isRecord(row) ? { ...it, ...row } : it,
          list = P ? P.make(w, o) : (EXTRA[name]?.(w, o) ?? []),
          h = pieceH(list, o);
        const ox = full ? x : it.align === 'center' && w < CW ? x + (W - w) / 2 : x + M;
        put(themeIt(list, theme), ox, cur);
        cur += h + (full ? 0 : GAP);
      }
    });
  if (webFirst && !tab) {
    f.h = Math.max(200, cur - y);
    renderCard(f);
  } else if (cur > bottom - 12) {
    const grow = cur - bottom + 24;
    f.h += grow;
    renderCard(f);
    tabMade.forEach(c => {
      c.y += grow;
      renderCard(c);
    });
  }
  if (spec.note) {
    const n = card('note', {
      x,
      y: y + f.h + 28,
      w: W,
      h: 120,
      text: str(spec.note),
      name: str(spec.name),
      color: 'butter',
      r: 0,
    });
    session.board.cards.push(n);
    renderCard(n, true);
    made.push(n);
  }
  return { f, made };
}
