// What Myra looks like while she is busy: where her eyes go and the prop she holds for each kind of work, drawn in
// pixels with her as her party hat is. A prop slides in from below as the work starts and away as it ends.

export type BusyLook = 'thinking' | 'reading' | 'painting' | 'writing' | 'explaining' | 'building';

// t: seconds. out: 0 when the prop is fully out, 1 when it is put away. still: calm or reduced motion, so nothing moves
export type BusyPaint = {
  g: CanvasRenderingContext2D;
  t: number;
  ox: number;
  oy: number;
  px: number;
  mute: (hex: string) => string;
  still: boolean;
  out: number;
};

// rows of pixels, each character a colour from `pal`, anything else left empty; x and y in her grid's cells
function sprite(p: BusyPaint, rows: string[], pal: Record<string, string>, x: number, y: number, u = p.px) {
  rows.forEach((row, ry) => {
    [...row].forEach((c, rx) => {
      const hex = pal[c];
      if (!hex) return;
      p.g.fillStyle = p.mute(hex);
      p.g.fillRect(p.ox + x * p.px + rx * u, p.oy + y * p.px + ry * u, u, u);
    });
  });
}

const cell = (p: BusyPaint, hex: string, x: number, y: number, w: number, h: number) => {
  p.g.fillStyle = p.mute(hex);
  p.g.fillRect(p.ox + x * p.px, p.oy + y * p.px, w * p.px, h * p.px);
};

/** Where her eyes go for a look, in cells from where they rest. */
export function busyEyes(look: BusyLook, t: number, still: boolean): { dx: number; dy: number } {
  switch (look) {
    case 'thinking':
      return { dx: 1, dy: -0.5 };
    case 'reading':
    case 'explaining': {
      if (still) return { dx: 0, dy: 0.5 };
      // along a line left to right, then quickly back for the next
      const ph = (t * 0.7) % 1,
        along = ph < 0.85 ? ph / 0.85 : 1 - (ph - 0.85) / 0.15;
      return { dx: Math.round((along * 2 - 1) * 2) / 2, dy: 0.5 };
    }
    case 'painting':
      return { dx: -1, dy: 0.5 };
    case 'writing':
      return { dx: 0.5, dy: 0.5 };
    case 'building':
      return { dx: 0, dy: 0.5 };
    default: {
      const never: never = look;
      throw new Error(`unknown look ${String(never)}`);
    }
  }
}

/** Her sway for a look, in cells: a slow lean while she thinks, so a long wait reads as working, not fidgeting. */
export const busySway = (look: BusyLook | null, t: number, still: boolean) =>
  look === 'thinking' && !still ? Math.sin(t * 2.2) * 0.35 : 0;

const BOOK = ['WWWWddWWWW', 'WgggddgggW', 'WWWWddWWWW', 'WgggddgggW', 'CCCCCCCCCC'];
const BOOK_PAL = { W: '#fffaf0', g: '#cdbba0', d: '#9b6b4a', C: '#c0533e' };
const BRUSH = ['....TTT', '....TTT', '....fT.', '...hf..', '..hh...', '.hh....', 'hh.....'];
const PAINTS = ['#e5586d', '#5b7bd5', '#7cc95e', '#a77fd8'];
const PENCIL = ['....pp', '...bb.', '..bb..', '.bb...', 'ww....', 'k.....'];
const PENCIL_PAL = { p: '#f4a3b5', b: '#4f6fcf', w: '#e8c79a', k: '#3a3a3a' };
const LAPTOP = ['.LLLLLLLL.', 'LLLLLLLLLL', 'LLLLbbLLLL', 'LLLLLLLLLL'];
const LAPTOP_PAL = { L: '#9aa3ad', b: '#f6a63c' };
const INK = '#3d2a1e';
const FRAMES = '#45302a';

