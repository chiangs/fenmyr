import { isRecord } from '../../shared/model.ts';
import { B, FIELD_LABEL, IC, numOf, type Piece, recs, str, strs, T } from './pieceKit.ts';

// more elements: media, form fields, tabs, a table, an accordion and a dialog (a person can search all of them in the panel)
export const MORE: Record<string, Piece> = {
  Video: {
    icon: 'play-circle',
    w: 320,
    make: (W, o) => {
      const h = numOf(o.h, Math.round((W * 9) / 16));
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
    make: (W, o) => {
      const h = numOf(o.h, 200);
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
  Divider: { icon: 'divider', w: 300, make: W => [B(0, 0, W, 1, { fill: '#e4e4e7' })] },
  // a gap on a screen Myra builds; in the panel it's a dashed-looking placeholder so there is something to place
  Space: {
    icon: 'space',
    w: 300,
    make: (W, o) =>
      o.panel ? [B(0, 0, W, numOf(o.h, 32), { fill: '#f4f4f5', stroke: '#d4d4d8', sw: 1, radius: 8 })] : [],
  },
  Textarea: {
    icon: 'textarea',
    w: 300,
    make: (W, o) => {
      const top = o.label ? 22 : 0,
        h = numOf(o.h, 110);
      return [
        ...FIELD_LABEL(o, W),
        B(0, top, W, h, { fill: '#ffffff', stroke: '#d4d4d8', sw: 1.5, radius: 10 }),
        T(14, top + 14, W - 28, str(o.text, 'Write something…'), { color: '#a1a1aa' }),
      ];
    },
  },
  Dropdown: {
    icon: 'dropdown',
    w: 300,
    make: (W, o) => {
      const top = o.label ? 22 : 0;
      return [
        ...FIELD_LABEL(o, W),
        B(0, top, W, 48, { fill: '#ffffff', stroke: '#d4d4d8', sw: 1.5, radius: 10 }),
        T(14, top + 14, W - 56, str(o.text, 'Choose one'), { color: '#71717a' }),
        IC(W - 38, top + 12, 'caret-down', 24, { color: '#71717a' }),
      ];
    },
  },
  Radio: {
    icon: 'radio',
    w: 240,
    make: (W, o) => {
      const opts =
          Array.isArray(o.options) && o.options.length ? o.options.slice(0, 6).map(String) : [str(o.text, 'Option')],
        single = opts.length === 1,
        sel = Math.min(opts.length - 1, Math.max(0, numOf(o.selected, 0)));
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
    make: (W, o) => {
      const tabs = (Array.isArray(o.tabs) ? o.tabs : ['Overview', 'Details', 'Reviews'])
          .slice(0, 5)
          .map(t => (typeof t === 'string' ? t : isRecord(t) ? str(t.label, str(t.text)) : '')),
        cw = W / tabs.length,
        act = Math.min(tabs.length - 1, Math.max(0, numOf(o.active, 0)));
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
    make: (W, o) => {
      const cols = strs(o.cols, ['Name', 'Role', 'Status']).slice(0, 6).map(String),
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
    make: (W, o) => {
      const items = recs(o.items, [
          { title: 'How does it work?', text: 'A short, friendly answer goes here.', open: true },
          { title: 'Is there a free plan?' },
          { title: 'Can I cancel any time?' },
        ]).slice(0, 6),
        out = [B(0, 0, W, 1, { fill: '#e4e4e7' })];
      let y = 0;
      items.forEach(it => {
        const t = T(0, y + 18, W - 44, str(it.title, 'Question'), { size: 16, weight: 700 }),
          open = !!it.open;
        out.push(t, IC(W - 28, y + 18, open ? 'caret-up' : 'caret-down', 22, { color: '#71717a' }));
        let h = 18 + t.h + 18;
        if (open) {
          const b = T(0, y + h - 6, W - 44, str(it.text, ''), { size: 14, color: '#71717a', lh: 1.5 });
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
    make: (W, o) => {
      const t = T(24, 24, W - 80, str(o.title, 'Are you sure?'), { size: 20, weight: 800 }),
        x = T(24, 24 + t.h + 10, W - 48, str(o.text, 'A sentence that explains what happens next.'), {
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
        T(24, by + 14, bw, str(o.cancel, 'Cancel'), { size: 15, weight: 600, align: 'center' }),
        B(24 + bw + 12, by, bw, 48, { fill: '#27272a', radius: 24 }),
        T(24 + bw + 12, by + 14, bw, str(o.button, 'Confirm'), {
          size: 15,
          weight: 600,
          color: '#ffffff',
          align: 'center',
        }),
      ];
    },
  },
};
