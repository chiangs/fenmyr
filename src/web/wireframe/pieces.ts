// @ts-nocheck
import { cardEl, esc } from '../ui/dom.ts';
import { toWorld } from '../canvas/handles.ts';
import { renderCard } from '../canvas/render.ts';
import { applyView } from '../canvas/view.ts';
import { byId, renderWires, selectOnly } from '../canvas/wires.ts';
import { hasAll, queryWords, uid } from '../core/base.ts';
import { $, cardsEl, stage } from '../core/dom.ts';
import { remember, save } from '../core/history.ts';
import { card } from '../model/boards.ts';
import { LY, layersSoon } from '../panels/layers.ts';
import { centerWorld } from '../panels/zoomMenu.ts';
import { selCards } from '../selbar/selbar.ts';
import { chirp } from '../settings/licenses.ts';
import { placeAt, placing, startPlacing, stopPlacing } from '../tools/place.ts';
import { fileIntoFrame, onFrame, useFont } from './tilt.ts';
import { DEVICES, FONTS, WF } from './wireframes.ts';
import { session } from '../core/state.ts';

// ---------- stacking: bring to front / forward, send backward / to back. Later in board.cards = higher on the board, and Layers lists it top-first ----------
// groups move as one, a frame brings everything on it along, and a card on a frame never goes behind its frame
export function restack(where) {
  const cs = selCards();
  if (!cs.length || !session.board) return;
  // sections always sit behind cards, so they stack among themselves; a screen stacks like a card and brings its pieces along
  const box = c => c.type === 'section',
    boxes = cs.every(box),
    peer = c => !boxes || box(c);
  // a whole group you selected moves as one (all its pieces are selected); a piece picked out of a group moves on its own
  const ids = new Set();
  cs.forEach(c => {
    ids.add(c.id);
    if (c.type === 'frame' && !boxes) onFrame(c).forEach(k => ids.add(k.id));
  });
  const all = session.board.cards,
    moving = all.filter(c => ids.has(c.id)),
    rest = all.filter(c => !ids.has(c.id)),
    idx = all.map((c, i) => (ids.has(c.id) ? i : -1)).filter(i => i >= 0);
  const seen = c => !ids.has(c.id) && !c.hidden && peer(c);
  let at;
  if (where === 'front') at = boxes ? rest.reduce((n, c, i) => (box(c) ? i + 1 : n), 0) : rest.length;
  else if (where === 'back') at = 0;
  else if (where === 'forward') {
    const i = all.findIndex((c, k) => k > Math.max(...idx) && seen(c));
    if (i < 0) return;
    at = rest.indexOf(all[i]) + 1;
  } else {
    let i = -1;
    for (let k = Math.min(...idx) - 1; k >= 0; k--)
      if (seen(all[k])) {
        i = k;
        break;
      }
    if (i < 0) return;
    at = rest.indexOf(all[i]);
  }
  moving.forEach(c => {
    const f = c.onFrame && !ids.has(c.onFrame) && rest.findIndex(x => x.id === c.onFrame);
    if (f >= 0 && f !== false) at = Math.max(at, f + 1);
  });
  const next = [...rest];
  next.splice(at, 0, ...moving);
  if (next.every((c, i) => c === all[i]))
    return chirp(where === 'front' || where === 'forward' ? 'Already on top ✦' : 'Already at the back ✦', 1600);
  remember();
  session.board.cards = next;
  // move only the restacked cards on the page, so a playing Spotify or video elsewhere keeps going
  const after = next
    .slice(next.indexOf(moving[moving.length - 1]) + 1)
    .map(c => cardEl(c.id))
    .find(el => el && !el.classList.contains('coll'));
  moving.forEach(c => {
    const el = cardEl(c.id);
    if (el) cardsEl.insertBefore(el, after || null);
  });
  renderWires();
  save();
  LY.reveal = true;
  layersSoon();
}

export function groupSel(on) {
  const cs = selCards();
  if (on && cs.length < 2) return;
  const g = on ? uid() : null;
  cs.forEach(c => {
    if (g) c.group = g;
    else delete c.group;
    renderCard(c);
  });
  selectOnly(cs.map(c => c.id));
  $('selbar').dataset.key = '';
  save();
}

// ready-made pieces, in clean gray; bars stretch to the screen they land on
const T = (x, y, w, text, o = {}) => {
  const sz = o.size || 15,
    perLine = Math.max(4, Math.floor(w / (sz * 0.52))),
    lines = Math.max(
      1,
      ...String(text || '')
        .split('\n')
        .map(l => Math.ceil(Math.max(1, l.length) / perLine)),
    );
  return {
    type: 'text',
    x,
    y,
    w,
    h: Math.round(sz * (o.lh || 1.3) * lines),
    text,
    size: 15,
    weight: 500,
    color: '#27272a',
    font: 'Figtree',
    ...o,
  };
};

const B = (x, y, w, h, o = {}) => ({ type: 'box', x, y, w, h, fill: '#e4e4e7', radius: 0, ...o });

const IC = (x, y, name, s = 24, o = {}) => ({ type: 'icon', x, y, w: s, h: s, name, color: '#3f3f46', ...o });

