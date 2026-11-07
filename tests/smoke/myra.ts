import { chatOpen, closeChat, freshChat, pose, type Smoke, send } from './kit.ts';

// opens the chat from her box, or folds it when it is open (her box only opens it), the way the page gets the clicks
const pill = async (t: Smoke) =>
  (await t.page.evaluate(() => window.__t.el('#myra').classList.contains('chat')))
    ? closeChat(t)
    : t.page.evaluate(() => window.__t.click('#mPill'));
// her chat closed and her back on her button, whatever she was doing
const settle = async (t: Smoke) => {
  const perched = await t.page.evaluate(() => {
    window.__fenmyr.stopAnim();
    return window.__fenmyr.perched();
  });
  if (perched) await closeChat(t);
};

// Myra herself: perching on the chat, timers from plain sentences, how a timer ends, curiosity, and Esc.
export async function myra(t: Smoke) {
  await perch(t);
  await timerWords(t);
  await timerEnd(t);
  await curious(t);
  await curiousOnOpen(t);
  await escAndM(t);
}

// with the chat open she hops out of her box and perches at the start of the chat's header; closing sends her home;
// toggling it over and over makes her dizzy; clicking her makes her do something
async function perch(t: Smoke) {
  const { page } = t;
  const where = () =>
    page.evaluate(() => {
      const g = (sel: string) => {
        const b = window.__t.el(sel).getBoundingClientRect();
        return { l: b.left, t: b.top, r: b.right, b: b.bottom };
      };
      return { slot: g('#gooSlot'), perch: g('#mcPerch'), name: g('#mName'), perched: window.__fenmyr.perched() };
    });
  const chatBox = () =>
    page.evaluate(() => {
      const b = window.__t.el('#mChat').getBoundingClientRect();
      return { l: b.left, r: b.right };
    });
  const thinking = (on: boolean) => page.evaluate(on => window.__t.el('#myra').classList.toggle('thinking', on), on);
  await page.evaluate(() => {
    window.__t.el('#myra').classList.remove('chat');
    window.__t.el('#mcInput').blur();
    window.__fenmyr.perchGoo(false);
    window.__fenmyr.dizzyAuto(true);
  });
  await page.waitForTimeout(1300);
  const home = await where();
  await page.click('#mPill');
  await page.waitForTimeout(1300);
  const up = await where();
  await page.click('#gooSlot');
  await page.waitForTimeout(200);
  const clicked = await page.evaluate(() => window.__fenmyr.lastAnimName());
  await page.waitForTimeout(4200);
  await pill(t);
  await page.waitForTimeout(1300);
  const back = await where();
  for (let i = 0; i < 5; i++) {
    await pill(t);
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(700);
  const dizzy = await pose(t);
  await page.waitForTimeout(4500);
  if (await page.evaluate(() => window.__fenmyr.perched())) {
    await pill(t);
    await page.waitForTimeout(1300);
  }
  // while she is thinking her box does not change width, so the chat stays put and she stays in its header
  await page.click('#mPill');
  await page.waitForTimeout(1300);
  const chat0 = await chatBox();
  await thinking(true);
  await page.waitForTimeout(700);
  const thinkSnap = await where(),
    chat1 = await chatBox();
  await thinking(false);
  await pill(t);
  await page.waitForTimeout(1300);
  await thinking(true);
  await page.click('#mPill');
  await page.waitForTimeout(1000);
  const lateSnap = await where(),
    chat2 = await chatBox();
  await thinking(false);
  await page.waitForTimeout(700);
  const afterSnap = await where();
  await pill(t);
  await page.waitForTimeout(1300);
  type Snap = Awaited<ReturnType<typeof where>>;
  const onPerch = (s: Snap) => Math.abs(s.slot.l - s.perch.l) < 3 && Math.abs(s.slot.t - s.perch.t) < 4;
  t.checkAll('perch', {
    hopsUp: up.perched && onPerch(up),
    namesStay: Math.abs(up.name.l - home.name.l) < 1 && Math.abs(up.name.t - home.name.t) < 1,
    backHome: !back.perched && Math.abs(back.slot.l - home.slot.l) < 2 && Math.abs(back.slot.t - home.slot.t) < 2,
    click: clicked !== '',
    dizzy: dizzy === 'dizzy',
    stillWhenThinking:
      onPerch(thinkSnap) &&
      Math.abs(chat1.l - chat0.l) < 1 &&
      onPerch(lateSnap) &&
      onPerch(afterSnap) &&
      Math.abs(chat2.l - chat0.l) < 1,
  });
}

// plain sentences start timers locally (with thinking on or off): exactly the time said, with the purpose, and stop /
// status; the model learns it from the sentence
async function timerWords(t: Smoke) {
  const { page } = t;
  const requests = await page.evaluate(() =>
    [
      'set a timer for 2 minutes 10 seconds for tea',
      'give me a 69 second timer',
      'can you start a 25 minute timer for the intro?',
      'remind me in 20 minutes to stretch',
      'set a timer for half an hour',
      'cancel my timer',
      'what is the timer',
      'I have 3 items to sort',
    ]
      .map(q => JSON.stringify(window.__fenmyr.timerRequest(q)))
      .join('|'),
  );
  await chatOpen(t, true);
  await send(t, 'could you set a timer for 2 minutes 10 seconds for tea?', 700);
  const set = await page.evaluate(() => {
    const tm = window.__fenmyr.timerState();
    return (
      tm && { secs: tm.secs, purpose: tm.purpose, chip: `${window.__t.text('#tcTime')} ${window.__t.text('#tcWhat')}` }
    );
  });
  await send(t, 'please cancel my timer', 700);
  const gone = await page.evaluate(() => window.__fenmyr.timerState() === null);
  await page.evaluate(() => {
    window.__t.el('#myra').classList.remove('chat');
    window.__t.el('#mcInput').blur();
  });
  t.checkAll('timerWords', {
    requests:
      requests ===
      '{"secs":130,"purpose":"tea"}|{"secs":69,"purpose":""}|{"secs":1500,"purpose":"the intro"}|{"secs":1200,"purpose":"stretch"}|{"secs":1800,"purpose":""}|{"stop":true}|null|null',
    set: !!set && set.secs === 130 && set.purpose === 'tea' && /^2:1\d tea$/.test(set.chip),
    cancel: gone,
  });
}

// the end of a timer glows once and never flips (red then green); a break by its words is green at once; confetti comes out of Myra wherever she is
async function timerEnd(t: Smoke) {
  const { page } = t;
  // every glow the button showed over a stretch of time, in order
  const track = async (ms: number) => {
    const seen = new Set<string>();
    for (let i = 0; i < ms / 100; i++) {
      seen.add(await page.evaluate(() => window.__t.el('#mPill').className.match(/glow-(red|green)/)?.[1] || 'none'));
      await page.waitForTimeout(100);
    }
    return [...seen].join();
  };
  const finish = async (cmd: string) => {
    await chatOpen(t, true);
    await send(t, cmd, 300);
    await page.evaluate(() => {
      window.__t.el('#myra').classList.remove('chat');
      const tm = window.__fenmyr.timerState();
      if (tm) tm.end = Date.now() - 1000;
      window.__fenmyr.timerCheck();
    });
  };
  await page.evaluate(() => window.__fenmyr.dizzyAuto(false));
  await pill(t);
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    if (window.__fenmyr.perched()) window.__t.click('#mcClose');
  });
  // the model's line for the finish arrives late and calls it a break
  await page.evaluate(() => {
    window.__timerLineStub = () => new Promise(res => setTimeout(() => res({ say: 'ok', kind: 'break' }), 900));
  });
  await finish('/timer 10 write the intro');
  const late = await track(2800);
  await pill(t);
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    window.__timerLineStub = null;
  });
  await finish('/timer 10 quick break');
  const quick = await track(600);
  await finish('/timer 10 write the intro');
  const plain = await track(3200);
  await pill(t);
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    window.__t.el('#myra').classList.add('chat');
    window.__fenmyr.perchGoo(true);
  });
  await page.waitForTimeout(1300);
  const conf = await page.evaluate(() => {
    window.__fenmyr.playAnim('party', false);
    const c = window.__t.all('.confetti')[0],
      s = window.__t.el('#gooSlot').getBoundingClientRect(),
      m = window.__t.el('#myra').getBoundingClientRect();
    return c
      ? {
          dx: Math.abs(parseFloat(c.style.left) - (s.left + s.width / 2 - m.left)),
          dy: Math.abs(parseFloat(c.style.top) - (s.top + s.height * 0.45 - m.top)),
        }
      : null;
  });
  await page.evaluate(() => {
    window.__t.el('#myra').classList.remove('chat');
    window.__fenmyr.perchGoo(false);
    window.__fenmyr.dizzyAuto(true);
  });
  await page.waitForTimeout(1300);
  t.checkAll('timerEnd', {
    noFlash: !late.split(',').includes('red') && late.split(',').pop() === 'green',
    quickBreak: quick.split(',')[0] === 'green' || quick === 'green',
    ruleFallback: plain.split(',').pop() === 'red' && !plain.includes('green'),
    confettiFollows: !!conf && conf.dx < 2 && conf.dy < 2,
  });
}

