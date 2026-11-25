import { type BusyLook, busyEyes, busySway, drawBusy } from './gooBusy.ts';
import { grid } from './gooPixels.ts';
import { drawHat, drawPoseExtras } from './gooPoses.ts';
import { mix } from './gooShapes.ts';

// Myra in pixels: a little cloudberry (a bumpy cluster of golden beads with a leafy crown, ink eyes and blush).
// She breathes, blinks, glances around, hops when she does something, and has a look of her own for each kind of work.
// The art is Myra's own (see TRADEMARKS.md). The API is the one the app has always used: Goo(canvas, opts) → { hop, busy, room, wiggle, pose, hat, lively, setColors, draw }.

export type Pixel = 'B' | 'S' | 's' | 'D' | 'd' | 'L' | 'l';
export type GooColors = { B: string; S: string; D: string; L?: string; l?: string };
export type Pose = 'sleepy' | 'shook' | 'sigh' | 'happy' | 'love' | 'dizzy' | 'curious';
// headroom: rows of room above her; manual: the caller draws her
type GooOptions = { headroom?: number; colors?: GooColors; manual?: boolean };

function context2d(canvas: HTMLCanvasElement) {
  const g = canvas.getContext('2d');
  if (!g) throw new Error('no 2D canvas for Myra');
  return g;
}

