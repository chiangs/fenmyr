import { freshChat, type Smoke } from './kit.ts';

// Myra's input: Enter adds a line and Ctrl+Enter sends; the slash menu takes Up, Down, Tab, Enter and Esc first; an
// IME's Enter never sends; the box grows to six lines or a third of the window, then scrolls with a count and a fade,
// and she stays perched on it as it grows
export async function chatInput(t: Smoke) {
  const { page } = t;
  await page.evaluate(() => {
    window.__fenmyr.stopAnim();
    if (window.__fenmyr.perched()) window.__t.click('#mPill');
  });
  await page.waitForTimeout(1300);
  await page.click('#mPill');
  await page.waitForTimeout(1300);
  await keys(t);
  await menuKeys(t);
  await ime(t);
  await grows(t);
  await freshChat(t);
}

// the draft, the menu and what has been said
const look = (t: Smoke) =>
  t.page.evaluate(() => {
    const T = window.__t,
      mine = T.all('#mcList .mc-msg.me'),
      menu = T.el('.slash-menu');
    return {
      val: T.field('#mcInput').value,
      sent: mine.length,
      last: mine.at(-1)?.textContent ?? '',
      said: T.all('#mcList .mc-msg').at(-1)?.textContent ?? '',
      menu: menu.hidden
        ? ''
        : T.all('.slash-menu button')
            .map(b => b.dataset.key)
            .join(),
      on: menu.hidden
        ? ''
        : T.all('.slash-menu button.on')
            .map(b => b.dataset.key)
            .join(),
      chat: T.el('#myra').classList.contains('chat'),
    };
  });

// her answer lands before the next check starts
const replied = async (t: Smoke) => {
  await t.page.waitForTimeout(300);
  await t.page.waitForFunction(() => !document.querySelector('#myra.thinking'), null, { timeout: 8000 });
};

async function keys(t: Smoke) {
  const { page } = t;
  await page.focus('#mcInput');
  const before = await look(t);
  await page.keyboard.type('one');
  await page.keyboard.press('Enter');
  await page.keyboard.type('two');
  const typed = await look(t);
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(200);
  const sent = await look(t);
  await replied(t);
  t.checkAll('chatKeys', {
    enterAddsALine: typed.val === 'one\ntwo' && typed.sent === before.sent,
    ctrlEnterSends: sent.sent === before.sent + 1 && /one\s*two/.test(sent.last) && sent.val === '',
  });
}

async function menuKeys(t: Smoke) {
  const { page } = t;
  await page.fill('#mcInput', '/ti');
  const listed = await look(t);
  await page.keyboard.press('ArrowDown');
  const down = await look(t);
  await page.keyboard.press('ArrowDown');
  const wrapped = await look(t);
  await page.keyboard.press('ArrowUp');
  const up = await look(t);
  await page.keyboard.press('Tab');
  const wordsNext = await look(t);
  await page.fill('#mcInput', '/ti');
  await page.keyboard.press('Tab');
  const filled = await look(t);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const ran = await look(t);
  await page.fill('#mcInput', '/ti');
  await page.keyboard.press('Escape');
  const closed = await look(t);
  await page.keyboard.press('Enter');
  const thenLine = await look(t);
  await page.fill('#mcInput', '');
  t.checkAll('chatMenuKeys', {
    lists: listed.menu === 'tidy,timer' && listed.on === 'tidy',
    upDownWrap: down.on === 'timer' && wrapped.on === 'tidy' && up.on === 'timer',
    tabFillsWords: wordsNext.val === '/timer ' && wordsNext.sent === listed.sent,
    tabFills: filled.val === '/tidy' && filled.menu === 'tidy' && filled.sent === listed.sent,
    enterRuns: ran.val === '' && ran.last === '/tidy' && /Lined|No loose notes/.test(ran.said),
    escClosesOnlyTheMenu: closed.menu === '' && closed.chat && closed.val === '/ti',
    thenEnterAddsALine: thenLine.val === '/ti\n' && thenLine.sent === ran.sent,
  });
}

