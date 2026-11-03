import type { Smoke } from './kit.ts';

const note = (i: number, text: string) => ({
  id: `sl${i}`,
  type: 'note' as const,
  x: (i % 2) * 300,
  y: Math.floor(i / 2) * 200,
  w: 220,
  h: 140,
  color: 'white',
  text,
  r: 0,
});

// / lists what Myra can do without AI, Ctrl+F opens her with /find ready; /find opens the find bar beside her pill (live search, cycling, closes)
export async function slash(t: Smoke) {
  const { page } = t;
  await page.evaluate(
    cards => {
      const M = window.__fenmyr;
      M.board.cards.length = 0;
      M.board.cards.push(...cards);
      M.renderAll();
    },
    ['Pick cloudberries', 'Buy bread', 'cloudberry jam', 'Plan the trip'].map((x, i) => note(i, x)),
  );
  await page.keyboard.press('Control+f');
  const f1 = await page.evaluate(() => ({
    chat: window.__t.el('#myra').classList.contains('chat'),
    val: window.__t.field('#mcInput').value,
    focus: document.activeElement?.id,
  }));
  await page.keyboard.type('cloud');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const bar = () =>
    page.evaluate(() => {
      const T = window.__t,
        b = T.el('#findBar'),
        p = T.el('#mPill').getBoundingClientRect(),
        r = b.getBoundingClientRect(),
        prev = T.el('#fbPrev');
      return {
        shown: !b.hidden,
        count: T.text('#fbCount'),
        focus: document.activeElement?.id,
        dim: document.querySelectorAll('.card.dim').length,
        cur: document.querySelectorAll('.card.find-cur').length,
        right: r.left >= p.right,
        level: Math.abs(r.top + r.height / 2 - (p.top + p.height / 2)) < 1.5,
        prevOff: prev instanceof HTMLButtonElement && prev.disabled,
      };
    });
  const b1 = await bar();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  const b2 = await bar();
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.press('Shift+Enter');
  await page.waitForTimeout(250);
  const b3 = await bar();
  await page.fill('#fbQ', 'trip');
  await page.waitForTimeout(400);
  const b4 = await bar();
  await page.fill('#fbQ', 'zebra');
  await page.waitForTimeout(400);
  const b5 = await bar();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  const b6 = await bar();
  await page.click('#mPill');
  await page.waitForTimeout(200);
  await page.fill('#mcInput', '/');
  const menu = await page.evaluate(() =>
    window.__t
      .all('.slash-menu button')
      .map(b => b.dataset.key)
      .join(),
  );
  await page.keyboard.press('Escape');
  const closed = await page.evaluate(
    () => window.__t.el('.slash-menu').hidden && window.__t.el('#myra').classList.contains('chat'),
  );
  await page.fill('#mcInput', '/tidy');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  const said = await page.evaluate(() => (window.__t.all('#mcList .mc-msg').pop()?.textContent ?? '').trim());
  t.checkAll('slash', {
    open: f1.chat && f1.val === '/find ' && f1.focus === 'mcInput',
    barOpens: b1.shown && b1.focus === 'fbQ' && b1.count === '1 of 2',
    dims: b1.dim === 2 && b1.cur === 1,
    besideMyra: b1.right && b1.level,
    cycles: b2.count === '2 of 2' && b3.count === '2 of 2',
    live: b4.count === '1 of 1' && b4.prevOff,
    none: b5.count === 'No matches' && b5.dim === 0,
    closes: !b6.shown && b6.dim === 0 && b6.cur === 0,
    menu: menu === 'find,tag,tidy,due,fit,timer,birthday,animate,clear,help',
    closed,
    tidy: /Lined 4 notes/.test(said),
  });
  await page.evaluate(() => {
    window.__t.click('#mcNew');
    window.__fenmyr.stopAnim();
    window.__t.el('#mcInput').blur();
  });
}
