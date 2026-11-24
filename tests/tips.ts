// The shared tooltip in the real app. Every control with a data-tip (the toolbar, the doc toolbar's Myra, the Settings
// gear, a video's Flip and Write it out, and the model pill, Expand and Send under Myra's input) looks the same, sits where
// its data-tip-at puts it, takes its surface's colours, shows after its delay, and is seen whole: inside the window and
// not cut by anything it sits in, in light and dark, in a 320 px chat, on a phone and in a prototype's chat. A control
// with a data-tip is named by its aria-label, not by the tooltip, and none keeps a title that would show a second one.
//   TIPS_SHOTS=<folder> node tests/tips.ts    also saves a picture of each tooltip shown
import assert from 'node:assert';
import fs from 'node:fs';
import { replyBoard } from './fixtures/boards.ts';
import { launch } from './support/launch.ts';
import { check, modelKit } from './support/modelKit.ts';
import { freshRepo, openPrototype } from './support/prototype.ts';
import { still } from './support/settled.ts';
import { tipKit } from './support/tipSeen.ts';

const card = (id: string, type: string, x: number, y: number, w: number, h: number, more = {}) => ({
  id,
  type,
  x,
  y,
  w,
  h,
  r: 0,
  color: 'white',
  ...more,
});
const words = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A doc to open' }] }] };
const base = replyBoard('tips', 'Tips');
const board = {
  ...base,
  cards: [
    ...base.cards,
    card('vp', 'video', -480, 150, 400, 225, { src: 'beta/welcome.mp4', title: 'Clip', dur: 12 }),
    card('dc', 'doc', -480, 50, 240, 52, { text: 'A doc', doc: words }),
  ],
};

const l = await launch({
  boards: [board],
  open: 'tips',
  claude: true,
  settings: { chatKeep: 'board' },
  flags: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
});
const { page } = l;
const { pickModel, pickEffort, attr } = modelKit(l);
const { shown, seen } = tipKit(page);

const dark = async (on: boolean) => {
  await page.evaluate(on => document.body.classList.toggle('dark', on), on);
  await still(page);
};
const chatIsOpen = () => page.evaluate(() => !!document.getElementById('myra')?.classList.contains('chat'));
const openChat = async () => {
  if (!(await chatIsOpen())) await page.click((await page.isVisible('#mPill')) ? '#mPill' : '[data-hub="myra"]');
  await page.waitForFunction(() => !!document.getElementById('myra')?.classList.contains('chat'));
  await still(page);
};
const closeChat = async () => {
  if (await chatIsOpen()) await page.click('#mcClose');
  await page.waitForFunction(() => !document.getElementById('myra')?.classList.contains('chat'));
  await still(page);
};
const size = async (w: number, h = 900) => {
  await l.app.evaluate(({ BrowserWindow }, s) => BrowserWindow.getAllWindows()[0]?.setSize(s.w, s.h), { w, h });
  await page.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [w, h]);
  await still(page);
};
const narrow = (on: boolean) =>
  page.evaluate(on => {
    const myra = document.getElementById('myra');
    if (on) myra?.style.setProperty('--chat-w', '320px');
    else myra?.style.removeProperty('--chat-w');
  }, on);
const view = (v: { x: number; y: number; z: number }) =>
  page.evaluate(v => {
    Object.assign(window.__fenmyr.view, v);
    window.__fenmyr.applyView();
  }, v);

// the model pill, Expand and Send under Myra's input, as the chat is now
async function footer(what: string, mode: string, shots = false) {
  const text = await attr('#mcModel', 'data-tip');
  const pill = await seen(`${what}: the model pill`, '#mcModel', {
    at: 'above-end',
    surface: 'chat',
    delay: '0.25s',
    shot: shots ? `${mode}-pill-${text?.includes('\n') ? 'default' : 'chosen'}` : undefined,
  });
  const lines = pill.text.includes('\n') ? 2 : 1;
  assert(
    lines === 2 ? pill.tip.height > 2 * 11 + 12 + 2 : pill.tip.height < 2 * 11 + 12,
    `${what}: the pill's ${lines} line(s) show as ${lines}, ${pill.tip.height} px tall`,
  );
  await seen(`${what}: Expand`, '#mcExpand', {
    at: 'above',
    surface: 'chat',
    delay: '0.25s',
    shot: shots ? `${mode}-expand` : undefined,
  });
  await seen(`${what}: Send`, '.mc-send', {
    at: 'above-end',
    surface: 'chat',
    delay: '0.25s',
    shot: shots ? `${mode}-send` : undefined,
  });
}

// the name the page's accessibility tree gives a control, which is what a screen reader says
const cdp = await l.app.context().newCDPSession(page);
async function nameOf(selector: string): Promise<string> {
  const { root } = await cdp.send('DOM.getDocument');
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
  const name = nodes[0]?.name?.value;
  return typeof name === 'string' ? name : '';
}
// every control with a data-tip, by what it is called and what its title says
const tipped = () =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-tip]')].map(e => ({
      id: e.id || e.className,
      label: e.getAttribute('aria-label'),
      title: e.getAttribute('title'),
    })),
  );
