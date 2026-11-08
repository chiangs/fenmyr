// Myra's box in the bottom bar and the chat that opens from it: joined to the tools or wide above the bar, her hop
// into its header, her lines rising from the box, her name cut short, fitting the board around the chat, a phone's sheet.
import assert from 'node:assert';
import { type Edges, near, openBar } from './support/bar.ts';
import { settle } from './support/launch.ts';

const { l, page, check, done } = await openBar();
const size = async (w: number, h = 900) => {
  await l.app.evaluate(({ BrowserWindow }, s) => BrowserWindow.getAllWindows()[0]?.setSize(s.w, s.h), { w, h });
  await settle(page, 400);
};
const edges = (ids: string[]) =>
  page.evaluate(ids => {
    const out: Record<string, Edges | null> = {};
    for (const id of ids) {
      const el = document.getElementById(id);
      const r = el?.checkVisibility({ opacityProperty: true }) ? el.getBoundingClientRect() : null;
      out[id] = r && { l: r.left, t: r.top, r: r.right, b: r.bottom };
    }
    return out;
  }, ids);
const isOpen = () => page.evaluate(() => !!document.getElementById('myra')?.classList.contains('chat'));
const setChat = async (open: boolean) => {
  if ((await isOpen()) !== open) await page.click(open ? '#mPill' : '#mcClose');
  await page.waitForTimeout(450);
};
const overlaps = (a: Edges, b: Edges) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
// fits the board to these cards (all of them by default), then where they sit on screen together
const fitAll = async (ids?: string[]) => {
  await page.evaluate(ids => {
    const M = window.__fenmyr;
    M.fit(M.board.cards.filter(c => !ids || ids.includes(c.id)));
  }, ids);
  await page.waitForTimeout(700);
  return page.evaluate(ids => {
    const rs = [...document.querySelectorAll<HTMLElement>('#cards .card')]
      .filter(c => !ids || ids.includes(c.dataset.id ?? ''))
      .map(c => c.getBoundingClientRect());
    return {
      l: Math.min(...rs.map(r => r.left)),
      t: Math.min(...rs.map(r => r.top)),
      r: Math.max(...rs.map(r => r.right)),
      b: Math.max(...rs.map(r => r.bottom)),
    };
  }, ids);
};

await check('with the chat closed, her lines show in a bubble rising from her box', async () => {
  await setChat(false);
  await page.evaluate(() => window.__fenmyr.applyMyra({ say: 'A short line.' }, 'hi'));
  await page.waitForFunction(() => document.getElementById('mBubble')?.classList.contains('on'));
  await page.waitForTimeout(450);
  const { mBubble, mPill } = await edges(['mBubble', 'mPill']);
  assert.ok(mBubble && mPill, 'the bubble and her box are up');
  near(mBubble.b, mPill.t - 12, 'the bubble’s bottom');
  near(mBubble.r, mPill.r, 'the bubble’s right');
});

await check('with the chat open, fitting the board keeps the cards out from under it', async () => {
  await setChat(true);
  const cards = await fitAll(),
    { mChat } = await edges(['mChat']);
  assert.ok(mChat, 'her chat is open');
  assert.ok(!overlaps(cards, mChat), `the cards ${JSON.stringify(cards)} are under the chat ${JSON.stringify(mChat)}`);
  await setChat(false);
});

await check('on a phone her chat is a sheet 8 px from both sides, its header as it was', async () => {
  await size(600);
  await page.click('[data-hub="myra"]');
  await page.waitForTimeout(450);
  const { mChat, mcPerch } = await edges(['mChat', 'mcPerch']),
    head = await page.evaluate(() => document.querySelector('#mChat .mc-head')?.getBoundingClientRect().height);
  await page.click('#mcClose');
  await size(1440);
  assert.ok(mChat && mcPerch, 'her chat and its icon are up');
  near(mChat.l, 8, 'the sheet’s left');
  near(mChat.r, 600 - 8, 'the sheet’s right');
  near(mcPerch.l, mChat.l + 16, 'the chat icon’s left, on the header’s padding');
  near(mcPerch.r - mcPerch.l, 28, 'the chat icon’s width');
  near(head, 12 + 28 + 10 + 1, 'the header’s height: its padding, the 28 px icon and its rule');
});

// Settings → Myra, one change, then closed again
const inSettings = async (change: () => Promise<void>) => {
  await page.click('#gearBtn');
  await page.click('#setTabs [data-tab="myra"]');
  await change();
  await page.click('#setClose');
  await page.waitForTimeout(300);
};
const lively = (v: 'lively' | 'calm' | 'calmest') =>
  inSettings(() => page.click(`[data-seg="myraCalm"] [data-v="${v}"]`));
