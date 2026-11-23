import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Page } from 'playwright';
import { everyOfflineCard, richNotes } from '../tests/fixtures/boards.ts';
import { appCopy } from '../tests/support/appCopy.ts';
import { launch, ROOT, settle } from '../tests/support/launch.ts';
import { checkout } from '../tests/support/ref.ts';
import { CHANNEL_GROUPS } from './visual-channels.ts';
import { type Group, MYRA_GROUPS, type Step } from './visual-myra.ts';
import { NEW_PROJECT_GROUPS } from './visual-newproject.ts';
import { openPrototype, PROTO_GROUPS, removeProtoFolders } from './visual-proto.ts';
import { WIREFRAME_GROUPS } from './visual-wireframe.ts';

const FROZEN_MOTION =
  '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }';
const HIDDEN_RANDOM_CANVASES = 'canvas { visibility: hidden !important; }';
const HIDDEN_UPDATE_STATE = '#suSub, #upBar { visibility: hidden !important; }';
const HIDDEN_TIMED_BUBBLE = '#mBubble { visibility: hidden !important; }';
const STRAY_PIXELS = 60;
// scaled card edges land a pixel apart from run to run at this zoom; same code measured 900 to 1,600, a layout change 268,000
const STRAY_PIXELS_SCALED: Record<string, number> = { 'zoom-out.png': 3000 };
const CHANNEL_TOLERANCE = 2;
const TABS = ['general', 'appearance', 'layout', 'board', 'myra', 'connections', 'about'];

const center = async (page: Page, sel: string) => {
  const r = await page.locator(sel).first().boundingBox();
  if (!r) throw new Error(`${sel} is not on screen`);
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
};
const select =
  (ids: string[]): Step =>
  async page => {
    await page.evaluate(x => window.__fenmyr.selectOnly(x), ids);
  };
const keys =
  (...k: string[]): Step =>
  async page => {
    for (const key of k) {
      await page.keyboard.press(key);
      await settle(page, 500);
    }
  };