// a fresh chat: she tilts her head with a question mark
async function curious(t: Smoke) {
  const { page } = t;
  await page.evaluate(() => {
    window.__fenmyr.dizzyAuto(false);
    window.__t.el('#myra').classList.add('chat');
  });
  await page.waitForTimeout(4200);
  await page.click('#mcNew');
  await page.waitForTimeout(300);
  const pose1 = await pose(t);
  await page.waitForTimeout(3800);
  const pose2 = await pose(t);
  await page.evaluate(() => {
    window.__t.el('#myra').classList.remove('chat');
    window.__t.el('#mcInput').blur();
  });
  t.checkAll('curious', {
    onNewChat: pose1 === 'curious',
    ends: pose2 === null,
    named: await page.evaluate(
      () => window.__fenmyr.animNames().includes('curious') && window.__fenmyr.animName('hmm') === 'curious',
    ),
  });
}

// opening an empty chat from the button also makes her curious (once she has landed); not when the chat already has something in it
async function curiousOnOpen(t: Smoke) {
  const { page } = t,
    reset = async () => {
      await settle(t);
      await page.waitForTimeout(1300);
    };
  await reset();
  await page.evaluate(() => {
    window.__t.click('#mcNew');
    window.__fenmyr.stopAnim();
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__fenmyr.dizzyAuto(false));
  await pill(t);
  await page.waitForTimeout(1200);
  const empty = await pose(t);
  await send(t, '/fit', 300);
  await reset();
  await pill(t);
  await page.waitForTimeout(1200);
  const full = await pose(t);
  await reset();
  await freshChat(t);
  t.checkAll('curiousOnOpen', { empty: empty === 'curious', notWhenNotEmpty: full !== 'curious' });
}

// Esc closes the chat and takes the cursor out of it, so M opens it again and nothing is typed into the hidden box;
// "Throw a berry party" plays the party even though it has no "can you" in it
async function escAndM(t: Smoke) {
  const { page } = t;
  await settle(t);
  await page.waitForTimeout(1300);
  await pill(t);
  await page.waitForTimeout(900);
  await page.evaluate(() => window.__t.el('#mcInput').focus());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const closed = await page.evaluate(() => ({
    chat: window.__t.el('#myra').classList.contains('chat'),
    inChat: window.__t.el('#mChat').contains(document.activeElement),
    focused: document.activeElement?.id,
  }));
  await page.keyboard.press('m');
  await page.waitForTimeout(500);
  const reopened = await page.evaluate(() => ({
    chat: window.__t.el('#myra').classList.contains('chat'),
    val: window.__t.field('#mcInput').value,
    focused: document.activeElement?.id,
  }));
  await page.evaluate(() => window.__t.el('#mcInput').blur());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  const outsideEsc = await page.evaluate(() => window.__t.el('#myra').classList.contains('chat'));
  await page.evaluate(() => window.__t.el('#mcInput').focus());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await settle(t);
  await page.waitForTimeout(900);
  const asks = await page.evaluate(() =>
    ['Throw a berry party', 'host a party', 'plan the party board', 'let us celebrate']
      .map(q => window.__fenmyr.animRequest(q))
      .join('|'),
  );
  t.checkAll('escM', {
    closes: !closed.chat && !closed.inChat,
    focusToBox: closed.focused === 'mPill',
    stillOpenOnBoardEsc: outsideEsc,
    mReopens: reopened.chat && reopened.val === '' && reopened.focused === 'mcInput',
    throwParty: asks === 'party|party||party',
  });
}