// where her slot is, every frame, from opening the chat until she has settled in it
const flight = async () => {
  const before = (await edges(['gooSlot'])).gooSlot;
  const frames = page.evaluate(
    () =>
      new Promise<number[][]>(done => {
        const slot = document.getElementById('gooSlot'),
          seen: number[][] = [],
          t0 = performance.now();
        const tick = () => {
          const r = slot?.getBoundingClientRect();
          if (r) seen.push([r.left, r.top]);
          if (performance.now() - t0 < 1600) requestAnimationFrame(tick);
          else done(seen);
        };
        requestAnimationFrame(tick);
      }),
  );
  await page.click('#mPill');
  const seen = await frames,
    { gooSlot: after, mcPerch } = await edges(['gooSlot', 'mcPerch']);
  await setChat(false);
  await page.waitForTimeout(900);
  assert.ok(before && after && mcPerch, 'her slot and the header’s spot are up');
  near(after.l, mcPerch.l, 'where she lands, left');
  near(after.t, mcPerch.t, 'where she lands, top');
  const off = (p: number[], q: Edges) => Math.hypot((p[0] ?? 0) - q.l, (p[1] ?? 0) - q.t);
  return seen.filter(p => off(p, before) > 3 && off(p, after) > 3).length;
};

await check('her box is 200 px wide and one piece with the tools', async () => {
  const { mPill, tools } = await edges(['mPill', 'tools']);
  assert.ok(mPill && tools, 'her box and the tools are up');
  near(mPill.l, tools.r, 'her box’s left, on the tools’ right');
  near(mPill.r - mPill.l, 200, 'her box’s width');
});

await check('she has one box to ask her in', async () => {
  const inputs = await page.evaluate(() => document.querySelectorAll('#myra input:not([type=file]), #myra textarea').length);
  assert.strictEqual(inputs, 1);
});

await check('at 1440 px her chat opens joined to the tools, over her box, and the tools still respond', async () => {
  await setChat(true);
  const { mChat, mPill, dock } = await edges(['mChat', 'mPill', 'dock']);
  await page.click('#tools [data-add="note"]');
  const after = await page.evaluate(() => ({
    note: !!document.querySelector('#tools [data-add="note"]')?.classList.contains('on'),
    open: !!document.getElementById('myra')?.classList.contains('chat'),
  }));
  await page.keyboard.press('Escape');
  await setChat(false);
  assert.ok(mChat && mPill && dock, 'her chat, her box and the bar are up');
  near(mChat.l, mPill.l, 'the chat’s left, on her box’s');
  near(mChat.b, dock.b, 'the chat’s bottom, on the bar’s');
  near(mChat.r, Math.min(mPill.l + 400, 1440 - 14), 'the chat’s right');
  assert.deepStrictEqual(after, { note: true, open: true }, 'the Note tool turns on, and the chat stays open');
});

// the tools left showing, how many are tucked into ···, and whether ··· shows
const toolRow = () =>
  page.evaluate(() => {
    const tools = [...document.querySelectorAll<HTMLElement>('#tools > [data-add]')].filter(b => !b.hidden),
      shown = tools
        .filter(b => !b.classList.contains('tb-over'))
        .map(b => {
          const r = b.getBoundingClientRect();
          return { l: r.left, t: r.top, r: r.right, b: r.bottom };
        });
    return { shown, tucked: tools.length - shown.length, more: !document.getElementById('tbMore')?.hidden };
  });
for (const [w, h] of [
  [1280, 800],
  [1366, 768],
  [1440, 900],
  [1920, 1080],
] as const) {
  await check(`at ${w} × ${h} the tools leave room for her chat to open joined, 320 to 400 px wide`, async () => {
    await size(w, h);
    const closed = await edges(['tools']);
    await setChat(true);
    const { mChat, tools } = await edges(['mChat', 'tools']),
      row = await toolRow(),
      place = await page.evaluate(() => document.getElementById('mChat')?.dataset.place);
    await setChat(false);
    await size(1440);
    assert.ok(mChat && tools && closed.tools, 'her chat and the tools are up');
    assert.strictEqual(place, 'joined', 'the chat joins the tools');
    near(mChat.l, tools.r, 'the chat’s left, on the tools’ right');
    near(mChat.r - mChat.l, Math.min(400, w - 14 - tools.r), 'the chat’s width');
    assert.ok(mChat.r - mChat.l >= 320, `the chat is ${mChat.r - mChat.l} px wide`);
    near(tools.r, closed.tools.r, 'the tools’ right, as it was before the chat opened');
    assert.strictEqual(row.more, row.tucked > 0, `··· shows only with tools tucked into it (${row.tucked} are)`);
    const covered = row.shown.filter(t => overlaps(t, mChat));
    assert.deepStrictEqual(covered, [], 'the chat covers no tool that shows');
  });
}

