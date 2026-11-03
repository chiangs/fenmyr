import type { Smoke } from './kit.ts';

// a local date and time the way a due date is written: 2030-05-06T15:30
const iso = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const setDue = (t: Smoke, id: string, v: string) =>
  t.page.evaluate(
    ([i, v]) => {
      const c = window.__fenmyr.curBoard().cards.find(c => c.id === i);
      if (c) window.__fenmyr.setDue(c, v ?? '');
    },
    [id, v],
  );

const clearSay = (t: Smoke) =>
  t.page.evaluate(() => {
    window.__t.el('#mSay').textContent = '';
  });

// Due dates and Myra's greeting.
export async function reminders(t: Smoke) {
  await dueDates(t);
  await greeting(t);
}

// the chip and its colour, the reminder index, one announcement per due date, and the date coming along when the note is copied to another board
async function dueDates(t: Smoke) {
  const { page } = t;
  await page.evaluate(() => window.__fenmyr.dueRelease());
  const id = await page.evaluate(() => window.__fenmyr.newNote(300, 700));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const chip = () =>
    page.evaluate(i => {
      const e = document.querySelector(`[data-id="${i}"] .due`);
      return e ? { cls: e.className, text: e.textContent ?? '' } : null;
    }, id);
  await setDue(t, id, iso(new Date(Date.now() + 3 * 864e5)).slice(0, 10));
  const far = await chip();
  await setDue(t, id, iso(new Date(Date.now() + 2 * 36e5)));
  const near = await chip(),
    idx1 = await page.evaluate(() => Object.keys(Object(window.__fenmyr.dueRaw())).length);
  await clearSay(t);
  const gone = iso(new Date(Date.now() - 15 * 6e4));
  await setDue(t, id, gone);
  await page.waitForTimeout(300);
  const late = await chip(),
    said = await page.evaluate(
      () =>
        window.__t.text('#mSay') +
        ' ' +
        window.__t
          .all('#mcList .mc-m')
          .map(e => e.textContent)
          .join(' '),
    ),
    fired = await page.evaluate(() => Object.keys(Object(window.__fenmyr.dueFiredRaw())).length);
  await clearSay(t);
  await page.evaluate(() => window.__fenmyr.dueArm());
  await page.waitForTimeout(200);
  const again = await page.evaluate(() => window.__t.text('#mSay'));
  const home = await page.evaluate(() => window.__fenmyr.curBoard().id);
  await page.evaluate(async () => {
    await Fenmyr.save({
      id: 'duex',
      name: 'Due elsewhere',
      cards: [],
      links: [],
      tray: [],
      trayLinks: [],
      palette: [],
    });
  });
  await page.evaluate(i => {
    window.__fenmyr.selectOnly([i]);
    window.__fenmyr.copyCards();
  }, id);
  await page.evaluate(async () => {
    await window.__fenmyr.openBoard('duex');
    window.__fenmyr.pasteCards();
  });
  await page.waitForTimeout(700);
  const moved = await page.evaluate(() => window.__fenmyr.curBoard().cards.find(k => k.type === 'note')?.due),
    idx2 = await page.evaluate(
      () =>
        Object.values(Object(window.__fenmyr.dueRaw())).filter(
          (it: unknown) => !!it && typeof it === 'object' && 'b' in it && it.b === 'duex',
        ).length,
    );
  await page.evaluate(async h => {
    await window.__fenmyr.openBoard(h);
    await Fenmyr.remove('duex');
  }, home);
  await page.waitForTimeout(300);
  t.checkAll('due', {
    chip: !!far && far.cls === 'due ' && /\d/.test(far.text),
    soon: !!near && near.cls.includes('soon'),
    index: idx1 >= 1,
    over: !!late && late.cls.includes('over'),
    announced: /was due/.test(said) && fired >= 1,
    once: again.trim() === '',
    kept: moved === gone,
    indexedOtherBoard: idx2 === 1,
  });
}

// the hello, what is still due today (once a day), contributors, and the first focus after midnight
async function greeting(t: Smoke) {
  const { page } = t,
    say = () => page.evaluate(() => window.__t.text('#mSay')),
    greetNow = async () => {
      await page.evaluate(() => {
        window.__t.el('#mSay').textContent = '';
        window.__fenmyr.greet('start');
      });
      return say();
    };
  const a = await page.evaluate(() => window.__fenmyr.newNote(500, 700)),
    b = await page.evaluate(() => window.__fenmyr.newNote(700, 700)),
    c = await page.evaluate(() => window.__fenmyr.newNote(900, 700));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await setDue(t, a, '2030-05-06T15:30');
  await setDue(t, b, '2030-05-06T09:00');
  await setDue(t, c, '2030-05-07T10:30');
  await page.evaluate(() => {
    window.__fenmyr.setGreet(true, 'chatty');
    window.__bdNow = new Date('2030-05-06T12:00').getTime();
    localStorage.removeItem('fenmyr:daily:open');
  });
  const first = await greetNow(),
    second = await greetNow();
  await page.evaluate(() => {
    window.__bdNow = new Date('2030-05-07T08:00').getTime();
    window.__t.el('#mSay').textContent = '';
    window.dispatchEvent(new Event('focus'));
  });
  const morning = await say();
  await page.evaluate(() => window.__fenmyr.greeter('smoke', 5, () => ({ text: 'Test line from a contributor' })));
  const added = await greetNow();
  await page.evaluate(() => {
    window.__bdNow = new Date('2030-05-08T12:00').getTime();
    window.__fenmyr.slashDue('overdue');
  });
  await page.waitForTimeout(200);
  const overdue = await page.evaluate(() =>
    window.__t
      .all('#mcList > *')
      .map(e => e.textContent)
      .join(' | '),
  );
  await page.evaluate(() => {
    delete window.__bdNow;
    window.__fenmyr.setGreet(false, 'quiet');
  });
  t.checkAll('greeting', {
    hello: /Hi/.test(first) && /Due today/.test(first) && /3:30|15:30/.test(first) && !/9:00|09:00/.test(first),
    onceADay: /Hi/.test(second) && !/Due today/.test(second),
    newDay: /Good morning/.test(morning) && /10:30/.test(morning),
    contributor: /Test line from a contributor/.test(added),
    dueOverdue: /Overdue/.test(overdue) && !/Coming up/.test(overdue.split('Overdue')[1] || ''),
  });
}
