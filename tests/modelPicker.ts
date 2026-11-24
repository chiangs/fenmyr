// Myra's model picker in the real app, through a stand-in Claude Code that records its arguments. The pill reads the
// choice, and the menu changes it with the mouse or the keyboard alone. The choice is saved, and the next message
// carries it. The pill, the expand button and the send button stay on one line in a narrow chat.
import assert from 'node:assert';
import { replyBoard } from './fixtures/boards.ts';
import { askStandIn, flagsOf } from './support/askStandIn.ts';
import { launch } from './support/launch.ts';
import { rect, still } from './support/settled.ts';

const l = await launch({
  boards: [replyBoard('picker', 'Picker')],
  open: 'picker',
  claude: true,
  settings: { chatKeep: 'board' },
});
const { page } = l;
const { sentFor, sentAbout, send } = askStandIn(l);

const MODELS = ['Opus 5.5', 'Fable 5.2', 'Sonnet 5.5', 'Haiku 5.5'];
const LEVELS = ['Low', 'Medium', 'High', 'Extra', 'Max'];
const NO_FLAGS = { model: undefined, effort: undefined };

const pillText = () => page.evaluate(() => document.getElementById('mcModelText')?.textContent ?? null);
const attr = (sel: string, name: string) =>
  page.evaluate(([s, n]) => document.querySelector(s ?? '')?.getAttribute(n ?? '') ?? null, [sel, name]);
const count = (sel: string) => page.locator(sel).count();
const names = (sel: string) => page.locator(`${sel} .mm-name`).allTextContents();
const chatOpen = () => page.evaluate(() => !!document.getElementById('myra')?.classList.contains('chat'));
const focused = () =>
  page.evaluate(() => {
    const a = document.activeElement;
    return {
      id: a?.id ?? '',
      row:
        a instanceof HTMLElement
          ? a.classList.contains('mm-effort')
            ? 'Effort'
            : (a.querySelector('.mm-name')?.textContent ?? '')
          : '',
      inMenu: !!a?.closest('#mcModelMenu'),
      inFlyout: !!a?.closest('.mc-modelfly'),
    };
  });

async function ask(q: string) {
  const before = await count('#mcList .mc-msg.myra');
  await send(q);
  const run = await sentFor(q);
  await page.waitForFunction(
    n =>
      document.querySelectorAll('#mcList .mc-msg.myra').length > n && !document.querySelector('#mcList .mc-msg.typing'),
    before,
  );
  return flagsOf(run.args);
}
async function openMenu() {
  await page.click('#mcModel');
  await page.waitForSelector('#mcModelMenu');
  await still(page);
}
const pickModel = async (name: string) => {
  await openMenu();
  await page.locator('#mcModelMenu [role="menuitemradio"]', { hasText: name }).click();
  await still(page);
};
const press = async (...keys: string[]) => {
  for (const k of keys) await page.keyboard.press(k);
};
const within = (inner: { x: number; y: number; width: number; height: number }, outer: typeof inner, slack = 0.5) =>
  inner.x >= outer.x - slack &&
  inner.y >= outer.y - slack &&
  inner.x + inner.width <= outer.x + outer.width + slack &&
  inner.y + inner.height <= outer.y + outer.height + slack;

async function check(name: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (e) {
    console.error(`FAIL ${name}`);
    throw e;
  }
}

await page.click('#mPill');
await page.waitForFunction(() => !!document.getElementById('myra')?.classList.contains('chat'));
await still(page);

// the pill, the expand button and the send button on one line, each inside the footer and clear of the next, with the
// footer itself not scrolling sideways
async function fits(what: string) {
  const foot = await rect(page, '.mc-foot'),
    [pill, expand, send] = await Promise.all([rect(page, '#mcModel'), rect(page, '#mcExpand'), rect(page, '.mc-send')]);
  for (const [name, box] of [
    ['pill', pill],
    ['expand', expand],
    ['send', send],
  ] as const) {
    assert(within(box, foot), `${what}: the ${name} is inside the footer`);
    assert(
      Math.abs(box.y + box.height / 2 - (send.y + send.height / 2)) <= 1,
      `${what}: the ${name} is on the send button's line`,
    );
  }
  assert(
    pill.x + pill.width <= expand.x && expand.x + expand.width <= send.x,
    `${what}: they sit in that order and don't overlap`,
  );
  const sideways = await page.evaluate(() => {
    const f = document.querySelector('.mc-foot');
    return f ? f.scrollWidth - f.clientWidth : -1;
  });
  assert.strictEqual(sideways, 0, `${what}: the footer has nothing past its edge`);
  const cut = await page.evaluate(() => {
    const t = document.getElementById('mcModelText');
    return !!t && t.scrollWidth > t.clientWidth;
  });
  return { cut, pill, hint: (await rect(page, '#mcHint')).width };
}
const narrowChat = (on: boolean) =>
  page.evaluate(on => {
    const myra = document.getElementById('myra');
    if (on) myra?.style.setProperty('--chat-w', '320px');
    else myra?.style.removeProperty('--chat-w');
  }, on);

