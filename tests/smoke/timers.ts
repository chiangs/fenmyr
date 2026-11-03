import { chatOpen, freshChat, pose, type Smoke, send } from './kit.ts';

// /timer: parsing, ready-made timers in the menu, the chip, the two-minute warning, the finish, stop, and that it is kept for a restart
export async function timers(t: Smoke) {
  const { page } = t;
  const parse = (a: string) => page.evaluate(a => JSON.stringify(window.__fenmyr.parseTimer(a)), a),
    state = () =>
      page.evaluate(() => {
        const tm = window.__fenmyr.timerState();
        return {
          t: tm && { m: tm.secs / 60, p: tm.purpose, w: tm.warned },
          chip: !window.__t.el('#timerChip').hidden,
          saved: !!localStorage.getItem('fenmyr:timer'),
          confetti: document.querySelectorAll('.confetti').length,
          calm: !!window.myraCalm,
        };
      }),
    // move the running timer's end, then let it notice
    endIn = (ms: number) =>
      page.evaluate(ms => {
        const tm = window.__fenmyr.timerState();
        if (tm) tm.end = Date.now() + ms;
        window.__fenmyr.timerCheck();
      }, ms);
  const parsed: string[] = [];
  for (const q of [
    '25',
    '1h30 draft',
    '90 deep work',
    'abc',
    '0',
    '1 min 1 sec tea',
    '69 seconds',
    '2m10s',
    '1h 5m 3s',
    '25write',
  ])
    parsed.push(await parse(q));
  await page.click('#mPill');
  await page.waitForTimeout(200);
  await page.fill('#mcInput', '/timer');
  const presets = await page.evaluate(() =>
    window.__t
      .all('.slash-menu button')
      .map(b => b.textContent)
      .join('|'),
  );
  await page.keyboard.press('Escape');
  await send(t, '/timer 25 write the intro', 300);
  const a = await state();
  await endIn(119000);
  await page.waitForTimeout(300);
  const w = await state();
  await endIn(-1000);
  await page.waitForTimeout(500);
  const d = await state();
  await send(t, '/timer 10');
  await send(t, '/timer stop', 300);
  const s = await state();
  t.checkAll('timer', {
    parse:
      parsed.join('|') ===
      [
        '{"secs":1500,"purpose":""}',
        '{"secs":5400,"purpose":"draft"}',
        '{"secs":5400,"purpose":"deep work"}',
        'null',
        'null',
        '{"secs":61,"purpose":"tea"}',
        '{"secs":69,"purpose":""}',
        '{"secs":130,"purpose":""}',
        '{"secs":3903,"purpose":""}',
        'null',
      ].join('|'),
    presets: /15 min break/.test(presets) && /50 min focus/.test(presets) && /5 min breather/.test(presets),
    started: !!a.t && a.t.m === 25 && a.t.p === 'write the intro' && a.chip && a.saved,
    warned: !!w.t && w.t.w === true,
    finished: d.t === null && !d.chip && !d.saved && (d.confetti > 0 || d.calm),
    stopped: s.t === null && !s.chip,
  });
  await freshChat(t);
  await timerLook(t, endIn);
}

// /tim then Enter picks /timer and lists the ready-made timers at once; the end of a timer glows red (work) or green
// (a break) until dismissed; the chip pulses in the last two minutes
async function timerLook(t: Smoke, endIn: (ms: number) => Promise<void>) {
  const { page } = t;
  const glow = () => page.evaluate(() => window.__t.el('#mPill').className.match(/glow-(red|green)/)?.[1] || ''),
    finish = async (cmd: string, kind?: 'break' | 'focus') => {
      await send(t, cmd, 250);
      await page.evaluate(k => {
        const tm = window.__fenmyr.timerState();
        if (!tm) return;
        if (k) tm.kind = k;
        tm.end = Date.now() - 1000;
        window.__fenmyr.timerCheck();
      }, kind);
      await page.waitForTimeout(400);
      return glow();
    },
    pill = async () => {
      await page.evaluate(() => window.__t.click('#mPill'));
      await page.waitForTimeout(150);
    };
  await page.click('#mPill').catch(() => {});
  await chatOpen(t, true);
  await page.fill('#mcInput', '/tim');
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  const picked = await page.evaluate(() => ({
    val: window.__t.field('#mcInput').value,
    keys: window.__t
      .all('.slash-menu button')
      .map(b => b.dataset.key)
      .join('|'),
  }));
  await page.keyboard.press('Escape');
  await page.fill('#mcInput', '');
  const custom = await finish('/timer 10 write the intro'),
    brk = await finish('/timer 15 break'),
    breakEndPose = await pose(t),
    breather = await finish('/timer 5 breather');
  await page.waitForTimeout(3300);
  const breakNoSigh = await pose(t);
  await send(t, '/timer 15 break', 300);
  const sleepyPose = await pose(t);
  await send(t, '/timer stop');
  const focus = await finish('/timer 50 focus');
  await page.waitForTimeout(3300);
  const sighPose = await pose(t);
  await pill();
  const sighCleared = await pose(t);
  await chatOpen(t, true);
  const ai = await finish('/timer 10 coffee with Sam', 'break');
  await pill();
  const cleared = await glow();
  await send(t, '/timer 10');
  await endIn(90000);
  await page.waitForTimeout(300);
  const soon = await page.evaluate(() => window.__t.el('#mPill').classList.contains('hurry')),
    shookPose = await pose(t);
  await send(t, '/timer stop');
  t.checkAll('timerUx', {
    picksTimer: picked.val === '/timer ' && picked.keys === '/timer 15 break|/timer 50 focus|/timer 5 breather',
    customRed: custom === 'red',
    breakGreen: brk === 'green' && breather === 'green',
    focusRed: focus === 'red',
    aiBreakGreen: ai === 'green',
    clears: cleared === '',
    hurries: soon,
    shook: shookPose === 'shook',
    sleepy: sleepyPose === 'sleepy',
    breakEndsNormal: breakEndPose === null && breakNoSigh === null,
    sighs: sighPose === 'sigh',
    sighClears: sighCleared === null,
  });
  await freshChat(t);
}