async function ime(t: Smoke) {
  const { page } = t;
  await page.focus('#mcInput');
  const before = await look(t);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.imeSetComposition', { text: 'にほ', selectionStart: 2, selectionEnd: 2 });
  await page.waitForTimeout(80);
  // Ctrl+Enter is the press that would send outside a composition, so it is the one that shows the IME is respected
  await page.keyboard.press('Control+Enter');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  const composing = await look(t);
  await cdp.send('Input.insertText', { text: '日本' });
  await page.waitForTimeout(80);
  const chosen = await look(t);
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(200);
  const sent = await look(t);
  await cdp.detach();
  await replied(t);
  t.checkAll('chatIme', {
    nothingSentWhileComposing: composing.sent === before.sent,
    chosenWordsSend: sent.sent === before.sent + 1 && sent.last.includes('日本') && sent.val === '',
    seen: `${composing.val} → ${chosen.val}`,
  });
}

async function grows(t: Smoke) {
  const { page, app } = t;
  const size = () =>
    page.evaluate(() => {
      const T = window.__t,
        el = T.field('#mcInput'),
        lines = T.el('#mcLines'),
        slot = T.el('#gooSlot').getBoundingClientRect(),
        form = T.el('#mcForm').getBoundingClientRect();
      return {
        h: el.getBoundingClientRect().height,
        cap: Math.min(6 * parseFloat(getComputedStyle(el).lineHeight) + 12, innerHeight / 3),
        scrolls: el.scrollHeight > el.clientHeight,
        count: lines.hidden ? '' : lines.textContent,
        fade: el.classList.contains('fade-top'),
        perched: window.__fenmyr.perched() && Math.abs(slot.bottom - (form.top + 6)) < 4,
      };
    });
  await page.focus('#mcInput');
  const hs: number[] = [];
  for (let i = 1; i <= 9; i++) {
    if (i > 1) await page.keyboard.press('Enter');
    await page.keyboard.type(`l${i}`);
    hs.push((await size()).h);
  }
  await page.waitForTimeout(300);
  const full = await size();
  await page.evaluate(() => {
    window.__t.el('#mcInput').scrollTop = 0;
  });
  await page.waitForTimeout(200);
  const top = await size();
  const was = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    if (!w) return null;
    const [cw = 0, ch = 0] = w.getContentSize(),
      [mw = 0, mh = 0] = w.getMinimumSize();
    w.setMinimumSize(200, 200);
    w.setContentSize(cw, 330);
    return { cw, ch, mw, mh };
  });
  await page.waitForTimeout(600);
  const short = await size();
  await app.evaluate(({ BrowserWindow }, was) => {
    const w = BrowserWindow.getAllWindows()[0];
    if (!w || !was) return;
    w.setMinimumSize(was.mw, was.mh);
    w.setContentSize(was.cw, was.ch);
  }, was);
  await page.waitForTimeout(600);
  await page.focus('#mcInput');
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(200);
  const sent = await size();
  await replied(t);
  const [first = 0, ...rest] = hs;
  t.checkAll('chatGrows', {
    growsLineByLine: hs.slice(1, 6).every((h, i) => h > (hs[i] ?? h)),
    stopsAtSixLines: rest.slice(4).every(h => Math.abs(h - full.cap) <= 1),
    thenScrolls: full.scrolls && full.count === '9 lines' && full.fade,
    fadesOnlyWithTextAbove: !top.fade && top.count === '9 lines',
    perchFollows: full.perched,
    thirdOfTheWindow: short.cap < full.cap && Math.abs(short.h - short.cap) <= 1,
    oneLineAfterSending: Math.abs(sent.h - first) <= 1 && sent.count === '',
    heights: hs.map(Math.round).join(),
  });
}