const board: [string, Step][] = [
  ['board', async () => {}],
  ['select-note', select(['note'])],
  ['select-shape', select(['shape'])],
  ['select-several', select(['note', 'todo', 'swatch'])],
  [
    'card-menu',
    async page => {
      const p = await center(page, '#cards [data-id="note"]');
      await page.mouse.click(p.x, p.y, { button: 'right' });
    },
  ],
  // card-menu leaves the pointer on the note, and zooming would slide a selection bar button under it, hovered or not
  // depending on when the browser next checks; the window's bottom-right corner has nothing a zoom can move there
  [
    'zoom-in',
    async page => {
      const corner = await page.evaluate(() => ({ x: innerWidth - 1, y: innerHeight - 1 }));
      await page.mouse.move(corner.x, corner.y);
      await keys('Control+0', 'Control+=', 'Control+=', 'Control+=')(page);
    },
  ],
  ['zoom-out', keys('Control+0', 'Control+-', 'Control+-', 'Control+-')],
  [
    'home',
    async page => {
      await page.click('#homeBtn');
    },
  ],
  // Home covers the board but not the left box: the open board's row, its menu, and the dialog that Export as zip opens
  [
    'export-dialog',
    async page => {
      await page.locator('#boards .board-row.on').first().click({ button: 'right' });
      // a reference without the entry only has the menu open
      const entry = page.locator('#rowMenu [data-m="zipOut"]');
      if (await entry.count()) await entry.click();
    },
  ],
];
// each new theme: the board, a selected card, Myra's chat open, and Settings with the picker
const themeGroup = (name: string, mode: 'light' | 'dark'): Group => ({
  settings: { theme: mode, [mode === 'dark' ? 'darkTheme' : 'lightTheme']: name },
  states: [
    ['board', async () => {}],
    ['select-note', select(['note'])],
    [
      'chat',
      async page => {
        await page.click('#mPill');
      },
    ],
    [
      'settings',
      async page => {
        await page.click('#gearBtn');
        // the theme picker, which is what a theme's own Settings state is for, is on the Appearance tab; the reference may not have it yet
        const tab = page.locator('#setTabs [data-tab="appearance"]');
        if (await tab.count()) await tab.click();
      },
    ],
  ],
});
// Follow Caelestia on: the dark scheme from the tests' fixtures, where the app looks for it
const caelestiaState = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-visual-cae-'));
fs.mkdirSync(path.join(caelestiaState, 'caelestia'));
fs.copyFileSync(
  path.join(import.meta.dirname, '../tests/fixtures/caelestia/dark.json'),
  path.join(caelestiaState, 'caelestia', 'scheme.json'),
);
const GROUPS: Record<string, Group> = {
  light: { states: board },
  ...PROTO_GROUPS,
  dark: { settings: { theme: 'dark' }, states: board.slice(0, 3) },
  midsummer: themeGroup('midsummer', 'light'),
  clear: themeGroup('clear', 'light'),
  'polar-night': themeGroup('polar-night', 'dark'),
  lantern: themeGroup('lantern', 'dark'),
  caelestia: {
    ...themeGroup('default', 'dark'),
    settings: { caelestia: true },
    env: { XDG_STATE_HOME: caelestiaState },
  },
  phone: { phone: true, states: [['board', async () => {}]] },
  rich: {
    board: richNotes,
    states: [
      ['notes', async () => {}],
      ['select', select(['rn-list'])],
    ],
  },
  modes: {
    states: [
      [
        'drawing',
        async page => {
          // a field on this board holds focus at start, and would take the P
          await page.evaluate(() =>
            document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null,
          );
          await page.keyboard.press('p');
        },
      ],
      [
        'find',
        async page => {
          await page.keyboard.press('Escape');
          await page.keyboard.press('Control+f');
          await page.keyboard.type('a');
          await page.keyboard.press('Enter');
          await page.waitForSelector('#findBar:not([hidden])');
        },
      ],
      [
        'find-chat',
        async page => {
          await page.click('#mPill');
        },
      ],
    ],
  },
  settings: {
    states: TABS.map(t => [
      t,
      async page => {
        if (!(await page.locator('#settings.on').count())) await page.click('#gearBtn');
        // a tab the reference doesn't have yet leaves Settings on General
        const tab = page.locator(`#setTabs [data-tab="${t}"]`);
        if (await tab.count()) await tab.click();
      },
    ]),
  },
  ...MYRA_GROUPS,
  ...WIREFRAME_GROUPS,
  ...CHANNEL_GROUPS,
  ...NEW_PROJECT_GROUPS,
};

async function shoot(dir: string, out: string) {
  fs.mkdirSync(out, { recursive: true });
  for (const [name, group] of Object.entries(GROUPS)) {
    const shown = (group.board ?? everyOfflineCard)();
    const as = group.version ? appCopy(group.version, dir) : null;
    const l = await launch({
      dir: as?.dir ?? dir,
      boards: [shown],
      open: shown.id,
      settings: group.settings,
      env: group.env,
    });
    const width = group.phone ? 600 : group.width;
    if (width) {
      await l.app.evaluate(({ BrowserWindow }, w) => {
        const [win] = BrowserWindow.getAllWindows();
        if (!win) throw new Error('no window');
        win.setSize(w, 900);
      }, width);
      await settle(l.page);
    }
    if (group.proto) await openPrototype(l.page);
    await l.page.addStyleTag({
      content: FROZEN_MOTION + HIDDEN_RANDOM_CANVASES + HIDDEN_UPDATE_STATE + HIDDEN_TIMED_BUBBLE,
    });
    for (const [state, step] of group.states) {
      await step(l.page);
      await settle(l.page, 500);
      await l.page.screenshot({ path: path.join(out, `${name === 'light' ? '' : `${name}-`}${state}.png`) });
    }
    if (l.errors.length) throw new Error(`${name}: page errors in ${dir}: ${l.errors.join('; ')}`);
    await l.close();
    as?.remove();
  }
}

