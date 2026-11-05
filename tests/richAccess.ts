// Rich notes with a keyboard and a screen reader, in the real app. Roles, names and pressed states are read from
// Chromium's own accessibility tree, which is what a screen reader gets.
import assert from 'node:assert';
import { launch } from './support/launch.ts';

const GUIDE = 'https://example.org/guide';
const note = (id: string, x: number, text: string, more = {}) => ({
  id,
  type: 'note',
  x,
  y: 60,
  w: 300,
  h: 150,
  r: 0,
  color: 'white',
  name: '',
  text,
  rich: true,
  ...more,
});
const COLORS = ['white', 'butter', 'pink', 'mint', 'sky', 'lilac', 'peach'];
const swatches = COLORS.map((color, i) =>
  note(`c-${color}`, 120 + i * 320, '[a link](https://example.org/c)', { y: 600, h: 80, color }),
);
const board = {
  id: 'access',
  name: 'Access',
  cards: [
    note('read', 120, `Plan **this** and *that*\n- one\n  - nested\n1. first\nSee [the guide](${GUIDE})`),
    note('mail', 460, 'Write to [me](mailto:me@example.org)', { tags: ['urgent'] }),
    note('far', 4000, 'Far [away](https://example.org/far)'),
    note('typed', 800, 'Plan for Monday'),
    ...swatches,
  ],
  links: [],
  tray: [],
  tags: ['urgent'],
  view: { x: 0, y: 0, z: 1 },
};
let l = await launch({ boards: [board], open: 'access' });
let { page } = l;
const cdp = await l.app.context().newCDPSession(page);
await cdp.send('Accessibility.enable');

type AXValue = { value?: unknown };
type AXNode = {
  role?: AXValue;
  name?: AXValue;
  properties?: { name: string; value: AXValue }[];
};
const nodeOf = async (selector: string) => {
  const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  assert.ok(nodeId, `${selector} is on the page`);
  return nodeId;
};
const shown = (n: AXNode | undefined) => {
  const props = Object.fromEntries((n?.properties ?? []).map(p => [p.name, p.value.value]));
  return { role: n?.role?.value, name: n?.name?.value, multiline: props.multiline, pressed: props.pressed };
};
const ax = async (selector: string) => {
  const { nodes } = await cdp.send('Accessibility.getPartialAXTree', {
    nodeId: await nodeOf(selector),
    fetchRelatives: false,
  });
  return shown(nodes[0]);
};
const rolesIn = async (selector: string) => {
  const nodeId = await nodeOf(selector),
    roles: Record<string, number> = {};
  for (const role of ['list', 'listitem', 'strong', 'emphasis', 'link']) {
    const { nodes } = await cdp.send('Accessibility.queryAXTree', { nodeId, role });
    roles[role] = nodes.length;
  }
  return roles;
};

const active = () =>
  page.evaluate(() => {
    const a = document.activeElement;
    return a?.closest('#selbar') ? `bar:${a.getAttribute('aria-label')}` : a?.closest('.card')?.getAttribute('data-id');
  });
const editing = () => page.evaluate(() => window.__fenmyr.editing);
const stored = (id: string) =>
  page.evaluate(id => {
    const c = window.__fenmyr.board.cards.find(c => c.id === id);
    return c?.type === 'note' ? c.text : undefined;
  }, id);
const pressed = (k: string) =>
  page.evaluate(k => document.querySelector(`#selbar [data-ts="${k}"], #selbar [data-fmt="${k}"]`)?.ariaPressed, k);
const keys = async (...list: string[]) => {
  for (const k of list) {
    await page.keyboard.press(k);
    await page.waitForTimeout(60);
  }
};
async function edit(id: string) {
  await page.keyboard.press('Escape');
  const body = page.locator(`#cards [data-id="${id}"] .text`);
  await body.click();
  await page.waitForTimeout(450);
  await body.dblclick();
  await page.waitForFunction(id => window.__fenmyr.editing === id, id);
  await page.waitForFunction(() => document.querySelector('#selbar.typing [data-ts="bold"]')?.checkVisibility());
}

assert.deepStrictEqual(
  await rolesIn('#cards [data-id="read"] .text'),
  { list: 3, listitem: 3, strong: 1, emphasis: 1, link: 1 },
  'U6: a rich note reads as real lists, strong and emphasised words, and a link',
);
assert.deepStrictEqual(
  await ax('#cards [data-id="read"] .text a'),
  { role: 'link', name: 'the guide', multiline: undefined, pressed: undefined },
  'the link is named by its words',
);

