import { B, IC, type Piece, PH, T, numOf, recs, str, strs } from './pieceKit.ts';

export const WEB: Record<string, Piece> = {
  'Card grid': {
    icon: 'card-grid',
    web: true,
    make: (W, o) => {
      const M = 64,
        cols = Math.max(2, Math.min(4, numOf(o.cols, 3))),
        items = recs(
          o.items,
          Array.from({ length: cols * 2 }, () => ({ title: 'Card title', text: 'A short line about it.' })),
        ).slice(0, cols * 3),
        gap = 24,
        cw = (W - M * 2 - gap * (cols - 1)) / cols,
        ch = 300;
      const title = T(M, 96, W - M * 2, str(o.title, 'Pick something'), { size: 36, weight: 800, align: 'center' }),
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
            PH(x + 10, y + 10, cw - 20, 150, str(it.img, 'Card image'), { radius: 10 }),
            T(x + 18, y + 176, cw - 36, str(it.title, 'Card title'), { size: 18, weight: 700 }),
            T(x + 18, y + 206, cw - 36, str(it.text, ''), { size: 14, color: '#71717a', lh: 1.4 }),
          ];
        }),
      ];
    },
  },
  Header: {
    icon: 'globe',
    web: true,
    make: (W, o) => {
      const links = strs(o.links, ['Product', 'Pricing', 'About', 'Blog']),
        M = 64;
      return [
        B(0, 0, W, 80, { fill: '#ffffff' }),
        T(M, 26, 260, str(o.logo, str(o.title, 'Brand')), { size: 22, weight: 800 }),
        ...links
          .slice(0, 5)
          .map((l, i) =>
            T(W / 2 - links.length * 55 + i * 110, 30, 110, l, { size: 15, align: 'center', color: '#52525b' }),
          ),
        B(W - M - 150, 18, 150, 44, { fill: '#18181b', radius: 22 }),
        T(W - M - 150, 30, 150, str(o.cta, 'Get started'), {
          size: 14,
          weight: 600,
          color: '#ffffff',
          align: 'center',
        }),
        B(0, 79, W, 1, { fill: '#e4e4e7' }),
      ];
    },
  },
  Hero: {
    icon: 'rows',
    web: true,
    make: (W, o) => {
      const M = 64,
        cw = (W - M * 2) * 0.48,
        h = 600,
        t = T(M, 120, cw, str(o.title, 'A big, clear promise goes right here'), { size: 56, weight: 800, lh: 1.1 }),
        sub = T(M, 120 + t.h + 24, cw, str(o.text, 'One or two sentences that say who it is for and why it helps.'), {
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
        T(M, by + 15, 170, str(o.cta, 'Get started'), { size: 16, weight: 600, color: '#ffffff', align: 'center' }),
        B(M + 186, by, 160, 52, { fill: '#ffffff', stroke: '#18181b', sw: 1.5, radius: 26 }),
        T(M + 186, by + 15, 160, str(o.cta2, 'Learn more'), { size: 16, weight: 600, align: 'center' }),
        PH(W / 2 + 16, 72, W / 2 - M - 16, h - 144, str(o.img, 'Hero image'), { radius: 28 }),
      ];
    },
  },
  Features: {
    icon: 'columns',
    web: true,
    make: (W, o) => {
      const M = 64,
        items = recs(o.items, [
          { icon: 'bolt', title: 'Fast', text: 'Say what makes it quick.' },
          { icon: 'heart', title: 'Friendly', text: 'Say why people enjoy it.' },
          { icon: 'lock', title: 'Safe', text: 'Say why they can trust it.' },
        ]).slice(0, 4),
        n = items.length,
        gap = 32,
        cw = (W - M * 2 - gap * (n - 1)) / n;
      const title = T(M, 96, W - M * 2, str(o.title, 'Why people love it'), { size: 36, weight: 800, align: 'center' }),
        y0 = 96 + title.h + 56;
      let tall = 0;
      const cols = items.flatMap((it, i) => {
        const x = M + i * (cw + gap),
          tt = T(x, y0 + 72, cw, str(it.title, 'Feature'), { size: 20, weight: 700 }),
          tx = T(x, y0 + 72 + tt.h + 8, cw, str(it.text, ''), { size: 15, color: '#71717a', lh: 1.5 });
        tall = Math.max(tall, 72 + tt.h + 8 + tx.h);
        return [
          B(x, y0, 52, 52, { fill: '#f4f4f5', radius: 14 }),
          IC(x + 14, y0 + 14, str(it.icon, 'star'), 24),
          tt,
          tx,
        ];
      });
      return [B(0, 0, W, y0 + tall + 96, { fill: '#ffffff' }), title, ...cols];
    },
  },
  Stats: {
    icon: 'insights',
    web: true,
    make: (W, o) => {
      const M = 64,
        items = recs(o.items, [
          { value: '10k+', label: 'happy people' },
          { value: '4.9', label: 'average rating' },
          { value: '24/7', label: 'support' },
        ]).slice(0, 4),
        cw = (W - M * 2) / items.length;
      return [
        B(0, 0, W, 220, { fill: '#f4f4f5' }),
        ...items.flatMap((it, i) => [
          T(M + i * cw, 60, cw, str(it.value, '100'), { size: 48, weight: 800, align: 'center' }),
          T(M + i * cw, 128, cw, str(it.label, ''), { size: 15, color: '#71717a', align: 'center' }),
        ]),
      ];
    },
  },
  Testimonials: {
    icon: 'quotes',
    web: true,
    make: (W, o) => {
      const M = 64,
        items = recs(o.items, [
          { quote: 'A short, warm quote from a happy customer.', name: 'Alex Kim' },
          { quote: 'Another quote about what changed for them.', name: 'Sam Rivera' },
          { quote: 'One more, short and specific.', name: 'Jo Patel' },
        ]).slice(0, 3),
        gap = 24,
        cw = (W - M * 2 - gap * (items.length - 1)) / items.length;
      const title = T(M, 96, W - M * 2, str(o.title, 'What people say'), { size: 36, weight: 800, align: 'center' }),
        y0 = 96 + title.h + 48;
      return [
        B(0, 0, W, y0 + 280 + 96, { fill: '#ffffff' }),
        title,
        ...items.flatMap((it, i) => {
          const x = M + i * (cw + gap);
          return [
            B(x, y0, cw, 280, { fill: '#f4f4f5', radius: 20 }),
            IC(x + 28, y0 + 28, 'quotes', 32, { color: '#a1a1aa' }),
            T(x + 28, y0 + 72, cw - 56, '“' + str(it.quote, '') + '”', { size: 17, lh: 1.5 }),
            PH(x + 28, y0 + 208, 44, 44, str(it.name, 'Person') + ' portrait', { radius: 22 }),
            T(x + 84, y0 + 220, cw - 112, str(it.name, 'Name'), { size: 15, weight: 700 }),
          ];
        }),
      ];
    },
  },
  Pricing: {
    icon: 'tag',
    web: true,
    make: (W, o) => {
      const M = 64,
        plans = recs(o.plans, [
          { name: 'Starter', price: 'Free', features: ['The basics', 'One project'] },
          {
            name: 'Pro',
            price: '$12/mo',
            features: ['Everything in Starter', 'Unlimited projects', 'Priority help'],
          },
          { name: 'Team', price: '$29/mo', features: ['Everything in Pro', 'Shared spaces'] },
        ]).slice(0, 3),
        gap = 24,
        cw = Math.min(360, (W - M * 2 - gap * (plans.length - 1)) / plans.length),
        x0 = (W - (cw * plans.length + gap * (plans.length - 1))) / 2;
      const title = T(M, 96, W - M * 2, str(o.title, 'Simple pricing'), { size: 36, weight: 800, align: 'center' }),
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
            T(x + 28, y0 + 28, cw - 56, str(pl.name, 'Plan'), {
              size: 18,
              weight: 700,
              color: hot ? '#ffffff' : '#27272a',
            }),
            T(x + 28, y0 + 62, cw - 56, str(pl.price, '$0'), {
              size: 40,
              weight: 800,
              color: hot ? '#ffffff' : '#18181b',
            }),
            ...strs(pl.features, [])
              .slice(0, 5)
              .map((f, k) =>
                T(x + 28, y0 + 130 + k * 30, cw - 56, '✓  ' + f, { size: 15, color: hot ? '#e4e4e7' : '#52525b' }),
              ),
            B(x + 28, y0 + ch - 76, cw - 56, 48, { fill: hot ? '#ffffff' : '#18181b', radius: 24 }),
            T(x + 28, y0 + ch - 62, cw - 56, str(pl.cta, 'Choose ') + str(pl.name, 'plan'), {
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
    web: true,
    make: (W, o) => {
      const M = 64,
        imgs = strs(o.imgs, ['Photo one', 'Photo two', 'Photo three', 'Photo four', 'Photo five', 'Photo six']).slice(
          0,
          9,
        ),
        cols = 3,
        gap = 20,
        cw = (W - M * 2 - gap * (cols - 1)) / cols,
        rh = cw * 0.72;
      const title = T(M, 96, W - M * 2, str(o.title, 'A closer look'), { size: 36, weight: 800, align: 'center' }),
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
    web: true,
    make: (W, o) => {
      const M = 64,
        n = 5,
        cw = (W - M * 2 - 32 * (n - 1)) / n;
      return [
        B(0, 0, W, 170, { fill: '#ffffff' }),
        T(M, 40, W - M * 2, str(o.title, 'Trusted by teams everywhere'), {
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
    web: true,
    make: (W, o) => {
      const M = 64,
        t = T(M + 64, 80, W - M * 2 - 128, str(o.title, 'Ready to start?'), {
          size: 40,
          weight: 800,
          align: 'center',
          color: '#ffffff',
        }),
        sub = T(M + 64, 80 + t.h + 16, W - M * 2 - 128, str(o.text, 'One last nudge, in one line.'), {
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
        T(W / 2 - 90, by + 15, 180, str(o.cta, 'Get started'), {
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
    web: true,
    make: (W, o) => {
      const M = 64,
        cols: [string, string[]][] = Array.isArray(o.cols)
          ? o.cols.map(c => (Array.isArray(c) ? [str(c[0]), strs(c[1], [])] : [str(c), []]))
          : [
              ['Product', ['Features', 'Pricing', 'Updates']],
              ['Company', ['About', 'Careers', 'Press']],
              ['Help', ['Support', 'Contact', 'Privacy']],
            ];
      return [
        B(0, 0, W, 300, { fill: '#f4f4f5' }),
        T(M, 64, 300, str(o.logo, 'Brand'), { size: 22, weight: 800 }),
        T(M, 100, 300, str(o.text, 'A one-line sign-off.'), { size: 14, color: '#71717a' }),
        ...cols
          .slice(0, 4)
          .flatMap(([h, ls], i) => [
            T(W - M - (cols.length - i) * 180, 64, 160, h, { size: 14, weight: 700 }),
            ...ls
              .slice(0, 4)
              .map((l, k) => T(W - M - (cols.length - i) * 180, 98 + k * 28, 160, l, { size: 14, color: '#71717a' })),
          ]),
        B(M, 240, W - M * 2, 1, { fill: '#e4e4e7' }),
        T(M, 258, 400, str(o.copy, '© 2026 ') + str(o.logo, 'Brand'), { size: 12, color: '#a1a1aa' }),
      ];
    },
  },
};