// each piece can take its own words: (width, { title, text, sub, label, tabs, h, align, style… })
export const PIECES = {
  'Nav bar': {
    icon: 'browser',
    bar: 'top',
    make: (W, o = {}) => [
      B(0, 0, W, 56, { fill: '#fafafa', stroke: '#e4e4e7', sw: 1 }),
      ...(o.back === false ? [] : [IC(14, 16, 'arrow-left')]),
      T(56, 18, W - 112, o.title || o.text || 'Title', { size: 17, weight: 700, align: 'center' }),
      IC(W - 38, 16, o.icon || 'more-vertical'),
    ],
  },
  'Tab bar': {
    icon: 'browsers',
    bar: 'bottom',
    make: (W, o = {}) => {
      const items = (
          o.tabs || [
            ['home', 'Home'],
            ['search', 'Search'],
            ['heart', 'Saved'],
            ['user', 'Profile'],
          ]
        )
          .slice(0, 5)
          .map(t => (Array.isArray(t) ? t : [t.icon || 'circle', t.label || t.text || ''])),
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
    make: (W, o = {}) => {
      const sec = o.style === 'secondary' || o.style === 'outline';
      return [
        B(0, 0, W, 48, {
          fill: sec ? '#ffffff' : '#27272a',
          stroke: sec ? '#27272a' : undefined,
          sw: sec ? 1.5 : 0,
          radius: 12,
        }),
        T(0, 14, W, o.text || 'Button', { size: 15, weight: 600, color: sec ? '#27272a' : '#ffffff', align: 'center' }),
      ];
    },
  },
  Input: {
    icon: 'input',
    w: 300,
    make: (W, o = {}) => {
      const top = o.label ? 22 : 0;
      return [
        ...(o.label ? [T(0, 0, W, o.label, { size: 13, weight: 600, color: '#3f3f46' })] : []),
        B(0, top, W, 48, { fill: '#ffffff', stroke: '#d4d4d8', sw: 1.5, radius: 10 }),
        T(14, top + 14, W - 28, o.text || 'Placeholder', { color: '#a1a1aa' }),
      ];
    },
  },
  Search: {
    icon: 'search',
    w: 300,
    make: (W, o = {}) => [
      B(0, 0, W, 44, { fill: '#f4f4f5', radius: 22 }),
      IC(14, 10, 'search', 24, { color: '#71717a' }),
      T(46, 12, W - 60, o.text || 'Search', { color: '#a1a1aa' }),
    ],
  },
  Card: {
    icon: 'rectangle',
    w: 300,
    make: (W, o = {}) => [
      B(0, 0, W, 236, { fill: '#ffffff', stroke: '#e4e4e7', sw: 1, radius: 14 }),
      B(10, 10, W - 20, 130, { radius: 10 }),
      IC(W / 2 - 12, 63, o.icon || 'image', 24, { color: '#a1a1aa' }),
      T(16, 154, W - 32, o.title || 'Card title', { size: 17, weight: 700 }),
      T(16, 182, W - 32, o.text || 'A short line about this card.', { size: 13, color: '#71717a' }),
    ],
  },
  'List row': {
    icon: 'list',
    bar: 'row',
    make: (W, o = {}) => [
      B(0, 0, W, 68, { fill: '#ffffff' }),
      o.icon ? IC(24, 22, o.icon, 24, { color: '#52525b' }) : B(16, 14, 40, 40, { radius: 20 }),
      T(68, 15, W - 120, o.title || o.text || 'Row title', { weight: 600 }),
      T(68, 36, W - 120, o.sub ?? 'Supporting text', { size: 13, color: '#71717a' }),
      IC(W - 36, 22, 'caret-right', 24, { color: '#a1a1aa' }),
      B(68, 67, W - 68, 1, { fill: '#e4e4e7' }),
    ],
  },
  Toggle: {
    icon: 'toggle',
    w: 52,
    make: (W, o = {}) =>
      o.text
        ? [
            T(0, 6, W - 70, o.text),
            B(W - 52, 0, 52, 30, { fill: o.on === false ? '#d4d4d8' : '#27272a', radius: 15 }),
            B(o.on === false ? W - 49 : W - 27, 3, 24, 24, { fill: '#ffffff', radius: 12 }),
          ]
        : [B(0, 0, 52, 30, { fill: '#27272a', radius: 15 }), B(25, 3, 24, 24, { fill: '#ffffff', radius: 12 })],
  },
  Checkbox: {
    icon: 'task',
    w: 240,
    make: (W, o = {}) => [
      B(0, 0, 22, 22, { fill: o.on === false ? '#ffffff' : '#27272a', stroke: '#27272a', sw: 1.5, radius: 6 }),
      ...(o.on === false ? [] : [IC(1, 1, 'check', 20, { color: '#ffffff' })]),
      T(32, 2, W - 32, o.text || 'Remember me'),
    ],
  },
  Avatar: {
    icon: 'user-circle',
    w: 56,
    make: (W, o = {}) => {
      const s = o.size || 56;
      return [B(0, 0, s, s, { radius: s / 2 }), IC(s / 4, s / 4, 'user', s / 2, { color: '#a1a1aa' })];
    },
  },
  Image: {
    icon: 'image',
    w: 300,
    make: (W, o = {}) => {
      const h = o.h || 180;
      return o.img
        ? [PH(0, 0, W, h, o.img, { radius: 12 })]
        : [B(0, 0, W, h, { radius: 12 }), IC(W / 2 - 16, h / 2 - 16, o.icon || 'image', 32, { color: '#a1a1aa' })];
    },
  },
  Heading: {
    icon: 'title',
    w: 300,
    make: (W, o = {}) => [
      T(0, 0, W, o.text || o.title || 'Heading', { size: o.size || 28, weight: 800, align: o.align || 'left' }),
      ...(o.sub === ''
        ? []
        : [
            T(0, (o.size || 28) * 1.3 + 6, W, o.sub || 'A little line underneath it.', {
              size: 15,
              color: '#71717a',
              align: o.align || 'left',
            }),
          ]),
    ],
  },
};

const PH = (x, y, w, h, label, o = {}) => ({ ...B(x, y, w, h, { radius: 16, ...o }), img: label || 'Image' });

// more elements: media, form fields, tabs, a table, an accordion and a dialog (a person can search all of them in the panel)
const FIELD_LABEL = (o, W) => (o.label ? [T(0, 0, W, o.label, { size: 13, weight: 600, color: '#3f3f46' })] : []);

const MORE = {
  Video: {
    icon: 'play-circle',
    w: 320,
    make: (W, o = {}) => {
      const h = o.h || Math.round((W * 9) / 16);
      return [
        B(0, 0, W, h, { radius: 12 }),
        B(W / 2 - 28, h / 2 - 28, 56, 56, { fill: '#ffffff', radius: 28 }),
        IC(W / 2 - 14, h / 2 - 14, 'play', 28, { color: '#27272a' }),
        B(16, h - 22, W - 32, 4, { fill: '#d4d4d8', radius: 2 }),
        B(16, h - 22, (W - 32) * 0.35, 4, { fill: '#27272a', radius: 2 }),
      ];
    },
  },
  Map: {
    icon: 'map',
    w: 320,
    make: (W, o = {}) => {
      const h = o.h || 200;
      return [
        B(0, 0, W, h, { radius: 12 }),
        B(0, h * 0.3, W, 12, { fill: '#f4f4f5' }),
        B(0, h * 0.66, W, 8, { fill: '#f4f4f5' }),
        B(W * 0.28, 0, 10, h, { fill: '#f4f4f5' }),
        B(W * 0.7, 0, 8, h, { fill: '#f4f4f5' }),
        IC(W / 2 - 16, h / 2 - 28, 'location', 32, { color: '#27272a' }),
      ];
    },
  },
  Divider: { icon: 'divider', w: 300, make: (W, o = {}) => [B(0, 0, W, 1, { fill: '#e4e4e7' })] },
  // a gap on a screen Myra builds; in the panel it's a dashed-looking placeholder so there is something to place
  Space: {
    icon: 'space',
    w: 300,
    make: (W, o = {}) =>
      o.panel ? [B(0, 0, W, o.h || 32, { fill: '#f4f4f5', stroke: '#d4d4d8', sw: 1, radius: 8 })] : [],
  },
  Textarea: {
    icon: 'textarea',
    w: 300,
    make: (W, o = {}) => {
      const top = o.label ? 22 : 0,
        h = o.h || 110;
      return [
        ...FIELD_LABEL(o, W),
        B(0, top, W, h, { fill: '#ffffff', stroke: '#d4d4d8', sw: 1.5, radius: 10 }),
        T(14, top + 14, W - 28, o.text || 'Write something…', { color: '#a1a1aa' }),
      ];
    },
  },
  Dropdown: {
    icon: 'dropdown',
    w: 300,
    make: (W, o = {}) => {
      const top = o.label ? 22 : 0;
      return [
        ...FIELD_LABEL(o, W),
        B(0, top, W, 48, { fill: '#ffffff', stroke: '#d4d4d8', sw: 1.5, radius: 10 }),
        T(14, top + 14, W - 56, o.text || 'Choose one', { color: '#71717a' }),
        IC(W - 38, top + 12, 'caret-down', 24, { color: '#71717a' }),
      ];
    },
  },
  Radio: {
    icon: 'radio',
    w: 240,
    make: (W, o = {}) => {
      const opts =
          Array.isArray(o.options) && o.options.length ? o.options.slice(0, 6).map(String) : [o.text || 'Option'],
        single = opts.length === 1,
        sel = Math.min(opts.length - 1, Math.max(0, +o.selected || 0));
      return opts.flatMap((t, i) => {
        const y = i * 34,
          on = i === sel && !(single && o.on === false);
        return [
          B(0, y, 22, 22, { fill: '#ffffff', stroke: '#27272a', sw: 1.5, radius: 11 }),
          ...(on ? [B(5, y + 5, 12, 12, { fill: '#27272a', radius: 6 })] : []),
          T(32, y + 2, W - 32, t),
        ];
      });
    },
  },
  Tabs: {
    icon: 'tabs',
    w: 320,
    make: (W, o = {}) => {
      const tabs = (o.tabs || ['Overview', 'Details', 'Reviews'])
          .slice(0, 5)
          .map(t => (typeof t === 'string' ? t : t.label || t.text || '')),
        cw = W / tabs.length,
        act = Math.min(tabs.length - 1, Math.max(0, +o.active || 0));
      return [
        B(0, 41, W, 1, { fill: '#e4e4e7' }),
        ...tabs.flatMap((t, i) => [
          T(i * cw, 12, cw, t, {
            size: 14,
            weight: i === act ? 700 : 500,
            align: 'center',
            color: i === act ? '#18181b' : '#71717a',
          }),
          ...(i === act ? [B(i * cw + 8, 39, cw - 16, 3, { fill: '#18181b', radius: 2 })] : []),
        ]),
      ];
    },
  },
  Table: {
    icon: 'table',
    w: 420,
    make: (W, o = {}) => {
      const cols = (o.cols || ['Name', 'Role', 'Status']).slice(0, 6).map(String),
        cells = Array.isArray(o.cells)
          ? o.cells
          : [
              ['Ada', 'Lead', 'Active'],
              ['Sam', 'Design', 'Away'],
              ['Jo', 'Support', 'Active'],
            ],
        n = Math.min(cells.length, 10),
        cw = W / cols.length,
        H = 44 + n * 48;
      return [
        B(0, 0, W, H, { fill: '#ffffff', stroke: '#e4e4e7', sw: 1, radius: 12 }),
        B(1, 1, W - 2, 43, { fill: '#f4f4f5', radius: 11 }),
        B(1, 30, W - 2, 14, { fill: '#f4f4f5' }),
        ...cols.map((c, i) => T(16 + i * cw, 13, cw - 24, c, { size: 13, weight: 700, color: '#3f3f46' })),
        ...cells.slice(0, n).flatMap((r, k) => [
          B(1, 44 + k * 48, W - 2, 1, { fill: '#e4e4e7' }),
          ...cols.map((_, i) =>
            T(16 + i * cw, 44 + k * 48 + 15, cw - 24, String((Array.isArray(r) ? r[i] : '') ?? ''), {
              size: 14,
              color: '#3f3f46',
            }),
          ),
        ]),
      ];
    },
  },
  Accordion: {
    icon: 'accordion',
    w: 360,
    make: (W, o = {}) => {
      const items = (
          o.items || [
            { title: 'How does it work?', text: 'A short, friendly answer goes here.', open: true },
            { title: 'Is there a free plan?' },
            { title: 'Can I cancel any time?' },
          ]
        ).slice(0, 6),
        out = [B(0, 0, W, 1, { fill: '#e4e4e7' })];
      let y = 0;
      items.forEach(it => {
        const t = T(0, y + 18, W - 44, it.title || 'Question', { size: 16, weight: 700 }),
          open = !!it.open;
        out.push(t, IC(W - 28, y + 18, open ? 'caret-up' : 'caret-down', 22, { color: '#71717a' }));
        let h = 18 + t.h + 18;
        if (open) {
          const b = T(0, y + h - 6, W - 44, it.text || '', { size: 14, color: '#71717a', lh: 1.5 });
          out.push(b);
          h += b.h + 8;
        }
        y += h;
        out.push(B(0, y, W, 1, { fill: '#e4e4e7' }));
      });
      return out;
    },
  },
  Modal: {
    icon: 'modal',
    w: 340,
    make: (W, o = {}) => {
      const t = T(24, 24, W - 80, o.title || 'Are you sure?', { size: 20, weight: 800 }),
        x = T(24, 24 + t.h + 10, W - 48, o.text || 'A sentence that explains what happens next.', {
          size: 15,
          color: '#71717a',
          lh: 1.45,
        }),
        by = x.y + x.h + 28,
        bw = (W - 48 - 12) / 2;
      return [
        B(0, 0, W, by + 48 + 24, { fill: '#ffffff', stroke: '#e4e4e7', sw: 1, radius: 20 }),
        t,
        IC(W - 44, 24, 'close', 22, { color: '#71717a' }),
        x,
        B(24, by, bw, 48, { fill: '#ffffff', stroke: '#27272a', sw: 1.5, radius: 24 }),
        T(24, by + 14, bw, o.cancel || 'Cancel', { size: 15, weight: 600, align: 'center' }),
        B(24 + bw + 12, by, bw, 48, { fill: '#27272a', radius: 24 }),
        T(24 + bw + 12, by + 14, bw, o.button || 'Confirm', {
          size: 15,
          weight: 600,
          color: '#ffffff',
          align: 'center',
        }),
      ];
    },
  },
};

const WEB = {
  'Card grid': {
    icon: 'card-grid',
    web: 1,
    make: (W, o = {}) => {
      const M = 64,
        cols = Math.max(2, Math.min(4, +o.cols || 3)),
        items = (
          o.items || Array.from({ length: cols * 2 }, () => ({ title: 'Card title', text: 'A short line about it.' }))
        ).slice(0, cols * 3),
        gap = 24,
        cw = (W - M * 2 - gap * (cols - 1)) / cols,
        ch = 300;
      const title = T(M, 96, W - M * 2, o.title || 'Pick something', { size: 36, weight: 800, align: 'center' }),
        y0 = 96 + title.h + 48,
        rows = Math.ceil(items.length / cols);
      return [
        B(0, 0, W, y0 + rows * (ch + gap) - gap + 96, { fill: '#ffffff' }),
        title,
        ...items.flatMap((it, i) => {
          const x = M + (i % cols) * (cw + gap),
            y = y0 + Math.floor(i / cols) * (ch + gap);
          return [
            B(x, y, cw, ch, { fill: '#ffffff', stroke: '#e4e4e7', sw: 1, radius: 16 }),
            PH(x + 10, y + 10, cw - 20, 150, it.img || 'Card image', { radius: 10 }),
            T(x + 18, y + 176, cw - 36, it.title || 'Card title', { size: 18, weight: 700 }),
            T(x + 18, y + 206, cw - 36, it.text || '', { size: 14, color: '#71717a', lh: 1.4 }),
          ];
        }),
      ];
    },
  },
  Header: {
    icon: 'globe',
    web: 1,
    make: (W, o = {}) => {
      const links = o.links || ['Product', 'Pricing', 'About', 'Blog'],
        M = 64;
      return [
        B(0, 0, W, 80, { fill: '#ffffff' }),
        T(M, 26, 260, o.logo || o.title || 'Brand', { size: 22, weight: 800 }),
        ...links
          .slice(0, 5)
          .map((l, i) =>
            T(W / 2 - links.length * 55 + i * 110, 30, 110, l, { size: 15, align: 'center', color: '#52525b' }),
          ),
        B(W - M - 150, 18, 150, 44, { fill: '#18181b', radius: 22 }),
        T(W - M - 150, 30, 150, o.cta || 'Get started', { size: 14, weight: 600, color: '#ffffff', align: 'center' }),
        B(0, 79, W, 1, { fill: '#e4e4e7' }),
      ];
    },
  },
  Hero: {
    icon: 'rows',
    web: 1,
    make: (W, o = {}) => {
      const M = 64,
        cw = (W - M * 2) * 0.48,
        h = 600,
        t = T(M, 120, cw, o.title || 'A big, clear promise goes right here', { size: 56, weight: 800, lh: 1.1 }),
        sub = T(M, 120 + t.h + 24, cw, o.text || 'One or two sentences that say who it is for and why it helps.', {
          size: 20,
          color: '#71717a',
          lh: 1.45,
        }),
        by = sub.y + sub.h + 36;
      return [
        B(0, 0, W, h, { fill: '#ffffff' }),
        t,
        sub,
        B(M, by, 170, 52, { fill: '#18181b', radius: 26 }),
        T(M, by + 15, 170, o.cta || 'Get started', { size: 16, weight: 600, color: '#ffffff', align: 'center' }),
        B(M + 186, by, 160, 52, { fill: '#ffffff', stroke: '#18181b', sw: 1.5, radius: 26 }),
        T(M + 186, by + 15, 160, o.cta2 || 'Learn more', { size: 16, weight: 600, align: 'center' }),
        PH(W / 2 + 16, 72, W / 2 - M - 16, h - 144, o.img || 'Hero image', { radius: 28 }),
      ];
    },
  },
  Features: {
    icon: 'columns',
    web: 1,
    make: (W, o = {}) => {
      const M = 64,
        items = (
          o.items || [
            { icon: 'bolt', title: 'Fast', text: 'Say what makes it quick.' },
            { icon: 'heart', title: 'Friendly', text: 'Say why people enjoy it.' },
            { icon: 'lock', title: 'Safe', text: 'Say why they can trust it.' },
          ]
        ).slice(0, 4),
        n = items.length,
        gap = 32,
        cw = (W - M * 2 - gap * (n - 1)) / n;
      const title = T(M, 96, W - M * 2, o.title || 'Why people love it', { size: 36, weight: 800, align: 'center' }),
        y0 = 96 + title.h + 56;
      let tall = 0;
      const cols = items.flatMap((it, i) => {
        const x = M + i * (cw + gap),
          tt = T(x, y0 + 72, cw, it.title || 'Feature', { size: 20, weight: 700 }),
          tx = T(x, y0 + 72 + tt.h + 8, cw, it.text || '', { size: 15, color: '#71717a', lh: 1.5 });
        tall = Math.max(tall, 72 + tt.h + 8 + tx.h);
        return [B(x, y0, 52, 52, { fill: '#f4f4f5', radius: 14 }), IC(x + 14, y0 + 14, it.icon || 'star', 24), tt, tx];
      });
      return [B(0, 0, W, y0 + tall + 96, { fill: '#ffffff' }), title, ...cols];
    },
  },
  Stats: {
    icon: 'insights',
    web: 1,
    make: (W, o = {}) => {
      const M = 64,
        items = (
          o.items || [
            { value: '10k+', label: 'happy people' },
            { value: '4.9', label: 'average rating' },
            { value: '24/7', label: 'support' },
          ]
        ).slice(0, 4),
        cw = (W - M * 2) / items.length;
      return [
        B(0, 0, W, 220, { fill: '#f4f4f5' }),
        ...items.flatMap((it, i) => [
          T(M + i * cw, 60, cw, it.value || '100', { size: 48, weight: 800, align: 'center' }),
          T(M + i * cw, 128, cw, it.label || '', { size: 15, color: '#71717a', align: 'center' }),
        ]),
      ];
    },
  },
  Testimonials: {
    icon: 'quotes',
    web: 1,
    make: (W, o = {}) => {
      const M = 64,
        items = (
          o.items || [
            { quote: 'A short, warm quote from a happy customer.', name: 'Alex Kim' },
            { quote: 'Another quote about what changed for them.', name: 'Sam Rivera' },
            { quote: 'One more, short and specific.', name: 'Jo Patel' },
          ]
        ).slice(0, 3),
        gap = 24,
        cw = (W - M * 2 - gap * (items.length - 1)) / items.length;
      const title = T(M, 96, W - M * 2, o.title || 'What people say', { size: 36, weight: 800, align: 'center' }),
        y0 = 96 + title.h + 48;
      return [
        B(0, 0, W, y0 + 280 + 96, { fill: '#ffffff' }),
        title,
        ...items.flatMap((it, i) => {
          const x = M + i * (cw + gap);
          return [
            B(x, y0, cw, 280, { fill: '#f4f4f5', radius: 20 }),
            IC(x + 28, y0 + 28, 'quotes', 32, { color: '#a1a1aa' }),
            T(x + 28, y0 + 72, cw - 56, '“' + (it.quote || '') + '”', { size: 17, lh: 1.5 }),
            PH(x + 28, y0 + 208, 44, 44, (it.name || 'Person') + ' portrait', { radius: 22 }),
            T(x + 84, y0 + 220, cw - 112, it.name || 'Name', { size: 15, weight: 700 }),
          ];
        }),
      ];
    },
  },
  Pricing: {
    icon: 'tag',
    web: 1,
    make: (W, o = {}) => {
      const M = 64,
        plans = (
          o.plans || [
            { name: 'Starter', price: 'Free', features: ['The basics', 'One project'] },
            {
              name: 'Pro',
              price: '$12/mo',
              features: ['Everything in Starter', 'Unlimited projects', 'Priority help'],
            },
            { name: 'Team', price: '$29/mo', features: ['Everything in Pro', 'Shared spaces'] },
          ]
        ).slice(0, 3),
        gap = 24,
        cw = Math.min(360, (W - M * 2 - gap * (plans.length - 1)) / plans.length),
        x0 = (W - (cw * plans.length + gap * (plans.length - 1))) / 2;
      const title = T(M, 96, W - M * 2, o.title || 'Simple pricing', { size: 36, weight: 800, align: 'center' }),
        y0 = 96 + title.h + 48,
        ch = 380;
      return [
        B(0, 0, W, y0 + ch + 96, { fill: '#ffffff' }),
        title,
        ...plans.flatMap((pl, i) => {
          const x = x0 + i * (cw + gap),
            hot = i === Math.min(1, plans.length - 1);
          return [
            B(x, y0, cw, ch, { fill: hot ? '#18181b' : '#ffffff', stroke: '#e4e4e7', sw: hot ? 0 : 1.5, radius: 22 }),
            T(x + 28, y0 + 28, cw - 56, pl.name || 'Plan', {
              size: 18,
              weight: 700,
              color: hot ? '#ffffff' : '#27272a',
            }),
            T(x + 28, y0 + 62, cw - 56, pl.price || '$0', {
              size: 40,
              weight: 800,
              color: hot ? '#ffffff' : '#18181b',
            }),
            ...(pl.features || [])
              .slice(0, 5)
              .map((f, k) =>
                T(x + 28, y0 + 130 + k * 30, cw - 56, '✓  ' + f, { size: 15, color: hot ? '#e4e4e7' : '#52525b' }),
              ),
            B(x + 28, y0 + ch - 76, cw - 56, 48, { fill: hot ? '#ffffff' : '#18181b', radius: 24 }),
            T(x + 28, y0 + ch - 62, cw - 56, pl.cta || 'Choose ' + (pl.name || 'plan'), {
              size: 15,
              weight: 600,
              align: 'center',
              color: hot ? '#18181b' : '#ffffff',
            }),
          ];
        }),
      ];
    },
  },
  Gallery: {
    icon: 'images',
    web: 1,
    make: (W, o = {}) => {
      const M = 64,
        imgs = (o.imgs || ['Photo one', 'Photo two', 'Photo three', 'Photo four', 'Photo five', 'Photo six']).slice(
          0,
          9,
        ),
        cols = 3,
        gap = 20,
        cw = (W - M * 2 - gap * (cols - 1)) / cols,
        rh = cw * 0.72;
      const title = T(M, 96, W - M * 2, o.title || 'A closer look', { size: 36, weight: 800, align: 'center' }),
        y0 = 96 + title.h + 48,
        rows = Math.ceil(imgs.length / cols);
      return [
        B(0, 0, W, y0 + rows * (rh + gap) + 76, { fill: '#ffffff' }),
        title,
        ...imgs.map((l, i) =>
          PH(M + (i % cols) * (cw + gap), y0 + Math.floor(i / cols) * (rh + gap), cw, rh, l, { radius: 18 }),
        ),
      ];
    },
  },
  Logos: {
    icon: 'workspaces',
    web: 1,
    make: (W, o = {}) => {
      const M = 64,
        n = 5,
        cw = (W - M * 2 - 32 * (n - 1)) / n;
      return [
        B(0, 0, W, 170, { fill: '#ffffff' }),
        T(M, 40, W - M * 2, o.title || 'Trusted by teams everywhere', {
          size: 14,
          weight: 600,
          color: '#a1a1aa',
          align: 'center',
        }),
        ...Array.from({ length: n }, (_, i) => B(M + i * (cw + 32), 84, cw, 44, { fill: '#f4f4f5', radius: 10 })),
      ];
    },
  },
  CTA: {
    icon: 'megaphone',
    web: 1,
    make: (W, o = {}) => {
      const M = 64,
        t = T(M + 64, 80, W - M * 2 - 128, o.title || 'Ready to start?', {
          size: 40,
          weight: 800,
          align: 'center',
          color: '#ffffff',
        }),
        sub = T(M + 64, 80 + t.h + 16, W - M * 2 - 128, o.text || 'One last nudge, in one line.', {
          size: 18,
          align: 'center',
          color: '#d4d4d8',
        }),
        by = sub.y + sub.h + 32;
      return [
        B(0, 0, W, by + 52 + 96, { fill: '#ffffff' }),
        B(M, 24, W - M * 2, by + 52 + 48, { fill: '#18181b', radius: 32 }),
        t,
        sub,
        B(W / 2 - 90, by, 180, 52, { fill: '#ffffff', radius: 26 }),
        T(W / 2 - 90, by + 15, 180, o.cta || 'Get started', {
          size: 16,
          weight: 600,
          align: 'center',
          color: '#18181b',
        }),
      ];
    },
  },
  Footer: {
    icon: 'cursor-click',
    web: 1,
    make: (W, o = {}) => {
      const M = 64,
        cols = o.cols || [
          ['Product', ['Features', 'Pricing', 'Updates']],
          ['Company', ['About', 'Careers', 'Press']],
          ['Help', ['Support', 'Contact', 'Privacy']],
        ];
      return [
        B(0, 0, W, 300, { fill: '#f4f4f5' }),
        T(M, 64, 300, o.logo || 'Brand', { size: 22, weight: 800 }),
        T(M, 100, 300, o.text || 'A one-line sign-off.', { size: 14, color: '#71717a' }),
        ...cols
          .slice(0, 4)
          .flatMap(([h, ls], i) => [
            T(W - M - (cols.length - i) * 180, 64, 160, h, { size: 14, weight: 700 }),
            ...ls
              .slice(0, 4)
              .map((l, k) => T(W - M - (cols.length - i) * 180, 98 + k * 28, 160, l, { size: 14, color: '#71717a' })),
          ]),
        B(M, 240, W - M * 2, 1, { fill: '#e4e4e7' }),
        T(M, 258, 400, o.copy || '© 2026 ' + (o.logo || 'Brand'), { size: 12, color: '#a1a1aa' }),
      ];
    },
  },
};

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

function themeIt(list, th) {
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
      c.font = c.weight >= 700 && t.headFont ? t.headFont : t.font;
      if ([GRAY.text, GRAY.ink].includes(c.color)) c.color = t.text;
      else if ([GRAY.muted, GRAY.soft].includes(c.color)) c.color = t.muted;
      else if (c.color === '#ffffff' && th.onPrimary) c.color = t.onPrimary;
    }
    if (c.type === 'box' && !c.img) {
      if (c.fill === '#18181b' || c.fill === '#27272a') c.fill = t.primary;
      else if (c.fill === '#ffffff') c.fill = t.bg;
      else if ([GRAY.surface, GRAY.bar].includes(c.fill)) c.fill = t.surface;
      if (c.stroke === '#18181b' || c.stroke === '#27272a') c.stroke = t.primary;
    }
    if (c.type === 'icon' && [GRAY.text, '#3f3f46'].includes(c.color)) c.color = t.text;
    return c;
  });
}