await check('before a choice, the pill says so and Claude Code keeps its own default', async () => {
  assert.strictEqual(await pillText(), 'Claude Code default');
  assert.strictEqual(await attr('#mcModel', 'title'), 'Claude Code default', 'the tip holds the whole text');
  assert.strictEqual(await attr('#mcModel', 'aria-haspopup'), 'menu');
  assert.deepStrictEqual(await ask('first'), NO_FLAGS, 'a message sends neither --model nor --effort');
});

await check('the widest pill text fits a 320 px chat, with the hint dropped rather than shown cut', async () => {
  assert((await rect(page, '#mcHint')).width > 0, 'the hint shows in a roomy chat');
  await narrowChat(true);
  assert.strictEqual((await rect(page, '#mChat')).width, 320);
  const { cut, hint } = await fits('Claude Code default at 320 px');
  assert(!cut, 'the pill’s words are not cut');
  assert.strictEqual(hint, 0, 'the hint, which has no room whole, is gone');
  await narrowChat(false);
});

await check('the menu opens above the pill, level with its right edge, and lists the models', async () => {
  await openMenu();
  assert.strictEqual(await attr('#mcModel', 'aria-expanded'), 'true');
  assert.deepStrictEqual((await names('#mcModelMenu')).slice(0, 4), MODELS);
  assert.deepStrictEqual(
    await page.locator('#mcModelMenu [data-model]').evaluateAll(rows => rows.map(r => r.getAttribute('role'))),
    ['menuitemradio', 'menuitemradio', 'menuitemradio', 'menuitemradio'],
  );
  assert.deepStrictEqual(
    await page.locator('#mcModelMenu .mm-key').allTextContents(),
    ['1', '2', '3', '4'],
    'each shows its key',
  );
  assert.strictEqual(await count('#mcModelMenu [aria-checked="true"]'), 0, 'none is ticked before a choice');
  const [menu, pill] = await Promise.all([rect(page, '#mcModelMenu'), rect(page, '#mcModel')]);
  assert(menu.y + menu.height <= pill.y, 'above the pill');
  assert(Math.abs(menu.x + menu.width - (pill.x + pill.width)) <= 1, 'with the right edges level');
  assert((await focused()).inMenu, 'focus is in the menu, so its keys work');
});

await check('the Effort row is disabled, with a reason, until a model is chosen', async () => {
  assert.strictEqual(await attr('#mcModelMenu .mm-effort', 'aria-disabled'), 'true');
  assert.strictEqual(await attr('#mcModelMenu .mm-effort', 'title'), 'Choose a model first');
  // Playwright waits for an enabled element, and one marked aria-disabled never is
  await page.click('#mcModelMenu .mm-effort', { force: true });
  assert.strictEqual(await count('.mc-modelfly'), 0, 'a click opens nothing');
  await page.locator('#mcModelMenu .mm-effort').focus();
  await press('ArrowRight');
  assert.strictEqual(await count('.mc-modelfly'), 0, 'nor does Right arrow');
  await press('Escape');
});

await check('picking a model with the mouse starts it on Medium and Myra uses it', async () => {
  await pickModel('Sonnet 5.5');
  assert.strictEqual(await count('#mcModelMenu'), 0, 'picking closes the menu');
  assert.strictEqual(await pillText(), 'Sonnet 5.5 Medium');
  assert.strictEqual(await attr('#mcModel', 'title'), 'Sonnet 5.5 Medium');
  assert.strictEqual((await focused()).id, 'mcModel', 'focus is back on the pill');
  assert.deepStrictEqual(await ask('second'), { model: 'claude-sonnet-5-5', effort: 'medium' });
});

await check('a rewrite after a pick carries the choice too', async () => {
  await page.evaluate(
    () => void window.Fenmyr.rewrite('Hello there, rewrite me', 'shorter', 'T', 'around').catch(() => undefined),
  );
  assert.deepStrictEqual(flagsOf((await sentAbout('Hello there, rewrite me')).args), {
    model: 'claude-sonnet-5-5',
    effort: 'medium',
  });
});

