// Playwright's fake clock owns timers, requestAnimationFrame, Date and performance.now, but not CSS transitions, CSS
// animations or Web Animations, so installClock turns them off or steps them by the clock's frames.
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

export async function onFrame(page: Page) {
  const at = await page.evaluate(() => performance.now());
  if (at % FRAME) await page.clock.runFor(FRAME - (at % FRAME));
}

// pauseAt only jumps forward, from the page's own time, which a test's runFor calls take ahead of the wall clock; 5 s is
// clear of the page's real-time sync, and what was due in it runs once
async function freeze(page: Page) {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 5000);
  await onFrame(page);
}

// A frozen clock holds back the page's timers and frames, which a resize, a reload and `settle` all wait on
export async function thawed<T>(page: Page, work: () => Promise<T>) {
  await page.clock.resume();
  try {
    return await work();
  } finally {
    await freeze(page);
  }
}

export const tick = (page: Page, ms: number) => page.clock.runFor(ms);

// fastForward runs what was due once, in one frame, and a few frames then run for what that sets off, such as a timer
// that tries again 40 ms later
const SETTLE = 6 * FRAME;
export async function skip(page: Page, ms: number) {
  await page.clock.fastForward(ms - SETTLE);
  await page.clock.runFor(SETTLE);
}