// elements only Myra asks for by name (they are the panel's Text and Icon tools)
const EXTRA = {
  Text: (W, o = {}) => [
    T(0, 0, W, o.text || '', {
      size: o.size || 15,
      weight: o.weight || 500,
      align: o.align || 'left',
      color: o.color || '#3f3f46',
    }),
  ],
  Icon: (W, o = {}) => {
    const s = o.size || 32;
    return [
      IC(o.align === 'center' ? W / 2 - s / 2 : 0, 0, o.name || o.icon || 'star', s, { color: o.color || '#27272a' }),
    ];
  },
};

const pieceH = (items, o) => Math.max(o.h && !items.length ? o.h : 0, ...items.map(i => i.y + i.h));

// a whole screen from a list of pieces, top to bottom: bars hug the edges, the rest stacks with even gaps
const num = (v, d) => {
  const n = +v;
  return Number.isFinite(n) && v !== '' && v !== null ? n : d;
};

export function buildScreen(spec, x, y) {
  spec = { ...spec, w: num(spec.w, undefined), h: num(spec.h, undefined), gap: num(spec.gap, undefined) };
  spec.items = (Array.isArray(spec.items) ? spec.items : [])
    .filter(it => it && typeof it === 'object')
    .map(it => ({
      ...it,
      w: num(it.w, undefined),
      h: num(it.h, undefined),
      size: num(it.size, undefined),
      count: num(it.count, undefined),
    }));
  const dev = DEVICES[spec.device] || DEVICES.iPhone,
    W = spec.w || dev[0],
    phone = !spec.device || /iPhone|Android/.test(spec.device),
    webFirst = (spec.items || []).some(it => /^(header|hero|features|footer)$/i.test(it.piece || ''));
  const f = card('frame', {
    x,
    y,
    w: W,
    h: spec.h || (webFirst && spec.device === 'Desktop' ? 600 : dev[1]),
    r: 0,
    name: spec.name || 'Screen',
    device: DEVICES[spec.device] ? spec.device : 'iPhone',
    radius: webFirst ? 12 : dev[2],
    fill: '#ffffff',
  });
  session.board.cards.push(f);
  renderCard(f, true);
  const items = spec.items || [],
    M = spec.device === 'Desktop' ? 64 : 24,
    CW = W - M * 2,
    GAP = spec.gap || 16,
    made = [f];
  let top = y + (phone ? 44 : 0),
    bottom = y + f.h;
  const put = (list, ox, oy) => {
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
      if (!c.group) delete c.group;
      session.board.cards.push(c);
      renderCard(c, true);
      made.push(c);
    });
  };
  const nav = items.find(it => /^nav ?(bar)?$/i.test(String(it.piece || '').trim())),
    tab = items.find(it => /^tab ?bar$/i.test(String(it.piece || '').trim())); // exact names: Tabs and Table are their own elements
  if (nav) {
    const l = themeIt(PIECES['Nav bar'].make(W, nav), spec.theme);
    put(l, x, top);
    top += 56;
  }
  let tabMade = []; // the tab bar's cards: the only things that move down when a long screen grows
  if (tab) {
    const l = themeIt(PIECES['Tab bar'].make(W, tab), spec.theme);
    bottom -= 64 + (phone ? 20 : 0);
    const n0 = made.length;
    put(l, x, bottom);
    tabMade = made.slice(n0);
  }
  const isWeb = (spec.items || []).some(
    it => WEB[Object.keys(WEB).find(k => k.toLowerCase() === String(it.piece || '').toLowerCase())],
  );
  if (spec.theme?.bg) {
    f.fill = spec.theme.bg;
    renderCard(f);
  }
  let cur = top + (spec.padTop ?? (isWeb ? 0 : 20));
  items
    .filter(it => it !== nav && it !== tab)
    .forEach(it => {
      const name =
        Object.keys(PIECES).find(k => k.toLowerCase() === String(it.piece || '').toLowerCase()) ||
        Object.keys(EXTRA).find(k => k.toLowerCase() === String(it.piece || '').toLowerCase()) ||
        'Text';
      const P = PIECES[name],
        full = name === 'List row' || (P && P.web),
        w = full ? W : ['Avatar', 'Toggle'].includes(name) && !it.text ? P.w : it.w || CW;
      const reps = Math.max(1, Math.min(8, +it.count || (Array.isArray(it.rows) ? it.rows.length : 1)));
      for (let k = 0; k < reps; k++) {
        const o = Array.isArray(it.rows) ? { ...it, ...it.rows[k] } : it,
          list = P ? P.make(w, o) : EXTRA[name](w, o),
          h = pieceH(list, o);
        const ox = full ? x : it.align === 'center' && w < CW ? x + (W - w) / 2 : x + M;
        put(themeIt(list, spec.theme), ox, cur);
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
      text: spec.note,
      name: spec.name || '',
      color: 'butter',
      r: 0,
    });
    session.board.cards.push(n);
    renderCard(n, true);
    made.push(n);
  }
  return { f, made };
}