await check('the menu ticks the current model and the Effort row shows its level', async () => {
  await openMenu();
  assert.strictEqual(await page.locator('#mcModelMenu [aria-checked="true"] .mm-name').textContent(), 'Sonnet 5.5');
  assert.strictEqual(await attr('#mcModelMenu .mm-effort', 'aria-disabled'), 'false');
  assert.strictEqual(await attr('#mcModelMenu .mm-effort', 'title'), null);
  assert.strictEqual(await page.locator('#mcModelMenu .mm-val').textContent(), 'Medium');
  assert.strictEqual((await focused()).row, 'Sonnet 5.5', 'focus starts on the ticked model');
  await press('Escape');
});

await check('the keyboard alone picks an effort: arrows, Right arrow and Enter', async () => {
  await page.focus('#mcModel');
  await press('Enter');
  await page.waitForSelector('#mcModelMenu');
  await press('ArrowDown', 'ArrowDown');
  assert.strictEqual((await focused()).row, 'Effort');
  await press('ArrowRight');
  await page.waitForSelector('.mc-modelfly');
  await still(page);
  assert.strictEqual(await attr('#mcModelMenu .mm-effort', 'aria-expanded'), 'true');
  assert.deepStrictEqual(await names('.mc-modelfly'), LEVELS, 'every level this model lists');
  assert.deepStrictEqual(await page.locator('.mc-modelfly .mm-note').allTextContents(), ['Recommended']);
  assert.strictEqual(
    await page.locator('.mc-modelfly .mm-note').evaluate(n => n.parentElement?.querySelector('.mm-name')?.textContent),
    'Medium',
  );
  assert.strictEqual(
    await page.locator('#mcModelHelp').textContent(),
    'How long Myra thinks before answering. Higher is slower and uses more of your plan.',
  );
  assert.strictEqual(await page.locator('.mc-modelfly [aria-checked="true"] .mm-name').textContent(), 'Medium');
  assert.strictEqual((await focused()).row, 'Medium', 'focus starts on the current level');
  const [menu, fly] = await Promise.all([rect(page, '#mcModelMenu'), rect(page, '.mc-modelfly')]);
  assert(fly.x + fly.width <= menu.x, 'the flyout is beside the menu');
  assert(Math.abs(fly.y + fly.height - (menu.y + menu.height)) <= 1, 'with its foot level with the menu’s');
  assert(fly.x >= 0 && fly.y >= 0, 'and inside the window');

  await press('ArrowLeft');
  assert.strictEqual(await count('.mc-modelfly'), 0, 'Left arrow goes back');
  assert.strictEqual(await count('#mcModelMenu'), 1, 'to the menu');
  assert.strictEqual((await focused()).row, 'Effort');
  assert.strictEqual(await attr('#mcModelMenu .mm-effort', 'aria-expanded'), 'false');
  await press('ArrowRight', 'Escape');
  assert.strictEqual(await count('.mc-modelfly'), 0, 'so does Esc');
  assert.strictEqual(await count('#mcModelMenu'), 1, 'and leaves the menu open');

  await press('ArrowRight', 'ArrowDown');
  assert.strictEqual((await focused()).row, 'High');
  await press('Enter');
  assert.strictEqual(await count('#mcModelMenu'), 0);
  assert.strictEqual(await pillText(), 'Sonnet 5.5 High');
  assert.deepStrictEqual(await ask('third'), { model: 'claude-sonnet-5-5', effort: 'high' });
});

await check('keys 1 to 4 pick a model while the menu is open, and it keeps the effort it lists', async () => {
  await openMenu();
  await press('4');
  assert.strictEqual(await count('#mcModelMenu'), 0);
  assert.strictEqual(await pillText(), 'Haiku 5.5 High');
  assert.deepStrictEqual(await ask('fourth'), { model: 'claude-haiku-5-5', effort: 'high' });
});

await check('Enter picks the focused model', async () => {
  await page.focus('#mcModel');
  await press('Enter');
  await page.waitForSelector('#mcModelMenu');
  assert.strictEqual((await focused()).row, 'Haiku 5.5');
  await press('ArrowUp', 'ArrowUp', 'Enter');
  assert.strictEqual(await pillText(), 'Fable 5.2 High');
});

await check('Esc closes the menu, returns focus to the pill and leaves the chat open', async () => {
  await openMenu();
  await press('Escape');
  assert.strictEqual(await count('#mcModelMenu'), 0);
  assert.strictEqual((await focused()).id, 'mcModel');
  assert.strictEqual(await attr('#mcModel', 'aria-expanded'), 'false');
  assert(await chatOpen(), 'the chat is still open');
  assert.strictEqual(await pillText(), 'Fable 5.2 High', 'nothing changed');
});

await check('a press outside closes it, and the pill toggles it', async () => {
  await openMenu();
  await page.click('#mcList');
  assert.strictEqual(await count('#mcModelMenu'), 0, 'a press outside closes it');
  assert(await chatOpen(), 'and not the chat');
  await openMenu();
  await page.click('#mcModel');
  assert.strictEqual(await count('#mcModelMenu'), 0, 'the pill closes it');
  assert.strictEqual(await attr('#mcModel', 'aria-expanded'), 'false');
});

