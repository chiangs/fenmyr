// Myra's model picker in the real app, through a stand-in Claude Code that records its arguments. The pill reads the
// choice, and the menu changes it with the mouse or the keyboard alone. The choice is saved, and the next message
// carries it. The pill, the expand button and the send button stay on one line in a narrow chat.
import assert from 'node:assert';
import { replyBoard } from './fixtures/boards.ts';
import { flagsOf } from './support/askStandIn.ts';
import { launch } from './support/launch.ts';
import { check, FOLLOWS, LEVELS, MODELS, modelKit, NO_FLAGS } from './support/modelKit.ts';
import { rect, still } from './support/settled.ts';

const l = await launch({
  boards: [replyBoard('picker', 'Picker')],
  open: 'picker',
  claude: true,
  settings: { chatKeep: 'board' },
});
const { page } = l;
const { pillText, attr, count, names, ask, openMenu, pickModel, press, sentAbout } = modelKit(l);

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

const within = (inner: { x: number; y: number; width: number; height: number }, outer: typeof inner, slack = 0.5) =>
  inner.x >= outer.x - slack &&
  inner.y >= outer.y - slack &&
  inner.x + inner.width <= outer.x + outer.width + slack &&
  inner.y + inner.height <= outer.y + outer.height + slack;

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

await check('before a choice, the pill says Default and Claude Code keeps its own settings', async () => {
  assert.strictEqual(await pillText(), 'Default');
  assert.strictEqual(await attr('#mcModel', 'data-tip'), `Default\n${FOLLOWS}`, 'the tip says what Default follows');
  assert.strictEqual(await attr('#mcModel', 'aria-haspopup'), 'menu');
  assert.deepStrictEqual(await ask('first'), NO_FLAGS, 'a message sends neither --model nor --effort');
});

await check('the pill at Default fits a 320 px chat, with the hint dropped rather than shown cut', async () => {
  assert((await rect(page, '#mcHint')).width > 0, 'the hint shows in a roomy chat');
  await narrowChat(true);
  assert.strictEqual((await rect(page, '#mChat')).width, 320);
  const { cut, hint } = await fits('Default at 320 px');
  assert(!cut, 'the pill’s words are not cut');
  assert.strictEqual(hint, 0, 'the hint, which has no room whole, is gone');
  await narrowChat(false);
});

await check('the menu opens above the pill, level with its right edge, and lists Default and the models', async () => {
  await openMenu();
  assert.strictEqual(await attr('#mcModel', 'aria-expanded'), 'true');
  assert.deepStrictEqual((await names('#mcModelMenu')).slice(0, 5), ['Default', ...MODELS]);
  assert.deepStrictEqual(
    await page.locator('#mcModelMenu [data-model]').evaluateAll(rows => rows.map(r => r.getAttribute('role'))),
    Array(5).fill('menuitemradio'),
  );
  assert.deepStrictEqual(
    await page.locator('#mcModelMenu .mm-key').allTextContents(),
    ['0', '1', '2', '3', '4'],
    'each shows its key, Default’s is 0',
  );
  assert.strictEqual(
    await page.locator('#mcModelMenu [aria-checked="true"] .mm-name').textContent(),
    'Default',
    'Default is the one ticked before a choice',
  );
  assert.strictEqual(await count('#mcModelMenu [aria-checked="true"]'), 1, 'and only it');
  const [menu, pill] = await Promise.all([rect(page, '#mcModelMenu'), rect(page, '#mcModel')]);
  assert(menu.y + menu.height <= pill.y, 'above the pill');
  assert(Math.abs(menu.x + menu.width - (pill.x + pill.width)) <= 1, 'with the right edges level');
  assert((await focused()).inMenu, 'focus is in the menu, so its keys work');
});