await edit('typed');
assert.deepStrictEqual(
  await ax('#cards [data-id="typed"] .text'),
  { role: 'textbox', name: 'Note text', multiline: true, pressed: undefined },
  'while typed in, the body is a named multi-line text field',
);
await page.hover('#selbar [data-fmt="bullets"]');
await page.waitForTimeout(350);
const BUTTONS = [
  'ts="bold"',
  'ts="italic"',
  'ts="under"',
  'ts="strike"',
  'fmt="bullets"',
  'fmt="numbered"',
  'fmt="clear"',
];
const bar: Awaited<ReturnType<typeof ax>>[] = [];
for (const b of BUTTONS) bar.push(await ax(`#selbar [data-${b}]`));
assert.deepStrictEqual(
  bar.map(b => [b.role, b.name, b.pressed]),
  [
    ['button', 'Bold', 'false'],
    ['button', 'Italic', 'false'],
    ['button', 'Underline', 'false'],
    ['button', 'Strikethrough', 'false'],
    ['button', 'Bulleted list', 'false'],
    ['button', 'Numbered list', 'false'],
    ['button', 'Clear formatting', undefined],
  ],
  'U5, U6: each formatting button has a plain name, kept after a hover shows its tooltip, and the toggles say whether they are on',
);

await keys('Control+End', 'Control+Shift+ArrowLeft', 'F10');
assert.strictEqual(await active(), 'bar:Bold', 'F10 moves from the note to the bar, on Bold');
await keys('Enter');
assert.deepStrictEqual(
  [await active(), await editing(), await stored('typed')],
  ['typed', 'typed', 'Plan for **Monday**'],
  'Enter on Bold bolds the selected word and goes back to the note',
);
assert.strictEqual(await pressed('bold'), 'true', 'and Bold is then pressed');
await keys('F10', 'Tab', ' ');
assert.strictEqual(await stored('typed'), 'Plan for ***Monday***', 'Tab reaches Italic, and Space presses it');
await keys('F10', 'Tab', 'Tab', 'Tab', 'Tab');
assert.strictEqual(await active(), 'bar:Bulleted list', 'the list buttons follow in the same Tab order');
await keys('Enter');
assert.deepStrictEqual(
  [await stored('typed'), await pressed('bullets')],
  ['- Plan for ***Monday***', 'true'],
  'Enter on Bulleted list makes the line a list item, and the button is pressed',
);
await keys('Home');
assert.deepStrictEqual(
  [await pressed('bold'), await pressed('italic'), await pressed('bullets')],
  ['false', 'false', 'true'],
  'U4: the pressed states follow the caret',
);
await keys('F10', 'Escape', 'Q');
assert.deepStrictEqual(
  [await active(), await stored('typed')],
  ['typed', '- QPlan for ***Monday***'],
  'Escape in the bar goes back to the note with the caret where it was',
);
await keys('F10', 'Tab', 'Tab', 'Tab', 'Tab', 'Tab', 'Tab', 'Enter');
assert.deepStrictEqual(
  [await active(), await stored('typed')],
  ['typed', '- QPlan for ***Monday***'],
  'a button with nothing to do, such as Clear formatting on plain words, also goes back to the note',
);
await keys('F10', 'n', 'Shift+Tab');
assert.deepStrictEqual(
  [await editing(), await page.evaluate(() => document.getElementById('ghost')?.classList.contains('on'))],
  [null, false],
  'a letter on a formatting button stays off the board, and leaving the formatting buttons ends the edit',
);

await edit('typed');
await page.keyboard.type(' #ur', { delay: 30 });
await page.waitForSelector('#tagPop.on');
const suggested = () =>
  page.evaluate(() => {
    const t = document.querySelector('#cards [data-id="typed"] .text'),
      id = t?.getAttribute('aria-activedescendant'),
      o = id ? document.getElementById(id) : null;
    return {
      controls: t?.getAttribute('aria-controls'),
      option: o?.role,
      selected: o?.ariaSelected,
      words: o?.textContent,
    };
  });
assert.deepStrictEqual(
  await suggested(),
  { controls: 'tagPop', option: 'option', selected: 'true', words: '#urgent' },
  'I-6: the note points a screen reader at the tag suggestion Enter would pick',
);
assert.strictEqual((await ax('#tagPop')).role, 'listbox', 'in a list of suggestions');
await keys('ArrowDown');
assert.strictEqual((await suggested()).words, 'New tag #ur', 'and follows the arrow keys');
await keys('Escape');
assert.deepStrictEqual(
  await suggested(),
  { controls: null, option: undefined, selected: undefined, words: undefined },
  'until the suggestions close',
);

