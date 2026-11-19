// What sits around find's bar, left of the tools, keeps clear of it or to its place: her chat keeps clear of it and
// inside a short window, her timer keeps to its place (over her box, or over her open chat) and her reply clears it,
// and the tools' pickers still open left of the tools.
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
  if ((await chatOpen()) !== open) await page.click(open ? '#mPill' : '#mcClose');
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

await check('with find up and her chat closed, the timer stays over her box and her reply clears it', async () => {
  const { timer, pill, bubble, find } = await boxes();
  near(timer?.b, (pill?.t ?? NaN) - 8, 'the timer’s bottom');
  assert.ok(bubble && timer && find, 'her reply, the timer and the find bar are up');
  assert.ok(bubble.b <= timer.t - 12, `her reply ends at ${bubble.b}, over the timer at ${timer.t}`);
});
await check(
  'with find up and her chat open, it joins zoom, the chat and find’s bar keep clear of each other, and the timer sits on the chat',
  async () => {
    await setChat(true);
    const { timer, chat, find } = await boxes(),
      place = await page.evaluate(() => document.getElementById('mChat')?.dataset.place);
    assert.ok(chat && find, 'her chat and the find bar are up');
    assert.strictEqual(place, 'joined', 'find beside the tools reaches under no joined chat');
    assert.ok(!overlaps(chat, find), `the chat ${JSON.stringify(chat)} meets the find bar ${JSON.stringify(find)}`);
    near(timer?.b, chat.t - 8, 'the timer’s bottom');
  },
);
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
        assert.ok(!overlaps(chat, find), `her chat ${JSON.stringify(chat)} meets the find bar ${JSON.stringify(find)}`);
        if (timing) assert.ok(timer && timer.t >= 8, `the timer starts at ${timer?.t}`);
      },
    );
  }
}

await check('at 1600 × 600 with find up, her joined chat keeps below the find bar', async () => {
  await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1600, 600));
  await settle(page, 300);
  await still();
  const { chat, find } = await boxes(),
    place = await page.evaluate(() => document.getElementById('mChat')?.dataset.place);
  assert.ok(chat && find, 'her chat and the find bar are up');
  assert.strictEqual(place, 'joined', 'her chat joins zoom');
  assert.ok(chat.l < find.r && chat.r > find.l, 'it reaches under the find bar');
  assert.ok(chat.t >= find.b + 11, `her chat starts at ${chat.t}, the find bar ends at ${find.b}`);
});

await setHeight(900);
await setChat(false);
const pickers = [
  ['shape', 'shapePick'],
  ['tpl', 'tplPick'],
  ['stamp', 'stampWheel'],
  ['stamp', 'stampPick'],
] as const;
for (const [tool, id] of pickers) {
  await check(`with find up, the ${id} picker still opens left of the tools`, async () => {
    await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
    await page.click(`#tools [data-add="${tool}"]`);
    if (id === 'stampPick') await page.click('#wsMid');
    await still();
    const [pick, find, tools] = await page.evaluate(
      id =>
        [id, 'findBar', 'tools'].map(id => {
          const el = document.getElementById(id);
          if (!el?.checkVisibility({ opacityProperty: true })) return null;
          const r = el.getBoundingClientRect();
          return { l: r.left, t: r.top, r: r.right, b: r.bottom };
        }),
      id,
    );
    assert.ok(pick && find && tools, 'the picker, the find bar and the tools are up');
    assert.ok(pick.r <= tools.l, `the picker ends at ${pick.r}, left of the tools at ${tools.l}`);
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
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
  await page.keyboard.press('m');
  await still();
  const [chat, bar] = await page.evaluate(() =>
    ['mChat', 'dock'].map(id => document.getElementById(id)?.getBoundingClientRect().bottom),
  );
  near(chat, bar ?? NaN, 'her chat’s bottom, on the bottom bar’s');
});

await done('MODE ROOM OK');