await check(
  'the Effort row is enabled with no model, reads Default, and opens every level under a Default one',
  async () => {
    assert.strictEqual(await attr('#mcModelMenu .mm-effort', 'aria-disabled'), null, 'it is not marked disabled');
    assert.strictEqual(await attr('#mcModelMenu .mm-effort', 'title'), null, 'and gives no reason why not');
    assert.strictEqual(await page.locator('#mcModelMenu .mm-val').textContent(), 'Default');
    await page.click('#mcModelMenu .mm-effort');
    await page.waitForSelector('.mc-modelfly');
    assert.deepStrictEqual(await names('.mc-modelfly'), ['Default', ...LEVELS], 'Default, then every level');
    assert.strictEqual(await page.locator('.mc-modelfly [aria-checked="true"] .mm-name').textContent(), 'Default');
    assert.strictEqual(await count('.mc-modelfly .mm-note'), 0, 'with no level marked Recommended');
    await press('Escape', 'Escape');
    assert.strictEqual(await count('#mcModelMenu'), 0);
  },
);

await check(
  'picking a model alone sends --model and no --effort, and the pill says Default for the effort',
  async () => {
    await pickModel('Sonnet 5.5');
    assert.strictEqual(await count('#mcModelMenu'), 0, 'picking closes the menu');
    assert.strictEqual(await pillText(), 'Sonnet 5.5');
    assert.strictEqual(await attr('#mcModel', 'data-tip'), `Sonnet 5.5\n${FOLLOWS}`);
    assert.strictEqual((await focused()).id, 'mcModel', 'focus is back on the pill');
    assert.deepStrictEqual(await ask('second'), { model: 'claude-sonnet-5-5', effort: undefined });
  },
);

await check('a rewrite after a pick carries the choice too', async () => {
  await page.evaluate(
    () => void window.Fenmyr.rewrite('Hello there, rewrite me', 'shorter', 'T', 'around').catch(() => undefined),
  );
  assert.deepStrictEqual(flagsOf((await sentAbout('Hello there, rewrite me')).args), {
    model: 'claude-sonnet-5-5',
    effort: undefined,
  });
});

await check('the menu ticks the current model and the Effort row reads Default for an effort not chosen', async () => {
  await openMenu();
  assert.strictEqual(await page.locator('#mcModelMenu [aria-checked="true"] .mm-name').textContent(), 'Sonnet 5.5');
  assert.strictEqual(await page.locator('#mcModelMenu .mm-val').textContent(), 'Default');
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
  assert.deepStrictEqual(
    await names('.mc-modelfly'),
    ['Default', ...LEVELS],
    'Default, then every level this model lists',
  );
  assert.strictEqual(
    await page.locator('#mcModelHelp').textContent(),
    'How long Myra thinks before answering. Higher is slower and uses more of your plan.',
  );
  assert.strictEqual(await page.locator('.mc-modelfly [aria-checked="true"] .mm-name').textContent(), 'Default');
  assert.strictEqual((await focused()).row, 'Default', 'focus starts on the current level, here Default');
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

  await press('ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowDown');
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

await check('a model whose levels differ: the effort carries over only when it is listed, else Default', async () => {
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
  assert.strictEqual(await pillText(), 'Model A', 'an effort it does not list goes back to Default');
  await openMenu();
  await press('ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowRight');
  await page.waitForSelector('.mc-modelfly');
  assert.deepStrictEqual(await names('.mc-modelfly'), ['Default', 'Low', 'Medium'], 'only the levels the model lists');
  await page.locator('.mc-modelfly [role="menuitemradio"]', { hasText: 'Low' }).click();
  assert.strictEqual(await pillText(), 'Model A Low', 'a click on a level picks it');
  await pickModel('Model C');
  assert.strictEqual(await pillText(), 'Model C Low', 'an effort it lists is kept');
  await pickModel('Model D');
  assert.strictEqual(await pillText(), 'Model D', 'Low is not listed, so Default');
  await openMenu();
  await page.click('#mcModelMenu .mm-effort');
  await page.waitForSelector('.mc-modelfly');
  assert.deepStrictEqual(await names('.mc-modelfly'), ['Default', 'Medium', 'High', 'Max']);
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
