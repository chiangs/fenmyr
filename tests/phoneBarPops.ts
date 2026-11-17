// On a phone the bar is a strip that scrolls, so it used to clip every dropdown it opened, ··· included, and whatever
// folded into ··· was out of reach. Each one now opens above the strip, inside the screen, and takes presses.
import assert from 'node:assert';
import { wireframeBoard } from './fixtures/boards.ts';
import { launch, settle } from './support/launch.ts';

const l = await launch({ boards: [wireframeBoard()], open: 'wire' });
const { page, app } = l;

// where the open dropdown is against the strip, and whether a press at the middle of `hit` lands on it
const look = (pop: string, hit: string) =>
  page.evaluate(
    ({ p, h }) => {
      const box = document.querySelector(p)?.getBoundingClientRect(),
        strip = document.getElementById('selbar')?.getBoundingClientRect(),
        el = document.querySelector(h),
        r = el?.getBoundingClientRect(),
        at = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        above: !!box && !!strip && box.height > 0 && box.bottom <= strip.top,
        inside: !!box && box.left >= 0 && box.right <= innerWidth,
        hits: !!el && !!at && (at === el || el.contains(at)),
      };
    },
    { p: pop, h: hit },
  );

try {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(390, 844));
  await settle(page, 800);
  await page.evaluate(() => window.__fenmyr.selectOnly(['signin']));
  await settle(page, 300);
  assert.ok(
    await page.evaluate(() => document.body.classList.contains('phone')),
    'at 390 px the app is in its phone layout',
  );
  await page.click('#selbar [data-pop="more"]');
  await page.waitForTimeout(300);
  assert.deepStrictEqual(
    await look('.sb-pop-more', '.sb-pop-more [data-pop="corners"]'),
    { above: true, inside: true, hits: true },
    '··· opens above the strip, and Corners in it takes a press',
  );
  await page.click('.sb-pop-more [data-pop="corners"]');
  await page.waitForTimeout(300);
  assert.deepStrictEqual(
    await look('.sb-pop-corners', '.sb-pop-corners [data-corners="8"]'),
    { above: true, inside: true, hits: true },
    'and Corners opens above the strip too, with its chips in reach',
  );
  await page.click('.sb-pop-corners [data-corners="8"]');
  await settle(page, 200);
  const radius = await page.evaluate(() => window.__fenmyr.curBoard()?.cards.find(c => c.id === 'signin')?.radius);
  assert.strictEqual(radius, 8, 'a chip there sets the corners');
  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('phoneBarPops: ok');
} finally {
  await l.close();
}