// the panel, by what things are: Basics (with the Screen, Box, Text and Icon tools), Buttons & inputs, Building blocks and Layouts
export const GROUPS = [
  ['basics', ['Heading', 'Image', 'Video', 'Map', 'Avatar', 'Divider', 'Space']],
  ['controls', ['Button', 'Input', 'Textarea', 'Search', 'Dropdown', 'Radio', 'Checkbox', 'Toggle']],
  ['blocks', ['Nav bar', 'Tab bar', 'Tabs', 'Card', 'List row', 'Table', 'Accordion', 'Modal']],
  [
    'layouts',
    [
      'Header',
      'Hero',
      'Logos',
      'Features',
      'Gallery',
      'Stats',
      'Testimonials',
      'Pricing',
      'Card grid',
      'CTA',
      'Footer',
    ],
  ],
];

// other words people might type to find an element
const PIECE_KW = {
  Heading: 'title headline',
  Image: 'picture photo placeholder',
  Video: 'player movie clip media',
  Map: 'location pin place',
  Avatar: 'profile user person picture',
  Divider: 'line rule separator',
  Space: 'gap spacer margin padding',
  Button: 'cta action',
  Input: 'text field form',
  Textarea: 'multiline message comment form',
  Search: 'find field',
  Dropdown: 'select combobox menu picker',
  Radio: 'option choice select',
  Checkbox: 'tick check',
  Toggle: 'switch on off',
  'Nav bar': 'navigation top bar header',
  'Tab bar': 'bottom navigation tabs',
  Tabs: 'segmented tab switch',
  Card: 'tile panel',
  'List row': 'cell item list',
  Table: 'grid data rows columns spreadsheet',
  Accordion: 'faq collapse expand',
  Modal: 'dialog popup overlay sheet',
  Header: 'site navigation top',
  Hero: 'banner headline landing',
  Logos: 'brands clients partners strip',
  Features: 'benefits grid',
  Gallery: 'photos images',
  Stats: 'numbers metrics figures',
  Testimonials: 'quotes reviews customers',
  Pricing: 'plans tiers cost',
  'Card grid': 'cards grid columns',
  CTA: 'call to action button banner',
  Footer: 'links bottom',
};