// the toolbar's tool buttons that show, and the column each is in
const tools = () =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('#tools button[data-tip]')]
      .filter(b => b.checkVisibility())
      .map(b => ({
        id: b.id ? `#${b.id}` : `#tools [data-add="${b.dataset.add}"]`,
        end: b.classList.contains('tb-end'),
        lit: b.classList.contains('on'),
      })),
  );
const afterOf = (selector: string, property: 'display' | 'opacity') =>
  page.evaluate(
    ([s, p]) =>
      getComputedStyle(document.querySelector(s ?? 'body') ?? document.body, '::after').getPropertyValue(p ?? ''),
    [selector, property],
  );

// A live camera card, which has Flip, for as long as a check needs it: its camera rests after a minute.
async function withCamera(run: () => Promise<void>) {
  await page.keyboard.press('Shift+V');
  await page.mouse.click(980, 620);
  await page.waitForSelector('.vd-look [data-act="vd-flip"]');
  await still(page);
  try {
    await run();
  } finally {
    await page.keyboard.press('Delete');
  }
}

// the board at 1:1, the recorded video and the doc at its left
await view({ x: 760, y: 30, z: 1 });

for (const mode of ['light', 'dark']) {
  await dark(mode === 'dark');

  await check(`${mode}: every toolbar tooltip is below its button, shows at once, and is seen whole`, async () => {
    const all = await tools();
    assert(all.length > 10, `${all.length} toolbar buttons show`);
    assert(
      all.some(t => t.end),
      'one is in the last column',
    );
    for (const t of all.filter(t => !t.lit)) {
      const shot = t.id.includes('"note"')
        ? `${mode}-toolbar-middle`
        : t.id.includes('"tpl"')
          ? `${mode}-toolbar-last`
          : undefined;
      await seen(`${mode}: ${t.id}`, t.id, {
        at: t.end ? 'below-end' : 'below',
        surface: 'toolbar',
        delay: '0s',
        shot,
      });
    }
    const lit = all.find(t => t.lit);
    assert(lit, 'one tool is in hand');
    await shown(lit.id, 'toolbar');
    assert.strictEqual(await afterOf(lit.id, 'display'), 'none', `${mode}: the tool in hand shows no tooltip`);
  });

  await check(`${mode}: the Settings gear's tooltip is below it, after a short wait`, async () => {
    await seen(`${mode}: the gear`, '#gearBtn', { at: 'below', surface: 'gear', delay: '0.25s', shot: `${mode}-gear` });
    // with an update waiting the gear also wears a dot, which must not take the tooltip's place
    await page.evaluate(() => document.getElementById('gearBtn')?.classList.add('has-update'));
    await seen(`${mode}: the gear with an update`, '#gearBtn', { at: 'below', surface: 'gear', delay: '0.25s' });
    const dot = await page.evaluate(() => {
      const cs = getComputedStyle(document.getElementById('gearBtn') ?? document.body, '::before');
      return [cs.content, cs.width, cs.height, cs.opacity];
    });
    assert.deepStrictEqual(dot, ['""', '8px', '8px', '1'], `${mode}: the update dot shows`);
    await page.evaluate(() => document.getElementById('gearBtn')?.classList.remove('has-update'));
  });

  await check(`${mode}: a video's Flip is below its button, and Write it out above its own`, async () => {
    await withCamera(async () => {
      await seen(`${mode}: Flip`, '.vd-look [data-act="vd-flip"]', {
        at: 'below',
        surface: 'video',
        delay: '0.25s',
        shot: `${mode}-flip`,
      });
    });
    await seen(`${mode}: Write it out`, '.vd-txb', {
      at: 'above-end',
      surface: 'video',
      delay: '0.25s',
      shot: `${mode}-write-it-out`,
    });
  });
}

for (const mode of ['light', 'dark']) {
  await dark(mode === 'dark');
  await openChat();

  await check(`${mode}: the footer's tooltips are whole, and the pill's two lines show as two`, async () => {
    await footer(`${mode}, Default`, mode, true);
  });

  await check(`${mode}: they are whole in the narrowest, 320 px chat`, async () => {
    await narrow(true);
    await footer(`${mode}, 320 px`, mode);
    await narrow(false);
  });

  await check(`${mode}: a chosen model and effort give the pill one line, and one alone gives two`, async () => {
    await pickModel('Sonnet 5.5');
    assert((await attr('#mcModel', 'data-tip'))?.includes('\n'), 'a model alone leaves the effort Default');
    await footer(`${mode}, Sonnet 5.5`, mode);
    await pickEffort('High');
    assert.strictEqual(await attr('#mcModel', 'data-tip'), 'Sonnet 5.5 High');
    await footer(`${mode}, Sonnet 5.5 High`, mode);
    await pickModel('Default');
    await pickEffort('Default');
  });

  await check(`${mode}: Shrink's tooltip is whole in the expanded chat`, async () => {
    await page.click('#mcExpand');
    await still(page);
    assert.strictEqual(await attr('#mcExpand', 'data-tip'), 'Shrink (Esc)');
    await seen(`${mode}: Shrink`, '#mcExpand', { at: 'above', surface: 'chat', delay: '0.25s' });
    await page.click('#mcExpand');
    await still(page);
  });

  await check(`${mode}: the keyboard's focus shows the same tooltip`, async () => {
    const pill = await seen(`${mode}: the focused pill`, '#mcModel', {
      at: 'above-end',
      surface: 'chat',
      delay: '0.25s',
      focus: true,
    });
    assert(pill.text.includes('\n'));
    await seen(`${mode}: the focused Send`, '.mc-send', {
      at: 'above-end',
      surface: 'chat',
      delay: '0.25s',
      focus: true,
    });
  });
  await closeChat();
}
await dark(false);

