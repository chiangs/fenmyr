// Takes the README's screenshots of the app into assets/readme/, in light and dark: the example board, "My first board",
// and a prototype board after one build, with the stand-in Claude Code the visual diff uses (tools/visual-proto.ts).
//
//   npm run build && node tools/readme-shots.ts
//
// Each is shot at twice the size of a 1440 × 900 window and scaled to 1760 px wide, which is GitHub's README column at
// twice its pixels. The stand-in writes back the code that was there, so the preview shows the starter page; a shot of
// a real build is taken by hand.
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { type Board, launch, settle } from '../tests/support/launch.ts';
import { openPrototype, PROTO_GROUPS, removeProtoFolders } from './visual-proto.ts';

const OUT = path.resolve(import.meta.dirname, '..', 'assets', 'readme');
const WIDTH = 1760;
const SCREEN = ['--force-device-scale-factor=2', '--ozone-override-screen-size=2880,1800'];
// the app opens on a board, so it needs one before the example is made; it shows in the sidebar beside it
const FIRST: Board = {
  id: 'trip',
  name: 'Trip notes',
  cards: [{ id: 'n1', type: 'note', x: 0, y: 0, w: 200, h: 120, text: 'Bog boots' }],
  links: [],
  tray: [],
};
const MODES = ['light', 'dark'] as const;

async function save(page: Page, name: string) {
  const shot = await page.screenshot();
  const url = `data:image/png;base64,${shot.toString('base64')}`;
  const small = await page.evaluate(
    async ({ url, width }) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = width;
      c.height = Math.round((img.height * width) / img.width);
      const g = c.getContext('2d');
      if (!g) throw new Error('no 2D canvas');
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/png');
    },
    { url, width: WIDTH },
  );
  const file = path.join(OUT, `${name}.png`);
  fs.writeFileSync(file, Buffer.from(small.split(',')[1] ?? '', 'base64'));
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
}

async function opened(theme: string, env?: Record<string, string>) {
  const l = await launch({ boards: [FIRST], open: FIRST.id, settings: { theme }, flags: SCREEN, env });
  await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1440, 900));
  await settle(l.page);
  return l;
}

async function exampleBoard(theme: string) {
  const l = await opened(theme);
  try {
    await l.page.evaluate(() => window.__fenmyr.createExample());
    // sleeps on purpose: the new board fits itself to the window after it opens, and nothing says when that is done
    await settle(l.page, 1500);
    await save(l.page, `board-${theme}`);
  } finally {
    await l.close();
  }
}

async function prototypeBoard(theme: string) {
  const group = PROTO_GROUPS['proto-build'];
  const built = group?.states.find(([name]) => name === 'built')?.[1];
  if (!group || !built) throw new Error('tools/visual-proto.ts has no built state to start from');
  const l = await opened(theme, group.env);
  try {
    await openPrototype(l.page);
    await built(l.page);
    // sleeps on purpose: the preview frame renders after the build's block, and nothing in the app's page says when
    await settle(l.page, 1500);
    await save(l.page, `proto-built-${theme}`);
  } finally {
    await l.close();
  }
}

fs.mkdirSync(OUT, { recursive: true });
try {
  for (const mode of MODES) await exampleBoard(mode);
  for (const mode of MODES) await prototypeBoard(mode);
} finally {
  removeProtoFolders();
}
