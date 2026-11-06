import { freshChat, type Smoke } from './kit.ts';

// Myra's input: Enter adds a line and Ctrl+Enter sends; the slash menu takes Up, Down, Tab, Enter and Esc first; keys
// an IME is composing with stay in the box; the box grows to six lines or a third of the window, then scrolls with a
// count and a fade, and she stays perched on it as it grows
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
  await pen(t);
  await grows(t);
  await counts(t);
  await clears(t);
  await narrowFooter(t);
  await findKeepsDraft(t);
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
  await page.focus('#mcInput');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(150);
  const blank = await look(t);
  t.checkAll('chatKeys', {
    enterAddsALine: typed.val === 'one\ntwo' && typed.sent === before.sent,
    ctrlEnterSends: sent.sent === before.sent + 1 && /one\s*two/.test(sent.last) && sent.val === '',
    blankDraftClearsUnsent: blank.val === '' && blank.sent === sent.sent,
  });
}

async function menuKeys(t: Smoke) {
  const { page } = t;
  await page.fill('#mcInput', '/ti');
  const listed = await look(t);
  // a screen reader hears a row's description once; hovering the cut-off words still shows them whole
  const named = await page.evaluate(() => ({
    send: window.__t.el('.mc-send').getAttribute('aria-label'),
    rowTitles: window.__t.all('.slash-menu button[title]').length,
    descTitles: window.__t.all('.slash-menu button > span[title]').length,
  }));
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
    named: named.send === 'Send' && named.rowTitles === 0 && named.descTitles === 2,
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
  const imeEsc = await page.evaluate(() => {
    const M = window.__fenmyr,
      T = window.__t,
      id = M.board.cards[0]?.id ?? '';
    M.selectOnly([id]);
    T.el('#mcInput').focus();
    T.el('#mcInput').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true }));
    const kept = { chat: T.el('#myra').classList.contains('chat'), sel: !!id && M.sel.join() === id };
    M.selectOnly([]);
    return kept;
  });
  t.checkAll('chatIme', {
    nothingSentWhileComposing: composing.sent === before.sent,
    chosenWordsSend: sent.sent === before.sent + 1 && sent.last.includes('日本') && sent.val === '',
    composingEscStaysInTheBox: imeEsc.chat && imeEsc.sel,
    seen: `${composing.val} → ${chosen.val}`,
  });
}

