// What sits around find's bar keeps clear of it: Myra's reply and chat rise over it and stay inside a short window,
// her timer keeps to its place (over her box, or over her open chat), and the toolbar's pickers open above it.
import assert from 'node:assert';
import { type Edges, near, openBar } from './support/bar.ts';
import { settle } from './support/launch.ts';

const { l, page, frames, check, done } = await openBar();
const boxes = () =>
  page.evaluate(() => {
    const box = (id: string) => {
      const el = document.getElementById(id);
      if (!el?.checkVisibility({ opacityProperty: true })) return null;
      const r = el.getBoundingClientRect();
      return { l: r.left, t: r.top, r: r.right, b: r.bottom };
    };
    return {
      pill: box('mPill'),
      chat: box('mChat'),
      bubble: box('mBubble'),
      timer: box('timerChip'),
      find: box('findBar'),
    };
  });
// the chat grows into place and the reply rises, so both are measured once they are still
const still = async () => {
  await frames();
  await page.waitForTimeout(450);
};
const chatOpen = () => page.evaluate(() => !!document.getElementById('myra')?.classList.contains('chat'));
const setChat = async (open: boolean) => {
  if ((await chatOpen()) !== open) await page.click('#mPill');
  await still();
};
const setHeight = async (h: number) => {
  await l.app.evaluate(({ BrowserWindow }, h) => BrowserWindow.getAllWindows()[0]?.setSize(1440, h), h);
  await settle(page, 300);
  await still();
};
const overlaps = (a: Edges | null, b: Edges | null) => !!a && !!b && a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;

await setHeight(900);
await setChat(true);
await page.fill('#mcInput', '/timer 25 write');
await page.keyboard.press('Enter');
await page.waitForFunction(() => document.getElementById('timerChip')?.checkVisibility());
await still();

const middle = (e: Edges | null) => (e ? (e.l + e.r) / 2 : NaN);
await check('with her chat open, the timer sits just above it, in the middle', async () => {
  const { timer, chat } = await boxes();
  near(timer?.b, (chat?.t ?? NaN) - 8, 'the timer’s bottom');
  near(middle(timer), middle(chat), 'the timer’s middle');
});
await check('with her chat closed, the timer sits just over her box, in the middle', async () => {
  await setChat(false);
  const { timer, pill } = await boxes();
  near(timer?.b, (pill?.t ?? NaN) - 8, 'the timer’s bottom');
  near(middle(timer), middle(pill), 'the timer’s middle');
});

await page.keyboard.press('Control+f');
await page.keyboard.type('a');
await page.keyboard.press('Enter');
await page.waitForFunction(() => document.getElementById('findBar')?.checkVisibility());
await still();

await check('with find up and her chat closed, the timer stays over her box and her reply clears both', async () => {
  const { timer, pill, bubble, find } = await boxes();
  near(timer?.b, (pill?.t ?? NaN) - 8, 'the timer’s bottom');
  assert.ok(bubble && timer && find, 'her reply, the timer and the find bar are up');
  near(bubble.b, Math.min(timer.t, find.t) - 12, 'her reply’s bottom');
});
await check('with find up and her chat open, the chat clears the bar and the timer sits on the chat', async () => {
  await setChat(true);
  const { timer, chat, find } = await boxes();
  near(chat?.b, (find?.t ?? NaN) - 12, 'the chat’s bottom');
  near(timer?.b, (chat?.t ?? NaN) - 8, 'the timer’s bottom');
});
for (const timing of [true, false]) {
  if (!timing) await page.click('#timerChip button');
  for (const h of [700, 640]) {
    await check(
      `at ${h} px tall with find up${timing ? ' and a timer' : ''}, her chat stays in the window`,
      async () => {
        await setHeight(h);
        const { chat, timer, find } = await boxes();
        assert.ok(chat && find, 'her chat and the find bar are up');
        assert.ok(chat.t >= 8, `her chat starts at ${chat.t}`);
        assert.ok(chat.b <= find.t - 12, `her chat ends at ${chat.b}, over the find bar at ${find.t}`);
        if (timing) assert.ok(timer && timer.t >= 8, `the timer starts at ${timer?.t}`);
      },
    );
  }
}

await setHeight(900);
await setChat(false);
const pickers = [
  ['shape', 'shapePick'],
  ['tpl', 'tplPick'],
  ['stamp', 'stampWheel'],
  ['stamp', 'stampPick'],
] as const;
for (const [tool, id] of pickers) {
  await check(`with find up, the ${id} picker opens above the find bar`, async () => {
    await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
    await page.click(`#tools [data-add="${tool}"]`);
    if (id === 'stampPick') await page.click('#wsMid');
    await still();
    const [pick, find] = await page.evaluate(
      id =>
        [id, 'findBar'].map(id => {
          const el = document.getElementById(id);
          if (!el?.checkVisibility({ opacityProperty: true })) return null;
          const r = el.getBoundingClientRect();
          return { l: r.left, t: r.top, r: r.right, b: r.bottom };
        }),
      id,
    );
    assert.ok(pick && find, 'the picker and the find bar are up');
    assert.ok(!overlaps(pick, find), `the picker ends at ${pick.b}, over the find bar at ${find.t}`);
  });
  await page.click('#tools [data-add="pointer"]');
}

await check('with a doc open, find’s hidden bar does not lift her chat', async () => {
  await page.evaluate(() => {
    const b = window.__fenmyr.board;
    b.cards.push({ id: 'doc', type: 'doc', x: 300, y: 300, w: 200, h: 260, r: 0, color: 'white', text: 'Plan' });
    window.__fenmyr.renderAll();
  });
  await page.locator('.card[data-id="doc"]').dblclick();
  await page.waitForFunction(() => document.getElementById('stage')?.classList.contains('doc-open'));
  await still();
  // the chat is placed from her box's top, whether or not it is open
  const gap = await page.evaluate(() => {
    const chat = document.getElementById('mChat');
    return chat ? -(chat.offsetTop + chat.offsetHeight) : NaN;
  });
  assert.strictEqual(gap, 12, 'her chat would sit 12 px over her box');
});

await done('MODE ROOM OK');
