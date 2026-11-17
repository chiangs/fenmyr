// The font picker's "Use …" row: it reads as one run of text, and a typed name lands only once Google Fonts sends it.
// A name Google lacks, or a network that's down, leaves the card and Settings → Default font as they were, and the
// picker says why. A name typed in lower case lands with Google's capitals, and a font that failed loads once the
// network is back. Google Fonts is stubbed, so the test never reaches it.
import assert from 'node:assert';
import { wireframeBoard } from './fixtures/boards.ts';
import { launch, settle } from './support/launch.ts';

const board = wireframeBoard();
const l = await launch({ boards: [board], open: 'wire' });
const { page, app } = l;

// the families Google answers for; anything else gets its 400, and nothing answers while offline
const GOOGLE = ['Pacifico', 'Rubik Dirt', 'Zilla Slab', 'Lora', 'Lato', 'Inter', 'DM Serif Display', 'Space Grotesk'];
let offline = false;
const asked: string[] = [];
await app.context().route(/fonts\.(googleapis|gstatic)\.com/, route => {
  const url = new URL(route.request().url()),
    family = (url.searchParams.get('family') ?? '').split(':')[0] ?? '';
  asked.push(family);
  if (offline) return route.abort('internetdisconnected');
  if (url.hostname === 'fonts.gstatic.com' || !GOOGLE.includes(family))
    return route.fulfill({ status: 400, contentType: 'text/html', body: 'Bad request' });
  return route.fulfill({ status: 200, contentType: 'text/css', body: `/* ${family} */` });
});

const fontOf = (id: string) =>
  page.evaluate(i => window.__fenmyr.curBoard()?.cards.find(k => k.id === i)?.font ?? null, id);
const pickerOpen = () => page.evaluate(() => document.getElementById('fontPop')?.hidden === false);
const note = () =>
  page.evaluate(() => {
    const n = document.querySelector('#fontPop .dp-note');
    return n instanceof HTMLElement && !n.hidden ? n.textContent : null;
  });
const useName = async (name: string) => {
  await page.keyboard.press('Control+a');
  await page.keyboard.type(name);
  await page.click('#fontPop .dp-use');
  await settle(page, 300);
};
// whether a stylesheet for this family is on the page and loaded
const loaded = (family: string) =>
  page.evaluate(
    f => [...document.querySelectorAll('link')].some(k => k.href.includes(`family=${f}:`) && !!k.sheet),
    family.replace(/ /g, '+'),
  );
const MISSING = 'Google Fonts has no font called “zila slab”. Check the spelling and capitals.';
const select = async (ids: string[]) => {
  await page.evaluate(i => window.__fenmyr.selectOnly(i), ids);
  await settle(page, 250);
};
// the picker puts the keyboard in its search a moment after it opens
const openFonts = async (button = '#selbar [data-sbfont="1"]') => {
  await page.locator(button).evaluate(b => (b instanceof HTMLElement ? b.click() : null));
  await page.waitForFunction(() => document.activeElement?.matches('#fontPop .dp-search'));
};
// the space either side of the name inside the quote marks, measured on the letters drawn
const quoteGaps = () =>
  page.evaluate(() => {
    const row = document.querySelector('#fontPop .dp-use'),
      rects: DOMRect[] = [];
    let text = '';
    if (!row) return null;
    const walk = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const s = n.textContent ?? '';
      if (n.parentElement?.closest('small')) continue;
      for (let i = 0; i < s.length; i++) {
        const r = document.createRange();
        r.setStart(n, i);
        r.setEnd(n, i + 1);
        rects.push(r.getBoundingClientRect());
        text += s[i];
      }
    }
    const open = text.indexOf('“'),
      close = text.indexOf('”'),
      at = (i: number) => rects[i] ?? new DOMRect();
    return { text, before: at(open + 1).left - at(open).right, after: at(close).left - at(close - 1).right };
  });
const failed: string[] = [];
const check = async (name: string, run: () => Promise<void>) => {
  try {
    await run();
  } catch (e) {
    failed.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
  }
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await settle(page, 150);
};

