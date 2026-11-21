// Page time that a test drives itself, for motion that is the subject of the test (Myra's hop is a pure function of
// requestAnimationFrame's time). Playwright's fake clock installed before the page's scripts run owns timers, rAF,
// Date and performance.now; it runs in real time until `freeze` stops it, and then moves only when a test calls `tick`.
// What the clock does not own is made to follow it: CSS transitions are off, her pill's idle wobble is off, and the
// Web Animations the page starts (her fades) are stepped by the clock's frames rather than the document's timeline.
import type { BrowserContext, Page } from 'playwright';

// the fake clock's rAF fires every 16 ms, not every 16.7
export const FRAME = 16;

const STILL = '*, *::before, *::after { transition: none !important; } .m-pill { animation: none !important; }';

export async function installClock(context: BrowserContext) {
  await context.clock.install();
  await context.addInitScript(still => {
    addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = still;
      document.head.append(style);
    });
    const animate = Element.prototype.animate;
    let steps: { a: Animation; born: number; end: number }[] = [];
    // started by the first animation, so it runs after a flight's sampler in each frame, as her hop does
    const advance = (now: number) => {
      const due = steps;
      steps = [];
      for (const s of due) {
        if (s.a.playState === 'idle') continue;
        if (now - s.born < s.end) {
          s.a.currentTime = now - s.born;
          steps.push(s);
          continue;
        }
        const done = s.a.onfinish;
        s.a.onfinish = null;
        s.a.finish();
        done?.call(s.a, new AnimationPlaybackEvent('finish'));
      }
      if (steps.length) requestAnimationFrame(advance);
    };
    Element.prototype.animate = function (keyframes, options) {
      const a = animate.call(this, keyframes, options);
      const end = Number(a.effect?.getComputedTiming().endTime);
      if (!Number.isFinite(end)) return a;
      a.pause();
      if (!steps.length) requestAnimationFrame(advance);
      steps.push({ a, born: performance.now(), end });
      return a;
    };
  }, STILL);
}

// Runs the clock on to a whole frame, so the next frame is a whole FRAME after what a test does next
export async function onFrame(page: Page) {
  const at = await page.evaluate(() => performance.now());
  if (at % FRAME) await page.clock.runFor(FRAME - (at % FRAME));
}

// Stops the clock. Pausing goes forward from the page's own time, which runs ahead of the wall clock once a test has
// driven it.
async function freeze(page: Page) {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 5000);
  await onFrame(page);
}

// For what needs real frames, such as resizing the window, reloading, or `settle`: time runs for `work`, then stops
export async function thawed<T>(page: Page, work: () => Promise<T>) {
  await page.clock.resume();
  try {
    return await work();
  } finally {
    await freeze(page);
  }
}

export const tick = (page: Page, ms: number) => page.clock.runFor(ms);

// A wait that is not the subject of the test. A frame costs about 30 ms of real time, so the clock jumps, which runs
// what was due once, in one frame, and then runs on a few frames for what that sets off, such as a timer that tries
// again 40 ms later.
const SETTLE = 6 * FRAME;
export async function skip(page: Page, ms: number) {
  await page.clock.fastForward(ms - SETTLE);
  await page.clock.runFor(SETTLE);
}