/** Draws the prop and the little extras for a look, over her face and body. */
export function drawBusy(look: BusyLook, p: BusyPaint) {
  const { g, t, still } = p,
    drop = p.out * 6;
  switch (look) {
    case 'thinking': {
      // a thought bubble over her head, its dots lit one after another
      g.globalAlpha = 1 - p.out;
      cell(p, '#ffffff', 12.4, 0.6, 0.8, 0.8);
      cell(p, '#ffffff', 13.4, -0.8, 1.2, 1.2);
      cell(p, '#d8cfc2', 10.8, -4.7, 5.4, 3.4);
      cell(p, '#fffdf7', 11, -4.5, 5, 3);
      const lit = Math.floor((t / 0.35) % 3);
      [11.8, 13.2, 14.6].forEach((x, i) => {
        g.globalAlpha = (1 - p.out) * (still ? 0.6 : i === lit ? 1 : 0.35);
        cell(p, '#8a7a6a', x, -3.4, 0.8, 0.8);
      });
      g.globalAlpha = 1;
      return;
    }
    case 'reading':
      // an open book held up, over her smile
      sprite(p, BOOK, BOOK_PAL, 3, 10.2 + drop);
      if (!still && t % 3.2 < 0.4) {
        // now and then a page turns, from the right-hand page to the left
        const k = (t % 3.2) / 0.4;
        cell(p, '#fffaf0', 7.5 - k * 3.5, 9.6 + drop, 2.5, 3);
      }
      return;
    case 'explaining': {
      // reading glasses, for reading the code
      g.globalAlpha = 1 - p.out;
      [3, 10].forEach(x => {
        g.globalAlpha = (1 - p.out) * 0.25;
        cell(p, '#ffffff', x, 7.2, 3, 3);
        g.globalAlpha = 1 - p.out;
        cell(p, FRAMES, x - 0.2, 7, 3.4, 0.45);
        cell(p, FRAMES, x - 0.2, 10.2, 3.4, 0.45);
        cell(p, FRAMES, x - 0.2, 7, 0.45, 3.65);
        cell(p, FRAMES, x + 2.75, 7, 0.45, 3.65);
      });
      cell(p, FRAMES, 6.2, 7.9, 3.8, 0.45);
      g.globalAlpha = 1;
      return;
    }
    case 'painting': {
      // a brush at her side, dabbing, and spots of the colours it has had
      const dab = still ? 0 : Math.sin(t * 7) * 0.4,
        now = Math.floor(t / 1.2),
        tip = PAINTS[now % PAINTS.length] ?? '#e5586d';
      sprite(p, BRUSH, { T: tip, f: '#c9ccd4', h: '#7a4a2a' }, -4.2, 9.8 + dab + drop);
      if (p.out > 0) return;
      const spots: [number, number][] = [
        [13.2, 3.4],
        [14.6, 5.8],
        [11.8, 1.6],
      ];
      spots.forEach(([x, y], i) => {
        g.globalAlpha = still ? 0.8 : Math.max(0, Math.sin(t * 2.6 + i * 1.7));
        cell(p, PAINTS[(now + i) % PAINTS.length] ?? '#5b7bd5', x, y, 0.9, 0.9);
      });
      g.globalAlpha = 1;
      return;
    }
    case 'writing': {
      // a sheet of paper in front of her and a pencil writing its second line
      const ph = still ? 0.6 : (t % 1.4) / 1.4,
        stroke = still ? 0 : Math.sin(t * 9) * 0.15;
      cell(p, '#d8cfc2', 6.8, 10.8 + drop, 6.4, 4.4);
      cell(p, '#fffaf0', 7, 11 + drop, 6, 4);
      cell(p, INK, 7.6, 12 + drop, 4.8, 0.35);
      cell(p, INK, 7.6, 13.4 + drop, ph * 4.8, 0.35);
      sprite(p, PENCIL, PENCIL_PAL, 7.6 + ph * 4.8, 13.6 - 4.8 + stroke + drop, p.px * 0.8);
      return;
    }
    case 'building': {
      // a laptop in front of her, its screen lighting her face, and bits of code rising off it as she types
      sprite(p, LAPTOP, LAPTOP_PAL, 3, 10.6 + drop);
      cell(p, '#6b737c', 2, 14 + drop, 12, 0.7);
      if (p.out > 0) return;
      g.globalAlpha = 0.16 + (still ? 0 : Math.sin(t * 3) * 0.06);
      cell(p, '#bfe3ff', 4, 8.6, 8, 2);
      if (!still)
        [0, 0.33, 0.66].forEach((o, i) => {
          const ph = (t / 1.6 + o) % 1;
          g.globalAlpha = Math.sin(ph * Math.PI);
          cell(p, i % 2 ? '#5b7bd5' : '#7cc95e', 4.5 + i * 3.2, 9.6 - ph * 5, 0.6, 0.6);
        });
      g.globalAlpha = 1;
      return;
    }
    default: {
      const never: never = look;
      throw new Error(`unknown look ${String(never)}`);
    }
  }
}
