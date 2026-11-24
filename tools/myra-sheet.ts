// Draws Myra's sprite in each busy look and each pose as one sheet, so new art can be looked at and reviewed: the
// visual diff hides every canvas, since she moves. Each row is a look or a pose at three moments, then still (calm) and
// with no room for a prop. Writes the PNG to the path given, or myra-sheet.png.
//   node tools/myra-sheet.ts [out.png]
import fs from 'node:fs';
import { launch } from '../tests/support/launch.ts';

const out = process.argv[2] ?? 'myra-sheet.png';
const l = await launch();
try {
  const png = await l.page.evaluate(() => {
    type Sprite = ReturnType<typeof window.Goo>;
    const LOOKS = ['thinking', 'reading', 'explaining', 'painting', 'writing', 'building'] as const;
    const POSES = ['sleepy', 'shook', 'sigh', 'happy', 'love', 'dizzy', 'curious'] as const;
    const COLS: [name: string, ms: number][] = [
      ['0.2 s', 200],
      ['0.9 s', 900],
      ['1.6 s', 1600],
      ['calm', 200],
      ['no room', 900],
    ];
    const rows: [name: string, set: (goo: Sprite) => void][] = [
      ['resting', () => {}],
      ...LOOKS.map((n): [string, (goo: Sprite) => void] => [n, goo => goo.busy(n)]),
      ...POSES.map((n): [string, (goo: Sprite) => void] => [n, goo => goo.pose(n)]),
    ];
    const SCALE = 3,
      W = 64,
      H = 80,
      LABEL = 90,
      HEAD = 24;
    const sheet = document.createElement('canvas');
    sheet.width = LABEL + COLS.length * W * SCALE;
    sheet.height = HEAD + rows.length * H * SCALE;
    const g = sheet.getContext('2d');
    if (!g) throw new Error('no 2D canvas');
    g.fillStyle = '#fbf7ef';
    g.fillRect(0, 0, sheet.width, sheet.height);
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#3d2a1e';
    g.font = '13px sans-serif';
    COLS.forEach(([c], i) => {
      g.fillText(c, LABEL + i * W * SCALE + 8, 16);
    });
    // a time just after a blink, so no column catches her eyes shut
    const base = Math.ceil((performance.now() + 1000) / 3300) * 3300;
    rows.forEach(([name, set], r) => {
      const y = HEAD + r * H * SCALE;
      g.fillStyle = '#3d2a1e';
      g.fillText(name, 8, y + 40);
      COLS.forEach(([col, ms], i) => {
        const c = document.createElement('canvas');
        c.width = W;
        c.height = 56;
        const goo = window.Goo(c, { headroom: 8, manual: true });
        set(goo);
        if (col === 'no room') goo.room(false);
        window.myraCalm = col === 'calm';
        goo.draw(base + ms);
        window.myraCalm = false;
        g.drawImage(c, LABEL + i * W * SCALE, y, W * SCALE, c.height * SCALE);
      });
    });
    return sheet.toDataURL('image/png');
  });
  fs.writeFileSync(out, Buffer.from(png.split(',')[1] ?? '', 'base64'));
  console.log(`wrote ${out}`);
} finally {
  await l.close();
}
