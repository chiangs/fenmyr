import type { Pose } from './goo.ts';

// The little extras each of Myra's poses draws around her face, and her party hat, in pixels.

// t: seconds; ox and oy: the top left of her grid; px: one of its cells; mute: her colours softened for calmest
export type PosePaint = {
  g: CanvasRenderingContext2D;
  t: number;
  ox: number;
  oy: number;
  px: number;
  mute: (hex: string) => string;
};

/** What a pose adds around her: a question mark, sparkles, hearts, stars, Zs or a puff of air. sighPh: the sigh's frame. */
export function drawPoseExtras(pose: Pose, { g, t, ox, oy, px, mute, sighPh }: PosePaint & { sighPh: number }) {
  if (pose === 'curious') {
    // a question mark bobs above her
    const bob = Math.sin(t * 5) * 0.6,
      q = ['XXX', '..X', '.X.', '...', '.X.'],
      u = Math.max(1, px * 1.05);
    g.fillStyle = mute('#5b7bd5');
    g.globalAlpha = 0.75 + Math.sin(t * 5) * 0.25;
    q.forEach((row, ry) => {
      [...row].forEach((c, rx) => {
        if (c === 'X') g.fillRect(ox + 11.5 * px + rx * u, oy - 1 * px + bob * px + ry * u, u, u);
      });
    });
    g.globalAlpha = 1;
  }
  if (pose === 'happy') {
    // sparkles twinkle around her
    g.fillStyle = mute('#fff3b0');
    const sparkles: [number, number, number][] = [
      [1, 3, 0],
      [14, 5, 1.4],
      [15, 10, 2.8],
    ];
    sparkles.forEach(([x, y, o]) => {
      const a = Math.max(0, Math.sin(t * 6 + o));
      g.globalAlpha = a;
      g.fillRect(ox + x * px, oy + (y - 1) * px, px * 0.8, px * 2.6);
      g.fillRect(ox + (x - 1) * px, oy + y * px, px * 2.8, px * 0.8);
    });
    g.globalAlpha = 1;
  }
  if (pose === 'love') {
    // little hearts float up
    g.fillStyle = mute('#e5586d');
    [0, 0.5].forEach((o, i) => {
      const ph = (t / 2 + o) % 1,
        u = Math.max(1, px * 0.6),
        hx = ox + (i ? 2 : 12) * px,
        hy = oy + (3 - ph * 5) * px;
      g.globalAlpha = Math.sin(ph * Math.PI);
      g.fillRect(hx, hy, u, u);
      g.fillRect(hx + u * 2, hy, u, u);
      g.fillRect(hx, hy + u, u * 3, u);
      g.fillRect(hx + u, hy + u * 2, u, u);
    });
    g.globalAlpha = 1;
  }
  if (pose === 'dizzy') {
    // stars circle her head
    g.fillStyle = mute('#f2c94c');
    for (let i = 0; i < 3; i++) {
      const a = t * 4 + i * 2.1;
      g.fillRect(ox + (8 + Math.cos(a) * 5.5) * px - px * 0.5, oy + (2.5 + Math.sin(a) * 1.2) * px, px * 1.2, px * 1.2);
    }
  }
  if (pose === 'sleepy') {
    // little Zs drift up and fade
    const z = (x: number, y: number, u: number) => {
      g.fillRect(x, y, u * 3, u);
      g.fillRect(x + u, y + u, u, u);
      g.fillRect(x, y + u * 2, u * 3, u);
    };
    g.fillStyle = mute('#3b6ea5');
    [0, 0.5].forEach((o, i) => {
      const ph = (t / 2.6 + o) % 1;
      g.globalAlpha = Math.sin(ph * Math.PI);
      z(ox + (12 + i * 2) * px, oy + (2 - ph * 5) * px, Math.max(1, px * (i ? 0.6 : 0.9)));
    });
    g.globalAlpha = 1;
  }
  if (pose === 'sigh' && sighPh === 1) {
    // the puff of air
    g.fillStyle = mute('#b8a898');
    g.fillRect(ox + 14 * px, oy + 8 * px, px * 3.5, px * 3.5);
    g.fillStyle = mute('#c8dcf0');
    g.fillRect(ox + 14.5 * px, oy + 8.5 * px, px * 2.5, px * 2.5);
  }
}

/** A party hat, tipped to one side: lilac with cream stripes and a pompom. */
export function drawHat({ g, ox, oy, px, mute }: PosePaint) {
  // a party hat, tipped to one side: lilac with cream stripes and a pompom
  const u = Math.max(1, px * 1.25),
    cone = ['..P..', '.LLL.', '.LSL.', 'LLLLL', 'LSLSL'],
    hx = ox + 8.4 * px,
    hy = oy - 3.6 * px;
  cone.forEach((row, ry) => {
    [...row].forEach((c, rx) => {
      if (c === '.') return;
      g.fillStyle = mute(c === 'L' ? '#a98bdc' : c === 'S' ? '#ffe2a8' : '#ffe2a8');
      g.fillRect(hx + rx * u, hy + ry * u, u, u);
    });
  });
}