await check('at 1920 px every tool shows, and no ···', async () => {
  await size(1920, 1080);
  const row = await toolRow();
  await size(1440);
  assert.deepStrictEqual([row.tucked, row.more], [0, false]);
});

await check(
  'when even ··· alone leaves too little room right of the tools her chat opens wide, above the bar',
  async () => {
    await size(760);
    await setChat(true);
    const { mChat, dock } = await edges(['mChat', 'dock']),
      cards = await fitAll(['note', 'pic', 'wf']);
    await setChat(false);
    await size(1440);
    assert.ok(mChat && dock, 'her chat and the bar are up');
    near(mChat.l, dock.l, 'the chat’s left, on the bar’s');
    near(mChat.r, 760 - 14, 'the chat’s right');
    near(mChat.b, dock.t - 12, 'the chat’s bottom');
    assert.ok(cards.b <= mChat.t - 29, `fitted cards end at ${cards.b}, over the chat’s top at ${mChat.t}`);
  },
);

await check('at 800 px Select and the next three tools still show', async () => {
  await size(800);
  const row = await toolRow();
  await size(1440);
  assert.ok(row.shown.length >= 4, `${row.shown.length} tools show`);
});

// the drawing bar's colours that something else covers where they are pressed
const coveredColours = () =>
  page.evaluate(
    () =>
      [...document.querySelectorAll<HTMLElement>('#dbColors > *')].filter(c => {
        const r = c.getBoundingClientRect();
        return !c.contains(document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2));
      }).length,
  );
for (const w of [1100, 1280]) {
  await check(`at ${w} px, drawing with her chat open, the drawing bar keeps clear of the chat`, async () => {
    await size(w, 800);
    await page.keyboard.press('p');
    await setChat(true);
    const { mChat, modebar } = await edges(['mChat', 'modebar']),
      colours = await page.locator('#dbColors > *').count(),
      covered = await coveredColours();
    await setChat(false);
    await page.keyboard.press('Escape');
    await size(1440);
    assert.ok(mChat && modebar, 'her chat and the drawing bar are up');
    assert.ok(!overlaps(mChat, modebar), `the chat ${JSON.stringify(mChat)} meets the bar ${JSON.stringify(modebar)}`);
    assert.ok(colours > 0, 'the drawing bar has colours');
    assert.strictEqual(covered, 0, `${covered} of ${colours} colours are covered`);
  });
}

await check('she hops from her box into the chat’s header', async () => {
  const between = await flight();
  assert.ok(between > 5, `she is between her box and the header in ${between} frames`);
});
for (const v of ['calm', 'calmest'] as const) {
  await check(`with her set to ${v}, she fades into the chat’s header without a hop`, async () => {
    await lively(v);
    const between = await flight();
    await lively('lively');
    assert.strictEqual(between, 0, `she is between her box and the header in ${between} frames`);
  });
}
await check('with reduced motion, she fades into the chat’s header without a hop', async () => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const between = await flight();
  await page.emulateMedia({ reducedMotion: null });
  assert.strictEqual(between, 0, `she is between her box and the header in ${between} frames`);
});

await check(
  'with an 18-letter name her box keeps its width, and with a card selected the hint uses her name',
  async () => {
    const name = 'Bartholomew-Smithe';
    await inSettings(() => page.fill('#myraNameIn', name));
    await page.evaluate(() => window.__fenmyr.selectOnly(['note']));
    const box = await page.evaluate(() => {
      const r = document.getElementById('mPill')?.getBoundingClientRect(),
        ask = document.querySelector('#mPill .m-ask');
      return { w: r?.width, cut: !!ask && ask.scrollWidth > ask.clientWidth };
    });
    await setChat(true);
    const hint = await page.evaluate(() => document.querySelector('textarea#mcInput')?.getAttribute('placeholder'));
    await setChat(false);
    await page.evaluate(() => window.__fenmyr.selectOnly([]));
    await inSettings(() => page.fill('#myraNameIn', ''));
    near(box.w, 200, 'her box’s width');
    assert.ok(box.cut, 'her name is cut short in her box');
    assert.match(hint ?? '', /^Ask Bartholomew…/, 'the hint starts with her name, cut short');
  },
);

