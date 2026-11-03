import type { Smoke } from './kit.ts';

// On the board: connectors from the selection bar, sidebar rows, tags as you type, and earlier chats.
export async function board(t: Smoke) {
  await connectors(t);
  await rowHover(t);
  await tags(t);
  await chatHistory(t);
}

// weight (regular, medium, bold) and colour from the bar, remembered for the next connector, and a reset
async function connectors(t: Smoke) {
  const res = await t.page.evaluate(async () => {
    const T = window.__t,
      M = window.__fenmyr,
      b = M.board,
      mk = (id: string, x: number, y: number) => ({
        id,
        type: 'note' as const,
        x,
        y,
        w: 200,
        h: 90,
        r: 0,
        text: id,
        color: 'butter',
      });
    b.cards.push(mk('wA', -900, 900), mk('wB', -500, 1000));
    for (const c of b.cards.slice(-2)) M.renderCard(c);
    b.links.push({ id: 'WL', a: 'wA', b: 'wB', arrow: true });
    M.selectWire('WL');
    await T.wait(400);
    const bar = T.el('#selbar'),
      kept = () => {
        const s: unknown = JSON.parse(localStorage.getItem('fenmyr:settings') || '{}');
        return s && typeof s === 'object' && 'wireStyle' in s ? s.wireStyle : undefined;
      },
      pathStyle = () => document.querySelector('.wires path.w')?.getAttribute('style') || '';
    const order = [...bar.children]
      .map(e => (e instanceof HTMLElement && e.className.includes('sb-popw') ? e.dataset.popw : e.textContent?.trim()))
      .slice(0, 5)
      .join();
    T.click('[data-pop="wcol"]');
    await T.wait(200);
    T.click('#selbar [data-wb="col:#4f8fc9"]');
    await T.wait(300);
    T.click('[data-pop="wwt"]');
    await T.wait(200);
    const weights = T.all('#selbar [data-wb^="w:"] span')
      .map(e => e.textContent)
      .join();
    T.click('#selbar [data-wb="w:6"]');
    await T.wait(300);
    const l = b.links.find(x => x.id === 'WL');
    const set = l?.color === '#4f8fc9' && l.w === 6,
      drawn = [...document.querySelectorAll('.wires path')].some(p =>
        (p.getAttribute('style') || '').includes('stroke:#4f8fc9;stroke-width:6'),
      ),
      last = JSON.stringify(kept()),
      halo = !!document.querySelector('.wires path.w-halo');
    T.click('#selbar [data-wb="reset"]');
    await T.wait(300);
    const reset = !l?.color && !l?.w && !kept() && !pathStyle().includes('stroke:#');
    b.links = b.links.filter(x => x.id !== 'WL');
    b.cards = b.cards.filter(c => !['wA', 'wB'].includes(c.id));
    M.selectWire(null);
    return { order, weights, set, drawn, last, halo, reset };
  });
  t.checkAll('wire', {
    order: res.order === 'Connector,wcol,wwt,,Curved',
    weights: res.weights === 'Regular,Medium,Bold',
    set: res.set,
    drawn: res.drawn,
    remembered: res.last === '{"w":6,"color":"#4f8fc9"}',
    halo: res.halo,
    reset: res.reset,
  });
}

// hovering shows the row's buttons without making the row taller than its neighbours, and their icons have a real size
async function rowHover(t: Smoke) {
  const { page } = t;
  const pt = await page
    .waitForFunction(
      () => {
        const all = window.__t.all('.board-row'),
          seen = (r: Element) => r.getBoundingClientRect().height > 0,
          row = all
            .filter(seen)
            .find(x =>
              [...(x.parentElement?.querySelectorAll(':scope > .board-row') ?? [])].some(y => y !== x && seen(y)),
            );
        return row ? { i: all.indexOf(row) } : null;
      },
      null,
      { timeout: 15000 },
    )
    .then(h => h.jsonValue())
    .catch(() => null);
  if (pt) {
    await page.locator('.board-row').nth(pt.i).hover();
    await page.waitForTimeout(250);
  }
  const res = await page.evaluate(found => {
    const e = document.querySelector('.board-row:hover');
    if (!e)
      return {
        found,
        sidebar: window.__t.all('.board-row').some(x => x.getBoundingClientRect().height > 0),
        same: false,
        shown: false,
        icon: false,
      };
    const b = e.querySelector('.f-btn'),
      sv = b?.querySelector('svg'),
      h = e.getBoundingClientRect().height,
      others = [...(e.parentElement?.querySelectorAll(':scope > .board-row') ?? [])]
        .filter(x => x !== e)
        .map(x => x.getBoundingClientRect().height)
        .filter(x => x > 0);
    return {
      found,
      sidebar: true,
      same: others.every(x => Math.abs(x - h) < 1.5),
      shown: !!b && getComputedStyle(b).display !== 'none',
      icon: !!sv && sv.getBoundingClientRect().width >= 12,
    };
  }, !!pt);
  t.check('rowHover', (!res.found && !res.sidebar) || (res.same && res.shown && res.icon), res);
}