await check('a phone chat shows its footer tooltips whole, and the phone toolbar keeps its names', async () => {
  await size(390, 844);
  await openChat();
  await footer('a phone', 'phone');
  await closeChat();
  await page.click('[data-sheet="add"]');
  await still(page);
  const labels = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('#shBody .tools.in-sheet button[data-tip]')].map(b => {
      const cs = getComputedStyle(b, '::after');
      return {
        name: b.dataset.name,
        tip: (b.dataset.tip ?? '').split(' · ')[0],
        shows: cs.content === `"${b.dataset.name}"`,
        look: [cs.position, cs.opacity, cs.translate, cs.padding],
      };
    }),
  );
  assert(labels.length > 10, `${labels.length} names in the phone toolbar`);
  for (const t of labels) {
    assert.strictEqual(t.name, t.tip, 'phone.ts names each button by its tooltip');
    assert(t.shows, `${t.name}: its name is printed under it`);
    assert.deepStrictEqual(t.look, ['static', '1', 'none', '0px'], `${t.name}: a label in the grid, not a tooltip`);
  }
  await page.click('#sheet .sh-x');
  await size(1440);
});

await check("the doc toolbar's Myra shows whole, and hides while her popover is open", async () => {
  await page.locator('.card[data-id="dc"]').dblclick();
  await page.waitForSelector('#dvTools .dt-myra');
  await still(page);
  for (const mode of ['light', 'dark']) {
    await dark(mode === 'dark');
    await seen(`${mode}: the doc's Myra`, '#dvTools .dt-myra', {
      at: 'below-end',
      surface: 'doc',
      delay: '0.25s',
      shot: `${mode}-doc-myra`,
    });
  }
  await dark(false);
  await page.click('#dvTools .dt-myra');
  await still(page);
  assert.strictEqual(
    await afterOf('#dvTools .dt-myra', 'opacity'),
    '0',
    'her name has done its job once her popover is open',
  );
  await page.keyboard.press('Escape');
});

await check('every control with a data-tip is named by its aria-label, and none has a title as well', async () => {
  const every = await tipped();
  assert(every.length > 20, `${every.length} controls have a tip`);
  assert.deepStrictEqual(
    every.filter(t => !t.label),
    [],
    'each has an aria-label, so the tooltip is never its name',
  );
  assert.deepStrictEqual(
    every.filter(t => t.title !== null),
    [],
    'none shows a second tooltip',
  );
});

await check('the pill, Expand and Send are named by their aria-label, not by their tooltip', async () => {
  await openChat();
  assert.strictEqual(await nameOf('#mcModel'), 'Default', 'the pill says what it holds');
  assert.strictEqual(await attr('#mcModel', 'aria-label'), 'Default');
  await pickModel('Sonnet 5.5');
  await pickEffort('Extra');
  assert.strictEqual(await nameOf('#mcModel'), 'Sonnet 5.5 Extra', 'and keeps up with each choice');
  assert.strictEqual(await attr('#mcModel', 'aria-label'), 'Sonnet 5.5 Extra');
  await pickModel('Default');
  assert.strictEqual(await nameOf('#mcModel'), 'Default Extra');
  await pickEffort('Default');
  assert.strictEqual(await nameOf('#mcExpand'), 'Expand to write');
  assert.strictEqual(await nameOf('.mc-send'), 'Send');
  for (const id of ['#mcModel', '#mcExpand', '.mc-send'])
    assert.strictEqual(await attr(id, 'title'), null, `${id} has no title`);
  await closeChat();
});

await check('Send says its key in the words of this computer', async () => {
  const platform = await page.evaluate(() => window.Fenmyr.platform);
  assert.strictEqual(await attr('.mc-send', 'data-tip'), `Send (${platform === 'mac' ? '⌘↩' : 'Ctrl+Enter'})`);
});

// a prototype's chat is docked in a pane of its own
const { work, repo } = freshRepo('fenmyr-tips-');
try {
  await openPrototype(page, repo);
  await page.waitForFunction(() => window.__fenmyr?.curBoard()?.id === 'pb');
  await still(page);
  for (const mode of ['light', 'dark']) {
    await check(`${mode}: a prototype's chat shows its footer tooltips whole`, async () => {
      await dark(mode === 'dark');
      await footer(`${mode}, in a prototype`, mode);
    });
  }
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}

assert.deepStrictEqual(l.errors, [], 'no page errors');
await l.close();
console.log('TIPS OK');