// the Pen ends its line on Enter, but not on an Enter typed into Myra's box
async function pen(t: Smoke) {
  const { page } = t;
  const penOn = () => page.evaluate(() => window.__t.el('#stage').classList.contains('pen-mode'));
  await page.evaluate(() => window.__t.el('#mcInput').blur());
  await page.keyboard.press('Shift+P');
  const started = await penOn();
  await page.focus('#mcInput');
  await page.keyboard.type('a');
  await page.keyboard.press('Enter');
  const plain = { val: await page.evaluate(() => window.__t.field('#mcInput').value), pen: await penOn() };
  await page.evaluate(() =>
    window.__t
      .el('#mcInput')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true })),
  );
  const composing = await penOn();
  await page.fill('#mcInput', '');
  await page.evaluate(() => window.__t.el('#mcInput').blur());
  await page.keyboard.press('Escape');
  t.checkAll('chatPen', {
    started,
    enterAddsALine: plain.val === 'a\n' && plain.pen,
    composingEnterLeavesThePen: composing,
    endsOnTheBoard: !(await penOn()),
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

// the count is of lines as written: an empty box under a placeholder that wraps (her name can be 18 letters) shows
// neither a count nor a scrollbar, and one long paragraph scrolls with the fade but no count
async function counts(t: Smoke) {
  const { page } = t;
  const seen = () =>
    page.evaluate(() => {
      const el = window.__t.field('#mcInput'),
        lines = window.__t.el('#mcLines');
      return {
        count: lines.hidden ? '' : lines.textContent,
        bar: el.offsetWidth - el.clientWidth,
        wraps: el.scrollHeight - el.clientHeight > 1,
        fade: el.classList.contains('fade-top'),
      };
    });
  const name = (n: string) =>
    page.evaluate(n => {
      const el = window.__t.input('#myraNameIn');
      el.value = n;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, n);
  await name('Wilhelmina-Rosamun');
  await page.fill('#mcInput', '');
  await page.waitForTimeout(150);
  const empty = await seen();
  await name('');
  await page.fill('#mcInput', 'word '.repeat(150).trim());
  await page.evaluate(() => {
    const el = window.__t.el('#mcInput');
    el.scrollTop = el.scrollHeight;
  });
  await page.waitForTimeout(150);
  const paragraph = await seen();
  await page.fill('#mcInput', '');
  t.checkAll('chatCounts', {
    emptyBoxNoCountNoBar: empty.wraps && empty.count === '' && empty.bar === 0,
    paragraphScrollsWithoutACount: paragraph.wraps && paragraph.fade && paragraph.count === '',
  });
}

// the × sits clear of a long draft's scrollbar, and Ctrl+Z brings back what it cleared
async function clears(t: Smoke) {
  const { page } = t;
  const draft = Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join('\n'),
    value = () => page.evaluate(() => window.__t.field('#mcInput').value);
  await page.focus('#mcInput');
  await page.fill('#mcInput', draft);
  await page.waitForTimeout(150);
  const where = await page.evaluate(() => {
    const el = window.__t.field('#mcInput'),
      btn = window.__t.el('#clrBtn'),
      bar = el.offsetWidth - el.clientWidth;
    return {
      shown: !btn.hidden,
      bar,
      clear: btn.getBoundingClientRect().right <= el.getBoundingClientRect().right - bar,
    };
  });
  await page.click('#clrBtn');
  const cleared = await value();
  await page.keyboard.press('Control+Z');
  const back = await value();
  await page.fill('#mcInput', '');
  t.checkAll('chatClear', {
    besideTheScrollbar: where.shown && where.bar > 0 && where.clear,
    clears: cleared === '',
    undoBringsItBack: back === draft,
  });
}

// at the prototype chat's narrowest (280 px) the footer still fits: the hint gives way, the count and Send do not
async function narrowFooter(t: Smoke) {
  const { page } = t;
  await page.fill('#mcInput', Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join('\n'));
  const fit = await page.evaluate(async () => {
    const T = window.__t,
      chat = T.el('#mChat'),
      vault = T.el('#mcVault'),
      was = vault.hidden;
    chat.style.width = '280px';
    vault.hidden = false;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const foot = T.el('.mc-foot'),
      lines = T.el('#mcLines'),
      r = (s: string) => T.el(s).getBoundingClientRect(),
      seen = {
        inside: foot.scrollWidth <= foot.clientWidth && r('.mc-send').right <= r('#mcForm').right,
        countOnOneLine: !lines.hidden && lines.offsetHeight <= parseFloat(getComputedStyle(lines).lineHeight) + 1,
        hintGivesWay: T.el('#mcHint').scrollWidth > T.el('#mcHint').clientWidth,
      };
    chat.style.width = '';
    vault.hidden = was;
    return seen;
  });
  await page.fill('#mcInput', '');
  t.checkAll('chatNarrowFooter', fit);
}

// Ctrl+F over a draft opens the find bar on its own and leaves the draft as it was
async function findKeepsDraft(t: Smoke) {
  const { page } = t;
  const draft = 'a draft\nof two lines';
  await page.fill('#mcInput', draft);
  await page.keyboard.press('Control+f');
  await page.waitForTimeout(200);
  const seen = await page.evaluate(() => ({
    bar: !window.__t.el('#findBar').hidden,
    focus: document.activeElement?.id,
    val: window.__t.field('#mcInput').value,
  }));
  await page.keyboard.press('Escape');
  await page.click('#mPill');
  await page.waitForTimeout(1300);
  const after = await page.evaluate(() => window.__t.field('#mcInput').value);
  await page.fill('#mcInput', '');
  t.checkAll('chatFindKeepsDraft', {
    barOpens: seen.bar && seen.focus === 'fbQ',
    draftStays: seen.val === draft && after === draft,
  });
}