// "#bug" in a note becomes a tag; "#b" in another suggests it and Enter picks it; Myra's tags are cleaned up
async function tags(t: Smoke) {
  const { page } = t;
  await page.evaluate(() => {
    window.__fenmyr.selectOnly([]);
    for (const c of window.__fenmyr.board.cards) if (c.type === 'note') delete c.tags;
  });
  await page.evaluate(() => window.__fenmyr.newNote(-400, 600));
  await page.waitForTimeout(300);
  await page.keyboard.type('Fix the login #bug and issue #24 later', { delay: 15 });
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  const first = await page.evaluate(() => {
    const M = window.__fenmyr,
      c = M.board.cards.find(x => x.id === M.editing);
    return { text: c?.text, tags: c?.tags };
  });
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__fenmyr.newNote(-100, 600));
  await page.waitForTimeout(300);
  await page.keyboard.type('Second #b', { delay: 20 });
  await page.waitForTimeout(250);
  const pop = await page.evaluate(() => window.__t.all('#tagPop.on button').map(b => b.textContent ?? ''));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  const second = await page.evaluate(async () => {
    const M = window.__fenmyr,
      c = M.board.cards.find(x => x.id === M.editing);
    const res = {
      text: c?.text,
      tags: c?.tags,
      chips: c ? document.querySelectorAll(`[data-id="${c.id}"] .ntags i`).length : 0,
    };
    await M.applyMyra(
      {
        say: 'ok',
        add: [
          { type: 'note', name: 'Login fails', text: 'Steps to reproduce', tags: ['BUG', '#ui', '12'], tag: '#31' },
        ],
      },
      'q',
    );
    const m = M.board.cards.find(x => x.name === 'Login fails');
    return { ...res, myraTags: m?.tags, myraLabel: m?.tagText, board: M.board.tags };
  });
  await page.keyboard.press('Escape');
  t.checkAll('tags', {
    text: first.text?.trim() === 'Fix the login and issue #24 later',
    tagged: JSON.stringify(first.tags) === '["bug"]',
    suggested: pop.includes('#bug'),
    text2: second.text?.trim() === 'Second',
    picked: JSON.stringify(second.tags) === '["bug"]',
    chips: second.chips === 1,
    myra: JSON.stringify(second.myraTags) === '["bug","ui"]',
    myraLabel: second.myraLabel === '#31',
    board: JSON.stringify(second.board) === '["bug","ui"]',
  });
}

// with chats kept on the board, New chat files the conversation away (last 10 kept) and History brings it back
async function chatHistory(t: Smoke) {
  const res = await t.page.evaluate(async () => {
    const T = window.__t,
      M = window.__fenmyr;
    T.click('[data-seg="chatKeep"] [data-v="board"]');
    await T.wait(100);
    T.click('#mPill');
    await T.wait(300);
    const mk = (q: string, a: string) => [
      { who: 'me', text: q, t: Date.now() },
      { who: 'myra', text: a, t: Date.now() },
    ];
    for (let i = 0; i < 12; i++) {
      M.board.chat = mk(`question ${i}`, `answer ${i}`);
      T.click('#mcNew');
      M.stopAnim();
      await T.wait(30);
    }
    const kept = M.board.chats?.length,
      newest = M.board.chats?.[0]?.title,
      btn = !T.el('#mcHist').hidden;
    M.board.chat = mk('the current one', 'still here');
    T.click('#mcHist');
    await T.wait(200);
    const rows = document.querySelectorAll('#mcList .mh-row').length;
    T.click('#mcList .mh-row:nth-child(3) .mh-open'); // the second-newest (row 1 is the header)
    await T.wait(200);
    const restored = M.board.chat?.[0]?.text,
      filed = M.board.chats?.[0]?.title,
      view = !!document.querySelector('#mcList .mc-msg');
    // an answer that arrives while the chat is closed still lands in the chat
    T.click('#mcClose');
    await T.wait(100);
    await M.applyMyra({ say: 'Your board has three saved colours.' }, 'what colours are saved?');
    const closedReply = !!M.board.chat?.some(
      m => m.who === 'myra' && m.text.startsWith('Your board has three saved colours'),
    );
    T.click('#mPill');
    await T.wait(300);
    const closedShown = T.text('#mcList').includes('Your board has three saved colours');
    T.click('#mcClose');
    M.board.chat = [];
    M.board.chats = [];
    document
      .querySelector('[data-seg="chatKeep"] [data-v="session"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return { kept, newest, btn, rows, restored, filed, view, closedReply, closedShown };
  });
  t.checkAll('chatHist', {
    kept: res.kept === 10,
    newest: res.newest === 'question 11',
    btn: res.btn,
    rows: res.rows === 10,
    restored: res.restored === 'question 10',
    filed: res.filed === 'the current one',
    view: res.view,
    closedReply: res.closedReply,
    closedShown: res.closedShown,
  });
}