async function compare(page: Page, a: string, b: string, diff: string) {
  const url = (f: string) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`;
  const r = await page.evaluate(
    async ([ua, ub, tolerance]) => {
      const img = (u: string) =>
        new Promise<HTMLImageElement>(ok => {
          const i = new Image();
          i.onload = () => ok(i);
          i.src = u;
        });
      const [ia, ib] = await Promise.all([img(ua), img(ub)]);
      if (ia.width !== ib.width || ia.height !== ib.height) return { changed: -1, total: 0, png: '' };
      const ctx = (c: OffscreenCanvas) => {
        const x = c.getContext('2d');
        if (!x) throw new Error('no 2d canvas');
        return x;
      };
      const pix = (i: HTMLImageElement) => {
        const x = ctx(new OffscreenCanvas(i.width, i.height));
        x.drawImage(i, 0, 0);
        return x.getImageData(0, 0, i.width, i.height);
      };
      const da = pix(ia),
        db = pix(ib),
        out = new ImageData(ia.width, ia.height);
      const at = (img: ImageData, i: number) => img.data[i] ?? 0;
      let changed = 0;
      for (let p = 0; p < da.data.length; p += 4) {
        const d = Math.max(
          Math.abs(at(da, p) - at(db, p)),
          Math.abs(at(da, p + 1) - at(db, p + 1)),
          Math.abs(at(da, p + 2) - at(db, p + 2)),
        );
        const hit = d > tolerance;
        if (hit) changed++;
        out.data.set(hit ? [255, 0, 80, 255] : [at(da, p), at(da, p + 1), at(da, p + 2), 60], p);
      }
      if (!changed) return { changed, total: da.data.length / 4, png: '' };
      const c = new OffscreenCanvas(ia.width, ia.height);
      ctx(c).putImageData(out, 0, 0);
      const blob = await c.convertToBlob();
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (const n of bytes) s += String.fromCharCode(n);
      return { changed, total: da.data.length / 4, png: btoa(s) };
    },
    [url(a), url(b), CHANNEL_TOLERANCE] as const,
  );
  if (r.png) fs.writeFileSync(diff, Buffer.from(r.png, 'base64'));
  return r;
}

const hasRef = (r: string) => {
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', r], { cwd: ROOT, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};
const ref = process.argv[2] ?? (hasRef('origin/main') ? 'origin/main' : 'main');
const out = process.env.VISUAL_OUT ?? fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-visual-'));
const base = checkout(ref);
try {
  await shoot(base.dir, path.join(out, 'ref'));
  await shoot(ROOT, path.join(out, 'head'));
} finally {
  base.remove();
  removeProtoFolders();
}
// States a branch changes on purpose, each with the reason, in tools/visual-expected.json. The file is reviewed in the
// PR like code; an entry whose state no longer differs is reported so it can be removed.
const expected: Record<string, string> = (() => {
  const raw: unknown = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'visual-expected.json'), 'utf8'));
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === 'string'));
})();
const judge = await launch({ boards: [everyOfflineCard()], open: 'every' });
let failed = 0,
  meant = 0;
for (const f of fs.readdirSync(path.join(out, 'ref')).sort()) {
  const r = await compare(judge.page, path.join(out, 'ref', f), path.join(out, 'head', f), path.join(out, `diff-${f}`));
  const allowed = Number(process.env.VISUAL_ALLOW_PIXELS) || (STRAY_PIXELS_SCALED[f] ?? STRAY_PIXELS);
  const ok = r.changed >= 0 && r.changed <= allowed,
    name = f.replace('.png', ''),
    why = expected[name];
  if (!ok && !why) failed++;
  if (!ok && why) meant++;
  const verdict = ok ? (why ? 'stale' : 'same') : why ? 'meant' : 'DIFF';
  const note = why ? `  (${ok ? 'listed in tools/visual-expected.json but unchanged: remove it' : why})` : '';
  console.log(`${verdict}  ${name.padEnd(20)} ${r.changed < 0 ? 'size changed' : `${r.changed} px`}${note}`);
}
await judge.close();
console.log(
  `${failed ? 'VISUAL CHANGED' : 'VISUAL SAME'}: ${failed} of ${fs.readdirSync(path.join(out, 'ref')).length} states differ from ${ref} unexpectedly, ${meant} as listed in tools/visual-expected.json. Screenshots in ${out}`,
);
process.exit(failed ? 1 : 0);