const pieceBtn = n =>
  `<button data-piece="${n}" data-kw="${n.toLowerCase()} ${PIECE_KW[n] || ''}" title="Add ${n.toLowerCase()}">${Icon(PIECES[n].icon)}${n}</button>`;

// the groups fold (Layouts starts folded), and the choice is remembered
let dzOpen = { layouts: false };

const dzWords = () => queryWords($('dzSearch').value);

function dzApply() {
  const q = dzWords().length > 0;
  $('design')
    .querySelectorAll('.dz-group')
    .forEach(g => {
      const open = dzOpen[g.dataset.g] !== false || q;
      g.classList.toggle('closed', !open);
      g.querySelector('.dz-gh').setAttribute('aria-expanded', open);
    });
}

// typing narrows every group to what matches (a search opens the groups it finds things in)
function dzFilter() {
  const words = dzWords();
  let any = false;
  $('design')
    .querySelectorAll('.dz-group')
    .forEach(g => {
      let has = false;
      g.querySelectorAll('.dz-tools button, .dz-piece-grid button').forEach(b => {
        const ok = !words.length || hasAll(words, b.dataset.kw);
        b.hidden = !ok;
        if (ok) has = true;
      });
      g.hidden = words.length > 0 && !has;
      if (has) any = true;
    });
  $('dzNone').hidden = !words.length || any;
  dzApply();
}

