import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron, type ElectronApplication, type Page } from 'playwright';

export const ROOT = path.resolve(import.meta.dirname, '../..');
const SCREEN = { width: 1440, height: 900 };
export const HEADLESS = ['--ozone-platform=headless', `--ozone-override-screen-size=${SCREEN.width},${SCREEN.height}`];
// Headless Chromium reports no mouse, so the app keeps its own cursor off. This tells it there is a mouse that hovers,
// for tests that check that cursor. (Not on by default: the screenshots are taken without it.)
export const MOUSE =
  '--blink-settings=primaryPointerType=4,availablePointerTypes=4,primaryHoverType=2,availableHoverTypes=2';

const QUIET = { greet: false, autoUpdate: false, caelestia: false, motion: false, tilt: false };

export type Board = { id: string; name: string; [key: string]: unknown };
export type Launched = {
  app: ElectronApplication;
  page: Page;
  data: string;
  errors: string[];
  close: () => Promise<void>;
};
type Options = {
  dir?: string;
  boards?: Board[];
  settings?: Record<string, unknown>;
  open?: string;
  flags?: string[];
  env?: Record<string, string>;
  // a data folder to use, and keep when the app closes, so a test can quit and open the app again
  data?: string;
  // a stand-in Claude Code where the real one usually lives, so asking Myra takes the same path on a machine without
  // it; a test that asks replaces the bridge's ask itself
  claude?: boolean;
};

export async function launch({
  dir = ROOT,
  boards = [],
  settings = {},
  open,
  flags = [],
  env = {},
  data: kept,
  claude = false,
}: Options = {}): Promise<Launched> {
  const data = kept ?? fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-h-'));
  const boardsDir = path.join(data, 'fenmyr', 'boards');
  fs.mkdirSync(boardsDir, { recursive: true });
  if (claude) {
    fs.mkdirSync(path.join(data, '.local/bin'), { recursive: true });
    fs.writeFileSync(path.join(data, '.local/bin/claude'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  }
  for (const b of boards) fs.writeFileSync(path.join(boardsDir, `${b.id}.json`), JSON.stringify(b));
  const version = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version;
  const app = await _electron.launch({
    args: [dir, '--no-sandbox', ...HEADLESS, ...flags],
    env: { ...process.env, ...env, XDG_DATA_HOME: data, HOME: data },
  });
  const page = await app.firstWindow();
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.waitForFunction(() => window.__fenmyr?.curBoard());
  await page.waitForTimeout(500);
  const store = {
    'fenmyr:onboarded': '1',
    'fenmyr:newsSeen': version,
    'fenmyr:settings': JSON.stringify({ ...QUIET, ...settings }),
    ...(open ? { 'fenmyr:last': open } : {}),
  };
  await app.context().addInitScript(s => {
    // it runs in every frame, and a prototype's sandboxed preview has no storage
    try {
      for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
    } catch {}
  }, store);
  await page.reload();
  await page.waitForFunction(() => window.__fenmyr?.curBoard() && document.querySelector('#cards .card'));
  await settle(page);
  const close = async () => {
    await app.close();
    if (!kept) fs.rmSync(data, { recursive: true, force: true });
  };
  return { app, page, data, errors, close };
}

const STARTUP_TIMERS_MS = 900;

export async function settle(page: Page, ms = STARTUP_TIMERS_MS) {
  await page.waitForTimeout(ms);
  await page.waitForFunction(
    () => {
      const busy = (id: string) => /saving|making/i.test(document.getElementById(id)?.textContent ?? '');
      const moving = document.getElementById('stage')?.classList.contains('moving');
      return document.fonts.status === 'loaded' && !busy('saved') && !busy('dvSaved') && !moving;
    },
    null,
    { timeout: 5000 },
  );
  await page.evaluate(() => window.__fenmyr.stopAnim());
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
}