try {
  await settle(page, 800);
  await page.evaluate(() => {
    Object.assign(window.__fenmyr.view, { x: 300, y: 60, z: 0.8 });
    window.__fenmyr.applyView();
  });
  await settle(page, 300);

  await check('the Use row reads as one run of text', async () => {
    for (const dark of [false, true]) {
      await page.evaluate(d => document.body.classList.toggle('dark', d), dark);
      await select(['head0']);
      await openFonts();
      await page.keyboard.type('Nunito');
      const g = await quoteGaps();
      const theme = dark ? 'dark' : 'light';
      assert.strictEqual(g?.text, 'Use “Nunito”', `it reads Use “Nunito” in ${theme}`);
      assert.ok(
        g && g.before < 2 && g.after < 2,
        `with the quote marks against the name in ${theme}: ${JSON.stringify(g)}`,
      );
      await page.keyboard.press('Escape');
      await settle(page, 150);
    }
    await page.evaluate(() => document.body.classList.remove('dark'));
  });

  await check('a name Google lacks leaves the card as it was, and the picker says why', async () => {
    await select(['head0']);
    const before = await fontOf('head0');
    await openFonts();
    await useName('zila slab');
    assert.strictEqual(await note(), MISSING, 'the picker says Google Fonts has no such font');
    assert.ok(await pickerOpen(), 'and stays open to fix the name');
    assert.strictEqual(await fontOf('head0'), before, 'the text keeps its font');
    await page.keyboard.type('x');
    assert.strictEqual(await note(), null, 'typing again clears what it said');
  });

  await check('a name typed in lower case lands with Google’s capitals', async () => {
    await select(['head0']);
    await openFonts();
    await useName('pacifico');
    assert.strictEqual(await fontOf('head0'), 'Pacifico', 'pacifico lands as Pacifico');
    assert.ok(!(await pickerOpen()), 'and the picker closes');
    assert.ok(await loaded('Pacifico'), 'with its stylesheet loaded');
  });

  await check('offline, a typed name is not used, and the picker says so', async () => {
    offline = true;
    await select(['head0']);
    const before = await fontOf('head0');
    await openFonts();
    await useName('Rubik Dirt');
    offline = false;
    assert.strictEqual(
      await note(),
      'Google Fonts can’t be reached, so “Rubik Dirt” wasn’t used. Try again when you’re online.',
      'the picker says Google Fonts can’t be reached',
    );
    assert.strictEqual(await fontOf('head0'), before, 'and the text keeps its font');
  });

  await check('a font that failed offline loads when picked again once the network is back', async () => {
    offline = true;
    await page.evaluate(() => {
      const c = window.__fenmyr.curBoard()?.cards.find(k => k.id === 'email0');
      if (c) c.font = 'Rubik Dirt';
      window.__fenmyr.renderAll();
    });
    await settle(page, 300);
    assert.ok(!(await loaded('Rubik Dirt')), 'offline, Rubik Dirt doesn’t load');
    offline = false;
    await select(['head0']);
    await openFonts();
    await page.click('#fontPop [data-bfont="Rubik Dirt"]');
    await settle(page, 300);
    assert.strictEqual(await fontOf('head0'), 'Rubik Dirt', 'it is picked from Used on this board');
    assert.ok(await loaded('Rubik Dirt'), 'and loads now the network is back');
  });

  await check('Settings → Default font takes only a font Google sends', async () => {
    await page.click('#gearBtn');
    await page.click('#setTabs [data-tab="board"]');
    const shown = () => page.textContent('#defaultFontBtn');
    const before = await shown();
    await openFonts('#defaultFontBtn');
    await useName('zila slab');
    assert.strictEqual(await note(), MISSING, 'it says Google Fonts has no such font');
    assert.strictEqual(await shown(), before, 'and the default font stays as it was');
    await useName('pacifico');
    assert.strictEqual(await shown(), 'Pacifico', 'pacifico becomes the default as Pacifico');
    await openFonts('#defaultFontBtn');
    await page.click('#fontPop [data-bfont=""]');
    await page.click('#setClose');
  });

  assert.ok(asked.length > 0, 'every font request went to the stub');

  for (const f of failed) console.log(`FAILED ${f}`);
  assert.deepStrictEqual(failed, [], 'every check passes');
  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('fontUse: ok');
} finally {
  await l.close();
}
