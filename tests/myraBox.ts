// Myra's box in the bottom bar and the chat that opens from it: her lines rising from the box, fitting the board
// around the open chat, and a phone's sheet.
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
  if ((await isOpen()) !== open) await page.click('#mPill');
  await page.waitForTimeout(450);
};
const overlaps = (a: Edges, b: Edges) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
// fits the board to its cards, then where they all sit on screen together
const fitAll = async () => {
  await page.evaluate(() => window.__fenmyr.fit(window.__fenmyr.board.cards));
  await page.waitForTimeout(700);
  return page.evaluate(() => {
    const rs = [...document.querySelectorAll('#cards .card')].map(c => c.getBoundingClientRect());
    return {
      l: Math.min(...rs.map(r => r.left)),
      t: Math.min(...rs.map(r => r.top)),
      r: Math.max(...rs.map(r => r.right)),
      b: Math.max(...rs.map(r => r.bottom)),
    };
  });
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

await done('MYRA BOX OK');