await edit('read');
await page.evaluate(() => {
  const a = document.querySelector('#cards [data-id="read"] .text a');
  if (a?.firstChild) getSelection()?.collapse(a.firstChild, 3);
});
await keys('Control+k');
assert.deepStrictEqual(
  [await ax('.note-link'), await ax('.note-link input')].map(n => [n.role, n.name]),
  [
    ['dialog', 'Link'],
    ['textbox', 'Link address'],
  ],
  'T9: Ctrl+K moves focus into a named box for the address',
);
await keys('Escape');
assert.deepStrictEqual([await active(), await editing()], ['read', 'read'], 'Escape gives focus back to the note');
await keys('Control+k', 'Tab', 'Tab', 'Escape');
assert.deepStrictEqual(
  [await active(), await editing(), await page.locator('.note-link').count()],
  ['read', 'read', 0],
  'so does Escape on one of its buttons, and the box closes',
);
await keys('Control+k', 'Tab', 'Tab', 'Tab', 'Tab');
assert.deepStrictEqual(
  [await editing(), await page.locator('.note-link').count()],
  [null, 0],
  'Tab past its last button ends the edit as a click elsewhere does',
);

await keys('Escape');
await l.app.evaluate(({ shell }) => {
  const seen: string[] = [];
  Reflect.set(globalThis, '__opened', seen);
  shell.openExternal = async url => {
    seen.push(url);
  };
});
const opened = () => l.app.evaluate(() => Reflect.get(globalThis, '__opened'));
const url = page.url();
await page.locator('#cards [data-id="read"] .text a').focus();
await keys('Enter');
await page.locator('#cards [data-id="mail"] .text a').focus();
await keys('Enter');
await page.waitForTimeout(300);
assert.deepStrictEqual(
  [await opened(), page.url()],
  [[GUIDE, 'mailto:me@example.org'], url],
  'T9: Enter on a focused link opens it in the browser, an email link too, and the app stays put',
);
const view = () => page.evaluate(() => ({ ...window.__fenmyr.view }));
const onScreen = async (selector: string) => {
  const b = await page.locator(selector).boundingBox();
  return !!b && b.x > 0 && b.x + b.width < 1440 && b.y > 0 && b.y + b.height < 900;
};
const FAR = '#cards [data-id="far"] .text a';
await page.evaluate(() => {
  Object.assign(window.__fenmyr.view, { x: 0, y: 0, z: 1 });
  window.__fenmyr.applyView();
});
assert.ok(!(await onScreen(FAR)), 'the far note starts out of sight');
await keys('Tab');
assert.ok(
  (await page.evaluate(FAR => document.activeElement === document.querySelector(FAR), FAR)) && (await onScreen(FAR)),
  'Tab to a link out of sight brings its note into view',
);
await page.evaluate(() => {
  Object.assign(window.__fenmyr.view, { x: 400, y: -70, z: 1 });
  window.__fenmyr.applyView();
});
const before = await view();
await page.locator('#cards [data-id="read"] .text a').click();
await page.waitForTimeout(800);
assert.deepStrictEqual(
  await view(),
  before,
  'a click on a link at the edge of the window leaves the board where it is',
);

const contrast = (ids: string[]) =>
  page.evaluate(ids => {
    const channel = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const lum = (css: string) => {
      const [r = 0, g = 0, b = 0] = (css.match(/[\d.]+/g) ?? []).map(n => channel(Number(n) / 255));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    return ids.map(id => {
      const card = document.querySelector(`#cards [data-id="${id}"]`),
        a = card?.querySelector('.text a'),
        frame = card?.querySelector(':scope > .frame'),
        [hi = 0, lo = 0] = [a, frame]
          .map(e => lum(e ? getComputedStyle(e)[e === a ? 'color' : 'backgroundColor'] : ''))
          .sort((x, y) => y - x);
      return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
    });
  }, ids);
const ids = COLORS.map(c => `c-${c}`);
const light = await contrast(ids);
assert.ok(Math.min(...light) >= 4.5, `a link reads at 4.5:1 or more on every note colour: ${light}`);
assert.deepStrictEqual(l.errors, []);
await l.close();

l = await launch({ boards: [board], open: 'access', settings: { theme: 'dark' } });
page = l.page;
const dark = await contrast(ids);
assert.ok(Math.min(...dark) >= 4.5, `and in dark mode, where Snow is dark: ${dark}`);
assert.deepStrictEqual(l.errors, []);
await l.close();
console.log('RICH ACCESS OK');