export function Goo(canvas: HTMLCanvasElement, opts: GooOptions = {}) {
  const GW = 16,
    GH = 15,
    W = canvas.width,
    H0 = canvas.height,
    px0 = Math.max(1, Math.floor(Math.min(W / (GW + 1), H0 / (GH + 1))));
  if (opts.headroom) {
    // rows of room above her (kept so callers that ask for it still line up)
    const cs = getComputedStyle(canvas),
      k = (parseFloat(cs.height) || H0) / H0,
      extra = opts.headroom * px0;
    canvas.height = H0 + extra;
    canvas.style.height = `${(H0 + extra) * k}px`;
    canvas.style.marginTop = `calc(${cs.marginTop || '0px'} - ${extra * k}px)`;
  }
  const g = context2d(canvas),
    H = canvas.height;
  let col: GooColors = opts.colors || { B: '#f6a63c', S: '#ffe0a0', D: '#de8526' },
    pal: Record<Pixel, string> | null = null;
  const palette = (): Record<Pixel, string> =>
    pal ||
    (pal = {
      B: col.B,
      S: col.S,
      s: mix(col.B, col.S, 0.45),
      D: col.D,
      d: mix(col.D, '#000000', 0.22),
      L: col.L || '#7cc95e',
      l: col.l || '#3f8f3c',
    }); // a color can bring its own leaves (a green Myra gets teal ones, so the crown still shows);
  let hopT = -9,
    // the work she is busy with, the one before it (whose prop is being put away) and when it changed
    busy: BusyLook | null = null,
    busyWas: BusyLook | null = null,
    busyAt = -9,
    // room for a prop; a narrow docked chat has none
    room = true,
    look = 0,
    lookTo = 0,
    nextLook = 0,
    pose: Pose | null = null,
    showOff = false,
    wiggleUntil = 0,
    hatOn = false; // pose: 'sleepy' | 'shook' | 'sigh' | 'happy' | 'love' | 'dizzy' | 'curious' | null; showOff: move even in calm mode (when someone asked her to)
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  // Calmest: her colors softened toward a gentle gray (kept light so she still reads as her color)
  const mutedCache = new Map<string, string>();
  const mute = (hex: string) => {
    if (!window.myraMuted || !/^#[0-9a-f]{6}$/i.test(hex)) return hex;
    const known = mutedCache.get(hex);
    if (known) return known;
    const n = parseInt(hex.slice(1), 16),
      r = (n >> 16) & 255,
      gg = (n >> 8) & 255,
      b = n & 255,
      y = 0.3 * r + 0.59 * gg + 0.11 * b,
      k = 0.7;
    const out =
      '#' +
      [r, gg, b]
        .map(v =>
          Math.round(v + (y + (238 - y) * 0.25 - v) * k)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('');
    mutedCache.set(hex, out);
    return out;
  };
  function frame(now: number) {
    const t = now / 1000,
      px = px0,
      P = palette();
    g.clearRect(0, 0, W, H);
    if (t > nextLook) {
      lookTo = [-1, 0, 0, 1][Math.floor(Math.random() * 4)] ?? 0;
      nextLook = t + 1.5 + Math.random() * 2.5;
    }
    look += (lookTo - look) * 0.2;
    // calm and the system's reduced motion both keep her still, apart from blinking; a prop stays, still
    const calm = (window.myraCalm || reduced.matches) && !showOff,
      slid = calm ? 1 : Math.min(1, (t - busyAt) / 0.25),
      hp = t - hopT,
      lift = !calm && hp < 0.45 ? Math.sin((hp / 0.45) * Math.PI) * 3 : 0; // calm: she sits still (she still blinks)
    const sighPh = pose === 'sigh' ? Math.floor((t % 0.78) / 0.26) : 0; // the sigh runs normal, sigh, normal at 260 ms a frame, like her stamp
    // each face has its own motion: shook trembles, sleepy breathes slow and deep, and she deflates a little mid-sigh
    const wig =
      t * 1000 < wiggleUntil && !calm
        ? Math.sin(t * 14) * 0.6
        : busy && !pose
          ? busySway(busy, t, calm)
          : pose === 'shook' && !calm
            ? Math.sin(t * 38) * 0.55
            : pose === 'dizzy'
              ? Math.sin(t * 5) * 0.8
              : 0;
    const breathe = calm
      ? 0
      : pose === 'sleepy'
        ? Math.sin(t * 1.3) * 0.07
        : pose === 'sigh' && sighPh === 1
          ? -0.06
          : pose === 'happy'
            ? Math.abs(Math.sin(t * 7)) * 0.07
            : Math.sin(t * 2.4) * 0.04;
    if (calm) look = 0;
    const ox = (W - GW * px) / 2 + wig * px * 0.5,
      oy = H - GH * px - Math.round(lift) * px;
    g.save();
    g.translate(W / 2, H);
    if (pose === 'curious') g.rotate(Math.sin(t * 2.4) * 0.1);
    g.scale(1 - breathe * 0.5, 1 + breathe);
    g.translate(-W / 2, -H); // curious: her head tilts one way and the other
    grid.forEach((row, y) => {
      row.forEach((c, x) => {
        if (c) {
          g.fillStyle = mute(P[c]);
          g.fillRect(ox + x * px, oy + y * px, px, px);
        }
      });
    });
    const blink = t % 3.3 > 3.15,
      ex = Math.round(look),
      ink = mute('#2a1708');
    const closed = pose === 'sleepy' || (pose === 'sigh' && sighPh === 1);
    if (pose === 'shook') {
      // wide white eyes, a round open mouth, a sweat drop
      g.fillStyle = mute('#ffffff');
      [3, 10].forEach(c => {
        g.fillRect(ox + c * px, oy + 7 * px, px * 2, px * 3);
      });
      g.fillStyle = ink;
      [4, 11].forEach(c => {
        g.fillRect(ox + c * px, oy + 8 * px, px, px);
      });
      g.fillRect(ox + 7 * px, oy + 11 * px, px * 2, px * 2);
      g.fillStyle = mute('#c8dcf0');
      g.fillRect(ox + 14.5 * px, oy + (3.5 + Math.sin(t * 5) * 0.4) * px, px * 1.3, px * 2.4);
    } else if (pose === 'curious') {
      // eyes looking up and over, at the question mark
      g.fillStyle = ink;
      [4, 11].forEach(c => {
        g.fillRect(ox + (c + 1) * px, oy + 7.2 * px, px, px * 2);
      });
    } else if (pose === 'happy') {
      // beaming: eyes as arches
      g.fillStyle = ink;
      [4, 11].forEach(c => {
        g.fillRect(ox + (c - 1) * px, oy + 9 * px, px, px);
        g.fillRect(ox + c * px, oy + 8 * px, px, px);
        g.fillRect(ox + (c + 1) * px, oy + 9 * px, px, px);
      });
    } else if (pose === 'love') {
      // heart eyes
      g.fillStyle = mute('#e5586d');
      [3, 10].forEach(c => {
        g.fillRect(ox + c * px, oy + 7.5 * px, px, px);
        g.fillRect(ox + (c + 2) * px, oy + 7.5 * px, px, px);
        g.fillRect(ox + c * px, oy + 8.5 * px, px * 3, px);
        g.fillRect(ox + (c + 1) * px, oy + 9.5 * px, px, px);
      });
    } else if (pose === 'dizzy') {
      // x eyes
      g.fillStyle = ink;
      [4, 11].forEach(c => {
        const crosses: [number, number][] = [
          [-1, 7],
          [1, 7],
          [0, 8],
          [-1, 9],
          [1, 9],
        ];
        crosses.forEach(([dx, r]) => {
          g.fillRect(ox + (c + dx) * px, oy + r * px, px, px);
        });
      });
    } else if (closed) {
      // eyes shut: sleepy, or mid-sigh
      g.fillStyle = ink;
      [3, 10].forEach(c => {
        g.fillRect(ox + c * px, oy + 8.5 * px, px * 3, px * 0.9);
      });
    } else {
      const e = busy ? busyEyes(busy, t, calm) : { dx: ex, dy: 0 };
      g.fillStyle = ink;
      [4, 11].forEach(c => {
        g.fillRect(ox + (c + e.dx) * px, oy + (blink ? 8.5 : 8 + e.dy) * px, px, blink ? px * 0.4 : px * 2);
      });
    }
    g.fillStyle = mute('#ff8fa8');
    [2, 13].forEach(c => {
      g.fillRect(ox + c * px, oy + 10 * px, px, px);
    });
    if (pose === 'curious') {
      g.fillStyle = ink;
      g.fillRect(ox + 7.5 * px, oy + 11 * px, px, px);
    } // a small round mouth
    else if (pose === 'happy') {
      g.fillStyle = ink;
      g.fillRect(ox + 6 * px, oy + 11 * px, px * 4, px);
      g.fillRect(ox + 7 * px, oy + 12 * px, px * 2, px);
    } // a big open smile
    else if (pose === 'dizzy') {
      g.fillStyle = mute(P.d);
      [6, 8, 10].forEach((c, i) => {
        g.fillRect(ox + (c - 0.5) * px, oy + (11 + (i % 2) * 0.6) * px, px * 1.3, px * 0.8);
      });
    } // a wobbly mouth
    else if (pose !== 'shook') {
      g.fillStyle = mute(P.d);
      if (pose === 'sigh') g.fillRect(ox + 6.5 * px, oy + 11 * px, px * 3, px);
      else g.fillRect(ox + 7 * px, oy + 11 * px, px * 2, px);
    } // a small smile
    const paint = { g, t, ox, oy, px, mute };
    if (pose) drawPoseExtras(pose, { ...paint, sighPh });
    if (room) {
      if (busy) drawBusy(busy, { ...paint, still: calm, out: 1 - slid });
      if (busyWas && slid < 1) drawBusy(busyWas, { ...paint, still: calm, out: slid });
    }
    if (hatOn) drawHat(paint);
    g.restore();
  }
  // she only draws while she's on screen, 30 times a second (plenty for chunky pixels)
  let seen = true,
    lastDraw = 0;
  if (!opts.manual && window.IntersectionObserver)
    new IntersectionObserver(es => {
      seen = es.at(-1)?.isIntersecting ?? seen;
    }).observe(canvas);
  const loop = (now: number) => {
    if (seen && now - lastDraw >= 32) {
      lastDraw = now;
      frame(now);
    }
    requestAnimationFrame(loop);
  };
  if (!opts.manual) requestAnimationFrame(loop); // manual: the caller draws her (the favicon runs on a timer, which keeps going in background tabs)
  return {
    hop() {
      hopT = performance.now() / 1000;
    },
    /** The work she is busy with, which gives her its look, or null when she isn't. */
    busy(look: BusyLook | null) {
      if (look === busy) return;
      busyWas = busy;
      busy = look;
      busyAt = performance.now() / 1000;
    },
    busyLook: () => busy,
    room(on: boolean) {
      room = on;
    },
    roomy: () => room,
    wiggle(ms: number) {
      wiggleUntil = performance.now() + ms;
    },
    lively(on: boolean) {
      showOff = !!on;
    },
    pose(p?: Pose | null) {
      pose = p || null;
    },
    hat(on: boolean) {
      hatOn = !!on;
    },
    setColors(c: GooColors) {
      col = c;
      pal = null;
    },
    // at: a time on performance.now()'s clock, for a frame that is the same every time it is drawn
    draw(at = performance.now()) {
      frame(at);
    },
  };
}

window.Goo = Goo;
