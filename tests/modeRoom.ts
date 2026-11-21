// What sits around find's bar, just above the bottom bar, keeps clear of it or to its place: her chat keeps clear of it
// and inside a short window, her timer keeps to its place (over her box and the find bar, or over her open chat) and
// her reply clears both, drawing's card lifts neither, and the tools' pickers still open left of the tools.
import assert from 'node:assert';
import { type Edges, near, openBar } from './support/bar.ts';

const { l, page, frames, check, done } = await openBar();
// The lag knob also delays style changes that have no transition, and Ctrl+F focuses the chat's input as it opens,
// so the chat is shown at once: focus() on a box still held hidden does nothing.
const CHANGES_AT_ONCE = '#myra.chat #mChat, #myra.chat #mChat *';
if (process.env.FENMYR_MOTION_DELAY)
  await page.addStyleTag({ content: `${CHANGES_AT_ONCE} { transition-delay: 0s !important; }` });
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
// the chat grows into place and the reply rises, so both are measured once they are still. Not still() from
// support/settled.ts: a timer's countdown is a transition that runs for the whole timer, and is left out here.
const moving = () =>
  page.waitForFunction(
    () =>
      !document.getAnimations().some(a => {
        const effect = a.effect;
        const target = effect instanceof KeyframeEffect ? effect.target : null;
        return (
          a.playState === 'running' &&
          Number.isFinite(effect?.getComputedTiming().endTime) &&
          !target?.closest('#timerChip')
        );
      }),
  );
const still = async () => {
  await frames();
  await moving();
  await frames();
  await moving();
};
const chatOpen = () => page.evaluate(() => !!document.getElementById('myra')?.classList.contains('chat'));
const setChat = async (open: boolean) => {
  if ((await chatOpen()) !== open) await page.click(open ? '#mPill' : '#mcClose');
  await page.waitForFunction(open => document.getElementById('myra')?.classList.contains('chat') === open, open);
  await still();
};
const setHeight = async (h: number) => {
  await l.app.evaluate(({ BrowserWindow }, h) => BrowserWindow.getAllWindows()[0]?.setSize(1440, h), h);
  await page.waitForFunction(h => innerHeight === h, h);
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

await check('with drawing up, its card beside the tools lifts neither the timer nor her reply', async () => {
  // a line of hers, held up for the measure
  await page.evaluate(() => {
    const say = document.getElementById('mSay');
    if (say) say.textContent = 'Drawing time';
    document.getElementById('mBubble')?.classList.add('on');
  });
  await still();
  const before = await boxes();
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
  await page.keyboard.press('p');
  await still();
  const drawing = await boxes();
  await page.keyboard.press('Escape');
  await still();
  assert.ok(drawing.timer && drawing.bubble, 'the timer and her reply show');
  assert.deepStrictEqual([drawing.timer, drawing.bubble], [before.timer, before.bubble]);
});

await page.keyboard.press('Control+f');
await page.waitForFunction(() => document.getElementById('mChat')?.checkVisibility({ visibilityProperty: true }));
await still();
await page.keyboard.type('a');
await page.keyboard.press('Enter');
await page.waitForFunction(() => document.getElementById('findBar')?.checkVisibility());
await still();

await check('with find up and her chat closed, the timer sits over find’s bar and her reply clears both', async () => {
  const { timer, pill, bubble, find } = await boxes();
  assert.ok(bubble && timer && find && pill, 'her reply, the timer, her box and the find bar are up');
  near(timer.b, find.t - 8, 'the timer’s bottom');
  near(middle(timer), middle(pill), 'the timer’s middle');
  assert.ok(bubble.b <= timer.t - 12, `her reply ends at ${bubble.b}, over the timer at ${timer.t}`);
});
await check(
  'with find up and her chat open, it goes wide above find’s bar, the two keep clear, and the timer sits on the chat',
  async () => {
    await setChat(true);
    const { timer, chat, find } = await boxes(),
      place = await page.evaluate(() => document.getElementById('mChat')?.dataset.place);
    assert.ok(chat && find, 'her chat and the find bar are up');
    assert.strictEqual(place, 'wide', 'find over the bottom bar would reach under a joined chat');
    near(chat.b, find.t - 12, 'the chat’s bottom');
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