// dragging an element from the panel onto the board puts it exactly where you let go (the preview follows the pointer, above the panels)
let pDrag = null;
let pDragged = false;

export function placePiece(name, w, opts = {}) {
  const P = PIECES[name],
    f =
      opts.frame ||
      [...session.board.cards]
        .reverse()
        .find(f => f.type === 'frame' && w.x > f.x && w.x < f.x + f.w && w.y > f.y && w.y < f.y + f.h),
    M = f && f.w > 700 ? 64 : 24;
  const W = (P.bar || P.web) && f ? f.w : P.web ? 1200 : Math.min(P.w || 360, f ? f.w - M * 2 : Infinity),
    items = P.make(W, { panel: true });
  const bw = Math.max(1, ...items.map(i => i.x + i.w)),
    bh = Math.max(1, ...items.map(i => i.y + i.h));
  let ox = w.x - 14 / session.view.z,
    oy = w.y - 14 / session.view.z;
  if (opts.center) {
    ox = w.x - bw / 2;
    oy = w.y - bh / 2;
  }
  if ((P.bar || P.web) && f) {
    ox = f.x;
    if (P.bar === 'top') oy = Math.max(f.y, oy);
    if (P.bar === 'bottom') oy = Math.min(f.y + f.h - 64, Math.max(f.y, oy));
  }
  const tabKids = f && opts.frame ? session.board.cards.filter(c => c.onFrame === f.id && c.y >= f.y + f.h - 90) : []; // a tab bar waiting at the bottom
  const g = uid(),
    made = items.map(it => {
      const c = card(it.type, { ...it, x: ox + it.x, y: oy + it.y, r: 0, group: g });
      session.board.cards.push(c);
      renderCard(c, true);
      return c;
    });
  // adding into a screen that is full: it grows, and the tab bar slides down with its bottom edge
  if (f && opts.frame && !P.bar) {
    const limit = f.y + f.h - (tabKids.length ? 90 : 12),
      grow = oy + bh - limit + 24;
    if (grow > 24) {
      f.h += grow;
      renderCard(f);
      tabKids.forEach(c => {
        c.y += grow;
        renderCard(c);
      });
    }
  }
  fileIntoFrame(made);
  selectOnly(made.map(c => c.id));
  renderWires();
  save();
  return made;
}

// a click on an element in the panel adds it straight away: into the selected screen, below what is already there, or in the middle of the view (drag it from the panel to put it exactly somewhere)
function addPiece(name) {
  const P = PIECES[name],
    z = session.view.z,
    sc = [...session.sel].map(byId).filter(Boolean);
  const fr =
    sc.length === 1 && sc[0].type === 'frame'
      ? sc[0]
      : sc.length && sc[0].onFrame && sc.every(c => c.onFrame === sc[0].onFrame)
        ? byId(sc[0].onFrame)
        : null;
  let made;
  if (!fr) made = placePiece(name, centerWorld(), { center: true });
  else {
    const M = fr.w > 700 ? 64 : 24,
      body = session.board.cards.filter(c => c.onFrame === fr.id && c.y < fr.y + fr.h - 90),
      phone = fr.w <= 500;
    const y = body.length
      ? Math.max(...body.map(c => c.y + c.h)) + (P.web ? 0 : 16)
      : fr.y + (phone ? 44 : 0) + (P.web ? 0 : 20);
    made = placePiece(
      name,
      { x: fr.x + M + 14 / z, y: P.bar === 'bottom' ? fr.y + fr.h : P.bar === 'top' ? fr.y : y + 14 / z },
      { frame: fr },
    );
  }
  revealCards(made);
}

// bring something that landed out of sight into view (a screen far from where you are looking)
export function revealCards(cs) {
  if (!cs.length) return;
  const r = stage.getBoundingClientRect(),
    x0 = Math.min(...cs.map(c => c.x)),
    y0 = Math.min(...cs.map(c => c.y)),
    x1 = Math.max(...cs.map(c => c.x + c.w)),
    y1 = Math.max(...cs.map(c => c.y + c.h));
  const sx = r.left + session.view.x + ((x0 + x1) / 2) * session.view.z,
    sy = r.top + session.view.y + ((y0 + y1) / 2) * session.view.z;
  if (sx > r.left + 280 && sx < r.right - 280 && sy > r.top + 80 && sy < r.bottom - 120) return;
  const c = centerWorld();
  session.view.x += (c.x - (x0 + x1) / 2) * session.view.z;
  session.view.y += (c.y - (y0 + y1) / 2) * session.view.z;
  applyView();
}

// icons: search Myra's icon set, then click to place (or swap the selected icon)
let iconSwap = null;

function renderIcons() {
  const words = queryWords($('iconSearch').value),
    all = window.iconList(),
    hits = words.length ? all.filter(i => hasAll(words, i.kw)) : all;
  $('iconGrid').innerHTML =
    hits
      .map(i => `<button data-icon="${i.name}" title="${i.name.replace(/-/g, ' ')}">${Icon(i.name)}</button>`)
      .join('') + (hits.length ? '' : '<div class="more">No icons match that</div>');
}

