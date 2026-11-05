import type { Card, Link } from '../../shared/model.ts';

// ---------- what the pointer is doing while a button is held: one of these at a time ----------
type Point = { x: number; y: number };
// a card being moved, where it started, and its element once it's lifted onto its own layer
type Moving = { c: Card; x: number; y: number; el?: HTMLElement | null; lifted?: boolean };
// a card in a group being resized, as it was when the resize began
type Sized = { c: Card; x: number; y: number; w: number; h: number; fs0?: number; size0?: number; sw0?: number };
// a card in a selection being turned: its middle, its size, its tilt before, and whether it's a wireframe piece
type Turning = { c: Card; mx: number; my: number; w: number; h: number; r0: number; wf: boolean };

// sx, sy: where the press began (world or screen, as each mode needs)
export type Drag =
  | { mode: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | {
      mode: 'move';
      sx: number;
      sy: number;
      start: Moving[];
      moved: boolean;
      cloned?: boolean;
      // the address of the link in a note the press began on, followed if the press is a tap
      link?: string;
    }
  | { mode: 'resize'; id: string; sx: number; sy: number; w0: number; h0: number; fs0: number }
  | {
      mode: 'gresize';
      sx: number;
      sy: number;
      bx: number;
      by: number;
      bw: number;
      bh: number;
      items: Sized[];
      multi?: boolean;
    }
  | {
      mode: 'mrotate';
      cx: number;
      cy: number;
      ang0: number;
      single: boolean;
      anchor: string;
      a0: number;
      dot0: Point;
      items: Turning[];
      cur?: number;
    }
  | { mode: 'rotate'; c: Card; cx: number; cy: number; tilt: boolean }
  | { mode: 'wire'; id: string; a: Point; b?: Point }
  | { mode: 'drawbox'; sx: number; sy: number; rect?: HTMLElement }
  | { mode: 'bend'; l: Link }
  | { mode: 'rewire'; l: Link; end: 'a' | 'b' }
  | { mode: 'marquee'; sx: number; sy: number; base: Set<string>; sec?: string };
