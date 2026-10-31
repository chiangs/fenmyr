import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron, type ElectronApplication, type Page } from 'playwright';

export const ROOT = path.resolve(import.meta.dirname, '../..');
const SCREEN = { width: 1440, height: 900 };
export const HEADLESS = ['--ozone-platform=headless', `--ozone-override-screen-size=${SCREEN.width},${SCREEN.height}`];

const QUIET = { greet: false, autoUpdate: false, caelestia: false, motion: false, tilt: false };

// the members of the renderer's window.__fenmyr test hook that the harness calls
type TestHooks = {
  curBoard(): { name: string } | null;
  stopAnim(): void;
  selectOnly(ids: string[]): void;
  openBoard(id: string): Promise<void>;
};
export type Board = { id: string; name: string; [key: string]: unknown };
export type Launched = {
  app: ElectronApplication;
  page: Page;
  data: string;
  errors: string[];
  close: () => Promise<void>;
};
type Options = { dir?: string; boards?: Board[]; settings?: Record<string, unknown>; open?: string; flags?: string[] };

export async function launch({
  dir = ROOT,
  boards = [],
  settings = {},
  open,
  flags = [],
}: Options = {}): Promise<Launched> {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-h-'));
  const boardsDir = path.join(data, 'fenmyr', 'boards');
  fs.mkdirSync(boardsDir, { recursive: true });
  for (const b of boards) fs.writeFileSync(path.join(boardsDir, `${b.id}.json`), JSON.stringify(b));
  const version = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version;
  const app = await _electron.launch({
    args: [dir, '--no-sandbox', ...HEADLESS, ...flags],
    env: { ...process.env, XDG_DATA_HOME: data, HOME: data },
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
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
  }, store);
  await page.reload();
  await page.waitForFunction(() => window.__fenmyr?.curBoard() && document.querySelector('#cards .card'));
  await settle(page);
  const close = async () => {
    await app.close();
    fs.rmSync(data, { recursive: true, force: true });
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

declare global {
  interface Window {
    Fenmyr?: object;
    __fenmyr: TestHooks;
  }
}