// the design panel: tools when nothing's picked, the selection's settings when something is
export function pickWF(t) {
  document.querySelectorAll('[data-wf]').forEach(b => b.classList.toggle('on', b.dataset.wf === t));
  $('dzPresets').classList.toggle('on', t === 'frame');
  $('dzIcons').classList.toggle('on', t === 'icon');
  if (t === 'icon') {
    renderIcons();
    setTimeout(() => $('iconSearch').focus(), 20);
    return;
  }
  if (t !== 'icon') iconSwap = null;
  if (t) document.querySelectorAll('.dz-piece-grid .on').forEach(x => x.classList.remove('on'));
  if (t === 'frame') {
    $('dzPresets').innerHTML = Object.keys(DEVICES)
      .map(n => `<button data-dev="${n}">${n}</button>`)
      .join('');
    return;
  }
  if (t) startPlacing(t);
}

// Unsorted sits under the Wireframe panel and always fits on screen; its list scrolls when it's long
export function placeTray() {
  if ($('tray').parentElement?.classList.contains('side')) {
    $('tray').style.top = $('tray').style.maxHeight = '';
    return;
  } // in a sidebar column: it just stacks
}
let ALIGN;

const field = (k, label, v, type = 'number', extra = '') =>
  `<label class="dz-f ${extra}"><span>${label}</span><input data-k="${k}" type="${type}" value="${esc(v)}"${type === 'number' ? ' step="1"' : ''}></label>`;

export function renderDesign() {
  const fc = selCards().length === 1 && selCards()[0].type === 'font' ? selCards()[0] : null;
  if (fc) {
    $('dzProps').innerHTML =
      `<div class="dz-sec"><div class="label">Font</div><div class="dz-grid"><label class="dz-f wide"><span>Font</span><select data-k="font">${[...new Set([fc.font || 'Figtree', ...FONTS])].map(f => `<option${fc.font === f ? ' selected' : ''} style="font-family:'${esc(f)}'">${esc(f)}</option>`).join('')}</select></label><label class="dz-f wide"><span>Or any Google font</span><input data-k="gfont" placeholder="e.g. Playfair Display" spellcheck="false"></label></div><div class="dz-hint">Double-click the sample line on the card to try your own words.</div></div>`;
    return;
  }
  const cs = selCards().filter(c => WF.includes(c.type)),
    el = $('dzProps');
  if (!cs.length) {
    el.innerHTML = selCards().length
      ? ''
      : '<div class="dz-hint">Pick a tool or a piece. Drag to draw a box; things snap into line as you move them.</div>';
    return;
  }
  const one = cs.length === 1 ? cs[0] : null;
  let h = '';
  if (one)
    h += `<div class="dz-sec"><div class="label">${{ frame: 'Screen', box: 'Box', text: 'Text', font: 'Font' }[one.type]}</div><div class="dz-grid">${field('x', 'X', Math.round(one.x))}${field('y', 'Y', Math.round(one.y))}${field('w', 'W', Math.round(one.w))}${one.type === 'text' ? '' : field('h', 'H', Math.round(one.h))}</div></div>`;
  if (one && one.type !== 'frame')
    h += `<div class="dz-sec"><div class="dz-grid">${field('rot', 'Rotate°', one.rot || 0, 'number', 'wide')}</div></div>`;
  if (one?.type === 'icon')
    h += `<div class="dz-sec"><div class="label">Icon</div><div class="dz-grid">${field('isz', 'Size', Math.round(one.w))}${field('color', 'Colour', one.color || '#27272a', 'color')}</div><div class="dz-row"><button data-swap="1" style="font:600 11.5px/1 var(--font);gap:6px;display:flex;align-items:center;justify-content:center">${Icon(one.name, { size: 16 })} Change icon</button></div></div>`;
  const groupedSel = cs.length > 1 && cs.every(c => c.group && c.group === cs[0].group);
  if (cs.length > 1)
    h += `<div class="dz-sec"><div class="dz-row"><button data-grp="${groupedSel ? 'off' : 'on'}" style="font:600 11.5px/1 var(--font)">${groupedSel ? 'Ungroup  ⇧⌘G' : 'Group  ⌘G'}</button></div></div>`;
  if (one?.type === 'frame')
    h += `<div class="dz-sec"><div class="dz-grid">${field('name', 'Name', one.name || 'Screen', 'text', 'wide')}<label class="dz-f wide"><span>Device</span><select data-k="device">${['Custom', ...Object.keys(DEVICES)].map(n => `<option${(one.device || 'Custom') === n ? ' selected' : ''}>${n}</option>`).join('')}</select></label>${field('fill', 'Fill', one.fill || '#ffffff', 'color')}${field('radius', 'Corners', one.radius ?? 0)}</div></div>`;
  if (one?.type === 'box')
    h += `<div class="dz-sec"><div class="label">Look</div><div class="dz-grid">${field('fill', 'Fill', one.fill || '#e4e4e7', 'color')}${field('radius', 'Corners', one.radius || 0)}${field('stroke', 'Border', one.stroke || '#a1a1aa', 'color')}${field('sw', 'Width', one.sw || 0)}${field('opacity', 'Opacity %', Math.round((one.opacity ?? 1) * 100), 'number', 'wide')}</div></div>`;
  if (one?.type === 'text')
    h += `<div class="dz-sec"><div class="label">Type</div><div class="dz-grid"><label class="dz-f wide"><span>Font</span><select data-k="font">${[...new Set([one.font || 'Figtree', ...FONTS])].map(f => `<option${(one.font || 'Figtree') === f ? ' selected' : ''} style="font-family:'${esc(f)}'">${esc(f)}</option>`).join('')}</select></label>
      ${field('size', 'Size', one.size || 18)}<label class="dz-f"><span>Weight</span><select data-k="weight">${[
        [300, 'Light'],
        [400, 'Regular'],
        [500, 'Medium'],
        [600, 'Semi'],
        [700, 'Bold'],
        [800, 'Extra'],
      ]
        .map(([v, n]) => `<option value="${v}"${(+one.weight || 500) === v ? ' selected' : ''}>${n}</option>`)
        .join('')}</select></label>
      ${field('color', 'Colour', one.color || '#27272a', 'color')}${field('lh', 'Line', one.lh || 1.3)}</div><div class="dz-row">${['left', 'center', 'right'].map(a => `<button data-talign="${a}" class="${(one.align || 'left') === a ? 'on' : ''}" title="Align ${a === 'center' ? 'centre' : a}">${ALIGN[a[0]]}</button>`).join('')}</div></div>`;
  const inFrame = one && one.onFrame && byId(one.onFrame);
  if (cs.length > 1 || inFrame)
    h += `<div class="dz-sec"><div class="label">${cs.length > 1 ? 'Align' : 'Align on its screen'}</div><div class="dz-row">${['l', 'c', 'r', 't', 'm', 'b'].map(a => `<button data-align="${a}" title="Align">${ALIGN[a]}</button>`).join('')}</div>${cs.length > 2 ? `<div class="dz-row"><button data-dist="h" title="Even spacing across">${ALIGN.dh}</button><button data-dist="v" title="Even spacing down">${ALIGN.dv}</button></div>` : ''}</div>`;
  el.innerHTML = h;
}

