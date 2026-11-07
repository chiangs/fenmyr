import { type Smoke, send } from './kit.ts';

const BDAY_NOTE = /Happy birthday/;

// birthday: set in Settings, celebrated once when you are really there, belated within 14 days, hat all day, and /birthday for demos
export async function birthday(t: Smoke) {
  const { page } = t;
  const set = (m: string, d: string) =>
    page.evaluate(
      ([m, d]) => {
        for (const [id, v] of [
          ['#setBdMonth', m],
          ['#setBdDay', d],
        ]) {
          const el = window.__t.el(id ?? '');
          if (el instanceof HTMLSelectElement || el instanceof HTMLInputElement) el.value = v ?? '';
          el.dispatchEvent(new Event('change'));
        }
      },
      [m, d],
    );
  const due = (iso: string) =>
    page.evaluate(iso => {
      window.__bdNow = new Date(iso).getTime();
      const x = window.__fenmyr.birthdayDue();
      return x ? x.kind + (x.days ? `:${x.days}` : '') : '';
    }, iso);
  const chatText = () =>
    page.evaluate(() =>
      window.__t
        .all('#mcList .mc-msg.myra')
        .map(m => m.textContent)
        .join(' || '),
    );
  const settle = () =>
    page.evaluate(() => {
      window.__fenmyr.stopAnim();
      if (window.__fenmyr.perched()) window.__t.click('#mcClose');
    });
  const bdayNotes = () =>
    page.evaluate(
      re => window.__fenmyr.board.cards.filter(c => c.type === 'note' && new RegExp(re).test(c.name || '')).length,
      BDAY_NOTE.source,
    );
  await page.evaluate(() => {
    localStorage.removeItem('fenmyr:birthday');
    window.__fenmyr.dizzyAuto(false);
    window.__t.el('#myra').classList.remove('chat');
  });
  await set('3', '14');
  const saved = await page.evaluate(() => window.__fenmyr.bdSetting());
  await set('', '');
  await page.evaluate(() => window.__t.click('#setBdClear'));
  const cleared = await page.evaluate(() => window.__fenmyr.bdSetting());
  await set('3', '14');
  const d1: string[] = [];
  for (const d of [
    '2027-03-14T12:00:00',
    '2027-03-13T12:00:00',
    '2027-03-17T12:00:00',
    '2027-03-28T12:00:00',
    '2027-03-29T12:00:00',
  ])
    d1.push(await due(d));
  await page.evaluate(() => {
    window.__bdNow = new Date('2026-01-01T09:00:00').getTime();
    localStorage.removeItem('fenmyr:birthday');
  });
  await set('2', '29');
  const feb: string[] = [];
  for (const d of ['2027-02-28T12:00:00', '2028-02-29T12:00:00', '2027-03-01T12:00:00']) feb.push(await due(d));
  await page.evaluate(() => {
    window.__bdNow = new Date('2027-02-12T12:00:00').getTime();
  });
  await set('2', '10');
  const lateSet = await due('2027-02-12T12:00:00'); // set after the day: no belated wish for it
  await page.evaluate(() => localStorage.removeItem('fenmyr:birthday'));
  await set('', '');
  await page.evaluate(() => {
    window.__bdNow = new Date('2026-01-01T09:00:00').getTime();
  });
  await set('3', '14');
  // on the day, only when really there
  await page.evaluate(() => {
    window.__bdNow = new Date('2027-03-14T12:00:00').getTime();
    window.__birthdayLineStub = due =>
      Promise.resolve(
        due.kind === 'belated'
          ? { say: 'Stub belated wish', card: 'Stub belated card' }
          : { say: 'Stub wishes you well', card: 'Stub card for the day' },
      );
    window.__bdFocus = false;
  });
  const away = await page.evaluate(() => {
    window.__fenmyr.bdActive(500);
    return window.__fenmyr.birthdayCheck(false);
  });
  const idle = await page.evaluate(() => {
    window.__bdFocus = true;
    window.__fenmyr.bdActive(120000);
    return window.__fenmyr.birthdayCheck(false);
  });
  const typing = await page.evaluate(() => {
    window.__fenmyr.bdActive(500, 1000);
    return window.__fenmyr.birthdayCheck(false);
  }); // typed a second ago: she waits
  const notes0 = await bdayNotes();
  const went = await page.evaluate(() => {
    window.__fenmyr.bdActive(500);
    return window.__fenmyr.birthdayCheck(false);
  });
  await page.waitForTimeout(3200);
  const noteInfo = await page.evaluate(() => {
    const n = window.__fenmyr.board.cards.filter(c => c.type === 'note' && /Happy birthday/.test(c.name || '')).pop();
    return n?.type === 'note' ? { text: n.text, img: n.myraImg, mv: n.myraMv } : undefined;
  });
  const day = await page.evaluate(() => ({
      hat: window.__fenmyr.hatOn(),
      last: window.__fenmyr.bdState().last,
      again: window.__fenmyr.birthdayCheck(true),
      facts: JSON.stringify(window.__fenmyr.birthdayFacts()),
    })),
    notes1 = await bdayNotes(),
    text1 = await chatText();
  await settle();
  await page.waitForTimeout(900);
  // missed it: the next time you are there, a belated wish (a different year's state)
  await page.evaluate(() => {
    localStorage.setItem('fenmyr:birthday', JSON.stringify({ setAt: '2026-01-01' }));
    window.__bdNow = new Date('2027-03-17T12:00:00').getTime();
    window.__fenmyr.bdActive(500);
    window.__bdFocus = true;
    window.__fenmyr.birthdayCheck(false);
  });
  await page.waitForTimeout(3200);
  const text2 = await chatText();
  // the demo command stores nothing
  await settle();
  await page.evaluate(() =>
    localStorage.setItem('fenmyr:birthday', JSON.stringify({ setAt: '2026-01-01', last: 2027 })),
  );
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    window.__t.el('#myra').classList.add('chat');
    window.__fenmyr.birthdayCheck(false);
  });
  await page.waitForTimeout(300);
  const hatBefore = await page.evaluate(() => window.__fenmyr.hatOn()),
    msgs0 = (await chatText()).split(' || ').length;
  await send(t, '/birthday', 3200);
  const demo = await page.evaluate(() => ({ stored: window.__fenmyr.bdState().hat, hat: window.__fenmyr.hatOn() })),
    msgs1 = (await chatText()).split(' || ').length;
  await page.evaluate(() => {
    window.__t.el('#myra').classList.remove('chat');
    window.__bdNow = null;
    window.__birthdayLineStub = null;
    window.__bdFocus = null;
    localStorage.removeItem('fenmyr:birthday');
    window.__t.click('#setBdClear');
    window.__fenmyr.birthdayCheck(false);
    window.__fenmyr.dizzyAuto(true);
  });
  // with no model line (thinking off): the written pool, a different card each time, with the party stamp
  await page.evaluate(() => {
    localStorage.setItem('fenmyr:birthday', JSON.stringify({ setAt: '2026-01-01', last: 2027 }));
    window.__birthdayLineStub = () => Promise.resolve(null);
  });
  const pool = await page.evaluate(async () => {
    const M = window.__fenmyr,
      texts: string[] = [];
    for (let i = 0; i < 8; i++) {
      await M.celebrateBirthday({ kind: 'today', year: 2027, days: 0, date: new Date() }, true);
      texts.push(M.board.cards.filter(c => c.type === 'note' && /Happy birthday/.test(c.name || '')).pop()?.text ?? '');
    }
    return texts;
  });
  await page.evaluate(() => {
    window.__birthdayLineStub = null;
  });
  t.checkAll('birthdayCard', {
    aiWords:
      !!noteInfo &&
      noteInfo.text === 'Stub card for the day' &&
      !/keep (this|it)|delete (this|it)/i.test(noteInfo.text),
    partyStamp: !!noteInfo && noteInfo.img === 'stamps/myra-party.png' && noteInfo.mv === 'spin',
    poolVaries:
      new Set(pool).size >= 4 &&
      pool.every((x, i) => i === 0 || x !== pool[i - 1]) &&
      pool.every(x => !/keep|delete|\{n\}/i.test(x)),
  });
  t.checkAll('birthday', {
    saves: saved === '03-14',
    clears: cleared === '',
    due: d1.join('|') === 'today||belated:3|belated:14|',
    leapDay: feb.join('|') === 'today|today|belated:1',
    lateSetNoBelated: lateSet === '',
    waitsWhenAway: away === false && idle === false && typing === false,
    celebrates: went === true && day.hat && day.last === 2027 && notes1 === notes0 + 1 && day.again === false,
    wishesWell: /Stub wishes you well/.test(text1),
    askedFacts: day.facts === '{"birthday":"March 14","birthdayToday":true}',
    belated: /belated/i.test(text2),
    demoStoresNothing: demo.stored === undefined && !hatBefore && demo.hat === true && msgs1 === msgs0 + 1,
  });
}
