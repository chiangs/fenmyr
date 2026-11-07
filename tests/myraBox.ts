// Myra's box in the bottom bar: one piece with the tools, her name cut short, her lines rising from it, fitting the
// board around her open chat, and a phone's sheet.
import assert from 'node:assert';
import { type Edges, near, openBar } from './support/bar.ts';
import { settle } from './support/launch.ts';

const { l, page, check, done } = await openBar();
const size = async (w: number, h = 900) => {
  await l.app.evaluate(({ BrowserWindow }, s) => BrowserWindow.getAllWindows()[0]?.setSize(s.w, s.h), { w, h });
  await settle(page, 400);
};
const edges = (ids: string[]) =>
  page.evaluate(ids => {
    const out: Record<string, Edges | null> = {};
    for (const id of ids) {
      const el = document.getElementById(id);
      const r = el?.checkVisibility({ opacityProperty: true }) ? el.getBoundingClientRect() : null;
      out[id] = r && { l: r.left, t: r.top, r: r.right, b: r.bottom };
    }
    return out;
  }, ids);
const isOpen = () => page.evaluate(() => !!document.getElementById('myra')?.classList.contains('chat'));
const setChat = async (open: boolean) => {
  if ((await isOpen()) !== open) await page.click(open ? '#mPill' : '#mcClose');
  await page.waitForTimeout(450);
};
const overlaps = (a: Edges, b: Edges) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
// fits the board to these cards (all of them by default), then where they sit on screen together
const fitAll = async (ids?: string[]) => {
  await page.evaluate(ids => {
    const M = window.__fenmyr;
    M.fit(M.board.cards.filter(c => !ids || ids.includes(c.id)));
  }, ids);
  await page.waitForTimeout(700);
  return page.evaluate(ids => {
    const rs = [...document.querySelectorAll<HTMLElement>('#cards .card')]
      .filter(c => !ids || ids.includes(c.dataset.id ?? ''))
      .map(c => c.getBoundingClientRect());
    return {
      l: Math.min(...rs.map(r => r.left)),
      t: Math.min(...rs.map(r => r.top)),
      r: Math.max(...rs.map(r => r.right)),
      b: Math.max(...rs.map(r => r.bottom)),
    };
  }, ids);
};

await check('with the chat closed, her lines show in a bubble rising from her box', async () => {
  await setChat(false);
  await page.evaluate(() => window.__fenmyr.applyMyra({ say: 'A short line.' }, 'hi'));
  await page.waitForFunction(() => document.getElementById('mBubble')?.classList.contains('on'));
  await page.waitForTimeout(450);
  const { mBubble, mPill } = await edges(['mBubble', 'mPill']);
  assert.ok(mBubble && mPill, 'the bubble and her box are up');
  near(mBubble.b, mPill.t - 12, 'the bubble’s bottom');
  near(mBubble.r, mPill.r, 'the bubble’s right');
});

await check('with the chat open, fitting the board keeps the cards out from under it', async () => {
  await setChat(true);
  const cards = await fitAll(),
    { mChat } = await edges(['mChat']);
  assert.ok(mChat, 'her chat is open');
  assert.ok(!overlaps(cards, mChat), `the cards ${JSON.stringify(cards)} are under the chat ${JSON.stringify(mChat)}`);
  await setChat(false);
});

await check('on a phone her chat is a sheet 8 px from both sides', async () => {
  await size(600);
  await page.click('[data-hub="myra"]');
  await page.waitForTimeout(450);
  const { mChat } = await edges(['mChat']);
  await page.click('#mcClose');
  await size(1440);
  assert.ok(mChat, 'her chat is open');
  near(mChat.l, 8, 'the sheet’s left');
  near(mChat.r, 600 - 8, 'the sheet’s right');
});

// Settings → Myra, one change, then closed again
const inSettings = async (change: () => Promise<void>) => {
  await page.click('#gearBtn');
  await page.click('#setTabs [data-tab="myra"]');
  await change();
  await page.click('#setClose');
  await page.waitForTimeout(300);
};
await check('her box is 200 px wide and one piece with the tools', async () => {
  const { mPill, tools } = await edges(['mPill', 'tools']);
  assert.ok(mPill && tools, 'her box and the tools are up');
  near(mPill.l, tools.r, 'her box’s left, on the tools’ right');
  near(mPill.r - mPill.l, 200, 'her box’s width');
});

await check('she has one box to ask her in', async () => {
  const inputs = await page.evaluate(() => document.querySelectorAll('#myra input, #myra textarea').length);
  assert.strictEqual(inputs, 1);
});

await check(
  'with an 18-letter name her box keeps its width, and with a card selected the hint uses her name',
  async () => {
    const name = 'Bartholomew-Smithe';
    await inSettings(() => page.fill('#myraNameIn', name));
    await page.evaluate(() => window.__fenmyr.selectOnly(['note']));
    const box = await page.evaluate(() => {
      const r = document.getElementById('mPill')?.getBoundingClientRect(),
        ask = document.querySelector('#mPill .m-ask');
      return { w: r?.width, cut: !!ask && ask.scrollWidth > ask.clientWidth };
    });
    await setChat(true);
    const hint = await page.evaluate(() => document.querySelector('textarea#mcInput')?.getAttribute('placeholder'));
    await setChat(false);
    await page.evaluate(() => window.__fenmyr.selectOnly([]));
    await inSettings(() => page.fill('#myraNameIn', ''));
    near(box.w, 200, 'her box’s width');
    assert.ok(box.cut, 'her name is cut short in her box');
    assert.match(hint ?? '', /^Ask Bartholomew…/, 'the hint starts with her name, cut short');
  },
);

await done('MYRA BOX OK');