// keep X / Y / W / H current while you drag (unless you're typing in them)
export function syncDesign() {
  const one = selCards().length === 1 && WF.includes(selCards()[0].type) ? selCards()[0] : null;
  if (!one || $('dzProps').contains(document.activeElement)) return;
  ['x', 'y', 'w', 'h'].forEach(k => {
    const i = $('dzProps').querySelector(`[data-k="${k}"]`);
    if (i && +i.value !== Math.round(one[k])) i.value = Math.round(one[k]);
  });
}
export function init48() {
  Object.assign(PIECES, MORE);

  Object.assign(PIECES, WEB);

  GROUPS.forEach(([g, names]) => {
    $('design').querySelector(`.dz-piece-grid[data-g="${g}"]`).innerHTML = names.map(pieceBtn).join('');
  });
  try {
    dzOpen = { layouts: false, ...JSON.parse(localStorage.getItem('fenmyr:dzOpen') || '{}') };
  } catch (e) {}

  $('dzSearch').oninput = dzFilter;

  $('dzSearch').onkeydown = e => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      $('dzSearch').value = '';
      dzFilter();
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      $('design').querySelector('.dz-group:not([hidden]) :is(.dz-tools, .dz-piece-grid) button:not([hidden])')?.click();
    }
  };

  $('design').addEventListener('click', e => {
    const h = e.target.closest('.dz-gh');
    if (h) {
      const g = h.parentElement.dataset.g;
      dzOpen[g] = dzOpen[g] === false;
      try {
        localStorage.setItem('fenmyr:dzOpen', JSON.stringify(dzOpen));
      } catch (e2) {}
      dzApply();
      return;
    }
    const b = e.target.closest('[data-piece]');
    if (!b || pDragged) return;
    pickWF(null);
    stopPlacing();
    addPiece(b.dataset.piece);
  });

  $('design').addEventListener('pointerdown', e => {
    const b = e.target.closest('[data-piece]');
    if (b && !e.button) pDrag = { name: b.dataset.piece, x: e.clientX, y: e.clientY, on: false };
  });

  addEventListener(
    'pointermove',
    e => {
      if (!pDrag || pDrag.on || Math.hypot(e.clientX - pDrag.x, e.clientY - pDrag.y) < 6) return;
      pDrag.on = true;
      pickWF(null);
      startPlacing('piece', { piece: pDrag.name }, true);
      document.body.classList.add('dz-dragging');
    },
    true,
  );

  addEventListener(
    'pointerup',
    e => {
      if (!pDrag) return;
      const d = pDrag;
      pDrag = null;
      if (!d.on) return;
      document.body.classList.remove('dz-dragging');
      pDragged = true;
      setTimeout(() => {
        pDragged = false;
      }, 0);
      const over = document.elementFromPoint(e.clientX, e.clientY);
      if (
        placing &&
        placing.type === 'piece' &&
        !over?.closest(
          '.design, .side, .tray, .tools, .dock, .myra, .selbar, .m-chat, .keys, .top, .hub, .sheet, .settings',
        )
      )
        placeAt(toWorld(e.clientX, e.clientY));
      else stopPlacing();
    },
    true,
  );

  dzApply();

  $('iconSearch').oninput = renderIcons;

  $('iconSearch').onkeydown = e => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      pickWF(null);
      stopPlacing();
    }
  };

  $('iconGrid').onclick = e => {
    const b = e.target.closest('[data-icon]');
    if (!b) return;
    $('iconGrid')
      .querySelectorAll('.on')
      .forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    if (iconSwap && byId(iconSwap)) {
      const c = byId(iconSwap);
      c.name = b.dataset.icon;
      renderCard(c);
      selectOnly([c.id]);
      save();
      iconSwap = null;
      pickWF(null);
      return;
    }
    startPlacing('icon', { name: b.dataset.icon });
  };

  document.querySelectorAll('[data-wf]').forEach(
    b =>
      (b.onclick = () => {
        const t = b.dataset.wf;
        if (b.classList.contains('on')) {
          stopPlacing();
          pickWF(null);
          return;
        }
        pickWF(t);
      }),
  );

  $('dzPresets').onclick = e => {
    const b = e.target.closest('[data-dev]');
    if (!b) return;
    $('dzPresets')
      .querySelectorAll('button')
      .forEach(x => x.classList.toggle('on', x === b));
    startPlacing('frame', { device: b.dataset.dev });
  };

  $('dzMin').onclick = () => {
    const m = $('design').classList.toggle('min');
    $('dzMin').textContent = m ? '+' : '–';
    placeTray();
  };

  $('design').addEventListener('pointerdown', e => e.stopPropagation());

  addEventListener('resize', placeTray);

  new ResizeObserver(placeTray).observe($('design'));

  ALIGN = {
    l: Icon('align-l'),
    c: Icon('align-c'),
    r: Icon('align-r'),
    t: Icon('align-t'),
    m: Icon('align-m'),
    b: Icon('align-b'),
    dh: Icon('distribute-h'),
    dv: Icon('distribute-v'),
  };

  $('dzProps').addEventListener('input', e => {
    const fc = selCards().length === 1 && selCards()[0].type === 'font' ? selCards()[0] : null;
    if (fc && (e.target.dataset.k === 'font' || e.target.dataset.k === 'gfont')) {
      const v = e.target.value.trim();
      if (!v) return;
      if (e.target.dataset.k === 'gfont') {
        clearTimeout(fc._t);
        fc._t = setTimeout(() => {
          fc.font = v;
          renderCard(fc);
          selectOnly([fc.id]);
          save();
        }, 500);
        return;
      }
      fc.font = v;
      renderCard(fc);
      selectOnly([fc.id]);
      save();
      return;
    }
    const k = e.target.dataset.k,
      one = selCards().filter(c => WF.includes(c.type))[0];
    if (!k || !one) return;
    let v = e.target.value;
    if (['x', 'y', 'w', 'h', 'radius', 'sw', 'size', 'rot', 'isz'].includes(k)) v = +v || 0;
    if (k === 'opacity') v = Math.max(0, Math.min(100, +v)) / 100;
    if (k === 'lh') v = +v || 1.3;
    if (k === 'weight') v = +v;
    if (k === 'rot') {
      one.rot = v;
    } else if (k === 'isz') {
      one.w = one.h = Math.max(8, v);
    } else if (k === 'device') {
      if (DEVICES[v]) {
        one.w = DEVICES[v][0];
        one.h = DEVICES[v][1];
        one.radius = DEVICES[v][2];
      }
      one.device = v;
    } else one[k] = v;
    if (k === 'w' || k === 'h') one.device = 'Custom';
    renderCard(one);
    selectOnly([one.id]);
    renderWires();
    save();
    if (k === 'device') ($('selbar').dataset.key = ''), renderDesign();
  });

  $('dzProps').addEventListener('click', e => {
    if (e.target.closest('[data-swap]')) {
      iconSwap = selCards()[0]?.id;
      pickWF('icon');
      return;
    }
    const gp = e.target.closest('[data-grp]');
    if (gp) return groupSel(gp.dataset.grp === 'on');
    const cs = selCards().filter(c => WF.includes(c.type)),
      ta = e.target.closest('[data-talign]'),
      al = e.target.closest('[data-align]'),
      di = e.target.closest('[data-dist]');
    if (ta) {
      cs.forEach(c => (c.align = ta.dataset.talign));
    }
    if (al) {
      // line them up with each other, or a single thing with its screen
      const ref = cs.length === 1 ? byId(cs[0].onFrame) : null,
        x0 = ref ? ref.x : Math.min(...cs.map(c => c.x)),
        y0 = ref ? ref.y : Math.min(...cs.map(c => c.y)),
        x1 = ref ? ref.x + ref.w : Math.max(...cs.map(c => c.x + c.w)),
        y1 = ref ? ref.y + ref.h : Math.max(...cs.map(c => c.y + c.h));
      cs.forEach(c => {
        const a = al.dataset.align;
        if (a === 'l') c.x = x0;
        if (a === 'c') c.x = (x0 + x1) / 2 - c.w / 2;
        if (a === 'r') c.x = x1 - c.w;
        if (a === 't') c.y = y0;
        if (a === 'm') c.y = (y0 + y1) / 2 - c.h / 2;
        if (a === 'b') c.y = y1 - c.h;
      });
    }
    if (di) {
      const hz = di.dataset.dist === 'h',
        s = [...cs].sort((a, b) => (hz ? a.x - b.x : a.y - b.y)),
        first = s[0],
        last = s[s.length - 1];
      const span = hz ? last.x + last.w - first.x : last.y + last.h - first.y,
        used = s.reduce((t, c) => t + (hz ? c.w : c.h), 0),
        gap = (span - used) / (s.length - 1);
      let at = hz ? first.x : first.y;
      s.forEach(c => {
        if (hz) c.x = at;
        else c.y = at;
        at += (hz ? c.w : c.h) + gap;
      });
    }
    if (ta || al || di) {
      cs.forEach(c => renderCard(c));
      selectOnly(cs.map(c => c.id));
      renderWires();
      save();
      renderDesign();
    }
  });
}