await check('at 320 px, the narrowest it joins the tools, her chat’s hint stays on one line', async () => {
  const { mPill } = await edges(['mPill']);
  assert.ok(mPill, 'her box is up');
  await inSettings(() => page.fill('#myraNameIn', 'Bartholomew-Smithe'));
  await size(Math.round(mPill.l) + 320 + 14);
  await setChat(true);
  const input = await page.evaluate(() => {
    const field = document.querySelector('textarea#mcInput');
    if (!(field instanceof HTMLTextAreaElement)) return null;
    // an empty input sizes to its hint, clipped to one line; unclipped, it shows how many lines the hint takes
    field.style.maxHeight = 'none';
    const lines = (field.clientHeight - 12) / parseFloat(getComputedStyle(field).lineHeight);
    field.style.maxHeight = '';
    return { hint: field.placeholder, lines, place: document.getElementById('mChat')?.dataset.place };
  });
  const { mChat } = await edges(['mChat']);
  await setChat(false);
  await size(1440);
  await inSettings(() => page.fill('#myraNameIn', ''));
  assert.ok(input && mChat, 'her chat and its input are up');
  assert.strictEqual(input.place, 'joined', 'the chat joins the tools');
  near(mChat.r - mChat.l, 320, 'the chat’s width');
  assert.match(input.hint, /^Ask Bartholomew…(?!…)/, 'the hint has her name cut short, with one ellipsis');
  assert.strictEqual(Math.round(input.lines), 1, 'lines the hint takes');
});

await check('a picture dropped on her open chat lands on the board, clear of the chat', async () => {
  await setChat(true);
  const before = await page.evaluate(() => window.__fenmyr.board.cards.length);
  await page.evaluate(() => {
    const list = document.getElementById('mcList'),
      r = list?.getBoundingClientRect(),
      png = Uint8Array.from(
        atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='),
        c => c.charCodeAt(0),
      ),
      dt = new DataTransfer();
    dt.items.add(new File([png], 'dropped.png', { type: 'image/png' }));
    const at = { clientX: (r?.left ?? 0) + 100, clientY: (r?.top ?? 0) + 100 };
    list?.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true, ...at }));
    list?.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, ...at }));
  });
  await page.waitForFunction(n => window.__fenmyr.board.cards.length > n, before);
  await page.waitForTimeout(800);
  const pic = await page.evaluate(() => {
    const id = window.__fenmyr.board.cards.at(-1)?.id,
      r = document.querySelector(`#cards .card[data-id="${id}"]`)?.getBoundingClientRect();
    return r && { l: r.left, t: r.top, r: r.right, b: r.bottom };
  });
  const { mChat } = await edges(['mChat']);
  await setChat(false);
  assert.ok(pic && mChat, 'the picture and her chat are up');
  assert.ok(!overlaps(pic, mChat), `the picture ${JSON.stringify(pic)} is under the chat ${JSON.stringify(mChat)}`);
  assert.ok(pic.l >= 0 && pic.t >= 0 && pic.r <= 1440 && pic.b <= 900, `the picture ${JSON.stringify(pic)} shows`);
});

await check('joined to the tools, her chat’s corner on them is square, so no notch shows', async () => {
  await setChat(true);
  const filled = await page.evaluate(() => {
    const r = document.getElementById('mChat')?.getBoundingClientRect();
    return !!r && !!document.elementFromPoint(r.left + 1, r.bottom - 1)?.closest('#mChat');
  });
  await setChat(false);
  assert.ok(filled, 'the chat fills its bottom-left corner');
});

for (const hurry of [false, true]) {
  const when = hurry ? ', in a timer’s last two minutes' : '';
  await check(`perched in her open chat she keeps still while her box glows${when}`, async () => {
    await setChat(true);
    const seen = await page.evaluate(hurry => {
      const pill = document.getElementById('mPill'),
        slot = document.getElementById('gooSlot');
      pill?.classList.toggle('hurry', hurry);
      const anims = pill?.getAnimations() ?? [],
        xs: number[] = [],
        ys: number[] = [];
      // 9 s of her box's animations, every 50 ms
      for (let t = 0; t <= 9000; t += 50) {
        for (const a of anims) a.currentTime = t;
        const r = slot?.getBoundingClientRect();
        xs.push(r?.left ?? 0);
        ys.push(r?.top ?? 0);
      }
      pill?.classList.remove('hurry');
      return {
        glows: anims.some(a => a instanceof CSSAnimation && a.animationName === 'm-glow'),
        travel: Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)),
      };
    }, hurry);
    await setChat(false);
    assert.ok(seen.glows, 'her box still glows');
    assert.ok(seen.travel < 5, `she travels ${seen.travel} px`);
  });
}

await done('MYRA BOX OK');