await check('a key in the menu does not reach the board’s shortcuts', async () => {
  await openMenu();
  await press('p');
  assert.strictEqual(
    await page.evaluate(() => !!document.getElementById('stage')?.classList.contains('drawing')),
    false,
    'P does not start drawing',
  );
  await press('Escape');
});

await check('the choice is saved and read back after a reload', async () => {
  const saved = await page.evaluate(() => localStorage.getItem('fenmyr:settings'));
  assert(saved, 'the settings were saved');
  // the launch's own script resets the settings at every load, so a later one puts the saved ones back
  await l.app.context().addInitScript(s => {
    try {
      localStorage.setItem('fenmyr:settings', s);
    } catch {}
  }, saved);
  await page.reload();
  await page.waitForFunction(() => window.__fenmyr?.curBoard() && document.querySelector('#cards .card'));
  await page.evaluate(() => window.Fenmyr.models());
  if (!(await chatOpen())) await page.click('#mPill');
  await page.waitForFunction(() => !!document.getElementById('myra')?.classList.contains('chat'));
  await still(page);
  assert.strictEqual(await pillText(), 'Fable 5.2 High');
  assert.deepStrictEqual(await ask('fifth'), { model: 'claude-fable-5-2', effort: 'high' });
});

await check('a model whose levels differ: the effort carries over only when it is listed, else Medium', async () => {
  await page.evaluate(() => {
    const all = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
    window.Fenmyr.models = async () => [
      {
        provider: 'claude-code',
        name: 'Claude Code',
        models: [
          { id: 'a', name: 'Model A', efforts: ['low', 'medium'] },
          { id: 'c', name: 'Model C', efforts: all },
          { id: 'd', name: 'Model D', efforts: ['medium', 'high', 'max'] },
        ],
      },
    ];
  });
  // High is saved from before, and Model A does not list it
  await pickModel('Model A');
  assert.strictEqual(await pillText(), 'Model A Medium', 'an effort it does not list becomes Medium');
  await openMenu();
  await press('ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowRight');
  await page.waitForSelector('.mc-modelfly');
  assert.deepStrictEqual(await names('.mc-modelfly'), ['Low', 'Medium'], 'only the levels the model lists');
  await page.locator('.mc-modelfly [role="menuitemradio"]', { hasText: 'Low' }).click();
  assert.strictEqual(await pillText(), 'Model A Low', 'a click on a level picks it');
  await pickModel('Model C');
  assert.strictEqual(await pillText(), 'Model C Low', 'an effort it lists is kept');
  await pickModel('Model D');
  assert.strictEqual(await pillText(), 'Model D Medium', 'Low is not listed, so Medium');
  await openMenu();
  await page.click('#mcModelMenu .mm-effort');
  await page.waitForSelector('.mc-modelfly');
  assert.deepStrictEqual(await names('.mc-modelfly'), ['Medium', 'High', 'Max']);
  await press('Escape', 'Escape');
});

await check('a model and effort fit a 320 px chat, and a long name is cut with an ellipsis, not wrapped', async () => {
  await narrowChat(true);
  const { cut, pill } = await fits('a model and effort at 320 px');
  assert(!cut, 'the pill’s words are not cut');
  await page.evaluate(() => {
    const t = document.getElementById('mcModelText');
    if (t) t.textContent = 'qwen3-coder-30b-a3b-instruct-q4_K_M Extra';
  });
  const long = await fits('a long name at 320 px');
  assert(long.cut, 'its words are cut short');
  assert.strictEqual(long.pill.height, pill.height, 'on one line');
  await narrowChat(false);
});

await check('in the phone’s sheet the hint gives way before the pill’s words are cut', async () => {
  // the smallest window is 380 px wide, where the chat becomes the phone's sheet
  await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(380, 900));
  await page.waitForFunction(() => document.body.classList.contains('phone'));
  const say = (text: string) =>
    page.evaluate(text => {
      const t = document.getElementById('mcModelText');
      if (t) t.textContent = text;
    }, text);
  await say('Sonnet 5.5 Medium');
  const roomy = await fits('the phone sheet at 380 px');
  assert(!roomy.cut && roomy.hint > 0, 'the hint shows whole beside a short name');
  await say('Sonnet 5.5 Medium and then some');
  const tight = await fits('a longer name in the phone sheet');
  assert(!tight.cut, 'the pill’s words are not cut');
  assert(tight.hint < roomy.hint, 'while the hint has given up room for them');
});

assert.deepStrictEqual(l.errors, [], 'no page errors');
await l.close();
console.log('MODEL PICKER OK');
