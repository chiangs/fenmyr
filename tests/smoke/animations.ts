import { chatOpen, freshChat, pose, type Smoke, send } from './kit.ts';

// /animate: names in the menu, a named one and a random one play on her sprite, plain words are understood, her own
// choice (animate) plays, and a timer's face wins
export async function animations(t: Smoke) {
  const { page } = t;
  await chatOpen(t, true);
  await page.fill('#mcInput', '/animate');
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  const keys = await page.evaluate(() =>
    window.__t
      .all('.slash-menu button')
      .map(b => b.dataset.key)
      .join('|'),
  );
  await page.keyboard.press('Escape');
  await send(t, '/animate dizzy', 250);
  const named = await pose(t);
  await send(t, '/animate love', 250);
  const switched = await pose(t);
  await page.evaluate(() => window.__fenmyr.applyMyra({ say: 'ok', animate: 'happy' }));
  await page.waitForTimeout(250);
  const byAi = await pose(t);
  await page.evaluate(() => window.__fenmyr.applyMyra({ say: 'ok', animate: 'dizzy' }));
  await page.waitForTimeout(250);
  const aiLimited = await pose(t);
  const intents = await page.evaluate(() =>
    ['can you do a jump?', 'show me your moves', 'tidy my notes', 'hello']
      .map(q => window.__fenmyr.animIntent(q))
      .join('|'),
  );
  await page.fill('#mcInput', '/animate');
  await page.keyboard.press('Space');
  await send(t, '/animate', 300);
  await send(t, '/timer 15 break', 300);
  await send(t, '/animate happy', 300);
  const duringTimer = await pose(t);
  await send(t, '/timer stop', 4500);
  const after = await pose(t);
  t.checkAll('animate', {
    menu: keys.startsWith(
      '/animate|/animate hop|/animate wiggle|/animate party|/animate sleepy|/animate shook|/animate sigh|/animate happy|/animate love|/animate dizzy|/animate curious',
    ),
    named: named === 'dizzy',
    switched: switched === 'love',
    byAi: byAi === 'happy',
    aiLimited: aiLimited === 'happy',
    intents: intents === 'hop|*||',
    timerWins: duringTimer === 'sleepy',
    ends: after === null,
  });
  await freshChat(t);
  await idleAnimations(t);
}

// aliases the model might use, request-shaped words only with thinking on, and the idle cycle (never more than once
// an hour, never over a timer's face or glow)
async function idleAnimations(t: Smoke) {
  const { page } = t;
  const closeChat = () =>
    page.evaluate(() => {
      window.__t.el('#myra').classList.remove('chat');
      window.__t.el('#mcInput').blur();
    });
  await closeChat();
  await page.waitForTimeout(4500);
  const names = await page.evaluate(() =>
      ['heart eyes', 'jump', 'DANCE', 'zzz'].map(n => window.__fenmyr.animName(n)).join('|'),
    ),
    requests = await page.evaluate(() =>
      ['can you do a jump?', 'Hi Ruth! I love you', 'tidy my notes', 'show me your moves']
        .map(q => window.__fenmyr.animRequest(q))
        .join('|'),
    );
  const idle = await page.evaluate(() => {
    const M = window.__fenmyr;
    localStorage.setItem('fenmyr:idleAnim', JSON.stringify({ last: 0, next: Date.now() - 1000 }));
    const before = Date.now(),
      first = M.idleCheck(true),
      st = M.idleState(),
      second = M.idleCheck(true);
    return { first, second, gapMin: (st.next - before) / 60000 };
  });
  await page.waitForTimeout(4500);
  await chatOpen(t, true);
  await send(t, '/timer 15 break', 300);
  await page.evaluate(() => {
    window.__t.el('#myra').classList.remove('chat');
    localStorage.setItem('fenmyr:idleAnim', JSON.stringify({ last: 0, next: Date.now() - 1000 }));
  });
  const overTimer = await page.evaluate(() => window.__fenmyr.idleCheck(true));
  await chatOpen(t, true);
  await send(t, '/timer stop', 300);
  await closeChat();
  t.checkAll('idleAnim', {
    aliases: names === 'love|hop|party|',
    requests: requests === 'hop|||*',
    plays: typeof idle.first === 'string' && ['hop', 'wiggle', 'happy', 'love', 'dizzy', 'sleepy'].includes(idle.first),
    once: idle.second === false,
    gap: idle.gapMin >= 59.9 && idle.gapMin <= 91,
    notOverTimer: overTimer === false,
  });
}
